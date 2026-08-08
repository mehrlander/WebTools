// The sessions aggregate: summarize one record, fold many, and decide what a
// crawl must re-read.
//
// This cache is the only one of the three whose SOURCE is a captured layer, and
// captured means unregenerable. So the assertions here lean on the two places
// that can quietly lose something: the scope rule (a pass that did not look at a
// record must not delete its row) and the sha-keyed refetch (the live session's
// record rewrites every Stop, and a crawl that misses that shows a session
// frozen at its first turn).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/repo-sessions-cache.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win);
  return win.RepoSessionsCache;
}

const S = load();

// A schema-3 record, trimmed to the fields the summary reads.
function record(over = {}) {
  return {
    schema: 3,
    session_id: 'b8fae678-e673-5c76-bea7-d52828fba16a',
    short: 'b8fae678',
    agent_session: 'https://claude.ai/code/session_01SXuNTtUx1sdmoQPbLE3Bqk',
    day: '2026-08-05',
    started: '2026-08-05T13:51:08Z',
    ended: '2026-08-05T16:49:16Z',
    repos: [
      { name: 'web-tools', lines: 572, branch: 'claude/sessions-tab-3j05zm', head: 'abc1234' },
      { name: 'home', lines: 3, branch: 'claude/sessions-tab-3j05zm', head: 'def5678' },
    ],
    opening_ask: 'Add a sessions tab to the activity view',
    exchanges: 10,
    assistant_messages: 340,
    tools: { Bash: 132, Edit: 34, Read: 17, Grep: 3 },
    tokens: { input: 624, output: 337631, cache_read: 92466018, cache_write: 3979906 },
    files_total: 3,
    files: {
      'web-tools/lib/estate.js': { read: 2, edit: 9 },
      'web-tools/docs/notes.md': { read: 1 },
      'home/CLAUDE.md': { read: 4 },
    },
    calls_total: 206,
    failures: 1,
    transcript_bytes: 4115503,
    ...over,
  };
}

test('summarize keeps the scan fields and drops the bulk', () => {
  const row = S.summarize(record(), 'sha111');
  assert.equal(row.id, 'b8fae678');
  assert.equal(row.agent, 'https://claude.ai/code/session_01SXuNTtUx1sdmoQPbLE3Bqk');
  assert.equal(row.mins, 178);
  assert.equal(row.exchanges, 10);
  assert.equal(row.failures, 1);
  assert.equal(row.sha, 'sha111');
  // The summary is the thing a view can afford to hold for every session, so
  // its size is part of the contract, not an accident.
  assert.ok(JSON.stringify(row).length < 1200, 'summary row should stay small');
  assert.ok(!('calls' in record() && row.callBodies), 'no call bodies in a row');
});

test('summarize ranks tools and files busiest-first, ties by name', () => {
  const row = S.summarize(record(), 'x');
  assert.deepEqual(row.tools[0], ['Bash', 132]);
  assert.deepEqual(row.files[0], ['web-tools/lib/estate.js', 11]);
  assert.deepEqual(row.files[1], ['home/CLAUDE.md', 4]);
  assert.equal(row.filesTotal, 3);
});

test('branches dedupe and drop main, since they are the join key to the Open view', () => {
  const row = S.summarize(record({
    repos: [
      { name: 'a', branch: 'claude/x-1', lines: 1 },
      { name: 'b', branch: 'claude/x-1', lines: 2 },
      { name: 'c', branch: 'main', lines: 3 },
      { name: 'd', branch: '', lines: 4 },
    ],
  }), 'x');
  assert.deepEqual(row.branches, ['claude/x-1']);
});

test('an older record with no agent id summarizes without one, not with a wrong one', () => {
  const r = record();
  delete r.agent_session;
  delete r.files;
  delete r.files_total;
  r.schema = 2;
  const row = S.summarize(r, 'x');
  assert.equal(row.agent, '');
  assert.deepEqual(row.files, []);
  assert.equal(row.filesTotal, 0);
  assert.equal(row.schema, 2);
  // The branch fallback still resolves, which is the whole reason it is kept.
  assert.deepEqual(row.branches, ['claude/sessions-tab-3j05zm']);
});

test('stalePaths refetches only what moved, including the live record every Stop', () => {
  const prev = S.buildCache(null, {
    'sessions/2026/08/2026-08-05-b8fae678.json': { record: record(), sha: 'sha1' },
    'sessions/2026/08/2026-08-04-aaaaaaaa.json': {
      record: record({ short: 'aaaaaaaa', day: '2026-08-04', started: '2026-08-04T09:00:00Z' }),
      sha: 'sha2',
    },
  }, null, '2026-08-05T18:00:00Z');

  const listing = [
    { path: 'sessions/2026/08/2026-08-05-b8fae678.json', sha: 'sha1-MOVED' },
    { path: 'sessions/2026/08/2026-08-04-aaaaaaaa.json', sha: 'sha2' },
    { path: 'sessions/2026/08/2026-08-05-cccccccc.json', sha: 'sha3' },
  ];
  assert.deepEqual(S.stalePaths(prev, listing).sort(), [
    'sessions/2026/08/2026-08-05-b8fae678.json',
    'sessions/2026/08/2026-08-05-cccccccc.json',
  ]);
  assert.deepEqual(S.stalePaths(null, listing).length, 3, 'a cold cache fetches everything');
});

