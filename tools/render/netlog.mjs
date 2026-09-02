#!/usr/bin/env node
// Request-count harness: what a page COSTS to load, as a request log rather
// than a picture. The sibling of screenshot.mjs (same loopback static server,
// same cdn.mjs resolution of CDN and same-repo API calls to local files), with
// three differences: a stored token is seeded so the token-gated paths run;
// every non-GET to api.github.com except a GraphQL read is answered 403 and
// logged, so a run can never write to any repo; and every request is recorded
// and printed grouped by host and by normalised endpoint, with a timeline of
// the API calls and the writes that were attempted.
//
//   node tools/render/netlog.mjs app/index.html [--query k=v&..] [--wait MS]
//        [--fab] [--click <selector>] [--notoken] [--label <name>]
//
// The token comes from $GITHUB_TOKEN (the session's own in the sandbox). Two
// readings to keep in mind: same-repo and sibling-clone API reads are served
// from disk in contents-API shape, so their byte column is the base64 payload
// size, not gzip on the wire; and a host the sandbox proxy refuses (it 403s
// /user/repos without CORS headers) shows as a failure plus the loader's one
// network retry, so its count reads double. Measured with it on 2026-09-02:
// the boot-cost review in PR #<this branch's PR>.
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from './cdn.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const o = { wait: 8000, query: '', fab: false, label: '', click: null, page: null, notoken: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--query') o.query = argv[++i];
  else if (a === '--wait') o.wait = +argv[++i];
  else if (a === '--fab') o.fab = true;
  else if (a === '--notoken') o.notoken = true;
  else if (a === '--label') o.label = argv[++i];
  else if (a === '--click') o.click = argv[++i];
  else o.page = a;
}
const pageUrlPath = '/' + o.page;
const server = http.createServer(async (req, res) => {
  try {
    const reqPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const fp = path.join(repoRoot, reqPath);
    if (!fp.startsWith(repoRoot)) { res.writeHead(403).end(); return; }
    const body = await readFile(fp);
    res.writeHead(200, { 'Content-Type': typeFor(fp) });
    res.end(body);
  } catch (e) { res.writeHead(404).end(String(e.message)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

const token = o.notoken ? '' : (process.env.GITHUB_TOKEN || '');
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true, ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}) });
if (token) await ctx.addInitScript(t => { try { localStorage.setItem('ghToken', t); } catch {} }, token);
const page = await ctx.newPage();

const reqs = [];   // {t, method, url, host, kind, bytes}
const t0 = Date.now();
await page.route('**/*', route => {
  const r = route.request();
  const url = r.url();
  const rec = { t: Date.now() - t0, method: r.method(), url, kind: '', bytes: 0, type: r.resourceType() };
  reqs.push(rec);
  if (url.startsWith(origin)) { rec.kind = 'local'; return route.continue(); }
  let host = ''; try { host = new URL(url).host; } catch {}
  if (host === 'api.github.com' && r.method() !== 'GET' && !(r.method() === 'POST' && /\/graphql/.test(url))) {
    rec.kind = 'WRITE-BLOCKED';
    return route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"blocked by harness"}' });
  }
  const c = resolveCdn(url, repoRoot, null);
  rec.kind = c.kind;
  if (c.kind === 'continue') return route.continue();
  if (c.kind === 'empty') return route.fulfill({ status: 200, contentType: c.contentType, body: '' });
  rec.bytes = Buffer.byteLength(c.body);
  return route.fulfill({ status: 200, contentType: c.contentType, body: c.body });
});
page.on('response', async resp => {
  const rec = reqs.find(x => x.url === resp.url() && !x.status);
  if (!rec) return;
  rec.status = resp.status();
  if (rec.kind === 'continue' || rec.kind === 'local') {
    try { const b = await resp.body(); rec.bytes = b.length; } catch {}
  }
});
const consoleLines = [];
page.on('console', m => consoleLines.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
page.on('pageerror', e => consoleLines.push(`[pageerror] ${e.message.slice(0, 200)}`));
page.on('requestfailed', r => { const rec = reqs.find(x => x.url === r.url() && !x.status); if (rec) rec.status = 'FAIL:' + (r.failure()?.errorText || '?'); });

const target = `${origin}${pageUrlPath}${o.query ? '?' + o.query : ''}`;
await page.goto(target, { waitUntil: 'load', timeout: 60000 });
const tLoad = Date.now() - t0;
await page.waitForTimeout(o.wait);
const nBeforeInteract = reqs.length;
if (o.fab) {
  const fabBtn = page.locator('[x-data^="fab"] [role="button"]').first();
  await fabBtn.click({ timeout: 10000 }).catch(e => consoleLines.push('[harness] fab click failed: ' + e.message));
  await page.waitForTimeout(4000);
}
if (o.click) {
  await page.locator(o.click).first().click({ timeout: 10000 }).catch(e => consoleLines.push('[harness] click failed: ' + e.message));
  await page.waitForTimeout(4000);
}
const perf = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  const keys = Object.keys(window).filter(k => /traffic|ledger/i.test(k));
  let ledger = null;
  try { const L = window.__traffic; ledger = Array.isArray(L) ? { n: L.length, sample: L.slice(0, 3) } : L ? { keys: Object.keys(L).slice(0, 10) } : null; } catch {}
  return { domContentLoaded: nav && Math.round(nav.domContentLoadedEventEnd), load: nav && Math.round(nav.loadEventEnd),
    heapMB: mem, trafficKeys: keys, ledgerSummary: ledger ? JSON.stringify(ledger).slice(0, 400) : null,
    view: (window.__shell && window.__shell.view) || null, title: document.title };
}).catch(e => ({ err: e.message }));
await browser.close(); server.close();

