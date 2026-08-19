// What became of a branch's pull request, across the three layers that carry
// the answer.
//
// The Activity view's Branches pane labelled every row "no PR" unless the
// branch had an OPEN pull request, so a branch whose PR had merged (nearly the
// whole recent window, since branches are not deleted here) read as though it
// had never been proposed at all. The states are now distinct: open (draft or
// ready), merged, closed unmerged, never proposed, and not known.
//
//   gh-fetch.js               branchPulls() reads any-state PRs in one call and
//                             folds them to the newest per head, with a `reach`
//                             saying how far back that read got.
//   repo-activity-cache.js    the index survives a merge and rides the hash, so
//                             a PR merging actually commits.
//   estate.js                 branchState / rowPR / prIndexCovers turn it into
//                             the row's pill, accent, and menu.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow, startAlpine } from './bootstrap.mjs';

// ── the fetch layer ─────────────────────────────────────────────────────────
// Same bare-window load as estate-branch-sessions: gh-fetch.js wants only
// window.GH to hang its prototype on.

const fetchSrc = readFileSync(path.join(repoRoot, 'lib/gh-fetch.js'), 'utf8');
function loadFetch() {
  function GH() {}
  GH.prototype = {};
  const win = { GH };
  new Function('window', fetchSrc)(win);
  return win.GH;
}
const GH = loadFetch();

// A PR as the list endpoint returns it, trimmed to the fields branchPulls reads.
const raw = (number, head, state, { merged = false, draft = false, at = '2026-08-15T00:00:00Z' } = {}) => ({
  number, head: { ref: head }, state, draft,
  merged_at: merged ? at : null, updated_at: at,
});
const fakeGH = (list, capture = {}) => {
  const gh = Object.create(GH.prototype);
  gh.req = async (p) => { capture.path = p; return list; };
  return gh;
};

test('branchPulls asks for every state, newest activity first', async () => {
  const seen = {};
  await fakeGH([], seen).branchPulls(100);
  assert.match(seen.path, /^pulls\?state=all&sort=updated&direction=desc&per_page=100$/);
});

test('a merged PR is its own state, not just closed', async () => {
  const { rows } = await fakeGH([
    raw(425, 'claude/centralize', 'closed', { merged: true }),
    raw(400, 'claude/abandoned', 'closed'),
    raw(430, 'claude/live', 'open', { draft: true }),
  ]).branchPulls();
  assert.deepEqual(rows.map(r => [r.head, r.state, r.draft]), [
    ['claude/centralize', 'merged', false],
    ['claude/abandoned', 'closed', false],
    ['claude/live', 'open', true],
  ]);
});

test('a head with several PRs keeps the newest and counts the rest', async () => {
  // The real shape behind this whole fix: one long-lived branch, three merged
  // PRs over its life (web-tools #416, #427, #428 on note-taking-sidebar-issues).
  const { rows } = await fakeGH([
    raw(428, 'claude/notes', 'closed', { merged: true }),
    raw(427, 'claude/notes', 'closed', { merged: true }),
    raw(416, 'claude/notes', 'closed', { merged: true }),
  ]).branchPulls();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, 428);
  assert.equal(rows[0].count, 3);
});

test('the newest wins even when the page arrives out of order', async () => {
  const { rows } = await fakeGH([
    raw(416, 'claude/notes', 'closed', { merged: true }),
    raw(428, 'claude/notes', 'open'),
  ]).branchPulls();
  assert.equal(rows[0].number, 428);
  assert.equal(rows[0].state, 'open');
  assert.equal(rows[0].count, 2);
});

test('reach is empty when the read was not capped, and dated when it was', async () => {
  const under = await fakeGH([raw(1, 'a', 'open')]).branchPulls(10);
  assert.equal(under.reach, '');
  const capped = await fakeGH([
    raw(3, 'c', 'open', { at: '2026-08-15T00:00:00Z' }),
    raw(2, 'b', 'closed', { at: '2026-08-10T00:00:00Z' }),
    raw(1, 'a', 'closed', { merged: true, at: '2026-08-01T00:00:00Z' }),
  ]).branchPulls(3);
  assert.equal(capped.reach, '2026-08-01T00:00:00Z');
});

