// The Sessions pane's tree: which branch nests under which act.
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
// `ended` defaults to the start, so a fixture that says nothing about time
// still orders by the day it names. The tests that care state both.
const record = (id, { agent = '', repos = [], day = '2026-08-10',
                      started = day + 'T00:00:00Z', ended = '' } = {}) =>
  ({ id, agent, day, started, ended: ended || started, repos, mins: 10, ask: 'do a thing',
     branches: repos.map(r => r.branch).filter(Boolean) });

const set = (branches, records) => {
  data.activity = activity(branches);
  data.sessionRows_ = records;
  // The pane opens on Day and the fixtures are dated, so every test states the
  // scope it means rather than inheriting one that would empty the list.
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
};
const nodeFor = (id) => data.sessionTree.nodes.find(n => n.id === id);

test('a branch nests under the record its commit trailer names', () => {
  set([branch('feature', { sessions: [SESS('AAA')] })],
      [record('rec1', { agent: SESS('AAA') })]);
  assert.equal(nodeFor('rec1').children.map(b => b.name).join(), 'feature');
  assert.equal(data.sessionTree.stats.viaAgent, 1);
});

test('a record with no session id of its own is still reached by branch name', () => {
  // 44 of 142 real records predate the agent field. Without this fallback the
  // tree would show them as sessions that committed nothing.
  set([branch('feature')],
      [record('rec1', { repos: [{ name: 'widget', branch: 'feature' }] })]);
  assert.equal(nodeFor('rec1').children.map(b => b.name).join(), 'feature');
  assert.equal(data.sessionTree.stats.viaName, 1);
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
  const stubs = data.sessionTree.nodes.filter(n => n.kind === 'stub');
  assert.equal(stubs.length, 1);
  assert.equal(stubs[0].children.map(b => b.name).sort().join(), 'a,b');
  assert.equal(stubs[0].url, SESS('GHOST'));
});

test('a branch no key reaches is an orphan, and is counted rather than dropped', () => {
  set([branch('hand-made')], []);
  assert.equal(data.sessionTree.orphans.map(b => b.name).join(), 'hand-made');
  assert.equal(data.sessionTree.stats.orphan, 1);
  assert.equal(data.sessionTree.stats.placed, 0);
});

test('every branch row is either placed or an orphan', () => {
  set([branch('a', { sessions: [SESS('AAA')] }), branch('b'), branch('c', { sessions: [SESS('GHOST')] })],
      [record('rec1', { agent: SESS('AAA') })]);
  const st = data.sessionTree.stats;
  assert.equal(st.rows, 3);
  assert.equal(st.placed + st.orphan, st.rows);
  assert.equal(st.viaAgent + st.viaName + st.stub, st.placed);
});

test('a branch worked across two sessions keeps both, so the row can mark it', () => {
  set([branch('long', { sessions: [SESS('NEW'), SESS('OLD')] })],
      [record('rec1', { agent: SESS('NEW') })]);
  assert.equal(nodeFor('rec1').children[0].sessions.length, 2);
});

test('a record whose branches are outside the crawl window still gets a row', () => {
  // The row says "no branch in the crawl's window" rather than vanishing: a
  // session that committed nothing and a session whose branches are too old to
  // have been crawled are both here, and neither is silently dropped.
  set([], [record('rec1', { agent: SESS('AAA') })]);
  assert.equal(nodeFor('rec1').children.length, 0);
  assert.equal(data.sessionNodes.length, 1);
});

test('the list holds records and stubs together, newest first', () => {
  set([branch('a', { sessions: [SESS('AAA')] }), branch('b', { sessions: [SESS('GHOST')] })],
      [record('rec1', { agent: SESS('AAA') }), record('quiet')]);
  const kinds = data.sessionNodes.map(n => n.kind).sort().join();
  assert.equal(data.sessionNodes.length, 3);   // two records plus one stub
  assert.equal(kinds, 'record,record,stub');
});

