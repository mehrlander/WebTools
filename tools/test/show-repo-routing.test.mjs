// show-repo's view routing: the address a screen mints must be an address the
// page can open.
//
// The shell states its view table THREE times, by hand: the dispatch chain in
// init(), the dispatch chain in restoreFromUrl() (the popstate mirror), and the
// stamp chain in deepLinkParams(). Nothing held them in step, and all three
// ways of drifting had happened at once by the time anyone looked (measured
// 2026-08-11, against a live headless walk of every ?view= param):
//
//   ?view=pages      stamped and restorable, missing from init: a link copied
//                    out of the Pages view cold-loaded onto the repo landing.
//   ?view=proposals  dispatched by both chains, stamped by neither: the view
//                    opened, then erased its own address on the first sync.
//   ?view=estate     stamped only beside a repo/ref param, on a premise that
//                    had expired (see the comment at that line).
//
// So this holds the three lists to each other, and then round-trips each view
// through the real stamp and the real parse. The parity half is source
// reading; the round-trip half executes the shell through the shared harness.
// Both are wanted: parity catches a view added to one chain and not another,
// round-trip catches a view present in all three whose keys still do not
// survive the trip.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShell, page } from './show-repo-shell.mjs';

// A view the chains READ but never stamp, on purpose: a retired key kept
// resolving so saved links still land somewhere real. An alias is not drift,
// but it has to be declared here rather than inferred, or a genuinely
// unstamped view could hide behind the exemption.
const ALIASES = new Set(['portable']);

// The three chains, sliced out of the page source. Anchored on tokens that
// would not survive a reshuffle, so a move fails loudly here rather than
// silently narrowing what the test reads.
function slice(from, to) {
  const a = page.indexOf(from);
  assert.ok(a >= 0, 'anchor not found in the page source: ' + from);
  const b = page.indexOf(to, a);
  assert.ok(b > a, 'closing anchor not found after it: ' + to);
  return page.slice(a, b);
}

const initChain = slice('const url = this.parseUrl();\n    if (url && url.window)', 'const staged =');
const restoreChain = slice('async restoreFromUrl(){', '} finally { this._restoring = false; }');
const stampChain = slice('deepLinkParams(base){', 'return p;');

const dispatched = (block) => new Set([...block.matchAll(/url\.view === '(\w+)'/g)].map(m => m[1]));
const stamped = new Set([...stampChain.matchAll(/this\.view === '(\w+)'/g)].map(m => m[1]));

const initViews = dispatched(initChain);
const restoreViews = dispatched(restoreChain);

test('boot and popstate dispatch the same views', () => {
  for (const v of restoreViews)
    assert.ok(initViews.has(v), `?view=${v} is restorable on Back but not on a cold load: add it to the init chain`);
  for (const v of initViews)
    assert.ok(restoreViews.has(v), `?view=${v} loads but does not survive Back: add it to restoreFromUrl`);
});

test('every view the page can address, it can also open', () => {
  for (const v of stamped)
    assert.ok(initViews.has(v), `?view=${v} is stamped into the URL but no boot branch reads it back`);
});

test('every view the page can open, it can also address', () => {
  for (const v of initViews) {
    if (ALIASES.has(v)) continue;
    assert.ok(stamped.has(v), `?view=${v} opens from a link but is never stamped, so it erases its own address`);
  }
});

// What each view needs on the shell before it has anything to stamp. A view
// absent from here stamps from its key alone.
const SEED = {
  project: (s) => { s.projectPath = 'projects/budget-drs'; },
  state: (s) => { s.stateItem = 'sessions'; },
  search: (s) => { s.searchSeed = { q: 'tracker', mode: 'names' }; },
  app: (s) => { s.appView = { repo: 'mehrlander/home', path: 'links/index.html' }; },
};

// Run the round trip against BOTH repo cases. On the default repo the `repo`
// key is deleted as redundant, which is a different query and was the case
// ?view=estate broke in: it stamped only when a repo/ref param happened to be
// there, so browsing the hub itself left the view unaddressable while browsing
// any other repo looked fine.
const REPOS = ['mehrlander/home', 'mehrlander/web-tools'];

test('every view round-trips: stamped, then parsed back to itself', () => {
  for (const repo of REPOS) for (const view of stamped) {
    const where = `${view} (browsing ${repo})`;
    const { shell } = makeShell({ browserStore: {
      repo, ref: '', defaultRef: 'main', activeFile: null, path: '' } });
    shell.view = view;
    SEED[view]?.(shell);
    const qs = shell.deepLinkParams(new URLSearchParams()).toString();
    assert.ok(qs.includes('view=' + view) || view === 'files',
      `${where}: stamped nothing that names the view (got "${qs || 'an empty query'}")`);

    const { shell: reopened } = makeShell({ search: '?' + qs, browserStore: { repo: '' } });
    const url = reopened.parseUrl();
    assert.ok(url, `${where}: its own address parses to nothing, so a cold load ignores it`);
    assert.equal(url.view || (url.file ? 'files' : ''), view,
      `${where}: reopening its address lands on a different view`);
  }
});

test('the second key rides along, for the three views that carry one', () => {
  const cases = [
    ['state', (s) => { s.stateItem = 'sessions'; }, 'item', 'sessions'],
    ['search', (s) => { s.searchSeed = { q: 'tracker', mode: 'names' }; }, 'sq', 'tracker'],
    ['activity', (s) => { s.detailSpec = 'mehrlander/web-tools@main'; }, 'detail', 'mehrlander/web-tools@main'],
  ];
  for (const [view, seed, key, want] of cases) {
    const { shell } = makeShell({ browserStore: {
      repo: 'mehrlander/home', ref: '', defaultRef: 'main', activeFile: null, path: '' } });
    shell.view = view;
    seed(shell);
    const qs = shell.deepLinkParams(new URLSearchParams()).toString();
    const { shell: reopened } = makeShell({ search: '?' + qs, browserStore: { repo: '' } });
    // `detail` is read off the location directly rather than through parseUrl,
    // because deepLinkParams rebuilds the query from a whitelist and would
    // erase an incoming value before the estate read it. Assert the field the
    // shell actually seeds, which is the thing the deep link depends on.
    const got = key === 'detail' ? reopened.detailSpec : reopened.parseUrl()[key === 'sq' ? 'sq' : 'item'];
    assert.equal(got, want, `?view=${view}&${key}= did not survive the round trip`);
  }
});
