#!/usr/bin/env node
// The viewer's page render for a Word document, end to end in a browser.
//
//   node tools/test/viewer-docx.mjs [--shot out.png] [--docx path/to/file.docx] [--width px] [--pinch factor] [--dump]
//
// The node suite holds kits/docx.js's preparation against fixture XML. What
// it cannot hold is the claim the whole thing exists for: that a .docx handed
// to the viewer OPENS on the page render, that the painter draws it as pages
// with the header and footer on them, and that a content control inside a
// table cell, which the painter alone drops, reaches the page because the kit
// unwrapped it first. Seven claims:
//
//   1. a .docx opens in the page mode over the host's blanket defaultMode,
//      and the reading view is still in the strip
//   2. the render is pages (one <section> each), with the header's text on
//      the first
//   3. a cell-level control's label is drawn (the sdt gap), and a row-level
//      control's row too
//   4. a Symbol-font bullet reaches the page as a Unicode dot
//   5. the header line states pages and bytes, and `__doc.locate` lands on a
//      cited phrase
//   6. a two-finger touch is taken from the browser and scales the page as a
//      transform while the fingers move, a ctrl-wheel zooms about the pointer,
//      the pill shows the level off fit width, and tapping it returns to fit
//   7. the viewer cuts a long section into pages of page height, at blocks and
//      at table rows, each with the header and footer and its own number,
//      and loses nothing on the way
//
// The fixture is built here with jszip rather than committed, so no binary
// enters the tree and the document's internals are exactly what the
// assertions talk about. It is delivered as a data: URI inside a data-view
// envelope, the `carried` branch a dropped file takes.
//
// --docx renders a real file instead (the assertions then reduce to the ones
// that hold for any document), and --shot writes the pane to a PNG: the way
// to get pixels of the real viewer on a real form from a sandbox whose
// headless browser cannot reach a CDN.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const shot = opt('--shot');
const real = opt('--docx');
const width = Number(opt('--width') || 1000);

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// --- the fixture ----------------------------------------------------------

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Fiscal Summary</w:t></w:r></w:p>
  <w:tbl>
    <w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/>
    </w:tblBorders></w:tblPr>
    <w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
    <w:sdt><w:sdtPr><w:tag w:val="hdr"/></w:sdtPr><w:sdtContent>
      <w:tr><w:tc><w:p><w:r><w:t>Fiscal Years</w:t></w:r></w:p></w:tc>
             <w:tc><w:p><w:r><w:t>2028</w:t></w:r></w:p></w:tc>
             <w:tc><w:p><w:r><w:t>2029</w:t></w:r></w:p></w:tc></w:tr>
    </w:sdtContent></w:sdt>
    <w:tr>
      <w:tc><w:tcPr><w:gridSpan w:val="3"/><w:shd w:val="clear" w:color="auto" w:fill="BEBEBE"/></w:tcPr>
        <w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Staffing</w:t></w:r></w:p></w:sdtContent></w:sdt>
      </w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>FTEs</w:t></w:r></w:p></w:sdtContent></w:sdt></w:tc>
      <w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>0.0</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>0.0</w:t></w:r></w:p></w:tc>
    </w:tr>
  </w:tbl>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Detailed narrative descriptions</w:t></w:r></w:p>
  <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Informative tables</w:t></w:r></w:p>
  <w:p><w:r><w:t>What is the problem, opportunity, or priority you are addressing with the request?</w:t></w:r></w:p>
  <w:p><w:r><w:t xml:space="preserve">Link: </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>bad link</w:t></w:r></w:hyperlink></w:p>
  ${Array.from({ length: 40 }, (_, i) => `<w:p><w:r><w:t>Filler paragraph ${i + 1} runs long enough to take a line of the page and push what follows down toward the foot.</w:t></w:r></w:p>`).join('\n  ')}
  <w:p><w:r><w:t>Before the long table</w:t></w:r></w:p>
  <w:tbl>
    <w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr>
    <w:tblGrid><w:gridCol w:w="8000"/></w:tblGrid>
    ${Array.from({ length: 40 }, (_, i) => `<w:tr><w:tc><w:p><w:r><w:t>Row ${i + 1}</w:t></w:r></w:p></w:tc></w:tr>`).join('\n    ')}
  </w:tbl>
  <w:p><w:r><w:t>After the long table</w:t></w:r></w:p>
  <w:sectPr>
    <w:headerReference w:type="default" r:id="rId7"/>
    <w:footerReference w:type="default" r:id="rId8"/>
    <w:pgSz w:w="12240" w:h="15840"/>
    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
  </w:sectPr>
