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
// The same bytes at a REALISTIC address. Every path in the estate that anyone
// actually opens a PDF from looks like this, and the header bugs the phone
// found were all length bugs: nothing misbehaves at `docs/fixtures/x.pdf`.
const LONG = 'docs/fixtures/2026-06-04-drs-budget-submittals/2023-25/R1/DP-ML-RH-Adding Roth Option to DCP.pdf';

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
  const want = decodeURIComponent(url.split('?')[0]);
  if (want.startsWith(api + FIXTURE) || want.startsWith(api + LONG)) {
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
  const root = document.getElementById('viewer-pdf');
  const deck = root?.__deck || null;
  const msg = document.getElementById('viewer-pdf-msg');
  const bar = document.getElementById('viewer-pdf-bar');
  const open = document.getElementById('viewer-pdf-open');
  const at = deck ? deck.active() : -1;
  // The ACTIVE slide's canvas, not "the canvas": there is one per page now,
  // and only the ones near the reader exist at all.
  const canvas = document.querySelector(`.viewer-pdf-page[data-page="${at + 1}"]`);
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
    active: at,
    slides: deck ? deck.count : 0,
    built: deck ? deck.builtCount : 0,
    // A snap track is only swipeable if it can actually scroll horizontally.
    scrollable: deck ? deck.track.scrollWidth > deck.track.clientWidth + 10 : false,
    snap: deck ? getComputedStyle(deck.track).scrollSnapType : '',
    shown: !!canvas,
    msg: msg && !msg.classList.contains('hidden') ? msg.textContent.trim() : '(gone)',
    barShown: bar ? !bar.classList.contains('hidden') : false,
    label: document.getElementById('viewer-pdf-page')?.textContent || '',
    size: document.getElementById('viewer-pdf-size')?.textContent || '',
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
  // The facts about the document as an OBJECT live with the pager, not in the
  // viewer's header line. That line used to read "2 pages · N KB" directly
  // above a pager reading "1 / 2", so the count was stated twice and the
  // second statement was the more useful one. What is left in the header must
  // be nothing at all: a PDF's text is not the file, so a derived line would
  // report newline bytes in the binary as "lines" and the mangled decode as a
  // size, which is what the binary flag on the module suppresses.
  ok('the header line says nothing it cannot know', s.stats === '', s.stats);
  ok('the real byte size rides with the pager', /^\d+\.\d KB$/.test(s.size), s.size);
  ok('and no page count is stated twice', !/pages?/.test(s.size + s.stats), s.size + ' / ' + s.stats);
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
  await page.waitForTimeout(1500);
  s = await state();
  ok('next moves the pager', s.label.replace(/\s/g, '') === '2/2', s.label);
  ok('and lands on the other page', s.active === 1 && s.ink > 200 && s.ink !== inkOne,
     `${inkOne} -> ${s.ink} at ${s.active}`);

  console.log('the pages are a swipe track, not just two buttons:');
  // The gesture itself cannot be synthesized faithfully here, so this asserts
  // the three properties that make one work: a track wider than its box, snap
  // points on it, and a pager that follows the SCROLL rather than only driving
  // it. Drag the track directly and see whether the rest of the pane agrees.
  ok('the track scrolls horizontally', s.scrollable === true, JSON.stringify(s));
  ok('with mandatory snap points', /mandatory/.test(s.snap), s.snap);
  await page.evaluate(() => {
    const t = document.getElementById('viewer-pdf').__deck.track;
    t.scrollTo({ left: 0, behavior: 'auto' });
    t.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(900);
  s = await state();
  ok('a scroll of the track moves the pager back', s.label.replace(/\s/g, '') === '1/2', s.label);
  ok('and the reader is on page 1 again', s.active === 0, String(s.active));

  console.log('a long document does not rasterize itself:');
  ok('only the reader\'s neighbourhood is built', s.built <= 3 && s.built >= 1,
     `${s.built} of ${s.slides} slides built`);

  // ── the header at phone width, with a real address ───────────────────────
  //
  // Reported from a phone and invisible at every width this file had tested.
  // Two separate faults, one shape: the header assumed its text was short.
  // The address sat in a daisyUI badge, a FIXED-HEIGHT pill, so it wrapped
  // inside a box that could not grow and drew its tail through the badge
  // below it; and the file path truncated from the RIGHT, so a 390px screen
  // read "docs/…" for a file whose name was the entire point.
  //
  // What is asserted is the geometry rather than the classes, because both
  // faults were produced by class lists that read perfectly well.
  console.log('the header holds together at 390px with a real path:');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:${LONG}`)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const layout = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const boxes = [];
    document.querySelectorAll('header span, header h1, #viewer-pdf-bar *').forEach(el => {
      const t = (el.textContent || '').trim();
      if (!t || el.children.length) return;
      // The FAB's drawer is parked OFF-SCREEN to the right while closed, and
      // it has a header of its own, so an unscoped query reports its tab
      // labels as overflow. They are supposed to be out there.
      if (el.closest('[x-data*="fab"]')) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      boxes.push({
        t: t.slice(0, 24), l: r.left, r: r.right, top: r.top, bot: r.bottom,
        // SPILL is the one that actually catches the badge, and the collision
        // check below does not: a fixed-height pill keeps a 20px bounding box
        // however many lines of text it holds, so the boxes never intersect
        // while the glyphs plainly do. What gives it away is the element's own
        // content being taller than the box drawn for it, with nothing
        // clipping the difference.
        spill: getComputedStyle(el).overflow === 'visible'
               && el.scrollHeight > el.clientHeight + 2,
      });
    });
    // Any two text boxes sharing space, which is what "drawn through each
    // other" looks like to a machine.
    const collisions = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlapX = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const overlapY = Math.min(a.bot, b.bot) - Math.max(a.top, b.top);
        if (overlapX > 2 && overlapY > 2) collisions.push(`${a.t} × ${b.t}`);
      }
    }
    return {
      vw,
      collisions,
      spills: boxes.filter(b => b.spill).map(b => b.t),
      widest: Math.max(...boxes.map(b => b.r)),
      pageScroll: document.documentElement.scrollWidth,
      name: document.querySelector('[x-text="namePart"]')?.textContent || '',
      // Where the document itself starts. The honest measure of "too much
      // going on at the top", and the only one that keeps rising as rows are
      // added one reasonable-looking row at a time.
      stageTop: Math.round(document.getElementById('viewer-pdf-stage')?.getBoundingClientRect().top ?? 9999),
      // A heading here would be a third copy of the filename: the address
      // ends with it and the viewer prints it. Only a payload that names
      // itself gets one, and a bare addressed file does not.
      headings: [...document.querySelectorAll('h1')]
        .filter(h => h.offsetParent !== null && !h.closest('[x-data*="fab"]')).length,
    };
  });

  ok('no header item overflows the box drawn for it',
     layout.spills.length === 0, layout.spills.join(', '));
  ok('no two header items are drawn through each other',
     layout.collisions.length === 0, layout.collisions.join(', '));
  ok('nothing runs past the right edge', layout.widest <= layout.vw + 2,
     `${Math.round(layout.widest)} > ${layout.vw}`);
  ok('and the page does not scroll sideways',
     layout.pageScroll <= layout.vw + 2, `${layout.pageScroll} > ${layout.vw}`);
  ok('the filename survives, not just its directory',
     layout.name.startsWith('DP-ML-RH-Adding'), layout.name);
  ok('no heading repeats a filename the viewer already prints',
     layout.headings === 0, `${layout.headings} heading(s) over a bare payload`);
  ok('and the document starts near the top of the screen',
     layout.stageTop < 200, `chrome pushes it to ${layout.stageTop}px of 844`);

  await page.setViewportSize({ width: 1100, height: 800 });
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
