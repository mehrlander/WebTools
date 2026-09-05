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
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

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
    <div id="page" x-data="fileReview({ repo: 'mehrlander/web-tools', ref: 'feat/x', base: 'main',
         path: 'pages/a.html', status: 'modified', patch: '@@ -1 +1 @@', read: true, open: true })"></div>
    <div id="pageList" x-data="fileReview({ repo: 'mehrlander/web-tools', ref: 'feat/x', base: 'main',
         path: 'pages/a.html', status: 'modified', open: true })"></div>
    <div id="pageElsewhere" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'main',
         path: 'pages/a.html', status: 'modified', patch: '@@ -1 +1 @@', read: true, open: true })"></div>
    <div id="srcRead" x-data="fileReview({ repo: 'acme/w', ref: 'feat/x', base: 'mb-sha',
         baseName: 'main', path: 'lib/d.js', status: 'modified', patch: '@@ -1 +1 @@',
         read: true, bare: true, open: true })"></div>
  </body></html>`,
});

const fetched = [];
window.GH = class {
  constructor(c = {}) { this.repo = c.repo || ''; this.ref = c.ref || ''; }
  async get(p) {
    fetched.push(this.ref + ':' + p);
    // x.dat is the unknown-extension binary: nothing in its name says so, and
    // the NUL in its decode is the only thing that can. d.js is the one file
    // whose content depends on the ref, which is what gives the compare cases
    // below something to actually differ about.
    return { text: /x\.dat$/.test(p) ? 'ab\u0000cd'
                 : /d\.js$/.test(p) || /a\.html$/.test(p) ? 'body at ' + this.ref : 'x', size: 8 };
  }
  async bytes(p) { fetched.push(this.ref + ':bytes:' + p);
                   return { bytes: new Uint8Array([1, 2, 3]), size: 3 }; }
  async req() { return []; }
};
window.TOKEN = 't';

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
// viewer.js rides along for the three-way classifier check at the end: its
// ViewRegistry is the third thing in this estate with an opinion about what a
// file IS, and it was the one not held to the other two.
for (const p of ['lib/kits/guide-render.js', 'lib/kits/source-peek.js',
                 'lib/alpineComponents/viewer.js',
                 'lib/alpineComponents/file-review.js']) {
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
  // A reading surface, so there is no Patch tab to fall back to either: the
  // sidebar owns the comparison there, and an image has none worth showing.
  assert.equal(data('png').panes.map(p => p.label).join('|'), 'Image');
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


// ── One row on a reading card ───────────────────────────────────────────────
//
// A presented file had two rows of chrome above it and five controls across
// them: the collapsed header, then a File/Compare tab pair, a split/unified
// icon pair, a copy, a deck action and a github menu. On a 390px phone that is
// most of the first screen spent before the document starts, which is what the
// reader called too many buttons hovering at the top (2026-09-05).
test('a reading card puts its name, its layouts and one menu on a single row', () => {
  const card = window.document.getElementById('page');
  // The collapsed header stands down once the card is open, because the control
  // row below carries the name instead. Closed it has to come back, or the card
  // would have nothing left to tap.
  const header = [...card.querySelectorAll('div')]
    .find(e => /hover:bg-base-200\/50/.test(e.className || ''));
  assert.ok(header, 'the header element is still there');
  assert.equal(header.style.display, 'none', 'and hidden while the card is open');

  // No text tabs: three layout icons in one group, and the file is the first.
  assert.equal(data('page').panes.length, 2, 'the file and its comparison');
  assert.deepEqual(JSON.parse(JSON.stringify(data('page').viewModes.map(m => m.icon))),
    ['ph-square', 'ph-columns', 'ph-rows'], 'one pane, two columns, two rows');
  assert.equal(card.querySelector('[role="tablist"]').style.display, 'none',
    'the text tab strip is not drawn on a reading card');

  // And the utilities fold into the menu rather than sitting beside it.
  // Copy stays a button on the row rather than a row in the menu: it is the
  // one utility used often enough to be worth a tap instead of two.
  const copies = [...card.querySelectorAll('.ph-copy')]
    .filter(i => i.closest('button').style.display !== 'none');
  assert.equal(copies.length, 1, 'one copy control on screen');
  assert.ok(!copies[0].closest('li'), 'and it is a button on the row, not a menu row');
  // THE MENU IS A GITHUB MENU, and it wears the logo because every row in it
  // goes to GitHub. That was nearly true already and the one exception was the
  // Render row, which a card whose first layout icon IS the render has no
  // business offering a second door onto. It sits beside the name rather than
  // at the end of the row, by flex order, so the same element serves both
  // surfaces.
  assert.ok(card.querySelector('.ph-github-logo'), 'the menu is a github menu');
  const menu = card.querySelector('details[x-ref="ghMenu"]');
  assert.match(menu.className, /order-2/, 'and it sits beside the name');
  const hosts = [...new Set(data('page').ghLinks.map(l => new URL(l.url).host))].sort();
  assert.deepEqual(hosts, ['github.com', 'raw.githubusercontent.com'],
    'every row is a GitHub destination: ' + JSON.stringify(data('page').ghLinks.map(l => l.label)));
  assert.ok(!data('page').ghLinks.some(l => l.label === 'Render'),
    'the render row is gone, the first layout icon being the same door');
});

// The row reads left to right as identity, then arrangement, then the one
// utility: who and which copy on the left, what shape in the middle, take it
// with you at the end. The middle group is centred by a grow spacer on each
// side rather than pushed against whichever end is shorter, which is only
// visible above about 500px and is the reason for the second spacer.
test('a reading card orders its row identity, arrangement, utility', () => {
  const card = window.document.getElementById('page');
  const row = [...card.querySelectorAll('div')].find(e =>
    /flex items-center gap-1$/.test(e.className || '') &&
    e.querySelector('details[x-ref="ghMenu"]'));
  assert.ok(row, 'the single control row');

  const name = (el) => {
    if (el.querySelector('.ph-github-logo')) return 'github';
    if (el.querySelector('.ph-git-diff')) return 'compare';
    if (el.querySelector('.ph-copy')) return 'copy';
    if (el.querySelector('.ph-square')) return 'layouts';
    if (el.querySelector('[x-text="namePart"]')) return 'name';
    if (/\bgrow\b/.test(el.className || '')) return 'spacer';
    return el.tagName.toLowerCase();
  };
  const seen = [...row.children]
    .filter(el => el.style.display !== 'none')
    .map(el => ({ n: name(el), o: Number((/\border-(\d+)\b/.exec(el.className || '') || [])[1]) }))
    .sort((a, b) => a.o - b.o)
    .map(e => e.n);
  assert.deepEqual(seen,
    ['name', 'github', 'compare', 'spacer', 'layouts', 'spacer', 'copy'],
    'read order: ' + JSON.stringify(seen));
});

// ── The comparison, as a control ────────────────────────────────────────────
//
// A reading card carried a caption reading "against main" under its tabs:
// true, and inert, since the pair is chosen in a sidebar that is closed on a
// phone. The fact the reader met in the one place they could do nothing about
// it is a dropdown now, and the row it took is back.
test('what a file is compared against is a control, not a caption', () => {
  const card = window.document.getElementById('page');
  const d = data('page');
  assert.ok(!/against\s*<span/.test(card.innerHTML), 'the caption line is gone');
  assert.ok(d.comparePicker, 'and the picker is offered in its place');
  assert.ok(card.querySelector('details[x-ref="cmpMenu"]'), 'as a dropdown on the row');

  const choices = JSON.parse(JSON.stringify(d.compareChoices));
  assert.ok(choices.some(c => c.base === 'main' && c.on), 'the base it was mounted with, and it is the one on');
  assert.ok(choices.some(c => c.off), 'and a way to turn the comparison off');
});

// The picker publishes rather than deciding: adoptCompare is what hears it,
// here and in every other card on the page, so a choice made on one moves all
// of them and the sidebar with them.
test('picking a comparison goes out on the channel the sidebar already speaks', () => {
  const d = data('page');
  const heard = [];
  const listen = (e) => heard.push(e.detail);
  window.addEventListener('web-tools:compare-ref', listen);
  try {
    d.pickCompare({ key: 'off', off: true });
    assert.equal(heard.length, 1);
    assert.equal(heard[0].off, true);
    assert.equal(heard[0].repo, 'mehrlander/web-tools', 'addressed, so a sibling deck does not adopt it');
    assert.equal(window.__compareRef.off, true, 'and left where a card mounting later will find it');
  } finally {
    window.removeEventListener('web-tools:compare-ref', listen);
  }
});

// The one that would have been a dead end: turning the comparison off empties
// viewModes, since there is nothing left to lay out, so a picker that appeared
// only alongside the layouts would be the way out of a state with no way back.
test('the picker survives the comparison being off', async () => {
  const d = data('page');
  d.compareOff = true;
  await tick(2);
  try {
    assert.equal(d.viewModes.length, 0, 'no layouts, there being nothing to lay out');
    assert.ok(d.comparePicker, 'but the picker is still there to turn it back on');
    assert.ok(d.compareChoices.some(c => c.off && c.on), 'and says which state it is in');
  } finally { d.compareOff = false; await tick(2); }
});

// The list is untouched by all of that: there the top row is the LIST ROW,
// thirty of them scanned at once, and the tab strip names panes a reader is
// choosing between rather than layouts.
test('a list card keeps both rows and its named tabs', () => {
  // pageList, not withPatch: the layout group only exists where there is a
  // comparison to lay out, and withPatch has loaded two identical sides by the
  // time this runs, so it would pass the last assertion for the wrong reason.
  // Same file as the reading card above, same comparison, different surface.
  const card = window.document.getElementById('pageList');
  const header = [...card.querySelectorAll('div')]
    .find(e => /hover:bg-base-200\/50/.test(e.className || ''));
  assert.notEqual(header.style.display, 'none', 'the list row stays');
  assert.notEqual(card.querySelector('[role="tablist"]').style.display, 'none');
  assert.equal(data('pageList').comparable, true, 'there IS a comparison here');
  assert.equal(data('pageList').viewModes.length, 0, 'and no layout group is offered for it');
  assert.ok(card.querySelector('.ph-github-logo'), 'the github menu is still a github menu');
});

// ── the classifier, and why there are two of them ───────────────────────────
//
// kits/source-peek.js already decides what a path IS, and map.js's renderDoc
// borrows that decision, so the peek card and the Docs deck cannot disagree
// about a file. This component repeats the markdown row rather than calling it,
// and the repeat is a judgement rather than an oversight: source-peek is a kit
// this card does not otherwise need, it may not have loaded when a card mounts,
// and a card that called a `.md` plain source because a kit was late would be a
// worse failure than the duplication. So they are held together by assertion,
// the shape the estate already uses for docs.csv's reach and surfacing.csv's
// membership.

// A probe card per path, left mounted. Tearing one down is what caused
// trouble: removing the node (by innerHTML or by destroyTree) leaves the
// component's own queued work running against a dead scope, and it surfaces as
// "bare is not defined" attributed to whichever test the tick landed in. The
// probes are inert (closed, no patch, so nothing fetches), so leaving them is
// cheaper than teaching the test to unwind Alpine correctly.
const kindOfPath = async (path) => {
  window.__k = { repo: 'acme/w', ref: 'feat/x', base: 'main', path };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'fileReview(window.__k)');
  window.document.getElementById('m2').append(el);
  Alpine.initTree(el);
  await tick(2);
  return Alpine.$data(el).kind;
};

// ── An html file, shown as the page ─────────────────────────────────────────
//
// The pane is an iframe of the shared toss at this ref, so a page previewed in
// a card and a page opened from a caption link are the same rendering. Three
// things are checkable without a browser that can actually paint it, and all
// three were wrong in a draft of this: which tab a surface lands on, whether
// the card still fetches the bytes, and whether the tab appears at all where
// the renderer cannot reach the repo.
test('a reading surface opens an html file on the page; a list opens it on the diff', async () => {
  const reading = data('page');
  await tick(3);
  assert.equal(reading.shownPane, 'render');
  assert.equal(reading.tab, 'render', 'the deck and the reviewable section want the page');
  assert.match(reading.tossUrl, /toss-render\.html#gh=mehrlander\/web-tools@feat\/x:pages\/a\.html$/,
    'and the frame is the same address a caption link carries');
  const list = data('pageList');
  await tick(3);
  assert.equal(list.shownPane, 'render', 'the tab is offered either way');
  assert.equal(list.tab, 'diff', 'but a changed-file list is asking how it changed');
  assert.ok(list.panes.some(p => p.id === 'render'), 'and the page is one tap away');
});

// The trap: `load()` reads "has a kind" as "is not text" and takes the bytes
// path. Adding html to KIND without adding it to TEXTUAL would leave every
// page card with empty Diff, New and Base behind a Render tab that worked.
test('an html card still fetches both sides as text, so its diff survives', async () => {
  const d = data('page');
  await tick(3);
  assert.equal(typeof d.newText, 'string', 'the new side is text, not bytes');
  assert.equal(typeof d.baseText, 'string');
  assert.ok(fetched.some(f => f.endsWith(':pages/a.html')), 'and it went down the text path');
  assert.ok(!fetched.some(f => f.includes('bytes:pages/a.html')), 'not the bytes one');
  assert.equal(d.copyable, d.newText, 'so the copy button takes the file behind the page');
});

// tossUrl is the allowlist: the renderer fetches same-origin, so it answers for
// mehrlander repos and nothing else. A Render tab over a frame that could load
// nothing would put the source tabs one tap further away for no gain.
test('no render tab where the renderer cannot reach the repo', async () => {
  const d = data('pageElsewhere');
  await tick(3);
  assert.equal(d.tossUrl, '');
  assert.equal(d.shownPane, '', 'so the card is plain source again');
  assert.ok(!d.panes.some(p => p.id === 'render'));
});

test('the two classifiers agree about what markdown is', async () => {
  window.document.body.insertAdjacentHTML('beforeend', '<div id="m2"></div>');
  const peek = window.SourcePeek.kindOf;
  for (const path of ['README.md', 'docs/a.markdown', 'docs/A.MD',
                      'lib/a.js', 'data/a.json', 'a', 'weird.mdx']) {
    assert.equal((await kindOfPath(path)) === 'markdown', peek(path) === 'markdown',
      path + ': the card and the peek must call it the same thing');
  }
  // And the rows source-peek has no opinion on, which is why the copy exists.
  assert.equal(await kindOfPath('a.png'), 'image');
  assert.equal(peek('a.png'), 'source', 'a peek card cannot show a PNG, so it does not try');
});

test('frontmatter is fenced before rendering, not read as a paragraph', async () => {
  // Assert on what marked is HANDED rather than on what it emits: the fencing
  // is the change, and a real markdown parse would drag a CDN fetch into a
  // jsdom test to prove something the input already shows.
  let seen = '';
  window.marked = { parse: (md) => { seen = md; return '<h1>Title</h1>'; } };
  const d = data('docRead');
  d.readHtml = '';
  d.newText = '---\nstatus: living\ndate: 2026-08-14\n---\n\n# Title\n\nBody.';
  await d._renderRead();
  // Half this estate's docs open with a `---` block, and marked renders a bare
  // one as a run of prose: the doc opened on "status: living date: 2026-08-14"
  // as though that were its first paragraph. source-peek hit this first, and
  // this is the third reader of its fix rather than a third copy of it.
  assert.ok(seen.startsWith('```'), 'the block reached marked already fenced');
  assert.ok(seen.includes('status: living'));
  assert.ok(seen.includes('# Title'), 'and the document behind it is intact');
  assert.equal(window.SourcePeek.fenceFrontmatter(d.newText), seen,
    'byte for byte what source-peek would have produced');
});