test('Snagged is about a record, so a stub is not in it', () => {
  // "No failures" and "no record of failures" are different answers, and only
  // one of them is about the session.
  set([branch('a', { sessions: [SESS('GHOST')] })],
      [record('rec1', { agent: SESS('AAA'), }), ]);
  data.sessionRows_ = [{ ...record('rec1', { agent: SESS('AAA') }), failures: 3 }];
  data.sessionScope = 'failed';
  assert.equal(data.sessionNodes.length, 1);
  assert.equal(data.sessionNodes[0].kind, 'record');
});

test('the repo chip reaches a node through its branches, not only its checkouts', () => {
  // The flat list could only filter by the repos a record named as a working
  // directory. A branch in a repo the record never chdir-ed into still belongs
  // to that repo, and the chip now says so.
  set([branch('a', { sessions: [SESS('AAA')] })],
      [record('rec1', { agent: SESS('AAA'), repos: [{ name: 'elsewhere', branch: 'other' }] })]);
  data.sessionRepoFilter = 'widget';
  assert.equal(data.sessionNodes.length, 1);
});

test('a nested branch carries its open PR, so the row can state it', () => {
  data.activity = {
    'acme/widget': { defaultBranch: 'main',
                     openPRs: [{ number: 7, head: 'open-one' }],
                     scan: { branches: [branch('open-one', { sessions: [SESS('AAA')] }),
                                        branch('done', { sessions: [SESS('BBB')] })] } },
  };
  data.sessionRows_ = [record('live', { agent: SESS('AAA') }), record('shipped', { agent: SESS('BBB') })];
  data.sessionScope = 'all';
  assert.equal(nodeFor('live').children[0].pr.number, 7);
  assert.equal(nodeFor('shipped').children[0].pr, null);
});

test('nodes are newest first and a stub is dated by its newest branch', () => {
  set([branch('old', { sessions: [SESS('GHOST')], date: '2026-08-01' }),
       branch('new', { sessions: [SESS('GHOST')], date: '2026-08-12' })],
      [record('rec1', { agent: SESS('ZZZ'), day: '2026-08-05' })]);
  const stub = data.sessionTree.nodes.find(n => n.kind === 'stub');
  assert.equal(stub.day, '2026-08-12');
  assert.equal(data.sessionTree.nodes[0].key, stub.key);        // 08-12 leads 08-05
  assert.equal(stub.children.map(b => b.name).join(), 'new,old');
});

// The order is by LAST ACTIVITY at full precision, which is the fix for what
// the pane did on 2026-09-04: three sessions of one day, and the one holding
// the most recent activity in the whole cache sat second because it had opened
// 34 minutes later than the row above it. Two separate defects produced that.
//
// The sort read `started`, so a long session still being worked ranked below a
// short one that opened later and had already stopped. And it compared at DAY
// precision, so every row of one day tied and their order fell to Map
// insertion order, which loads all records before any stub: a stub could not
// outrank a record of the same day whatever its clock said.
test('same-day rows order by last activity, not by start and not by insertion', () => {
  set([branch('ghost', { sessions: [SESS('GHOST')], date: '2026-08-10T18:00:00Z' })],
      // `early` opens first and is still going at 20:00; `late` opens after it
      // and is finished by 13:00. Sorting on `started` puts them the other way.
      [record('late',  { agent: SESS('L'), day: '2026-08-10',
                         started: '2026-08-10T12:00:00Z', ended: '2026-08-10T13:00:00Z' }),
       record('early', { agent: SESS('E'), day: '2026-08-10',
                         started: '2026-08-10T09:00:00Z', ended: '2026-08-10T20:00:00Z' })]);
  assert.equal(data.sessionTree.nodes.map(n => n.id).join(','), 'early,GHOST,late');
});

// A record and a stub are measured against the same clock. The stub's is its
// newest commit, which is the only evidence a session with no record leaves.
test('a stub carries a full timestamp, and its day still reads as a day', () => {
  set([branch('a', { sessions: [SESS('GHOST')], date: '2026-08-12T07:30:00Z' })],
      [record('rec1', { agent: SESS('ZZZ'), day: '2026-08-05' })]);
  const stub = data.sessionTree.nodes.find(n => n.kind === 'stub');
  assert.equal(stub.at, '2026-08-12T07:30:00Z');
  assert.equal(stub.day, '2026-08-12', 'the row still displays a plain day');
});

