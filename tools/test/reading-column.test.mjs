// .claude/skills/hooks/reading-column.py — a Tailwind class that narrows text
// to a reading column (daisy-alpine rule 3), plus the guard hook that refuses
// one at edit time.
//
// What is pinned here is the CLASSIFIER, the guard's decision, and the repo's
// cleanliness. The classifier first, because the obvious version of this scan
// is wrong in a way that reads as a finding twice over:
//
//   1. `max-w-*` anywhere. There are 189 in this repo and only 69 were the
//      rule: `max-w-none` is how a `prose` block gets UNCAPPED, `modal-box
//      max-w-2xl` is daisyUI component sizing, and 5xl through 7xl are page
//      shells with nothing on a text element.
//   2. The token anywhere on the line. Both findings name themselves in
//      ordinary prose: code comments explain why a cap was removed, and
//      `prose` is an English word. Unanchored, the first run of this scanner
//      reported 234 findings of which 161 were the word "prose" in a comment.
//
// So the scan is anchored to class attributes, and the size list is exactly
// what rule 3 names. Measured 2026-09-01 on the Map view's tab gloss, which is
// where this started: the sentence wanted 842px, `max-w-3xl` gave it 768, and
// `text-balance` evened the halves to 426 and 412, so the break landed
// mid-phrase beside a 1242px tab strip.
//
// The guard is tested through its stdin contract, the way the harness calls it,
// because its one interesting property is not in the scanner: it judges the
// RESULT of the pending edit, so a file that already carried a violation cannot
// be edited until it is clean, while a fixing edit always passes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hooks = path.join(repoRoot, '.claude', 'skills', 'hooks');
const script = path.join(hooks, 'reading-column.py');
const guard = path.join(hooks, 'reading-column-guard.sh');

