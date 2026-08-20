#!/usr/bin/env node
// The docked deck gives the width back when it closes.
//
//   node tools/test/deck-dock-reflow.mjs
//
// Two facts drive the dock's reflow and they have different lifetimes, which is
// the whole content of this check. `data-deck-pane="dock"` is the reader's
// standing PREFERENCE: it is stored, and it should outlive any one deck, since
// someone who wants the list beside the file wants it on the next file too.
// `data-deck-open` is the deck's LIFETIME, which only the kit knows.
//
// Keying `main`'s padding-right on the preference alone (PR #462, fixed
// 2026-08-20) left the app squeezed by the width of a deck that was no longer
// there: on every view, since main is shared, and across reloads, since the
// preference is in localStorage. It reads as a rendering bug with no bad frame
// to catch, because nothing is animating and the deck is gone.
//
// So the assertion is a sequence rather than a state: padded while open and
// docked, ZERO once closed, and the preference still recorded either way.
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
// Wide enough that the dock's media query applies at all; below lg there is no
// dock and the toggle does not render, so a narrow window would pass vacuously.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// The app's CDN dependencies have to be served from disk. Without this the
// sandbox blocks jsDelivr, Alpine never initializes, and the host's pane hook
// is never installed: the probe then times out on __deckPane and looks like a
// dock failure when it is a boot failure. resolveCdn is the same mapping every
// other browser check here uses.
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
  // The kit rides in the pre-build's cache, so this runs without network.
  await page.evaluate(() => window.gh.load('kits/swipe-deck.js'));
  await page.waitForFunction(() => !!window.swipeDeck, { timeout: 30000 });
  // The host installs the pane hook from its Alpine init, so it lands after the
  // kit does; without this the probe races the boot rather than the dock.
  await page.waitForFunction(() => typeof window.__deckPane === 'function', { timeout: 30000 });

  const steps = await page.evaluate(async () => {
    const root = document.documentElement, main = document.querySelector('main');
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const snap = () => ({ pane: root.dataset.deckPane || '',
                          open: root.hasAttribute('data-deck-open'),
                          pad: parseFloat(getComputedStyle(main).paddingRight) || 0,
                          decks: window.swipeDeck.stack.length });
    const out = {};
    out.before = snap();
    const d = window.swipeDeck.open({ total: 1, render: (i, el) => { el.textContent = 'slide'; }, start: 0 });
    await wait(100); out.open = snap();
    window.__deckPane('dock');
    await wait(300); out.docked = snap();
    d.close();
    await wait(450); out.closed = snap();
    return out;
  });

  ok('no padding before any deck', steps.before.pad === 0, `got ${steps.before.pad}`);
  ok('a deck marks the root open', steps.open.open && steps.open.decks === 1);
  ok('docked and open reflows main', steps.docked.pane === 'dock' && steps.docked.pad > 0,
     `pane=${steps.docked.pane} pad=${steps.docked.pad}`);
  ok('closing the deck gives the width back', steps.closed.pad === 0,
     `pad=${steps.closed.pad} (the regression: main stays squeezed by a deck that is gone)`);
  ok('closing clears the open flag', !steps.closed.open && steps.closed.decks === 0);
  ok('the dock PREFERENCE survives the close', steps.closed.pane === 'dock',
     `pane=${steps.closed.pane} (it is stored on purpose; the next file opens docked)`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall passed');
process.exit(failures.length ? 1 : 0);
