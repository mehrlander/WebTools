// kits/pdf.js — the pure layers, under node with synthetic fixtures.
//
// The kit is split so that everything structural (geom, stream, lattice) takes
// plain arrays and returns plain arrays, with no pdf.js and no DOM. That is
// what this file exercises. The pdf.js boundary (`open`) and the pdf-lib
// boundary (`doc`) need a real browser and are covered by
// tools/test/pdf-kit-browser.mjs against a generated PDF.
//
// Fixtures are hand-built page geometry, in PDF user space (y up). Building
// them by hand is the point: a real PDF would make a failure ambiguous between
// the extractor and the analysis, and the analysis is what is being tested.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const KIT = readFileSync(path.join(repoRoot, 'lib', 'kits', 'pdf.js'), 'utf8');

const load = () => {
  const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
  window.eval(KIT);
  return window.pdf;
};

const pdf = load();

// The kit runs inside the jsdom realm, so the arrays it returns have a
// different Array.prototype and fail strict deepEqual on identity alone.
// Re-materialize into this realm before comparing structure.
const plain = v => JSON.parse(JSON.stringify(v));

// A text item as `open()` produces one. `base` is the baseline, y1/y2 the box.
const item = (str, x1, base, w, opts = {}) => ({
  str, page: opts.page ?? 1,
  x1, x2: x1 + w, base, y1: base, y2: base + (opts.h ?? 8),
  w, h: opts.h ?? 8, fontSize: opts.fontSize ?? 10,
  bold: !!opts.bold, italic: !!opts.italic,
  fontName: opts.fontName ?? 'Helvetica', fontFamily: 'sans-serif',
  glyphs: [], underline: false, strikethrough: false,
});

const hline = (y, x1, x2, o = {}) => ({ id: o.id ?? 0, page: o.page ?? 1, y, x1, x2, color: o.color ?? '#000000', width: o.width ?? 1, origin: 'path' });
const vline = (x, y1, y2, o = {}) => ({ id: o.id ?? 0, page: o.page ?? 1, x, y1, y2, color: o.color ?? '#000000', width: o.width ?? 1, origin: 'path' });

// ---- geom ----------------------------------------------------------------

test('snapRound clusters jitter to a shared mean', () => {
  const snap = pdf.geom.snapRound([71.9994, 72.0001, 72.0, 144.5], 1.5, 2);
  assert.equal(snap(71.9994), snap(72.0001));
  assert.equal(snap(72.0), snap(71.9994));
  assert.notEqual(snap(72.0), snap(144.5));
});

test('snapRound leaves values further apart than the tolerance alone', () => {
  const snap = pdf.geom.snapRound([10, 12, 40], 1.5, 2);
  assert.notEqual(snap(10), snap(12));
});

test('snapRound chains through a run of small steps', () => {
  // Documented consequence of single-link clustering: 10 and 13 land together
  // because 11.5 bridges them. Worth pinning, since it is how a too-generous
  // snap tolerance collapses a thin column into its neighbour.
  const snap = pdf.geom.snapRound([10, 11.5, 13], 1.6, 2);
  assert.equal(snap(10), snap(13));
});

test('snapRound survives an empty set', () => {
  assert.equal(pdf.geom.snapRound([], 1.5)(5), 5);
});

test('anchors returns sorted distinct boundaries', () => {
  const a = pdf.geom.anchors([100, 100.4, 300, 299.8, 200], 1.5);
  assert.equal(a.length, 3);
  assert.deepEqual(plain(a).map(Math.round), [100, 200, 300]);
});

test('dedupe drops a doubled stroke', () => {
  const kept = pdf.geom.dedupe([hline(100, 50, 300), hline(100.2, 50.1, 300.1), hline(200, 50, 300)], 'h');
  assert.equal(kept.length, 2);
});

