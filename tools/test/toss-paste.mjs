#!/usr/bin/env node
// What the clipboard panel does with what it is handed.
//
//   node tools/test/toss-paste.mjs
//
// toss-render's empty state is the estate's "see what is on my clipboard"
// tool, and its whole claim is that it routes by SHAPE rather than assuming
// HTML. That claim is only testable from outside: every branch ends in a
// mounted frame, and the difference between them is which document is in it.
// So each case pastes a real payload and reads back what mounted.
//
// The routing table under test (renderInput in pages/toss-render.html):
//   a github blob URL, or a bare owner/repo:path  -> address mode
//   an http(s) URL                                -> the frame, pointed at it
//   a whole HTML document                         -> the frame, rendering it
//   anything else                                 -> pages/data-view.html
//
// The last row is the one that changed: CSV, JSON, markdown, logs, and prose
// used to be mounted as HTML and shown as a wall of unstyled text.
//
// The paste is delivered as a real ClipboardEvent, which is what the page
// listens for, so nothing here reaches past the page's own entry points.
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
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });

// The whole working tree stands in for the contents API and the CDN, so a
// pasted payload routed to data-view boots the real page and the real viewer.
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});
page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

// Paste text the way a user does: a ClipboardEvent on the document, which is
// the listener the page actually registers.
async function paste(text) {
  await page.goto(`${origin}/pages/toss-render.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(t => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, text);
  await page.waitForTimeout(2600);
}

// What ended up on screen: the frame's document as the shell can see it, plus
// the shell's own record of what it thinks it rendered. `mode` is the viewer's
// own state rather than a guess from the markup, which is the only way to say
// what a file OPENED in as opposed to what it was offered.
const rendered = () => page.evaluate(() => {
  const frame = document.getElementById('frame');
  const hidden = frame.classList.contains('hidden');
  let inner = null;
  try {
    const d = frame.contentDocument;
    if (d) {
      const host = d.getElementById('dv-viewer');
      const v = host && frame.contentWindow.Alpine?.$data(host);
      inner = { title: d.title, text: (d.body?.innerText || '').slice(0, 400),
                mode: v?.mode || null, name: v?.file || null,
                modes: (v?.availableModes || []).map(m => m.id) };
    }
  } catch (e) { inner = { opaque: true }; }
  return { hidden, subject: window.__tossSubject, title: document.title, inner };
});

const inViewer = r => !r.hidden && r.subject?.path === 'pages/data-view.html';

try {
  console.log('a CSV (was: a wall of text in a frame):');
  await paste('plan,members,rate\nPERS 2,158204,9.11\nTRS 2,42188,10.29\n');
  let r = await rendered();
  ok('it goes to the data viewer', inViewer(r), JSON.stringify(r.subject));
  ok('and opens as a table', r.inner?.mode === 'table', JSON.stringify(r.inner?.modes));
  ok('with the rows in it', /158204/.test(r.inner?.text || ''), r.inner?.text?.slice(0, 120));

  console.log('a JSON object:');
  await paste('{"source":"clipboard","nested":{"a":1,"b":[2,3]}}');
  r = await rendered();
  ok('it goes to the data viewer', inViewer(r), JSON.stringify(r.subject));
  ok('and opens in the tree', r.inner?.mode === 'tree', JSON.stringify(r.inner?.modes));
  ok('with raw still one tap away', (r.inner?.modes || []).includes('raw'),
     JSON.stringify(r.inner?.modes));

  console.log('markdown:');
  await paste('# A heading\n\nSome prose, and a [link](https://example.com).\n\n- one\n- two\n');
  r = await rendered();
  ok('it goes to the data viewer', inViewer(r), JSON.stringify(r.subject));
  ok('and opens in preview', r.inner?.mode === 'preview', JSON.stringify(r.inner?.modes));
  ok('rendered, rather than showing source', !/^#\s/m.test(r.inner?.text || ''),
     r.inner?.text?.slice(0, 120));
  ok('with the heading as text', /A heading/.test(r.inner?.text || ''), r.inner?.text?.slice(0, 120));

  console.log('markdown carrying script-shaped HTML (the sanitizer):');
  // The reason data-view may render an untrusted paste same-origin at all.
  // marked passes inline HTML through by design, and this document holds the
  // token, so the payload has to arrive inert.
  await paste('# Title\n\n<img src=x onerror="window.__pwned=1">\n\n<script>window.__pwned=1<\/script>\n');
  r = await rendered();
  const pwned = await page.evaluate(() => {
    const d = document.getElementById('frame').contentDocument;
    return { shell: !!window.__pwned, frame: !!(d && d.defaultView.__pwned),
             onerror: !!d?.querySelector('img[onerror]'),
             purify: !!d?.defaultView.DOMPurify };
  });
  // Without this the case passes on the degrade path (escaped source) and
  // proves nothing about the sanitizer.
  ok('the sanitizer is the thing under test', pwned.purify === true, JSON.stringify(pwned));
  ok('nothing ran in the frame', pwned.frame === false, JSON.stringify(pwned));
  ok('nothing ran in the shell', pwned.shell === false, JSON.stringify(pwned));
  ok('the handler is stripped, not just unfired', pwned.onerror === false, JSON.stringify(pwned));

  console.log('plain prose, the fallback:');
  await paste('Just a paragraph someone copied out of an email. No structure at all.');
  r = await rendered();
  ok('it goes to the data viewer', inViewer(r), JSON.stringify(r.subject));
  ok('and is readable as raw text', r.inner?.mode === 'raw' &&
     /paragraph someone copied/.test(r.inner?.text || ''), r.inner?.text?.slice(0, 120));

  console.log('a whole HTML document (the original behavior, unchanged):');
  await paste('<!doctype html><html><head><title>Pasted page</title></head>' +
              '<body><h1>Still a page</h1></body></html>');
  r = await rendered();
  ok('it renders in the frame', !r.hidden);
  ok('as a payload, not an address', r.subject === null, JSON.stringify(r.subject));
  ok('under an opaque origin', r.inner?.opaque === true || r.inner?.text === undefined,
     JSON.stringify(r.inner)?.slice(0, 120));
  ok('and the shell titles it', /Pasted page/.test(r.title), r.title);

  console.log('an HTML fragment is not a document:');
  await paste('<div class="card"><p>just a snippet</p></div>');
  r = await rendered();
  ok('it goes to the data viewer instead', inViewer(r), JSON.stringify(r.subject));

  console.log('a bare repo address:');
  await paste('mehrlander/web-tools@main:pages/index.html');
  r = await rendered();
  ok('it resolves through address mode', r.subject?.path === 'pages/index.html',
     JSON.stringify(r.subject));

  console.log('a github blob URL (unchanged):');
  await paste('https://github.com/mehrlander/web-tools/blob/main/pages/index.html');
  r = await rendered();
  ok('it resolves through address mode', r.subject?.path === 'pages/index.html',
     JSON.stringify(r.subject));

  console.log('the link stays copyable:');
  await paste('a,b\n1,2\n');
  const link = await page.evaluate(async () => {
    const el = document.querySelector('[data-marker="toss"]');
    const actions = window.Alpine?.$data(el)?.actions;
    return actions?.length ? 'has-action' : 'none';
  });
  ok('"Copy toss link" is offered for a pasted payload', link === 'has-action', link);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