// Returns { code, out }. The script exits 1 under --check on a finding, so a
// non-zero exit is an outcome here rather than a failure.
function run(args) {
  try {
    return { code: 0, out: execFileSync('python3', [script, ...args], { cwd: repoRoot, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

function withFile(body, fn, ext = '.html') {
  const dir = mkdtempSync(path.join(tmpdir(), 'reading-column-'));
  const f = path.join(dir, 'page' + ext);
  writeFileSync(f, body);
  try { return fn(f); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// The guard's stdin contract. Returns the deny reason, or '' when it allows.
function ask(payload) {
  const out = execFileSync('bash', [guard], { input: JSON.stringify(payload), encoding: 'utf8' });
  if (!out.trim()) return '';
  return JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
}

test('every size rule 3 names is reported', () => {
  for (const cls of ['max-w-prose', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl']) {
    withFile(`<p class="text-base ${cls}">x</p>`, f => {
      assert.match(run([f]).out, new RegExp(cls), cls);
    });
  }
  withFile('<div class="container mx-auto">x</div>', f => {
    assert.match(run([f]).out, /container mx-auto/);
  });
});

// The sizes that are page shells and components, not reading measures. A scan
// that flags these sends someone to "fix" working layout.
test('wider shells and smaller component widths are never reported', () => {
  for (const cls of ['max-w-5xl', 'max-w-6xl', 'max-w-7xl', 'max-w-xl', 'max-w-md', 'max-w-sm', 'max-w-xs', 'max-w-full']) {
    withFile(`<div class="mx-auto ${cls}">x</div>`, f => {
      assert.match(run([f]).out, /reading-column: none/, cls);
    });
  }
});

test('!max-w-none is the prose UNDO and is never reported', () => {
  withFile('<div class="prose prose-sm !max-w-none">x</div>', f => {
    assert.match(run([f]).out, /reading-column: none/);
  });
});

test('the PLAIN max-w-none is reported, because it loses to the cascade', () => {
  // The bang is the whole rule. Typography ships plain unlayered CSS setting
  // `.prose{max-width:65ch}`; Tailwind v4 puts its utilities in
  // `@layer utilities`, and an unlayered rule beats every layer whatever the
  // source order. So the plain utility reads as the undo and is not one. This
  // scanner taught the plain form until 2026-09-02, and four files carried it
  // while four others already carried the bang.
  withFile('<div class="prose prose-sm max-w-none">x</div>', f => {
    assert.match(run([f]).out, /: prose$/m);
  });
});

test('a prose run with no undo at all is reported: same 65ch cap, no max-w-* to grep', () => {
  withFile('<div class="prose prose-sm mx-auto px-6">x</div>', f => {
    assert.match(run([f]).out, /: prose$/m);
  });
});

// Both findings name themselves in English. This is the 161-false-positive case.
test('the class named in a comment is not a finding', () => {
  withFile('<!-- the list carried max-w-3xl while the right rail did not -->\n'
         + '// this doc is the prose around that\n', f => {
    assert.match(run([f]).out, /reading-column: none/);
  });
});

test('modal-box sizing is exempt', () => {
  withFile('<div class="modal-box max-w-2xl p-0">x</div>', f => {
    assert.match(run([f]).out, /reading-column: none/);
  });
});

test('reading-column-ok suppresses the line, and the line above it', () => {
  withFile('<p class="max-w-2xl">x</p> <!-- reading-column-ok -->', f => {
    assert.match(run([f]).out, /reading-column: none/);
  });
  // The line above is what a finding inside a template literal needs: the line
  // itself can carry neither a JS comment nor anything but markup.
  withFile('<!-- reading-column-ok -->\n<p class="max-w-2xl">x</p>', f => {
    assert.match(run([f]).out, /reading-column: none/);
  });
});

test('--check exits non-zero on a finding and zero on a clean tree', () => {
  withFile('<p class="max-w-3xl">x</p>', f => assert.equal(run(['--check', f]).code, 1));
  withFile('<p class="text-base">x</p>', f => assert.equal(run(['--check', f]).code, 0));
});

test('the guard refuses a Write that introduces one, and passes a clean one', () => {
  assert.match(ask({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.html', content: '<p class="max-w-4xl">x</p>' } }),
    /max-w-4xl narrows text to a reading column and is not allowed/);
  assert.equal(ask({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.html', content: '<p>x</p>' } }), '');
});

// The property the scanner does not have: it judges the result, not the payload.
test('the guard refuses an unrelated edit to a file that still carries one, and allows the fix', () => {
  withFile('<p class="text-base max-w-3xl">hi</p>', f => {
    assert.match(ask({ tool_name: 'Edit', tool_input: { file_path: f, old_string: 'hi', new_string: 'hello' } }),
      /would still narrow text to a reading column/);
    assert.equal(ask({ tool_name: 'Edit', tool_input: { file_path: f, old_string: 'text-base max-w-3xl', new_string: 'text-base' } }), '');
  });
});

test('the guard ignores a file type that has no classes, such as a doc naming the class', () => {
  assert.equal(ask({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.md', content: 'do not use max-w-3xl' } }), '');
});

// Cleanliness. Reported with the list, since a bare exit code sends someone
// back to the command to find out what moved.
test('the repo narrows no text to a reading column', () => {
  const { code, out } = run(['--check', 'lib', 'pages', 'app']);
  assert.equal(code, 0, `reading-column found violations:\n${out}`);
});

// The rule and the check have to name the same sizes, or the skill is
// describing a gate that does not exist.
test('the skill names exactly the sizes the scanner enforces', () => {
  const skill = readFileSync(path.join(repoRoot, 'skills', 'daisy-alpine', 'SKILL.md'), 'utf8');
  const rule = skill.split('**3. Don\'t narrow text to a reading column.**')[1].split('**4.')[0];
  for (const cls of ['max-w-prose', 'max-w-2xl', 'max-w-3xl', 'max-w-4xl', 'container mx-auto', 'max-w-none']) {
    assert.ok(rule.includes(cls), `rule 3 does not name ${cls}`);
  }
  const sizes = readFileSync(script, 'utf8').match(/COLUMN_SIZES = \[(.+?)\]/)[1];
  assert.equal(sizes, "'prose', '2xl', '3xl', '4xl'", 'scanner sizes moved; rule 3 has to move with them');
});
