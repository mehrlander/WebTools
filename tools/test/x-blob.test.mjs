// x-blob — an anchor that names an exact file.
//
// ONE ADDRESS, ONE DESTINATION is the whole claim, and it is a claim about a
// pair that used to be written twice. The estate spelled this mark as
// `:href="hubUrl(p)" :data-peek="peek(p)"`, and nothing held the two to the
// same file: a site could open one path and preview another, silently and
// forever, since both halves render fine. The directive takes the address once
// and derives the href from it, through the same builder the peek card's own
// head uses (kits/source-peek.js blobUrl), so the two cannot part.
//
// What is asserted here is therefore mostly about the FAILURE modes: an empty
// address, one that does not parse, and one that changes under a live row. A
// stale href left behind by any of those is the defect this replaces, in a new
// place.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="m"></div></body></html>`,
});

const run = (rel) => new window.Function(readFileSync(path.join(repoRoot, rel), 'utf8'))(window);
run('lib/vanilla-bundle.js');       // window.esc, which source-peek interpolates through
run('lib/kits/repo-address.js');    // the address grammar the directive parses with
run('lib/kits/source-peek.js');     // blobUrl, the one builder both ends use

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;
run('lib/alpine-bundle.js');
Alpine.start();
await tick(2);

const mount = async (attrs, state = {}) => {
  const host = window.document.getElementById('m');
  host.innerHTML = `<div x-data='${JSON.stringify(state)}'><a ${attrs}>mark</a></div>`;
  Alpine.initTree(host);
  await tick(2);
  return host.querySelector('a');
};

test('the href is derived from the address, never given twice', async () => {
  const a = await mount(`x-blob="'me/web-tools@main:docs/APP.md'"`);
  assert.equal(a.getAttribute('data-peek'), 'me/web-tools@main:docs/APP.md');
  assert.equal(a.getAttribute('href'),
    'https://github.com/me/web-tools/blob/main/docs/APP.md');
});

test('and it carries the two attributes a new tab needs', async () => {
  // Four attributes collapsed into one is only safe if the directive keeps all
  // four: an anchor that lost target would navigate the app away from itself.
  const a = await mount(`x-blob="'me/web-tools@main:a.md'"`);
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener');
});

test('an address with no ref reads the default branch', async () => {
  const a = await mount(`x-blob="'me/web-tools:README.md'"`);
  assert.equal(a.getAttribute('href'), 'https://github.com/me/web-tools/blob/HEAD/README.md');
});

test('a slashed ref survives, since that is where these links live', async () => {
  const a = await mount(`x-blob="'me/web-tools@claude/feat-x:docs/APP.md'"`);
  assert.match(a.getAttribute('href'), /\/blob\/claude\/feat-x\/docs\/APP\.md$/);
});

test('an empty or unparseable address offers no link at all', async () => {
  // The row that loses its path is the case: leaving the previous file's href
  // in place is worse than no link, because it looks like it works.
  for (const expr of [`''`, `null`, `'not-an-address'`]) {
    const a = await mount(`x-blob="${expr}"`);
    assert.equal(a.getAttribute('href'), null, expr);
    assert.equal(a.getAttribute('data-peek'), null, expr);
  }
});

test('a live address moves both halves together', async () => {
  const host = window.document.getElementById('m');
  host.innerHTML = `<div x-data='{ "p": "docs/one.md" }'>` +
                   `<a x-blob="'me/r@main:' + p">mark</a></div>`;
  Alpine.initTree(host);
  await tick(2);
  const a = host.querySelector('a');
  assert.match(a.getAttribute('href'), /docs\/one\.md$/);
  Alpine.$data(host.firstElementChild).p = 'docs/two.md';
  await tick(2);
  assert.match(a.getAttribute('href'), /docs\/two\.md$/, 'the href followed');
  assert.equal(a.getAttribute('data-peek'), 'me/r@main:docs/two.md', 'and so did the peek');
});

test('the Map view spells its exact-file marks this way', () => {
  // A ceiling, not a count: the hand-written pair is what the directive
  // replaces, and a new one appearing in this file means the convention was
  // reverted somewhere rather than extended.
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/map.js'), 'utf8');
  assert.equal((src.match(/:data-peek="peek\(/g) || []).length, 0,
    'a hand-written :href/:data-peek pair is back in map.js; use x-blob');
  assert.ok((src.match(/x-blob="/g) || []).length >= 19, 'and the converted sites are still converted');
});
