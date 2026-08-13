// alpineComponents/estate.js — the Activity view's branch list: the projection
// from the activity cache to rows (allBranchRows), the SCOPE axis over the
// survey's groups (branchScope / inScope / branchScopes, with openBranches the
// scoped list), the repo filter chips (openRepos / activeRepoFilter /
// openRows), the lifespan pair each row shows (branchStart), and the per-row
// GitHub menu (branchMenuItems / runBranchMenu).
//
// `activity` is assigned directly rather than loaded over a fake registry: all
// of the above are pure getters over that map, so the load path (covered in
// estate-rows) is not what these are testing. No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  // The relative-time source behind agoOf/agoShort. Fixed "now" so the
  // lifespan labels below are deterministic.
  ago(iso) {
    const h = Math.round((Date.parse('2026-07-20T00:00:00Z') - Date.parse(iso)) / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return h + ' hours ago';
    return Math.round(h / 24) + ' days ago';
  }
  async get() { throw new Error('404'); }
  async ls() { throw new Error('404'); }
  async req() { throw new Error('404'); }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
const opened = [];
window.open = (url) => { opened.push(url); return null; };
window.__shell = {
  REGISTRY_REPO: 'me/registry',
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
  // The geometry the branch menu borrows from the sidebar's repo menu.
  anchorMenu: (ev, rows, opts = {}) => ({ x: 10, y: 20, rows, ...opts }),
  menuStyle: (at) => at ? `left:${at.x}px;top:${at.y}px` : 'left:-9999px;top:-9999px',
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/branch-survey.js',      // the lifespan display rules live here, shared
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));

// A cache entry: `branches` are survey rows, `prs` are open pull requests.
const entry = (branches, prs, def = 'main') => ({
  defaultBranch: def,
  openPRs: prs,
  survey: { branches },
});

// Two repos with work in flight and one with none, exercising every way a row
// reaches the list: a stranded branch with a draft PR, a stranded branch with
// none, an open PR the survey never reached, and a landed branch (never shown).
const seed = () => {
  data.activity = {
    'me/tools': entry(
      [
        { name: 'feat/a', sha: 'a1', group: 'stranded', date: '2026-07-19T22:00:00Z',
          firstDate: '2026-07-05T00:00:00Z', subject: 'work a', aheadBy: 4, behindBy: 1 },
        { name: 'feat/b', sha: 'b1', group: 'stranded', date: '2026-07-18T00:00:00Z',
          firstDate: '2026-07-17T20:00:00Z', subject: 'work b', aheadBy: 1, behindBy: 0 },
        { name: 'old/landed', sha: 'c1', group: 'landed', date: '2026-06-01T00:00:00Z' },
      ],
      [{ number: 12, head: 'feat/a', draft: true, title: 'PR a', updatedAt: '2026-07-19T22:00:00Z',
         aheadBy: 4, behindBy: 1, firstDate: '2026-07-05T00:00:00Z' }],
    ),
    'me/home': entry(
      [],
      [{ number: 7, head: 'fresh', draft: false, title: 'PR fresh', updatedAt: '2026-07-17T12:00:00Z',
         aheadBy: 2, behindBy: 0, firstDate: '2026-07-10T00:00:00Z' }],
    ),
    'me/quiet': entry([{ name: 'done', sha: 'd1', group: 'landed', date: '2026-05-01T00:00:00Z' }], []),
  };
  data.openRepoFilter = '';
};
seed();

// Values cross the jsdom realm boundary, so deepEqual would fail on prototype
// identity alone (the estate-rows suite does the same).
const plain_ = (v) => JSON.parse(JSON.stringify(v));
const names = (rows) => plain_(rows.map(r => r.repo + '/' + r.name));

// The component's own default, captured before the baseline below overrides it.
// Recorded rather than assumed: these tests share one `data`, so a test that
// inherits a default is really asserting the previous test's leftovers.
const DEFAULT_SCOPE = data.branchScope;
// Most of this file was written against Open and reads its semantics, so the
// baseline is stated once here instead of riding on whatever the default
// happens to be. Tests that need another scope set it and restore it.
data.branchScope = 'open';

