// kits/file-deck.js — a changeset's files, one per slide.
//
// The Files pane is for SCANNING and this is for READING, and the split is the
// whole design: the pane keeps thirty hairline rows a reader can sweep, and the
// deck takes one file at a time with the diff already open. The deck can afford
// that because swipe-deck mounts the active slide and its two neighbours, so
// three cards exist at once no matter how long the changeset is; the pane
// cannot, which is why it hedges its cards closed past a dozen files.
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
for (const f of ['lib/kits/swipe-deck.js', 'lib/kits/file-deck.js']) {
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
  assert.equal(head(d).sub, 'claude/some-branch · lib/kits/');
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
  assert.equal(head(child).sub, 'claude/some-branch · lib/kits/', 'and wears the parent as its crumb');
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
