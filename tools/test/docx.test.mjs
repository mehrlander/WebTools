// kits/docx.js — the preparation a .docx gets before the page render paints
// it. DOMParser and XMLSerializer come from jsdom, as in xlsx.test.mjs; the
// fixtures are hand-built WordprocessingML parts, so the pure normalize()
// logic is exercised without a real .docx, JSZip, or the painter.
//
// The two gaps the kit closes are each held here against the shape that
// exposed them: a content control wrapping a table ROW and one wrapping a
// CELL's paragraph, which docx-preview 0.4.0 drops, and a Symbol-font bullet,
// which draws as nothing where the font is absent.

import test from 'node:test';
import assert from 'node:assert/strict';
import jsdomPkg from 'jsdom';
import { loadKit } from './bootstrap.mjs';

const { JSDOM } = jsdomPkg;
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;

const { docxKit } = loadKit('docx');

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
           'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';

// A body with every level a control can sit at: a block-level control around
// a heading, a row-level control around a table row, a cell-level control
// around a cell's paragraph, a run-level control inside a paragraph (a
// checkbox, checked), and a control nested inside another's content.
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>
  <w:sdt><w:sdtPr><w:alias w:val="Title block"/></w:sdtPr><w:sdtContent>
    <w:p w14:paraId="0A1B2C3D"><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Fiscal Summary</w:t></w:r></w:p>
  </w:sdtContent></w:sdt>
  <w:tbl>
    <w:sdt><w:sdtPr><w:tag w:val="hdr"/></w:sdtPr><w:sdtContent>
      <w:tr><w:tc><w:p><w:r><w:t>Fiscal Years</w:t></w:r></w:p></w:tc></w:tr>
    </w:sdtContent></w:sdt>
    <w:tr>
      <w:tc><w:sdt><w:sdtPr/><w:sdtContent>
        <w:p w14:paraId="11111111"><w:r><w:t>Staffing</w:t></w:r></w:p>
      </w:sdtContent></w:sdt></w:tc>
      <w:tc><w:p><w:r><w:t>0.0</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>
  <w:p w14:paraId="22222222"><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
    <w:sdt><w:sdtPr><w14:checkbox><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr><w:sdtContent>
      <w:r><w:t>☒</w:t></w:r>
    </w:sdtContent></w:sdt>
    <w:r><w:t xml:space="preserve"> Yes</w:t></w:r>
  </w:p>
  <w:sdt><w:sdtPr><w:showingPlcHdr/></w:sdtPr><w:sdtContent>
    <w:p><w:sdt><w:sdtPr><w:text/></w:sdtPr><w:sdtContent><w:r><w:t>Click or tap here to enter text.</w:t></w:r></w:sdtContent></w:sdt></w:p>
  </w:sdtContent></w:sdt>
  <w:p><w:r><w:t>Plain paragraph.</w:t></w:r></w:p>
</w:body></w:document>`;

// Four levels: a Symbol dot, a Wingdings square, a Courier "o" that is a real
// letter and must not change, and a Symbol byte the table does not carry.
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${NS}>
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val=""/><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val=""/><w:rPr><w:rFonts w:ascii="Wingdings" w:hAnsi="Wingdings"/></w:rPr></w:lvl>
    <w:lvl w:ilvl="2"><w:numFmt w:val="bullet"/><w:lvlText w:val="o"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/></w:rPr></w:lvl>
    <w:lvl w:ilvl="3"><w:numFmt w:val="bullet"/><w:lvlText w:val=""/><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl>
    <w:lvl w:ilvl="4"><w:numFmt w:val="decimal"/><w:lvlText w:val="%5."/><w:rPr><w:rFonts w:ascii="Symbol"/></w:rPr></w:lvl>
  </w:abstractNum>
</w:numbering>`;

const HEADER = `<?xml version="1.0"?><w:hdr ${NS}><w:p><w:sdt><w:sdtPr/><w:sdtContent><w:r><w:t>Agency Code</w:t></w:r></w:sdtContent></w:sdt></w:p></w:hdr>`;

const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const count = (doc, name) => doc.getElementsByTagNameNS(W, name).length;
const texts = (doc) => [...doc.getElementsByTagNameNS(W, 't')].map(t => t.textContent);

