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
  assert.deepEqual(seen, ['smooth', 'auto']);
  assert.ok(lit(d), 'and it is still lit either way');
});
