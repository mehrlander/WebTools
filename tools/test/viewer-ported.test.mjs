// Three behaviours ported up from mehrlander/home's submittal reader, which had
// grown its own docx/markdown/workbook stack beside this one.
//
// The point of each is that the viewer was WRONG without it, not merely
// different. Frontmatter: a `---` block is typed metadata across this estate,
// and markdown renders the fence as a rule and the next line as a setext
// heading, so a document opened on "date: …" set larger than its own title.
// Word tables: a document table cell holds a sentence and has to wrap, the
// opposite of a spreadsheet cell, and without the rule a prose table ran off
// the side of the pane. Sheets: the tab row is the right answer inside a pane
// and the wrong one on a phone at ten sheets, and a host could not build
// anything else because it could not learn what the sheets were called.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
window.Alpine = { data: () => {} };
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/viewer.js'), 'utf8'))();
const R = window.ViewRegistry;

// ── frontmatter ──────────────────────────────────────────────────────────────

test('a leading YAML block is removed before the markdown is parsed', () => {
  const md = '---\ndate: 2026-07-26\nstatus: living\n---\n# Real Title\n\nBody.\n';
  assert.equal(R.stripFrontmatter(md), '# Real Title\n\nBody.\n');
});

test('CRLF frontmatter is removed too', () => {
  const md = '---\r\ndate: 2026-07-26\r\n---\r\n# Title\r\n';
  assert.equal(R.stripFrontmatter(md), '# Title\r\n');
});

test('a rule further down the file is a rule, not a fence', () => {
  // The anchor is the whole rule: only a block that OPENS the file is metadata.
  const md = '# Title\n\nSome prose.\n\n---\n\nMore prose.\n';
  assert.equal(R.stripFrontmatter(md), md);
});

test('a document with no frontmatter is returned unchanged', () => {
  for (const md of ['# Title\n', '', 'plain text', '--- not a fence\n']) {
    assert.equal(R.stripFrontmatter(md), md);
  }
});

test('nullish content does not throw', () => {
  assert.equal(R.stripFrontmatter(undefined), '');
  assert.equal(R.stripFrontmatter(null), '');
});

test('the preview module runs the body through it, not the raw content', () => {
  const src = R.modules.find(m => m.id === 'preview').render.toString();
  assert.match(src, /stripFrontmatter/, 'the preview module parses raw content');
  assert.doesNotMatch(src, /marked\.parse\(f\.content\)/, 'raw content still reaches the parser');
});

// ── the Word table rule ──────────────────────────────────────────────────────

test('a Word table wraps and is held to the pane', () => {
  // The rules live in the module's scoped stylesheet, which render() returns
  // inline with the markup rather than injecting.
  const src = R.modules.find(m => m.id === 'docx').render();
  assert.match(src, /table-layout:\s*fixed/, 'a prose table can still run off the pane');
  assert.match(src, /overflow-wrap:\s*anywhere/, 'a long cell cannot break');
});

test('a Word table and a spreadsheet table are styled opposite, deliberately', () => {
  // The distinction is the finding, so it is held: nothing in the docx sheet
  // may pin a cell to one line, which is exactly what a SHEET cell needs.
  const src = R.modules.find(m => m.id === 'docx').render();
  assert.doesNotMatch(src, /white-space:\s*nowrap/,
    'the docx stylesheet pins cells to one line, which is the spreadsheet rule');
});

// ── the sheet list ───────────────────────────────────────────────────────────

// The publication is a shared helper rather than a line inside one module,
// because BOTH sheet modes have to publish it: home's submittal page reads
// __sheets to build its swipe deck, and a reader who switched to the grid must
// not lose the deck. Called directly here rather than matched in source.
const fakeHost = () => ({ root: {} });

test('the sheet publication carries a list and a way to switch', () => {
  const host = fakeHost();
  const sheets = [{ key: 'sheet1', s: { name: 'Form', cellCount: 12 } },
                  { key: 'sheet2', s: { name: null, cellCount: 0 } }];
  R.publishSheets(host, sheets, () => {}, () => false);
  // Names, because a deck labels its slides; a bare count would not do. A
  // sheet the workbook never claimed keeps its part name.
  // Spread into a node-realm literal, and each entry too: the helper builds
  // them inside jsdom and assert/strict compares prototypes.
  assert.deepEqual([...host.root.__sheets.list].map(o => ({ ...o })),
    [{ name: 'Form', cellCount: 12 }, { name: 'sheet2', cellCount: 0 }]);
  assert.equal(typeof host.root.__sheets.show, 'function');
});

