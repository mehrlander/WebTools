// alpineComponents/estate.js — a session row's repo SCOPE, and the new-session
// link minted from it.
//
// The record has carried `repos` since schema 1 and the pane never printed it,
// so the pane could not answer "where was this session" for the row a reader
// was actually on. These are the two halves that fixes: the strip that says the
// scope, and the link that copies it forward.
//
// What is asserted hardest is the LOSSES. A scope is where the shell stood, not
// what was attached, and a multi-repo scope cannot carry a branch; a button that
// narrowed either quietly would be worse than no button, so the note is under
// test the way the URL is.
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

const params = (url) => new URL(url).searchParams;

test('the scope strip keeps a repo sitting on the default branch', () => {
  const names = data.sessionRepoRows(MIXED).map((r) => r.name);
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
  assert.deepEqual(data.sessionRepoSlugs(MIXED), [
    'mehrlander/shortcut-tools', 'mehrlander/web-tools', 'mehrlander/web-tools-private',
  ]);
});

test('the link preselects every repo the estate could resolve', () => {
  const r = data.newSessionFor(MIXED);
  assert.equal(params(r.url).get('repositories'),
    'mehrlander/shortcut-tools,mehrlander/web-tools,mehrlander/web-tools-private');
  assert.equal(params(r.url).has('prompt'), false, 'the composer at the far end is the composer');
});

test('a mixed scope loses its branch, and the note says so with the count', () => {
  const r = data.newSessionFor(MIXED);
  assert.equal(params(r.url).has('branch'), false);
  const note = data.newSessionNote(MIXED);
  assert.match(note, /Not carried/);
  assert.match(note, /3 repositories/);
});

test('the note always states the scope caveat and that nothing starts', () => {
  const note = data.newSessionNote(MIXED);
  assert.match(note, /absolute path/, 'the recorder cannot see a repo worked only that way');
  assert.match(note, /nothing starts until you send it/);
});

test('a single-repo session does carry its branch', () => {
  const one = {
    repos: [{ name: 'web-tools', branch: 'claude/x', lines: 10 }],
    branches: ['claude/x'],
  };
  const r = data.newSessionFor(one);
  assert.equal(params(r.url).get('repositories'), 'mehrlander/web-tools');
  assert.equal(params(r.url).get('branch'), 'claude/x');
  // Length rather than deepEqual: this comes back through Alpine's $data, so
  // every array is a reactive proxy and never reference-equal to a literal.
  assert.equal(r.dropped.length, 0);
});

test('an unresolvable checkout is left out of the link and named in the note', () => {
  const odd = { repos: [{ name: 'web-tools', branch: 'main', lines: 5 },
                        { name: 'some-other-clone', branch: 'main', lines: 2 }],
                branches: [] };
  assert.deepEqual(data.sessionRepoSlugs(odd), ['mehrlander/web-tools']);
  assert.equal(params(data.newSessionFor(odd).url).get('repositories'), 'mehrlander/web-tools');
  assert.match(data.newSessionNote(odd), /some-other-clone.*no repository of that name/);
});

test('a session that named no repo mints nothing to hang a button on', () => {
  const bare = { repos: [], branches: [] };
  assert.deepEqual(data.sessionRepoSlugs(bare), []);
  assert.equal(params(data.newSessionFor(bare).url).has('repositories'), false);
});