test('joinCollinear merges a dotted leader into one rule', () => {
  // 40 one-point dots with one-point gaps: what a leader row actually emits.
  const dots = Array.from({ length: 40 }, (_, i) => hline(100, 50 + i * 2, 51 + i * 2));
  const joined = pdf.geom.joinCollinear(dots, 'h', { join: 3 });
  assert.equal(joined.length, 1);
  assert.equal(joined[0].x1, 50);
  assert.equal(joined[0].x2, 129);
});

test('joinCollinear keeps a genuine gap apart', () => {
  const joined = pdf.geom.joinCollinear([hline(100, 50, 100), hline(100, 200, 300)], 'h', { join: 3 });
  assert.equal(joined.length, 2);
});

test('joinCollinear merges across a small track difference', () => {
  const joined = pdf.geom.joinCollinear([hline(100, 50, 100), hline(100.4, 101, 200)], 'h', { join: 3, snap: 1.5 });
  assert.equal(joined.length, 1);
});

test('usable drops white strokes, hairlines, and stubs', () => {
  const lines = [
    hline(100, 0, 300),
    hline(110, 0, 300, { color: '#ffffff' }),
    hline(120, 0, 300, { width: 0 }),
    hline(130, 0, 2),
  ];
  const kept = pdf.geom.usable(lines, 'h', { minEdge: 5 });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].y, 100);
});

test('usable honours a non-white page background', () => {
  const lines = [hline(100, 0, 300, { color: '#eeeeee' })];
  assert.equal(pdf.geom.usable(lines, 'h', { background: '#eeeeee' }).length, 0);
  assert.equal(pdf.geom.usable(lines, 'h', { background: '#ffffff' }).length, 1);
});

test('usable filters a white stroke handed over as a typed array', () => {
  // Regression. pdf.js delivers colour operands as a Uint8ClampedArray, and
  // mapping one in place returns another typed array that coerces hex strings
  // back to numbers, so every colour silently became #000 and no white rule was
  // ever filtered. Caught only against a real PDF; pinned here as the cheap check.
  const hex = '#' + Array.from(new Uint8ClampedArray([255, 255, 255]))
    .map(c => c.toString(16).padStart(2, '0')).join('');
  assert.equal(hex, '#ffffff');
  assert.equal(pdf.geom.usable([hline(100, 0, 300, { color: hex })], 'h').length, 0);
});

test('overlapArea and centroid agree on a contained box', () => {
  const cell = pdf.geom.box(0, 0, 100, 20);
  const text = pdf.geom.box(10, 5, 40, 15);
  assert.equal(pdf.geom.overlapArea(cell, text), pdf.geom.area(text));
  assert.ok(pdf.geom.contains(cell, pdf.geom.centroid(text)));
});

// ---- stream --------------------------------------------------------------

const TABLE_ITEMS = [
  item('AGENCY', 100, 700, 45, { bold: true }),
  item('CODE', 300, 700, 30, { bold: true }),
  item('AMOUNT', 460, 700, 40, { bold: true }),

  item('Retirement Systems', 100, 680, 90),
  item('1240', 300, 680, 24),
  item('457,833', 460, 680, 40),

  item('Health Care Authority', 100, 660, 100),
  item('1070', 300, 660, 24),
  item('1,204,556', 460, 660, 40),
];

test('rows groups by baseline and reads top to bottom', () => {
  const r = pdf.stream.rows(TABLE_ITEMS);
  assert.equal(r.length, 3);
  assert.equal(r[0].base, 700);
  assert.equal(r[2].base, 660);
  assert.equal(r[0].str, 'AGENCY CODE AMOUNT');
});

test('rows tolerates baseline jitter within tolerance', () => {
  const r = pdf.stream.rows([item('a', 0, 700, 10), item('b', 20, 700.8, 10)], { tol: 2 });
  assert.equal(r.length, 1);
});

test('rows separates lines beyond tolerance', () => {
  const r = pdf.stream.rows([item('a', 0, 700, 10), item('b', 20, 690, 10)], { tol: 2 });
  assert.equal(r.length, 2);
});

