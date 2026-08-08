#!/usr/bin/env node
// Bake a page's gh.load chain inline -> a standalone dist/<page>.html.
//
//   node tools/build/bake.mjs <page-path>             -> dist/<page>.html
//
// The Node twin of the FAB's "Fully offline" mode: same shared emit + bake
// (lib/build.js), fed by the static graph instead of runtime __loadedScripts.
// This is code-only — it inlines the gh.load chain so the page boots with no
// network. The browser path (kits/bundle.js) additionally zips the read() data
// beside it; bake here assumes the page carries no page-relative data, or that the
// HTML will sit with its data (as the offline zip lays it out).

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from './graph.mjs';
import { loadKit } from './kit-shim.mjs';

const REPO = 'mehrlander/web-tools';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node tools/build/bake.mjs <page-path>');
  process.exit(2);
}

let graph;
try {
  graph = buildGraph(repoRoot, arg);
} catch (e) {
  console.error(`bake: ${e.message}`);
  process.exit(1);
}

const { buildKit } = loadKit(repoRoot, 'lib/build.js');
const ghApiSrc = await readFile(path.join(repoRoot, 'lib/gh-api.js'), 'utf8');
const cache = Object.fromEntries(graph.files.map(f => [f.key, f.src]));
const buildJs = buildKit.emit({ ghApiSrc, cache, repo: REPO, defaultRef: graph.defaultRef });

const pageHtml = await readFile(path.join(repoRoot, arg), 'utf8');
const baked = buildKit.bake(pageHtml, buildJs);

const baseName = path.basename(arg, path.extname(arg));
const distDir = path.join(repoRoot, 'dist');
await mkdir(distDir, { recursive: true });
const outPath = path.join(distDir, `${baseName}.html`);
await writeFile(outPath, baked);

console.log(`bake: ${arg}`);
console.log(`  inlined ${graph.files.length} own-code files`);
console.log(`  -> ${path.relative(repoRoot, outPath)}  (${(Buffer.byteLength(baked) / 1024).toFixed(0)}k)`);
