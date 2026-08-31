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
let LEVEL = { dirs: [], files: [], truncated: false };   // files are { path, size }
window.EstateSearch = {
  clip: (t) => String(t || ''),
  reset() { CALLS.push(['reset']); },
  async names(a) { CALLS.push(['names', a]); if (ANSWER.throw) throw new Error(ANSWER.throw); return ANSWER; },
  async level(a) { CALLS.push(['level', a]); if (ANSWER.throw) throw new Error(ANSWER.throw); return LEVEL; },
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
  data.mode = 'names'; data.q = 'y'; data.repo = 'me/tools'; data.ref = ''; data.path = 'lib/kits';
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
  data.mode = 'names'; data.q = 'y'; data.repo = 'me/tools';
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
  // No repo but a folder: no LEVEL to read (a level of "every repo" is not a
  // place), so it stays the recursive listing across every repo.
  await data.run();
  assert.equal(CALLS.find(c => c[0] === 'names')[1].q, '');
  assert.equal(data.browsing, false);
});

test('no query is a WALK: folders, then files, and a way back up', async () => {
  CALLS = [];
  LEVEL = {
    dirs: [{ name: 'kits', path: 'lib/kits', n: 9 }, { name: 'demos', path: 'lib/demos', n: 2 }],
    files: [{ path: 'lib/gh-api.js', size: 9001 }, { path: 'lib/build.js', size: 400 }],
    truncated: false,
  };
  data.mode = 'names'; data.q = ''; data.repo = 'me/tools'; data.ref = ''; data.path = 'lib';
  assert.equal(data.browsing, true);
  await data.run();
  assert.equal(CALLS.filter(c => c[0] === 'level').length, 1, 'a walk reads a level, not a recursive match');
  assert.equal(CALLS.find(c => c[0] === 'level')[1].under, 'lib');

  // The way out sits at the top of the list, then folders, then files: the
  // order a file browser has always used.
  assert.deepEqual([...data.hits.map(h => h.kind)], ['dir', 'dir', 'dir', 'file', 'file']);
  assert.equal(data.hits[0].label, '..');
  assert.equal(data.hits[0].path, '', 'the parent of lib is the repo root');
  assert.deepEqual([...data.hits.slice(1, 3).map(h => h.label)], ['kits', 'demos']);
  assert.equal(data.hits[1].sub, '9 files');

  // The estate's row palette, which a generic row builder had quietly dropped:
  // the manila folder is what says at a glance which rows you can walk into.
  // The way up keeps the muted treatment, being a way out and not a folder.
  assert.equal(data.hits[1].tint, 'text-warning');
  assert.equal(data.hits[3].tint, 'text-info');
  assert.equal(data.hits[0].tint, undefined);

  // A file's weight rides the same tree read, rounded the way the rest of the
  // estate rounds bytes. A folder row carries a count instead, and the way out
  // carries neither.
  assert.deepEqual([...data.hits.slice(3).map(h => h.size)], ['8.8 KB', '400 B']);
  assert.equal(data.hits[1].size, undefined);
  assert.equal(data.hits[0].size, undefined);

  // A folder row descends rather than opening anything.
  const before = FETCHED.length;
  data.openHit(data.hits[1]);
  await tick();
  assert.equal(data.scope, 'lib/kits');
  assert.equal(FETCHED.length, before, 'a folder is not a file: nothing is fetched to read');

  // The tally counts what is there rather than reporting hits, since nothing
  // was searched for.
  data.path = 'lib';
  await data.run();
  assert.match(data.tally, /2 folders · 2 files/);

  // And only the file rows are readable, so the reader's position ignores the
  // folders and the way up.
  assert.equal(data.fileHits.length, 2);
});