test('kit surface', () => {
  for (const k of ['normalize', 'prepare', 'survey', 'listControls', 'unwrapControls', 'mapBullets', 'markPageBreaks', 'fixHeaderRefs', 'markPageFields']) {
    assert.equal(typeof docxKit[k], 'function', k);
  }
  assert.ok(docxKit.CONTENT_PART.test('word/document.xml'));
  assert.ok(docxKit.CONTENT_PART.test('word/header2.xml'));
  assert.ok(!docxKit.CONTENT_PART.test('word/numbering.xml'));
  assert.ok(!docxKit.CONTENT_PART.test('word/glossary/document.xml'), 'the glossary is a template store, not the body');
});

// ── content controls ─────────────────────────────────────────────────────────

test('survey: every control is listed with its level, kind and state before anything moves', () => {
  const s = docxKit.survey(parse(DOCUMENT));
  assert.equal(s.paragraphs, 7);
  assert.equal(s.tables, 1);
  assert.deepEqual(s.headings, [
    { id: '0A1B2C3D', style: 'Heading1', text: 'Fiscal Summary' },
    { id: '22222222', style: 'Heading2', text: '☒ Yes' },
  ]);
  const levels = s.controls.map(c => c.level);
  assert.deepEqual(levels, ['block', 'row', 'cell', 'run', 'block', 'run']);
  const byText = Object.fromEntries(s.controls.map(c => [c.text.trim(), c]));
  assert.equal(byText['Fiscal Summary'].alias, 'Title block');
  assert.equal(byText['Fiscal Years'].tag, 'hdr');
  assert.equal(byText['Fiscal Years'].parent, 'tbl', 'a row control sits directly in the table');
  assert.equal(byText['Staffing'].parent, 'tc');
  assert.equal(byText['☒'].kind, 'checkbox');
  assert.equal(byText['☒'].checked, true);
  assert.equal(byText['Click or tap here to enter text.'].kind, 'text');
  const outer = s.controls.find(c => c.placeholder);
  assert.ok(outer, 'the outer control still shows its placeholder');
  assert.equal(outer.kind, 'richText', 'no typed element means a rich-text control');
});

test('unwrapControls: every level unwraps, text and order survive, nothing is left', () => {
  const doc = parse(DOCUMENT);
  const before = texts(doc);
  const n = docxKit.unwrapControls(doc);
  assert.equal(n, 6);
  assert.equal(count(doc, 'sdt'), 0);
  assert.equal(count(doc, 'sdtContent'), 0);
  assert.equal(count(doc, 'sdtPr'), 0);
  assert.deepEqual(texts(doc), before, 'the same text in the same order');
  // The row control's row is now a direct child of the table, before the
  // row it preceded; the cell control's paragraph is a direct child of the
  // cell. This is the shape docx-preview's row and cell parsers read.
  const tbl = doc.getElementsByTagNameNS(W, 'tbl')[0];
  assert.deepEqual([...tbl.children].map(c => c.localName), ['tr', 'tr']);
  const firstCell = doc.getElementsByTagNameNS(W, 'tr')[1].children[0];
  assert.deepEqual([...firstCell.children].map(c => c.localName), ['p']);
  // A run-level control's runs join the paragraph in place.
  const yes = doc.getElementsByTagNameNS(W, 'p')[4];
  assert.deepEqual([...yes.children].map(c => c.localName), ['pPr', 'r', 'r']);
});

test('unwrapControls: a control with no content element is removed rather than kept empty', () => {
  const doc = parse(`<w:document ${NS}><w:body><w:p><w:sdt><w:sdtPr/></w:sdt><w:r><w:t>kept</w:t></w:r></w:p></w:body></w:document>`);
  assert.equal(docxKit.unwrapControls(doc), 1);
  assert.equal(count(doc, 'sdt'), 0);
  assert.deepEqual(texts(doc), ['kept']);
});

// ── bullets ──────────────────────────────────────────────────────────────────

test('mapBullets: Symbol and Wingdings bytes become glyphs and drop their font; letters and unknown bytes stay', () => {
  const doc = parse(NUMBERING);
  const n = docxKit.mapBullets(doc);
  assert.equal(n, 2);
  const lvls = [...doc.getElementsByTagNameNS(W, 'lvl')];
  const text = (l) => l.getElementsByTagNameNS(W, 'lvlText')[0].getAttributeNS(W, 'val');
  const fonts = (l) => l.getElementsByTagNameNS(W, 'rFonts').length;
  assert.equal(text(lvls[0]), '•');
  assert.equal(fonts(lvls[0]), 0, 'the Symbol hint is dropped so the paragraph font draws the dot');
  assert.equal(text(lvls[1]), '▪');
  assert.equal(fonts(lvls[1]), 0);
  assert.equal(text(lvls[2]), 'o', 'a Courier "o" is a letter, not a symbol byte');
  assert.equal(fonts(lvls[2]), 1);
  assert.equal(text(lvls[3]), '', 'an unmapped byte is left as written');
  assert.equal(fonts(lvls[3]), 1);
  assert.equal(text(lvls[4]), '%5.', 'a numbered level is never touched');
});

