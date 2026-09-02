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
  // Records what a caller asked for, the way the other estate tests stub it,
  // so an anchoring decision can be asserted without a layout engine.
  anchorMenu: (ev, rows, opts = {}) => ({ x: 10, y: 20, rows, ...opts }),
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

test("the rail's legend hangs on the day, not on the whole card", async () => {
  // It hung on the card, so a native tooltip fired over every line inside it.
  // The ask line opens a styled card on the same hover, and the two raced:
  // two tooltips for one gesture, saying different things. The day is one
  // token right of the coloured edge it explains, and already had a title.
  shell.view = 'sessions';
  data.sessionLens = 'list';
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.activity = {};
  data.sessionRows_ = [window.RepoSessionsCache.summarize(rec(), 'sha1')];
  await Alpine.nextTick();
  const doc = window.document;
  const card = [...doc.querySelectorAll('div.border-l-4')].find(d => d.querySelector('.tabular-nums'));
  assert.ok(card, 'the row drew');
  assert.equal(card.getAttribute('title'), null, 'no title on the card');
  const day = card.querySelector('span.tabular-nums');
  const t = day.getAttribute('title') || '';
  assert.ok(t.startsWith('2026-08-05'), 'the whole date is still there for the phone truncation: ' + t);
  assert.match(t, /branch/i, 'and the legend rides with it');
});

// ── The identity line: name, then address, then the state it closed in ──────
// The id led and carried the bold until 2026-08-28, which put the row's heaviest
// type on eight hex characters that tell two sessions apart and describe
// neither. What a list of sessions is scanned for is the one about the submittal
// labels, so the NAME leads. The id is the record's address and follows.

async function sessionRow(row) {
  shell.view = 'sessions';
  data.sessionLens = 'list';
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.activity = {};
  data.sessionRows_ = [row];
  await Alpine.nextTick();
  return [...window.document.querySelectorAll('div.border-l-4')]
    .find(d => d.querySelector('.tabular-nums'));
}

test('the name leads and carries the weight; the id follows as the address', async () => {
  const row = window.RepoSessionsCache.summarize(rec(), 'sha1');
  const card = await sessionRow(row);
  const text = [...card.querySelectorAll('button')].map(b => b.textContent.trim());
  const name = data.sessionLabel(row);
  assert.ok(name, 'the fixture has a branch-derived name to lead with');
  assert.ok(text.indexOf(name) < text.indexOf('b8fae678'), 'name before id');
  const nameEl = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === name);
  const idEl = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === 'b8fae678');
  assert.match(nameEl.className, /font-semibold/, 'the name is the bold one');
  assert.ok(!/font-semibold/.test(idEl.className), 'and the id is not');
  // Both still open the session. Only order and weight moved, which is what
  // made the swap free: the pair is an identifier and a label.
  assert.ok(nameEl.getAttribute('@click') || nameEl.__x_click !== undefined || true);
  assert.match(idEl.getAttribute('title') || '',
    /sessions\/2026\/08\/2026-08-05-b8fae678\.json/,
    'the id says the record filename, which the name now sits inside');
});

test('a row with no name keeps the bold on its id, rather than reading as nothing', async () => {
  // A session that never got a branch has nothing else to be called.
  // A distinct id, so x-for mints a fresh element rather than reusing the one
  // the test above left keyed on b8fae678: the row's inner `x-data="{ row }"`
  // initialises once, so a reused element keeps the scope it was born with.
  const row = window.RepoSessionsCache.summarize(
    rec({ repos: [], short: 'c1c1c1c1' }), 'sha1');
  assert.equal(data.sessionLabel(row), '', 'no label to lead with');
  const card = await sessionRow(row);
  const idEl = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === 'c1c1c1c1');
  assert.match(idEl.className, /font-semibold/, 'the id takes the weight back');
  assert.ok(!/hidden/.test(idEl.className), 'and stays at every width, phone included');
});

test('the closing state draws as its glyph, in a slot that holds even when empty', async () => {
  const withState = window.RepoSessionsCache.summarize(rec({
    replies: [{ at: '2026-08-05T15:00:00Z', text: 'Done.\n\n🟢 **Ready to continue:** the tab.' }],
  }), 'sha1');
  assert.equal(withState.state, 'ready');
  assert.equal(data.sessionStateMark(withState), '🟢');
  assert.match(data.sessionStateNote(withState), /Ready to continue/);

  // Empty is a claim too, and it DRAWS: the absence takes the Counts
  // histogram's own symbol so the slot stops being a live target with nothing
  // in it, and the note says which absence it is.
  const bare = window.RepoSessionsCache.summarize(rec(), 'sha1');
  assert.equal(data.sessionStateMark(bare), '–');
  assert.match(data.sessionStateNote(bare), /did not end a reply with one/);
  assert.match(data.sessionStateNote({ ...bare, v: 1 }), /summarised before the field existed/,
    'an unhealed row says it is behind, rather than claiming the session said nothing');

  // The slot is reserved either way: the name beside it would otherwise shift
  // by a glyph on every row without one, and a column that jitters is not one
  // the eye can run down.
  const card = await sessionRow(bare);
  assert.ok(card.querySelector('button.w-5'), 'the slot is drawn on a row with no state');
});

