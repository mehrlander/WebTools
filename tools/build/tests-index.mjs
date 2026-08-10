// The derived half of docs/tests.json, the test registry.
//
// The suite reports a pass count and nothing else, and a pass count is the
// weakest thing it knows. "1,098 pass" says nothing about what is being
// checked, how, or whether any of it would catch a real break. This module
// derives the part a machine can see, so the registry only has to author the
// part it cannot: what each file is FOR.
//
// Derived here, never authored:
//
//   assertions  the number of top-level test() calls written in the file.
//               Static, and a LOWER BOUND rather than the runner's figure: a
//               test() inside a loop is one call here and N tests at runtime.
//               Four files parameterize theirs, so `npm test` reports more
//               than this column sums to. The header used to claim the two
//               could be checked against each other; nothing did, and they
//               never matched.
//   assertion_names
//               what each of those calls is named, in source order. The names
//               are already read to count them and were being thrown away.
//               They are the file's own account of what it checks, authored
//               with the test and updated with it, so the registry does not
//               have to restate coverage in `protects` and cannot go stale
//               against the file the way a hand-written summary does. A
//               parameterized name is carried as its template text, `${...}`
//               and all, which is how a reader can tell one row stands for
//               several runtime tests.
//   method      how a test reaches its subject, which is the axis that
//               decides how much a pass is worth:
//                 kit     loads a lib/kits/*.js through the bootstrap and
//                         exercises its surface in the Node realm
//                 alpine  boots the component in jsdom and drives it
//                 spawn   runs a CLI script as a process and reads its output
//                 read    reads a file and asserts on its content
//                 pure    imports a function and calls it, nothing else
//               A file usually has several; the strongest present wins, in
//               that order, because that is the one carrying the real weight.
//   runner      `suite` for a *.test.mjs file, which `npm test` globs, or the
//               npm script that runs it. The browser-driven checks are named
//               without `.test.` on purpose, so the CI runner never installs a
//               browser; that convention is invisible from the pass count and
//               is exactly what this field makes visible.
//   boot_smoke  WHICH of the file's assertions only check that a component
//               mounts without warnings, as indices into assertion_names. Not a
//               criticism: a boot check catches real breakage cheaply. But it
//               is the lowest-information assertion in the suite, and a file
//               that is mostly boot smoke is claiming less than its count
//               suggests. Indices rather than a count because the property is
//               per assertion, so the count is an aggregate and a consumer that
//               wants one can take the length.
//
// Authored in the registry, because no derivation can supply it: `kind` (what
// genre of check this is) and `protects` (the one thing that breaks if it is
// deleted). `protects` is held to the same standard as the documents census's
// `maintenance`: a row that cannot say what it protects is a test nobody has
// examined, and the gate counts those rather than banning them.
//
// `protects` and `assertion_names` answer different questions, and the split is
// why deriving the names does not make the authored field redundant. The names
// say WHAT the file asserts; `protects` says what BREAKS if it goes, which for
// a gate or a lockstep is not recoverable from any test name. What the names do
// retire is the inventory: `protects` had been absorbing coverage lists because
// coverage was invisible in the view, and twelve rows had grown past 300
// characters restating what the file already said better. One sentence here,
// the list derived beside it.
//
// Run `npm run tests-index` to restamp after adding or changing a test.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KINDS = ['behavior', 'component', 'kit', 'tool', 'gate', 'lockstep', 'guard'];
export const METHODS = ['kit', 'alpine', 'spawn', 'read', 'pure'];

const TEST_DIR = 'tools/test';
// Files in tools/test/ that are not tests: the shared harness and the
// browser-driven checks, which are named without `.test.` so `node --test`
// skips them. The registry covers both, since a check the suite never runs is
// exactly the kind of thing that goes quietly stale.
const NOT_A_TEST = new Set(['bootstrap.mjs', 'show-repo-shell.mjs']);

// A boot smoke assertion proves one thing: the component mounted and logged
// nothing. Two things changed here on 2026-08-10, and both are about level.
//
// It reads the derived NAMES rather than scanning the source a second time. The
// old pattern was anchored to `test('`, so it saw single-quoted names only and
// would have missed a boot check written with a double quote or a backtick,
// silently. The names are already extracted in every quote style and unescaped.
//
// And it returns INDICES, not a count. The property is per assertion: one
// test() call is a boot check or it is not, and a file-level number is an
// aggregate of that. Storing only the aggregate is what let the view render
// "19 smoke" without being able to say whether 19 counted files or assertions.
// Both were 19, because every file happens to carry exactly one, so nothing
// revealed the ambiguity and the first file to gain a second boot check would
// have made the label quietly wrong.
const BOOT_SMOKE = /mounts?.*(warning|error)|no startup warning/i;

