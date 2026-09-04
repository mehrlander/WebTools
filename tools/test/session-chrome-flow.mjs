#!/usr/bin/env node
// pages/session.html keeps its chrome on screen while the document scrolls.
//
//   node tools/test/session-chrome-flow.mjs
//
// The page has had its scroll shape wrong twice. On 2026-09-02 it was an app
// shell (`h-[100dvh] … overflow-hidden`) over a component that sized to its
// content, so a record taller than the viewport was clipped with nothing to
// scroll. The fix let the document scroll, and left the other half of the house
// style's shape for an embeddable page unbuilt: `min-h-dvh` plus STICKY CHROME
// (daisy-alpine rule 5). Nothing was sticky, so at 390x844 the tab row sat
// 189px above the fold at the bottom of the scroll, Raw laid 243 KB out as a
// single 40,528px block, and Pick all revealed an export bar 612px BELOW the
// fold with nothing on screen to say it existed.
//
// Both failures are laid-out pixels over a real scroll, so neither jsdom nor a
// class-level read can hold them: what is asserted here is where a box LANDS
// after the page is scrolled, which is the only statement of the rule that
// cannot pass while the page is broken.
//
// Phone width on purpose. At 1280 the head is short enough that the whole page
// fits and every assertion below passes vacuously.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
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

// A record carried IN the address, so this needs no token and no store: #gz= is
// the page's own fallback for a reader who has neither. Twelve exchanges is
// what makes the outline taller than a phone; a shorter one would scroll
// nowhere and assert nothing.
const at = (m) => new Date(Date.UTC(2026, 8, 4, 13, m)).toISOString().replace(/\.\d+Z$/, 'Z');
const record = {
  schema: 4, short: 'ab12cd34', day: '2026-09-04',
  started: at(0), ended: at(134),
  agent_session: 'https://claude.ai/code/session_01SX',
  repos: [{ name: 'web-tools', branch: 'claude/scroll-1' }],
  opening_ask: 'the first ask', exchanges: 12, calls_total: 169, failures: 4,
  files_total: 0, files: {}, tokens: { output: 342268 },
  prompts: Array.from({ length: 12 }, (_, i) => ({ at: at(i * 10), text:
    `Ask ${i + 1}: a prompt long enough that its row wraps to more than one line on a phone.` })),
  replies: Array.from({ length: 12 }, (_, i) => ({ at: at(i * 10 + 5), text:
    `Reply ${i + 1}. Several sentences, so the card row has a body to summarise. `.repeat(4) })),
  calls: [],
};
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(record)))
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});

// Where a box sits against the viewport, plus every element that declares a
// scroll region of its own. The second is what catches the other way this can
// go wrong: pinning the chrome by nesting a scroller inside the document, which
// on a phone takes the drag away from the page.
const geometry = () => page.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  const shell = document.querySelector('#mount > div');
  const outline = shell?.querySelector('[x-ref="outline"] > div') || null;
  return {
    view: { h: innerHeight },
    doc: { h: document.documentElement.scrollHeight, y: Math.round(scrollY) },
    tabs: box(shell?.querySelector('[role="tablist"]')?.parentElement),
    chips: box([...document.querySelectorAll('span')]
      .find(e => e.textContent.trim() === 'Cards')?.parentElement),
    exportBar: box(outline?.lastElementChild),
    scrollers: [...document.querySelectorAll('*')]
      .filter(el => el.scrollHeight - el.clientHeight > 4 &&
        /auto|scroll/.test(getComputedStyle(el).overflowY))
      .map(el => (el.className || '').toString().slice(0, 40)),
  };
});

try {
  await page.goto(`${origin}/pages/session.html#gz=${gz}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#mount [role="tablist"]'), { timeout: 30000 });
  await page.waitForTimeout(1200);

  const top = await geometry();
  ok('the record is taller than the phone, so there is a scroll to test',
     top.doc.h > top.view.h + 200, `doc ${top.doc.h} vs view ${top.view.h}`);
  ok('the DOCUMENT is the scroller, with no nested region taking the drag',
     top.scrollers.length === 0, `nested: ${top.scrollers.join(' | ')}`);

  await page.evaluate(() => scrollTo(0, 99999));
  await page.waitForTimeout(400);
  const bottom = await geometry();
  ok('scrolled to the end, the tab row is still at the top of the screen',
     bottom.tabs && Math.abs(bottom.tabs.top) <= 1,
     `tabs at ${bottom.tabs?.top} (the regression: -189)`);
  ok("the outline's Cards chips pin directly under it, not off screen",
     bottom.chips && Math.abs(bottom.chips.top - bottom.tabs.bottom) <= 1,
     `chips at ${bottom.chips?.top}, tabs end at ${bottom.tabs?.bottom}`);

  await page.evaluate(() => scrollTo(0, 0));
  await page.click('text=Pick all');
  await page.waitForTimeout(600);
  const picked = await geometry();
  ok('picking every card puts the export bar ON screen',
     picked.exportBar && picked.exportBar.bottom <= picked.view.h + 1
       && picked.exportBar.top >= 0,
     `bar ${picked.exportBar?.top}–${picked.exportBar?.bottom} of ${picked.view.h}`);

  await page.click('[role="tab"]:has-text("Raw")');
  await page.waitForTimeout(1200);
  const raw = await geometry();
  ok('Raw clamps the record instead of laying it out as one long page',
     raw.doc.h < raw.view.h * 3, `doc ${raw.doc.h} (the regression: 40,528)`);
  ok('Raw scrolls the code inside its own box, under the chrome',
     raw.scrollers.length === 1, `scrollers: ${raw.scrollers.join(' | ') || 'none'}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) { console.error(`\n${failures.length} failing`); process.exit(1); }
console.log('\nall good');
