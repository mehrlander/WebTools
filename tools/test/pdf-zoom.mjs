#!/usr/bin/env node
// Zooming a PDF inside the viewer's continuous flow.
//
//   node tools/test/pdf-zoom.mjs
//
// The flow fits every page to the pane, which is the right default and the
// wrong ceiling: a budget table set in 8pt is legible on a bench and not on a
// phone, and until 2026-08-25 the only way to see it larger was to leave for
// the workbench. Zoom is what the reader reaches for instead, and it collides
// with the one thing the flow had just settled: which gesture belongs to the
// document and which belongs to the deck of documents behind it.
//
// So the claims are about that collision as much as about magnification:
//
//   1. a document opens at fit width, with no zoom chrome and no sideways axis
//   2. ctrl or cmd plus the wheel zooms; a plain wheel and shift plus the wheel
//      do not, because both of those already mean scrolling
//   3. the hole and the page agree at every zoom: the slot and the canvas drawn
//      into it are the same width, which is what keeps the scrollbar honest
//   4. a zoomed column TAKES the horizontal axis and contains it, so panning a
//      magnified page cannot slide to the next document
//   5. the level is visible while zoomed and one tap from fit, which is the
//      part immersive got wrong: a state with no visible exit reads as a bug
//   6. the vertical anchor is exact, so the line under the pointer stays there
//   7. the floor and the ceiling clamp, and the pager still knows the page
//
// The fixture is built here with pdf-lib, as in tools/test/viewer-pdf.mjs, and
// pdf.js is served from node_modules onto this origin so its worker is
// same-origin. Exits nonzero on any failure. Not part of `npm test`.

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
const SIX = 'docs/fixtures/six-page.pdf';   // never on disk; intercepted below

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Six pages, each numbered, so a zoom that silently rebuilt the column onto a
// different page is visible as a page number rather than only as a scroll top.
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 6; i++) {
  const pg = doc.addPage([400, 560]);
  pg.drawRectangle({ x: 0, y: 0, width: 400, height: 560, color: rgb(1, 1, 1) });
  pg.drawText(`p${i}`, { x: 40, y: 280, size: 64, font, color: rgb(0, 0, 0) });
}
const BYTES = Buffer.from(await doc.save());

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
// Narrow enough that fit-to-width is a real constraint rather than a formality.
const page = await browser.newPage({ viewport: { width: 560, height: 780 } });

await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const api = `https://api.github.com/repos/${REPO}/contents/`;
  const want = decodeURIComponent(url.split('?')[0]);
  if (want.startsWith(api + SIX)) {
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
const thrown = [];
page.on('pageerror', e => { thrown.push(e.message); console.log(`  [pageerror] ${e.message}`); });

// Everything the zoom touches, read in one pass. The slot and the canvas are
// asked for separately on purpose: the hole and the page agreeing is the
// invariant, so measuring one and inferring the other would test nothing.
const state = () => page.evaluate(() => {
  const flow = document.querySelector('[data-pdf="root"]')?.__pdfFlow || null;
  const box = flow?.scroller || null;
  const at = flow ? flow.active() : -1;
  const slot = document.querySelector(`.viewer-pdf-slot[data-page="${at + 1}"]`);
  const canvas = document.querySelector(`.viewer-pdf-page[data-page="${at + 1}"]`);
  const cs = box ? getComputedStyle(box) : null;
  const pill = document.querySelector('.viewer-pdf-zoom');
  return {
    z: flow ? Math.round(flow.zoom() * 1000) / 1000 : 0,
    active: at,
    pane: box ? Math.round(box.clientWidth) : 0,
    slotW: slot ? Math.round(slot.getBoundingClientRect().width) : 0,
    canvasW: canvas ? Math.round(canvas.getBoundingClientRect().width) : 0,
    scrollTop: box ? Math.round(box.scrollTop) : 0,
    scrollsX: box ? box.scrollWidth > box.clientWidth + 4 : false,
    overflowX: cs ? cs.overflowX : '',
    overscrollX: cs ? cs.overscrollBehaviorX : '',
    touch: cs ? cs.touchAction : '',
    pillShown: pill ? !pill.classList.contains('hidden') : null,
    pillText: (document.querySelector('[data-pdf="zoomlevel"]')?.textContent || '').trim(),
    label: (document.querySelector('[data-pdf="page"]')?.textContent || '').replace(/\s/g, ''),
  };
});

// ctrl (or shift, or nothing) plus a wheel over the middle of the column.
const wheelAt = async (dy, mod) => {
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-pdf="root"]').__pdfFlow.scroller.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  if (mod) await page.keyboard.down(mod);
  await page.mouse.wheel(0, dy);
  if (mod) await page.keyboard.up(mod);
  await page.waitForTimeout(600);
};

