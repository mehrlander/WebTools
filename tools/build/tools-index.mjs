// The derived half of docs/harness.json, the harness census.
// (docs/tools.json was taken: it is the curated Tools gallery manifest,
// show-repo's Tools view, and has nothing to do with the tools/ folder.)
//
// tools/ and scripts/ are the two code layers docs/code-layers.md could name
// but not account for: at the 2026-08-08 count, 57 of the repo's 94 harness
// files were scenario drivers of which prose named 9. This module derives the
// part a machine can see, so the registry only has to author the part it
// cannot: what each file is FOR (`role`), scaffolded blank and counted, the
// same ledger discipline docs/tests.json applies to `protects`.
//
// Derived here, never authored:
//
//   invocation  how the file gets run, which is the axis that decides whether
//               "nothing names it" matters:
//                 npm:<script>  a package.json script invokes it
//                 driver        lives in tools/render/scenarios/, the --script
//                               argument to `npm run shot`; drivers are passed
//                               by path, so no other route will ever name one
//                 imported      another node file imports it (a helper)
//                 argv          carries a shebang; run by hand
//                 none found    no route the derivation can see
//   emits       writes a file (a generator rather than a reader)
//   named       its path or basename appears in any tracked .md file
//   tested      its basename appears in a file under tools/test/
//   layer, lines
//
// tools/test/ is deliberately absent: docs/tests.json is that folder's census,
// and one file must not answer to two registries.
//
// Run `npm run tools-index` to restamp; `--check` compares instead of writing.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_EXT = ['.mjs', '.js', '.cjs', '.py', '.sh'];

function tracked(repoRoot) {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n').filter(Boolean);
}

const read = (repoRoot, rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** path -> npm script name, for files a package.json script invokes. */
function npmScriptMap(repoRoot) {
  const out = new Map();
  const scripts = JSON.parse(read(repoRoot, 'package.json')).scripts || {};
  for (const [name, cmd] of Object.entries(scripts)) {
    for (const m of cmd.matchAll(/[\w./-]+\.(?:mjs|js|cjs|py|sh)/g)) {
      if (!out.has(m[0])) out.set(m[0], name);
    }
  }
  return out;
}

/** Files another node file imports, so a helper is not read as dead. */
function importedSet(repoRoot, files) {
  const imported = new Set();
  for (const rel of files) {
    if (!/\.(mjs|js|cjs)$/.test(rel)) continue;
    const src = read(repoRoot, rel);
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      imported.add(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    }
  }
  return imported;
}

/**
 * Derive the machine-visible fields for every harness file on disk.
 * @param {string} repoRoot
 * @returns {Map<string, object>} path -> derived row fields
 */
export function deriveTools(repoRoot) {
  const files = tracked(repoRoot);
  const subjects = files.filter(f =>
    (f.startsWith('tools/') || f.startsWith('scripts/')) &&
    !f.startsWith('tools/test/') &&
    CODE_EXT.some(e => f.endsWith(e)));
  const npm = npmScriptMap(repoRoot);
  const imported = importedSet(repoRoot, subjects);
  const prose = files.filter(f => f.endsWith('.md')).map(f => read(repoRoot, f)).join('\n');
  const tests = files.filter(f => f.startsWith('tools/test/')).map(f => read(repoRoot, f)).join('\n');

  const out = new Map();
  for (const rel of subjects.sort()) {
    const src = read(repoRoot, rel);
    const base = path.posix.basename(rel);
    let invocation;
    if (rel.startsWith('tools/render/scenarios/')) invocation = 'driver';
    else if (npm.has(rel) || npm.has(base)) invocation = 'npm:' + (npm.get(rel) || npm.get(base));
    else if (imported.has(rel)) invocation = 'imported';
    else if (src.startsWith('#!')) invocation = 'argv';
    else invocation = 'none found';
    out.set(rel, {
      layer: path.posix.dirname(rel),
      lines: src ? src.split('\n').length : 0,
      invocation,
      emits: /writeFileSync|open\([^)]*['"][wa]/.test(src),
      named: prose.includes(rel) || prose.includes(base),
      tested: tests.includes(base),
    });
  }
  return out;
}

// ── CLI: restamp (or --check) docs/tools.json ───────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const file = path.join(repoRoot, 'docs', 'harness.json');
  const checkOnly = process.argv.includes('--check');
  let registry;
  try { registry = JSON.parse(readFileSync(file, 'utf8')); }
  catch { registry = { note: '', layers: {}, tools: [] }; }
  const derived = deriveTools(repoRoot);

  const byPath = new Map((registry.tools || []).map(t => [t.path, t]));
  const added = [];
  for (const [p] of derived) {
    if (!byPath.has(p)) {
      const row = { path: p, role: '' };
      byPath.set(p, row);
      added.push(p);
    }
  }
  const gone = [...byPath.keys()].filter(p => !derived.has(p));
  const rows = [...byPath.values()].filter(t => derived.has(t.path));

  for (const t of rows) {
    const d = derived.get(t.path);
    const ordered = { path: t.path, role: t.role || '', ...d };
    for (const k of Object.keys(t)) delete t[k];
    Object.assign(t, ordered);
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  registry.tools = rows;

  const bytes = JSON.stringify(registry, null, 2) + '\n';
  if (checkOnly) {
    let current = null;
    try { current = readFileSync(file, 'utf8'); } catch { /* absent counts as stale */ }
    if (current !== bytes) {
      console.error('docs/harness.json is behind its sources; run: npm run tools-index');
      process.exit(1);
    }
    process.exit(0);
  }
  writeFileSync(file, bytes);

  const layers = {};
  for (const t of rows) layers[t.layer] = (layers[t.layer] || 0) + 1;
  const named = rows.filter(t => t.named).length;
  const tested = rows.filter(t => t.tested).length;
  const blank = rows.filter(t => !t.role).length;
  console.log(`tools-index: ${rows.length} files (` +
              Object.entries(layers).map(([l, n]) => `${n} ${l}`).join(', ') + `); ` +
              `${named} named, ${tested} tested`);
  for (const p of added) console.log('  added   ' + p + '  (role is blank; say what it is for)');
  for (const p of gone) console.log('  dropped ' + p);
  if (blank) console.log(`  ${blank} row(s) do not say what they are for`);
}