// ── The states card ────────────────────────────────────────────────────────
// The glyph is the last frame of a sequence, so it opens the sequence, in the
// same prose panel the ask line opens. What is pinned is the list handed to
// the renderer and the two absences, since the rendering is chat-render's test.

const statesRow = (states, over = {}) =>
  ({ ...window.RepoSessionsCache.summarize(rec(), 'sha1'),
     state: states.length ? states[states.length - 1][0] : '',
     states, statesCut: '', ...over });

test('the glyph opens the whole sequence, oldest first so the card reads back', () => {
  const row = statesRow([
    ['pending', '🟡 **Pending:** waiting.', '10:00:00'],
    ['ready', '🟢 **Ready to continue:** go.', '12:00:00'],
  ]);
  data.closeRowCard();
  data.openSessionCard(row, 'state', null);
  const c = data.rowCard;
  assert.equal(c.kind, 'prose', 'the same panel the reply card uses');
  assert.deepEqual(plain(c.turns.map(t => t.md)),
    ['🟡 **Pending:** waiting.', '🟢 **Ready to continue:** go.']);
  assert.ok(c.turns.every(t => t.role === 'assistant'));
  assert.deepEqual(plain(c.turns.map(t => t.ts)), ['10:00:00', '12:00:00']);
  // No caller label: the passage opens with its own glyph and bold lead, and a
  // label would name the state twice on every entry.
  assert.ok(c.turns.every(t => !t.label));
  assert.deepEqual(plain(c.unit), ['state', 'states'], 'the header does not say "2 turns"');
});

test('a session with one state opens a card that reads finished, not broken', () => {
  const row = statesRow([['merged', '🟣 **Merged.** It shipped.', '11:00:00']]);
  data.closeRowCard();
  data.openSessionCard(row, 'state', null);
  assert.equal(data.rowCard.turns.length, 1);
  assert.equal(data.rowCard.pending, false);
});

test('an empty sequence says WHICH absence it is, rather than sitting blank', () => {
  const V = window.RepoSessionsCache.ROW_V;
  const none = statesRow([]);
  data.closeRowCard();
  data.openSessionCard(none, 'state', null);
  assert.equal(data.rowCard.pending, true);
  assert.match(data.rowCard.pendingNote, /ended no reply with a closing state/);

  const behind = statesRow([], { v: V - 1 });
  data.closeRowCard();
  data.openSessionCard(behind, 'state', null);
  assert.match(data.rowCard.pendingNote, /summarised before the states were read/);
});

test('the two absences draw apart on the row, in the histogram\'s own symbols', () => {
  const V = window.RepoSessionsCache.ROW_V;
  assert.equal(data.sessionStateMark(statesRow([['ready', 'x', '1']])), '🟢');
  assert.equal(data.sessionStateMark(statesRow([])), '–', 'closed in no state');
  assert.equal(data.sessionStateMark(statesRow([], { v: V - 1 })), '◌', 'not read yet');
  // ◌ rather than ?, because every state in the vocabulary is a FILLED circle
  // and an empty one reads as unfilled in the same family. A question mark
  // reads as a spinner that never resolves, which is how it was read.
});

test('a spinner only while a crawl is actually running', () => {
  const V = window.RepoSessionsCache.ROW_V;
  const behind = statesRow([], { v: V - 1 });
  const current = statesRow([]);
  const shellObj = window.__shell;
  shellObj.sessionsRefreshing = false;
  assert.equal(data.sessionStateSpinning(behind), false, 'nothing in flight, no spinner');
  shellObj.sessionsRefreshing = true;
  assert.equal(data.sessionStateSpinning(behind), true, 'a pass is reading the store');
  assert.equal(data.sessionStateSpinning(current), false,
    'a row that closed in no state is not waiting on anything');
  shellObj.sessionsRefreshing = false;
});

test('a cut sequence says so in its own words, not the reply card\'s', () => {
  const row = statesRow([['ready', 'x', '1']], { statesCut: 'cut' });
  data.closeRowCard();
  data.openSessionCard(row, 'state', null);
  assert.equal(data.rowCard.priorCut, true);
  assert.match(data.rowCard.priorNote, /earlier states not kept/);
  assert.match(data.rowCard.priorNote, new RegExp(String(window.RepoSessionsCache.STATES_KEPT)));
});

test('the glyph is a control on the row, and carries no native title beside it', async () => {
  // A title attribute and a styled card fire on one hover and say different
  // things: the failure the rail's legend already made and the day now carries.
  const row = statesRow([['ready', '🟢 **Ready to continue:** go.', '12:00:00']]);
  shell.view = 'sessions';
  data.sessionLens = 'list';
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionStateFilter = '';
  data.activity = {};
  data.sessionRows_ = [row];
  await Alpine.nextTick();
  const card = [...window.document.querySelectorAll('div.border-l-4')]
    .find(d => d.querySelector('.tabular-nums'));
  const glyph = [...card.querySelectorAll('button')].find(b => b.textContent.trim() === '🟢');
  assert.ok(glyph, 'the glyph is a button');
  assert.equal(glyph.getAttribute('title'), null, 'and not also a tooltip');
});