try {
  console.log('a six-page PDF, opened at fit width:');
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:${SIX}`)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  let s = await state();

  ok('it opened in the flow', s.active === 0 && s.pane > 100, JSON.stringify(s));
  ok('zoom is 1', s.z === 1, `z=${s.z}`);
  ok('the page fills the pane', near(s.slotW, s.pane, 2), `slot=${s.slotW} pane=${s.pane}`);
  ok('the canvas matches its hole', near(s.canvasW, s.slotW, 2), `canvas=${s.canvasW} slot=${s.slotW}`);
  ok('no zoom chrome yet', s.pillShown === false, JSON.stringify(s));
  ok('and no sideways axis: it belongs to the deck', s.scrollsX === false && s.overflowX === 'hidden',
     JSON.stringify(s));
  ok('the browser pinch is off so ours can run', /pan-x/.test(s.touch) && /pan-y/.test(s.touch), s.touch);

  console.log('\na plain wheel and shift plus a wheel are scrolling, not zooming:');
  await wheelAt(200, null);
  s = await state();
  ok('a plain wheel scrolled', s.scrollTop > 50, `top=${s.scrollTop}`);
  ok('and did not zoom', s.z === 1, `z=${s.z}`);
  await wheelAt(-200, 'Shift');
  s = await state();
  ok('shift plus a wheel did not zoom either', s.z === 1, `z=${s.z}`);

  console.log('\nctrl plus the wheel zooms in:');
  const before = await state();
  const anchor = await page.evaluate(() => {
    const box = document.querySelector('[data-pdf="root"]').__pdfFlow.scroller;
    const r = box.getBoundingClientRect();
    // The content coordinate under the middle of the pane, in fit-width units.
    return (box.scrollTop + r.height / 2) / document.querySelector('[data-pdf="root"]').__pdfFlow.zoom();
  });
  await wheelAt(-300, 'Control');
  s = await state();
  ok('the zoom went up', s.z > before.z, `${before.z} -> ${s.z}`);
  ok('the pane did not move', near(s.pane, before.pane, 2), `${before.pane} -> ${s.pane}`);
  ok('the slot grew by the zoom', near(s.slotW, Math.round(s.z * before.slotW), 3),
     `slot=${s.slotW} expected=${Math.round(s.z * before.slotW)}`);
  ok('the canvas grew with it', near(s.canvasW, s.slotW, 3), `canvas=${s.canvasW} slot=${s.slotW}`);
  ok('the column took the horizontal axis', s.scrollsX === true && s.overflowX === 'auto',
     JSON.stringify(s));
  ok('and contains it, so panning cannot reach the deck', s.overscrollX === 'contain', s.overscrollX);
  ok('the level is showing', s.pillShown === true && /%/.test(s.pillText), JSON.stringify(s));

  const after = await page.evaluate(() => {
    const box = document.querySelector('[data-pdf="root"]').__pdfFlow.scroller;
    const r = box.getBoundingClientRect();
    return (box.scrollTop + r.height / 2) / document.querySelector('[data-pdf="root"]').__pdfFlow.zoom();
  });
  // Two CSS pixels at fit width, which is the rounding in the layout and not a
  // drift: the anchor is arithmetic, so anything larger is a real error.
  ok('the anchor held: the same content is under the pointer',
     near(after, anchor, 2), `${Math.round(anchor)} -> ${Math.round(after)}`);

  console.log('\nthe ceiling, the floor, and the way back:');
  await page.evaluate(() => document.querySelector('[data-pdf="root"]').__pdfFlow.setZoom(99));
  await page.waitForTimeout(500);
  s = await state();
  ok('the ceiling clamps at 4', s.z === 4, `z=${s.z}`);
  await page.evaluate(() => document.querySelector('[data-pdf="root"]').__pdfFlow.setZoom(0.01));
  await page.waitForTimeout(500);
  s = await state();
  ok('the floor clamps at 0.5', s.z === 0.5, `z=${s.z}`);
  ok('and a column narrower than the pane keeps the axis for the deck',
     s.scrollsX === false && s.overflowX === 'hidden', JSON.stringify(s));

  const wasAt = (await state()).active;
  await page.click('[data-pdf="zoomreset"]');
  await page.waitForTimeout(700);
  s = await state();
  ok('tapping the level fits to width', s.z === 1, `z=${s.z}`);
  ok('the chrome goes away with it', s.pillShown === false, JSON.stringify(s));
  ok('the deck has its axis back', s.overflowX === 'hidden' && s.scrollsX === false, JSON.stringify(s));
  ok('and the reader is still on the page they were on', s.active === wasAt,
     `${wasAt} -> ${s.active}`);

  console.log('\nthe pager is unbothered by any of it:');
  await page.evaluate(() => document.querySelector('[data-pdf="root"]').__pdfFlow.go(4));
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('[data-pdf="root"]').__pdfFlow.setZoom(2));
  await page.waitForTimeout(800);
  s = await state();
  ok('a zoom keeps the page it was on', s.active === 4, `active=${s.active}`);
  ok('and the pager agrees', s.label === '5/6', s.label);

  ok('nothing threw', thrown.length === 0, thrown.join(' | '));

  // ── the pinch ───────────────────────────────────────────────────────────
  // A second context, because this one needs a touch device and the wheel
  // checks above want a mouse. Playwright's own touchscreen only taps, so the
  // two fingers are dispatched through CDP, which is what actually produces a
  // pair of pointer events the handler can see. Without this the pinch is the
  // half of the feature nothing tests, and it is the half a phone uses.
  console.log('\ntwo fingers on a phone:');
  const touchCtx = await browser.newContext({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true,
    deviceScaleFactor: 2,
  });
  const phone = await touchCtx.newPage();
  await phone.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    const api = `https://api.github.com/repos/${REPO}/contents/`;
    const want = decodeURIComponent(url.split('?')[0]);
    if (want.startsWith(api + SIX)) {
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
  await phone.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(`${REPO}@main:${SIX}`)}`,
                   { waitUntil: 'domcontentloaded' });
  await phone.waitForTimeout(5000);

  const cdp = await touchCtx.newCDPSession(phone);
  const zoomOf = () => phone.evaluate(() =>
    Math.round((document.querySelector('[data-pdf="root"]')?.__pdfFlow?.zoom() ?? 0) * 1000) / 1000);
  const axis = () => phone.evaluate(() => {
    const box = document.querySelector('[data-pdf="root"]').__pdfFlow.scroller;
    return getComputedStyle(box).overflowX;
  });
  const box = await phone.evaluate(() => {
    const r = document.querySelector('[data-pdf="root"]').__pdfFlow.scroller.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  const touches = (pts) => pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 8, radiusY: 8, force: 1 }));
  const spread = async (half) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: touches([[box.cx - half, box.cy], [box.cx + half, box.cy]]),
    });
    await phone.waitForTimeout(60);
  };

  ok('it opens at fit width', await zoomOf() === 1, String(await zoomOf()));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: touches([[box.cx - 40, box.cy], [box.cx + 40, box.cy]]),
  });
  await phone.waitForTimeout(80);
  ok('two fingers down take the horizontal axis before anything moves',
     await axis() === 'auto', await axis());
  for (const half of [60, 90, 120, 150]) await spread(half);
  const spreadZ = await zoomOf();
  ok('spreading them zooms in', spreadZ > 1.6, `z=${spreadZ}`);
  // 150/40 is 3.75, and the ceiling is 4, so the ratio is what is asserted
  // rather than a number: a pinch that scaled by anything else would still
  // have been "greater than 1".
  ok('by the ratio of the spread', near(spreadZ, 150 / 40, 0.25), `z=${spreadZ} expected~${150 / 40}`);

  for (const half of [110, 70, 40]) await spread(half);
  const backZ = await zoomOf();
  ok('pinching them back zooms out', backZ < spreadZ && near(backZ, 1, 0.2), `z=${backZ}`);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForTimeout(200);
  ok('and lifting hands the axis back to the deck', await axis() === 'hidden', await axis());
  await touchCtx.close();
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
