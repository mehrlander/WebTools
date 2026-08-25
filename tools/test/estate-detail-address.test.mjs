// alpineComponents/estate.js — the branch takeover's own address.
//
// Being inside the swiper is a state, and until 2026-08-07 it was the only
// state in this view with no address: the list had `?view=activity`, the branch
// had its standalone page, and the reader in between could be reached only by
// tapping. It now stamps `&detail=owner/repo@branch`, follows a swipe, and
// clears on close, which is what makes Back leave the takeover rather than the
// whole view.
//
// The one case worth pinning beyond the round trip is a link to a branch the
// current list does not hold (a filter hides it, or it landed since the link
// was minted). That link still has to open something, because a link that
// silently resolves to nothing is worse than one with nowhere to swipe.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick, deckGeometry } from './bootstrap.mjs';

class FakeGH {
  constructor(c = {}) { this.repo = c.repo || ''; }
  async get() { throw Object.assign(new Error('404'), { status: 404 }); }
  async req() { return []; }
  async compare() { return { ahead_by: 0, behind_by: 0, commits: [], files: [] }; }
}

const SESS = 'https://claude.ai/code/session_01FEAT';

const { window, problems } = makeWindow({
  html: '<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>',
});
window.GH = FakeGH;
deckGeometry(window);   // the takeover is a swipe-deck; give jsdom a track to scroll
// mountDeck pulls the branch view's kit chain through gh.load on first use.
// The kits themselves are loaded below by startAlpine, so the loader only has
// to exist and resolve; without it the whole mount is caught and abandoned.
window.gh = { load: async () => {} };
window.TOKEN = '';

// What the shell offers the estate: a sink for the spec. The real one stamps
// the URL; here it records, which is the contract the component depends on.
const stamped = [];
window.__shell = {
  REGISTRY_REPO: 'me/private',
  hasToken: () => false,
  setDetail: (spec) => stamped.push(spec),
};

// branch-status.js first: the takeover's header reads lifespanTitle from it,
// unguarded, the way the shell's own load chain guarantees it.
const Alpine = await startAlpine(window, [
  'lib/kits/branch-status.js',
  // The takeover is a swipe-deck now, so the kit has to be present or
  // mountDeck falls back to gh.load, which is not wired in a unit harness.
  'lib/kits/swipe-deck.js',
  'lib/kits/repo-config-cache.js', 'lib/kits/repo-activity-cache.js', 'lib/kits/repo-sessions-cache.js',
  'lib/alpineComponents/estate.js',
]);
// A slide mounts the real branch view, which is a network-reading component
// covered in its own suites. Here the deck's bookkeeping is the subject, so a
// slide is a name on a div.
Alpine.data('branchBrief', (opts) => ({ opts, init(){ this.$el.textContent = opts.branch; } }));
const data = Alpine.$data(window.document.getElementById('es'));
await tick(10);

// The list comes from the activity cache, not from a stub over the getter:
// `openRows` is a derived chain (openBranches over `activity`), and overriding
// it on the Alpine proxy silently does not take, which is how the first cut of
// this file asserted against a list of one and read it as a stepping bug.
data.activity = {
  'me/tools': {
    defaultBranch: 'main',
    // A PR per branch: the default scope is what is IN FLIGHT, and a bare
    // scanned branch does not qualify (inScope), so a fixture without these
    // yields an empty list and every assertion below reads as a stepping bug.
    openPRs: ['a', 'b', 'c'].map((n, i) => ({
      number: 300 + i, head: 'claude/feat-' + n, draft: true, title: 'work on ' + n,
      updatedAt: '2026-08-06T00:00:00Z', aheadBy: 2, behindBy: 0,
      firstDate: '2026-08-04T00:00:00Z', sessions: [SESS], sessionsExact: true,
    })),
    scan: { branches: ['a', 'b', 'c'].map(n => ({
      name: 'claude/feat-' + n, sha: n, group: 'active',
      date: '2026-08-06T00:00:00Z', firstDate: '2026-08-04T00:00:00Z',
      subject: 'work on ' + n, aheadBy: 2, behindBy: 0,
    })) },
  },
};
await tick(4);
const ROWS = [...data.openRows];


test('opening stamps the branch, stepping follows it, closing clears it', async () => {
  stamped.length = 0;
  assert.equal(ROWS.length, 3, 'the fixture really produced three rows');

  data.openBranchDetail(ROWS[1]);
  await tick(6);
  assert.equal(stamped.at(-1), 'me/tools@claude/feat-b');

  // The deck owns the position now; the shell follows it. Driving the deck is
  // therefore the honest way to step, and what the swipe ends up calling.
  // The deck owns the position and the shell follows it; onDeckSlide is that
  // following, and it is what the deck's own listener calls. The scroll that
  // triggers it is the browser's, and is proven in tools/render/scenarios.
  data.onDeckSlide(2);
  assert.equal(stamped.at(-1), 'me/tools@claude/feat-c', 'the address follows the swipe');

  data.closeDetail();
  await tick(8);
  assert.equal(stamped.at(-1), '', 'and empties on close, so Back leaves the takeover');
});

test('a link into the swiper opens it, and lands on the branch it names', () => {
  data.closeDetail();
  data._detailFromUrl = false;
  window.history.replaceState(null, '', '/?view=activity&detail=me/tools@claude/feat-c');

  data.openDetailFromUrl();
  assert.equal(data.detail.rows.length, 3, 'the whole list is the sequence');
  assert.equal(data.detail.i, 2);
  assert.equal(data.detailRow.name, 'claude/feat-c');
});

