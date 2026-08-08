#!/usr/bin/env node
// check-branch-survey.mjs — the stated agreement check for the branches view:
// does the browser port (lib/kits/branch-survey.js) classify a repo's branches the
// same way home's CLI instrument (tools/branch-survey.sh) does?
//
//   node scripts/check-branch-survey.mjs <path-to-clone> [--script <sh>] [--limit N]
//
// Runs the CLI script against the clone and parses its groups, then classifies
// every surveyed branch twice through the ported module, from two input
// shapes:
//
//   cli  uniquely-touched paths from `git log --no-merges -n 50 <ref> --not
//        <base>` — the CLI's exact input, so disagreement here means the
//        ported MATH diverges.
//   api  paths from the merge-base diff (`git diff --name-only base...ref`),
//        the shape GitHub's compare endpoint returns — with the view's
//        no-merge-base fallback (diff from the parent of the 50th-newest
//        commit) — so disagreement here quantifies the INPUT-shape gap the
//        browser actually runs with.
//
// One known, tolerated divergence class: the CLI's differ set comes from
// `git diff --name-only`, whose default RENAME DETECTION pairs a branch file
// with a similar-but-evolved file at a moved path on main and lists only the
// new name, silently crediting moved-and-evolved content as landed. The port
// is exact-bytes only (the API offers no cheap content-similarity), so those
// branches read stranded here and landed at the CLI — the conservative
// direction, where the compare link is the documented ground truth. (The two
// cheap structural approximations were measured and rejected: crediting a
// missing path when its basename exists elsewhere on main recovers the CLI
// read but flips 13 unrelated groups on home; parent/basename recovers only
// half.)
//
// Exit 0 when every cli-input disagreement is that conservative class
// (cli=landed, port=stranded); exit 1 on any optimistic disagreement (port
// reads landed/active where the CLI read stranded) or when api-shaped input
// crosses a branch between landed and stranded. Run `git fetch origin
// --prune` in the clone first for an honest picture.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const clone = args.find(a => !a.startsWith('--'));
if (!clone) { console.error('usage: check-branch-survey.mjs <path-to-clone> [--script <sh>] [--limit N]'); process.exit(2); }
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const script = opt('--script') || path.join(clone, 'tools/branch-survey.sh');
const limit = +(opt('--limit') || 0);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(repoRoot, 'lib/kits/branch-survey.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const B = window.BranchSurvey;

const git = (...a) => execFileSync('git', ['-C', clone, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const BASE = 'origin/main';
const COMMIT_CAP = 50;

// ── 1. The CLI's own read: run it and parse branch -> group from the tables.
const cliArgs = limit ? ['--limit', String(limit)] : [];
const report = execFileSync('bash', [script, ...cliArgs], { cwd: clone, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const cliGroups = new Map();
let section = '';
for (const line of report.split('\n')) {
  const h = line.match(/^## (Recently active|Likely landed|Likely stranded)/);
  if (h) { section = { 'Recently active': 'active', 'Likely landed': 'landed', 'Likely stranded': 'stranded' }[h[1]]; continue; }
  const row = section && line.match(/^\| \[([^\]]+)\]\(/);
  if (row) cliGroups.set(row[1], section);
}
if (!cliGroups.size) { console.error('Parsed no branches from the CLI report — check the script path.'); process.exit(2); }

// ── 2. The ported module, fed from git. One main tree; per branch, the tip
// tree plus the two unique-path input shapes.
const lsTree = (ref) => git('ls-tree', '-r', ref).trimEnd().split('\n').filter(Boolean).map(l => {
  const [meta, p] = l.split('\t');
  const [, type, sha] = meta.split(/\s+/);
  return { path: p, type, sha };
});
const main = B.treeSets(lsTree(BASE));
const now = Date.now();

const rows = git('for-each-ref', 'refs/remotes/origin', '--sort=-committerdate',
  '--format=%(committerdate:iso8601)|%(refname:short)')
  .trimEnd().split('\n').filter(Boolean)
  .map(l => { const i = l.indexOf('|'); return { date: l.slice(0, i), ref: l.slice(i + 1) }; })
  .filter(r => !r.ref.endsWith('/HEAD') && r.ref !== BASE);

const results = [];
for (const { date, ref } of rows) {
  const branch = ref.replace(/^origin\//, '');
  if (!cliGroups.has(branch)) continue; // merged (or outside --limit): the CLI didn't survey it

  const tip = B.treeSets(lsTree(ref));
  const daysAgo = B.daysAgo(date, now);

  // cli input: union of paths from the newest unique non-merge commits.
  let cliPaths = [];
  try {
    cliPaths = git('log', '--no-merges', '--format=', '--name-only', '-n', String(COMMIT_CAP), ref, '--not', BASE)
      .split('\n').filter(Boolean);
  } catch {}

  // api input: the merge-base diff, as GitHub compare reports it; on no merge
  // base, the view's fallback — diff from the parent of the oldest of the 50
  // newest commits (or that commit itself when it is a root).
  let apiPaths = [], noBase = false;
  try {
    git('merge-base', BASE, ref);
    apiPaths = git('diff', '--name-only', `${BASE}...${ref}`).split('\n').filter(Boolean);
  } catch {
    noBase = true;
    const line = git('rev-list', '-n', String(COMMIT_CAP), '--parents', ref).trimEnd().split('\n').filter(Boolean);
    const oldest = line[line.length - 1].split(' ');
    const from = oldest[1] || oldest[0]; // first parent, else the root itself
    if (from !== git('rev-parse', ref).trim()) {
      apiPaths = git('diff', '--name-only', from, ref).split('\n').filter(Boolean);
    }
  }

  const g = (paths) => B.classify({ daysAgo, ...B.landedSignal(paths, tip, main) });
  results.push({ branch, cli: cliGroups.get(branch), port: g(cliPaths), api: g(apiPaths), noBase });
}

// ── 3. Report.
const pad = (s, n) => String(s).padEnd(n);
const w = Math.max(...results.map(r => r.branch.length), 6);
let conservative = 0, optimistic = 0, apiDrift = 0, apiCross = 0;
console.log(pad('branch', w), pad('cli-script', 10), pad('port(cli-in)', 12), pad('port(api-in)', 12), 'no-base');
for (const r of results) {
  let m1 = '';
  if (r.cli !== r.port) {
    const cons = r.cli === 'landed' && r.port === 'stranded';
    if (cons) { conservative++; m1 = '  <-- rename credit (CLI landed, port stranded)'; }
    else { optimistic++; m1 = '  <-- OPTIMISTIC DISAGREEMENT'; }
  }
  const m2 = r.port === r.api ? '' : (r.port !== 'active' && r.api !== 'active' ? '  <-- api crosses' : '');
  if (r.port !== r.api) { apiDrift++; if (m2) apiCross++; }
  console.log(pad(r.branch, w), pad(r.cli, 10), pad(r.port, 12), pad(r.api, 12), r.noBase ? '*' : '', m1 + m2);
}
console.log(`\n${results.length} branches. Exact agreement (cli input): ${results.length - conservative - optimistic}/${results.length}; ` +
  `conservative rename-credit divergence: ${conservative}; optimistic disagreement: ${optimistic}. ` +
  `API-input drift: ${apiDrift} (${apiCross} crossing landed<->stranded).`);
process.exit(optimistic || apiCross ? 1 : 0);
