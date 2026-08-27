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

test('the files tooltip breaks lines and names what the count leaves out', () => {
  // Two failures this pins, and neither shows on the page: a title attribute
  // renders whatever it is given, so a literal backslash-n separator reads as
  // one run-on line with escapes in it, and an unqualified "files opened"
  // reads as "files read" when the count deliberately excludes a shell read.
  // The double escaping is right inside this component's template literal and
  // wrong in a plain method, which is how it got here.
  seed([rec()]);
  const label = data.filesLabel(data.sessionRows[0]);
  assert.doesNotMatch(label, /\\n/, 'a literal escape in a title renders as text');
  assert.ok(label.split('\n').length > 1, 'the busiest files each want their own line');
  assert.match(label, /Read, Edit, Write or NotebookEdit/);
  assert.match(label, /shell command is not counted/);
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

test('a branch addresses that branch at branch.html, not a filtered list', () => {
  // The whole point: the reader asked for a branch and gets that branch. The
  // behaviour this replaced switched panes and filtered by REPO, leaving the
  // branch still to find and the session they were reading lost.
  assert.equal(data.branchPageFor('mehrlander/web-tools', 'claude/a-1'),
               'https://mehrlander.github.io/web-tools/pages/branch.html#gh=mehrlander/web-tools@claude/a-1');
});

test('the branch address is absolute, because the app has moved once already', () => {
  // There were TWO builders for this until 2026-08-27, and the (row, branch)
  // one emitted '../branch.html'. That was a sibling path while the app lived
  // at pages/show-repo/show-repo.html and has resolved to
  // /web-tools/branch.html, a 404, since the 2026-08-16 move to app/. It had no
  // caller left, so nothing failed and nothing said so; the test that covered
  // it compared the broken string to itself. Deleted with its twin, and this is
  // the claim that outlives both.
  const url = data.branchPageFor('mehrlander/home', 'claude/x-9');
  assert.ok(url.startsWith('https://'), 'a relative page address cannot survive the app moving');
  assert.ok(!url.includes('..'), url);
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

// ── The pointer, and the address it names ───────────────────────────────────
//
// A session had two routes out of this pane and neither survived being sent to
// anybody: tapping the id opens an in-app takeover with no address, and the
// record itself is a private path. So what is pinned here is the join: the
// address the row links and the address the copied block names must be the same
// record, and the store must be the one THIS estate reads rather than a
// constant compiled into the kit.
test('the row links the session page at the id the store knows it by', () => {
  const row = window.RepoSessionsCache.summarize(rec(), 'sha1');
  assert.equal(data.sessionPageUrl(row),
    'https://mehrlander.github.io/web-tools/pages/session.html#id=b8fae678');
  assert.equal(data.sessionPageUrl({}),
    'https://mehrlander.github.io/web-tools/pages/session.html#id=');
});

test('copySessionPointer writes the block, with this estate\'s store and the pane\'s duration', async () => {
  let copied = '';
  window.navigator.clipboard = { writeText: async (t) => { copied = t; } };
  const row = window.RepoSessionsCache.summarize(rec(), 'sha1');
  await data.copySessionPointer(row);
  assert.match(copied, /^Session b8fae678 · claude\/a-1 \(2026-08-05, 3h · web-tools\)$/m);
  assert.match(copied, /^Ask: do the thing$/m);
  // The shell's registry, not the kit's default: an estate reading another
  // store would otherwise hand out a path into a repo it does not use.
  assert.match(copied, /^Record: me\/registry:sessions\/2026\/08\/2026-08-05-b8fae678\.json$/m);
  assert.match(copied, /^Read: \S+#id=b8fae678$/m);
  assert.match(copied, /^Query: python3 registry\/sessions\/tools\/search\.py --show b8fae678$/m);
  assert.match(copied, /^In Claude: https:\/\/claude\.ai\/code\/session_01SX$/m);
  // The link the row draws and the link the block carries are one address.
  assert.ok(copied.includes(data.sessionPageUrl(row)));
});

test('both controls draw on a record row, and a stub gets neither', async () => {
  shell.view = 'sessions';
  data.sessionLens = 'list';
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  // One record, and one stub beside it: a branch whose commit trailer names a
  // session the store holds no record for. The stub is the case that matters,
  // since there is nothing to address and nothing to copy, and a link to a
  // record that does not exist is worse than no control at all.
  data.activity = { 'acme/widget': { defaultBranch: 'main', scan: { branches: [
    { name: 'ghost-work', group: 'active', date: '2026-08-05',
      sessions: ['https://claude.ai/code/session_GHOST'] },
  ] } } };
  data.sessionRows_ = [window.RepoSessionsCache.summarize(rec(), 'sha1')];
  await Alpine.nextTick();
  const doc = window.document;
  assert.equal(data.sessionNodes.filter(n => n.kind === 'stub').length, 1, 'the stub is on screen');
  const links = [...doc.querySelectorAll('a[href*="session.html#id="]')];
  assert.equal(links.length, 1, 'one session page link, on the record row only');
  assert.equal(links[0].getAttribute('href'),
    'https://mehrlander.github.io/web-tools/pages/session.html#id=b8fae678');
  assert.equal(doc.querySelectorAll('i.ph-copy').length, 1, 'one copy control, likewise');
});


// ── The ask line's tooltip: how the session CLOSED ──────────────────────────
// The line is the opening ask, so the hover is the other end of the same
// session. It replaced a click (the line used to open the conversation), which
// the cards button in the row's cluster now carries on a control built for the
// purpose rather than on a line of prose.

test('the ask tooltip carries the closing reply under the ask', () => {
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, opening_ask: 'do the thing',
          replies: [{ at: '2026-08-05T14:00:00Z', text: 'partway' },
                    { at: '2026-08-05T16:00:00Z', text: 'and here is what came of it' }] }), 'x');
  const t = data.sessionAskTitle(row);
  assert.match(t, /^do the thing/, 'the ask leads, since that is the line being hovered');
  assert.match(t, /Closing reply/);
  assert.match(t, /and here is what came of it/);
  assert.ok(!t.includes('partway'), 'the CLOSING reply, not every reply');
});

test('a record with no replies says the tail is a tail, rather than passing it off', () => {
  // 52 of the 224 records on file are schema 1 to 3, which never held the
  // assistant's prose: last_message is the recorder's 500-character tail of the
  // final turn. Same field, lower fidelity, and the label is what says so.
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 2, last_message: 'the tail of the last turn' }), 'x');
  assert.equal(row.replyCut, 'tail');
  assert.match(data.sessionAskTitle(row), /Final turn \(tail only\)/);
});

