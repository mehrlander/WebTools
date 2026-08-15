// kits/xlsx.js — OOXML structural inspector. DOMParser comes from jsdom (same
// pattern as compression.test.mjs); fixtures are minimal hand-built XML parts
// so the pure analyze()/views/sheetRows logic is exercised without a real
// .xlsx file or JSZip (readZip's lazy JSZip load is exercised on the browser
// side only — see kits/demos/xlsx.html).

import test from 'node:test';
import assert from 'node:assert/strict';
import jsdomPkg from 'jsdom';
import { loadKit } from './bootstrap.mjs';

const { JSDOM } = jsdomPkg;
globalThis.DOMParser = new JSDOM('').window.DOMParser;

const { xlsxKit } = loadKit('xlsx');

// A minimal two-sheet workbook: sheet1 has a sparse row (gap at column B) and
// a shared-string cell whose value only resolves once sharedStrings.xml is
// walked; sheet2 has a formula, a style ref, and a merged cell.
const CONTENT_TYPES = `<?xml version="1.0"?>
<Types xmlns="ct"><Override PartName="/xl/workbook.xml"/></Types>`;

// Workbook order is DELIBERATELY not part-file order: the first sheet in the
// workbook is Calc, which lives in sheet2.xml. That is what a workbook looks
// like once its tabs have been dragged around, and it is the only arrangement
// under which the index assertions below can fail. sheetId is likewise not the
// file number, since Excel never reuses one after a delete.
//
// The two defined names are each chosen to discriminate: the local one sits on
// workbook index 0 (Calc, part sheet2), which the old file-number comparison
// could not match, and the global one is found only by the sheet's DISPLAY
// name, which the kit did not know before the workbook <sheets> join.
const WORKBOOK = `<?xml version="1.0"?>
<workbook xmlns="wb" xmlns:r="rel">
  <sheets>
    <sheet name="Calc" sheetId="9" r:id="rId1"/>
    <sheet name="Data" sheetId="7" r:id="rId2"/>
  </sheets>
  <definedNames>
    <definedName name="CalcLocal" localSheetId="0">Calc!$A$1</definedName>
    <definedName name="MyRange">Data!$A$1:$A$2</definedName>
  </definedNames>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0"?>
<Relationships xmlns="rel">
  <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId2" Type=".../worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

// Sparse row: column A ("r=A1", shared string 0) then column C ("r=C1", inline "42").
const SHEET1 = `<?xml version="1.0"?>
<worksheet xmlns="ws">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="C1"><v>42</v></c>
    </row>
  </sheetData>
