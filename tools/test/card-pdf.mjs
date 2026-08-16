#!/usr/bin/env node
// A PDF among a branch's changed files, in the card that reviews it.
//
//   node tools/test/card-pdf.mjs
//
// alpineComponents/file-review.js classifies by extension and had no PDF case,
// so one fell past every named kind to the NUL sniff and reported itself as a
// binary: "a stated fact and the exits, and never the bytes". True, and the
// least useful true thing the card could say. The estate learned to render
// PDFs in the viewer, in data-view and in pdf-inspect first, which left the
// review surface the last place a PDF was unreadable.
//
// Checked in a browser because the interesting half cannot be checked anywhere
// else: whether a page is actually rasterized into the card's canvas. The node
// suite covers the classification, the pane order and the handoff address.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = 'mehrlander/web-tools';
const PDF = 'docs/fixtures/report.pdf';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 3; i++) {
  const pg = doc.addPage([612, 792]);
  pg.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });
  pg.drawText(`Decision Package ${i}`, { x: 60, y: 700, size: 20, font, color: rgb(0, 0, 0) });
}
const BYTES = Buffer.from(await doc.save());

const vendored = {
  '/vendor/pdf.min.js': path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.js'),
  '/vendor/pdf.worker.min.js': path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js'),
};
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  if (vendored[rel]) { res.writeHead(200, {'content-type':'text/javascript'});
    return res.end(await readFile(vendored[rel])); }
  try { res.writeHead(200, {'content-type': typeFor(rel)});
    res.end(await readFile(path.join(root, rel.replace(/^\//, '')))); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const kit = (await readFile(path.join(root, 'lib', 'kits', 'pdf.js'), 'utf8'))
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js/, `${origin}/vendor/pdf.min.js`)
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js/, `${origin}/vendor/pdf.worker.min.js`);
const json = (b) => JSON.stringify({ content: b.toString('base64'), encoding: 'base64',
  size: b.length, sha: 'x'.repeat(40), html_url: 'https://example.invalid' });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const api = `https://api.github.com/repos/${REPO}/contents/`;
  const want = decodeURIComponent(url.split('?')[0]);
  if (want.startsWith(api + PDF)) return route.fulfill({status:200, contentType:'application/json', body: json(BYTES)});
  if (url.startsWith(api + 'lib/kits/pdf.js')) return route.fulfill({status:200, contentType:'application/json', body: json(Buffer.from(kit))});
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({status:200, contentType:r.contentType, body:''});
  return route.fulfill({status:200, contentType:r.contentType, body:r.body});
});
page.on('pageerror', e => console.log('  [pageerror] ' + e.message));

await page.goto(`${origin}/pages/review.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(({ repo, p }) => {
  const host = document.querySelector('[x-data]');
  const app = Alpine.$data(host);
  app.files = [{ repo, ref: 'main', base: 'main', baseName: 'main', path: p, status: 'added', open: true }];
}, { repo: REPO, p: PDF });
await page.waitForTimeout(6000);

const out = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  let ink = 0;
  if (c && c.width) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) if (d[i+3] > 0 && (d[i] < 200 || d[i+1] < 200 || d[i+2] < 200)) ink++;
  }
  const note = [...document.querySelectorAll('span')].map(s => s.textContent.trim())
    .find(t => /page/.test(t) && /KB|pages/.test(t)) || '';
  const tabs = [...document.querySelectorAll('[role=tablist] a')].map(a => a.textContent.trim());
  const card = [...document.querySelectorAll('[x-data^="fileReview"]')][0];
  const d = card && Alpine.$data(card);
  return { canvasW: c?.width || 0, ink, note, tabs,
    kind: d?.kind, tab: d?.tab, loaded: d?.loaded, err: d?.error,
    pages: d?.pdfPages, pdfNote: d?.pdfNote,
    bytes: d?._pdfBytes ? d._pdfBytes.length : null,
    hasRef: !!d?.$refs?.pdfCanvas, kitLoaded: !!window.pdf,
    hasDraw: typeof d?._drawPdf, shown: d?.shownPane, drawing: d?._drawing };
});
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

ok('the card calls it a pdf, not a binary', out.kind === 'pdf', String(out.kind));
ok('and opens on the page pane', out.tab === 'page' && out.shown === 'page', JSON.stringify(out));
ok('the bytes are held, not decoded to a string', out.bytes > 0, String(out.bytes));
ok('a page is rasterized into the card', out.ink > 200 && out.canvasW > 300,
   `ink=${out.ink} w=${out.canvasW}`);
ok('the note states the page count and the real size',
   /^3 pages · \d+(\.\d+)? KB/.test(out.pdfNote), out.pdfNote);

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
