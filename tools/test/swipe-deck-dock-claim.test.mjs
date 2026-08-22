// lib/kits/swipe-deck.js — when the pane toggle may be offered.
//
// Regression origin, measured 2026-08-22 in the budget-drs app (mehrlander/home),
// the contract's only host: a phone showed a dock toggle whose intent the host
// then refused, so the control did nothing. `canDock()` was
// `typeof window.__deckPane === 'function'`, and the hook's mere existence was
// the whole answer. But dockability is rarely a property of the HOST; it is a
// property of the width, or of whether this view has a list to sit beside. An
// inert control is worse than an absent one, because the reader cannot tell
// which it is looking at.
//
// The fix is `__deckPane.when`, a media query string or a predicate, read on
// every sync rather than once. The second half, that the kit RE-ASKS when the
// answer can have changed, needs a real viewport resize and so lives in
// tools/test/deck-dock-reflow.mjs, which is browser-driven and deliberately
// named without `.test.` so the suite stays browser-free. What is asserted here
// is the decision itself, which is pure logic and needs no layout.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8');

function mount() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://example.com/',
  });
  dom.window.eval(src);
  return dom.window;
}

// jsdom's matchMedia always reports `matches: false`, which is useless as a
// default and exactly right as a stub: the test says what it should answer.
function stubMatchMedia(window, matches) {
  window.matchMedia = () => ({ matches, addEventListener() {}, removeEventListener() {} });
}

const paneBtn = (handle) => [...handle.el.querySelectorAll('button')]
  .find(b => /Dock beside|Fill the pane/.test(b.title || ''));

test('no hook means no toggle, which is every consumer that never asked', () => {
  const window = mount();
  const handle = window.swipeDeck.open({ count: 2, render: () => {} });
  assert.equal(paneBtn(handle), undefined, 'a host that installed nothing claims nothing');
  handle.close();
});

test('a hook with no `when` is unconditional, so an existing host is unchanged', () => {
  const window = mount();
  window.__deckPane = () => {};
  const handle = window.swipeDeck.open({ count: 2, render: () => {} });
  assert.ok(paneBtn(handle), 'omitting `when` must mean what installing the hook meant before it existed');
  handle.close();
});

test('a media-query `when` that does not match withholds the toggle', () => {
  const window = mount();
  stubMatchMedia(window, false);
  window.__deckPane = () => {};
  window.__deckPane.when = '(min-width: 1024px)';
  const handle = window.swipeDeck.open({ count: 2, render: () => {} });
  assert.equal(paneBtn(handle), undefined,
    'this is the phone case: the host would refuse the intent, so the control must not be offered');
  handle.close();
});

test('a media-query `when` that matches offers it', () => {
  const window = mount();
  stubMatchMedia(window, true);
  window.__deckPane = () => {};
  window.__deckPane.when = '(min-width: 1024px)';
  const handle = window.swipeDeck.open({ count: 2, render: () => {} });
  assert.ok(paneBtn(handle), 'the same host at a dockable width');
  handle.close();
});

test('`when` may be a predicate, for a reason no media query can express', () => {
  const window = mount();
  window.__deckPane = () => {};
  window.__deckPane.when = () => false;
  let handle = window.swipeDeck.open({ count: 2, render: () => {} });
  assert.equal(paneBtn(handle), undefined, 'a view with no list to sit beside');
  handle.close();

  window.__deckPane.when = () => true;
  handle = window.swipeDeck.open({ count: 2, render: () => {} });
  assert.ok(paneBtn(handle), 'and the same host when it does');
  handle.close();
});

test('a throwing predicate withholds rather than breaking the deck', () => {
  const window = mount();
  window.__deckPane = () => {};
  window.__deckPane.when = () => { throw new Error('host bug'); };
  const handle = window.swipeDeck.open({ count: 2, render: () => {} });
  assert.equal(paneBtn(handle), undefined,
    'a host that cannot answer has not claimed it can dock; the deck itself must still open');
  assert.ok(handle.el, 'the deck opened');
  handle.close();
});
