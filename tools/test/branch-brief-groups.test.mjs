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
  assert.ok(u.pathname.endsWith('/app/'));
});

// The unframed counterpart to the layout case in branch-brief-hosted, and it
// is now TWO rules read at two sizes rather than one everywhere.
//
// Outside `roomy` a page is a page and scrolls as one: pinning its own header
// costs a phone the URL-bar collapse. Inside it the page locks to the viewport
// and the two sections each take a scrollbar; before that the guide began at
// y=575 of a 983px document and reading it scrolled every control off the top
// (2026-09-04, at 1440x900).
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

  // Inside it: locked, with the sections dividing the box rather than scrolling it.
  assert.ok(small.has(R('h-full')) && small.has(R('min-h-0')),
    'roomy, the view fills the height the page hands it');
  assert.ok(sectionsSmall.has(R('flex-1')) && sectionsSmall.has(R('min-h-0')),
    'the sections are the box the two panes divide');
  assert.ok(!sectionsSmall.has(R('overflow-y-auto')),
    'and it is not itself a scroller, or the two panes would be inside a third');

  const files = root.querySelector('[x-ref="files"]');
  const guide = root.querySelector('[x-ref="guide"]');
  assert.ok(classes(files).has(R('max-h-[45%]')) && classes(files).has(R('min-h-0')),
    'the file list takes its content height up to a share of the box');
  assert.ok(classes(guide).has(R('overflow-y-auto')) && classes(guide).has(R('grow')),
    'the guide takes what is left and scrolls the prose inside it');
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
  assert.deepEqual(j(data.displayGroups.map(g => g.files.length)), [2, 1]);
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
