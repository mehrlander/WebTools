// ONE OWNER FOR THE CLIPBOARD WRITE, held here because the duplication came
// back by copy-paste rather than by decision. Four kits carried the same
// textarea fallback: chat-render and vanilla-demo byte-identical, session-export
// the same idea returning a boolean, md-doc already delegating. The block is not
// boilerplate but the iOS recipe kits/io.js documents at length, so four copies
// were four places for it to drift, and three had already drifted on what they
// returned.
//
// The gate is deliberately about the FALLBACK, not about `navigator.clipboard`:
// a kit may reach the modern API directly as its no-io.js degradation, and the
// delegates do exactly that. What no kit may re-implement is the legacy path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KITS = 'lib/kits';

// annotate.js is the one exception and it is earned: the card mounts into
// ARBITRARY documents, including a page running inside a toss frame, so its
// fallback selects into `S.doc` rather than the top-level `document` that
// io.copy reaches. A shared helper cannot do that without being handed a
// document, which is a wider change than this gate is asking for.
const ALLOWED = new Set(['io.js', 'annotate.js']);

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

test('only kits/io.js and kits/annotate.js implement the legacy clipboard write', () => {
  const offenders = [];
  for (const file of walk(KITS)) {
    if (!file.endsWith('.js')) continue;
    const name = file.slice(KITS.length + 1);
    if (ALLOWED.has(name)) continue;
    const src = readFileSync(file, 'utf8');
    if (/execCommand\(\s*['"]copy['"]\s*\)/.test(src)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    'these kits re-implement the legacy copy; delegate to window.io.copy instead');
});

test('every kit that copies delegates to io.copy and fetches it at load time', () => {
  // Fetched when the kit loads, never inside the click: a write has to run in
  // the gesture that asked for it, and an await before it can spend the user
  // activation Safari counts.
  const consumers = ['chat-render.js', 'session-export.js', 'vanilla-demo.js', 'md-doc.js',
                     'row-menu.js'];
  for (const name of consumers) {
    const src = readFileSync(join(KITS, name), 'utf8');
    assert.match(src, /window\.io\.copy\(text\)/, name + ' delegates the write');
    assert.match(src, /ghRef\.load\('kits\/io\.js'\)/, name + ' fetches io.js at load time');
    assert.doesNotMatch(src, /ghRef\.load\('kits\/io\.js'\)[\s\S]{0,80}await/,
      name + ' does not await io.js inside a handler');
  }
});

test('io.copy returns the deferred write\'s own answer', () => {
  // The unfocused branch waits for a click and then copies. It used to resolve
  // undefined, so a caller reading the result showed "Failed" on a copy that
  // had just succeeded.
  const src = readFileSync(join(KITS, 'io.js'), 'utf8');
  assert.match(src, /resolve\(await io\.copy\(text\)\)/);
});
