#!/usr/bin/env node
// A multi-param page query, delivered through a real toss, in a real browser.
//
//   node tools/test/toss-multiparam.mjs
//
// tools/test/toss-fragment.test.mjs pins the reader in isolation. This is the
// other half: the whole chain a deep link actually travels — readFragment, then
// showAddress splitting the ?query off the address, then addressHtml's params
// shim answering the page's own URLSearchParams reads. jsdom cannot hold it,
// because the shim is injected into a blob: framed document and only means
// anything once that document runs.
//
// The subject is a probe page fulfilled at the contents API rather than written
// into the tree: it reports what its own URLSearchParams read returns, which is
// the one question here. Everything else (the shell, lib) comes off the working
// tree through tools/render/cdn.mjs.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROBE_PATH = 'pages/__probe-params.html';
const QUERY = 'view=app&appRepo=mehrlander%2Fhome&appPath=projects/news/app.html';
const ADDR = `mehrlander/web-tools@main:${PROBE_PATH}?${QUERY}`;

// Reports what the page's own deep-link read returns. A real page does exactly
// this (show-repo's app view reads these three keys), so the probe is the read,
// with nothing else on it to fail.
const PROBE_HTML = `<!doctype html><html><head><title>probe</title></head><body>
<script>
  var p = new URLSearchParams(location.search);
  window.__probe = { view: p.get('view'), appRepo: p.get('appRepo'), appPath: p.get('appPath'),
                     hasAppPath: p.has('appPath'), hash: location.hash };
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
const page = await browser.newPage();

await page.route('**/*', route => {
  const url = route.request().url();
  // The probe, in the contents-API response shape the page reads.
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

// Read the probe's own report out of the rendered frame.
async function probe(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  for (const f of page.frames()) {
    const got = await f.evaluate(() => window.__probe).catch(() => null);
    if (got) return got;
  }
  return null;
}

try {
  console.log('fragment (#gh=), three params:');
  const frag = await probe(`${origin}/pages/toss-render.html#gh=${ADDR}`);
  ok('the page rendered', !!frag, 'no probe report; the frame did not run');
  if (frag) {
    ok('view survives', frag.view === 'app', JSON.stringify(frag.view));
    ok('appRepo survives the first &', frag.appRepo === 'mehrlander/home', JSON.stringify(frag.appRepo));
    ok('appPath survives the second &', frag.appPath === 'projects/news/app.html', JSON.stringify(frag.appPath));
    ok('has() agrees with get()', frag.hasAppPath === true);
  }

  // Back-compat: the %26 form links were minted with still resolves the same.
  console.log('fragment (#gh=), the old %26 workaround:');
  const enc = await probe(`${origin}/pages/toss-render.html#gh=${ADDR.replace(/&/g, '%26')}`);
  ok('the page rendered', !!enc);
  if (enc) ok('all three params still arrive',
    enc.view === 'app' && enc.appRepo === 'mehrlander/home' && enc.appPath === 'projects/news/app.html',
    JSON.stringify(enc));

  // Control, and a documented limit rather than a bug: in the QUERY string '&'
  // belongs to the renderer's own params, so only the first page param can ride
  // there. The head comment says so; this is the measurement behind it.
  console.log('query (?gh=), the documented limit:');
  const q = await probe(`${origin}/pages/toss-render.html?gh=${ADDR}`);
  ok('the page rendered', !!q);
  if (q) {
    ok('the first param arrives', q.view === 'app', JSON.stringify(q.view));
    ok('the later params do not', q.appRepo === null && q.appPath === null, JSON.stringify(q));
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
