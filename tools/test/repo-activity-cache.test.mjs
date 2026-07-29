// repo-activity-cache.js — the pure activity-aggregate builders. Run the IIFE
// against a window stub, then exercise the material hash (timestamp-blind),
// per-repo merge (recent commits accumulate + cap, survey kept on a summary-only
// pass), whole-cache build (membership follows the crawl), the change detector
// that gates no-op commits, and the cross-repo recent stream.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/repo-activity-cache.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const A = window.RepoActivityCache;

const commit = (sha, day) => ({ sha, msg: 'c' + sha, date: `2026-07-${String(day).padStart(2, '0')}T00:00:00Z`, author: 'me' });

test('hashEntry ignores timestamps but tracks material fields', () => {
  const base = { pushedAt: 'p', defaultBranch: 'main', counts: { branches: 3 },
                 recentCommits: [commit('a', 5)], openPRs: [{ number: 1, updatedAt: 'u' }],
                 survey: { surveyedAt: 't0', branches: [{ name: 'x', sha: 'S', group: 'landed' }] } };
  const restamped = { ...base, survey: { surveyedAt: 'LATER', branches: base.survey.branches } };
  assert.equal(A.hashEntry(base), A.hashEntry(restamped)); // surveyedAt is volatile
  const moved = { ...base, survey: { branches: [{ name: 'x', sha: 'S', group: 'stranded' }] } };
  assert.notEqual(A.hashEntry(base), A.hashEntry(moved));  // a group flip is material
  const ahead = { ...base, survey: { branches: [{ name: 'x', sha: 'S', group: 'landed', aheadBy: 3 }] } };
  assert.notEqual(A.hashEntry(base), A.hashEntry(ahead));  // an ahead-count change is material
});

test('mergeCommits unions by sha, newest-first, capped', () => {
  const prev = [commit('a', 5), commit('b', 4)];
  const fresh = [commit('c', 7), commit('a', 5)]; // a re-seen
  const out = A.mergeCommits(prev, fresh, 3);
  assert.deepEqual(out.map(c => c.sha), ['c', 'a', 'b']); // newest-first, deduped
  const capped = A.mergeCommits(prev, [commit('c', 7), commit('d', 6)], 2);
  assert.deepEqual(capped.map(c => c.sha), ['c', 'd']);   // oldest dropped past cap
});

test('mergeRepo accumulates commits and restamps generatedAt', () => {
  const a = A.mergeRepo(undefined, { pushedAt: 'p0', recentCommits: [commit('a', 5)],
                                     counts: { branches: 1 } }, 't0');
  assert.equal(a.recentCommits.length, 1);
  assert.equal(a.generatedAt, 't0');
  const b = A.mergeRepo(a, { pushedAt: 'p1', recentCommits: [commit('b', 6)] }, 't1');
  assert.deepEqual(b.recentCommits.map(c => c.sha), ['b', 'a']); // accumulated
  assert.equal(b.pushedAt, 'p1');
  assert.equal(b.generatedAt, 't1');
});

test('mergeRepo keeps the prior survey on a summary-only pass', () => {
  const withSurvey = A.mergeRepo(undefined, {
    recentCommits: [], survey: { surveyedAt: 't0', branches: [{ name: 'x', sha: 'S', group: 'landed' }] },
  }, 't0');
  const summaryOnly = A.mergeRepo(withSurvey, { recentCommits: [commit('a', 5)] }, 't1'); // no survey key
  assert.ok(summaryOnly.survey, 'survey retained when the fresh crawl omits it');
  assert.equal(summaryOnly.survey.branches[0].name, 'x');
  const cleared = A.mergeRepo(withSurvey, { recentCommits: [], survey: null }, 't2'); // explicit clear
  assert.equal(cleared.survey, null);
});

test('buildCache tracks crawl membership', () => {
  const prev = A.buildCache(null, { 'o/a': { counts: { branches: 1 } }, 'o/b': {} }, 't0');
  const next = A.buildCache(prev, { 'o/a': { counts: { branches: 2 } }, 'o/c': {} }, 't1');
  assert.deepEqual(Object.keys(next.repos).sort(), ['o/a', 'o/c']); // b dropped, c added
});

