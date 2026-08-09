// alpineComponents/estate.js — logic tests for the two personal lists, mainly
// the jots pile: load (404 -> empty, real error -> surfaced), add (item shape,
// draft clear, clipped commit message carrying the text), delete, and the
// newest-first pile order. Also pins both lists' storage paths to lists/ in
// the registry (authored content; state/ stays derived caches only). Driven
// over a fake GH and a stubbed shell; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

let FILES = {};    // "<path>" -> parsed JSON served from the registry
let SAVES = [];    // every save call: { repo, path, value, message }

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
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));
const reg = () => new FakeGH({ repo: REGISTRY });

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('loadJots reads lists/jots.json; a missing file is an empty pile, not an error', async () => {
  FILES = {};
  await data.loadJots(reg());
  assert.equal(data.jotItems.length, 0);
  assert.equal(data.jotErr, '');

  FILES = { 'lists/jots.json': { items: [{ id: 'j1', text: 'an idea', created_at: '2026-07-20T10:00:00Z' }] } };
  await data.loadJots(reg());
  assert.equal(data.jotItems.length, 1);
  assert.equal(data.jotItems[0].text, 'an idea');
});

test('a non-404 load failure is surfaced in jotErr', async () => {
  const bad = reg();
  bad.get = async () => { throw Object.assign(new Error('boom'), { status: 500 }); };
  await data.loadJots(bad);
  assert.equal(data.jotItems.length, 0);
  assert.match(data.jotErr, /boom/);
});

test('addJot appends {id, text, created_at}, clears the draft, and saves with the text in the message', async () => {
  FILES = {}; SAVES = [];
  await data.loadJots(reg());
  data.jotDraft = '  try the lightbulb icon  ';
  await data.addJot();
  assert.equal(data.jotDraft, '');
  assert.equal(data.jotItems.length, 1);
  const it = data.jotItems[0];
  assert.equal(it.text, 'try the lightbulb icon');            // trimmed
  assert.ok(it.id && it.created_at && !('done' in it));       // no done state on a jot
  assert.equal(SAVES.length, 1);
  assert.equal(SAVES[0].repo, REGISTRY);
  assert.equal(SAVES[0].path, 'lists/jots.json');             // authored content lives under lists/
  assert.match(SAVES[0].message, /Jot "try the lightbulb icon" via show-repo/);
  assert.deepEqual(SAVES[0].value.items, data.jotItems);
});

test('a long jot is clipped in the commit message, intact in the item', async () => {
  SAVES = [];
  const long = 'x'.repeat(100);
  data.jotDraft = long;
  await data.addJot();
  const saved = SAVES[0];
  assert.equal(saved.value.items.at(-1).text, long);          // full text stored
  assert.match(saved.message, /^Jot "x{59}…" via show-repo$/); // subject clipped
});

test('jotPile orders newest first regardless of stored order', () => {
  data.jotItems = [
    { id: 'a', text: 'old', created_at: '2026-07-01T00:00:00Z' },
    { id: 'c', text: 'new', created_at: '2026-07-21T00:00:00Z' },
    { id: 'b', text: 'mid', created_at: '2026-07-10T00:00:00Z' },
  ];
  assert.deepEqual([...data.jotPile.map(i => i.id)], ['c', 'b', 'a']);
});

test('deleteJot removes the item and saves the remainder', async () => {
  SAVES = [];
  // The file is the source of truth now (mutateJots re-reads before saving),
  // so the fixture seeds it to match the pane's local copy.
  FILES = { 'lists/jots.json': { items: [...data.jotItems] } };
  const [a, , b] = data.jotItems;   // delete the middle one ('c', text "new")
  await data.deleteJot(data.jotItems[1]);
  assert.deepEqual([...data.jotItems.map(i => i.id)], [a.id, b.id]);
  assert.equal(SAVES[0].path, 'lists/jots.json');
  assert.match(SAVES[0].message, /^Delete jot "new" via show-repo$/);
});

test('the to-do list also lives under lists/ (moved out of state/)', async () => {
  SAVES = [];
  await data.saveTodos('probe');
  assert.equal(SAVES[0].path, 'lists/todo.json');
});

test('a write merges against a FRESH read, so a jot added elsewhere survives (the spine regression)', async () => {
  SAVES = [];
  // The pane loaded when only A existed…
  FILES = { 'lists/jots.json': { items: [{ id: 'jA', text: 'A', created_at: '2026-01-01T00:00:00Z' }] } };
  await data.loadJots(reg());
  // …then something else (the sidebar finder, a second tab) wrote B.
  FILES['lists/jots.json'].items = [
    { id: 'jA', text: 'A', created_at: '2026-01-01T00:00:00Z' },
    { id: 'jB', text: 'B', created_at: '2026-01-02T00:00:00Z' },
  ];
  data.jotDraft = 'C';
  await data.addJot();
  // The save carries all three: B was not clobbered by the pane's stale copy.
  assert.deepEqual([...SAVES.at(-1).value.items.map(i => i.text)], ['A', 'B', 'C']);
  // Deletion goes through the same fresh read.
  FILES['lists/jots.json'] = SAVES.at(-1).value;
  await data.deleteJot({ id: 'jB', text: 'B' });
  assert.deepEqual([...SAVES.at(-1).value.items.map(i => i.text)], ['A', 'C']);
});
