// alpineComponents/estate.js — the Sessions pane, and the Lists merge that made
// room for it.
//
// Two things are worth pinning here beyond the plain derivations. First, the
// scope and repo filters both LAPSE rather than stranding the pane on an empty
// list, which is the failure the Open view already learned. Second, the
// Lists merge has to keep both old ?view keys resolving: ?view=jots is a link
// the user may have saved, and a merge that quietly sends it to Repos loses it
// with nothing to say so.
//
// Driven over a fake GH and a stubbed shell; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

// Alpine hands back reactive proxies, which are structurally equal to a plain
// object but never reference-equal. Compare the plain shape.
const plain = (v) => JSON.parse(JSON.stringify(v));

const REGISTRY = 'me/registry';

let FILES = {};
let GETS = [];
// The deck, stubbed. openSession's job here is to fetch the right record and
// hand it over; what the deck DOES with it is session-render.js's own test.
// gh.load is stubbed to a no-op so the lazy renderer chain does not need the
// network: the component only ever calls it when window.sessionRender is
// absent, and here it never is.
let OPENED = [];

function rec(over = {}) {
  return {
    schema: 3, session_id: 'b8fae678-x', short: 'b8fae678',
    agent_session: 'https://claude.ai/code/session_01SX',
    day: '2026-08-05', started: '2026-08-05T13:00:00Z', ended: '2026-08-05T16:00:00Z',
    repos: [{ name: 'web-tools', branch: 'claude/a-1', lines: 10 }],
    opening_ask: 'do the thing', exchanges: 4, assistant_messages: 90,
    tools: { Bash: 40 }, tokens: { input: 1, output: 2, cache_read: 3, cache_write: 4 },
    files_total: 2, files: { 'web-tools/a.js': { read: 1, edit: 5 }, 'home/b.md': { read: 2 } },
    calls_total: 40, failures: 0, transcript_bytes: 100,
    ...over,
  };
}

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async repos() { return []; }
  async ls() { return []; }
  async get(name) {
    GETS.push(name);
    if (this.repo === REGISTRY && FILES[name]) return { text: JSON.stringify(FILES[name]) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req(path) {
    if (typeof path === 'string' && path.startsWith('/repos/'))
      return { default_branch: 'main', description: '', private: true, pushed_at: '' };
    return {};
  }
  async save() { return {}; }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.sessionRender = { open: async (r) => { OPENED.push(r); return { close(){} }; } };
window.gh = { load: async () => {} };
const shell = {
  REGISTRY_REPO: REGISTRY,
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
  view: 'activity',
  refreshConfigCache() {},
  refreshActivity() {},
  refreshSessions() { this.refreshSessionsCalled = true; },
  goActivity() { this.view = 'activity'; },
  goSessions() { this.view = 'sessions'; },
  goTodo() { this.view = 'todo'; },
  goJots() { this.view = 'jots'; },
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/repo-sessions-cache.js',
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));
const reg = () => new FakeGH({ repo: REGISTRY });

const DAY = 864e5;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();

// ── The tab getter: two collapses, different shapes ─────────────────────────

test('todo and jots both resolve to one Lists pane; activity and sessions stay apart', () => {
  shell.view = 'todo';   assert.equal(data.tab, 'lists');
  shell.view = 'jots';   assert.equal(data.tab, 'lists', '?view=jots must still land somewhere real');
  shell.view = 'activity'; assert.equal(data.tab, 'activity');
  shell.view = 'sessions'; assert.equal(data.tab, 'sessions');
  shell.view = 'estate'; assert.equal(data.tab, 'repos');
});

test('the Sessions pill routes through the shell, so the URL keeps stamping', () => {
  shell.view = 'activity';
  data.goSub('sessions');
  assert.equal(shell.view, 'sessions');
  data.goSub('activity');
  assert.equal(shell.view, 'activity');
});

// ── Loading ─────────────────────────────────────────────────────────────────

test('loadSessions reads state/sessions.json; a missing cache is empty, not an error', async () => {
  FILES = {}; GETS = [];
  await data.loadSessions(reg());
  assert.deepEqual(plain(data.sessionRows_), []);
  assert.deepEqual(plain(data.sessionAttention), []);
  assert.equal(data.sessionsGeneratedAt, '');
  assert.equal(data.sessionsLoading, false);
  assert.ok(GETS.includes('state/sessions.json'));

  FILES = {
    'state/sessions.json': {
      generatedAt: '2026-08-05T18:00:00Z',
      rows: [window.RepoSessionsCache.summarize(rec(), 'sha1')],
      attention: [{ path: 'web-tools/a.js', count: 6, sessions: 3, last: '2026-08-05T16:00:00Z' }],
    },
  };
  await data.loadSessions(reg());
  assert.equal(data.sessionRows_.length, 1);
  assert.equal(data.sessionAttention.length, 1);
  assert.equal(data.sessionsGeneratedAt, '2026-08-05T18:00:00Z');
});

// ── Scope and filters ───────────────────────────────────────────────────────

function seed(rows) {
  data.sessionRows_ = rows.map((r, i) => window.RepoSessionsCache.summarize(r, 's' + i));
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
}

test('scopes count off the full list and Snagged is its own axis, not a time window', () => {
  seed([
    rec({ short: 'aaa', started: ago(1), ended: ago(1), failures: 0 }),
    rec({ short: 'bbb', started: ago(10), ended: ago(10), failures: 2 }),
    rec({ short: 'ccc', started: ago(90), ended: ago(90), failures: 1 }),
  ]);
  const by = Object.fromEntries(data.sessionScopes.map(s => [s.key, s.count]));
  assert.equal(by.week, 1);
  assert.equal(by.month, 2);
  assert.equal(by.all, 3);
  assert.equal(by.failed, 2, 'a snagged session counts however old it is');

  data.sessionScope = 'failed';
  assert.deepEqual(data.sessionRows.map(r => r.id), ['bbb', 'ccc']);
});

test('the repo filter lapses back to All when the scope no longer holds that repo', () => {
  seed([
    rec({ short: 'aaa', started: ago(1), ended: ago(1), repos: [{ name: 'web-tools', branch: 'claude/a-1', lines: 1 }] }),
    rec({ short: 'bbb', started: ago(40), ended: ago(40), repos: [{ name: 'budget-wa', branch: 'claude/b-1', lines: 1 }] }),
  ]);
  data.sessionRepoFilter = 'budget-wa';
  assert.equal(data.activeSessionRepo, 'budget-wa');
  assert.deepEqual(data.sessionRows.map(r => r.id), ['bbb']);

  // Narrow the scope so budget-wa has nothing in it. The pane must not sit
  // empty with a chip lit that explains nothing.
  data.sessionScope = 'week';
  assert.equal(data.activeSessionRepo, '');
  assert.deepEqual(data.sessionRows.map(r => r.id), ['aaa']);
});

test('repo chips come off the scoped list, busiest first, with no zero rows', () => {
  seed([
    rec({ short: 'aaa', repos: [{ name: 'web-tools', branch: 'claude/a', lines: 1 }] }),
    rec({ short: 'bbb', repos: [{ name: 'web-tools', branch: 'claude/b', lines: 1 }] }),
    rec({ short: 'ccc', repos: [{ name: 'home', branch: 'claude/c', lines: 1 }] }),
  ]);
  assert.deepEqual(plain(data.sessionRepos), [{ repo: 'web-tools', count: 2 }, { repo: 'home', count: 1 }]);
});

// ── The record, opened ──────────────────────────────────────────────────────

test('opening a row fetches its record by the store path and hands it to the deck', async () => {
  seed([rec()]);
  const row = data.sessionRows[0];
  FILES = { 'sessions/2026/08/2026-08-05-b8fae678.json': rec() };
  GETS = [];
  OPENED = [];

  await data.openSession(row);
  assert.equal(data.openSessionId, 'b8fae678');
  assert.ok(GETS.includes('sessions/2026/08/2026-08-05-b8fae678.json'),
            'the record is addressed by the path its own fields imply');
  assert.equal(data.sessionDetail.short, 'b8fae678');
  assert.equal(OPENED.length, 1, 'one tap must reach the conversation, not an intermediate pane');
  assert.equal(OPENED[0].short, 'b8fae678', 'the deck is handed the record that was just read');
});

test('re-opening a session does not re-fetch its record', async () => {
  seed([rec()]);
  FILES = { 'sessions/2026/08/2026-08-05-b8fae678.json': rec() };
  await data.openSession(data.sessionRows[0]);
  GETS = []; OPENED = [];
  await data.openSession(data.sessionRows[0]);
  assert.deepEqual(GETS, [], 'the record is cached per id; a second read is wasted');
  assert.equal(OPENED.length, 1, 'and it still opens');
});

test('a record that will not read reports it rather than opening an empty deck', async () => {
  seed([rec()]);
  FILES = {};
  OPENED = [];
  // The cache above is per-id and outlives a seed(), so this would otherwise
  // be served from the previous test's read and never reach the store at all.
  data._records = {};
  await data.openSession(data.sessionRows[0]);
  assert.match(data.sessionDetailErr, /Could not open b8fae678/);
  assert.equal(data.sessionDetailLoading, false);
  assert.equal(OPENED.length, 0, 'a failed read must not open a deck on nothing');
});

// The row carries both facts the session-link cell branches on: the URL when
// the record names one, and the schema when it does not. The view shows a
// dimmed icon rather than nothing in the empty case, and the two causes get
// different tooltips, so an absent `agent` must stay distinguishable by schema
// rather than collapsing into one blank.
test('a record naming no harness session leaves agent empty, with schema still readable', () => {
  seed([
    rec({ short: 'named' }),
    rec({ short: 'nocommit', agent_session: '' }),
    rec({ short: 'old', schema: 1, agent_session: undefined }),
  ]);
  const by = Object.fromEntries(data.sessionRows.map(r => [r.id, r]));
  assert.equal(by.named.agent, 'https://claude.ai/code/session_01SX');
  assert.equal(by.nocommit.agent, '', 'a schema-3 record that named no session must not invent one');
  assert.equal(by.nocommit.schema, 3, 'schema must survive so the empty case can say WHY it is empty');
  assert.equal(by.old.agent, '');
  assert.equal(by.old.schema, 1, 'a pre-schema-3 record is the other reason the link is absent');
});


// ── The join to a branch ────────────────────────────────────────────────────

test('a branch chip addresses that branch at branch.html, not a filtered list', () => {
  seed([rec()]);
  data.entries = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
  const url = data.branchPageUrl(data.sessionRows[0], 'claude/a-1');
  // The whole point: the reader asked for a branch and gets that branch. The
  // old behaviour switched panes and filtered by REPO, leaving the branch still
  // to find and the session they were reading lost.
  assert.equal(url, '../branch.html#gh=mehrlander/web-tools@claude/a-1');
});

test('an unresolvable repo still yields the page, without a broken address', () => {
  seed([rec()]);
  data.entries = [];
  const url = data.branchPageUrl(data.sessionRows[0], 'claude/a-1');
  assert.equal(url, '../branch.html', 'better the page\'s own address field than a link to nowhere');
});

// ── Labels ──────────────────────────────────────────────────────────────────

test('durLabel reads as time, not as a number of minutes', () => {
  assert.equal(data.durLabel(0), '');
  assert.equal(data.durLabel(49), '49m');
  assert.equal(data.durLabel(120), '2h');
  assert.equal(data.durLabel(178), '2h58m');
});

test('the token headline is output, not the cache reads that dwarf it', () => {
  const row = window.RepoSessionsCache.summarize(
    rec({ tokens: { input: 624, output: 337631, cache_read: 92466018, cache_write: 3979906 } }), 'x');
  assert.equal(data.tokenShort(row), '338k');
  assert.match(data.tokenLabel(row), /cache read 92466018/);
});

test('the finder\'s open-session event switches panes and opens the record\'s reader', async () => {
  const shellStub = window.__shell;
  shellStub.goSessions = () => { shellStub._wentSessions = true; };
  seed([rec()]);
  FILES = { 'sessions/2026/08/2026-08-05-b8fae678.json': rec() };
  OPENED = [];
  window.document.dispatchEvent(new window.CustomEvent('web-tools:open-session',
    { detail: { id: 'b8fae678', day: '2026-08-05' } }));
  // The handler awaits the fetch; give the microtask queue a beat.
  await new Promise(r => setTimeout(r, 20));
  assert.equal(shellStub._wentSessions, true);
  assert.equal(data.openSessionId, 'b8fae678');
  assert.equal(OPENED.length, 1);
});
