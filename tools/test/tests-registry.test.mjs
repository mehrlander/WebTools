// docs/tests.csv — the test registry, and the gate that keeps it honest.
//
// This is the documents registry pointed at the suite instead of at docs/. The
// registry answers "what is this file and what keeps it true"; this answers
// "what does this check and what breaks without it". Both exist because a
// count is not an inventory: `npm test` reports a pass total that cannot tell
// a boot smoke check from an adversarial gate, and 96 files is already past
// the point where anyone holds the shape in their head.
//
// Completeness runs both ways here, unlike the manifest registry. Every file
// under tools/test/ must have a row and every row must exist, because a test
// file that nobody has classified is exactly the thing this is for. The
// browser-driven checks are included on purpose: they are named without
// `.test.` so `node --test` skips them, which means the suite's own pass count
// is silent about whether they still run at all.
//
// `protects` is a ledger, not a ban. A blank one marks a test nobody has yet
// said anything about, and the count is the honest measure of how much of the
// suite is unexamined. If it climbs, rows are being added to satisfy the gate
// rather than to say something.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { parseCsv, splitList } from '../build/registries-load.mjs';

// The per-value glosses, read from the table that owns them. KINDS itself is
// imported below from tests-index.mjs, which already had the domain.
const VOCAB = parseCsv(readFileSync(path.join(repoRoot, 'docs', 'vocabularies.csv'), 'utf8'));
const glossOf = (v) => VOCAB.find(r =>
  r.registry === 'tests' && r.property === 'kind' && r.value === v)?.gloss;
import { deriveTests, KINDS, METHODS } from '../build/tests-index.mjs';

const registry = { tests: parseCsv(readFileSync(path.join(repoRoot, 'docs', 'tests.csv'), 'utf8')).map(t => ({
  ...t,
  // A blank means NOT ASSERTED, so it reads back as null rather than 0: a browser
  // check reports no assertion count because test() is not its unit, which is a
  // different claim from a suite that ran zero.
  assertions: t.assertions === '' ? null : +t.assertions,
  // Three states, two spellings. A blank cell cannot tell null (not applicable:
  // test() is not this check's unit) from [] (a suite that declares none), and
  // both write blank. They are not independent: a check with no assertion count
  // has no assertions to smoke, so the dependency decides it. Same shape as
  // deriver-when-computed, and the reason no token is needed here.
  boot_smoke: t.assertions === '' ? null
    : t.boot_smoke === '' ? [] : splitList(t.boot_smoke).map(Number),
  assertion_names: t.assertions === '' ? null
    : t.assertion_names === '' ? [] : splitList(t.assertion_names),
})) };

test('every test file has exactly one row, and every row exists', () => {
  const derived = deriveTests(repoRoot);
  const rows = registry.tests.map(t => t.path);
  assert.equal(rows.length, new Set(rows).size, 'a path appears in two rows');
  for (const p of derived.keys())
    assert.ok(rows.includes(p), 'a test file with no registry row: ' + p + '; run: npm run tests-index');
  for (const p of rows)
    assert.ok(derived.has(p), 'a registry row with no file: ' + p + '; run: npm run tests-index');
});

test('every row is typed, and the kind vocabulary is closed', () => {
  for (const t of registry.tests) {
    assert.ok(KINDS.includes(t.kind),
      `${t.path}: kind must be one of ${KINDS}, got ${t.kind}`);
    assert.ok(METHODS.includes(t.method),
      `${t.path}: method must be one of ${METHODS}, got ${t.method}`);
    assert.ok(typeof t.runner === 'string' && t.runner, t.path + ': runner');
  }
  for (const k of KINDS)
    assert.ok(KINDS.includes(k), 'the kinds gloss describes an unknown kind: ' + k);
  for (const k of KINDS)
    assert.ok(glossOf(k), 'a kind with no gloss: ' + k);
});

