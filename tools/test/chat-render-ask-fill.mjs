#!/usr/bin/env node
// The ask's fill is a rectangle that clears the glyph and stops at the longest
// line, proved by measuring it in a real browser.
//
//   node tools/test/chat-render-ask-fill.mjs
//
// Both halves are claims about laid-out pixels, so neither is one jsdom can
// settle: there every getBoundingClientRect is zero and a Range returns no
// client rects at all, which is exactly what the width pass reads. So the
// constants live under tools/test/chat-render-dense.test.mjs, which owns dense
// mode's structure and keeps `npm test` browser-free, and the geometry lives
// here.
//
// WHAT IS BEING PROVED, and each half has been wrong once.
//
// AIR AFTER THE GLYPH. The gutter shipped at 10px against an 11px glyph box, so
// the fill began one pixel INSIDE the icon and arrived touching it. That reads
// as one object, which is what the gutter was introduced to stop; the version
// before it ran the tint across the icon outright. The gutter is LEAD_INDENT
// now, so the fill's left edge lands on the column every other role's text
// starts at, and this fails if either number moves without the other.
//
// A RECTANGLE THAT ENDS AT THE TEXT. A block-level tint takes its container's
// width, so an ask closing on three words sat under a bar of colour running the
// whole card. There is no CSS for "as wide as the widest line": fit-content
// resolves to max-content for a paragraph, meaning the whole turn on one line,
// and clamps straight back. So the width is measured and pinned, and the two
// ways that goes wrong are both checked here: slack left on the right (the pin
// did not happen), and text re-wrapped by the pin itself (it should not, since
// every line already fits inside the widest one).
//
// The long-paste footer is the one body the pin has to decline: its size, its
// spacer and its two buttons are a row whose width is a SUM, and no single text
// run in it measures the whole, so pinning to the widest run would squeeze it.
// Unreachable from the estate's card, whose turns arrive cut to TURN_HEAD, but
// reachable through the kit, so the guard is checked too.
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
const WIDTH = 560;           // the reply card's own bound, near enough

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg); };

// A short ask, one that wraps, and one whose last line is three words: the
// shapes the pin has to get right. Plus a long paste, over RAW_INLINE, which is
// the body it has to leave alone.
const ASKS = [
  { name: 'one word', md: 'go 2' },
  { name: 'one line', md: 'What are we even seeing here?' },
  { name: 'wraps, short last line',
    md: "I think you could make that check, and that sounds fine. I'm interested, "
      + 'though, to focus on what we actually see here in this tab and, possibly '
      + 'more broadly, about the map view.\n\nMy first question is: what then?' },
];
const PASTE = { name: 'long paste', md: 'tiny\n'.repeat(500) + 'x' };

