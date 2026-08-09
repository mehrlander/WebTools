// artifacts-lockstep.test.mjs — every deterministic derived artifact matches
// the source it is generated from.
//
// CLAUDE.md says the commit hook owns these, and it does where it is wired. But
// a hook only runs where the harness loads its settings, and that is not a
// property of this repository: measured 2026-07-27, a session whose project
// root sits ABOVE the repo (the repo arriving as an additional directory) never
// reads .claude/settings.json, so the hook silently never fires and a stale
// dist/web-tools.js rides into a commit unnoticed. That is exactly what
// happened, and nothing caught it.
//
// So the invariant gets an owner that does not depend on the harness. These run
// the generators in --check mode, which compares bytes instead of writing. Both
// are deterministic, so a mismatch means the artifact is genuinely behind its
// source, not that the build is noisy.
//
// If one fails, run the command it names and commit the result.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const check = (args) => spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });

test('dist/web-tools.js is in lockstep with lib/', () => {
  const r = check(['tools/build/build-lib.mjs', '--check']);
  assert.equal(r.status, 0, (r.stderr || '').trim() || 'build:lib --check failed');
});

test('the page catalogs are in lockstep with pages/', () => {
  const r = check(['tools/build/pages-index.mjs', '--check']);
  assert.equal(r.status, 0, (r.stderr || '').trim() || 'pages-index --check failed');
});

test('docs/README.md is in lockstep with the documentation registry', () => {
  const r = check(['tools/build/docs-readme.mjs', '--check']);
  assert.equal(r.status, 0, (r.stderr || '').trim() || 'docs-readme --check failed');
});

test('the harness census is in lockstep with tools/ and scripts/', () => {
  const r = check(['tools/build/tools-index.mjs', '--check']);
  assert.equal(r.status, 0, (r.stderr || '').trim() || 'tools-index --check failed');
});

// The third hook-owned artifact, and it had no owner here until 2026-08-05.
// That gap hid a real defect rather than a merely theoretical one: board.json's
// per-task keys were emitted by iterating a set, so Python's per-process string
// hash randomization reordered them on every run. Same input, different bytes,
// which is exactly the property the generator's own closing comment claims. It
// went unnoticed because board.json is read by machines and diffed by nobody,
// and because the estate had only one board carrying it. It now has ten.
test('the tracker board is in lockstep with tracker/tasks/', () => {
  const r = spawnSync('python3',
    ['.claude/skills/tasks/build-board.py', 'tracker/tasks', 'tracker/board.md', '--check'],
    { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(r.status, 0, (r.stderr || '').trim() || 'build-board --check failed');
});

// Determinism is the property the check above depends on, so assert it directly
// rather than inferring it from one passing run: two runs over the same input
// must produce identical bytes. A nondeterministic generator makes the lockstep
// test flaky rather than false, which is the harder failure to diagnose.
test('the board generator is byte-deterministic', () => {
  const run = () => spawnSync('python3',
    ['.claude/skills/tasks/build-board.py', 'tracker/tasks', 'tracker/board.md'],
    { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, PYTHONHASHSEED: 'random' } });
  const read = () => readFileSync(join(repoRoot, 'tracker/board.json'), 'utf8');
  run(); const first = read();
  run(); const second = read();
  assert.equal(second, first, 'build-board.py emitted different bytes for identical input');
});

// The plugin carries its own copies of the two conventions docs so that
// injecting them is a file read instead of a fetch. A copy is the easiest kind
// of derived artifact to forget, because nothing about editing docs/ suggests
// that a second file exists, and a stale copy is silent: it injects confidently
// and governs the session with last month's rules.
test('the plugin\'s vendored conventions are in lockstep with docs/', () => {
  for (const name of ['CONVENTIONS.md', 'SURFACING.md']) {
    const source = readFileSync(join(repoRoot, 'docs', name), 'utf8');
    const vendored = readFileSync(join(repoRoot, '.claude/skills/web-tools', name), 'utf8');
    assert.equal(
      vendored, source,
      `.claude/skills/web-tools/${name} is behind docs/${name}. ` +
      'Run: cp docs/CONVENTIONS.md docs/SURFACING.md .claude/skills/web-tools/'
    );
  }
});
