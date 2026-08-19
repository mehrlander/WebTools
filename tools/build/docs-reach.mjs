// The derived fields of docs/docs.csv: `reach` (who can get to a document)
// and `words` (how much of the folder it is). Both are computed from disk
// rather than declared by hand, both are restamped by `npm run docs-reach`,
// and both are gated by docs-registry.test.mjs.
//
// One module and one npm script for two fields, because both write the same
// file: two writers would race on key order and on each other's output. The
// script name predates `words` and is kept, since renaming it would ripple
// through the commit hook, package.json, and CLAUDE.md for no gain.
//
// The documents registry in docs/docs.csv says what each doc IS and how it is
// kept true. Neither answers the question that decides whether a doc does any
// work: can anyone reach it. Measured 2026-07-30 by hand, 22 of the folder's
// markdown files were reachable only by a session that already knew they
// existed, and that number lived in a tracker task where it aged silently.
// This module makes it a derived field, so it is recomputed on every test run
// and cannot drift from the estate.
//
// Five channels, strongest first. A doc gets the strongest that reaches it:
//
//   injected  arrives in every session's context unasked (the session-start
//             hook fetches these two, and CLAUDE.md @-imports them). The
//             strongest channel there is, and the reason these two are the
//             only docs a session can be assumed to have read.
//   project   named by a document that is ALREADY in every session's context:
//             the repo's own CLAUDE.md, or either of the injected two. One hop
//             from every session with no invocation required, so it outranks a
//             skill. Added 2026-08-05, after the first cut reported as orphan
//             four docs that CLAUDE.md names by path: the orphan count was
//             pessimistic, and a count that overstates the problem is corrected
//             for the same reason one that understates it is.
//
//             Widened later the same day to include the injected pair, which
//             the first cut had as sources of nothing. That was incoherent: a
//             link from SURFACING.md is read by every session in every repo
//             that installs the set, which is a wider audience than CLAUDE.md
//             reaches, yet it counted for less than a skill mention. The key
//             stays `project` rather than becoming `context`; the value is
//             stamped into a registry other files quote, and the rename buys
//             accuracy in one word at the cost of churn in several.
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
//
// ── words ───────────────────────────────────────────────────────────────────
//
// Reach counts files; `words` weighs them, and the two disagree. Measured
// 2026-08-05: the 17 orphans are 40% of the folder's files but 16.7% of its
// words, while docs/show-repo.md alone is 22%. A tab that could filter to the
// orphans in one tap and could not show that split was answering the smaller
// question loudly. Bloat and unreachability are different failures, and a
// registry that carries only one of them will keep pointing at the tail.
//
// Whitespace-delimited tokens of the file as it sits on disk, markdown and
// JSON alike. Crude on purpose: a prose-aware count would need a parser per
// format, and the field only has to support "which of these is large," which
// survives the crudeness. Frontmatter, code fences, and JSON punctuation are
// all counted, so a schema's number is not comparable to an essay's.
//
// The registry describes itself, so stamping the field changes the file being
// measured: writing 42 words values adds 84 tokens to the registry, and its
// own row would be stale the moment it was written. The stamp therefore runs
// to a fixpoint. It converges in two passes, because the digits of a value do
// not change the token count, and it asserts convergence rather than assuming
// it: a derivation that silently failed to settle would produce a file that
// fails its own test on every other run.

// Run it directly (`npm run docs-reach`) to restamp docs/docs.csv after adding
// a doc, pointing a skill or page at one, or editing any doc's length. Both
// fields are cached copies of the derivation, held to it by
// docs-registry.test.mjs.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseCsv, writeCsv } from './registries-load.mjs';

// Column order is fixed here so a restamp cannot reorder the file.
const DOC_COLS = ['path', 'subject', 'status', 'reach', 'words', 'maintenance'];
import { fileURLToPath } from 'node:url';

export const CHANNELS = ['injected', 'project', 'skill', 'app', 'orphan'];

// The two the session-start hook fetches. Declared rather than derived: the
// hook that injects them lives in each consuming repo, not in this one.
export const INJECTED = ['docs/CONVENTIONS.md', 'docs/SURFACING.md'];

// Documents that are already in a session's context, and so are sources of the
// `project` channel rather than merely targets of it. The root agent
// instructions (not a directory: a nested CLAUDE.md governs its own subtree
// rather than the session) plus the injected pair, which every session reads
// in every repo that installs the set.
const PROJECT_FILES = ['CLAUDE.md', 'AGENTS.md', ...INJECTED];
const SKILL_DIRS = ['.claude/skills', 'skills'];
// The app corpus's boundary and extensions are exported with the scanners
// above: registries-reach.mjs must mean the same thing by "the app".
//
// `app/` joined the list on 2026-08-19, and its absence is the shape of error
// this constant will keep producing: PR #441 moved the show-repo shell from
// pages/show-repo.html to app/index.html, and nothing here moved with it, so
// for eleven days the scanners read the app without reading the app's own
// shell. Two registries wore the `no app surface` warning while
// app/index.html fetched them by name, and docs/text-content.md read `orphan`
// on the same evidence. The lesson is not about this directory: a corpus
// boundary written as a literal list cannot notice that the corpus moved, so
// moving a top-level directory means coming here.
export const APP_DIRS = ['lib', 'pages', 'app'];
const SKILL_EXT = new Set(['.md', '.py', '.json', '.mjs']);
export const APP_EXT = new Set(['.js', '.html', '.mjs']);