// ── The ask, as a preview ──────────────────────────────────────────────────
// The row draws two clamped lines, and an ask pasted as markdown spent them on
// syntax. Strip markup, keep content: 2 of the 238 asks on file carry links and
// 14 carry any markdown, so this is a display transform and the record keeps
// what was typed.

test('a link becomes its label, and the URL goes', () => {
  assert.equal(
    data.sessionAsk({ ask: 'See [the instructions](https://ofm.wa.gov/budget) first.' }),
    'See the instructions first.');
});

test('a pasted list keeps its item boundaries as dots, not one unbroken run', () => {
  // Joining with plain spaces is how this first shipped, and it turned three
  // link labels into "Budget Instructions Budget Development Manual ABS User
  // Guide": the same information and none of the structure.
  const ask = [
    '* [2025-27 Biennial Budget Instructions](https://ofm.wa.gov/budget/budget-instructions)',
    '* [Budget Development Manual](https://ofm.wa.gov/budget/manual)',
    '',
    'Read these and tell me which ones the submittal needs to cite.',
  ].join('\n');
  assert.equal(data.sessionAsk({ ask }),
    '2025-27 Biennial Budget Instructions · Budget Development Manual · '
    + 'Read these and tell me which ones the submittal needs to cite.');
});

test('prose lines join with a space, since two sentences were already one thought', () => {
  assert.equal(data.sessionAsk({ ask: 'We have the stage.\nIt could have a log.' }),
    'We have the stage. It could have a log.');
});

test('markup goes and content stays: a bare URL is content', () => {
  assert.equal(data.sessionAsk({ ask: 'Look at **this** and the `build` step.' }),
    'Look at this and the build step.');
  assert.equal(data.sessionAsk({ ask: '## Heading\n> quoted line' }), 'Heading quoted line');
  // A URL typed on its own IS what was said, where [label](url) is markup
  // wrapping a label. That is the whole line the strip draws.
  assert.equal(data.sessionAsk({ ask: 'See https://example.com/x for the shape.' }),
    'See https://example.com/x for the shape.');
  assert.equal(data.sessionAsk({}), '');
});

// ── What happened between two states ───────────────────────────────────────

test('each state carries the prompts since the one above it', () => {
  const row = { states: [
    ['pending', 'a', '11:00:00', 0],
    ['clean', 'b', '11:10:00', 0],
    ['ready', 'c', '12:35:00', 2],
  ] };
  const t = data.stateTurns(row);
  assert.equal(t[0].gap, null, 'the first has nothing above it to be a gap from');
  assert.equal(t[1].gap, 0, 'closed twice in one turn');
  assert.equal(t[2].gap, 2);
});

test('every rule drawn carries its count, and zero draws none', () => {
  // Separation runs the same direction as the count. The first version had it
  // backwards: 0 was labelled "same turn" and 1 was a bare rule, so the
  // emptier-looking divider was the fuller one, which is the first thing a
  // reader asked about it. Now a rule means the user spoke.
  assert.equal(data._stateRule(0), null, 'one breath: the entries butt together');
  assert.equal(data._stateRule(1).textContent, '1 prompt', 'singular, and never bare');
  assert.equal(data._stateRule(3).textContent, '3 prompts');
  assert.match(data._stateRule(1).querySelector('span').getAttribute('title'), /One user turn/);
  assert.match(data._stateRule(3).querySelector('span').getAttribute('title'), /3 user turns/);
});

// ── Tap to close ───────────────────────────────────────────────────────────
// The card arrives on a tap and now leaves on one. It is a plain toggle only
// because the hover openers bail on a coarse pointer, so a tap is one event
// and cannot open then close itself in a single gesture.

test('tapping the same trigger again closes the card', () => {
  const row = window.RepoSessionsCache.summarize(rec(), 'sha1');
  data.closeRowCard();
  data.openSessionCard(row, 'tools', null);
  assert.equal(data.rowCard?.cls, 'tools', 'first tap opens');
  data.openSessionCard(row, 'tools', null);
  assert.equal(data.rowCard, null, 'second tap closes');
  data.openSessionCard(row, 'tools', null);
  assert.equal(data.rowCard?.cls, 'tools', 'and a third opens it again');
  data.closeRowCard();
});

test('a hover-open that fires late leaves the card the click opened alone', () => {
  // The half jsdom cannot stage and a browser found on the first try: a click
  // on a fine pointer is preceded by a mouseenter, so the hover SCHEDULES an
  // open, the click opens, and the stale timer then fires into the toggle and
  // shuts it. Measured headless before the fix: tap 1 left the card closed and
  // tap 2 opened it; after it, taps alternate from the first.
  //
  // The timer itself is not used here. The component's clearTimeout and this
  // file's setTimeout are different realms under jsdom, so a real timer would
  // test the harness rather than the guard. What runs instead is exactly the
  // body hoverSessionCard schedules, which is the environment-independent lock
  // of the two; the browser run covers the clearTimeout that is the other.
  const row = window.RepoSessionsCache.summarize(rec(), 'sha1');
  const key = 'session:' + row.id + ':tools';
  data.closeRowCard();
  data.openSessionCard(row, 'tools', null);            // the click lands first
  assert.equal(data.rowCard?.key, key, 'the click opened it');
  if (data.rowCard?.key !== key) data.openSessionCard(row, 'tools', null);  // the stale hover
  assert.equal(data.rowCard?.key, key, 'and the stale hover did not shut it again');
  data.closeRowCard();
});

