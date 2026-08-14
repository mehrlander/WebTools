#!/usr/bin/env node
// Pixel sibling of tools/render/preview.mjs: render a repo page to a real PNG with the
// pre-installed Chromium, headlessly, in this network-restricted sandbox.
//
//   node tools/render/screenshot.mjs <page-path> [--build] [--ref <ref>]
//       [--query <k=v&...>] [--hash <fragment>] [--out <png>] [--width N]
//       [--height N] [--wait MS] [--full]
//
// The page is served from the on-disk working tree over loopback; every external
// request is intercepted and resolved by tools/render/cdn.mjs — own code (gh-api.js
// via jsDelivr, the rest via the GitHub contents API) to local files, third-party
// libs (Tailwind/daisyUI/Phosphor/Alpine) to node_modules. So the real gh.load
// chain runs unmodified against branch code, with no GitHub token.
//
// --build renders the page through its dist/<page>.js instead of the live
// gh.load chain (build it first with tools/build/build.mjs): the page's jsDelivr
// gh-api.js import is rewritten to the local build. Used by tools/build/verify-build.mjs
// to prove the two render identically.
//
// Output PNG + a render log land under tools/.preview/ (gitignored) by default.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { resolveCdn, typeFor } from './cdn.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv) {
  const o = { full: false, build: false, width: 1280, height: 800, wait: 2500, ref: null, query: null, hash: null, out: null, script: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--full') o.full = true;
    else if (a === '--build') o.build = true;
    else if (a === '--ref') o.ref = argv[++i];
    else if (a === '--query') o.query = argv[++i];
    else if (a === '--hash') o.hash = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--width') o.width = +argv[++i];
    else if (a === '--height') o.height = +argv[++i];
    else if (a === '--wait') o.wait = +argv[++i];
    else if (a === '--script') o.script = argv[++i];
    else rest.push(a);
  }
  o.page = rest[0];
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.page) {
  console.error('Usage: node tools/render/screenshot.mjs <page-path> [--build] [--ref <ref>] [--query <k=v&...>] [--script <file>] [--out <png>] [--full]');
  process.exit(2);
}
const pageAbs = path.join(repoRoot, opts.page);
if (!existsSync(pageAbs)) {
  console.error(`Page not found: ${pageAbs}`);
  process.exit(2);
}

const baseName = path.basename(opts.page, path.extname(opts.page));
const outDir = path.join(repoRoot, 'tools', '.preview');
await mkdir(outDir, { recursive: true });
const scriptName = opts.script ? '.' + path.basename(opts.script, path.extname(opts.script)) : '';
const suffix = (opts.build ? '.build' : '') + scriptName;
const pngPath = opts.out ? path.resolve(repoRoot, opts.out) : path.join(outDir, `${baseName}${suffix}.png`);
const logPath = path.join(outDir, `${baseName}${suffix}.shot.log`);

// In --build mode, rewrite the page's jsDelivr gh-api.js import to the local
// dist build so the page boots offline from cache instead of the gh.load chain.
function transformPage(html) {
  if (!opts.build) return html;
  const buildRel = `/dist/${baseName}.js`;
  if (!existsSync(path.join(repoRoot, 'dist', `${baseName}.js`))) {
    throw new Error(`--build: dist/${baseName}.js not found; run: node tools/build/build.mjs ${opts.page}`);
  }
  // Replace the dynamic import of gh-api.js (any ref/template form) with the build.
  const re = /(['"`])https:\/\/cdn\.jsdelivr\.net\/gh\/mehrlander\/web-tools[^'"`]*\/lib\/gh-api\.js\1/g;
  if (!re.test(html)) throw new Error('--build: no gh-api.js jsDelivr import found in page to rewrite');
  return html.replace(re, JSON.stringify(buildRel));
}

// Does this page boot from the pre-build rather than the gh.load chain? Read
// from the page's own source, since that is what decides which code runs, and
// it is the precondition for the staleness warning built after the render.
const preBuildPage = (await readFile(pageAbs, 'utf8')).includes('dist/web-tools.js');

// Loopback static server rooted at the repo. The target page is transformed in
// flight; every other path is served raw from disk (lets dist/<page>.js and any
// page-relative asset resolve same-origin).
const pageUrlPath = '/' + opts.page.split(path.sep).join('/');
const server = http.createServer(async (req, res) => {
  try {
    const reqPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const fp = path.join(repoRoot, reqPath);
    if (!fp.startsWith(repoRoot)) { res.writeHead(403).end(); return; }
    let body = await readFile(fp);
    if (reqPath === pageUrlPath) body = Buffer.from(transformPage(body.toString('utf8')));
    res.writeHead(200, { 'Content-Type': typeFor(fp) });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(String(e.message || e));
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const log = [];
const tally = { fulfill: 0, empty: 0, continue: 0 };
const consoleLines = [];
const errorLines = [];

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height } });
const page = await ctx.newPage();

// Intercept every request. Same-origin (loopback) goes to the static server;
// everything else is classified by the shared resolver.
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.startsWith(`http://127.0.0.1:${port}`)) return route.continue();
  const r = resolveCdn(url, repoRoot, opts.ref);
  tally[r.kind]++;
  if (r.tag) log.push(r.tag);
  if (r.kind === 'continue') return route.continue();
  if (r.kind === 'empty') return route.fulfill({ status: 200, contentType: r.contentType, body: '' });
  return route.fulfill({ status: 200, contentType: r.contentType, body: r.body });
});

page.on('console', m => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => errorLines.push(`[pageerror] ${e.message}`));
page.on('requestfailed', r => {
  const f = r.failure();
  if (f && !/ERR_ABORTED/.test(f.errorText)) errorLines.push(`[requestfailed] ${r.url()} ${f.errorText}`);
});