</w:body></w:document>`;

const HEADER = `<?xml version="1.0"?><w:hdr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>
  <w:sdt><w:sdtPr/><w:sdtContent><w:r><w:t>Agency Code – Agency Name</w:t></w:r></w:sdtContent></w:sdt></w:p></w:hdr>`;
const FOOTER = `<?xml version="1.0"?><w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;

const NUMBERING = `<?xml version="1.0"?><w:numbering ${NS}>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>
    <w:lvlText w:val=""/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const STYLES = `<?xml version="1.0"?><w:styles ${NS}>
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="D1D1D1"/></w:pPr><w:rPr><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`;

const RELS = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/>
</Relationships>`;

const ROOT_RELS = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const CONTENT_TYPES = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

async function buildDocument() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/document.xml', DOCUMENT);
  zip.file('word/_rels/document.xml.rels', RELS);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/numbering.xml', NUMBERING);
  zip.file('word/header1.xml', HEADER);
  zip.file('word/footer1.xml', FOOTER);
  return zip.generateAsync({ type: 'base64' });
}

// --- harness --------------------------------------------------------------

const JSZIP_UMD = await readFile(path.join(root, 'node_modules/jszip/dist/jszip.min.js'), 'utf8');

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  try {
    const body = await readFile(path.join(root, rel));
    res.writeHead(200, { 'content-type': typeFor(rel) });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width, height: 1300 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
// JSZip as the global both the kit and the painter read; the CDN shim cannot
// synthesize its ESM entry (see viewer-xlsx.mjs).
await page.addInitScript({ content: JSZIP_UMD });
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

const state = () => page.evaluate(() => {
  const host = document.getElementById('dv-viewer');
  const v = host && Alpine.$data(host);
  const root = document.querySelector('[data-page="root"]');
  const msg = root?.querySelector('[data-page="msg"]');
  const sections = [...(root?.querySelectorAll('section[class^="wd"]') || [])];
  const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    mode: v?.mode || null,
    modes: (v?.availableModes || []).map(m => m.id),
    stats: v?.stats || '',
    msg: msg ? msg.textContent.trim() : '(gone)',
    pages: sections.length,
    header: text(sections[0]?.querySelector('header')),
    footer: text(sections[0]?.querySelector('footer')),
    body: text(sections[0]?.querySelector('article')),
    all: sections.map(s => text(s)).join(' '),
    // The painter draws a list level as a `p.<class>-num-N-L` rule: a glyph it
    // recognises becomes a CSS list marker (`list-style-type: disc` for the
    // dot), any other becomes a `:before` with the glyph as its content. So a
    // Symbol dot that reached it unmapped would be a `content` carrying a
    // private-use character, and a mapped one is the disc. The stylesheet it
    // wrote is the record; the paragraphs' computed display says the rule
    // reached them.
    numRules: [...(root?.querySelectorAll('style') || [])].map(s => s.textContent).join('\n')
      .match(/[^\n{]*-num-[^{]*\{[^}]*\}/g) || [],
    listItems: [...(root?.querySelectorAll('p[class*="-num-"]') || [])]
      .map(p => getComputedStyle(p).display + '/' + getComputedStyle(p).listStyleType),
    paragraphs: root?.querySelectorAll('p').length || 0,
    links: [...(root?.querySelectorAll('a') || [])].map(a => [a.textContent, a.getAttribute('href')]),
    zoom: root?.querySelector('[data-page="stage"] > div > div:nth-child(2)')?.style.zoom || '',
    scrollWidth: root?.querySelector('[data-page="stage"] > div')?.scrollWidth,
    clientWidth: root?.querySelector('[data-page="stage"] > div')?.clientWidth,
  };
});

try {
  const b64 = real ? (await readFile(real)).toString('base64') : await buildDocument();
  const name = real ? path.basename(real) : 'form.docx';
  const env = {
    kind: 'data-view/1',
    items: [{ name, content: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + b64 }],
  };

  console.log(`a document carried as a data URI (${name}):`);
  await page.goto(`${origin}/pages/data-view.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(async (payload) => {
    const bytes = new TextEncoder().encode(payload);
    const gz = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(gz).arrayBuffer());
    let str = ''; for (const b of buf) str += String.fromCharCode(b);
    location.hash = 'gz=' + btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    location.reload();
  }, JSON.stringify(env));
  await page.waitForTimeout(real ? 8000 : 5000);

  const s = await state();
  // Claim 1.
  ok('the page mode is available and the reading view beside it',
     s.modes.includes('page') && s.modes.includes('docx'), JSON.stringify(s.modes));
  ok('and the page mode is what opened', s.mode === 'page', JSON.stringify({ mode: s.mode }));
  ok('the loading line got out of the way', s.msg === '(gone)', s.msg);
  // Claim 2.
  ok('the render is at least one page', s.pages >= 1, String(s.pages));
  ok('the header line states pages and bytes', /^\d+ pages? · (\d+ controls? · )?\d+\.\d KB$/.test(s.stats), s.stats);
  ok('the pane does not scroll sideways', (s.scrollWidth || 0) <= (s.clientWidth || 0) + 1,
     `scrollWidth ${s.scrollWidth} clientWidth ${s.clientWidth} zoom ${s.zoom}`);

  if (!real) {
    ok('the header text is on the first page', s.header.includes('Agency Code'), s.header);
    ok('and the footer, its PAGE and NUMPAGES fields filled in', /^Page 1 of \d+$/.test(s.footer.trim()), s.footer);
    // Claim 3, the whole reason for the kit.
    ok('a cell-level control\'s label is drawn', s.body.includes('Staffing'), s.body);
    ok('a second cell-level control too', s.body.includes('FTEs'), s.body);
    ok('a row-level control\'s row is drawn', s.body.includes('Fiscal Years') && s.body.includes('2028'), s.body);
    ok('the heading with a shaded band is there', s.body.includes('Fiscal Summary'), s.body);
    // Claim 4.
    ok('the Symbol bullet reached the page as a dot the browser draws',
       s.numRules.some(r => /list-style-type:\s*disc|content:\s*"•"/.test(r)), JSON.stringify(s.numRules));
    ok('and is drawn on both list paragraphs',
       s.listItems.length === 2 && s.listItems.every(x => x.startsWith('list-item/')), JSON.stringify(s.listItems));
    ok('and no private-use glyph is left', !s.numRules.some(r => /[\uF000-\uF0FF]/.test(r)), JSON.stringify(s.numRules));
    // The link scrub.
    ok('a javascript: link lost its href', s.links.some(([t, h]) => t === 'bad link' && h === null), JSON.stringify(s.links));

    // Claim 7: pages are page-sized. The fixture runs to several pages, the
    // cut falling once inside the 40-row table, so every page but the last is
    // full, none clips, the footer counts them, and every word is still there
    // exactly once.
    const paged = await page.evaluate(() => {
      const root = document.querySelector('[data-page="root"]');
      const secs = [...root.querySelectorAll('section[class^="wd"]')];
      const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
      const pageH = parseFloat(getComputedStyle(secs[0]).minHeight);
      return {
        pages: secs.length,
        heights: secs.map(s => Math.round(s.getBoundingClientRect().height)),
        pageH: Math.round(pageH),
        clipped: secs.filter(s => s.scrollHeight > s.clientHeight + 1).length,
        footers: secs.map(s => text(s.querySelector('footer'))),
        headers: secs.map(s => text(s.querySelector('header'))),
        // The long table's rows per page; the fiscal table above it has its own.
        rows: secs.map(s => (text(s.querySelector('article')).match(/\bRow \d+\b/g) || []).length),
        rowText: (text(root).match(/\bRow \d+\b/g) || []).length,
        fillers: (text(root).match(/Filler paragraph \d+/g) || []).length,
        lastEnds: text(secs[secs.length - 1].querySelector('article')).endsWith('After the long table'),
      };
    });
    ok('the fixture paginates into several pages', paged.pages >= 3, JSON.stringify(paged));
    ok('every page but the last is exactly page height, and none clips',
       paged.heights.slice(0, -1).every(h => Math.abs(h - paged.pageH) <= 1) && paged.clipped === 0, JSON.stringify(paged));
    ok('the footer counts the pages it is on', paged.footers.every((f, i) => f === `Page ${i + 1} of ${paged.pages}`), JSON.stringify(paged.footers));
    ok('every page carries the header', paged.headers.every(h => h.includes('Agency Code')), JSON.stringify(paged.headers));
    ok('the table was cut at a row and every row is still there once',
       paged.rows.filter(Boolean).length >= 2 && paged.rowText === 40, JSON.stringify(paged.rows));
    ok('every filler paragraph is still there once, and the tail is on the last page',
       paged.fillers === 40 && paged.lastEnds, JSON.stringify({ fillers: paged.fillers, lastEnds: paged.lastEnds }));

    // Claim 5.
    console.log('a cite lands:');
    const hit = await page.evaluate(async () => {
      const root = document.getElementById('dv-viewer');
      const api = root?.__doc || root?.querySelector('[x-data]')?.__doc
        || [...document.querySelectorAll('*')].map(e => e.__doc).find(Boolean);
      if (!api?.locate) return { error: 'no __doc.locate published' };
      const at = await api.locate({ text: 'What is the problem, opportunity' });
      const landed = document.querySelector('[data-page="root"] .landed');
      return { at, landed: landed ? landed.textContent.trim().slice(0, 40) : null, pages: api.pages,
               controls: api.survey?.controls?.length };
    });
    ok('locate found the phrase and marked its paragraph',
       hit.landed?.startsWith('What is the problem'), JSON.stringify(hit));
    ok('and reported the page it is on', hit.at?.page === 1, JSON.stringify(hit.at));
    ok('the survey counts the body\'s three controls (the header\'s is not the body\'s)', hit.controls === 3, JSON.stringify(hit));

    // Claim 6: the reader can zoom. A pinch is two touch pointers moving
    // apart; a ctrl-wheel is the desktop chord and the trackpad pinch. Both
    // are synthesized here, since Playwright drives one pointer at a time,
    // and read back through the CSS zoom the pane applies and the pill it
    // shows off fit width.
    console.log('zoom:');
    const zoomed = await page.evaluate(async () => {
      const root = document.querySelector('[data-page="root"]');
      const pane = root.querySelector('[data-page="stage"] > div');
      const shell = pane.children[1];
      const body = shell.firstElementChild;
      const pill = root.querySelector('.viewer-page-zoom');
      const level = () => root.querySelector('[data-page="zoomlevel"]')?.textContent;
      const k = () => Number(/scale\(([\d.]+)\)/.exec(body.style.transform)?.[1]) || 0;
      const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const read = () => ({ k: k(), pill: pill.classList.contains('hidden'), level: level(),
                            shellW: parseFloat(shell.style.width), scrollWidth: pane.scrollWidth, clientWidth: pane.clientWidth });
      const before = read();
      const r = pane.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + 200;
      // Two fingers, as the browser reports them: Touch objects on a
      // TouchEvent, cancelable, since the pane's handler has to be able to
      // take the gesture away from the browser.
      const touch = (type, pts) => {
        const touches = pts.map(([id, x, y]) => new Touch({ identifier: id, target: pane, clientX: x, clientY: y }));
        const ev = new TouchEvent(type, { touches: type === 'touchend' ? [] : touches, changedTouches: touches,
                                          targetTouches: touches, bubbles: true, cancelable: true });
        pane.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      const took = touch('touchstart', [[1, cx - 40, cy], [2, cx + 40, cy]]);
      touch('touchmove', [[1, cx - 80, cy], [2, cx + 80, cy]]);
      await frame();
      const during = read();
      touch('touchend', [[1, cx - 80, cy], [2, cx + 80, cy]]);
      await frame();
      const pinched = { ...read(), willChange: body.style.willChange };
      pane.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, deltaMode: 0, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      await frame();
      const wheeled = read();
      root.querySelector('[data-page="zoomreset"]').click();
      await frame();
      const reset = read();
      const api = [...document.querySelectorAll('*')].map(e => e.__doc).find(Boolean);
      return { took, before, during, pinched, wheeled, reset, apiZoom: api?.zoom?.() };
    });
    ok('the pill is hidden at fit width', zoomed.before.pill === true, JSON.stringify(zoomed.before));
    ok('the two-finger touchstart is taken from the browser', zoomed.took === true, String(zoomed.took));
    ok('the pinch doubles the scale while the fingers are still down',
       Math.abs(zoomed.during.k / zoomed.before.k - 2) < 0.05 && zoomed.during.level === '200%',
       JSON.stringify({ before: zoomed.before, during: zoomed.during }));
    ok('and the shell grew with it, so the page scrolls sideways rather than being clipped',
       Math.abs(zoomed.during.shellW / zoomed.before.shellW - 2) < 0.05 && zoomed.during.scrollWidth > zoomed.during.clientWidth,
       JSON.stringify(zoomed.during));
    ok('lifting the fingers keeps the scale and drops the layer promotion',
       Math.abs(zoomed.pinched.k - zoomed.during.k) < 0.001 && zoomed.pinched.willChange === '' && zoomed.pinched.pill === false,
       JSON.stringify(zoomed.pinched));
    ok('a ctrl-wheel down zooms out', zoomed.wheeled.k < zoomed.pinched.k, JSON.stringify(zoomed.wheeled));
    ok('tapping the pill returns to fit width and hides it',
       Math.abs(zoomed.reset.k - zoomed.before.k) < 0.001 && zoomed.reset.pill === true, JSON.stringify(zoomed.reset));
    ok('__doc reports the zoom', zoomed.apiZoom === 1, JSON.stringify(zoomed.apiZoom));
  }

  // --dump: what each page carries, for a real file whose header or footer
  // came out differently from Word's.
  if (opt('--dump') !== null || args.includes('--dump')) {
    const pages = await page.evaluate(() => [...document.querySelectorAll('[data-page="root"] section[class^="wd"]')].map((s, i) => ({
      page: i + 1,
      header: (s.querySelector('header')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      headerImgs: s.querySelectorAll('header img').length,
      imgs: [...s.querySelectorAll('header img')].map(img => {
        const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top),
                 natural: img.naturalWidth + 'x' + img.naturalHeight, complete: img.complete, src: (img.getAttribute('src') || '').slice(0, 12),
                 pos: cs.position, display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
                 style: (img.getAttribute('style') || '').slice(0, 160), cssW: cs.width, cssMaxW: cs.maxWidth,
                 parent: img.parentElement?.tagName + '.' + (img.parentElement?.className || '') + ' ' + (img.parentElement?.getAttribute('style') || '').slice(0, 120) };
      }),
      headerBox: (() => { const h = s.querySelector('header'); if (!h) return null; const r = h.getBoundingClientRect(), sr = s.getBoundingClientRect(), a = s.querySelector('article')?.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top - sr.top), bodyTop: a ? Math.round(a.top - sr.top) : null,
                 marginTop: getComputedStyle(h).marginTop, minHeight: getComputedStyle(h).minHeight,
                 paras: [...h.querySelectorAll('p')].map(p => { const pr = p.getBoundingClientRect(); return Math.round(pr.height) + '@' + Math.round(pr.top - sr.top); }) }; })(),
      footer: (s.querySelector('footer')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      body: (s.querySelector('article')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      bodyEnd: (s.querySelector('article')?.innerText || '').replace(/\s+/g, ' ').trim().slice(-60),
      box: { h: Math.round(s.getBoundingClientRect().height), content: s.scrollHeight, clipped: s.scrollHeight > s.clientHeight + 1,
             article: s.querySelector('article')?.scrollHeight, minH: getComputedStyle(s).minHeight, height: getComputedStyle(s).height },
    })));
    for (const p of pages) console.log('  page', JSON.stringify(p));
  }

  if (shot) {
    // --pinch <factor>: zoom the page about its centre before the shot, so a
    // picture can show the pill and the sideways scroll a zoomed page grows.
    const pinch = Number(opt('--pinch') || 0);
    if (pinch > 0) {
      await page.evaluate((f) => {
        const api = [...document.querySelectorAll('*')].map(e => e.__doc).find(Boolean);
        api?.setZoom?.(f);
      }, pinch);
      await page.waitForTimeout(300);
    }
    const pane = await page.$('[data-page="root"]');
    if (pane) await pane.screenshot({ path: shot });
    else await page.screenshot({ path: shot });
    console.log(`  shot  ${shot}`);
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
