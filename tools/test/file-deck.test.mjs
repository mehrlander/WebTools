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
window.Alpine = { initTree: (el) => {
  const expr = el.getAttribute('x-data') || '';
  const m = /^fileReview\(window\.(\w+)\)$/.exec(expr);
  mounted.push(m ? { key: m[1], opts: window[m[1]] } : { raw: expr });
} };

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

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

test('the header offers a door to the sidebar, and only where it announces', async () => {
  const d = window.fileDeck.open({ ...AT, files: FILES });
  await tick(2);
  const btn = d.el.querySelector('button[title="Open the sidebar for this file"]');
  assert.ok(btn, 'a centred desktop deck says nothing about the fab unless it does');
  let asked = null;
  const on = (e) => { asked = e.detail && e.detail.tab; };
  window.addEventListener('web-tools:open-drawer', on);
  btn.click();
  assert.equal(asked, 'render', 'and it opens on the tab that answers "which version"');
  window.removeEventListener('web-tools:open-drawer', on);
  d.close(); await tick(6);

  const quiet = window.fileDeck.open({ ...AT, files: FILES, announce: false });
  await tick(2);
  assert.ok(!quiet.el.querySelector('button[title="Open the sidebar for this file"]'),
    'a deck that does not retarget the sidebar must not offer to open it');
  quiet.close(); await tick(6);
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
