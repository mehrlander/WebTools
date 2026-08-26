// one-escape-helper.test.mjs — window.esc is the estate's only HTML-escape
// helper, and the shelf stays at one.
//
// The defect this replaces: docs/HTML-STYLE.md carried a rule ("Unescape before
// you escape") prescribing a single shared helper that decodes entities and
// then escapes. No such helper existed. Five local copies did, to three
// different answers about which characters matter, and each call site was left
// deciding for itself whether its string lands in a text node or inside a
// quoted attribute. The rule was retired with PR #445 and the work filed as
// tracker task consolidate-escape-helpers-gxverk.
//
// The helper that replaced it does NOT decode, and that half of the rule was
// dropped on purpose rather than left undone. A source's "&amp;" is either an
// encoded ampersand or five literal characters, and nothing in the string says
// which, so a helper that decodes every value it is handed corrupts the second
// case with no way to notice. Decoding is a property of the SOURCE: it belongs
// once, at the ingestion boundary, recorded there. No source ingested here
// carries entities today, which is why no such boundary is asserted below.
//
// Two things are held here. First that the helper is correct, including the
// two quote characters no local copy escaped consistently. Second that the
// shelf stays at one, which is the part that actually decays: a sixth copy
// costs nothing to write and reads as perfectly reasonable in isolation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

// ── the helper itself, run the way the boot chain runs it ──────────────────
const win = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/vanilla-bundle.js'), 'utf8'))(win);
const esc = win.esc;

test('the ambient bundle carries the helper', () => {
  assert.equal(typeof esc, 'function',
    'lib/vanilla-bundle.js must register window.esc; every call site reads it from there');
});

