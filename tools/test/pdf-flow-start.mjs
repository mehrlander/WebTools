#!/usr/bin/env node
// pdf.flow's `start` lands on the requested page of a document whose pages
// are not all the same shape.
//
//   node tools/test/pdf-flow-start.mjs
//
// The flow reserves every page's height from page 1's ratio, scrolls to the
// requested page against that estimate, and corrects the shapes that differ
// in a background pass it does not await. Every correction re-anchored on the
// page it thought the reader was on, which it had read off the estimate, so
// the drift survived the very pass that should have removed it. Measured from
// mehrlander/home on 2026-08-29: OFM's 98-page Part 1 opened at `start: 52`
// on page 35, and stayed there.
//
// The kit alone lands correctly: opened on OFM's Part 1 and on the fixture
// below, `start: 52` arrived on 52 before this change. What loses the request
// is the host's conditions, and one of them is reproducible here: a column
// mounted into a host that has no geometry yet (a tab not shown, a pane not
// laid out) reads every offset as 0 and its page as the LAST one, and every
// later re-anchor kept that reading. So the request is now held as a page
// number and read by every re-anchor until the reader moves.
//
// Four claims:
//
//   1. a deep `start` in a mixed-shape document lands on that page and holds
//      it through the size pass
//   2. `start: 0` stays on page 0
//   3. the request lets go once the reader takes the column: a wheel and then
//      a relayout leave the reader where they scrolled, not back on `start`
//   4. a column mounted into a hidden host lands on `start` once the host is
//      shown, rather than on the last page (this one failed before)
//
// A generated fixture, because the answer key has to be known: 60 pages, the
// first twenty US Letter, the next twenty landscape (shorter at fit width),
// the last twenty tall (longer). The estimate from page 1 is wrong for two
// thirds of the document, in both directions.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

const SHAPES = [[612, 792], [792, 612], [612, 1100]];
const PAGES = 60;
const build = async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < PAGES; i++) {
    const [w, h] = SHAPES[Math.floor(i / 20)];
    const pg = doc.addPage([w, h]);
    pg.drawText(`p${i + 1}`, { x: 40, y: h / 2, size: 36, font, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
};
const fixture = await build();

const vendored = {
  '/vendor/pdf.min.js': path.join(root, 'node_modules/pdfjs-dist/build/pdf.min.js'),
  '/vendor/pdf.worker.min.js': path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'),
};
// The classes the flow relies on for its geometry, and nothing else: no
// Tailwind on this page, so the column is laid out by these five rules alone.
const html = `<!doctype html><html><head><style>
  body{margin:0}
  #host{position:relative;width:800px;height:600px}
  .viewer-pdf-flow{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden}
  .viewer-pdf-slot{position:relative;overflow:hidden;background:#fff}
</style></head><body><div id="host"></div><script src="/kit.js"></script></body></html>`;

const server = http.createServer((req, res) => {
  const rel = req.url.split('?')[0];
  if (vendored[rel]) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(readFileSync(vendored[rel])); }
  if (rel === '/doc.pdf') { res.writeHead(200, { 'content-type': 'application/pdf' }); return res.end(fixture); }
  if (rel === '/kit.js') {
    const src = readFileSync(path.join(root, 'lib/kits/pdf.js'), 'utf8')
      .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js/, `${origin}/vendor/pdf.min.js`)
      .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js/, `${origin}/vendor/pdf.worker.min.js`);
    res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(src);
  }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', e => { console.log(`  [pageerror] ${e.message}`); failures.push('pageerror'); });

// Mount the flow on the fixture at `start`, wait for the size pass to run its
// course, and report where the column is.
const openAt = (start) => page.evaluate(async (start) => {
  const host = document.getElementById('host');
  host.replaceChildren();
  const bytes = new Uint8Array(await (await fetch('/doc.pdf')).arrayBuffer());
  const look = await window.pdf.firstLook(bytes);
  window.__mount = await window.pdf.flow(look, host, { start });
  await new Promise(r => setTimeout(r, 2500));
}, start);
const state = () => page.evaluate(() => {
  const m = window.__mount, box = m.scroller;
  const slot = box.querySelector(`[data-page="${m.active() + 1}"]`);
  const b = box.getBoundingClientRect(), s = slot.getBoundingClientRect();
  return { active: m.active(), scrollTop: Math.round(box.scrollTop),
           slotTop: Math.round(s.top - b.top), height: box.scrollHeight };
});

try {
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.pdf);

  console.log('a 60-page document of three shapes, opened deep:');
  await openAt(50);
  let s = await state();
  ok('the column reserved and corrected the real heights', s.height > 20000, `scrollHeight=${s.height}`);
  ok('start: 50 is on page 50 after the size pass', s.active === 50, JSON.stringify(s));
  ok('and the page sits at the top of the pane', Math.abs(s.slotTop) <= 2, JSON.stringify(s));

  console.log('\nopened at the start:');
  await openAt(0);
  s = await state();
  ok('start: 0 is on page 0', s.active === 0 && s.scrollTop === 0, JSON.stringify(s));

  console.log('\nthe reader takes the column, then the layout is corrected:');
  await openAt(10);
  const before = await state();
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(400);
  const moved = await state();
  ok('a wheel moved the reader off the requested page', moved.active > before.active, JSON.stringify(moved));
  await page.evaluate(() => window.__mount.relayout());
  await page.waitForTimeout(200);
  s = await state();
  ok('a relayout keeps the reader where they scrolled', s.active === moved.active,
     `relayout went to ${s.active}, reader was on ${moved.active}`);

  console.log('\nmounted into a host with no geometry, shown afterwards:');
  s = await page.evaluate(async () => {
    const host = document.getElementById('host');
    host.replaceChildren();
    host.style.display = 'none';
    const bytes = new Uint8Array(await (await fetch('/doc.pdf')).arrayBuffer());
    const look = await window.pdf.firstLook(bytes);
    window.__mount = await window.pdf.flow(look, host, { start: 40 });
    await new Promise(r => setTimeout(r, 300));
    host.style.display = '';
    await new Promise(r => setTimeout(r, 2500));
    const m = window.__mount, box = m.scroller;
    return { active: m.active(), scrollTop: Math.round(box.scrollTop), height: box.scrollHeight };
  });
  ok('start: 40 is on page 40 once the host has a layout', s.active === 40, JSON.stringify(s));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nall claims hold');
