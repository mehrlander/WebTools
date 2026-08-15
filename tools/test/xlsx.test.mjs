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

// cellXfs index is a cell's `s`. Index 3 is the one SHEET2 uses. numFmtId 164
// is custom and declared; 14 and 9 are built in and have no code written
// anywhere in the file, which is the reason the kit has to carry a table.
const STYLES = `<?xml version="1.0"?>
<styleSheet xmlns="s">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>
  <cellXfs count="7">
    <xf numFmtId="0"/>
    <xf numFmtId="14"/>
    <xf numFmtId="164"/>
    <xf numFmtId="0"/>
    <xf numFmtId="9"/>
    <xf numFmtId="22"/>
    <xf numFmtId="49"/>
  </cellXfs>
</styleSheet>`;

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

// ---- Power Query --------------------------------------------------------
//
// Built rather than committed: a real .xlsx with queries is a binary the tree
// does not need, and the interesting part is the header-plus-inner-zip layout,
// which is cheap to construct exactly. JSZip is vendored through bootstrap's
// KIT_IMPORTS, so this exercises the same lazy import the browser takes.

import JSZip from 'jszip';

const M_CODE = 'section Section1;\nshared Budget = let Source = Excel.CurrentWorkbook() in Source;';

// version (uint32 LE) + parts-zip length (uint32 LE) + the zip, base64'd into
// a <DataMashup> element, which is the shape Excel writes.
async function makeMashupXml({ declaredLength = null, trailing = 0 } = {}) {
  const inner = new JSZip();
  inner.file('Formulas/Section1.m', M_CODE);
  inner.file('Config/Package.xml', '<Package/>');
  const zipBytes = await inner.generateAsync({ type: 'uint8array' });
  const out = new Uint8Array(8 + zipBytes.length + trailing);
  const view = new DataView(out.buffer);
  view.setUint32(0, 3, true);
  view.setUint32(4, declaredLength ?? zipBytes.length, true);
  out.set(zipBytes, 8);
  let bin = '';
  for (const b of out) bin += String.fromCharCode(b);
  return `<?xml version="1.0"?><DataMashup xmlns="http://schemas.microsoft.com/DataMashup">${btoa(bin)}</DataMashup>`;
}

test('mashupPayload: reads the header and hands back the inner zip bytes', async () => {
  const xml = await makeMashupXml();
  const p = xlsxKit.mashupPayload(xml);
  assert.equal(p.version, 3);
  assert.equal(p.zip.length, p.declaredLength);
  assert.deepEqual([...p.zip.subarray(0, 2)], [0x50, 0x4b]); // "PK"
});

test('mashupPayload: trailing bytes past the declared length are cut off', async () => {
  const xml = await makeMashupXml({ trailing: 64 });
  const p = xlsxKit.mashupPayload(xml);
  assert.equal(p.zip.length, p.declaredLength); // not declaredLength + 64
});

test('mashupPayload: an impossible declared length falls back to the rest', async () => {
  const xml = await makeMashupXml({ declaredLength: 10 ** 7 });
  const p = xlsxKit.mashupPayload(xml);
  assert.ok(p.zip.length > 0);
  assert.notEqual(p.zip.length, 10 ** 7);
});

test('mashupPayload: no DataMashup element, and junk, both return null', () => {
  assert.equal(xlsxKit.mashupPayload('<root/>'), null);
  assert.equal(xlsxKit.mashupPayload('<DataMashup>!!!not base64!!!</DataMashup>'), null);
  assert.equal(xlsxKit.mashupPayload('<DataMashup>QUJD</DataMashup>'), null); // 3 bytes, no header
});

test('readMashup: recovers the M source from inside the two containers', async () => {
  const got = await xlsxKit.readMashup(await makeMashupXml());
  assert.equal(got.version, 3);
  assert.deepEqual(got.sections.map(s => s.path), ['Formulas/Section1.m']);
  assert.equal(got.sections[0].m, M_CODE);
});

test('readZip: a workbook carrying queries reports them under xl.powerQuery', async () => {
  const wb = new JSZip();
  for (const [path, xml] of buildParts()) wb.file(path, xml);
  wb.file('customXml/item1.xml', await makeMashupXml());
  const bytes = await wb.generateAsync({ type: 'uint8array' });
  const { xl } = await xlsxKit.readZip(bytes);
  assert.equal(xl.powerQuery.part, 'customXml/item1.xml');
  assert.equal(xl.powerQuery.sections[0].m, M_CODE);
  // The rest of the analysis is unaffected by the extra part.
  assert.equal(xl.sheets.sheet1.name, 'Data');
});

test('readZip: a workbook without queries leaves xl.powerQuery undefined', async () => {
  const wb = new JSZip();
  for (const [path, xml] of buildParts()) wb.file(path, xml);
  const { xl } = await xlsxKit.readZip(await wb.generateAsync({ type: 'uint8array' }));
  assert.equal(xl.powerQuery, undefined);
});

