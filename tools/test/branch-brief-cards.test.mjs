// alpineComponents/branch-brief.js — the per-file cards it mounts.
//
// One thing under test, and it is a trap rather than a feature: an x-data
// expression is the ONE place Alpine injects every registered component name
// into the evaluation scope, so inside `x-data="fileReview(cardOpts(f))"` a
// bare `this.repo` resolves to the `repo` DATA PROVIDER, not to the branch
// component's own repo string. Each card was handed Alpine's provider wrapper
// as its repo, every content fetch addressed /repos/(...i)=>n.bind(e)(...i)/…,
// and the cards lost their Diff, New, and Base tabs with nothing said.
//
// It only reproduces with the full library registered, which is how
// pages/branch.html boots (dist/web-tools.js) and is why the unit tests missed
// it: registering `repo` alongside is the whole fixture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot } from './bootstrap.mjs';

const REPO = 'acme/widgets';

const compare = {
  ahead_by: 2, behind_by: 0, total_commits: 2,
  commits: [
    { sha: 'aaa1111', commit: { message: 'first', committer: { date: '2026-07-20T00:00:00Z' } } },
    { sha: 'bbb2222', commit: { message: 'second', committer: { date: '2026-07-24T00:00:00Z' } } },
  ],
  files: [
    { filename: 'lib/a.js', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@' },
    { filename: 'docs/b.md', status: 'added', additions: 9, deletions: 0, patch: '@@ -0,0 +1 @@' },
  ],
};

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body><div id="m"
           x-data="branchBrief({ repo: '${REPO}', branch: 'feat/x', base: 'main' })"></div></body></html>`,
});

// The kit the view reads (window.BranchBrief), loaded the way the page's
// gh.load chain arranges it.
for (const f of ['lib/kits/branch-survey.js', 'lib/kits/branch-brief.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}

const fetched = [];
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; }
  async compare() { return compare; }
  async req() { return []; }
  async get(p) { fetched.push(this.repo + '@' + this.ref + ':' + p); return { text: 'x' }; }
}
window.GH = FakeGH;
window.TOKEN = 'tkn';

// Mirror startAlpine, plus the collapse plugin the cards' x-collapse needs
// (branch.html gets it from alpine-bundle's CDN pair), the way
// pages.test.mjs does it.
//
// repo.js is the collision: registering it is what makes `repo` a data
// provider. file-review.js is the card the branch view mounts.
const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/repo.js',
                 'lib/alpineComponents/file-review.js', 'lib/alpineComponents/branch-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(6);

const cards = () => [...window.document.querySelectorAll('[x-data^="fileReview"]')];

test('the branch renders its changed-file cards', () => {
  assert.equal(cards().length, compare.files.length);
});

test('each card gets the repo as a string, not the repo data provider', () => {
  for (const el of cards()) {
    const d = Alpine.$data(el);
    assert.equal(typeof d.repo, 'string', 'card repo is a string');
    assert.equal(d.repo, REPO);
  }
});

test('the ref pair reaches the cards too', () => {
  const d = Alpine.$data(cards()[0]);
  assert.equal(d.ref, 'feat/x');
  assert.equal(d.baseName, 'main');
});

test('the cards mount without fetching, since the compare handed them their patches', () => {
  // The PANE makes exactly one read at mount, the content-registry probe
  // (data/design/content.csv, for the Files pane's grouping); the CARDS make
  // none, a card holding its patch having nothing to fetch until a tab needs
  // the bytes.
  assert.deepEqual(fetched.filter(f => !f.endsWith(':data/design/content.csv')), [],
    'no card fetched at mount');
  assert.equal(fetched.length, 1, 'one pane-level fetch: the registry probe');
});

test('a card addresses the real repo when it does fetch', async () => {
  // The trap this file exists for: `this.repo` inside an x-data expression can
  // resolve to the `repo` DATA PROVIDER, and every contents call then addresses
  // a function. The fetch is now deliberate rather than automatic, so provoke
  // it the way a reader would, by asking for the diff.
  Alpine.$data(cards()[0]).setTab('diff');
  await tick(4);
  assert.ok(fetched.length, 'choosing Diff fetches both sides');
  for (const spec of fetched) assert.ok(spec.startsWith(REPO + '@'), spec);
});

test('mounting the branch view is quiet', () => {
  assert.deepEqual(problems, []);
});
