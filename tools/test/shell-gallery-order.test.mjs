// The gallery honors `order` on a declared `pages` catalog entry.
//
// The field was half-implemented for as long as it existed: loadEstateSidebar
// sorted app views on it, and the gallery ignored it entirely, so
// web-tools-private's `order: 40` on a non-appView entry did nothing while
// chat-histories' `order: 30` on an app view worked. Nobody noticed because
// the two surfaces are read at different times and a catalog of two entries
// looks fine in either order.
//
// The rules being pinned here, both of which are choices rather than
// inevitabilities:
//   1. Undeclared reads as 0, matching how app views have always treated it.
//   2. The tiebreak is the entry's POSITION in the catalog, not its label. A
//      gallery is one repo's hand-written list, so array order is already an
//      editorial statement; a label sort would silently rearrange every
//      existing catalog to implement a field almost none of them set. That is
//      the regression this test exists to prevent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShell } from './shell.mjs';

// Drive the declared-catalog branch of gallery.load() with no token, so the
// thumb cache short-circuits and nothing reaches the network.
async function catalog(pages) {
  const store = {
    repo: 'mehrlander/example',
    ref: 'main',
    defaultRef: 'main',
    config: { pages },
  };
  const { gallery } = makeShell({ browserStore: store });
  await gallery.load();
  const group = gallery.groups[0] || { items: [] };
  return group.items.map(i => i.path);
}

const P = (path, order) => (order === undefined ? { path } : { path, order });

test('a catalog declaring no order renders in the order it was written', async () => {
  const paths = await catalog([P('pages/c.html'), P('pages/a.html'), P('pages/b.html')]);
  assert.deepEqual(paths, ['pages/c.html', 'pages/a.html', 'pages/b.html'],
    'array order is an editorial statement and must survive untouched');
});

test('order sorts the catalog ascending', async () => {
  const paths = await catalog([P('pages/c.html', 30), P('pages/a.html', 10), P('pages/b.html', 20)]);
  assert.deepEqual(paths, ['pages/a.html', 'pages/b.html', 'pages/c.html']);
});

test('an undeclared order reads as 0, so it sorts ahead of a declared weight', async () => {
  const paths = await catalog([P('pages/late.html', 40), P('pages/silent.html')]);
  assert.deepEqual(paths, ['pages/silent.html', 'pages/late.html']);
});

test('entries sharing a weight keep their catalog positions, not their alphabetical order', async () => {
  const paths = await catalog([P('pages/z.html', 5), P('pages/a.html', 5), P('pages/m.html', 5)]);
  assert.deepEqual(paths, ['pages/z.html', 'pages/a.html', 'pages/m.html'],
    'a label tiebreak here would rearrange every catalog that never set order');
});

test('a non-numeric order is ignored rather than poisoning the sort', async () => {
  const paths = await catalog([
    { path: 'pages/first.html', order: 'soon' },
    { path: 'pages/second.html', order: 10 },
  ]);
  assert.deepEqual(paths, ['pages/first.html', 'pages/second.html'],
    'NaN must not propagate: Number.isFinite gates the read');
});
