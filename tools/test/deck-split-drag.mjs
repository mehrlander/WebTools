#!/usr/bin/env node
// The docked deck's seam is draggable, and the list follows it.
//
//   node tools/test/deck-split-drag.mjs
//
// The jsdom test (dock-split.test.mjs) pins the kit's arithmetic and its event
// wiring. It cannot pin the half that only a browser has: that the handle is
// actually ON the seam and hit-testable there, that a real mouse drag moves
// both panes, and that `main`'s padding tracks the deck rather than lagging a
// frame behind it. Those are the three ways this can be correct in the unit
// test and wrong on screen.
//
// The sibling check (deck-dock-reflow.mjs) covers the dock's lifetime. This one
// assumes that works and asks only whether the split can be moved.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  try {
    const body = await readFile(path.join(root, rel));
    res.writeHead(200, { 'content-type': typeFor(rel) });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});

try {
  await page.goto(`${origin}/app/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.gh?.load && document.querySelector('main'), { timeout: 30000 });
  await page.evaluate(() => window.gh.load('kits/swipe-deck.js'));
  await page.evaluate(() => window.gh.load('kits/dock-split.js'));
  await page.waitForFunction(() => !!window.swipeDeck && !!window.dockSplit, { timeout: 30000 });
  await page.waitForFunction(() => typeof window.__deckWidth === 'function', { timeout: 30000 });

  await page.evaluate(async () => {
    window.__deck = window.swipeDeck.open({ total: 1, render: (i, el) => { el.textContent = 'slide'; }, start: 0 });
    window.__deckPane('dock');
    await new Promise(r => setTimeout(r, 350));
  });

  const seam = await page.$('.dk-split');
  ok('a docked deck grows a seam', !!seam);
  if (seam) {
    // Start from the middle. The default dock is already near the 80% ceiling
    // at this viewport, so a 200px drag from there measures the clamp rather
    // than the drag: the first run of this check read 128px of movement for a
    // 200px pull and looked like a broken splitter.
    await page.evaluate(async () => {
      window.__deckWidth(50, true);
      await new Promise(r => setTimeout(r, 200));
    });
    const before = await page.evaluate(() => ({
      left: document.querySelector('.sd-overlay').getBoundingClientRect().left,
      pad: parseFloat(getComputedStyle(document.querySelector('main')).paddingRight) || 0,
    }));

    // The drag itself, through the real input pipeline: if the handle is not
    // where it looks, or something above it swallows the press, this misses.
    const box = await seam.boundingBox();
    ok('the seam sits on the deck edge', Math.abs(box.x + box.width / 2 - before.left) < 4,
       `handle centre ${box.x + box.width / 2} vs edge ${before.left}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 200, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => ({
      left: document.querySelector('.sd-overlay').getBoundingClientRect().left,
      pad: parseFloat(getComputedStyle(document.querySelector('main')).paddingRight) || 0,
      stored: Number(localStorage.getItem('deckDockPct')) || 0,
      valuenow: Number(document.querySelector('.dk-split').getAttribute('aria-valuenow')) || 0,
    }));

    ok('dragging left widens the deck', after.left < before.left - 150,
       `left ${before.left} -> ${after.left}`);
    ok('and the list is given exactly what the deck took', Math.abs(after.pad - (1440 - after.left)) < 4,
       `pad ${after.pad} vs deck width ${1440 - after.left}`);
    ok('the release records the split for next time', after.stored >= 20 && after.stored <= 80,
       `stored ${after.stored}`);
    ok('the handle reports where it is', Math.abs(after.valuenow - after.stored) <= 1,
       `aria-valuenow ${after.valuenow} vs stored ${after.stored}`);

    // The clamp, through the pointer rather than the arithmetic: a pane dragged
    // past the end must stop, not vanish.
    const box2 = await (await page.$('.dk-split')).boundingBox();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.mouse.move(20, box2.y + box2.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const clamped = await page.evaluate(() =>
      Number(document.querySelector('.dk-split').getAttribute('aria-valuenow')) || 0);
    ok('a drag to the far edge clamps rather than swallowing the list', clamped === 80, `got ${clamped}`);

    // And it goes with the deck.
    await page.evaluate(async () => { window.__deck.close(); await new Promise(r => setTimeout(r, 450)); });
    ok('closing the deck takes the seam with it', !(await page.$('.dk-split')));
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall passed');
process.exit(failures.length ? 1 : 0);
