#!/usr/bin/env node
// More than one viewer on a page, which is what the stage reader does.
//
//   node tools/test/viewer-many.mjs
//
// swipe-deck builds the reader's slide AND its neighbours, and each slide of
// the stage reader mounts its own `viewer`. So from 2026-08-18, when the reader
// became a deck, this estate has had two and three viewers alive at once, and
// every mode module was still written for exactly one:
//
//   - it found its own markup with document.getElementById, a page-wide
//     question with one answer, so the SECOND viewer rendered into the FIRST
//     one's DOM;
//   - it guarded its awaits with a counter on the ViewRegistry, a singleton, so
//     mounting a second viewer cancelled the first mid-fetch.
//
// Together those produce a screen that is wrong in a way nothing throws about:
// slide 0's header names document A while its pager, its byte size and its
// canvas all belong to document B, and slide 1 sits on "Reading the PDF…" for
// as long as you care to wait. Reported from a phone, 2026-08-23, against a
// stage of eight DRS budget submittals.
//
// Three fixtures with DIFFERENT page counts, because the page count is the
// cheapest way to catch a slide showing the wrong document: a pager reading
// "1 / 4" over a six-page file names the intruder without any pixel work. The
// ink check is still here for the one failure this cannot see, a canvas of the
// right size that nothing drew into.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = 'app/index.html';
const REPO = 'mehrlander/web-tools';

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// Each page says which document and which page it is, so "the right canvas" is
// checkable as drawn pixels rather than only as a label.
const build = async (pages, tag) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const pg = doc.addPage([400, 300]);
    pg.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(1, 1, 1) });
    pg.drawText(`${tag}-p${i}`, { x: 30, y: 150, size: 40, font, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
};
const FIXTURES = [
  { path: 'docs/fixtures/many-a.pdf', pages: 6, bytes: await build(6, 'A') },
  { path: 'docs/fixtures/many-b.pdf', pages: 4, bytes: await build(4, 'B') },
  { path: 'docs/fixtures/many-c.pdf', pages: 2, bytes: await build(2, 'C') },
];

// pdf.js from node_modules, re-pointed onto this origin so the worker is
// same-origin: a cross-origin Worker cannot be constructed, and pdf.js would
// quietly fall back to the main thread and test something else.
const vendored = {
  '/vendor/pdf.min.js': path.join(root, 'node_modules/pdfjs-dist/build/pdf.min.js'),
  '/vendor/pdf.worker.min.js': path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'),
};
const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  if (vendored[rel]) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(readFileSync(vendored[rel]));
  }
  try {
    const body = await readFile(path.join(root, rel.replace(/^\/+/, '') || PAGE));
    res.writeHead(200, { 'content-type': typeFor(rel) });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const kitSource = (await readFile(path.join(root, 'lib/kits/pdf.js'), 'utf8'))
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js/, `${origin}/vendor/pdf.min.js`)
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js/, `${origin}/vendor/pdf.worker.min.js`);
const contentsJson = (buf) => JSON.stringify({
  content: buf.toString('base64'), encoding: 'base64',
  size: buf.length, sha: 'x'.repeat(40), html_url: 'https://example.invalid',
});

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const api = `https://api.github.com/repos/${REPO}/contents/`;
  const want = decodeURIComponent(url.split('?')[0]);
  for (const f of FIXTURES) {
    if (want.startsWith(api + f.path)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: contentsJson(f.bytes) });
    }
  }
  if (url.startsWith(api + 'lib/kits/pdf.js')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: contentsJson(Buffer.from(kitSource)) });
  }
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => { console.log(`  [pageerror] ${e.message}`); failures.push('pageerror'); });

try {
  await page.goto(`${origin}/${PAGE}?view=stage`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[x-data*="stager"]', { timeout: 30000 });
  await page.evaluate((paths) => {
    window.Alpine.store('browser').stage = paths.map(p => ({ repo: 'mehrlander/web-tools', ref: '', path: p }));
    window.__data = window.Alpine.$data(document.querySelector('[x-data*="stager"]'));
  }, FIXTURES.map(f => f.path));
  await page.evaluate(() => window.__data.readerAt(0, 'file'));
  await page.waitForTimeout(6000);

  // Every slide the deck has built, read through its OWN subtree. Reading any
  // of it with document.getElementById is what the bug did, so the check
  // cannot: a probe that resolves globally passes on the broken build.
  const slides = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-reader-slide]')].map(s => {
      const r = s.querySelector('[data-pdf="root"]');
      const msg = r?.querySelector('[data-pdf="msg"]');
      const cv = r?.querySelector('canvas.viewer-pdf-page');
      let ink = 0;
      if (cv && cv.width) {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        // Alpha first: an untouched canvas is transparent BLACK, so a plain
        // darkness test scores a blank canvas as a full page of ink.
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) ink++;
        }
      }
      return {
        i: Number(s.getAttribute('data-reader-slide')),
        settled: msg ? msg.classList.contains('hidden') : false,
        // ONE mounted flow per viewer, whichever flow it is. This counted
        // `.sd-track` while the pdf module always built a horizontal deck;
        // it now reads the flow's own scroller, so the claim (no viewer
        // renders a second document's pages into this one's DOM) survives
        // the default moving to a continuous column.
        flows: r ? r.querySelectorAll('.sd-track, .viewer-pdf-flow').length : 0,
        label: r?.querySelector('[data-pdf="page"]')?.textContent?.trim() ?? '',
        deckCount: r?.__pdfFlow?.count ?? 0,
        ink,
      };
    });
  });

  ok('the deck built more than one viewer', slides.length > 1, `${slides.length} slide(s)`);
  for (const s of slides) {
    const want = FIXTURES[s.i];
    if (!want) continue;
    ok(`slide ${s.i} finished loading`, s.settled, JSON.stringify(s));
    ok(`slide ${s.i} holds exactly one page flow`, s.flows === 1, `${s.flows} flow(s)`);
    ok(`slide ${s.i} pages ITS OWN document (${want.pages} pages)`,
       s.deckCount === want.pages && s.label === `1 / ${want.pages}`,
       `deck ${s.deckCount}, label "${s.label}"`);
    ok(`slide ${s.i} rasterized a page`, s.ink > 200, `${s.ink} inked pixels`);
  }

  // And the pager drives the deck the reader is actually looking at. Before the
  // fix this arrow moved a deck in a different slide, so the button worked, the
  // label moved, and the page on screen did not.
  const step = await page.evaluate(async () => {
    const r = document.querySelector('[data-reader-slide="0"] [data-pdf="root"]');
    // The column's own scroller, read from the handle. This used to name
    // `.sd-track` and `scrollLeft`: pages moved sideways then.
    const pos = () => r.__pdfFlow.scroller.scrollTop;
    const before = pos();
    r.querySelector('[data-pdf="next"]').click();
    await new Promise(res => setTimeout(res, 1200));
    return { before, after: pos(),
             label: r.querySelector('[data-pdf="page"]').textContent.trim() };
  });
  ok('the next arrow moves the slide\'s own flow', step.after > step.before, JSON.stringify(step));
  ok('and its own counter follows', step.label === '2 / 6', step.label);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} failure(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nall checks passed');
