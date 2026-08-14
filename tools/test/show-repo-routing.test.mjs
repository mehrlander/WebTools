// show-repo's view routing: the address a screen mints must be an address the
// page can open.
//
// The shell used to state its view table THREE times, by hand: the dispatch
// chain in init(), the dispatch chain in restoreFromUrl() (the popstate
// mirror), and the stamp chain in deepLinkParams(). Nothing held them in step,
// and all three ways of drifting had happened at once (measured 2026-08-11, by
// walking every ?view= param through the real page in headless Chromium):
//
//   ?view=pages      stamped and restorable, missing from init: a link copied
//                    out of the Pages view cold-loaded onto the repo landing.
//   ?view=proposals  dispatched by both chains, stamped by neither: the view
//                    opened, then erased its own address on the first sync.
//   ?view=estate     stamped only beside a repo/ref param, on a premise that
//                    had expired (see the comment at that row).
//
// The three chains are now one VIEWS table, so that class of drift is
// structural rather than a thing to remember. This holds the collapse in place
// (nothing may route around the table) and then round-trips every row through
// the real stamp and the real parse, which is the property the table is FOR
// and which the table alone does not prove.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShell, page } from './show-repo-shell.mjs';

const { shell } = makeShell({ browserStore: { repo: '' } });
const rows = shell.VIEWS;

test('the table is the only router', () => {
  // A view-name literal inside the routing functions is the shape the collapse
  // removed: it is how a special case creeps back in and starts drifting again.
  for (const fn of ['routeFromUrl(url){', 'deepLinkParams(base){']) {
    const at = page.indexOf(fn);
    assert.ok(at > 0, 'routing function not found in the page source: ' + fn);
    const body = page.slice(at, page.indexOf('\n  },', at));
    const literals = [...body.matchAll(/(?:this\.view|url\.view|\.view) === '(\w+)'/g)].map(m => m[1]);
    assert.deepEqual(literals, [],
      `${fn} compares a view name directly (${literals}); route it through VIEWS instead`);
  }
});

test('every view the shell can enter has a row', () => {
  // `this.view = '<key>'` in a go* method is the app entering a view. One with
  // no row would render fine and be unaddressable, which is defect 2 exactly.
  const entered = new Set([...page.matchAll(/this\.view = '(\w+)'/g)].map(m => m[1]));
  const keys = new Set(rows.map(r => r.key));
  for (const v of entered)
    assert.ok(keys.has(v), `the shell enters view '${v}' but VIEWS has no row for it`);
});

test('rows are well formed, and keys and aliases are unique', () => {
  const seen = new Set();
  for (const r of rows) {
    assert.ok(r.key && typeof r.open === 'function', `row ${r.key}: needs a key and an open()`);
    for (const name of [r.key, r.alias].filter(Boolean)) {
      assert.ok(!seen.has(name), `two rows answer to '${name}'`);
      seen.add(name);
    }
    // `self` says the view names itself another way, so the row must stamp
    // that other way itself; without a stamp it would name nothing at all.
    if (r.self) assert.ok(r.stamp, `row ${r.key}: declares self but stamps nothing`);
  }
});

test('an alias resolves to its row rather than to a view of its own', () => {
  for (const r of rows.filter(r => r.alias))
    assert.equal(shell.routeFor(r.alias)?.key, r.key, `alias ${r.alias} does not resolve to ${r.key}`);
});

// What each view needs on the shell before it has anything to stamp. A row
// absent from here stamps from its key alone.
const SEED = {
  project: (s) => { s.projectPath = 'projects/budget-drs'; },
  state: (s) => { s.stateItem = 'sessions'; },
  search: (s) => { s.searchSeed = { q: 'tracker', mode: 'names' }; },
  app: (s) => { s.appView = { repo: 'mehrlander/home', path: 'links/index.html' }; },
};

// Run the round trip against BOTH repo cases. On the default repo the `repo`
// key is dropped as redundant, which is a different query and was the case
// ?view=estate broke in: it stamped only when a repo/ref param happened to be
// there, so browsing the hub itself left the view unaddressable while browsing
// any other repo looked fine.
const REPOS = ['mehrlander/home', 'mehrlander/web-tools'];

