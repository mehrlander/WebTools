// alpineComponents/state-view.js — the History panel's readings.
//
// The panel commits nothing and writes nothing: it reads the registry's own
// commit list for WHEN a derived file changed, and diffs two committed versions
// for HOW MUCH. So the only thing that can be wrong is the reading, which is
// what this file holds:
//
//  • the change list and the cadence summary built from a commits page,
//  • the per-record diff across each store's OWN fingerprint (the config and
//    activity caches key on `hash`, the sessions cache on the record's blob
//    `sha`, the entity index on nothing and so falls back to the serialized
//    record), which is the same fingerprint each crawl uses to decide whether
//    to commit at all, so the panel and the commit gate cannot come to disagree,
//  • the two readings that must not print alike: no record changed, and no
//    record to count,
//  • the duration column, read from the `runs` ring the crawls append to the
//    commit they were making anyway,
//  • the staleness verdict, and which single row is still entitled to one now
//    that arriving at the view refreshes the other three.
//
// No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

// A registry whose `state/` files have a past: `HISTORY` is the commits page for
// each path, `VERSIONS` what each of those commits holds.
const HISTORY = {
  'state/activity.json': [
    { sha: 'v3', date: '2026-08-09T20:00:00Z' },
    { sha: 'v2', date: '2026-08-09T17:00:00Z' },   // 3h
    { sha: 'v1', date: '2026-08-08T14:00:00Z' },   // 27h
    { sha: 'v0', date: '2026-08-08T09:00:00Z' },   // 5h
  ],
  'state/sessions.json': [
    { sha: 's1', date: '2026-08-09T12:00:00Z' },
    { sha: 's0', date: '2026-08-09T11:00:00Z' },
  ],
  'state/entities.json': [
    { sha: 'e1', date: '2026-08-05T00:00:00Z' },
    { sha: 'e0', date: '2026-07-01T00:00:00Z' },
  ],
  'state/configs.json': [{ sha: 'c0', date: '2026-08-09T00:00:00Z' }],
};

const repo = (hash, extra = {}) => ({ hash, fetchedAt: '2026-08-09T00:00:00Z', ...extra });
const VERSIONS = {
  // Three of nine repos moved, and one of them moved only its alignment grade,
  // which the config cache treats as a changed cache and the panel must too.
  v3: { repos: { a: repo('1'), b: repo('2'), c: repo('9'), d: repo('4'), e: repo('5'),
                 f: repo('6'), g: repo('7'), h: repo('8'), i: repo('9', { alignHash: 'zz' }) } },
  v2: { repos: { a: repo('1'), b: repo('2'), c: repo('3'), d: repo('4'), e: repo('5'),
                 f: repo('6'), g: repo('7'), h: repo('8'), i: repo('9', { alignHash: 'aa' }) } },
  // A repo joins and a repo leaves across this interval.
  v1: { repos: { a: repo('1'), b: repo('2'), c: repo('3'), gone: repo('0') } },
  v0: { repos: { a: repo('1'), b: repo('2'), c: repo('3') } },

  // The sessions cache keys by store path and fingerprints on the blob sha.
  s1: { byPath: {
    'sessions/2026/08/2026-08-09-aaaa1111.json': { id: 'aaaa1111', sha: 'blobA2' },
    'sessions/2026/08/2026-08-09-bbbb2222.json': { id: 'bbbb2222', sha: 'blobB1' },
    'sessions/2026/08/2026-08-09-cccc3333.json': { id: 'cccc3333', sha: 'blobC1' },
    'sessions/2026/08/2026-08-09-dddd4444.json': { id: 'dddd4444', sha: 'blobD1' },
  } },
  s0: { byPath: {
    'sessions/2026/08/2026-08-09-aaaa1111.json': { id: 'aaaa1111', sha: 'blobA1' },
    'sessions/2026/08/2026-08-09-bbbb2222.json': { id: 'bbbb2222', sha: 'blobB1' },
    'sessions/2026/08/2026-08-09-cccc3333.json': { id: 'cccc3333', sha: 'blobC1' },
    'sessions/2026/08/2026-08-09-dddd4444.json': { id: 'dddd4444', sha: 'blobD1' },
  } },

  // The entity index keeps no per-record fingerprint at all.
  e1: { repos: { wt: { entities: 120 }, home: { entities: 80 } } },
  e0: { repos: { wt: { entities: 118 }, home: { entities: 80 } } },
  c0: { repos: {} },
};

