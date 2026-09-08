// lib/kits/swipe-deck.js — the subheader slot: a row under the header that the
// caller fills and the kit only places.
//
// It exists because every consumer wanting chrome of its own was building it
// outside the deck. The workbook viewer's sheet tabs are the case that named
// it: a div in the viewer's own markup with the deck underneath, which works
// until the deck is opened as a takeover and leaves its tabs on the page it
// came from.
//
// Two things are worth holding, and both would pass a naive check:
//
//   A deck with no subheader must lay out exactly as it did before the row
//   existed. The row is `auto` in a four-row grid, so an empty div is zero
//   height, but only if nothing puts padding on it unconditionally: an empty
//   row with px-4 py-1.5 is a 3rem stripe of nothing under every header in the
//   estate, and every existing deck would grow it silently.
//
//   The row has to be swappable per SLIDE. Chrome that belongs to a workbook
//   must arrive when the reader reaches it and leave when they pass it, which
//   is the same argument setActions makes one row up and the reason this is a
//   setter rather than an open-time option alone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
const sd = window.swipeDeck;
window.Element.prototype.scrollTo = function(){};
window.Element.prototype.scrollIntoView = function(){};

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));
const subOf = (h) => h.el.querySelector('.sd-subheader');
const tabs = (label) => {
  const el = window.document.createElement('div');
  el.className = 'tabstrip';
  el.textContent = label;
  return el;
};

test('a deck with no subheader still has the row, and it collapses to nothing', async () => {
  const h = sd.open({ count: 3, render: () => {} });
  await tick();
  const row = subOf(h);
  assert.ok(row, 'the slot is always in the grid, so nothing branches on its absence');
  assert.equal(row.children.length, 0, 'and it is empty');
  assert.match(row.className, /empty:hidden/,
    'which is what keeps an unused row from being a stripe under every header');
  h.drop();
});

test('an element passed at open lands in the row, under the header and over the track', async () => {
  const h = sd.open({ count: 3, render: () => {}, subheader: tabs('Sheet1') });
  await tick();
  assert.equal(subOf(h).textContent, 'Sheet1');

  // Position is the whole of what the kit promises about this slot, so it is
  // the thing to pin: header, subheader, track, footer, in that order.
  const panel = subOf(h).parentElement;
  const order = [...panel.children].map(c => c.className.split(' ')[0]);
  assert.deepEqual(order.slice(0, 3), ['sd-header', 'sd-subheader', 'sd-track']);
  h.drop();
});

test('a function is handed the core handle, so chrome can act on the card in view', async () => {
  let got = null;
  const h = sd.open({
    count: 3, start: 1, render: () => {},
    subheader: (deck) => { got = deck; return tabs('x'); },
  });
  await tick();
  assert.ok(got && typeof got.active === 'function',
    'the same handle an action gets, and for the same reason: only the deck knows which card');
  assert.equal(typeof got.go, 'function');
  h.drop();
});

test('the row is swappable per slide, and null empties it', async () => {
  const h = sd.open({ count: 3, render: () => {}, subheader: tabs('Sheet1') });
  await tick();
  assert.equal(subOf(h).textContent, 'Sheet1');

  // Slide 4 is a workbook, slide 5 is not. Both directions have to work, and
  // the second is the one a naive setter gets wrong by only ever appending.
  h.setSubheader(tabs('Q3 · Q4'));
  assert.equal(subOf(h).textContent, 'Q3 · Q4', 'replaced, not appended');
  assert.equal(subOf(h).children.length, 1);

  h.setSubheader(null);
  assert.equal(subOf(h).children.length, 0, 'and the row empties on a slide that owns no chrome');
  h.drop();
});

test('the slot does not disturb the header the contents list hangs off', async () => {
  // The mark is found by position in .sd-header, both by the kit's own tests
  // and by anything measuring the header to place a panel. A row added to the
  // PANEL must not move anything inside the header.
  const h = sd.open({
    count: 3, render: () => {}, index: (i) => ({ title: 'row ' + i }),
    subheader: tabs('Sheet1'),
  });
  await tick();
  const mark = h.el.querySelector('.sd-header').children[1];
  assert.equal(mark.tagName, 'BUTTON', 'still the second child, still the list button');

  mark.dispatchEvent(new window.MouseEvent('click'));
  await tick();
  assert.equal(h.el.querySelectorAll('.sd-index').length, 1, 'and the list still opens');
  h.close();
  await tick(3);
});

// ── THE TITLE'S OWN SLOT ────────────────────────────────────────────────────
//
// A second place for chrome, and the difference from `actions` is what it
// belongs to: an action belongs to the DECK and clusters with the others at
// the right; a title mark belongs to the NAME. kits/file-deck.js hangs a
// github menu there, because a github destination answers "which copy of this
// file" and reads as part of the controls anywhere in the cluster, at either
// end (tried both, 2026-09-07 and 08).
test('a title mark sits inside the h1, and the crumb stays its adjacent sibling', async () => {
  const h = window.swipeDeck.open({ count: 1, title: 'a.md', subtitle: 'lib · kits',
                                    render: () => {} });
  await tick();
  const h1 = h.el.querySelector('.sd-header h1');
  assert.equal(h1.textContent, 'a.md', 'the name, and nothing else, before any mark');
  assert.ok(h.el.querySelector('h1 + p'), 'the crumb is the h1\'s adjacent sibling');

  // WITH TEXT IN IT, deliberately. A mark is usually an icon and contributes
  // no text, which makes `title` reading the whole h1 and reading the name
  // alone indistinguishable: the mutation that widened it was silent until
  // this mark said something (2026-09-08).
  const mark = document.createElement('button');
  mark.textContent = 'MARK';
  mark.title = 'somewhere';
  h.setTitleMark(mark);
  await tick();
  assert.ok(h1.contains(mark), 'the mark lands inside the title');
  // A MARK MUST NOT CHANGE THE NAME. setTitle writes a span rather than the
  // h1, so the two never overwrite each other, and `title` reads that span so
  // a deck asking its own name back gets the name and not the chrome with it.
  assert.equal(h.title, 'a.md', 'the name, without the mark: ' + h.title);
  assert.ok(h.el.querySelector('h1 + p'), 'and the crumb is still adjacent');

  h.setTitle('b.md');
  await tick();
  assert.equal(h.title, 'b.md', 'a retitle writes the name');
  assert.ok(h1.contains(mark), 'and leaves the mark where it was, which is what a swipe needs');

  h.setTitleMark(null);
  await tick();
  assert.ok(!h1.contains(mark), 'null empties the slot');
  assert.equal(h1.textContent, 'b.md', 'and the h1 is the name again');
  h.close();
  await tick(3);
});