// ---- number formats -----------------------------------------------------

test('formatKind: classifies a code by what it makes a value mean', () => {
  const k = xlsxKit.formatKind;
  assert.equal(k('General'), 'general');
  assert.equal(k('@'), 'text');
  assert.equal(k('yyyy-mm-dd'), 'date');
  assert.equal(k('h:mm:ss'), 'time');
  assert.equal(k('m/d/yy h:mm'), 'datetime');
  assert.equal(k('0.00%'), 'percent');
  assert.equal(k('[h]:mm:ss'), 'duration'); // elapsed, not a clock reading
  assert.equal(k('#,##0.00'), 'number');
  assert.equal(k('$#,##0'), 'currency');
  assert.equal(k(null), 'general');
});

test('formatKind: literal text cannot be mistaken for a date token', () => {
  // The d in "day" and the m in "min" are text, not format tokens.
  assert.equal(xlsxKit.formatKind('"day "0'), 'number');
  assert.equal(xlsxKit.formatKind('0" min"'), 'number');
  // A bracketed colour is not evidence of anything either.
  assert.equal(xlsxKit.formatKind('[Red]#,##0'), 'number');
});

test('serialToDate: the 1900 leap-year bug, on both sides of the phantom day', () => {
  const iso = (d) => d.toISOString().slice(0, 10);
  assert.equal(iso(xlsxKit.serialToDate(1)), '1900-01-01');   // before: corrected
  assert.equal(iso(xlsxKit.serialToDate(59)), '1900-02-28');  // last corrected day
  assert.equal(iso(xlsxKit.serialToDate(61)), '1900-03-01');  // after: linear
  assert.equal(iso(xlsxKit.serialToDate(25569)), '1970-01-01'); // the JS epoch
  assert.equal(iso(xlsxKit.serialToDate(45000)), '2023-03-15');
});

test('serialToDate: the 1904 epoch shifts everything by four years and a day', () => {
  assert.equal(xlsxKit.serialToDate(0, true).toISOString().slice(0, 10), '1904-01-01');
  assert.equal(xlsxKit.serialToDate(1, true).toISOString().slice(0, 10), '1904-01-02');
});

test('cellFormat: a cell style resolves through cellXfs to a code and a kind', () => {
  const { xl } = xlsxKit.analyze(buildParts());
  assert.equal(xlsxKit.cellFormat(xl, '2').code, 'yyyy\\-mm\\-dd'); // custom
  assert.equal(xlsxKit.cellFormat(xl, '2').kind, 'date');
  assert.equal(xlsxKit.cellFormat(xl, '1').code, 'mm-dd-yy');       // built in
  assert.equal(xlsxKit.cellFormat(xl, '4').kind, 'percent');
  assert.equal(xlsxKit.cellFormat(xl, '6').kind, 'text');
  assert.equal(xlsxKit.cellFormat(xl, null), null);                 // unstyled
});

test('sheetRows: formats are applied only when the workbook is passed', () => {
  const DATED = `<?xml version="1.0"?>
<worksheet xmlns="ws"><sheetData><row r="1">
  <c r="A1" s="1"><v>45000</v></c>
  <c r="B1" s="4"><v>0.125</v></c>
  <c r="C1" s="5"><v>45000.5</v></c>
  <c r="D1"><v>45000</v></c>
</row></sheetData></worksheet>`;
  const parts = buildParts().map(([p, x]) => p === 'xl/worksheets/sheet1.xml' ? [p, DATED] : [p, x]);
  const { xl } = xlsxKit.analyze(parts);
  assert.deepEqual(xlsxKit.sheetRows(xl.sheets.sheet1), // raw, the old behaviour
    [{ Row: 1, A: '45000', B: '0.125', C: '45000.5', D: '45000' }]);
  assert.deepEqual(xlsxKit.sheetRows(xl.sheets.sheet1, xl),
    [{ Row: 1, A: '2023-03-15', B: '12.5%', C: '2023-03-15 12:00:00', D: '45000' }]);
  // D carries no style, so it stays a number even under formatting. That is
  // the file's answer, not a fallback.
});

test('formatValue: a non-numeric value under a date format is left alone', () => {
  const fmt = { kind: 'date', code: 'yyyy-mm-dd' };
  assert.equal(xlsxKit.formatValue('not a number', fmt), 'not a number');
  assert.equal(xlsxKit.formatValue('', fmt), '');
});

test('analyze: malformed XML in one part is skipped, not fatal', () => {
  const parts = [...buildParts(), ['xl/broken.xml', '<not><valid'] ];
  assert.doesNotThrow(() => xlsxKit.analyze(parts));
});
