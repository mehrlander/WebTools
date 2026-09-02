#!/usr/bin/env node
// build-app.mjs — emit the APP's pre-build: the part of lib/ the Web Tools app
// can reach, frozen into one self-booting artifact at dist/app.js.
//
//   node tools/build/build-app.mjs            -> dist/app.js
//   node tools/build/build-app.mjs --check    -> exit 1 if dist/app.js is stale
//
// The whole-library pre-build (build-lib.mjs, dist/web-tools.js) inlines every
// lib/*.js and executes every component's registration at import. The app was
// importing it and paying for what it never uses: measured 2026-09-02, 44 files
// (2.6 MB) executed at import and 1.1 MB of kits cached that no app path loads
// (annotate, pdf, dictate, wring, xlsx). This is the same emitter (lib/build.js)
// seeded with the app's REACH instead of the whole folder, so the format cannot
// drift from the other two builds, and dist/web-tools.js stays as it is for the
// pages that import it (branch.html, review.html, session.html, ...).
//
// Reach is a closure over two kinds of edge, walked from app/index.html:
//   - own-code paths named as string literals anywhere in a file: gh.load(),
//     _selfLoad(), loadLib(), a BOOT manifest entry's `path:`, a FAB_BOOT value.
//     Any literal that looks like a lib path counts, which over-includes rather
//     than under-includes (a cached, unexecuted kit costs bytes and nothing else).
//   - Alpine components named in markup: x-data="name(" in the page, in a
//     component's template string, or in a setAttribute('x-data', ...) call.
//     Names map to files by their Alpine.data('name') registration.
// A path computed at runtime (estate.js builds three) is invisible here, the
// same limit the per-page walker documents (docs/loader.md); such a load falls
// through the cache to the contents API at runtime, which is correct and costs
// one call.
//
// Deterministic (sorted cache, sorted boot, no stamp), held to lib/ by the
// commit hook (.githooks/pre-commit) and by tools/test/derived-artifacts.test.mjs.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKit } from './kit-shim.mjs';

const REPO = 'mehrlander/web-tools';
const PAGE = 'app/index.html';
const OUT = 'dist/app.js';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const libDir = path.join(repoRoot, 'lib');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (statSync(fp).isDirectory()) out.push(...walk(fp));
    else if (name.endsWith('.js')) out.push(fp);
  }
  return out;
}
const allJs = walk(libDir).map(fp => path.relative(libDir, fp).split(path.sep).join('/')).sort();
const libSet = new Set(allJs);

// Alpine.data('name') -> 'alpineComponents/<file>.js'
const componentByName = new Map();
for (const rel of allJs.filter(p => p.startsWith('alpineComponents/'))) {
  const src = readFileSync(path.join(libDir, rel), 'utf8');
  for (const m of src.matchAll(/Alpine\.data\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) componentByName.set(m[1], rel);
}

// Code only: drop comment-only lines so a doc example is not an edge.
const code = src => src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');

// Every string literal that names a lib file, plus every x-data component name.
const PATH_RE = /['"`]((?:kits|alpineComponents)\/[\w.-]+\.js|gh-[\w-]+\.js|alpine-bundle\.js|vanilla-bundle\.js)['"`]/g;
const XDATA_RE = /x-data(?:=|['"]\s*,\s*)[`'"]\s*([A-Za-z_$][\w$]*)/g;
function edges(src) {
  const c = code(src);
  const paths = new Set(), names = new Set();
  for (const m of c.matchAll(PATH_RE)) if (libSet.has(m[1])) paths.add(m[1]);
  for (const m of c.matchAll(XDATA_RE)) names.add(m[1]);
  return { paths, names };
}

// Seeds: the loader's own boot (gh-boot.js reads its BOOT manifest and the FAB
// block), the three kits the whole-library boot puts ahead of the components
// because a component reads them at init, and the page itself.
const pageSrc = readFileSync(path.join(repoRoot, PAGE), 'utf8');
const seeds = ['gh-boot.js', 'alpine-bundle.js', 'kits/url-params.js', 'kits/repo-address.js', 'kits/csv.js'];
const reached = new Set();
const unknownNames = new Set();
const queue = [...seeds];
const take = (src) => {
  const { paths, names } = edges(src);
  for (const p of paths) queue.push(p);
  for (const n of names) {
    const file = componentByName.get(n);
    if (file) queue.push(file); else unknownNames.add(n);
  }
};
take(pageSrc);
while (queue.length) {
  const rel = queue.shift();
  if (reached.has(rel) || rel === 'gh-api.js') continue;
  reached.add(rel);
  take(readFileSync(path.join(libDir, rel), 'utf8'));
}

// LAZY: reached by a literal, so the walk finds them, but loaded only by an
// explicit act (start the annotator, dictate, open a PDF or a spreadsheet) and
// heavy: 470 KB between them on 2026-09-02. Left out of the artifact, so the
// first such act costs one contents-API read at the running ref instead of
// every app load paying their parse. The loader's cache miss is the ordinary
// path, not a special case.
const LAZY = new Set(['kits/annotate.js', 'kits/pdf.js', 'kits/dictate.js', 'kits/xlsx.js']);
for (const p of LAZY) reached.delete(p);

const files = [...reached].sort();
const components = files.filter(p => p.startsWith('alpineComponents/'));
const skipped = allJs.filter(p => p !== 'gh-api.js' && !reached.has(p));

const { buildKit } = loadKit(repoRoot, 'lib/build.js');
const ghApiSrc = readFileSync(path.join(libDir, 'gh-api.js'), 'utf8');
const cache = {};
for (const rel of files) cache['lib/' + rel] = readFileSync(path.join(libDir, rel), 'utf8');

// Same boot order as the whole-library pre-build, over the reached set.
const extraBoot = ['kits/url-params.js', 'kits/repo-address.js', 'kits/csv.js', ...components, 'alpine-bundle.js']
  .filter(p => reached.has(p));

const header = `// dist/app.js — the Web Tools app's pre-build: the part of lib/ the app can
// reach (${files.length} of ${allJs.length - 1} files), frozen into one self-booting artifact by
// the same emitter as dist/web-tools.js. Importing it boots the loader,
// registers the ${components.length} Alpine components the app mounts, and starts Alpine.
// A lib path the app names at runtime but this walk did not see falls through
// to the contents API, which is the loader's ordinary behaviour.
//
// GENERATED — do not edit. Rebuild: npm run build:app  (refreshed by the
// commit hook whenever lib/ or app/index.html changes).

`;

const out = buildKit.emit({ ghApiSrc, cache, repo: REPO, defaultRef: 'main', header, extraBoot });
const outPath = path.join(repoRoot, OUT);

if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(outPath, 'utf8'); } catch {}
  if (cur !== out) {
    console.error(`build:app: ${OUT} is stale — run \`npm run build:app\`.`);
    process.exit(1);
  }
  console.log(`build:app: ${OUT} is up to date.`);
  process.exit(0);
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log('build:app — the app pre-build');
console.log(`  reached ${files.length} of ${allJs.length - 1} lib files (${components.length} components); not reached (${skipped.length}):`);
for (const rel of skipped) console.log(`    lib/${rel}${LAZY.has(rel) ? '   (lazy: loads on first use)' : ''}`);
if (unknownNames.size) console.log(`  x-data names with no component file (inline or foreign): ${[...unknownNames].sort().join(', ')}`);
console.log(`  -> ${OUT}  (${kb}k)`);
