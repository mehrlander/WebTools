// alpineComponents/search-view.js — the central file surface's logic: seed
// consumption (the finder's gate, the explorer's hand-off, or a deep link
// auto-runs a carried query OR a carried scope), the three modes' dispatch into
// the shared core (names takes the ref and the folder scope, contents builds
// its scope qualifier including the API's `path:`, sessions greps), the browse
// gate (an empty query is a listing under a repo or a folder and a miss
// otherwise), full-error surfacing, reading a file IN PLACE rather than routing
// to a repo's Files view, stepping the file hits, clear, the cap, and the
// address restamp on each run and each file opened. EstateSearch and GH are
// stubbed so this tests the VIEW, not the core or the network; each has its own
// suite. No pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="sv" x-data="searchView()"></div></body></html>`,
});
window.TOKEN = 'tkn';

let CALLS = [];
let ANSWER = {};
window.EstateSearch = {
  clip: (t) => String(t || ''),
  reset() { CALLS.push(['reset']); },
  async names(a) { CALLS.push(['names', a]); if (ANSWER.throw) throw new Error(ANSWER.throw); return ANSWER; },
  async code(a)  { CALLS.push(['code', a]);  if (ANSWER.throw) throw new Error(ANSWER.throw); return ANSWER; },
  async sessions(a) { CALLS.push(['sessions', a]); if (ANSWER.throw) throw new Error(ANSWER.throw); return ANSWER; },
};

// The contents fetch behind the reader. Records what it was pointed at, since
// the ref rule ('' means the repo's default branch) is the thing most easily
// broken by a well-meaning fallback.
let FETCHED = [];
let FETCH_FAIL = '';
window.GH = class {
  constructor(conf) { this.token = conf.token; this.repo = conf.repo; this.ref = conf.ref || 'main'; }
  async get(path) {
    FETCHED.push({ repo: this.repo, ref: this.ref, path });
    if (FETCH_FAIL) throw new Error(FETCH_FAIL);
    return { text: 'body of ' + path };
  }
};

const shell = {
  REGISTRY_REPO: 'me/registry',
  hasToken: () => true,
  estateRepos: [{ repo: 'me/tools' }, { repo: 'me/home' }],
  searchSeed: { q: 'seeded', mode: 'contents' },   // consumed by init, below
  _synced: 0,
  syncUrl() { shell._synced++; },
  _browsed: [],
  async ensureBrowser(repo, ref) { shell._browsed.push([repo, ref]); },
  _opened: [],
  openFile(p) { shell._opened.push(p); },
};
window.__shell = shell;

ANSWER = { hits: [], total: 0 };
const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/repo-address.js',   // the real address grammar: ?sfile= round-trips through it
  'lib/alpineComponents/viewer.js',       // the reader this view embeds
  'lib/alpineComponents/ref-picker.js',   // and the two scope pickers it mounts
  'lib/alpineComponents/path-picker.js',
  'lib/alpineComponents/search-view.js',
]);
const data = Alpine.$data(window.document.getElementById('sv'));
const j = (x) => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(r => setTimeout(r, 10));

test('a parked seed is consumed at mount and auto-runs', async () => {
  await tick();
  assert.equal(data.q, 'seeded');
  assert.equal(data.mode, 'contents');
  assert.equal(CALLS.filter(c => c[0] === 'code').length, 1);
  assert.equal(data.ran, true);
});

test('names mode passes the ref and the folder scope to every scoped repo', async () => {
  CALLS = [];
  ANSWER = { hits: [{ repo: 'me/tools', ref: 'dev', path: 'lib/kits/x.js' }], total: 1, truncated: false, errors: [] };
  data.mode = 'names'; data.q = 'x'; data.repo = ''; data.ref = 'dev'; data.path = 'lib/kits';
  await data.run();
  const [, args] = CALLS.find(c => c[0] === 'names');
  assert.deepEqual(j(args.repos), [{ repo: 'me/tools', ref: 'dev' }, { repo: 'me/home', ref: 'dev' }]);
  assert.equal(args.under, 'lib/kits');
  assert.equal(args.cap, data.cap);
});