test('openBranches: open PRs and stranded branches only, freshest first', () => {
  assert.deepEqual(names(data.openBranches),
    ['me/tools/feat/a', 'me/tools/feat/b', 'me/home/fresh']);
});

test('a row takes its start from whichever compare the crawl ran', () => {
  const [a, b, fresh] = data.openBranches;
  assert.equal(a.first, '2026-07-05T00:00:00Z');      // the PR head's compare
  assert.equal(b.first, '2026-07-17T20:00:00Z');      // the survey's
  assert.equal(fresh.first, '2026-07-10T00:00:00Z');  // a PR the survey never reached
});

test('branchStart: the lifespan reads "15 days → 2 hours", collapsed when equal', () => {
  const [a, b] = data.openBranches;
  assert.equal(data.branchStart(a), '15 days');
  assert.equal(data.agoShort(a.date), '2 hours');
  // feat/b started and was last touched the same rounded distance ago, so the
  // start is dropped: "2 days" is the answer, "2 days → 2 days" is noise.
  assert.equal(data.agoShort(b.first), data.agoShort(b.date));
  assert.equal(data.branchStart(b), '');
});

test('branchStart: an unknowable start says nothing', () => {
  assert.equal(data.branchStart({ first: '', date: '2026-07-19T22:00:00Z' }), '');
  assert.equal(data.branchSpanTitle({ first: '', date: '2026-07-19T22:00:00Z' }), 'latest 2 hours ago');
  assert.equal(data.branchSpanTitle(data.openBranches[0]), 'started 15 days ago, latest 2 hours ago');
});

test('openRepos: only repos with open rows, busiest first', () => {
  assert.deepEqual(plain_(data.openRepos.map(r => [r.short, r.count])), [['tools', 2], ['home', 1]]);
  // me/quiet is in the estate and in the cache, but has nothing in flight.
  assert.ok(!data.openRepos.some(r => r.repo === 'me/quiet'));
});

test('the filter narrows the rendered rows, not the total', () => {
  data.openRepoFilter = 'me/home';
  assert.deepEqual(names(data.openRows), ['me/home/fresh']);
  assert.equal(data.openBranches.length, 3, 'the tab badge still counts everything');
  data.openRepoFilter = '';
  assert.equal(data.openRows.length, 3);
});

test('a filter whose repo goes quiet lapses back to All', () => {
  data.openRepoFilter = 'me/home';
  assert.equal(data.activeRepoFilter, 'me/home');
  // A refresh lands a cache where me/home has nothing open left.
  data.activity = { ...data.activity, 'me/home': entry([], []) };
  assert.equal(data.activeRepoFilter, '', 'no chip is lit, so show everything');
  assert.deepEqual(names(data.openRows), ['me/tools/feat/a', 'me/tools/feat/b']);
  seed();
});

test('branchMenuItems: a PR row offers its tabs, a bare branch offers New PR', () => {
  const withPr = data.openBranches[0], noPr = data.openBranches[1];
  data.menuBranch = withPr;
  let keys = plain_(data.branchMenuItems.map(i => i.key));
  assert.deepEqual(keys, ['tree', 'compare', 'commits', 'dropFile', 'stageDiff', 'prFiles', 'prChecks', 'copyName']);
  assert.equal(data.branchMenuItems.find(i => i.key === 'prFiles').label, 'Files changed (#12)');
  assert.equal(data.branchMenuItems.find(i => i.key === 'compare').label, 'Compare to main');

  data.menuBranch = noPr;
  keys = plain_(data.branchMenuItems.map(i => i.key));
  assert.deepEqual(keys, ['tree', 'compare', 'commits', 'dropFile', 'stageDiff', 'newPr', 'copyName']);
  assert.ok(!keys.includes('prFiles'));
});

