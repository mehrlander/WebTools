// kits/row-menu.js: the row tap, what it offers, and when it stays out of the
// way.
//
// WHAT IS NOT HERE, for the same reason annotate's pointer path is not: jsdom
// computes no rects, so `place`'s clamp is real-browser behavior and cannot be
// asserted from a node test. Everything the clamp positions IS asserted, which
// is the menu's membership, its wording, what each item does, and the four ways
// it goes away.
//
// The table is a stub rather than a real Tabulator, and deliberately: the kit
// touches exactly three of that library's methods (`on`, `getColumns`,
// `getRows`), and a stub is how that stays true. A drift into a fourth fails
// here rather than in a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, loadKit } from './bootstrap.mjs';

const { window } = makeWindow();
const doc = window.document;
loadKit('row-menu.js', { window });
const RM = window.rowMenu;

const COLS = [
  { field: 'item_id', title: 'Item' },
  { field: 'amount', title: 'Amount' },
  { field: 'hidden', title: 'Hidden' },
];
const ROWS = [
  { item_id: 'a-1', amount: 10, hidden: 'x', note: 'not a column' },
  { item_id: 'b-2', amount: null, hidden: 'y' },
  { item_id: 'c-3', amount: 'two\tlines\nhere', hidden: 'z' },
];

// A Tabulator stand-in over the three calls the kit is allowed to make.
function stubTable({ rows = ROWS, cols = COLS } = {}) {
  const handlers = {};
  const els = rows.map(() => doc.createElement('div'));
  rows.forEach((r, i) => { els[i].className = 'tabulator-row'; doc.body.append(els[i]); });
  return {
    calls: [],
    on(ev, fn) { this.calls.push('on'); (handlers[ev] ||= []).push(fn); },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter(f => f !== fn); },
    getColumns() {
      this.calls.push('getColumns');
      return cols.map(c => ({
        getField: () => c.field,
        isVisible: () => c.field !== 'hidden',
        getDefinition: () => ({ title: c.title }),
      }));
    },
    getRows(which) {
      this.calls.push('getRows:' + which);
      return rows.map((r, i) => ({ getData: () => r, getElement: () => els[i] }));
    },
    // Drive a row tap the way Tabulator does: the native event, then the row.
    tap(i, target) {
      const e = new window.MouseEvent('click', { bubbles: true, clientX: 40, clientY: 60 });
      Object.defineProperty(e, 'target', { value: target || els[i] });
      for (const fn of handlers.rowClick || []) {
        fn(e, { getData: () => rows[i], getElement: () => els[i] });
      }
      return e;
    },
    rowEl: (i) => els[i],
  };
}

const menu = () => doc.querySelector('[role="menu"]');
const labels = () => [...(menu()?.querySelectorAll('[role="menuitem"]') || [])]
  .map(b => b.textContent.trim());
const clickItem = (text) => {
  const b = [...menu().querySelectorAll('[role="menuitem"]')]
    .find(x => x.textContent.trim() === text);
  assert.ok(b, 'no menu item reading ' + JSON.stringify(text) + '; saw ' + JSON.stringify(labels()));
  b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return b;
};
const reset = () => { RM.close(); delete window.recordDeck; delete window.io; };

test('tsv leads with headers and keeps one row on one line', () => {
  const out = RM.tsv([{ field: 'a', title: 'A' }, { field: 'b', title: 'B' }],
                     [{ a: 'x', b: 'y' }, { a: null, b: 'two\tlines\nhere' }]);
  assert.deepEqual(out.split('\n'), ['A\tB', 'x\ty', '\ttwo lines here']);
});

test('columnsOf drops the hidden and the field-less, and keeps the order', () => {
  const t = stubTable();
  assert.deepEqual(RM.columnsOf(t), [
    { field: 'item_id', title: 'Item' }, { field: 'amount', title: 'Amount' },
  ]);
});

test('a tap on a plain cell opens a menu; on a link it does not', () => {
  reset();
  const t = stubTable();
  const off = RM.attach(t);
  t.tap(0);
  assert.ok(menu(), 'a plain row tap raised no menu');
  RM.close();

  const link = doc.createElement('a');
  t.rowEl(0).append(link);
  t.tap(0, link);
  assert.equal(menu(), null, 'a tap on a link raised the menu anyway');

  const btn = doc.createElement('button');
  t.rowEl(0).append(btn);
  t.tap(0, btn);
  assert.equal(menu(), null, 'a tap on a button raised the menu anyway');
  off();
});