</worksheet>`;

const SHEET2 = `<?xml version="1.0"?>
<worksheet xmlns="ws">
  <sheetData>
    <row r="1">
      <c r="A1" s="3"><f>SUM(Data!A1:A2)</f><v>7</v></c>
    </row>
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>
</worksheet>`;

const SHARED_STRINGS = `<?xml version="1.0"?>
<sst xmlns="sst"><si><t>hello</t></si></sst>`;

const STYLES = `<?xml version="1.0"?><styleSheet xmlns="s"><cellXfs count="4"/></styleSheet>`;

// i is a ZERO-based workbook index, so i="0" is Calc, which is part sheet2.xml
// and holds the only formula. Under the old file-number arithmetic this looked
// for "1" and found nothing.
const CALC_CHAIN = `<?xml version="1.0"?>
<calcChain xmlns="cc"><c r="A1" i="0"/></calcChain>`;

function buildParts({ order = 'natural' } = {}) {
  const base = {
    '[Content_Types].xml': CONTENT_TYPES,
    'xl/workbook.xml': WORKBOOK,
    'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
    'xl/worksheets/sheet1.xml': SHEET1,
    'xl/worksheets/sheet2.xml': SHEET2,
    'xl/sharedStrings.xml': SHARED_STRINGS,
    'xl/styles.xml': STYLES,
    'xl/calcChain.xml': CALC_CHAIN,
  };
  const entries = Object.entries(base);
  // 'reversed' processes both sheets before sharedStrings.xml, the ordering
  // that broke the original prototypes' inline string resolution.
  return order === 'reversed' ? entries.reverse() : entries;
}

test('kit surface', () => {
  for (const k of ['readZip', 'analyze', 'views', 'sheetRows', 'summary', 'colLetter']) {
    assert.ok(xlsxKit[k], `xlsxKit.${k} present`);
  }
  for (const v of ['paths', 'connections', 'unconnected', 'files']) {
    assert.equal(typeof xlsxKit.views[v], 'function', `views.${v} is a function`);
  }
});

test('colLetter: zero-based index to A1-style letters', () => {
  assert.equal(xlsxKit.colLetter(0), 'A');
  assert.equal(xlsxKit.colLetter(2), 'C');
  assert.equal(xlsxKit.colLetter(25), 'Z');
  assert.equal(xlsxKit.colLetter(26), 'AA');
  assert.equal(xlsxKit.colLetter(701), 'ZZ');
});

test('analyze: shared-string values resolve regardless of part order', () => {
  for (const order of ['natural', 'reversed']) {
    const result = xlsxKit.analyze(buildParts({ order }));
    const rows = xlsxKit.sheetRows(result.xl.sheets.sheet1);
    assert.deepEqual(rows, [{ Row: 1, A: 'hello', C: '42' }], `order=${order}`);
  }
});

test('analyze: sparse row keeps the gap instead of compacting columns', () => {
  const result = xlsxKit.analyze(buildParts());
  const [row] = xlsxKit.sheetRows(result.xl.sheets.sheet1);
  assert.deepEqual(Object.keys(row), ['Row', 'A', 'C']); // no 'B'
});

test('analyze: cell/style/formula/merged-cell counts on sheet2', () => {
  const { xl } = xlsxKit.analyze(buildParts());
  const s2 = xl.sheets.sheet2;
  assert.equal(s2.cellCount, 1);
  assert.equal(s2.formulas, 1);
  assert.equal(s2.mergedCells, 1);
  assert.equal(s2.usedStyles.size, 1);
  assert.ok(xl.styles.has('3'));
});

test('analyze: connectedPaths marks every path in a file that had any hit', () => {
  const { el, connectedPaths } = xlsxKit.analyze(buildParts());
  const workbookKeys = Object.keys(el).filter(k => k.startsWith('xl/workbook.xml::'));
  assert.ok(workbookKeys.length > 0);
  assert.ok(workbookKeys.every(k => connectedPaths.has(k)));
});

test('views.paths: File/Path/Count/Connected shape', () => {
  const result = xlsxKit.analyze(buildParts());
  const rows = xlsxKit.views.paths(result);
  const root = rows.find(r => r.File === 'xl/workbook.xml' && r.Path === 'workbook');
  assert.ok(root);
  assert.equal(root.Connected, 'Yes');
  assert.equal(root['Connection Type'], 'workbook');
});

test('views.connections: one row per sheet with resource usage', () => {
  const result = xlsxKit.analyze(buildParts());
  const rows = xlsxKit.views.connections(result);
  assert.equal(rows.length, 2);
  const sheet1 = rows.find(r => r.Sheet === 'sheet1');
  assert.equal(sheet1.Strings, 1);
  assert.equal(sheet1.Cells, 2);
  const sheet2 = rows.find(r => r.Sheet === 'sheet2');
  assert.equal(sheet2.Formulas, 1);
  assert.equal(sheet2['Merged Cells'], 1);
  assert.equal(sheet2['Calc Chain'], 1); // i="0" -> workbook index 0 -> Calc -> sheet2.xml
});

test('sheet identity: display name and workbook order come from workbook.xml', () => {
  const { xl } = xlsxKit.analyze(buildParts());
  // Part sheet1.xml is the SECOND sheet in the workbook, and it is called Data.
  assert.equal(xl.sheets.sheet1.name, 'Data');
  assert.equal(xl.sheets.sheet1.index, 1);
  assert.equal(xl.sheets.sheet1.sheetId, '7');
  assert.equal(xl.sheets.sheet2.name, 'Calc');
  assert.equal(xl.sheets.sheet2.index, 0);
});

test('sheet identity: resolution does not depend on part order', () => {
  const a = xlsxKit.analyze(buildParts({ order: 'natural' })).xl.sheets;
  const b = xlsxKit.analyze(buildParts({ order: 'reversed' })).xl.sheets;
  for (const key of ['sheet1', 'sheet2']) {
    assert.equal(a[key].name, b[key].name, key);
    assert.equal(a[key].index, b[key].index, key);
  }
});

test('sheet identity: a sheet part the workbook never claims gets a null name', () => {
  const parts = [...buildParts(), ['xl/worksheets/sheet9.xml', SHEET1]];
  const { xl } = xlsxKit.analyze(parts);
  assert.equal(xl.sheets.sheet9.name, null);
  assert.equal(xl.sheets.sheet9.index, null);
});

test('sheet identity: no <sheets> element at all falls back to part order', () => {
  const parts = buildParts().filter(([p]) => p !== 'xl/workbook.xml');
  const { xl } = xlsxKit.analyze(parts);
  assert.equal(xl.sheets.sheet1.index, 0);
  assert.equal(xl.sheets.sheet2.index, 1);
  assert.equal(xl.sheets.sheet1.name, null); // fallback names nothing it cannot read
});

test('views.connections: named ranges resolve by workbook index and display name', () => {
  const rows = xlsxKit.views.connections(xlsxKit.analyze(buildParts()));
  const data = rows.find(r => r.Sheet === 'sheet1');
  const calc = rows.find(r => r.Sheet === 'sheet2');
  // Data is found only through its display name, via the global defined name.
  assert.equal(data['Named Ranges'], 1);
  assert.equal(data.Name, 'Data');
  assert.equal(data.Order, 2);
  // Calc is found through localSheetId="0", the zero-based workbook index.
  assert.equal(calc['Named Ranges'], 1);
  assert.equal(calc.Order, 1);
});

test('analyze: an inlineStr cell keeps its text instead of resolving empty', () => {
  const INLINE = `<?xml version="1.0"?>
