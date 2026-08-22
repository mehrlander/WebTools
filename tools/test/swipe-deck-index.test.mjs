// kits/swipe-deck.js — the contents list, and the history entry it owns.
//
// The deck holds a count and a render callback and has never seen the caller's
// array, which is exactly what lets one kit page documents, diffs, mounted
// Alpine components and canvas-drawn PDF pages through one door. So it cannot
// build a list of itself, and scraping the built slides cannot stand in: only
// the active slide and its neighbours exist, so a 47-slide deck would list
// three rows and 44 blanks. `index` is the answer, `render`'s cheap twin: a
// label is metadata the caller already holds, so the list is complete while the
// deck stays three slides deep.
//
// The half worth testing hardest is the history entry. The list takes one for
// the same reason the deck itself does (on a phone, Back is what a reader
// reaches for), and that single decision has to hold in three directions: Back
// leaves the LIST and not the deck, the kit's own programmatic close does not
// then read its own tidy-up as a Back press, and ✕ with a list open still
// unwinds to exactly the right depth.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
const sd = window.swipeDeck;
// jsdom has no layout, so the two scroll calls the deck makes are absent rather
// than inert. Stubbing them is stubbing the platform, not the kit.
window.Element.prototype.scrollTo = function(){};
window.Element.prototype.scrollIntoView = function(){};

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));
const pop = () => window.dispatchEvent(new window.Event('popstate'));
const key = (k) => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k }));
const overlays = () => window.document.body.querySelectorAll('.sd-overlay').length;

const DOCS = ['APP.md', 'CONVENTIONS.md', 'SURFACING.md', 'TRACKER.md'];
const open = (extra = {}) => sd.open({
  count: DOCS.length,
  title: DOCS[0],
  render: (i, el) => { el.textContent = DOCS[i]; },
  index: (i) => ({ title: DOCS[i], subtitle: 'what ' + DOCS[i] + ' is about' }),
  ...extra,
});
// The mark: a button when there is a list behind it, a plaque when there is not.
const markOf = (h) => h.el.querySelector('.sd-header')?.children[1];
const sheetOf = (h) => h.el.querySelector('.sd-index');
const rowsOf = (h) => [...(sheetOf(h)?.children || [])];

test('no labeler leaves the mark a plaque, so nothing advertises a list that is not there', async () => {
  const h = sd.open({ count: 3, render: () => {} });
  await tick();
  assert.equal(markOf(h).tagName, 'DIV', 'the header mark stays decorative');
  assert.equal(sheetOf(h), null, 'and no sheet is built');
  h.drop();
});

test('a labeler makes the mark a button, and it lists every slide with the reader marked', async () => {
  const h = open();
  await tick();
  const mark = markOf(h);
  assert.equal(mark.tagName, 'BUTTON');
  assert.equal(mark.title, 'Contents');

  mark.dispatchEvent(new window.MouseEvent('click'));
  await tick();
  const rows = rowsOf(h);
  assert.equal(rows.length, DOCS.length, 'every slide gets a row, not just the built ones');
  assert.match(rows[1].textContent, /CONVENTIONS\.md/);
  assert.match(rows[1].textContent, /what CONVENTIONS\.md is about/, 'the subtitle is the gloss');
  assert.equal(rows[0].getAttribute('aria-current'), 'true', 'the reader is marked');
  assert.equal(rows[1].getAttribute('aria-current'), null, 'and only the reader');

  // The glyph names what tapping does, never the state it is in, which is the
  // rule the pane toggle beside it already follows.
  assert.equal(mark.title, 'Back to the slide');
  assert.match(mark.querySelector('i').className, /ph-caret-up/,
    'a caret, not a second ✕ beside the header\'s own');
  h.drop();
});

test('a row goes to its slide, and the close does not read as a Back press', async () => {
  const h = open();
  await tick();
  markOf(h).dispatchEvent(new window.MouseEvent('click'));
  await tick();
  rowsOf(h)[2].dispatchEvent(new window.MouseEvent('click'));
  await tick();
  assert.equal(sheetOf(h), null, 'the list is gone');
  assert.equal(overlays(), 1, 'and the deck is emphatically not');

  // Closing the list programmatically spends its history entry, and jsdom
  // delivers that popstate for real. The kit has to swallow exactly that one:
  // the very next Back belongs to the reader and takes the deck, so nothing is
  // left armed to eat it.
  pop();
  await tick();
  assert.equal(overlays(), 0, 'one entry in, one entry out, nothing still armed');
});

test('Back leaves the list, not the deck', async () => {
  const h = open();
  await tick();
  markOf(h).dispatchEvent(new window.MouseEvent('click'));
  await tick();
  assert.ok(sheetOf(h), 'the list is up');

  pop();
  await tick();
  assert.equal(sheetOf(h), null, 'Back closed the list');
  assert.equal(overlays(), 1, 'and left the reader in the deck, which is the whole point');
  assert.equal(markOf(h).title, 'Contents', 'the mark says what it offers again');

  pop();
  await tick();
  assert.equal(overlays(), 0, 'a second Back is the deck itself');
});

test('Escape closes the list first, and the arrows do not step a track nobody can see', async () => {
  const h = open();
  await tick();
  markOf(h).dispatchEvent(new window.MouseEvent('click'));
  await tick();

  key('ArrowRight');
  await tick();
  assert.ok(sheetOf(h), 'an arrow is swallowed while the list is in front');

  key('Escape');
  await tick();
  assert.equal(sheetOf(h), null, 'Escape took the list');
  assert.equal(overlays(), 1, 'and not the deck under it');

  key('Escape');
  await tick(3);
  pop();                                  // dismiss() asks history; jsdom needs the nudge
  await tick();
  assert.equal(overlays(), 0, 'a second Escape is the deck');
});

test('an open list is one extra history entry, and ✕ still unwinds the whole stack', async () => {
  const outer = open();
  await tick();
  const inner = sd.drill(outer, { count: 2, title: 'a file', render: () => {} });
  await tick();
  assert.equal(overlays(), 2);

  // The parent is holding a list. Dismissing the CHILD must not spend the
  // parent's extra entry, and dismissing the parent must spend it.
  assert.equal(outer.extraEntries, 0, 'nothing open yet');
  inner.close();
  // A drilled deck retraces its way in on the way out, so the node outlives the
  // cleanup by the length of that animation. Waiting it out is waiting for the
  // DOM to agree with the stack, not for the kit to make up its mind.
  await tick(30);
  assert.equal(overlays(), 1, 'the child left, the parent stayed');

  markOf(outer).dispatchEvent(new window.MouseEvent('click'));
  await tick();
  assert.equal(outer.extraEntries, 1, 'the open list declares its entry');
  outer.close();
  await tick(3);
  assert.equal(overlays(), 0, 'one ✕ took the deck and the list it was holding');
});
