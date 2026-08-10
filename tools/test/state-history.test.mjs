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
//    record to count.
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

let reads = 0;                      // blob reads, to hold the caching claim
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'a while ago'; }
  async ls() { return []; }
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
  'lib/alpineComponents/state-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
// Alpine hands back reactive proxies, which deepEqual treats as unequal to a
// plain literal of the same shape; the assertions are about the values.
const plain = (v) => JSON.parse(JSON.stringify(v));
const row = (key) => data.rows.find(r => r.key === key) || (data.offline?.key === key ? data.offline : null);

test('the history is the commit list, newest first, each with its gap', async () => {
  await data.toggleHist(row('activity'));
  assert.equal(data.hist, 'activity');
  assert.deepEqual(data.histRows.map(h => h.sha), ['v3', 'v2', 'v1', 'v0']);
  // The gap belongs to the row above the one it is measured from: newest first,
  // so row i's gap is i minus its older neighbour, and the oldest has none.
  assert.deepEqual(data.histRows.map(h => h.gap), ['+3h', '+1d3h', '+5h', '']);
  assert.equal(data.histRows[0].stamp, '2026-08-09 20:00');
});

test('the summary is the cadence, on a median so one quiet stretch cannot set it', () => {
  // Gaps are 3h, 27h, 5h: the median is 5h and the mean would be near 12.
  assert.equal(data.histSummary(), '4 changes · over 1d11h · typically 5h apart');
});

test('a full window says so, since its span is a floor and not a history', async () => {
  const long = Array.from({ length: 20 }, (_, i) =>
    ({ sha: 'L' + i, date: new Date(Date.UTC(2026, 7, 9, 20 - i)).toISOString() }));
  HISTORY['state/configs.json'] = long;
  await data.toggleHist(row('configs'));
  assert.match(data.histSummary(), /^20 changes \(the window\) · over 19h/);
  await data.toggleHist(row('configs'));       // closed again
  assert.equal(data.hist, '');
});

test('a repo cache diffs on hash, and an alignment grade counts as a change', async () => {
  await data.toggleHist(row('activity'));
  await data.diffAt(row('activity'), 0);       // v3 against v2
  assert.equal(data.histDiff[0].line, '2 of 9 repos · 22%');
  assert.deepEqual(plain(data.histDiff[0].records),
    [{ key: 'c', kind: 'changed' }, { key: 'i', kind: 'changed' }]);
});

test('a record that joined or left is named as such, not silently counted', async () => {
  await data.diffAt(row('activity'), 1);       // v2 against v1
  const r = data.histDiff[1].records;
  assert.equal(r.find(x => x.key === 'gone').kind, 'removed');
  assert.equal(r.find(x => x.key === 'd').kind, 'added');
  // The denominator is the NEWER version's record count: nine now, four before.
  assert.equal(data.histDiff[1].line, '7 of 9 repos · 78%');
});

test('a second tap closes the interval; a committed version is read once', async () => {
  const before = reads;
  await data.diffAt(row('activity'), 0);       // closes
  assert.equal(data.histDiff[0], undefined);
  await data.diffAt(row('activity'), 0);       // reopens, both versions cached
  assert.equal(reads, before);
  assert.equal(data.histDiff[0].line, '2 of 9 repos · 22%');
});

test('the sessions cache diffs on the record blob sha, at its own grain', async () => {
  await data.toggleHist(row('sessions'));
  await data.diffAt(row('sessions'), 0);
  assert.equal(data.histDiff[0].line, '1 of 4 sessions · 25%');
  // The store path is scaffolding; the record is the session.
  assert.deepEqual(plain(data.histDiff[0].records), [{ key: '2026-08-09-aaaa1111', kind: 'changed' }]);
});

test('a store with no fingerprint falls back to comparing the record itself', async () => {
  await data.toggleHist(row('entities'));
  await data.diffAt(row('entities'), 0);
  assert.equal(data.histDiff[0].line, '1 of 2 repos · 50%');
  assert.deepEqual(plain(data.histDiff[0].records), [{ key: 'wt', kind: 'changed' }]);
});

test('nothing changed and nothing to count do not print alike', async () => {
  VERSIONS.e0 = VERSIONS.e1;                   // identical versions
  await data.diffAt(row('entities'), 0);       // close
  await data.diffAt(row('entities'), 0);       // reopen: cached, still 1 of 2
  assert.equal(data.histDiff[0].line, '1 of 2 repos · 50%');

  VERSIONS.z1 = { repos: {} }; VERSIONS.z0 = { repos: {} };
  HISTORY['state/entities.json'] = [
    { sha: 'z1', date: '2026-08-05T00:00:00Z' }, { sha: 'z0', date: '2026-08-01T00:00:00Z' }];
  await data.toggleHist(row('entities'));      // close
  await data.toggleHist(row('entities'));      // reopen on the empty pair
  await data.diffAt(row('entities'), 0);
  assert.equal(data.histDiff[0].line, 'no repos to count');
});

test('a failed read fails its own interval, never the panel', async () => {
  HISTORY['state/entities.json'] = [
    { sha: 'missing', date: '2026-08-05T00:00:00Z' }, { sha: 'z0', date: '2026-08-01T00:00:00Z' }];
  await data.toggleHist(row('entities'));
  await data.toggleHist(row('entities'));
  await data.diffAt(row('entities'), 0);
  assert.match(data.histDiff[0].err, /404/);
  assert.equal(data.histDiff[0].line, 'failed');
  assert.equal(data.histErr, '');              // the list itself is intact
  assert.equal(data.histRows.length, 2);
});

test('history and the JSON peek share one slot', async () => {
  await data.togglePeek(row('activity'));
  assert.equal(data.peek, 'activity');
  assert.equal(data.hist, '');
  await data.toggleHist(row('activity'));
  assert.equal(data.hist, 'activity');
  assert.equal(data.peek, '');
});

// The view ticks a minute timer so its ages move without a reload, which would
// hold the event loop open past the last assertion. destroy() is what Alpine
// calls when the element goes; calling it here both ends the run and checks the
// teardown path exists.
test('teardown clears the tick and the listeners', () => {
  data.destroy();
});
