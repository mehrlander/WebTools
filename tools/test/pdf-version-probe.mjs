#!/usr/bin/env node
// Which pdf.js versions does kits/pdf.js actually work on?
//
//   node tools/test/pdf-version-probe.mjs [version ...] [--json]
//
// The kit pins 3.4.120, the version every session from 2026-02 to 2026-05 used.
// Whether to move is a recurring question, and the sort usually answered from a
// changelog. This answers it by running instead: the same fixture and the same
// analysis on each version, with only the library swapped, one column per stage
// of the pipeline.
//
// It installs each version into tools/.preview/pdfjs-versions/ on demand, so it
// needs npm and the network. Not part of any suite; run it when the question
// comes up again.

import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const VERSIONS = args.length ? args : ['3.4.120', '4.10.38', '5.4.149', '6.1.200'];
const cacheDir = path.join(root, 'tools', '.preview', 'pdfjs-versions');

// The same ruled table the browser suite uses, white rule included, so a
// version that changes colour handling shows up as a wrong grid rather than as
// nothing at all.
const COLS = [60, 220, 380, 540], ROWS = [700, 676, 652, 628];
const CELLS = [['AGENCY', 'CODE', 'AMOUNT'],
               ['Retirement Systems', '1240', '457,833'],
               ['Health Care Authority', '1070', '1,204,556']];

async function fixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const black = rgb(0, 0, 0), white = rgb(1, 1, 1);
  for (const y of ROWS) page.drawLine({ start: { x: COLS[0], y }, end: { x: COLS.at(-1), y }, thickness: 1, color: black });
  for (const x of COLS) page.drawLine({ start: { x, y: ROWS.at(-1) }, end: { x, y: ROWS[0] }, thickness: 1, color: black });
  page.drawLine({ start: { x: 140, y: ROWS[1] }, end: { x: 140, y: ROWS[0] }, thickness: 1, color: white });
  CELLS.forEach((r, i) => r.forEach((t, c) =>
    page.drawText(t, { x: COLS[c] + 6, y: ROWS[i] - 16, size: 9, font, color: black })));
  return Buffer.from(await doc.save());
}

// Install once per version, then reuse. The two module shapes are the whole
// migration story: 3.x ships a classic script the kit can load with a
// <script src>, and 4.x onward ships ESM only, so a host page must import it
// and hand it over.
function install(version) {
  const dir = path.join(cacheDir, version);
  const build = path.join(dir, 'node_modules', 'pdfjs-dist', 'build');
  if (!existsSync(build)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{"private":true}');
    execFileSync('npm', ['install', `pdfjs-dist@${version}`, '--no-audit', '--no-fund', '--silent'],
      { cwd: dir, stdio: 'ignore' });
  }
  const esm = existsSync(path.join(build, 'pdf.mjs'));
  return {
    esm,
    lib: readFileSync(path.join(build, esm ? 'pdf.mjs' : 'pdf.min.js')),
    worker: readFileSync(path.join(build, esm ? 'pdf.worker.mjs' : 'pdf.worker.min.js')),
  };
}

const MIME = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.pdf': 'application/pdf' };
function serve(files) {
  return new Promise(resolve => {
    const s = http.createServer((q, r) => {
      const u = q.url.split('?')[0], b = files[u];
      if (!b) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': MIME[path.extname(u)] ?? 'text/html' });
      r.end(b);
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port }));
  });
}

const bytes = await fixture();
const kit = readFileSync(path.join(root, 'lib', 'kits', 'pdf.js'), 'utf8');
const pdflib = readFileSync(path.join(root, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'));
const browser = await chromium.launch();
console.log(`chromium ${browser.version()}\n`);
const report = [];

for (const version of VERSIONS) {
  let mod;
  try { mod = install(version); }
  catch (e) { report.push({ version, error: 'install failed: ' + e.message }); continue; }

  // Either shape hands the kit a pdfjsLib that already exists, so its own
  // loader is bypassed. That is also the supported escape hatch for a page that
  // wants a version the kit does not pin.
  // Extensions matter: a module import of a resource served as text/html is
  // rejected outright, so the served paths carry .mjs / .js rather than a
  // neutral name.
  const libPath = mod.esm ? '/pdf.lib.mjs' : '/pdf.lib.js';
  const workerPath = mod.esm ? '/pdf.worker.mjs' : '/pdf.worker.js';
  const boot = mod.esm
    ? `<script type="module">
         const m = await import('${libPath}');
         window.pdfjsLib = m;
         m.GlobalWorkerOptions.workerSrc = '${workerPath}';
         new Function(await (await fetch('/kit.js')).text())();
         window.__ready = true;
       </script>`
    : `<script src="${libPath}"></script>
       <script>
         pdfjsLib.GlobalWorkerOptions.workerSrc = '${workerPath}';
         fetch('/kit.js').then(r => r.text()).then(t => { new Function(t)(); window.__ready = true; });
       </script>`;

  const { s, port } = await serve({
    '/kit.js': kit, [libPath]: mod.lib, [workerPath]: mod.worker,
    '/pdf-lib.min.js': pdflib, '/f.pdf': bytes,
    '/': `<!doctype html><meta charset="utf-8"><script src="/pdf-lib.min.js"></script>${boot}`,
  });

  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 }).catch(() => {});

  const out = await page.evaluate(async (expected) => {
    const r = { reported: window.pdfjsLib?.version ?? '?', steps: {} };
    const step = async (k, fn) => { try { r.steps[k] = await fn(); } catch (e) { r.steps[k] = 'THREW: ' + e.message; } };
    await step('open', async () => { window.__d = await window.pdf.open('/f.pdf'); return `${window.__d.numPages}p`; });
    await step('items', () => window.__d?.items?.length ?? '-');
    await step('paths', () => `${window.__d?.paths?.h.length}h/${window.__d?.paths?.v.length}v`);
    await step('white', () => (window.__d?.paths?.v ?? []).some(l => l.color === '#ffffff') ? 'seen' : 'MISSED');
    await step('font', () => Object.values(window.__d?.fonts ?? {})[0]?.name ?? '-');
    await step('grid', () => JSON.stringify(window.__d.grids(1)[0]?.matrix) === JSON.stringify(expected) ? 'exact' : 'WRONG');
    return r;
  }, CELLS).catch(e => ({ reported: '?', steps: { open: 'THREW: ' + e.message } }));

  await page.close(); s.close();
  report.push({ version, module: mod.esm ? 'esm' : 'classic', ...out, errors: errs.slice(0, 2) });
}
await browser.close();

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const keys = ['open', 'items', 'paths', 'white', 'font', 'grid'];
const pad = (v, n) => String(v ?? '').slice(0, n - 1).padEnd(n);
console.log(pad('version', 11) + pad('module', 9) + keys.map(k => pad(k, 12)).join(''));
for (const r of report) {
  if (r.error) { console.log(pad(r.version, 11) + r.error); continue; }
  console.log(pad(r.version, 11) + pad(r.module, 9) + keys.map(k => pad(r.steps[k], 12)).join(''));
}
const broken = report.filter(r => r.error || String(r.steps?.open).startsWith('THREW'));
if (broken.length) {
  console.log('\nfailures:');
  for (const r of broken) console.log(`  ${r.version}: ${r.error ?? r.steps.open}`);
}
