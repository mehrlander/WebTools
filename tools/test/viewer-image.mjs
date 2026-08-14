#!/usr/bin/env node
// The viewer's image module, which is the one that fetches its own bytes.
//
//   node tools/test/viewer-image.mjs
//
// Every other render module works from the text the viewer was handed. An
// image cannot: a PNG decoded as UTF-8 is lossy, so `content` for one is
// garbage that no amount of care turns back into a picture. The module goes
// and gets the bytes as base64 through the page's own `gh`, which is also why
// it works in a private repo, where a raw.githubusercontent or jsDelivr src
// would 404 and a naive implementation would pass on the public hub only.
//
// Two claims, and the second is the one that would rot silently:
//   1. a repo image renders, from bytes fetched at the addressed ref
//   2. it OPENS in the image mode, over the host's blanket defaultMode
//      ('raw' in show-repo's file view), which is what `exclusive` buys
//
// The subject is pages/thumbs/toss-render.png, a real tracked PNG, read
// through the working-tree stand-in for the contents API.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMG = 'pages/thumbs/toss-render.png';

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
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

// Read what the viewer settled on, and what the <img> actually got.
const state = () => page.evaluate(() => {
  const host = document.getElementById('dv-viewer');
  const v = host && Alpine.$data(host);
  const img = document.getElementById('viewer-image');
  const msg = document.getElementById('viewer-image-msg');
  return {
    mode: v?.mode || null,
    modes: (v?.availableModes || []).map(m => m.id),
    src: (img?.src || '').slice(0, 40),
    // naturalWidth is the only proof the bytes decoded: a broken data: URI
    // still sets src and still fires nothing useful anywhere else.
    w: img?.naturalWidth || 0,
    h: img?.naturalHeight || 0,
    shown: img ? !img.classList.contains('hidden') : false,
    msg: msg ? msg.textContent.trim() : '(gone)',
  };
});

try {
  console.log('a repo PNG addressed through data-view:');
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent('mehrlander/web-tools@main:' + IMG)}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  let s = await state();
  ok('the image mode is available', (s.modes || []).includes('image'), JSON.stringify(s.modes));
  ok('and it is what opened', s.mode === 'image', JSON.stringify(s));
  ok('the src is a data URI of PNG bytes', s.src.startsWith('data:image/png;base64,'), s.src);
  ok('the bytes decoded to a real raster', s.w > 0 && s.h > 0, `${s.w}x${s.h}`);
  ok('the loading line got out of the way', s.shown === true && s.msg === '(gone)', JSON.stringify(s));

  console.log('an inline SVG, which needs no fetch:');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40">' +
              '<rect width="80" height="40" fill="#22c55e"/></svg>';
  const env = { kind: 'data-view/1', items: [{ name: 'shape.svg', content: svg }] };
  await page.goto(`${origin}/pages/data-view.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(async (payload) => {
    const bytes = new TextEncoder().encode(payload);
    const gz = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(gz).arrayBuffer());
    let str = ''; for (const b of buf) str += String.fromCharCode(b);
    location.hash = 'gz=' + btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    location.reload();
  }, JSON.stringify(env));
  await page.waitForTimeout(3500);
  s = await state();
  ok('it opens in the image mode', s.mode === 'image', JSON.stringify(s));
  ok('carried as text, with no fetch', s.src.startsWith('data:image/svg+xml;base64,'), s.src);
  ok('and it drew at its declared size', s.w === 80 && s.h === 40, `${s.w}x${s.h}`);

  console.log('a text file is untouched by any of this:');
  await page.goto(`${origin}/pages/data-view.html?src=${encodeURIComponent('mehrlander/web-tools@main:docs/tools.json')}`,
                  { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  s = await state();
  ok('no image mode is offered', !(s.modes || []).includes('image'), JSON.stringify(s.modes));
  ok('and the default still decides', s.mode === 'tree', JSON.stringify(s));
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
