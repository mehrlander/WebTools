// kits/file-deck.js — a changeset's files, one per slide.
//
// The Files pane is for SCANNING and this is for READING, and the split is the
// whole design: the pane keeps thirty hairline rows a reader can sweep, and the
// deck takes one file at a time with the diff already open. The deck can afford
// that because swipe-deck mounts the active slide and its two neighbours, so
// three cards exist at once no matter how long the changeset is; the pane
// cannot, which is why it hedges its cards closed past a dozen files.
//
// It also ANNOUNCES what the reader is on, through the subject channel the FAB
// sidebar already listens to (window.__tossSubject plus a 'toss-subject'
// event). That channel was built for toss-render and is not toss-specific: it
// already carries a `route` for "a file the renderer could not show as a page,
// so an app is showing it instead", which is exactly a deck slide. Saying it
// makes the sidebar's ref bar, path picker and github menu follow the file the
// reader is swiping through, with no coupling in either direction beyond a
// global and an event.
//
// What the cases hold is the contract between the two, since everything else is
// swipe-deck's (covered in swipe-deck-stack) or fileReview's (in
// file-review-card): the deck pages what the pane is SHOWING, the header names
// the file the reader is on rather than the one they opened at, and a card gets
// its options by reference rather than through an x-data expression.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
for (const f of ['lib/kits/swipe-deck.js', 'lib/kits/subject-channel.js', 'lib/kits/file-deck.js']) {
  new window.Function(readFileSync(path.join(repoRoot, f), 'utf8'))();
}
// fileReview is not under test here; the deck's job is to mount it with the
// right options, so a recording stub is exactly the right depth.
const mounted = [];
// The deck READS its header controls off the mounted card, so the stub answers
// $data too. One fake card per element, holding only what the header asks for;
// what those getters mean is fileReview's own business and file-review-card's.
const CARD = () => ({
  viewModes: [
    { key: 'file', icon: 'ph-square', label: 'Read', on: true },
    { key: 'split', icon: 'ph-columns', label: 'Compare, side by side', on: false },
    { key: 'unified', icon: 'ph-rows', label: 'Compare, inline', on: false },
  ],
  ghLinks: [{ label: 'This version', hint: '', url: 'https://x/1', icon: 'ph-file' },
            { label: 'Raw', hint: '', url: 'https://x/raw', icon: 'ph-file-text' }],
  picked: [],
  pickView(m) { this.picked.push(m.key); },
});
const cards = new Map();
window.Alpine = { initTree: (el) => {
  const expr = el.getAttribute('x-data') || '';
  const m = /^fileReview\(window\.(\w+)\)$/.exec(expr);
  mounted.push(m ? { key: m[1], opts: window[m[1]] } : { raw: expr });
  if (m) cards.set(el, CARD());
}, $data: (el) => cards.get(el) };

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));
// jsdom has no layout, so the scroll the contents list makes to open on the
// reader's own row is absent rather than inert.
window.Element.prototype.scrollIntoView = function(){};
// And a NO-OP scrollTo, for the tracks `drivable` below never wraps. The deck's
// opening jump to `start` runs in a frame of its own, before any test can wrap
// that track, so it threw into jsdom's dispatch, where node prints it and
// carries on. Harmless until it is not: the same class of uncaught throw failed
// CI from swipe-deck-stack on 2026-08-23.
//
// A no-op rather than a working scroller ON PURPOSE. Making it move the track
// is not neutral here: the opening jump would then fire a real scroll event and
// change what the subject channel announces, which broke the announcement case
// when it was tried. The throw was already a no-op, so this preserves every
// existing expectation and only stops the uncaught error. `drivable` supplies
// the real thing for the tests that page.
window.Element.prototype.scrollTo = function () {};