test('a row is stated relative to the scope, and offers to scope only where that goes somewhere', async () => {
  ANSWER = {
    hits: [{ repo: 'me/tools', ref: '', path: 'lib/kits/x.js' },
           { repo: 'me/tools', ref: '', path: 'lib/kits/demos/y.js' }],
    total: 2, truncated: false, errors: [],
  };
  data.mode = 'names'; data.q = ''; data.repo = 'me/tools'; data.ref = ''; data.path = 'lib/kits';
  await data.run();
  // The scope is not repeated on every line, which is what was truncating the
  // only part of each path that differed.
  assert.deepEqual([...data.hits.map(h => h.label)], ['x.js', 'demos/y.js']);
  assert.equal(data.hits[0].path, 'lib/kits/x.js', 'the full path stays on the hit, for opening it');
  // A row sitting directly in the scope has nowhere to scope to; one below does.
  assert.equal(data.hits[0].dir, '');
  assert.equal(data.hits[1].dir, 'lib/kits/demos');
  // One repo scoped means the repo badge says nothing the controls do not.
  assert.equal(data.hits[0].sub, '');
  data.repo = '';
  await data.run();
  assert.equal(data.hits[0].sub, 'tools');
});

test('a scope is normalized once, and its crumbs walk back out', async () => {
  data.path = '/lib/kits/';
  assert.equal(data.scope, 'lib/kits');
  assert.deepEqual(j(data.scopeCrumbs), [{ name: 'lib', path: 'lib' }, { name: 'kits', path: 'lib/kits' }]);
  CALLS = [];
  data.ran = true;
  data.scopeTo('lib');
  await tick();
  assert.equal(CALLS.find(c => c[0] === 'names')[1].under, 'lib');
  data.scopeTo('');
  await tick();
  assert.equal(data.scope, '');
});

test('an empty query lists under a repo or a folder, and is a miss otherwise', async () => {
  data.mode = 'names'; data.q = ''; data.repo = ''; data.path = '';
  assert.equal(data.canRun, false, 'every file of every repo is not a listing anyone asked for');
  data.repo = 'me/tools';
  assert.equal(data.canRun, true);
  data.repo = ''; data.path = 'docs';
  assert.equal(data.canRun, true);
  // Contents and sessions still need something to search for.
  data.mode = 'contents';
  assert.equal(data.canRun, false);
  data.mode = 'names';

  CALLS = [];
  ANSWER = { hits: [], total: 0, truncated: false, errors: [] };
  await data.run();
  assert.equal(CALLS.find(c => c[0] === 'names')[1].q, '');
});

test('contents mode scopes to the chosen repo, or the account, and adds path: for a folder', async () => {
  CALLS = [];
  ANSWER = { hits: [], total: 0 };
  data.mode = 'contents'; data.q = 'needle'; data.repo = 'me/home'; data.path = '';
  await data.run();
  assert.equal(CALLS.find(c => c[0] === 'code')[1].scope, 'repo:me/home');
  data.repo = '';
  await data.run();
  assert.equal(CALLS.filter(c => c[0] === 'code')[1][1].scope, 'user:me');
  data.path = 'lib/kits';
  await data.run();
  assert.equal(CALLS.filter(c => c[0] === 'code')[2][1].scope, 'user:me path:lib/kits');
  data.path = '';
});

test('a search failure surfaces the whole error and still counts as ran', async () => {
  ANSWER = { throw: 'GitHub Error 403 (Rate Rem: 0)' };
  data.mode = 'contents'; data.q = 'boom';
  await data.run();
  assert.equal(data.error, 'GitHub Error 403 (Rate Rem: 0)');
  assert.equal(data.ran, true);
  ANSWER = { hits: [], total: 0 };
});

