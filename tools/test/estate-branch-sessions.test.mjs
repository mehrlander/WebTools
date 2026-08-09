// Per-branch session links, end to end across the two layers that carry them.
//
// The estate's Open view shows a Claude logomark per branch linking the session
// that authored it. It used to read the session off the open PR body, so it
// could only ever light for a branch with an open PR: 2 of 404 branches in
// mehrlander/home. The source is now the branch's own `Claude-Session:` commit
// trailer, with the PR body kept as a fallback.
//
// Two layers, tested separately:
//   gh-fetch.js  branchSessions() walks each branch's recent commits and returns
//                name -> session URL, in one GraphQL call for the whole repo.
//   estate.js    openBranches attaches it to the row, branch trailer first.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow, startAlpine } from './bootstrap.mjs';

// ── the fetch layer ─────────────────────────────────────────────────────────
// Loaded against a bare window stub rather than jsdom: gh-fetch.js only needs
// window.GH to hang its prototype on, and nothing here touches the DOM.

const fetchSrc = readFileSync(path.join(repoRoot, 'lib/gh-fetch.js'), 'utf8');

function loadFetch() {
  function GH() {}
  GH.prototype = {};
  const win = { GH };
  new Function('window', fetchSrc)(win);
  return win.GH;
}

const GH = loadFetch();
const SESS = (id) => `https://claude.ai/code/session_${id}`;

// A repo whose refs page as GraphQL returns them. `history` is the commit
// bodies newest-first, exactly the field branchSessions reads.
function fakeGH(pages) {
  const gh = Object.create(GH.prototype);
  gh.repo = 'acme/widget';
  let call = 0;
  gh.graphql = async () => {
    const page = pages[call++];
    return { repository: { refs: {
      pageInfo: { hasNextPage: call < pages.length, endCursor: 'c' + call },
      nodes: page.map(([name, bodies]) => ({
        name, target: { history: { nodes: bodies.map(b => ({ messageBody: b })) } },
      })),
    } } };
  };
  return gh;
}

test('sessionIn pulls the trailer out of a commit or PR body', () => {
  assert.equal(GH.sessionIn(`fix the thing\n\nClaude-Session: ${SESS('AAA')}`), SESS('AAA'));
  assert.equal(GH.sessionIn('no session here'), '');
  assert.equal(GH.sessionIn(null), '');
});

test('a branch resolves to the session in its own commit trailer', async () => {
  const gh = fakeGH([[['feature', [`work\n\nClaude-Session: ${SESS('AAA')}`]]]]);
  assert.deepEqual(await gh.branchSessions(), { feature: SESS('AAA') });
});

test('a merge-commit tip does not hide the session below it', async () => {
  // The common real shape: GitHub writes the merge commit, so the tip carries no
  // trailer while the commit under it does. Tip-only resolution loses a quarter
  // of branches to exactly this.
  const gh = fakeGH([[['feature', [
    'Merge pull request #287 from acme/feature',
    `real work\n\nClaude-Session: ${SESS('BBB')}`,
  ]]]]);
  assert.deepEqual(await gh.branchSessions(), { feature: SESS('BBB') });
});

test('the newest session wins when a branch spans several', async () => {
  const gh = fakeGH([[['feature', [
    `later\n\nClaude-Session: ${SESS('NEW')}`,
    `earlier\n\nClaude-Session: ${SESS('OLD')}`,
  ]]]]);
  assert.deepEqual(await gh.branchSessions(), { feature: SESS('NEW') });
});

test('a branch with no trailer anywhere is absent, not empty-stringed', async () => {
  const gh = fakeGH([[['human-branch', ['hand-written commit', 'another one']]]]);
  assert.deepEqual(await gh.branchSessions(), {});
});

test('pagination covers every page of refs', async () => {
  const gh = fakeGH([
    [['a', [`x\n\nClaude-Session: ${SESS('A')}`]]],
    [['b', [`y\n\nClaude-Session: ${SESS('B')}`]]],
  ]);
  assert.deepEqual(await gh.branchSessions(), { a: SESS('A'), b: SESS('B') });
});

test('pulls() still lifts the session from the PR body', async () => {
  const gh = Object.create(GH.prototype);
  gh.req = async () => [{ number: 7, title: 'T', head: { ref: 'f' }, draft: true,
                          body: `summary\n\n${SESS('PR')}` }];
  const [pr] = await gh.pulls();
  assert.equal(pr.session, SESS('PR'));
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
  'lib/kits/branch-survey.js',
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));

// One repo's cached activity: a survey row per branch, plus any open PRs.
const activity = ({ branches = [], openPRs = [] }) => ({
  'acme/widget': { defaultBranch: 'main', openPRs, survey: { branches } },
});
// These rows are read through the Open scope, which is what the session
// icon's bug lived in. Stated rather than inherited: the component's
// default is Recent, and a stranded row is unreachable from there by
// construction (stranded is always older than the window's ceiling).
const rowFor = (name) => { data.branchScope = 'open'; return data.openBranches.find(r => r.name === name); };

