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
//   3. the header states the real byte size, which is not
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

// Eight pages, for the teardown case. swipe-deck keeps the reader's slide and
// two either side, so nothing is ever released in a two-page document and the
// bug this guards against cannot appear.
const long = await PDFDocument.create();
const longFont = await long.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 8; i++) {
  const pg = long.addPage([400, 300]);
  pg.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color: rgb(1, 1, 1) });
  pg.drawText(`p${i}`, { x: 40, y: 150, size: 48, font: longFont, color: rgb(0, 0, 0) });
}
const LONG_BYTES = Buffer.from(await long.save());
const EIGHT = 'docs/fixtures/eight.pdf';

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
  if (want.startsWith(api + EIGHT)) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: contentsJson(LONG_BYTES) });
  }
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
const thrown = [];
page.on('pageerror', e => { thrown.push(e.message); console.log(`  [pageerror] ${e.message}`); });
page.on('console', m => { if (m.type() === 'warning' && /Alpine Expression Error/.test(m.text())) thrown.push(m.text()); });

// What the viewer settled on, and what the canvas actually holds. `ink` counts
// non-white pixels: the only proof that a page was rasterized rather than a
// correctly-sized blank canvas being left in place, which is what every
// failure mode here looks like from the outside.
const state = () => page.evaluate(() => {
  const host = document.getElementById('dv-viewer');
  const v = host && Alpine.$data(host);
  const root = document.querySelector('[data-pdf="root"]');
  // `__pdfFlow` rather than `__deck`: the pdf module mounts a continuous
  // column, not a deck, so there is no track and no `sd-` anything to ask.
  const flow = root?.__pdfFlow || null;
  const msg = document.querySelector('[data-pdf="msg"]');
  const at = flow ? flow.active() : -1;
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
    slides: flow ? flow.count : 0,
    built: flow ? flow.built() : 0,
    // Which way the mounted flow actually moves. The continuous flow must
    // scroll DOWN and must not scroll sideways at all, since a sideways
    // gesture over a page belongs to whatever deck encloses the viewer.
    scrollsY: flow ? flow.scroller.scrollHeight > flow.scroller.clientHeight + 10 : false,
    scrollsX: flow ? flow.scroller.scrollWidth > flow.scroller.clientWidth + 10 : false,
    snap: flow ? getComputedStyle(flow.scroller).scrollSnapType : '',
    // The scroller's own width, which is the pane the page is fitted to. It
    // is the stage's width less whatever a scrollbar takes.
    scrollerWidth: flow ? Math.round(flow.scroller.clientWidth) : 0,
    shown: !!canvas,
    msg: msg && !msg.classList.contains('hidden') ? msg.textContent.trim() : '(gone)',
    // The module contributes NO chrome of its own: no row, and no button in
    // the viewer's header slot either. Its position readout floats over the
    // page, and its handoff is a row in the open-elsewhere dropdown.
    ownBar: !!document.querySelector('[data-pdf="bar"]'),
    inHeader: [...document.querySelectorAll('[data-view-controls] *')].length,
    pagerFloats: !!document.querySelector('.viewer-pdf-pager [data-pdf="page"]'),
    openRows: [...document.querySelectorAll('.dropdown-content a')]
      .map(a => (a.textContent || '').trim()).filter(Boolean),
    workbenchHref: [...document.querySelectorAll('.dropdown-content a')]
      .find(a => /workbench/i.test(a.textContent || ''))?.getAttribute('href') || '',
    label: document.querySelector('[data-pdf="page"]')?.textContent || '',

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
  // The header line reports the size the MODULE measured, through ctx.report,
  // rather than deriving one from text that is not the file. It went silent
  // for a binary before any module could measure one, and it went silent again
  // when the size followed the pager into a bar of this module's own. With
  // that bar retired the line carries the size and only the size: no page
  // count, because the count is not a fact about the object and the floating
  // pager says where you are.
  ok('the header line carries the real byte size', /^\d+\.\d KB$/.test(s.stats), s.stats);
  ok('and states no page count', !/pages?/.test(s.stats), s.stats);
  ok('pdf-lib was never requested', askedForPdfLib === false,
     'the viewer pulled the editor library it never calls');

  console.log('the pager and the handoff:');
  ok('the module built no chrome row of its own', s.ownBar === false, JSON.stringify(s));
  ok('and adds no button to the header either', s.inHeader === 0, String(s.inHeader));
  ok('and the position floats over the page', s.pagerFloats === true, JSON.stringify(s));
  ok('the pager reads page 1 of 2', s.label.replace(/\s/g, '') === '1/2', s.label);
  // The handoff is a ROW in the open-elsewhere dropdown, beside GitHub, Raw
  // and CDN, rather than a button of its own. A row can carry a word, which is
  // what lets it say the page it will open.
  ok('the workbench is a row in the open-elsewhere list',
     s.openRows.some(t => /^Workbench/.test(t)), JSON.stringify(s.openRows));
  ok('beside the links true of any file',
     ['GitHub', 'Raw', 'CDN'].every(l => s.openRows.includes(l)), JSON.stringify(s.openRows));
  ok('it carries this file\'s address',
     s.workbenchHref.includes(`#gh=${REPO}@main:${FIXTURE}`), s.workbenchHref);
  ok('and points at the workbench', s.workbenchHref.includes('/pages/pdf-inspect.html'), s.workbenchHref);
  // The workbench's main mode is page-scoped, so the handoff carries the page
  // the reader is on. It landed on page 1 whatever you were reading until
  // pages/pdf-inspect.html learned to take `page=` (2026-08-25).
  ok('and the page the reader is on', /&page=1$/.test(s.workbenchHref), s.workbenchHref);
  ok('which the row says in words', s.openRows.includes('Workbench p1'), JSON.stringify(s.openRows));

  const inkOne = s.ink;
  await page.click('[data-pdf="next"]');
  await page.waitForTimeout(1500);
  s = await state();
  ok('next moves the pager', s.label.replace(/\s/g, '') === '2/2', s.label);
  ok('and the workbench row follows the reader', /&page=2$/.test(s.workbenchHref), s.workbenchHref);
  ok('in its label too', s.openRows.includes('Workbench p2'), JSON.stringify(s.openRows));
  ok('and lands on the other page', s.active === 1 && s.ink > 200 && s.ink !== inkOne,
     `${inkOne} -> ${s.ink} at ${s.active}`);

  console.log('the pages are one continuous column, not a sideways deck:');
  // The gesture itself cannot be synthesized faithfully here, so this asserts
  // the properties that decide what a gesture MEANS: the column moves
  // vertically, it does not move sideways at all, and the pager follows the
  // SCROLL rather than only driving it.
  //
  // `scrollsX === false` is the whole change in one assertion. While the pages
  // were a horizontal track, a sideways swipe over the page was captured by
  // it, so inside the stage reader (a horizontal deck of documents) the same
  // gesture meant "next page" over the page and "next document" a few pixels
  // outside it, and there was no swipe at all that left a multi-page document.
  // tools/test/pdf-flow.mjs drives that nested case for real.
  ok('the column scrolls vertically', s.scrollsY === true, JSON.stringify(s));
  ok('and does not scroll sideways', s.scrollsX === false, JSON.stringify(s));
  ok('with no snap points to fight the scroll', !/mandatory/.test(s.snap), s.snap);
  await page.evaluate(() => {
    const box = document.querySelector('[data-pdf="root"]').__pdfFlow.scroller;
    box.scrollTo({ top: 0, behavior: 'auto' });
    box.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(900);
  s = await state();
  ok('a scroll of the column moves the pager back', s.label.replace(/\s/g, '') === '1/2', s.label);
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
    document.querySelectorAll('header span, header h1, [data-pdf="bar"] *').forEach(el => {
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
      stageTop: Math.round(document.querySelector('[data-pdf="stage"]')?.getBoundingClientRect().top ?? 9999),
      // How much of its pane the page actually covers. Four separate paddings
      // used to stack between the viewport and the canvas (the page shell, two
      // flex gaps, and the slide's own), and each was defensible alone.
      stageWidth: Math.round(document.querySelector('[data-pdf="stage"]')?.clientWidth ?? 0),
      pageWidth: Math.round(document.querySelector('.viewer-pdf-page')?.getBoundingClientRect().width ?? 0),
      // The continuous flow is a scroller INSIDE the stage, so the pane a page
      // is fitted to is the scroller's width, which is the stage's less
      // whatever a scrollbar takes. Both are asserted below: the page fills
      // its scroller, and the scroller is not quietly inset from the stage,
      // which together say what the single measurement used to.
      flowWidth: Math.round(document.querySelector('.viewer-pdf-flow')?.clientWidth ?? 0),
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
     layout.stageTop < 160, `chrome pushes it to ${layout.stageTop}px of 844`);
  ok('the page fills the pane it was given',
     layout.pageWidth >= layout.flowWidth - 4,
     `page ${layout.pageWidth} inside pane ${layout.flowWidth}`);
  ok('and that pane is the stage, less only a scrollbar',
     layout.flowWidth >= layout.stageWidth - 20,
     `column ${layout.flowWidth} inside stage ${layout.stageWidth}`);

  await page.setViewportSize({ width: 1100, height: 800 });
  // ── paging a long document ───────────────────────────────────────────────
  //
  // NOT a check on the detached-initTree guard, though it was written as one
  // and that was wrong. A slide here holds a plain canvas, not an Alpine
  // component, so releasing one destroys nothing that could be re-inited and
  // the bug cannot arise on this path. Removing the guard from viewer.js
  // leaves every assertion below green, which is how the mistake surfaced.
  //
  // It earns its place as what it actually is: proof that walking to the end
  // of a document releases the slides behind it and throws nothing on the way,
  // which is the property the lazy deck exists for and the one a regression
  // would most likely break.
  console.log('paging a long document releases slides without throwing:');
  await page.setViewportSize({ width: 1100, height: 800 });
  thrown.length = 0;
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:${EIGHT}`)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 7; i++) { await page.click('[data-pdf="next"]'); await page.waitForTimeout(450); }
  await page.waitForTimeout(1200);
  const paged = await state();
  ok('it reached the last page', paged.label.replace(/\s/g, '') === '8/8', paged.label);
  ok('and released the ones behind it', paged.built <= 5, `${paged.built} of ${paged.slides} still built`);
  ok('with nothing thrown on the way',
     thrown.filter(t => /is not defined|Expression Error/.test(t)).length === 0,
     thrown.slice(0, 2).join(' | '));

  // ── the floating pager ───────────────────────────────────────────────────
  //
  // It replaces a chrome row, so it has to do that row's job: say where you
  // are while you are moving, get out of the way when you are not, and offer
  // the jump the retired pager never did. The deck's contents sheet lists the
  // DOCUMENTS in a stage and never the pages of one, so before this there was
  // no way to reach page 6 of 8 except by scrolling to it.
  console.log('the floating pager fades, returns, and jumps:');
  const pagerState = () => page.evaluate(() => {
    const w = document.querySelector('.viewer-pdf-pager');
    const jump = document.querySelector('[data-pdf="jump"]');
    return {
      faded: !!w?.classList.contains('opacity-0'),
      rows: document.querySelectorAll('[data-pdf="jumplist"] a[data-page]').length,
      open: !!jump?.open,
      label: document.querySelector('[data-pdf="page"]')?.textContent?.trim() || '',
    };
  });
  await page.waitForTimeout(1800);
  let pg = await pagerState();
  ok('it fades once the reader stops', pg.faded === true, JSON.stringify(pg));
  ok('and built no jump rows nobody asked for', pg.rows === 0, `${pg.rows} rows`);

  await page.evaluate(() => {
    const box = document.querySelector('[data-pdf="root"]').__pdfFlow.scroller;
    box.scrollTop += 40;
    box.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(300);
  pg = await pagerState();
  ok('a scroll brings it back', pg.faded === false, JSON.stringify(pg));

  await page.evaluate(() => { document.querySelector('[data-pdf="jump"]').open = true; });
  await page.waitForTimeout(500);
  pg = await pagerState();
  ok('opening it builds one row per page', pg.rows === 8, `${pg.rows} rows`);
  await page.waitForTimeout(1800);
  pg = await pagerState();
  ok('and it does not fade out from under the list', pg.faded === false, JSON.stringify(pg));

  await page.evaluate(() => {
    [...document.querySelectorAll('[data-pdf="jumplist"] a[data-page]')]
      .find(a => a.dataset.page === '5').click();
  });
  await page.waitForTimeout(1500);
  pg = await pagerState();
  ok('picking a page goes there', pg.label.replace(/\s/g, '') === '6/8', pg.label);
  ok('and the list closes behind it', pg.open === false, JSON.stringify(pg));

  console.log('a text file is untouched by any of this:');
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:docs/tools.csv`)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  s = await state();
  ok('no pdf mode is offered', !(s.modes || []).includes('pdf'), JSON.stringify(s.modes));
  ok('and the default still decides', s.mode === 'table', JSON.stringify(s));
  // 'table', not 'tree': docs/tools.json became docs/tools.csv in PR #441,
  // which updated this address and left the expectation behind. A CSV
  // opening as a table IS the default deciding, so the claim is unchanged
  // and only the shape of the fixture moved. It went unnoticed for five
  // days because these three checks need a browser and so are outside
  // `npm test`, which is the suite CI runs.
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