// What the app would open for a parsed address: routeFromUrl's resolution,
// modelled rather than run, since running it would need the whole DOM.
function landsOn(reopened, url) {
  if (!url) return 'dashboard';
  if (url.file) return 'files';
  const r = reopened.routeFor(url.view);
  return r && (!r.when || r.when(url)) ? r.key : 'landing';
}

test('every view round-trips: stamped, then parsed back to itself', () => {
  for (const repo of REPOS) for (const row of rows) {
    const view = row.key;
    const where = `${view} (browsing ${repo})`;
    const { shell: s } = makeShell({ browserStore: {
      repo, ref: '', defaultRef: 'main', activeFile: null, path: '' } });
    s.view = view;
    SEED[view]?.(s);
    const qs = s.deepLinkParams(new URLSearchParams()).toString();
    assert.ok(qs, `${where}: stamped an empty query, so the view has no address at all`);

    const { shell: reopened } = makeShell({ search: '?' + qs, browserStore: { repo: '' } });
    const url = reopened.parseUrl();
    assert.ok(url, `${where}: its own address parses to nothing, so a cold load ignores it`);
    assert.equal(landsOn(reopened, url), view,
      `${where}: reopening its address (?${qs}) lands on a different view`);
  }
});

test('the second key rides along, for the views that carry one', () => {
  const cases = [
    ['state', (s) => { s.stateItem = 'sessions'; }, 'item', 'sessions'],
    ['search', (s) => { s.searchSeed = { q: 'tracker', mode: 'names' }; }, 'sq', 'tracker'],
    ['map', (s) => { s.mapTab = 'showing'; }, 'tab', 'showing'],
    ['activity', (s) => { s.detailSpec = 'mehrlander/web-tools@main'; }, 'detail', 'mehrlander/web-tools@main'],
  ];
  for (const [view, seed, key, want] of cases) {
    const { shell: s } = makeShell({ browserStore: {
      repo: 'mehrlander/home', ref: '', defaultRef: 'main', activeFile: null, path: '' } });
    s.view = view;
    seed(s);
    const qs = s.deepLinkParams(new URLSearchParams()).toString();
    const { shell: reopened } = makeShell({ search: '?' + qs, browserStore: { repo: '' } });
    // `detail` is read off the location directly rather than through parseUrl,
    // because deepLinkParams rebuilds the query from a whitelist and would
    // erase an incoming value before the estate read it. Assert the field the
    // shell actually seeds, which is what the deep link depends on.
    const got = key === 'detail' ? reopened.detailSpec : reopened.parseUrl()[key];
    assert.equal(got, want, `?view=${view}&${key}= did not survive the round trip`);
  }
});

// The repo sidebar's Files row leaves the repo for the central surface, and
// what it carries is the whole of that hand-off: the repo, and the ref only
// when it is off the default, since '' means "the default branch" on the other
// side. A row that dropped the ref would open a listing of main while the
// shell was browsing a branch, which reads as the branch having no files.
test('the repo sidebar hands its Files row to the central surface, scoped', () => {
  const off = makeShell({ browserStore: {
    repo: 'mehrlander/home', ref: 'claude/topic', defaultRef: 'main', activeFile: null, path: '' } });
  off.shell.searchRepoFiles();
  assert.equal(off.shell.view, 'search');
  assert.equal(off.shell.searchSeed.repo, 'mehrlander/home');
  assert.equal(off.shell.searchSeed.ref, 'claude/topic');
  assert.equal(off.shell.searchSeed.mode, 'names');
  assert.equal(off.shell.searchSeed.q, '', 'no query: the row lists the repo, it does not search it');

  const onDefault = makeShell({ browserStore: {
    repo: 'mehrlander/home', ref: 'main', defaultRef: 'main', activeFile: null, path: '' } });
  onDefault.shell.searchRepoFiles();
  assert.equal(onDefault.shell.searchSeed.ref, '', 'the default branch rides as the empty ref, not by name');
});