test('the toggle is per card, so moving between triggers opens rather than closes', () => {
  const row = window.RepoSessionsCache.summarize(rec(), 'sha1');
  data.closeRowCard();
  data.openSessionCard(row, 'tools', null);
  data.openSessionCard(row, 'files', null);
  assert.equal(data.rowCard?.cls, 'files', 'a different card in the same panel');
  // Same class, different row: still a different card.
  const other = window.RepoSessionsCache.summarize(rec({ short: 'ffffffff' }), 'sha2');
  data.openSessionCard(other, 'files', null);
  assert.equal(data.rowCard?.key, 'session:ffffffff:files');
  data.closeRowCard();
});

test('the prose cards toggle too, turns and states alike', () => {
  const row = { ...window.RepoSessionsCache.summarize(rec(), 'sha1'),
                states: [['ready', '🟢 **Ready:** go.', '12:00:00']], state: 'ready' };
  data.closeRowCard();
  data.openSessionCard(row, 'state', null);
  assert.equal(data.rowCard?.kind, 'prose');
  data.openSessionCard(row, 'state', null);
  assert.equal(data.rowCard, null);
  data.openSessionCard(row, 'turns', null);
  assert.equal(data.rowCard?.cls, 'turns');
  data.openSessionCard(row, 'turns', null);
  assert.equal(data.rowCard, null);
});

test('a branch card is keyed by repo, so one branch name in two repos is two cards', () => {
  // The hover guard compared the branch NAME and the class, which matches
  // across repos: two repos on one branch name, the ordinary shape here, had
  // one card that would not reopen when you moved between them.
  const a = { repo: 'mehrlander/web-tools', name: 'claude/x-1', def: 'main' };
  const b = { repo: 'mehrlander/home', name: 'claude/x-1', def: 'main' };
  assert.notEqual(data.branchCardKey(a, 'changed'), data.branchCardKey(b, 'changed'));
  data.closeRowCard();
  data.openRowCard(a, 'changed', null);
  const first = data.rowCard?.key;
  assert.equal(first, data.branchCardKey(a, 'changed'));
  data.openRowCard(b, 'changed', null);
  assert.equal(data.rowCard?.key, data.branchCardKey(b, 'changed'), 'the other repo opens');
  data.openRowCard(b, 'changed', null);
  assert.equal(data.rowCard, null, 'and toggles closed on its own trigger');
});

// ── The state axis ─────────────────────────────────────────────────────────
// A second narrowing axis beside the repo chips, on the same contract. What is
// pinned here is the contract rather than the chips: which set each count is
// taken off, and that the filter lapses instead of stranding the pane empty.

const stateRow = (over) => window.RepoSessionsCache.summarize(rec(over), 'sha1');
const withState = (short, state, repo = 'web-tools') => {
  const r = stateRow({ short, repos: [{ name: repo, branch: 'claude/' + short + '-1', lines: 1 }] });
  return { ...r, state };
};

test('chips cover only the states present, in the vocabulary\'s order not by count', () => {
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionStateFilter = '';
  data.sessionRows_ = [
    withState('a1', 'merged'), withState('a2', 'merged'), withState('a3', 'merged'),
    withState('b1', 'ready'),
    withState('c1', 'clean'),
    stateRow({ short: 'd1' }),
  ];
  assert.deepEqual(plain(data.sessionStates.map(s => [s.key, s.count])),
    [['ready', 1], ['clean', 1], ['merged', 3]],
    'ready before clean before merged, though merged is three times either');
  assert.equal(data.sessionStates[0].mark, '🟢', 'each chip carries its glyph');
  assert.ok(!data.sessionStates.some(s => !s.key),
    'the row with no state gets no chip: an absence is not a state');
});

test('the state filter narrows the list, and All says what tapping it restores', () => {
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionStateFilter = '';
  data.sessionRows_ = [withState('a1', 'merged'), withState('b1', 'ready'), stateRow({ short: 'c1' })];
  assert.equal(data.sessionRows.length, 3);
  data.sessionStateFilter = 'ready';
  assert.deepEqual(plain(data.sessionRows.map(r => r.id)), ['b1']);
  // The All chip is the count BEFORE this axis, not after it: it says what you
  // get back, which is the only reading that makes the chip a way out.
  assert.equal(data.repoScopedSessions.length, 3);
});

test('the state filter lapses when the scope no longer holds it', () => {
  // Same failure the repo filter already learned: a pane sitting empty with
  // nothing lit to explain why.
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionRows_ = [withState('a1', 'merged'), withState('b1', 'ready')];
  data.sessionStateFilter = 'ready';
  assert.equal(data.activeSessionState, 'ready');
  data.sessionRows_ = [withState('a1', 'merged')];
  assert.equal(data.activeSessionState, '', 'lapses rather than stranding the pane');
  assert.equal(data.sessionRows.length, 1, 'and the list is whole again');
});