test('openBranchMenu anchors through the shell and closes on a pick', () => {
  data.menuBranch = null;
  data.openBranchMenu(data.openBranches[0], { currentTarget: {} });
  assert.equal(data.branchMenuAt.width, data.BRANCH_MENU_W);
  assert.equal(data.branchMenuAt.rows, data.branchMenuItems.length);
  // This trigger leads its row rather than closing it, so the panel's LEFT
  // edge is the one aligned with the button.
  assert.equal(data.branchMenuAt.align, 'left');
  assert.equal(data.branchMenuStyle, 'left:10px;top:20px');
  data.runBranchMenu('tree');
  assert.equal(data.branchMenuAt, null);
  assert.equal(data.branchMenuStyle, 'left:-9999px;top:-9999px');
});

test('runBranchMenu builds the GitHub destinations', () => {
  const row = data.openBranches[0], bare = data.openBranches[1];
  const urlFor = (key, r) => { opened.length = 0; data.menuBranch = r; data.runBranchMenu(key); return opened[0]; };
  assert.equal(urlFor('tree', row), 'https://github.com/me/tools/tree/feat%2Fa');
  assert.equal(urlFor('compare', row), 'https://github.com/me/tools/compare/main...feat%2Fa');
  assert.equal(urlFor('commits', row), 'https://github.com/me/tools/commits/feat%2Fa');
  assert.equal(urlFor('prFiles', row), 'https://github.com/me/tools/pull/12/files');
  assert.equal(urlFor('prChecks', row), 'https://github.com/me/tools/pull/12/checks');
  assert.equal(urlFor('newPr', bare), 'https://github.com/me/tools/compare/main...feat%2Fb?expand=1');
});

// ── Drop a file here ─────────────────────────────────────────────────────
// The branch menu's one write-shaped destination: GitHub's new-file form
// opened ON the branch with the filename prefilled, so pasted content commits
// to the branch without riding through chat. The branch keeps its slashes raw
// (the form GitHub's own UI emits); the filename lands in the repo's declared
// inbox, else dump/, date-stamped.

// ── The branch detail takeover ───────────────────────────────────────────
// Tap a name, get the full-viewport detail with the list as its sequence.
// The sequence is frozen at open (a cache refresh must not yank it) and the
// stepping clamps at the ends.
//
// The address carries `&base=` because the shell already knows the row's
// default branch, and without it the embedded page opens by asking GitHub for
// the repo meta before it can compare anything: a round trip on the critical
// path of every open, spent on a fact the caller had.

test('tapping a row takes over: frozen sequence, position, clamped stepping', () => {
  const row = data.openBranches[1];
  data.openBranchDetail(row);
  assert.equal(data.detail.i, 1);
  assert.equal(data.detail.rows.length, 3);
  assert.equal(data.detailRow.name, row.name);
  assert.equal(data.detailUrl,
    '../branch.html?swipe=me%2Ftools%40feat%2Fb#gh=me/tools@feat/b&base=main');
  assert.equal(data.detailReady, false, 'the facts card is the content until the page reports ready');
  data.detailReady = true;                 // as if the embedded brief reported in
  data.detailStep(1);
  assert.equal(data.detailRow.name, 'fresh');
  assert.equal(data.detailReady, false, 'stepping re-arms the instant layer');
  data.detailStep(1);
  assert.equal(data.detail.i, 2, 'clamped at the end, no wrap');
  data.detailStep(-1); data.detailStep(-1); data.detailStep(-1);
  assert.equal(data.detail.i, 0, 'clamped at the start');
  data.closeDetail();
  assert.equal(data.detail, null);
  assert.equal(data.detailUrl, '', 'no address when nothing is open');
});

// The takeover's swipe lives in estate-branch-swipe.test.mjs: it now follows
// the finger, so the gesture needs a move phase and a surface to translate,
// and a start-then-end pair (all this file's DOM could offer) no longer
// describes it.

test('keyboard: arrows step, Escape closes, all dead when nothing is open', () => {
  data.openBranchDetail(data.openBranches[0]);
  data.detailKeys({ key: 'ArrowRight' });
  assert.equal(data.detail.i, 1);
  data.detailKeys({ key: 'ArrowLeft' });
  assert.equal(data.detail.i, 0);
  data.detailKeys({ key: 'Escape', preventDefault: () => {} });
  assert.equal(data.detail, null);
  data.detailKeys({ key: 'ArrowRight' });   // must not throw with no detail
  assert.equal(data.detail, null);
});