test('a file hit is read in place, at the ref it was found on', async () => {
  FETCHED = [];
  ANSWER = {
    hits: [{ repo: 'me/tools', ref: 'dev', path: 'lib/a.js' },
           { repo: 'me/tools', ref: 'dev', path: 'lib/b.js' }],
    total: 2, truncated: false, errors: [],
  };
  data.mode = 'names'; data.q = 'lib'; data.repo = 'me/tools'; data.ref = 'dev';
  await data.run();
  const before = shell._browsed.length;
  await data.openHit(data.hits[0]);
  await tick();
  assert.deepEqual(j(data.open), { repo: 'me/tools', ref: 'dev', path: 'lib/a.js' });
  assert.deepEqual(FETCHED.at(-1), { repo: 'me/tools', ref: 'dev', path: 'lib/a.js' });
  assert.equal(shell._browsed.length, before, 'reading a hit must not switch the browsed repo');
  const v = window.document.getElementById('search-file-viewer').__viewer;
  assert.equal(v.file, 'lib/a.js');
  assert.equal(v.content, 'body of lib/a.js');
  assert.deepEqual(j(v.origin), { repo: 'me/tools', ref: 'dev' },
    'the viewer must link the file at its true home, not the browsed repo');
  assert.equal(data.isOpen(data.hits[0]), true);
  assert.equal(data.isOpen(data.hits[1]), false);
});

test('the position steps through the file hits, and stops at the ends', async () => {
  assert.equal(data.openIndex, 0);
  assert.equal(data.fileHits.length, 2);
  await data.step(-1);
  assert.equal(data.open.path, 'lib/a.js', 'stepping before the first stays put');
  await data.step(1);
  await tick();
  assert.equal(data.open.path, 'lib/b.js');
  assert.equal(data.openIndex, 1);
  await data.step(1);
  assert.equal(data.open.path, 'lib/b.js', 'stepping past the last stays put');
});

test('a contents hit carries no ref, and resolves late to the default branch', async () => {
  FETCHED = [];
  ANSWER = { hits: [{ repo: 'me/home', path: 'docs/x.md', frag: 'f' }], total: 1 };
  data.mode = 'contents'; data.q = 'x'; data.repo = '';
  await data.run();
  await data.openHit(data.hits[0]);
  await tick();
  assert.equal(FETCHED.at(-1).ref, '', "'' rides through to the repo's default branch");
});

test('a failed read reports itself in place of the file', async () => {
  FETCH_FAIL = 'HTTP 404';
  await data.showFile({ repo: 'me/home', ref: '', path: 'gone.md' });
  await tick();
  assert.match(data.openNote, /Could not load it: HTTP 404/);
  assert.equal(data.openBusy, false);
  FETCH_FAIL = '';
});

test('the open file rides the address, and the route out to the Files view still exists', async () => {
  await data.showFile({ repo: 'me/tools', ref: 'dev', path: 'lib/a.js' });
  await tick();
  assert.equal(shell.searchSeed.file, 'me/tools@dev:lib/a.js');
  assert.deepEqual(j(window.RepoAddress.parse(shell.searchSeed.file)),
    { repo: 'me/tools', ref: 'dev', path: 'lib/a.js' });
  data.openInFiles();
  await tick();
  assert.deepEqual(j(shell._browsed.at(-1)), ['me/tools', 'dev']);
  assert.equal(shell._opened.at(-1), 'lib/a.js');
  data.closeFile();
  assert.equal(data.open, null);
  assert.equal(shell.searchSeed.file, '');
});

test('a session hit dispatches web-tools:open-session', async () => {
  ANSWER = { hits: [{ id: 'aaaa1111', day: '2026-08-02', ask: 'the ask', frag: 'the frag' }], total: 1 };
  data.mode = 'sessions'; data.q = 'ask';
  await data.run();
  const seen = [];
  window.document.addEventListener('web-tools:open-session', e => seen.push(e.detail));
  data.openHit(data.hits[0]);
  assert.deepEqual(j(seen), [{ id: 'aaaa1111', day: '2026-08-02' }]);
});

