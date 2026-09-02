// scripts/dead-opacity.py — a daisyUI theme colour carrying an opacity step
// that generates no CSS rule (the house style mechanics: the shipped ramp is 10..90 by tens).
//
// What is pinned here is the CLASSIFIER and the repo's cleanliness, in that
// order. The classifier matters because the obvious version of this scan is
// wrong in a way that reads as a finding: "opacity must be a multiple of ten"
// flags every `bg-red-500/25` in the tree, and every one of those is fine. The
// rule is about daisyUI's theme colours, which are CSS variables served off a
// ramp daisyUI's own stylesheet ships; a stock palette colour is compiled by
// the browser build and takes any step at all.
//
// Measured 2026-08-19 in headless Chromium against this app's own stylesheet,
// reading getComputedStyle on injected elements. The boundary:
//
//     bg-primary/10 .. /90 by tens     generate
//     bg-primary/0 /5 /25 /33 /75 /95 /100   DEAD -> rgba(0, 0, 0, 0)
//     bg-primary/[25%]                 DEAD
//     bg-red-500/<anything>            fine
//
// The failure is silent and inverted, which is the whole reason for a gate
// rather than an advisory: a background falls back to transparent so the tint
// never draws, and text falls back to full strength so the thing meant to
// recede advances. Nothing errors. PR #457 corrected 193 of these by hand and
// left one behind, in the one file `grep -rn` could not fully read.
//
// The script is python3/stdlib, so this drives it the way a person does,
// through the file system, and reads what it prints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(repoRoot, 'scripts', 'dead-opacity.py');

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
  const dir = mkdtempSync(path.join(tmpdir(), 'dead-opacity-'));
  const file = path.join(dir, 'probe.html');
  writeFileSync(file, contents);
  try { return fn(file); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('a theme colour off the ramp is reported, with the step it should be', () => {
  withFile('<div class="bg-primary/25"></div>', (f) => {
    const { out } = run([f]);
    assert.match(out, /bg-primary\/25 -> bg-primary\/20/);
  });
});

test('every step the stylesheet ships is left alone', () => {
  const ok = [10, 20, 30, 40, 50, 60, 70, 80, 90]
    .map(n => `<div class="bg-primary/${n} text-base-content/${n}"></div>`).join('\n');
  withFile(ok, (f) => {
    assert.match(run([f]).out, /dead-opacity: none/);
  });
});

test('the ends of the range do not generate either, so they are reported', () => {
  withFile('<i class="bg-primary/0"></i><i class="bg-primary/100"></i>', (f) => {
    const { out } = run([f]);
    assert.match(out, /bg-primary\/0 ->/);
    assert.match(out, /bg-primary\/100 ->/);
  });
});

test('the bracket escape is reported as unfixable by a step', () => {
  withFile('<div class="bg-primary/[25%]"></div>', (f) => {
    assert.match(run([f]).out, /bg-primary\/\[25%\] -> \(no step generates\)/);
  });
});

// THE HALF THE OBVIOUS SCAN GETS WRONG. Each of these is valid and must never
// be reported; a scan that flags them sends someone to "fix" working markup.
test('a stock palette colour takes any step and is never reported', () => {
  withFile([
    '<div class="bg-red-500/25"></div>',
    '<div class="text-slate-700/33"></div>',
    '<div class="bg-black/5 bg-white/95"></div>',
  ].join('\n'), (f) => {
    assert.match(run([f]).out, /dead-opacity: none/);
  });
});

test('a fraction is not an opacity modifier', () => {
  withFile('<div class="w-1/2 basis-1/3 top-1/2 aspect-16/9"></div>', (f) => {
    assert.match(run([f]).out, /dead-opacity: none/);
  });
});

test('a path that happens to contain a slash is not a class', () => {
  withFile('<a href="docs/stage.md">see also lib/kits/text-diff.js</a>', (f) => {
    assert.match(run([f]).out, /dead-opacity: none/);
  });
});

test('a variant prefix does not hide the class', () => {
  withFile('<div class="hover:bg-primary/25 sm:text-base-content/45 dark:border-error/15"></div>', (f) => {
    const { out } = run([f]);
    assert.match(out, /bg-primary\/25/);
    assert.match(out, /text-base-content\/45 -> text-base-content\/40/);
    assert.match(out, /border-error\/15 -> border-error\/10/);
  });
});

// `base-content` must not be matched as `base` with `-content` left over, and
// `base-100` ends in a digit where the next character is the slash.
test('the longest colour name wins, so base-content and base-100 resolve whole', () => {
  withFile('<div class="text-base-content/45 bg-base-100/15 bg-base-300/25"></div>', (f) => {
    const { out } = run([f]);
    assert.match(out, /text-base-content\/45/);
    assert.match(out, /bg-base-100\/15/);
    assert.match(out, /bg-base-300\/25/);
  });
});

// Ties go down, which is what the estate's own 193-occurrence sweep chose.
test('the suggested step is the nearest ten, ties down, floored at 10', () => {
  withFile([
    '<i class="bg-primary/5"></i>',    // nothing below 10 exists
    '<i class="bg-primary/15"></i>',
    '<i class="bg-primary/35"></i>',
    '<i class="bg-primary/55"></i>',
    '<i class="bg-primary/95"></i>',
  ].join('\n'), (f) => {
    const { out } = run([f]);
    assert.match(out, /bg-primary\/5 -> bg-primary\/10/);
    assert.match(out, /bg-primary\/15 -> bg-primary\/10/);
    assert.match(out, /bg-primary\/35 -> bg-primary\/30/);
    assert.match(out, /bg-primary\/55 -> bg-primary\/50/);
    assert.match(out, /bg-primary\/95 -> bg-primary\/90/);
  });
});

test('--check exits non-zero on a finding and zero on a clean tree', () => {
  withFile('<div class="bg-primary/25"></div>', (f) => {
    assert.equal(run(['--check', f]).code, 1);
  });
  withFile('<div class="bg-primary/20"></div>', (f) => {
    assert.equal(run(['--check', f]).code, 0);
  });
});

// The gate itself. Everything above pins the classifier; this is the claim
// that matters to a reader of the app.
test('lib, pages and app carry no opacity step that fails to generate', () => {
  const { code, out } = run(['--check', 'lib', 'pages', 'app']);
  assert.equal(code, 0, 'dead-opacity found classes that generate no rule:\n' + out);
});
