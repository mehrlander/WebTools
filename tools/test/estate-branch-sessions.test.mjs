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
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));

// One repo's cached activity: a survey row per branch, plus any open PRs.
const activity = ({ branches = [], openPRs = [] }) => ({
  'acme/widget': { defaultBranch: 'main', openPRs, survey: { branches } },
});
const rowFor = (name) => data.openBranches.find(r => r.name === name);

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
