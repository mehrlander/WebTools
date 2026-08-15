#!/usr/bin/env node
// The viewer's pdf module: the FIRST LOOK at a PDF, wherever the viewer mounts.
//
//   node tools/test/viewer-pdf.mjs
//
// The second module that cannot work from the text it was handed. A PDF decoded
// as UTF-8 is not merely lossy, it is actively misleading: it yields a screenful
// of the format's own object syntax interleaved with replacement characters,
// which reads as a corrupted file rather than as a viewer that never tried. That
// is what this estate showed for every PDF in every repo it browsed until
// 2026-08-15, and it is the failure these checks exist to keep from returning.
//
// Four claims:
//   1. a repo PDF renders, from bytes fetched at the addressed ref
//   2. it OPENS in the pdf mode, over the host's blanket defaultMode, which is
//      what `exclusive` buys and what raw would otherwise take
//   3. the header states the page count and the real byte size, neither of
//      which is derivable from the text the host holds
//   4. the pager moves, and the handoff to pages/pdf-inspect.html carries the
//      file's own address
//
// The fixture is BUILT HERE with pdf-lib rather than committed: a checked-in
// binary would be a tracked artifact nothing regenerates, and two pages of
// known size is the whole requirement. It is served through an intercepted
// contents API, so nothing is written into the working tree either.
//
// pdf.js and its worker come from node_modules and are re-pointed onto this
// server's origin, the same move tools/test/pdf-kit-browser.mjs makes and for
// the same two reasons: jsDelivr is blocked in the sandbox, and a Worker cannot
// be constructed from a cross-origin URL, so a routed CDN address would quietly
// demote pdf.js to its main-thread fallback and test something else.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile, readFileSync } from 'node:fs';
import { readFile as read } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = 'mehrlander/web-tools';
const FIXTURE = 'docs/fixtures/two-page.pdf';   // never on disk; intercepted below

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// ── the fixture ─────────────────────────────────────────────────────────────
// Two pages so the pager has somewhere to go, and each page says which one it
// is, so "the canvas repainted" is checkable as pixels rather than as a label.
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const [i, word] of ['FIRST', 'SECOND'].entries()) {
  const page = doc.addPage([400, 300]);
  page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(1, 1, 1) });
  page.drawText(word, { x: 40, y: 150, size: 48, font, color: rgb(0, 0, 0) });
  page.drawText(`page ${i + 1}`, { x: 40, y: 100, size: 14, font, color: rgb(0.3, 0.3, 0.3) });
}
const FIXTURE_BYTES = Buffer.from(await doc.save());

// pdf.js, re-pointed at this origin so the worker is same-origin.
const vendored = {
  '/vendor/pdf.min.js': path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.js'),
  '/vendor/pdf.worker.min.js': path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js'),
};

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  if (vendored[rel]) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(readFileSync(vendored[rel]));
  }
  try {
    const body = await read(path.join(root, rel.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': typeFor(rel) });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// The kit as it sits on disk, with its three CDN pins moved onto this origin.
// pdf-lib is left pointing at the CDN deliberately: this module must never
// reach for it, and a request for it here would be the loudest possible way to
// find out that the loader split regressed.
const kitSource = (await read(path.join(root, 'lib', 'kits', 'pdf.js'), 'utf8'))
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js/, `${origin}/vendor/pdf.min.js`)
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js/, `${origin}/vendor/pdf.worker.min.js`);

const contentsJson = (buf) => JSON.stringify({
  content: buf.toString('base64'), encoding: 'base64',
  size: buf.length, sha: 'x'.repeat(40), html_url: 'https://example.invalid',
});

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });

let askedForPdfLib = false;
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.includes('pdf-lib')) askedForPdfLib = true;
  if (url.startsWith(origin)) return route.continue();

  // Our two intercepts sit ahead of the working-tree stand-in: the fixture has
  // no file behind it, and the kit needs its CDN pins moved.
  const api = `https://api.github.com/repos/${REPO}/contents/`;
  if (url.startsWith(api + FIXTURE)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: contentsJson(FIXTURE_BYTES) });
  }
  if (url.startsWith(api + 'lib/kits/pdf.js')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: contentsJson(Buffer.from(kitSource)) });
  }

  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

