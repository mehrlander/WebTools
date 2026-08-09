// alpineComponents/estate.js — the Chats pane's loader must attempt ONCE.
//
// This pins a fault that shipped and froze a phone. The pane is driven by
// `x-effect="tab === 'chats' && authed && loadChats()"`, and the loader writes
// reactive state the effect reads (chatsBusy). Guarding on SUCCESS
// (chatFrontier) instead of on the attempt means a failed load relaunches
// itself the moment its own finally clears chatsBusy, forever. The kit's
// failure backoff then rejects without touching the network, so the retry is
// free and the loop runs at full speed: the main thread pegs and the pane
// appears frozen with no request traffic to explain it. Reproduced headlessly
// against chat-histories@main before the frontier landed there, where a
// Playwright click on the pill timed out at 30 seconds.
//
// So the assertion is a COUNT, not a state: one attempt per failure, however
// many times the effect re-runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';
const CHATS = 'me/chats';

// Every frontier read, so the test can count attempts rather than infer them.
let FRONTIER_READS = 0;
let FRONTIER_OK = false;

const FRONTIER = {
  archived_through: '2026-06-01',
  providers: {
    Claude: { frontier: '2026-07-06', chats: 2, months: ['2026-07'], snapshots: ['2026-06-01', '2026-07-06'] },
  },
};
const JULY = [
  { url: 'https://claude.ai/chat/aaa', date: '2026-07-06', title: 'One', tags: ['x'], summary: 's' },
];

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async repos() { return []; }
  async ls() { return []; }
  async req() { return { default_branch: 'main', description: '', private: true, pushed_at: '' }; }
  async save() { return {}; }
  async get(name) {
    if (this.repo !== CHATS) throw Object.assign(new Error('404'), { status: 404 });
    if (name.endsWith('frontier.json')) {
      FRONTIER_READS++;
      // A runaway loader starves the test rather than failing it: the mounted
      // x-effect spins in the microtask queue and nothing else gets to run, so
      // a regression would surface as a suite TIMEOUT with no message. This cap
      // turns it back into a loud, located failure.
      if (FRONTIER_READS > 50) throw new Error('runaway loader: frontier read ' + FRONTIER_READS + ' times');
      if (!FRONTIER_OK) throw Object.assign(new Error('404'), { status: 404 });
      return { text: JSON.stringify(FRONTIER) };
    }
    if (name.endsWith('summaries/by-month/2026-07.json')) return { text: JSON.stringify(JULY) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.gh = { load: async () => {} };
const shell = {
  REGISTRY_REPO: REGISTRY, DEFAULT_REPO: 'me/tools', CHATS_REPO: CHATS,
  quickLinks: [], hasToken: () => true, _authState: 'auth', view: 'chats',
  refreshConfigCache() {}, refreshActivity() {}, refreshSessions() {},
  goActivity() { this.view = 'activity'; },
  goSessions() { this.view = 'sessions'; },
  goGuides() { this.view = 'guides'; },
  goChats() { this.view = 'chats'; },
  goTodo() { this.view = 'todo'; }, goJots() { this.view = 'jots'; },
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/repo-sessions-cache.js',
  'lib/kits/surface.js',
  'lib/kits/chat-archive.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));

test('chats is an Activity sub-tab and resolves its own view key', () => {
  shell.view = 'chats';
  assert.equal(data.tab, 'chats');
  assert.equal(data.isActivityTab, true);
});

test('a failing load is attempted once, however often the loader is re-entered', async () => {
  FRONTIER_OK = false;
  // Mounting the component already ran the effect once, which is itself the
  // guard working; reset to a known pre-attempt state so the count below is
  // about re-entry rather than about what mounting did.
  FRONTIER_READS = 0;
  data.chatsTried = false;
  data.chatsErr = '';
  window.chatArchive.forget();
  await data.loadChats();
  assert.equal(FRONTIER_READS, 1, 'the first attempt reads');
  assert.ok(data.chatsErr, 'and the failure is reported rather than swallowed');
  assert.equal(data.chatsBusy, false, 'the spinner clears');

  // The effect re-runs on every reactive write the loader made (chatsBusy went
  // true then false, chatsErr was set). Each of those re-entries is the loop's
  // first iteration; none of them may start a second load.
  for (let i = 0; i < 25; i++) await data.loadChats();
  assert.equal(FRONTIER_READS, 1, 'a failed load never relaunches itself');
});

test('the error survives re-entry, so the pane keeps saying what went wrong', async () => {
  await data.loadChats();
  assert.match(data.chatsErr, /frontier\.json/);
  assert.match(data.chatsErr, /catalog_coverage\.py/, 'and names the generator, not just the gap');
});

test('an explicit retry clears the guard and the backoff, and succeeds', async () => {
  FRONTIER_OK = true;
  await data.retryChats();
  assert.equal(FRONTIER_READS, 2, 'Retry re-reads rather than being refused by the backoff');
  assert.equal(data.chatsErr, '', 'and the error clears on success');
  assert.equal(data.chatBanner.archivedThrough, '2026-06-01');
  // Alpine hands back reactive proxies: structurally equal, never
  // reference-equal, and deepEqual sees the difference. Compare plain shapes.
  assert.deepEqual(JSON.parse(JSON.stringify(data.chatLoadedMonths)), ['2026-07'],
    'the newest month opens, and only it');
  assert.equal(data.chatRows.length, 1);
});

test('a settled load is not re-attempted either', async () => {
  const before = FRONTIER_READS;
  for (let i = 0; i < 10; i++) await data.loadChats();
  assert.equal(FRONTIER_READS, before, 'the success path is idempotent for the same reason');
});
