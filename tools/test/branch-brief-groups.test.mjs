// alpineComponents/branch-brief.js — the Files pane's registry grouping: a
// repo declaring data/design/content.csv gets its changed files grouped by
// creation mode (mechanical collapsed behind its header, mounting no cards
// until opened), and a repo without one gets the flat unlabeled list this
// pane always had. Mirrors branch-brief-cards' harness; no network, no
// pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

for (const f of ['lib/kits/csv.js', 'lib/kits/branch-status.js', 'lib/kits/branch-brief.js', 'lib/kits/content-registry.js']) {
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

test('the pages and the prose are a section, and the list is what is left', () => {
  // Two SECTIONS, not two axes in one list. The registry groups by WHO MADE IT
  // and keeps doing only that; whether a reader reads a file is the page's
  // question and it answers it above the list. Before 2026-09-05 the pages and
  // docs sat wherever their paths put them, which on a 23-file branch was
  // mid-list.
  assert.deepEqual(j(data.reviewableFiles.map(f => f.path)), ['docs/b.md']);
  assert.deepEqual(j(data.listFiles.map(f => f.path)), ['lib/a.js', 'dist/web-tools.js']);
  assert.deepEqual(j(data.fileGroups.map(g => g.mode)), ['hybrid-authored', 'mechanical'],
    'the list groups exactly as it did, over what is left');
  const mech = data.fileGroups.find(g => g.mode === 'mechanical');
  assert.equal(mech.note, 'The pre-build', 'the registry note is untouched');
  assert.equal(data.filesShown, false, 'and the list starts shut behind its heading');
});

// THE COUNT MUST NOT LIE, which is what killed the first version of this idea:
// dropping the pages and docs OUT of the list left `Files 18` over sixteen
// rows. The two sections partition the branch and each heading counts its own,
// so the sum is checkable.
test('the two sections partition the branch, and each heading counts its own', () => {
  assert.equal(data.reviewableFiles.length + data.listFiles.length, data.brief.files.length);
  assert.equal(data.fileCount, data.listFiles.length, 'the Files heading names its list');
  const paths = [...data.reviewableFiles, ...data.listFiles].map(f => f.path);
  assert.equal(new Set(paths).size, paths.length, 'and none of them twice');
});

// ── The reading order ───────────────────────────────────────────────────────
//
// What changed, then why, then the documents themselves. The order moved twice
// in two days and each move was the reader's, so it is asserted rather than
// left to whoever edits the template next.
const sectionOrder = () => {
  const sections = window.document.querySelector('#m > div').lastElementChild;
  const kids = [...sections.children];
  const at = (sel) => kids.findIndex(c => c.matches(sel) || c.querySelector(sel));
  return { kids,
           row: kids.findIndex(c => /sticky top-0/.test(c.className || '')),
           files: at('[x-ref="files"]'), guide: at('[x-ref="guide"]'),
           rev: kids.findIndex(c => c.querySelector('[x-ref="revStrip"]')) };
};

test('the page reads files, then the guide, then the documents', () => {
  const o = sectionOrder();
  assert.ok(o.row >= 0 && o.files >= 0 && o.guide >= 0,
    'all three are children of the one scroller');
  assert.ok(o.row < o.files, 'the heading row heads the list it belongs to');
  assert.ok(o.files < o.guide, 'the list leads, shut, so it costs a row not a screen');
  assert.ok(o.rev > o.guide, 'and the documents are last');
});

// ── The vertical rhythm ─────────────────────────────────────────────────────
//
// Two rules the page states with spacing rather than with prose, both reported
// from a phone on 2026-09-07.
//
// ONE CORNER. The guide, the file list and a presented document are the page's
// three content containers, and they carried rounded-lg over a daisyUI card
// whose own radius is --radius-box: an 8px clip around a 16px card, which shows
// as a doubled corner beside a panel that has a clean one. They take the theme
// token now, so a theme that moves its radius moves all three together.
//
// GROUPING IS SPACING. A control sits closer to what it controls than sections
// sit to each other: the file list is flush to its heading row, the strip's dots
// are a gap-1 under the strip, and the container's gap-2 is reserved for one
// section against the next.
test('the content containers share one corner, and grouping is spacing', () => {
  const doc = window.document;
  const radius = (el) => (String(el.className || '').match(/\brounded-(?!b-)[a-z0-9]+\b/) || [])[0];
  const guideClip = doc.querySelector('[x-init*="watchClip($el, \'guide\'"]');
  const panelWrap = [...doc.querySelectorAll('[x-init*="watchClip"]')]
    .find(e => !/'guide'/.test(e.getAttribute('x-init')));
  const listPanel = [...doc.querySelectorAll('div')]
    .find(e => /border-base-300 rounded-\S+ overflow-hidden/.test(e.className || ''));
  const found = { guide: radius(guideClip), panel: radius(panelWrap), list: listPanel && radius(listPanel) };
  assert.ok(found.guide && found.panel && found.list, 'all three carry a radius: ' + JSON.stringify(found));
  assert.equal(new Set(Object.values(found)).size, 1, 'and it is the same one: ' + JSON.stringify(found));
  assert.equal(found.guide, 'rounded-box',
    'the theme token, so a theme that moves its radius moves all three');
  // A fade sits on its container's bottom edge and has to round with it.
  for (const fade of doc.querySelectorAll('.bg-gradient-to-b'))
    assert.match(fade.className, /rounded-b-box/, 'the fade follows its container');

  // The heading row is a toolbar: its height is four max-sm:h-11 tap targets,
  // and padding on top of that pads an affordance that carries its own room.
  // 44px is the floor, and it is an estate idiom rather than this page's
  // choice, so it does not move here on its own.
  const row = [...doc.querySelectorAll('div')].find(e => /sticky top-0/.test(e.className || ''));
  assert.ok(!/\bpy-\d/.test(row.className), 'no vertical padding on the row: ' + row.className);
  assert.match(row.className, /px-4/, 'the horizontal padding stays, since it cancels the full bleed');

  // The head is one section holding two strips, so it takes the control gap.
  const head = doc.querySelector('#m > div').firstElementChild;
  assert.match(head.className, /\bgap-1\b/, 'the head spaces its strips as controls: ' + head.className);
  // AND NO EXCEPTION INSIDE IT. A margin on one line of a block that already
  // spaces its lines is a rhythm with a hole in it; the identity block carried
  // mt-1 on the third of three and nothing on the first two.
  for (const line of head.firstElementChild.children)
    assert.ok(!/\b(mt|mb|my)-\d/.test(line.className || ''),
      'no line of the identity block spaces itself: ' + line.className);
});

// THE MARKER'S ARROW IS DERIVED, not asserted. It pointed the wrong way once
// per reorder until this existed, which is twice in two days: it says a guide
// exists and where it is, from a row pinned while everything else scrolls under
// it, so an arrow aimed backwards is worse than none.
test('the guide marker points the way the guide actually is', () => {
  const o = sectionOrder();
  const row = o.kids[o.row];
  const arrow = row.querySelector('.ph-arrow-up, .ph-arrow-down');
  assert.ok(arrow, 'the marker carries an arrow');
  const want = o.guide > o.row ? 'ph-arrow-down' : 'ph-arrow-up';
  assert.ok(arrow.className.includes(want),
    'the guide is ' + (o.guide > o.row ? 'below' : 'above') + ' the row, so the arrow is ' + want);
});

// The guide is CLIPPED, not scrolled, and by the same mechanism and the same
// height as a presented file. Leading with it only helps if leading with it is
// cheap: a two-thousand-word body at the top of the page is the failure the
// files had when they led.
test('the guide scrolls as well as expands; a panel only expands', () => {
  const guide = window.document.querySelector('[x-ref="guide"]');
  const clip = guide.querySelector('[x-init]');
  assert.match(clip.getAttribute('x-init'), /watchClip\(\$el, 'guide'\)/);

  // THE ASYMMETRY IS LOAD-BEARING. A panel's card owns a scroller inside its
  // own pane, so a second one there is a scrollbar inside a scrollbar; the
  // guide card owns none, so its clip can be the scroller. Shipped
  // overflow-hidden on 2026-09-06 and reported the next day, since a reader
  // skimming the body had nothing to drag.
  const panel = [...window.document.querySelectorAll('[x-init*="watchClip"]')]
    .find(e => !/'guide'/.test(e.getAttribute('x-init')));
  assert.match(clip.className, /overflow-y-auto/, 'the guide scrolls in place');
  assert.ok(panel && /overflow-hidden/.test(panel.className),
    'a presented file is clipped, not scrolled');
  // Nothing pins the vertical overscroll, so a drag that reaches the end of the
  // guide carries on down the page instead of stopping dead.
  assert.ok(!/overscroll-y-contain|overscroll-contain/.test(clip.className),
    'and a drag past its end chains to the page');

  // SHORTER THAN A PANEL TOO, and that difference is deliberate as well. A
  // panel in the strip IS the document, which is what the page exists to show;
  // the guide is a preview of prose whose full text is one tap away. Read as
  // rem off the classes so the two cannot silently converge.
  const rem = (el) => Number((/max-h-\[(\d+)rem\]/.exec(el.className || '') || [])[1]);
  assert.equal(rem(clip), 18);
  assert.ok(panel && rem(panel) > rem(clip),
    'a presented document gets more room than the guide preview');

  // The clip is keyed, which is what lets one mechanism serve both. It was
  // revOpen/watchRev while the panels were its only caller.
  data.clipOpen = {};
  assert.equal(data.clipExpanded('guide'), false);
  data.toggleClip('guide');
  assert.equal(data.clipExpanded('guide'), true, 'the guide expands on its own key');
  assert.equal(data.clipExpanded('docs/b.md'), false, 'without touching a panel\'s');
  data.toggleClip('guide');
  assert.equal(data.clipExpanded('guide'), false, 'and collapses again');
});

// ── The reviewable strip ────────────────────────────────────────────────────
//
// The presented files share ONE container and are swiped between, rather than
// stacking. Stacked, three documents were three screens before the file list
// and the deck button under it; the strip put that row back above the fold.
const withReviewable = async (fn) => {
  const keep = data.brief.files;
  data.brief = { ...data.brief, files: [...keep,
    { path: 'docs/c.md', status: 'modified', additions: 2, deletions: 0 },
    { path: 'pages/d.html', status: 'added', additions: 5, deletions: 0 }] };
  // Ten flushes, not four. The x-for repopulates on the first and the sibling
  // x-show re-reads later, so a shorter wait reads a populated pager inside a
  // row still carrying display:none, which is a fixture artifact and not what
  // the browser does.
  await tick(10);
  try { return await fn(); } finally { data.brief = { ...data.brief, files: keep }; await tick(10); }
};

test('the presented files are one swiped container, not a stack', () => withReviewable(async () => {
  assert.equal(data.reviewableFiles.length, 3, 'three to page between');
  const strip = window.document.querySelector('[x-ref="revStrip"]');
  assert.ok(strip, 'the strip is mounted');
  // Native scroll-snap, no kit: the browser owns the momentum and the landing.
  for (const c of ['snap-x', 'snap-mandatory', 'overflow-x-auto'])
    assert.match(strip.className, new RegExp(c.replace(/[-/]/g, '\\$&')), 'strip is ' + c);
  // overflow-y is explicit because a box scrolling on one axis computes the
  // other from visible to auto, which is a second scrollbar nobody asked for.
  assert.match(strip.className, /overflow-y-hidden/, 'and it does not scroll vertically');

  const panels = data.revPanels();
  assert.equal(panels.length, 3, 'one panel per reviewable file');
  for (const k of panels) {
    assert.match(k.className, /w-full/, 'a panel is the strip wide');
    assert.match(k.className, /shrink-0/, 'and does not shrink to fit its neighbours');
    assert.match(k.className, /snap-center/, 'and is a snap point');
  }
  // NOT strip.children. x-for leaves its <template> in the DOM as the
  // insertion anchor, and a template is an element with an all-zero rect, so
  // reading children put it at index 0: every panel off by one, and goRev(0)
  // scrolling to a garbage offset. Caught in the browser, held here.
  assert.ok(strip.children.length > panels.length,
    'the x-for template is a child of the strip, which is why panels are named');
  assert.ok(!panels.some(k => k.tagName === 'TEMPLATE'), 'and it is not one of them');
}));

test('the dots are the position and the only way off an iframe panel',
  () => withReviewable(async () => {
    // A touch inside an iframe never reaches the parent scroller, so on the
    // html panel a swipe does nothing and these are the whole navigation.
    const dots = [...window.document.querySelectorAll('[data-rev-pager] button')];
    assert.equal(dots.length, 3, 'one per file');
    assert.deepEqual(dots.map(b => b.getAttribute('title')),
      data.reviewableFiles.map(f => f.path), 'each naming its file');
    const row = window.document.querySelector('[data-rev-pager]');
    assert.equal(row.style.display, '', 'the row is shown while there are several');
  }));

// One file is not a set to page through, so the row that says which of them
// you are on has nothing to say.
test('with one reviewable file there is no pager', async () => {
  await tick(4);
  assert.equal(data.reviewableFiles.length, 1);
  const row = window.document.querySelector('[data-rev-pager]');
  assert.equal(row.querySelectorAll('button').length, 1, 'x-for still draws it');
  assert.equal(row.style.display, 'none', 'and x-show hides the row');
});

test('the strip reads its position and is driven to one', () => withReviewable(async () => {
  const strip = window.document.querySelector('[x-ref="revStrip"]');
  const panels = data.revPanels();
  // jsdom does no layout, so the strip is given one: 300px panels with a 12px
  // gap, scrolled to wherever scrollLeft says.
  const W = 300, GAP = 12;
  strip.scrollLeft = 0;
  strip.getBoundingClientRect = () => ({ left: 0, width: W });
  panels.forEach((k, i) => { k.getBoundingClientRect = () => ({ left: i * (W + GAP) - strip.scrollLeft, width: W }); });
  strip.scrollTo = ({ left }) => { strip.scrollLeft = left; };

  assert.equal(data.revX(1), W + GAP, 'a panel offset counts the gap');
  data.goRev(2);
  assert.equal(strip.scrollLeft, 2 * (W + GAP), 'and driving one scrolls there');
  assert.equal(data.revAt, 2, 'the state follows the drive');

  // A swipe lands between two panels; the nearer one is where it is.
  strip.scrollLeft = W + GAP + 40;
  data.revScroll();
  assert.equal(data.revAt, 1, 'a partly-swiped strip still has a position');
  strip.scrollLeft = 2 * (W + GAP) - 30;
  data.revScroll();
  assert.equal(data.revAt, 2, 'and it is the nearest panel, not a division');
}));

// A generated .md is machine output whatever its extension, so promoting one
// would put a generator's docs above the work someone did.
test('a mechanical file is never reviewable, whatever the extension', async () => {
  const keep = data.brief.files;
  data.brief = { ...data.brief, files: [...keep,
    { path: 'dist/notes.md', status: 'modified', additions: 1, deletions: 0 }] };
  await tick(2);
  try {
    assert.ok(!data.reviewableFiles.some(f => f.path === 'dist/notes.md'));
    const mech = data.fileGroups.find(g => g.mode === 'mechanical');
    assert.ok(mech.files.some(f => f.path === 'dist/notes.md'));
  } finally { data.brief = { ...data.brief, files: keep }; await tick(2); }
});

// A branch with no page and no doc has no section to stand in the list's
// place, so the list has to open itself. Not defensive: over 20 merged
// branches sampled 2026-09-05, twelve changed no .html at all and two changed
// neither .html nor .md.
test('with no page and no doc the list opens itself', async () => {
  const keep = data.brief.files;
  data.brief = { ...data.brief, files: keep.filter(f => !/\.md$/.test(f.path)) };
  await tick(2);
  try {
    assert.equal(data.reviewableFiles.length, 0);
    assert.equal(data.filesShown, true, 'or the page would be a caret over nothing');
    assert.ok(data.deckFiles.length > 0, 'so the deck still has something to page');
  } finally { data.brief = { ...data.brief, files: keep }; await tick(2); }
});

test('a shut list and a collapsed group both mount nothing until opened', async () => {
  // SHUT MEANS UNMOUNTED at both levels, and x-show is not enough for either:
  // it leaves the rows in the DOM, so a collapsed list still built a
  // fileReview component per row and paid for every one (measured 2026-09-05,
  // 23 cards on a page drawing three). The list answers with displayGroups
  // returning nothing; a group inside it answers with x-if, as it always did.
  const cards = () => [...window.document.querySelectorAll('[x-data^="fileReview"]')].length;
  assert.equal(cards(), 1);                 // the reviewable section alone
  data.toggleFiles();
  await tick(3);
  assert.equal(cards(), 2, 'the list opens on its authored group; mechanical stays shut');
  data.toggleGroup('mechanical');
  await tick(3);
  assert.equal(cards(), 3);
  data.groupState = {};   // not toggle-back: that leaves an explicit false behind
  data.filesOpen = null;
  await tick(2);
});

// The registry read is memoized per repo@ref for the swiper's sake (stepping
// eight branches of one repo asked the same question eight times, and on a
// repo declaring none that is eight 404s). No reader can make a ref's registry
// change under them inside the memo's life, so the transition this case needs
// is one only a test can stage: drop the memo, then re-read.
test('without a registry the section still splits, over the flat list it always was', async () => {
  // The split does not depend on the registry: a repo declaring none still has
  // pages and docs worth reading first, and the section sits outside the list
  // rather than needing a group label the registry alone could supply. What
  // the list itself does without a registry is exactly what it always did, one
  // flat unlabeled panel, only shorter.
  SERVE_CSV = false;
  data.forgetRegistry();
  await data.load();
  await tick(3);
  assert.equal(data.registry, null);
  assert.deepEqual(j(data.reviewableFiles.map(f => f.path)), ['docs/b.md']);
  assert.equal(data.fileGroups.length, 1);
  assert.equal(data.fileGroups[0].labeled, false);
  assert.equal(data.fileGroups[0].files.length, 2);
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
  assert.ok(u.pathname.endsWith('/app/'));
});

// The unframed counterpart to the layout case in branch-brief-hosted, and it
// is now TWO rules read at two sizes rather than one everywhere.
//
// Outside `roomy` a page is a page and scrolls as one: pinning its own header
// costs a phone the URL-bar collapse. Inside it the page locks to the viewport
// and ONE region scrolls; before the lock the guide began at y=575 of a 983px
// document and reading it scrolled every control off the top (2026-09-04, at
// 1440x900).
//
// It was two panes with a scrollbar each until 2026-09-06. The second scrollbar
// existed so a long file list could not push the guide off the screen, and the
// reorder answers that directly: the guide leads and is clipped, so it is
// reachable without a pane of its own. One scroller is what a phone already
// had, and it is what makes the heading row pin at every size rather than only
// where the document scrolls.
//
// TOKEN-EXACT, not substring: `roomy:h-full` contains `h-full`, so an
// `includes` check cannot tell the small-screen rule from the large-screen one
// and would pass while the page was locked at every size. The pixels are in
// tools/render/scenarios, since a jsdom box has no layout to measure.
const classes = (el) => new Set(String(el.className || '').split(/\s+/).filter(Boolean));
const R = (u) => 'roomy:' + u;

test('standalone: the document is left alone, and the lock is roomy-only', () => {
  assert.equal(window.document.body.style.overflow, '', 'the component never locks the document itself');
  assert.equal(window.document.body.style.height, '');

  const root = window.document.querySelector('#m > div');
  const sections = root.lastElementChild;
  const small = classes(root), sectionsSmall = classes(sections);

  // Outside roomy: as tall as its content, owning no scroller.
  assert.ok(!small.has('h-full'), 'the view is as tall as its content');
  assert.ok(!small.has('min-h-0'), 'and does not clamp itself to a box it was not given');
  assert.ok(!sectionsSmall.has('overflow-y-auto'), 'and owns no scroller');

  // Inside it: locked, with ONE region scrolling inside the box.
  assert.ok(small.has(R('h-full')) && small.has(R('min-h-0')),
    'roomy, the view fills the height the page hands it');
  assert.ok(sectionsSmall.has(R('flex-1')) && sectionsSmall.has(R('min-h-0')),
    'the sections are the box');
  assert.ok(sectionsSmall.has(R('overflow-y-auto')),
    'and that box is the one thing that scrolls');

  // NO SECTION OWNS A SCROLLER OR A SHARE. Either one puts a scrollbar inside
  // the scrollbar above, which is the shape this file and the house style
  // refuse, and the height rules that used to divide the box are what the
  // second scrollbar needed.
  const files = root.querySelector('[x-ref="files"]');
  const guide = root.querySelector('[x-ref="guide"]');
  for (const [name, el] of [['files', files], ['guide', guide]]) {
    const c = classes(el);
    assert.ok(!c.has(R('overflow-y-auto')), name + ' does not scroll itself');
    assert.ok(!c.has(R('max-h-[45%]')) && !c.has(R('grow')),
      name + ' does not divide the box');
  }
  // The guide is clipped instead, by the page's one expander, which is what
  // makes leading with it affordable.
  const clip = guide.querySelector('[x-init]');
  assert.match(clip.getAttribute('x-init'), /watchClip\(\$el, 'guide'\)/,
    'the guide is measured by the shared clip');
  assert.match(clip.className, /max-h-\[18rem\]/, 'and clipped');
});

// WHICH COPY OF THE PAGE IS RUNNING, stated on the page itself.
//
// Every other fact in the head describes the BRANCH; this one describes the
// code doing the describing, and until 2026-09-04 it was reachable only through
// the FAB drawer. A reader whose FAB will not open on their device then has no
// way at all to tell a branch preview from the deployed page, which cost three
// rounds of this session before anyone noticed the reader and the session were
// looking at different code.
//
// The SOURCE is the half worth gating. window.gh.ref is what the loader is
// pinned to; the address bar's ?use= is what was ASKED for, and a page whose
// boot block ignores it would report a preview it is not running. The FAB
// reasons the same way at loaderRef, and this must not drift to the easier
// reading.
test('the head says which copy of the page is running, from the loader', () => {
  const line = [...window.document.querySelectorAll('span')]
    .find(e => /^running /.test(e.textContent.trim()));
  assert.ok(line, 'the identity line carries the marker');
  assert.equal(line.textContent.trim(), 'running main',
    'with no loader pinned it reads the default branch, never blank');

  // A SHA is trimmed to 7, which tells two commits apart in a screenshot; a
  // branch name is left whole, since truncating one is how two branches come
  // to read the same.
  window.gh = { ref: '5985c9cb7b69a1212d18901655b4f7462ac95b3b' };
  assert.equal(data.codeRef, '5985c9c');
  window.gh = { ref: 'claude/session-detail-mobile-scroll-nwd66p' };
  assert.equal(data.codeRef, 'claude/session-detail-mobile-scroll-nwd66p');
  delete window.gh;
  assert.equal(data.codeRef, 'main');

  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/branch-brief.js'), 'utf8');
  const body = src.slice(src.indexOf('get codeRef()'), src.indexOf('get codeRefTitle()'));
  assert.match(body, /window\.gh && window\.gh\.ref/,
    'the marker reads what the loader booted, not what the address asked for');
  assert.doesNotMatch(body, /location\.(search|href)|URLSearchParams/,
    'the address bar is a different question and reporting it would be a lie on a page that ignores it');
});

// ONE FLAG, TWO FACTS, and the layout above is worth nothing while they are
// confused. `framed` on a PAGE means it sits in an iframe, which is why its
// masthead stands down. `framed` on the BRIEF means a host draws the branch
// name and the state, and that the view is a slide rather than a page, so it
// takes the single-scroller shape. The first is true of a toss; the second is
// true only of show-repo's deck, which mounts the COMPONENT rather than either
// page.
//
// Passing one for the other is not a cosmetic slip: every roomy: class sits
// behind !framed, so a tossed branch refused the two-pane lock at any window
// size, with the media query matching and nothing on screen to say why
// (measured 2026-09-04 through the toss at 1440x900). session.html shipped the
// same defect and fixed it on 2026-09-01; branch.html still had it three days
// later, which is why this gate covers both pages rather than one.
test('neither page hands the brief its own iframe test', () => {
  for (const [file, mount] of [['pages/branch.html', /framed: false,/],
                               ['pages/session.html', /framed: false,/]]) {
    const src = readFileSync(path.join(repoRoot, file), 'utf8');
    assert.match(src, mount, `${file}: the brief is handed a literal`);
    assert.doesNotMatch(src, /framed: this\.framed/,
      `${file}: no address form still passes the page's iframe test through`);
    // The page keeps its own flag, which still stands its masthead down.
    assert.match(src, /x-show="!framed \|\| !target"/,
      `${file}: the page's own flag still drives its own chrome`);
  }
});

// `roomy` IS NOT A TAILWIND BREAKPOINT. It is declared per page, so a host that
// mounts this component standalone without the declaration gets classes that
// compile to nothing and a page that silently reverts to document scroll: the
// exact failure mode the house style names for the whole stack. Nothing else
// would report it, since the classes are still in the DOM and the suite would
// still be green.
//
// So the gate is two-way. Every page that mounts branchBrief WITHOUT framed:true
// must declare the variant, and the floors are asserted here rather than only
// commented, because a floor moved by accident is a layout that quietly stops
// applying on somebody's window.
test('every standalone host of this component declares the roomy variant', () => {
  const dir = path.join(repoRoot, 'pages');
  // A PAGE that mounts this component is standalone by construction: the only
  // framed host is show-repo's deck, which mounts it from estate.js and never
  // from pages/. So the test is the mount, full stop. It also filtered on the
  // absence of `framed: true` for one commit, which read PROSE rather than
  // code and went quiet the moment a comment mentioned the flag by name.
  const hosts = readdirSync(dir).filter(f => f.endsWith('.html'))
    .map(f => [f, readFileSync(path.join(dir, f), 'utf8')])
    .filter(([, src]) => /x-data',\s*'branchBrief\(/.test(src));
  assert.ok(hosts.length, 'at least one page mounts the component standalone');

  for (const [name, src] of hosts) {
    // Non-greedy to the `)` that a `;` follows: the condition nests parens
    // (`@media (min-width: …) and (min-height: …)`), so a `[^)]*` class stops
    // at the first inner one and reads half the rule as the whole of it.
    const decl = src.match(/@custom-variant\s+roomy\s*\(([\s\S]*?)\)\s*;/);
    assert.ok(decl, `${name} uses roomy: classes but never declares the variant`);
    assert.match(decl[1], /min-width:\s*640px/,
      `${name}: the width floor keeps a phone in portrait on document scroll`);
    assert.match(decl[1], /min-height:\s*700px/,
      `${name}: the height floor is what decides whether two panes fit at all`);
  }
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

  // The reviewable section is always in: it is a section, not a group, and has
  // no toggle to be out by. That is the constraint that decided the shape,
  // since the deck button keys x-show on deckFiles.length and a page that
  // collapsed everything would take its one accented control off the screen.
  assert.deepEqual(j(data.deckFiles.map(f => f.path)), ['docs/b.md']);

  data.toggleFiles();
  await tick(2);
  assert.deepEqual(j(data.deckFiles.map(f => f.path)), ['docs/b.md', 'lib/a.js'],
    'opening the list puts its open groups in reach of the deck too');
  data.toggleGroup('mechanical');
  await tick(2);
  assert.deepEqual(j(data.deckFiles.map(f => f.path)),
    ['docs/b.md', 'lib/a.js', 'dist/web-tools.js']);
  data.groupState = {};
  data.filesOpen = null;
  await tick(2);
});

test('with nothing reviewable and every group shut there is nothing to read', async () => {
  // The old shape of this case: shut everything and the deck is empty and its
  // control is gone. It needs a branch with no reviewable section now, since
  // that section cannot be shut, which is the whole reason the deck is never
  // empty on the branches that have one.
  const keep = data.brief.files;
  data.brief = { ...data.brief, files: keep.filter(f => !/\.md$/.test(f.path)) };
  await tick(2);
  try {
    data.toggleGroup('hybrid-authored');    // mechanical is already collapsed
    await tick(2);
    assert.equal(data.deckFiles.length, 0);
    assert.equal(await data.openFileDeck(0), undefined, 'and asking for it does nothing');
  } finally {
    data.groupState = {};
    data.brief = { ...data.brief, files: keep };
    await tick(2);
  }
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

// ── The row cap ─────────────────────────────────────────────────────────────
//
// The guide sits under this list, so the list's length is the guide's distance.
// Measured at 390px on a sixty-file branch, the guide's top landed at 2309px,
// 2.7 screens from the head; twenty rows puts it near 1050px. The cap is a
// drawing rule and not a filter, which is the distinction these cases hold:
// the header still reports the group's own size, the deck still pages every
// file in an open group, and the footer says exactly what it is holding back.
const wideCompare = {
  status: 'ahead', ahead_by: 2, behind_by: 0,
  commits: [{ sha: 'c1', commit: { author: { date: '2026-08-01T00:00:00Z' }, message: 'one' } }],
  files: Array.from({ length: 30 }, (_, i) => ({
    filename: 'lib/f' + i + '.js', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@',
  })).concat(Array.from({ length: 5 }, (_, i) => ({
    filename: 'dist/g' + i + '.js', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@',
  }))),
};

test('past the cap the list draws its budget and offers the rest', async () => {
  SERVE_CSV = true;
  data.groupState = {};
  const narrow = compare.files;
  compare.files = wideCompare.files;
  data.forgetRegistry();
  window.BranchBrief.forget();
  await data.load();
  await tick(4);
  try {
    assert.equal(data.brief.files.length, 35);
    const authored = data.displayGroups.find(g => g.mode === 'hybrid-authored');
    assert.equal(authored.files.length, data.ROW_CAP, 'the open group is cut to the budget');
    assert.equal(authored.total, 30, 'and its header still reports the branch, not the slice');
    assert.equal(data.hiddenFileCount, 10, 'the footer offers exactly what was withheld');

    // A COLLAPSED group draws no rows, so it spends none of the budget: that is
    // what lets a repo whose generated output starts collapsed show more of its
    // authored half rather than less.
    const mech = data.displayGroups.find(g => g.mode === 'mechanical');
    assert.equal(data.groupOpen(mech), false);
    assert.equal(mech.total, 5);

    // Not a filter. The deck holds every file in an open group whether or not
    // the cap drew its row; only the group toggles narrow what it pages.
    assert.equal(data.deckFiles.length, 30);

    data.showAllFiles = true;
    await tick(2);
    assert.equal(data.displayGroups.find(g => g.mode === 'hybrid-authored').files.length, 30);
    assert.equal(data.hiddenFileCount, 0, 'and nothing is left to offer');
  } finally {
    compare.files = narrow;
    data.showAllFiles = false;
    window.BranchBrief.forget();
    data.forgetRegistry();
    await data.load();
    await tick(3);
  }
});

test('a modest branch is drawn whole, so the cap is invisible where it costs nothing', () => {
  assert.equal(data.brief.files.length, 3);
  assert.equal(data.hiddenFileCount, 0);
  assert.equal(data.filesShown, false, 'shut, so the list draws nothing at all');
  assert.deepEqual(j(data.displayGroups.map(g => g.files.length)), []);
  data.filesOpen = true;
  assert.deepEqual(j(data.displayGroups.map(g => g.files.length)), [1, 1]);
  data.filesOpen = null;
});

// The marker on the heading row is the only thing at the top saying the guide
// exists, so its tooltip carries both halves: where it goes and what is there.
// The title itself rides the row where the width allows and drops at 390px.
test('the guide marker names the destination and the title', async () => {
  assert.equal(data.guideJumpTitle, 'Jump to the guide', 'with no PR, no number to name');
  data.brief = { ...data.brief, prs: [{ number: 42, title: 'A branch about something', draft: true, state: 'open', body: '' }] };
  await tick(2);
  assert.equal(data.guideJumpTitle, 'Jump to the guide: #42 — A branch about something');
});
