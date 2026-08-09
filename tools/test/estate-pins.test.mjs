// alpineComponents/estate.js — logic tests for the estate Pin list: load
// (404 -> empty, real error -> surfaced), add (address gate, title default,
// draft handling, commit message), delete (the "Unpin" message), the grouped
// render order, and the open routing (extension = file, else folder). Also
// pins the storage path to lists/pins.json in the registry, beside the other
// two lists. Driven over a fake GH and a stubbed shell; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

let FILES = {};    // "<path>" -> parsed JSON served from the registry
let SAVES = [];    // every save call: { repo, path, value, message }
let NAV = [];      // every shell navigation: ['ensureBrowser'|'openFile'|'openFolder', ...args]

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async repos() { return []; }
  async ls() { return []; }
  async get(name) {
    if (this.repo === REGISTRY && FILES[name]) return { text: JSON.stringify(FILES[name]) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req(path) {
    if (typeof path === 'string' && path.startsWith('/repos/'))
      return { default_branch: 'main', description: '', private: true, pushed_at: '' };
    return {};
  }
  async save(path, value, message) { SAVES.push({ repo: this.repo, path, value, message }); return {}; }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="es" x-data="estate()"></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = {
  REGISTRY_REPO: REGISTRY,
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
  refreshConfigCache() {},
  refreshActivity() {},
  async ensureBrowser(repo, ref) { NAV.push(['ensureBrowser', repo, ref]); },
  async openFile(path) { NAV.push(['openFile', path]); },
  async openFolder(path) { NAV.push(['openFolder', path]); },
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/surface.js',
  // openPin and pinGroups speak the estate's one addressing grammar through
  // the shared parser, so the suite loads it the way the pre-build does; the
  // add form's tap route mounts the shared path-picker lazily, so this suite
  // loads it too (the other estate suites never toggle it and stay clean).
  'lib/kits/repo-address.js',
  'lib/alpineComponents/path-picker.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));
const reg = () => new FakeGH({ repo: REGISTRY });

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('loadPins reads lists/pins.json; a missing file is an empty list, not an error', async () => {
  FILES = {};
  await data.loadPins(reg());
  assert.equal(data.pinItems.length, 0);
  assert.equal(data.pinErr, '');

  FILES = { 'lists/pins.json': { items: [{ id: 'p1', target: 'me/home:docs/a.md', title: 'A', created_at: '2026-08-07T10:00:00Z' }] } };
  await data.loadPins(reg());
  assert.equal(data.pinItems.length, 1);
  assert.equal(data.pinItems[0].title, 'A');
});

test('a non-404 load failure is surfaced in pinErr', async () => {
  const bad = reg();
  bad.get = async () => { throw Object.assign(new Error('boom'), { status: 500 }); };
  await data.loadPins(bad);
  assert.equal(data.pinItems.length, 0);
  assert.match(data.pinErr, /boom/);
});

test('addPin gates on the address grammar: a non-address stays in the draft, no save', async () => {
  FILES = {}; SAVES = [];
  await data.loadPins(reg());
  data.pinDraft = 'not an address';
  await data.addPin();
  assert.equal(data.pinDraft, 'not an address');   // the fix is one edit away
  assert.equal(data.pinItems.length, 0);
  assert.equal(SAVES.length, 0);
  assert.match(data.pinErr, /Not an address/);
});

test('addPin stores {id, target, title, created_at}, defaults the title from the path, and saves with a Pin message', async () => {
  SAVES = [];
  data.pinDraft = '  me/home:chron/2026/08/2026-08-07-merge-methods.md  ';
  data.pinTitle = '';
  await data.addPin();
  assert.equal(data.pinDraft, '');
  assert.equal(data.pinErr, '');
  assert.equal(data.pinItems.length, 1);
  const it = data.pinItems[0];
  assert.equal(it.target, 'me/home:chron/2026/08/2026-08-07-merge-methods.md');
  assert.equal(it.title, '2026-08-07-merge-methods.md');   // path's last segment
  assert.ok(it.id && it.created_at);
  assert.equal(SAVES.length, 1);
  assert.equal(SAVES[0].repo, REGISTRY);
  assert.equal(SAVES[0].path, 'lists/pins.json');          // authored content lives under lists/
  assert.match(SAVES[0].message, /^Pin "2026-08-07-merge-methods\.md" via show-repo$/);
  assert.deepEqual(SAVES[0].value.items, data.pinItems);
});

test('a typed title wins over the path default', async () => {
  SAVES = [];
  data.pinDraft = 'me/home@work:notes/';
  data.pinTitle = '  Notes  ';
  await data.addPin();
  const it = data.pinItems.at(-1);
  assert.equal(it.title, 'Notes');
  assert.match(SAVES[0].message, /^Pin "Notes" via show-repo$/);
});

test('pinGroups keeps authored order, groups by group with the repo short name as fallback', () => {
  data.pinItems = [
    { id: 'a', target: 'me/home:x/one.md', title: 'One', group: 'Git' },
    { id: 'b', target: 'me/tools:y/two.md', title: 'Two' },
    { id: 'c', target: 'me/home:x/three.md', title: 'Three', group: 'Git' },
  ];
  const g = data.pinGroups;
  assert.deepEqual([...g.map(x => x.label)], ['Git', 'tools']);
  assert.deepEqual([...g[0].items.map(i => i.id)], ['a', 'c']);
  assert.deepEqual([...g[1].items.map(i => i.id)], ['b']);
});

test('openPin routes like the sidebar Pinned block: extension opens a file, no extension the folder', async () => {
  NAV = [];
  await data.openPin({ target: 'me/home@work:docs/a.md' });
  await data.openPin({ target: 'me/home:projects/budget/' });
  assert.deepEqual(NAV, [
    ['ensureBrowser', 'me/home', 'work'],
    ['openFile', 'docs/a.md'],
    ['ensureBrowser', 'me/home', ''],
    ['openFolder', 'projects/budget/'],
  ]);
});

test('a pick fills the draft with the formatted address and never saves on its own', async () => {
  SAVES = [];
  data.pinDraft = ''; data.pinErr = 'stale error';
  data.pinPicked({ repo: 'me/home', ref: 'work', path: 'docs/a.md' });
  assert.equal(data.pinDraft, 'me/home@work:docs/a.md');
  assert.equal(data.pinErr, '');            // a pick clears a stale gate error
  assert.equal(SAVES.length, 0);            // commit stays with the + button
});

test('the picker panel mounts lazily on first toggle and opens', async () => {
  assert.equal(data.pinPickerWanted, false);
  assert.equal(data.pinPickerOpen, false);
  data.togglePinPicker();
  assert.equal(data.pinPickerWanted, true);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(data.pinPickerOpen, true);
});

test('deletePin removes the item and saves with an Unpin message', async () => {
  data.pinItems = [
    { id: 'a', target: 'me/home:x/one.md', title: 'One' },
    { id: 'b', target: 'me/tools:y/two.md', title: 'Two' },
  ];
  SAVES = [];
  await data.deletePin(data.pinItems[0]);
  assert.deepEqual(data.pinItems.map(i => i.id), ['b']);
  assert.equal(SAVES[0].path, 'lists/pins.json');
  assert.match(SAVES[0].message, /^Unpin "One" via show-repo$/);
});
