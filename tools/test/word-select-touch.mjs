#!/usr/bin/env node
// pages/word-select.html — the gestures and the viewport lock, in real Chromium
// with a touch-enabled mobile context.
//
//   node tools/test/word-select-touch.mjs
//
// This page's central claim is negative: while a drag is live the pane must not
// scroll, and no native selection may ever exist. A negative claim about
// browser behaviour cannot be tested under jsdom, which has no layout, no
// scrolling and no touch pipeline, so there is nothing there to fail. It also
// cannot be tested with synthetic PointerEvents, because those are dispatched
// straight to a listener and never reach the compositor, which is the thing
// that would have scrolled. Only real CDP touch events go through the path the
// page is defending against.
//
// So every check below drives Input.dispatchTouchEvent and then reads the state
// the browser actually arrived at. Three of them are controls: a swipe must
// still scroll, a tap must not, and the two must not be confusable.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = '/pages/word-select.html';

const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const fp = path.join(root, rel);
    if (!fp.startsWith(root)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(await readFile(fp));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}${PAGE}`, { waitUntil: 'load' });
await page.waitForTimeout(300);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
});
const swipeUp = async (x, y, steps = 8, dy = 22) => {
  await touch('touchStart', x, y);
  for (let k = 1; k <= steps; k++) { await touch('touchMove', x, y - k * dy); await page.waitForTimeout(16); }
  await touch('touchEnd', x, y - steps * dy);
};

const state = () => page.evaluate(() => ({
  scrollTop: Math.round(document.getElementById('pane').scrollTop),
  sel: document.querySelectorAll('.w.sel').length,
  tent: document.querySelectorAll('.w.tent').length,
  gapSel: document.querySelectorAll('.g.sel').length,
  gapTent: document.querySelectorAll('.g.tent').length,
  pins: document.querySelectorAll('.pin').length,
  menu: !document.getElementById('menu').hidden,
  stat: document.getElementById('stat').textContent,
  dragging: document.getElementById('pane').classList.contains('dragging'),
}));
const wordPt = i => page.evaluate(n => {
  const b = document.querySelectorAll('.w')[n].getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, i);
const reset = async () => {
  await page.evaluate(() => { document.getElementById('clear').click(); document.getElementById('pane').scrollTop = 0; });
  await page.waitForTimeout(150);
};

// ── controls: the page must not have broken ordinary reading ───────────────

let p = await wordPt(30);
await swipeUp(p.x, p.y);
await page.waitForTimeout(400);
let s = await state();
check('a swipe still scrolls the pane', s.scrollTop > 40, `scrollTop=${s.scrollTop}`);
check('a swipe selects nothing', s.sel === 0 && s.tent === 0, s.stat);
await reset();

p = await wordPt(6);
await touch('touchStart', p.x, p.y);
await page.waitForTimeout(70);
await touch('touchEnd', p.x, p.y);
await page.waitForTimeout(250);
s = await state();
check('a tap selects exactly one word', s.sel === 1, s.stat);
check('a tap raises two pins', s.pins === 2, `pins=${s.pins}`);
check('a tap does not scroll', s.scrollTop === 0, `scrollTop=${s.scrollTop}`);

// ── the lock: a hold takes the gesture away from the browser ───────────────

p = await wordPt(20);
await touch('touchStart', p.x, p.y);
await page.waitForTimeout(450);                                  // past HOLD_MS
const held = await state();
check('a hold enters drag mode and seeds one word', held.dragging && held.tent === 1, `tent=${held.tent}`);

const before = held.scrollTop;
for (let k = 1; k <= 12; k++) { await touch('touchMove', p.x, p.y + k * 30); await page.waitForTimeout(16); }
await page.waitForTimeout(120);
s = await state();
check('dragging does not scroll the pane', s.scrollTop === before, `scrollTop ${before} -> ${s.scrollTop}`);
check('dragging extends the run word by word', s.tent > 5, `tent=${s.tent}`);
check('the run stays tentative until release', s.tent > 0 && s.dragging);

// The no-visual-gap guarantee, stated as an invariant over every gap in the
// document rather than as a count: a gap is filled exactly when the words on
// both sides are in the same state, so a run has no seam inside it and no
// bridge to its neighbour. Counting would have to know how many paragraph
// boundaries the run crosses, since those carry no gap span at all.
const gapRule = await page.evaluate(() => {
  const st = e => e.classList.contains('tent') ? 2 : e.classList.contains('sel') ? 1 : 0;
  const bad = [];
  let filled = 0;
  for (const g of document.querySelectorAll('.g')) {
    const a = st(g.previousElementSibling), b = st(g.nextElementSibling), want = a === b ? a : 0;
    if (st(g) !== want) bad.push(`${g.previousElementSibling.textContent}|${g.nextElementSibling.textContent}`);
    if (st(g)) filled++;
  }
  return { bad, filled };
});
check('every gap is filled iff both sides share a state',
  gapRule.bad.length === 0 && gapRule.filled > 5, `${gapRule.filled} filled, ${gapRule.bad.length} wrong: ${gapRule.bad.slice(0, 3)}`);

// The one artifact a painted gap could have left: a stub of highlight hanging
// past the end of a wrapped line. Collapsible white space at a soft wrap
// opportunity is not measured, so the box is zero-width and paints nothing.
const lineEnds = await page.evaluate(() => {
  const rows = [];
  for (const g of document.querySelectorAll('.g.sel, .g.tent')) {
    const gr = g.getBoundingClientRect(), pr = g.previousElementSibling.getBoundingClientRect();
    if (Math.abs(gr.top - g.nextElementSibling.getBoundingClientRect().top) >= 2) {
      rows.push({ after: g.previousElementSibling.textContent, w: +gr.width.toFixed(2), overhang: +(gr.right - pr.right).toFixed(2) });
    }
  }
  return rows;
});
check('a filled gap at a line break has zero width',
  lineEnds.length > 2 && lineEnds.every(r => r.w === 0 && r.overhang === 0),
  `${lineEnds.length} line breaks inside the run, widths ${[...new Set(lineEnds.map(r => r.w))]}`);

await touch('touchEnd', p.x, p.y + 360);
await page.waitForTimeout(250);
s = await state();
check('release commits the run', s.tent === 0 && s.sel > 5, s.stat);
check('release leaves drag mode', !s.dragging);
check('the committed run keeps its gaps filled', s.gapSel > 5 && s.gapTent === 0, `${s.gapSel} committed gaps, ${s.gapTent} tentative`);

// ── auto-scroll: the one place a drag may move the pane ────────────────────

await reset();
p = await wordPt(20);
await touch('touchStart', p.x, p.y);
await page.waitForTimeout(450);
const beforeAuto = (await state()).scrollTop;
await touch('touchMove', p.x, 830);                              // inside the bottom EDGE band
await page.waitForTimeout(700);
const afterAuto = (await state()).scrollTop;
check('a drag held at the bottom edge auto-scrolls', afterAuto > beforeAuto, `${beforeAuto} -> ${afterAuto}`);
await touch('touchEnd', p.x, 830);
await page.waitForTimeout(150);

// ── discontinuity: two taps, two isolated runs, no bridge ──────────────────

await reset();
for (const i of [4, 40]) {
  const q = await wordPt(i);
  await touch('touchStart', q.x, q.y);
  await page.waitForTimeout(70);
  await touch('touchEnd', q.x, q.y);
  await page.waitForTimeout(200);
}
s = await state();
check('two taps make two isolated runs', s.sel === 2 && s.gapSel === 0 && s.pins === 4, s.stat);

// Two taps on adjacent words coalesce instead, so `ranges` cannot hold two
// spans that are visually one.
await reset();
for (const i of [10, 11]) {
  const q = await wordPt(i);
  await touch('touchStart', q.x, q.y);
  await page.waitForTimeout(70);
  await touch('touchEnd', q.x, q.y);
  await page.waitForTimeout(200);
}
s = await state();
check('adjacent taps coalesce into one run', s.stat === '2 words in 1 span' && s.gapSel === 1, s.stat);

// ── a pin drag re-forms its run, and reacts while held ─────────────────────

await reset();
p = await wordPt(20);
await touch('touchStart', p.x, p.y);
await page.waitForTimeout(450);
await touch('touchMove', p.x, p.y + 90);
await page.waitForTimeout(80);
await touch('touchEnd', p.x, p.y + 90);
await page.waitForTimeout(200);
const beforePin = await state();

const endPad = await page.evaluate(() => {
  const r = [...document.querySelectorAll('.pin.end .pad')].pop().getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await touch('touchStart', endPad.x, endPad.y);
await page.waitForTimeout(60);
await touch('touchMove', endPad.x, endPad.y + 120);
await page.waitForTimeout(120);
const grabbed = await page.evaluate(() => {
  const g = document.querySelector('.pin.grabbed');
  const plain = document.querySelector('.pin:not(.grabbed) .knob');
  return {
    any: !!g,
    held: g && Math.round(parseFloat(getComputedStyle(g.querySelector('.knob')).width)),
    rest: plain && Math.round(parseFloat(getComputedStyle(plain).width)),
  };
});
s = await state();
check('a pin grabs without a hold and turns the run tentative', grabbed.any && s.tent > 0, `tent=${s.tent}`);
check('the grabbed pin scales up', grabbed.held > grabbed.rest, `${grabbed.rest}px -> ${grabbed.held}px`);

await touch('touchEnd', endPad.x, endPad.y + 120);
await page.waitForTimeout(250);
s = await state();
check('releasing a pin re-commits the adjusted run',
  s.tent === 0 && s.sel > beforePin.sel && !!(await page.evaluate(() => !document.querySelector('.pin.grabbed'))),
  `${beforePin.sel} -> ${s.sel} words`);

// ── the menu appears without moving the bounds ─────────────────────────────

// Reset first: the pin section left the pane scrolled, and a word index alone
// says nothing about where that word now sits on screen.
await reset();
const onSel = await wordPt(10);
await touch('touchStart', onSel.x, onSel.y);          // tap 1: select it
await page.waitForTimeout(70);
await touch('touchEnd', onSel.x, onSel.y);
await page.waitForTimeout(250);
check('the fixture tap selected one word', (await state()).sel === 1);

await touch('touchStart', onSel.x, onSel.y);          // tap 2: the same word, now selected
await page.waitForTimeout(70);
await touch('touchEnd', onSel.x, onSel.y);
await page.waitForTimeout(250);
s = await state();
check('tapping a selected word opens the menu', s.menu, s.stat);
check('the menu leaves the selection untouched', s.sel === 1 && s.stat === '1 word in 1 span', s.stat);

const removePt = await page.evaluate(() => {
  const r = document.querySelector('.menu button[data-act="remove"]').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await touch('touchStart', removePt.x, removePt.y);
await page.waitForTimeout(60);
await touch('touchEnd', removePt.x, removePt.y);
await page.waitForTimeout(250);
s = await state();
check('Remove drops that run and closes the menu',
  s.sel === 0 && s.pins === 0 && !s.menu, s.stat);

// ── nothing native, ever ───────────────────────────────────────────────────

const native = await page.evaluate(() => String(getSelection()));
check('no native selection is ever created', native === '', JSON.stringify(native.slice(0, 40)));

const shell = await page.evaluate(() => ({
  docOverflow: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
  bodyOverscroll: getComputedStyle(document.body).overscrollBehaviorY,
  paneOverscroll: getComputedStyle(document.getElementById('pane')).overscrollBehaviorY,
  userSelect: getComputedStyle(document.body).webkitUserSelect || getComputedStyle(document.body).userSelect,
}));
check('the document itself has no scrollable overflow', shell.docOverflow === 0, `overflow=${shell.docOverflow}`);
check('overscroll is contained at both levels',
  shell.bodyOverscroll === 'none' && shell.paneOverscroll === 'contain', JSON.stringify(shell));
check('native selection is disabled at the root', shell.userSelect === 'none', `user-select=${shell.userSelect}`);

check('the page raised no errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
