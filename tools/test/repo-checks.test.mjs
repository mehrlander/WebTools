// repo-checks.js — the pure declared-check evaluator. Run the IIFE against a
// window stub and exercise each of the five kinds with a stubbed reader, plus
// the three-valued `ok` that keeps an unevaluable check from reading as a pass.
//
// The reader is stubbed rather than mocked over fetch on purpose: the module's
// whole contract is that it does no network, so a test that needed one would be
// testing the wrong thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/repo-checks.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const C = window.RepoChecks;

const NOW = new Date('2026-07-31T00:00:00Z');

// Every field optional: a test supplies only what its kind reads, and anything
// unstubbed answers "absent" rather than throwing, which is also what the real
// reader does for a missing path.
function reader({ files = {}, tree = [], commits = {} } = {}) {
  return {
    now: () => NOW,
    text: async p => (p in files ? files[p] : null),
    tree: async () => tree,
    lastCommitDate: async p => (p in commits ? commits[p] : null),
  };
}

const only = async (check, r) => (await C.evaluate([check], r))[0];

test('content-date passes inside its window and fails outside it', async () => {
  const check = {
    kind: 'content-date', path: 'chron/sweeps.md',
    pattern: '## Run (\\d{4}-\\d{2}-\\d{2})', staleAfterDays: 30, label: 'sweep',
  };
  const fresh = await only(check, reader({ files: { 'chron/sweeps.md': '# Sweeps\n\n## Run 2026-07-18\n' } }));
  assert.equal(fresh.ok, true, '13 days old should pass a 30-day window');
  assert.equal(fresh.label, 'sweep');

  const stale = await only(check, reader({ files: { 'chron/sweeps.md': '## Run 2026-05-01\n' } }));
  assert.equal(stale.ok, false);
  assert.match(stale.detail, /91d since 2026-05-01, over 30d/);
});

test('content-date reads only the FIRST match, so a newest-first log works', async () => {
  // chron/sweeps.md is newest-first, so the top heading is the live one. A
  // check that scanned for the oldest date would report a repo as stale forever.
  const r = reader({ files: { 's.md': '## Run 2026-07-30\n...\n## Run 2026-01-01\n' } });
  const out = await only({ kind: 'content-date', path: 's.md', pattern: '## Run (\\d{4}-\\d{2}-\\d{2})', staleAfterDays: 30 }, r);
  assert.equal(out.ok, true);
});

test('file-age measures the last commit that touched the path', async () => {
  const check = { kind: 'file-age', path: 'full-picture.md', staleAfterDays: 60 };
  const ok = await only(check, reader({ commits: { 'full-picture.md': '2026-07-30T12:00:00Z' } }));
  assert.equal(ok.ok, true);
  const old = await only(check, reader({ commits: { 'full-picture.md': '2026-01-01T00:00:00Z' } }));
  assert.equal(old.ok, false);
  assert.match(old.detail, /over 60d/);
});

