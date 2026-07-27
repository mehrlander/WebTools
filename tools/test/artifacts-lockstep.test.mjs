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
