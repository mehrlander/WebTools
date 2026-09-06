// lib/kits/land.js — where the reader was just sent.
//
// The kit splits by what a realm can answer. The GEOMETRY (a landing sits a
// quarter down; only the scroller moves; a target already in view does not
// jump) needs real layout and is asserted in tools/test/land-geometry.mjs. What
// is here is the half a DOM without layout can hold: which classes go on, when
// they come off, and the three options whose whole purpose is to NOT do
// something.
//
// Those options are where the defects live. `tint: false` exists because the
// row the reader is already on must be kept in view without being lit, and a
// kit that lit it would answer a question nobody asked. The dwell is per
// element because a second landing elsewhere must not clear this one's mark.
// Neither is visible in a screenshot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
// jsdom carries no matchMedia, and the kit guards its own call, so the default
// realm is the "no preference" case. The reduced-motion test installs one.
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/land.js'), 'utf8'))();
const Land = window.Land;

// jsdom implements no scrollIntoView, and the kit calls it for a target in no
// scroller. Stubbed here rather than guarded in the kit: the gap is the test
// realm's, and a `?.` in shipped code would quietly skip a real scroll on any
// browser that ever lacked it.
const el = () => {
  const d = window.document.createElement('div');
  d.scrollIntoView = () => {};
  window.document.body.appendChild(d);
  return d;
};
const lit = (d) => Land.MARK.every(c => d.classList.contains(c));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('a landing tints its target and fades the tint on its own', async () => {
  // A mark that stays turns into a claim about the document rather than an
  // answer to "did this land", which is a question asked once.
  const d = el();
  Land.mark(d, { dwell: 40 });
  assert.ok(lit(d), 'lit on arrival');
  assert.ok(Land.FADE.every(c => d.classList.contains(c)), 'and carries the transition');
  await wait(90);
  assert.ok(!lit(d), 'and the tint is gone');
  assert.ok(Land.FADE.every(c => d.classList.contains(c)),
    'the transition stays, since removing it with the tint would cut the fade');
});

test('the dwell is per element, so one landing cannot clear another', async () => {
  // Two addresses resolving in quick succession is the ordinary case on a
  // surface with a search. A single shared timer would have the first one's
  // expiry take the second one's mark down, which reads as the highlight
  // refusing to appear at all.
  const a = el(), b = el();
  Land.mark(a, { dwell: 40 });
  await wait(25);
  Land.mark(b, { dwell: 200 });
  await wait(40);
  assert.ok(!lit(a), 'the first has faded on its own schedule');
  assert.ok(lit(b), 'and the second is still lit');
});

test('marking the same element again restarts its dwell', async () => {
  const d = el();
  Land.mark(d, { dwell: 60 });
  await wait(40);
  Land.mark(d, { dwell: 60 });
  await wait(40);
  assert.ok(lit(d), 'the older timer was cancelled, not left to fire mid-dwell');
});

test('tint:false moves without marking, for the end the reader is already on', () => {
  // The pair is one landing with two ends: the far end is news and the near end
  // is the row that was tapped. Lighting the near end says "here" about a place
  // the reader never left.
  const d = el();
  assert.equal(Land.mark(d, { tint: false }), true);
  assert.ok(!lit(d));
  assert.ok(!Land.FADE.some(c => d.classList.contains(c)), 'and takes no transition either');
});

test('clear takes down every mark under a root, timers included', async () => {
  const box = el();
  const a = window.document.createElement('div');
  const b = window.document.createElement('div');
  a.scrollIntoView = b.scrollIntoView = () => {};
  box.append(a, b);
  Land.mark(a, { dwell: 5000 });
  Land.mark(b, { dwell: 5000 });
  Land.clear(box);
  assert.ok(!lit(a) && !lit(b), 'both are down before their dwell');
});

test('a missing element is not an error', () => {
  // Callers resolve a target by searching rendered prose, and a miss is an
  // ordinary outcome: the document is open and right, only the anchor is not.
  assert.equal(Land.mark(null), false);
  assert.equal(Land.scrollerOf(null), null);
});

test('reduced motion turns the animation off rather than the landing', async () => {
  // The mark still lands; only the smooth scroll goes. A reader who asked for
  // less motion should lose the animation, not the answer.
  const seen = [];
  const d = el();
  const box = window.document.createElement('div');
  box.style.overflowY = 'auto';
  Object.defineProperty(box, 'scrollHeight', { value: 900 });
  Object.defineProperty(box, 'clientHeight', { value: 100 });
  box.scrollTo = (o) => seen.push(o.behavior);
  box.appendChild(d);
  window.document.body.appendChild(box);

  window.matchMedia = () => ({ matches: false });
  Land.mark(d, { dwell: 20 });
  window.matchMedia = () => ({ matches: true });
  Land.mark(d, { dwell: 20 });
  // 'instant', not 'auto': 'auto' defers to the element's computed
  // scroll-behavior, so on a scroller carrying `scroll-smooth` it would animate
  // the scroll of the reader who asked that it not.
  assert.deepEqual(seen, ['smooth', 'instant']);
  assert.ok(lit(d), 'and it is still lit either way');
});

