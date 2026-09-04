#!/usr/bin/env node
// The tossed page gets the keyboard without a click.
//
//   node tools/test/toss-frame-focus.mjs
//
// A fresh iframe receives no keystroke: focus stays on the top document until
// something is clicked, so a page rendered here answered no key of its own
// until the reader clicked into it. It showed on the Web Tools app tossed into
// this shell, whose type-to-find needed a click on a page just opened to read.
//
// Browser-only by construction. Focus lives in the browser's focus chain, not
// in the DOM, so `document.hasFocus()` inside a frame is the only witness and
// jsdom has nothing to report. The check asserts the witness directly and then
// the consequence: a keydown the framed document actually sees.
//
// The frame is placed BELOW THE FOLD in the width case for the one hazard
// worth pinning: focus() can scroll its target into view, and a shell that
// jumped the reader's scroll on every render would be a worse bug than the one
// this fixes.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// A page that records every key its own window sees, which is the whole
// question: not what the shell received, but what the frame did.
const SUBJECT = `<!doctype html><title>Keyed</title>
<body style="font:16px system-ui;margin:0;padding:2rem">tossed subject
<script>window.__keys=[];addEventListener('keydown',e=>window.__keys.push(e.key));<\/script>`;
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const GZ = b64url(gzipSync(Buffer.from(SUBJECT)));

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
const route = async (page) => page.route('**/*', r => {
  const url = r.request().url();
  if (url.startsWith(origin)) return r.continue();
  const c = resolveCdn(url, root, null);
  if (c.kind === 'continue') return r.continue();
  if (c.kind === 'empty') return r.fulfill({ status: 200, contentType: c.contentType, body: '' });
  return r.fulfill({ status: 200, contentType: c.contentType, body: c.body });
});

const subjectFrame = async (page) => {
  const el = await page.waitForSelector('#frame:not(.hidden)', { timeout: 20000 });
  for (let i = 0; i < 40; i++) {
    const f = await el.contentFrame();
    if (f && await f.evaluate(() => Array.isArray(window.__keys)).catch(() => false)) return f;
    await page.waitForTimeout(150);
  }
  throw new Error('the subject never booted inside the frame');
};

try {
  console.log('a tossed page, opened from a link and not clicked:');
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await route(page);
  await page.goto(`${origin}/pages/toss-render.html#gz=${GZ}`, { waitUntil: 'domcontentloaded' });
  const frame = await subjectFrame(page);
  ok('the frame holds the keyboard', await frame.evaluate(() => document.hasFocus()));
  await page.keyboard.type('hi', { delay: 25 });
  await page.waitForTimeout(200);
  ok('so its own keydowns arrive',
     JSON.stringify(await frame.evaluate(() => window.__keys)) === '["h","i"]',
     JSON.stringify(await frame.evaluate(() => window.__keys)));
  await page.close();

  console.log('the shell scrolls nowhere to do it:');
  // ?w= lays the frame out at a set width inside a scrollable shell, which is
  // the one arrangement here where the frame is not already the whole viewport.
  const p2 = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  await route(p2);
  await p2.goto(`${origin}/pages/toss-render.html?w=390#gz=${GZ}`, { waitUntil: 'domcontentloaded' });
  const f2 = await subjectFrame(p2);
  ok('the frame still holds the keyboard at a forced width',
     await f2.evaluate(() => document.hasFocus()));
  ok('and the shell is not scrolled', (await p2.evaluate(() => window.scrollY)) === 0);
  await p2.close();

  console.log('a caret in the shell is not pulled away:');
  const p3 = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await route(p3);
  await p3.goto(`${origin}/pages/toss-render.html`, { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('#addr-input', { timeout: 20000 });
  // A field that SURVIVES the render, which is the only kind the guard can
  // protect: the empty panel's own address input is hidden by the reveal, so
  // the browser blurs it before any of this runs. The drawer's fields are the
  // real case, and one standing outside the panel stands in for them.
  await p3.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'survivor';
    i.style.cssText = 'position:fixed;z-index:99;top:0;right:0';
    document.body.append(i);
    i.focus();
  });
  await p3.evaluate((html) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', html);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, SUBJECT);
  await p3.waitForSelector('#frame:not(.hidden)', { timeout: 20000 });
  await p3.waitForTimeout(600);
  const held = await p3.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  ok('the shell rendered', await p3.evaluate(() =>
     !document.getElementById('frame').classList.contains('hidden')));
  ok('and the field keeps the caret', held === 'survivor', held);
  await p3.close();
} catch (e) {
  console.log(`  FAIL  probe threw — ${e.message}`);
  failures.push('probe');
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failed` : '\nall ok');
process.exit(failures.length ? 1 : 0);
