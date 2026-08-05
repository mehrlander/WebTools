// Reach: how a reader gets to a document, derived from disk rather than
// declared by hand.
//
// The documents census in docs/docs.json says what each doc IS and how it is
// kept true. Neither answers the question that decides whether a doc does any
// work: can anyone reach it. Measured 2026-07-30 by hand, 22 of the folder's
// markdown files were reachable only by a session that already knew they
// existed, and that number lived in a tracker task where it aged silently.
// This module makes it a derived field, so it is recomputed on every test run
// and cannot drift from the estate.
//
// Four channels, strongest first. A doc gets the strongest that reaches it:
//
//   injected  arrives in every session's context unasked (the session-start
//             hook fetches these two, and CLAUDE.md @-imports them). The
//             strongest channel there is, and the reason these two are the
//             only docs a session can be assumed to have read.
//   skill     a skill names the path, so invoking that skill pulls the doc.
//             One deliberate act away, and the act is one an agent takes.
//   app       lib/ or pages/ names the path in CODE, so a page reads it at
//             runtime or opens it in the viewer. This channel was invisible
//             until the derivation was written: six docs are reached only this
//             way, all of them manifests the Map view and the Tools view load.
//             A registry that cannot see it cannot show what that work bought.
//   orphan    nothing points here. Not necessarily dead: docs/README.md
//             indexes the whole folder, so an orphan is reachable by someone
//             already browsing docs/. It means no automated channel puts the
//             doc in front of anyone who is not already looking at it.
//
// Precedence is by strength, not by preference: a doc reached both by a skill
// and by the app records `skill`, since that is the channel more likely to
// deliver it to the reader who needs it.
//
// The corpora are deliberately narrow. tools/ is excluded: a doc named only by
// a build script or a test is exercised, not read, and counting that would
// report the schemas below as reached when nothing loads them.

// Run it directly (`npm run docs-reach`) to restamp docs/docs.json after adding
// a doc or pointing a skill or page at one. The field is a cached copy of the
// derivation, held to it by docs-registry.test.mjs.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHANNELS = ['injected', 'skill', 'app', 'orphan'];

// The two the session-start hook fetches. Declared rather than derived: the
// hook that injects them lives in each consuming repo, not in this one.
export const INJECTED = ['docs/CONVENTIONS.md', 'docs/SURFACING.md'];

const SKILL_DIRS = ['.claude/skills', 'skills'];
const APP_DIRS = ['lib', 'pages'];
const SKILL_EXT = new Set(['.md', '.py', '.json', '.mjs']);
const APP_EXT = new Set(['.js', '.html', '.mjs']);

// A path named in a comment is documentation of the code, not a channel to the
// doc: nothing loads or links it, and a reader of docs/ never sees the mention.
// Stripping comments from the app corpus is what keeps the field honest, and it
// is not hypothetical. Writing the Docs tab's own explanatory paragraph, which
// mentioned docs/README.md in prose, silently moved that file from orphan to
// app until the gate caught it. Skill markdown is NOT stripped: prose in a
// skill is instruction an agent follows, which is exactly the channel.
function stripComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readCorpus(repoRoot, dirs, exts, strip = false) {
  const texts = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = path.join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (exts.has(path.extname(entry.name))) {
        try {
          const raw = readFileSync(child, 'utf8');
          texts.push([path.relative(repoRoot, child), strip ? stripComments(raw) : raw]);
        }
        catch { /* unreadable file is simply not a reference */ }
      }
    }
  };
  for (const dir of dirs) {
    const abs = path.join(repoRoot, dir);
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs);
  }
  return texts;
}

/**
 * Derive the reach channel for each given document path.
 * @param {string} repoRoot
 * @param {string[]} paths repo-relative document paths
 * @returns {Map<string, {channel: string, via: string｜null}>}
 */
export function deriveReach(repoRoot, paths) {
  const skills = readCorpus(repoRoot, SKILL_DIRS, SKILL_EXT);
  const app = readCorpus(repoRoot, APP_DIRS, APP_EXT, true);
  const injected = new Set(INJECTED);
  const out = new Map();
  for (const p of paths) {
    if (injected.has(p)) { out.set(p, { channel: 'injected', via: null }); continue; }
    const bySkill = skills.find(([, text]) => text.includes(p));
    if (bySkill) { out.set(p, { channel: 'skill', via: bySkill[0] }); continue; }
    const byApp = app.find(([, text]) => text.includes(p));
    if (byApp) { out.set(p, { channel: 'app', via: byApp[0] }); continue; }
    out.set(p, { channel: 'orphan', via: null });
  }
  return out;
}

// ── CLI: restamp docs/docs.json ─────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const file = path.join(repoRoot, 'docs', 'docs.json');
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  const derived = deriveReach(repoRoot, registry.documents.map(d => d.path));
  const moved = [];
  for (const d of registry.documents) {
    const next = derived.get(d.path).channel;
    if (d.reach !== next) moved.push(`${d.path}: ${d.reach ?? '(unset)'} -> ${next}`);
    d.reach = next;
    // Fixed key order, so a restamp never reshuffles the file.
    const ordered = { path: d.path, subject: d.subject, status: d.status,
                      reach: d.reach, maintenance: d.maintenance };
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, ordered);
  }
  writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');
  const counts = {};
  for (const d of registry.documents) counts[d.reach] = (counts[d.reach] || 0) + 1;
  console.log('docs-reach: ' + CHANNELS.map(c => `${counts[c] || 0} ${c}`).join(', '));
  for (const m of moved) console.log('  moved  ' + m);
}
