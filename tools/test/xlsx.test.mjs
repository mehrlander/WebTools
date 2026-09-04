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
  // THE FORMAT CODE IS FOLLOWED, not merely classified. Before 2026-09-04 this
  // read `2023-03-15`, `12.5%` and `2023-03-15 12:00:00`: the kind was right
  // and the drawing was ISO, on the argument that an unambiguous date beats an
  // approximation of Excel's. The three below are what Excel actually draws
  // for ids 14, 9 and 22, which is the point of a sheet render.
  assert.deepEqual(xlsxKit.sheetRows(xl.sheets.sheet1, xl),
    [{ Row: 1, A: '03-15-23', B: '13%', C: '3/15/23 12:00', D: '45000' }]);
  // D carries no style, so it stays a number even under formatting. That is
  // the file's answer, not a fallback.
  // B rounds: 0.125 under `0%` is 13%, in the workbook and here. The stored
  // value is not lost, it is what sheetLayout hands back as the cell's `raw`.
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

// ---------------------------------------------------------------------------
// Appearance: styles.xml beyond the number format, sheet geometry, and the
// layout that joins them. Added 2026-09-04 with the sheet render.
// ---------------------------------------------------------------------------

// A form, in miniature: a merged banded title across A1:C1, a gray input box,
// a bold label, a theme-coloured fill and a currency column. The theme part
// carries the `a:` prefix a real workbook writes, which is the whole reason
// the kit matches on local names.
const THEME = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements>
</a:theme>`;

const FORM_STYLES = `<?xml version="1.0"?>
<styleSheet xmlns="s">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><i/><sz val="9"/><color theme="1"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF44546A"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor theme="0" tint="-0.15"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"/><top style="medium"/><bottom/></border>
  </borders>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1"><alignment indent="2"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" applyFill="0"/>
  </cellXfs>