test('chunks merges adjacent items and splits on a wide gap', () => {
  const c = pdf.stream.chunks([
    item('Retirement', 100, 680, 50),
    item('Systems', 152, 680, 38),
    item('457,833', 460, 680, 40),
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].str, 'Retirement Systems');
  assert.equal(c[1].str, '457,833');
});

test('chunks splits on a style break even when the items touch', () => {
  const c = pdf.stream.chunks([
    item('Total:', 100, 680, 30, { bold: true }),
    item('457,833', 131, 680, 40),
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].str, 'Total:');
});

test('chunks can be told to ignore style', () => {
  const c = pdf.stream.chunks([
    item('Total:', 100, 680, 30, { bold: true }),
    item('457,833', 131, 680, 40),
  ], { splitStyle: false });
  assert.equal(c.length, 1);
});

test('columns finds left-aligned columns by frequency', () => {
  const cols = pdf.stream.columns(TABLE_ITEMS);
  assert.equal(cols.length, 3);
  assert.deepEqual(plain(cols).map(c => Math.round(c.at)), [100, 300, 460]);
  assert.equal(cols[0].edge, 'x1');
});

test('columns switches to the right edge for a right-aligned money column', () => {
  // Labels vary in width and never share a left edge; the amounts all end at
  // 560. Nothing tells the function which edge to use; the counts do.
  const money = [
    item('Retirement', 100, 680, 50), item('457,833', 520, 680, 40),
    item('Health', 100, 660, 32), item('1,204,556', 505, 660, 55),
    item('Ecology', 100, 640, 38), item('22,109', 528, 640, 32),
  ];
  const cols = pdf.stream.columns(money);
  assert.equal(cols.some(c => c.edge === 'x2' && Math.round(c.at) === 560), true);
});

test('columns can be forced onto a given edge', () => {
  const cols = pdf.stream.columns(TABLE_ITEMS, { edge: 'x2' });
  assert.ok(cols.every(c => c.edge === 'x2'));
});

test('gutters finds the whitespace between columns', () => {
  const g = pdf.stream.gutters(TABLE_ITEMS, { minWidth: 6 });
  // Two interior gutters: 190-300 and 500-460... i.e. after each column block.
  assert.equal(g.length, 2);
  assert.ok(g[0].x1 >= 190 && g[0].x2 <= 300);
  assert.ok(g[1].x1 >= 330 && g[1].x2 <= 460);
});

test('gutters is defeated by a row that spans the page, where columns is not', () => {
  // The documented complementarity. A full-width title bridges every gutter,
  // so the whitespace method sees one column; the frequency method is unmoved.
  const withTitle = [...TABLE_ITEMS, item('SUMMARY OF APPROPRIATIONS BY AGENCY', 100, 720, 400)];
  assert.equal(pdf.stream.gutters(withTitle, { minWidth: 6 }).length, 0);
  assert.equal(pdf.stream.columns(withTitle).length, 3);
});

test('split assigns a value by where it starts, not where its centre lands', () => {
  // "1,204,556" starts at 460 and runs past the 540 boundary. Centre-based
  // assignment would file it in the last column; start-based keeps it in its own.
  const rows = pdf.stream.split([
    item('Health Care Authority', 100, 660, 100),
    item('1,204,556', 460, 660, 100),
  ], [100, 300, 460, 620]);
  assert.equal(rows[0].cells[2], '1,204,556');
  assert.equal(rows[0].cells[3], '');
});

test('split fills a full table', () => {
  const rows = pdf.stream.split(TABLE_ITEMS, [100, 300, 460]);
  assert.equal(rows.length, 3);
  assert.deepEqual(plain(rows[1].cells), ['Retirement Systems', '1240', '457,833']);
});

// ---- lattice -------------------------------------------------------------

