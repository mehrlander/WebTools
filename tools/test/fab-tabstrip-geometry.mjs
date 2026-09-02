#!/usr/bin/env node
// The tab strip does not move, proved by measuring it in a real browser.
//
//   node tools/test/fab-tabstrip-geometry.mjs
//
// This is the whole reason the strip is shaped the way it is, and it is not a
// claim jsdom can settle: it is about laid-out pixels at a phone width, and
// jsdom lays nothing out (every getBoundingClientRect there is zero). So it
// lives here rather than in tools/test/fab-text.test.mjs, which owns the same
// component's behavior and keeps `npm test` browser-free.
//
// WHAT IS BEING PROVED. A tab strip is a spatial memory: the third icon is
// Traffic, always, and a reader who has used it twice reaches for a position
// rather than reading a row. That only holds if the positions are constant, so
// the icons must occupy identical coordinates in every tab state.
//
// It has been wrong once, which is why this exists. The first fix for fitting a
// fifth tab put the active tab's label INSIDE its button. That fits, and it
// reflows: the label grows in whichever button is selected and every icon to
// its right shifts. Measured at 390px before the fix, five tab states produced
// five distinct layouts and an icon travelled up to 49px between two of them,
// which is about 1.6 icon widths, far enough to put a different tab under the
// finger that just tapped. After the fix, one layout.
//
// The label now sits in a fixed-width slot at the left of the strip. The slot
// is sized to the longest label rather than to its content, so this check also
// fails if that width is made to fit the text: a slot that resizes is the same
// bug moved one element to the left.
//
// Served from the working tree over loopback, with every off-origin request
// resolved by the shared resolver, so it runs offline with no token. Exits
// nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = 'pages/shorter.html';
const WIDTH = 390;           // an iPhone's CSS width, where the strip is tightest
const TABS = ['render', 'inspect', 'traffic', 'text'];   // Notes left the strip on 2026-08-25 (the annotate card reads the set)

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg); };

const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const fp = path.join(repoRoot, p);
    if (!fp.startsWith(repoRoot)) { res.writeHead(403).end(); return; }
    const body = await readFile(fp);
    res.writeHead(200, { 'Content-Type': typeFor(fp) }).end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(String(e.message || e));
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 700 } });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    const r = resolveCdn(url, repoRoot, null);
    if (r.kind === 'continue') return route.continue();
    if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
    return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
  });
  await page.goto(`${origin}/${PAGE}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.Alpine && [...document.querySelectorAll('[x-data]')]
      .some(e => (e.getAttribute('x-data') || '').startsWith('fab')),
    null, { timeout: 20000 });
  await page.click('[aria-label="Web-tools panel"]');
  await page.waitForTimeout(800);

  const layouts = [];
  for (const tab of TABS) {
    await page.evaluate((t) => {
      const el = [...document.querySelectorAll('[x-data]')]
        .find(e => (e.getAttribute('x-data') || '').startsWith('fab'));
      window.Alpine.$data(el).setTab(t);
    }, tab);
    await page.waitForTimeout(250);
    layouts.push(await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')]
        .map(b => Math.round(b.getBoundingClientRect().x))));
  }

  check(layouts.every(l => l.length === TABS.length),
    `every tab state renders all ${TABS.length} tabs`);

  const distinct = new Set(layouts.map(l => l.join(','))).size;
  check(distinct === 1,
    `the icons hold one set of coordinates across all tab states (saw ${distinct})`);
  if (distinct !== 1) {
    TABS.forEach((t, i) => console.log(`        ${t.padEnd(9)} ${layouts[i].join(', ')}`));
    const base = layouts[0];
    const worst = Math.max(...layouts.map(l => Math.max(...l.map((x, i) => Math.abs(x - base[i])))));
    console.log(`        furthest travel: ${worst}px`);
  }

  // The strip has to still FIT, since a stable layout that overflows has only
  // traded one failure for a quieter one. The last tab's right edge must clear
  // the controls parked at the right of the header.
  const room = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const last = tabs[tabs.length - 1].getBoundingClientRect();
    const header = tabs[0].closest('header').getBoundingClientRect();
    const ctrl = [...document.querySelectorAll('header .btn-square')]
      .map(b => b.getBoundingClientRect().x).filter(x => x > 0);
    return { lastRight: Math.round(last.right), header: Math.round(header.right),
             firstControl: ctrl.length ? Math.round(Math.min(...ctrl)) : null };
  });
  check(room.firstControl == null || room.lastRight < room.firstControl,
    `the last tab clears the header controls (tab ends ${room.lastRight}, controls start ${room.firstControl})`);
  check(room.lastRight <= room.header,
    `no tab is pushed past the drawer's right edge (${room.lastRight} of ${room.header})`);
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}

if (fails.length) { console.error(`\n${fails.length} failure(s)`); process.exit(1); }
console.log('\nall checks passed');
