#!/usr/bin/env node
// kits/pdf.js — the pdf.js and pdf-lib boundaries, in real Chromium.
//
//   node tools/test/pdf-kit-browser.mjs [--keep]
//
// tools/test/pdf-kit.test.mjs covers everything structural under jsdom, because
// the analysis layers are pure. What it cannot cover is the part that only
// exists inside a browser with pdf.js running: whether the operator-list walk
// actually recovers the rules a PDF draws, whether the matrix stack puts them
// where the text is, and whether the glyph advances land on the ink.
//
// So this builds a PDF with pdf-lib at coordinates it chooses, opens it through
// the kit, and checks that what comes back is what went in. A generated fixture
// is the only way to have an answer key: with a found PDF, a disagreement tells
// you something is wrong but not which side.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tools', '.preview', 'pdf-kit');
const keep = process.argv.includes('--keep');

// ---------------------------------------------------------------- the fixture

// One page, US Letter (612 x 792), with three things the kit must handle and
// exact coordinates for each:
//
//   1. A 3-column, 3-row ruled table. Rules at x 60/220/380/540 and
//      y 700/676/652/628. Every cell has text.
//   2. A white vertical rule inside the header band. Invisible to a reader,
//      fully visible to a naive extractor, which would then rule the header
//      into cells that bisect its text.
//   3. A dotted leader row below the table, drawn as 1pt segments, plus an
//      underlined and a struck word. The leader must not become a table rule;
//      the decoration must reach the right characters.
const COLS = [60, 220, 380, 540];
const ROWS = [700, 676, 652, 628];
const CELLS = [
  ['AGENCY', 'CODE', 'AMOUNT'],
  ['Retirement Systems', '1240', '457,833'],
  ['Health Care Authority', '1070', '1,204,556'],
];

async function buildFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0), white = rgb(1, 1, 1);

  for (const y of ROWS) page.drawLine({ start: { x: COLS[0], y }, end: { x: COLS.at(-1), y }, thickness: 1, color: black });
  for (const x of COLS) page.drawLine({ start: { x, y: ROWS.at(-1) }, end: { x, y: ROWS[0] }, thickness: 1, color: black });

  // The trap: a white rule bisecting the header band.
  page.drawLine({ start: { x: 140, y: ROWS[1] }, end: { x: 140, y: ROWS[0] }, thickness: 1, color: white });

  CELLS.forEach((row, r) => row.forEach((text, c) => {
    page.drawText(text, { x: COLS[c] + 6, y: ROWS[r] - 16, size: 9, font, color: black });
  }));

  // A dotted leader: 120 one-point segments with one-point gaps, at y 600.
  for (let i = 0; i < 120; i++) {
    const x = 200 + i * 2;
    page.drawLine({ start: { x, y: 600 }, end: { x: x + 1, y: 600 }, thickness: 0.5, color: black });
  }
  page.drawText('Total appropriated', { x: 60, y: 596, size: 9, font, color: black });
  page.drawText('457,833', { x: 480, y: 596, size: 9, font, color: black });

  // Decoration: "STRICKEN" struck through, "APPROVED" underlined.
  page.drawText('STRICKEN', { x: 60, y: 560, size: 9, font, color: black });
  page.drawLine({ start: { x: 60, y: 563 }, end: { x: 106, y: 563 }, thickness: 0.6, color: black });
  page.drawText('APPROVED', { x: 200, y: 560, size: 9, font, color: black });
  page.drawLine({ start: { x: 200, y: 558 }, end: { x: 250, y: 558 }, thickness: 0.6, color: black });

  return Buffer.from(await doc.save());
}

// ---------------------------------------------------------------- the harness

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.pdf': 'application/pdf', '.map': 'application/json' };

function serve(files) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = req.url.split('?')[0];
      const body = files[url];
      if (!body) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(url)] ?? MIME['.html'] });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ok' : 'FAIL'}  ${name}${detail && !pass ? `\n        ${detail}` : ''}`);
};

// ---------------------------------------------------------------------- run

const pdfBytes = await buildFixture();
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'fixture.pdf'), pdfBytes);

