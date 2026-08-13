// kits/swipe-deck.js — stacking, and the drill that rests on it.
//
// A deck opened from inside a deck is how drilling works: the child covers the
// parent, the header becomes the child's, and leaving the child returns you to
// the parent at the slide you left it on. That is a navigation stack, not
// visible nesting, and it is the shape chosen over a nested pager (the outer
// axis has no meaning at the inner position: files are not aligned across
// branches) and over a level picker (a mode has to be remembered; a place has a
// back button).
//
// Two things made it impossible until 2026-08-13, both found by opening one
// deck inside another in a real browser and driving it. Every deck registered
// its own `popstate`, so one Back closed the whole stack, which is the return
// path itself. And every deck registered its own `keydown`, so one ArrowRight
// stepped the child AND the parent underneath it, landing the reader on a slide
// they never chose with nothing on screen saying so.
//
// Both are one mistake, a deck assuming it is alone, and the cases below are
// the guard: only the top of the stack answers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
const sd = window.swipeDeck;

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));
const deck = (title, count = 3, extra = {}) =>
  sd.open({ count, title, render: (i, el) => { el.textContent = title + ' ' + i; }, ...extra });
const key = (k) => window.dispatchEvent(Object.assign(new window.KeyboardEvent('keydown', { key: k })));
const pop = () => window.dispatchEvent(new window.Event('popstate'));
const overlays = () => window.document.body.querySelectorAll('.fixed.inset-0').length;
// The stack is built inside the jsdom realm, so an array off it has jsdom's
// Array prototype and deepEqual fails on identity alone (the estate suites hit
// the same wall). Compare the titles as one string.
const titles = () => sd.stack.map(d => d.title).join(',');

test('opening pushes onto the stack; the last one opened is the top', async () => {
  const outer = deck('branches');
  await tick();
  assert.equal(sd.stack.length, 1);
  assert.equal(sd.top(), outer);
  assert.equal(outer.onTop, true);

  const inner = deck('files', 4);
  await tick();
  assert.equal(sd.stack.length, 2);
  assert.equal(sd.top(), inner);
  assert.equal(outer.onTop, false, 'the parent is still open, it is just not the one being read');
  assert.equal(overlays(), 2, 'both are in the DOM; the child simply covers the parent');
});

test('one Back pops one deck, and the parent is still there underneath', async () => {
  pop();
  await tick();
  assert.equal(sd.stack.length, 1, 'the child left');
  assert.equal(sd.top().title, 'branches', 'and the parent is what the reader is back on');
  assert.equal(overlays(), 1);

  pop();
  await tick();
  assert.equal(sd.stack.length, 0, 'a second Back leaves the last one too');
  assert.equal(overlays(), 0);
});

test('only the top deck answers a key', async () => {
  const outer = deck('branches', 5);
  await tick();
  const inner = deck('files', 5);
  await tick();
  const outerAt = outer.deck.active();

  key('ArrowRight');
  await tick(3);
  assert.equal(outer.deck.active(), outerAt,
    'the branch deck did not step under a key meant for the file deck');

  key('Escape');
  await tick(3);
  assert.equal(sd.stack.length, 1, 'Escape dismissed the child only');
  assert.equal(sd.top(), outer);
  outer.close();
  await tick(3);
});

// Leaving a level takes the levels above it. Nothing in the app closes a
// parent from under a live child, but the alternative reading (close the middle
// one, leave its child floating over a deck it did not come from) is incoherent
// enough that the answer belongs in the kit rather than in each caller's care.
test('leaving a deck leaves everything stacked on it', async () => {
  const a = deck('a'), b = deck('b'), c = deck('c');
  await tick();
  assert.equal(sd.stack.length, 3);
  b.close();                      // the middle one, by its own handle
  await tick(5);
  assert.equal(titles(), 'a', 'b and the c above it both went');
  assert.equal(sd.top(), a);
  a.close(); await tick(5);
  assert.equal(sd.stack.length, 0);
});

// ── drill ────────────────────────────────────────────────────────────────────

test('drill: the dismiss button becomes a back chevron, since it returns', async () => {
  const parent = deck('claude/some-branch');
  await tick();
  const child = sd.drill(parent, { count: 2, title: 'app.js', render: () => {} });
  await tick();

  const btn = child.el.querySelector('button[aria-label="Back"]');
  assert.ok(btn, 'a drilled deck says Back, not Close');
  assert.ok(btn.querySelector('.ph-caret-left'), 'and shows the chevron');
  assert.ok(!parent.el.querySelector('button[aria-label="Back"]'),
    'the root still closes, because that is what it does');
  child.close(); await tick(3); parent.close(); await tick(3);
});

test('drill: the parent is the head of the child’s breadcrumb', async () => {
  const parent = deck('claude/some-branch');
  await tick();
  const child = sd.drill(parent, { count: 2, title: 'app.js', subtitle: 'lib/', render: () => {} });
  await tick();
  assert.equal(child.el.querySelector('h1 + p').textContent, 'claude/some-branch · lib/',
    'the crumb says where you are on both levels, and offers to change neither');
  child.close(); await tick(3); parent.close(); await tick(3);
});

test('the header is writable, which is how a deck follows its own slides', async () => {
  const d = deck('one');
  await tick();
  d.setTitle('two');
  d.setSubtitle('a · b');
  assert.equal(d.title, 'two');
  assert.equal(d.el.querySelector('h1').textContent, 'two');
  assert.equal(d.el.querySelector('h1 + p').textContent, 'a · b');
  d.close(); await tick(3);
});
