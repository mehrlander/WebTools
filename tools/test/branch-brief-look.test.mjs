// alpineComponents/branch-brief.js — the Look row above the tabs: which of the
// app's own views this branch changes, each one addressed AT the branch.
//
// The join is not this file's and is not re-decided here: kits/route-activity.js
// owns it, tools/test/app-routes.test.mjs holds it, and the estate's Open list
// has painted its answer on branch rows since the Routes pane shipped. What is
// held here is what the branch page adds to it: the ref on the link, the pages
// that render themselves, the deferral stated rather than hidden, and the one
// caveat (?use= fetches the pre-build) that turns a working link into a lying
// one. No network, no pixels; mirrors branch-brief-groups' harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const HUB = 'mehrlander/web-tools';
const TIP = '0123456789abcdef0123456789abcdef01234567';
const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

// stage.js is declared by one route, so it is narrow: a branch touching it is
// ON Stage. estate.js is declared by nine, so it is wide: a branch touching
// only that is NEAR them. Both cases in one changeset, plus a page that renders
// itself and a lib change with no rebuilt bundle.
const compare = {
  status: 'ahead', ahead_by: 1, behind_by: 0,
  commits: [{ sha: TIP, commit: { author: { date: '2026-08-22T00:00:00Z' }, message: 'work' } }],
  total_commits: 1,
  files: [
    { filename: 'lib/alpineComponents/stage.js', status: 'modified', additions: 9, deletions: 2, patch: '@@' },
    { filename: 'lib/alpineComponents/estate.js', status: 'modified', additions: 3, deletions: 1, patch: '@@' },
    { filename: 'pages/branch.html', status: 'modified', additions: 4, deletions: 0, patch: '@@' },
    { filename: 'pages/gone.html', status: 'removed', additions: 0, deletions: 40, patch: '@@' },
  ],
};

