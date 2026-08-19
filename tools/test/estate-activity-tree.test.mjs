// The Activity pane's session-first tree: which branch nests under which act.
//
// Two caches meet here and neither can place every row on its own, so the join
// is the thing under test rather than the markup. Three ways a branch reaches a
// session, in this order:
//
//   agent   the branch's Claude-Session commit trailer matches a record's own
//           `agent` (the harness session URL). Exact, and the only key that
//           survives a branch being renamed or a session touching several.
//   name    no trailer match, but a record names this repo and branch as a
//           checkout it worked in. The fallback that carries every record
//           written before the recorder learned its own session id.
//   stub    a trailer nobody holds a record for. It still names an act, so the
//           branch nests under a stub node rather than being dropped.
//
// What none of the three reaches is an orphan, and the pane says so out loud.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

class StubGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async get() { throw new Error('404'); }
  async ls() { throw new Error('404'); }
  async req() { return { default_branch: 'main', description: '', private: true, pushed_at: '' }; }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = StubGH;
window.__shell = { REGISTRY_REPO: 'me/registry', DEFAULT_REPO: 'me/tools',
                   quickLinks: [], hasToken: () => true, _authState: 'auth' };

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/branch-status.js',
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));

const SESS = (id) => `https://claude.ai/code/session_${id}`;

// One repo's cached branch rollup, in the shape allBranchRows reads.
const activity = (branches) => ({ 'acme/widget': { defaultBranch: 'main', scan: { branches } } });
const branch = (name, extra = {}) =>
  ({ name, group: 'active', date: '2026-08-10', ...extra });
// A session record, in the shape the sessions cache folds.
const record = (id, { agent = '', repos = [], day = '2026-08-10' } = {}) =>
  ({ id, agent, day, started: day + 'T00:00:00Z', repos, mins: 10, ask: 'do a thing',
     branches: repos.map(r => r.branch).filter(Boolean) });

const set = (branches, records) => {
  data.activity = activity(branches);
  data.sessionRows_ = records;
};
const nodeFor = (id) => data.actTree.nodes.find(n => n.id === id);

test('a branch nests under the record its commit trailer names', () => {
  set([branch('feature', { sessions: [SESS('AAA')] })],
      [record('rec1', { agent: SESS('AAA') })]);
  assert.equal(nodeFor('rec1').children.map(b => b.name).join(), 'feature');
  assert.equal(data.actTree.stats.viaAgent, 1);
});

test('a record with no session id of its own is still reached by branch name', () => {
  // 44 of 142 real records predate the agent field. Without this fallback the
  // tree would show them as sessions that committed nothing.
  set([branch('feature')],
      [record('rec1', { repos: [{ name: 'widget', branch: 'feature' }] })]);
  assert.equal(nodeFor('rec1').children.map(b => b.name).join(), 'feature');
  assert.equal(data.actTree.stats.viaName, 1);
});

test('the trailer wins over the name when the two disagree', () => {
  set([branch('feature', { sessions: [SESS('AAA')] })],
      [record('byName', { repos: [{ name: 'widget', branch: 'feature' }] }),
       record('byAgent', { agent: SESS('AAA') })]);
  assert.equal(nodeFor('byAgent').children.map(b => b.name).join(), 'feature');
  assert.equal(nodeFor('byName').children.length, 0);
});

test('a trailer with no record behind it becomes one stub, not one per branch', () => {
  set([branch('a', { sessions: [SESS('GHOST')] }), branch('b', { sessions: [SESS('GHOST')] })], []);
  const stubs = data.actTree.nodes.filter(n => n.kind === 'stub');
  assert.equal(stubs.length, 1);
  assert.equal(stubs[0].children.map(b => b.name).sort().join(), 'a,b');
  assert.equal(stubs[0].url, SESS('GHOST'));
});

test('a branch no key reaches is an orphan, and is counted rather than dropped', () => {
  set([branch('hand-made')], []);
  assert.equal(data.actTree.orphans.map(b => b.name).join(), 'hand-made');
  assert.equal(data.actTree.stats.orphan, 1);
  assert.equal(data.actTree.stats.placed, 0);
});

test('every branch row is either placed or an orphan', () => {
  set([branch('a', { sessions: [SESS('AAA')] }), branch('b'), branch('c', { sessions: [SESS('GHOST')] })],
      [record('rec1', { agent: SESS('AAA') })]);
  const st = data.actTree.stats;
  assert.equal(st.rows, 3);
  assert.equal(st.placed + st.orphan, st.rows);
  assert.equal(st.viaAgent + st.viaName + st.stub, st.placed);
});

test('a branch worked across two sessions keeps both, so the row can mark it', () => {
  set([branch('long', { sessions: [SESS('NEW'), SESS('OLD')] })],
      [record('rec1', { agent: SESS('NEW') })]);
  assert.equal(nodeFor('rec1').children[0].sessions.length, 2);
});

test('a record whose branches are outside the crawl window shows as barren, not absent', () => {
  set([], [record('rec1', { agent: SESS('AAA') })]);
  assert.equal(nodeFor('rec1').children.length, 0);
  const barren = data.actScopes.find(s => s.key === 'barren');
  assert.equal(barren.count, 1);
});

test('scope counts split the node list without overlap', () => {
  set([branch('a', { sessions: [SESS('AAA')] }), branch('b', { sessions: [SESS('GHOST')] })],
      [record('rec1', { agent: SESS('AAA') }), record('quiet')]);
  const by = Object.fromEntries(data.actScopes.map(s => [s.key, s.count]));
  assert.equal(by.all, 3);                 // two records plus one stub
  assert.equal(by.record, 2);
  assert.equal(by.stub, 1);
  assert.equal(by.record + by.stub, by.all);
  assert.equal(by.barren, 1);              // the record that committed nothing
});

test('a session holding an open PR is Live; one holding only merged work is not', () => {
  data.activity = {
    'acme/widget': { defaultBranch: 'main',
                     openPRs: [{ number: 7, head: 'open-one' }],
                     scan: { branches: [branch('open-one', { sessions: [SESS('AAA')] }),
                                        branch('done', { sessions: [SESS('BBB')] })] } },
  };
  data.sessionRows_ = [record('live', { agent: SESS('AAA') }), record('shipped', { agent: SESS('BBB') })];
  const by = Object.fromEntries(data.actScopes.map(s => [s.key, s.count]));
  assert.equal(by.live, 1);
  assert.equal(data.actRows.length, 2);    // scope is All by default
});

test('nodes are newest first and a stub is dated by its newest branch', () => {
  set([branch('old', { sessions: [SESS('GHOST')], date: '2026-08-01' }),
       branch('new', { sessions: [SESS('GHOST')], date: '2026-08-12' })],
      [record('rec1', { agent: SESS('ZZZ'), day: '2026-08-05' })]);
  const stub = data.actTree.nodes.find(n => n.kind === 'stub');
  assert.equal(stub.day, '2026-08-12');
  assert.equal(data.actTree.nodes[0].key, stub.key);        // 08-12 leads 08-05
  assert.equal(stub.children.map(b => b.name).join(), 'new,old');
});

test('the join label states what it could not place', () => {
  set([branch('a', { sessions: [SESS('AAA')] }), branch('b')],
      [record('rec1', { agent: SESS('AAA') })]);
  assert.equal(data.actJoinLabel, '1 of 2 branches placed');
  assert.match(data.actJoinNote, /reach no session at all/);
});
