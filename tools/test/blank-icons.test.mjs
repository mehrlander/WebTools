// scripts/blank-icons.py — a Phosphor class naming an icon the installed font
// does not carry, which renders as a zero-width blank and nothing else.
//
// What is pinned here is the CLASSIFIER, where the valid set comes from, and
// the repo's cleanliness, in that order.
//
// The classifier matters because the two ways to get a name wrong look nothing
// alike and only one of them is mechanical. `ph-play-fill` is the weight-as-a-
// suffix mistake: Phosphor's weights are font FAMILIES, so stripping the weight
// and finding a real name proves the intent, no guessing. `ph-git-compare` is a
// name borrowed from another icon family (Octicons has it, Phosphor does not),
// and nothing can recover what was meant, so the script says so rather than
// inventing a match.
//
// Where the set comes from matters because the obvious version of this scan
// commits a name list, and a committed list is a second copy of the font free
// to drift from it in either direction. `@phosphor-icons/web` is a devDependency
// at a range and package-lock.json is gitignored, so the installed set is
// whatever npm resolved this run. Reading its stylesheet means the scan cannot
// be wrong about the font, only about the tree.
//
// The gate exists because the failure is completely silent: no console error,
// no fallback glyph, no layout complaint. Nine of these had shipped when the
// scan was first written (PR #555), one of them a tab in the Map view's own
// strip, blank beside eleven siblings that were not. docs/SNAGS.md filed the
// mechanism as `phosphor-weight-is-a-family` on 2026-07-28 and it recurred
// anyway, which is what a gate is for.
//
// The script is python3/stdlib, so this drives it the way a person does,
// through the file system, and reads what it prints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(repoRoot, 'scripts', 'blank-icons.py');
const sheet = path.join(repoRoot, 'node_modules', '@phosphor-icons', 'web', 'src', 'regular', 'style.css');

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

function withFile(contents, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'blank-icons-'));
  const file = path.join(dir, 'probe.html');
  writeFileSync(file, contents);
  try { return fn(file); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a name the font does not carry is reported', () => {
  withFile('<i class="ph ph-faucet"></i>', (f) => {
    const { out } = run([f]);
    assert.match(out, /probe\.html:1: ph-faucet/);
    assert.match(out, /render as nothing at all/);
  });
});

test('weight as a suffix is named as such, with the class pair to use', () => {
  withFile('<i class="ph ph-play-fill"></i>', (f) => {
    const { out } = run([f]);
    assert.match(out, /ph-play-fill -> ph-fill ph-play/);
    assert.match(out, /weight is a family, not a suffix/);
  });
});

test('a borrowed name with no near match says so instead of guessing', () => {
  withFile('<i class="ph ph-git-compare"></i>', (f) => {
    const { out } = run([f]);
    assert.match(out, /ph-git-compare -> \?/);
    assert.match(out, /no near name/);
  });
});

test('a typo close to a real name is offered that name, labelled a guess', () => {
  withFile('<i class="ph ph-magnifying-glas"></i>', (f) => {
    const { out } = run([f]);
    assert.match(out, /ph-magnifying-glas -> ph-magnifying-glass/);
    assert.match(out, /nearest name in the font/);
  });
});

test('a weight class carries no icon name and is never a finding', () => {
  withFile('<i class="ph-fill ph-bold ph-duotone ph-thin ph-light"></i>', (f) => {
    const { code, out } = run(['--check', f]);
    assert.equal(code, 0);
    assert.match(out, /blank-icons: none/);
  });
});

test('a bad name in prose, outside any quoted string, is not a finding', () => {
  withFile('<!-- ph-faucet is not an icon, which is the whole point -->', (f) => {
    const { code, out } = run(['--check', f]);
    assert.equal(code, 0);
    assert.match(out, /blank-icons: none/);
  });
});

test('a name is read from an Alpine :class expression, not only a class attribute', () => {
  withFile(`<i class="ph" :class="ok ? 'ph-check' : 'ph-warning-octagen'"></i>`, (f) => {
    const { out } = run([f]);
    assert.match(out, /ph-warning-octagen/);
    assert.doesNotMatch(out, /ph-check ->/);
  });
});

test('the valid set is the installed font, counted off its own stylesheet', () => {
  const carried = new Set([...readFileSync(sheet, 'utf8').matchAll(/\.ph\.ph-([a-z0-9-]+)/g)].map(m => m[1]));
  const { out } = run([]);
  const reported = Number(out.match(/\((\d+) names\)/)[1]);
  assert.equal(reported, carried.size);
  assert.ok(carried.has('syringe') && !carried.has('faucet'),
    'the sheet is the authority: it carries syringe and not faucet');
});

test('no icon set installed skips rather than flagging every name in the tree', () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'blank-icons-bare-'));
  try {
    const { code, out } = run(['--check', '--repo-root', empty, 'lib']);
    assert.equal(code, 0);
    assert.match(out, /skipped; no icon set/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test('--check exits non-zero on a finding and zero on a clean tree', () => {
  withFile('<i class="ph ph-faucet"></i>', (f) => {
    assert.equal(run(['--check', f]).code, 1);
    assert.equal(run([f]).code, 0, 'advisory by default');
  });
  withFile('<i class="ph ph-syringe"></i>', (f) => {
    assert.equal(run(['--check', f]).code, 0);
  });
});

test('lib, pages and app carry no icon name the installed font cannot render', () => {
  const { code, out } = run(['--check']);
  assert.equal(code, 0, out);
  assert.match(out, /blank-icons: none/);
});