// ---- report ----
const norm = u => {
  try {
    const x = new URL(u);
    let p = x.pathname
      .replace(/^\/repos\/([^/]+)\/([^/]+)/, (m, a, b) => `/repos/${a}/${b}`)
      .replace(/\/git\/trees\/[^/?]+/, '/git/trees/{sha}')
      .replace(/\/commits\/[0-9a-f]{7,40}/, '/commits/{sha}')
      .replace(/\/compare\/[^/?]+/, '/compare/{range}');
    const q = [...x.searchParams.keys()].filter(k => k !== 'ref' || true).map(k => k === 'ref' ? `ref=${x.searchParams.get('ref')}` : k).join('&');
    return `${x.host}${p}${q ? '?' + q : ''}`;
  } catch { return u; }
};
const groups = new Map();
for (const r of reqs) {
  const k = `${r.method} ${r.kind.padEnd(13)} ${norm(r.url)}`;
  const g = groups.get(k) || { n: 0, bytes: 0, first: r.t, status: new Set() };
  g.n++; g.bytes += r.bytes || 0; g.status.add(r.status || '?'); groups.set(k, g);
}
const byHost = new Map();
for (const r of reqs) { let h = 'local'; try { if (!r.url.startsWith(origin)) h = new URL(r.url).host; } catch {}
  const g = byHost.get(h) || { n: 0, bytes: 0 }; g.n++; g.bytes += r.bytes || 0; byHost.set(h, g); }
console.log(`=== ${o.label || o.page + (o.query ? '?' + o.query : '')}${o.fab ? ' +FAB' : ''}${o.click ? ' +click ' + o.click : ''} ===`);
console.log(`load event: ${tLoad} ms; requests before interaction: ${nBeforeInteract}; total: ${reqs.length}; heapMB=${perf.heapMB}; view=${perf.view}`);
console.log(`perf: ${JSON.stringify(perf)}`);
console.log('--- by host ---');
for (const [h, g] of [...byHost].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(g.n).padStart(4)}  ${(g.bytes / 1024).toFixed(0).padStart(7)} KB  ${h}`);
console.log('--- by endpoint (count, KB, first ms, statuses) ---');
for (const [k, g] of [...groups].sort((a, b) => b[1].n - a[1].n || a[1].first - b[1].first))
  console.log(`  ${String(g.n).padStart(4)}  ${(g.bytes / 1024).toFixed(0).padStart(7)} KB  ${String(g.first).padStart(6)}ms  ${[...g.status].join('/')}  ${k}`);
const writes = reqs.filter(r => r.kind === 'WRITE-BLOCKED');
if (writes.length) { console.log('--- WRITES ATTEMPTED (blocked) ---'); for (const w of writes) console.log(`  ${w.t}ms ${w.method} ${w.url}`); }
const errs = consoleLines.filter(l => /error|fail|403|404|warn/i.test(l)).slice(0, 25);
if (errs.length) { console.log('--- console (filtered, first 25) ---'); for (const l of errs) console.log('  ' + l); }
console.log('--- timeline of api.github.com requests (ms, url) ---');
for (const r of reqs.filter(r => /api\.github\.com/.test(r.url))) console.log(`  ${String(r.t).padStart(6)} ${r.method} ${r.url.replace('https://api.github.com', '')}`);