test('newer-than compares a built file against its sources, and equal is current', async () => {
  const check = { kind: 'newer-than', path: 'dist/web-tools.js', sources: ['lib/'], label: 'prebuild' };

  const behind = await only(check, reader({ commits: {
    'dist/web-tools.js': '2026-07-20T00:00:00Z', 'lib/': '2026-07-30T00:00:00Z' } }));
  assert.equal(behind.ok, false);
  assert.match(behind.detail, /10d behind lib\//);

  // The build-on-commit hook stages the generated file INTO the same commit as
  // its source, so the two share a timestamp. Treating equal as stale would
  // fire on every correct build, which is the fastest way to get a check muted.
  const same = await only(check, reader({ commits: {
    'dist/web-tools.js': '2026-07-30T00:00:00Z', 'lib/': '2026-07-30T00:00:00Z' } }));
  assert.equal(same.ok, true);
  assert.equal(same.detail, 'current with sources');
});

test('newer-than takes the NEWEST source when several are declared', async () => {
  const out = await only(
    { kind: 'newer-than', path: 'out.js', sources: ['a/', 'b/'] },
    reader({ commits: { 'out.js': '2026-07-25T00:00:00Z', 'a/': '2026-07-01T00:00:00Z', 'b/': '2026-07-30T00:00:00Z' } }));
  assert.equal(out.ok, false, 'one stale source is enough, even when another is older than the build');
});

test('absent globs across directories and names what it found', async () => {
  const check = { kind: 'absent', path: '**/BRANCH-GUIDE.md', label: 'stray guide' };
  const clean = await only(check, reader({ tree: [{ path: 'docs/README.md' }] }));
  assert.equal(clean.ok, true);

  const dirty = await only(check, reader({ tree: [
    { path: 'BRANCH-GUIDE.md' }, { path: 'docs/BRANCH-GUIDE.md' }, { path: 'docs/README.md' } ] }));
  assert.equal(dirty.ok, false);
  assert.match(dirty.detail, /2 present/);
  // `**/` has to match at the root too, or the top-level stray is invisible.
  assert.match(dirty.detail, /(^|[ ,])BRANCH-GUIDE\.md/);
});

test('absent uses * that stops at a separator', async () => {
  const out = await only({ kind: 'absent', path: 'docs/*.tmp' },
    reader({ tree: [{ path: 'docs/deep/x.tmp' }] }));
  assert.equal(out.ok, true, 'a single star must not span a directory boundary');
});

test('dir-count ignores .gitkeep, so a placeholder folder reads as empty', async () => {
  const check = { kind: 'dir-count', path: 'chron/dump', staleOver: 0, label: 'dump' };
  const empty = await only(check, reader({ tree: [
    { path: 'chron/dump/.gitkeep' }, { path: 'chron/index.md' } ] }));
  assert.equal(empty.ok, true);
  assert.match(empty.detail, /^0 files/);

  const full = await only(check, reader({ tree: [
    { path: 'chron/dump/.gitkeep' }, { path: 'chron/dump/a.md' }, { path: 'chron/dump/b.md' } ] }));
  assert.equal(full.ok, false);
  assert.match(full.detail, /2 files, over 0/);
});

test('dir-count counts nested files and stays inside its own directory', async () => {
  const out = await only({ kind: 'dir-count', path: 'inbox', staleOver: 0 },
    reader({ tree: [{ path: 'inbox/a/b.md' }, { path: 'inboxes/c.md' }, { path: 'inbox.md' }] }));
  assert.equal(out.ok, false);
  assert.match(out.detail, /^1 file,/, 'a sibling with a shared prefix must not be counted');
});

test('an unevaluable check is null, never a pass', async () => {
  // The failure this whole mechanism exists to prevent is a silent one, so a
  // check invalidated by a rename must not read as green.
  const missing = await only(
    { kind: 'content-date', path: 'gone.md', pattern: '(\\d{4})', staleAfterDays: 30 }, reader({}));
  assert.equal(missing.ok, null);
  assert.match(missing.detail, /not found/);

  const nomatch = await only(
    { kind: 'content-date', path: 's.md', pattern: '## Run (\\d{4}-\\d{2}-\\d{2})', staleAfterDays: 30 },
    reader({ files: { 's.md': 'nothing dated here' } }));
  assert.equal(nomatch.ok, null);
  assert.match(nomatch.detail, /matched nothing/);

  const unknown = await only({ kind: 'invented', path: 'x' }, reader({}));
  assert.equal(unknown.ok, null);
  assert.match(unknown.detail, /unknown check kind/);
});

test('a reader that rejects loses one check, not the panel', async () => {
  const angry = {
    now: () => NOW,
    text: async () => { throw new Error('boom'); },
    tree: async () => [{ path: 'ok.md' }],
    lastCommitDate: async () => null,
  };
  const out = await C.evaluate([
    { kind: 'content-date', path: 'a.md', pattern: '(x)', staleAfterDays: 1, label: 'first' },
    { kind: 'absent', path: '**/nope.md', label: 'second' },
  ], angry);
  assert.equal(out.length, 2);
  assert.equal(out[0].ok, null);
  assert.match(out[0].detail, /check errored: boom/);
  assert.equal(out[1].ok, true, 'the healthy check still reports');
});

test('notable puts real failures ahead of checks that could not run', async () => {
  const results = [
    { label: 'a', ok: true }, { label: 'b', ok: null },
    { label: 'c', ok: false }, { label: 'd', ok: true },
  ];
  assert.deepEqual(C.failing(results).map(r => r.label), ['c']);
  assert.deepEqual(C.unevaluable(results).map(r => r.label), ['b']);
  assert.deepEqual(C.notable(results).map(r => r.label), ['c', 'b']);
});

test('no checks declared means no work and no results', async () => {
  // The opt-in has to be free: a repo that declares nothing must not cost a
  // single call, or every repo pays for a feature only some use.
  let touched = false;
  const spy = { now: () => NOW,
    text: async () => { touched = true; return null; },
    tree: async () => { touched = true; return []; },
    lastCommitDate: async () => { touched = true; return null; } };
  assert.deepEqual(await C.evaluate(undefined, spy), []);
  assert.deepEqual(await C.evaluate([], spy), []);
  assert.equal(touched, false);
});

// ── The probe/verdict split ────────────────────────────────────────────────
// The split exists so results can be cached without the cache rehashing daily.
// These are the properties that has to hold, stated directly.

test('a probed fact is time-independent, so caching it cannot churn the hash', async () => {
  const checks = [
    { kind: 'content-date', path: 's.md', pattern: '## Run (\\d{4}-\\d{2}-\\d{2})', staleAfterDays: 30, label: 'sweep' },
    { kind: 'dir-count', path: 'dump', staleOver: 0, label: 'dump' },
  ];
  const r = reader({ files: { 's.md': '## Run 2026-07-18\n' }, tree: [{ path: 'dump/a.md' }] });

  const early = await C.probe(checks, r);
  const late = await C.probe(checks, { ...r, now: () => new Date('2027-01-01T00:00:00Z') });

  // Same repo content, a clock six months apart, byte-identical facts. This is
  // what keeps repo-activity-cache's material hash stable across crawls; store
  // verdicts instead and every entry rehashes every day forever.
  assert.equal(JSON.stringify(early), JSON.stringify(late));
  assert.deepEqual(early[0].fact, { date: '2026-07-18' });
  assert.deepEqual(early[1].fact, { count: 1 });
});

test('the same facts yield different verdicts as the clock moves', async () => {
  const check = { kind: 'content-date', path: 's.md', pattern: '## Run (\\d{4}-\\d{2}-\\d{2})', staleAfterDays: 30, label: 'sweep' };
  const probed = await C.probe([check], reader({ files: { 's.md': '## Run 2026-07-18\n' } }));

  assert.equal(C.verdict(probed, new Date('2026-07-31T00:00:00Z'))[0].ok, true);
  // No re-probe, no network: a card renders a correctly staler answer from the
  // same cached fact long after the crawl that produced it.
  assert.equal(C.verdict(probed, new Date('2026-09-30T00:00:00Z'))[0].ok, false);
});

test('facts survive the JSON round-trip the cache puts them through', async () => {
  const checks = [
    { kind: 'absent', path: '**/BRANCH-GUIDE.md', label: 'stray' },
    { kind: 'newer-than', path: 'dist/x.js', sources: ['lib/'], label: 'build' },
  ];
  const probed = await C.probe(checks, reader({
    tree: [{ path: 'docs/BRANCH-GUIDE.md' }],
    commits: { 'dist/x.js': '2026-07-01T00:00:00Z', 'lib/': '2026-07-20T00:00:00Z' },
  }));
  const revived = JSON.parse(JSON.stringify(probed));
  assert.deepEqual(C.verdict(revived, NOW), C.verdict(probed, NOW));
  const out = C.verdict(revived, NOW);
  assert.equal(out[0].ok, false);
  assert.match(out[0].detail, /1 present/);
  assert.equal(out[1].ok, false);
  assert.match(out[1].detail, /19d behind lib\//);
});

test('an absent fact caps the paths it carries but keeps the true count', async () => {
  // The count is the finding; the examples are courtesy. An unbounded list
  // would put a whole directory into a cache several repos share.
  const tree = Array.from({ length: 25 }, (_, i) => ({ path: `d${i}/BRANCH-GUIDE.md` }));
  const probed = await C.probe([{ kind: 'absent', path: '**/BRANCH-GUIDE.md' }], reader({ tree }));
  assert.equal(probed[0].fact.n, 25);
  assert.equal(probed[0].fact.hits.length, C.HIT_CAP);
  assert.match(C.verdict(probed, NOW)[0].detail, /^25 present/);
});

test('verdict on an unprobed or errored entry is null, never a pass', () => {
  assert.equal(C.verdict([{ check: { kind: 'absent', label: 'x' }, error: 'tree unavailable' }], NOW)[0].ok, null);
  assert.equal(C.verdict([null], NOW)[0].ok, null);
  assert.deepEqual(C.verdict(undefined, NOW), []);
});
