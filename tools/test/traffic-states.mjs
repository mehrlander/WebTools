#!/usr/bin/env node
// lib/kits/traffic.js's three size states, and gh-boot's fetch wrapper, proved in a
// real browser rather than against a reading of the spec.
//
//   node tools/test/traffic-states.mjs
//
// The Traffic tab's whole claim is that its numbers are honest, and that rests
// on two beliefs about the browser that unit tests cannot reach, because
// tools/test/traffic.test.mjs feeds bootRow() plain objects that I wrote:
//
//   1. A cross-origin resource reports real sizes only when its origin sends
//      Timing-Allow-Origin; without it all three sizes read 0, which must be
//      reported as UNDISCLOSED and never as a free resource. A cache hit is a
//      third thing again: transferSize 0 with the body size intact.
//   2. Replacing window.fetch does not break any way a caller calls it.
//
// Both are checked here against a controlled server, so both branches run: one
// origin sends the header, an identical one does not, and a same-origin file is
// fetched twice to produce a genuine cache hit. Measured 2026-08-05 (Chromium,
// this sandbox): TAO 20304 wire against a 20004 body, so transferSize carries
// about 300 bytes of response headers, which is why the band's total is
// described as running above the payload it lists.
//
// The wrapper cases include one that throws (fetch.call({}, url), an illegal
// receiver) and a CONTROL that proves native fetch throws identically. Without
// the control the throw looks like damage the wrapper did.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).

import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BODY_BYTES = 20000;
const body = '/*' + 'x'.repeat(BODY_BYTES) + '*/';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${detail ? '   ' + detail : ''}`);
};

// Two asset origins, identical but for the one header under test, plus the page
// origin (which also serves a same-origin asset for the cache case).
const asset = (tao) => new Promise(res => {
  const s = http.createServer((req, r) => {
    const h = { 'content-type': 'application/javascript', 'access-control-allow-origin': '*', 'cache-control': 'max-age=300' };
    if (tao) h['timing-allow-origin'] = '*';
    r.writeHead(200, h);
    r.end(body);
  });
  s.listen(0, '127.0.0.1', () => res(s));
});

const pageOrigin = () => new Promise(res => {
  const s = http.createServer((req, r) => {
    if (req.url.startsWith('/same.js')) {
      r.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'max-age=300' });
      return r.end(body);
    }
    r.writeHead(200, { 'content-type': 'text/html' });
    r.end('<!doctype html><title>traffic states</title>');
  });
  s.listen(0, '127.0.0.1', () => res(s));
});

const withTao = await asset(true);
const noTao = await asset(false);
const host = await pageOrigin();
const url = s => 'http://127.0.0.1:' + s.address().port;

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(url(host) + '/');
await page.addScriptTag({ content: readFileSync(path.join(root, 'lib/kits/traffic.js'), 'utf8') });

const out = await page.evaluate(async ([tao, notao, own]) => {
  const r = { wrapper: {} };

  // The wrapper, written exactly as gh-boot.js installs it.
  const origFetch = window.fetch;
  const seen = [];
  window.fetch = function (input, init) {
    seen.push(typeof input === 'string' ? input : (input && input.url));
    return origFetch.apply(this, arguments);
  };
  const form = async (label, fn) => {
    try { await fn(); r.wrapper[label] = 'ok'; }
    catch (e) { r.wrapper[label] = 'threw: ' + e.message; }
  };
  await form('plain', () => window.fetch(own + '/same.js'));
  await form('bare', () => fetch(own + '/same.js?2'));
  await form('destructured', () => { const { fetch: f } = window; return f(own + '/same.js?3'); });
  await form('requestObject', () => window.fetch(new Request(own + '/same.js?4')));
  await form('badReceiver', () => window.fetch.call({}, own + '/same.js?5'));
  r.recorded = seen.length;
  r.sameResponse = await (async () => {
    const res = await window.fetch(own + '/same.js?6');
    return res instanceof Response && res.bodyUsed === false;
  })();

  await fetch(tao + '/tao.js');
  await fetch(notao + '/notao.js');
  await fetch(own + '/same.js');   // second hit of an already-cached URL
  await new Promise(x => setTimeout(x, 400)); // entries land after the response settles

  const all = () => performance.getEntriesByType('resource');
  const one = frag => all().filter(e => e.name.includes(frag)).pop();
  const state = e => (e ? window.Traffic.bootRow(e) : null);
  const sames = all().filter(e => e.name.endsWith('/same.js'));
  return {
    ...r,
    tao: state(one('/tao.js')),
    notao: state(one('/notao.js')),
    sameFirst: state(sames[0]),
    sameSecond: state(sames[1]),
  };
}, [url(withTao), url(noTao), url(host)]);

// The control: native fetch, no wrapper in sight, same illegal receiver.
const control = await (async () => {
  const p = await (await browser.newContext()).newPage();
  await p.goto('about:blank');
  return p.evaluate(async () => {
    try { await window.fetch.call({}, 'about:blank'); return 'ok'; }
    catch (e) { return 'threw: ' + e.message; }
  });
})();

console.log('\nfetch wrapper');
for (const form of ['plain', 'bare', 'destructured', 'requestObject']) {
  check(`fetch survives being called ${form}`, out.wrapper[form] === 'ok', out.wrapper[form]);
}
// Five calling forms, counted before the sixth (unread-Response) call below.
// The throwing one is recorded too: the wrapper logs the attempt before it
// delegates, so a call that dies is still visible in the ledger.
check('all five calling forms were recorded, the throwing one included',
  out.recorded === 5, String(out.recorded));
check('the Response comes back unread', out.sameResponse === true);
check('an illegal receiver throws exactly what native throws (control)',
  out.wrapper.badReceiver === control && /Illegal invocation/.test(control), control);

console.log('\nsize states');
check('cross-origin WITH Timing-Allow-Origin reads as network',
  out.tao && out.tao.state === 'network' && out.tao.wire > BODY_BYTES,
  out.tao ? `wire=${out.tao.wire} decoded=${out.tao.decoded}` : 'no entry');
check('cross-origin WITHOUT it is undisclosed, not zero',
  out.notao && out.notao.state === 'undisclosed' && out.notao.wire === null && out.notao.decoded === null,
  out.notao ? `wire=${out.notao.wire}` : 'no entry');
check('same-origin first hit reads as network',
  out.sameFirst && out.sameFirst.state === 'network', out.sameFirst && out.sameFirst.state);
check('a real cache hit reads as cached, with its body size intact',
  out.sameSecond && out.sameSecond.state === 'cached' && out.sameSecond.decoded > BODY_BYTES,
  out.sameSecond ? `wire=${out.sameSecond.wire} decoded=${out.sameSecond.decoded}` : 'no second entry');
// The header overhead the Boot band's note claims, measured rather than assumed.
if (out.tao) console.log(`\n  transferSize carries ${out.tao.wire - out.tao.decoded} bytes of headers over the body`);

await browser.close();
[withTao, noTao, host].forEach(s => s.close());

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
