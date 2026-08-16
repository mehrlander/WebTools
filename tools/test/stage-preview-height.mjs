#!/usr/bin/env node
// The stage preview's height, measured across items of very different sizes.
//
//   node tools/test/stage-preview-height.mjs
//
// Two claims, and they were one bug. The modal used to be `sm:h-auto` with a
// `max-h-[85vh]` cap, so it sized itself to its content: stepping from a
// two-line paste to a long file resized the dialog under the reader, and an
// auto-height box gave its children no definite height to divide, so the
// viewer's `fill` body never became a scroll container and the box's own
// `overflow-hidden` clipped whatever exceeded the cap with no scrollbar
// anywhere. Pinning the height fixes both, which is why one check covers both:
//
//   1. the box is the same height on a 2-line file and a 4,000-line file
//   2. the long one scrolls INSIDE it (scrollHeight > clientHeight on a real
//      scroll container, and that container actually moves when scrolled)
//
// Neither is visible in a screenshot, and neither is reachable from jsdom,
// which has no layout. Desktop only: the phone case is `h-full` and was never
// in question.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = 'app/index.html';

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || PAGE;
  try {
    const body = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': typeFor(rel) });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// Same interception the screenshot harness uses, and it has to be the same:
// resolveCdn is synchronous and classifies into continue / empty / fulfill, so
// treating a falsy return as a miss serves an empty body for every lib file
// and the page never boots.
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(base)) return route.continue();
  const r = resolveCdn(url, root);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

await page.goto(`${base}/${PAGE}?view=stage`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[x-data*="stager"]', { timeout: 20000 });

// Two local text items at opposite extremes, staged directly: the intake path
// is covered by tools/test/stage.test.mjs, and what is under test is layout.
await page.evaluate(() => {
  const data = window.Alpine.$data(document.querySelector('[x-data*="stager"]'));
  const long = Array.from({ length: 4000 }, (_, i) => 'line ' + i + ' of a file that must scroll').join('\n');
  window.Alpine.store('browser').stage = [
    { local: true, id: 1, name: 'short.txt', path: 'short.txt', size: 12, isText: true, text: 'one\ntwo' },
    { local: true, id: 2, name: 'long.txt', path: 'long.txt', size: long.length, isText: true, text: long },
  ];
  window.__data = data;
});

const boxHeight = async (i) => {
  await page.evaluate((n) => window.__data.previewAt(n, 'file'), i);
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    // STRUCTURAL, not by class name. Selecting the box by the very class the
    // fix added would make this pass for the wrong reason and report nothing
    // useful when it failed: it would miss the box entirely rather than
    // measure the height that moved. The viewer sits inside the swipe pane,
    // which sits inside the box.
    const box = document.getElementById('stage-preview-viewer')?.parentElement?.parentElement;
    return box ? Math.round(box.getBoundingClientRect().height) : -1;
  });
};

const short = await boxHeight(0);
const long = await boxHeight(1);
check(short > 0 && long > 0, `the modal box is measurable (short ${short}px, long ${long}px)`);
check(short === long, `the box is the same height on both items (${short} vs ${long})`);
check(short > 500, `the box holds a useful height rather than shrinking to content (${short}px of a 900px window)`);

// The long file must scroll inside the box, not be clipped by it. Find the
// deepest scrollable descendant and prove it actually moves.
const scroll = await page.evaluate(() => {
  const box = document.querySelector('[class*="sm:h-[85vh]"]');
  if (!box) return null;
  const els = [box, ...box.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 4);
  if (!els.length) return { found: 0 };
  const el = els[els.length - 1];
  const before = el.scrollTop;
  el.scrollTop = 200;
  return { found: els.length, moved: el.scrollTop > before, over: el.scrollHeight - el.clientHeight };
});
check(!!scroll && scroll.found > 0, `the long file has a scroll container (${scroll?.found ?? 0} found)`);
check(!!scroll?.moved, `that container actually scrolls (${scroll?.over ?? 0}px of overflow)`);

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} failure(s)` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