test('a reply the cache cut says it was cut', () => {
  // The store's own schema-5 lesson: a bound is fine and a silent bound is the
  // damage. Median closing reply is 1,554 characters against a 600 cap, so this
  // fires on most rows and has to be visible.
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, replies: [{ at: 'z', text: 'x'.repeat(2000) }] }), 'x');
  assert.equal(row.replyCut, 'cut');
  assert.equal(row.reply.length, window.RepoSessionsCache.REPLY_CHARS);
  const t = data.sessionAskTitle(row);
  assert.match(t, /Closing reply \(trimmed\)/);
  assert.match(t, /…$/, 'the cut is marked where it happened, not only in the label');
});

test('a row from a cache built before the field falls back to the ask alone', () => {
  // The field arrived with ROW_V 4 and heals on the next crawl. Until it does,
  // a row carries no reply and the tooltip is what the line showed before this
  // existed rather than an empty label.
  assert.equal(data.sessionAskTitle({ ask: 'do the thing' }), 'do the thing');
});

test('the row version moved, so one pass re-reads the store and heals it', () => {
  // A row built by an older summarizer is stale against a NEW FIELD and its
  // record's sha will never move again to say so, which is what stalePaths
  // reads the version for.
  const S = window.RepoSessionsCache;
  const listing = [{ path: 'sessions/2026/08/2026-08-05-b8fae678.json', sha: 'same' }];
  const prev = { byPath: { 'sessions/2026/08/2026-08-05-b8fae678.json': { sha: 'same', v: 3 } } };
  assert.deepEqual(S.stalePaths(prev, listing), listing.map(e => e.path),
    'an unchanged blob still has to be re-read when the summarizer gained a field');
});


// ── The age pill answers "when was this last CHECKED" ───────────────────────
// A refresh on Branches and a refresh on Sessions gave two different answers to
// that, off one gesture, and the cause was that the activity crawl handed its
// freshly built document to the pane while the sessions crawl fired a bare
// event and made the pane re-read the file. Two consequences, both visible:
// a pass that changes nothing does not commit, so the stored file still carries
// the PREVIOUS pass's stamp and the pill snapped back to it; and a pass that
// did commit was read moments after its own write.
//
// Measured 2026-08-27 against the real store: the pane read "1h" straight after
// a refresh whose crawl had committed three minutes earlier.

test('a handed document lands without a read', async () => {
  FILES = {
    'state/sessions.json': {
      generatedAt: '2026-08-05T10:00:00Z',
      rows: [window.RepoSessionsCache.summarize(rec(), 'sha1')],
    },
  };
  await data.loadSessions(reg());
  assert.equal(data.sessionsGeneratedAt, '2026-08-05T10:00:00Z');

  GETS = [];
  await data.reloadSessions({
    generatedAt: '2026-08-05T18:30:00Z', titlesAt: '2026-08-05',
    rows: [window.RepoSessionsCache.summarize(rec({ short: 'newone' }), 'sha2')],
    attention: [{ path: 'a.js', count: 1, sessions: 1, last: '' }],
  });
  assert.equal(data.sessionsGeneratedAt, '2026-08-05T18:30:00Z');
  assert.equal(data.sessionsTitlesAt, '2026-08-05');
  assert.equal(data.sessionRows_.length, 1);
  assert.equal(data.sessionRows_[0].id, 'newone');
  assert.deepEqual(GETS, [], 'the crawl was holding the document; re-reading it is the bug');
});

test('a crawl that committed nothing still moves the stamp it hands over', () => {
  // The whole failure in one assertion. buildCache stamps generatedAt on every
  // build, commit or no commit, so a quiet pass reports that it checked. The
  // stored file keeps the older stamp on purpose, and the State view is where
  // last-BUILT is answered; the pill is not.
  const quiet = window.RepoSessionsCache.buildCache(
    { generatedAt: '2026-08-05T10:00:00Z', rows: [], byPath: {} },
    {}, [], '2026-08-05T18:30:00Z', null);
  assert.equal(quiet.generatedAt, '2026-08-05T18:30:00Z');
  assert.equal(window.RepoSessionsCache.cacheChanged(
    { generatedAt: '2026-08-05T10:00:00Z', rows: [] }, quiet), false,
    'and it is still not worth a commit, which is why the pane must be handed it');
});

test('a detail-less event still falls back to reading, so the contract only widened', async () => {
  FILES = {
    'state/sessions.json': {
      generatedAt: '2026-08-05T21:00:00Z',
      rows: [window.RepoSessionsCache.summarize(rec(), 'sha9')],
    },
  };
  GETS = [];
  await data.reloadSessions();
  assert.ok(GETS.includes('state/sessions.json'));
  assert.equal(data.sessionsGeneratedAt, '2026-08-05T21:00:00Z');
});