// ── who owns the comparison ─────────────────────────────────────────────────
//
// In a list this card owns it: Diff, Patch, New and Base are four readings of
// one fixed pair. On a reading surface the honest question is "against what",
// and the answer is a ref the card has no business choosing, so from
// 2026-08-14 the strip collapses to the file plus one Compare pane and the
// pair arrives on `web-tools:compare-ref` from the FAB sidebar.
//
// The two traps are both about believing something that is only true of the
// announced base: the API patch, and the file's status.

const publish = (detail) => window.dispatchEvent(
  new window.CustomEvent('web-tools:compare-ref', { detail }));

test('a reading surface shows the file and one comparison, not four readings of it', async () => {
  const d = data('srcRead');
  await tick(4);
  assert.equal(d.panes.map(p => p.label).join('|'), 'File|Compare');
  assert.equal(d.panes.map(p => p.id).join('|'), 'new|diff',
    'the source IS the file pane where the file has no presentation of its own');
  assert.ok(fetched.some(f => f.endsWith('lib/d.js')),
    'and it loads on open rather than settling on a patch it has no tab for');
});

test('the sidebar can turn the comparison off, and the file stands alone', async () => {
  const d = data('srcRead');
  publish({ repo: 'acme/w', ref: 'feat/x', off: true });
  await tick(2);
  assert.equal(d.compareOff, true);
  assert.equal(d.panes.map(p => p.label).join('|'), 'File');
  assert.equal(d.tab, 'new', 'and the reader is not left on a pane that no longer exists');

  publish({ repo: 'acme/w', ref: 'feat/x', off: false, base: 'mb-sha', baseName: 'main' });
  await tick(2);
  assert.equal(d.compareOff, false);
  assert.equal(d.panes.map(p => p.label).join('|'), 'File|Compare');
});