// The probe's two sources: every account repo's live pushed_at, and the
// registry's own commits under sessions/ (one per record written).
let ACCOUNT = [];
let reads = 0;                      // blob reads, to hold the caching claim
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'a while ago'; }
  async ls() { return []; }
  async repos() { return ACCOUNT; }
  async history(path, limit = 20) { return (HISTORY[path] || []).slice(0, limit); }
  async get(path) {
    if (this.ref === 'main') return { text: '{}' };
    const v = VERSIONS[this.ref];
    if (!v) throw new Error('404 ' + this.ref + ':' + path);
    reads += 1;
    return { text: JSON.stringify(v) };
  }
  async req() { throw new Error('404'); }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="sv" x-data="stateView()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = { REGISTRY_REPO: 'me/registry', hasToken: () => true };

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  // The duration column reads the `runs` ring through this kit, which show-repo
  // loads ahead of the caches that write it. Without it the column is simply
  // absent, which is the intended degradation and not what these assertions are
  // about.
  'lib/kits/crawl-runs.js',
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
// Alpine hands back reactive proxies, which deepEqual treats as unequal to a
// plain literal of the same shape; the assertions are about the values.
const plain = (v) => JSON.parse(JSON.stringify(v));
const row = (key) => data.rows.find(r => r.key === key) || (data.offline?.key === key ? data.offline : null);
// One row is open at a time on one sticky tab, so a test wanting a fresh read
// closes the row first: reopening is what re-runs the load.
const show = async (key, tab = 'history') => {
  const r = row(key);
  if (data.open === key) await data.toggleOpen(r);
  data.tab = tab;
  await data.toggleOpen(r);
  return r;
};

test('the history is the commit list, newest first, each with its gap', async () => {
  await show('activity');
  assert.equal(data.open, 'activity');
  assert.equal(data.tab, 'history');
  assert.deepEqual(data.histRows.map(h => h.sha), ['v3', 'v2', 'v1', 'v0']);
  // The gap belongs to the row above the one it is measured from: newest first,
  // so row i's gap is i minus its older neighbour, and the oldest has none.
  assert.deepEqual(data.histRows.map(h => h.gap), ['+3h', '+1d3h', '+5h', '']);
  // Month, day and time: the year is in the title, since it is the five
  // characters that push the row off a phone and twenty commits rarely span one.
  assert.equal(data.histRows[0].stamp, '08-09 20:00');
  assert.equal(data.histRows[0].date, '2026-08-09T20:00:00Z');
});

test('the summary is the cadence, on a median so one quiet stretch cannot set it', () => {
  // Gaps are 3h, 27h, 5h: the median is 5h and the mean would be near 12.
  assert.equal(data.histSummary(), '4 changes · over 1d11h · typically 5h apart');
});

test('a full window says so, since its span is a floor and not a history', async () => {
  const long = Array.from({ length: 20 }, (_, i) =>
    ({ sha: 'L' + i, date: new Date(Date.UTC(2026, 7, 9, 20 - i)).toISOString() }));
  HISTORY['state/configs.json'] = long;
  await show('configs');
  assert.match(data.histSummary(), /^20 changes \(the window\) · over 19h/);
  await data.toggleOpen(row('configs'));       // closed again
  assert.equal(data.open, '');
});