// A 2x2 ruled grid: x at 100/200/300, y at 700/680/660.
const gridLines = () => ({
  h: [hline(700, 100, 300, { id: 1 }), hline(680, 100, 300, { id: 2 }), hline(660, 100, 300, { id: 3 })],
  v: [vline(100, 660, 700, { id: 4 }), vline(200, 660, 700, { id: 5 }), vline(300, 660, 700, { id: 6 })],
});

test('junctions finds every crossing once', () => {
  const { h, v } = gridLines();
  const j = pdf.lattice.junctions(h, v);
  assert.equal(j.length, 9);
});

test('junctions ignores a vertical that stops short of the rule', () => {
  const j = pdf.lattice.junctions([hline(700, 100, 300)], [vline(200, 100, 600)]);
  assert.equal(j.length, 0);
});

test('junctions accepts a near miss inside the intersection tolerance', () => {
  const j = pdf.lattice.junctions([hline(700, 100, 300)], [vline(200, 660, 699.5)], { intersect: 1 });
  assert.equal(j.length, 1);
});

test('cells finds four atomic cells in a 2x2 grid and no enclosing one', () => {
  const { h, v } = gridLines();
  const c = pdf.lattice.cells(pdf.lattice.junctions(h, v));
  assert.equal(c.length, 4);
  // The outer 100..300 x 660..700 rectangle is a valid closed loop but is NOT
  // atomic; the right-and-down walk must never return it.
  assert.equal(c.some(x => x.x1 === 100 && x.x2 === 300), false);
});

test('cells returns nothing for an L of rules with no closing corner', () => {
  const c = pdf.lattice.cells(pdf.lattice.junctions(
    [hline(700, 100, 300)],
    [vline(100, 600, 700)]));
  assert.equal(c.length, 0);
});

test('cells rejects a three-cornered rectangle', () => {
  // Top rule, left rule, bottom rule, but no right vertical. Three junctions
  // exist; the fourth corner does not, so no cell may be reported.
  const c = pdf.lattice.cells(pdf.lattice.junctions(
    [hline(700, 100, 300, { id: 1 }), hline(660, 100, 300, { id: 2 })],
    [vline(100, 660, 700, { id: 3 })]));
  assert.equal(c.length, 0);
});

test('cluster keeps one grid together and separates two tables', () => {
  const a = gridLines();
  const far = {
    h: [hline(400, 100, 200, { id: 7 }), hline(380, 100, 200, { id: 8 })],
    v: [vline(100, 380, 400, { id: 9 }), vline(200, 380, 400, { id: 10 })],
  };
  const one = pdf.lattice.cluster(pdf.lattice.cells(pdf.lattice.junctions(a.h, a.v)));
  assert.equal(one.length, 1);
  assert.equal(one[0].cells.length, 4);

  const both = pdf.lattice.cluster(pdf.lattice.cells(
    pdf.lattice.junctions([...a.h, ...far.h], [...a.v, ...far.v])));
  assert.equal(both.length, 2);
});

test('anchorGrid derives rows and columns from the cells themselves', () => {
  const { h, v } = gridLines();
  const table = pdf.lattice.cluster(pdf.lattice.cells(pdf.lattice.junctions(h, v)))[0];
  const grid = pdf.lattice.anchorGrid(table);
  assert.equal(grid.rows, 2);
  assert.equal(grid.cols, 2);
  assert.deepEqual(plain(grid.rowAnchors), [700, 680, 660]); // top down
});

test('anchorGrid reports a spanning cell as a colspan', () => {
  // A header row with no interior vertical: one wide cell over two narrow ones.
  const h = [hline(720, 100, 300, { id: 1 }), hline(700, 100, 300, { id: 2 }), hline(680, 100, 300, { id: 3 })];
  const v = [vline(100, 680, 720, { id: 4 }), vline(200, 680, 700, { id: 5 }), vline(300, 680, 720, { id: 6 })];
  const table = pdf.lattice.cluster(pdf.lattice.cells(pdf.lattice.junctions(h, v)))[0];
  const grid = pdf.lattice.anchorGrid(table);
  const header = grid.cells.find(c => c.row === 0);
  assert.equal(header.colspan, 2);
  assert.equal(grid.cells.filter(c => c.row === 1).length, 2);
});