// The scopes read the same key as the sort. A session that opened 26 hours ago
// and was worked ten minutes ago belongs in Day; reading `started` dropped it
// out of every scope narrower than the one its FIRST turn fell in, which on
// 2026-09-04 was three of the twelve sessions the pane had that day.
test('a time scope counts last activity, not the opening turn', () => {
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  set([], [record('longrunner', { agent: SESS('A'), day: ago(26).slice(0, 10),
                                  started: ago(26), ended: ago(0.2) })]);
  data.sessionScope = 'day';
  assert.equal(data.sessionNodes.map(n => n.id).join(','), 'longrunner');
  assert.equal(data.sessionScopes.find(s => s.key === 'day').count, 1);
});

// The standing "N of M branches placed" label is retired: it explained the
// machinery of the join to a reader who came to see what they had been working
// on. The sentence survives in the Counts lens, where the histograms it
// annotates are the join, so what is held here is the sentence's arithmetic.
test('the join note states what it could not place', () => {
  set([branch('a', { sessions: [SESS('AAA')] }), branch('b')],
      [record('rec1', { agent: SESS('AAA') })]);
  assert.equal(data.sessionJoinLabel, undefined);
  assert.match(data.sessionJoinNote, /1 branches reach a session record through the record's own session URL/);
  assert.match(data.sessionJoinNote, /1 reach no session at all/);
});


// ── The rail: what came of a session ────────────────────────────────────────
// The card's 4px stripe carried the failure count until 2026-08-27, which is a
// fact about how the run went while the question a list is scanned with is what
// came of the work. It now takes the ROLLUP of the branches nested under it, in
// the same five-state palette every branch row and branch tile already uses, and
// the failure signal moved to the fill so both survive.

// A PR index beside the branch list, which is where branchState() reads from:
// `openPRs` is the open one and `branchPRs` is whatever became of it. Same two
// maps allBranchRows builds, so a fixture here is a fixture of the real shape.
const withPRs = (branches, records, { openPRs = [], branchPRs = [] } = {}) => {
  data.activity = { 'acme/widget': { defaultBranch: 'main', scan: { branches },
                                     openPRs, branchPRs, prReach: '' } };
  data.sessionRows_ = records;
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
};
const on = (name) => [{ name: 'widget', branch: name }];

test('the rail rolls its branches up, live work first', () => {
  // A session that left something open is a session with work in flight, and
  // that is what a list is scanned for. Merged only after that: most sessions
  // here are finished, and a list whose common case is loudest says nothing.
  withPRs([branch('a'), branch('b')],
          [record('r', { repos: [...on('a'), ...on('b')] })],
          { openPRs: [{ number: 9, head: 'b', draft: false }],
            branchPRs: [{ number: 1, head: 'a', state: 'merged' },
                        { number: 9, head: 'b', state: 'open' }] });
  assert.equal(data.sessionOutcome(nodeFor('r')), 'ready',
    'one open PR outranks any number of merged branches');
  assert.match(data.sessionAccent(nodeFor('r')), /border-success/);
});

test('a session whose branches all merged reads as shipped, not as live', () => {
  withPRs([branch('a'), branch('b')],
          [record('r', { repos: [...on('a'), ...on('b')] })],
          { branchPRs: [{ number: 1, head: 'a', state: 'merged' },
                        { number: 2, head: 'b', state: 'merged' }] });
  assert.equal(data.sessionOutcome(nodeFor('r')), 'merged');
  // Violet, the one hue three vocabularies already agree on for merged: Claude
  // Code's own session list, GitHub, and the conventions' closing state.
  assert.match(data.sessionAccent(nodeFor('r')), /border-secondary/);
});

test('closed-unmerged is its own state, and does not read as shipped', () => {
  withPRs([branch('a')], [record('r', { repos: on('a') })],
          { branchPRs: [{ number: 1, head: 'a', state: 'closed' }] });
  assert.equal(data.sessionOutcome(nodeFor('r')), 'closed');
  assert.match(data.sessionAccent(nodeFor('r')), /border-error/);
});

test('a draft is in flight, but yields to a PR that is ready', () => {
  withPRs([branch('a'), branch('b')],
          [record('r', { repos: [...on('a'), ...on('b')] })],
          { openPRs: [{ number: 1, head: 'a', draft: true },
                      { number: 2, head: 'b', draft: false }] });
  assert.equal(data.sessionOutcome(nodeFor('r')), 'ready');
  withPRs([branch('a')], [record('r', { repos: on('a') })],
          { openPRs: [{ number: 1, head: 'a', draft: true }] });
  assert.equal(data.sessionOutcome(nodeFor('r')), 'draft');
  assert.match(data.sessionAccent(nodeFor('r')), /border-warning/);
});

test('a session that left no branch with a PR behind it takes no hue', () => {
  withPRs([branch('a')], [record('r', { repos: on('a') })]);
  assert.equal(data.sessionOutcome(nodeFor('r')), 'none');
  assert.match(data.sessionAccent(nodeFor('r')), /border-base-300/);
});

test('a stub is dashed: an absence of knowledge, not an outcome', () => {
  // The same treatment branchAccent gives `unknown`, for the same reason. A
  // stub is a session named by a commit trailer with no record behind it, so
  // there is nothing to say about how it went.
  withPRs([branch('a', { sessions: [SESS('GHOST')] })], []);
  const stub = data.sessionTree.nodes.find(n => n.kind === 'stub');
  assert.equal(data.sessionOutcome(stub), 'stub');
  assert.match(data.sessionAccent(stub), /border-dashed/);
});

test('failures ride the fill, so a snagged session that shipped reads as both', () => {
  // Two axes, two carriers. Collapsing them was the old behaviour and it meant
  // a session that hit one failing tool call could not also say its work landed.
  withPRs([branch('a')],
          [{ ...record('r', { repos: on('a') }), failures: 3 }],
          { branchPRs: [{ number: 1, head: 'a', state: 'merged' }] });
  const cls = data.sessionAccent(nodeFor('r'));
  assert.match(cls, /border-secondary/, 'the outcome keeps the rail');
  assert.match(cls, /bg-warning\/10/, 'the failures take the fill');
  // ONLY MULTIPLES OF TEN: /5, /15, /25 and /45 compute to transparent against
  // this app's stylesheet, so a step the build does not generate renders the
  // opposite of the intent rather than nothing.
  assert.ok(!/bg-warning\/(5|15|25|45)\b/.test(cls), cls);
  assert.match(data.sessionOutcomeNote(nodeFor('r')), /3 tool calls failed/);
});

test('the outcome is named in words, not left to the colour alone', () => {
  withPRs([branch('a')], [record('r', { repos: on('a') })],
          { branchPRs: [{ number: 1, head: 'a', state: 'merged' }] });
  assert.match(data.sessionOutcomeNote(nodeFor('r')), /shipped/);
  // Every state the rollup can return has a sentence; a hue with no legend is
  // the failure this note exists to avoid.
  for (const k of ['ready', 'draft', 'merged', 'closed', 'none', 'stub'])
    assert.ok(data.SESSION_OUTCOME_NOTE[k], `${k} has no note`);
});

// ── The deck's sequence ─────────────────────────────────────────────────────

test('the session deck swipes the records the list is showing, stubs excluded', () => {
  // A stub has no record, so there is nothing for a brief to read and an empty
  // slide would be worse than a shorter sequence.
  withPRs([branch('a', { sessions: [SESS('GHOST')] })],
          [record('r1', { agent: SESS('AAA') }), record('r2', { agent: SESS('BBB') })]);
  // Joined rather than deep-compared: Alpine hands back reactive proxies, which
  // are structurally equal to a plain array and never reference-equal.
  assert.equal(data.sessionDeckRows.map(r => r.id).sort().join(','), 'r1,r2');
  assert.ok(data.sessionTree.nodes.some(n => n.kind === 'stub'), 'the fixture does hold a stub');
});
