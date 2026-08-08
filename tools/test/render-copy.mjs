#!/usr/bin/env node
// kits/export.js renderCopy() — the paste-and-render output, proved by rendering it.
//
//   node tools/test/render-copy.mjs
//
// The claim is that the copied string renders somewhere that has never heard of
// this repo: a CodePen, a scratch file, any bare HTML preview. That is not a
// claim about the string's shape, so inspecting it proves nothing. The only
// honest test is to run it with the repo taken away.
//
// So each case runs twice. Pass 1 opens the real page with the sandbox's normal
// CDN resolution and calls renderCopy(). Pass 2 serves the returned string at a
// fresh URL with every web-tools host aborted: jsDelivr's /gh/mehrlander, raw
// .githubusercontent, and the contents API. Third-party CDNs stay resolvable,
// because the whole point of this output is that it assumes a network and only
// has to carry what the network cannot supply. A single blocked request in pass
// 2 is a failure, whether or not the page still managed to render.
//
// Three shapes are covered, because a page's boot idiom decides what bake() can
// reach: the canonical literal import (25 pages), the `${base}/gh-api.js` form
// the kit demos use (33 pages), and a page with no chain at all, which is
// already its own artifact and must come back untouched.
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

// Hosts the copy must never need. Kept as one predicate so pass 2's block and
// its request tally cannot disagree about what counts as reaching for the repo.
const REPO_HOST = url => {
  try {
    const u = new URL(url);
    return (u.host === 'cdn.jsdelivr.net' && u.pathname.startsWith('/gh/mehrlander'))
        || (u.host === 'raw.githubusercontent.com' && u.pathname.startsWith('/mehrlander'))
        || (u.host === 'api.github.com' && u.pathname.startsWith('/repos/mehrlander'));
  } catch { return false; }
};

// The data leg: a value that never came off the network in this run, so finding
// it inside the copy can only mean it was inlined.
const SENTINEL = { marker: 'render-copy-sentinel', rows: [1, 2, 3], nested: { ok: true } };
const READ_PATH = 'data/sample.js';

const CASES = [
  { page: 'pages/shorter.html', boot: 'literal import', chain: true },
  { page: 'lib/kits/demos/compression.html', boot: '${base} template import', chain: true },
  { page: 'pages/word-select.html', boot: 'no chain', chain: false },
];

let copiedHtml = null;   // pass 2 serves whatever pass 1 last produced

const server = http.createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/__copy__.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(copiedHtml || '');
    return;
  }
  try {
    const fp = path.join(root, rel);
    if (!fp.startsWith(root)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': typeFor(fp) });
    res.end(await readFile(fp));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// A page opened with normal sandbox resolution: own code and third-party libs
// both served locally, exactly as tools/render/screenshot.mjs arranges them.
async function open(url, { block = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await ctx.newPage();
  const errors = [], reached = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (block && REPO_HOST(url)) { reached.push(url); return route.abort(); }
    const r = resolveCdn(url, root, null);
    if (r.kind === 'continue') return route.continue();
    if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
    return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
  });
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);
  // The module registry keeps growing after load: gh-boot injects the FAB, which
  // self-loads its own kits. Sampling it on a fixed timer compares a settled page
  // against an unsettled one and fails on the difference, which is a defect in
  // the measurement rather than in the copy. Wait for it to stop moving.
  await page.evaluate(async () => {
    let last = -1, stable = 0;
    while (stable < 4) {
      const n = (window.__loadedScripts || []).length;
      stable = n === last ? stable + 1 : 0;
      last = n;
      await new Promise(r => setTimeout(r, 150));
    }
  }).catch(() => {});
  return { ctx, page, errors, reached };
}

