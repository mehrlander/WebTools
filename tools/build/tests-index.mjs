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
//   assertions  the number of top-level test() calls. The unit the suite
//               counts, so the registry counts the same unit and their sum
//               can be checked against the runner's own total.
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
//   boot_smoke  how many of the file's assertions only check that a component
//               mounts without warnings. Not a criticism: a boot check catches
//               real breakage cheaply. But it is the lowest-information
//               assertion in the suite, and a file that is mostly boot smoke
//               is claiming less than its count suggests.
//
// Authored in the registry, because no derivation can supply it: `kind` (what
// genre of check this is) and `protects` (the one thing that breaks if it is
// deleted). `protects` is held to the same standard as the documents census's
// `maintenance`: a row that cannot say what it protects is a test nobody has
// examined, and the gate counts those rather than banning them.
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

const BOOT_SMOKE = /test\('[^']*(mounts?[^']*(warning|error)|no startup warning)/i;

/** Count top-level test() calls. */
function assertions(src) {
  return (src.match(/^\s*test\(/gm) || []).length;
}

function method(src) {
  if (/loadKit/.test(src)) return 'kit';
  if (/startAlpine|makeWindow/.test(src)) return 'alpine';
  if (/spawnSync|execFileSync/.test(src)) return 'spawn';
  if (/readFileSync/.test(src)) return 'read';
  return 'pure';
}

function bootSmoke(src) {
  return (src.match(new RegExp(BOOT_SMOKE.source, 'gi')) || []).length;
}

/**
 * Derive the machine-visible fields for every test file on disk.
 * @param {string} repoRoot
 * @returns {Map<string, {assertions:number, method:string, runner:string, boot_smoke:number}>}
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
    out.set(rel, {
      assertions: suite ? assertions(src) : null,
      method: method(src),
      runner,
      boot_smoke: suite ? bootSmoke(src) : null,
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
    const ordered = { path: t.path, kind: t.kind, protects: t.protects,
                      assertions: d.assertions, method: d.method,
                      runner: d.runner, boot_smoke: d.boot_smoke };
    for (const k of Object.keys(t)) delete t[k];
    Object.assign(t, ordered);
  }
  registry.tests.sort((a, b) => a.path.localeCompare(b.path));
  writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');

  const total = registry.tests.reduce((s, t) => s + t.assertions, 0);
  const smoke = registry.tests.reduce((s, t) => s + t.boot_smoke, 0);
  const byKind = {};
  for (const t of registry.tests) byKind[t.kind] = (byKind[t.kind] || 0) + t.assertions;
  console.log(`tests-index: ${registry.tests.length} files, ${total} assertions ` +
              `(${smoke} boot smoke); ` + KINDS.map(k => `${byKind[k] || 0} ${k}`).join(', '));
  for (const p of added) console.log('  added   ' + p + '  (protects is blank; say what it is for)');
  for (const p of gone) console.log('  dropped ' + p);
  const blank = registry.tests.filter(t => !t.protects).length;
  if (blank) console.log(`  ${blank} row(s) do not say what they protect`);
}
