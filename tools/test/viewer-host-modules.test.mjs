// alpineComponents/viewer.js — what a HOST contributes to ONE module, through
// the `modules` factory option.
//
// A host can have a reason to draw on a document that the viewer cannot have.
// home's submittal page marks where a crosswalk row lands, on the page it
// lands on, and before this slot existed the only way to keep that mark was to
// keep a private copy of the whole reader beside it: a second mammoth, a
// second marked, a second SheetJS.
//
// What the cases hold is the part that fails quietly. The bag is keyed by
// module id and a module must get its own slice and no other, since a flat bag
// would let one module read options meant for another and neither would say
// so. And a host that passes nothing has to land on exactly today's behavior,
// which is `{}` rather than undefined, because a module reading `ctx.opts.x`
// on a bare mount would throw where it used to work.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="host" x-data="viewer({ modules: { probe: { mark: 'A' }, other: { mark: 'B' } } })"></div>
    <div id="bare" x-data="viewer()"></div>
  </body></html>`,
});

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/alpineComponents/viewer.js',
]);

// A module with no assets: prepare() short-circuits, so switchMode reaches
// after() without touching a CDN.
const seen = [];
window.ViewRegistry.modules.unshift({
  id: 'probe', label: 'Probe', icon: 'ph-bug',
  test: () => true,
  render: () => '<div data-probe></div>',
  after: (f, ctx) => { seen.push({ id: 'probe', opts: ctx.opts }); },
});

const mount = async (elId, mode = 'probe') => {
  const d = Alpine.$data(window.document.getElementById(elId));
  d.file = 'a.txt';
  d.content = 'x';
  await d.switchMode(mode);
  await tick(4);
  return d;
};

test('a module is handed its own slice of the host bag, by id', async () => {
  seen.length = 0;
  await mount('host');
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].opts, { mark: 'A' });
});

test("a module cannot read another module's options", async () => {
  seen.length = 0;
  await mount('host');
  assert.equal(seen[0].opts.mark, 'A');
  assert.ok(!('other' in seen[0].opts), 'the whole bag leaked into one module');
  assert.equal(seen[0].opts.B, undefined);
});

test('a host that contributes nothing gets an empty object, never undefined', async () => {
  seen.length = 0;
  await mount('bare');
  assert.equal(seen.length, 1);
  // Own keys rather than deepEqual: the object is minted inside the jsdom
  // realm, so it does not share this file's Object.prototype and a strict
  // deep-equal against a literal `{}` fails on the prototype alone.
  assert.ok(seen[0].opts && typeof seen[0].opts === 'object');
  assert.deepEqual(Object.keys(seen[0].opts), []);
});

// ── the table narrowing ──────────────────────────────────────────────────────
//
// The second host hook, and the reason it is initialHeaderFilter rather than
// setFilter: a narrowing the reader cannot see is a table that disagrees with
// its own row count and offers no way back to the whole file.

test('a col/find pair becomes a visible header filter', () => {
  const f = window.ViewRegistry.headerFilter({ filter: { col: 'Vendor', find: 'VOYA' } });
  assert.deepEqual(Object.keys(f), ['initialHeaderFilter']);
  assert.equal(f.initialHeaderFilter.length, 1);
  assert.equal(f.initialHeaderFilter[0].field, 'Vendor');
  assert.equal(f.initialHeaderFilter[0].value, 'VOYA');
});

test('a half-specified narrowing is no narrowing at all', () => {
  // Spread into a Tabulator config, so the empty case has to be an empty
  // object: `{ initialHeaderFilter: undefined }` is a declared key with a
  // garbage value, which Tabulator reads and this does not.
  for (const bad of [undefined, {}, { filter: {} }, { filter: { col: 'a' } }, { filter: { find: 'b' } }]) {
    assert.deepEqual(Object.keys(window.ViewRegistry.headerFilter(bad)), [], JSON.stringify(bad));
  }
});

test('both table-drawing modes read the narrowing', () => {
  for (const id of ['table', 'xlsx']) {
    const src = window.ViewRegistry.modules.find(m => m.id === id).after.toString();
    assert.match(src, /ViewRegistry\.headerFilter\(/, `the ${id} mode ignores the host narrowing`);
  }
});
