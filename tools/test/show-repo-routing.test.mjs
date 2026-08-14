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

// ── The shell mode (?shell=), a READING parameter beside the view table ──────
//
// It says how much of the app is drawn around the view, not which view, so it
// has no VIEWS row on purpose and is stamped unconditionally beside whatever
// the table stamped. That places it outside everything above, and the two
// properties it has to hold are exactly the ones the view table's rows get for
// free: an address that reopens as itself, and a default that never appears.

test('the shell mode round-trips, and only when it is not the default', () => {
  const store = () => ({ repo: 'mehrlander/home', ref: '', defaultRef: 'main', activeFile: null, path: '' });

  for (const mode of ['nav', 'none']) {
    const { shell: s } = makeShell({ browserStore: store() });
    s.view = 'map';
    s.setShellMode(mode);
    const qs = s.deepLinkParams(new URLSearchParams()).toString();
    assert.match(qs, new RegExp('(^|&)shell=' + mode + '($|&)'),
      `?shell=${mode} was not stamped, so the mode cannot be linked to`);

    const { shell: reopened } = makeShell({ search: '?' + qs, browserStore: { repo: '' } });
    reopened.readShellMode();
    assert.equal(reopened.shellMode, mode, `?shell=${mode} did not survive a cold load`);
    // Reopening must still land on the view: the mode rides beside the view
    // keys, so a collision would show up here as a lost or hijacked address.
    assert.equal(landsOn(reopened, reopened.parseUrl()), 'map',
      `?shell=${mode} disturbed the view its link also names`);
  }

  // The default stays out, which is what keeps every link written before this
  // existed byte-identical to one written after it.
  const { shell: plain } = makeShell({ browserStore: store() });
  plain.view = 'map';
  assert.equal(plain.shellMode, 'full', 'the default mode is not full');
  assert.ok(!plain.deepLinkParams(new URLSearchParams()).has('shell'),
    'the default mode stamped itself, so it would appear on every address');
});

test('an unknown shell mode reads as the default rather than blanking the app', () => {
  // A hand-edited or truncated ?shell= must not hide the header with no way
  // back: an unrecognized value is not a fourth mode, it is no mode.
  // Surrounding whitespace is trimmed rather than rejected, the way ?overlay=
  // is read, so `shell=%20none` is `none` and is not in this list.
  for (const bad of ['', 'hidden', 'nav-only', 'FULL', '1']) {
    const { shell: s } = makeShell({ search: '?shell=' + encodeURIComponent(bad), browserStore: { repo: '' } });
    s.readShellMode();
    assert.equal(s.shellMode, 'full', `?shell=${JSON.stringify(bad)} resolved to something other than full`);
  }
});

test('the FAB toggle contract is well formed, and its setter is the mode setter', () => {
  // The Render tab renders one on/off control per entry, inline with the width
  // presets. A malformed row paints a dead button, so the shape is checked here
  // rather than left to be seen.
  const { shell: s } = makeShell({ browserStore: { repo: '' } });
  const [t, ...rest] = s.toggles;
  assert.equal(rest.length, 0, 'show-repo contributes more than one toggle; the doc names one');
  assert.ok(t.key && t.label && t.icon && typeof t.set === 'function',
    'the toggle row is missing key, label, icon, or set');
  assert.equal(t.on, true, 'the toggle does not start on, so the default state reads as the exceptional one');
  assert.equal(t.hint, '', 'the default state carries a hint, so the row would never sit one line high');

  t.set(false);
  assert.equal(s.shellMode, 'none', "the toggle's setter did not move the shell");
  assert.equal(s.toggles[0].on, false, 'the toggle re-reads a stale value, so it would light the wrong way');
  assert.ok(s.toggles[0].hint, 'the off state says nothing, leaving ?shell=none unexplained');
});

test('the header toggle returns to the mode it left, not to full', () => {
  // The drawer offers one binary over three modes, so coming back is ambiguous
  // and the shell remembers. Without this, someone who opened a ?shell=nav link
  // and toggled the header off and on would land on full and have the sidebar
  // spring out at them.
  for (const start of ['full', 'nav']) {
    const { shell: s } = makeShell({ search: '?shell=' + start, browserStore: { repo: '' } });
    s.readShellMode();
    s.setHeader(false);
    assert.equal(s.shellMode, 'none', `from ${start}: the header did not come off`);
    s.setHeader(true);
    assert.equal(s.shellMode, start, `from ${start}: the header came back to ${s.shellMode} instead`);
  }
});