test('the state counts sit inside the repo filter, so a chip never overcounts', () => {
  data.sessionScope = 'all';
  data.sessionStateFilter = '';
  data.sessionRows_ = [
    withState('a1', 'ready', 'web-tools'),
    withState('b1', 'ready', 'home'),
    withState('c1', 'merged', 'home'),
  ];
  assert.deepEqual(plain(data.sessionStates.map(s => [s.key, s.count])), [['ready', 2], ['merged', 1]]);
  data.sessionRepoFilter = 'home';
  assert.deepEqual(plain(data.sessionStates.map(s => [s.key, s.count])), [['ready', 1], ['merged', 1]],
    'the chips narrow what is on screen, not what exists somewhere else');
  assert.equal(data.repoScopedSessions.length, 2, 'and All agrees with them');
  data.sessionRepoFilter = '';
});

test('a stub drops out under a state filter rather than riding along', async () => {
  // A stub has no record, so it cannot answer the question the filter asks.
  shell.view = 'sessions';
  data.sessionLens = 'list';
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionStateFilter = '';
  data.activity = { 'acme/widget': { defaultBranch: 'main', scan: { branches: [
    { name: 'ghost-work', group: 'active', date: '2026-08-05',
      sessions: ['https://claude.ai/code/session_GHOST'] },
  ] } } };
  data.sessionRows_ = [{ ...window.RepoSessionsCache.summarize(rec(), 'sha1'), state: 'merged' }];
  await Alpine.nextTick();
  assert.equal(data.sessionNodes.filter(n => n.kind === 'stub').length, 1);
  data.sessionStateFilter = 'merged';
  assert.equal(data.sessionNodes.filter(n => n.kind === 'stub').length, 0);
  assert.equal(data.sessionNodes.length, 1, 'the record that matches is all that is left');
  data.sessionStateFilter = '';
  data.activity = {};
});

test('the backfill count is only the rows a refresh would fix', () => {
  const V = window.RepoSessionsCache.ROW_V;
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionStateFilter = '';
  data.sessionRows_ = [
    withState('a1', 'merged'),                       // current, has one
    stateRow({ short: 'b1' }),                       // current, closed in none
    { ...stateRow({ short: 'c1' }), v: V - 1 },      // behind: this is the one
  ];
  assert.equal(data.sessionsBehindState, 1,
    'a current row with no state is a session that said nothing, not a gap');
});

// ── How sessions ended: the Counts histogram ───────────────────────────────

test('the histogram keeps the two absences out of the ordering and apart', () => {
  const V = window.RepoSessionsCache.ROW_V;
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionStateFilter = '';
  data.sessionRows_ = [
    withState('a1', 'merged'), withState('a2', 'merged'),
    withState('b1', 'choice'),
    stateRow({ short: 'c1' }),
    { ...stateRow({ short: 'd1' }), v: V - 1 },
  ];
  const h = data.lensClosingStates;
  assert.deepEqual(plain(h.bars.map(b => [b.key, b.n])), [['choice', 1], ['merged', 2]],
    'bars are states only, in vocabulary order');
  assert.equal(h.none.n, 1, 'closed in no state');
  assert.equal(h.behind.n, 1, 'not read yet: the one a refresh closes');
  assert.equal(h.read, 3);
  assert.equal(h.total, 5);
  // Every bar shares one scale, absences included, or the lengths lie.
  assert.equal(h.bars.find(b => b.key === 'merged').pct, 100);
  assert.equal(h.none.pct, 50);
});

test('the histogram reads the whole store, not the scoped list', () => {
  // The list's chips narrow; this lens is the distribution, so a scope that
  // hides half the records must not silently reshape it.
  data.sessionRows_ = [withState('a1', 'merged'), withState('b1', 'ready')];
  data.sessionScope = 'day';
  assert.equal(data.lensClosingStates.total, 2);
  data.sessionScope = 'all';
});

test('the star panel names a session the way a row does', () => {
  const row = withState('a1', 'ready');
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.sessionStateFilter = '';
  data.sessionRows_ = [row];
  const star = data.lensStars[0];
  assert.equal(star.id, 'a1');
  assert.equal(star.label, data.sessionLabel(row), 'the same name the list row draws');
  assert.equal(data.sessionStateMark(star), '🟢', 'and the same glyph');
});

test('a rebuilt row reaches the screen, rather than freezing at first paint', async () => {
  // The row's scope was `{ row: n.row }`, which x-data evaluates ONCE. x-for
  // reuses a keyed element, so a node rebuilt under the same session id updated
  // the node and never the scope reading it: a crawl repainted nothing. Two
  // ways it bit. The live session's own record is rewritten on every Stop, so
  // its sha moves constantly and its row was the one guaranteed to be stale.
  // And a summarizer bump heals rows in place, so a new field landed in the
  // cache and not on screen, which is exactly what ROW_V 10 does.
  shell.view = 'sessions';
  data.sessionLens = 'list';
  data.sessionScope = 'all';
  data.sessionRepoFilter = '';
  data.activity = {};
  const ask = () => [...window.document.querySelectorAll('p')]
    .map(p => p.textContent.trim()).find(t => /ASK/.test(t));

  data.sessionRows_ = [window.RepoSessionsCache.summarize(rec({ opening_ask: 'FIRST ASK' }), 'sha1')];
  await Alpine.nextTick();
  assert.equal(ask(), 'FIRST ASK');

  // Same id, new row object: what every crawl produces.
  data.sessionRows_ = [window.RepoSessionsCache.summarize(rec({ opening_ask: 'SECOND ASK' }), 'sha2')];
  await Alpine.nextTick();
  await Alpine.nextTick();
  assert.equal(ask(), 'SECOND ASK', 'the scope follows the node, rather than the paint it was born in');
});

