// The load-race guard: gh-boot's FAB timer must wait for a page-published
// window.__pageBoot before starting its own Alpine. The race is real and was
// hit live (shorter.html on a phone through a #gh= toss: the chain's four
// sequential API round trips outran the 1500ms timer, and gh-boot's Alpine
// initialized the page's inline x-data against helpers that had not loaded).
// gh-boot itself is network-bound, so like the pre-build boot-order test this
// pins the source contract rather than driving the timer live.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const boot = readFileSync(path.join(repoRoot, 'lib/gh-boot.js'), 'utf8');
const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

test('gh-boot awaits window.__pageBoot before its Alpine fallback', () => {
  const guard = boot.indexOf('await window.__pageBoot');
  const fallback = boot.indexOf("gh.load('alpine-bundle.js')");
  assert.ok(guard !== -1, 'the guard exists');
  assert.ok(fallback !== -1, 'the Alpine fallback exists');
  assert.ok(guard < fallback, 'the guard runs before gh-boot can start its own Alpine');
  assert.match(boot, /try\s*\{\s*if\s*\(window\.__pageBoot\)\s*await window\.__pageBoot;?\s*\}\s*catch/,
    'a failed page chain must not block the FAB mount');
});

test('the canonical boot block publishes window.__pageBoot', () => {
  // New pages copy the README block, so the guard has to be in it by
  // construction; per-page adoption elsewhere is tracked, not asserted here.
  assert.match(readme, /window\.__pageBoot\s*=\s*\(async \(\) => \{/);
  assert.match(readme, /await window\.__pageBoot/);
});
