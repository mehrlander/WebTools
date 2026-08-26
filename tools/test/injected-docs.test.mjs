// docs/CONVENTIONS.md and docs/SURFACING.md: the two documents loaded into
// every session in every repo, and the only two the docs registry marks
// `reach: injected`. A word in them is a runtime cost paid on every turn, which
// is the argument PR #509 made when it cut both to their declarations.
//
// CLAUDE.md has had a ceiling since 2026-08-03 (claude-md.test.mjs) and has
// moved +0.1% since. These two had none and moved +25% and +27% over the same
// window, then needed a hand cut. Same gate, same remedy, two more files.
//
// The remedy when any of these fires is EXTRACTION, never shaving. Move the
// material into a doc that is not injected, or into data the app renders, the
// way the showing section went to docs/showing-mechanisms.csv. Trimming
// adjectives buys a few words, teaches the next session that the number is the
// goal, and leaves the file just as long.
//
// Raising a number is a real option, and it is a decision about how much every
// session in the estate reads before it starts. Make it deliberately, in its
// own commit, not in the one that tripped the check.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');
const words = (s) => s.split(/\s+/).filter(Boolean).length;

// Set 2026-08-26, each a little above the size the file reached after PR #509,
// so the next stretch of growth trips it rather than the one after that.
// CONVENTIONS.md shares CLAUDE.md's number because it plays the same part.
const LIMITS = {
  'docs/CONVENTIONS.md': 1600,   // 1,389w when set
  'docs/SURFACING.md': 4600,     // 4,125w when set
};

for (const [file, limit] of Object.entries(LIMITS)) {
  test(`${file} stays under its ceiling`, () => {
    const n = words(read(file));
    assert.ok(n < limit,
      `${file} is ${n} words, over its ${limit}-word ceiling. It is injected ` +
      'into every session in every repo, so the fix is extraction: move the ' +
      'material to a doc that is not injected, or to data the app renders. ' +
      'Raising the ceiling is a deliberate decision, taken on its own.');
  });
}

// The density half, and the one the raw ceilings above cannot do.
//
// Between 2026-08-11 and 2026-08-25 the primitives section gained 950 words
// while stating exactly the same twenty rules: 119 words per rule, then 167.
// A total-word ceiling cannot tell that apart from five new primitives, and
// the two deserve opposite answers. Adding a rule is the section doing its
// job; elaborating one is the failure mode both injected documents name and
// neither could see in itself.
//
// So this is scale-free on purpose. The section may grow all it likes by
// acquiring rules. It may not grow by explaining the ones it has.
const PER_PRIMITIVE = 120;      // 107.2 when set

test('the primitives section states rules rather than explaining them', () => {
  const surfacing = read('docs/SURFACING.md');
  const section = surfacing
    .split('## Surfacing primitives')[1]?.split('## The surfacing course')[0];
  assert.ok(section, 'the primitives section is where the parser expects it');

  const rules = (section.match(/^\* \*\*/gm) || []).length;
  assert.ok(rules > 10, 'the section parses into primitives');

  const density = words(section) / rules;
  assert.ok(density < PER_PRIMITIVE,
    `the primitives section runs ${density.toFixed(1)} words per rule across ` +
    `${rules} rules, over its ${PER_PRIMITIVE}-word budget. This one does not ` +
    'fire for adding a primitive, only for explaining one: each entry states ' +
    'the rule, then Form where there is a syntax, then Boundary where deleting ' +
    'the clause would change how the rule applies at an edge. Provenance goes ' +
    'to the PR body, which already carries it.');
});