test('the cap raises on demand, and only offers to where more can come from', async () => {
  ANSWER = { hits: [{ repo: 'me/tools', ref: '', path: 'a.js' }], total: 90, truncated: false, errors: [] };
  data.mode = 'names'; data.q = 'a'; data.repo = 'me/tools'; data.ref = '';
  await data.run();
  assert.equal(data.canShowMore, true);
  const cap = data.cap;
  await data.more();
  assert.equal(data.cap, cap + data.CAP_STEP);
  assert.equal(CALLS.filter(c => c[0] === 'names').at(-1)[1].cap, data.cap);
  // A new question resets it: a raised cap carried into a narrower scope shows
  // a fuller list than the one that was asked for.
  data.scopeTo('lib');
  assert.equal(data.cap, data.CAP_STEP);
  data.scopeTo('');
});

test('each run restamps the address; clear empties results, the reader and the seed', async () => {
  const before = shell._synced;
  ANSWER = { hits: [], total: 0 };
  data.mode = 'sessions'; data.q = 'anything';
  await data.run();
  assert.ok(shell._synced > before);
  assert.equal(shell.searchSeed.q, 'anything');
  data.clear();
  assert.equal(data.ran, false);
  assert.equal(data.hits.length, 0);
  assert.equal(data.open, null);
  assert.equal(shell.searchSeed, null);
});

test('a later routing re-seeds the mounted view by event, scope and file included', async () => {
  CALLS = []; FETCHED = [];
  ANSWER = { hits: [{ repo: 'me/tools', ref: '', path: 'docs/x.md' }], total: 1, truncated: false, errors: [] };
  window.document.dispatchEvent(new window.CustomEvent('web-tools:search-seed',
    { detail: { q: '', mode: 'names', repo: 'me/tools', path: 'docs', file: 'me/tools:docs/x.md' } }));
  await tick();
  assert.equal(data.mode, 'names');
  assert.equal(data.scope, 'docs');
  assert.equal(CALLS.filter(c => c[0] === 'names').length, 1, 'a seeded scope runs without a query');
  assert.deepEqual(j(data.open), { repo: 'me/tools', ref: '', path: 'docs/x.md' });
  assert.deepEqual(FETCHED.at(-1), { repo: 'me/tools', ref: '', path: 'docs/x.md' });
});

// A bare arrival is the cold open: the header nav's Search, or ?view=search
// with nothing beside it. Mounted as a SECOND instance, since the default is an
// init-time decision and the instance above was seeded at its own mount.
test('a bare arrival lists the browsed repo rather than landing on nothing', async () => {
  CALLS = [];
  ANSWER = { hits: [{ repo: 'me/browsed', ref: '', path: 'a.js' }], total: 1, truncated: false, errors: [] };
  shell.searchSeed = null;
  const store = Alpine.store('browser');
  store.repo = 'me/browsed'; store.ref = 'topic'; store.defaultRef = 'main';

  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'searchView()');
  window.document.body.appendChild(el);
  Alpine.initTree(el);
  await tick();

  const cold = Alpine.$data(el);
  assert.equal(cold.repo, 'me/browsed');
  assert.equal(cold.ref, 'topic', 'a browsed ref off the default is carried; the default itself is left as ""');
  assert.equal(CALLS.filter(c => c[0] === 'names').length, 1);
  assert.equal(cold.hits.length, 1);
  // The scoped repo is selectable even when it is not on the estate, so the
  // control cannot read as unscoped while the list under it is scoped.
  assert.ok(cold.repoOptions.some(r => r.repo === 'me/browsed'));

  // And the one state that still cannot run says why, rather than only greying
  // out its own button. Every other Files state says nothing: the controls
  // above already say what the mode is, and only a LIMIT needs prose.
  cold.repo = ''; cold.path = ''; cold.q = '';
  assert.equal(cold.canRun, false);
  assert.match(cold.caveat, /Pick a repo/);
  cold.repo = 'me/browsed';
  assert.equal(cold.caveat, '', 'a Files listing that can run explains nothing');
  cold.mode = 'contents';
  assert.match(cold.caveat, /384 KB/, 'contents keeps its caveats: no layout can show what a list is missing');

  el.remove();
  store.repo = ''; store.ref = ''; store.defaultRef = '';
});
