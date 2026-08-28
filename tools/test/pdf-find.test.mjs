// kits/pdf.js `find` — text search over extracted items, under node.
//
// The same bargain as pdf-kit.test.mjs: `find` is a pure layer that takes the
// item shape `open()` produces and returns hits with rectangles in PDF user
// space, no pdf.js and no DOM. Hand-built items keep a failure unambiguous
// between the extractor and the search. The pdf.js-lazy path (lookAt().find)
// and the flow's highlight drawing need a browser and are covered by
// tools/test/viewer-pdf.mjs.

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
const plain = v => JSON.parse(JSON.stringify(v));

// A text run with per-glyph x, evenly split, exactly as lookAt().items builds
// one. base is the baseline; y1/y2 the band; the glyphs make a sub-run tight.
const item = (str, x1, base, w, opts = {}) => {
  const per = str.length ? w / str.length : 0;
  return {
    str, page: opts.page ?? 1,
    x1, x2: x1 + w, base, y1: base, y2: base + (opts.h ?? 8), w, h: opts.h ?? 8,
    glyphs: [...str].map((char, i) => ({ char, x1: x1 + per * i, x2: x1 + per * (i + 1) })),
  };
};

test('a single word is found with a page and a covering rectangle', () => {
  const r = pdf.find.search([item('Retirement', 100, 680, 90)], 'Retirement');
  assert.equal(r.count, 1);
  assert.equal(r.hits[0].page, 1);
  assert.equal(r.hits[0].rects.length, 1);
  assert.ok(Math.abs(r.hits[0].rects[0].x - 100) < 0.01);
  assert.ok(Math.abs(r.hits[0].rects[0].w - 90) < 0.01);
});

test('find is case-insensitive by default and can be made sensitive', () => {
  const items = [item('Retirement Systems', 100, 680, 120)];
  assert.equal(pdf.find.search(items, 'systems').count, 1);
  assert.equal(pdf.find.search(items, 'systems', { caseSensitive: true }).count, 0);
  assert.equal(pdf.find.search(items, 'Systems', { caseSensitive: true }).count, 1);
});

test('typographic marks fold to ASCII on both sides', () => {
  // The page prints a curly apostrophe and an en dash; a reader types neither.
  const items = [item('Employee’s grant – RAP', 100, 680, 150)];
  assert.equal(pdf.find.search(items, "Employee's grant - RAP").count, 1);
  assert.equal(pdf.find.search([item("Director's note", 100, 680, 90)], 'Director’s').count, 1);
});

test('a phrase split across two items still matches, with a space between', () => {
  // pdf.js hands "reserve spreadsheet" back as two items joined by nothing;
  // find inserts the space so the words read as words.
  const items = [item('contingency reserve', 100, 680, 120), item('spreadsheet', 224, 680, 70)];
  assert.equal(pdf.find.search(items, 'reserve spreadsheet').count, 1);
  // and the two covering items merge into one line rectangle
  assert.equal(pdf.find.search(items, 'reserve spreadsheet').hits[0].rects.length, 1);
});

test('a hyphen at a line end joins rather than spaces', () => {
  // "level-" wrapping to "of-service" is one word carrying on; no space.
  const items = [item('level-', 100, 680, 40), item('of-service', 100, 660, 70)];
  assert.equal(pdf.find.search(items, 'level-of-service').count, 1);
});

test('every occurrence is returned, ordinaled in reading order', () => {
  const items = [
    item('cost', 100, 680, 30, { page: 1 }),
    item('the cost of cost', 100, 660, 110, { page: 1 }),
    item('cost', 100, 700, 30, { page: 2 }),
  ];
  const r = pdf.find.search(items, 'cost');
  assert.equal(r.count, 4);
  assert.deepEqual(plain(r.hits.map(h => h.ordinal)), [0, 1, 2, 3]);
  // page 1's three hits come before page 2's one
  assert.deepEqual(plain(r.hits.map(h => h.page)), [1, 1, 1, 2]);
});

test('a match spanning two printed lines yields one rectangle per line', () => {
  // The needle runs off the end of one baseline and onto the next.
  const items = [item('annual budget', 100, 680, 90), item('request', 100, 660, 50)];
  const r = pdf.find.search(items, 'budget request');
  assert.equal(r.count, 1);
  assert.equal(r.hits[0].rects.length, 2);
});

test('a sub-run match is tight to its glyphs, not the whole item', () => {
  // "budget" sits inside one long run; the rectangle covers the six letters,
  // not the sentence, because the glyphs carry per-character x.
  const it = item('the budget line', 100, 680, 150); // 15 chars, 10pt each
  const r = pdf.find.search([it], 'budget');
  const rect = r.hits[0].rects[0];
  assert.ok(rect.x > 130 && rect.x < 145, `x was ${rect.x}`);   // starts near char 4
  assert.ok(rect.w > 55 && rect.w < 65, `w was ${rect.w}`);      // six chars wide
});

test('an absent needle finds nothing', () => {
  assert.equal(pdf.find.search([item('Retirement', 100, 680, 90)], 'pension').count, 0);
});

test('an empty or whitespace query is not a search', () => {
  assert.equal(pdf.find.search([item('x', 0, 0, 5)], '').count, 0);
  assert.equal(pdf.find.search([item('x', 0, 0, 5)], '   ').count, 0);
});

test('normalizeQuery folds, collapses, and trims', () => {
  assert.equal(pdf.find.normalizeQuery('  Grant—awards   table  '), 'grant-awards table');
  assert.equal(pdf.find.normalizeQuery('KEEP Case', true), 'KEEP Case');
});

test('the limit caps a runaway query rather than returning everything', () => {
  const items = Array.from({ length: 50 }, (_, i) => item('a a a', 0, 700 - i, 20, { page: 1 }));
  assert.equal(pdf.find.search(items, 'a', { limit: 10 }).count, 10);
});

test('search returns plain structure the way the pure layers do', () => {
  const r = pdf.find.search([item('cost', 100, 680, 30)], 'cost');
  assert.deepEqual(Object.keys(plain(r)).sort(), ['count', 'hits', 'query']);
});
