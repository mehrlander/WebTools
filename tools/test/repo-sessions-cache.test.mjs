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
// The title join parses the export through the shared CSV kit, so the fixture
// window carries it the same way app/index.html's load chain does.
const csvSrc = readFileSync(path.join(repoRoot, 'lib/kits/csv.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', csvSrc)(win);
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

// The guides slice: the session-to-guide edge that is exact and survives merge,
// where the branch route says only that a head CONTAINS the file and goes dark
// once the PR closes.
test('guideFilesOf collects every guide a session touched, uncapped', () => {
  const files = {
    'web-tools/pages/guides/code-layers.html': { read: 1 },
    'web-tools/pages/guides/second.html': { write: 4, edit: 2 },
    // The shelf's own README is prose about the shelf, and a nested file is
    // not on the flat shelf: both match guide-index.js's admission rule.
    'web-tools/pages/guides/README.md': { read: 9 },
    'web-tools/pages/guides/sub/deep.html': { read: 9 },
    // A page that merely lives near the shelf is not on it.
    'web-tools/pages/branch.html': { edit: 30 },
    'home/docs/whatever.md': { read: 2 },
  };
  assert.deepEqual(S.guideFilesOf(files), [
    ['web-tools/pages/guides/second.html', 6],
    ['web-tools/pages/guides/code-layers.html', 1],
  ]);
  assert.deepEqual(S.guideFilesOf({}), []);
});

test('a guide opened once among many files still lands on the row', () => {
  // The cap on `files` is the whole reason this is a separate slice: a session
  // that touched forty files keeps the busiest eight, and a guide read once
  // would fall off, reading as "wrote no guide" rather than as a truncation.
  const files = { 'web-tools/pages/guides/code-layers.html': { read: 1 } };
  for (let i = 0; i < 40; i++) files['web-tools/lib/file' + i + '.js'] = { edit: 50 + i };
  const row = S.summarize({ files, files_total: 41, schema: 3 }, 'sha1');
  assert.equal(row.files.length, S.FILES_KEPT);
  assert.ok(!row.files.some(([p]) => p.includes('pages/guides/')), 'the cap drops it from files');
  assert.deepEqual(row.guides, [['web-tools/pages/guides/code-layers.html', 1]],
    'and the uncapped slice keeps it');
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

// The derived name. It stands in for a title the record cannot carry, so the
// cases that matter are the two ways it can mislead: mangling a branch that has
// no uniquifier to strip, and claiming a name for a session that has none.
test('nameOf strips the claude/ prefix and the six-character uniquifier', () => {
  assert.equal(S.nameOf({ branches: ['claude/fab-naming-todqvq'] }), 'fab-naming');
  assert.equal(S.nameOf({ branches: ['claude/show-repo-refresh-buttons-aklshi'] }),
    'show-repo-refresh-buttons');
  // A one-word slug still has a suffix to shed, and shedding it must not eat
  // the slug.
  assert.equal(S.nameOf({ branches: ['claude/x-1g5p9v'] }), 'x');
});

test('nameOf leaves a hand-named branch whole rather than mangling it', () => {
  // No uniquifier to strip, so the regex must not match and take the last
  // hyphenated word with it.
  assert.equal(S.nameOf({ branches: ['refactor-the-loader'] }), 'refactor-the-loader');
});

test('nameOf prefers a claude/ branch over one that is merely present first', () => {
  assert.equal(S.nameOf({ branches: ['some-other-branch', 'claude/fab-naming-todqvq'] }),
    'fab-naming');
});

test('nameOf says nothing rather than guessing when a session has no branch', () => {
  assert.equal(S.nameOf({ branches: [] }), '');
  assert.equal(S.nameOf({}), '');
  assert.equal(S.nameOf(null), '');
});

// ── The title, joined from the export ────────────────────────────────────────
// The join's design constraint is that the estate must DEGRADE when the export
// is old or absent rather than go blank, so most of what is asserted here is
// what happens when the second input is missing, stale, or broken.

const AGENT = 'https://claude.ai/code/session_01SXuNTtUx1sdmoQPbLE3Bqk';
const P = 'sessions/2026/08/2026-08-05-b8fae678.json';

function titles(over = {}) {
  return {
    at: '2026-08-04',
    path: 'claude-code-web/2026-08-04-sessions.csv',
    byId: { session_01SXuNTtUx1sdmoQPbLE3Bqk: 'Sessions tab for the estate' },
    ...over,
  };
}

test('sessionIdOf reduces the record URL to the export bare id', () => {
  assert.equal(S.sessionIdOf(AGENT), 'session_01SXuNTtUx1sdmoQPbLE3Bqk');
  assert.equal(S.sessionIdOf('session_01SXuNTtUx1sdmoQPbLE3Bqk'), 'session_01SXuNTtUx1sdmoQPbLE3Bqk');
  // A record with no session URL joins to nothing rather than to everything.
  assert.equal(S.sessionIdOf(''), '');
  assert.equal(S.sessionIdOf(null), '');
  assert.equal(S.sessionIdOf('https://claude.ai/chat/abc-123'), '');
});

test('newestExport picks by the date in the filename and ignores everything else', () => {
  const pick = S.newestExport([
    { name: 'README.md', path: 'claude-code-web/README.md' },
    { name: '2026-08-04-sessions.csv', path: 'claude-code-web/2026-08-04-sessions.csv' },
    { name: '2026-08-11-sessions.csv', path: 'claude-code-web/2026-08-11-sessions.csv' },
    { name: '2026-08-09-notes.csv', path: 'claude-code-web/2026-08-09-notes.csv' },
  ]);
  assert.deepEqual(pick, { at: '2026-08-11', path: 'claude-code-web/2026-08-11-sessions.csv' });
  assert.equal(S.newestExport([{ name: 'README.md', path: 'claude-code-web/README.md' }]), null);
  assert.equal(S.newestExport([]), null);
});

test('parseTitles keeps a title that contains a comma whole', () => {
  // Not hypothetical: "Session title capture in history, adjusted" is a row in
  // the first export on file, and a split on comma would cut it in half and
  // shift session_id into the status column.
  const csv = [
    'title,url,session_id,status',
    '"Session title capture in history, adjusted",https://claude.ai/code/session_01AAA,session_01AAA,',
    '"Refresh buttons on show repo page",https://claude.ai/code/session_01BBB,session_01BBB,',
  ].join('\n');
  assert.deepEqual(S.parseTitles(csv), {
    session_01AAA: 'Session title capture in history, adjusted',
    session_01BBB: 'Refresh buttons on show repo page',
  });
});

test('parseTitles falls back to the url column when session_id is missing', () => {
  const csv = 'title,url\n"A session",https://claude.ai/code/session_01CCC';
  assert.deepEqual(S.parseTitles(csv), { session_01CCC: 'A session' });
  assert.deepEqual(S.parseTitles(''), {});
});

test('a title lands on the row it names and nowhere else', () => {
  const cache = S.buildCache(null, {
    [P]: { record: record(), sha: 'x' },
    'sessions/2026/08/2026-08-04-aaaaaaaa.json': {
      record: record({ short: 'aaaaaaaa', day: '2026-08-04', started: '2026-08-04T09:00:00Z',
                       agent_session: 'https://claude.ai/code/session_01UNKNOWN' }),
      sha: 'y',
    },
  }, null, 'now', titles());
  const named = cache.rows.find(r => r.id === 'b8fae678');
  const other = cache.rows.find(r => r.id === 'aaaaaaaa');
  assert.equal(named.title, 'Sessions tab for the estate');
  assert.ok(!('title' in other), 'a session the export does not name carries no title key');
  assert.equal(cache.titlesAt, '2026-08-04');
  assert.equal(cache.titlesFrom, 'claude-code-web/2026-08-04-sessions.csv');
});

test('labelOf falls back per row, so a list never goes blank', () => {
  assert.equal(S.labelOf({ title: 'Sessions tab for the estate', branches: ['claude/x-1g5p9v'] }),
               'Sessions tab for the estate');
  assert.equal(S.labelOf({ branches: ['claude/fab-naming-todqvq'] }), 'fab-naming');
  assert.equal(S.labelOf({ branches: [] }), '');
});

test('an unreadable export carries the titles the cache already had', () => {
  // The load-bearing degradation. A day the desktop slept, a token that cannot
  // see chat-histories, and a 500 are all `titles === null`, and none of them
  // may cost a title that was already joined.
  const first = S.buildCache(null, { [P]: { record: record(), sha: 'x' } }, null, 'now', titles());
  const again = S.buildCache(first, {}, [P], 'later', null);
  assert.equal(again.rows[0].title, 'Sessions tab for the estate');
  assert.equal(again.titlesAt, '2026-08-04');
  assert.equal(again.titlesFrom, 'claude-code-web/2026-08-04-sessions.csv');
});

test('a refetched record keeps its title, which its own blob cannot supply', () => {
  // The live session's record rewrites on every Stop, so this is the common
  // path rather than the edge: summarize() reads the record and a record has no
  // title field, so the row would come back blank on the very session a reader
  // is most likely to be looking at.
  const first = S.buildCache(null, { [P]: { record: record(), sha: 'x' } }, null, 'now', titles());
  const again = S.buildCache(first, { [P]: { record: record(), sha: 'MOVED' } }, [P], 'later', null);
  assert.equal(again.rows[0].title, 'Sessions tab for the estate');
  assert.equal(again.rows[0].sha, 'MOVED');
});

test('the fold does not edit the cache it is folding from', () => {
  // withTitles copies rather than mutates, because carried-forward rows are the
  // SAME objects the previous cache holds and cacheChanged compares the two
  // afterwards. Mutating in place would edit the baseline and a new export
  // would read as no change at all.
  const first = S.buildCache(null, { [P]: { record: record(), sha: 'x' } }, null, 'now', null);
  const next = S.buildCache(first, {}, [P], 'later', titles());
  assert.ok(!('title' in first.rows[0]), 'the previous fold stays untitled');
  assert.equal(next.rows[0].title, 'Sessions tab for the estate');
  assert.equal(S.cacheChanged(first, next), true);
});

test('a rename lands, and a re-run of the same export does not', () => {
  const first = S.buildCache(null, { [P]: { record: record(), sha: 'x' } }, null, 'now', titles());
  const same = S.buildCache(first, {}, [P], 'later', titles());
  assert.equal(S.cacheChanged(first, same), false);

  const renamed = S.buildCache(first, {}, [P], 'later',
    titles({ at: '2026-08-11', byId: { session_01SXuNTtUx1sdmoQPbLE3Bqk: 'Sessions tab, renamed' } }));
  assert.equal(renamed.rows[0].title, 'Sessions tab, renamed');
  assert.equal(S.cacheChanged(first, renamed), true);
});

test('a fresher export commits even when it renames nothing', () => {
  // titlesAt is the one top-level key inside material(), and this is why: it is
  // a claim shown on screen, so a surface that kept saying "titles as of
  // 2026-08-04" after a newer capture landed would understate itself with no
  // way for a reader to tell.
  const first = S.buildCache(null, { [P]: { record: record(), sha: 'x' } }, null, 'now', titles());
  const newer = S.buildCache(first, {}, [P], 'later', titles({ at: '2026-08-11' }));
  assert.equal(newer.rows[0].title, first.rows[0].title);
  assert.equal(S.cacheChanged(first, newer), true);
});

test('a title dropped from the export is dropped from the row', () => {
  // A session deleted in the app leaves the sidebar and so leaves the export.
  // The row falls back to its derived name rather than keeping a title nothing
  // asserts any more; the export is the source of truth while it is readable.
  const first = S.buildCache(null, { [P]: { record: record(), sha: 'x' } }, null, 'now', titles());
  const gone = S.buildCache(first, {}, [P], 'later', titles({ at: '2026-08-11', byId: {} }));
  assert.ok(!('title' in gone.rows[0]));
  assert.equal(S.labelOf(gone.rows[0]), 'sessions-tab');
});

test('a record with no session URL joins to nothing and keeps its derived name', () => {
  // 44 of the 143 rows on file when this landed are in exactly this state: the
  // recorder only began reading the session id from the environment on
  // 2026-08-07, and a record is never revisited, so those rows can never be
  // titled by any export.
  const r = record();
  delete r.agent_session;
  const cache = S.buildCache(null, { [P]: { record: r, sha: 'x' } }, null, 'now', titles());
  assert.ok(!('title' in cache.rows[0]));
  assert.equal(S.labelOf(cache.rows[0]), 'sessions-tab');
});

// The pointer. What is pinned is that the three routes it names all address the
// SAME record: a block whose page link and store path disagree is worse than no
// block at all, because both halves look right on their own.
test('pointerOf addresses one record three ways and they agree', () => {
  const row = S.summarize(record(), 'x');
  const p = S.pointerOf(row, { dur: '2h58m' });
  assert.match(p, /^Session b8fae678 · sessions-tab \(2026-08-05, 2h58m · web-tools, home\)$/m);
  assert.match(p, /^Ask: Add a sessions tab to the activity view$/m);
  assert.match(p,
    /^Record: mehrlander\/web-tools-private:sessions\/2026\/08\/2026-08-05-b8fae678\.json$/m);
  assert.match(p,
    /^Read: https:\/\/mehrlander\.github\.io\/web-tools\/pages\/session\.html#id=b8fae678$/m);
  assert.match(p,
    /^Query: python3 web-tools-private\/sessions\/tools\/search\.py --show b8fae678$/m);
  // The store is the shell's to name, and the checkout folder in the command
  // follows it rather than being written twice.
  const alt = S.pointerOf(row, { store: 'someone/other-store' });
  assert.match(alt, /^Record: someone\/other-store:sessions\//m);
  assert.match(alt, /^Query: python3 other-store\/sessions\/tools\/search\.py /m);
});

test('pointerOf states the Claude session only where the record named one', () => {
  const has = S.pointerOf(S.summarize(record(), 'x'));
  assert.match(has, /^In Claude: https:\/\/claude\.ai\/code\/session_01SXuNTtUx1sdmoQPbLE3Bqk$/m);
  // Empty on every record written before 2026-08-07, and permanently so, since
  // records are never revisited. A blank line claiming a session is worse than
  // a missing one.
  const without = S.pointerOf(S.summarize(record({ agent_session: '' }), 'x'));
  assert.ok(!/In Claude:/.test(without));
});

test('pointerOf keeps the ask to one line, and omits it rather than showing an empty one', () => {
  const multi = S.pointerOf(S.summarize(record({
    opening_ask: 'Line one.\n\nLine two,\n  indented.',
  }), 'x'));
  assert.match(multi, /^Ask: Line one\. Line two, indented\.$/m);
  assert.equal(multi.split('\n').filter(l => l.startsWith('Ask:')).length, 1);
  const none = S.pointerOf(S.summarize(record({ opening_ask: '' }), 'x'));
  assert.ok(!/^Ask:/m.test(none));
});

// ── The shell channel ────────────────────────────────────────────────────────
// The readership column's founding caveat was that a doc read with `cat` or
// `sed` leaves no trace, because `files` is built from file-tool inputs. It is
// recoverable from `calls`, which every record already carries. These pin the
// conservative half: what it refuses to count matters more than what it counts,
// since an overstated readership argues for keeping a document nobody reads.

test('a shell read of a doc counts, keyed to the checkout the command names', () => {
  const rec = { repos: [{ name: 'web-tools' }, { name: 'home' }], calls: [
    { name: 'Bash', arg: 'cat /home/user/web-tools/docs/SURFACING.md' },
    { name: 'Bash', arg: 'cd /home/user/home && sed -n 1,40p docs/TRACKER.md' },
  ] };
  const out = S.shellDocsOf(rec);
  assert.equal(out['web-tools/docs/SURFACING.md'], 1, 'an absolute path names its own checkout');
  assert.equal(out['home/docs/TRACKER.md'], 1, 'a cd in the same command governs the relative path after it');
});

test('a bare path in a multi-checkout session is dropped rather than guessed', () => {
  const many = { repos: [{ name: 'web-tools' }, { name: 'home' }], calls: [
    { name: 'Bash', arg: 'grep -n toss docs/SURFACING.md' },
  ] };
  assert.deepEqual(S.shellDocsOf(many), {},
    'two candidate checkouts and nothing to choose between them');

  const one = { repos: [{ name: 'web-tools' }], calls: [
    { name: 'Bash', arg: 'grep -n toss docs/SURFACING.md' },
  ] };
  assert.equal(S.shellDocsOf(one)['web-tools/docs/SURFACING.md'], 1,
    'one checkout in the session makes the attribution unambiguous');
});

test('writing a doc is not reading it', () => {
  const rec = { repos: [{ name: 'web-tools' }], calls: [
    { name: 'Bash', arg: 'cat build.md > docs/SURFACING.md' },
    { name: 'Bash', arg: "sed -i 's/a/b/' docs/CONVENTIONS.md" },
    { name: 'Bash', arg: 'ls docs/' },
    { name: 'Read', arg: '/home/user/web-tools/docs/loader.md' },
  ] };
  assert.deepEqual(S.shellDocsOf(rec), {},
    'a redirect, an in-place edit, a listing with no path, and a non-Bash call');
});

test('the docs slice folds both channels and keeps the shell half legible', () => {
  const rec = {
    repos: [{ name: 'web-tools' }],
    files: { 'web-tools/docs/loader.md': { read: 2 }, 'web-tools/lib/x.js': { edit: 9 } },
    calls: [{ name: 'Bash', arg: 'cat /home/user/web-tools/docs/stage.md' }],
  };
  const row = S.summarize(rec, 'sha');
  const by = Object.fromEntries(row.docFiles);
  assert.equal(by['web-tools/docs/loader.md'], 2, 'the tool channel survives');
  assert.equal(by['web-tools/docs/stage.md'], 1, 'the shell channel joins it');
  assert.ok(!by['web-tools/lib/x.js'], 'still the docs slice only');
  assert.deepEqual(row.docShell, [['web-tools/docs/stage.md', 1]],
    'and the shell half is carried on its own, for the column to state the split');
  assert.ok(!row.files.some(([p]) => p === 'web-tools/docs/stage.md'),
    'files stays tool-only: it answers what the session was working on');
});

test('the summarizer version is bumped, so the cache heals rather than reading empty', () => {
  assert.ok(S.ROW_V >= 4,
    'a published record\'s sha never moves again, so a new field reaches the ' +
    'back catalogue only through a version bump that stalePaths treats as stale');
});
