// toss-inline-deps.test.mjs — inlineRelativeDeps, the render-time mini-bake that
// lets a tossed page keep ordinary relative references to its own siblings.
//
// Why this has a test at all: the failure mode is silent. A page whose sibling
// data.js does not get inlined still mounts and still draws its chrome, showing
// no data and raising nothing, so neither a smoke check nor a human glance
// catches it. That is exactly how the budget-drs Statewide reductions appendix
// (mehrlander/home), which ports this function, sat empty for two days under a
// pin that had been confirmed.
//
// The escape case is the one worth guarding hardest. The inlined document goes
// back to a string through outerHTML, so a dep carrying a literal close tag for
// the element it was just placed inside ends that element early: the re-parse
// truncates the code and leaks the remainder into the body as text. Nothing
// throws. The escape is lossless because the sequence can only legally appear
// inside a JS or CSS string, where the browser parses the escaped form back to
// the original.
//
// The function lives in a page's inline script rather than a lib module, so it
// is lifted out by brace matching and run against a jsdom realm with a stubbed
// fetcher. Same tactic as the repo's other page-script tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeWindow } from './bootstrap.mjs';

const SRC = fs.readFileSync(new URL('../../pages/toss-render.html', import.meta.url), 'utf8');

// Lift `[async] function NAME(...) { ... }` out of the page by matching braces,
// so the test runs the shipped source rather than a copy that could drift from
// it. Two things this has to get right, both of which bit on the first attempt:
// keep an `async` prefix (dropping it silently turns every `await` inside into a
// syntax error), and start brace matching only after the parameter list, since a
// destructured parameter opens a brace of its own.
function lift(name) {
  let start = SRC.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found in toss-render.html`);
  if (SRC.slice(start - 6, start) === 'async ') start -= 6;

  const open = SRC.indexOf('(', start);
  let depth = 0, afterParams = -1;
  for (let j = open; j < SRC.length; j++) {
    if (SRC[j] === '(') depth++;
    else if (SRC[j] === ')' && --depth === 0) { afterParams = j + 1; break; }
  }
  assert.notEqual(afterParams, -1, `unbalanced parens lifting ${name}`);

  depth = 0;
  for (let j = SRC.indexOf('{', afterParams); j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}' && --depth === 0) return SRC.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces lifting ${name}`);
}

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });

// Build the function in the jsdom realm so DOMParser/document are the ones the
// page would really use. `ghText` is the only external it reaches for.
function build(files) {
  const fetched = [];
  const src = [lift('escapeClose'), lift('isRelativeRef'), lift('resolveRepoPath'),
               lift('inlineRelativeDeps')].join('\n');
  const fn = new window.Function('ghText', 'DOMParser', `${src}; return inlineRelativeDeps;`);
  const ghText = async (owner, name, ref, p) => {
    fetched.push(`${owner}/${name}@${ref}:${p}`);
    if (!(p in files)) throw new Error('HTTP 404');
    return files[p];
  };
  return { run: fn(ghText, window.DOMParser), fetched };
}

const ADDR = { owner: 'mehrlander', name: 'spend-wa', ref: 'main', path: 'reductions/explorer/explorer.html' };
const parse = (html) => new window.DOMParser().parseFromString(html, 'text/html');

test('a relative script src is fetched at the same ref and inlined', async () => {
  const { run, fetched } = build({ 'reductions/explorer/data.js': 'window.REDUCTIONS = { items: 491 };' });
  const out = await run('<html><body><script src="./data.js"></' + 'script></body></html>', ADDR);

  assert.deepEqual(fetched, ['mehrlander/spend-wa@main:reductions/explorer/data.js'],
    'resolves the sibling against the page directory, at the addressed ref');
  const doc = parse(out);
  const s = doc.querySelector('script');
  assert.equal(s.getAttribute('src'), null, 'the src attribute is gone: the code is inline now');
  assert.match(s.textContent, /window\.REDUCTIONS/);
  assert.equal(doc.querySelectorAll('[data-inline-error]').length, 0);
});

test('a dep carrying a literal script-close survives the outerHTML round trip', async () => {
  // The exact hazard: unescaped, the re-parse ends the script at the close
  // sequence, dropping everything after it and leaking it into the body.
  const payload = 'window.A = "x</' + 'script>y"; window.B = 1;';
  const { run } = build({ 'reductions/explorer/data.js': payload });
  const out = await run('<html><body><script src="./data.js"></' + 'script></body></html>', ADDR);

  const doc = parse(out);
  assert.equal(doc.querySelectorAll('script').length, 1, 'still exactly one script element');
  assert.equal(doc.body.textContent.replace(doc.querySelector('script').textContent, '').trim(), '',
    'nothing leaked into the body as text');

  // Lossless: the escaped source must still evaluate to the original values.
  const w = {};
  new window.Function('window', doc.querySelector('script').textContent)(w);
  assert.equal(w.A, 'x</' + 'script>y', 'the string round-trips to its original value');
  assert.equal(w.B, 1, 'code after the close sequence still runs');
});

test('a relative stylesheet becomes a style element, escaped the same way', async () => {
  const css = '.a::after { content: "</' + 'style>"; } .b { color: red; }';
  const { run } = build({ 'reductions/explorer/x.css': css });
  const out = await run('<html><head><link rel="stylesheet" href="./x.css"></head><body>hi</body></html>',
    { ...ADDR, path: 'reductions/explorer/explorer.html' });

  const doc = parse(out);
  assert.equal(doc.querySelectorAll('style').length, 1);
  assert.equal(doc.querySelectorAll('link[rel~="stylesheet"]').length, 0);
  assert.equal(doc.body.textContent.trim(), 'hi', 'the CSS did not end the style element early');
});

test('absolute and root-relative refs are left alone, and a dep-free page is untouched', async () => {
  const { run, fetched } = build({});
  const html = '<html><body>'
    + '<script src="https://cdn.jsdelivr.net/npm/alpinejs"></' + 'script>'
    + '<script src="/root.js"></' + 'script>'
    + '</body></html>';
  const out = await run(html, ADDR);

  assert.deepEqual(fetched, [], 'nothing was fetched');
  assert.equal(out, html, 'a page with no relative deps comes back byte-identical');
});

test('a dep that cannot be fetched marks the element instead of failing the render', async () => {
  const { run } = build({});   // 404 for everything
  const out = await run('<html><body><script src="./missing.js"></' + 'script></body></html>', ADDR);

  const doc = parse(out);
  const s = doc.querySelector('script');
  assert.equal(s.getAttribute('data-inline-error'), 'HTTP 404');
  assert.equal(s.getAttribute('src'), './missing.js', 'the original ref is left in place');
});