// jsdom has no layout and no scrollTo, and the deck computes its position in
// units of the track's width. Six lines of geometry make the track real enough
// to page: a fixed width, a writable scrollLeft, and a scrollTo that fires the
// scroll event the deck listens on. Everything the deck does with the result is
// its own arithmetic, which is the part worth testing here.
const drivable = (d, width = 400) => {
  const t = d.deck.track;
  Object.defineProperty(t, 'clientWidth', { value: width, configurable: true });
  let left = 0;
  Object.defineProperty(t, 'scrollLeft', {
    configurable: true, get: () => left, set: (v) => { left = v; },
  });
  t.scrollTo = ({ left: v }) => { left = v; t.dispatchEvent(new window.Event('scroll')); };
  return d;
};
const FILES = [
  { path: 'lib/kits/swipe-deck.js', status: 'modified', additions: 40, deletions: 3, patch: '@@ a' },
  { path: 'docs/show-repo.md', status: 'modified', additions: 60, deletions: 1, patch: '@@ b' },
  { path: 'README.md', status: 'added', additions: 9, deletions: 0, patch: '@@ c' },
];
const AT = { repo: 'me/tools', ref: 'claude/some-branch', base: 'main', baseName: 'main' };
const head = (d) => ({ title: d.el.querySelector('h1').textContent,
                       sub: d.el.querySelector('h1 + p').textContent });

test('the filename is the title and its directory is the crumb', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES, subtitle: 'claude/some-branch' });
  await tick(2);
  assert.equal(head(d).title, 'swipe-deck.js',
    'the filename is what the eye is looking for, so it gets the title line');
  assert.equal(head(d).sub, 'claude/some-branch · lib/kits');
  d.close(); await tick(4);
});

test('start opens on a named file, which is what "read from here" needs', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES, start: 1, subtitle: 'b' });
  await tick(2);
  assert.equal(head(d).title, 'show-repo.md');
  d.close(); await tick(4);
});

test('the header follows the reader rather than the file they opened at', async () => {
  const d = drivable(window.fileDeck.open({ ...AT, files: FILES, subtitle: 'b' }));
  await tick(2);
  d.setTitle('x'); d.setSubtitle('x');   // prove what follows is not a leftover
  d.deck.go(2);
  await tick(6);
  assert.equal(head(d).title, 'README.md', 'a file at the root has no directory to show');
  assert.equal(head(d).sub, 'b');
  d.close(); await tick(4);
});

// A deep path defeated the crumb: CSS truncates from the RIGHT, which keeps
// the segment nearest the repo root and throws away the file's own folder,
// exactly backwards. Shortening from the middle keeps both ends.
test('a deep directory keeps both its ends and elides the middle', () => {
  const c = window.fileDeck.crumbDir;
  assert.equal(c('lib/kits/'), 'lib/kits', 'short enough to say in full');
  assert.equal(c('sources/wayback/url-corpora/corpora/drs.wa.gov/'),
               'sources/…/drs.wa.gov',
               'which part of the tree, and which folder the file is in');
  assert.equal(c(''), '', 'a file at the root has no crumb to make');
});

// The deck lists itself through swipe-deck's `index` labeler, and a changeset
// is the case that wants one: the footer draws dots only while they stay
// countable, so past 25 files a reader has a progress bar and no idea what is
// around them. What a row owes is the file and what happened to it.
test('the contents name each file and what happened to it', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES, subtitle: 'b' });
  await tick(2);
  d.el.querySelector('.sd-header button[aria-haspopup]').dispatchEvent(new window.MouseEvent('click'));
  await tick(2);
  const rows = [...d.el.querySelectorAll('.sd-index > button')];
  assert.equal(rows.length, FILES.length, 'every file in the changeset, not just the mounted three');
  assert.match(rows[0].textContent, /swipe-deck\.js/);
  assert.match(rows[0].textContent, /lib\/kits · \+40 −3/,
    'the folder locates it and the counts say how much moved');
  assert.match(rows[2].textContent, /new/, 'a status worth naming is named');
  assert.ok(!/modified/.test(rows[0].textContent),
    'and the ordinary case is not, since it is most of any changeset');
  assert.match(rows[2].querySelector('i')?.className || '', /ph-file-plus/);
  assert.equal(rows[0].querySelector('i'), null, 'no glyph for the ordinary case either');
  d.close(); await tick(4);
});