// A path named in a comment is documentation of the code, not a channel to the
// doc: nothing loads or links it, and a reader of docs/ never sees the mention.
// Stripping comments from the app corpus is what keeps the field honest, and it
// is not hypothetical. Writing the Docs tab's own explanatory paragraph, which
// mentioned docs/README.md in prose, silently moved that file from orphan to
// app until the gate caught it. Skill markdown is NOT stripped: prose in a
// skill is instruction an agent follows, which is exactly the channel.
// Exported (with readCorpus) because registries-reach.mjs derives its
// renders_in field over the same app corpus under the same comment rule; two
// scanners with different rules would disagree about what "the app names it"
// means, which is the drift a single owner exists to prevent.
//
// Block and line comments are stripped in ONE alternation, not two passes.
// The two-pass version (blocks first, then lines) had a real defect found by
// registries-reach's first run: a `/*` INSIDE a line comment (estate.js writes
// `surfaces/*.surface` in one) opened a phantom block that swallowed
// everything to the next `*/`, hundreds of code lines, so paths named in that
// span read as unreferenced. One pass fixes it by leftmost-match: the `//`
// sits earlier on its line than the `/*` it contains, so the line branch
// consumes it before the block branch can start. The `[^:]` guard keeps a
// URL's `//` from reading as a comment, as before.
export function stripComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm,
      (m, pre) => (pre === undefined ? ' ' : pre));
}

export function readCorpus(repoRoot, dirs, exts, strip = false) {
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
  const project = PROJECT_FILES
    .map(name => [name, path.join(repoRoot, name)])
    .filter(([, abs]) => existsSync(abs))
    .map(([name, abs]) => [name, readFileSync(abs, 'utf8')]);
  const skills = readCorpus(repoRoot, SKILL_DIRS, SKILL_EXT);
  const app = readCorpus(repoRoot, APP_DIRS, APP_EXT, true);
  const injected = new Set(INJECTED);
  const out = new Map();
  for (const p of paths) {
    if (injected.has(p)) { out.set(p, { channel: 'injected', via: null }); continue; }
    const byProject = project.find(([, text]) => text.includes(p));
    if (byProject) { out.set(p, { channel: 'project', via: byProject[0] }); continue; }
    const bySkill = skills.find(([, text]) => text.includes(p));
    if (bySkill) { out.set(p, { channel: 'skill', via: bySkill[0] }); continue; }
    const byApp = app.find(([, text]) => text.includes(p));
    if (byApp) { out.set(p, { channel: 'app', via: byApp[0] }); continue; }
    out.set(p, { channel: 'orphan', via: null });
  }
  return out;
}

/**
 * Whitespace-delimited token count for each given document path.
 * Reads the file as it currently sits on disk, which is what makes the
 * registry's own row need a fixpoint (see the header).
 * @param {string} repoRoot
 * @param {string[]} paths repo-relative document paths
 * @returns {Map<string, number>}
 */
export function deriveWords(repoRoot, paths) {
  const out = new Map();
  for (const p of paths) {
    let n = 0;
    try { n = readFileSync(path.join(repoRoot, p), 'utf8').split(/\s+/).filter(Boolean).length; }
    catch { /* an unreadable file counts as nothing; the registry test owns its absence */ }
    out.set(p, n);
  }
  return out;
}

// ── CLI: restamp docs/docs.csv ──────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const file = path.join(repoRoot, 'docs', 'docs.csv');
  const registry = { documents: parseCsv(readFileSync(file, 'utf8')) };
  const paths = registry.documents.map(d => d.path);
  const before = new Map(registry.documents.map(d => [d.path, d.reach]));

  // Stamp to a fixpoint: writing `words` changes the size of docs.csv, which
  // is itself a row. Two passes settle it, five is a generous ceiling, and
  // failing loudly beats emitting a file that fails its own test.
  const MAX_PASSES = 5;
  let passes = 0;
  for (;;) {
    const reach = deriveReach(repoRoot, paths);
    const words = deriveWords(repoRoot, paths);
    let changed = false;
    for (const d of registry.documents) {
      const nextReach = reach.get(d.path).channel;
      const nextWords = words.get(d.path);
      if (d.reach !== nextReach || d.words !== nextWords) changed = true;
      d.reach = nextReach;
      d.words = nextWords;
      // Fixed key order, so a restamp never reshuffles the file.
      const ordered = { path: d.path, subject: d.subject, status: d.status,
                        reach: d.reach, words: d.words, maintenance: d.maintenance };
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, ordered);
    }
    writeFileSync(file, writeCsv(registry.documents, DOC_COLS));
    passes++;
    if (!changed) break;
    if (passes >= MAX_PASSES) {
      console.error(`docs-reach: derivation did not settle in ${MAX_PASSES} passes`);
      process.exit(1);
    }
  }

  const counts = {};
  const mass = {};
  let total = 0;
  for (const d of registry.documents) {
    counts[d.reach] = (counts[d.reach] || 0) + 1;
    mass[d.reach] = (mass[d.reach] || 0) + d.words;
    total += d.words;
  }
  console.log('docs-reach: ' + CHANNELS
    .map(c => `${counts[c] || 0} ${c} (${Math.round((mass[c] || 0) / total * 100)}%)`)
    .join(', ') + `; ${total.toLocaleString('en-US')} words in ${passes} pass(es)`);
  for (const d of registry.documents) {
    if (before.get(d.path) !== d.reach) {
      console.log(`  moved  ${d.path}: ${before.get(d.path) ?? '(unset)'} -> ${d.reach}`);
    }
  }
}