test('dropFileUrl: the new-file form on the branch, filename in the inbox', () => {
  const row = data.openBranches[0];                       // me/tools feat/a
  window.__shell.estateConfigs = { 'me/tools': { inbox: 'inbox/' } };
  const u = data.dropFileUrl(row);
  assert.match(u, /^https:\/\/github\.com\/me\/tools\/new\/feat\/a\?filename=/);
  const name = decodeURIComponent(u.split('filename=')[1]);
  assert.match(name, /^inbox\/\d{4}-\d{2}-\d{2}-\d{4}-drop\.md$/,
    'the declared inbox, trailing slash trimmed, date-stamped');
  window.__shell.estateConfigs = {};
  assert.match(decodeURIComponent(data.dropFileUrl(row).split('filename=')[1]),
    /^dump\//, 'no declared inbox falls back to dump/');
  const items = (data.menuBranch = row, data.branchMenuItems);
  assert.ok(items.some(i => i.key === 'dropFile' && i.external),
    'the menu carries the row, marked as leaving the app');
});

// ── The scope axis ───────────────────────────────────────────────────────
// The list used to hard-filter to open work, so landed branches had no route
// anywhere in the estate. These hold the two halves apart: allBranchRows is
// everything the cache knows, openBranches is what the chosen scope shows.

test('allBranchRows: everything the cache knows, landed included', () => {
  assert.deepEqual(names(data.allBranchRows),
    ['me/tools/feat/a', 'me/tools/feat/b', 'me/home/fresh',
     'me/tools/old/landed', 'me/quiet/done']);
});

test('the default scope is Recent and it leads the row', () => {
  // Recent leads and opens because the pane's question is "what am I working
  // on", and it is the only scope the window control acts on: landing on any
  // other scope opened the pane with its one parameter invisible.
  assert.equal(DEFAULT_SCOPE, 'active');
  assert.equal(data.BRANCH_SCOPES[0].key, 'active');
});

test('Open still selects the old list exactly, at any age', () => {
  data.branchScope = 'open';
  assert.deepEqual(names(data.openBranches), names(data.allBranchRows.filter(r => r.pr || r.group === 'stranded')));
});

test('the window is disjoint from stranded and landed, so it cannot narrow them', () => {
  // Both require daysAgo > 14 at classify time and the window tops out at 7,
  // which is why the control renders under Recent alone: applied to either of
  // these it would empty the list at every setting rather than narrow it.
  for (const r of data.allBranchRows.filter(r => r.group === 'stranded' || r.group === 'landed')) {
    assert.ok(!data.inScope(r, 'active'), r.name + ' must not be reachable as Recent');
  }
});

test('each scope shows its own group', () => {
  data.branchScope = 'landed';
  assert.deepEqual(names(data.openBranches), ['me/tools/old/landed', 'me/quiet/done']);
  data.branchScope = 'stranded';
  assert.deepEqual(names(data.openBranches), ['me/tools/feat/a', 'me/tools/feat/b']);
  data.branchScope = 'active';
  // The one row the survey never reached: an open PR, so the crawl could not
  // have classified it, and 'active' is the honest default.
  assert.deepEqual(names(data.openBranches), ['me/home/fresh']);
  data.branchScope = 'all';
  assert.equal(data.openBranches.length, 5);
  data.branchScope = 'open';
});

test('branchScopes: counts off the FULL list, not the current scope', () => {
  data.branchScope = 'landed';           // counting must not follow the selection
  const by = Object.fromEntries(data.branchScopes.map(s => [s.key, s.count]));
  assert.deepEqual(by, { open: 3, active: 1, stranded: 2, landed: 2, all: 5 });
  data.branchScope = 'open';
});

test('the repo chips follow the scope', () => {
  data.branchScope = 'landed';
  // Both landed rows are alone in their repo, so the busiest-first sort falls
  // through to the name tiebreak.
  assert.deepEqual(plain_(data.openRepos.map(r => [r.short, r.count])), [['quiet', 1], ['tools', 1]]);
  data.branchScope = 'open';
});

test('a row carries the survey evidence, and an unsurveyed one carries zeros', () => {
  const landed = data.allBranchRows.find(r => r.name === 'old/landed');
  assert.equal(landed.group, 'landed');
  assert.equal(landed.nUnique, 0);        // this fixture row was stored without counts
  const fresh = data.allBranchRows.find(r => r.name === 'fresh');
  assert.deepEqual(plain_([fresh.nUnique, fresh.nLanded, fresh.nMissing, fresh.noBase]), [0, 0, 0, false]);
});

test('the finder\'s open-branch-detail event opens the takeover like a deep link', () => {
  window.__shell.goActivity = () => { window.__shell._activated = true; };
  // A row the list carries opens seated in the full sequence…
  window.document.dispatchEvent(new window.CustomEvent('web-tools:open-branch-detail',
    { detail: { repo: 'me/home', name: 'fresh' } }));
  assert.equal(window.__shell._activated, true);
  assert.equal(data.detailRow?.name, 'fresh');
  assert.ok(data.detail.rows.length > 1);
  // …and one the cache does not know still opens, as a list of one.
  window.document.dispatchEvent(new window.CustomEvent('web-tools:open-branch-detail',
    { detail: { repo: 'me/tools', name: 'just-pushed' } }));
  assert.equal(data.detailRow?.name, 'just-pushed');
  assert.equal(data.detail.rows.length, 1);
  data.closeDetail();
});

// ── The takeover's frame: opened once, then talked to ────────────────────────
//
// Stepping used to swap the iframe's src, which is a whole document load per
// step: the pre-build re-parsed and re-executed, Alpine booted, the DOM walked,
// before the first API call went out, and the reader watched the instant facts
// card through all of it. The frame is now opened once and asked for the next
// branch over postMessage, so what a step costs is what the data costs.

const fakeFrame = () => {
  const sent = [];
  return { sent, el: { contentWindow: { postMessage: (m) => sent.push(m) }, contentDocument: null } };
};

test('the frame address is fixed at open and does not move when the reader steps', () => {
  seed();
  const fr = fakeFrame();
  data.openBranchDetail(data.openBranches[0]);
  const src = data.detailSrc;
  assert.ok(src.includes('#gh=me/tools@feat/a'), 'it opens at the branch that was tapped');
  data.onDetailFrame({ target: fr.el });
  data.detailStep(1);
  assert.equal(data.detailSrc, src, 'stepping did not reload the document');
  assert.notEqual(data.detailUrl, src, 'though the address it WOULD open at moved');
  data.closeDetail();
});

test('a step is a message, and it carries the neighbours to warm', () => {
  seed();
  const fr = fakeFrame();
  data.openBranchDetail(data.openBranches[0]);
  data.onDetailFrame({ target: fr.el });
  assert.equal(fr.sent.length, 0, 'the frame opened at the first branch on its own address');
  data.detailStep(1);
  const m = fr.sent.pop();
  assert.equal(m.type, 'branch-open');
  assert.equal(m.branch, data.detailRow.name);
  assert.equal(m.base, 'main', 'the shell knows the default branch, so the page need not ask');
  assert.deepEqual(plain_(m.warm.map(w => w.branch)), ['feat/a', 'fresh'],
    'both neighbours, so a step either way is already answered');
  data.closeDetail();
});

test('a step taken before the frame has loaded is delivered when it does', () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  data.detailStep(1);                     // no frame yet: the first load is the slow one
  const fr = fakeFrame();
  data.onDetailFrame({ target: fr.el });
  assert.equal(fr.sent.length, 1, 'the queued step went out on load');
  assert.equal(fr.sent[0].branch, data.detailRow.name);
  data.closeDetail();
});