test('a file with no directory keeps its whole name', () => {
  // Field by field: the kit runs in the jsdom realm, so a deepEqual against a
  // Node-realm literal fails on prototype identity alone.
  const root = window.fileDeck.split('README.md');
  assert.equal(root.dir, '');
  assert.equal(root.name, 'README.md');
  const deep = window.fileDeck.split('a/b/c.js');
  assert.equal(deep.dir, 'a/b/');
  assert.equal(deep.name, 'c.js');
});

test('nothing to read opens nothing', () => {
  assert.equal(window.fileDeck.open({ ...AT, files: [] }), null);
  assert.equal(window.fileDeck.open({ ...AT }), null);
});

test('a card is handed its options by reference, not through the x-data expression', async () => {
  mounted.length = 0;
  const d = window.fileDeck.open({ ...AT, files: FILES, subtitle: 'b' });
  await tick(4);
  assert.ok(mounted.length >= 1, 'the first slide mounted a card');
  const first = mounted.find(m => m.opts && m.opts.path === FILES[0].path);
  assert.ok(first, 'and it is the file the deck opened on');
  // The reference handoff is not a style choice: a path or a patch serialized
  // into an x-data attribute would break the expression, and inside an x-data
  // expression Alpine puts every registered component name in scope, so a bare
  // `repo` resolves to the repo DATA PROVIDER rather than to this string. The
  // same trap cardOpts documents in alpineComponents/branch-brief.js.
  assert.equal(first.opts.repo, 'me/tools');
  assert.equal(first.opts.ref, 'claude/some-branch');
  assert.equal(first.opts.base, 'main');
  assert.equal(first.opts.patch, '@@ a');
  assert.equal(first.opts.open, true,
    'a deck slide is one file, so the diff is there without a tap; the pane cannot afford that');
  d.close(); await tick(4);
});

test('it drills when given a parent and roots when not', async () => {
  const parent = window.swipeDeck.open({ count: 2, title: 'claude/some-branch', render: () => {} });
  await tick(2);
  const child = window.fileDeck.open({ ...AT, files: FILES, parent });
  await tick(2);
  assert.ok(child.el.querySelector('button[aria-label="Back"]'), 'a drilled deck returns');
  assert.equal(head(child).sub, 'claude/some-branch · lib/kits', 'and wears the parent as its crumb');
  child.close(); await tick(4);
  parent.close(); await tick(4);

  const root = window.fileDeck.open({ ...AT, files: FILES });
  await tick(2);
  assert.ok(root.el.querySelector('button[aria-label="Close"]'), 'a root deck closes');
  root.close(); await tick(4);
});

test('back: true earns the chevron without a parent deck to drill from', async () => {
  // The branch takeover is this case: chrome of its own rather than a
  // swipe-deck, so there is no handle, but dismissing still goes one level up
  // and an ✕ would promise to close something it does not close.
  const d = window.fileDeck.open({ ...AT, files: FILES, back: true });
  await tick(2);
  assert.ok(d.el.querySelector('button[aria-label="Back"]'));
  d.close(); await tick(4);
});

test('the crumb does not say the same thing twice', async () => {
  // A host that names the branch AND drills from a deck titled the branch is
  // the normal case (show-repo's branch deck does exactly that), so the
  // dedupe lives here rather than in every caller's knowledge of its parent.
  const parent = window.swipeDeck.open({ count: 2, title: 'claude/some-branch', render: () => {} });
  await tick(2);
  const child = window.fileDeck.open({ ...AT, files: FILES, parent, subtitle: 'claude/some-branch' });
  await tick(2);
  assert.equal(head(child).sub, 'claude/some-branch · lib/kits');
  child.close(); await tick(4); parent.close(); await tick(4);
});


// ── announcing the subject ──────────────────────────────────────────────────

const subject = () => window.__tossSubject;

