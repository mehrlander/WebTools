#!/usr/bin/env node
// pages/bench.html — the contract a shortcut calls into.
//
//   node tools/test/bench-page.mjs
//
// The page's whole job is to answer bench.call(op, base64) with a value, from a
// Safari tab, driven by Run JavaScript on Web Page. Nothing on this side can
// exercise that action, so what is checked here is the half that does not need a
// device: that every op returns what it claims, that base64 in is decoded as
// UTF-8, that a bad op is a returned string rather than a thrown error (a throw
// would reach completion() as a stalled shortcut with no explanation), and that
// the heap really does survive between separate calls, which is the property the
// whole coprocessor model rests on.
//
// Served over http rather than file://, because the page reports location.origin
// and the CDN load is origin-sensitive. jsDelivr is fetched Node-side and handed
// to the browser, because the sandbox's egress proxy answers node's fetch and
// drops the browser's: without the bridge every library check fails as
// "marked is not defined", which reads like a page bug and is not one.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
  try {
    res.writeHead(200, { 'content-type': typeFor(rel) });
    res.end(await readFile(path.join(root, rel)));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message)));

const cdn = new Map();
await page.route('https://cdn.jsdelivr.net/**', async route => {
  const url = route.request().url();
  if (!cdn.has(url)) {
    const res = await fetch(url);
    cdn.set(url, { status: res.status, body: Buffer.from(await res.arrayBuffer()),
                   type: res.headers.get('content-type') || 'application/javascript' });
  }
  const c = cdn.get(url);
  await route.fulfill({ status: c.status, body: c.body, contentType: c.type });
});
await page.goto(`${origin}/pages/bench.html`, { waitUntil: 'networkidle' });

const r = await page.evaluate(() => {
  const b = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  return {
    ready:   document.getElementById('ready').textContent,
    libs:    [...document.querySelectorAll('#libs .badge')].map(x => x.textContent),
    ops:     bench.names(),
    echo:    bench.call('echo', b('héllo ✅ "quotes" `ticks`\nnewline')),
    md:      bench.call('md', b('# Hi\n\n*em*')),
    yaml:    bench.call('yaml', b('a: 1\nb: [x, y]')),
    csv:     bench.call('csv', b('n,v\na,1\nb,2')),
    html2md: bench.call('html2md', b('<h1>T</h1><p>a <b>b</b></p>')),
    stats:   bench.call('stats', b('one two\nthree')),
    json:    bench.call('json', b('{"z":1,"a":[2]}')),
    push1:   bench.call('push', b('first')),
    push2:   bench.call('push', b('second')),
    drain:   bench.call('drain', b('')),
    drained: bench.call('drain', b('')),
    bogus:   bench.call('nope', b('x')),
    caps:    bench.call('caps', b('')),
    logged:  bench.log.length,
    rows:    document.querySelectorAll('#log > div').length,
  };
});

console.log('bench.html');
ok('page boots with no error', errors.length === 0, errors[0]);
ok('reports ready', /^ready/.test(r.ready), r.ready);
ok('four libraries load', r.libs.length === 4, r.libs.join(','));
ok('eleven ops registered', r.ops.length === 11, String(r.ops.length));
// The estate's own trap: values crossing this boundary get text-coerced, and a
// quote or newline in the input would end the interpolated string literal.
ok('base64 in decodes as UTF-8, quotes and newlines intact',
   r.echo === 'héllo ✅ "quotes" `ticks`\nnewline', JSON.stringify(r.echo));
ok('md returns HTML', /<h1[^>]*>Hi<\/h1>/.test(r.md) && /<em>em<\/em>/.test(r.md), r.md);
ok('yaml returns a structure', r.yaml && r.yaml.a === 1 && r.yaml.b[1] === 'y', JSON.stringify(r.yaml));
ok('csv returns rows', r.csv.length === 2 && r.csv[1].v === '2', JSON.stringify(r.csv));
ok('html2md returns markdown', /^# T/.test(r.html2md) && /\*\*b\*\*/.test(r.html2md), r.html2md);
ok('stats counts', r.stats.chars === 13 && r.stats.words === 3 && r.stats.lines === 2,
   JSON.stringify(r.stats));
ok('json pretty-prints', r.json.includes('\n  "z"'), r.json);
// The property the whole model rests on: state written by one call is read by
// the next, exactly as Get-Nice's window.siriData is on device.
ok('heap survives between calls', r.push1 === 1 && r.push2 === 2, `${r.push1},${r.push2}`);
ok('drain returns then clears', r.drain.join(',') === 'first,second' && r.drained.length === 0,
   JSON.stringify(r.drain));
ok('an unknown op returns a string, never throws',
   typeof r.bogus === 'string' && r.bogus.startsWith('BENCH ERR: no op'), String(r.bogus));
ok('caps names its ops and origin', r.caps.ops.length === 11 && r.caps.origin.startsWith('http'),
   JSON.stringify(r.caps));
ok('every call is logged and rendered', r.logged === 13 && r.rows === 13, `${r.logged}/${r.rows}`);

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
