#!/usr/bin/env node
// The token-less review link, end to end.
//
//   node tools/test/stage-gz-review.mjs
//
// A #gz= stage link carries its own text, so a reader with no ghToken and no
// access to the repo can still open the comparison. tools/test/stage.test.mjs
// holds the mint and the round trip in jsdom; what it cannot reach is the OPEN
// path, which needs a real CompressionStream, a real boot, and a real proof
// that nothing was fetched. Three claims, and the third is the whole point:
//
//   1. both pasted files land in the stage from the fragment alone
//   2. mode=diff runs the compare on open, and prompts= rides along
//   3. all of it holds with api.github.com hard-blocked and localStorage empty
//
// The block is what makes claim 3 mean anything. Counting requests would not:
// the shell reads its own repo on boot to orient itself (README, .web-tools.json,
// the tracker board), so a count is never zero and says nothing about whether
// the LINK needed the network. Failing every one of those calls and watching
// the comparison open anyway is the same claim without the ambiguity.
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

const BEFORE = 'The stage carries refs only.\nContent stays behind the token.\n';
const AFTER  = 'The stage carries refs and text.\nContent stays behind the token.\n';
const ASK = 'Did the first line change meaning, or only wording?';

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || PAGE;
  try {
    const body = await readFile(path.join(root, rel));
    res.writeHead(200, { 'Content-Type': typeFor(rel) });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();

// Same interception the screenshot harness uses: resolveCdn classifies into
// continue / empty / fulfill, and a falsy return served as a miss would empty
// every lib file and the page would never boot. `blockApi` is the one addition.
const context = async (blockApi) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (blockApi && url.includes('api.github.com')) return route.abort();
    if (url.startsWith(base)) return route.continue();
    const r = resolveCdn(url, root);
    if (r.kind === 'continue') return route.continue();
    if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
    return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
  });
  return ctx;
};

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const stager = async (page) => {
  await page.waitForSelector('[x-data*="stager"]', { timeout: 20000 });
  return page.evaluateHandle(() => window.Alpine.$data(document.querySelector('[x-data*="stager"]')));
};

// ── mint ───────────────────────────────────────────────────────────────────
// Minting is browser-side (gzip via CompressionStream), so the link is built in
// one context and opened in another, which is also what a handover is.
const mintCtx = await context(false);
const minter = await mintCtx.newPage();
await minter.goto(`${base}/${PAGE}?view=stage`, { waitUntil: 'domcontentloaded' });
await stager(minter);
const link = await minter.evaluate(async ([before, after, ask]) =>
  window.StageLink.mintWithLocals(
    [{ local: true, isText: true, name: 'before.md', text: before },
     { local: true, isText: true, name: 'after.md', text: after }],
    '', { mode: 'diff', prompts: [{ label: 'First line', ask }] }),
  [BEFORE, AFTER, ASK]);
await mintCtx.close();

check(link.startsWith('#gz='), 'a stage of only pasted text mints on the gz key: ' + link.slice(0, 12));
check(link.includes('&mode=diff'), 'the diff intent rides the link');
check(link.includes('&prompts='), 'the bespoke ask rides the link');
console.log('     link is ' + link.length + ' characters');

// ── open, with the API blocked and nothing stored ──────────────────────────
const readCtx = await context(true);
const reader = await readCtx.newPage();
await reader.goto(`${base}/${PAGE}?view=stage${link}`, { waitUntil: 'domcontentloaded' });
await stager(reader);

await reader.waitForFunction(
  () => window.Alpine.store('browser').stage.length >= 2, null, { timeout: 20000 });
const staged = await reader.evaluate(() =>
  window.Alpine.store('browser').stage.map(it => ({ name: it.name, local: !!it.local, text: it.text })));
check(staged.length === 2, 'both pasted files land from the fragment (got ' + staged.length + ')');
check(staged.every(it => it.local), 'both land as local items, not refs');
check(staged[0]?.text === BEFORE && staged[1]?.text === AFTER, 'the text survives byte for byte');

const d = await stager(reader);
check(await d.evaluate((o, ask) => (o.linkPrompts || []).some(p => p.ask === ask), ASK),
      'the bespoke ask is in the panel');
check(await reader.evaluate(() => { try { return !localStorage.getItem('ghToken'); } catch { return true; } }),
      'no token is stored in the reader');

await reader.waitForFunction(
  () => { const el = document.querySelector('[x-data*="stager"]');
          return el && window.Alpine.$data(el).diffRows; }, null, { timeout: 20000 }).catch(() => {});
const rows = await d.evaluate(o => o.diffRows);
check(Array.isArray(rows) && rows.length > 0, 'mode=diff ran the compare on open, no click');
check(!!rows && rows.some(r => r.t === 'add') && rows.some(r => r.t === 'del'),
      'the compare found the one changed line');

await browser.close();
server.close();
console.log(fails.length ? '\n' + fails.length + ' failed' : '\nall passed');
process.exit(fails.length ? 1 : 0);
