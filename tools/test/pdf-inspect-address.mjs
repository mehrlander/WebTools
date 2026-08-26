#!/usr/bin/env node
// The workbench's address, and the page it opens on.
//
//   node tools/test/pdf-inspect-address.mjs
//
// `pages/pdf-inspect.html` takes a document apart one page at a time: its
// overlays (text containers, characters, rules, columns, lattice cells) all
// describe the page it is showing. So a link into it from a surface that has a
// reading position ought to carry that position, and from 2026-08-25 the
// viewer's pdf mode does: its magnifier hands over `#gh=<addr>&page=<n>` for
// the page under the reader's thumb.
//
// That link is a promise about THIS page, which is why the check lives here
// rather than beside the viewer. Until the page learned `page=` it opened on
// page 1 whatever the link said, and nothing anywhere would have noticed: a
// handoff that silently drops what it was given looks identical to one that
// was never asked for anything.
//
// Three claims:
//   1. `&page=n` in the hash opens on page n
//   2. a page past the end lands on the last page rather than failing the load
//   3. no page in the address still means page 1
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
const REPO = 'mehrlander/web-tools';
const FIXTURE = 'docs/fixtures/inspect-eight.pdf';

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 8; i++) {
  const pg = doc.addPage([612, 792]);
  pg.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });
  pg.drawText(`page ${i}`, { x: 60, y: 400, size: 40, font, color: rgb(0, 0, 0) });
}
const BYTES = Buffer.from(await doc.save());

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
    const body = await readFile(path.join(root, rel.replace(/^\/+/, '')));
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const api = `https://api.github.com/repos/${REPO}/contents/`;
  const want = decodeURIComponent(url.split('?')[0]);
  if (want.startsWith(api + FIXTURE)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: contentsJson(BYTES) });
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

const openAt = async (hash) => {
  await page.goto(`${origin}/pages/pdf-inspect.html#gh=${REPO}@main:${FIXTURE}${hash}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  return page.evaluate(() => {
    const host = document.querySelector('[x-data]');
    const d = window.Alpine.$data(host);
    return { pageNum: d.pageNum, numPages: d.numPages, error: d.error || '' };
  });
};

try {
  console.log('the workbench opens where the address says:');
  let s = await openAt('&page=6');
  ok('the document loaded', s.numPages === 8 && !s.error, JSON.stringify(s));
  ok('and it opened on page 6', s.pageNum === 6, JSON.stringify(s));

  s = await openAt('&page=99');
  ok('a page past the end lands on the last one', s.pageNum === 8, JSON.stringify(s));
  ok('rather than failing the load', s.numPages === 8 && !s.error, JSON.stringify(s));

  s = await openAt('');
  ok('and no page still means page 1', s.pageNum === 1, JSON.stringify(s));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} failure(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nall checks passed');