test('the switch is guarded by the mount still being alive and in range', () => {
  const seen = [];
  const host = fakeHost();
  const sheets = [{ key: 's1', s: {} }, { key: 's2', s: {} }];
  R.publishSheets(host, sheets, (i) => seen.push(i), () => false);
  host.root.__sheets.show(1);
  host.root.__sheets.show(-1);
  host.root.__sheets.show(2);
  assert.deepEqual(seen, [1], 'out of range is ignored, not clamped');

  const dead = fakeHost();
  R.publishSheets(dead, sheets, (i) => seen.push(i), () => true);
  dead.root.__sheets.show(0);
  assert.deepEqual(seen, [1], 'a superseded mount does not paint over the current file');
});

test('both sheet modes publish, so switching mode does not cost the host its deck', () => {
  for (const id of ['sheet', 'xlsx']) {
    const src = R.modules.find(m => m.id === id).after.toString();
    assert.match(src, /ViewRegistry\.publishSheets\(/, `${id} does not publish its sheets`);
    assert.match(src, /ViewRegistry\.mountSheetTabs\(/, `${id} does not mount the tab strip`);
  }
});

test('show() drops what the last file published', () => {
  // Read off the component factory rather than a mount: show() is async and
  // its first awaits load CDN assets that never resolve under jsdom.
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/viewer.js'), 'utf8');
  const showBody = src.slice(src.indexOf('async show(file, content, origin)'));
  assert.match(showBody.slice(0, 700), /this\.\$root\.__sheets = null/,
    'a host can read the previous workbook between show() and the next mount');
});

// ── the sheet render's three overlays ────────────────────────────────────────
//
// drawSheet turns a layout into markup. The layout itself is the kit's, and
// tools/test/xlsx.test.mjs holds it; what is checked here is that each of the
// three things a sheet carries beside its cells reaches the page.

const layoutWith = (cell, extra = {}) => ({
  cols: [{ index: 0, width: 60 }, { index: 1, width: 60 }],
  rows: [{ row: 1, height: 20, cells: [
    { col: 0, text: 'A', numeric: false, style: null, raw: null, cf: null,
      colSpan: 1, rowSpan: 1, spillLeft: 0, spillRight: 0 },
    { col: 1, text: 'B', numeric: false, style: null, raw: null, cf: null,
      colSpan: 1, rowSpan: 1, spillLeft: 0, spillRight: 0, ...cell },
  ] }],
  maxCol: 1, freeze: null, truncated: null, images: [], cfSkipped: 0, empty: false,
  ...extra,
});

const drawWith = (layout, kit = {}) => {
  const prev = window.xlsxKit;
  window.xlsxKit = {
    sheetLayout: () => layout,
    colLetter: (n) => String.fromCharCode(65 + n),
    cellStyle: () => null,
    dxfStyle: () => ({ bold: true, color: '#ffffff', fill: '#ff0000' }),
    ...kit,
  };
  try { return R.drawSheet({ name: 'S', merges: [] }, {}, 'sheet1').innerHTML; }
  finally { window.xlsxKit = prev; }
};

test('a conditional format reaches the page as its own rule, not an inline style', () => {
  const html = drawWith(layoutWith({ cf: 3 }));
  assert.match(html, /td\.cf3\{[^}]*background:#ff0000/, 'the dxf became a rule');
  assert.match(html, /class="cf3"/, 'and the cell claims it');
  // After the cell's own style rules, so a conditional format wins on what it
  // sets and leaves the rest of the cell standing.
  assert.ok(html.indexOf('td.cf3{') > html.indexOf('td.n{'), 'rule order decides the cascade');
});

test('a cell with no conditional format carries no class for one', () => {
  assert.doesNotMatch(drawWith(layoutWith({})), /class="cf/);
});

test('a validation list gets the caret and its options in the tooltip', () => {
  const html = drawWith(layoutWith({ note: { title: '', prompt: '', options: ['Bill', 'Budget'] } }));
  assert.match(html, /class="dv"/);
  assert.match(html, /title="One of: Bill, Budget"/);
});

test('an input message gets the corner wedge and the form’s own words', () => {
  const html = drawWith(layoutWith({ note: { title: 'Fee Code', prompt: 'Enter the four digit code.', options: null } }));
  assert.match(html, /class="note"/);
  assert.match(html, /title="Fee Code: Enter the four digit code\."/);
});

test('a long option list is trimmed in the tooltip and says how many it dropped', () => {
  const options = Array.from({ length: 55 }, (_, i) => 'opt' + i);
  const html = drawWith(layoutWith({ note: { title: '', prompt: '', options } }));
  assert.match(html, /and 15 more/);
});

test('a picture is drawn inside its own cell, positioned by its offsets', () => {
  const html = drawWith(layoutWith({}, {
    images: [{ row: 1, col: 1, dx: 4, dy: 6, width: 120, height: 40,
               src: 'data:image/png;base64,AAAA', name: 'Logo' }],
  }));
  assert.match(html, /class="img"/, 'the host cell is the positioning context');
  assert.match(html, /<img src="data:image\/png;base64,AAAA" alt="Logo"[^>]*left:4px;top:6px;width:120px;height:40px/);
});

// ── addressing a place inside a workbook ─────────────────────────────────────
//
// The grammar and its resolution are separate on purpose: parsePlace reads a
// string, readPlace decides what it means against the sheets that exist. A
// bare word is genuinely ambiguous, and only the workbook settles it.

// Spread into a node-realm literal: these are built inside jsdom and
// assert/strict compares prototypes, the same trap the sheet list carries.
const place = (s) => ({ ...R.parsePlace(s) });
const read = (s, sheets) => ({ ...R.readPlace(s, sheets) });

test('parsePlace reads the three shapes a cite is written in', () => {
  assert.deepEqual(place('DP Addendum!H11'), { sheet: 'DP Addendum', cell: 'H11' });
  assert.deepEqual(place('H11'), { sheet: null, cell: 'H11' });
  assert.deepEqual(place('$H$11'), { sheet: null, cell: 'H11' }, 'absolute refs are still refs');
  assert.deepEqual(place('A1:C3'), { sheet: null, cell: 'A1' }, 'a range lands on its corner');
  assert.deepEqual(place("'Fed Funding'!Total"), { sheet: 'Fed Funding', text: 'Total' });
  assert.deepEqual(place('Reductions - Adds Prioritized'),
    { sheet: 'Reductions - Adds Prioritized' });
  assert.deepEqual(place(''), {});
});

test('a sheet name is split on the LAST bang, since a name may carry one', () => {
  assert.deepEqual(place('Is it done!?!B4'), { sheet: 'Is it done!?', cell: 'B4' });
});

test('readPlace: a bare word that names no sheet is text, not a miss', () => {
  const sheets = [{ key: 'sheet1', s: { name: 'DP Addendum' } },
                  { key: 'sheet2', s: { name: 'Reference Tables' } }];
  assert.deepEqual(read('Reference Tables', sheets), { sheet: 'Reference Tables' });
  // "Externally Mobile" is a plausible sheet name and is in fact a column
  // heading. The workbook is the only thing that can tell them apart.
  assert.deepEqual(read('Externally Mobile', sheets), { sheet: null, text: 'Externally Mobile' });
  // An explicit sheet keeps its meaning even where no sheet matches, so the
  // caller gets a clean miss rather than a search of the wrong document.
  assert.deepEqual(read('Nope!A1', sheets), { sheet: 'Nope', cell: 'A1' });
});

test('sheetIndex matches on alphanumerics, so a cite survives a stray dash', () => {
  const sheets = [{ key: 'sheet1', s: { name: 'Reductions - Adds Prioritized' } },
                  { key: 'sheet2', s: { name: null } }];
  assert.equal(R.sheetIndex(sheets, 'Reductions – Adds Prioritized'), 0, 'an en dash still matches');
  assert.equal(R.sheetIndex(sheets, 'sheet2'), 1, 'a sheet the workbook never named keeps its part name');
  assert.equal(R.sheetIndex(sheets, 'Nope'), -1);
});

test('landOnCell marks one cell at a time and lets the mark expire', async () => {
  const doc = window.document;
  const pane = doc.createElement('div');
  const a = doc.createElement('td'), b = doc.createElement('td');
  pane.append(a, b);
  doc.body.append(pane);
  a.classList.add('landed');
  R.landOnCell(pane, b);
  assert.ok(!a.classList.contains('landed'), 'the previous cite is cleared, not stacked');
  assert.ok(b.classList.contains('landed'));
  assert.equal(R.landOnCell(pane, null), false, 'nothing to mark is not a mark');
  pane.remove();
});

test('both sheet modes publish a locate, so a cite survives a mode switch', () => {
  for (const id of ['sheet', 'xlsx']) {
    const src = R.modules.find(m => m.id === id).after.toString();
    assert.match(src, /const locate = async \(address\)/, `${id} publishes no locate`);
    assert.match(src, /publishSheets\(host, sheets, show, stale, locate\)/, `${id} does not publish it`);
  }
});