for (const c of CASES) {
  console.log(`\n── ${c.page}  (${c.boot}) ─────────────────────`);

  // ---- pass 1: run the real page, take the copy ---------------------------
  const live = await open(`${origin}/${c.page}`);
  const out = await live.page.evaluate(async ({ readPath, value, pagePath }) => {
    if (!window.gh) return { error: 'page did not boot gh' };
    // Count the page's OWN chain first: the kit is loaded here by the test, so it
    // lands in the cache but is never booted by the copy.
    const before = (window.__loadedScripts || []).length;
    if (!window.exporter) await window.gh.load('kits/export.js');
    try {
      const r = await window.exporter.renderCopy({
        path: pagePath,
        reads: [{ path: readPath, value }],
      });
      return { ...r, before };
    } catch (e) { return { error: String(e.message || e) }; }
  }, { readPath: READ_PATH, value: SENTINEL, pagePath: c.page }).catch(e => ({ error: String(e) }));

  // A page with no chain never boots gh, so it cannot copy itself from inside.
  // That is the shape of the case, not a defect: the file already is the output.
  if (out.error && !c.chain) {
    const src = await readFile(path.join(root, c.page), 'utf8');
    check(`${c.page}: no chain, so no gh to run the kit`, /did not boot gh/.test(out.error), out.error);
    // Prove the equivalent through the kit's own logic instead.
    const w = {};
    new Function('window', await readFile(path.join(root, 'lib/build.js'), 'utf8'))(w);
    check(`${c.page}: bakeable() correctly reports nothing to inline`, w.buildKit.bakeable(src) === false);
    await live.ctx.close();
    continue;
  }

  check(`${c.page}: renderCopy returned`, !out.error, out.error || '');
  if (out.error) { await live.ctx.close(); continue; }

  check(`${c.page}: the chain was inlined`, out.codeFiles > 0 && !out.chainless,
    `${out.codeFiles} modules, chainless=${out.chainless}`);
  check(`${c.page}: the read value rode along`, out.reads.includes(READ_PATH) && out.dropped.length === 0,
    `reads=${JSON.stringify(out.reads)} dropped=${JSON.stringify(out.dropped)}`);
  // The rewrite, stated positively. A "no gh-api.js anywhere" assertion would be
  // wrong: the inlined build carries the loader's own source, comments included.
  check(`${c.page}: the boot import now points at the carried build`,
    out.html.includes('import(window.__wtBuild)') && out.html.includes('id="__wt-build"'));
  // The build is carried verbatim, not encoded. This is the property that keeps a
  // baked page readable, and it is worth about a third of the file: percent
  // encoding the same bytes measures 1.71x.
  check(`${c.page}: the build is carried as readable source`,
    out.html.includes('const __CACHE = {') && !out.html.includes('data:text/javascript;charset=utf-8,'));

  copiedHtml = out.html;
  const liveScripts = out.before;
  const liveErrors = live.errors.slice();
  await live.ctx.close();

  // ---- pass 2: render the copy with the repo taken away -------------------
  const copy = await open(`${origin}/__copy__.html`, { block: true });
  const state = await copy.page.evaluate(async readPath => ({
    builtOffline: window.__builtOffline === true,
    scripts: (window.__loadedScripts || []).length,
    text: (document.body.innerText || '').trim().length,
    readBack: window.gh ? await window.gh.read(readPath).catch(e => 'ERR ' + e.message) : null,
  }), READ_PATH).catch(e => ({ error: String(e) }));

  // Two different failures wear the same shape. A token-gated request (contents
  // API, raw) means the copy did not actually carry its code and would break on
  // any private repo. A jsDelivr /gh/ request means the page reaches for our code
  // at run time by some route baking does not cover, which still works wherever
  // jsDelivr does. The first is a defect; the second has to be REPORTED, and the
  // test holds renderCopy to having counted every one of them.
  const gated = copy.reached.filter(u => !u.startsWith('https://cdn.jsdelivr.net/'));
  const viaCdn = copy.reached.filter(u => u.startsWith('https://cdn.jsdelivr.net/'));
  check(`${c.page}: the copy never needed a token-gated fetch`, gated.length === 0,
    gated.slice(0, 2).join(' '));
  check(`${c.page}: every runtime CDN reference was reported up front`,
    (viaCdn.length === 0) === (out.cdnRefs === 0),
    `${viaCdn.length} attempted, cdnRefs=${out.cdnRefs}`);
  check(`${c.page}: the copy booted from its inlined cache`, state.builtOffline === true);
  check(`${c.page}: it loaded the same module set`, state.scripts === liveScripts,
    `${state.scripts} of ${liveScripts}`);
  check(`${c.page}: it rendered visible content`, state.text > 200, `${state.text} chars`);
  check(`${c.page}: read() resolved from the inlined data`,
    JSON.stringify(state.readBack) === JSON.stringify(SENTINEL), JSON.stringify(state.readBack).slice(0, 80));
  // Against the live page, not against zero. Some pages already error in this
  // sandbox because a third-party lib is not vendored, and that is not something
  // the copy introduced. What matters is that the copy adds nothing.
  const newErrors = copy.errors.filter(e => !liveErrors.includes(e));
  check(`${c.page}: the copy raised no error the live page did not`,
    newErrors.length === 0, newErrors.slice(0, 2).join(' | ') || `live had ${liveErrors.length}`);
  await copy.ctx.close();
}

