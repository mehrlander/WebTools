// branch-survey.js — the pure survey math ported from home's
// tools/branch-survey.sh. Run the IIFE against a window stub, then exercise
// each CLI semantic: tree-set extraction, the per-path landed order (same
// path/same bytes, moved blob, branch deletion, churn vs missing), and the
// active/landed/stranded classification with its calibrated thresholds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/branch-survey.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const B = window.BranchSurvey;

const tree = (entries) => B.treeSets(entries);

test('treeSets keeps blobs only, keyed both ways', () => {
  const t = tree([
    { path: 'a.txt', type: 'blob', sha: 's1' },
    { path: 'dir', type: 'tree', sha: 's2' },
    { path: 'dir/b.txt', type: 'blob', sha: 's3' },
  ]);
  assert.deepEqual([...t.blobs].sort(), ['s1', 's3']);
  assert.equal(t.paths.get('dir/b.txt'), 's3');
  assert.equal(t.paths.has('dir'), false);
});

test('landedSignal: identical bytes at the same path land', () => {
  const main = tree([{ path: 'a', type: 'blob', sha: 'x' }]);
  const tip = tree([{ path: 'a', type: 'blob', sha: 'x' }]);
  const s = B.landedSignal(['a'], tip, main);
  assert.deepEqual(s, { nUnique: 1, nLanded: 1, nMissing: 0, missingPaths: [] });
});

test('landedSignal: a moved blob lands (bytes anywhere on main)', () => {
  const main = tree([{ path: 'new/home', type: 'blob', sha: 'x' }]);
  const tip = tree([{ path: 'old/place', type: 'blob', sha: 'x' }]);
  const s = B.landedSignal(['old/place'], tip, main);
  assert.equal(s.nLanded, 1);
  assert.equal(s.nMissing, 0);
});

test('landedSignal: a path deleted at the branch tip counts landed', () => {
  const main = tree([{ path: 'kept', type: 'blob', sha: 'x' }]);
  const tip = tree([]);
  const s = B.landedSignal(['kept'], tip, main);
  assert.equal(s.nLanded, 1);
});

test('landedSignal: churn (path on main, bytes differ) is unlanded but not missing', () => {
  const main = tree([{ path: 'a', type: 'blob', sha: 'mainv' }]);
  const tip = tree([{ path: 'a', type: 'blob', sha: 'tipv' }]);
  const s = B.landedSignal(['a'], tip, main);
  assert.deepEqual(s, { nUnique: 1, nLanded: 0, nMissing: 0, missingPaths: [] });
});

test('landedSignal: path and bytes both absent from main is missing', () => {
  const main = tree([]);
  const tip = tree([{ path: 'only/here', type: 'blob', sha: 'z' }]);
  const s = B.landedSignal(['only/here'], tip, main);
  assert.deepEqual(s.missingPaths, ['only/here']);
  assert.equal(s.nMissing, 1);
});

test('landedSignal dedupes the unique-path list', () => {
  const main = tree([{ path: 'a', type: 'blob', sha: 'x' }]);
  const tip = tree([{ path: 'a', type: 'blob', sha: 'x' }]);
  const s = B.landedSignal(['a', 'a', 'a'], tip, main);
  assert.equal(s.nUnique, 1);
});

test('classify: fresh work is active regardless of signal', () => {
  assert.equal(B.classify({ daysAgo: 3, nUnique: 5, nLanded: 0, nMissing: 5 }), 'active');
  assert.equal(B.classify({ daysAgo: 14, nUnique: 5, nLanded: 0, nMissing: 5 }), 'active');
  assert.equal(B.classify({ daysAgo: 15, nUnique: 5, nLanded: 0, nMissing: 5 }), 'stranded');
});

test('classify: the squash-merge shadow (no unique paths) lands', () => {
  assert.equal(B.classify({ daysAgo: 60, nUnique: 0, nLanded: 0, nMissing: 0 }), 'landed');
});

test('classify: nothing missing lands even below the ratio', () => {
  assert.equal(B.classify({ daysAgo: 60, nUnique: 10, nLanded: 2, nMissing: 0 }), 'landed');
});

test('classify: the 80% ratio boundary, inclusive', () => {
  assert.equal(B.classify({ daysAgo: 60, nUnique: 10, nLanded: 8, nMissing: 2 }), 'landed');
  assert.equal(B.classify({ daysAgo: 60, nUnique: 10, nLanded: 7, nMissing: 3 }), 'stranded');
});

test('classify honors option overrides', () => {
  assert.equal(B.classify({ daysAgo: 20, nUnique: 5, nLanded: 0, nMissing: 5 }, { recentDays: 21 }), 'active');
  assert.equal(B.classify({ daysAgo: 60, nUnique: 10, nLanded: 5, nMissing: 5 }, { landedPct: 50 }), 'landed');
});

test('daysAgo floors to whole days', () => {
  const now = Date.parse('2026-07-17T12:00:00Z');
  assert.equal(B.daysAgo('2026-07-17T00:00:00Z', now), 0);
  assert.equal(B.daysAgo('2026-07-10T11:00:00Z', now), 7);
});

// ── firstCommitDate: the branch's start, off a compare already in hand ──────
// The lifespan the Open view renders ("5d → 2h") needs the branch's OLDEST
// unique commit. A compare lists those oldest-first, so the answer is
// commits[0], free of any extra call, but only when the list is whole.

