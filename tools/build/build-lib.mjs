#!/usr/bin/env node
// build-lib.mjs — emit "the pre-build": the whole lib/ frozen into one
// self-booting, offline artifact at dist/web-tools.js.
//
//   node tools/build/build-lib.mjs            -> dist/web-tools.js
//
// Unlike tools/build/build.mjs (which walks a single page's gh.load graph and
// caches only what that page reaches), this caches *every* lib/*.js, so a page
// can adopt the whole library with one import instead of a gh.load chain. It
// reuses the same emitter (lib/build.js, window.buildKit.emit) so the
// format can't drift from the per-page build or the in-browser baker.
//
// Auto-boot: emit() already runs gh-boot.js (GitHub access + console + vanilla
// utils). We extend that boot to register every Alpine component, then start
// Alpine via alpine-bundle.js (last). Kits (compression/persistence/io/…) ride
// along cached-but-unexecuted; a page's gh.load('kits/x.js') resolves instantly
// from the cache. Third-party libs stay on their CDN tags.
//
// Deterministic by construction (sorted cache + sorted boot, no date stamp), so
// the committed dist/web-tools.js only changes when lib/ actually changes. The
// commit-time hook (.claude/hooks/build-on-commit.sh) keeps it in sync.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKit } from './kit-shim.mjs';

const REPO = 'mehrlander/web-tools';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const libDir = path.join(repoRoot, 'lib');

// Every .js under lib/, as posix paths relative to lib/ (the gh.load arg form).
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (statSync(fp).isDirectory()) out.push(...walk(fp));
    else if (name.endsWith('.js')) out.push(fp);
  }
  return out;
}

const allJs = walk(libDir)
  .map(fp => path.relative(libDir, fp).split(path.sep).join('/'))
  .filter(rel => rel !== 'gh-api.js') // the loader itself is emitted separately
  .sort();

const { buildKit } = loadKit(repoRoot, 'lib/build.js');
const ghApiSrc = readFileSync(path.join(libDir, 'gh-api.js'), 'utf8');

// cache: { 'lib/<path>': source } — what GH.prototype.get receives.
const cache = {};
for (const rel of allJs) cache['lib/' + rel] = readFileSync(path.join(libDir, rel), 'utf8');

// Register all components, then boot Alpine (alpine-bundle.js last — it fires
// alpine:init, which runs every component's registration handler).
//
// kits/url-params.js and kits/repo-address.js go FIRST, ahead of the
// components. They are the kits a component reads at init: stage.js delegates
// the fragment-first param read to one and the owner/repo[@ref]:path grammar to
// the other, and a page's own gh.load chain runs AFTER this import, so a
// component that read a stage link during init would find them undefined.
const components = allJs.filter(p => p.startsWith('alpineComponents/'));
const extraBoot = ['kits/url-params.js', 'kits/repo-address.js', ...components, 'alpine-bundle.js'];

const header = `// dist/web-tools.js — the pre-build: the whole web-tools lib/ frozen into one
// self-booting, offline artifact (the gh-api.js loader + an inlined source cache
// of every lib/*.js). Importing it boots the loader, registers all Alpine
// components, and starts Alpine — no per-file gh.load chain, no network for own
// code. Third-party libs (Tailwind/daisyUI/Phosphor/Alpine/CodeMirror) stay on
// their CDN tags, and ?use=<ref> still re-pins to the CDN for review.
//
// GENERATED — do not edit. Rebuild: npm run build:lib  (auto-refreshed by the
// commit-time hook in .claude/settings.json whenever lib/ changes).

`;

const out = buildKit.emit({ ghApiSrc, cache, repo: REPO, defaultRef: 'main', header, extraBoot });

const distDir = path.join(repoRoot, 'dist');
const outPath = path.join(distDir, 'web-tools.js');

// --check: compare instead of write, the same idiom pages-index uses. The
// commit hook is supposed to keep this file in lockstep with lib/, but a hook
// only runs where it is wired: a session whose project root sits above the repo
// never loads .claude/settings.json, and the staleness was silent. Emit is
// deterministic, so comparing bytes is the whole test.
if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(outPath, 'utf8'); } catch {}
  if (cur !== out) {
    console.error('build:lib: dist/web-tools.js is stale — run `npm run build:lib`.');
    process.exit(1);
  }
  console.log('build:lib: dist/web-tools.js is up to date.');
  process.exit(0);
}

mkdirSync(distDir, { recursive: true });
writeFileSync(outPath, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log('build:lib — the pre-build');
console.log(`  cached lib/ files (${allJs.length}):`);
for (const rel of allJs) console.log(`    lib/${rel}`);
console.log(`  auto-boot: gh-boot.js + ${components.length} components + alpine-bundle.js`);
console.log(`  -> dist/web-tools.js  (${kb}k)`);