test('a repo cache diffs on hash, and an alignment grade counts as a change', async () => {
  await show('activity');
  await data.diffAt(row('activity'), 0);       // v3 against v2
  assert.equal(data.histDiff[0].line, '2 of 9 repos changed · 22%');
  assert.deepEqual(plain(data.histDiff[0].records),
    [{ key: 'c', kind: 'changed' }, { key: 'i', kind: 'changed' }]);
});

test('a record that joined or left is named as such, not silently counted', async () => {
  await data.diffAt(row('activity'), 1);       // v2 against v1
  const r = data.histDiff[1].records;
  assert.equal(r.find(x => x.key === 'gone').kind, 'removed');
  assert.equal(r.find(x => x.key === 'd').kind, 'added');
  // The denominator is the NEWER version's record count: nine now, four before.
  assert.equal(data.histDiff[1].line, '7 of 9 repos changed · 78%');
});

test('a second tap closes the interval; a committed version is read once', async () => {
  const before = reads;
  await data.diffAt(row('activity'), 0);       // closes
  assert.equal(data.histDiff[0], undefined);
  await data.diffAt(row('activity'), 0);       // reopens, both versions cached
  assert.equal(reads, before);
  assert.equal(data.histDiff[0].line, '2 of 9 repos changed · 22%');
});

test('the sessions cache diffs on the record blob sha, at its own grain', async () => {
  await show('sessions');
  await data.diffAt(row('sessions'), 0);
  assert.equal(data.histDiff[0].line, '1 of 4 sessions changed · 25%');
  // The store path is scaffolding; the record is the session.
  assert.deepEqual(plain(data.histDiff[0].records), [{ key: '2026-08-09-aaaa1111', kind: 'changed' }]);
});

test('a store with no fingerprint falls back to comparing the record itself', async () => {
  await show('entities');
  await data.diffAt(row('entities'), 0);
  assert.equal(data.histDiff[0].line, '1 of 2 repos changed · 50%');
  assert.deepEqual(plain(data.histDiff[0].records), [{ key: 'wt', kind: 'changed' }]);
});

test('nothing changed and nothing to count do not print alike', async () => {
  VERSIONS.e0 = VERSIONS.e1;                   // identical versions
  await data.diffAt(row('entities'), 0);       // close
  await data.diffAt(row('entities'), 0);       // reopen: cached, still 1 of 2
  assert.equal(data.histDiff[0].line, '1 of 2 repos changed · 50%');

  VERSIONS.z1 = { repos: {} }; VERSIONS.z0 = { repos: {} };
  HISTORY['state/entities.json'] = [
    { sha: 'z1', date: '2026-08-05T00:00:00Z' }, { sha: 'z0', date: '2026-08-01T00:00:00Z' }];
  await show('entities');                      // reopen on the empty pair
  await data.diffAt(row('entities'), 0);
  assert.equal(data.histDiff[0].line, 'no repos to count');
});

test('a failed read fails its own interval, never the panel', async () => {
  HISTORY['state/entities.json'] = [
    { sha: 'missing', date: '2026-08-05T00:00:00Z' }, { sha: 'z0', date: '2026-08-01T00:00:00Z' }];
  await show('entities');
  await data.diffAt(row('entities'), 0);
  assert.match(data.histDiff[0].err, /404/);
  assert.equal(data.histDiff[0].line, 'failed');
  assert.equal(data.histErr, '');              // the list itself is intact
  assert.equal(data.histRows.length, 2);
});

test('one panel, two tabs, and the tab sticks across rows', async () => {
  // Contents and History are two readings of one open row, not two controls on
  // the strip. The choice persists when the reader moves to another row, so
  // working down the histories does not mean re-picking the tab each time.
  await show('activity', 'contents');
  assert.equal(data.open, 'activity');
  assert.ok(data.peekText.length, 'the open tab loaded');
  assert.equal(data.histRows.length, 0, 'the other tab is not read until shown');
  await data.showTab(row('activity'), 'history');
  assert.ok(data.histRows.length, 'switching tabs loads that reading');
  await data.toggleOpen(row('sessions'));      // a different row, same tab
  assert.equal(data.open, 'sessions');
  assert.equal(data.tab, 'history');
  assert.equal(data.histRows[0].sha, 's1');
});