test('a set has a current member, drawn stronger than the rest', () => {
  // pdf.js draws the active find hit strong and the others weak, so a reader
  // stepping through seven hits sees both where they are and how many there
  // are. A set lit identically can only say "these seven".
  const a = el(), b = el();
  Land.mark(a, { dwell: 5000 });
  Land.mark(b, { dwell: 5000, current: false, scroll: false });
  assert.ok(Land.MARK.every(c => a.classList.contains(c)), 'the current one is strong');
  assert.ok(Land.MARK_REST.every(c => b.classList.contains(c)), 'and the rest are weak');
  assert.ok(!Land.MARK.some(c => b.classList.contains(c)), 'a member is one or the other');
});

test('a member promoted to current drops the weaker mark', () => {
  // Stepping to the next hit re-marks a row that is already lit. Adding the
  // strong class without removing the weak one leaves both, which paints the
  // sum of the two rather than either.
  const d = el();
  Land.mark(d, { dwell: 5000, current: false });
  Land.mark(d, { dwell: 5000 });
  assert.ok(Land.MARK.every(c => d.classList.contains(c)));
  assert.ok(!Land.MARK_REST.some(c => d.classList.contains(c)));
});

test('clear takes down both strengths', () => {
  const box = el();
  const a = window.document.createElement('div');
  const b = window.document.createElement('div');
  a.scrollIntoView = b.scrollIntoView = () => {};
  box.append(a, b);
  Land.mark(a, { dwell: 5000 });
  Land.mark(b, { dwell: 5000, current: false });
  Land.clear(box);
  assert.ok(![...Land.MARK, ...Land.MARK_REST].some(c =>
    a.classList.contains(c) || b.classList.contains(c)));
});

test('the overlay palette is stronger than the flow palette', () => {
  // Not a preference: a rectangle over a rendered page multiplies against
  // white and reads paler than the same percentage does behind DOM text.
  assert.ok(Land.PAGE.current > Land.FLOW.current);
  assert.ok(Land.PAGE.rest > Land.FLOW.rest);
  assert.ok(Land.FLOW.current > Land.FLOW.rest, 'and current beats rest on both');
  assert.ok(Land.PAGE.current > Land.PAGE.rest);
  assert.match(Land.tint(45), /var\(--color-warning\) 45%/,
    'the tint reads the theme token rather than a hex');
  assert.match(Land.OVERLAY, /mix-blend-mode:\s*multiply/,
    'an overlay multiplies, so it sits under the glyphs it covers');
});

test('a landing is re-asserted once the layout settles under it', async () => {
  // A scroll is taken against the scroller's size at that instant, and a pane
  // that is still being laid out (a docked split, a deck slide just filled)
  // grows under it. Measured in mehrlander/home from a search result on a
  // phone: found, marked, and the pane still showing the first line. So the
  // kit reads the target again once the frame has settled and moves only if
  // it changed; a stable pane costs two comparisons and no second scroll.
  const seen = [];
  const box = window.document.createElement('div');
  box.style.overflowY = 'auto';
  Object.defineProperty(box, 'scrollHeight', { value: 900 });
  Object.defineProperty(box, 'clientHeight', { value: 100 });
  box.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 });
  box.scrollTo = (o) => seen.push(Math.round(o.top));
  const d = window.document.createElement('div');
  let top = 100;
  d.getBoundingClientRect = () => ({ top, bottom: top + 20 });
  box.appendChild(d);
  window.document.body.appendChild(box);

  Land.mark(d, { dwell: 20 });
  top = 300;                      // the layout moved after the first scroll
  await wait(450);
  assert.deepEqual(seen, [72, 272], 'scrolled once, then again to where the target went');

  seen.length = 0; top = 100;
  Land.mark(d, { dwell: 20 });
  await wait(450);
  assert.deepEqual(seen, [72], 'a pane that did not move is not scrolled twice');

  seen.length = 0;
  Land.mark(d, { dwell: 20, settle: false });
  top = 300;
  await wait(450);
  assert.deepEqual(seen, [72], 'settle:false scrolls exactly once');
});
