#!/usr/bin/env node
// Whether a page rendered through a toss can reach the microphone.
//
//   node tools/test/toss-microphone.mjs
//
// pages/dictate.html is a page whose entire job is hearing you, and a toss is
// how a branch version of it is handed over for a look.
//
// THIS CHECK CORRECTED THE CHANGE IT WAS WRITTEN FOR, which is the reason to
// keep reading. It was written expecting address mode to be DENIED the
// microphone without an explicit `allow`, on the reading that Permissions
// Policy defaults `microphone` to `self` and `self` stops at a frame boundary.
// Chromium answered `true` either way: an address-mode frame is same-origin
// (allow-same-origin, over a blob: URL that inherits this origin), and `self`
// covers a same-origin frame. So the attribute makes an implicit grant
// explicit rather than repairing a denial, and the assertions below say the
// two things separately.
//
// Which leaves one honest gap, stated rather than papered over: Safari is not
// measured here and WebKit has always been the stricter of the two about
// capture inside a frame.
//
// The line between the two modes is the one toss-render.html already draws
// everywhere. ADDRESS mode is a repo file the viewer's own token reached and
// runs with allow-same-origin; PAYLOAD mode is whatever anyone pasted into a
// link and runs at an opaque origin. Both halves are checked, because the
// withholding is as much the point as the grant and a check that only proved
// the grant would not notice it widening.
//
// The probe answers with the browser's own verdict (document.featurePolicy),
// not with a getUserMedia call: headless Chromium has no microphone, so an
// attempt would fail for a reason that has nothing to do with the frame.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROBE_PATH = 'pages/__probe-mic.html';
const PROBE_HTML = `<!doctype html><html><head><title>mic probe</title></head><body>
<script>
  window.__probe = {
    allowed: document.featurePolicy ? document.featurePolicy.allowsFeature('microphone') : null,
    hasSR: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
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
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage();
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

const gz = async (html) => {
  const { gzipSync } = await import('node:zlib');
  return gzipSync(Buffer.from(html)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function render(hash) {
  await page.goto(`${origin}/pages/toss-render.html${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const attr = await page.getAttribute('#frame', 'allow');
  let probe = null;
  for (const f of page.frames()) {
    const got = await f.evaluate(() => window.__probe).catch(() => null);
    if (got) { probe = got; break; }
  }
  return { attr, probe };
}

try {
  console.log('address mode (a repo file, token-gated, same-origin):');
  const addr = await render(`#gh=mehrlander/web-tools@main:${PROBE_PATH}`);
  ok('the page rendered at all', !!addr.probe, JSON.stringify(addr));
  ok('the frame states the grant rather than leaning on a default',
    /microphone/.test(addr.attr || ''), addr.attr);
  // Not caused by the attribute in Chromium (see the header): the frame is
  // same-origin, so `self` already covered it. Asserted anyway, because the
  // day it stops being true is the day address mode stopped being same-origin.
  ok('and the browser agrees the page may use it', addr.probe?.allowed === true,
    JSON.stringify(addr.probe));

  console.log('payload mode (anything anyone pasted, opaque origin):');
  const pay = await render(`#gz=${await gz(PROBE_HTML)}`);
  ok('the page rendered at all', !!pay.probe, JSON.stringify(pay));
  ok('the frame does NOT delegate the microphone', !/microphone/.test(pay.attr || ''), pay.attr);
  ok('and the browser refuses it', pay.probe?.allowed === false, JSON.stringify(pay.probe));
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
