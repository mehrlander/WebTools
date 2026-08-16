#!/usr/bin/env node
// The detached-tree guard, checked where it actually matters: a real browser.
//
//   node tools/test/alpine-teardown.mjs
//
// Twenty-seven components inject their own template and defer the init:
//
//     this.$el.innerHTML = this.template;
//     this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
//
// Without that `isConnected`, an element removed between init() and the tick
// it queued gets its tree initialized while detached, and Alpine evaluates
// every expression in the injected template against a scope it has already
// popped: one ReferenceError per binding, for properties of the component
// itself, rethrown asynchronously so they land wherever the event loop has got
// to. Under `node --test` that is fatal to an arbitrary test, which is how it
// was found: branch-brief-groups.test.mjs failing one full-suite run in seven,
// here and on CI, as a whole-file failure with every subtest green.
//
// THE WINDOW IS NARROW AND THAT IS THE POINT. Collapsing a group after it has
// settled throws nothing, in jsdom or here, so the first two browser probes
// written for this came back clean and nearly retired the fix as a jsdom
// artifact. It reproduces only when the removal lands between the mount and
// the deferred init, which is what the two awaited microtasks below arrange.
//
// So the check runs BOTH arms and asserts the difference: the unguarded build
// must throw and the guarded one must not. An assertion that only ever sees
// the fixed code cannot tell you the fix is load-bearing, and this one could
// not, until it was pointed at the right instant.
//
// Exits nonzero on any failure. Not part of `npm test` (needs a browser).
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from '../render/cdn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const compare = { status:'ahead', ahead_by:2, behind_by:0,
  commits:[{sha:'c1',commit:{author:{date:'2026-08-01T00:00:00Z'},message:'one'}}],
  files:[{filename:'lib/a.js',status:'modified',additions:3,deletions:1,patch:'@@ -1 +1 @@'},
         {filename:'docs/b.md',status:'added',additions:9,deletions:0,patch:'@@ -0,0 +1 @@'},
         {filename:'dist/web-tools.js',status:'modified',additions:100,deletions:90,patch:'@@ -1 +1 @@'}]};
const CSV = `locator,creation_mode,analysis_use,description
lib/,hybrid-authored,exclude,Library JavaScript
docs/,hybrid-authored,exclude,The docs
dist/,mechanical,exclude,The pre-build
`;

const libs = ['lib/kits/branch-survey.js','lib/kits/branch-brief.js','lib/kits/content-registry.js',
              'lib/alpineComponents/file-review.js','lib/alpineComponents/branch-brief.js'];
const GUARD = 'this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });';
const BARE  = 'this.$nextTick(() => Alpine.initTree(this.$el));';
const read5 = async (guarded) => {
  const out = {};
  for (const f of libs) {
    const s = await readFile(path.join(root, f), 'utf8');
    out[f] = guarded ? s : s.replaceAll(GUARD, BARE);
  }
  return out;
};
let sources = await read5(true);

const HTML = `<!doctype html><html><body>
<div id="m" x-data="branchBrief({ repo: 'me/tools', branch: 'feat/x', base: 'main' })"></div>
<script>
class FakeGH { constructor(c={}){this.repo=c.repo||'';this.ref=c.ref||'';}
  async compare(){ return ${JSON.stringify(compare)}; }
  async req(){ return []; }
  async get(p){ if(p==='data/design/content.csv') return { text: ${JSON.stringify(CSV)} };
                throw Object.assign(new Error('404'), {status:404}); } }
window.GH = FakeGH; window.TOKEN = 'tkn';
</script>
${libs.map(f => `<script src="/src/${encodeURIComponent(f)}"></script>`).join('\n')}
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer></script>
</body></html>`;

const server = http.createServer(async (req,res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.writeHead(200,{'content-type':'text/html'}); return res.end(HTML); }
  if (u.startsWith('/src/')) { res.writeHead(200,{'content-type':'text/javascript'});
    return res.end(sources[u.slice(5)] ?? ''); }
  try { res.writeHead(200,{'content-type':typeFor(u)}); res.end(await readFile(path.join(root,u.replace(/^\//,'')))); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args:['--no-sandbox'] });
const page = await browser.newPage();
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(origin)) return route.continue();
  const r = resolveCdn(url, root, null);
  if (r.kind==='continue') return route.continue();
  if (r.kind==='empty') return route.fulfill({status:200,contentType:r.contentType,body:''});
  return route.fulfill({status:200,contentType:r.contentType,body:r.body});
});
const errs = [];
page.on('pageerror', e => errs.push('THROW: ' + e.message));
page.on('console', m => { if (/Alpine Expression Error/.test(m.text())) errs.push('WARN: ' + m.text().slice(0,80)); });

const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); failures.push(name); }
};

// Open the group, yield two microtasks so Alpine renders the cards and their
// init() runs, then close before the deferred initTree gets its turn.
const cycle = async () => {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  errs.length = 0;                      // only what the toggle produces
  await page.evaluate(async () => {
    const d = Alpine.$data(document.getElementById('m'));
    d.toggleGroup('mechanical');
    await Promise.resolve();
    await Promise.resolve();
    d.toggleGroup('mechanical');
  });
  await page.waitForTimeout(1800);
  return errs.filter(e => /is not defined|Expression Error/.test(e)).length;
};

const guarded = await cycle();
ok('the guarded build throws nothing when a card is dropped mid-mount',
   guarded === 0, `${guarded} error(s): ${errs.slice(0, 2).join(' | ')}`);

sources = await read5(false);
const bare = await cycle();
ok('and the unguarded build does throw, so the guard is load-bearing',
   bare > 0, 'no errors without the guard either: this check has lost its teeth');

console.log(`\n  guarded ${guarded} error(s), unguarded ${bare}`);
await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} failure(s): ${failures.join(', ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
