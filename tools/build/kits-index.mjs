// The kits registry, docs/kits.csv: one row per logic module on the kit shelf
// (lib/kits/*.js), every field derived from the tree.
//
// The shelf held 68 kits on 2026-09-05 and the app showed none of them: the
// Map view had a tab for the harness, the tests, the docs and the skills, and
// the layer the pages are actually built from was reachable only through a
// hand-kept demo index that still linked kits/ at the repo root, a path that
// stopped existing on 2026-08-08. This registry is the accounting the Map
// view's Kits tab renders, and unlike docs/harness.csv it authors nothing: a
// kit's header comment is its authoritative doc (lib/kits/README.md says so),
// so the one prose field here (gloss) is READ OFF that comment rather than typed a
// second time. A kit whose header does not open with a sentence shows a blank
// gloss, which is the ledger figure this tab exists to show, and the fix
// is in the kit file rather than here.
//
// Derived, never authored:
//
//   namespace  the last `window.<name> =` assignment in the file, which the
//              shelf's shape rule makes the public handle (README, rule 3)
//   gloss      the first sentence of the leading comment block, the kit's own
//              filename prefix stripped; blank where the file opens with code
//   lines      file length
//   boot       yes when gh-boot.js's BOOT manifest or FAB_BOOT loads it on
//              every chain-boot page: a fact about cost, not about the folder
//   demo       yes when lib/kits/demos/<name>.html exists
//   users      how many other files under lib/, pages/ and app/ name the kit
//              by its load path (kits/<name>.js); the demo counts, the kit
//              itself does not
//   tested     its basename appears in a file under tools/test/
//
// Run `npm run kits-index` to restamp; `--check` compares instead of writing.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCsv } from './registries-load.mjs';

// Fixed here so a restamp cannot reorder the file.
export const KITS_COLS = ['path', 'namespace', 'gloss', 'lines', 'boot', 'demo', 'users', 'tested'];

const HEADLINE_MAX = 160;

function tracked(repoRoot) {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').filter(Boolean);
}

const read = (repoRoot, rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** The leading `//` comment block of a source file, as one paragraph. */
function leadingComment(src) {
  const out = [];
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*\/\/ ?(.*)$/);
    if (!m) break;
    out.push(m[1]);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * The first sentence of a kit's header, the filename prefix and any box-art
 * rule stripped. `kits/peek.js — what is under the pointer, and what contains
 * it.` reads `what is under the pointer, and what contains it.`
 */
export function headlineOf(src, base) {
  let text = leadingComment(src);
  if (!text) return '';
  text = text.replace(/^[─\-=\s]+/, '').replace(/[─]{3,}.*$/, '').trim();
  const name = base.replace(/\.js$/, '');
  // The prefix is the filename AND a separator: `csv.js —`, `peek.js:`,
  // `kits/land.js —`. A bare name is left alone, or `CSV, small and shared.`
  // would lose its subject to a prefix it never carried.
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = new RegExp('^(?:lib/)?(?:kits/)?' + safe + '(?:\\.js)?\\s*[—:\\-]+\\s*', 'i');
  text = text.replace(prefix, '');
  // The first sentence: up to a period followed by a space or the end. A
  // period inside a path or a version (`idb-keyval`, `.docx`) is not followed
  // by a space, so it survives.
  const m = text.match(/^(.*?[.!?])(?:\s|$)/);
  let first = (m ? m[1] : text).trim();
  if (first.length > HEADLINE_MAX) first = first.slice(0, HEADLINE_MAX - 1).replace(/\s+\S*$/, '') + '…';
  return first;
}

/** The public namespace: the last top-level `window.<name> =` in the file. */
export function namespaceOf(src) {
  let last = '';
  for (const m of src.matchAll(/^\s*(?:window|globalThis|root)\.([A-Za-z_$][\w$]*)\s*=[^=]/gm)) last = m[1];
  return last;
}

/** Kit load paths gh-boot.js pulls in on every page (BOOT plus FAB_BOOT). */
function bootSet(repoRoot) {
  const src = read(repoRoot, 'lib/gh-boot.js');
  const out = new Set();
  for (const m of src.matchAll(/['"](kits\/[\w-]+\.js)['"]/g)) out.add(m[1]);
  return out;
}

/**
 * Derive every row.
 * @param {string} repoRoot
 * @returns {object[]} rows, sorted by path
 */
export function deriveKits(repoRoot) {
  const files = tracked(repoRoot);
  const kits = files.filter(f => /^lib\/kits\/[\w-]+\.js$/.test(f)).sort();
  const boot = bootSet(repoRoot);
  const tests = files.filter(f => f.startsWith('tools/test/')).map(f => read(repoRoot, f)).join('\n');
  const readers = files.filter(f =>
    (f.startsWith('lib/') || f.startsWith('pages/') || f.startsWith('app/')) &&
    /\.(html|js|mjs)$/.test(f));
  const sources = new Map(readers.map(f => [f, read(repoRoot, f)]));

  return kits.map(rel => {
    const src = sources.get(rel) ?? read(repoRoot, rel);
    const base = path.posix.basename(rel);
    const load = 'kits/' + base;
    let users = 0;
    for (const [f, text] of sources) {
      if (f === rel) continue;
      if (text.includes(load)) users++;
    }
    return {
      path: rel,
      namespace: namespaceOf(src),
      gloss: headlineOf(src, base),
      lines: src.split('\n').length,
      boot: boot.has(load) ? 'yes' : 'no',
      demo: existsSync(path.join(repoRoot, 'lib/kits/demos', base.replace(/\.js$/, '.html'))) ? 'yes' : 'no',
      users,
      tested: tests.includes(base) ? 'yes' : 'no',
    };
  });
}

// ── CLI: restamp (or --check) docs/kits.csv ────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const file = path.join(repoRoot, 'docs', 'kits.csv');
  const checkOnly = process.argv.includes('--check');
  const rows = deriveKits(repoRoot);
  const bytes = writeCsv(rows, KITS_COLS);
  if (checkOnly) {
    let current = null;
    try { current = readFileSync(file, 'utf8'); } catch { /* absent counts as stale */ }
    if (current !== bytes) {
      console.error('docs/kits.csv is behind its sources; run: npm run kits-index');
      process.exit(1);
    }
    process.exit(0);
  }
  writeFileSync(file, bytes);
  const n = (k) => rows.filter(r => r[k] === 'yes').length;
  const blank = rows.filter(r => !r.gloss);
  console.log(`kits-index: ${rows.length} kits; ${n('boot')} boot, ${n('demo')} with a demo, ${n('tested')} tested`);
  for (const r of blank) console.log('  no gloss  ' + r.path + '  (the header comment does not open with a sentence)');
}