test('typing turns the walk back into a recursive search of the same scope', async () => {
  CALLS = [];
  ANSWER = { hits: [{ repo: 'me/tools', ref: '', path: 'lib/kits/deep/x.js', size: 1536 }],
             total: 1, truncated: false, errors: [] };
  data.mode = 'names'; data.repo = 'me/tools'; data.path = 'lib'; data.q = 'x';
  assert.equal(data.browsing, false);
  await data.run();
  assert.equal(CALLS.filter(c => c[0] === 'level').length, 0);
  assert.equal(CALLS.find(c => c[0] === 'names')[1].under, 'lib', 'the scope holds across the switch');
  assert.equal(data.hits[0].label, 'kits/deep/x.js', 'flat and relative: a match below the level is still one row');
  assert.equal(data.hits[0].size, '1.5 KB', 'the size survives the switch: both lanes read the same tree');
  data.q = '';
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
  LEVEL = { dirs: [], files: [{ path: 'docs/x.md', size: 120 }], truncated: false };
  window.document.dispatchEvent(new window.CustomEvent('web-tools:search-seed',
    { detail: { q: '', mode: 'names', repo: 'me/tools', path: 'docs', file: 'me/tools:docs/x.md' } }));
  await tick();
  assert.equal(data.mode, 'names');
  assert.equal(data.scope, 'docs');
  assert.equal(CALLS.filter(c => c[0] === 'level').length, 1, 'a seeded scope runs without a query');
  assert.deepEqual(j(data.open), { repo: 'me/tools', ref: '', path: 'docs/x.md' });
  assert.deepEqual(FETCHED.at(-1), { repo: 'me/tools', ref: '', path: 'docs/x.md' });
});

// A bare arrival is the cold open: the header nav's Search, or ?view=search
// with nothing beside it. Mounted as a SECOND instance, since the default is an
// init-time decision and the instance above was seeded at its own mount.
test('the reader opens a file in the mode its type deserves, and falls back on size', () => {
  const m = (ext, len = 10) => data.READ_MODE({ ext, content: 'x'.repeat(len) });
  assert.equal(m('md'), 'preview');
  assert.equal(m('json'), 'tree');
  assert.equal(m('csv'), 'table');
  assert.equal(m('tsv'), 'table');
  assert.equal(m('js'), 'code');
  assert.equal(m('txt'), 'code');
  // Prism highlights synchronously and this estate holds megabyte files, so
  // past the cut a file opens raw rather than hanging the tab on arrival.
  assert.equal(m('js', 400000), 'raw');
  assert.equal(m('md', 400000), 'raw');
});

