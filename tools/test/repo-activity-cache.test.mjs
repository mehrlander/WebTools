// repo-activity-cache.js — the pure activity-aggregate builders. Run the IIFE
// against a window stub, then exercise the material hash (timestamp-blind),
// per-repo merge (recent commits accumulate + cap, scan kept on a summary-only
// pass), whole-cache build (membership follows the crawl), the change detector
// that gates no-op commits, and the cross-repo recent stream.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/repo-activity-cache.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const A = window.RepoActivityCache;

const commit = (sha, day) => ({ sha, msg: 'c' + sha, date: `2026-07-${String(day).padStart(2, '0')}T00:00:00Z`, author: 'me' });

test('hashEntry ignores timestamps but tracks material fields', () => {
  const base = { pushedAt: 'p', defaultBranch: 'main', counts: { branches: 3 },
                 recentCommits: [commit('a', 5)], openPRs: [{ number: 1, updatedAt: 'u' }],
                 scan: { scannedAt: 't0', branches: [{ name: 'x', sha: 'S', group: 'landed' }] } };
  const restamped = { ...base, scan: { scannedAt: 'LATER', branches: base.scan.branches } };
  assert.equal(A.hashEntry(base), A.hashEntry(restamped)); // scannedAt is volatile
  const moved = { ...base, scan: { branches: [{ name: 'x', sha: 'S', group: 'stranded' }] } };
  assert.notEqual(A.hashEntry(base), A.hashEntry(moved));  // a group flip is material
  const ahead = { ...base, scan: { branches: [{ name: 'x', sha: 'S', group: 'landed', aheadBy: 3 }] } };
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

test('mergeRepo keeps the prior scan on a summary-only pass', () => {
  const withScan = A.mergeRepo(undefined, {
    recentCommits: [], scan: { scannedAt: 't0', branches: [{ name: 'x', sha: 'S', group: 'landed' }] },
  }, 't0');
  const summaryOnly = A.mergeRepo(withScan, { recentCommits: [commit('a', 5)] }, 't1'); // no scan key
  assert.ok(summaryOnly.scan, 'scan retained when the fresh crawl omits it');
  assert.equal(summaryOnly.scan.branches[0].name, 'x');
  const cleared = A.mergeRepo(withScan, { recentCommits: [], scan: null }, 't2'); // explicit clear
  assert.equal(cleared.scan, null);
});

test('buildCache tracks crawl membership', () => {
  const prev = A.buildCache(null, { 'o/a': { counts: { branches: 1 } }, 'o/b': {} }, 't0');
  const next = A.buildCache(prev, { 'o/a': { counts: { branches: 2 } }, 'o/c': {} }, 't1');
  assert.deepEqual(Object.keys(next.repos).sort(), ['o/a', 'o/c']); // b dropped, c added
});

// The scope argument, and the reason it exists: a crawl that fails on one repo
// used to DELETE it from the shared cache, and `changedRepos` scored the
// deletion as a change, so the commit went through and the toast called it a
// successful refresh. Absence from `fetched` is not evidence about a repo.
test('buildCache carries an in-scope repo the crawl could not reach', () => {
  const prev = A.buildCache(null, { 'o/a': { counts: { branches: 1 } },
                                    'o/b': { counts: { branches: 7 } } }, 't0');
  const members = ['o/a', 'o/b'];                      // both in scope
  const next = A.buildCache(prev, { 'o/a': { counts: { branches: 1 } } }, 't1',
                            A.COMMIT_CAP, members);    // o/b threw mid-crawl
  assert.deepEqual(Object.keys(next.repos).sort(), ['o/a', 'o/b']);
  assert.equal(next.repos['o/b'].counts.branches, 7, 'kept its data');
  assert.deepEqual(next.repos['o/b'], prev.repos['o/b'], 'untouched, not restamped');
  assert.deepEqual(A.changedRepos(prev, next), [], 'and a failed crawl is not a change');
});

// The other half: out of scope still means gone, so a repo that leaves the
// estate is cleaned up rather than lingering forever.
test('buildCache prunes a repo that is no longer in scope', () => {
  const prev = A.buildCache(null, { 'o/a': { counts: { branches: 1 } },
                                    'o/gone': { counts: { branches: 3 } } }, 't0');
  const next = A.buildCache(prev, { 'o/a': { counts: { branches: 1 } } }, 't1',
                            A.COMMIT_CAP, ['o/a']);    // o/gone left the estate
  assert.deepEqual(Object.keys(next.repos), ['o/a']);
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
test('a newly-learned firstDate is material, on both scan rows and PRs', () => {
  const base = { pushedAt: 'p', defaultBranch: 'main', counts: {},
                 recentCommits: [], openPRs: [{ number: 1, updatedAt: 'u' }],
                 scan: { branches: [{ name: 'x', sha: 'S', group: 'stranded' }] } };
  const scanned = { ...base, scan: { branches: [{ ...base.scan.branches[0], firstDate: '2026-07-02T00:00:00Z' }] } };
  assert.notEqual(A.hashEntry(base), A.hashEntry(scanned));
  const pr = { ...base, openPRs: [{ ...base.openPRs[0], firstDate: '2026-07-02T00:00:00Z' }] };
  assert.notEqual(A.hashEntry(base), A.hashEntry(pr));
  // Still stable once learned: a re-crawl reading the same start is a no-op.
  assert.equal(A.hashEntry(scanned), A.hashEntry({ ...scanned, generatedAt: 'LATER' }));
});

// ── Declared checks in the cache ───────────────────────────────────────────
// The cache stores each check's FACT, never its verdict. These pin the reason:
// a verdict is time-derived, so hashing one would restamp and recommit every
// entry on every crawl forever, which is the same trap the crawl-timestamp
// exclusion in material() already avoids.

const factOf = (label, date) => ({
  check: { kind: 'content-date', label, path: 's.md', pattern: '(x)', staleAfterDays: 30 },
  fact: { date }, error: null,
});

test('an unchanged check fact hashes identically, so a quiet crawl skips the commit', () => {
  const fetched = { pushedAt: 'p', counts: {}, checks: [factOf('sweep', '2026-07-18')] };
  const a = A.mergeRepo(null, fetched, '2026-07-31T00:00:00Z');
  // A later crawl, same repo content: only the crawl stamp differs.
  const b = A.mergeRepo(a, fetched, '2026-09-30T00:00:00Z');
  assert.equal(a.hash, b.hash, 'a fact that did not change must not move the hash');
  assert.equal(A.cacheChanged({ repos: { r: a } }, { repos: { r: b } }), false);
});

test('a changed check fact does move the hash, or the card would never update', () => {
  const a = A.mergeRepo(null, { counts: {}, checks: [factOf('sweep', '2026-07-18')] }, 'T');
  const b = A.mergeRepo(a, { counts: {}, checks: [factOf('sweep', '2026-08-02')] }, 'T');
  assert.notEqual(a.hash, b.hash);
});

test('a threshold edit moves the hash, since it changes what the card should say', () => {
  const strict = { check: { kind: 'content-date', label: 'sweep', path: 's.md', staleAfterDays: 7 }, fact: { date: '2026-07-18' } };
  const loose = { check: { kind: 'content-date', label: 'sweep', path: 's.md', staleAfterDays: 90 }, fact: { date: '2026-07-18' } };
  const a = A.mergeRepo(null, { counts: {}, checks: [strict] }, 'T');
  const b = A.mergeRepo(a, { counts: {}, checks: [loose] }, 'T');
  assert.notEqual(a.hash, b.hash, 'the declaration rides the hash, not just the fact');
});

test('a crawl that ran checks and found none CLEARS them; one that skipped keeps them', () => {
  const prior = A.mergeRepo(null, { counts: {}, checks: [factOf('sweep', '2026-07-18')] }, 'T');
  assert.equal(prior.checks.length, 1);

  // The repo retired its declarations. An empty array is a finding, not a gap:
  // falling back to the prior list here would haunt the card with a check the
  // repo no longer declares.
  const cleared = A.mergeRepo(prior, { counts: {}, checks: [] }, 'T');
  assert.deepEqual(cleared.checks, []);

  // A summary-only pass never looked, so it keeps what it had, the same way
  // scan does.
  const kept = A.mergeRepo(prior, { counts: {} }, 'T');
  assert.equal(kept.checks.length, 1);
});

test('a quick pass keeps the scan AND the counts that describe it', () => {
  const prev = { pushedAt: 'p0', defaultBranch: 'main',
                 counts: { branches: 100, active: 10, openPRs: 2, landed: 30, stranded: 4, scanned: 30 },
                 recentCommits: [], openPRs: [],
                 scan: { branches: [{ name: 'x', sha: 'S', group: 'stranded' }] } };
  // A quick crawl: no `scan` key at all, and counts that honestly report zero
  // for what it did not measure.
  const quick = { pushedAt: 'p1', defaultBranch: 'main', partial: true,
                  counts: { branches: 101, active: 12, openPRs: 3, landed: 0, stranded: 0, scanned: 0 },
                  recentCommits: [], openPRs: [] };
  const merged = A.mergeRepo(prev, quick, '2026-08-07T00:00:00Z');
  assert.deepEqual(merged.scan, prev.scan);        // the scan carries forward
  assert.equal(merged.counts.branches, 101);           // freshly measured wins
  assert.equal(merged.counts.active, 12);
  assert.equal(merged.counts.openPRs, 3);
  assert.equal(merged.counts.stranded, 4);             // scan-derived carries with the scan
  assert.equal(merged.counts.landed, 30);
  assert.equal(merged.counts.scanned, 30);
});

test('an entry that simply has no scan is NOT treated as partial', () => {
  // The distinction the `partial` flag exists to draw: absent scan means
  // "keep the old one", it does not mean "these counts are provisional".
  const prev = { counts: { landed: 30, stranded: 4, scanned: 30 }, recentCommits: [],
                 scan: { branches: [] } };
  const fetched = { counts: { branches: 5, active: 1, openPRs: 0, landed: 0, stranded: 0, scanned: 0 },
                    recentCommits: [], openPRs: [] };
  const merged = A.mergeRepo(prev, fetched, '2026-08-07T00:00:00Z');
  assert.equal(merged.counts.stranded, 0);   // taken at face value
  assert.deepEqual(merged.scan, prev.scan);
});

test('a deep pass replaces the scan and its counts together', () => {
  const prev = { counts: { landed: 30, stranded: 4, scanned: 30 }, recentCommits: [],
                 scan: { branches: [{ name: 'x', sha: 'S', group: 'stranded' }] } };
  const deep = { counts: { branches: 101, active: 12, openPRs: 3, landed: 40, stranded: 0, scanned: 40 },
                 recentCommits: [], openPRs: [],
                 scan: { branches: [{ name: 'x', sha: 'S2', group: 'landed' }] } };
  const merged = A.mergeRepo(prev, deep, '2026-08-07T00:00:00Z');
  assert.equal(merged.counts.stranded, 0);   // a real zero from a real scan stands
  assert.equal(merged.counts.landed, 40);
  assert.deepEqual(merged.scan, deep.scan);
});

// The other half of the same trap, and it took a live estate to find it. The
// guard above covers a crawl that OMITS the scan; a crawl that read no branch
// list and sent `{ branches: [] }` walked straight through it, because an empty
// scan is a scan. Three repos lost their stored verdicts that way in one run
// (2026-08-17: home 89 rows, web-tools-private 25, fn-data 22) while the run
// reported success. The crawl's fix is to omit the key and mark the pass
// partial; these assertions pin what mergeRepo does with each shape, so the two
// halves cannot drift.
test('an empty scan CLEARS, which is why a failed read must omit the key', () => {
  const withScan = A.mergeRepo(undefined, {
    counts: { branches: 9, stranded: 2 },
    recentCommits: [], scan: { scannedAt: 't0', branches: [{ name: 'x', sha: 'S', group: 'stranded' }] },
  }, 't0');
  const wiped = A.mergeRepo(withScan, { recentCommits: [], scan: { branches: [] } }, 't1');
  assert.deepEqual(wiped.scan.branches, [], 'an empty scan is taken at its word');
  // The shape a failed read sends instead: no scan key, no counts, partial.
  const kept = A.mergeRepo(withScan, { recentCommits: [], partial: true }, 't2');
  assert.equal(kept.scan.branches[0].name, 'x', 'the stored verdicts survive');
  assert.equal(kept.counts.branches, 9, 'and so do the counts describing them');
});
