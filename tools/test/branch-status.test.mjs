// branch-status.js — the pure branch-status math ported from home's
// tools/unmerged-branches.sh. Run the IIFE against a window stub, then exercise
// each CLI semantic: tree-set extraction, the per-path landed order (same
// path/same bytes, moved blob, branch deletion, churn vs missing), and the
// active/landed/stranded classification with its calibrated thresholds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/branch-status.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const B = window.BranchStatus;

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
  assert.deepEqual(s, { nUnique: 1, nLanded: 1, nMissing: 0, nDiffers: 0,
                        missingPaths: [], differsPaths: [] });
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

test('landedSignal: differs (path on main, bytes differ) is unlanded but not missing', () => {
  const main = tree([{ path: 'a', type: 'blob', sha: 'mainv' }]);
  const tip = tree([{ path: 'a', type: 'blob', sha: 'tipv' }]);
  const s = B.landedSignal(['a'], tip, main);
  assert.deepEqual(s, { nUnique: 1, nLanded: 0, nMissing: 0, nDiffers: 1,
                        missingPaths: [], differsPaths: ['a'] });
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

// ── fileStats: what a compare's own file list says about itself ─────────────
//
// Free from a response the caller already holds, and the reason a branch row can
// say "62 changed, 14 new" instead of "76 files". `added` + `changed` +
// `removed` partitions the list, with renames counted inside `changed` since a
// renamed file both moved and still exists.

test('fileStats partitions a compare file list by status', () => {
  const s = B.fileStats([
    { filename: 'new.js', status: 'added', additions: 40, deletions: 0 },
    { filename: 'copy.js', status: 'copied', additions: 12, deletions: 0 },
    { filename: 'edit.js', status: 'modified', additions: 5, deletions: 3 },
    { filename: 'moved.js', status: 'renamed', additions: 1, deletions: 1 },
    { filename: 'gone.js', status: 'removed', additions: 0, deletions: 30 },
  ]);
  const { shape, ...counts } = s;      // the digest has its own tests below
  assert.deepEqual(counts, { n: 5, added: 2, changed: 2, removed: 1, renamed: 1,
                             additions: 58, deletions: 34 });
  assert.equal(s.added + s.changed + s.removed, s.n, 'the three classes partition the list');
});

test('fileStats digests each class by extension and top folder, biggest first', () => {
  const s = B.fileStats([
    { filename: 'docs/a.md', status: 'added' },
    { filename: 'docs/b.md', status: 'added' },
    { filename: 'docs/c.json', status: 'added' },
    { filename: 'lib/x.js', status: 'modified' },
    { filename: 'README', status: 'added' },
    { filename: '.gitignore', status: 'modified' },
  ]);
  assert.deepEqual(s.shape.added.exts, [['.md', 2], ['(none)', 1], ['.json', 1]]);
  assert.deepEqual(s.shape.added.dirs, [['docs', 3], ['(root)', 1]]);
  // A dotfile is extensionless, not an extension of one: it belongs with README
  // and Makefile rather than adding a histogram bar of size one.
  assert.deepEqual(s.shape.changed.exts, [['(none)', 1], ['.js', 1]]);
  assert.deepEqual(s.shape.changed.dirs, [['(root)', 1], ['lib', 1]]);
  assert.deepEqual(s.shape.removed, { exts: [], dirs: [] });
});

test('the shape digest caps its tail, and the counts it is built from do not', () => {
  const files = Array.from({ length: 20 }, (_, i) => ({ filename: 'd' + i + '/f.e' + i, status: 'modified' }));
  const s = B.fileStats(files);
  assert.equal(s.changed, 20, 'the count is complete');
  assert.equal(s.shape.changed.exts.length, 6, 'the histogram is capped');
  assert.equal(s.shape.changed.dirs.length, 6);
});

test('fileClass is the one rule the counts, the digest and the card all read', () => {
  assert.equal(B.fileClass({ status: 'added' }), 'added');
  assert.equal(B.fileClass({ status: 'copied' }), 'added');
  assert.equal(B.fileClass({ status: 'removed' }), 'removed');
  assert.equal(B.fileClass({ status: 'renamed' }), 'changed');
  assert.equal(B.fileClass({}), 'changed', 'no status reads as changed');
});

test('fileKind names the extensionless and the rootless rather than dropping them', () => {
  assert.deepEqual(B.fileKind('lib/kits/a.js'), { ext: '.js', dir: 'lib' });
  assert.deepEqual(B.fileKind('README'), { ext: '(none)', dir: '(root)' });
  assert.deepEqual(B.fileKind('.gitignore'), { ext: '(none)', dir: '(root)' });
  assert.deepEqual(B.fileKind('a/b/c/d.test.mjs'), { ext: '.mjs', dir: 'a' });
});

test('fileStats dedupes by path and reads either spelling', () => {
  const s = B.fileStats([
    { filename: 'a', status: 'modified', additions: 1, deletions: 1 },
    { filename: 'a', status: 'modified', additions: 1, deletions: 1 },
    { path: 'b', status: 'added', additions: 2, deletions: 0 },
    { status: 'added' },                       // no path at all
  ]);
  assert.equal(s.n, 2);
  assert.equal(s.added, 1);
  assert.equal(s.additions, 3);
});

test('fileStats treats a status-less entry as changed, and an empty list as zero', () => {
  assert.equal(B.fileStats([{ filename: 'a' }]).changed, 1);
  const { shape, ...counts } = B.fileStats([]);
  assert.deepEqual(counts, { n: 0, added: 0, changed: 0, removed: 0, renamed: 0,
                             additions: 0, deletions: 0 });
  assert.deepEqual(shape.added, { exts: [], dirs: [] });
  assert.equal(B.fileStats(null).n, 0);
});

// ── the three-way partition ─────────────────────────────────────────────────
//
// The estate chip read `28/80` beside `11 missing` and the two did not add up,
// because forty-one paths sat in a class nothing named. These hold the fix:
// every touched path lands in exactly one state, and the three counts sum to
// the total. A regression here is a chip that lies again.

test('pathStates answers every touched path with exactly one state', () => {
  const main = tree([
    { path: 'same', type: 'blob', sha: 'x' },
    { path: 'moved/now-here', type: 'blob', sha: 'm' },
    { path: 'edited', type: 'blob', sha: 'mainv' },
    { path: 'deleted', type: 'blob', sha: 'd' },
  ]);
  const tip = tree([
    { path: 'same', type: 'blob', sha: 'x' },
    { path: 'moved/was-here', type: 'blob', sha: 'm' },
    { path: 'edited', type: 'blob', sha: 'tipv' },
    { path: 'only/here', type: 'blob', sha: 'new' },
  ]);
  const paths = ['same', 'moved/was-here', 'edited', 'deleted', 'only/here'];
  const st = B.pathStates(paths, tip, main);
  assert.deepEqual([...st], [
    ['same', 'landed'],            // identical bytes at the same path
    ['moved/was-here', 'landed'],  // same bytes, moved on main
    ['edited', 'differs'],         // main holds the path, with other bytes
    ['deleted', 'landed'],         // gone at the tip, so nothing is stranded
    ['only/here', 'missing'],      // neither the path nor the bytes on main
  ]);
});

test('the three counts partition the touched set', () => {
  const main = tree([{ path: 'a', type: 'blob', sha: 'x' }, { path: 'b', type: 'blob', sha: 'mainv' }]);
  const tip = tree([{ path: 'a', type: 'blob', sha: 'x' }, { path: 'b', type: 'blob', sha: 'tipv' },
                    { path: 'c', type: 'blob', sha: 'q' }]);
  const s = B.landedSignal(['a', 'b', 'c'], tip, main);
  assert.equal(s.nLanded + s.nDiffers + s.nMissing, s.nUnique,
    'landed + differs + missing must equal the touched total, which is what the chip claims');
  assert.deepEqual(s.differsPaths, ['b']);
  assert.deepEqual(s.missingPaths, ['c']);
});

test('countStates reads a map the caller already holds', () => {
  const st = new Map([['a', 'landed'], ['b', 'differs'], ['c', 'missing'], ['d', 'missing']]);
  assert.deepEqual(B.countStates(st), {
    nUnique: 4, nLanded: 1, nMissing: 2, nDiffers: 1,
    missingPaths: ['c', 'd'], differsPaths: ['b'],
  });
});

test('PATH_STATES names exactly the states pathStates can return', () => {
  const main = tree([{ path: 'a', type: 'blob', sha: 'x' }, { path: 'b', type: 'blob', sha: 'v' }]);
  const tip = tree([{ path: 'a', type: 'blob', sha: 'x' }, { path: 'b', type: 'blob', sha: 'w' },
                    { path: 'c', type: 'blob', sha: 'q' }]);
  const produced = new Set(B.pathStates(['a', 'b', 'c'], tip, main).values());
  const declared = new Set(B.PATH_STATES.map(s => s.key));
  assert.deepEqual([...produced].sort(), [...declared].sort());
  for (const s of B.PATH_STATES) assert.ok(s.label && s.hint, s.key + ' needs a label and a hint');
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

// ── scanBranchLive carries firstDate through both of its paths ────────────

const treeReq = (shas) => ({ tree: shas.map((sha, i) => ({ path: 'f' + i, type: 'blob', sha })) });

test('scanBranchLive reports firstDate from the compare it already runs', async () => {
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
  const r = await B.scanBranchLive(gh, { name: 'feat', sha: 'tipsha' }, main,
                                     { now: Date.parse('2026-07-09T00:00:00Z') });
  assert.equal(r.firstDate, '2026-07-02T00:00:00Z');
  assert.equal(r.date, '2026-07-08T00:00:00Z');   // tip is still the LAST entry
  assert.equal(r.subject, 'tip');
  assert.equal(r.aheadBy, 2);
});

test('scanBranchLive: no merge base means no honest start', async () => {
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
  const r = await B.scanBranchLive(gh, { name: 'rewritten', sha: 'tipsha' }, main,
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

test('dropFileUrl: inbox dir when plain, dump/ against cross-repo specs, stamped name', () => {
  const now = new Date('2026-08-08T14:05:00');
  const br = 'claude/some-branch';
  // A plain same-repo inbox dir is used as-is (trailing slash trimmed).
  assert.equal(
    B.dropFileUrl('o/r', br, 'inbox/', now),
    'https://github.com/o/r/new/claude/some-branch?filename=' + encodeURIComponent('inbox/2026-08-08-1405-drop.md'));
  // A cross-repo spec must never become a filename: web-tools' own inbox is
  // 'mehrlander/home:inbox/web-tools', which minted a nonsense path until
  // 2026-08-08. Spec-shaped (':' or '@') falls back to dump/.
  for (const inbox of ['mehrlander/home:inbox/web-tools', '@main:drops', undefined, '']) {
    assert.ok(B.dropFileUrl('o/r', br, inbox, now).includes(encodeURIComponent('dump/2026-08-08-1405-drop.md')),
      String(inbox));
  }
});

// ── Carrying a verdict instead of re-deriving it ─────────────────────────────
// A verdict is a function of exactly two inputs, the branch tip and the default
// branch, so neither having moved means the stored row IS the answer. Measured
// 2026-08-17: one refresh spent 98 of its 145 calls re-scanning branches whose
// tips had not moved in weeks, most of them in a repo whose rewritten history
// makes every compare 404 into a three-call fallback.
const priorOf = (rows) => new Map(rows.map(r => [r.name, r]));
const row = (name, sha, extra = {}) =>
  ({ name, sha, group: 'stranded', nUnique: 3, nLanded: 1, nMissing: 2,
     missingPaths: ['x', 'y'], noBase: false, ...extra });

test('needsScan: nothing moved, nothing to do', () => {
  const prior = priorOf([row('old', 's1')]);
  assert.equal(B.needsScan({ name: 'old', sha: 's1' }, prior, false), false);
  // The branch moved.
  assert.equal(B.needsScan({ name: 'old', sha: 's2' }, prior, false), true);
  // The default branch moved, so a landed/stranded call can genuinely change.
  assert.equal(B.needsScan({ name: 'old', sha: 's1' }, prior, true), true);
  // Never seen, so there is nothing to carry.
  assert.equal(B.needsScan({ name: 'new', sha: 's9' }, prior, false), true);
});

test('needsScan: a no-base row is carried while its tip holds', () => {
  // The one place cost beats exactness on purpose: a rewritten history 404s on
  // compare forever, so re-deriving costs three calls per branch per crawl for
  // a verdict about dead history. It refreshes when the branch itself moves.
  const prior = priorOf([row('ancient', 's1', { noBase: true })]);
  assert.equal(B.needsScan({ name: 'ancient', sha: 's1' }, prior, true), false);
  assert.equal(B.needsScan({ name: 'ancient', sha: 's2' }, prior, true), true);
});

test('needsScan: an errored row is carried, not retried on sight', () => {
  // It read the other way for a day. The log settled it: retrying every failed
  // row every crawl is what made one repo's dead branches the largest line in
  // the bill, and the failures were the same failures each time. Healing is
  // bounded instead, through scanOlder's errorRetry below.
  const prior = priorOf([row('flaky', 's1', { state: 'error' })]);
  assert.equal(B.needsScan({ name: 'flaky', sha: 's1' }, prior, true), false);
  assert.equal(B.needsScan({ name: 'flaky', sha: 's2' }, prior, true), true, 'until it moves');
});

test('scanOlder carries every row it can, and then makes no calls at all', async () => {
  const calls = [];
  const gh = { req: async (p) => { calls.push(p); return { tree: [] }; },
               compare: async () => { calls.push('compare'); return { files: [] }; },
               ago: () => 'a while ago' };
  const older = [{ name: 'a', sha: 's1', date: '2026-07-01T00:00:00Z' },
                 { name: 'b', sha: 's2', date: '2026-07-02T00:00:00Z' }];
  const prior = priorOf([row('a', 's1'), row('b', 's2')]);
  const out = await B.scanOlder(gh, { older, prior, mainSha: 'm1', priorMainSha: 'm1', now: Date.now() });
  // Not even the default tree: it is the scan's shared input, and nothing
  // needed scanning.
  assert.deepEqual(calls, []);
  assert.equal(out.scanned, 0);
  assert.equal(out.carried, 2);
  assert.deepEqual(out.rows.map(r => [r.name, r.group, r.carried]),
                   [['a', 'stranded', true], ['b', 'stranded', true]]);
});

test('a carried row keeps the fresh branch facts and the stored judgment', async () => {
  const gh = { req: async () => ({ tree: [] }), compare: async () => ({ files: [] }), ago: () => 'just now' };
  const older = [{ name: 'a', sha: 's1', date: '2026-08-16T00:00:00Z', ago: '1d ago', subject: 'newest subject' }];
  // The stored row's own date and subject are from the last scan; the branch
  // list is this pass's, so it wins on everything but the verdict.
  const prior = priorOf([row('a', 's1', { date: '2026-07-01T00:00:00Z', ago: '6w ago', subject: 'stale subject' })]);
  const out = await B.scanOlder(gh, { older, prior, mainSha: 'm1', priorMainSha: 'm1', now: Date.now() });
  assert.equal(out.rows[0].ago, '1d ago');
  assert.equal(out.rows[0].subject, 'newest subject');
  assert.equal(out.rows[0].nMissing, 2);
  assert.deepEqual(out.rows[0].missingPaths, ['x', 'y']);
});

test('with no prior at all, everything is scanned, as before', async () => {
  const calls = [];
  const gh = { req: async (p) => { calls.push(p); return { tree: [] }; },
               compare: async () => ({ files: [], ahead_by: 1, behind_by: 0, commits: [] }),
               ago: () => 'a while ago' };
  const older = [{ name: 'a', sha: 's1', date: '2026-07-01T00:00:00Z' }];
  const out = await B.scanOlder(gh, { older, now: Date.now() });
  assert.equal(out.scanned, 1);
  assert.equal(out.carried, 0);
  assert.ok(calls.some(c => c.startsWith('git/trees/main')), 'the default tree is read once');
});

test('an errored row is carried, and healed a few at a time', async () => {
  // A branch whose scan failed fails again for the same reason, so retrying
  // all of them every crawl is pure cost: one repo spent 93 calls of a 183-call
  // run that way, 56 of them failing. `errorRetry` heals a bounded few, so a
  // transient failure is not frozen forever and a permanent one is not paid for
  // forever either.
  const seen = [];
  const gh = { req: async () => ({ tree: [] }),
               compare: async () => ({ files: [], ahead_by: 0, behind_by: 0, commits: [] }),
               ago: () => 'a while ago' };
  const older = ['a', 'b', 'c', 'd'].map(n => ({ name: n, sha: 's' + n, date: '2026-07-01T00:00:00Z' }));
  const prior = priorOf(older.map(b => row(b.name, b.sha, { state: 'error' })));
  const out = await B.scanOlder(gh, { older, prior, mainSha: 'm1', priorMainSha: 'm1',
                                        errorRetry: 2, now: Date.now(), onRow: r => seen.push(r) });
  assert.equal(out.scanned, 2, 'two healed this pass');
  assert.equal(out.carried, 2, 'the rest carried, errors and all');
  // With no retry allowance at all, nothing is re-derived.
  const quiet = await B.scanOlder(gh, { older, prior, mainSha: 'm1', priorMainSha: 'm1', now: Date.now() });
  assert.equal(quiet.scanned, 0);
});