// ── The PR number in the header ──────────────────────────────────────────────
//
// The row carries a PR only when it is OPEN: the activity crawl asks GitHub for
// open pull requests alone, so a branch whose PR merged had nothing to show and
// the header sat blank on exactly the branches whose work is finished. The
// embedded page reads `state=all` at open time and reports what it found.

test('an open PR comes from the row, instantly', () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  assert.equal(data.detailPrNumber, 12);
  assert.equal(data.detailPrState, 'draft');
  data.closeDetail();
});

test('a merged PR comes from the frame, since nothing in the cache has seen it', () => {
  seed();
  const row = data.openBranches.find(r => r.name === 'feat/b');
  data.openBranchDetail(row);
  assert.equal(data.detailPrNumber, 0, 'the row knows of no PR for this branch');
  data.onBranchMessage({ source: 'web-tools', type: 'branch-state', phase: 'ready',
                         repo: row.repo, branch: row.name, pr: 409, prState: 'merged' });
  assert.equal(data.detailPrNumber, 409);
  assert.equal(data.detailPrState, 'merged');
  assert.equal(data.detailReady, true);
  data.closeDetail();
});

test('a report about a branch the reader has left is ignored', () => {
  seed();
  const first = data.openBranches[0];
  data.openBranchDetail(first);
  data.detailStep(1);
  data.onBranchMessage({ source: 'web-tools', type: 'branch-state', phase: 'ready',
                         repo: first.repo, branch: first.name, pr: 999, prState: 'open' });
  assert.equal(data.detailReady, false, 'a late ready must not reveal the page mid-read');
  assert.notEqual(data.detailPrNumber, 999);
  data.closeDetail();
});

