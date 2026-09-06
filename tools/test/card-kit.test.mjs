// kits/card.js — the card of the house popup rule (daisy-alpine mechanics.md,
// "Notes and cards"), held at the edges that decide whether a reader can get
// out of one.
//
// What is checked here is the dismissal contract, which is the half that was
// written five times across the estate and written differently each time: the
// ✕ shows when the card is pinned AND on any screen with no hover, every way
// out reaches the same callback, and a press outside is not swallowed. Plus
// the check that catches a ✕ that is drawn and cannot be pressed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body>
    <button id="toggle">i</button>
    <div id="pop"><p>a card</p></div>
    <a id="under" href="#x">something under the page</a>
  </body></html>`,
});

// jsdom answers every media query false, so the fine-pointer path is the
// default here and the coarse path is driven by replacing matchMedia.
const setHover = (has) => {
  window.matchMedia = (q) => ({ matches: q.includes('hover: none') ? !has : has });
};
setHover(true);

new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/card.js'), 'utf8'))();
const Card = window.Card;
const $ = (sel) => window.document.querySelector(sel);
const press = (el) => {
  const ev = new window.Event('pointerdown', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

test('the kit registers window.Card beside Note, the other half of one rule', () => {
  assert.equal(typeof Card, 'object');
  assert.equal(typeof Card.closeHTML, 'function');
  assert.equal(typeof Card.wire, 'function');
});

test('the ✕ shows when pinned, and on any screen with no hover', () => {
  // The second half is the one that keeps being missed: a touch synthesizes
  // the hover that opens a card and never sends the leave that would close it,
  // so a hover-opened card on a phone is pinned in all but name.
  setHover(true);
  assert.equal(Card.closeHTML(false), '', 'unpinned, hover available: the card closes on leaving');
  assert.match(Card.closeHTML(true), /wt-card-close/, 'pinned: nothing else closes it');
  setHover(false);
  assert.match(Card.closeHTML(false), /wt-card-close/, 'no hover: there is no leave to wait for');
  assert.match(Card.closeHTML(true), /wt-card-close/);
  setHover(true);
});

test('the ✕ is a ghost: no border, no fill', () => {
  // A bordered button reads as an action the card offers. This is the rule the
  // first draft got wrong, so it is held rather than left to taste.
  assert.match(Card.CSS, /\.wt-card-close\{[^}]*border:0/s);
  assert.match(Card.CSS, /\.wt-card-close\{[^}]*background:none/s);
  assert.doesNotMatch(Card.CSS, /\.wt-card-close\{[^}]*border:1px/s);
});

test('every way out reaches the same callback: the ✕, Escape, and a press outside', () => {
  const pop = $('#pop');
  let closed = 0;
  const w = Card.wire(pop, { onClose: () => { closed += 1; } });

  pop.innerHTML = Card.closeHTML(true) + '<p>a card</p>';
  pop.querySelector('[data-wt-card-close]').dispatchEvent(
    new window.Event('click', { bubbles: true }));
  assert.equal(closed, 1, 'the ✕');

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(closed, 2, 'Escape');

  press($('#under'));
  assert.equal(closed, 3, 'a press outside');

  press(pop.querySelector('p'));
  assert.equal(closed, 3, 'a press inside the card is not a dismissal');

  w.detach();
  press($('#under'));
  assert.equal(closed, 3, 'detach removes the document listeners');
});

test('a press outside is not swallowed, which is why it cannot be the only way out', () => {
  // What was pressed still acts. That is correct, and it is exactly why a
  // dense page needs the ✕: every point outside the card is a control.
  const pop = $('#pop');
  const w = Card.wire(pop, { onClose: () => {} });
  const ev = press($('#under'));
  assert.equal(ev.defaultPrevented, false);
  w.detach();
});

test('the control that toggles a card is not "outside" it', () => {
  // Without this the press closes the card and the toggle immediately reopens
  // it, or the reverse, and which one you get depends on listener order.
  const pop = $('#pop');
  let closed = 0;
  const w = Card.wire(pop, { onClose: () => { closed += 1; }, except: ['#toggle'] });
  press($('#toggle'));
  assert.equal(closed, 0);
  press($('#under'));
  assert.equal(closed, 1);
  w.detach();
});

test('a ✕ that cannot be pressed is reported, since nothing else would notice', () => {
  // A shell that is pointer-events:none unless pinned draws a ✕ and lets the
  // tap through it. It looks right in a screenshot and fails only under a
  // finger.
  setHover(false);
  const pop = $('#pop');
  pop.style.pointerEvents = 'none';
  const warnings = [];
  const real = window.console.warn;
  window.console.warn = (...a) => warnings.push(a[0]);
  try {
    Card.wire(pop, { onClose: () => {} }).detach();
  } finally {
    window.console.warn = real;
    pop.style.pointerEvents = '';
    setHover(true);
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cannot be pressed/);
});
