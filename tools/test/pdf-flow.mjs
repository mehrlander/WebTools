#!/usr/bin/env node
// A PDF read INSIDE a deck of documents, which is where the axis question is
// decided.
//
//   node tools/test/pdf-flow.mjs
//
// The stage reader is a horizontal deck of staged files, and each of its
// slides mounts a viewer. While the pdf module paged its document on a
// horizontal track too, that put a horizontal deck inside a horizontal deck,
// and the inner one carries `overscroll-x-contain`. The result was one gesture
// with two meanings decided by what your thumb was over, and worse, by how
// many pages the file happened to have: on a multi-page document the swipe was
// captured and there was no gesture at all that reached the next document,
// while on a single-page one the track is not a scroll container and the same
// swipe chained straight through. Reported from a phone against a stage of
// eight DRS budget submittals, 2026-08-23.
//
// So the claims here are about GESTURE MEANING, not about layout:
//
//   1. sideways over a page reaches the document deck, from the middle of a
//      document and not only from its first page
//   2. down over a page moves the pages and leaves the document deck alone
//   3. each document still pages itself (the neighbour's pager is not driven)
//   4. the header toggle brings the horizontal deck back, and with it the
//      captured gesture: this is the comparison the toggle exists for, and
//      asserting the old behaviour is how the two stay honestly comparable
//   5. the choice survives a reload
//
// A wheel rather than a thumb: Playwright's touchscreen only taps, and
// `overscroll-behavior` governs scroll chaining for both, so a horizontal
// wheel tests the same rule the swipe would meet.
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