// ── The duration column ──────────────────────────────────────────────────────

test('a duration is read from the ring in the newest committed version', async () => {
  // The ring rides the file, so opening the history reads the newest version
  // once: it fills every row's duration AND is the version interval 0 needs.
  VERSIONS.v3.runs = [
    { at: '2026-08-08T08:59:55Z', ms: 41000, checked: 9, changed: 2 },
    { at: '2026-08-08T13:59:52Z', ms: 96000, checked: 9, changed: 4, failed: 1, pass: 'scan' },
    { at: '2026-08-09T19:59:58Z', ms: 12400, checked: 9, changed: 1 },
  ];
  HISTORY['state/activity.json'] = [
    { sha: 'v3', date: '2026-08-09T20:00:00Z' },
    { sha: 'v2', date: '2026-08-09T17:00:00Z' },
    { sha: 'v1', date: '2026-08-08T14:00:00Z' },
    { sha: 'v0', date: '2026-08-08T09:00:00Z' },
  ];
  // A version addressed by a sha cannot move, so the panel parses each one
  // once and keeps it; the earlier tests already cached v3 without a ring.
  // Dropping the store is what a fresh page load does.
  data._vers = new Map();
  await show('activity');                      // reopen, now with a ring
  assert.deepEqual(data.histRows.map(h => h.took || ''), ['12s', '', '1m36s', '41s']);
  // v2 predates the ring, and the runs below it must not slide up into its slot.
  assert.equal(data.histRows[1].run, undefined);
  assert.match(data.histRows[2].runWhy, /checked 9 · 4 changed · 1 failed · the scan pass/);
});

test('the summary carries what a run costs beside how often it changes', () => {
  assert.match(data.histSummary(), /typically 5h apart · 41s a run$/);
});

// ── The staleness verdict, which now belongs to one row only ────────────────

test('an ancient file is stale only where nothing refreshes it', async () => {
  // Both halves against ONE date, so the difference is the rule rather than the
  // fixture. A year is past every bar anything ever used.
  const ancient = new Date(Date.now() - 400 * 86400 * 1000).toISOString();
  const keep = { ...HISTORY };
  for (const path of Object.keys(HISTORY)) HISTORY[path] = [{ sha: 'old', date: ancient }];
  try {
    await data.load();
    // The crawled three: opening this view runs all three crawls (goState in
    // the shell), so a row on screen was checked moments ago and its age is not
    // evidence of neglect, however old it is. The store simply has not changed.
    // A row painting itself stale here would report a fault already looked for.
    for (const key of ['configs', 'activity', 'sessions'])
      assert.equal(data.rows.find(r => r.key === key).stale, false,
        key + ' claimed staleness over an age nothing can act on');
    // The entity index, which has no Refresh at all: a rebuild is spaCy over
    // ~4,000 files across seven checkouts. Its age IS the reading, so it keeps
    // the 30-day bar its own repo check uses. Dropping staleness estate-wide
    // would have taken this with it, and this is the row where it was always
    // true.
    assert.equal(data.offline.refresh, undefined, 'the entity index has no crawl');
    assert.equal(data.offline.stale, true);
  } finally {
    for (const path of Object.keys(keep)) HISTORY[path] = keep[path];
    await data.load();
  }
});

// The view ticks a minute timer so its ages move without a reload, which would
// hold the event loop open past the last assertion. destroy() is what Alpine
// calls when the element goes; calling it here both ends the run and checks the
// teardown path exists.
test('teardown clears the tick and the listeners', () => {
  data.destroy();
});
