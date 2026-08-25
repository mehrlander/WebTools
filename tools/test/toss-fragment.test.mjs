// toss-fragment.test.mjs — how toss-render.html reads its one fragment param.
//
// The reader lives inline in the page (its critical render path loads no lib on
// purpose), so this test lifts the `readFragment` function out of the page
// source and runs it. Lifting rather than re-implementing is the point: a
// rewrite here would pass while the page kept its own behavior.
//
// What it pins: a page query with bare '&'s survives inside the value. That was
// the bug (task toss-render-multiparam-query-encoding-n9lbcp) — the fragment was
// read with `new URLSearchParams(location.hash.slice(1))`, which splits the whole
// fragment on '&' before it looks at keys, so #gh=…?view=app&appRepo=X reached
// the page as ?view=app and nothing else, silently.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const PAGE = 'pages/toss-render.html';
const src = readFileSync(path.join(repoRoot, PAGE), 'utf8');

// Lift the function by its declaration, up to the closing brace at its own
// indentation. A reformat past this reads back nothing and fails here loudly.
const block = src.match(/\r?\n {2}function readFragment\(hash\) \{[\s\S]*?\r?\n {2}\}\r?\n/);
assert.ok(block, 'readFragment not found in ' + PAGE);
const readFragment = new Function(block[0] + '\n  return readFragment;')();

const hashShimBlock = src.match(/\r?\n {2}function hashNavigationShim\(\) \{[\s\S]*?\r?\n {2}\}\r?\n/);
assert.ok(hashShimBlock, 'hashNavigationShim not found in ' + PAGE);
const hashNavigationShim = new Function(hashShimBlock[0] + '\n  return hashNavigationShim;')();

test('the address, its whole page query, and a trailing frag come back intact', () => {
  const addr = 'mehrlander/web-tools@br:app/index.html?view=app&appRepo=X&appPath=Y';
  assert.deepEqual(readFragment('#gh=' + addr), ['gh', addr]);
});

test('%26 keeps working, so links minted for the old reader still resolve', () => {
  const [key, value] = readFragment('#gh=o/r@br:p.html?view=app%26appRepo=X');
  assert.equal(key, 'gh');
  assert.equal(value, 'o/r@br:p.html?view=app&appRepo=X');
});

test('a value that is not valid percent-escaping is used verbatim, not thrown on', () => {
  assert.deepEqual(readFragment('#gh=o/r:100%.html'), ['gh', 'o/r:100%.html']);
});

test("'+' is left alone: the params shim decodes it where it means a space", () => {
  assert.deepEqual(readFragment('#gh=o/r:a+b.html'), ['gh', 'o/r:a+b.html']);
});

test('a trailing #frag stays on the value for splitFrag to take off', () => {
  assert.deepEqual(readFragment('#gz=H4sIAAA#item=2'), ['gz', 'H4sIAAA#item=2']);
});

test('a nested toss keeps its inner address whole', () => {
  const inner = 'mehrlander/web-tools@br:pages/data-view.html?src=o/r:rows.csv&mode=table';
  const [key, value] = readFragment('#gh=mehrlander/web-tools@br:pages/toss-render.html#gh=' + inner);
  assert.equal(key, 'gh');
  assert.equal(value, 'mehrlander/web-tools@br:pages/toss-render.html#gh=' + inner);
});

test('every route key the page registers is readable as a fragment key', () => {
  const routes = [...src.matchAll(/^\s*'([\w-]+)':\s*\{\s*repo:/gm)].map(m => m[1]);
  assert.ok(routes.length >= 3, 'expected the TOSS_ROUTES literal to parse');
  for (const key of routes) {
    assert.deepEqual(readFragment(`#${key}=o/r:x.json`), [key, 'o/r:x.json'],
      `route key ${key} does not match the fragment key pattern`);
  }
});

test('no key, an empty fragment, and a bare value read as nothing', () => {
  assert.deepEqual(readFragment(''), [null, null]);
  assert.deepEqual(readFragment('#'), [null, null]);
  assert.deepEqual(readFragment('#o/r:page.html'), [null, null]);
});

test('an empty value reads as empty, so the page falls through to the panel', () => {
  assert.deepEqual(readFragment('#gh='), ['gh', '']);
});

test('the page reads its fragment by slice, not URLSearchParams', () => {
  assert.doesNotMatch(src, /new URLSearchParams\(location\.hash/,
    'the fragment must not go through URLSearchParams: it splits the value on "&"');
  assert.match(src, /const \[hashKey, hashValue\] = readFragment\(location\.hash\)/);
  assert.match(src, /const queryParams = new URLSearchParams\(location\.search\)/,
    'the query string keeps URLSearchParams, where "&" really does delimit');
});

test('address mode keeps fragment-only links on the rendered blob', () => {
  const shim = hashNavigationShim();
  assert.match(src, /prelude \+= hashNavigationShim\(\)/,
    'addressHtml must install the fragment-link shim');
  assert.match(shim, /getAttribute\('href'\)/,
    'the shim must inspect the raw href before <base> resolves it');
  assert.doesNotMatch(shim, /\ba\.href\b/,
    'the resolved href would already point at the GitHub Pages base');
  assert.match(shim, /location\.hash=h/,
    'fragment navigation must target the blob document itself');
});
