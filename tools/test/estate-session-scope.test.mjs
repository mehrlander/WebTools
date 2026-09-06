// alpineComponents/estate.js — a session row's repo SCOPE.
//
// The record has carried `repos` since schema 1 and the pane never printed it,
// so the pane could not answer "where was this session" for the row a reader was
// actually on. The strip is that answer, and its whole job is to be the union of
// two fields that disagree on purpose: `attached` (what the container held) and
// `repos` (where the shell actually stood).
//
// Two link-minting getters lived here and are gone with the row buttons they
// served (2026-09-06): a second Claude mark and a microphone on every session
// row was more furniture than the row could carry, and the route to a new
// session belongs on a detail surface where it can say what it will do. What
// survives is the strip, and `kits/prompt-link.js` still holds the minting.
//
// Driven over the same fake GH as estate-sessions; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'just now'; }
  async repos() { return []; }
  async ls() { return []; }
  async get() { throw Object.assign(new Error('404'), { status: 404 }); }
  async req() { return { default_branch: 'main' }; }
  async save() { return {}; }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.gh = { load: async () => {} };
window.__shell = {
  REGISTRY_REPO: REGISTRY, DEFAULT_REPO: 'me/tools', quickLinks: [],
  hasToken: () => true, _authState: 'auth', view: 'activity',
  refreshConfigCache() {}, refreshActivity() {}, refreshSessions() {},
  anchorMenu: () => ({}),
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/closing-state.js',
  'lib/kits/repo-sessions-cache.js',
  'lib/kits/surface.js',
  'lib/kits/branch-status.js',
  'lib/kits/prompt-link.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));

// The estate's own repo list is what turns a checkout name into a slug. Set it
// directly rather than driving a crawl: the join is what is under test, not how
// the list is filled.
data.entries = [
  { repo: 'mehrlander/web-tools' },
  { repo: 'mehrlander/web-tools-private' },
  { repo: 'mehrlander/shortcut-tools' },
];

// A real row's shape, taken from the live cache: three repos with MIXED
// branches, which is the ordinary case and the one that cannot carry a branch.
const MIXED = {
  id: '12bd459d',
  repos: [
    { name: 'shortcut-tools', branch: 'claude/bookmarklets-rjakex', lines: 72 },
    { name: 'web-tools', branch: 'main', lines: 253 },
    { name: 'web-tools-private', branch: 'claude/bookmarklets-rjakex', lines: 5 },
  ],
  branches: ['claude/bookmarklets-rjakex'],
};

// Everything read back through Alpine's $data is a reactive proxy: structurally
// equal to a literal and never reference-equal. estate-sessions.test.mjs keeps
// the same helper for the same reason.
const plain = (v) => JSON.parse(JSON.stringify(v));

test('the scope strip keeps a repo sitting on the default branch', () => {
  const names = plain(data.sessionRepoRows(MIXED)).map((r) => r.name);
  assert.deepEqual(names, ['shortcut-tools', 'web-tools', 'web-tools-private']);
  // The point of the strip: `branches` drops main, `repos` does not, so a repo
  // the session only read from is visible here and nowhere else on the card.
  assert.equal(MIXED.branches.includes('main'), false);
  assert.ok(names.includes('web-tools'));
});

test('each repo carries its branch and its share in the title', () => {
  const row = data.sessionRepoRows(MIXED)[1];
  const note = data.sessionRepoNote(row);
  assert.match(note, /web-tools/);
  assert.match(note, /on main/);
  assert.match(note, /253 transcript lines/);
});

test('checkout names resolve to owner/repo slugs', () => {
  assert.deepEqual(plain(data.sessionRepoSlugs(MIXED)), [
    'mehrlander/shortcut-tools', 'mehrlander/web-tools', 'mehrlander/web-tools-private',
  ]);
});

test('an unresolvable checkout shows in the strip and resolves to no slug', () => {
  // It is still the reader's answer to "where did this run"; what it cannot be
  // is handed to anything that needs an owner/repo.
  const odd = { repos: [{ name: 'web-tools', branch: 'main', lines: 5 },
                        { name: 'some-other-clone', branch: 'main', lines: 2 }],
                branches: [] };
  assert.deepEqual(plain(data.sessionRepoRows(odd)).map((r) => r.name),
    ['some-other-clone', 'web-tools']);
  assert.deepEqual(plain(data.sessionRepoSlugs(odd)), ['mehrlander/web-tools']);
  assert.match(data.sessionRepoNote(plain(data.sessionRepoRows(odd))[0]),
    /no repository of that name/);
});

test('a session that named no repo has no strip at all', () => {
  const bare = { repos: [], branches: [] };
  assert.deepEqual(plain(data.sessionRepoRows(bare)), []);
  assert.deepEqual(plain(data.sessionRepoSlugs(bare)), []);
});

// ── `attached`: scope, beside where the shell stood ─────────────────────────
// Record schema 8 added the container's own repo list, which is the honest
// answer to "what was this session's scope". The strip is the union of the two
// fields, so neither reading can hide the other.

test('a repo attached but never entered still shows, and says which it is', () => {
  const row = {
    repos: [{ name: 'web-tools', branch: 'claude/x', lines: 40 }],
    attached: ['home', 'web-tools'],
    branches: ['claude/x'],
  };
  const rows = plain(data.sessionRepoRows(row));
  assert.deepEqual(rows.map((r) => r.name), ['home', 'web-tools']);
  assert.equal(rows[0].idle, true, 'home was attached and never the cwd');
  assert.equal(rows[1].idle, false);
  assert.match(data.sessionRepoNote(rows[0]), /attached, but never the working directory/);
});

test('an empty attached means the record cannot say, not that nothing was attached', () => {
  // Every record written before schema 8, permanently: they are never
  // revisited, so `repos` is the only answer they will ever have and the strip
  // must fall back to it rather than showing a session no scope at all.
  const old = { schema: 3, repos: [{ name: 'web-tools', branch: 'main', lines: 9 }], branches: [] };
  const rows = plain(data.sessionRepoRows(old));
  assert.deepEqual(rows.map((r) => r.name), ['web-tools']);
  assert.equal(rows[0].idle, false, 'never claim "attached but idle" from a record that cannot say');
});