test('moving the base drops the patch, since the patch was only true of the old one', async () => {
  const d = data('srcRead');
  assert.equal(d.patch, '@@ -1 +1 @@');
  const before = fetched.length;
  publish({ repo: 'acme/w', ref: 'feat/x', off: false, base: 'claude/other',
            baseName: 'claude/other' });
  await tick(4);
  assert.equal(d.base, 'claude/other');
  assert.equal(d.baseName, 'claude/other');
  assert.equal(d.patch, '', 'the API patch is a fact about the merge base and nothing else');
  const calls = fetched.slice(before);
  assert.ok(calls.some(f => f.startsWith('claude/other:')), 'the base side is refetched');
  assert.ok(!calls.some(f => f.startsWith('feat/x:')),
    'and the new side is not, because it did not move');
});

test('a pair addressed to another branch is not applied to this file', async () => {
  const d = data('srcRead');
  const was = d.base;
  publish({ repo: 'acme/w', ref: 'some/other-branch', off: false, base: 'nope' });
  await tick(2);
  assert.equal(d.base, was, 'the channel is a global, so a card has to check who is being spoken to');
  publish({ repo: 'other/repo', ref: 'feat/x', off: false, base: 'nope' });
  await tick(2);
  assert.equal(d.base, was);
});

test('a list card is not listening: its four tabs are its own', async () => {
  const d = data('withPatch');
  publish({ repo: 'acme/w', ref: 'feat/x', off: true });
  await tick(2);
  assert.equal(d.compareOff, false, 'the sidebar drives reading surfaces, not review lists');
  assert.ok(d.panes.some(p => p.id === 'patch'));
});

