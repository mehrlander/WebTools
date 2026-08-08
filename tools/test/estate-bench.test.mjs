// alpineComponents/estate.js — the bench, the working half of the Stage view.
//
// The bench used to be a card on the shelf that a pencil opened, and it moved:
// it mounted under whichever surface was being edited, and the working card
// vanished while a saved one was open. That cost the word "stage" its place in
// the UI and gave the workspace no fixed address. It is now one block at the
// top of the view, always present, and a saved surface is LOADED onto it.
//
// The two are now pill-switched sub-views of the one Stage stop, the shape
// Activity uses for its three and Map for its two, and each keeps its own
// ?view key so the URL is the switch and both deep-link.
//
// What that leaves to hold, and what these cover:
//   - one nav stop, two pills, the shell view picking which is lit,
//   - a pill tap routes through the shell rather than setting local state,
//   - the shelf carries saved surfaces ONLY (no synthesized bench card),
//   - which surface the bench holds is store.stageOrigin and nothing else, so
//     a save writes back to the right file and there is no second copy to drift,
//   - clearing the stage drops the origin with it, or the next save silently
//     overwrites a surface the bench no longer holds,
//   - a loaded card renders what the BENCH holds, not what its file holds.
//
// Logic only, over a fake GH and a stubbed shell; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

const SAVED = {
  manifest: { name: 'Review set', category: 'stage' },
  items: [
    { id: 'one', title: 'a.md', type: 'file',
      target: { source: { repository: 'me/app', path: 'a.md', ref: 'main' } } },
    { id: 'two', title: 'b.md', type: 'file',
      target: { source: { repository: 'me/app', path: 'b.md', ref: 'main' } } },
    // Prose: no file behind it, so it stays on the surface and is reported.
    { id: 'note', title: 'Why', type: 'note', content: 'because' },
  ],
};

let FILES = {};

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async repos() { return []; }
  async ls(path) {
    if (this.repo === REGISTRY && path === 'surfaces')
      return Object.keys(FILES).map(name => ({ type: 'file', name }));
    return [];
  }
  async get(name) {
    if (this.repo === REGISTRY && name.startsWith('surfaces/')) {
      const key = name.slice('surfaces/'.length);
      if (FILES[key]) return { text: JSON.stringify(FILES[key]) };
    }
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req() { throw new Error('unexpected'); }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = {
  REGISTRY_REPO: REGISTRY, DEFAULT_REPO: 'me/tools', quickLinks: [],
  hasToken: () => true, _authState: 'auth',
  refreshConfigCache() {}, refreshActivity() {},
  // The two Stage pills route through the shell, as Activity's three do, so
  // the URL stamp is the switch. The stub is the real contract: set the view.
  goStage() { this.view = 'stage'; },
  goSurfaces() { this.view = 'surfaces'; },
  view: 'stage',
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/surface.js',
  // The bench mounts the stager on this tab. These assertions are about the
  // estate's own logic, so the stager stands in inert rather than dragging in
  // the path picker and the viewer behind it.
  'tools/test/fixtures/inert-components.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));
const store = () => Alpine.store('browser');

FILES = { 'saved.surface': SAVED };
await data.loadSurfaces(new FakeGH({ repo: REGISTRY }));
const saved = data.surfaces[0];

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('the shelf carries saved surfaces only: no synthesized bench card', () => {
  const all = data.surfaceSections.flatMap(s => s.surfaces);
  assert.equal(all.length, 1);
  assert.equal(all[0].uid, saved.uid);
  assert.equal(all.some(s => s.bench || s.uid === 'bench'), false,
    'the bench is a fixed block above the shelf, not a row on it');
});

test('the Stage is one nav stop over two pill-switched sub-views', () => {
  // One stop: both keys light the same header tab...
  window.__shell.view = 'stage';
  assert.equal(data.tab, 'stage');
  window.__shell.view = 'surfaces';
  assert.equal(data.tab, 'stage');
  window.__shell.view = 'estate';
  assert.equal(data.tab, 'repos');

  // ...and the key picks the pill, so each sub-view deep-links on its own.
  window.__shell.view = 'stage';
  assert.equal(data.stageTab, 'bench');
  window.__shell.view = 'surfaces';
  assert.equal(data.stageTab, 'saved');
});

test('a pill tap routes through the shell rather than setting local state', () => {
  window.__shell.view = 'surfaces';
  data.goSub('stage');
  assert.equal(window.__shell.view, 'stage', 'the URL stamp is the switch');
  assert.equal(data.stageTab, 'bench');
  data.goSub('surfaces');
  assert.equal(window.__shell.view, 'surfaces');
  assert.equal(data.stageTab, 'saved');
});

test('the pill counts read the live stage and the loaded shelf', () => {
  store().stage = [];
  assert.equal(data.stagedCount, 0);
  store().stage = [{ repo: 'me/app', ref: 'main', path: 'a.md' }];
  assert.equal(data.stagedCount, 1);
  assert.equal(data.savedCount, data.surfaces.length + data.repoSurfaces.length);
});

test('loading a saved surface stages its addressable items and remembers the origin', () => {
  window.__shell.view = 'surfaces';
  data.loadOntoStage(saved);
  assert.equal(data.stageTab, 'bench', 'the load shows what it loaded');
  // Joined, not deep-equal: the store's array is built in the jsdom realm, so
  // its prototype is not this one's and deepStrictEqual fails on identity.
  assert.equal(store().stage.map(i => i.path).join(','), 'a.md,b.md');
  assert.equal(store().stageOrigin.file, saved.file);
  assert.equal(store().stageOrigin.manifest.name, 'Review set');
  assert.equal(data.benchOrigin, saved.uid);
  assert.equal(data.benchOriginName, 'Review set');
  assert.equal(data.onBench(saved), true);
});

test('benchOrigin has no second copy: the store is the only source', () => {
  data.loadOntoStage(saved);
  // Reaching past the component and clearing the store must move the component,
  // which is only true while benchOrigin derives rather than caches.
  store().stageOrigin = null;
  assert.equal(data.benchOrigin, '');
  assert.equal(data.onBench(saved), false);
});

test('a loaded card renders what the bench holds, not what its file holds', () => {
  data.loadOntoStage(saved);
  store().stage = [{ repo: 'me/app', ref: 'main', path: 'a.md' }];   // one removed on the bench
  assert.equal(data.live(saved).items.length, 1);
  const other = { ...saved, uid: 'someone/else:x.surface' };
  assert.equal(data.live(other).items.length, SAVED.items.length,   // untouched surface: its own file
    'only the surface on the bench tracks the bench');
});

test('detaching keeps the items and drops the write-back', () => {
  data.loadOntoStage(saved);
  const held = store().stage.length;
  data.detachBench();
  assert.equal(store().stage.length, held, 'the set stays in hand');
  assert.equal(store().stageOrigin, null, 'but a save no longer writes back to that file');
  assert.equal(data.benchOrigin, '');
});

test('a surface with no addressable item does not take the bench', () => {
  data.loadOntoStage(saved);
  const prose = { uid: 'x', file: 'p.surface', manifest: { name: 'P' },
                  items: [{ id: 'n', title: 'n', type: 'note', content: 'x' }] };
  data.loadOntoStage(prose);
  assert.equal(data.benchOrigin, saved.uid, 'the bench keeps what it had');
});
