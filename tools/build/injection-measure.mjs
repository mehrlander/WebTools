#!/usr/bin/env node
// Measure how much context reaches a session at start, and through which channel.
//
// NOT a committed derived artifact, and it cannot be one. Two of the numbers it
// reads are environment-dependent: the sibling session-*.sh scripts print
// different amounts on different days (session-news-fetch.sh fetches news), and
// project_instructions depends on which repos the session opened with. So this
// emits a DATED READING, not a fact the commit hook can restamp and a test can
// hold. Treat every figure as "measured here, then".
//
// Deterministic parts, safe to compare across runs: the two source documents'
// byte counts, the injector's own BUDGET literal, and which rung a given budget
// selects.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'skills', 'hooks');
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.join(ROOT, '..');

const sh = (script, env = {}) => {
  try {
    return execFileSync('bash', [path.join(HOOKS, script)], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR, ...env },
      encoding: 'utf8', maxBuffer: 1 << 24, stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch { return ''; }
};
const bytes = s => Buffer.byteLength(s, 'utf8');

// The harness ceiling and its over-cap behavior. Undocumented by the platform;
// both figures come from the dispatcher's own guard and from measurement.
const HARNESS_CAP = Number(
  /WEB_TOOLS_OUTPUT_BUDGET:-(\d+)/.exec(readFileSync(path.join(HOOKS, 'session-dispatch.sh'), 'utf8'))?.[1] || 28000);
const PREVIEW = 2000;

// The injector's own budget: a literal in the repo, not a platform limit.
const injectorSrc = readFileSync(path.join(HOOKS, 'inject-conventions.sh'), 'utf8');
const INJECTOR_BUDGET = Number(/BUDGET=\$\{WEB_TOOLS_INJECT_BUDGET:-(\d+)\}/.exec(injectorSrc)?.[1]);

// Which rung a payload lands on. Read from the banner it prints about itself.
const rungOf = out =>
  /^===== Portable conventions: PARTIAL LOAD/.test(out) ? 3
  : out.includes('ALSO NOT INCLUDED, to fit the channel') ? 2 : 1;

const dispatch = sh('session-dispatch.sh');

// Per-script attribution. The dispatcher labels each contributor when more than
// one repo has session scripts; with one contributor there is no label.
const contributors = [];
const parts = dispatch.split(/^(\[[^\]\s]+\.sh\])$/m);
for (let i = 1; i < parts.length; i += 2) {
  contributors.push({ script: parts[i].slice(1, -1), bytes: bytes(parts[i] + parts[i + 1]) });
}

// The startup-context receipts: what each carrier says arrived, by path.
const documents = dispatch.split('\n')
  .filter(l => l.startsWith('[startup-context] '))
  .map(l => JSON.parse(l.slice('[startup-context] '.length)))
  .map(r => ({ path: r.path, bytes: r.bytes, via: r.via, delivered: r.delivered || null, basis: r.basis }));

// A document reaching the session through two channels at once is the finding
// this tool exists to surface: the capped channel spending its allowance on
// material the uncapped one already carried.
const byPath = {};
for (const d of documents) (byPath[d.path] ||= []).push(d.via);
const duplicated = Object.entries(byPath)
  .filter(([, vias]) => new Set(vias).size > 1)
  .map(([p, vias]) => ({ path: p, via: [...new Set(vias)], bytes: documents.find(d => d.path === p).bytes }));

const channelTotal = via => documents.filter(d => d.via === via).reduce((t, d) => t + d.bytes, 0);

const out = {
  measured: new Date().toISOString().slice(0, 10),
  project_dir: PROJECT_DIR,
  caps: [
    { id: 'harness_total', bytes: HARNESS_CAP, owner: 'claude-code', basis: 'measured',
      over: `first ~${PREVIEW} bytes delivered, remainder written to a file nothing reads` },
    { id: 'injector_budget', bytes: INJECTOR_BUDGET, owner: 'repo', basis: 'literal',
      source: '.claude/skills/hooks/inject-conventions.sh', over: 'step down one rung' },
  ],
  session_hook: {
    total: bytes(dispatch), cap: HARNESS_CAP, headroom: HARNESS_CAP - bytes(dispatch),
    rung: rungOf(sh('inject-conventions.sh')), contributors,
  },
  project_instructions: { total: channelTotal('project_instructions'), cap: null },
  rungs: [1, 2, 3].map(n => {
    const budget = { 1: String(INJECTOR_BUDGET), 2: '25981', 3: '4000' }[n];
    const o = sh('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: budget });
    return { rung: n, probe_budget: Number(budget), output: bytes(o), fired: rungOf(o) };
  }),
  documents, duplicated,
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
