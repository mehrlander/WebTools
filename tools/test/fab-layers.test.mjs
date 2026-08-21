// fab-layers.test.mjs — the drawer's layer strip: the frame stack a page
// reaches the screen through, named rather than picked silently.
//
// The two things worth pinning:
//
// DERIVED, NOT REMEMBERED. readLayers walks the live frames every time. That is
// the whole reason no clear is needed when a frame goes away, so the tests walk
// fake roots rather than stubbing a remembered subject.
//
// THE PICK REACHES EVERYTHING. selectLayer re-points repo, path and ref, which
// is what every other pane in the drawer reads. A pick that moved the strip and
// left the ref bar behind would pass a shallower test and be worse than the
// silent choice it replaced.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
const Alpine = await startAlpine(window, [
  'lib/kits/guide-render.js', 'lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js',
]);
const doc = window.document;

async function mountFab(attrs = 'data-repo="mehrlander/web-tools" data-path="app/index.html"') {
  const host = doc.createElement('div');
  host.innerHTML = `<div x-data="fab()" ${attrs}></div>`;
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  return Alpine.$data(host.firstElementChild);
}

// A window with an address of its own, the way a framed toss-render has one.
const pagesWin = (path, opts = {}) => ({
  frames: opts.frames || [],
  location: { href: 'https://mehrlander.github.io/web-tools/' + path,
              hostname: 'mehrlander.github.io', pathname: '/web-tools/' + path,
              search: opts.search || '' },
  __tossSubject: opts.subject || null,
});

// A window with no address worth reading, the way toss-render's blob: frame has
// none. Its parent's announcement is the only name it has.
const blobWin = (opts = {}) => ({
  frames: opts.frames || [],
  location: { href: 'blob:https://mehrlander.github.io/abc', hostname: '', pathname: '', search: '' },
  __tossSubject: opts.subject || null,
});

// A cross-origin child: every access throws, which is the answer rather than an
// error.
const sealedWin = () => ({ get location() { throw new Error('cross-origin'); } });

test('a page on its own is one layer, which the strip shows as a label', async () => {
  const d = await mountFab();
  const layers = d.readLayers({ frames: [] });
  assert.equal(layers.length, 1);
  assert.equal(layers[0].repo, 'mehrlander/web-tools');
  assert.equal(layers[0].path, 'app/index.html');
  assert.equal(layers[0].role, 'shell', 'no stack under it, so it is not "the app"');
});

test('a toss is two layers: the renderer names itself, the page is named by the announcement', async () => {
  const d = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/toss-render.html"');
  const subject = { repo: 'mehrlander/home', ref: 'main', path: 'projects/budget-drs/app/view/app.html' };
  const root = { frames: [blobWin()], __tossSubject: subject, location: { href: 'x' } };
  const layers = d.readLayers(root);

  assert.equal(layers.length, 2);
  assert.equal(layers[0].path, 'pages/toss-render.html');
  assert.equal(layers[1].repo, 'mehrlander/home');
  assert.equal(layers[1].path, subject.path);
  assert.equal(layers[1].role, 'page');
});

test('the app view is three layers, and the outermost stops calling itself the shell', async () => {
  const d = await mountFab();
  const subject = { repo: 'mehrlander/home', ref: 'main', path: 'projects/budget-drs/app/view/app.html' };
  const renderer = pagesWin('pages/toss-render.html', { subject, frames: [blobWin()] });
  const layers = d.readLayers({ frames: [renderer] });

  // Array.from re-homes the row into this realm: the component builds its
  // arrays inside the jsdom window, and strict deepEqual compares prototypes.
  assert.deepEqual(Array.from(layers.map(L => L.role)), ['app', 'renderer', 'page']);
  assert.equal(layers[0].path, 'app/index.html');
  assert.equal(layers[1].path, 'pages/toss-render.html');
  assert.equal(layers[2].path, subject.path);
});

