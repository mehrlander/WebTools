// use-boot-block.test.mjs — the ?use= boot block, which is how every render
// link in the conventions reaches a branch.
//
// A page previewed at a ref fetches lib/gh-api.js from raw.githubusercontent
// and blob-imports it, because jsDelivr's branch-tip listing lags a fresh push
// by hours. The blob: URL carries no ref for gh-api to parse out of
// import.meta.url, so the page has to hand it one: window.__ghBlobBoot =
// { repo, ref }, read at lib/gh-api.js's module scope.
//
// The defect this exists for: pages/audit-render.html shipped a hand-rolled
// block setting { ref, base }. `repo` was undefined, every load asked
// api.github.com for /repos//contents/…, and the page rendered blank with a
// FAB on it. The suite was green, because no test sets `use` and the toss's
// #gh= route is what injects it, so tapping the branch toss was the first time
// that branch had ever run the block. It reached the reader.
//
// So this reads the blocks as text. It cannot prove a page boots; what it
// proves is that the four things the runtime needs from the block are in it and
// agree with each other, which is the whole class the defect came from.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const walk = dir => readdirSync(dir).flatMap(name => {
  const full = path.join(dir, name);
  if (name === 'node_modules') return [];
  if (statSync(full).isDirectory()) return walk(full);
  return name.endsWith('.html') ? [full] : [];
});

const pages = ['app', 'pages', 'popups', 'lib', 'archive']
  .flatMap(d => walk(path.join(repoRoot, d)))
  .map(full => ({ rel: path.relative(repoRoot, full).split(path.sep).join('/'),
                  src: readFileSync(full, 'utf8') }));

// The raw fetch is what identifies a ?use= block, in both families: the chain
// pages fetch lib/gh-api.js, the pre-build pages fetch dist/<bundle>.js.
const RAW = /https:\/\/raw\.githubusercontent\.com\/([^/`'"]+\/[^/`'"]+)\/\$\{(\w+)\}\/([^`'"]+)/g;

// One block per raw fetch: from the `if (` guarding it to the revoke that ends
// it. Every page in the tree writes it in that shape.
//
// A raw fetch that does NOT blob-import is a different thing and not this
// gate's business: toss-render's bookmarklet reads a blob's text off
// raw.githubusercontent and hands it to the gzip route, and it recovers from a
// bad response rather than throwing on one.
function blocks(src) {
  return [...src.matchAll(RAW)].map(m => {
    const open = src.lastIndexOf('if (', m.index);
    const close = src.indexOf('revokeObjectURL', m.index);
    if (close < 0) return null;
    const text = src.slice(open, close);
    if (!/URL\.createObjectURL/.test(text) || !/await\s+import\s*\(/.test(text)) return null;
    return { repo: m[1], refVar: m[2], file: m[3], text };
  }).filter(Boolean);
}

const found = pages.flatMap(p => blocks(p.src).map(b => ({ ...b, rel: p.rel })));

test('the scan reaches the blocks it is meant to gate', () => {
  // Vacuity guard. Every render link the conventions mint rides this block, so
  // a scan that quietly matched nothing would pass forever.
  assert.ok(found.length >= 30,
    `only ${found.length} ?use= blocks matched; the shape moved and this gate went blind`);
  assert.ok(found.some(b => b.rel === 'pages/audit-render.html'),
    'the page the defect shipped on is not being scanned');
});

test('a fetch that failed is never blob-imported', () => {
  // raw answers a bad ref with an HTML 404 page and a 200-shaped body is not
  // what makes it importable: the Blob sets its own JS type, so the page would
  // import the error page and fail somewhere unrelated.
  const bad = found.filter(b => !/if\s*\(!\w+\.ok\)\s*throw/.test(b.text)).map(b => b.rel);
  assert.deepEqual([...new Set(bad)], [],
    'a ?use= block blob-imports without checking the response');
});

// ── the chain family: the four facts gh-api reads ──────────────────────────
const chain = found.filter(b => b.file.startsWith('lib/gh-api.js'));

test('every chain page hands gh-api a repo, not just a ref', () => {
  assert.ok(chain.length >= 30, `only ${chain.length} chain blocks; expected the whole set`);
  for (const b of chain) {
    const m = b.text.match(/__ghBlobBoot\s*=\s*\{([^}]*)\}/);
    assert.ok(m, `${b.rel}: a ?use= chain block with no __ghBlobBoot assignment`);
    assert.match(m[1], /repo\s*:\s*['"][^/'"]+\/[^/'"]+['"]/,
      `${b.rel}: __ghBlobBoot needs repo: 'owner/name'. Without it gh-api builds ` +
      `/repos//contents/… and the page renders blank. This is the audit-render defect.`);
  }
});

test('the boot object and the fetch name the same repo and the same ref', () => {
  // Two facts stated twice in one block, which is how they came apart: the
  // hand-rolled version kept the fetch and reinvented the object.
  for (const b of chain) {
    const m = b.text.match(/__ghBlobBoot\s*=\s*\{([^}]*)\}/);
    const repo = m[1].match(/repo\s*:\s*['"]([^'"]+)['"]/)[1];
    assert.equal(repo, b.repo, `${b.rel}: __ghBlobBoot repo is ${repo}, the fetch reads ${b.repo}`);
    // Shorthand `ref` or `ref: ident`; either way it must be the variable the
    // URL interpolated, or the page loads one ref and reports another.
    const ref = m[1].match(/\bref\s*:\s*(\w+)/)?.[1] ?? (/\bref\b\s*(?:,|$)/.test(m[1]) ? 'ref' : null);
    assert.equal(ref, b.refVar,
      `${b.rel}: __ghBlobBoot carries ref=${ref}, the fetch interpolates \${${b.refVar}}`);
  }
});

test('the boot object is set before the import that reads it', () => {
  // gh-api reads window.__ghBlobBoot at module scope, so an assignment after
  // the import is inert and the page silently falls back to parsing a blob:
  // URL that has no ref in it.
  for (const b of chain) {
    const set = b.text.indexOf('__ghBlobBoot');
    const imp = b.text.search(/await\s+import\s*\(/);
    assert.ok(set >= 0 && imp >= 0 && set < imp,
      `${b.rel}: __ghBlobBoot is assigned after the import that consumes it`);
  }
});
