// alpineComponents/session-brief.js — one captured session as a page.
//
// The view was inside pages/session.html until 2026-08-27, where its only
// possible host was that page. Lifting it into a component gave it a second
// host, show-repo's Sessions pane, which mounts one per slide so a session can
// be swiped through the way a branch already is. That is the whole reason this
// file exists, and the two things worth pinning follow from it:
//
//   The HEAD renders before the record does. A slide is handed the sessions
//   cache's row as `facts`, so its title, its strip and its closing reply are
//   right in the first frame and only the outline waits on the JSON. A view
//   that blanked until the fetch landed would flash on every swipe.
//
//   The RECORD is read once per session, not once per visit. The deck reuses
//   one mount per slide, so stepping back to a slide must not refetch, and the
//   memo lives at module scope for exactly that reason.
//
// Driven over a fake GH; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const STORE = 'me/private';
const PATH = 'sessions/2026/08/2026-08-05-b8fae678.json';

const record = {
  schema: 4, short: 'b8fae678', day: '2026-08-05',
  started: '2026-08-05T13:00:00Z', ended: '2026-08-05T16:00:00Z',
  agent_session: 'https://claude.ai/code/session_01SX',
  repos: [{ name: 'web-tools', branch: 'claude/a-1' }],
  opening_ask: 'do the thing', exchanges: 2, calls_total: 40, failures: 1,
  files_total: 2, tokens: { output: 337631 },
  prompts: [{ at: '2026-08-05T13:00:00Z', text: 'do the thing' }],
  replies: [{ at: '2026-08-05T13:30:00Z', text: 'partway through' },
            { at: '2026-08-05T15:59:00Z', text: 'and here is what came of it' }],
  calls: [],
};

// What the Sessions pane lends a slide: the cache's own row, which holds every
// number on the strip.
const facts = {
  id: 'b8fae678', day: '2026-08-05', title: 'a named session',
  started: record.started, ended: record.ended, repos: record.repos,
  ask: 'do the thing', reply: 'a closing reply the cache carried', replyCut: '',
  exchanges: 2, calls: 40, failures: 1, filesTotal: 2, schema: 4,
  tokens: { output: 337631 }, agent: record.agent_session,
};