/** Count top-level test() calls. */
function assertions(src) {
  return (src.match(/^\s*test\(/gm) || []).length;
}

// The name of each of those calls. The quote class covers all three string
// forms, and `(?:\\.|(?!\1)[\s\S])*` steps over an escaped quote instead of
// ending on it, which matters more than it looks: test names here are prose and
// prose has apostrophes, so a naive `[^']*` truncates "the repo's own registry"
// to "the repo" and the row reads as a terse name rather than a clipped one.
// Anchored with the same `^\s*` as the counter so the two cannot disagree; the
// gate below asserts that they don't.
const TEST_NAME = /^\s*test\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/gm;

function assertionNames(src) {
  return [...src.matchAll(TEST_NAME)]
    .map(m => m[2].replace(/\\(['"`\\])/g, '$1').replace(/\s+/g, ' ').trim());
}

function method(src) {
  if (/loadKit/.test(src)) return 'kit';
  if (/startAlpine|makeWindow/.test(src)) return 'alpine';
  if (/spawnSync|execFileSync/.test(src)) return 'spawn';
  if (/readFileSync/.test(src)) return 'read';
  return 'pure';
}

function bootSmoke(names) {
  return names.flatMap((n, i) => (BOOT_SMOKE.test(n) ? [i] : []));
}

/**
 * Derive the machine-visible fields for every test file on disk.
 * @param {string} repoRoot
 * @returns {Map<string, {assertions:number, assertion_names:string[], method:string, runner:string, boot_smoke:number}>}
 */
export function deriveTests(repoRoot) {
  const dir = path.join(repoRoot, TEST_DIR);
  const scripts = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts || {};
  const out = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.mjs') || NOT_A_TEST.has(name)) continue;
    const rel = `${TEST_DIR}/${name}`;
    const src = readFileSync(path.join(dir, name), 'utf8');
    let runner = 'suite';
    if (!name.endsWith('.test.mjs')) {
      // A named script owns it, or nothing does. Both are worth seeing.
      const hit = Object.entries(scripts).find(([, cmd]) => cmd.includes(rel));
      runner = hit ? `npm run ${hit[0]}` : 'unrun';
    }
    // A browser check asserts with its own harness and exits nonzero; it has no
    // top-level test() calls, so counting them would report 0 and read as "this
    // checks nothing". Null says the unit does not apply, and the render must
    // not fold a null into a total. Same rule the traffic accounting follows:
    // no total absorbs a figure it could not measure.
    const suite = name.endsWith('.test.mjs');
    const names = suite ? assertionNames(src) : null;
    out.set(rel, {
      assertions: suite ? assertions(src) : null,
      assertion_names: names,
      method: method(src),
      runner,
      boot_smoke: names ? bootSmoke(names) : null,
    });
  }
  return out;
}

// ── CLI: restamp docs/tests.json ────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const file = path.join(repoRoot, 'docs', 'tests.json');
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  const derived = deriveTests(repoRoot);

  const byPath = new Map(registry.tests.map(t => [t.path, t]));
  const added = [];
  for (const [p] of derived) {
    if (!byPath.has(p)) {
      // Scaffold rather than fail: a new test file gets a row saying plainly
      // that nobody has said what it protects yet.
      const row = { path: p, kind: 'behavior', protects: '' };
      registry.tests.push(row);
      byPath.set(p, row);
      added.push(p);
    }
  }
  const gone = registry.tests.filter(t => !derived.has(t.path)).map(t => t.path);
  registry.tests = registry.tests.filter(t => derived.has(t.path));

  for (const t of registry.tests) {
    const d = derived.get(t.path);
    // assertion_names goes last: it is the longest field by far, and a row
    // whose scannable fields sit above it stays readable in the diff.
    const ordered = { path: t.path, kind: t.kind, protects: t.protects,
                      assertions: d.assertions, method: d.method,
                      runner: d.runner, boot_smoke: d.boot_smoke,
                      assertion_names: d.assertion_names };
    for (const k of Object.keys(t)) delete t[k];
    Object.assign(t, ordered);
  }
  registry.tests.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');

  const total = registry.tests.reduce((s, t) => s + t.assertions, 0);
  const smoke = registry.tests.reduce((s, t) => s + (t.boot_smoke?.length || 0), 0);
  const byKind = {};
  for (const t of registry.tests) byKind[t.kind] = (byKind[t.kind] || 0) + t.assertions;
  console.log(`tests-index: ${registry.tests.length} files, ${total} assertions ` +
              `(${smoke} boot smoke); ` + KINDS.map(k => `${byKind[k] || 0} ${k}`).join(', '));
  for (const p of added) console.log('  added   ' + p + '  (protects is blank; say what it is for)');
  for (const p of gone) console.log('  dropped ' + p);
  const blank = registry.tests.filter(t => !t.protects).length;
  if (blank) console.log(`  ${blank} row(s) do not say what they protect`);
}