</styleSheet>`;

// Row 1 is the merged title band and is 40pt tall. Row 2 declares ht without
// customHeight, so the sheet default wins. Row 3 is hidden. Column A is wide,
// column C is hidden, and the sheet is frozen below its title.
const FORM_SHEET = `<?xml version="1.0"?>
<worksheet xmlns="ws">
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="30" customWidth="1"/>
    <col min="3" max="3" width="9" hidden="1"/>
  </cols>
  <sheetViews><sheetView><pane xSplit="1" ySplit="1" state="frozen"/></sheetView></sheetViews>
  <sheetData>
    <row r="1" ht="40" customHeight="1">
      <c r="A1" s="1" t="inlineStr"><is><t>Facility Request</t></is></c>
      <c r="B1" s="1"/><c r="C1" s="1"/>
    </row>
    <row r="2" ht="99">
      <c r="A2" s="2" t="inlineStr"><is><t>Annual cost</t></is></c>
      <c r="B2" s="3"><v>1234.5</v></c>
    </row>
    <row r="3" hidden="1"><c r="A3" t="inlineStr"><is><t>scratch</t></is></c></row>
    <row r="5"><c r="B5" s="4" t="inlineStr"><is><t>note</t></is></c></row>
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>
</worksheet>`;

const FORM_WORKBOOK = `<?xml version="1.0"?>
<workbook xmlns="wb" xmlns:r="rel">
  <sheets><sheet name="Form" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const FORM_RELS = `<?xml version="1.0"?>
<Relationships xmlns="rel">
  <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

// Reversed on purpose: theme1.xml is walked LAST, so any colour resolved
// during the walk rather than in finalize() comes out null.
const formParts = ({ reversed = false } = {}) => {
  const entries = [
    ['xl/theme/theme1.xml', THEME],
    ['xl/workbook.xml', FORM_WORKBOOK],
    ['xl/_rels/workbook.xml.rels', FORM_RELS],
    ['xl/styles.xml', FORM_STYLES],
    ['xl/worksheets/sheet1.xml', FORM_SHEET],
  ];
  return reversed ? entries.reverse() : entries;
};

const formXl = (opts) => xlsxKit.analyze(formParts(opts)).xl;

test('theme colours resolve whatever order the parts are walked in', () => {
  for (const reversed of [false, true]) {
    const xl = formXl({ reversed });
    // clrScheme order is dk1, lt1, dk2, lt2, accent1; Excel's indices swap the
    // first two pairs, so theme 0 is lt1 (white) and theme 1 is dk1 (black).
    assert.equal(xl.theme[0], '#ffffff', `theme 0, reversed=${reversed}`);
    assert.equal(xl.theme[1], '#000000', `theme 1, reversed=${reversed}`);
    assert.equal(xl.theme[2], '#e7e6e6', `theme 2, reversed=${reversed}`);
    assert.equal(xl.theme[3], '#44546a', `theme 3, reversed=${reversed}`);
    // The gray band every OFM form is ruled with: white tinted -0.15.
    assert.equal(xl.fills[3], '#d9d9d9', `tinted fill, reversed=${reversed}`);
  }
});

test('fills: only a solid pattern is a colour, and it reads fgColor', () => {
  const xl = formXl();
  assert.equal(xl.fills[0], null, 'patternType none is no fill');
  assert.equal(xl.fills[1], null, 'gray125 is Excel default furniture, not a choice');
  assert.equal(xl.fills[2], '#44546a', 'solid takes fgColor, not the indexed=64 bgColor');
});

test('cellStyle joins the four records a cell s names', () => {
  const xl = formXl();
  const title = xlsxKit.cellStyle(xl, 1);
  assert.equal(title.bold, true);
  assert.equal(title.size, 14);
  assert.equal(title.color, '#ffffff');
  assert.equal(title.fill, '#44546a');
  assert.equal(title.align, 'center');
  assert.equal(title.valign, 'center');
  assert.equal(title.wrap, true);

  const input = xlsxKit.cellStyle(xl, 2);
  assert.equal(input.fill, '#d9d9d9');
  assert.equal(input.indent, 2);
  assert.equal(input.border.left.style, 'thin');
  assert.equal(input.border.top.style, 'medium');
  assert.equal(input.border.bottom, null, 'an edge with no style is not a border');

  assert.equal(xlsxKit.cellStyle(xl, null), null, 'no style index is no record');
});

test('applyFill="0" means inherit, so the named fill is not painted', () => {
  const xl = formXl();
  // xf 4 names fillId 3 and switches it off. Reading fillId without the switch
  // paints a gray box behind a note that Excel leaves clear.
  assert.equal(xlsxKit.cellStyle(xl, 4).fill, null);
  assert.equal(xlsxKit.cellStyle(xl, 4).italic, true, 'the font still applies');
});

test('sheet geometry: widths, heights, merges, freeze', () => {
  const sheet = formXl().sheets.sheet1;
  assert.deepEqual(sheet.merges, [{ r1: 1, c1: 0, r2: 1, c2: 2 }]);
  assert.deepEqual(sheet.freeze, { x: 1, y: 1 });
  assert.equal(sheet.defaultRowHeight, 18);
  assert.deepEqual(sheet.cols.map(c => [c.min, c.max, c.width, c.hidden]),
    [[1, 1, 30, false], [3, 3, 9, true]]);
  const byRow = Object.fromEntries(sheet.rows.map(r => [r.row, r]));
  assert.equal(byRow[1].height, 40, 'customHeight="1" pins the row');
  assert.equal(byRow[2].height, null, 'ht without customHeight is Excel measuring, not the author');
  assert.equal(byRow[3].hidden, true);
});

test('sheetLayout: merges become spans and cover the cells beneath them', () => {
  const xl = formXl();
  const out = xlsxKit.sheetLayout(xl.sheets.sheet1, xl);
  const row1 = out.rows.find(r => r.row === 1);
  assert.equal(row1.cells.length, 1, 'B1 and C1 are covered by the merge, not emitted');
  assert.equal(row1.cells[0].colSpan, 3);
  assert.equal(row1.cells[0].rowSpan, 1);
  assert.equal(row1.cells[0].text, 'Facility Request');
  assert.equal(row1.height, Math.round(40 * 4 / 3), 'points to pixels');
});

test('sheetLayout: a hidden row is dropped and a missing row still holds its place', () => {
  const xl = formXl();
  const out = xlsxKit.sheetLayout(xl.sheets.sheet1, xl);
  const numbers = out.rows.map(r => r.row);
  assert.deepEqual(numbers, [1, 2, 4, 5],
    'row 3 is hidden; row 4 is absent from the file and still drawn, so the gutter stays true');
  assert.equal(out.rows.find(r => r.row === 2).height, Math.round(18 * 4 / 3),
    'a row without a custom height follows sheetFormatPr');
});

test('sheetLayout: column widths come from the file, and a hidden column is zero', () => {
  const xl = formXl();
  const { cols } = xlsxKit.sheetLayout(xl.sheets.sheet1, xl);
  assert.equal(cols.length, 3);
  assert.equal(cols[0].width, Math.round(30 * 7) + 5);
  assert.equal(cols[1].width, Math.round(8.43 * 7) + 5, 'no <col> means the Excel default');
  assert.equal(cols[2].width, 0, 'hidden');
});

test('sheetLayout: alignment follows the value, and the stored number rides along', () => {
  const xl = formXl();
  const out = xlsxKit.sheetLayout(xl.sheets.sheet1, xl);
  const row2 = out.rows.find(r => r.row === 2);
  const [label, amount] = row2.cells;
  assert.equal(label.numeric, false, 'an inline string is text however it looks');
  assert.equal(amount.numeric, true);
  assert.equal(amount.text, '$1,234.50', 'the custom currency code is applied');
  assert.equal(amount.raw, '1234.5', 'the stored value, because the drawn one is not it');
  assert.equal(label.raw, null, 'nothing to carry where the drawing is the value');
});

test('sheetLayout: an oversized sheet stops at the cap and says where', () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c><c r="B${i + 1}"><v>${i}</v></c></row>`).join('');
  const big = `<?xml version="1.0"?><worksheet xmlns="ws"><sheetData>${rows}</sheetData></worksheet>`;
  const parts = formParts().map(([p, x]) => p === 'xl/worksheets/sheet1.xml' ? [p, big] : [p, x]);
  const { xl } = xlsxKit.analyze(parts);
  const out = xlsxKit.sheetLayout(xl.sheets.sheet1, xl, { maxRows: 10 });
  assert.equal(out.rows.length, 10);
  assert.deepEqual(out.truncated, { fromRow: 11, lastRow: 40, reason: 'rows' });

  const byCells = xlsxKit.sheetLayout(xl.sheets.sheet1, xl, { maxCells: 9 });
  assert.equal(byCells.truncated.reason, 'cells');
  assert.ok(byCells.rows.length < 40);

  assert.equal(xlsxKit.sheetLayout(xl.sheets.sheet1, xl).truncated, null,
    'under the default cap nothing is withheld');
});