// ONE ORDERED LOG, not two counters. What has to be provable is that the lent
// slide reached its blob without a listing preceding it, and two independent
// tallies cannot say which came first.
const log = [];
const gets = () => log.filter(l => l.startsWith('get:'));
const trees = () => log.filter(l => l.startsWith('tree:'));
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  async get(p) {
    log.push('get:' + this.repo + ':' + p);
    if (p === PATH) return { text: JSON.stringify(record) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req(p) {
    log.push('tree:' + p);
    return { tree: [{ type: 'blob', path: PATH }] };
  }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="lent" x-data="sessionBrief(window.__lent)"></div>
    <div id="cold" x-data="sessionBrief(window.__cold)"></div>
    <div id="unread" x-data="sessionBrief(window.__unread)"></div>
  </body></html>`,
});
window.GH = FakeGH;
window.TOKEN = 'tkn';
window.gh = { load: async () => {} };
// The kit chain the component reads. Stubbed rather than loaded: what the deck
// DOES with a record is session-render.js's own test, and the outline is
// session-export.js's.
window.claudeMark = { svg: () => '<svg></svg>' };
const opened = [];
window.sessionRender = {
  describe: (r) => ({ title: 'described ' + r.short, subtitle: '' }),
  turns: (r) => (r.replies || []),
  groups: (t) => t.map(x => [x]),
  open: async (r, o) => { opened.push({ short: r.short, ...o }); return { close(){} }; },
};
window.sessionExport = { index: () => ({ el: window.document.createElement('div') }) };
window.chatRender = { block: () => window.document.createElement('pre') };
window.swipeDeck = { top: () => null };

// A slide is handed its row; a cold page is handed an id and nothing else.
window.__lent = { id: 'b8fae678', day: '2026-08-05', repo: STORE, framed: true, facts,
                  onMeta: (m) => { window.__meta = m; } };
window.__cold = { id: 'b8fae678', repo: STORE };
// A row whose record cannot be read. It is the state every slide passes through
// on its way to loaded, and it is also a real end state: the store is private,
// so a reader whose token cannot reach it still gets everything the cache knew.
window.__unread = { id: 'nosuch', day: '2026-08-05', repo: STORE, framed: true,
                    facts: { ...facts, id: 'nosuch' } };

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;
// pathOf lives in the sessions cache kit, and the component reads it there
// rather than deriving a second copy. The Sessions pane always has it loaded;
// a cold pages/session.html does not, which is the case the listing covers.
for (const k of ['lib/kits/repo-sessions-cache.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, k), 'utf8'))(window);
}
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/session-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(6);

const lent = () => Alpine.$data(window.document.getElementById('lent'));
const cold = () => Alpine.$data(window.document.getElementById('cold'));
const strip = (d) => Object.fromEntries(d.strip.map(f => [f.k, f.v]));

test('mounting is quiet', () => {
  assert.deepEqual(problems, []);
});

// ── The head, before the record ─────────────────────────────────────────────

test('a lent row renders the strip and the title without waiting on the record', () => {
  // Every value here comes from `facts`. The assertion that matters is that
  // they are present at all: a slide that blanked until its fetch landed would
  // flash the whole head on every swipe.
  const s = strip(lent());
  assert.equal(s.asks, 2);
  assert.equal(s.calls, 40);
  assert.equal(s.failures, 1);
  assert.equal(s.ran, '3h 0m');
  assert.equal(s.repos, 'web-tools');
  assert.equal(s['out tokens'], '337,631');
});

test('the strip counts a zero rather than dropping it, and drops what is absent', () => {
  // "no failures" and "not captured" are different answers and only one of them
  // is about the session, which is the whole reason the filter tests for
  // `v === 0` rather than truthiness.
  const bare = { id: 'x', day: '2026-08-05', exchanges: 0, calls: 0, failures: 0 };
  window.__probe = { id: 'x', repo: STORE, facts: bare, record: null };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__probe)');
  window.document.body.append(el);
  Alpine.initTree(el);
  const s = Object.fromEntries(Alpine.$data(el).strip.map(f => [f.k, f.v]));
  assert.equal(s.failures, 0, 'measured zero is a fact');
  assert.ok(!('ran' in s), 'a duration nothing could compute is absent, not zero');
});

test('the closing reply is on the page from the row, record or no record', () => {
  const d = Alpine.$data(window.document.getElementById('unread'));
  assert.equal(d.record, null, 'this record could not be read');
  assert.equal(d.closing, 'a closing reply the cache carried');
  assert.match(d.err, /Could not open nosuch/, 'and it says so rather than reading as empty');
  // The strip is the row's the whole time, so an unreadable record costs the
  // outline and nothing else.
  assert.equal(Object.fromEntries(d.strip.map(f => [f.k, f.v])).calls, 40);
});

// ── The read ────────────────────────────────────────────────────────────────

test('a lent day derives the store path, so a slide never reads the tree', () => {
  // The guess is right for every row the sessions cache built, and the listing
  // behind it is a recursive tree read of a private store. A deck of twenty
  // sessions must not pay for it twenty times, or once. The ORDER is the proof:
  // the first call this fixture made at all was the lent slide's own blob.
  assert.equal(log[0], 'get:' + STORE + ':' + PATH,
    'the lent slide went straight to its blob, with no listing ahead of it');
  assert.equal(lent().path, PATH);
});

test('a cold mount with no day resolves the id against the store listing', () => {
  assert.equal(cold().path, PATH);
  // Once for the whole store, however many mounts need it: this fixture has
  // two (the cold one, and the one whose derived path 404s and falls through).
  assert.equal(trees().length, 1, 'exactly one listing read');
});

test('the record is read once, however many mounts ask for it', () => {
  // Three components mounted, two of them landing on this path within a tick.
  // The memo holds the PROMISE, not the settled record, which is the only
  // version of it that survives concurrent slides: caching after the await lets
  // every caller miss and fetch.
  assert.equal(gets().filter(g => g === 'get:' + STORE + ':' + PATH).length, 1);
});

test('the record overwrites what the row lent', () => {
  const d = lent();
  assert.equal(d.record.short, 'b8fae678');
  assert.equal(d.head.title, 'described b8fae678', 'describe owns the name once the record is here');
  assert.equal(d.closing, 'and here is what came of it',
    'the CLOSING reply, by timestamp, not the first or the longest');
  assert.equal(d.closingLabel, 'closing reply');
});

test('a record with no replies says its text is a tail, not a turn', () => {
  window.__old = { id: 'z', repo: STORE, record: { short: 'z', schema: 2, last_message: 'the tail' } };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__old)');
  window.document.body.append(el);
  Alpine.initTree(el);
  const d = Alpine.$data(el);
  assert.equal(d.closing, 'the tail');
  assert.equal(d.closingLabel, 'final turn, tail only');
});

test('the host is told what only a finished read knows', () => {
  // The deck header names a session before its record is here, off the row. The
  // title a record carries can differ, and the Claude session link exists only
  // on a record written after 2026-08-07, so both come back this way.
  assert.equal(window.__meta.title, 'described b8fae678');
  assert.equal(window.__meta.agent, 'https://claude.ai/code/session_01SX');
  assert.equal(window.__meta.path, PATH);
});

// ── The deck door ───────────────────────────────────────────────────────────

test('the cards button opens the record at the card it was asked for', async () => {
  opened.length = 0;
  await lent().openDeck(7);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].short, 'b8fae678');
  assert.equal(opened[0].start, 7, 'an outline row hands over which card it was');
});

test('an open deck becomes the parent, so the cards drill rather than stack', async () => {
  // Opened from a deck of sessions, the cards are one level DOWN: Back returns
  // to the session rather than closing the reader out of everything. The same
  // seam branch-brief's file deck takes one object over.
  opened.length = 0;
  const parent = { id: 'parent-deck' };
  window.swipeDeck.top = () => parent;
  try {
    await lent().openDeck();
    assert.equal(opened[0].parent, parent);
    assert.ok(!('start' in opened[0]), 'no card named means no start, not slide 0 forced');
  } finally { window.swipeDeck.top = () => null; }
});