test('a ?use= pin is the renderer layer own ref, not the page own', async () => {
  const d = await mountFab();
  const subject = { repo: 'mehrlander/home', ref: 'main', path: 'a/b/c.html' };
  const renderer = pagesWin('pages/toss-render.html', { subject, search: '?use=claude/thing', frames: [blobWin()] });
  const layers = d.readLayers({ frames: [renderer] });

  assert.equal(layers[1].ref, 'claude/thing');
  assert.equal(layers[2].ref, 'main', 'the page is at main even while the shell around it is not');
  assert.equal(d.layerOffRef(layers[1]), true);
  assert.equal(d.layerOffRef(layers[2]), false, 'so one row is marked and the other is not');
});

test('a sealed layer is listed as sealed rather than left out', async () => {
  const d = await mountFab();
  const layers = d.readLayers({ frames: [sealedWin()] });
  assert.equal(layers.length, 2);
  assert.equal(layers[1].sealed, true);
  assert.equal(d.layerName(layers[1]), 'sealed');
  assert.match(d.layerTitle(layers[1]), /opaque origin/);
});

test('refreshLayers selects the innermost readable layer', async () => {
  const d = await mountFab();
  d.layers = [{ repo: 'a/b', path: 'x', ref: 'main' }, { sealed: true }];
  d.layerIndex = 1;
  d.readLayers = () => [{ repo: 'a/b', path: 'x', ref: 'main', role: 'app' },
                        { repo: 'c/d', path: 'y', ref: 'main', role: 'page' },
                        { sealed: true, role: 'sealed' }];
  d.refreshLayers();
  assert.equal(d.layerIndex, 1, 'the last row is sealed, so the pick falls back to the one before it');
});

test('picking a layer re-points the whole drawer, not just the strip', async () => {
  const d = await mountFab();
  d.layers = [
    { repo: 'mehrlander/web-tools', path: 'app/index.html', ref: 'main', role: 'app' },
    { repo: 'mehrlander/home', path: 'projects/budget-drs/app/view/app.html', ref: 'claude/x', role: 'page' },
  ];
  d.layerIndex = 0;

  d.selectLayer(1);
  assert.equal(d.layerIndex, 1);
  assert.equal(d.repo, 'mehrlander/home');
  assert.equal(d.path, 'projects/budget-drs/app/view/app.html');
  assert.equal(d.ref, 'claude/x');
  assert.equal(d.viaToss, true, 'the drawer is no longer describing its own document');
  assert.equal(d.frameRef, 'claude/x', 'and the panes that key off the identity followed');

  d.selectLayer(0);
  assert.equal(d.repo, 'mehrlander/web-tools');
  assert.equal(d.viaToss, false, 'back to the document the fab is mounted on');

  d.selectLayer(0);
  assert.equal(d.layerIndex, 0, 'picking the row you are on is inert');
});

test('the default selection re-points the drawer, not just the strip', async () => {
  const d = await mountFab();
  // The app view: nothing announces across the frame boundary, so the drawer
  // starts describing the app. Picking the innermost layer by default is only
  // half the job, and the half that was missing: the strip said PAGE while
  // every pane under it still said app/index.html. Caught in the pixels.
  d.readLayers = () => [
    { repo: 'mehrlander/web-tools', path: 'app/index.html', ref: 'main', role: 'app' },
    { repo: 'mehrlander/web-tools', path: 'pages/toss-render.html', ref: 'main', role: 'renderer' },
    { repo: 'mehrlander/home', path: 'projects/budget-drs/app/view/app.html', ref: 'main', role: 'page' },
  ];
  d.refreshLayers();

  assert.equal(d.layerIndex, 2);
  assert.equal(d.repo, 'mehrlander/home', 'the drawer describes the innermost layer');
  assert.equal(d.path, 'projects/budget-drs/app/view/app.html');
  assert.equal(d.viaToss, true);
});

test('the github.io inference is one function, and infer() is one of its callers', async () => {
  const d = await mountFab();
  assert.deepEqual({ ...d._fromPagesUrl({ hostname: 'mehrlander.github.io', pathname: '/web-tools/pages/x.html' }) },
    { repo: 'mehrlander/web-tools', path: 'pages/x.html' });
  assert.deepEqual({ ...d._fromPagesUrl({ hostname: 'mehrlander.github.io', pathname: '/' }) },
    { repo: 'mehrlander/mehrlander.github.io', path: '' });
  assert.equal(d._fromPagesUrl({ hostname: 'example.com', pathname: '/x' }), null);
});
