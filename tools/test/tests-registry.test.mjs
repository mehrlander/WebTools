// docs/tests.json — the test registry, and the gate that keeps it honest.
//
// This is the documents census pointed at the suite instead of at docs/. The
// census answers "what is this file and what keeps it true"; this answers
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
import { deriveTests, KINDS, METHODS } from '../build/tests-index.mjs';

const registry = JSON.parse(readFileSync(path.join(repoRoot, 'docs', 'tests.json'), 'utf8'));

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
  for (const k of Object.keys(registry.kinds))
    assert.ok(KINDS.includes(k), 'the kinds gloss describes an unknown kind: ' + k);
  for (const k of KINDS)
    assert.ok(registry.kinds[k], 'a kind with no gloss: ' + k);
});

// The derived half, held the same way reach and words are held in the
// documents census: the registry carries a copy so the app can render it
// without walking the repo, and this keeps the copy true.
test('the declared derivation matches the files on disk', () => {
  const derived = deriveTests(repoRoot);
  for (const t of registry.tests) {
    const d = derived.get(t.path);
    if (!d) continue; // the completeness test owns this
    assert.equal(t.assertions, d.assertions, `${t.path}: assertions; run: npm run tests-index`);
    assert.equal(t.method, d.method, `${t.path}: method; run: npm run tests-index`);
    assert.equal(t.runner, d.runner, `${t.path}: runner; run: npm run tests-index`);
    assert.equal(t.boot_smoke, d.boot_smoke, `${t.path}: boot_smoke; run: npm run tests-index`);
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
  }
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

test('the registry note and kind glosses are substantive', () => {
  assert.ok(registry.note && registry.note.length > 100, 'the registry says what it is');
  for (const [k, gloss] of Object.entries(registry.kinds))
    assert.ok(gloss.length > 20, k + ': the gloss says what the kind means');
});

// A sanity check on the corpus itself rather than on the registry: tools/test/
// should hold tests and the two known helpers, nothing else.
test('tools/test holds only tests and its declared helpers', () => {
  const HELPERS = new Set(['bootstrap.mjs', 'show-repo-shell.mjs']);
  const stray = readdirSync(path.join(repoRoot, 'tools', 'test'))
    .filter(n => n.endsWith('.mjs') && !HELPERS.has(n))
    .filter(n => !registry.tests.some(t => t.path.endsWith('/' + n)));
  assert.deepEqual(stray, [], 'unregistered files in tools/test/');
});