test('a branch the list no longer holds still opens, as a list of one', () => {
  data.closeDetail();
  data._detailFromUrl = false;
  window.history.replaceState(null, '', '/?view=activity&detail=me/tools@claude/long-merged');

  data.openDetailFromUrl();
  assert.equal(data.detail.rows.length, 1, 'nowhere to swipe, but somewhere to land');
  assert.equal(data.detailRow.name, 'claude/long-merged');
});

// ── a link is not a claim about the current filter ──────────────────────────
// The row lookup used to run over `openRows`, the list as the reader has it
// filtered. The app's default scope is Recent inside a ONE-DAY window, so an
// open PR from last month misses it and the takeover fell back to a bare
// {repo, name}: no default branch, so the slide's compare asked for
// `compare/...branch` and 404'd, and no sessions, so the Claude mark had
// nothing to render though the cached PR row was holding one. Measured on
// web-tools #293, whose session link was in the cache the whole time.

// The keyed globals the mounted slides are holding. The deck hands a slide
// its options through one of these rather than through the x-data
// expression, so this is where a test reads what a slide was given.
const slideKeys = () => [...window.document.querySelectorAll('[x-data]')]
  .map(el => /^branchBrief\(window\.(\w+)\)$/.exec(el.getAttribute('x-data') || ''))
  .filter(Boolean).map(m => m[1]);

// The options of a slide mounted since `before`. Waiting on the MOUNT rather
// than on a count of turns is the honest wait: mountDeck awaits a six-link
// kit chain before it renders anything, and a fixed count that suffices on an
// idle machine does not under a parallel suite run, which this file produced
// once before the poll went in. Keying on a NEW slide also refuses a stale
// element left by an earlier test, which a "newest mount" read would take.
const freshSlide = async (before, limit = 400) => {
  for (let i = 0; i < limit; i++) {
    const k = slideKeys().find(x => !before.includes(x));
    if (k && window[k]) return window[k];
    await tick(1);
  }
  return null;
};

test('a link opens a branch the window hides, and it arrives carrying its row', async () => {
  data.closeDetail();
  data._detailFromUrl = false;
  window.__shell.branchWindow = 1;                // the shell's own default
  try {
    assert.equal(data.openRows.length, 0, 'the fixture really is outside the window');
    const before = slideKeys();
    window.history.replaceState(null, '', '/?view=activity&detail=me/tools@claude/feat-b');
    data.openDetailFromUrl();
    assert.equal(data.detailRow.name, 'claude/feat-b');
    assert.equal(data.detailRow.def, 'main', 'the cached row, not a name pulled out of the address');
    assert.deepEqual(data.detailRow.sessions, [SESS], 'so the session comes with it');
    const opts = await freshSlide(before);
    assert.ok(opts, 'the slide mounted');
    assert.equal(opts.base, 'main', 'and the slide has something to compare against');
    assert.deepEqual(opts.facts.sessions, [SESS]);
    assert.equal(opts.facts.sessionsExact, true,
      'the crawl read them off its own compare, so the slide is told they are exact');
  } finally { window.__shell.branchWindow = 0; }
});

test('a branch no row exists for still gets a base', async () => {
  // The other half: nothing in the cache carries this branch, so the bare
  // fallback is right. It still may not be handed an empty base.
  data.closeDetail();
  data._detailFromUrl = false;
  const before = slideKeys();
  window.history.replaceState(null, '', '/?view=activity&detail=me/tools@claude/never-crawled');
  data.openDetailFromUrl();
  assert.equal(data.detailRow.name, 'claude/never-crawled');
  const opts = await freshSlide(before);
  assert.ok(opts, 'the slide mounted');
  assert.equal(opts.base, 'main', "the repo's default branch, off the same cache");
});

test('the address survives a slashed branch name and refuses a malformed one', () => {
  data.closeDetail();
  data._detailFromUrl = false;
  window.history.replaceState(null, '', '/?view=activity&detail=not-a-spec');
  data.openDetailFromUrl();
  assert.equal(data.detail, null, 'a spec with no repo@branch opens nothing');

  data._detailFromUrl = false;
  window.history.replaceState(null, '', '/?view=activity&detail=me/tools@claude/a/b/c');
  data.openDetailFromUrl();
  assert.equal(data.detailRow.name, 'claude/a/b/c', 'slashes belong to the branch, not the split');
});

test('the copyable link names the view and the branch', () => {
  data.closeDetail();
  data.openBranchDetail(ROWS[0]);
  const url = data.detailLink();
  assert.match(url, /view=activity/);
  assert.match(url, /detail=me%2Ftools%40claude%2Ffeat-a/);
});

test('a deep link opens even when the branch list could not be read at all', async () => {
  // The registry is unreachable here (FakeGH throws on get), which is the state
  // a viewer hits on a rate limit or a bad token. The link still has to land.
  data.closeDetail();
  data._detailFromUrl = false;
  window.history.replaceState(null, '', '/?view=activity&detail=me/tools@claude/feat-b');
  await data.loadActivity(new FakeGH({ repo: 'me/private' }));
  await tick(4);
  assert.ok(data.detail, 'the takeover opened');
  assert.equal(data.detailRow.name, 'claude/feat-b');
});

test('mounting is quiet', () => {
  assert.deepEqual(problems, []);
});
