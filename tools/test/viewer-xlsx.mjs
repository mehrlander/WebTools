#!/usr/bin/env node
// The viewer's workbook module, the second one that fetches or decodes its own
// bytes.
//
//   node tools/test/viewer-xlsx.mjs
//
// An .xlsx is a ZIP, so it shares the image module's problem and then adds one:
// the bytes have to survive the trip AND the thing inside them is a small
// filesystem that has to be walked before anything can be shown. Four claims,
// and the last two are the ones that would rot silently:
//
//   1. a workbook renders as a table rather than as replacement characters
//   2. it OPENS in the sheets mode over the host's blanket defaultMode, which
//      is what `exclusive` buys
//   3. the sheet tabs carry the workbook's DISPLAY names, in WORKBOOK order,
//      neither of which is the part-file order the ZIP is stored in
//   4. a date cell reads as a date, not as a five-digit serial
//
// The fixture is built here with jszip rather than committed, so no binary
// enters the tree and the workbook's internals are exactly what the assertions
// talk about. It is delivered as a data: URI inside a data-view envelope, which
// exercises the same `carried` branch a dropped or pasted file takes; the
// repo-fetch branch is the identical shape already covered by viewer-image.mjs.
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

// JSZip is the one dependency the local CDN shim cannot stand in for. jsDelivr
// SYNTHESIZES an ESM wrapper for a CJS package at `/+esm`; jszip ships only a
// CJS entry and a UMD bundle, so resolveCdn finds no ESM file and serves an
// empty module, and the kit's `await import()` lands on undefined. The kit
// checks for a global first, exactly so a page that already has JSZip does not
// fetch a second copy, so seeding the UMD bundle as that global is both the fix
// here and a real code path. What goes untested is the CDN import itself, which
// is a jsDelivr behaviour rather than one of ours.
const JSZIP_UMD = await readFile(path.join(root, 'node_modules/jszip/dist/jszip.min.js'), 'utf8');

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// --- the fixture ----------------------------------------------------------
//
// Budget is the FIRST sheet in the workbook and lives in sheet2.xml; Notes is
// second and lives in sheet1.xml. That inversion is the whole point of claim 3:
// if the module read part order, or read the number out of the filename, it
// would put these in the wrong order under the wrong names and every other
// assertion here would still pass.
const WORKBOOK = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Budget" sheetId="4" r:id="rId1"/>
    <sheet name="Notes" sheetId="9" r:id="rId2"/>
  </sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId2" Type=".../worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

// cellXfs index 1 is numFmtId 164, the custom yyyy-mm-dd.
const STYLES = `<?xml version="1.0"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>
  <cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs>
</styleSheet>`;

const SHARED = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Fund</t></si><si><t>Opened</t></si><si><t>600</t></si>
</sst>`;

// Budget: a header row of shared strings, then a row whose B cell is serial
// 45000 under the date format. 45000 is 2023-03-15.
const SHEET2 = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
  <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>45000</v></c></row>
</sheetData></worksheet>`;

// Notes: one inline string, the cell kind the kit used to drop entirely.
const SHEET1 = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>carried inline</t></is></c></row>
</sheetData></worksheet>`;

async function buildWorkbook() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="ct"/>');
  zip.file('xl/workbook.xml', WORKBOOK);
  zip.file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS);
  zip.file('xl/styles.xml', STYLES);
  zip.file('xl/sharedStrings.xml', SHARED);
  zip.file('xl/worksheets/sheet1.xml', SHEET1);
  zip.file('xl/worksheets/sheet2.xml', SHEET2);
  return zip.generateAsync({ type: 'base64' });
}

// --- harness --------------------------------------------------------------

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
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
await page.addInitScript({ content: JSZIP_UMD });
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

const state = () => page.evaluate(() => {
  const host = document.getElementById('dv-viewer');
  const v = host && Alpine.$data(host);
  const root = document.getElementById('viewer-xlsx');
  const tabs = root?.querySelector('#viewer-xlsx-tabs');
  const msg = root?.querySelector('#viewer-xlsx-msg');
  // Read the drawn grid rather than the data behind it: Tabulator having the
  // rows and Tabulator having painted them are different claims.
  const cells = [...(root?.querySelectorAll('.tabulator-cell') || [])].map(c => c.textContent.trim());
  return {
    mode: v?.mode || null,
    modes: (v?.availableModes || []).map(m => m.id),
    stats: v?.stats || '',
    tabs: [...(tabs?.children || [])].map(b => b.textContent.trim()),
    active: [...(tabs?.children || [])].findIndex(b => b.classList.contains('btn-active')),
    msg: msg ? msg.textContent.trim() : '(gone)',
    cells,
  };
});

try {
  const b64 = await buildWorkbook();
  const env = {
    kind: 'data-view/1',
    items: [{ name: 'ledger.xlsx', content: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + b64 }],
  };

  console.log('a workbook carried as a data URI:');
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
  await page.waitForTimeout(4500);

  const s = await state();
  ok('the sheets mode is available', (s.modes || []).includes('xlsx'), JSON.stringify(s.modes));
  ok('and it is what opened', s.mode === 'xlsx', JSON.stringify({ mode: s.mode, modes: s.modes }));
  ok('the loading line got out of the way', s.msg === '(gone)', s.msg);

  // Claim 3, both halves at once.
  ok('the tabs carry display names, in workbook order',
     JSON.stringify(s.tabs) === JSON.stringify(['Budget', 'Notes']), JSON.stringify(s.tabs));
  ok('the first sheet is the one selected', s.active === 0, String(s.active));

  // Claim 1 and claim 4.
  ok('shared strings resolved into the grid', s.cells.includes('Fund') && s.cells.includes('600'),
     JSON.stringify(s.cells));
  ok('the date cell reads as a date, not a serial',
     s.cells.includes('2023-03-15') && !s.cells.includes('45000'), JSON.stringify(s.cells));
  ok('nothing rendered as replacement characters', !s.cells.some(c => c.includes('�')),
     JSON.stringify(s.cells.filter(c => c.includes('�'))));
  ok('the header states sheets and bytes', /^2 sheets · \d+\.\d KB$/.test(s.stats), s.stats);

  console.log('switching to the second sheet:');
  await page.evaluate(() => document.querySelectorAll('#viewer-xlsx-tabs button')[1]?.click());
  await page.waitForTimeout(900);
  const t = await state();
  ok('the inline string survived', t.cells.includes('carried inline'), JSON.stringify(t.cells));
  ok('and the tab strip followed', t.active === 1, String(t.active));

  console.log('a text file is untouched by any of this:');
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent('mehrlander/web-tools@main:docs/tools.csv')}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const u = await state();
  ok('no sheets mode is offered', !(u.modes || []).includes('xlsx'), JSON.stringify(u.modes));
  ok('and the default still decides', u.mode === 'tree', JSON.stringify(u));
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
