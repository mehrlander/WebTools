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
// in the tree, and is wrong about all of them. Two shapes are exposed and
// nothing else: a bare fetch, and the last operand of a `||`/`&&` chain, since
// those operators hand back an operand rather than a boolean.
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

test('an operator that ANSWERS FOR ITS TYPE is left alone', () => {
  // This is the half a looser scan gets wrong, and it is most of the tree.
  // Negation, comparison and a ternary all produce their own value; `||` and
  // `&&` do not, which is the next test.
  for (const expr of ['!!L.sealed', '!a.b', 'a.b === 1',
                      'a.b ? 1 : 0', 'guard.on !== false']) {
    assert.match(flag(expr), /bound-boolean-attrs: none/, expr);
  }
});

// ── The last operand of || and && ────────────────────────────────────────
// Added 2026-08-23. These two cases used to sit in the list above, on the
// reading that any operator yields a boolean. They do not: `||` and `&&` hand
// back an OPERAND. pages/dictate.html bound `:disabled="!token || saving"`,
// where `saving` names the repo being written to and is '' the rest of the
// time, so with a token in hand the expression was '' and bind() wrote it.
// Both of that page's writing destinations were dead buttons with the token
// sitting right there.
//
// Note what is NOT involved: no dot, so Alpine's undefined-to-'' coercion
// never fired, and no key was missing. An ordinary falsy string is enough,
// because bind() removes an attribute only for null, undefined and false.

test('the last operand of a || or && chain IS the value, so a bare one is flagged', () => {
  for (const expr of ['!token || saving', 'a.b || c.d', '!a.b && x.y', 'loading || err',
                      'a || b || c']) {
    assert.match(flag(expr), /an undefined here SETS the attribute/, expr);
  }
  assert.match(flag('!token || saving'), /:disabled="!!\(!token \|\| saving\)"/,
    'the fix WRAPS, since !! in front would negate only the first operand');
});

test('a last operand that answers for itself ends the chain', () => {
  for (const expr of ['!token || !!saving', "s || 'x'", 'a || b === 1', 'x && !y.z',
                      'a || fn(b, c)', 'a || (b ? 1 : 0)']) {
    assert.match(flag(expr), /bound-boolean-attrs: none/, expr);
  }
});

test('splitting is by TOP-LEVEL operator only', () => {
  // An operator inside a call, an index, or a string does not divide the
  // expression, so none of these is read as a chain with a bare tail.
  for (const expr of ['fn(a || b)', 'items[i || 0].ready === true', '!!(a || b)']) {
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