test('a PR from a deleted fork with no head ref is skipped, not counted', async () => {
  const { rows } = await fakeGH([{ number: 9, state: 'open', head: null, updated_at: '' }]).branchPulls();
  assert.deepEqual(rows, []);
});

// ── the cache layer ─────────────────────────────────────────────────────────

const cacheSrc = readFileSync(path.join(repoRoot, 'lib/kits/repo-activity-cache.js'), 'utf8');
function loadCache() {
  const win = {};
  new Function('window', cacheSrc)(win);
  return win.RepoActivityCache;
}
const A = loadCache();
const NOW = '2026-08-15T12:00:00Z';
const entryWith = (branchPRs, prReach = '') =>
  A.mergeRepo(null, { defaultBranch: 'main', branchPRs, prReach, counts: {} }, NOW);

test('a PR merging changes the entry hash', () => {
  // Nothing else about the branch moves when its PR merges: same sha, same
  // group, same dates. Without the index in the hash the crawl would find the
  // merge and decline to commit it.
  const open = entryWith([{ head: 'f', number: 5, state: 'open', draft: false, count: 1 }]);
  const merged = entryWith([{ head: 'f', number: 5, state: 'merged', draft: false, count: 1 }]);
  assert.notEqual(open.hash, merged.hash);
});

test('PR activity that the row does not show does not restamp the cache', () => {
  const a = entryWith([{ head: 'f', number: 5, state: 'open', draft: false, count: 1, updatedAt: '2026-08-15T01:00:00Z' }]);
  const b = entryWith([{ head: 'f', number: 5, state: 'open', draft: false, count: 1, updatedAt: '2026-08-15T09:00:00Z' }]);
  assert.equal(a.hash, b.hash);
});

test('a crawl that could not read the index keeps the prior one', () => {
  const prev = entryWith([{ head: 'f', number: 5, state: 'merged', draft: false, count: 1 }], '2026-08-01T00:00:00Z');
  const next = A.mergeRepo(prev, { defaultBranch: 'main', counts: {} }, NOW);
  assert.equal(next.branchPRs.length, 1);
  assert.equal(next.prReach, '2026-08-01T00:00:00Z');
});

test('a crawl that read it replaces it whole, reach included', () => {
  const prev = entryWith([{ head: 'gone', number: 1, state: 'open', draft: false, count: 1 }], '2026-08-01T00:00:00Z');
  const next = A.mergeRepo(prev, { defaultBranch: 'main', counts: {}, branchPRs: [], prReach: '' }, NOW);
  assert.deepEqual(next.branchPRs, []);
  assert.equal(next.prReach, '');
});

// ── the row layer ───────────────────────────────────────────────────────────

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

// One repo's cached activity. `branches` are scan rows, `openPRs` the open
// list, `branchPRs` the any-state index the crawl now stores beside it.
const seed = ({ branches = [], openPRs = [], branchPRs = [], prReach = '' }) => {
  data.activity = { 'acme/widget': {
    defaultBranch: 'main', openPRs, branchPRs, prReach, scan: { branches },
  } };
  // All, not Recent: these rows carry no dates, and the scope axis is not what
  // is under test here.
  data.branchScope = 'all';
};
const row = (name) => data.openRows.find(r => r.name === name);

test('a merged branch reads merged, not "no PR"', () => {
  // The reported bug, at row level: the branch is in the scan, its PR is
  // gone from the open list because it merged, and the row used to say the
  // branch had never had one.
  seed({
    branches: [{ name: 'claude/centralize', group: 'active', date: '2026-08-15T09:00:00Z' }],
    openPRs: [],
    branchPRs: [{ head: 'claude/centralize', number: 425, state: 'merged', draft: false, count: 1 }],
  });
  const r = row('claude/centralize');
  assert.equal(data.branchState(r), 'merged');
  assert.equal(data.rowPR(r).number, 425);
  // Secondary, not primary: merged is violet as of 2026-08-16, matching Claude
  // Code's session list, GitHub, and the conventions' 🟣 closing state.
  assert.match(data.branchAccent(r), /secondary/);
});