test('a crawl that did not look at a record keeps its row; a deleted record loses it', () => {
  const p1 = 'sessions/2026/08/2026-08-05-b8fae678.json';
  const p2 = 'sessions/2026/08/2026-08-04-aaaaaaaa.json';
  const prev = S.buildCache(null, {
    [p1]: { record: record(), sha: 'sha1' },
    [p2]: { record: record({ short: 'aaaaaaaa', day: '2026-08-04', started: '2026-08-04T09:00:00Z' }), sha: 'sha2' },
  }, null, '2026-08-05T18:00:00Z');
  assert.equal(prev.rows.length, 2);

  // Incremental crawl: p1 moved, p2 was not re-read but is still in the store.
  const next = S.buildCache(prev, { [p1]: { record: record({ exchanges: 12 }), sha: 'sha9' } },
                            [p1, p2], '2026-08-05T19:00:00Z');
  assert.equal(next.rows.length, 2, 'an unread record must survive the fold');
  assert.equal(next.rows.find(r => r.id === 'b8fae678').exchanges, 12);

  // p2 removed from the store: now it genuinely goes.
  const pruned = S.buildCache(next, {}, [p1], '2026-08-05T20:00:00Z');
  assert.equal(pruned.rows.length, 1);
  assert.equal(pruned.rows[0].id, 'b8fae678');
});

test('rows come back newest-first', () => {
  const cache = S.buildCache(null, {
    'sessions/2026/08/2026-08-01-aaaaaaaa.json': { record: record({ short: 'aaaaaaaa', day: '2026-08-01', started: '2026-08-01T09:00:00Z' }), sha: 'a' },
    'sessions/2026/08/2026-08-05-bbbbbbbb.json': { record: record({ short: 'bbbbbbbb', day: '2026-08-05', started: '2026-08-05T09:00:00Z' }), sha: 'b' },
    'sessions/2026/08/2026-08-03-cccccccc.json': { record: record({ short: 'cccccccc', day: '2026-08-03', started: '2026-08-03T09:00:00Z' }), sha: 'c' },
  }, null, '2026-08-05T18:00:00Z');
  assert.deepEqual(cache.rows.map(r => r.id), ['bbbbbbbb', 'cccccccc', 'aaaaaaaa']);
});

test('attention counts distinct sessions, not just accesses', () => {
  const heavyOnce = record({
    short: 'aaaaaaaa', day: '2026-08-01', started: '2026-08-01T09:00:00Z',
    files: { 'home/one-session-hammered-this.md': { edit: 40 } }, files_total: 1,
  });
  const mk = (short, day) => record({
    short, day, started: `${day}T09:00:00Z`,
    files: { 'web-tools/shared.js': { read: 1 } }, files_total: 1,
  });
  const cache = S.buildCache(null, {
    'sessions/2026/08/2026-08-01-aaaaaaaa.json': { record: heavyOnce, sha: 'a' },
    'sessions/2026/08/2026-08-02-bbbbbbbb.json': { record: mk('bbbbbbbb', '2026-08-02'), sha: 'b' },
    'sessions/2026/08/2026-08-03-cccccccc.json': { record: mk('cccccccc', '2026-08-03'), sha: 'c' },
    'sessions/2026/08/2026-08-04-dddddddd.json': { record: mk('dddddddd', '2026-08-04'), sha: 'd' },
  }, null, '2026-08-05T18:00:00Z');

  const top = cache.attention[0];
  assert.equal(top.path, 'web-tools/shared.js', 'three sessions beat one busy session');
  assert.equal(top.sessions, 3);
  assert.equal(top.count, 3);
  assert.equal(top.last, '2026-08-04T09:00:00Z');

  const hammered = cache.attention.find(a => a.path === 'home/one-session-hammered-this.md');
  assert.equal(hammered.sessions, 1);
  assert.equal(hammered.count, 40);
});

// ── The docs slice ──────────────────────────────────────────────────────────
// The registry's readership column reads docAttention, and the reason it is not
// a filter over `attention` is that `attention` folds `files`, which is the
// busiest FILES_KEPT of a session. A doc opened once in a busy session is
// exactly the reading being counted and exactly what that cap discards, so the
// assertions below pin the uncapped path.