test('a stranded branch with no PR still gets its session link', () => {
  // The whole bug: this row is the common case in the Open list, and it was
  // dark because the icon was gated on having an open PR.
  data.activity = activity({
    branches: [{ name: 'stranded-work', group: 'stranded', session: SESS('BRANCH') }],
  });
  assert.equal(rowFor('stranded-work').session, SESS('BRANCH'));
});

test('the branch trailer is preferred over the PR body', () => {
  data.activity = activity({
    branches: [{ name: 'feature', group: 'stranded', session: SESS('BRANCH') }],
    openPRs: [{ number: 1, head: 'feature', session: SESS('PRBODY') }],
  });
  assert.equal(rowFor('feature').session, SESS('BRANCH'));
});

test('the PR body covers a branch whose commits carry no trailer', () => {
  data.activity = activity({
    branches: [{ name: 'feature', group: 'stranded', session: '' }],
    openPRs: [{ number: 1, head: 'feature', session: SESS('PRBODY') }],
  });
  assert.equal(rowFor('feature').session, SESS('PRBODY'));
});

test('a PR beyond the survey cap still carries its own session', () => {
  // No survey row at all, so the PR body is the only source there is.
  data.activity = activity({
    branches: [],
    openPRs: [{ number: 9, head: 'fresh-push', session: SESS('PRONLY'), updatedAt: '2026-07-26' }],
  });
  assert.equal(rowFor('fresh-push').session, SESS('PRONLY'));
});

test('no session anywhere leaves the row falsy, so the icon stays hidden', () => {
  data.activity = activity({
    branches: [{ name: 'quiet', group: 'stranded' }],
  });
  assert.equal(rowFor('quiet').session, '');
});

// ── the exact path: sessions off the compare the crawl already runs ─────────
// branchSessions() walks ancestors and can drift into the default branch. The
// crawl's compare returns exactly the commits the branch has and the default
// does not, so sessions read there are exact. Measured, collecting ALL sessions
// from an ancestor walk scores 55% precision at depth 8 and 19% at depth 40;
// off the compare it is 100% by construction.

const surveySrc = readFileSync(path.join(repoRoot, 'lib/kits/branch-survey.js'), 'utf8');
const BS = (() => { const w = {}; new Function('window', surveySrc)(w); return w.BranchSurvey; })();
const commit = (msg) => ({ commit: { message: msg } });

test('sessionsIn reads compare order (oldest first) and returns newest first', () => {
  const out = BS.sessionsIn([
    commit(`first\n\nClaude-Session: ${SESS('OLD')}`),
    commit(`second\n\nClaude-Session: ${SESS('NEW')}`),
  ]);
  assert.deepEqual(out, [SESS('NEW'), SESS('OLD')]);
});

test('sessionsIn dedupes a session repeated across commits', () => {
  const out = BS.sessionsIn([commit(`a ${SESS('X')}`), commit(`b ${SESS('X')}`), commit(`c ${SESS('Y')}`)]);
  assert.deepEqual(out, [SESS('Y'), SESS('X')]);
});

test('sessionsIn ignores commits with no trailer and empty input', () => {
  assert.deepEqual(BS.sessionsIn([commit('merge branch'), commit('hand-written')]), []);
  assert.deepEqual(BS.sessionsIn(null), []);
});

test('surveyBranchLive marks compare-sourced sessions exact', async () => {
  const gh = {
    ago: () => '1d ago',
    compare: async () => ({ files: [{ filename: 'a.txt' }], ahead_by: 2, behind_by: 0,
      commits: [commit(`one\n\nClaude-Session: ${SESS('S1')}`), commit(`two\n\nClaude-Session: ${SESS('S2')}`)] }),
    req: async () => ({ tree: [{ path: 'a.txt', type: 'blob', sha: 'tip' }] }),
  };
  const main = BS.treeSets([{ path: 'a.txt', type: 'blob', sha: 'other' }]);
  const r = await BS.surveyBranchLive(gh, { name: 'f', sha: 'tip', date: new Date().toISOString() }, main);
  assert.deepEqual(r.sessions, [SESS('S2'), SESS('S1')]);
  assert.equal(r.sessionsExact, true);
});

