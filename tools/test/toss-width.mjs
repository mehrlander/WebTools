#!/usr/bin/env node
// The forced frame width, measured from inside the rendered page.
//
//   node tools/test/toss-width.mjs
//
// The claim the width bar makes is that a frame IS a viewport, so a page
// rendered at ?w=390 in a 1280px window really is laid out at 390: its
// innerWidth reads 390, and a `(max-width: 640px)` rule matches. Nothing here
// can be checked from the shell, because the shell's own window never changes
// size; the only honest measurement is the one the framed document takes of
// itself. So the subject is a probe page fulfilled at the contents API that
// reports its own three numbers, the same shape tools/test/toss-multiparam.mjs
// uses for the params shim.
//
// It also pins the direction that has no other witness: a width WIDER than the
// window (1280 in a 500px browser) still lays out at 1280 and is scaled down to
// fit, rather than laying out at 500 and scrolling.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROBE_PATH = 'pages/__probe-width.html';
const ADDR = `mehrlander/web-tools@main:${PROBE_PATH}`;

// Everything a width claim rests on, read by the page about itself: the layout
// viewport, the breakpoint a stylesheet would branch on, and the pointer type,
// which is the one a width is NOT allowed to move.
const PROBE_HTML = `<!doctype html><html><head><title>probe</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
</head><body>
<script>
  window.__probe = {
    inner: window.innerWidth,
    docEl: document.documentElement.clientWidth,
    narrow: matchMedia('(max-width: 640px)').matches,
    wide: matchMedia('(min-width: 1280px)').matches,
    coarse: matchMedia('(pointer: coarse)').matches,
  };
  document.title = JSON.stringify(window.__probe);
<\/script>
</body></html>`;

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
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.route('**/*', route => {
  const url = route.request().url();
  if (url.includes(`/contents/${PROBE_PATH}`)) {
    return route.fulfill({
      status: 200, contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ content: Buffer.from(PROBE_HTML).toString('base64'),
                             encoding: 'base64', sha: 'local', size: PROBE_HTML.length }),
    });
  }
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

async function probe(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const f of page.frames()) {
    const got = await f.evaluate(() => window.__probe).catch(() => null);
    if (got) return got;
  }
  return null;
}

// What the shell did to the frame element, which is the other half: the page
// reports its own layout, this reports the box it was given.
const frameBox = () => page.evaluate(() => {
  const f = document.getElementById('frame');
  return { w: f.style.width, transform: f.style.transform, overflow: document.body.style.overflow };
});

try {
  console.log('no ?w= (the control):');
  const bare = await probe(`${origin}/pages/toss-render.html#gh=${ADDR}`);
  ok('the page rendered', !!bare, 'no probe report; the frame did not run');
  if (bare) {
    ok('it takes the window width', bare.inner === 1280, String(bare.inner));
    ok('and reads as wide', bare.wide === true && bare.narrow === false, JSON.stringify(bare));
  }

  console.log('?w=390 in a 1280px window (desktop showing a phone):');
  const phone = await probe(`${origin}/pages/toss-render.html?w=390#gh=${ADDR}`);
  ok('the page rendered', !!phone);
  if (phone) {
    ok('innerWidth is the forced width', phone.inner === 390, String(phone.inner));
    ok('documentElement agrees', phone.docEl === 390, String(phone.docEl));
    ok('a max-width:640 rule matches', phone.narrow === true, JSON.stringify(phone));
    ok('a min-width:1280 rule does not', phone.wide === false, JSON.stringify(phone));
    // The honest limit, pinned so it cannot quietly start being claimed.
    ok('pointer is untouched (still fine)', phone.coarse === false, JSON.stringify(phone));
  }
  const box = await frameBox();
  ok('the frame is sized, not scaled, when it fits', box.w === '390px' && box.transform === 'scale(1)',
     JSON.stringify(box));

  console.log('?w=1280 in a 500px window (a phone showing a desktop):');
  await page.setViewportSize({ width: 500, height: 800 });
  const desk = await probe(`${origin}/pages/toss-render.html?w=1280#gh=${ADDR}`);
  ok('the page rendered', !!desk);
  if (desk) {
    ok('it lays out at 1280, not 500', desk.inner === 1280, String(desk.inner));
    ok('a min-width:1280 rule matches', desk.wide === true, JSON.stringify(desk));
  }
  const wideBox = await frameBox();
  ok('the frame is scaled down to fit', /^scale\(0\.39/.test(wideBox.transform), JSON.stringify(wideBox));
  ok('and the body stops scrolling sideways', wideBox.overflow === 'hidden', JSON.stringify(wideBox));

  console.log('a width with nothing rendered under it:');
  // The width is applied at boot, before any render, so the input panel can be
  // all the viewer ever sees. It has to keep its own scrolling.
  await page.goto(`${origin}/pages/toss-render.html?w=1280`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const idle = await page.evaluate(() => ({
    overflow: document.body.style.overflow,
    panel: !document.getElementById('empty').classList.contains('hidden'),
    w: window.__tossWidthNow,
  }));
  ok('the panel is showing', idle.panel === true, JSON.stringify(idle));
  ok('the width is held for the next render', idle.w === 1280, JSON.stringify(idle));
  ok('and the body is left able to scroll', idle.overflow === '', JSON.stringify(idle));

  console.log('the address stays honest:');
  await probe(`${origin}/pages/toss-render.html?w=1280#gh=${ADDR}`);
  const url = await page.evaluate(() => location.search);
  ok('?w= survives on the address bar', url.includes('w=1280'), url);
  const cleared = await page.evaluate(() => { window.__tossWidth(0); return location.search; });
  ok('and clears when the width does', !cleared.includes('w='), cleared);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