// The derived half, held the same way reach and words are held in the
// documents registry: the registry carries a copy so the app can render it
// without walking the repo, and this keeps the copy true.
test('the declared derivation matches the files on disk', () => {
  const derived = deriveTests(repoRoot);
  for (const t of registry.tests) {
    const d = derived.get(t.path);
    if (!d) continue; // the completeness test owns this
    assert.equal(t.assertions, d.assertions, `${t.path}: assertions; run: npm run tests-index`);
    assert.equal(t.method, d.method, `${t.path}: method; run: npm run tests-index`);
    assert.equal(t.runner, d.runner, `${t.path}: runner; run: npm run tests-index`);
    assert.deepEqual(t.boot_smoke, d.boot_smoke, `${t.path}: boot_smoke; run: npm run tests-index`);
    assert.deepEqual(t.assertion_names, d.assertion_names,
      `${t.path}: assertion_names; run: npm run tests-index`);
  }
});

// `assertions` and `assertion_names` are two independent reads of the same call
// sites, kept independent so this can compare them. What it catches is a test()
// whose name is not a string literal: the counter sees the call, the extractor
// finds nothing to capture, and the list silently comes up short.
//
// What it does NOT catch, corrected here after the comment claimed otherwise:
// truncation. A name pattern that ends on an escaped quote still matches once
// and still yields a string, so the counts stay equal while the captured prose
// is clipped. Only reading the names catches that, which is why the extractor
// steps over `\\.` rather than being guarded from the outside.
test('every counted assertion has a name', () => {
  for (const t of registry.tests) {
    if (t.assertions === null) continue;
    assert.equal(t.assertion_names.length, t.assertions,
      `${t.path}: ${t.assertions} assertions but ${t.assertion_names.length} names; ` +
      'the name extractor and the counter disagree');
  }
});

// A browser check has no top-level test() calls, so its count is null rather
// than 0. Zero would read as "this checks nothing", which is false and is the
// kind of quiet misreport the traffic accounting rules were written against.
test('a non-suite check reports no assertion count rather than zero', () => {
  for (const t of registry.tests) {
    const suite = t.path.endsWith('.test.mjs');
    if (suite) assert.equal(typeof t.assertions, 'number', t.path + ': suite files count');
    else assert.equal(t.assertions, null,
      t.path + ': a browser check must report null, not 0, since test() is not its unit');
    // Same rule for the names: an empty array would read as "this file checks
    // nothing named", which is false. A browser check names its assertions in
    // its own harness, somewhere this extractor cannot see.
    if (suite) assert.ok(Array.isArray(t.assertion_names), t.path + ': suite files list names');
    else assert.equal(t.assertion_names, null,
      t.path + ': a browser check must report null names, not an empty list');
    if (suite) assert.ok(Array.isArray(t.boot_smoke), t.path + ': suite files list smoke indices');
    else assert.equal(t.boot_smoke, null, t.path + ': a browser check reports null smoke');
  }
});

// boot_smoke indexes assertion_names, so an index outside it is a stale stamp
// pointing at an assertion that no longer exists. Cheap to check and the whole
// reason indices are safe to store: they are only meaningful against the list
// beside them, and nothing else would notice if they drifted apart.
test('every smoke index addresses a real assertion', () => {
  for (const t of registry.tests) {
    if (!t.boot_smoke) continue;
    for (const i of t.boot_smoke)
      assert.ok(Number.isInteger(i) && i >= 0 && i < t.assertion_names.length,
        `${t.path}: boot_smoke index ${i} is outside its ${t.assertion_names.length} names`);
  }
});

// A ceiling on `protects`, and it is a proxy rather than a style rule. The
// fault it catches is one field doing two jobs: `protects` says what breaks if
// the file goes, and it had been absorbing coverage inventories because
// coverage was invisible in the view. Twelve rows had run past 300 characters
// that way, the worst at 697, six clauses joined by "and" that between them
// named 10 of the file's 22 assertions and silently dropped the other 12.
// `assertion_names` carries that job now, derived and complete. Length is not
// the defect, but it is the one signal of the defect a machine can read, and
// the corpus it was set against topped out at 299.
const PROTECTS_MAX = 320;

