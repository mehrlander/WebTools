// alpineComponents/estate.js — the branch-detail takeover's swipe.
//
// It used to be a touchend-only threshold step: nothing moved during the drag,
// then the view changed on release, which read as a dead surface. It now runs
// the same gesture the shell's dashboard pager does (show-repo.html, onSwipe*):
// lock to an axis, translate the surface 1:1 under the finger, rubber-band at
// an end with no neighbour, commit past a threshold.
//
// Tested through the handlers with synthetic touch events, since the decisions
// worth holding are all in them: which axis won, what the surface was told to
// do, whether the step happened, and whether a horizontally-scrollable target
// keeps its own scroll (the branch page's split diff scrolls sideways, and
// paging out of it mid-read would be the wrong answer to that drag).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

// The instant layer fades with x-transition.opacity.duration.200ms, and Alpine
// honours that literally: flipping detailReady again inside the window rejects
// its own transition promise ({ isFromCancelledTransition }), which node --test
// charges to whichever case is running. So every case waits the fade out before
// it flips anything (see open), rather than swallowing the rejection.
const FADE_MS = 260;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Quiet stubs rather than throwing ones: the component's own boot reads the
// activity cache, and a rejection landing mid-test would be reported against
// whichever case happened to be running.
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  ago() { return 'just now'; }
  async get() { return { text: '{}' }; }
  async ls() { return []; }
  async req() { return []; }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="es" x-data="estate()"></div>
    <div data-detail-pane></div>
    <div id="scroller"><span id="inner"></span></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = {
  REGISTRY_REPO: 'me/registry', DEFAULT_REPO: 'me/tools',
  quickLinks: [], hasToken: () => true, _authState: 'auth',
  anchorMenu: (ev, rows) => ({ x: 0, y: 0, rows }),
  menuStyle: () => '',
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/branch-survey.js',
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));
const pane = window.document.querySelector('[data-detail-pane]');
await tick(10);          // let the component's own boot settle first

// jsdom reports 0 for every layout box, so the pager's width probe needs a
// value: 400px wide makes the commit threshold min(90, 88) = 88px.
Object.defineProperty(pane, 'clientWidth', { value: 400, configurable: true });

const ROWS = ['a', 'b', 'c'].map(n => ({ repo: 'me/tools', name: 'feat/' + n }));
// Open the takeover at a position, with the surface back at rest: a settle or
// commit clears its inline styles on transitionend, which jsdom never fires on
// its own (see finishAnim), so each case starts from a known zero. Both waits
// are load-bearing (see FADE_MS): the first lets a fade started by the previous
// case finish, the second lets this one's finish before the case commits and
// re-arms the layer. Neither flip then supersedes a fade still in flight.
const open = async (i) => {
  await sleep(FADE_MS);
  data.detail = { rows: ROWS, i };
  data.detailReady = true;
  data._dBusy = false;
  pane.style.transition = ''; pane.style.transform = '';
  await sleep(FADE_MS);
};

// Drive the commit's animation chain. Both halves wait on transitionend with a
// timeout as the backstop; jsdom runs no transitions, so the test supplies the
// events and ticks the rAF pair between them.
async function finishAnim() {
  for (let k = 0; k < 3; k++) {
    pane.dispatchEvent(new window.Event('transitionend'));
    await tick(3);
  }
}

// A touch sequence, start → moves → end, through the handlers the markup wires.
const touch = (x, y = 0, target = pane) => ({
  touches: [{ clientX: x, clientY: y }],
  changedTouches: [{ clientX: x, clientY: y }],
  target, cancelable: true, preventDefault() { this.defaultPrevented = true; },
  defaultPrevented: false,
});
function drag(from, to, { y = 0, target = pane, release = true } = {}) {
  const moves = [];
  data.dTouchStart(touch(from, y, target));
  for (const x of [from + (to - from) / 2, to]) {
    const e = touch(x, y, target);
    data.dTouchMove(e);
    moves.push({ x, prevented: e.defaultPrevented, transform: pane.style.transform });
  }
  if (release) data.dTouchEnd(touch(to, y, target));
  return moves;
}

test('a horizontal drag moves the surface with the finger and owns the axis', async () => {
  await open(1);
  const moves = drag(300, 200, { release: false });
  assert.equal(moves.at(-1).transform, 'translateX(-100px)');
  assert.ok(moves.at(-1).prevented, 'the horizontal axis is claimed, not left to scroll');
  data.dTouchCancel();
});

test('a vertical drag is left alone: no transform, no preventDefault', async () => {
  await open(1);
  const e0 = touch(300, 0);
  data.dTouchStart(e0);
  const e1 = touch(304, 90);
  data.dTouchMove(e1);
  assert.equal(pane.style.transform, '', 'the surface stays put');
  assert.equal(e1.defaultPrevented, false, 'the page keeps its scroll');
  data.dTouchEnd(touch(304, 90));
  assert.equal(data.detail.i, 1, 'and no step happens');
});

test('a drag under the axis threshold decides nothing yet', async () => {
  await open(1);
  const e = touch(300, 0);
  data.dTouchStart(e);
  data.dTouchMove(touch(295, 3));
  assert.equal(pane.style.transform, '', 'below DRAG_MIN the gesture is unclaimed');
  data.dTouchEnd(touch(295, 3));
  assert.equal(data.detail.i, 1);
});

test('past the threshold commits one step; short of it, none', async () => {
  await open(1);
  drag(300, 200);                       // 100px left, over min(90, 400*0.22)
  await finishAnim();
  assert.equal(data.detail.i, 2, 'left commits to the next branch');

  await open(1);
  drag(300, 240);                       // 60px, short
  await finishAnim();
  assert.equal(data.detail.i, 1, 'a short drag settles back');

  await open(1);
  drag(200, 300);
  await finishAnim();
  assert.equal(data.detail.i, 0, 'right commits to the previous branch');
});

test('a commit resets the ready flag, so the row facts cover the incoming page', async () => {
  await open(0);
  drag(300, 180);
  await finishAnim();
  assert.equal(data.detail.i, 1);
  assert.equal(data.detailReady, false);
});

test('an end with no neighbour rubber-bands and cannot step', async () => {
  await open(0);
  const moves = drag(200, 300, { release: false });   // rightward: no previous branch
  assert.equal(moves.at(-1).transform, 'translateX(30px)',
    'a 100px drag past the first branch shows as 30: damped to 0.3');
  data.dTouchEnd(touch(300, 0));
  await finishAnim();
  assert.equal(data.detail.i, 0, 'and the end holds');

  await open(ROWS.length - 1);
  drag(400, 200);                       // leftward: no next branch
  await finishAnim();
  assert.equal(data.detail.i, ROWS.length - 1);
});

test('a horizontally-scrollable target keeps its own scroll', async () => {
  await open(1);
  const scroller = window.document.getElementById('scroller');
  Object.defineProperty(scroller, 'scrollWidth', { value: 900, configurable: true });
  Object.defineProperty(scroller, 'clientWidth', { value: 300, configurable: true });
  scroller.style.overflowX = 'auto';
  const e = touch(300, 0, window.document.getElementById('inner'));
  data.dTouchStart(e);
  data.dTouchMove(touch(200, 0, window.document.getElementById('inner')));
  assert.equal(pane.style.transform, '', 'the pager declined the gesture');
  data.dTouchEnd(touch(200, 0));
  assert.equal(data.detail.i, 1);
});

test('with the takeover closed the handlers are inert', async () => {
  data.detail = null;
  await tick(2);
  drag(300, 150);
  assert.equal(pane.style.transform, '');
});