test('firstCommitDate takes the oldest unique commit (compare is oldest-first)', () => {
  const cmp = { total_commits: 3, commits: [
    { commit: { committer: { date: '2026-07-01T00:00:00Z' } } },
    { commit: { committer: { date: '2026-07-04T00:00:00Z' } } },
    { commit: { committer: { date: '2026-07-09T00:00:00Z' } } },
  ] };
  assert.equal(B.firstCommitDate(cmp), '2026-07-01T00:00:00Z');
});

test('firstCommitDate: a branch past the 250-commit cap has no knowable start', () => {
  // GitHub caps the commits array but still reports the true count, so the
  // oldest entry present is NOT the branch's first. Say nothing rather than
  // report the 250th-from-tip as the start.
  const cmp = { total_commits: 300, commits: [{ commit: { committer: { date: '2026-07-01T00:00:00Z' } } }] };
  assert.equal(B.firstCommitDate(cmp), '');
});

test('firstCommitDate: empty or malformed compares yield ""', () => {
  assert.equal(B.firstCommitDate({ commits: [] }), '');
  assert.equal(B.firstCommitDate({}), '');
  assert.equal(B.firstCommitDate(null), '');
  assert.equal(B.firstCommitDate({ commits: [{}] }), '');
});

test('firstCommitDate: no total_commits falls back to the list length', () => {
  const cmp = { commits: [{ commit: { committer: { date: '2026-06-02T00:00:00Z' } } }] };
  assert.equal(B.firstCommitDate(cmp), '2026-06-02T00:00:00Z');
});

// ── surveyBranchLive carries firstDate through both of its paths ────────────

const treeReq = (shas) => ({ tree: shas.map((sha, i) => ({ path: 'f' + i, type: 'blob', sha })) });

test('surveyBranchLive reports firstDate from the compare it already runs', async () => {
  const gh = {
    async compare() {
      return { ahead_by: 2, behind_by: 0, total_commits: 2,
               files: [{ filename: 'a.txt' }],
               commits: [
                 { commit: { committer: { date: '2026-07-02T00:00:00Z' }, message: 'start' } },
                 { commit: { committer: { date: '2026-07-08T00:00:00Z' }, message: 'tip\n\nbody' } },
               ] };
    },
    async req() { return treeReq(['tipsha']); },
  };
  const main = B.treeSets([{ path: 'a.txt', type: 'blob', sha: 'other' }]);
  const r = await B.surveyBranchLive(gh, { name: 'feat', sha: 'tipsha' }, main,
                                     { now: Date.parse('2026-07-09T00:00:00Z') });
  assert.equal(r.firstDate, '2026-07-02T00:00:00Z');
  assert.equal(r.date, '2026-07-08T00:00:00Z');   // tip is still the LAST entry
  assert.equal(r.subject, 'tip');
  assert.equal(r.aheadBy, 2);
});

test('surveyBranchLive: no merge base means no honest start', async () => {
  // With no common ancestor there is no unique-commit list, so the oldest
  // commit reachable is the repo's history rather than the branch's. The row
  // shows its tip age alone instead of claiming a start it cannot know.
  let firstCompare = true;
  const gh = {
    async compare() {
      if (firstCompare) { firstCompare = false; const e = new Error('no merge base'); e.status = 404; throw e; }
      return { files: [{ filename: 'a.txt' }], commits: [] };
    },
    async req(path) {
      if (path.startsWith('commits?')) return [
        { sha: 'new', commit: { committer: { date: '2026-07-08T00:00:00Z' }, message: 'tip' }, parents: [{ sha: 'p1' }] },
        { sha: 'old', commit: { committer: { date: '2026-01-01T00:00:00Z' }, message: 'ancient' }, parents: [{ sha: 'p0' }] },
      ];
      return treeReq(['tipsha']);
    },
  };
  const main = B.treeSets([{ path: 'a.txt', type: 'blob', sha: 'other' }]);
  const r = await B.surveyBranchLive(gh, { name: 'rewritten', sha: 'tipsha' }, main,
                                     { now: Date.parse('2026-07-09T00:00:00Z') });
  assert.equal(r.noBase, true);
  assert.equal(r.firstDate, '');
  assert.equal(r.date, '2026-07-08T00:00:00Z');
});

test('lifespan display rules: the start collapses when unknowable or same-label', () => {
  // Formatters injected, so the rules test independent of GH.ago: label the
  // hour for a recent stamp, the day otherwise.
  const agoShort = (iso) => iso.startsWith('2026-07-09') ? '2h' : '15d';
  const agoOf = (iso) => agoShort(iso) + ' ago';
  const first = '2026-06-24T00:00:00Z', tip = '2026-07-09T10:00:00Z';
  assert.equal(B.lifespanStart(first, tip, agoShort), '15d');
  assert.equal(B.lifespanTitle(first, tip, agoOf), 'started 15d ago, latest 2h ago');
  // No known start (no merge base, or past the compare cap): tip age alone.
  assert.equal(B.lifespanStart('', tip, agoShort), '');
  assert.equal(B.lifespanTitle('', tip, agoOf), 'latest 2h ago');
  // A same-day branch rounds both halves to one label: "2h → 2h" is noise.
  assert.equal(B.lifespanStart('2026-07-09T08:00:00Z', tip, agoShort), '');
});