// The two retired per-repo views. Removing a view is not removing its links:
// every ?view=files and ?view=branches ever shared has to land on whatever
// took over, scoped as well as the old address described.
test('the retired views alias onto what replaced them, carrying their scope', () => {
  const files = makeShell({ search: '?repo=mehrlander/home&view=files&path=docs',
                            browserStore: { repo: '' } });
  assert.equal(files.shell.routeFor('files')?.key, 'search',
    'the tree walk moved into the central Files view');
  files.shell.routeFor('files').open.call(files.shell, files.shell.parseUrl());
  assert.equal(files.shell.view, 'search');
  assert.equal(files.shell.searchSeed.path, 'docs',
    'the old ?path= scopes the new view rather than being dropped on the floor');

  const branches = makeShell({ search: '?repo=mehrlander/home&view=branches',
                               browserStore: { repo: '' } });
  assert.equal(branches.shell.routeFor('branches')?.key, 'activity',
    "the per-repo branch review moved into Activity's Branches tab");

  // And neither is a view the shell can still enter, which is what would make
  // an alias a lie: a row it aliases to must be the only thing that renders.
  const keys = new Set(rows.map(r => r.key));
  assert.ok(!keys.has('files') && !keys.has('branches'));
});

// A file named by a pin, a recent, or a ?file= link opens in the central
// reader, scoped to its folder so the walk around it is right there.
test('opening a file routes to the Files view, scoped to its folder', () => {
  const { shell: s } = makeShell({ browserStore: {
    repo: 'mehrlander/home', ref: 'claude/topic', defaultRef: 'main', path: '' } });
  s.openFile('docs/envelopes/surface.md');
  assert.equal(s.view, 'search');
  assert.equal(s.searchSeed.repo, 'mehrlander/home');
  assert.equal(s.searchSeed.path, 'docs/envelopes');
  assert.equal(s.searchSeed.file, 'mehrlander/home@claude/topic:docs/envelopes/surface.md');
  assert.equal(s.searchSeed.q, '', 'a named file is not a search for it');
});

// The browsed ref is repo-scoped state, not a view's. It rode the Files view's
// row until that row retired, and the atlas, the config form, the gallery and
// mention all read it, so it stamps beside `repo` now.
test('the browsed ref rides the address from any repo view', () => {
  for (const view of ['landing', 'atlas', 'config', 'pages']) {
    const { shell: s } = makeShell({ browserStore: {
      repo: 'mehrlander/home', ref: 'claude/topic', defaultRef: 'main', path: '' } });
    s.view = view;
    const qs = s.deepLinkParams(new URLSearchParams()).toString();
    assert.match(qs, /ref=claude%2Ftopic/, `${view} dropped the browsed ref`);
    const { shell: reopened } = makeShell({ search: '?' + qs, browserStore: { repo: '' } });
    assert.equal(reopened.parseUrl().ref, 'claude/topic');
  }
  // The default branch stays out of the URL, as every other default does.
  const { shell: onDefault } = makeShell({ browserStore: {
    repo: 'mehrlander/home', ref: 'main', defaultRef: 'main', path: '' } });
  onDefault.view = 'atlas';
  assert.doesNotMatch(onDefault.deepLinkParams(new URLSearchParams()).toString(), /ref=/);
});

// The landing is the README, for every repo including the hub. `landingKind()`
// used to pick one of three things for that slot and the README lost whenever
// anything else was declared.
test('the landing is the overview, and the gallery is its own view', () => {
  const hub = makeShell({ browserStore: {
    repo: 'mehrlander/web-tools', ref: '', defaultRef: 'main', config: {} } });
  assert.equal(hub.shell.showPagesNav, true, "the hub's catalog gets the Pages row");
  assert.equal(hub.shell.repoLandingView, null);

  const plain = makeShell({ browserStore: {
    repo: 'mehrlander/other', ref: '', defaultRef: 'main', config: {} } });
  assert.equal(plain.shell.showPagesNav, false);

  const withPages = makeShell({ browserStore: {
    repo: 'mehrlander/other', ref: '', defaultRef: 'main',
    config: { pages: [{ path: 'a.html' }] } } });
  assert.equal(withPages.shell.showPagesNav, true);

  // A declared landing is a row of its own, routed through the app view, so
  // there is one mechanism for "render this repo's page as a view".
  const withLanding = makeShell({ browserStore: {
    repo: 'mehrlander/other', ref: '', defaultRef: 'main',
    config: { landing: 'site/index.html' } } });
  const lv = withLanding.shell.repoLandingView;
  assert.equal(lv.repo, 'mehrlander/other');
  assert.equal(lv.path, 'site/index.html');
  assert.equal(withLanding.shell.showPagesNav, false,
    'a landing no longer displaces anything, so it turns nothing else on either');
});