const PAGE = `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5,npm/@tailwindcss/typography/dist/typography.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web"></script>
<style>body{margin:0}#card{width:fit-content;max-width:${WIDTH}px;padding:10px 12px}</style>
</head><body><div id="card" class="flex flex-col"></div>
<script type="module">
  try {
    await import('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/gh-api.js');
    await gh.load('kits/url-params.js');
    await gh.load('kits/proof.js');
    await gh.load('kits/swipe-deck.js');
    await gh.load('kits/chat-render.js');
    await window.chatRender.ready();
    window.__cr = window.chatRender;
    window.__ready = true;
  } catch (e) { window.__boot = String(e && e.message || e); }
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE); return; }
  try {
    const fp = path.join(repoRoot, p);
    if (!fp.startsWith(repoRoot)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': typeFor(fp) }).end(await readFile(fp));
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(String(e.message || e));
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// One ask and one reply, mounted the way lib/alpineComponents/estate.js mounts
// them, then measured. Everything is relative to the card's content edge, which
// is where a turn's own left edge sits.
const measure = async (page, md) => page.evaluate((md) => {
  const card = document.getElementById('card');
  card.replaceChildren();
  const ask = window.__cr.message({ role: 'user', md }, { collapse: 0, dense: true });
  const reply = window.__cr.message({ role: 'assistant', md: 'The reply, in prose, long enough to hold the card open at its bound.' },
    { collapse: 0, dense: true });
  reply.className += ' mt-1.5';
  card.append(ask, reply);
  return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => {
    const base = card.getBoundingClientRect().left + 12;
    const rel = v => +(v - base).toFixed(1);
    const runs = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), rg = document.createRange();
      const out = [];
      while (w.nextNode()) {
        if (!w.currentNode.textContent.trim()) continue;
        rg.selectNodeContents(w.currentNode);
        for (const r of rg.getClientRects()) if (r.width) out.push(r);
      }
      return out;
    };
    const fill = ask.querySelector('.relative');
    const icon = ask.querySelector('i.ph');
    const lines = runs(fill);
    const replyLines = runs(reply.querySelector('.relative'));
    const f = fill.getBoundingClientRect();
    done({
      iconRight: rel(icon.getBoundingClientRect().right),
      fillLeft: rel(f.left),
      fillRight: rel(f.right),
      textRight: rel(Math.max(...lines.map(r => r.right))),
      lineCount: lines.length,
      replyTextLeft: rel(Math.min(...replyLines.map(r => r.left))),
      hasFooter: !!ask.querySelector('button'),
      overflows: fill.scrollWidth > fill.clientWidth + 1,
    });
  })));
}, md);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: 900 } });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    const r = resolveCdn(url, repoRoot, null);
    if (r.kind === 'continue') return route.continue();
    if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
    return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
  });
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready || window.__boot, null, { timeout: 30000 });
  const boot = await page.evaluate(() => window.__boot);
  if (boot) throw new Error('page did not boot: ' + boot);
  // The icon font decides the glyph's width and the reply's inline lead, so a
  // measurement taken before it lands reads an 8.6px glyph and a text column
  // 2.4px left of where it settles. Wait for the faces, then throw one render
  // away: the first mount is also the first layout of the prose styles.
  await page.evaluate(() => document.fonts.ready);
  await measure(page, 'warm up');

  // The pin's own padding, read once off the simplest ask rather than restated
  // here: the check is that the right edge carries the same air as the left,
  // not that either equals a number this file happens to know.
  let pad = null;

  for (const { name, md } of ASKS) {
    const m = await measure(page, md);
    console.log(`\n  ${name}: icon ends ${m.iconRight}, fill ${m.fillLeft} → ${m.fillRight}, `
      + `text ends ${m.textRight}, ${m.lineCount} line box(es)`);
    check(m.fillLeft > m.iconRight, `${name}: the fill starts clear of the glyph`);
    check(m.fillLeft === m.replyTextLeft,
      `${name}: and starts on the reply's text column (${m.fillLeft} vs ${m.replyTextLeft})`);
    const slack = +(m.fillRight - m.textRight).toFixed(1);
    if (pad === null) pad = slack;
    check(Math.abs(slack - pad) <= 1,
      `${name}: the fill ends one padding past the longest line (${slack}px, expected ~${pad}px)`);
    check(m.fillRight < WIDTH - 12,
      `${name}: and short of the column it sits in, so the tint is not a bar`);
  }

  // A pin that changed the wrapping would be a pin that moved the text it was
  // measuring. The wrapping ask is the one with something to lose.
  const wrapped = ASKS[2];
  const withPin = await measure(page, wrapped.md);
  const noPin = await page.evaluate((md) => {
    const card = document.getElementById('card');
    card.replaceChildren();
    const ask = window.__cr.message({ role: 'user', md }, { collapse: 0, dense: true });
    card.append(ask);
    const fill = ask.querySelector('.relative');
    return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.width = '';        // undo the pin, keep everything else
      requestAnimationFrame(() => {
        const w = document.createTreeWalker(fill, NodeFilter.SHOW_TEXT), rg = document.createRange();
        let n = 0;
        while (w.nextNode()) {
          if (!w.currentNode.textContent.trim()) continue;
          rg.selectNodeContents(w.currentNode);
          n += [...rg.getClientRects()].filter(r => r.width).length;
        }
        done(n);
      });
    })));
  }, wrapped.md);
  console.log(`\n  line boxes: ${noPin} unpinned, ${withPin.lineCount} pinned`);
  check(withPin.lineCount === noPin, 'the pin does not re-wrap the text it measured');

  // The body the pin declines.
  const paste = await measure(page, PASTE.md);
  console.log(`\n  ${PASTE.name}: footer ${paste.hasFooter}, fill ${paste.fillLeft} → ${paste.fillRight}, `
    + `widest run ends ${paste.textRight}`);
  check(paste.hasFooter, 'the long paste grows the footer row');
  check(!paste.overflows, 'and the fill is not squeezed under it');
  check(paste.fillRight - paste.textRight > 12,
    'because the pin stood down rather than cutting to the widest single run');
} finally {
  await browser.close();
  server.close();
}

if (fails.length) { console.error(`\n${fails.length} failure(s)`); process.exit(1); }
console.log('\nall checks passed');