test('cacheChanged ignores timestamps, catches hash and membership', () => {
  const a = A.buildCache(null, { 'o/a': { counts: { branches: 1 }, recentCommits: [commit('a', 5)] } }, 't0');
  const same = A.buildCache(a, { 'o/a': { counts: { branches: 1 }, recentCommits: [commit('a', 5)] } }, 't1');
  assert.equal(A.cacheChanged(a, same), false);
  const changed = A.buildCache(a, { 'o/a': { counts: { branches: 2 }, recentCommits: [commit('a', 5)] } }, 't2');
  assert.equal(A.cacheChanged(a, changed), true);
});

// The count behind the refresh toast. cacheChanged is defined as this list
// being non-empty, so the gate that skips the commit and the number the toast
// reports can never disagree.
test('changedRepos names movers and membership changes, sorted', () => {
  const a = A.buildCache(null, { 'o/a': { counts: { branches: 1 } }, 'o/b': { counts: { branches: 1 } } }, 't0');
  const same = A.buildCache(a, { 'o/a': { counts: { branches: 1 } }, 'o/b': { counts: { branches: 1 } } }, 't1');
  assert.deepEqual(A.changedRepos(a, same), []);
  const moved = A.buildCache(a, { 'o/a': { counts: { branches: 9 } }, 'o/b': { counts: { branches: 1 } } }, 't2');
  assert.deepEqual(A.changedRepos(a, moved), ['o/a']);
  const joined = A.buildCache(a, { 'o/a': { counts: { branches: 1 } }, 'o/b': { counts: { branches: 1 } },
                                   'o/c': { counts: { branches: 1 } } }, 't3');
  assert.deepEqual(A.changedRepos(a, joined), ['o/c']);        // a joiner counts
  const left = A.buildCache(a, { 'o/a': { counts: { branches: 1 } } }, 't4');
  assert.deepEqual(A.changedRepos(a, left), ['o/b']);          // so does a leaver
  assert.equal(A.cacheChanged(a, left), true);                 // and the gate agrees
});

test('recentStream merges and caps across repos, newest-first, repo-tagged', () => {
  const cache = A.buildCache(null, {
    'o/a': { recentCommits: [commit('a', 7), commit('b', 3)] },
    'o/c': { recentCommits: [commit('c', 5)] },
  }, 't0');
  const stream = A.recentStream(cache, 2);
  assert.deepEqual(stream.map(c => [c.repo, c.sha]), [['o/a', 'a'], ['o/c', 'c']]);
});

// The gate that nearly swallowed firstDate: the material hash decides whether a
// crawl commits at all, so a CONTENT timestamp the crawl newly learns has to be
// in the projection. Were it not, the first crawl to read a branch's start
// would hash identically to the one before it, skip the commit, and the field
// would never reach the cache.
test('a newly-learned firstDate is material, on both survey rows and PRs', () => {
  const base = { pushedAt: 'p', defaultBranch: 'main', counts: {},
                 recentCommits: [], openPRs: [{ number: 1, updatedAt: 'u' }],
                 survey: { branches: [{ name: 'x', sha: 'S', group: 'stranded' }] } };
  const surveyed = { ...base, survey: { branches: [{ ...base.survey.branches[0], firstDate: '2026-07-02T00:00:00Z' }] } };
  assert.notEqual(A.hashEntry(base), A.hashEntry(surveyed));
  const pr = { ...base, openPRs: [{ ...base.openPRs[0], firstDate: '2026-07-02T00:00:00Z' }] };
  assert.notEqual(A.hashEntry(base), A.hashEntry(pr));
  // Still stable once learned: a re-crawl reading the same start is a no-op.
  assert.equal(A.hashEntry(surveyed), A.hashEntry({ ...surveyed, generatedAt: 'LATER' }));
});
