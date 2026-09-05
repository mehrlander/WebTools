#!/usr/bin/env node
// The peek card's head links the file it is showing, and the link is clickable.
//
//   node tools/test/peek-head-link.mjs
//
// TWO CLAIMS, and the second is the one that needed a browser. The first is
// pure and gated in tools/test/source-peek.test.mjs: frame() emits one anchor
// at the address's blob URL, and none at all for a key that names no repo.
//
// The second cannot be asserted without a real pointer. A card the reader can
// enter is a card whose link they will click, and mousedown FOCUSES an anchor
// before the click resolves. source-peek's focusin handler dismissed on any
// focus outside a [data-peek] trigger, so the first press hid the card out from
// under the pointer and the click never fired: a link that renders, invites the
// press, and does nothing. Nothing in the pure half can see that, because the
// defect is in the listener rather than in the markup.
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

const ADDR = 'me/web-tools@main:docs/SURFACING.md';
const BLOB = 'https://github.com/me/web-tools/blob/main/docs/SURFACING.md';

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  // github.com is served rather than reached, so the popup the click opens
  // commits to a URL this check can read. The sandbox blocks it either way.
  if (url.startsWith('https://github.com/'))
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>gh</title>' });
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});

try {
  await page.goto(`${origin}/app/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SourcePeek?.install && window.RepoAddress, { timeout: 30000 });

  // A headless run that reports no hover never opens a card, and every
  // assertion below would pass vacuously against a card that is not there.
  const hoverable = await page.evaluate(() =>
    matchMedia('(hover:hover) and (pointer:fine)').matches);
  ok('the run reports a hovering pointer', hoverable,
     'without it the card never opens and the rest of this check is vacuous');

  // Two triggers in open space: one exact-file address, one key that is not an
  // address (the shape the stage seeds for a pasted file). Seeded, so neither
  // reaches the network.
  await page.evaluate(({ addr, blob }) => {
    window.SourcePeek.seed(addr, '# Surfacing\n\nOne render path.\n');
    window.SourcePeek.seed('pasted-notes.md', '# Pasted\n\nLocal bytes.\n');
    const mk = (id, key, href) => {
      const a = document.createElement('a');
      a.id = id;
      a.setAttribute('data-peek', key);
      if (href) { a.href = href; a.target = '_blank'; }
      a.textContent = '●';
      a.style.cssText = 'position:fixed;z-index:90;left:40px;top:' +
        (id === 'probe-addr' ? '40' : '90') + 'px;font-size:20px';
      document.body.appendChild(a);
    };
    mk('probe-addr', addr, blob);
    mk('probe-key', 'pasted-notes.md', '');
  }, { addr: ADDR, blob: BLOB });

  const openOn = async (sel) => {
    await page.locator(sel).hover();
    await page.waitForFunction(
      () => { const c = document.getElementById('wt-source-peek');
              return c && c.style.display !== 'none' && c.querySelector('.truncate'); },
      { timeout: 5000 });
    await page.waitForTimeout(150);
  };

  await openOn('#probe-addr');
  const head = await page.evaluate(() =>
    document.getElementById('wt-source-peek').firstElementChild.outerHTML);
  ok('the card head carries one mark', (head.match(/<a /g) || []).length === 1,
     head.slice(0, 240));
  ok('the mark points at the address the head names', head.includes(`href="${BLOB}"`),
     head.slice(0, 240));

  // THE REGRESSION. A real press, not a dispatched click: the defect lives in
  // the focus that mousedown causes, which a synthetic click never produces.
  const [popup] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null),
    page.click('#wt-source-peek a'),
  ]);
  ok('pressing the mark opens the file', !!popup,
     'no page opened: the card was hidden by the focus the press caused');
  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    ok('and opens the address, not somewhere else', popup.url() === BLOB, popup.url());
    await popup.close();
  }
  // Still open under the pointer that pressed it, which is what makes a second
  // press possible at all.
  ok('the card survives its own link being pressed', await page.evaluate(() =>
    document.getElementById('wt-source-peek')?.style.display !== 'none'));

  // A key that names no repo gets no mark. The pure test asserts frame()'s
  // output; this asserts the card the reader actually sees.
  await page.mouse.move(900, 700);
  await page.waitForTimeout(300);
  await openOn('#probe-key');
  const localHead = await page.evaluate(() =>
    document.getElementById('wt-source-peek').firstElementChild.outerHTML);
  ok('a non-address key gets no mark', !localHead.includes('<a '), localHead.slice(0, 240));
  ok('and still reads as the file it names', localHead.includes('pasted-notes.md'),
     localHead.slice(0, 240));
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall passed');
process.exit(failures.length ? 1 : 0);