test('a closed-unmerged branch is a state of its own', () => {
  seed({
    branches: [{ name: 'claude/zombie', group: 'stranded' }],
    branchPRs: [{ head: 'claude/zombie', number: 300, state: 'closed', draft: false, count: 1 }],
  });
  assert.equal(data.branchState(row('claude/zombie')), 'closed');
  assert.match(data.branchAccent(row('claude/zombie')), /error/);
});

test('an open PR still outranks the index, draft and ready alike', () => {
  seed({
    branches: [{ name: 'claude/live', group: 'active' }, { name: 'claude/ready', group: 'active' }],
    openPRs: [{ number: 430, head: 'claude/live', draft: true },
              { number: 431, head: 'claude/ready', draft: false }],
    branchPRs: [{ head: 'claude/live', number: 430, state: 'open', draft: true, count: 1 },
                { head: 'claude/ready', number: 431, state: 'open', draft: false, count: 1 }],
  });
  assert.equal(data.branchState(row('claude/live')), 'draft');
  assert.equal(data.branchState(row('claude/ready')), 'ready');
  // The scope axis still means OPEN work, which is the open PR and not the row's
  // last one: a merged branch must not leak into the Open scope.
  assert.equal(row('claude/live').pr.number, 430);
});

test('a merged branch does not count as open work', () => {
  seed({
    branches: [{ name: 'claude/merged', group: 'active' }],
    branchPRs: [{ head: 'claude/merged', number: 425, state: 'merged', draft: false, count: 1 }],
  });
  data.branchScope = 'open';
  assert.equal(data.openRows.length, 0);
});

test('inside the index reach an unmatched branch really has no PR', () => {
  seed({
    branches: [{ name: 'scratch', group: 'active', date: '2026-08-14T00:00:00Z' }],
    branchPRs: [{ head: 'other', number: 1, state: 'merged', draft: false, count: 1 }],
    prReach: '2026-08-01T00:00:00Z',
  });
  assert.equal(data.branchState(row('scratch')), 'nopr');
});

test('past the reach it says it does not know, rather than "no PR"', () => {
  seed({
    branches: [{ name: 'ancient', group: 'landed', date: '2026-05-01T00:00:00Z' }],
    branchPRs: [{ head: 'other', number: 1, state: 'merged', draft: false, count: 1 }],
    prReach: '2026-08-01T00:00:00Z',
  });
  assert.equal(data.branchState(row('ancient')), 'unknown');
});

test('nopr and unknown do not render as the same row', () => {
  // Both rails are plain, which is right: neither state is an outcome. But
  // they are different CLAIMS, and until 2026-08-16 branchAccent collapsed
  // them into one string, so the distinction the two tests above defend died
  // at the last step before the reader. The dashed rail is what carries it.
  seed({
    branches: [{ name: 'scratch', group: 'active', date: '2026-08-14T00:00:00Z' },
               { name: 'ancient', group: 'landed', date: '2026-05-01T00:00:00Z' }],
    branchPRs: [{ head: 'other', number: 1, state: 'merged', draft: false, count: 1 }],
    prReach: '2026-08-01T00:00:00Z',
  });
  const nopr = data.branchAccent(row('scratch'));
  const unknown = data.branchAccent(row('ancient'));
  assert.notEqual(nopr, unknown);
  assert.match(unknown, /border-dashed/);
  assert.doesNotMatch(nopr, /border-dashed/);
});

test('a cache written before the index existed claims nothing either way', () => {
  seed({ branches: [{ name: 'old-cache-row', group: 'active', date: '2026-08-14T00:00:00Z' }] });
  assert.equal(data.branchState(row('old-cache-row')), 'unknown');
});

test('an uncapped read speaks for every branch, however old', () => {
  seed({
    branches: [{ name: 'ancient', group: 'landed', date: '2020-01-01T00:00:00Z' }],
    branchPRs: [{ head: 'other', number: 1, state: 'merged', draft: false, count: 1 }],
    prReach: '',
  });
  assert.equal(data.branchState(row('ancient')), 'nopr');
});