test('docFiles keeps every docs/ path, past where the busiest-files cap stops', () => {
  const files = { 'web-tools/docs/quiet.md': { read: 1 } };
  for (let i = 0; i < S.FILES_KEPT + 4; i++) files['web-tools/lib/busy' + i + '.js'] = { edit: 50 + i };
  const row = S.summarize(record({ files, files_total: Object.keys(files).length }), 'x');

  assert.equal(row.files.length, S.FILES_KEPT);
  assert.ok(!row.files.some(([p]) => p.startsWith('web-tools/docs/')),
    'the quiet doc is exactly what the busiest-files cap drops');
  assert.deepEqual(row.docFiles, [['web-tools/docs/quiet.md', 1]],
    'and exactly what the docs slice must keep');
});

test('docFiles matches a docs/ directory at any depth, and nothing merely named docs', () => {
  const row = S.summarize(record({
    files: {
      'web-tools/docs/a.md': { read: 1 },
      'home/projects/x/docs/b.md': { read: 2 },
      'web-tools/docs.json': { read: 3 },          // a file, not the folder
      'web-tools/lib/docsearch.js': { edit: 4 },   // a prefix, not a segment
    },
  }), 'x');
  assert.deepEqual(row.docFiles.map(([p]) => p),
    ['home/projects/x/docs/b.md', 'web-tools/docs/a.md']);
});

test('docAttention counts distinct sessions per doc and stays uncapped', () => {
  const mk = (short, day, files) => record({ short, day, started: `${day}T09:00:00Z`, files });
  const many = {};
  for (let i = 0; i < 60; i++) many['web-tools/docs/many' + i + '.md'] = { read: 1 };
  const cache = S.buildCache(null, {
    'sessions/2026/08/2026-08-01-aaaaaaaa.json': { record: mk('aaaaaaaa', '2026-08-01', { 'web-tools/docs/hot.md': { read: 2 } }), sha: 'a' },
    'sessions/2026/08/2026-08-02-bbbbbbbb.json': { record: mk('bbbbbbbb', '2026-08-02', { 'web-tools/docs/hot.md': { read: 1 }, 'web-tools/lib/x.js': { edit: 9 } }), sha: 'b' },
    'sessions/2026/08/2026-08-03-cccccccc.json': { record: mk('cccccccc', '2026-08-03', many), sha: 'c' },
  }, null, '2026-08-05T18:00:00Z');

  const hot = cache.docAttention.find(a => a.path === 'web-tools/docs/hot.md');
  assert.equal(hot.sessions, 2);
  assert.equal(hot.count, 3);
  assert.equal(hot.last, '2026-08-02T09:00:00Z');
  assert.ok(!cache.docAttention.some(a => a.path === 'web-tools/lib/x.js'), 'docs only');
  assert.equal(cache.docAttention.length, 61, 'no cap: 60 docs plus the hot one');
});

test('a row built by an older summarizer is stale even when its sha never moves', () => {
  const p = 'sessions/2026/08/2026-08-05-b8fae678.json';
  const cache = S.buildCache(null, { [p]: { record: record(), sha: 'sha1' } }, null, '2026-08-05T18:00:00Z');
  const listing = [{ path: p, sha: 'sha1' }];
  assert.deepEqual(S.stalePaths(cache, listing), [], 'current rows stay put');

  // What the store looked like before ROW_V existed: same bytes, older fold.
  const older = JSON.parse(JSON.stringify(cache));
  delete older.byPath[p].v;
  delete older.byPath[p].docFiles;
  assert.deepEqual(S.stalePaths(older, listing), [p],
    'a published record is frozen, so the version is the only thing that can say its row is behind');
});

test('cacheChanged ignores the crawl stamp and the blob sha', () => {
  const p = 'sessions/2026/08/2026-08-05-b8fae678.json';
  const a = S.buildCache(null, { [p]: { record: record(), sha: 'sha1' } }, null, '2026-08-05T18:00:00Z');
  // Same content, later crawl, and a blob sha that moved because the file was
  // rewritten byte-identically. Nothing to commit.
  const b = S.buildCache(a, { [p]: { record: record(), sha: 'sha2' } }, [p], '2026-08-05T19:00:00Z');
  assert.equal(S.cacheChanged(a, b), false);

  const c = S.buildCache(b, { [p]: { record: record({ exchanges: 11 }), sha: 'sha2' } }, [p], '2026-08-05T20:00:00Z');
  assert.equal(S.cacheChanged(b, c), true);
});

test('isRecordPath admits records and refuses the sample and the tools', () => {
  assert.equal(S.isRecordPath('sessions/2026/08/2026-08-05-b8fae678.json'), true);
  assert.equal(S.isRecordPath('sessions/sample-record.json'), false);
  assert.equal(S.isRecordPath('sessions/tools/record.py'), false);
  assert.equal(S.isRecordPath('sessions/README.md'), false);
});

test('pathOf round-trips a row back to the store path it came from', () => {
  const p = 'sessions/2026/08/2026-08-05-b8fae678.json';
  const cache = S.buildCache(null, { [p]: { record: record(), sha: 'x' } }, null, 'now');
  assert.equal(S.pathOf(cache.rows[0]), p);
  assert.ok(p in cache.byPath);
});