// ── a PDF is a document, not a lump of bytes ────────────────────────────────
//
// It used to fall past every named extension to the NUL sniff and report
// itself as 'binary': true, and the least useful true thing the card could
// say. The estate learned to render PDFs everywhere else first, which left
// the review surface the last place one was unreadable.

test('a PDF classifies as pdf and takes the page pane', async () => {
  assert.equal(await kindOfPath('docs/report.pdf'), 'pdf');
  assert.equal(await kindOfPath('a/B.PDF'), 'pdf', 'the extension match is case-blind');
});

test('the page pane leads the strip, and no source pane is offered beside it', async () => {
  window.__k = { repo: 'acme/w', ref: 'feat/x', base: 'main', path: 'docs/report.pdf' };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'fileReview(window.__k)');
  window.document.getElementById('m2').append(el);
  Alpine.initTree(el);
  await tick(2);
  const d = Alpine.$data(el);

  assert.equal(d.shownPane, 'page');
  const ids = d.panes.map(p => p.id);
  assert.equal(ids[0], 'page', 'what the file IS comes first');
  // Same reasoning as an image: New and Base would hand back a UTF-8 decode of
  // a binary, which is the mojibake this whole change exists to stop showing.
  for (const dead of ['new', 'base', 'diff']) {
    assert.ok(!ids.includes(dead), `${dead} is not a reading of a PDF`);
  }
  assert.equal(d.comparable, false, 'and there is nothing to compare as text');
});

