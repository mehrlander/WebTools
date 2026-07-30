#!/usr/bin/env node
// data-view's GitHub / Raw / CDN links, for an address that names no @ref.
//
//   node tools/test/data-view-links.mjs
//
// The one thing task one-repo-address-parser-5gtv92 asked to be verified by a
// render rather than by reading. `DataPayload.parseSpec` used to fill a missing
// @ref with 'main'; it now reports '' like the other two readers, and '' is
// exactly what these three URLs cannot hold: it yields `blob//path` and `@/path`,
// three broken links per item, which is why that copy was left alone when the
// shared module landed. The fallback moved to the link-building boundary in
// alpineComponents/viewer.js, and this is the check that it actually did.
//
// jsdom cannot answer it: the links are built in a getter off component state
// the page assembles at runtime, so what is under test is the assembled page.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO = 'mehrlander/web-tools';
const FILE = 'tools/test/fixtures/rows.csv';
const CSV = 'name,count\nalpha,3\nbeta,5\n';

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

// Every contents-API read of the addressed file is answered here, whatever ref
// the request carries (or omits), so the test measures the LINKS rather than
// the fetch. Requests are recorded so the fetch shape can be asserted too.
const apiCalls = [];
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.includes(`/contents/${FILE}`)) {
    apiCalls.push(url);
    return route.fulfill({
      status: 200, contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ content: Buffer.from(CSV).toString('base64'),
                             encoding: 'base64', sha: 'local', size: CSV.length }),
    });
  }
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

// The hrefs the viewer's file menu actually rendered.
async function links(src) {
  apiCalls.length = 0;
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent(src)}`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  return page.$$eval('a[href]', els => els.map(e => e.getAttribute('href'))
    .filter(h => /github\.com|raw\.githubusercontent|jsdelivr/.test(h)));
}

try {
  console.log(`no @ref (${REPO}:${FILE}):`);
  const bare = await links(`${REPO}:${FILE}`);
  ok('the file rendered and offers links', bare.length >= 3, JSON.stringify(bare));
  ok('none is malformed by an empty ref',
    !bare.some(h => /blob\/\/|githubusercontent\.com\/[^/]+\/[^/]+\/\//.test(h) || h.includes('@/')),
    JSON.stringify(bare));
  ok('the blob link names a concrete branch', bare.some(h => h.includes(`/blob/main/${FILE}`)),
    JSON.stringify(bare.find(h => h.includes('/blob/'))));
  ok('the CDN link names a concrete branch', bare.some(h => h.includes(`${REPO}@main/${FILE}`)),
    JSON.stringify(bare.find(h => h.includes('jsdelivr'))));
  // The other half of the ref rule: fetching sends no ref at all, so the API
  // resolves the repo's default branch instead of being handed an empty one.
  ok('the fetch omitted the ref parameter rather than sending an empty one',
    apiCalls.length > 0 && apiCalls.every(u => !/[?&]ref=/.test(u)), apiCalls.join(' '));

  console.log(`an explicit @ref (${REPO}@some-branch:${FILE}):`);
  const reffed = await links(`${REPO}@some-branch:${FILE}`);
  ok('the stated ref wins over the fallback', reffed.some(h => h.includes(`/blob/some-branch/${FILE}`)),
    JSON.stringify(reffed.find(h => h.includes('/blob/'))));
  ok('and it reaches the fetch', apiCalls.some(u => /[?&]ref=some-branch/.test(u)), apiCalls.join(' '));
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