test('mapBullets: the bare byte form and the private-use form name the same glyph', () => {
  const one = (val) => {
    const doc = parse(`<w:numbering ${NS}><w:abstractNum><w:lvl><w:numFmt w:val="bullet"/><w:lvlText w:val="${val}"/><w:rPr><w:rFonts w:ascii="Symbol"/></w:rPr></w:lvl></w:abstractNum></w:numbering>`);
    docxKit.mapBullets(doc);
    return doc.getElementsByTagNameNS(W, 'lvlText')[0].getAttributeNS(W, 'val');
  };
  assert.equal(one(''), '•');
  assert.equal(one('·'), '•');
  assert.equal(one('•'), '•', 'already Unicode: unchanged');
});

// ── page breaks ──────────────────────────────────────────────────────────────

const BREAKS = `<w:document ${NS}><w:body>
  <w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Breaks before</w:t></w:r></w:p>
  <w:p><w:pPr><w:pageBreakBefore w:val="0"/></w:pPr><w:r><w:t>Switched off</w:t></w:r></w:p>
  <w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:lastRenderedPageBreak/><w:t>Already broken</w:t></w:r></w:p>
  <w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:br w:type="page"/></w:r><w:r><w:t>Explicit already</w:t></w:r></w:p>
  <w:p><w:pPr><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:pPr><w:r><w:t>Section end</w:t></w:r></w:p>
  <w:p><w:r><w:t>After the section</w:t></w:r></w:p>
  <w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
</w:body></w:document>`;

const opensWith = (p) => [...p.getElementsByTagNameNS(W, 'r')][0]?.firstElementChild?.localName;

test('markPageBreaks: a paragraph\'s own pageBreakBefore becomes the break run the painter reads, once', () => {
  const doc = parse(BREAKS);
  assert.equal(docxKit.markPageBreaks(doc), 1);
  const ps = [...doc.getElementsByTagNameNS(W, 'p')];
  assert.equal(opensWith(ps[0]), 'br', 'the break run leads the paragraph');
  assert.equal(ps[0].firstElementChild.localName, 'pPr', 'after its properties');
  assert.equal(opensWith(ps[1]), 't', 'val="0" is off');
  assert.equal(opensWith(ps[2]), 'lastRenderedPageBreak', 'a saved break already there is enough');
  assert.equal(opensWith(ps[3]), 'br', 'an explicit break already there is left as it was');
  assert.equal(ps[3].getElementsByTagNameNS(W, 'br').length, 1);
  assert.equal(opensWith(ps[5]), 't', 'a section break writes nothing: the painter pages sections itself');
  assert.equal(docxKit.markPageBreaks(doc), 0, 'idempotent');
});

// ── headers and footers ──────────────────────────────────────────────────────

// The IT Addendum's shape: a first section naming a default, an even and a
// first header and footer, and a body section naming none.
const HEADERS = `<w:document ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
  <w:p><w:pPr><w:sectPr>
    <w:headerReference w:type="even" r:id="rId11"/><w:headerReference w:type="default" r:id="rId12"/>
    <w:footerReference w:type="even" r:id="rId13"/><w:footerReference w:type="default" r:id="rId14"/>
    <w:headerReference w:type="first" r:id="rId15"/><w:footerReference w:type="first" r:id="rId16"/>
    <w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:pPr><w:r><w:t>Title</w:t></w:r></w:p>
  <w:p><w:r><w:t>Form</w:t></w:r></w:p>
  <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440"/></w:sectPr>
</w:body></w:document>`;

const refsOf = (sect) => [...sect.children].filter(c => /Reference$/.test(c.localName))
  .map(c => c.localName.replace('Reference', '') + ':' + c.getAttributeNS(W, 'type'));

