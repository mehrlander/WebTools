// alpineComponents/branch-brief.js — the Files pane's registry grouping: a
// repo declaring data/design/content.csv gets its changed files grouped by
// creation mode (mechanical collapsed behind its header, mounting no cards
// until opened), and a repo without one gets the flat unlabeled list this
// pane always had. Mirrors branch-brief-cards' harness; no network, no
// pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const REPO = 'me/tools';
const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

const compare = {
  status: 'ahead', ahead_by: 2, behind_by: 0,
  commits: [{ sha: 'c1', commit: { author: { date: '2026-08-01T00:00:00Z' }, message: 'one' } }],
  files: [
    { filename: 'lib/a.js', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' },
    { filename: 'docs/b.md', status: 'added', additions: 9, deletions: 0, patch: '@@ -0,0 +1 @@' },
    { filename: 'dist/web-tools.js', status: 'modified', additions: 100, deletions: 90, patch: '@@ -1 +1 @@' },
  ],
};

const CSV = `locator,creation_mode,analysis_use,description
lib/,hybrid-authored,exclude,Library JavaScript
docs/,hybrid-authored,exclude,The docs
dist/,mechanical,exclude,The pre-build
`;

let SERVE_CSV = true;

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="m"
           x-data="branchBrief({ repo: '${REPO}', branch: 'feat/x', base: 'main' })"></div></body></html>`,
});

for (const f of ['lib/kits/branch-survey.js', 'lib/kits/branch-brief.js', 'lib/kits/content-registry.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; }
  async compare() { return compare; }
  async req() { return []; }
  async get(p) {
    if (p === 'data/design/content.csv' && SERVE_CSV) return { text: CSV };
    throw Object.assign(new Error('404'), { status: 404 });
  }
}
window.GH = FakeGH;
window.TOKEN = 'tkn';

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/file-review.js',
                 'lib/alpineComponents/branch-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(6);

const data = Alpine.$data(window.document.getElementById('m'));
const j = (x) => JSON.parse(JSON.stringify(x));

test('with a registry, files group by creation mode and mechanical trails collapsed', () => {
  assert.deepEqual(j(data.fileGroups.map(g => g.mode)), ['hybrid-authored', 'mechanical']);
  const mech = data.fileGroups.find(g => g.mode === 'mechanical');
  assert.equal(mech.collapsed, true);
  assert.equal(mech.note, 'The pre-build');
  assert.equal(data.groupOpen(mech), false);
});

test('a collapsed group mounts no cards until its header is toggled', async () => {
  const cards = () => [...window.document.querySelectorAll('[x-data^="fileReview"]')].length;
  assert.equal(cards(), 2);                 // lib/a.js + docs/b.md; dist/ unmounted
  data.toggleGroup('mechanical');
  await tick(3);
  assert.equal(cards(), 3);
  data.toggleGroup('mechanical');
});

// The registry read is memoized per repo@ref for the swiper's sake (stepping
// eight branches of one repo asked the same question eight times, and on a
// repo declaring none that is eight 404s). No reader can make a ref's registry
// change under them inside the memo's life, so the transition this case needs
// is one only a test can stage: drop the memo, then re-read.
test('without a registry the pane is the flat unlabeled list it always was', async () => {
  SERVE_CSV = false;
  data.forgetRegistry();
  await data.load();
  await tick(3);
  assert.equal(data.registry, null);
  assert.equal(data.fileGroups.length, 1);
  assert.equal(data.fileGroups[0].labeled, false);
  assert.equal(data.fileGroups[0].files.length, 3);
});

test('the GitHub exits are labeled menu rows, and the plus aims the stage at this branch', async () => {
  SERVE_CSV = true;
  data.forgetRegistry();
  await data.load();
  await tick(3);

  // Every exit carries words, which is the whole point of the menu: a row of
  // bare glyphs read as cryptic in the field (2026-08-08).
  const rows = j(data.ghRows);
  assert.ok(rows.every(r => r.label && r.url), 'every row is labeled and addressed');
  const labels = rows.map(r => r.label);
  assert.ok(labels.includes('Browse tree'));
  assert.ok(labels.includes('Compare vs main'));
  assert.ok(labels.includes('New file here'), 'GitHub’s own editor stays reachable for a binary');
  assert.ok(rows.find(r => r.label === 'Browse tree').url.endsWith('/tree/feat/x'));

  // The plus opens the STAGE, aimed: dest = repo@branch:dir, so the stage is
  // pre-scoped and the user supplies only the content.
  const u = new URL(data.stageDepositUrl);
  assert.equal(u.searchParams.get('view'), 'stage');
  assert.equal(u.searchParams.get('dest'), REPO + '@feat/x:dump',
    'no declared inbox means dump/, the convention default');
  assert.ok(u.pathname.endsWith('/show-repo/show-repo.html'));
});

// The unframed counterpart to the layout case in branch-brief-embedded: a page
// is a page and scrolls as one. Pinning its own header would cost a phone the
// URL-bar collapse and buy nothing, since there is no dialog to keep in view.
test('standalone: the document is left alone and nothing is pinned', () => {
  assert.equal(window.document.body.style.overflow, '', 'the page still scrolls as a document');
  assert.equal(window.document.body.style.height, '');
  const root = window.document.querySelector('#m > div');
  assert.ok(!root.className.includes('h-full'), 'the view is as tall as its content');
  assert.ok(!root.lastElementChild.className.includes('overflow-y-auto'), 'and owns no scroller');
});

// ── What the file deck pages through ────────────────────────────────────────
//
// The pane's group toggles ARE the deck's filter, and that is the whole reason
// there is no second control. A collapsed registry group is a reader saying the
// machine's output is not what they came for; quietly paging them through it
// anyway would make the toggle a lie about one surface and not the other.
test('the deck pages what the pane is showing, in the order it shows it', async () => {
  SERVE_CSV = true;
  data.forgetRegistry();
  await data.load();
  await tick(3);

  // mechanical starts collapsed, so dist/ is out and the two authored files
  // are in, ordered as the pane orders them.
  assert.deepEqual(j(data.deckFiles.map(f => f.path)), ['lib/a.js', 'docs/b.md']);

  data.toggleGroup('mechanical');
  await tick(2);
  assert.deepEqual(j(data.deckFiles.map(f => f.path)),
    ['lib/a.js', 'docs/b.md', 'dist/web-tools.js'],
    'opening the group puts its files in reach of the deck too');
  data.toggleGroup('mechanical');
});

test('with every group shut there is nothing to read, and no control offering to', async () => {
  data.toggleGroup('hybrid-authored');      // mechanical is already collapsed
  await tick(2);
  assert.equal(data.deckFiles.length, 0);
  assert.equal(await data.openFileDeck(0), undefined, 'and asking for it does nothing');
  data.toggleGroup('hybrid-authored');
});

test('a card carries the deck action, aimed at its own path', async () => {
  await tick(2);
  const opts = data.cardOpts({ path: 'docs/b.md', status: 'added', additions: 9, deletions: 0 });
  assert.equal(opts.action.label, 'Read from here');
  assert.equal(typeof opts.action.onClick, 'function');
  // The base travels with it. Without it fileReview falls back to 'main', a
  // guess this page never had to make, and the deck would have to repeat the
  // guess to keep the two diffs agreeing.
  assert.equal(opts.base, 'main');
  assert.equal(opts.baseName, 'main');
});