// Letter-shaped pages, not the 400x300 the other pdf checks use. The aspect
// ratio is load-bearing here: a page fitted to the width of a wide bench is
// TALLER than the pane, which is the case where a vertical snap deck would
// have reproduced the very defect this replaces, and the case a continuous
// column has to handle without an inner scroller.
const build = async (pages, tag) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const pg = doc.addPage([612, 792]);
    pg.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });
    pg.drawText(`${tag}-p${i}`, { x: 60, y: 400, size: 48, font, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
};
const FIXTURES = [
  { path: 'docs/fixtures/flow-a.pdf', pages: 6, bytes: await build(6, 'A') },
  { path: 'docs/fixtures/flow-b.pdf', pages: 4, bytes: await build(4, 'B') },
  { path: 'docs/fixtures/flow-c.pdf', pages: 2, bytes: await build(2, 'C') },
];

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

// Open the stage reader over the three documents, exactly as viewer-many does.
const openReader = async () => {
  await page.goto(`${origin}/${PAGE}?view=stage`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[x-data*="stager"]', { timeout: 30000 });
  await page.evaluate((paths) => {
    window.Alpine.store('browser').stage = paths.map(p => ({ repo: 'mehrlander/web-tools', ref: '', path: p }));
    window.__data = window.Alpine.$data(document.querySelector('[x-data*="stager"]'));
  }, FIXTURES.map(f => f.path));
  await page.evaluate(() => window.__data.readerAt(0, 'file'));
  await page.waitForTimeout(6000);
};

// Where everything is: which document the reader deck is on, and how the
// viewer inside that document's slide is reading it.
const state = () => page.evaluate(() => {
  const slide = document.querySelector('[data-reader-slide]');
  const deck = slide ? slide.closest('.sd-track') : null;
  const docAt = deck ? Math.round(deck.scrollLeft / (deck.clientWidth || 1)) : -1;
  const here = document.querySelector(`[data-reader-slide="${docAt}"] [data-pdf="root"]`);
  const flow = here?.__pdfFlow || null;
  return {
    docAt,
    deckLeft: deck ? Math.round(deck.scrollLeft) : -1,
    kind: flow ? flow.kind : '',
    pageAt: flow ? flow.active() : -1,
    pages: flow ? flow.count : 0,
    label: here?.querySelector('[data-pdf="page"]')?.textContent?.trim() ?? '',
    pos: flow ? Math.round(flow.kind === 'page' ? flow.scroller.scrollLeft : flow.scroller.scrollTop) : -1,
  };
});

// A wheel delivered over the middle of the reading surface itself.
//
// The SURFACE, not a canvas. Aiming at `canvas.viewer-pdf-page` picks page 1,
// which is exactly where it should not aim: once the reader has scrolled, page
// 1 is above the viewport and its rect is negative, so the wheel lands on the
// header instead and the check reports "no chaining" when nothing was
// delivered. The scroller's own box is on screen by definition.
const overPage = async (dx, dy) => {
  const box = await page.evaluate(() => {
    const s = document.querySelector('[data-reader-slide]');
    const deck = s.closest('.sd-track');
    const at = Math.round(deck.scrollLeft / (deck.clientWidth || 1));
    const r = document.querySelector(`[data-reader-slide="${at}"] [data-pdf="root"]`)
      .__pdfFlow.scroller.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel(dx, dy);
  await page.waitForTimeout(700);
};

try {
  await openReader();
  let s = await state();
  console.log('the stage reader opens on the first document:');
  ok('on document 0', s.docAt === 0, JSON.stringify(s));
  ok('reading it continuously by default', s.kind === 'scroll', JSON.stringify(s));
  ok('with its own page count', s.label === '1 / 6', s.label);

  console.log('down over the page moves the PAGES, not the documents:');
  const deckBefore = s.deckLeft;
  await overPage(0, 1400);
  await overPage(0, 1400);
  s = await state();
  ok('the pager advanced', s.pageAt > 0, JSON.stringify(s));
  ok('and the document deck did not move', s.deckLeft === deckBefore && s.docAt === 0,
     `${deckBefore} -> ${s.deckLeft}`);

  console.log('sideways over the page moves the DOCUMENTS, from mid-document:');
  ok('the reader is genuinely mid-document first', s.pageAt >= 1, JSON.stringify(s));
  await overPage(1000, 0);
  await page.waitForTimeout(800);
  s = await state();
  ok('the deck advanced to the next document', s.docAt === 1, JSON.stringify(s));
  ok('which pages ITS own document', s.label === '1 / 4', s.label);
  ok('and reads continuously too', s.kind === 'scroll', s.kind);

  console.log('the toggle brings the horizontal deck back:');
  await page.evaluate(() => {
    document.querySelector('[data-reader-slide="1"] [data-pdf="flow"]').click();
  });
  await page.waitForTimeout(1200);
  s = await state();
  ok('the flow switched to page-at-a-time', s.kind === 'page', JSON.stringify(s));
  ok('on the same page of the same document', s.label === '1 / 4' && s.docAt === 1, JSON.stringify(s));

  // The comparison, stated as a fact rather than as a preference: in this flow
  // the page track captures the sideways gesture and the document deck cannot
  // be reached by it. That is the behaviour the default used to have
  // everywhere, and pinning it here is what keeps the two honestly comparable.
  console.log('and with it, the captured gesture the default no longer has:');
  const before = await state();
  await overPage(1000, 0);
  s = await state();
  ok('sideways now turns a page', s.pos > before.pos && s.docAt === 1, JSON.stringify(s));
  ok('and does not reach the document deck', s.docAt === before.docAt,
     `${before.docAt} -> ${s.docAt}`);

  console.log('the choice survives a reload:');
  await openReader();
  s = await state();
  ok('it reopens page-at-a-time', s.kind === 'page', JSON.stringify(s));
  // Back to the default, so this check leaves no state behind for the next one.
  await page.evaluate(() => {
    document.querySelector('[data-reader-slide="0"] [data-pdf="flow"]').click();
  });
  await page.waitForTimeout(900);
  s = await state();
  ok('and the toggle returns to continuous', s.kind === 'scroll', JSON.stringify(s));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} failure(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nall checks passed');