test('fixHeaderRefs: a section naming no header or footer inherits the previous one\'s, ahead of its own children', () => {
  const doc = parse(HEADERS);
  const n = docxKit.fixHeaderRefs(doc, '<w:settings xmlns:w="' + W + '"><w:evenAndOddHeaders/></w:settings>');
  const [first, body] = [...doc.getElementsByTagNameNS(W, 'sectPr')];
  assert.equal(n, 6, 'six references copied, none removed with even-and-odd on');
  assert.deepEqual(refsOf(body), ['header:even', 'header:default', 'header:first', 'footer:even', 'footer:default', 'footer:first']);
  assert.equal(body.firstElementChild.localName, 'headerReference', 'references lead the sectPr');
  assert.equal(body.lastElementChild.localName, 'pgMar', 'the section\'s own children follow');
  assert.equal(refsOf(first).length, 6, 'the source is untouched');
});

test('fixHeaderRefs: even-page references go unless the document enabled even and odd headers', () => {
  const doc = parse(HEADERS);
  const n = docxKit.fixHeaderRefs(doc, '<w:settings xmlns:w="' + W + '"/>');
  const [first, body] = [...doc.getElementsByTagNameNS(W, 'sectPr')];
  assert.equal(n, 6 + 4, 'six copied, then two even references removed from each of two sections');
  assert.deepEqual(refsOf(first), ['header:default', 'footer:default', 'header:first', 'footer:first']);
  assert.deepEqual(refsOf(body), ['header:default', 'header:first', 'footer:default', 'footer:first']);
  const off = parse(HEADERS);
  docxKit.fixHeaderRefs(off, '<w:settings xmlns:w="' + W + '"><w:evenAndOddHeaders w:val="0"/></w:settings>');
  assert.ok(!refsOf(off.getElementsByTagNameNS(W, 'sectPr')[0]).includes('header:even'), 'val="0" is off');
  const none = parse(HEADERS);
  docxKit.fixHeaderRefs(none, null);
  assert.ok(!refsOf(none.getElementsByTagNameNS(W, 'sectPr')[0]).includes('header:even'), 'no settings part is off');
});

test('fixHeaderRefs: idempotent', () => {
  const doc = parse(HEADERS);
  docxKit.fixHeaderRefs(doc, null);
  assert.equal(docxKit.fixHeaderRefs(doc, null), 0);
});

test('normalize: the header pass reads word/settings.xml from the parts and reports', () => {
  const settings = '<w:settings xmlns:w="' + W + '"/>';
  const { parts, report } = docxKit.normalize({ 'word/document.xml': HEADERS, 'word/settings.xml': settings });
  assert.equal(report.headerRefs, 10);
  assert.equal(Object.keys(parts).join(), 'word/document.xml', 'settings is read, never rewritten');
});

// ── page-number fields ───────────────────────────────────────────────────────

const FOOTER = `<w:ftr ${NS}><w:p>
  <w:r><w:t xml:space="preserve">Page </w:t></w:r>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>1</w:t></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
  <w:r><w:t xml:space="preserve"> of </w:t></w:r>
  <w:fldSimple w:instr=" NUMPAGES  \\* MERGEFORMAT "><w:r><w:t>2</w:t></w:r></w:fldSimple>
  <w:fldSimple w:instr=" DATE "><w:r><w:t>2026</w:t></w:r></w:fldSimple>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> HYPERLINK "x" </w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>link</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p></w:ftr>`;

test('markPageFields: PAGE and NUMPAGES results become sentinels, other fields are left alone', () => {
  const doc = parse(FOOTER);
  const n = docxKit.markPageFields(doc);
  assert.equal(n, 2);
  const text = texts(doc);
  assert.deepEqual(text, ['Page ', docxKit.PAGE_FIELD, '', ' of ', docxKit.NUMPAGES_FIELD, '2026', 'link']);
  assert.equal(docxKit.markPageFields(doc), 2, 'idempotent in effect: the sentinels are rewritten to themselves');
  assert.deepEqual(texts(doc), text);
});

test('markPageFields: the sentinel keeps the first result run and its formatting', () => {
  const doc = parse(FOOTER);
  docxKit.markPageFields(doc);
  const runs = [...doc.getElementsByTagNameNS(W, 'r')];
  const carrier = runs.find(r => r.textContent === docxKit.PAGE_FIELD);
  assert.ok(carrier.getElementsByTagNameNS(W, 'b').length, 'the bold on the result run survives');
});