test('the Abandoned scope collects closed-unmerged branches at any age', () => {
  seed({
    branches: [
      { name: 'claude/dropped', group: 'stranded', date: '2026-05-01T00:00:00Z' },
      { name: 'claude/also-dropped', group: 'active', date: '2026-08-14T00:00:00Z' },
      { name: 'claude/merged', group: 'active', date: '2026-08-14T00:00:00Z' },
      { name: 'claude/never', group: 'active', date: '2026-08-14T00:00:00Z' },
    ],
    branchPRs: [
      { head: 'claude/dropped', number: 300, state: 'closed', draft: false, count: 1 },
      { head: 'claude/also-dropped', number: 426, state: 'closed', draft: true, count: 1 },
      { head: 'claude/merged', number: 425, state: 'merged', draft: false, count: 1 },
    ],
  });
  data.branchScope = 'abandoned';
  // Round-tripped: the rows are Alpine proxies built in the jsdom realm, so a
  // structurally-identical array still fails a strict deepEqual on prototype.
  assert.deepEqual(JSON.parse(JSON.stringify(data.openRows.map(r => r.name).sort())),
                   ['claude/also-dropped', 'claude/dropped']);
});

test('Abandoned is a chip with its own count, beside the scan groups', () => {
  seed({
    branches: [{ name: 'claude/dropped', group: 'stranded' }, { name: 'claude/merged', group: 'active' }],
    branchPRs: [{ head: 'claude/dropped', number: 300, state: 'closed', draft: false, count: 1 },
                { head: 'claude/merged', number: 425, state: 'merged', draft: false, count: 1 }],
  });
  const chip = data.branchScopes.find(s => s.key === 'abandoned');
  assert.equal(chip.count, 1);
  // A stranded branch that was abandoned is in both scopes, which is the point:
  // the content scan says its bytes are nowhere, the PR says nobody wants them.
  assert.equal(data.branchScopes.find(s => s.key === 'stranded').count, 1);
});

test('the card badge counts what the chip counts, from one derivation', () => {
  // The trap this avoids: counting abandoned branches in the crawl, over the
  // full branch list, would give the card a larger number than the pane's chip
  // for the same word, and a card saying 5 beside a chip saying 2 makes a
  // reader distrust both.
  seed({
    branches: [{ name: 'claude/dropped', group: 'stranded' },
               { name: 'claude/also-dropped', group: 'active' },
               { name: 'claude/merged', group: 'active' }],
    branchPRs: [{ head: 'claude/dropped', number: 300, state: 'closed', draft: false, count: 1 },
                { head: 'claude/also-dropped', number: 301, state: 'closed', draft: false, count: 1 },
                { head: 'claude/merged', number: 425, state: 'merged', draft: false, count: 1 }],
  });
  assert.equal(data.cardAbandoned('acme/widget'), 2);
  assert.equal(data.branchScopes.find(s => s.key === 'abandoned').count, 2);
  // A repo with none gets no badge at all, rather than a zero.
  assert.equal(data.cardAbandoned('acme/other'), 0);
});

test('the badge opens the pane already narrowed to what it counted', () => {
  // The Branches pill retired on 2026-08-19 and its list became a lens of the
  // Sessions pane, so the jump lands there with the lens already switched. The
  // scope and repo narrowing are unchanged: a badge that counts two abandoned
  // branches has to open on those two.
  seed({
    branches: [{ name: 'claude/dropped', group: 'stranded' }],
    branchPRs: [{ head: 'claude/dropped', number: 300, state: 'closed', draft: false, count: 1 }],
  });
  const went = [];
  window.__shell.goSessions = () => went.push('sessions');
  data.openAbandoned('acme/widget');
  assert.equal(data.branchScope, 'abandoned');
  assert.equal(data.openRepoFilter, 'acme/widget');
  assert.equal(data.sessionLens, 'branches');
  assert.deepEqual(went, ['sessions']);
});

test('the row menu reaches a merged PR, and still offers a new one', () => {
  seed({
    branches: [{ name: 'claude/merged', group: 'active' }],
    branchPRs: [{ head: 'claude/merged', number: 425, state: 'merged', draft: false, count: 1 }],
  });
  data.menuBranch = row('claude/merged');
  const keys = data.branchMenuItems.map(i => i.key);
  assert.ok(keys.includes('prFiles'), 'a merged PR has files worth reading');
  assert.ok(keys.includes('newPr'), 'a branch with no OPEN PR can still open one');
});
