#!/usr/bin/env node
// Regenerate docs/README.md from docs/docs.json, the documentation registry.
//
//   node tools/build/docs-readme.mjs         -> writes docs/README.md
//   node tools/build/docs-readme.mjs --check -> exit 1 if stale (CI-friendly)
//
// The README used to be hand-kept and indexed well under half the folder; the
// registry's census is complete by construction (docs-registry.test.mjs), so
// the index is now a projection of it. Subjects, statuses, and maintenance
// live in the registry: edit docs/docs.json, never this file's output.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REG_PATH = path.join(repoRoot, 'docs', 'docs.json');
const OUT_PATH = path.join(repoRoot, 'docs', 'README.md');

// Group order: the root first, then subfolders alphabetically; within a group
// the registry's own row order holds, so curation stays in one place.
function groups(documents) {
  const byDir = new Map();
  for (const d of documents) {
    const rel = d.path.replace(/^docs\//, '');
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(d);
  }
  return [...byDir.entries()]
    .sort(([a], [b]) => a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b));
}

function render(reg) {
  const lines = [];
  lines.push('# docs');
  lines.push('');
  lines.push('<!-- GENERATED from docs/docs.json by tools/build/docs-readme.mjs; do not hand-edit. -->');
  lines.push('');
  lines.push('Reference docs that don\'t belong at the repo root. This index is generated');
  lines.push('from [`docs.json`](docs.json), the documentation registry, which also renders');
  lines.push('live in [show-repo\'s Map view, Docs tab](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html?view=map)');
  lines.push('alongside the shared-claims table (statements that live in more than one');
  lines.push('place, each with its one authoritative carrier and the check that holds each');
  lines.push('copy, or the honest absence of one). A **record** preserves a moment and is');
  lines.push('corrected by markers, never rewritten; everything else is living and must');
  lines.push('stay correct.');
  lines.push('');
  for (const [dir, docs] of groups(reg.documents)) {
    lines.push(dir === '.' ? '## docs/' : `## docs/${dir}/`);
    lines.push('');
    for (const d of docs) {
      const rel = d.path.replace(/^docs\//, '');
      const name = rel.slice(rel.lastIndexOf('/') + 1);
      const tag = d.status === 'record' ? ' *(record)*' : '';
      lines.push(`- [\`${name}\`](${rel})${tag} — ${d.subject}`);
    }
    lines.push('');
  }
  lines.push(`${reg.claims.length} shared claims are registered; the registry note in`);
  lines.push('[`docs.json`](docs.json) carries the schema and the admission rule.');
  lines.push('');
  return lines.join('\n');
}

const reg = JSON.parse(await readFile(REG_PATH, 'utf8'));
const want = render(reg);

if (process.argv.includes('--check')) {
  const have = await readFile(OUT_PATH, 'utf8').catch(() => '');
  if (have !== want) {
    console.error('docs/README.md is behind docs/docs.json — run: npm run docs-readme');
    process.exit(1);
  }
} else {
  await writeFile(OUT_PATH, want);
  console.log('wrote docs/README.md');
}