// --query appends page-level params (e.g. repo=/file= for identity-free boots).
// --hash appends a fragment, for pages that route on it (toss-render's own
// #gh=/#gz=/#data= modes, and any page reached through them).
const qs = [opts.ref ? `use=${encodeURIComponent(opts.ref)}` : '', opts.query || '']
  .filter(Boolean).join('&');
const frag = opts.hash ? '#' + opts.hash.replace(/^#/, '') : '';
const target = `http://127.0.0.1:${port}${pageUrlPath}${qs ? '?' + qs : ''}${frag}`;
let loadedScripts = [];
try {
  await page.goto(target, { waitUntil: 'load', timeout: 30000 });
  // Let the gh.load chain + Alpine settle.
  await page.waitForTimeout(opts.wait);
  loadedScripts = await page.evaluate(() =>
    (window.__loadedScripts || []).map(s => ({ path: s.path, status: s.status }))).catch(() => []);
  // Optional interaction step: drive the page into a state (open a drawer, toggle,
  // resize) before shooting. The script default-exports async (page, ctx) => {}.
  if (opts.script) {
    const scriptAbs = path.resolve(repoRoot, opts.script);
    if (!existsSync(scriptAbs)) throw new Error(`--script not found: ${opts.script}`);
    const mod = await import(pathToFileURL(scriptAbs).href);
    const fn = mod.default;
    if (typeof fn !== 'function') throw new Error(`--script ${opts.script} must default-export an async (page) => {} function`);
    await fn(page, { repoRoot });
    log.push(`script ${opts.script}`);
  }
  await page.screenshot({ path: pngPath, fullPage: opts.full });
} catch (e) {
  errorLines.push(`[fatal] ${e.message}`);
} finally {
  await browser.close();
  server.close();
}

const okScripts = loadedScripts.filter(s => s.status === 'ok').map(s => s.path);
const badScripts = loadedScripts.filter(s => s.status !== 'ok');

// ── Why a screenshot can be evidence about code that is not running ────────
//
// Twice, one week apart, a shot was read as proof about a change it did not
// contain, and BOTH times the page rendered perfectly. That is the whole
// difficulty: the failure mode of this tool is a correct-looking picture.
//
//   1. A lib file failed to load (a syntax error, a fetch miss). gh.load warns
//      and rejects, and the pre-build's inlined copy of that component stays
//      registered, so the page runs the PREVIOUS build of the file being
//      changed. Recorded as a NOT-ok row in loadedScripts.
//      (snags: silent-fallback-old-build, 2026-08-14)
//   2. dist/web-tools.js is behind lib/. A page that boots from the pre-build
//      loads no lib files at all, so nothing fails and nothing is recorded:
//      the shot is simply of the last build. Nothing in the run detects this,
//      which is why it is checked here rather than inferred.
//      (web-tools PR #419, chasing an image module that was working)
//
// Both were already discoverable from this log, at the bottom, after the
// intercept list. Being present is not the same as being read, so anything
// that means "these pixels may not be your code" is hoisted to the TOP and
// labeled. Warnings do not fail the run: a stale pre-build is often exactly
// what you meant to shoot.
const warnings = [];
if (badScripts.length) {
  warnings.push(`${badScripts.length} lib file(s) did NOT load: ${badScripts.map(s => s.path).join(', ')}`);
  warnings.push('  a page that boots the pre-build keeps running its inlined copy, so these pixels may be the last build');
}
if (preBuildPage) {
  const check = spawnSync(process.execPath, [path.join(repoRoot, 'tools/build/build-lib.mjs'), '--check'],
                          { cwd: repoRoot, encoding: 'utf8' });
  if (check.status !== 0) {
    warnings.push('dist/web-tools.js is BEHIND lib/, and this page boots from it: these pixels are the last build');
    warnings.push('  run: npm run build:lib');
  }
}
// Thrown JS only. A failed request is NOT warned on: this sandbox blocks the
// GitHub API, so nearly every shot carries two or three of them, and a warning
// block that fires every time is a block nobody reads. They stay listed below,
// where a count is what they are worth.
const thrown = errorLines.filter(l => /^\[(pageerror|fatal)\]/.test(l));
if (thrown.length) warnings.push(`${thrown.length} thrown error(s): ${thrown[0].slice(0, 120)}`);

const summary = [
  `=== screenshot: ${opts.page}${opts.build ? ' [build]' : ''}${opts.ref ? ` @ ${opts.ref}` : ''} ===`,
  ...(warnings.length ? ['', '!!! WARNINGS !!!', ...warnings.map(w => `  ${w}`), ''] : []),
  `png: ${path.relative(repoRoot, pngPath)}`,
  `requests: fulfill=${tally.fulfill} empty=${tally.empty} continue=${tally.continue}`,
  '',
  `--- loadedScripts ok (${okScripts.length}) ---`,
  ...okScripts.map(s => `  ${s}`),
  ...(badScripts.length ? ['', `--- loadedScripts NOT ok (${badScripts.length}) ---`, ...badScripts.map(s => `  ${s.path} [${s.status}]`)] : []),
  '',
  `--- intercepts (${log.length}) ---`,
  ...log,
  '',
  `--- console (${consoleLines.length}) ---`,
  ...consoleLines,
  '',
  `--- errors (${errorLines.length}) ---`,
  ...errorLines,
].join('\n');

await writeFile(logPath, summary);
console.log(summary);
console.log(`\nwrote: ${path.relative(repoRoot, pngPath)}`);
console.log(`wrote: ${path.relative(repoRoot, logPath)}`);
process.exit(errorLines.some(l => /\[fatal\]/.test(l)) ? 1 : 0);