// What the viewer settled on, and what the canvas actually holds. `ink` counts
// non-white pixels: the only proof that a page was rasterized rather than a
// correctly-sized blank canvas being left in place, which is what every
// failure mode here looks like from the outside.
const state = () => page.evaluate(() => {
  const host = document.getElementById('dv-viewer');
  const v = host && Alpine.$data(host);
  const canvas = document.getElementById('viewer-pdf-canvas');
  const msg = document.getElementById('viewer-pdf-msg');
  const bar = document.getElementById('viewer-pdf-bar');
  const open = document.getElementById('viewer-pdf-open');
  let ink = 0;
  if (canvas && canvas.width) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    // Alpha first. An untouched canvas is transparent BLACK, so a plain
    // darkness test scores a blank 300x150 default canvas as a full page of
    // ink, which is how this check first passed while nothing had rendered.
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0 && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) ink++;
    }
  }
  return {
    mode: v?.mode || null,
    modes: (v?.availableModes || []).map(m => m.id),
    stats: v?.stats || '',
    w: canvas?.width || 0,
    shown: canvas ? !canvas.classList.contains('hidden') : false,
    msg: msg && !msg.classList.contains('hidden') ? msg.textContent.trim() : '(gone)',
    barShown: bar ? !bar.classList.contains('hidden') : false,
    label: document.getElementById('viewer-pdf-page')?.textContent || '',
    openHref: open && !open.classList.contains('hidden') ? open.getAttribute('href') : '',
    ink,
  };
});

try {
  console.log('a repo PDF addressed through data-view:');
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:${FIXTURE}`)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  let s = await state();

  ok('the pdf mode is available', (s.modes || []).includes('pdf'), JSON.stringify(s.modes));
  ok('and it is what opened', s.mode === 'pdf', JSON.stringify(s));
  ok('raw is still offered beside it', (s.modes || []).includes('raw'), JSON.stringify(s.modes));
  ok('the canvas is showing', s.shown === true && s.msg === '(gone)', JSON.stringify(s));
  ok('a page was actually rasterized', s.ink > 200, `ink=${s.ink}`);
  ok('the header states the page count', /^2 pages/.test(s.stats), s.stats);
  ok('and the real byte size', /· \d+\.\d KB$/.test(s.stats), s.stats);
  ok('with no line count, which a PDF has none of', !/lines/.test(s.stats), s.stats);
  ok('pdf-lib was never requested', askedForPdfLib === false,
     'the viewer pulled the editor library it never calls');

  console.log('the pager and the handoff:');
  ok('the bar is showing', s.barShown === true, JSON.stringify(s));
  ok('the pager reads page 1 of 2', s.label.replace(/\s/g, '') === '1/2', s.label);
  ok('the inspect link carries this file\'s address',
     s.openHref.endsWith(`#gh=${REPO}@main:${FIXTURE}`), s.openHref);
  ok('and points at the inspector', s.openHref.includes('/pages/pdf-inspect.html'), s.openHref);

  const inkOne = s.ink;
  await page.click('#viewer-pdf-next');
  await page.waitForTimeout(1200);
  s = await state();
  ok('next moves the pager', s.label.replace(/\s/g, '') === '2/2', s.label);
  ok('and repaints the canvas', s.ink > 200 && s.ink !== inkOne, `${inkOne} -> ${s.ink}`);

  console.log('a text file is untouched by any of this:');
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:docs/tools.json`)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  s = await state();
  ok('no pdf mode is offered', !(s.modes || []).includes('pdf'), JSON.stringify(s.modes));
  ok('and the default still decides', s.mode === 'tree', JSON.stringify(s));
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
