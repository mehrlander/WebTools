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
import { makeWindow, repoRoot } from './bootstrap.mjs';

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

test('without a registry the pane is the flat unlabeled list it always was', async () => {
  SERVE_CSV = false;
  await data.load();
  await tick(3);
  assert.equal(data.registry, null);
  assert.equal(data.fileGroups.length, 1);
  assert.equal(data.fileGroups[0].labeled, false);
  assert.equal(data.fileGroups[0].files.length, 3);
});
