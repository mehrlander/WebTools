// kits/dock-split.js — the drag handle between two panes.
//
// Driven over jsdom with synthetic pointer and key events. What is pinned is
// the part that is easy to get wrong and invisible when it is: where the
// listeners live, that a drag survives the pointer leaving the 6px track, that
// the clamp holds at both ends, and that the keyboard half exists at all.
//
// That last one is the reason this file is not just a port test. The
// implementation this kit came from (home's budget-drs app) carries
// `role="separator"` with no tabindex and no key handler, so it announces a
// control to a screen reader and then ignores it. A test is the only thing that
// keeps the fix from being dropped the next time someone ports it onward.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow } from './bootstrap.mjs';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/dock-split.js'), 'utf8');

function mount() {
  const { window } = makeWindow({
    html: '<!doctype html><html><body><div id="h"></div></body></html>',
  });
  // jsdom has no PointerEvent and no capture; the kit guards both, which is
  // exactly what this stands in for.
  window.requestAnimationFrame = (fn) => { fn(); return 1; };
  new Function('window', 'document', src)(window, window.document);
  return window;
}

// A 1000px-wide window, so a percentage reads as a round number of pixels.
const BOUNDS = { left: 0, right: 1000, width: 1000, top: 0, bottom: 800, height: 800 };

function wire(window, over = {}) {
  const handle = window.document.getElementById('h');
  let pct = 30;
  const seen = { change: [], commit: [] };
  const ctl = window.dockSplit.attach(handle, {
    axis: 'col', from: 'end',
    bounds: () => BOUNDS,
    value: () => pct,
    onChange: p => { pct = p; seen.change.push(p); },
    onCommit: p => { pct = p; seen.commit.push(p); },
    ...over,
  });
  return { handle, ctl, seen, get pct(){ return pct; } };
}

function press(window, handle, x, y = 400) {
  const e = new window.Event('pointerdown', { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0 });
  handle.dispatchEvent(e);
}
function movePointer(window, x, y = 400) {
  const e = new window.Event('pointermove', { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: 1 });
  window.dispatchEvent(e);
}
function release(window) {
  window.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
}

test('the handle announces itself as an operable separator, keyboard included', () => {
  const window = mount();
  const { handle } = wire(window);
  assert.equal(handle.getAttribute('role'), 'separator');
  assert.equal(handle.getAttribute('aria-orientation'), 'vertical');
  assert.equal(handle.getAttribute('tabindex'), '0', 'a separator nothing can focus is a promise it cannot keep');
  assert.equal(handle.getAttribute('aria-valuenow'), '30');
  assert.equal(handle.getAttribute('aria-valuemin'), '20');
  assert.equal(handle.getAttribute('aria-valuemax'), '80');
});

test('a drag reports a percentage measured from the end it was told to measure from', () => {
  const window = mount();
  const w = wire(window);
  press(window, w.handle, 700);
  movePointer(window, 600);            // 400px from the right of 1000 = 40%
  assert.equal(w.pct, 40);
  release(window);
  assert.deepEqual(w.seen.commit, [40], 'one commit, on release, not one per frame');
});

test('the drag survives the pointer leaving the track, because the listeners are on the window', () => {
  const window = mount();
  const w = wire(window);
  press(window, w.handle, 700);
  // Nowhere near the handle: a pointermove on the handle itself would have
  // stopped reporting the moment the finger outran it.
  movePointer(window, 350, 12);
  assert.equal(w.pct, 65);
  release(window);
  assert.equal(w.seen.commit.at(-1), 65);
});

test('the clamp holds at both ends, so a pane cannot be dragged shut', () => {
  const window = mount();
  const w = wire(window);
  press(window, w.handle, 700);
  movePointer(window, 995);            // 0.5% of the window
  assert.equal(w.pct, 20);
  movePointer(window, 2);              // 99.8%
  assert.equal(w.pct, 80);
  release(window);
});

test('a release with no move commits the value it started on rather than nothing', () => {
  const window = mount();
  const w = wire(window);
  press(window, w.handle, 700);
  release(window);
  assert.deepEqual(w.seen.commit, [30]);
});

test('pointercancel ends the drag as cleanly as pointerup, and clears the document classes', () => {
  const window = mount();
  const w = wire(window);
  press(window, w.handle, 700);
  assert.ok(window.document.documentElement.classList.contains('dk-dragging'));
  assert.ok(window.document.documentElement.classList.contains('dk-dragging-col'));
  window.dispatchEvent(new window.Event('pointercancel', { bubbles: true }));
  assert.ok(!window.document.documentElement.classList.contains('dk-dragging'),
    'a cancelled drag that leaves the cursor locked reads as a frozen page');
  movePointer(window, 100);
  assert.equal(w.pct, 30, 'and stops tracking');
});

test('the arrows move the seam, and the direction follows which end is measured', () => {
  const window = mount();
  const w = wire(window);
  const key = (k) => {
    const e = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(e, { key: k, preventDefault(){} });
    w.handle.dispatchEvent(e);
  };
  // Measuring from the end: Left grows the pane, since the pane is on the right.
  key('ArrowLeft');  assert.equal(w.pct, 32);
  key('ArrowRight'); assert.equal(w.pct, 30);
  key('PageUp');     assert.equal(w.pct, 40);
  key('Home');       assert.equal(w.pct, 80);
  key('End');        assert.equal(w.pct, 20);
  key('ArrowRight'); assert.equal(w.pct, 20, 'and the clamp holds for keys too');
  assert.equal(w.handle.getAttribute('aria-valuenow'), '20');
  // Every key press is a commit: there is no release to wait for.
  assert.equal(w.seen.commit.length, 6);
});

test('a row split measures the other axis and takes the other arrows', () => {
  const window = mount();
  const w = wire(window, { axis: 'row' });
  assert.equal(w.handle.getAttribute('aria-orientation'), 'horizontal');
  assert.ok(w.handle.classList.contains('is-row'));
  press(window, w.handle, 500, 600);
  movePointer(window, 500, 600);       // 200px from the bottom of 800 = 25%
  assert.equal(w.pct, 25);
  release(window);
});

test('destroy leaves the handle as it found it', () => {
  const window = mount();
  const w = wire(window);
  w.ctl.destroy();
  assert.ok(!w.handle.classList.contains('dk-split'));
  assert.equal(w.handle.querySelector('.dk-readout'), null);
  press(window, w.handle, 700);
  movePointer(window, 600);
  assert.equal(w.pct, 30, 'a destroyed splitter drags nothing');
});
