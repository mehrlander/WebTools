// alpineComponents/estate.js — the Activity view's Routes pane: the loader that
// reads the manifest, dates each declared carrier from one last-commit call, and
// joins the open PRs that touch them; and the getters the pane renders off.
//
// The fold itself (ranking, the wide-file rule, the shell exclusion) is covered
// in app-routes.test.mjs against the kit. What is tested here is the wiring the
// kit cannot see: that the loader asks for the paths the manifest declares and
// nothing else, that it survives a carrier with no commits, that the
// attempt-once guard holds after a failure, and that the pane's aggregates read
// off the rows rather than off the manifest.
//
// No network, no pixels: GH is stubbed and answers from a fixture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const MANIFEST = {
  shell: 'pages/show-repo/show-repo.html',
  shellNote: 'every route’s file, so no route’s signal',
  groups: [{ key: 'estate', label: 'Estate', gloss: 'above any repo' }],
  routes: [
    { key: 'map', address: '?view=map', label: 'Map', group: 'estate', what: 'the coordination layer',
      files: ['lib/alpineComponents/map.js'] },
    { key: 'guides', address: '?view=guides', label: 'Guides', group: 'estate', what: 'the shelf',
      files: ['lib/alpineComponents/estate.js', 'lib/kits/guide-index.js'] },
    { key: 'landing', address: '?repo=owner/name', label: 'Landing', group: 'estate',
      what: 'a repo front door', files: [], note: 'inline in the shell' },
  ],
};

// Newest first per path, so the ranking has something to order by.
const COMMITS = {
  'lib/alpineComponents/map.js': { sha: 'aaaaaaa1', date: '2026-08-14T10:00:00Z', msg: 'map: registries tab' },
  'lib/kits/guide-index.js':     { sha: 'bbbbbbb2', date: '2026-08-02T10:00:00Z', msg: 'guides: derive the session' },
  // estate.js and the shell deliberately have no entry: one exercises the
  // no-commits path, the other must not date anything even when it does.
  'pages/show-repo/show-repo.html': { sha: 'ccccccc3', date: '2026-08-14T23:00:00Z', msg: 'shell: route table' },
};

let asked = [];
let failNext = false;
let gotRef = null;      // the ref the pane built its client at
let manifestRef = null; // the ref it read the manifest at

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; gotRef = this.ref; }
  ago(iso) {
    const d = Math.round((Date.parse('2026-08-15T00:00:00Z') - Date.parse(iso)) / 86400000);
    return d < 1 ? 'just now' : d + ' days ago';
  }
  async get(path) {
    if (failNext) throw new Error('GitHub Error 404: Not Found');
    // The manifest exists only at the ref the code came from, which is the
    // whole point: reading it at main while running branch code is the bug
    // this fixture reproduces.
    if (path === 'docs/app-routes.json') {
      manifestRef = this.ref;
      if (this.ref !== 'main' && this.ref !== 'claude/branch') throw new Error('GitHub Error 404: Not Found');
      return { text: JSON.stringify(MANIFEST) };
    }
    throw new Error('404');
  }
  async req(path) {
    if (path.startsWith('commits?path=')) {
      const p = decodeURIComponent(path.slice('commits?path='.length).split('&')[0]);
      asked.push(p);
      // The dates ride the same ref as the manifest, so the pane speaks about
      // one tree rather than mixing a branch's code with main's history.
      assert.match(path, new RegExp('&sha=' + encodeURIComponent(this.ref).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '&'));
      const c = COMMITS[p];
      if (!c) return [];
      return [{ sha: c.sha, html_url: 'https://github.com/x/y/commit/' + c.sha,
                commit: { message: c.msg, committer: { date: c.date } },
                author: { login: 'mehrlander' } }];
    }
    if (/^pulls\/\d+\/files/.test(path)) {
      const n = +path.match(/^pulls\/(\d+)/)[1];
      return n === 7
        ? [{ filename: 'lib/alpineComponents/map.js' }, { filename: 'README.md' }]
        : [{ filename: 'docs/SNAGS.md' }];
    }
    throw new Error('404 ' + path);
  }
  async pulls() {
    return [
      { number: 7, title: 'map: a registries tab', head: 'claude/registries', draft: true, session: 's7' },
      { number: 8, title: 'a snag', head: 'claude/snag', draft: false, session: '' },
    ];
  }
  async ls() { throw new Error('404'); }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.gh = { load: async () => {} };