test('the deck item appears only when record-deck is loaded, and starts on the tapped row', () => {
  reset();
  const t = stubTable();
  const off = RM.attach(t, { deck: { title: 'Items' } });

  t.tap(1);
  assert.deepEqual(labels(), ['Copy this record', 'Copy 3 rows'],
    'the deck item showed with no record-deck loaded');
  RM.close();

  const seen = [];
  window.recordDeck = { fromGrid: (table, o) => { seen.push({ table, o }); } };
  t.tap(1);
  assert.deepEqual(labels(), ['Read from here', 'Copy this record', 'Copy 3 rows']);
  clickItem('Read from here');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].table, t);
  assert.equal(seen[0].o.title, 'Items', 'the host options did not reach fromGrid');
  assert.equal(seen[0].o.startRow, ROWS[1], 'the deck did not open on the row that was tapped');
  off();
});

test('the row count in the label is what the copy actually gives you', () => {
  reset();
  const one = stubTable({ rows: [ROWS[0]] });
  const off1 = RM.attach(one);
  one.tap(0);
  assert.deepEqual(labels(), ['Copy this record'],
    'a one-row table offered a table copy that says nothing the row copy does not');
  off1();

  // A filtered grid answers getRows('active') with what is left, and the label
  // has to follow it: 322 over 74 visible rows would describe the file.
  const few = stubTable({ rows: ROWS.slice(0, 2) });
  const off2 = RM.attach(few, { noun: 'row' });
  few.tap(0);
  assert.deepEqual(labels(), ['Copy this row', 'Copy 2 rows']);
  assert.ok(few.calls.includes('getRows:active'), 'the count came from somewhere other than the active rows');
  off2();
});

test('copy delegates to io.copy and reports what it got back', async () => {
  reset();
  const wrote = [];
  window.io = { copy: (text) => { wrote.push(text); return Promise.resolve(true); } };
  const t = stubTable();
  const off = RM.attach(t);

  t.tap(2);
  const btn = clickItem('Copy this record');
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(wrote, ['Item\tAmount\nc-3\ttwo lines here'],
    'the row copy is not the visible columns as TSV');
  assert.match(btn.textContent, /Copied/, 'a finished copy said nothing');

  wrote.length = 0;
  RM.close();
  t.tap(0);
  clickItem('Copy 3 rows');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(wrote.length, 1);
  assert.deepEqual(wrote[0].split('\n'), ['Item\tAmount', 'a-1\t10', 'b-2\t', 'c-3\ttwo lines here']);

  // A refused write says so rather than claiming success.
  window.io = { copy: () => Promise.resolve(false) };
  RM.close();
  t.tap(0);
  const b2 = clickItem('Copy this record');
  await new Promise(r => setTimeout(r, 0));
  assert.match(b2.textContent, /Copy failed/);
  off();
});

test('host items ride along and are handed the row', () => {
  reset();
  const got = [];
  const t = stubTable();
  const off = RM.attach(t, {
    copy: false,
    items: [{ label: 'Open', icon: 'ph-arrow-square-out', run: (ctx) => { got.push(ctx); } }],
  });
  t.tap(2);
  assert.deepEqual(labels(), ['Open']);
  clickItem('Open');
  assert.equal(got.length, 1);
  assert.equal(got[0].data, ROWS[2]);
  assert.equal(got[0].table, t);
  off();
});

test('it goes away: Escape, an outside tap, a scroll, and detach', () => {
  reset();
  const t = stubTable();
  const off = RM.attach(t);

  t.tap(0);
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu(), null, 'Escape left the menu up');

  t.tap(0);
  doc.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(menu(), null, 'a tap outside left the menu up');

  t.tap(0);
  doc.dispatchEvent(new window.Event('scroll', { bubbles: true }));
  assert.equal(menu(), null, 'a scroll left the menu pointing at a row that had moved');

  // The row it belongs to is marked while it is up, and unmarked after.
  t.tap(0);
  assert.ok(t.rowEl(0).classList.contains('row-menu-on'), 'the tapped row is not marked');
  RM.close();
  assert.ok(!t.rowEl(0).classList.contains('row-menu-on'), 'the mark outlived the menu');

  off();
  t.tap(0);
  assert.equal(menu(), null, 'detach left the row tap wired');
});

test('the kit touches only the three Tabulator calls it declares', () => {
  reset();
  const t = stubTable();
  window.recordDeck = { fromGrid: () => {} };
  const off = RM.attach(t, { deck: {} });
  t.tap(0);
  clickItem('Read from here');
  off();
  const used = new Set(t.calls.map(c => c.split(':')[0]));
  assert.deepEqual([...used].sort(), ['getColumns', 'getRows', 'on'],
    'the kit reached for a Tabulator method its header does not declare');
});