test('sheetLayout: an empty sheet says so rather than drawing a grid of nothing', () => {
  const blank = `<?xml version="1.0"?><worksheet xmlns="ws"><sheetData/></worksheet>`;
  const parts = formParts().map(([p, x]) => p === 'xl/worksheets/sheet1.xml' ? [p, blank] : [p, x]);
  const { xl } = xlsxKit.analyze(parts);
  const out = xlsxKit.sheetLayout(xl.sheets.sheet1, xl);
  assert.equal(out.empty, true);
  assert.deepEqual(out.rows, []);
});

test('number formats: the codes a budget workbook actually carries', () => {
  const at = (code, value) => xlsxKit.formatValue(String(value), { kind: xlsxKit.formatKind(code, 0), code });
  assert.equal(at('#,##0', 1234.5), '1,235', 'no decimal places means rounded, as Excel draws it');
  assert.equal(at('#,##0.00', 1234.5), '1,234.50');
  assert.equal(at('"$"#,##0.00', 1234.5), '$1,234.50');
  assert.equal(at('0.0%', 0.1256), '12.6%');
  assert.equal(at('0', 42), '42');
  assert.equal(at('0.00', 42), '42.00');
  // An accounting code's negative section supplies its own notation, so the
  // minus is NOT prefixed on top of the parentheses.
  assert.equal(at('#,##0_);(#,##0)', -1234), '(1,234)');
  assert.equal(at('#,##0', -1234), '-1,234', 'with no negative section, a minus');
  assert.equal(at('#,##0;[Red](#,##0)', -1234), '(1,234)');
  // A zero section is its own answer.
  assert.equal(at('#,##0;(#,##0);"-"', 0), '-');
});

