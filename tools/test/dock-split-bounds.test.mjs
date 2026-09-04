// kits/dock-split.js: where the handle is allowed to stop.
//
// `min` and `max` took numbers only, which is fine for a stop expressed as a
// share of the container and wrong for one expressed in pixels: 300px is 31% of
// a 980px pane and 16% of a 1920px one. A caller with a pixel floor therefore
// opened these wide and clamped again inside onChange, which left aria-valuemin
// and aria-valuemax reporting stops the handle never honoured. They now take a
// function too, read on every clamp rather than frozen at attach.
//
// jsdom has no layout, so `bounds` is supplied as a literal rect and nothing
// here asserts geometry; what is under test is the arithmetic and the aria
// stamps. setPointerCapture does not exist in jsdom either, which exercises the
// kit's own try/catch around it: an unguarded throw there attaches no listeners
// and the splitter silently does not drag.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, loadKit } from './bootstrap.mjs';

const RECT = { left: 0, right: 1000, width: 1000, top: 0, bottom: 500, height: 500 };

// A mounted handle plus the caller state the kit reads and writes. `from: end`
// throughout, so the pane being sized is the one at the right and a bigger
// percentage means a seam further left.
function mount(opts = {}) {
  const { window } = makeWindow();
  loadKit('dock-split', { window });
  const handle = window.document.createElement('div');
  window.document.body.appendChild(handle);

  const state = { pct: 50, changes: [], commits: [] };
  const split = window.dockSplit.attach(handle, {
    axis: 'col',
    from: 'end',
    bounds: () => RECT,
    value: () => state.pct,
    onChange: (p) => { state.pct = p; state.changes.push(p); },
    onCommit: (p) => { state.commits.push(p); },
    ...opts,
  });

  const key = (k) => handle.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  // The kit listens on window after pointerdown, since a captured event still
  // bubbles there; a MouseEvent carries the clientX the move handler reads.
  const drag = (clientX) => {
    handle.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new window.MouseEvent('pointermove', { clientX, bubbles: true }));
    window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
  };
  const aria = () => ({
    now: handle.getAttribute('aria-valuenow'),
    min: handle.getAttribute('aria-valuemin'),
    max: handle.getAttribute('aria-valuemax'),
  });
  return { window, handle, state, split, key, drag, aria };
}

test('numeric bounds clamp and are reported, as they always were', () => {
  const { state, key, aria } = mount({ min: 20, max: 80 });
  assert.deepEqual(aria(), { now: '50', min: '20', max: '80' });

  key('Home');                       // from: end, so Home is the far stop
  assert.equal(state.pct, 80);
  key('End');
  assert.equal(state.pct, 20);
  assert.equal(aria().now, '20');
});

test('omitting both bounds keeps the documented 20 and 80 defaults', () => {
  const { state, key, aria } = mount();
  assert.deepEqual(aria(), { now: '50', min: '20', max: '80' });
  key('Home');
  assert.equal(state.pct, 80);
});

test('a function bound clamps at what it returns', () => {
  const { state, key, aria } = mount({ min: () => 30, max: () => 70 });
  assert.deepEqual(aria(), { now: '50', min: '30', max: '70' });
  key('Home');
  assert.equal(state.pct, 70);
  key('End');
  assert.equal(state.pct, 30);
});

test('a function bound is read on every clamp, not frozen at attach', () => {
  const stops = { lo: 30, hi: 70 };
  const { state, key, aria } = mount({ min: () => stops.lo, max: () => stops.hi });
  key('End');
  assert.equal(state.pct, 30);

  // The container changed, so the pixel floor is now a different percentage.
  stops.lo = 45;
  key('End');
  assert.equal(state.pct, 45, 'the new floor is honoured');
  assert.equal(aria().min, '45', 'and reported, which is the whole point');
});

test('a bound that returns nothing usable falls back to the default', () => {
  const { state, key, aria } = mount({ min: () => NaN, max: () => undefined });
  assert.deepEqual(aria(), { now: '50', min: '20', max: '80' });
  key('End');
  assert.equal(state.pct, 20);
});

test('the pointer path clamps against the same bounds as the keys', () => {
  const stops = { hi: 58 };
  const { state, drag } = mount({ min: () => 22, max: () => stops.hi });

  drag(100);                          // right - 100 = 900 of 1000, so 90%
  assert.equal(state.pct, 58, 'clamped to the function max');
  assert.deepEqual(state.commits.at(-1), 58, 'and the release commits it');

  drag(950);                          // 50 of 1000, so 5%
  assert.equal(state.pct, 22, 'clamped to the function min');

  stops.hi = 40;
  drag(100);
  assert.equal(state.pct, 40, 'a moved stop moves the drag with it');
});

test('a number and a function that agree behave identically', () => {
  const byNumber = mount({ min: 25, max: 65 });
  const byFunction = mount({ min: () => 25, max: () => 65 });
  for (const k of ['Home', 'End', 'ArrowLeft', 'PageUp']) { byNumber.key(k); byFunction.key(k); }
  assert.equal(byNumber.state.pct, byFunction.state.pct);
  assert.deepEqual(byNumber.aria(), byFunction.aria());
});
