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

// A TRACK THAT CAN ACTUALLY BE DRIVEN, which this file needed all along.
// jsdom has no layout and no Element.prototype.scrollTo, so `go()` threw inside
// jsdom's event dispatch on every arrow key. The throw was invisible: node
// printed it as a diagnostic and still counted the file green, and the one
// assertion that depended on it ("the branch deck did not step") passed for the
// wrong reason, since nothing had stepped at all. It surfaced on CI 2026-08-23,
// where the same uncaught error landed inside the run's accounting and failed
// it, on a tree whose only change was elsewhere. Six lines of geometry make the
// track real, the same shape file-deck.test.mjs already uses.
Object.defineProperty(window.Element.prototype, 'clientWidth', { value: 400, configurable: true });
window.Element.prototype.scrollTo = function ({ left }) {
  Object.defineProperty(this, 'scrollLeft', { value: left, configurable: true, writable: true });
  this.dispatchEvent(new window.Event('scroll'));
};
const deck = (title, count = 3, extra = {}) =>
  sd.open({ count, title, render: (i, el) => { el.textContent = title + ' ' + i; }, ...extra });
const key = (k) => window.dispatchEvent(Object.assign(new window.KeyboardEvent('keydown', { key: k })));
const pop = () => window.dispatchEvent(new window.Event('popstate'));
// The kit's stable hook, not its Tailwind frame: the overlay's inset classes
// became variables when the takeover moved into the app's view pane, and this
// counted zero decks while two were on screen.
const overlays = () => window.document.body.querySelectorAll('.sd-overlay').length;
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
  assert.equal(inner.deck.active(), 1, 'the file deck, being on top, took the key');
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

// ── eviction ─────────────────────────────────────────────────────────────────
//
// Building lazily was only half the job: `built[i]` never cleared, so a deck
// retained every slide the reader had ever visited. Free when a slide is inert
// DOM, and not free at all when it is a live app. Measured 2026-08-13 by
// stepping show-repo's branch deck through twelve branches of a fourteen-file
// changeset: twelve mounted branch views, 168 mounted file cards, and the DOM
// climbing 7,100 → 25,160 nodes, monotonically. Zero network requests over the
// same eleven steps, so it was never a download; it just got slower the longer
// you read.

// jsdom has no layout and no scrollTo, and the deck computes in units of the
// track's width. Six lines make the track real enough to page.
const drivable = (core, width = 400) => {
  const t = core.track;
  Object.defineProperty(t, 'clientWidth', { value: width, configurable: true });
  let left = 0;
  Object.defineProperty(t, 'scrollLeft', { configurable: true, get: () => left, set: v => { left = v; } });
  t.scrollTo = ({ left: v }) => { left = v; t.dispatchEvent(new window.Event('scroll')); };
  return core;
};

test('a slide the reader has left is emptied, and rebuilt on return', async () => {
  const built = [], freed = [];
  const c = drivable(sd.core(8, (i, el) => { built.push(i); el.textContent = 'slide ' + i; },
                             { keep: 1, release: (i) => freed.push(i) }));
  await tick(3);
  assert.equal(c.builtCount, 2, 'open builds the first slide and its neighbour');

  c.go(4);
  await tick(3);
  assert.deepEqual(freed.slice().sort(), [0, 1], 'the slides two behind are let go');
  assert.equal(c.builtCount, 3, 'and what is held is the reader’s slide and its neighbours');
  assert.equal(c.track.children[0].textContent, '', 'the far slide is empty DOM, not a live tree');

  const seen = built.length;
  c.go(0);
  await tick(3);
  assert.ok(built.slice(seen).includes(0), 'coming back renders it again');
  assert.equal(c.track.children[0].textContent, 'slide 0');
});

test('one slide of hysteresis, so a step back does not rebuild', async () => {
  const built = [];
  const c = drivable(sd.core(8, (i) => built.push(i), { keep: 2 }));
  await tick(3);
  c.go(2); await tick(3);
  const seen = built.length;
  c.go(1); await tick(3);
  assert.equal(built.length, seen, 'slide 1 was still held, so nothing was rendered twice');
});

test('closing lets every slide go, not just the far ones', async () => {
  const freed = [];
  const d = sd.open({ count: 4, title: 'x', render: (i, el) => { el.textContent = String(i); },
                      release: (i) => freed.push(i) });
  await tick(3);
  assert.equal(d.deck.builtCount, 2);
  d.close();
  await tick(5);
  assert.deepEqual(freed.slice().sort(), [0, 1],
    'a deck that leaves takes its live slides with it, which is where a mount’s references are handed back');
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

const fire = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));

// The desktop margin is the only part of the overlay a reader can hit, and it
// used to do nothing. The stage's dialog dismissed on an outside click before
// it moved onto this kit, so the affordance is a restoration rather than an
// invention; making it the kit's means every deck has it.
test('a click on the ground beside the panel dismisses, a click inside does not', async () => {
  const d = deck('one');
  await tick(3);

  fire(d.el.querySelector('h1'));
  await tick(3);
  assert.ok(d.el.isConnected, 'a click on the header is a click in the deck, not out of it');

  fire(d.el);
  await tick(5);
  assert.ok(!d.el.isConnected, 'a click on the overlay itself leaves');
});

// A click that STARTS inside and is released on the ground is a drag or a
// selection, not a dismissal, and `e.target === overlay` is what tells them
// apart: the event's target is the element it was dispatched on.
test('only the topmost deck answers a click on the ground', async () => {
  const under = deck('under');
  await tick(3);
  const over = sd.drill(under, { count: 2, title: 'over', render: (i, el) => { el.textContent = String(i); } });
  await tick(3);

  fire(under.el);
  await tick(5);
  assert.ok(under.el.isConnected, 'the deck beneath does not leave while another is on top');

  over.close(); await tick(3);
  under.close(); await tick(3);
});