test('assign places text by majority overlap', () => {
  const { h, v } = gridLines();
  const table = pdf.lattice.cluster(pdf.lattice.cells(pdf.lattice.junctions(h, v)))[0];
  const grid = pdf.lattice.anchorGrid(table);
  const text = [
    item('Agency', 110, 685, 40), item('Amount', 210, 685, 40),
    item('DRS', 110, 665, 20), item('457,833', 210, 665, 40),
  ];
  const placed = pdf.lattice.assign(grid, text);
  assert.equal(placed.unplaced.length, 0);
  const m = pdf.lattice.toMatrix(placed);
  assert.deepEqual(plain(m), [['Agency', 'Amount'], ['DRS', '457,833']]);
});

test('assign reports text that belongs to no cell', () => {
  const { h, v } = gridLines();
  const table = pdf.lattice.cluster(pdf.lattice.cells(pdf.lattice.junctions(h, v)))[0];
  const grid = pdf.lattice.anchorGrid(table);
  const placed = pdf.lattice.assign(grid, [item('page footer', 100, 100, 60)]);
  assert.equal(placed.unplaced.length, 1);
  assert.equal(placed.unplaced[0].str, 'page footer');
});

test('assign keeps text that overruns its cell by a rounding error', () => {
  const { h, v } = gridLines();
  const table = pdf.lattice.cluster(pdf.lattice.cells(pdf.lattice.junctions(h, v)))[0];
  const grid = pdf.lattice.anchorGrid(table);
  // Starts 0.3pt left of the 100 boundary: real coordinate bleed, not a
  // different cell.
  const placed = pdf.lattice.assign(grid, [item('DRS', 99.7, 665, 20)], { pad: 0.5 });
  assert.equal(placed.unplaced.length, 0);
});

test('grids runs the whole pipeline through dotted rules and white strokes', () => {
  const { h, v } = gridLines();
  const noise = [
    ...Array.from({ length: 30 }, (_, i) => hline(670, 100 + i * 2, 101 + i * 2, { id: 100 + i })),
    hline(690, 100, 300, { color: '#ffffff', id: 200 }),
  ];
  const text = [item('Agency', 110, 685, 40), item('DRS', 110, 665, 20),
                item('Amount', 210, 685, 40), item('457,833', 210, 665, 40)];
  const tables = pdf.lattice.grids({ h: [...h, ...noise], v }, text);
  assert.equal(tables.length, 1);
  // The white rule at y=690 must not have created a third row, and the dotted
  // run at y=670 must not have created a fourth: both are filtered before the
  // junction walk, one by colour and one by never reaching a vertical.
  assert.equal(tables[0].rows, 2);
  assert.deepEqual(plain(tables[0].matrix), [['Agency', 'Amount'], ['DRS', '457,833']]);
});

test('grids returns an empty list for a page with no rules', () => {
  assert.deepEqual(plain(pdf.lattice.grids({ h: [], v: [] }, TABLE_ITEMS)), []);
});

// ---- the two methods against each other ----------------------------------

test('stream and lattice agree on a fully ruled table', () => {
  // The control the kit exists to make possible: two unrelated readings of the
  // same page, compared. Agreement here is evidence; a disagreement would be
  // the finding.
  const { h, v } = gridLines();
  const text = [item('Agency', 110, 685, 40), item('Amount', 210, 685, 40),
                item('DRS', 110, 665, 20), item('457,833', 210, 665, 40)];

  const lat = pdf.lattice.grids({ h, v }, text)[0].matrix;
  const str = pdf.stream.split(text, pdf.stream.columns(text).map(c => c.x1)).map(r => r.cells);
  assert.deepEqual(plain(lat), plain(str));
});