test('the deck says what the reader is on, and keeps saying it', async () => {
  const heard = [];
  const onSay = () => heard.push(subject() ? subject().path : null);
  window.addEventListener('toss-subject', onSay);

  const d = drivable(window.fileDeck.open({ ...AT, files: FILES }));
  await tick(2);
  assert.equal(subject().path, FILES[0].path, 'on open, the file it opened on');
  assert.equal(subject().repo, 'me/tools');
  assert.equal(subject().ref, 'claude/some-branch', 'at the ref the deck is reading');
  assert.equal(subject().route, 'deck',
    'route is what tells the sidebar this file is in a document, not a frame');
  assert.equal(subject().via, undefined,
    'and the deck does not guess what app it is inside; the fab fills that in');

  d.deck.go(2);
  await tick(6);
  assert.equal(subject().path, FILES[2].path, 'and it follows the swipe');
  assert.ok(heard.length >= 2, 'each one announced, not only stamped');

  d.close(); await tick(6);
  assert.equal(subject(), null, 'leaving puts back what was there before');
  window.removeEventListener('toss-subject', onSay);
});

test('a deck opened over a toss puts the toss back, rather than clearing it', async () => {
  // show-repo can itself be running inside a toss, so the globals are borrowed
  // and returned rather than owned.
  const held = { repo: 'me/tools', ref: 'main', path: 'pages/app.html' };
  const frame = { name: 'the toss frame' };
  window.__tossSubject = held;
  window.__tossFrame = frame;

  const d = window.fileDeck.open({ ...AT, files: FILES });
  await tick(2);
  assert.equal(subject().path, FILES[0].path);
  assert.equal(window.__tossFrame, null,
    'a deck slide is in THIS document, so there is no frame to reach into');

  d.close(); await tick(6);
  assert.equal(window.__tossSubject, held);
  assert.equal(window.__tossFrame, frame);
  window.__tossSubject = null; window.__tossFrame = null;
});

test('announce: false leaves the sidebar where it was', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES, announce: false });
  await tick(2);
  assert.equal(subject() ?? null, null);
  d.close(); await tick(6);
});