const kit = readFileSync(path.join(root, 'lib', 'kits', 'pdf.js'), 'utf8');
const pdfjs = readFileSync(path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.js'));
const worker = readFileSync(path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js'));
const pdflib = readFileSync(path.join(root, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'));

// The kit hardcodes jsDelivr; point it at the local copies so the run needs no
// network. This is the only edit, and it proves the same code path.
const localKit = kit
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js/, '/pdf.min.js')
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js/, '/pdf.worker.min.js')
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdf-lib@[\d.]+\/dist\/pdf-lib\.min\.js/, '/pdf-lib.min.js');

const { server, port } = await serve({
  '/': `<!doctype html><meta charset="utf-8"><title>pdf kit</title><script>${localKit}</script>`,
  '/pdf.min.js': pdfjs,
  '/pdf.worker.min.js': worker,
  '/pdf-lib.min.js': pdflib,
  '/fixture.pdf': pdfBytes,
});

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/`);

const out = await page.evaluate(async () => {
  const d = await window.pdf.open('/fixture.pdf');
  const grids = d.grids(1);
  const cols = d.columns(1);
  const rows = d.rows(1);
  const struck = d.items.find(i => i.str.includes('STRICKEN'));
  const approved = d.items.find(i => i.str.includes('APPROVED'));
  const leaderRow = d.items.find(i => i.str.includes('Total appropriated'));

  // pdf-lib round trip: slice page 1 of a 1-page doc, reopen it.
  const sliced = await window.pdf.doc.slice(d.bytes, 1, 1);
  const reopened = await window.pdf.open(sliced);

  // The projection, against pdf.js's own converter. `view` reimplements the
  // transform so it can run without pdf.js; this is the check that says the
  // reimplementation agrees with the library on a real viewport.
  const vp = d.pages[0].getViewport({ scale: 1.5 });
  const v = d.viewOf(1, { scale: 1.5 });
  const probe = d.items[0];
  const [refX, refY] = vp.convertToViewportPoint(probe.x1, probe.y2);
  const mine = v.box(probe);
  const projection = {
    refX, refY, mineLeft: mine.left, mineTop: mine.top,
    roundTrip: v.unpoint(mine.left, mine.top),
    src: { x1: probe.x1, y2: probe.y2 },
  };

  // A drag over the whole table region, in screen pixels, resolved back to
  // items. This is the selection path a component would use.
  const projectedItems = v.items(d.page(1));
  const tableRect = v.box({ x1: 55, y1: 620, x2: 545, y2: 705 });
  const selected = v.select(tableRect, projectedItems, { mode: 'contain' }).map(p => p.str);

  return {
    numPages: d.numPages,
    itemCount: d.items.length,
    hCount: d.paths.h.length,
    vCount: d.paths.v.length,
    hRaw: d.paths.h.map(l => ({ y: l.y, x1: l.x1, x2: l.x2, color: l.color })),
    vRaw: d.paths.v.map(l => ({ x: l.x, y1: l.y1, y2: l.y2, color: l.color })),
    gridCount: grids.length,
    matrix: grids[0]?.matrix ?? null,
    gridRows: grids[0]?.rows ?? null,
    gridCols: grids[0]?.cols ?? null,
    colEdges: cols.map(c => Math.round(c.at)),
    rowCount: rows.length,
    firstRow: rows[0]?.str ?? null,
    struck: struck ? { str: struck.str, strikethrough: struck.strikethrough, underline: struck.underline } : null,
    approved: approved ? { str: approved.str, underline: approved.underline, strikethrough: approved.strikethrough } : null,
    leaderText: leaderRow?.str ?? null,
    glyphSpan: approved ? { first: approved.glyphs[0], last: approved.glyphs.at(-1), x1: approved.x1, x2: approved.x2 } : null,
    slicedPages: reopened.numPages,
    slicedItems: reopened.items.length,
    projection, selected,
  };
});

// ------------------------------------------------------------------- assert

const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

check('page loads and reports one page', out.numPages === 1, `got ${out.numPages}`);
check('text items extracted', out.itemCount >= 11, `got ${out.itemCount}`);
check('no page errors', errors.length === 0, errors.join('; '));

// Rules. pdf-lib draws each as a stroked path; the kit must recover all four
// horizontals of the table plus the two decoration rules, and the four verticals.
const tableH = out.hRaw.filter(l => ROWS.some(y => near(l.y, y)));
check('all four table rules recovered at their drawn y', tableH.length >= 4,
  `found ${tableH.length} of 4 among ${out.hCount} horizontals`);

const tableV = out.vRaw.filter(l => COLS.some(x => near(l.x, x)));
check('all four column rules recovered at their drawn x', tableV.length >= 4,
  `found ${tableV.length} of 4 among ${out.vCount} verticals`);

check('the white rule was captured by the extractor', out.vRaw.some(l => near(l.x, 140)),
  'extraction must be faithful; filtering happens in the lattice layer, not here');

// The lattice. This is the whole point: the white rule is present in the raw
// path set and must NOT produce a column, and the dotted leader must not
// produce a row.
check('one table found', out.gridCount === 1, `got ${out.gridCount}`);
check('grid is 3 rows x 3 columns', out.gridRows === 3 && out.gridCols === 3,
  `got ${out.gridRows} x ${out.gridCols} (a 4th column means the white rule leaked through)`);

const flat = JSON.stringify(out.matrix);
check('matrix matches the text that was drawn', flat === JSON.stringify(CELLS), `got ${flat}`);

// Stream side, independently.
check('rows recovers the header line', out.firstRow?.startsWith('AGENCY'), `got ${out.firstRow}`);
check('columns finds the three column starts',
  [66, 226, 386].every(x => out.colEdges.some(e => near(e, x, 3))),
  `got ${out.colEdges.join(', ')}`);

// The dotted leader: 120 segments must not have become a rule that closes a cell.
check('the dotted leader did not create a second table', out.gridCount === 1);
check('leader row text still reads', out.leaderText?.includes('Total appropriated'), `got ${out.leaderText}`);

// Decoration, at glyph granularity.
check('strikethrough detected on the struck word', out.struck?.strikethrough === true, JSON.stringify(out.struck));
check('struck word not also flagged underlined', out.struck?.underline === false, JSON.stringify(out.struck));
check('underline detected on the underlined word', out.approved?.underline === true, JSON.stringify(out.approved));

// Glyph advances must span the item, not overshoot or fall short.
const g = out.glyphSpan;
check('glyph advances span exactly the item width',
  g && near(g.first.x1, g.x1, 0.6) && near(g.last.x2, g.x2, 0.6),
  g ? `item ${g.x1}..${g.x2}, glyphs ${g.first.x1}..${g.last.x2}` : 'no item');

// Projection. If `view` and pdf.js disagree here, every overlay built on the
// kit is off by a constant nobody would find by reading the code.
const p = out.projection;
check('view.box agrees with pdf.js convertToViewportPoint',
  near(p.mineLeft, p.refX, 0.02) && near(p.mineTop, p.refY, 0.02),
  `pdf.js ${p.refX},${p.refY} vs view ${p.mineLeft},${p.mineTop}`);
check('unpoint returns the original PDF coordinates',
  near(p.roundTrip.x, p.src.x1, 0.02) && near(p.roundTrip.y, p.src.y2, 0.02),
  `${JSON.stringify(p.roundTrip)} vs ${JSON.stringify(p.src)}`);

// Selection, end to end: a screen rectangle resolving to the table's text.
// pdf.js emits whitespace-only items between drawn strings, so the selection is
// the nine cells plus separators. Those are real positional data, not noise (a
// zero-width item between two runs is often the only mark of a column break),
// so the kit keeps them and consumers filter. Assert both halves.
const meaningful = out.selected.filter(s => s.trim());
check('a screen-space drag selects every table cell and nothing else',
  meaningful.length === 9 && CELLS.flat().every(t => meaningful.includes(t)),
  `got ${meaningful.length} non-blank of ${out.selected.length}: ${meaningful.join(' | ')}`);
// The extras are blank: empty strings and single spaces. pdf.js emits both,
// and an empty-string item still carries a position, which is why they survive
// extraction rather than being dropped at the source.
const blanks = out.selected.filter(s => !s.trim());
check('every extra selected item is blank, not stray text',
  blanks.length === out.selected.length - 9,
  `${out.selected.length - 9} extras, ${blanks.length} of them blank`);

// pdf-lib.
check('slice round-trips through pdf-lib', out.slicedPages === 1, `got ${out.slicedPages}`);
check('sliced document still extracts its text', out.slicedItems >= 11, `got ${out.slicedItems}`);

await browser.close();
server.close();
if (!keep) await rm(outDir, { recursive: true, force: true });

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
