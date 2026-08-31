// untracked-carriers.test.mjs — the third sighting of a snag that had already
// been written down twice, fixed at the one place that catches its whole family.
//
// Every registry gate in this suite enumerates with `git ls-files`, which lists
// what git TRACKS. So a file created and not yet added is invisible to all of
// them: the suite runs green over a tree that does not contain it, the push adds
// it, and CI is red on a check that passed locally minutes earlier. It happened
// on 2026-08-28, again on 2026-08-29 with docs/aims.json, and again on 2026-08-30
// with a run's standoff.json, by which point docs/SNAGS.md carried the entry
// with its corrected move stated and the session that hit it had that move in
// context. Reading is not the fix.
//
// Fixing the eleven enumerators is the wrong altitude: they read the tracked set
// for good reasons, and some say so in their own docstrings. What was missing is
// the one check that notices the tree and the index disagree about a file the
// others would have something to say about. One test, run by the same `npm test`
// that was giving the false green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { repoRoot } from './bootstrap.mjs';

// The extensions some registry or scan in this suite governs. A `.png` or a
// `.zip` is enumerated by nothing, so leaving one untracked misleads no gate.
const GOVERNED = /\.(md|json|csv|js|mjs|py|html|sh)$/;

test('no governed file sits untracked, invisible to every other gate', () => {
  const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'],
                           { cwd: repoRoot, encoding: 'utf8' });
  const loose = out.split('\0').filter(Boolean).filter(f => GOVERNED.test(f));
  assert.deepEqual(loose, [],
    'These files exist in the working tree and not in the index, so every registry ' +
    'gate here enumerated a tree without them and this suite\'s green says nothing ' +
    'about them:\n  ' + loose.join('\n  ') +
    '\n\nRun `git add` on the ones you mean to commit, then re-run the suite. ' +
    'Ignore the rest in .gitignore, or keep them outside the repo. ' +
    '(docs/SNAGS.md: untracked-file-invisible-to-the-suite, three sightings.)');
});