test('expandSimpleFields: a simple field becomes the complex run form, its result runs kept in place', () => {
  const doc = parse(FOOTER);
  assert.equal(docxKit.expandSimpleFields(doc), 2);
  assert.equal(doc.getElementsByTagNameNS(W, 'fldSimple').length, 0);
  const runs = [...doc.getElementsByTagNameNS(W, 'p')[0].children].filter(c => c.localName === 'r');
  const shape = runs.map(r => {
    const fc = r.getElementsByTagNameNS(W, 'fldChar')[0];
    if (fc) return fc.getAttributeNS(W, 'fldCharType');
    if (r.getElementsByTagNameNS(W, 'instrText').length) return 'instr:' + r.textContent.trim();
    return 't:' + r.textContent;
  });
  assert.deepEqual(shape.slice(8, 18), ['begin', 'instr:NUMPAGES  \\* MERGEFORMAT', 'separate', 't:2', 'end',
                                        'begin', 'instr:DATE', 'separate', 't:2026', 'end']);
  assert.equal(docxKit.expandSimpleFields(doc), 0, 'idempotent: nothing left to expand');
});

test('normalize: fields are expanded then marked in every content part, headers and footers included', () => {
  const { parts, report } = docxKit.normalize({ 'word/footer1.xml': FOOTER, 'word/document.xml': `<w:document ${NS}><w:body><w:p/></w:body></w:document>` });
  assert.equal(report.simpleFields, 2);
  assert.equal(report.fields, 2);
  assert.ok(parts['word/footer1.xml'].includes(docxKit.PAGE_FIELD));
  assert.ok(parts['word/footer1.xml'].includes(docxKit.NUMPAGES_FIELD));
  assert.ok(!parts['word/footer1.xml'].includes('fldSimple'));
});

// ── normalize, the pure entry point ──────────────────────────────────────────

test('normalize: returns only the parts that changed, with a report per part and the survey', () => {
  const { parts, report } = docxKit.normalize({
    'word/document.xml': DOCUMENT,
    'word/header1.xml': HEADER,
    'word/numbering.xml': NUMBERING,
    'word/styles.xml': `<w:styles ${NS}/>`,
    'word/footer1.xml': `<w:ftr ${NS}><w:p><w:r><w:t>Page</w:t></w:r></w:p></w:ftr>`,
  });
  assert.deepEqual(Object.keys(parts).sort(), ['word/document.xml', 'word/header1.xml', 'word/numbering.xml']);
  assert.equal(report.controls, 7, 'six in the body, one in the header');
  assert.equal(report.bullets, 2);
  assert.deepEqual(report.byPart, { 'word/document.xml': 6, 'word/header1.xml': 1, 'word/numbering.xml': 2 });
  assert.deepEqual(report.skipped, []);
  assert.equal(report.survey.controls.length, 6, 'the survey is the main document\'s, taken before the unwrap');
  assert.equal(report.survey.headings[0].id, '0A1B2C3D');
});

test('normalize: a rewritten part keeps its XML declaration and re-parses with no control in it', () => {
  const { parts } = docxKit.normalize([['word/document.xml', DOCUMENT]]);
  const out = parts['word/document.xml'];
  assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), out.slice(0, 60));
  const again = parse(out);
  assert.equal(again.getElementsByTagName('parsererror').length, 0);
  assert.equal(count(again, 'sdt'), 0);
  assert.deepEqual(texts(again), texts(parse(DOCUMENT)));
});

test('normalize: idempotent, and a part with nothing to do is not returned', () => {
  const first = docxKit.normalize([['word/document.xml', DOCUMENT], ['word/numbering.xml', NUMBERING]]);
  const second = docxKit.normalize(first.parts);
  assert.deepEqual(second.parts, {});
  assert.equal(second.report.controls, 0);
  assert.equal(second.report.bullets, 0);
});

test('normalize: a malformed part is skipped and named, and the others still go through', () => {
  const { parts, report } = docxKit.normalize({
    'word/document.xml': DOCUMENT,
    'word/header1.xml': '<w:hdr><w:p>unclosed',
  });
  assert.deepEqual(report.skipped, ['word/header1.xml']);
  assert.deepEqual(Object.keys(parts), ['word/document.xml']);
});

test('normalize: parts outside the body and numbering are never read', () => {
  const { parts, report } = docxKit.normalize({
    'word/glossary/document.xml': DOCUMENT,
    'customXml/item1.xml': DOCUMENT,
    '[Content_Types].xml': '<Types/>',
  });
  assert.deepEqual(parts, {});
  assert.equal(report.controls, 0);
  assert.equal(report.survey, null);
});