test('a no-merge-base branch keeps one session and is not marked exact', async () => {
  // Its history reaches into whatever line it came from, so a count there would
  // be counting the old history rather than the branch.
  const e404 = Object.assign(new Error('404'), { status: 404 });
  const gh = {
    ago: () => '1y ago',
    compare: async (base) => {
      if (base === 'main') throw e404;
      return { files: [{ filename: 'a.txt' }] };
    },
    req: async (p) => p.startsWith('commits')
      ? [commit(`newest\n\nClaude-Session: ${SESS('TIP')}`),
         commit(`older\n\nClaude-Session: ${SESS('DEEP')}`)]
      : { tree: [{ path: 'a.txt', type: 'blob', sha: 'tip' }] },
  };
  const main = BS.treeSets([]);
  const r = await BS.surveyBranchLive(gh, { name: 'orphan', sha: 'tip', date: '2025-01-01T00:00:00Z' }, main);
  assert.equal(r.noBase, true);
  assert.deepEqual(r.sessions, [SESS('TIP')], 'newest only');
  assert.equal(r.sessionsExact, false);
});

test('a row prefers the branch exact list over the PR and the walk', () => {
  data.activity = activity({
    branches: [{ name: 'f', group: 'stranded', sessions: [SESS('B1'), SESS('B2')], sessionsExact: true,
                 session: SESS('WALK') }],
    openPRs: [{ number: 1, head: 'f', sessions: [SESS('P1')], sessionsExact: true }],
  });
  const r = rowFor('f');
  assert.equal(r.session, SESS('B1'), 'the icon opens the newest branch session');
  assert.equal(r.sessions.length, 2, 'the count is the branch own sessions');
  assert.equal(r.sessionsExact, true);
});

test('a row falls back to the PR compare list when the branch has none', () => {
  data.activity = activity({
    branches: [{ name: 'f', group: 'stranded' }],
    openPRs: [{ number: 1, head: 'f', sessions: [SESS('P1'), SESS('P2')], sessionsExact: true }],
  });
  assert.deepEqual(rowFor('f').sessions, [SESS('P1'), SESS('P2')]);
});

test('a cache written before per-branch sessions still resolves its old string', () => {
  data.activity = activity({ branches: [{ name: 'f', group: 'stranded', session: SESS('LEGACY') }] });
  const r = rowFor('f');
  assert.equal(r.session, SESS('LEGACY'));
  assert.equal(r.sessionsExact, false, 'a legacy string was never exact');
});

test('past the compare cap the sessions stand but stop claiming completeness', async () => {
  // GitHub lists at most 250 commits in a compare and reports the true count in
  // total_commits. The listed tail is the newest end, so the session the icon
  // opens is still right; only the count would be a lie. firstCommitDate (PR
  // #298) refuses to answer past the same cap, and this reads the same signal.
  const gh = {
    ago: () => '1d ago',
    compare: async () => ({ files: [{ filename: 'a.txt' }], ahead_by: 400, behind_by: 0,
      total_commits: 400,
      commits: [commit(`old\n\nClaude-Session: ${SESS('S1')}`), commit(`new\n\nClaude-Session: ${SESS('S2')}`)] }),
    req: async () => ({ tree: [{ path: 'a.txt', type: 'blob', sha: 'tip' }] }),
  };
  const main = BS.treeSets([{ path: 'a.txt', type: 'blob', sha: 'other' }]);
  const r = await BS.surveyBranchLive(gh, { name: 'huge', sha: 'tip', date: new Date().toISOString() }, main);
  assert.deepEqual(r.sessions, [SESS('S2'), SESS('S1')], 'the listed tail is still usable');
  assert.equal(r.sessionsExact, false, 'but the list is not the whole branch');
  assert.equal(r.firstDate, '', 'and the lifespan start is unknowable, per #298');
});

// ── the projection: one reader for every compare-derived field ──────────────

test('compareFields returns both fields and the completeness flag', () => {
  const r = BS.compareFields({ total_commits: 2, commits: [
    commit(`a\n\nClaude-Session: ${SESS('S1')}`), commit(`b\n\nClaude-Session: ${SESS('S2')}`)] });
  assert.deepEqual(r.sessions, [SESS('S2'), SESS('S1')]);
  assert.equal(r.sessionsExact, true);
  assert.ok(r.firstDate === '' || typeof r.firstDate === 'string');
});

test('compareFields applies the cap rule per field, not uniformly', () => {
  // The reason the projection exists: past the cap the two fields differ.
  // firstDate is unknowable; the session tail is still the newest end.
  const r = BS.compareFields({ total_commits: 400, commits: [
    commit(`a\n\nClaude-Session: ${SESS('S1')}`)] });
  assert.equal(r.firstDate, '', 'no knowable first commit past the cap');
  assert.deepEqual(r.sessions, [SESS('S1')], 'the tail still names a session');
  assert.equal(r.sessionsExact, false, 'but not the whole branch');
});

test('compareFields tolerates an empty or absent response', () => {
  for (const cmp of [null, {}, { commits: [] }]) {
    const r = BS.compareFields(cmp);
    assert.deepEqual(r.sessions, []);
    assert.equal(r.firstDate, '');
  }
});
