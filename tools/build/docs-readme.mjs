#!/usr/bin/env node
// Regenerate docs/README.md from docs/docs.csv, the documentation registry.
//
//   node tools/build/docs-readme.mjs         -> writes docs/README.md
//   node tools/build/docs-readme.mjs --check -> exit 1 if stale (CI-friendly)
//
// The README used to be hand-kept and indexed well under half the folder; the
// registry's census is complete by construction (docs-registry.test.mjs), so
// the index is now a projection of it. Subjects, statuses, and maintenance
// live in the registry: edit docs/docs.csv, never this file's output.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsv } from './registries-load.mjs';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REG_PATH = path.join(repoRoot, 'docs', 'docs.csv');
// The owners table moved out of docs.json on 2026-08-09 into its own file, and
// split again on 2026-08-16: a repetition is a different target from the
// statement it repeats, so it is its own registry.
// The closing line of this index still counts it, because a reader of the docs
// folder wants to know the table exists; it is read from where it now lives.
const OWNERS_PATH = path.join(repoRoot, 'docs', 'owners.csv');
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

function render(reg, owners) {
  const lines = [];
  lines.push('# docs');
  lines.push('');
  lines.push('<!-- GENERATED from docs/docs.csv by tools/build/docs-readme.mjs; do not hand-edit. -->');
  lines.push('');
  lines.push('Reference docs that don\'t belong at the repo root. This index is generated');
  lines.push('from [`docs.csv`](docs.csv), the documentation registry, which also renders');
  lines.push('live in [the Web Tools app\'s Map view, Docs tab](https://mehrlander.github.io/web-tools/app/?view=map)');
  lines.push('alongside the shared-claims table (statements that live in more than one');
  lines.push('place, each with its one authoritative carrier and the check that holds each');
  lines.push('copy, or the honest absence of one). A **record** preserves a moment and is');
  lines.push('corrected by markers, never rewritten; a **measured** doc carries dated');
  lines.push('observations and is corrected by re-probing; everything else is living and');
  lines.push('must stay correct.');
  lines.push('');
  const reach = {};
  for (const d of reg.documents) reach[d.reach] = (reach[d.reach] || 0) + 1;
  lines.push('**Reach** (derived by `tools/build/docs-reach.mjs`, gated against the registry):');
  lines.push(`${reach.injected || 0} arrive in every session's context, ${reach.project || 0} are named by CLAUDE.md,`);
  lines.push(`${reach.skill || 0} by a skill, ${reach.app || 0} by a page or component. The remaining ${reach.orphan || 0} are`);
  lines.push('marked *(orphan)* below: nothing points at them except this index.');
  lines.push('');
  for (const [dir, docs] of groups(reg.documents)) {
    lines.push(dir === '.' ? '## docs/' : `## docs/${dir}/`);
    lines.push('');
    for (const d of docs) {
      const rel = d.path.replace(/^docs\//, '');
      const name = rel.slice(rel.lastIndexOf('/') + 1);
      const marks = [];
      if (d.status !== 'living') marks.push(d.status);
      if (d.reach === 'orphan') marks.push('orphan');
      const tag = marks.length ? ` *(${marks.join(', ')})*` : '';
      lines.push(`- [\`${name}\`](${rel})${tag} — ${d.subject}`);
    }
    lines.push('');
  }
  lines.push(`${owners.length} shared statements are registered in`);
  lines.push('[`owners.csv`](owners.csv), with each repetition in [`repetitions.csv`](repetitions.csv).');
  lines.push('');
  return lines.join('\n');
}

const reg = { documents: parseCsv(await readFile(REG_PATH, 'utf8')) };
const owners = parseCsv(await readFile(OWNERS_PATH, 'utf8'));
const want = render(reg, owners);

if (process.argv.includes('--check')) {
  const have = await readFile(OUT_PATH, 'utf8').catch(() => '');
  if (have !== want) {
    console.error('docs/README.md is behind docs/docs.csv - run: npm run docs-readme');
    process.exit(1);
  }
} else {
  await writeFile(OUT_PATH, want);
  console.log('wrote docs/README.md');
}