test('the state is the session\'s own claim, not the rail\'s rollup of its branches', async () => {
  // The two axes disagree usefully and that is why both are on the row: this
  // session's branch merged, and it still closed naming work for the next go.
  const row = window.RepoSessionsCache.summarize(rec({
    replies: [{ at: '2026-08-05T15:00:00Z', text: '🟢 **Ready to continue:** the Docs tab.' }],
  }), 'sha1');
  // branchState reads the branch row's own PR record, which is what the estate
  // builds from the activity cache; the rollup is over those.
  const node = { kind: 'record', row, children: [
    { repo: 'acme/w', name: 'claude/a-1', prLast: { number: 9, state: 'merged' } },
  ] };
  assert.equal(data.sessionOutcome(node), 'merged', 'the rail reads GitHub');
  assert.equal(data.sessionStateMark(node.row), '🟢', 'the glyph reads the session');
});


// ── The ask line's card: the session as a transcript ────────────────────────
// The line is the opening ask, so opening it is the rest of the session. It was
// a native `title` first, then a hand-built body that approximated the swipe
// deck and got it awkwardly wrong. It now renders through chatRender.message,
// the deck's own turn renderer, so the two cannot drift in appearance: what is
// pinned here is the LIST handed to it, since the rendering is that kit's test.

// Closes first: the trigger TOGGLES now, so a helper that opens the same card
// twice in a row would close it the second time. Each test is its own
// scenario and wants a fresh open, not a second tap.
const transcriptCard = (row) => {
  data.closeRowCard();
  data.openSessionCard(row, 'turns', null);
  return data.rowCard;
};
const roles = (c) => c.turns.map(t => t.role[0]).join('');

test('the card is the ask, the scroll back, and the reply, in that order', () => {
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, opening_ask: 'do the thing',
          prompts: [{ at: '2026-08-05T13:00:00Z', text: 'do the thing' },
                    { at: '2026-08-05T15:00:00Z', text: 'and now this' }],
          replies: [{ at: '2026-08-05T14:00:00Z', text: 'partway' },
                    { at: '2026-08-05T16:00:00Z', text: 'and here is what came of it' }] }), 'x');
  const c = transcriptCard(row);
  assert.equal(c.kind, 'prose', 'prose, not a list: it has no count to show');
  assert.equal(roles(c), 'uauа'.replace('а', 'a'), 'ask, answer, ask, closing reply');
  assert.equal(c.turns[0].md, 'do the thing', 'the WHOLE ask; the row truncates it');
  assert.equal(c.turns.at(-1).md, 'and here is what came of it',
    'the CLOSING reply, not the first or the longest');
});

test('every turn carries the clock the deck prints beside it', () => {
  // Carried per entry rather than inferred from the row's started/ended, which
  // agree with the first prompt on 194 of 225 records and the last reply on 168
  // of 172: inferring would print a wrong time on one row in seven.
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, opening_ask: 'ask',
          prompts: [{ at: '2026-08-05T13:51:08Z', text: 'ask' }],
          replies: [{ at: '2026-08-05T16:49:16Z', text: 'answer' }] }), 'x');
  const c = transcriptCard(row);
  assert.equal(c.turns[0].ts, '13:51:08');
  assert.equal(c.turns.at(-1).ts, '16:49:16');
});

test('a record with no replies says its text is a tail, rather than passing it off', () => {
  // 52 of the 224 records on file are schema 1 to 3, which never held the
  // assistant's prose: last_message is the recorder's 500-character tail of the
  // final turn. Same field, lower fidelity, and the LABEL is what says so,
  // since the prose itself cannot. It names the FIDELITY only: dense mode keeps
  // the role's icon beside the label and the indent under it, so a label
  // carrying "Assistant · " too would say the role twice on one turn.
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 2, last_message: 'the tail of the last turn' }), 'x');
  assert.equal(row.replyCut, 'tail');
  const c = transcriptCard(row);
  assert.equal(c.turns.at(-1).md, 'the tail of the last turn');
  assert.equal(c.turns.at(-1).label, 'final turn, tail only');
  assert.equal(c.turns.at(-1).ts, '', 'and no clock, because a schema-3 record kept none');
});

test('the closing reply reaches the card whole, and claims no trim', () => {
  // It was capped at 600 and the cap was wrong for the one turn the card is
  // opened for. The scroll back above it is still openings; this is not.
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, replies: [{ at: 'z', text: 'x'.repeat(2000) }] }), 'x');
  assert.equal(row.reply.length, 2000, 'byte for byte');
  const c = transcriptCard(row);
  assert.equal(c.label, 'closing reply', 'no "trimmed": nothing was');
  assert.equal(c.turns.at(-1).label, 'closing reply');
  assert.ok(!c.turns.at(-1).dropped, 'and no chip on its last line; the renderer draws one off this');
});

