// alpineComponents/quick-find.js — logic tests for the sidebar finder's lane
// dispatcher: the #digits PR lane (open-repo hits first), the @ repo-then-file
// walk (repo choice, folder completion, dir filtering, whole-tree fuzzy),
// pasted addresses resolving exactly with no suggestions, the plain lane
// (repos, views, cached file names with the estate-wide gate, PR titles), the
// +prefix and floor jot lanes, the branch hit's open-branch-detail event, and
// the jot write's fresh-read append. Driven over a fake GH and a stubbed
// shell; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

let FILES = {};    // "<path>" -> parsed JSON served from the registry
let SAVES = [];    // every save call: { repo, path, value, message }
let TREES = {};    // "<repo>" -> [blob paths] served from git/trees
let SEARCH = null; // response served for /search/code

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  async get(name) {
    if (this.repo === REGISTRY && FILES[name]) return { text: JSON.stringify(FILES[name]) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req(path) {
    if (String(path).startsWith('git/trees/') && TREES[this.repo])
      return { tree: TREES[this.repo].map(p => ({ type: 'blob', path: p })), truncated: false };
    if (String(path).startsWith('/search/code') && SEARCH) return SEARCH;
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async save(path, value, message) { SAVES.push({ repo: this.repo, path, value, message }); return {}; }
}

const ACTIVITY = {
  repos: {
    'me/tools': {
      defaultBranch: 'main',
      openPRs: [{ number: 12, title: 'Fix the header', draft: true, head: 'claude/header-fix' }],
    },
    'me/home': {
      defaultBranch: 'main',
      openPRs: [{ number: 120, title: 'Drain the pile', draft: false, head: 'claude/drain' }],
    },
  },
};

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="qf" x-data="quickFind()"></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
const shell = {
  REGISTRY_REPO: REGISTRY,
  hasToken: () => true,
  estateRepos: [{ repo: 'me/tools', icon: 'ph-wrench' }, { repo: 'me/home', icon: 'ph-house' }],
  estateNav: [{ view: 'map', label: 'Map', icon: 'ph-compass', go: () => shell._went.push('map') }],
  appNav: [],
  _went: [],
  _searched: [],
  goSearch(opts) { shell._searched.push(opts); },
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/repo-address.js',
  'lib/kits/repo-sessions-cache.js',
  'lib/kits/estate-search.js',
  'lib/alpineComponents/quick-find.js',
]);

const data = Alpine.$data(window.document.getElementById('qf'));

// Alpine data lives in the jsdom realm, so its arrays fail deepEqual's
// prototype check against node-realm literals; round-trip before comparing.
const j = (x) => JSON.parse(JSON.stringify(x));

FILES = { 'state/activity.json': ACTIVITY };
TREES = {
  'me/tools': ['README.md', 'lib/gh-api.js', 'lib/kits/console.js', 'pages/index.html'],
  'me/home':  ['README.md', 'chron/index.md'],
};
await data.ensureActivity();

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('#digits finds PRs by number prefix; bare digits work; # alone lists all', () => {
  data.q = '#12';
  let hits = data.rows.filter(r => r.kind === 'branch');
  assert.deepEqual(j(hits.map(h => h.label.split(' ')[0])), ['#12', '#120']);
  // A PR hit opens as its head branch.
  assert.equal(hits[0].name, 'claude/header-fix');
  data.q = '120';
  hits = data.rows.filter(r => r.kind === 'branch');
  assert.deepEqual(j(hits.map(h => h.repo)), ['me/home']);
  data.q = '#';
  assert.equal(data.rows.filter(r => r.kind === 'branch').length, 2);
});

test('@ lists repos; @frag filters them; picking completes to @repo/', () => {
  data.q = '@';
  let reps = data.rows.filter(r => r.kind === 'complete');
  assert.deepEqual(j(reps.map(r => r.to)), ['@tools/', '@home/']);
  data.q = '@ho';
  reps = data.rows.filter(r => r.kind === 'complete');
  assert.deepEqual(j(reps.map(r => r.to)), ['@home/']);
});

test('@repo/ walks the tree: folders first and completing, files opening, remainder filtering', async () => {
  await data.ensureTree('me/tools');
  data.q = '@tools/';
  let rows = data.rows.filter(r => r.kind === 'complete' || r.kind === 'file');
  // Folders lead (lib/, pages/), then root files.
  assert.deepEqual(j(rows.map(r => r.label)), ['lib/', 'pages/', 'README.md']);
  assert.equal(rows[0].to, '@tools/lib/');
  data.q = '@tools/lib/';
  rows = data.rows.filter(r => r.kind === 'complete' || r.kind === 'file');
  assert.deepEqual(j(rows.map(r => r.label)), ['kits/', 'gh-api.js']);
  assert.equal(rows[1].path, 'lib/gh-api.js');
  data.q = '@tools/lib/gh';
  rows = data.rows.filter(r => r.kind === 'file');
  assert.deepEqual(j(rows.map(r => r.path)), ['lib/gh-api.js']);
});

test('@repo/frag fuzzy-matches the whole tree without a walk', async () => {
  await data.ensureTree('me/tools');
  data.q = '@tools/console';
  const rows = data.rows.filter(r => r.kind === 'file');
  assert.deepEqual(j(rows.map(r => r.path)), ['lib/kits/console.js']);
});

test('a pasted address resolves exactly and suggests nothing', () => {
  data.q = 'me/tools@dev:lib/gh-api.js';
  let hit = data.rows.find(r => r.kind === 'addr');
  assert.deepEqual(j(hit.addr), { repo: 'me/tools', ref: 'dev', path: 'lib/gh-api.js' });
  // Short-repo expansion applies before the colon; the missing ref stays
  // unspecified (RepoAddress's rule: parse honestly, resolve late).
  data.q = 'tools:lib/gh-api.js';
  hit = data.rows.find(r => r.kind === 'addr');
  assert.deepEqual(j(hit.addr), { repo: 'me/tools', ref: '', path: 'lib/gh-api.js' });
  // repo@branch is one exact row, the takeover; no suggestion list rides it.
  data.q = 'home@claude/drain';
  const rows = data.rows.filter(r => r.kind === 'branch');
  assert.equal(rows.length, 1);
  assert.deepEqual(j([rows[0].repo, rows[0].name]), ['me/home', 'claude/drain']);
});

test('plain text matches repos, views, cached file names, and PR titles', async () => {
  data.q = 'home';
  const kinds = data.rows.map(r => r.kind);
  assert.ok(kinds.includes('repo'));
  assert.ok(kinds.includes('jot'));
  data.q = 'map';
  assert.equal(data.rows.find(r => r.kind === 'view').label, 'Map');
  await data.ensureTree('me/tools');
  data.q = 'gh-api';
  const files = data.rows.filter(r => r.kind === 'file');
  assert.deepEqual(j(files.map(f => f.path)), ['lib/gh-api.js']);
  data.q = 'drain the';
  assert.equal(data.rows.find(r => r.kind === 'branch').repo, 'me/home');
});

test('the estate-wide gate: offered while trees are missing, gone once loaded', async () => {
  data.q = 'index';
  assert.ok(data.rows.some(r => r.kind === 'deep'));
  await data.loadAllTrees();
  assert.ok(!data.rows.some(r => r.kind === 'deep'));
  // The pass now sees every repo's tree.
  const repos = data.rows.filter(r => r.kind === 'file').map(f => f.repo);
  assert.ok(repos.includes('me/home'));
});

test('+idea is the explicit jot lane: one row, nothing else', () => {
  data.q = '+try the thing';
  assert.deepEqual(j(data.rows.map(r => r.kind)), ['jot']);
  assert.equal(data.rows[0].text, 'try the thing');
  // The floor is token-gated: signed out, nothing offers to write.
  shell.hasToken = () => false;
  data.q = 'anything';
  assert.ok(!data.rows.some(r => r.kind === 'jot'));
  shell.hasToken = () => true;
});

test('acting on a branch hit dispatches web-tools:open-branch-detail and clears the box', () => {
  const seen = [];
  window.document.addEventListener('web-tools:open-branch-detail', e => seen.push(e.detail));
  data.q = '#12';
  data.act(data.rows[0]);
  assert.deepEqual(j(seen), [{ repo: 'me/tools', name: 'claude/header-fix' }]);
  assert.equal(data.q, '');
  assert.equal(data.open, false);
});

test('acting on a completion rewrites the input instead of acting', () => {
  data.q = '@';
  data.act(data.rows[0]);
  assert.equal(data.q, '@tools/');
});

test('jotThis appends to a fresh read of lists/jots.json with the estate\'s commit-message shape', async () => {
  SAVES = [];
  FILES['lists/jots.json'] = { items: [{ id: 'j1', text: 'earlier', created_at: '2026-01-01T00:00:00Z' }] };
  await data.jotThis('quick idea');
  assert.equal(SAVES.length, 1);
  assert.equal(SAVES[0].path, 'lists/jots.json');
  assert.equal(SAVES[0].value.items.length, 2);
  assert.equal(SAVES[0].value.items[0].text, 'earlier');
  assert.equal(SAVES[0].value.items[1].text, 'quick idea');
  assert.match(SAVES[0].message, /^Jot "quick idea" via show-repo$/);
});

test('the content and session gates appear on plain queries of three characters or more', () => {
  data.q = 'gz';
  assert.ok(!data.rows.some(r => r.kind === 'code-gate'));
  data.q = 'gzip';
  assert.ok(data.rows.some(r => r.kind === 'code-gate'));
  assert.ok(data.rows.some(r => r.kind === 'sess-gate'));
});

test('the contents gate routes to the Search view with the query carried over', () => {
  data.q = 'gzip';
  const gate = data.rows.find(r => r.kind === 'code-gate');
  data.act(gate);
  assert.deepEqual(j(shell._searched), [{ q: 'gzip', mode: 'contents' }]);
  assert.equal(data.q, '');
});

test('searchSessions greps the captured records and hits open via web-tools:open-session', async () => {
  FILES['state/sessions.json'] = { rows: [
    { id: 'aaaa1111', day: '2026-08-02', ask: 'wayback urls' },
    { id: 'bbbb2222', day: '2026-08-05', ask: 'other work' },
  ] };
  FILES['sessions/2026/08/2026-08-02-aaaa1111.json'] = {
    day: '2026-08-02', opening_ask: 'Can you use this api for the wayback urls?',
    prompts: [{ at: 't', text: 'the archive prefix query' }], last_message: 'done',
  };
  FILES['sessions/2026/08/2026-08-05-bbbb2222.json'] = {
    day: '2026-08-05', opening_ask: 'other work', prompts: [], last_message: 'nothing here',
  };
  data.q = 'archive prefix';
  await data.searchSessions('archive prefix');
  const hits = data.rows.filter(r => r.kind === 'session');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'aaaa1111');
  assert.match(hits[0].note, /archive prefix/);
  // The clear row heads the results and dismisses them without touching q,
  // so retyping the query cannot resurrect stale hits unasked.
  const head = data.rows.find(r => r.kind === 'clear');
  assert.match(head.label, /1 session hit/);
  const seen = [];
  window.document.addEventListener('web-tools:open-session', e => seen.push(e.detail));
  data.act(hits[0]);
  assert.deepEqual(j(seen), [{ id: 'aaaa1111', day: '2026-08-02' }]);
  assert.equal(data.q, '');
  data.q = 'archive prefix';
  data.act(data.rows.find(r => r.kind === 'clear'));
  assert.equal(data.sess_, null);
  assert.ok(data.rows.some(r => r.kind === 'sess-gate'));
});
