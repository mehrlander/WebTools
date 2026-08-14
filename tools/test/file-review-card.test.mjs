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
//
// The second subject is WHAT a file is shown as, added 2026-08-14. The card had
// four tabs and all four were source, which produced a wrong answer of the same
// kind: a `.gz` printed a notice saying its content could not be shown and then
// printed the content, mojibake and all, because the notice and the New pane
// were gated on different conditions. `kind` and `panes` are the fix and the
// cases below pin the routing, the default landing, and the one thing the card
// must never do again, which is hand a reader the bytes of a binary.

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
    <div id="doc" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'docs/note.md', status: 'modified', patch: '@@ -1 +1 @@' })"></div>
    <div id="docRead" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'docs/note.md', status: 'modified', patch: '@@ -1 +1 @@', read: true })"></div>
    <div id="png" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'pages/thumbs/a.png', status: 'modified', patch: '@@ -1 +1 @@',
         read: true, open: true })"></div>
    <div id="arch" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'data/urls.txt.gz', status: 'modified', read: true })"></div>
    <div id="bare" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'lib/c.js', status: 'modified', patch: '@@ -1 +1 @@', bare: true })"></div>
    <div id="blob" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'data/x.dat', status: 'modified' })"></div>
  </body></html>`,
});

const fetched = [];
window.GH = class {
  constructor(c = {}) { this.repo = c.repo || ''; this.ref = c.ref || ''; }
  async get(p) {
    fetched.push(this.ref + ':' + p);
    // x.dat is the unknown-extension binary: nothing in its name says so, and
    // the NUL in its decode is the only thing that can.
    return { text: /x\.dat$/.test(p) ? 'ab\u0000cd' : 'x', size: 8 };
  }
  async bytes(p) { fetched.push(this.ref + ':bytes:' + p);
                   return { bytes: new Uint8Array([1, 2, 3]), size: 3 }; }
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


// ── what a file is shown as ─────────────────────────────────────────────────

test('kind is read from the name, and each kind has its own pane', () => {
  assert.equal(data('doc').kind, 'markdown');
  assert.equal(data('png').kind, 'image');
  assert.equal(data('arch').kind, 'gzip');
  assert.equal(data('withPatch').kind, '', 'source has no presentation but itself');
  assert.equal(data('doc').shownPane, 'read');
  assert.equal(data('png').shownPane, 'image');
  assert.equal(data('arch').shownPane, 'inside');
  assert.equal(data('withPatch').shownPane, '');
});

// Markdown is the one judgement call, and the SURFACE makes it: a deck exists
// to read a file and passes `read`, a changed-file list exists to review one
// and does not. An image and an archive have no useful diff either way.
test('the surface decides whether a document opens read or diffed', () => {
  assert.equal(data('docRead')._defaultTab(), 'read', 'in the deck, the document is the subject');
  assert.notEqual(data('doc')._defaultTab(), 'read',
    'in a review list the change is, so the same file lands on its diff or its patch');
  assert.equal(data('png')._defaultTab(), 'image');
  assert.equal(data('arch')._defaultTab(), 'inside');
});

test('an image offers no source panes, because there is nothing there to read', () => {
  assert.equal(data('png').panes.map(p => p.label).join('|'), 'Image|Patch');
  assert.equal(data('doc').panes.map(p => p.label).join('|'), 'Read|Diff|Patch|New|Base');
});

test('a reading surface loads a presentation rather than settling on the patch', async () => {
  await tick(4);
  assert.ok(fetched.some(f => f.includes('bytes:pages/thumbs/a.png')),
    'the deck fetched the image on mount; the old card sat on a diff of its bytes');
  assert.equal(data('png').tab, 'image');
  // The list card's own restraint is the first case in this file; it is not
  // re-asserted here, because the tab test above has since driven that card.
  assert.equal(fetched.filter(f => f.includes('bytes:')).length, 1,
    'and only the reading surface paid for bytes');
});

test('a binary keeps its bytes to itself', async () => {
  const d = data('blob');
  d.open = true;
  await d.load();
  assert.equal(d.kind, 'binary');
  assert.equal(d.tab, 'binary');
  assert.equal(d.newText, null,
    'the decode is dropped, so no pane can reach it: this is the exact bug, ' +
    'where a notice said the content could not be shown above the content');
  assert.equal(d.panes.map(p => p.label).join('|'), 'File');
});

test('bare drops the collapsed row, for a host that names the file itself', () => {
  const row = (id) => window.document.getElementById(id)
    .querySelector('[class*="hover:bg-base-200"]');
  assert.ok(row('withPatch'), 'a list card names its own file');
  assert.equal(window.getComputedStyle(row('bare')).display, 'none',
    'a deck slide does not, since the deck header already did');
});


// gh-api.js and this component are two separate jsDelivr cache entries, so
// after a merge the CDN can serve a new component against an old client for as
// long as it takes the two to agree. `gh.bytes is not a function` would take
// out the image and archive panes with nothing on screen saying why, so the
// component carries the same two calls itself and uses them when the client
// cannot. The case drives that path directly, because by construction it
// cannot arise in this repo: the client here always has the method.
test('a client too old to have bytes() still yields an image', async () => {
  const seen = [];
  const Old = class {
    constructor(c = {}) { this.ref = c.ref || ''; }
    async req(p) {
      seen.push(p);
      if (/^contents\//.test(p)) return { content: btoa('PNGDATA'), sha: 's1', size: 7 };
      return [];
    }
    async get() { return { text: 'x' }; }
  };
  assert.equal(typeof Old.prototype.bytes, 'undefined', 'the client this simulates');
  const real = window.GH;
  window.GH = Old;
  try {
    const d = data('png');
    d.loaded = false; d.mediaUrl = '';
    await d._loadShown();
    assert.ok(d.mediaUrl.startsWith('data:image/png;base64,'), 'the pane still has its image');
    assert.equal(atob(d.mediaUrl.split(',')[1]), 'PNGDATA');
    assert.ok(seen.some(p => p.startsWith('contents/pages/thumbs/a.png')),
      'fetched by hand, through the one call every client has had all along');
  } finally { window.GH = real; }
});


// ── one copy button, and one row ────────────────────────────────────────────
//
// There were two, labelled "content" and "patch", on a strip of their own above
// the tabs. That asked the reader to map a label onto the tab they were looking
// at, offered "content" for a PNG, and put two rows of chrome between the
// card's header and what it was showing. One button that takes whatever is on
// screen, on the same row as the tabs that decide it.

test('copy takes what is showing, and offers nothing when there is nothing', () => {
  const d = data('withPatch');
  const was = d.tab;
  d.tab = 'patch';  assert.equal(d.copyable, d.patchDump);
  d.tab = 'diff';   assert.equal(d.copyable, d.patchDump, 'a CM6 editor is not text; its patch is');
  d.tab = 'new';    assert.equal(d.copyable, d.newText);
  d.tab = 'base';   assert.equal(d.copyable, d.baseText);
  d.tab = was;

  const img = data('png');
  assert.equal(img.copyable, null, 'an image pane has nothing a clipboard can take');
  assert.equal(img.panes.some(p => p.id === 'image'), true);
});

test('a document copies its source, not the rendered markup', () => {
  const d = data('docRead');
  d.newText = '# Title\n\ntext';
  d.tab = 'read';
  assert.equal(d.copyable, '# Title\n\ntext');
  assert.equal(d.copyTitle, 'Copy note.md', 'the tooltip names it, since the glyph cannot');
});

test('the controls sit on the tab row, not on a strip above it', () => {
  const card = window.document.getElementById('withPatch');
  const row = card.querySelector('[role="tablist"]').parentElement;
  assert.ok(row.querySelector('details[x-ref="ghMenu"]'), 'the github menu came down to the tabs');
  assert.ok(row.querySelector('.ph-copy'), 'and so did the one copy button');
  assert.equal(card.querySelectorAll('.ph-copy').length, 1, 'one, not two');
  assert.equal(card.querySelectorAll('details[x-ref="ghMenu"]').length, 1,
    'and the strip it used to live on is gone rather than emptied');
});
