// alpineComponents/file-review.js — the per-file row and what opening it costs.
//
// The subject here is the fetch discipline, because it is invisible when wrong.
// The compare API returns each file's patch WITH the file list, so a card
// mounted from a compare is already holding the unified diff; it used to fetch
// both sides anyway on open, which on a twelve-file branch is twenty-four
// contents calls to show what twelve cards already had, behind a spinner. The
// assertions below pin when a fetch may happen and when it may not.
//
// The collapsed row's own formatting is here too, for one reason: `dirPart`
// shipped for ten minutes as a CSS `direction: rtl` truncation, which handed
// the string to the bidi algorithm and rendered `.claude/skills/caption/` as
// `/claude/skills/caption.`, a path that does not exist, displayed as though it
// did. That is a wrong answer rather than an ugly one, so it gets a test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="withPatch" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'lib/deep/nested/thing.js', status: 'modified', additions: 3, deletions: 1,
         patch: '@@ -1 +1 @@', open: true })"></div>
    <div id="noPatch" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'lib/b.js', status: 'modified', open: true })"></div>
  </body></html>`,
});

const fetched = [];
window.GH = class {
  constructor(c = {}) { this.repo = c.repo || ''; this.ref = c.ref || ''; }
  async get(p) { fetched.push(this.ref + ':' + p); return { text: 'x' }; }
  async req() { return []; }
};
window.TOKEN = 't';

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/kits/guide-render.js', 'lib/alpineComponents/file-review.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, p), 'utf8'))(window);
}
Alpine.start();
await tick(6);

const data = (id) => Alpine.$data(window.document.getElementById(id));

// ── what opening costs ──────────────────────────────────────────────────────

test('a card that was handed a patch opens on it and fetches nothing', async () => {
  const d = data('withPatch');
  await tick(3);
  assert.equal(d.tab, 'patch');
  assert.equal(fetched.filter(f => f.endsWith('thing.js')).length, 0,
    'the patch was already in memory; the spinner and the two calls were pure waste');
});

test('a card with no patch still loads, since it has nothing else to show', async () => {
  await tick(3);
  assert.ok(fetched.some(f => f.endsWith('lib/b.js')), 'no patch means the bytes are the only content');
});

test('choosing a tab that needs the bytes is what triggers the fetch', async () => {
  const d = data('withPatch');
  const before = fetched.length;
  d.setTab('patch');
  assert.equal(fetched.length, before, 'Patch never needs a fetch');
  d.setTab('diff');
  await tick(4);
  assert.ok(fetched.length > before, 'Diff does');
});

test('a tab the reader chose survives the load it triggered', async () => {
  const d = data('withPatch');
  d.loaded = false; d.newText = null; d.baseText = null; d._picked = false;
  d.setTab('new');
  await tick(4);
  assert.equal(d.tab, 'new',
    'the load used to snap the card to Diff, overriding the one control that says what to show');
});

// ── the collapsed row ───────────────────────────────────────────────────────

test('the path splits, and a long directory elides from the left', () => {
  const d = data('withPatch');
  assert.equal(d.namePart, 'thing.js');
  assert.equal(d.dirPart, 'lib/deep/nested/');
  d.path = '.claude/skills/caption/deeper/and/deeper/still/SKILL.md';
  assert.ok(d.dirPart.startsWith('…'), 'elided');
  assert.ok(d.dirPart.endsWith('/'), 'and still a directory');
  assert.ok(d.dirPart.length <= 30);
  // The bidi bug this replaced: the leading dot must never end up at the end.
  assert.ok(!d.dirPart.endsWith('.'), 'no reordered punctuation');
  d.path = 'README.md';
  assert.equal(d.dirPart, '', 'a root file has no directory half');
});

test('the size bar is proportional, and never empty on a real change', () => {
  const d = data('withPatch');
  // Spread back into this realm: the getter builds its array in the jsdom
  // window, and deepEqual compares prototypes.
  const shades = () => [...d.sizeBar].map(c => c.cls.replace('bg-', ''));
  d.additions = 100; d.deletions = 0;
  assert.deepEqual(shades(), ['success', 'success', 'success', 'success', 'success']);
  d.additions = 0; d.deletions = 100;
  assert.deepEqual(shades(), ['error', 'error', 'error', 'error', 'error']);
  // A one-line deletion beside a large addition still shows: rounding to zero
  // would say "nothing was removed" on a row that removed something.
  d.additions = 200; d.deletions = 1;
  assert.ok(shades().includes('error'));
  d.additions = 0; d.deletions = 0;
  assert.deepEqual(shades(), ['base-300', 'base-300', 'base-300', 'base-300', 'base-300']);
});

test('the row carries one action, routed by file type through the guide table', () => {
  const d = data('withPatch');
  d.path = 'pages/thing.html'; d.repo = 'mehrlander/web-tools';
  assert.equal(d.quickView.kind, 'render', 'a page opens rendered');
  d.path = 'docs/thing.md';
  assert.equal(d.quickView.kind, 'read', 'a doc opens read');
  d.path = 'lib/thing.js';
  assert.match(d.quickView.url, /^https:\/\/github\.com\//, 'anything else opens its source');
  d.status = 'removed';
  assert.equal(d.quickView, null, 'a deleted file has nothing to open at the new ref');
});

test('mounting the cards is quiet', () => {
  assert.deepEqual(problems, []);
});
