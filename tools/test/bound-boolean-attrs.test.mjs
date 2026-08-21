// scripts/bound-boolean-attrs.py — an Alpine boolean attribute bound to a value
// that can be undefined, which turns the attribute ON.
//
// THE MECHANISM, because the rule reads as superstition without it. Alpine's
// x-bind ends with a coercion:
//
//     if (result === undefined && typeof expression === 'string'
//         && expression.match(/\./)) result = ''
//
// and bind() removes an attribute only for null, undefined and false. '' is
// none of those, so a boolean attribute takes the other branch and gets
// written. `:disabled="row.busy"` on a row with no `busy` key disables the
// button, silently, with the author looking at a field that is plainly not
// true.
//
// WHY A SCAN AND NOT MORE UNIT TESTS. Two controls shipped dead this way (PR
// #469: the FAB drawer's layer strip, where every row including the selected
// one was unclickable, and the transform workbench's bundle checklist, where
// no key could be toggled). Both components had passing suites. A test that
// calls a method on the component cannot see an attribute the template put on
// a button, so the check has to read the markup.
//
// What is pinned here is the CLASSIFIER and the repo's cleanliness, in that
// order. The classifier is the whole design: the loose rule ("a dotted
// expression can be undefined") flags `!a.b` and `a.b === 1` and every guard
// in the tree, and is wrong about all of them, because an operator always
// yields a real boolean. Only a bare fetch is exposed.
//
// python3/stdlib, so this drives it the way a person does and reads what it
// prints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(repoRoot, 'scripts', 'bound-boolean-attrs.py');

// Returns { code, out }. The script exits 1 under --check when it finds
// anything, so a non-zero exit is an outcome here rather than a failure.
function run(args) {
  try {
    const out = execFileSync('python3', [script, ...args], { cwd: repoRoot, encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

function withFile(body, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'boolattr-'));
  const f = path.join(dir, 'probe.html');
  writeFileSync(f, body);
  try { return fn(f); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// One line per case, so a failure names the shape rather than a line number.
const flag = (expr) => withFile(`<button :disabled="${expr}"></button>`, (f) => run([f]).out);

test('a bare property read is flagged, and the fix is offered', () => {
  const out = flag('L.sealed');
  assert.match(out, /:disabled="L\.sealed"/);
  assert.match(out, /:disabled="!!L\.sealed"/, 'the fix is always the same');
});

test('every accessor shape that only fetches is flagged', () => {
  for (const expr of ['L.sealed', 'a?.b', 'a.b.c', 'slots[id].loading', 'aSeg().busy', 'a().b?.c']) {
    assert.match(flag(expr), /an undefined here SETS the attribute/, expr);
  }
});

test('an operator yields a real boolean, so it is left alone', () => {
  // This is the half a looser scan gets wrong, and it is most of the tree.
  for (const expr of ['!!L.sealed', '!a.b', 'a.b === 1', 'a.b || c.d', '!a.b && x.y',
                      'a.b ? 1 : 0', 'guard.on !== false']) {
    assert.match(flag(expr), /bound-boolean-attrs: none/, expr);
  }
});

test('a call with arguments is a contract, not a field that may be missing', () => {
  // `isStaging(row.repo, row.name)` and its kind are the noise a chain-ending
  // rule would add; the author wrote the function to answer this question.
  assert.match(flag('isStaging(row.repo, row.name)'), /none/);
  assert.match(flag('fn(a.b)'), /none/);
});

test('an expression with no dot cannot reach the coercion at all', () => {
  // Alpine's own condition: it fires only on expression.match(/\./).
  assert.match(flag('busy'), /none/);
  assert.match(flag('flags[key]'), /none/);
});

test('only Alpine boolean attributes are in scope', () => {
  // :title="a.b" coming back undefined writes title="", which is harmless and
  // is not this bug.
  withFile('<i :title="a.b" :class="a.b" :value="a.b"></i>', (f) => {
    assert.match(run([f]).out, /none/);
  });
  withFile('<i :inert="a.b"></i>', (f) => assert.match(run([f]).out, /:inert/));
  withFile('<input x-bind:readonly="a.b">', (f) => assert.match(run([f]).out, /:readonly/));
});

test('--check exits non-zero on a finding and zero on a clean tree', () => {
  withFile('<button :disabled="a.b"></button>', (f) => {
    assert.equal(run(['--check', f]).code, 1);
  });
  withFile('<button :disabled="!!a.b"></button>', (f) => {
    assert.equal(run(['--check', f]).code, 0);
  });
});

// The gate itself. Everything above pins the classifier; this is the claim that
// matters to a reader of the app.
test('no bound boolean attribute in lib, pages, app or popups can be undefined', () => {
  const { code, out } = run(['--check', 'lib', 'pages', 'app', 'popups']);
  assert.equal(code, 0, 'bound-boolean-attrs found bindings that set the attribute:\n' + out);
});