test('a bare arrival lists the browsed repo rather than landing on nothing', async () => {
  CALLS = [];
  LEVEL = { dirs: [], files: [{ path: 'a.js', size: 12 }], truncated: false };
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
  assert.equal(CALLS.filter(c => c[0] === 'level').length, 1);
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

// ── The deck ─────────────────────────────────────────────────────────────────
//
// The pane and the deck are ONE position, which is the whole claim worth
// testing here: the deck opens on the file the pane has open, every slide
// writes that file back to `open`, and `open` is what the list highlights and
// what the address carries. swipeDeck is stubbed, so this tests the wiring and
// not the kit, which has its own suite.
let DECK = null;
window.swipeDeck = {
  top: () => null,
  drill: (_p, o) => { DECK = { o, calls: [] }; return handleFor(o); },
  open: (o) => { DECK = { o, calls: [] }; return handleFor(o); },
};
const handleFor = (o) => ({
  deck: { active: () => o.start || 0 },
  close() { o.onClose?.(); },
  setTitle(t) { DECK.calls.push(['title', t]); },
  setSubtitle(t) { DECK.calls.push(['subtitle', t]); },
  setIcon(t) { DECK.calls.push(['icon', t]); },
  setLink(l) { DECK.calls.push(['link', l]); },
});

test('the deck opens over the file hits, at the file the pane has open', async () => {
  DECK = null;
  ANSWER = {
    hits: [{ repo: 'me/tools', ref: 'dev', path: 'lib/a.js' },
           { repo: 'me/tools', ref: 'dev', path: 'lib/kits/b.js' },
           { repo: 'me/tools', ref: 'dev', path: 'lib/c.js' }],
    total: 3, truncated: false, errors: [],
  };
  data.mode = 'names'; data.q = 'lib'; data.repo = 'me/tools'; data.ref = 'dev';
  await data.run();
  await data.openHit(data.hits[1]);
  await tick();

  await data.openDeck();
  assert.equal(DECK.o.count, 3);
  assert.equal(DECK.o.start, 1, 'the deck opens where the reader was standing');
  assert.equal(data.deckOpening, false);

  // The header: the filename is the title, the location the subtitle, and the
  // one door out is GitHub at the ref the hit was found on.
  assert.equal(DECK.o.title, 'b.js');
  assert.equal(DECK.o.subtitle, 'tools@dev · lib/kits');
  assert.equal(DECK.o.link.href, 'https://github.com/me/tools/blob/dev/lib/kits/b.js');
  // And a contents list, since three (or fifty) hits outrun the footer's dots.
  // These three span two folders, so each row states which.
  assert.deepEqual(j(DECK.o.index(0)), { title: 'a.js', subtitle: 'tools@dev · lib', icon: 'ph-file' });
  assert.equal(DECK.o.index(1).subtitle, 'tools@dev · lib/kits');
});

test('a slide moves the pane, the list and the address with it', async () => {
  const synced = shell._synced;
  DECK.o.onSlide(2);
  assert.deepEqual(j(data.open), { repo: 'me/tools', ref: 'dev', path: 'lib/c.js' });
  assert.equal(data.isOpen(data.hits[2]), true, 'the list highlights what the deck is on');
  assert.ok(shell._synced > synced, 'and the address follows');
  assert.deepEqual(DECK.calls.filter(c => c[0] === 'title').at(-1), ['title', 'c.js']);

  DECK.o.onClose();
  assert.equal(data._deck, null);
  assert.deepEqual(j(data.open), { repo: 'me/tools', ref: 'dev', path: 'lib/c.js' },
    'dismissing leaves the reader on the file the deck stopped at');
});

test('a hit with no ref decks at HEAD, and folders are not in the deck', async () => {
  DECK = null;
  ANSWER = {
    hits: [{ repo: 'me/tools', ref: '', path: 'README.md' }],
    total: 1, truncated: false, errors: [],
  };
  data.mode = 'contents'; data.q = 'thing'; data.repo = 'me/tools'; data.ref = '';
  await data.run();
  data.closeFile();
  // A folder row rides the list and not the deck: fileHits is the readable set.
  data.hits = [{ key: 'd:lib', kind: 'dir', path: 'lib' }, ...data.hits];
  await data.openDeck();
  assert.equal(DECK.o.count, 1);
  // Unspecified means the repo's default branch, which GitHub resolves as HEAD;
  // guessing 'main' would 404 on a repo that calls it something else.
  assert.equal(DECK.o.link.href, 'https://github.com/me/tools/blob/HEAD/README.md');
  assert.equal(DECK.o.subtitle, 'tools', 'no ref and no directory leaves only the repo');
  DECK.o.onClose();
});

test('the deck snapshots its list, so a re-run underneath cannot desync count from render', async () => {
  DECK = null;
  ANSWER = {
    hits: [{ repo: 'me/tools', ref: 'dev', path: 'x.js' }, { repo: 'me/tools', ref: 'dev', path: 'y.js' }],
    total: 2, truncated: false, errors: [],
  };
  data.mode = 'names'; data.q = 'js'; data.repo = 'me/tools'; data.ref = 'dev';
  await data.run();
  await data.openDeck();
  assert.equal(DECK.o.count, 2);

  ANSWER = { hits: [{ repo: 'me/tools', ref: 'dev', path: 'z.js' }], total: 1, truncated: false, errors: [] };
  await data.run();
  assert.equal(data.fileHits.length, 1, 'the list moved');
  assert.equal(data._deckFiles.length, 2, 'the deck did not');
  DECK.o.onSlide(1);
  assert.deepEqual(j(data.open), { repo: 'me/tools', ref: 'dev', path: 'y.js' });
  DECK.o.onClose();
});
test('a deck of one folder lists bare filenames', async () => {
  DECK = null;
  ANSWER = {
    hits: [{ repo: 'me/tools', ref: 'dev', path: 'lib/a.js' },
           { repo: 'me/tools', ref: 'dev', path: 'lib/b.js' }],
    total: 2, truncated: false, errors: [],
  };
  data.mode = 'names'; data.q = 'lib'; data.repo = 'me/tools'; data.ref = 'dev';
  await data.run();
  data.closeFile();
  await data.openDeck();
  // The location is what the header says while reading; on the list it would be
  // the same string on every row, spending the width the filename wanted.
  assert.equal(DECK.o.index(0).subtitle, '');
  assert.equal(DECK.o.title, 'a.js');
  assert.equal(DECK.o.subtitle, 'tools@dev · lib', 'the header still says where');
  DECK.o.onClose();
});
