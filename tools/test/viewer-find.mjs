#!/usr/bin/env node
// The viewer's pdf FIND: Ctrl+F over a canvas the browser's own find cannot
// read.
//
//   node tools/test/viewer-find.mjs [--shot out.png]
//
// A PDF page is rasterised to a canvas, so there is no DOM text for the
// browser's find to reach. The kit searches the extracted items instead
// (lib/kits/pdf.js `find`, and the lazy `lookAt().find`), and the reading
// column lays a highlight over the canvas where each match sits
// (`flow`'s find/findGo). This checks the whole path end to end in a browser,
// which the pure tools/test/pdf-find.test.mjs cannot: that one proves the
// search, this one proves the highlight lands and moves.
//
// Five claims:
//   1. the find affordance is present, and opening it reveals the input
//   2. a query highlights its matches: the count reads k/n and marks are drawn
//      over the page, one active
//   3. next moves the active match to the following hit
//   4. a query with no match says so and draws nothing
//   5. Ctrl+F opens find over the browser's native find, from the reader pane
//
// Fixture built here with pdf-lib, served through an intercepted contents API,
// pdf.js re-pointed onto this origin so its worker is same-origin, exactly as
// tools/test/viewer-pdf.mjs does. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { readFile as read } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = 'mehrlander/web-tools';
const FIXTURE = 'docs/fixtures/find-sample.pdf';   // never on disk; intercepted below
const shotArg = process.argv.indexOf('--shot');
const SHOT = shotArg >= 0 ? process.argv[shotArg + 1] : null;

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// ── the fixture ─────────────────────────────────────────────────────────────
// A page of real lines, "budget" recurring so a search has several hits to move
// between, and a second page so the reader is never at the whole document at
// once. Letter-shaped, so a page fitted to a wide pane is taller than it and
// the column actually scrolls.
const LINES_1 = [
  'Department of Retirement Systems',
  '2023-25 Budget Submittal Package',
  '',
  'This budget request funds the maintenance level',
  'of the retirement systems budget, with no policy',
  'change to the underlying budget structure.',
  '',
  'The contingency cost/risk reserve spreadsheet',
  'accompanies the budget as Appendix B.',
];
const LINES_2 = [
  'Continuation: the budget detail by fund',
  'and the four-year budget outlook follow here.',
];
const build = async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page1 = doc.addPage([612, 792]);
  page1.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });
  LINES_1.forEach((line, i) => {
    if (!line) return;
    page1.drawText(line, { x: 72, y: 720 - i * 30, size: i < 2 ? 18 : 13, font: i < 2 ? bold : font, color: rgb(0.1, 0.1, 0.1) });
  });
  const page2 = doc.addPage([612, 792]);
  page2.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(1, 1, 1) });
  LINES_2.forEach((line, i) => {
    page2.drawText(line, { x: 72, y: 720 - i * 30, size: 13, font, color: rgb(0.1, 0.1, 0.1) });
  });
  return Buffer.from(await doc.save());
};
const FIXTURE_BYTES = await build();

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
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const kitSource = (await read(path.join(root, 'lib', 'kits', 'pdf.js'), 'utf8'))
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.min\.js/, `${origin}/vendor/pdf.min.js`)
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/pdfjs-dist@[\d.]+\/build\/pdf\.worker\.min\.js/, `${origin}/vendor/pdf.worker.min.js`);

const contentsJson = (buf) => JSON.stringify({
  content: buf.toString('base64'), encoding: 'base64',
  size: buf.length, sha: 'x'.repeat(40), html_url: 'https://example.invalid',
});

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const api = `https://api.github.com/repos/${REPO}/contents/`;
  const want = decodeURIComponent(url.split('?')[0]);
  if (want.startsWith(api + FIXTURE)) {
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
const thrown = [];
page.on('pageerror', e => { thrown.push(e.message); console.log(`  [pageerror] ${e.message}`); });

// What the find UI settled on, read from the DOM the flow drew.
const findState = () => page.evaluate(() => {
  const root = document.querySelector('[data-pdf="root"]');
  const flow = root?.__pdfFlow || null;
  const bar = document.querySelector('[data-pdf="findbar"]');
  const toggle = document.querySelector('[data-pdf="findtoggle"]');
  const marks = [...document.querySelectorAll('.viewer-pdf-find')];
  return {
    hasToggle: !!toggle,
    barOpen: !!bar && !bar.classList.contains('hidden'),
    toggleHidden: !!toggle && toggle.classList.contains('hidden'),
    count: document.querySelector('[data-pdf="findcount"]')?.textContent || '',
    marks: marks.length,
    activeMarks: marks.filter(m => m.dataset.findActive === '1').length,
    activeFind: flow ? flow.activeFind() : -2,
    findCount: flow ? flow.findCount() : -2,
    active: flow ? flow.active() : -2,
  };
});
const type = async (q) => {
  await page.fill('[data-pdf="findinput"]', '');
  await page.type('[data-pdf="findinput"]', q, { delay: 10 });
  await page.waitForTimeout(500);
};

try {
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:${FIXTURE}`)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  let s = await findState();
  ok('the find toggle is present, bar closed', s.hasToggle && !s.barOpen, JSON.stringify(s));

  // 1. open it
  await page.click('[data-pdf="findtoggle"]');
  await page.waitForTimeout(200);
  s = await findState();
  ok('opening reveals the input and hides the toggle', s.barOpen && s.toggleHidden, JSON.stringify(s));

  // 2. a query highlights its matches
  await type('budget');
  s = await findState();
  ok('the query found several matches', s.findCount >= 5, `findCount=${s.findCount}`);
  ok('the count reads k/n', /^\d+\/\d+$/.test(s.count), s.count);
  ok('marks are drawn over the page', s.marks >= 1, `marks=${s.marks}`);
  ok('exactly one match is active', s.activeMarks === 1, `activeMarks=${s.activeMarks}`);
  ok('the first match is current', s.count.startsWith('1/'), s.count);

  if (SHOT) {
    const box = await page.evaluate(() => {
      const st = document.querySelector('[data-pdf="stage"]');
      const r = st.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    await page.screenshot({ path: SHOT, clip: box });
    console.log(`  shot   ${SHOT}`);
  }

  // 3. next moves the active match
  const before = s.count;
  await page.click('[data-pdf="findnext"]');
  await page.waitForTimeout(400);
  s = await findState();
  ok('next advances the active match', s.count !== before && s.count.startsWith('2/'), `${before} -> ${s.count}`);

  // 4. a query with no match
  await type('appropriation');
  s = await findState();
  ok('a miss says None and draws nothing', s.count === 'None' && s.marks === 0, JSON.stringify(s));

  // 5. Ctrl+F opens find from the reader pane (close first via Escape)
  await page.press('[data-pdf="findinput"]', 'Escape');
  await page.waitForTimeout(150);
  s = await findState();
  ok('Escape closes the bar and clears marks', !s.barOpen && s.marks === 0, JSON.stringify(s));
  await page.click('[data-pdf="stage"]', { position: { x: 300, y: 400 } });
  await page.keyboard.press('Control+f');
  await page.waitForTimeout(200);
  s = await findState();
  ok('Ctrl+F reopens the bar from the pane', s.barOpen, JSON.stringify(s));

  ok('no page errors were thrown', thrown.length === 0, thrown.join(' | '));
} catch (e) {
  console.log('  EXCEPTION ' + (e && e.stack || e));
  failures.push('exception');
} finally {
  await browser.close();
  server.close();
}

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log('\nall passed');
