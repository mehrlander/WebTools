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
import { readFileSync, writeFileSync } from 'node:fs';
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
  contributors.push({ script: parts[i].slice(1, -1), text: parts[i] + parts[i + 1],
                      bytes: bytes(parts[i] + parts[i + 1]) });
}

// SPLIT THE INJECTOR'S OUTPUT BY DOCUMENT, because the receipt's `bytes` is the
// SOURCE size and the payload carries a TRIMMED copy. Stacking the hook bar on
// receipt figures would draw 34,076 bytes into a 27,653-byte bar. The payload
// is banner, then CONVENTIONS.md from its H1, then SURFACING.md from its H1,
// then the receipt lines, so the three cuts are exact rather than apportioned.
const H1_CONV = '\n# Working conventions (portable)\n';
const H1_SURF = '\n# Surfacing\n';
const RECEIPTS = '\n[startup-context] ';
const segmentsOf = (script, text) => {
  const a = text.indexOf(H1_CONV);
  const b = text.indexOf(H1_SURF, a + 1);
  const c = text.indexOf(RECEIPTS, b + 1);
  if (a < 0 || b < 0 || c < 0) return [{ label: script, path: null, kind: 'overhead', bytes: bytes(text) }];
  return [
    { label: 'banner', path: null, kind: 'overhead', bytes: bytes(text.slice(0, a)) },
    { label: 'web-tools/docs/CONVENTIONS.md', path: 'web-tools/docs/CONVENTIONS.md',
      kind: 'document', bytes: bytes(text.slice(a, b)) },
    { label: 'web-tools/docs/SURFACING.md', path: 'web-tools/docs/SURFACING.md',
      kind: 'document', bytes: bytes(text.slice(b, c)) },
    { label: 'receipts', path: null, kind: 'overhead', bytes: bytes(text.slice(c)) },
  ];
};
const hookSegments = contributors.flatMap(k =>
  /session-conventions/.test(k.script) ? segmentsOf(k.script, k.text)
    : [{ label: k.script, path: null, kind: 'overhead', bytes: k.bytes }]);

// The startup-context receipts: what each carrier says arrived, by path.
const documents = dispatch.split('\n')
  .filter(l => l.startsWith('[startup-context] '))
  .map(l => JSON.parse(l.slice('[startup-context] '.length)))
  .map(r => ({ path: r.path, bytes: r.bytes, via: r.via, basis: r.basis,
    // The receipt writes delivery as an enum for machines; the tab shows it to
    // a reader, and "without_course" is not a phrase anyone says.
    delivered: ({ full: 'in full', without_course: 'without the guide-PR course' })[r.delivered]
      || r.delivered || null }));

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
  note: 'A dated reading, not a derived artifact. The sibling session-*.sh scripts print '
      + 'different amounts on different days and project_instructions depends on which repos '
      + 'the session opened with, so no commit hook can restamp this and no test can hold it.',
  caps: [
    { id: 'injector', label: 'Injector budget', bytes: INJECTOR_BUDGET, owner: 'this repo',
      basis: 'literal', source: '.claude/skills/hooks/inject-conventions.sh',
      over: 'drops a rung and prints what it withheld', graceful: true },
    { id: 'harness', label: 'Harness ceiling', bytes: HARNESS_CAP, owner: 'Claude Code',
      basis: 'measured', source: '.claude/skills/hooks/session-dispatch.sh',
      over: `keeps the first ~${PREVIEW.toLocaleString('en-US')} bytes and discards the rest`, graceful: false },
  ],
  channels: [
    { id: 'session_hook', label: 'Session hook', total: bytes(dispatch), cap: HARNESS_CAP,
      headroom: HARNESS_CAP - bytes(dispatch), rung: rungOf(sh('inject-conventions.sh')),
      contributors: contributors.map(({ script, bytes }) => ({ script, bytes })),
      segments: hookSegments },
    { id: 'project_instructions', label: 'Project instructions',
      total: channelTotal('project_instructions'), cap: null, headroom: null, contributors: [],
      // These arrive whole, so a segment IS the document and its receipt size is the truth.
      segments: documents.filter(d => d.via === 'project_instructions')
        .map(d => ({ label: d.path, path: d.path, kind: 'document', bytes: d.bytes })) },
  ],
  rungs: [1, 2, 3].map(n => {
    const budget = { 1: String(INJECTOR_BUDGET), 2: '25981', 3: '4000' }[n];
    const o = sh('inject-conventions.sh', { WEB_TOOLS_INJECT_BUDGET: budget });
    return { rung: n, output: bytes(o),
      withholds: { 1: 'the guide-PR course', 2: "the course and SURFACING.md's opening",
                   3: 'the course, the opening, and every primitive' }[n] };
  }),
  documents, duplicated,
};

const text = JSON.stringify(out, null, 2) + '\n';
if (process.argv.includes('--write')) {
  const dest = path.join(ROOT, 'docs', 'injection.json');
  writeFileSync(dest, text);
  process.stderr.write(`wrote docs/injection.json (${bytes(text)} bytes)\n`);
} else {
  process.stdout.write(text);
}
