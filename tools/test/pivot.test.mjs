// alpineComponents/transform-workbench.js — the Pivot view's arithmetic: the
// column scan that decides dimensions from measures, the grouped tree, and the
// flat rows the pane shows. Driven against the component factory directly with
// a stubbed Alpine, since none of it touches the DOM; no jsdom, no pixels.
//
// What is actually under test is the pane's three claims: a sum tree is a
// partition (every parent equals the sum of its children), a measure that will
// not parse is skipped rather than counted as a zero, and a sum of money that
// arrived with two decimals comes back with two.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

// Capture the component factory: the file registers on alpine:init, so a fake
// document hands the listener straight back and a fake Alpine records the
// factory it registers.
function loadFactory() {
  let init = null;
  const factories = {};
  const win = {
    document: { addEventListener: (n, f) => { if (n === 'alpine:init') init = f; } },
    Alpine: { data: (name, fn) => { factories[name] = fn; }, raw: x => x, store: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  win.window = win;
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/transform-workbench.js'), 'utf8');
  new Function('window', 'document', 'Alpine', 'localStorage', 'matchMedia',
    'with (window) { ' + src + ' }')(win, win.document, win.Alpine, win.localStorage, win.matchMedia);
  assert.ok(init, 'the file never registered an alpine:init listener');
  init();
  assert.ok(factories.transformWorkbench, 'transformWorkbench was never registered');
  return factories.transformWorkbench;
}

// A component instance far enough along to pivot: the factory's own defaults,
// one tab of rows, and Alpine.raw as identity.
function bench(rows) {
  const wb = loadFactory()({});
  wb.tabs = [{ name: 't', rows }];
  wb.active = 0;
  wb.sendToViewer = () => {};
  return wb;
}

// Money as a spreadsheet emits it: thousands separators, a currency mark, an
// accounting negative, a blank dimension, and one value that is not a number.
const ROWS = [
  { fund: '600-1', object: 'A', doc_id: 'D1', amount: '$1,000.00' },
  { fund: '600-1', object: 'A', doc_id: 'D2', amount: '$250.25' },
  { fund: '600-1', object: 'B', doc_id: 'D3', amount: '$99.75' },
  { fund: '888-6', object: 'A', doc_id: 'D4', amount: '(400.00)' },
  { fund: '888-6', object: 'B', doc_id: 'D5', amount: '$2,000.00' },
  { fund: '', object: 'B', doc_id: 'D6', amount: '$10.00' },
  { fund: '600-1', object: 'A', doc_id: 'D7', amount: 'n/a' },
];

test('the scan separates measures from dimensions and refuses an id-shaped column', () => {
  const wb = bench(ROWS);
  wb.pvScan();
  assert.equal(wb.pvIsNum.amount, true, 'a money column read as text is still a measure');
  assert.equal(wb.pvIsNum.fund, false);
  assert.equal(wb.pvIsNum.doc_id, false);
  // doc_id is unique per row, so it is no use as a dimension either; fund is
  // the coarsest real one and is what a first look should land on.
  assert.deepEqual(wb.pvDims, ['fund']);
  assert.equal(wb.pvMeasure, 'amount', 'an amount-like name wins the measure default');
  assert.equal(wb.pvDec.amount, 2, 'the measure carried two decimals');
});

test('a sum tree is a partition, and the unparseable row is skipped not zeroed', () => {
  const wb = bench(ROWS);
  wb.pvScan();
  wb.pvDims = ['fund', 'object'];
  const res = wb.pvTree(ROWS);

  assert.equal(res.partition, true);
  assert.equal(res.skipped, 1, 'the "n/a" row is out, and counted');
  assert.equal(res.tree.n, 6, 'six rows reached the tree, not seven');
  // 1000.00 + 250.25 + 99.75 - 400.00 + 2000.00 + 10.00
  assert.equal(res.tree.value, 2960);

  // The claim the indented column rests on, at every level.
  const walk = (n) => {
    if (!n.children.length) return;
    const sum = n.children.reduce((a, c) => a + c.value, 0);
    assert.ok(Math.abs(sum - n.value) < 1e-9, `${n.label || 'Total'}: ${sum} != ${n.value}`);
    n.children.forEach(walk);
  };
  walk(res.tree);

  const byLabel = Object.fromEntries(res.tree.children.map(c => [c.label, c]));
  assert.deepEqual(Object.keys(byLabel).sort(), ['(blank)', '600-1', '888-6'],
    'an empty dimension value is a bucket, not a dropped row');
  assert.equal(byLabel['888-6'].value, 1600, 'the accounting negative parsed as negative');
});

test('a sum of two-decimal money comes back with two decimals', () => {
  const wb = bench([
    { k: 'a', v: '0.10' }, { k: 'a', v: '0.20' }, { k: 'b', v: '0.30' },
  ]);
  wb.pvScan();
  wb.pvDims = ['k']; wb.pvMeasure = 'v'; wb.pvAgg = 'sum';
  const res = wb.pvTree(Object.values(wb.tabs[0].rows));
  // 0.1 + 0.2 is 0.30000000000000004 before the round.
  assert.equal(res.tree.children.find(c => c.label === 'a').value, 0.3);
  assert.equal(res.tree.value, 0.6);
});

test('avg, min and max are reported as non-partitions', () => {
  for (const agg of ['avg', 'min', 'max']) {
    const wb = bench(ROWS);
    wb.pvScan(); wb.pvDims = ['fund']; wb.pvAgg = agg;
    assert.equal(wb.pvTree(ROWS).partition, false, `${agg} claimed to be a partition`);
  }
  const wb = bench(ROWS);
  wb.pvScan(); wb.pvDims = ['fund']; wb.pvAgg = 'count'; wb.pvMeasure = '';
  const res = wb.pvTree(ROWS);
  assert.equal(res.partition, true, 'counting rows is a partition');
  assert.equal(res.tree.value, 7, 'counting takes every row, including the unparseable one');
});

test('the flat rows fill the dimension columns down to their own depth', () => {
  const wb = bench(ROWS);
  wb.pvScan();
  wb.pvDims = ['fund', 'object'];
  const flat = wb.pvFlat(wb.pvTree(ROWS));

  assert.equal(flat[0].level, 0);
  assert.equal(flat[0].fund, '');
  assert.equal(flat[0].object, '', 'the grand total fills no dimension');
  assert.equal(flat[0]['sum(amount)'], 2960);

  const leaf = flat.find(r => r.level === 2);
  assert.ok(leaf.fund && leaf.object, 'a leaf fills both levels');
  assert.equal(flat.filter(r => r.level === 1).length, 3);
  // one total + three funds + every fund/object pair that has rows
  assert.equal(flat.length, 1 + 3 + flat.filter(r => r.level === 2).length);
});
