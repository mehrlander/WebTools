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
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

class FakeGH {
  constructor(c = {}) { this.repo = c.repo || ''; }
  async get() { throw Object.assign(new Error('404'), { status: 404 }); }
  async req() { return []; }
  async compare() { return { ahead_by: 0, behind_by: 0, commits: [], files: [] }; }
}

const { window, problems } = makeWindow({
  html: '<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>',
});
window.GH = FakeGH;
window.TOKEN = '';

// What the shell offers the estate: a sink for the spec. The real one stamps
// the URL; here it records, which is the contract the component depends on.
const stamped = [];
window.__shell = {
  REGISTRY_REPO: 'me/private',
  hasToken: () => false,
  setDetail: (spec) => stamped.push(spec),
};

// branch-survey.js first: the takeover's header reads lifespanTitle from it,
// unguarded, the way the shell's own load chain guarantees it.
const Alpine = await startAlpine(window, [
  'lib/kits/branch-survey.js',
  'lib/kits/repo-config-cache.js', 'lib/kits/repo-activity-cache.js', 'lib/kits/repo-sessions-cache.js',
  'lib/alpineComponents/estate.js',
]);
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
    // surveyed branch does not qualify (inScope), so a fixture without these
    // yields an empty list and every assertion below reads as a stepping bug.
    openPRs: ['a', 'b', 'c'].map((n, i) => ({
      number: 300 + i, head: 'claude/feat-' + n, draft: true, title: 'work on ' + n,
      updatedAt: '2026-08-06T00:00:00Z', aheadBy: 2, behindBy: 0,
      firstDate: '2026-08-04T00:00:00Z',
    })),
    survey: { branches: ['a', 'b', 'c'].map(n => ({
      name: 'claude/feat-' + n, sha: n, group: 'active',
      date: '2026-08-06T00:00:00Z', firstDate: '2026-08-04T00:00:00Z',
      subject: 'work on ' + n, aheadBy: 2, behindBy: 0,
    })) },
  },
};
await tick(4);
const ROWS = [...data.openRows];

test('opening stamps the branch, stepping follows it, closing clears it', () => {
  stamped.length = 0;
  assert.equal(ROWS.length, 3, 'the fixture really produced three rows');

  data.openBranchDetail(ROWS[1]);
  assert.equal(stamped.at(-1), 'me/tools@claude/feat-b');

  data.detailStep(1);
  assert.equal(stamped.at(-1), 'me/tools@claude/feat-c', 'the address follows the swipe');

  data.closeDetail();
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