// The case the first version missed, and the one every preview link hits.
//
// Inside a toss the deck runs in the FRAME, whose own fab declined to mount
// (toss-render stamps __fabHosted); the fab that is listening is the SHELL's,
// one window up. An announcement written only to `window` reached nobody, so
// the feature was invisible through exactly the link branch work is reviewed
// with. An address-mode toss is same-origin, so the frame reaches up.
test('hosted in a toss, the deck announces to the shell as well', async () => {
  const heard = [];
  const listeners = [];
  const parent = {
    __tossSubject: { repo: 'me/tools', ref: 'main', path: 'app/index.html' },
    __tossFrame: { name: 'frame' },
    document: {},
    CustomEvent: window.CustomEvent,
    dispatchEvent: (e) => {
      heard.push(e.type + ':' + (parent.__tossSubject?.path ?? 'null'));
      for (const [t, fn] of listeners) if (t === e.type) fn(e);
    },
    addEventListener: (t, fn) => listeners.push([t, fn]),
    removeEventListener: (t, fn) => {
      const i = listeners.findIndex(l => l[0] === t && l[1] === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const realParent = Object.getOwnPropertyDescriptor(window, 'parent');
  Object.defineProperty(window, 'parent', { value: parent, configurable: true });
  window.__fabHosted = true;
  try {
    const d = window.fileDeck.open({ ...AT, files: FILES });
    await tick(2);
    assert.equal(parent.__tossSubject.path, FILES[0].path, 'the shell fab is what hears it');
    assert.equal(parent.__tossFrame, null,
      'and the file is in the frame document, not a frame of its own');
    assert.ok(heard.some(h => h.startsWith('toss-subject:')), 'announced, not only stamped');

    // And the answer comes back down. The shell's fab publishes the compare
    // pair on ITS window; the cards are in this one, so the deck bridges it.
    // Without this the sidebar's compare bar would change nothing through the
    // one link branch work is actually reviewed with.
    const seen = [];
    window.addEventListener('web-tools:compare-ref', (e) => seen.push(e.detail));
    parent.dispatchEvent(new window.CustomEvent('web-tools:compare-ref',
      { detail: { repo: 'me/tools', ref: 'x', base: 'main' } }));
    assert.equal(seen.length, 1, 'the frame heard the shell’s choice');
    assert.equal(window.__compareRef.base, 'main', 'and a card mounting later reads it off the global');

    d.close(); await tick(6);
    assert.equal(window.__compareRef, null, 'leaving takes the choice with it');
    parent.dispatchEvent(new window.CustomEvent('web-tools:compare-ref',
      { detail: { base: 'other' } }));
    assert.equal(seen.length, 1, 'and the bridge is gone, not left listening on the shell');
    assert.equal(parent.__tossSubject.path, 'app/index.html',
      'leaving hands the tossed page back');
    assert.equal(parent.__tossFrame.name, 'frame');
  } finally {
    delete window.__fabHosted;
    if (realParent) Object.defineProperty(window, 'parent', realParent);
    else delete window.parent;
  }
});

// ── THE HEADER CARRIES THE FILE'S OWN CONTROLS ──────────────────────────────
//
// A slide was a row of chrome over a document: the path (already in the header,
// truncated a second way), three layout icons, a copy button and a github menu,
// with a door to the sidebar on the header beside them. Every one of those is
// about the file the header is already naming, so they moved up beside the name
// and the slide became the document (asked for 2026-09-07).
//
// READ OFF THE CARD, not rebuilt from the file row: the layouts and the links
// are decided by what the file IS, which the card alone knows, so they exist in
// alpineComponents/file-review.js and are only PLACED here.
test('the header carries the card\'s layouts and its github menu', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES });
  await tick(4);
  const titles = [...d.el.querySelectorAll('.sd-header button')].map(b => b.title || '');
  for (const t of ['Read', 'Compare, side by side', 'Compare, inline', 'This file on GitHub'])
    assert.ok(titles.includes(t), t + ' is on the header: ' + JSON.stringify(titles));

  // IDENTITY THEN ARRANGEMENT, the order the card's own row reads: its github
  // menu is order-2 on a reading surface, beside the name, and order-11 in a
  // list. This header IS the name, so the mark takes the end nearest the title
  // rather than trailing the layouts, which is where it shipped for a day.
  const own = titles.filter(t => ['This file on GitHub', 'Read',
    'Compare, side by side', 'Compare, inline'].includes(t));
  assert.deepEqual(own, ['This file on GitHub', 'Read',
    'Compare, side by side', 'Compare, inline'],
    'github leads the cluster: ' + JSON.stringify(own));

  // The one that is lit is the card's answer, not the header's own state.
  const lit = [...d.el.querySelectorAll('.sd-header button')]
    .filter(b => b.className.includes('btn-active')).map(b => b.title);
  assert.deepEqual(lit, ['Read'], 'the card says which reading is showing');

  // And a tap reaches the card rather than being handled up here. THIS deck's
  // active slide, not the first card the file ever mounted: the map outlives
  // every case in this file.
  const slide = d.deck.track.children[d.deck.active()];
  const card = cards.get(slide.querySelector('[x-data^="fileReview"]'));
  assert.ok(card, 'the slide has a card');
  d.el.querySelector('.sd-header button[title="Compare, inline"]').click();
  assert.deepEqual(card.picked, ['unified'], 'the header asks the card to move');
  d.close(); await tick(6);
});

// The menu is the KIT's, because placing it is the half only the kit can
// answer: it hangs inside the header's stacking context, above the track.
test('the github menu opens under its button, from the kit', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES });
  await tick(4);
  const btn = d.el.querySelector('.sd-header button[title="This file on GitHub"]');
  btn.click();
  const box = d.el.querySelector('.sd-hdr-menu');
  assert.ok(box, 'a menu appeared');
  assert.ok(btn.parentElement.contains(box), 'anchored to the action cluster, not the page');
  assert.deepEqual([...box.querySelectorAll('a')].map(a => a.getAttribute('href')),
    ['https://x/1', 'https://x/raw'], 'carrying the card\'s own links');
  assert.equal(box.querySelector('a').target, '_blank');
  d.close(); await tick(6);
});

