// CLAUDE.md itself: the two things the repo asks of its own agent
// instructions, which are not the same thing and no longer share a name.
//
// Both assertions lived inside routes-manifest.test.mjs until 2026-08-05,
// under the single name "CLAUDE.md delegates rather than restating". That was
// a misfiling with a cost. The routes manifest has nothing to do with how long
// CLAUDE.md is, so a session that grew the file by adding an unrelated section
// met a failure whose message blamed the showing material and pointed at a
// file it had not touched. The honest reading was "this file is too long";
// what the message taught instead was "shave something until the number goes
// down", and one session did exactly that before catching itself.
//
// Nothing about the checks changed in the move: same threshold, same
// assertions, same corpus. Only the grouping, the names, and what the failure
// tells you to do about it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const claude = readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8');

// The structural half. This is the one that is genuinely about the showing
// material: the 1,589-word section moved out to docs/routes.json on 2026-08-03,
// and these two pointers are what keep it findable from the file that used to
// hold it. Permanent, and carries no number.
test('CLAUDE.md delegates the showing material to its manifest and frame', () => {
  assert.match(claude, /docs\/routes\.json/,
    'CLAUDE.md no longer points at the showing manifest (docs/routes.json)');
  assert.match(claude, /docs\/showing\.md/,
    'CLAUDE.md no longer points at the showing frame (docs/showing.md)');
});

// The size half. A general ceiling, not a showing-specific one, and the
// threshold is deliberate rather than derived: 1600 was set when the file fell
// to 1,117 words, leaving room to grow but not to sprawl.
//
// The remedy when this fires is extraction, never shaving. Move a section into
// a doc or into data and link it, the way the showing material went to
// routes.json and the manifest field list went to docs/manifest-fields.csv. Trimming
// adjectives off unrelated paragraphs buys a few words, teaches the next
// session that the number is the goal, and leaves the file just as long.
//
// Raising the number is a real option, but it is a decision about how much a
// session should be asked to read before it starts, so make it deliberately
// and not in the same commit that tripped the check.
const LIMIT = 1600;

test('CLAUDE.md stays short', () => {
  const words = claude.split(/\s+/).length;
  assert.ok(words < LIMIT,
    `CLAUDE.md is ${words} words, over its ${LIMIT}-word ceiling. ` +
    'The fix is extraction, not shaving: move a section into a doc or into ' +
    'data and link it. Raising the ceiling is a deliberate decision about how ' +
    'much a session reads before starting, so do it on its own, not here.');
});