test('closing forgets the frame, so the next takeover opens its own', () => {
  seed();
  const fr = fakeFrame();
  data.openBranchDetail(data.openBranches[0]);
  data.onDetailFrame({ target: fr.el });
  data.closeDetail();
  assert.equal(data.detailSrc, '');
  data.openBranchDetail(data.openBranches[1]);
  data.detailStep(-1);
  assert.equal(fr.sent.length, 0, 'the dead frame was not messaged');
  data.closeDetail();
});

// ── The cover, and why it is first-open only ─────────────────────────────────
//
// The takeover raises an instant facts card over the frame and fades the frame
// out. Both exist because a frame reloading a document is genuinely BLANK, and
// a persistent one never is. Left on every step they were a flash, and a
// measurable one: the card is `bg-base-100`, so the dialog interior went from
// its tinted 247 to a flat 255 for about four frames and back, which over a
// dimmed page reads as the whole overlay lightening (measured 2026-08-13 at
// 1280x800, pixels rather than opinion).

test('after the page has rendered once, a step does not cover it again', () => {
  seed();
  const fr = fakeFrame();
  data.openBranchDetail(data.openBranches[0]);
  data.onDetailFrame({ target: fr.el });
  assert.equal(data.detailSeen, false, 'the first open has nothing to show yet, so the card is right');

  const row = data.detailRow;
  data.onBranchMessage({ source: 'web-tools', type: 'branch-state', phase: 'ready',
                         repo: row.repo, branch: row.name, pr: 0, prState: '' });
  assert.equal(data.detailSeen, true);

  data.detailStep(1);
  assert.equal(data.detailReady, false, 'the shell still knows the new branch is loading');
  assert.equal(data.detailSeen, true, 'but it no longer hides the page to say so');

  const next = data.detailRow;
  data.onBranchMessage({ source: 'web-tools', type: 'branch-state', phase: 'loading',
                         repo: next.repo, branch: next.name });
  assert.equal(data.detailSeen, true, 'and a loading report does not re-arm it either');
  data.closeDetail();
});

test('a fresh takeover earns the cover back, since its frame really is empty', () => {
  seed();
  const row = data.openBranches[0];
  data.openBranchDetail(row);
  data.onBranchMessage({ source: 'web-tools', type: 'branch-state', phase: 'ready',
                         repo: row.repo, branch: row.name, pr: 0, prState: '' });
  assert.equal(data.detailSeen, true);
  data.closeDetail();
  assert.equal(data.detailSeen, false);
  data.openBranchDetail(data.openBranches[1]);
  assert.equal(data.detailSeen, false);
  data.closeDetail();
});
