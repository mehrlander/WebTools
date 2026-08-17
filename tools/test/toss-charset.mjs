#!/usr/bin/env node
// Non-ASCII survives a payload toss.
//
//   node tools/test/toss-charset.mjs
//
// The regression this pins: toss-render mounts a payload as a blob: document,
// and a blob: document takes its encoding from the Blob's `type`. With no
// charset declared the browser sniffs, finds no <meta charset> in a page that
// never had one, and falls back to the locale default (windows-1252). The Blob
// is built from a JS string, so its bytes are always UTF-8, and the mismatch
// renders every non-ASCII character as its mojibake: 🎉 becomes ðŸŽ‰.
//
// It went unnoticed because the route this replaced was a data: URL that said
// ;charset=utf-8 in the URL itself. Moving the same payload to a blob dropped
// the declaration, and the pages that noticed are the ones with no <meta
// charset> of their own, which is most HTML arriving from a chat. Reported
// 2026-08-17 from a phone, rendering a snippet holding an emoji.
//
// Both assertions matter and neither implies the other. The declared type is
// the mechanism, checkable from the shell; the text in the frame is the
// outcome, and only the outcome tells you the reader sees the right thing.
// Payload mode is sandboxed without allow-same-origin, so the shell cannot
// read into the frame; Playwright can, because it drives the browser rather
// than the page.
//
// Scope: the two payload routes. lib/alpineComponents/viewer.js and
// pages/drop/cm6-editor.html carry the same one-line fix for the same reason,
// and are not reached from here.
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

// No <meta charset>, which is the whole point: a page that declares its own
// encoding was never at risk, so testing one would pass either way.
const PAGE = '<!doctype html><html><head><title>Prague</title></head><body>'
           + '<div id="message">🎉 Arrived in Prague! ✨ 🚀 LAUNCH!</div>'
           + '<p>Grüße, naïve café, résumé, Москва, 東京</p>'
           + '</body></html>';

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
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});

// Standard alphabet, padded: what a browser's btoa emits and what Shortcuts'
// base64encode hands over, so the fixture is the real producer's output.
const gz = zlib.gzipSync(Buffer.from(PAGE, 'utf8')).toString('base64');
const plain = Buffer.from(PAGE, 'utf8').toString('base64');

async function toss(hash) {
  await page.goto(`${origin}/pages/toss-render.html#${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  // The declared type, read off the blob the shell actually mounted.
  const type = await page.evaluate(async () => {
    const src = document.getElementById('frame')?.src || '';
    if (!src.startsWith('blob:')) return null;
    return (await fetch(src)).headers.get('content-type');
  });
  // The text as the reader sees it. Playwright reaches into the opaque frame.
  const frame = page.frames().find(f => f !== page.mainFrame());
  const text = frame ? await frame.evaluate(() => document.body.innerText) : '';
  return { type, text };
}

try {
  for (const [label, hash] of [['#gz= (gzipped)', 'gz=' + gz], ['#html= (plain)', 'html=' + plain]]) {
    console.log(label + ':');
    const r = await toss(hash);
    ok('the blob declares utf-8', /charset=utf-8/i.test(r.type || ''), String(r.type));
    ok('the emoji arrives whole', r.text.includes('🎉') && r.text.includes('🚀'), r.text.slice(0, 90));
    ok('accented latin survives', r.text.includes('Grüße') && r.text.includes('café'), r.text.slice(0, 120));
    ok('non-latin scripts survive', r.text.includes('Москва') && r.text.includes('東京'), r.text.slice(0, 120));
    // The tell, named rather than merely absent: this is what the bug looked
    // like, so a future failure reads as itself instead of as "text differs".
    ok('and no mojibake', !/Ã|Ð|â€|ðŸ/.test(r.text), r.text.slice(0, 120));
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log('\nall passed');