test('protects says what breaks, and does not become an inventory', () => {
  const long = registry.tests
    .filter(t => (t.protects || '').length > PROTECTS_MAX)
    .map(t => `${t.path} (${t.protects.length})`);
  assert.deepEqual(long, [],
    `over ${PROTECTS_MAX} chars: say what BREAKS in one sentence and let ` +
    'assertion_names carry the coverage: ' + long.join(', '));
});

// The floor, added 2026-08-10 with the ceiling above it, because deriving
// assertion_names made the opposite failure visible for the first time. Fourteen
// rows described only the boot check ("The jots list mounts clean") on files
// asserting eight or nine real behaviours, so the sentence claimed far LESS than
// the file did. The ceiling cannot see that direction, and neither could anyone
// reading the registry, since a short sentence looks disciplined.
//
// Deliberately narrow. The pattern alone over-fires: two rows open with "mounts"
// and then say plenty, so length is the second condition, and a file with almost
// nothing but a boot check is entitled to say so, which is the third. It is a
// detector for one shape, not a quality bar for prose.
const BOOT_ONLY = /mounts?\b|exposes (its|every) documented/i;

test('protects says more than "it mounts" when the file does more', () => {
  const thin = registry.tests.filter(t => {
    if (!t.protects || !t.assertion_names) return false;
    const behavioural = t.assertion_names.length - (t.boot_smoke?.length || 0);
    return BOOT_ONLY.test(t.protects) && t.protects.length < 120 && behavioural >= 4;
  }).map(t => `${t.path} (${t.assertion_names.length - (t.boot_smoke?.length || 0)} beyond the boot check)`);
  assert.deepEqual(thin, [],
    'these say only that the subject mounts, on files that assert much more; ' +
    'read assertion_names and say what would BREAK: ' + thin.join(', '));
});

// Not a ban. The number is the point: it says how much of the suite nobody has
// examined. It stood at 0 when the registry was written.
test('the unexamined count is reported', () => {
  const blank = registry.tests.filter(t => !t.protects).map(t => t.path);
  assert.deepEqual(blank, [],
    'these rows do not say what they protect; say it, or say plainly that ' +
    'nobody has looked: ' + blank.join(', '));
});

// Every browser check should be reachable by a named script. The one that was
// not (playground-pass.mjs, documented in console/README.md but owned by no
// npm script) is why this exists: it was runnable and invisible.
test('every browser check is owned by an npm script', () => {
  const orphans = registry.tests.filter(t => t.runner === 'unrun').map(t => t.path);
  assert.deepEqual(orphans, [],
    'these checks are skipped by node --test and owned by no npm script, so ' +
    'nothing runs them: ' + orphans.join(', '));
});

// The per-kind glosses moved to docs/vocabularies.csv on 2026-08-16. A value
// domain is a semicolon list in properties.csv and cannot carry a sentence per
// value, so the sentences got a table of their own, keyed (registry, property,
// value). The registry's own note went the way every other one did: to the prose
// that already describes it.
test('every kind of check carries a gloss that says what the kind means', () => {
  assert.ok(KINDS.length > 3, 'the kind domain is declared');
  for (const k of KINDS)
    assert.ok((glossOf(k) || '').length > 20, k + ': the gloss says what the kind means');
});

// A sanity check on the corpus itself rather than on the registry: tools/test/
// should hold tests and the two known helpers, nothing else.
test('tools/test holds only tests and its declared helpers', () => {
  const HELPERS = new Set(['bootstrap.mjs', 'shell.mjs']);
  const stray = readdirSync(path.join(repoRoot, 'tools', 'test'))
    .filter(n => n.endsWith('.mjs') && !HELPERS.has(n))
    .filter(n => !registry.tests.some(t => t.path.endsWith('/' + n)));
  assert.deepEqual(stray, [], 'unregistered files in tools/test/');
});