test('number formats: literals, padding and fill characters', () => {
  const at = (code, value) => xlsxKit.formatValue(String(value), { kind: xlsxKit.formatKind(code, 0), code });
  assert.equal(at('0" FTE"', 3), '3 FTE');
  assert.equal(at('#,##0\\%', 5), '5%', 'an escaped percent is a literal, not a scale');
  assert.equal(at('0%', 0.05), '5%', 'an unescaped one scales');
  // _( reserves the width of a bracket and *  repeats a fill character. Neither
  // survives into a browser cell, and dropping them is what keeps an
  // accounting code from printing its own punctuation.
  assert.equal(at('_("$"* #,##0.00_)', 12.5), '$12.50');
});

test('date formats: the m that is a minute', () => {
  const at = (code, serial) => xlsxKit.formatValue(String(serial), { kind: xlsxKit.formatKind(code, 0), code });
  assert.equal(at('m/d/yy h:mm', 45000.5), '3/15/23 12:00');
  assert.equal(at('mm-dd-yy', 45000), '03-15-23');
  assert.equal(at('d-mmm-yy', 45000), '15-Mar-23');
  assert.equal(at('mmmm d, yyyy', 45000), 'March 15, 2023');
  assert.equal(at('h:mm:ss', 45000.5), '12:00:00');
  assert.equal(at('mm:ss', 45000.5), '00:00', 'both are time here, since ss follows');
  assert.equal(at('dddd', 45000), 'Wednesday');
  assert.equal(at('yyyy"-"mm', 45000), '2023-03', 'a quoted literal is not a token');
});

test('shared strings: a rich or empty entry still holds its index', () => {
  // Four entries: plain, RICH (runs, no bare <t>), EMPTY, plain. A reader that
  // drops either of the middle two shifts every index after it, and the sheet
  // then draws real text in the wrong cells rather than blanks. Found in the
  // OFM decision package addendum, which has 6 rich entries among 163.
  const SS = `<?xml version="1.0"?>
<sst xmlns="sst">
  <si><t>first</t></si>
  <si><r><rPr><b/></rPr><t>Section </t></r><r><t>One</t></r></si>
  <si><t/></si>
  <si><t>last</t></si>
</sst>`;
  const SHEET = `<?xml version="1.0"?>
<worksheet xmlns="ws"><sheetData><row r="1">
  <c r="A1" t="s"><v>0</v></c>
  <c r="B1" t="s"><v>1</v></c>
  <c r="C1" t="s"><v>2</v></c>
  <c r="D1" t="s"><v>3</v></c>
</row></sheetData></worksheet>`;
  const parts = buildParts().map(([p, x]) =>
    p === 'xl/sharedStrings.xml' ? [p, SS] : p === 'xl/worksheets/sheet1.xml' ? [p, SHEET] : [p, x]);
  const { xl } = xlsxKit.analyze(parts);
  assert.equal(xl.strings.length, 4, 'four <si> elements are four entries');
  assert.deepEqual(xlsxKit.sheetRows(xl.sheets.sheet1),
    [{ Row: 1, A: 'first', B: 'Section One', C: '', D: 'last' }]);
});

test('shared strings: a phonetic hint is not part of the value', () => {
  const SS = `<?xml version="1.0"?>
<sst xmlns="sst"><si><t>東京</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh></si></sst>`;
  const SHEET = `<?xml version="1.0"?>
<worksheet xmlns="ws"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`;
  const parts = buildParts().map(([p, x]) =>
    p === 'xl/sharedStrings.xml' ? [p, SS] : p === 'xl/worksheets/sheet1.xml' ? [p, SHEET] : [p, x]);
  const { xl } = xlsxKit.analyze(parts);
  assert.deepEqual(xlsxKit.sheetRows(xl.sheets.sheet1), [{ Row: 1, A: '東京' }]);
});
