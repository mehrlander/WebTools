// kits/record-deck.js: a table's records, one per slide.
//
// The grid is for SCANNING and the deck is for READING, the same split
// file-deck makes between the Files pane and the file deck. What the cases
// hold is the contract between the two, since the deck chrome itself is
// swipe-deck's (covered in swipe-deck-stack):
//
//   - a bare array of records needs no configuration, and a RAGGED one still
//     shows every field, which is the failure a first-row read would have;
//   - empty fields are collapsed and COUNTED rather than dropped, since a
//     90-column fact table is mostly blank on any row and a reader cannot tell
//     a blank field from a field the format lost;
//   - zero is not empty;
//   - fromGrid reads the ACTIVE rows, so a filtered grid opens a filtered deck.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
for (const f of ['lib/kits/swipe-deck.js', 'lib/kits/record-deck.js']) {
  new window.Function(readFileSync(path.join(repoRoot, f), 'utf8'))();
}
const { recordDeck, swipeDeck } = window;
// One rAF is how the deck builds its first slides and how it tears down, and
// jsdom's polyfill runs on a real timer, so a 10ms tick lands before the frame.
// 60ms is a frame with room; short ticks read as "the deck rendered nothing".
const tick = (n = 1) => new Promise(r => setTimeout(r, n * 60));

// jsdom has no layout, and swipe-deck computes in units of the track's width.
// Same six lines of geometry file-deck's cases use.
const drivable = (handle, width = 400) => {
  const t = handle.deck.track;
  Object.defineProperty(t, 'clientWidth', { value: width, configurable: true });
  let left = 0;
  Object.defineProperty(t, 'scrollLeft', {
    configurable: true, get: () => left, set: (v) => { left = v; },
  });
  t.scrollTo = ({ left: v }) => { left = v; t.dispatchEvent(new window.Event('scroll')); };
  return handle;
};
const slideText = (handle, i) => handle.deck.track.children[i].textContent;
const headline = (handle, i) => handle.deck.track.children[i].querySelector('h2')?.textContent;

test('a bare array needs no columns, and a ragged one keeps every field', async () => {
  const rows = [
    { vendor: 'ODP BUSINESS SOLUTIONS', amount: '606.88' },
    { vendor: 'STAPLES', amount: '254.46', subobj: 'EA' },   // a field row 0 does not have
  ];
  // Joined rather than deepEqual'd: the kit runs in the jsdom realm, so its
  // arrays fail a strict deep comparison on their prototype alone.
  const cols = recordDeck.deriveColumns(rows).map(c => c.field).join(',');
  assert.equal(cols, 'vendor,amount,subobj',
    'the union of keys in first-seen order, not the first row\'s');

  const handle = drivable(recordDeck.open({ rows, title: 'Vendor payments' }));
  await tick();
  const first = slideText(handle, 0);
  assert.match(first, /ODP BUSINESS SOLUTIONS/, 'the headline is the first non-numeric column');
  assert.match(first, /1 empty field/, 'the field row 0 lacks is counted, not dropped');
  handle.close();
  await tick();
});

test('numeric columns are detected, and zero is not empty', async () => {
  const rows = [{ id: '2023', label: 'CORE', amount: 0 }];
  const cols = recordDeck.deriveColumns(rows);
  assert.equal(cols.find(c => c.field === 'id').num, true);
  assert.equal(cols.find(c => c.field === 'label').num, false);

  const handle = drivable(recordDeck.open({ rows }));
  await tick();
  const text = slideText(handle, 0);
  assert.match(text, /3 of 3 fields/, 'a zero amount is a fact, so it is a filled field');
  assert.doesNotMatch(text, /empty field/);
  assert.match(text, /CORE/, 'the headline is the first non-numeric column, not the id');
  handle.close();
  await tick();
});

test('the headline is the column that VARIES, not the leftmost one', async () => {
  // Measured on budget-drs's master budget lines, whose columns open with three
  // that are constant across the table: every one of 100 records was headlined
  // "2015-17" and the deck header said it on every swipe.
  const rows = [
    { biennium: '2015-17', stage: 'supp', item_title: "1. Workers' Compensation Changes" },
    { biennium: '2015-17', stage: 'supp', item_title: '2. Central Services Changes' },
    { biennium: '2015-17', stage: 'supp', item_title: '3. Lease Rate Adjustments' },
  ];
  const handle = drivable(recordDeck.open({ rows, title: 'Master budget lines' }));
  await tick();
  assert.equal(headline(handle, 0), "1. Workers' Compensation Changes");
  handle.close();
  await tick();

  // …and where the leftmost column IS the varying one, it still wins, so the
  // obvious answer is not sacrificed to fix the case that broke.
  const led = [{ vendor: 'ODP', agency: 'Retirement Systems' },
               { vendor: 'STAPLES', agency: 'Retirement Systems' }];
  const h2 = drivable(recordDeck.open({ rows: led }));
  await tick();
  assert.equal(headline(h2, 0), 'ODP');
  h2.close();
  await tick();

  // An explicit titleField outranks the heuristic for a host that knows.
  const h3 = drivable(recordDeck.open({ rows, titleField: 'stage' }));
  await tick();
  assert.equal(headline(h3, 0), 'supp');
  h3.close();
  await tick();
});