test('the handoff carries the file\'s own address', async () => {
  window.__k = { repo: 'acme/w', ref: 'feat/x', base: 'main', path: 'docs/report.pdf' };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'fileReview(window.__k)');
  window.document.getElementById('m2').append(el);
  Alpine.initTree(el);
  await tick(2);
  const url = Alpine.$data(el).pdfInspectUrl;
  assert.ok(url.includes('/pages/pdf-inspect.html'), url);
  assert.ok(url.endsWith('#gh=acme/w@feat/x:docs/report.pdf'), url);
});

// ── three classifiers, one question ─────────────────────────────────────────
//
// The card, source-peek and ViewRegistry each decide what a file IS, from its
// extension, for three different surfaces. The first two have agreed by
// assertion since the markdown row was deliberately duplicated; ViewRegistry
// was never brought into that pact, and it is the one that grew two new media
// kinds this month (pdf, then xlsx). A disagreement here is not cosmetic: it
// means the same file is a document on one surface and a lump of bytes on
// another, which is exactly the state this month's work existed to end.

test('the card and ViewRegistry agree about which files are media', async () => {
  const VR = window.ViewRegistry;
  // Only the kinds all three can hold an opinion on. gzip is the card's alone
  // (nothing else inflates), and that asymmetry is deliberate, not drift.
  const cases = [
    ['a.png',  'image', () => VR.isImage('png')],
    ['a.jpeg', 'image', () => VR.isImage('jpeg')],
    ['a.svg',  'svg',   () => VR.isImage('svg')],
    ['a.pdf',  'pdf',   () => VR.isPdf('pdf')],
  ];
  for (const [path, kind, vrSaysMedia] of cases) {
    assert.equal(await kindOfPath(path), kind, path + ': the card');
    assert.ok(vrSaysMedia(), path + ': and ViewRegistry, which must not disagree');
    assert.ok(VR.mimeFor(path.split('.').pop()),
      path + ': a media kind carries a mime, which is what a local drop travels under');
  }
});

