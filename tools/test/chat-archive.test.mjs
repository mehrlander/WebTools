// kits/chat-archive.js — the pure folds behind the estate's Chats pane. Run the
// IIFE against a window stub, then exercise provider detection off the url,
// the hand-over-machine merge, the staleness arithmetic, the per-provider
// cadence verdict, and the month spine the pane pages on.
//
// The reader half (loadFrontier/loadMonth) is not exercised here: it is the
// same memo-plus-in-flight shape kits/estate-search.js already carries, and it
// needs a GH stub to say anything. What is worth holding is the arithmetic,
// because every number the banner shows is a claim about how stale the archive
// is, and an off-by-one there crosses a declared threshold a day early.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/chat-archive.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const A = window.chatArchive;

const CLAUDE = 'https://claude.ai/chat/3d4f92e4-b714-46ad-a7c3-0854e6519a0a';
const CHATGPT = 'https://chatgpt.com/c/0d926532-977f-4993-9287-02c6a43e0264';
const GEMINI = 'gemini-session/341';

test('provider is read off the url, which is the archive\'s own join key', () => {
  assert.equal(A.providerOf(CLAUDE), 'claude');
  assert.equal(A.providerOf(CHATGPT), 'chatgpt');
  assert.equal(A.providerOf(GEMINI), 'gemini');
  assert.equal(A.providerOf(''), '');
  assert.equal(A.providerOf('https://example.com/x'), '');
});

test('only an http url is openable; a Gemini session id is not a dead link', () => {
  assert.equal(A.openUrl({ url: CLAUDE }), CLAUDE);
  // Gemini Apps chats have no per-conversation address. Empty means "render as
  // text", which is different from a link that 404s.
  assert.equal(A.openUrl({ url: GEMINI }), '');
  assert.equal(A.openUrl({}), '');
});

test('the hand catalog wins a collision, whichever order the layers arrive in', () => {
  const summaries = [{ url: CLAUDE, date: '2026-06-02', title: 'machine title', summary: 'bulk' }];
  const catalog = [{ url: CLAUDE, date: '2026-06-02', title: 'hand title', summary: 'precious' }];
  const rows = A.mergeMonth({ summaries, catalog, month: '2026-06' });
  assert.equal(rows.length, 1, 'one chat is one row, not two');
  assert.equal(rows[0].title, 'hand title');
  assert.equal(rows[0].hand, true);
  // And the machine entry cannot clobber a hand entry already placed.
  const flipped = A.mergeMonth({ summaries, catalog, month: '2026-06' });
  assert.equal(flipped[0].summary, 'precious');
});

test('a machine-only chat still lands, marked as not hand', () => {
  const rows = A.mergeMonth({
    summaries: [{ url: CHATGPT, date: '2026-06-01', title: 'only machine' }],
    catalog: [], month: '2026-06',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hand, false);
  assert.equal(rows[0].provider, 'chatgpt');
});

test('rows sort newest first, ties by title, and an entry with no url is dropped', () => {
  const rows = A.mergeMonth({
    summaries: [
      { url: CLAUDE, date: '2026-06-01', title: 'B' },
      { url: CHATGPT, date: '2026-06-09', title: 'A' },
      { url: GEMINI, date: '2026-06-01', title: 'A' },
      { date: '2026-06-30', title: 'no url at all' },
    ],
    catalog: [], month: '2026-06',
  });
  assert.deepEqual(rows.map(r => r.title), ['A', 'A', 'B']);
  assert.equal(rows[0].date, '2026-06-09');
  // The second and third share a date, so title breaks the tie.
  assert.deepEqual(rows.slice(1).map(r => r.provider), ['gemini', 'claude']);
});

test('daysSince floors, so the banner never crosses a threshold early', () => {
  const now = new Date('2026-08-09T23:00:00Z');
  // 2026-08-08T00:00Z to 2026-08-09T23:00Z is 1.96 days, which is 1, not 2.
  assert.equal(A.daysSince('2026-08-08', now), 1);
  assert.equal(A.daysSince('2026-07-06', new Date('2026-08-09T00:00:00Z')), 34);
  assert.equal(A.daysSince('nonsense', now), null);
});

test('cadence reports the gaps between exports, and says nothing on a single one', () => {
  // The Claude export dates as of 2026-08-09.
  const c = A.cadenceOf(['2026-05-14', '2026-06-01', '2026-07-06']);
  assert.deepEqual(c.gaps, [18, 35]);
  assert.equal(c.longest, 35);
  // One export is not a cadence. Reporting 0 would read as "exported daily".
  assert.deepEqual(A.cadenceOf(['2026-06-01']), { gaps: [], longest: null, count: 1 });
  assert.deepEqual(A.cadenceOf([]), { gaps: [], longest: null, count: 0 });
});

const FRONTIER = {
  archived_through: '2026-06-01',
  providers: {
    Claude: { frontier: '2026-07-06', chats: 5844, months: ['2026-05', '2026-06', '2026-07'],
              snapshots: ['2026-05-14', '2026-06-01', '2026-07-06'] },
    ChatGPT: { frontier: '2026-07-06', chats: 8658, months: ['2026-06', '2026-07'],
               snapshots: ['2026-06-13', '2026-07-06'] },
    Gemini: { frontier: '2026-06-01', chats: 342, months: ['2026-05', '2026-06'],
              snapshots: ['2026-06-01'] },
  },
};

test('the banner measures behind-ness from the newest CHAT, not the newest export', () => {
  const b = A.banner(FRONTIER, new Date('2026-08-09T00:00:00Z'));
  const claude = b.rows.find(r => r.key === 'claude');
  // The July export was requested 2026-07-06 and its newest chat is the same
  // day here, but the two are independent: the row reads the frontier.
  assert.equal(claude.frontier, '2026-07-06');
  assert.equal(claude.behind, 34);
  assert.equal(b.archivedThrough, '2026-06-01');
  assert.equal(b.behind, 69, 'the archive as a whole is only as current as its worst provider');
  assert.equal(b.chats, 14844);
});

test('rows sort by corpus size, so the busiest provider leads', () => {
  const b = A.banner(FRONTIER, new Date('2026-08-09T00:00:00Z'));
  assert.deepEqual(b.rows.map(r => r.key), ['chatgpt', 'claude', 'gemini']);
});

test('due compares each provider against its OWN longest gap', () => {
  // At 34 days Claude is inside its observed 35-day gap: due says nothing yet.
  const early = A.banner(FRONTIER, new Date('2026-08-09T00:00:00Z'));
  assert.equal(early.rows.find(r => r.key === 'claude').due, false);
  // At 41 days it has gone longer than it ever has.
  const late = A.banner(FRONTIER, new Date('2026-08-16T00:00:00Z'));
  assert.equal(late.rows.find(r => r.key === 'claude').due, true);
  // Gemini has one export and so no cadence to be overdue against, however
  // long it has been. Silence is the honest answer, not a default threshold.
  assert.equal(late.rows.find(r => r.key === 'gemini').due, false);
  // One lagging provider makes the archive due, matching archived_through's
  // choice of the minimum.
  assert.equal(late.due, true);
});

test('the month spine is every provider\'s months, deduped and newest first', () => {
  assert.deepEqual(A.monthsDesc(FRONTIER), ['2026-07', '2026-06', '2026-05']);
  assert.deepEqual(A.monthsDesc({}), []);
});
