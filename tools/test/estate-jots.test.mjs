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
let READS = [];    // every get call: { path, opts }
let BUILT = 0;     // how many GH instances the component has constructed

class FakeGH {
  static FRESH = { cache: 'no-store' };
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; BUILT++; }
  ago() { return 'recently'; }
  async repos() { return []; }
  async ls() { return []; }
  async get(name, opts) {
    READS.push({ path: name, opts });
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

// The test above passed for months against a read that was not fresh at all.
// A fake GH has no HTTP cache, so nothing in this file could see that the real
// one was answering the merge read out of the browser's 60-second cache and
// handing the mutation a pre-write copy. The only thing a unit test can hold is
// the option itself, so it holds it: every list read carries GH.FRESH.
test('every list read asks to bypass the HTTP cache', async () => {
  for (const [load, path] of [[data.loadJots, 'lists/jots.json'],
                              [data.loadTodos, 'lists/todo.json'],
                              [data.loadPins, 'lists/pins.json']]) {
    READS = [];
    await load.call(data, reg());
    assert.equal(READS.length, 1, path + ': one read');
    assert.equal(READS[0].path, path);
    assert.equal(READS[0].opts?.cache, 'no-store', path + ': a list read feeds a write, so it must be fresh');
  }
  // And the read a jot write merges against, which is the one with a documented
  // lost-update guard behind it.
  READS = []; FILES = { 'lists/jots.json': { items: [] } };
  data.jotDraft = 'x';
  await data.addJot();
  assert.equal(READS.at(-1).opts?.cache, 'no-store');
});

// gh-store keeps the sha a successful write returns on the GH instance, and
// that record is the only copy of it the browser can trust for the next minute.
// Minting a GH per gesture threw it away and left the following write to
// rediscover the sha through the cache that could not have it: one check-off
// poisoned the next. Measured 2026-08-13; the account is on GH.FRESH.
test('the registry client is held, not rebuilt per gesture', async () => {
  const first = data.regGH();
  BUILT = 0;
  await data.saveTodos('probe');
  await data.savePins('probe');
  await data.reloadTodos();
  assert.equal(BUILT, 0, 'no gesture builds its own client');
  assert.equal(data.regGH(), first, 'and they all share the one the writes cache their shas on');
});

// ── urgent ───────────────────────────────────────────────────────────────────
// The one flag the list carries. Written only when set and deleted when
// cleared, so "never urgent" and "no longer urgent" read identically in the
// file and the shape stays the smallest thing that works.
test('toggleUrgent sets the flag, and clearing it removes the key', async () => {
  SAVES = [];
  data.todoItems = [{ id: 't1', text: 'Internal allotment by August 15', done: false, created_at: '2026-08-06T00:00:00Z' }];
  const it = data.todoItems[0];

  await data.toggleUrgent(it);
  assert.equal(it.urgent, true);
  assert.equal(SAVES.at(-1).value.items[0].urgent, true);
  assert.match(SAVES.at(-1).message, /^Flag "Internal allotment by August 15" urgent via show-repo$/);

  await data.toggleUrgent(it);
  assert.equal('urgent' in it, false, 'cleared means absent, not false');
  assert.match(SAVES.at(-1).message, /^Clear urgent on "Internal allotment by August 15" via show-repo$/);
});

test('urgent items sort above the rest, keeping file order within each band', () => {
  data.todoItems = [
    { id: 'a', text: 'a', done: false },
    { id: 'b', text: 'b', done: false, urgent: true },
    { id: 'c', text: 'c', done: true, urgent: true },   // done, so not in the open list at all
    { id: 'd', text: 'd', done: false },
    { id: 'e', text: 'e', done: false, urgent: true },
  ];
  assert.deepEqual([...data.todoOpen.map(i => i.id)], ['b', 'e', 'a', 'd']);
  assert.deepEqual([...data.todoUrgent.map(i => i.id)], ['b', 'e'],
    'the count covers open items only: a done item is not urgent');
});

// A long text is clipped in the subject the same way every other gesture clips
// it, so the file's history stays readable as a log.
test('a long to-do is clipped in the urgent commit message', async () => {
  SAVES = [];
  data.todoItems = [{ id: 't1', text: 'y'.repeat(100), done: false }];
  await data.toggleUrgent(data.todoItems[0]);
  assert.match(SAVES.at(-1).message, /^Flag "y{59}…" urgent via show-repo$/);
});

// The pane must not be the only thing that can write this field: the file is
// hand-editable and an agent session drains it, and the savers write the parsed
// items straight back. This is the property that made `urgent` possible to add
// without a migration, so it is worth holding.
test('a key the pane does not know survives a round trip', async () => {
  SAVES = [];
  FILES = { 'lists/todo.json': { items: [{ id: 't1', text: 'x', done: false, due: '2026-08-15', urgent: true }] } };
  await data.loadTodos(reg());
  await data.toggleTodo(data.todoItems[0]);
  const saved = SAVES.at(-1).value.items[0];
  assert.equal(saved.due, '2026-08-15', 'an unrecognized field is preserved');
  assert.equal(saved.urgent, true);
  assert.equal(saved.done, true);
});

test('swapping the registry repo or the token gets a new client', () => {
  const before = data.regGH();
  window.TOKEN = 'different';
  const after = data.regGH();
  assert.notEqual(after, before, 'a new token must not write through the old identity');
  window.TOKEN = 'tkn';
});