window.__shell = {
  REGISTRY_REPO: 'me/registry', DEFAULT_REPO: 'me/tools', quickLinks: [],
  hasToken: () => true, _authState: 'auth',
  routed: [],
  routeFromUrl(u){ this.routed.push(u); },
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/surface.js',
  'lib/kits/route-activity.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));

// Values cross the jsdom realm boundary, so deepEqual would fail on prototype
// identity alone (every other estate suite does the same).
const plain_ = (v) => JSON.parse(JSON.stringify(v));

test('the loader asks for exactly the declared carriers plus the shell', async () => {
  asked = [];
  await data.loadRoutes(true);
  assert.deepEqual(plain_(asked).sort(), [
    'lib/alpineComponents/estate.js',
    'lib/alpineComponents/map.js',
    'lib/kits/guide-index.js',
    'pages/show-repo/show-repo.html',
  ]);
});

test('a carrier with no commits leaves its route undated rather than throwing', () => {
  const guides = data.routeRows.find(r => r.key === 'guides');
  // estate.js answered empty; guide-index.js dated the row.
  assert.equal(guides.lastTouch.sha, 'bbbbbbb2');
  assert.equal(guides.files.find(f => f.path === 'lib/alpineComponents/estate.js').touch, null);
});

test('the shell dates its own row and no route', () => {
  assert.ok(data.routeRows.every(r => r.lastTouch?.sha !== 'ccccccc3'));
  assert.equal(data.routeShell.touch.sha, 'ccccccc3');
  assert.equal(data.routeShell.routes, 3);
});

test('rows rank freshest first, undated last', () => {
  assert.deepEqual(plain_(data.routeRows.map(r => r.key)), ['map', 'guides', 'landing']);
});

test('open PRs join on the files they touch, and only those', () => {
  const map = data.routeRows.find(r => r.key === 'map');
  assert.equal(map.branches.length, 1);
  assert.equal(map.branches[0].pr, 7);
  assert.deepEqual(plain_(map.branches[0].hits), ['lib/alpineComponents/map.js']);
  assert.match(map.branches[0].url, /\/pull\/7$/);
  // PR 8 touches nothing any route declares, so it appears on no row.
  assert.ok(data.routeRows.every(r => r.branches.every(b => b.pr !== 8)));
});

test('the census counts the routes with no code of their own', () => {
  assert.equal(data.routeRows.length, 3);
  assert.equal(data.routesWithoutCode, 1);
  assert.equal(data.routesInFlight, 1);
});

test('only a bare ?view= address is offered as a tap', () => {
  const rows = data.routeRows;
  assert.equal(data.routeIsOpenable(rows.find(r => r.key === 'map')), true);
  assert.equal(data.routeIsOpenable(rows.find(r => r.key === 'landing')), false);
  data.openRoute(rows.find(r => r.key === 'map'));
  assert.deepEqual(plain_(window.__shell.routed), [{ view: 'map' }]);
  // A row that cannot be honoured does not navigate at all.
  data.openRoute(rows.find(r => r.key === 'landing'));
  assert.equal(window.__shell.routed.length, 1);
});

// The pane reads its manifest and its dates at the ref the CODE came from, not
// at main. Pinning to main 404ed on the very first preview of the branch that
// added the manifest, and the failure impersonated an auth problem (the fix is
// what the error message now names). `?use=` is the app's standing answer to
// "which ref am I running"; a #gh= toss injects the addressed ref under that
// same key through toss-render's params shim, so one read covers both.
test('the pane reads at the running ref, so a preview is not pinned to main', async () => {
  assert.equal(data.routesRef, 'main');           // the deployed default
  window.history.replaceState(null, '', '?use=claude/branch');
  assert.equal(data.routesRef, 'claude/branch');
  await data.loadRoutes(true);
  assert.equal(manifestRef, 'claude/branch');
  assert.equal(gotRef, 'claude/branch');
  assert.equal(data.routesError, '');
  window.history.replaceState(null, '', '?');
  assert.equal(data.routesRef, 'main');
});

test('a failed load names the address it could not read', async () => {
  failNext = true;
  await data.loadRoutes(true);
  assert.match(data.routesError, /mehrlander\/web-tools@main:docs\/app-routes\.json/);
  assert.match(data.routesError, /404/);
  assert.equal(data.routesBusy, false);
  // The x-effect fires again on the next render; the attempt-once guard is
  // what stops it pegging the main thread, so an unforced call is a no-op.
  asked = [];
  await data.loadRoutes();
  assert.deepEqual(plain_(asked), []);
  failNext = false;
});

// The Branches pane's side of the join. It reads the SAME state the Routes
// pane loads, so visiting either warms the other; what it must not do is answer
// for a repo whose routes nobody declared.
test('a branch row reports the routes it touches, and only for the hub', async () => {
  await data.loadRoutes(true);
  const row = { repo: 'mehrlander/web-tools', name: 'claude/registries' };  // PR 7: map.js
  const r = data.branchRoutes(row);
  assert.deepEqual(plain_(r.on.map(x => x.key)), ['map']);
  // A row from any other repo has no answer here rather than an empty one.
  assert.equal(data.branchRoutes({ repo: 'mehrlander/home', name: 'claude/registries' }), null);
  // A hub branch nobody has file lists for is also absent, not empty.
  assert.equal(data.branchRoutes({ repo: 'mehrlander/web-tools', name: 'claude/unknown' }), null);
  // PR 8 touches docs/SNAGS.md, which no route declares.
  assert.equal(data.branchRoutes({ repo: 'mehrlander/web-tools', name: 'claude/snag' }), null);
});

test('the shared half loads without the dating, and only once', async () => {
  data.routeJoinTried = false;
  data.routeManifest = null;
  asked = [];
  await data.loadRouteJoin();
  assert.ok(data.routeManifest, 'manifest loaded');
  assert.deepEqual(plain_(asked), [], 'no per-carrier commit reads for the join alone');
  assert.equal(data.routeBranchFiles.length, 2);
  // Guarded: the x-effect on the Branches pane fires on every render.
  data.routeBranchFiles = [];
  await data.loadRouteJoin();
  assert.equal(data.routeBranchFiles.length, 0, 'an unforced second call is a no-op');
});

test('the group is a row label read off the manifest, not a section', async () => {
  await data.loadRoutes(true);
  assert.equal(data.routeGroupLabel('estate'), 'Estate');
  // An unknown key labels itself rather than rendering blank.
  assert.equal(data.routeGroupLabel('nope'), 'nope');
});
