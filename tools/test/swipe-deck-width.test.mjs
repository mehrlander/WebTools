// lib/kits/swipe-deck.js — the width contract that keeps a slide one track wide.
//
// Regression origin, measured 2026-08-07 at a 430px viewport with a session
// record in the deck: the track rendered 867px inside a 430px panel, so every
// card was cut off on the right. It reads as a styling slip and is not one.
// `go()` and `active()` compute in units of `track.clientWidth`, so once any
// slide is wider than that, the pager scrolls to an offset that lands mid-card
// and the counter names a slide the reader is not looking at.
//
// Three links, and fixing any two changed nothing measurable:
//
//   1. The panel's implicit grid COLUMN is `auto`, which sizes to max-content.
//      `min-w-0` on the track cannot shrink a column already that wide, so the
//      column needs `minmax(0,1fr)`.
//   2. The track is a grid item (and often a flex item), both of which default
//      to `min-width: auto`. It needs `min-w-0`.
//   3. A slide was `min-w-full`, a floor with no ceiling. It needs
//      `w-full shrink-0`, and its inner needs `min-w-0` so a wide <pre>
//      scrolls in its own box instead of pushing the slide open.
//
// jsdom has no layout, so this asserts the CLASS CONTRACT rather than measured
// widths. That is the honest limit of the check: it cannot prove the deck fits,
// only that the three declarations that make it fit are still present. The
// widths themselves were verified in a real browser through
// tools/render/screenshot.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8');

// Evaluated with the jsdom window as its GLOBAL scope, not injected as
// parameters. swipe-deck.js reaches bare globals (`requestAnimationFrame`,
// `addEventListener`, `history`), which a `new Function(...)` wrapper leaves
// undefined however many of them get passed in by name.
function mount() {
  // A real `url` is required, not decoration: open() pushes a history entry so
  // the phone back button dismisses the takeover, and jsdom's pushState throws
  // on the default about:blank document.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://example.com/',
  });
  dom.window.eval(src);
  return dom.window;
}

test('a slide is exactly one track wide, and its inner can shrink', () => {
  const window = mount();
  const deck = window.swipeDeck.core(3, () => {}, {});
  const section = deck.track.querySelector('section');
  const inner = section.firstElementChild;

  assert.match(section.className, /\bw-full\b/, 'a slide must be exactly the track width');
  assert.match(section.className, /\bshrink-0\b/, 'a slide must not be shrunk by its neighbours');
  assert.doesNotMatch(section.className, /\bmin-w-full\b/,
    'min-w-full is a floor with no ceiling: one wide child makes the slide wider than the track');
  assert.match(inner.className, /\bmin-w-0\b/,
    'without min-w-0 a wide <pre> pushes the slide open instead of scrolling inside it');
});

test('the track cannot exceed its cell', () => {
  const window = mount();
  const deck = window.swipeDeck.core(2, () => {}, {});
  assert.match(deck.track.className, /\bmin-w-0\b/,
    'the track is a grid/flex item and defaults to min-width:auto, so it grows to its content');
  assert.match(deck.track.className, /\boverflow-x-auto\b/, 'the track is what scrolls');
});

test('the takeover panel caps its single column', () => {
  const window = mount();
  const handle = window.swipeDeck.open({ count: 2, render: () => {} });
  const panel = handle.el.querySelector('.grid');
  assert.match(panel.className, /grid-cols-\[minmax\(0,1fr\)\]/,
    'a grid\'s implicit column is auto-sized to max-content; min-w-0 on the item cannot shrink it');
  handle.close();
});

test('innerClass adds to the width classes rather than replacing them', () => {
  // Both consumers passed innerClass and so silently dropped the width
  // guarantee. Being one track wide is a property of being a slide, so the
  // caller should not have to remember it.
  const window = mount();
  const deck = window.swipeDeck.core(1, () => {}, { innerClass: 'mx-auto max-w-2xl space-y-4' });
  const inner = deck.track.querySelector('section').firstElementChild;
  assert.match(inner.className, /\bw-full\b/);
  assert.match(inner.className, /\bmin-w-0\b/);
  assert.match(inner.className, /\bspace-y-4\b/, 'the caller\'s own classes must survive');
});