<worksheet xmlns="ws"><sheetData><row r="1">
  <c r="A1" t="inlineStr"><is><t>plain</t></is></c>
  <c r="B1" t="inlineStr"><is><r><t>rich </t></r><r><t>runs</t></r></is></c>
  <c r="C1"><v>5</v></c>
</row></sheetData></worksheet>`;
  const parts = buildParts().map(([p, x]) => p === 'xl/worksheets/sheet1.xml' ? [p, INLINE] : [p, x]);
  const [row] = xlsxKit.sheetRows(xlsxKit.analyze(parts).xl.sheets.sheet1);
  assert.deepEqual(row, { Row: 1, A: 'plain', B: 'rich runs', C: '5' });
});

test('views.files: Shared Strings and Calc Chain categorize despite mixed-case filenames', () => {
  const result = xlsxKit.analyze(buildParts());
  const rows = xlsxKit.views.files(result);
  const shared = rows.find(r => r.File === 'xl/sharedStrings.xml');
  const calc = rows.find(r => r.File === 'xl/calcChain.xml');
  assert.equal(shared.Category, 'Shared Strings');
  assert.equal(calc.Category, 'Calc Chain');
});

test('views.files: shared-strings row lists the sheets that actually used a string', () => {
  const result = xlsxKit.analyze(buildParts());
  const shared = xlsxKit.views.files(result).find(r => r.File === 'xl/sharedStrings.xml');
  assert.equal(shared['Sheets Touched'], 'sheet1'); // only sheet1 has a t="s" cell
});

test('views.unconnected: an orphan XML part with no recognized structure', () => {
  const parts = [
    ...buildParts(),
    ['xl/media/image1.emf', '<?xml version="1.0"?><blob xmlns="b"><stray/></blob>'],
  ];
  const result = xlsxKit.analyze(parts);
  const rows = xlsxKit.views.unconnected(result);
  assert.ok(rows.some(r => r.File === 'xl/media/image1.emf'));
});

test('summary: total/connected/unconnected add up', () => {
  const result = xlsxKit.analyze(buildParts());
  const s = xlsxKit.summary(result);
  assert.equal(s.total, Object.keys(result.el).length);
  assert.equal(s.connected + s.unconnected, s.total);
  assert.equal(s.connected, result.connectedPaths.size);
});

test('analyze: malformed XML in one part is skipped, not fatal', () => {
  const parts = [...buildParts(), ['xl/broken.xml', '<not><valid'] ];
  assert.doesNotThrow(() => xlsxKit.analyze(parts));
});
