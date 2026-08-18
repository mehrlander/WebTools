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
import { makeWindow, startAlpine, deckGeometry } from './bootstrap.mjs';

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

deckGeometry(window);   // the takeover is a swipe-deck now; jsdom needs a track to scroll
// mountDeck pulls the branch view's kit chain through gh.load on first use.
// The kits themselves are loaded below by startAlpine, so the loader only has
// to exist and resolve; without it the whole mount is caught and abandoned.
window.gh = { load: async () => {} };

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/branch-survey.js',      // the lifespan display rules live here, shared
  'lib/kits/swipe-deck.js',         // the takeover IS one
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
// A slide mounts the real branch view, which reads the network and has its own
// suites. Here the deck's bookkeeping is the subject, so a slide is a name.
Alpine.data('branchBrief', (opts) => ({ opts, init(){ this.$el.textContent = opts.branch; } }));
const data = Alpine.$data(window.document.getElementById('es'));
const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

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
  assert.deepEqual(keys, ['tree', 'compare', 'commits', 'dropFile', 'prFiles', 'prChecks', 'copyName']);
  assert.equal(data.branchMenuItems.find(i => i.key === 'prFiles').label, 'Files changed (#12)');
  assert.equal(data.branchMenuItems.find(i => i.key === 'compare').label, 'Compare to main');

  data.menuBranch = noPr;
  keys = plain_(data.branchMenuItems.map(i => i.key));
  assert.deepEqual(keys, ['tree', 'compare', 'commits', 'dropFile', 'newPr', 'copyName']);
  assert.ok(!keys.includes('prFiles'));
});

// The menu is GitHub DESTINATIONS. Staging sends files to this app's own Stage,
// so it left on 2026-08-18 for a control on the row's action line; `copyName` is
// the one row that stays without opening github.com, because a branch name is
// the ADDRESS of what every other row opens and there is no address bar here to
// lift it from. A new row that is neither belongs somewhere else.
test('the GitHub menu holds GitHub destinations, and one documented exception', () => {
  for (const row of [data.openBranches[0], data.openBranches[1]]) {
    data.menuBranch = row;
    for (const item of plain_(data.branchMenuItems)) {
      if (item.key === 'copyName') continue;
      assert.equal(item.external, true,
        item.key + ' is in the GitHub menu but does not leave for github.com');
    }
  }
});

test('staging is a row control, not a menu row', () => {
  data.menuBranch = data.openBranches[0];
  assert.ok(!plain_(data.branchMenuItems.map(i => i.key)).includes('stageDiff'));
  // And the key is gone from the RUNNER too, rather than left as a branch that
  // nothing dispatches: the row's button calls stageBranchDiff directly.
  const calls = [];
  const real = data.stageBranchDiff;
  data.stageBranchDiff = (...a) => { calls.push(a); };
  try {
    data.runBranchMenu('stageDiff');
    assert.deepEqual(calls, [], 'a retired key must not still stage');
  } finally { data.stageBranchDiff = real; }
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

// ── The branch deck ─────────────────────────────────────────────────────
// Tapping a branch name opens the list as a swipe-deck, one slide per row.
// What the shell still owns is the sequence, the position, and the header;
// the gesture is the platform's now, and 540 lines of hand-rolled drag and
// iframe plumbing went with the change.

const deckOf = () => data._deck;

test('tapping a row takes over: the frozen list is the deck, opened at the row', async () => {
  seed();
  const row = data.openBranches[1];
  data.openBranchDetail(row);
  await tick(4);
  assert.equal(data.detail.i, 1);
  assert.equal(data.detail.rows.length, 3, 'the list as tapped is the sequence');
  assert.equal(data.detailRow.name, row.name);
  assert.ok(deckOf(), 'and it is a deck, not markup');
  assert.equal(deckOf().deck.count, 3, 'one slide per row');
  data.closeDetail();
  await tick(4);
});

test('the header names the branch, its repo and an open PR', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);      // feat/a, PR #12 draft
  await tick(4);
  const el = deckOf().el;
  // The last segment, the way the file deck titles a file by its filename: a
  // header at phone width has room for one of the two, and the slug is the
  // half that distinguishes. The full name is on the slide's own line.
  assert.equal(el.querySelector('h1').textContent, 'a', 'the distinguishing segment is the title');
  assert.match(el.querySelector('h1 + p').textContent, /tools/);
  assert.match(el.querySelector('h1 + p').textContent, /#12/);
  const link = el.querySelector('a[href*="/pull/12"]');
  assert.ok(link, 'the PR is the header exit');
  data.closeDetail();
  await tick(4);
});

test('a merged PR reaches the header from the slide, since the cache never saw it', async () => {
  seed();
  const row = data.openBranches.find(r => r.name === 'feat/b');   // no PR in openPRs
  data.openBranchDetail(row);
  await tick(4);
  assert.equal(data.detailPrNumber, 0, 'the crawl asks for open pull requests only');
  assert.ok(!deckOf().el.querySelector('a[href*="/pull/"]'), 'so the header has no exit yet');

  data.onSlideMeta(data.detail.i,
    { repo: row.repo, branch: row.name, pr: 409, prState: 'merged' });
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /#409/);
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /merged/);
  assert.ok(deckOf().el.querySelector('a[href*="/pull/409"]'));
  data.closeDetail();
  await tick(4);
});

test('a slide that settles while the reader is elsewhere is ignored', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  const before = deckOf().el.querySelector('h1 + p').textContent;
  data.onSlideMeta(2, { repo: 'me/tools', branch: 'feat/b', pr: 999, prState: 'merged' });
  assert.equal(deckOf().el.querySelector('h1 + p').textContent, before,
    'a neighbour finishing its read does not rewrite the header of the slide in view');
  data.closeDetail();
  await tick(4);
});

test('the header follows the reader from slide to slide', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  data.onDeckSlide(2);                              // me/home/fresh, PR #7
  assert.equal(deckOf().el.querySelector('h1').textContent, 'fresh',
    'a branch with no slash is its own last segment');
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /home/);
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /#7/);
  data.closeDetail();
  await tick(4);
});

test('opening while one is open replaces it rather than stacking a second', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  const first = data._deck;
  data.openBranchDetail(data.openBranches[1]);
  await tick(6);
  assert.notEqual(data._deck, first, 'a new deck');
  assert.equal(window.swipeDeck.stack.length, 1,
    'and only one: two branch decks is the same level twice, not a level down');
  assert.equal(data.detailRow.name, 'feat/b');
  data.closeDetail();
  await tick(6);
});

test('closing clears the shell at once, whatever the deck does next', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  data.closeDetail();
  assert.equal(data.detail, null, 'synchronously, so a caller can open something else');
  assert.equal(data._deck, null);
  await tick(6);
});