// THE DOOR TO THE SIDEBAR IS GONE, and the announcement is not. The deck still
// aims the drawer at the file being read, so opening it from the launcher lands
// here; what went is a second thing to look at on a row with none to spare
// (asked for 2026-09-07, having been added for discoverability).
test('no door to the sidebar on the header, and it still announces', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES });
  await tick(4);
  assert.equal(d.el.querySelector('button[title="Open the sidebar for this file"]'), null,
    'the header carries the file\'s controls and nothing else');
  assert.ok(window.__tossSubject && window.__tossSubject.path,
    'and the sidebar is still aimed at the file: ' + JSON.stringify(window.__tossSubject));
  d.close(); await tick(6);
});

// A HOSTED CARD DRAWS NOTHING, which is the other half of the same contract:
// the header is drawing its name and its controls, so a card that also drew
// them would be the duplication this pass removed.
test('the card is mounted hosted, with a way to keep the header in step', async () => {
  mounted.length = 0;
  const d = window.fileDeck.open({ ...AT, files: FILES });
  await tick(4);
  const first = mounted.find(m => m.opts && m.opts.path === FILES[0].path);
  assert.equal(first.opts.hosted, true, 'the host draws its chrome');
  assert.equal(first.opts.read, true, 'and it is a reading surface');
  assert.equal(typeof first.opts.onChrome, 'function',
    'with a callback, since the header cannot watch Alpine state from out here');
  d.close(); await tick(6);
});


// ── re-addressing, rather than being navigated away from ────────────────────
//
// The sidebar's ref bar renders a file at another ref by going TO the
// renderer. Over a deck that is the wrong answer: the reader is thirty files
// into a changeset, and leaving for a single-file renderer throws away the
// list, their place in it, and the way back. The deck publishes a handle, the
// fab tries it first, and a false answer is the deck saying it genuinely
// cannot show that file.

test('the deck answers a re-address in place, and stops speaking for the compare', async () => {
  mounted.length = 0;
  const d = drivable(window.fileDeck.open({ ...AT, files: FILES, subtitle: 'b' }));
  await tick(4);
  assert.equal(typeof window.__deckNavigate, 'function', 'the handle is published while it is open');
  const first = mounted.find(m => m.opts && m.opts.path === FILES[0].path);
  assert.equal(first.opts.ref, 'claude/some-branch');
  assert.equal(first.opts.patch, '@@ a');

  mounted.length = 0;
  assert.equal(window.__deckNavigate({ repo: 'me/tools', ref: 'main', path: FILES[0].path }), true);
  await tick(4);
  const again = mounted.find(m => m.opts && m.opts.path === FILES[0].path);
  assert.ok(again, 'the slide was rebuilt rather than the page navigated');
  assert.equal(again.opts.ref, 'main', 'at the ref that was asked for');
  // Everything the compare said is a fact about the BRANCH. Carrying it onto
  // another ref would show a patch of changes that are not in the file.
  assert.equal(again.opts.patch, '', 'the patch belonged to the branch');
  assert.equal(again.opts.status, '');
  assert.equal(again.opts.additions, null);
  assert.equal(head(d).sub, 'main · b · lib/kits',
    'and the crumb leads with where the reader is, which is no longer the branch');

  d.close(); await tick(6);
  assert.ok(!window.__deckNavigate, 'and the handle goes with it');
});

test('a file the deck does not hold is a real navigation, and it says so', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES });
  await tick(3);
  assert.equal(window.__deckNavigate({ repo: 'me/tools', path: 'docs/elsewhere.md' }), false,
    'not in this changeset');
  assert.equal(window.__deckNavigate({ repo: 'other/repo', path: FILES[0].path }), false,
    'nor is another repo the deck to show it');
  d.close(); await tick(4);
});

test('a deck that does not announce does not claim the handle either', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES, announce: false });
  await tick(3);
  assert.ok(!window.__deckNavigate,
    'announce:false is a deck that should not retarget the sidebar, in either direction');
  d.close(); await tick(4);
});