test('all five characters, so one helper serves text and attributes alike', () => {
  assert.equal(esc('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  // The two the local copies split on. text-diff, source-peek and map escaped
  // three characters; chat-render's new Option().innerHTML idiom escaped the
  // same three; only repo-atlas escaped the double quote, because only
  // repo-atlas interpolated into an href. Escaping the quotes in a text node
  // costs nothing (&quot; renders as ") and it retires the question.
  assert.equal(esc('a "b" c'), 'a &quot;b&quot; c');
  assert.equal(esc("it's"), 'it&#39;s');
});

test('an attribute cannot be broken out of', () => {
  const hostile = '" onerror="alert(1)';
  const value = esc(hostile);
  assert.ok(!value.includes('"'),
    'a bare double quote survived, so the value can close the attribute it sits in');
  assert.equal(`<img alt="${value}">`,
    '<img alt="&quot; onerror=&quot;alert(1)">');
});

test('a missing value is empty, not the string "undefined"', () => {
  // Three of the five copies guarded this and two did not, which is how a
  // blank field renders as the word undefined on one surface and not another.
  assert.equal(esc(undefined), '');
  assert.equal(esc(null), '');
  assert.equal(esc(''), '');
  assert.equal(esc(0), '0', 'a falsy value that is not nullish is still a value');
  assert.equal(esc(false), 'false');
});

test('escaping is not idempotent, which is the no-decoding rule showing', () => {
  // Deliberate, and the reason the rule this replaced was wrong rather than
  // merely unimplemented. Escaping twice double-escapes; the fix is to escape
  // once, at the interpolation, never to decode first and guess.
  assert.equal(esc(esc('&')), '&amp;amp;');
});

// ── the shelf stays at one ─────────────────────────────────────────────────

// Two shapes, because the copies came in two idioms: the entity as a quoted
// string, in a character map or a chain of .replace/.replaceAll calls, and the
// browser-native new Option(s).innerHTML trick.
//
// QUOTED is the discriminating half. Static markup carries `Save &amp; retry`
// bare in a header (pages/console-playground.html does), and prose carries the
// entity in a sentence; only code building an escape table writes it as a
// string literal. Matching the quote rather than the entity is what keeps this
// scan free of the carve-outs a looser pattern would need.
const ENTITY_LITERAL = /(['"`])&(?:amp|lt|gt|quot|#39);\1/;
const OPTION_ESCAPE = /new Option\([^)]*\)\s*\.innerHTML/;

// Comments are stripped first: a comment NAMING the idiom is documentation,
// and lib/kits/chat-render.js carries one saying which idiom it replaced.
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// Whole-file, not line-by-line: the copies chain across lines
// (pages/drop/fills-concepts/2-tagged-factory/aic-1.html spends five on one
// helper), so a per-line read reports the first and misses the rest.
const definesEscape = src => {
  const clean = stripComments(src);
  return ENTITY_LITERAL.test(clean) || OPTION_ESCAPE.test(clean);
};

// Exemptions, each an argued decision rather than an oversight. A file listed
// here has a reason it cannot or should not read window.esc; anything not
// listed must.
const FILLS =
  'Preserved model output. pages/drop/fills-concepts/*/PROMPT.md records one ' +
  'prompt pasted into several fresh sessions, and the pages are the ' +
  'comparison. Editing one edits the record.';

const EXEMPT = new Map([
  ['lib/gh-auth.js',
    'The token prompt and the boot-failure screen are what run when the chain ' +
    'has broken. They escape inline, dependency-free, on purpose: reading a ' +
    'helper out of a bundle that may be the thing that failed to load would ' +
    'make the failure screen fail.'],
  ['pages/wsl-sync/pension-map.html',
    'A self-contained page in docs/loader.md\'s first tier: no gh-api, no ' +
    'gh.load, no bundle. It cannot reach window.esc without changing tier.'],
  ['pages/drop/fills-concepts/1-chain-constructor/aic.html', FILLS],
  ['pages/drop/fills-concepts/2-tagged-factory/aic-1.html', FILLS],
  ['pages/drop/fills-concepts/3-reactive-surface/aic-2.html', FILLS],
  ['pages/drop/fills-concepts/3-reactive-surface/collection-browser.html', FILLS],
]);

const walk = dir => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.(js|html)$/.test(name) ? [full] : [];
});

const scanned = [...walk(path.join(repoRoot, 'lib')), ...walk(path.join(repoRoot, 'pages'))]
  .map(full => ({ rel: path.relative(repoRoot, full).split(path.sep).join('/'), full }))
  // The bundle is where the helper lives.
  .filter(f => f.rel !== 'lib/vanilla-bundle.js');

test('no file defines its own HTML-escape helper', () => {
  const found = scanned
    .filter(({ rel }) => !EXEMPT.has(rel))
    .filter(({ full }) => definesEscape(readFileSync(full, 'utf8')))
    .map(({ rel }) => rel);
  assert.deepEqual(found, [],
    'a local HTML-escape helper reappeared. Call window.esc (lib/vanilla-bundle.js) ' +
    'instead, or add the file to EXEMPT above with the reason it cannot.');
});

test('every exemption is real, so the list cannot outlive its reasons', () => {
  // An exemption that no longer matches anything is a stale carve-out, and a
  // stale carve-out is how the next copy gets in unnoticed.
  for (const [rel, why] of EXEMPT) {
    assert.ok(definesEscape(readFileSync(path.join(repoRoot, rel), 'utf8')),
      `${rel} is exempt but no longer defines one; drop the entry (${why.slice(0, 40)}…)`);
  }
});

test('the five converted sites read the shared helper', () => {
  // Named, because these are the sites the task inventoried and the ones a
  // future edit is most likely to un-convert.
  for (const rel of [
    'lib/alpineComponents/map.js',
    'lib/kits/text-diff.js',
    'lib/kits/chat-render.js',
    'lib/kits/source-peek.js',
    'pages/repo-atlas.html',
  ]) {
    const src = readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.match(src, /window\.esc\(/, `${rel} no longer reads window.esc`);
  }
});

test('the ambient bundle is first in the boot chain, ahead of what reads it', () => {
  // Position, not membership: a kit that escapes through window.esc and loads
  // before the file that defines it is a race, and vanilla-bundle.js sat last
  // in BOOT until this task moved it. It depends on nothing, so first is free.
  const boot = readFileSync(path.join(repoRoot, 'lib/gh-boot.js'), 'utf8');
  const manifest = boot.slice(boot.indexOf('const BOOT = ['));
  const paths = [...manifest.matchAll(/\{\s*path:\s*'([^']+)'/g)].map(m => m[1]);
  assert.equal(paths[0], 'vanilla-bundle.js',
    'vanilla-bundle.js must lead BOOT: it defines window.esc, which entries below it read');
});