test('the header names the record the reader is ON, not the one they opened at', async () => {
  const rows = [{ agency: 'Retirement Systems' }, { agency: 'Health Care Authority' }];
  const handle = drivable(recordDeck.open({ rows, title: 'Agencies' }));
  await tick();
  handle.deck.go(1);
  await tick(2);
  assert.equal(handle.deck.active(), 1);
  assert.match(handle.el.textContent, /Health Care Authority/,
    'the subtitle follows the swipe');
  handle.close();
  await tick();
});

test('fromGrid pages the ACTIVE rows, in the grid\'s order', async () => {
  // A Tabulator stand-in at exactly the depth the adapter uses it. The point
  // of the case is that it asks for 'active' and not for getData(): a grid
  // filtered to two hits must open a deck of two.
  const all = [{ v: 'a' }, { v: 'b' }, { v: 'c' }];
  const active = [all[2], all[0]];                       // filtered AND re-sorted
  let asked = null, scrolledTo = null;
  const table = {
    getRows: (which) => { asked = which; return active.map(d => ({ getData: () => d })); },
    getColumns: () => [{ getField: () => 'v', isVisible: () => true,
                         getDefinition: () => ({ title: 'Value' }) }],
    scrollToRow: (r) => { scrolledTo = r; return Promise.resolve(); },
    on: () => {},
  };
  const handle = drivable(recordDeck.fromGrid(table, { title: 'Rows' }));
  await tick();
  assert.equal(asked, 'active');
  assert.equal(handle.deck.count, 2, 'the deck is the filtered set, not the file');
  assert.equal(headline(handle, 0), 'c', "and it keeps the grid's sort order");

  handle.close();
  await tick();
  assert.ok(scrolledTo, 'closing returns the grid to the record the reader left on');
});

test('the deck lists itself by the headline, and an unnamed record still gets a row', async () => {
  const rows = [{ vendor: 'ODP BUSINESS SOLUTIONS' }, { vendor: 'STAPLES' }, { amount: '3.00' }];
  const handle = drivable(recordDeck.open({ rows, title: 'Vendor payments' }));
  await tick();
  const mark = handle.el.querySelector('.sd-header').children[1];
  assert.equal(mark.tagName, 'BUTTON',
    'the mark opens the contents rather than sitting there as a plaque');
  mark.click();
  await tick();
  const listed = [...handle.el.querySelector('.sd-index').children];
  assert.equal(listed.length, rows.length, 'every record, not just the built slides');
  assert.match(listed[1].textContent, /STAPLES/, 'labelled by the headline column');
  assert.match(listed[2].textContent, /Record 3/,
    'and a record with nothing in that column falls back the way the header does');
  mark.click();
  await tick();
  handle.close();
  await tick();
});

test('an empty collection opens nothing rather than an empty deck', () => {
  const before = swipeDeck.stack.length;
  assert.equal(recordDeck.open({ rows: [] }), null);
  assert.equal(recordDeck.open({}), null);
  assert.equal(swipeDeck.stack.length, before, 'and it does not push a deck it cannot fill');
});

test('the entry affordance is one glyph and one wording, estate-wide', () => {
  assert.equal(swipeDeck.entry.icon, 'ph-cards-three',
    'the glyph Branch detail already uses to enter the file deck');
  assert.equal(swipeDeck.entry.title(27, 'record'), 'Read 27 records one at a time');
  assert.equal(swipeDeck.entry.title(1, 'file'), 'Read 1 file one at a time');
  assert.equal(swipeDeck.entry.title(0, 'record'), 'Read records one at a time',
    'a caller that has not fetched yet still gets the promise, without a number');
  const b = swipeDeck.entry({ count: 3, noun: 'file', onOpen: () => {} });
  assert.match(b.className, /btn-square/);
  // 44px ON A PHONE BY DEFAULT, and a surface that wants less says so.
  //
  // WRONG 2026-09-07 → this paragraph: it read "ONE SIZE, 32px", on the
  // argument that the target is "the kit's to make once rather than each
  // host's to make differently". The branch page's heading row did want 32,
  // and the reader picked it from four renderings; what did not follow is that
  // the other seven doors wanted it. Taking the floor out of the shared class
  // dropped six of them from 44 to 32 on a phone, and left the session brief's
  // 12px short of the three siblings on its own row. Making it once is right;
  // making it once from the surface with the tightest band is not.
  assert.match(b.className, /\bbtn-sm\b/, 'the size the door takes');
  assert.match(b.className, /max-sm:h-11 max-sm:w-11/, 'and the phone floor with it');
  assert.doesNotMatch(swipeDeck.entry.cls('primary', 'tight'), /max-sm:h-/,
    'which one surface declines by name rather than by editing the class');
  // NO FILL. Primary colours the glyph rather than a ground behind it, which is
  // what the tone was for: the host saying this deck is what most readers came
  // to do. Ghost still earns its colour on hover instead of at rest.
  assert.match(b.className, /btn-ghost text-primary/, 'primary tone wears no fill');
  assert.doesNotMatch(b.className, /btn-soft/);
  assert.match(b.querySelector('i').className, /ph-cards-three/);
});