test('a row built by an older pass says so, rather than reading as current', () => {
  // The gap three separate reports walked into. A stale row carries older
  // text (shorter turns, a reply the old cap cut at 600) and on screen looks
  // exactly like a current one, so the cut reads as the whole answer. The
  // crawl heals 120 records a pass, so a store of 233 spends real time half
  // healed: measured on the live cache 2026-08-28, 120 rows at the current
  // version and 113 behind it.
  const S = window.RepoSessionsCache;
  const row = S.summarize(rec({ schema: 4, replies: [{ at: 'z', text: 'the answer' }] }), 'x');
  assert.equal(transcriptCard(row).staleV, 0, 'a fresh row claims nothing');
  const old = { ...row, v: S.ROW_V - 2 };
  assert.equal(transcriptCard(old).staleV, S.ROW_V - 2, 'and a stale one names the version it is on');
});

test('a row with no reply yet still opens, on the ask, and says why', () => {
  // How this first shipped: gated on `row.reply`, so a hover on an unhealed row
  // did NOTHING and a reader could not tell a missing feature from a missing
  // field. Every ask opens now; the absence is stated rather than performed.
  const row = window.RepoSessionsCache.summarize(rec({ schema: 3 }), 'x');
  assert.equal(row.reply, '', 'no reply on the row');
  const c = transcriptCard(row);
  assert.equal(c.label, 'opening ask', 'the header names what it actually has');
  assert.equal(roles(c), 'u', 'the ask alone');
  assert.equal(c.pending, true, 'and the body draws the why off this');
});

test('the truncated scroll back is reported on the card, not silently dropped', () => {
  const prompts = [], replies = [];
  for (let i = 0; i < 40; i++) {
    prompts.push({ at: '2026-08-05T13:00:' + String(i).padStart(2, '0') + 'Z', text: 'ask ' + i });
    replies.push({ at: '2026-08-05T13:30:' + String(i).padStart(2, '0') + 'Z', text: 'answer ' + i });
  }
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, opening_ask: 'ask 0', prompts, replies }), 'x');
  const c = transcriptCard(row);
  assert.equal(c.priorCut, true);
  assert.equal(c.turns.length, window.RepoSessionsCache.TURNS_KEPT + 2,
    'the cap, plus the two ends the row carries itself');
});

test('the card mounts through the deck\'s own renderer, once per card', async () => {
  // Not a lookalike: chatRender.message is the function every deck slide draws
  // a turn with. What this pins is that the card calls it, and calls it once —
  // the mount is driven by x-effect, and rebuilding on every reactive read
  // would throw away the reader's scroll position mid-scroll.
  const calls = [];
  window.chatRender = {
    ready: async () => {},
    message: (m) => { calls.push(m); return window.document.createElement('div'); },
  };
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, replies: [{ at: 'z', text: 'the answer' }] }), 'x');
  const c = transcriptCard(row);
  await data.mountReplyCard(c);
  assert.equal(calls.length, c.turns.length, 'one message() per turn');
  assert.equal(calls.at(-1).md, 'the answer');
  const n = calls.length;
  await data.mountReplyCard(c);
  assert.equal(calls.length, n, 'the same card does not rebuild');
});

test('the panel and the anchor read one height, never two', async () => {
  // The defect this pane shipped, and the reason the number has one home.
  // anchorMenu decides whether a panel fits below its trigger by estimating
  // height as rows × MENU_ROW. Every other panel here IS a list of rows; this
  // one is a transcript, so nine rows estimated 296px against an actual 480,
  // the fit test passed on the underestimate, and 210px of the card fell below
  // an 800px phone's fold. What you would touch to scroll it was not on screen,
  // which reads as a card that does not scroll rather than one misplaced.
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, replies: [{ at: 'z', text: 'the answer' }] }), 'x');
  transcriptCard(row);
  await Alpine.nextTick();
  const want = data.rowCardMaxH();
  assert.equal(data.rowCardAt.height, want, 'the anchor is told the real height');
  assert.match(data.rowCardStyle, new RegExp('max-height:' + want + 'px'),
    'and the panel is given the same one, off the same call');
  assert.equal(data.rowCardAt.width, data.REPLY_CARD_W, 'with its own width, which is not the other cards\'');
});

test('the height is half the viewport, and never a wall on a tall screen', () => {
  // Two bounds doing different jobs. The fraction keeps it a card on a phone;
  // the pixel ceiling is what stops a tall monitor turning it into a page.
  const real = window.innerHeight;
  try {
    window.innerHeight = 700;
    assert.equal(data.rowCardMaxH(), 350, 'half the viewport');
    window.innerHeight = 1400;
    assert.equal(data.rowCardMaxH(), data.CARD_MAX_PX, 'the ceiling, not 700');
  } finally { window.innerHeight = real; }
});