test('a file no one calls media is media to no one', async () => {
  const VR = window.ViewRegistry;
  for (const [path, ext] of [['a.md', 'md'], ['a.js', 'js'], ['a.json', 'json']]) {
    assert.notEqual(await kindOfPath(path), 'image');
    assert.notEqual(await kindOfPath(path), 'pdf');
    assert.ok(!VR.isImage(ext) && !VR.isPdf(ext) && !VR.isWorkbook(ext), ext);
    assert.equal(VR.mimeFor(ext), '', ext + ': text carries no data: URI mime');
  }
});

test('the kinds ViewRegistry knows and the card does not are named, not silent', async () => {
  // xlsx arrived in the viewer (PR #433) and has no card kind yet, so a
  // workbook in a changeset still reports as a binary. That is a real gap and
  // this is where it is written down rather than discovered again later.
  const VR = window.ViewRegistry;
  assert.ok(VR.isWorkbook('xlsx'), 'the viewer reads workbooks');
  // '' rather than 'binary': the card's extension table has no row for it, and
  // 'binary' is what the NUL sniff decides later, at load. These probe cards
  // never fetch, so this reads the classifier itself rather than its fallback.
  assert.equal(await kindOfPath('a.xlsx'), '',
    'the card has no workbook kind yet, which is the next one of these to close');
});