const routesCsv = readFileSync(path.join(repoRoot, 'docs/app-routes.csv'), 'utf8');
const vocabCsv = readFileSync(path.join(repoRoot, 'docs/vocabularies.csv'), 'utf8');

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="m"
           x-data="branchBrief({ repo: '${HUB}', branch: 'claude/x', base: 'main' })"></div></body></html>`,
});

for (const f of ['lib/kits/csv.js', 'lib/kits/branch-status.js', 'lib/kits/branch-brief.js',
                 'lib/kits/content-registry.js', 'lib/kits/route-activity.js',
                 'lib/kits/guide-render.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; }
  async compare(base, head) {
    // One branch in this harness rebuilt the pre-build, which is what lets the
    // stale-bundle warning be tested in both directions off one fixture.
    return /rebuilt/.test(String(head) + String(base) + String(this.ref))
      ? { ...compare, files: [...compare.files,
          { filename: 'dist/web-tools.js', status: 'modified',
            additions: 200, deletions: 180, patch: '@@ -1 +1 @@' }] }
      : compare;
  }
  // Only the deferred branch has a PR, and that is what stages the deferral:
  // a branch with no pull request lands on Files, which asks for the compare on
  // arrival, so the wait this row has to survive only exists behind a guide.
  // An empty body keeps the markdown renderer out of jsdom.
  async req(p) {
    return /claude(%2F|\/)y/.test(p)
      ? [{ number: 9, title: 'deferred', draft: true, state: 'open', body: '' }] : [];
  }
  async get(p) {
    if (p === 'docs/app-routes.csv') return { text: routesCsv };
    if (p === 'docs/vocabularies.csv') return { text: vocabCsv };
    throw Object.assign(new Error('404'), { status: 404 });   // no content registry
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
await tick(8);

const data = Alpine.$data(window.document.getElementById('m'));
const j = (x) => JSON.parse(JSON.stringify(x));

test('the manifest is read at the BRANCH ref, so a branch that adds a route shows it', () => {
  assert.ok(data.routeManifest, 'the hub repo gets a manifest');
  assert.ok(data.routeManifest.routes.length > 15);
});

test('a narrow carrier puts the branch ON its route; a wide one only NEAR', () => {
  const chips = j(data.routeChips);
  assert.deepEqual(chips.on.map(c => c.key), ['stage']);
  // estate.js carries nine routes, so it dates none of them and opens none.
  assert.ok(chips.nearCount > 3, 'the wide file brushes every route it is declared by');
  assert.equal(chips.nearTitle.includes('Stage'), false, 'a route is on one side only');
  assert.ok(chips.nearTitle.includes('lib/alpineComponents/estate.js'),
            'the count names the file that caused it');
});

// The near set is a count rather than chips, and the reason is a measurement:
// rendered as labels, one wide file put two lines of ghosted routes above the
// one line that answers the question, at 430px. It is also not a link, since
// every route in it is one the rule says the branch cannot be claimed to
// change.
test('the shared routes collapse to one slot that opens nothing', () => {
  const chips = j(data.routeChips);
  assert.equal('near' in chips, false, 'no per-route rows for the shared set');
  assert.equal(typeof chips.nearCount, 'number');
  assert.ok(chips.nearTitle.includes('cannot be said to change'));
});

// The whole point. The Open list's chips walk the page you are already on to
// that view, which is main; here the chip is an address and the address names
// the branch's tip.
test('the chip opens the deployed app running THIS branch', () => {
  const stage = data.routeChips.on[0];
  assert.equal(stage.url, 'https://mehrlander.github.io/web-tools/app/?use=' + TIP + '&view=stage');
});

test('the tip is a SHA where one is known, never a branch name to encode', () => {
  assert.equal(data.tipRef, TIP);
  assert.ok(data.routeChips.on.every(c => c.url.includes('?use=' + TIP)));
});

test('a chip says which files it stands on, and which are shared', () => {
  const stage = data.routeChips.on[0];
  assert.ok(stage.title.includes('lib/alpineComponents/stage.js'));
  assert.ok(data.routeChips.nearTitle.includes('several routes share'),
            'the shared count says why it is not offered as a link');
});

test('a changed page gets its own render link, and a deleted one gets none', () => {
  const pages = j(data.pageChips);
  assert.deepEqual(pages.map(p => p.label), ['branch.html']);
  assert.ok(pages[0].url.includes('#gh=' + HUB + '@' + TIP + ':pages/branch.html'),
            'routed through the same table every other render link uses');
});

// ?use= fetches dist/web-tools.js, so this is the difference between a link
// that shows the branch and one that resolves, renders, and shows main.
test('a lib change with no rebuilt bundle is called out on the row', () => {
  assert.equal(data.bundleStale, true);
});

// The other half of that, and the half worth pinning: the warning has to GO
// when the branch did rebuild, or it is noise on every honest branch and a
// reader learns to look past it on the one branch where it is true.
test('a branch that rebuilt the pre-build carries no warning', async () => {
  const el = window.document.createElement('div');
  el.setAttribute('x-data', `branchBrief({ repo: '${HUB}', branch: 'claude/rebuilt', base: 'main' })`);
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(8);
  const d = Alpine.$data(el);
  assert.ok(d.brief.files.some(f => f.path === 'dist/web-tools.js'), 'the fixture rebuilt');
  assert.ok(d.brief.files.some(f => f.path.startsWith('lib/')), 'and it changed lib');
  assert.equal(d.bundleStale, false);
  assert.deepEqual(j(d.routeChips).on.map(c => c.key), ['stage'], 'the chips are unaffected');
});

test('the row has something to occupy its line with', () => {
  assert.equal(data.hasLook, true);
});

// Three ways to have no chips, and they are different facts. The deferral is
// the one that must not read as "this branch changes no view": in show-repo the
// compare waits for a tap, so the row asks for it rather than rendering empty.
test('a deferred compare keeps the row, as the ask for the read it needs', async () => {
  const el = window.document.createElement('div');
  el.setAttribute('x-data', `branchBrief({ repo: '${HUB}', branch: 'claude/y', base: 'main',
                                           facts: { ahead: 2, behind: 0 }, sha: '${TIP}' })`);
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(8);
  const d = Alpine.$data(el);
  assert.equal(d.pane, 'guide', 'a branch with a PR lands on the guide, which needs no compare');
  assert.equal(d.brief.pending, true, 'a lent ahead count defers the compare');
  assert.equal(d.routeChips, null, 'nothing is claimed before the diff is read');
  assert.equal(d.hasLook, true, 'and the row still holds its place');
  await d.ensureCompare();
  await tick(3);
  assert.deepEqual(j(d.routeChips).on.map(c => c.key), ['stage'], 'the tap fills it in');
});

test('a repo that declares no routes is answered without a request', async () => {
  let asked = 0;
  class Counting extends FakeGH {
    async get(p) { if (p.startsWith('docs/app-')) asked++; return super.get(p); }
  }
  window.GH = Counting;
  const el = window.document.createElement('div');
  el.setAttribute('x-data', `branchBrief({ repo: 'me/other', branch: 'claude/z', base: 'main' })`);
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(8);
  const d = Alpine.$data(el);
  assert.equal(d.routeManifest, null);
  assert.equal(d.routeChips, null);
  assert.equal(asked, 0, 'routes are one page in one repo; nobody else is asked for the CSV');
  window.GH = FakeGH;
});