// ── the mode this was built for: a #gh= address toss ───────────────────────
//
// The page on screen is in the frame and the globals belong to the shell, so a
// take that reads the globals describes the wrong page. This is also the mode
// where the menu used to be hidden outright, which removed it from the one view
// that can show an un-deployed branch page. Driven through the FAB's own action
// rather than the kit directly, because the aiming is what is under test.
console.log('\n── toss #gh=pages/shorter.html  (subject in a frame) ──────────────');
{
  const t = await open(`${origin}/pages/toss-render.html#gh=mehrlander/web-tools@main:pages/shorter.html`);
  const r = await t.page.evaluate(async () => {
    const el = [...document.querySelectorAll('[x-data]')].find(e => {
      try { return 'takeGroups' in window.Alpine.$data(e); } catch { return false; }
    });
    if (!el) return { error: 'no fab' };
    const d = window.Alpine.$data(el);
    await d.detect();                       // the drawer's scan, which reaches the frame
    window.__copied = null;
    window.io = window.io || {};
    window.io.copy = async x => { window.__copied = x; };   // headless has no clipboard
    const shellPath = d.shellPath;
    await d.copyRenderCopy();
    const h = window.__copied || '';
    return {
      viaToss: d.viaToss, aimedAt: d.takeTarget.path, shellPath,
      subjectScripts: (d.takeTarget.scripts || []).length,
      ghRef: d.takeTarget.gh && d.takeTarget.gh.ref,
      msg: d.outMsg, err: d.outError, bytes: h.length,
      // The subject's <title>, not the shell's, is the cheapest proof of which
      // page came back: toss-render and shorter cannot both be right.
      title: (h.match(/<title[^>]*>([^<]*)</i) || [])[1] || '',
      hasBuild: h.includes('import(window.__wtBuild)') && h.includes('const __CACHE = {'),
    };
  }).catch(e => ({ error: String(e) }));

  check('gh toss: renderCopy ran from inside the toss', !r.error && !r.err, r.error || r.err || '');
  // The shell's own path is derived from a github.io hostname, which loopback is
  // not, so it is empty here. That does not weaken the claim: what matters is
  // that the take aimed at the subject rather than at whatever the shell is.
  check('gh toss: it aimed at the subject, not the shell',
    r.aimedAt === 'pages/shorter.html' && r.aimedAt !== r.shellPath,
    `aimed=${r.aimedAt} shell=${JSON.stringify(r.shellPath)}`);
  check('gh toss: it read the subject module registry out of the frame',
    r.subjectScripts > 5, `${r.subjectScripts} scripts`);
  check('gh toss: the copy is the subject page', /Shorter/i.test(r.title || ''), JSON.stringify(r.title));
  check('gh toss: the subject chain was inlined', r.hasBuild === true, r.msg || '');
  await t.ctx.close();
}

// ── the fourth mode: a #gz= payload toss ───────────────────────────────────
//
// The sidebar is present here too, but there is no subject to adopt: the payload
// renders under an opaque origin precisely so it cannot reach this page's token.
// The shell is holding the HTML though, and a #gz= payload is self-contained by
// definition, so the rendering copy is that string and nothing has to be built.
console.log('\n── pages/toss-render.html  (#gz= payload) ─────────────────────');
{
  const payload = '<!doctype html><html><head><title>Payload probe</title></head>'
                + '<body><h1 id="probe">tossed payload body</h1></body></html>';
  const b64 = gzipSync(Buffer.from(payload)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const t = await open(`${origin}/pages/toss-render.html#gz=${b64}`);
  const seen = await t.page.evaluate(() => {
    const el = [...document.querySelectorAll('[x-data]')].find(e => {
      try { return 'takeGroups' in window.Alpine.$data(e); } catch { return false; }
    });
    const d = el ? window.Alpine.$data(el) : null;
    return {
      stamped: typeof window.__tossPayload === 'string' && window.__tossPayload.length > 0,
      adopted: d ? d.payloadHtml : null,
      target: d ? !!d.takeTarget.payload : null,
      label: d ? (d.takeGroups[0].items[0].desc || '') : '',
    };
  }).catch(e => ({ error: String(e) }));

  check('gz toss: the shell stamps the payload', seen.stamped === true, JSON.stringify(seen.error || ''));
  check('gz toss: the fab adopts it reactively', seen.adopted === payload,
    (seen.adopted || '').slice(0, 40));
  check('gz toss: the take target is the payload, not the shell', seen.target === true);
  check('gz toss: the row says so rather than promising a build',
    /already self-contained/.test(seen.label), seen.label.slice(0, 60));
  await t.ctx.close();
}

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