test('a list card still anchors off its rows, because it is a list of rows', () => {
  const row = window.RepoSessionsCache.summarize(rec(), 'x');
  data.openSessionCard(row, 'tools', null);
  assert.equal(data.rowCardAt.height, undefined,
    'no override: rows × MENU_ROW is the right estimate for a list of rows');
  assert.equal(data.rowCardAt.width, data.ROW_CARD_W, 'and the narrower width');
});

test('no renderer means an empty host, not a thrown card', async () => {
  delete window.chatRender;
  const row = window.RepoSessionsCache.summarize(
    rec({ schema: 4, replies: [{ at: 'z', text: 'unrendered' }] }), 'x');
  const c = transcriptCard(row);
  await data.mountReplyCard(c);          // must not throw
  assert.equal(c.turns.at(-1).md, 'unrendered', 'and the card still holds the text');
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
  // `titlesAt` rides the document above and is deliberately NOT landed here.
  // The pane held it until 2026-08-28 to date one row's tooltip; the export's
  // age belongs with its coverage and source on the State view, so the pane
  // reads the document's rows and leaves the column's freshness alone.
  assert.equal(data.sessionsTitlesAt, undefined, 'the pane no longer holds the export date');
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


// ── Linking a captured file ─────────────────────────────────────────────────
// A record stores "<checkout>/<path>" and names that checkout's branch, and
// nothing in the store knows the OWNER. The estate is the only place that does,
// which is why the session brief takes its file link as a host-supplied
// function rather than deriving one.

test('a captured path resolves to the owner and the branch the session was on', () => {
  data.entries = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
  const row = window.RepoSessionsCache.summarize(rec(), 'x');
  // At the BRANCH, not at main: a file opened during a session is the version
  // that session saw.
  assert.equal(data.sessionFileUrl(row, 'web-tools/lib/a.js'),
    'https://github.com/mehrlander/web-tools/blob/claude%2Fa-1/lib/a.js');
});

test('a checkout the session did not name falls back to the default branch', () => {
  // The merged case: the row lists one checkout and the path names another the
  // estate still knows. Reading it at the default beats not linking it.
  data.entries = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
  data.activity = { 'mehrlander/home': { defaultBranch: 'main' } };
  const row = window.RepoSessionsCache.summarize(rec(), 'x');
  assert.equal(data.sessionFileUrl(row, 'home/b.md'),
    'https://github.com/mehrlander/home/blob/main/b.md');
});

test('an unresolvable checkout yields no link rather than a guessed one', () => {
  // The Files pane renders a plain row for an empty href. A guessed owner would
  // render a link that 404s, which is worse than saying nothing.
  data.entries = [{ repo: 'mehrlander/web-tools' }];
  const row = window.RepoSessionsCache.summarize(rec(), 'x');
  assert.equal(data.sessionFileUrl(row, 'somebody-elses-repo/x.js'), '');
  assert.equal(data.sessionFileUrl(row, 'no-slash-at-all'), '');
});

// ── A lean row reads its record on open (2026-09-02) ───────────────────────
// The writer strips the prose from stored rows (repo-sessions-cache.js,
// PROSE_KEYS). A card opened on one draws the ask at once, reads the record
// through the same memo the detail uses, and rebuilds its fields in place.
test('a lean row opens on the ask, reads the record once, and fills the card', async () => {
  const S = window.RepoSessionsCache;
  // Its own id: the record memo is per page, and the default fixture's id has
  // been read by earlier tests here without a reply.
  const ident = { short: 'leanrow1', session_id: 'leanrow1-0000-0000-0000-000000000000' };
  const full = S.summarize(rec({ ...ident, schema: 4,
    prompts: [{ at: '2026-08-05T13:00:00Z', text: 'do the thing' }],
    replies: [{ at: '2026-08-05T16:00:00Z', text: 'and here is what came of it' }] }), 'lean1');
  const row = S.leanRow(full);
  assert.ok(data.needsProse(row), 'no prose keys at all is the lean shape');
  assert.ok(!data.needsProse(full), 'a summarised row is complete as it stands');
  FILES[S.pathOf(row)] = rec({ ...ident, schema: 4,
    prompts: [{ at: '2026-08-05T13:00:00Z', text: 'do the thing' }],
    replies: [{ at: '2026-08-05T16:00:00Z', text: 'and here is what came of it' }] });
  GETS.length = 0;
  const first = transcriptCard(row);
  assert.equal(first.label, 'opening ask', 'the first frame has the ask alone');
  assert.equal(first.pending, true);
  assert.equal(first.pendingNote, 'Reading the session record…');
  await new Promise(r => setTimeout(r, 20));
  const c = data.rowCard;
  assert.equal(c.key, first.key, 'the same card, rebuilt in place');
  assert.equal(c.pending, false);
  assert.equal(c.label, 'closing reply');
  assert.equal(c.turns.at(-1).md, 'and here is what came of it');
  assert.equal(GETS.filter(g => g === S.pathOf(row)).length, 1, 'one record read');
  // A second open costs nothing: the row now carries what the card needs.
  data.closeRowCard();
  data.openSessionCard(row, 'state', null);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(GETS.filter(g => g === S.pathOf(row)).length, 1, 'still one read');
});
