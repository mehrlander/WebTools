// docs/CONVENTIONS.md and docs/SURFACING.md: the two documents loaded into
// every session in every repo, and the only two the docs registry marks
// `reach: injected`. A word in them is a runtime cost paid on every turn, which
// is the argument PR #509 made when it cut both to their declarations.
//
// CLAUDE.md has had a ceiling since 2026-08-03 (claude-md.test.mjs) and has
// moved +0.1% since. These two had none and moved +25% and +27% over the same
// window, then needed a hand cut. Same gate, same remedy, two more files.
//
// When one fires, see docs/CONVENTIONS.md ("Prose that describes state is
// unimplemented"). Cut derived facts, enforced rules, or duplicated content.
// What survives the cut and is not a rule can go to a doc that is not injected,
// which costs nothing at startup. These files are loaded every turn in every
// repo, so use the skills/state-the-rule pass.
//
// Raising a limit is an option, but it costs every session in the estate
// context before it starts. Ask the user first, and change it in its own commit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const read = (p) => readFileSync(path.join(repoRoot, p), 'utf8');
const words = (s) => s.split(/\s+/).filter(Boolean).length;

// Set 2026-08-27, each a little above the size the file reached after the
// docs-editing sessions' compression pass, so the next stretch of growth trips
// it rather than the one after that. CONVENTIONS.md shares CLAUDE.md's number
// because it plays the same part.
const LIMITS = {
  'docs/CONVENTIONS.md': 1600,   // 1,339w when set
  'docs/SURFACING.md': 4400,     // 3,918w when set
};

// Neither number is the binding constraint, and the gap between them and the
// one that is misleads in the expensive direction. These are per-file word
// ceilings; the channel is a shared BYTE budget over both documents at once,
// held by conventions-delivery.test.mjs. Measured 2026-08-30 after PR #545's
// state-the-rule pass: about 100 bytes of headroom before the payload drops
// SURFACING.md's front matter, and about 1,000 before it drops every primitive,
// while CONVENTIONS.md reads 261 words under its ceiling. A session that spends
// the words it appears to have here fails there: a 192-word section added that
// day cost 1,159 bytes and took the payload two rungs down. The rung boundaries
// move whenever either document changes size, so re-measure rather than trusting
// these figures; check the delivery test before adding to either file.

for (const [file, limit] of Object.entries(LIMITS)) {
  test(`${file} stays under its ceiling`, () => {
    const n = words(read(file));
    assert.ok(n < limit,
      `${file} is ${n} words, over its ${limit}-word ceiling. It is injected ` +
      'into every session in every repo. See docs/CONVENTIONS.md ("Prose that ' +
      'describes state is unimplemented"): cut derived facts, enforced rules, ' +
      'or duplicated content. Ask the user before raising the limit.');
  });
}

// The primitives section on its own, which the file ceiling above cannot do.
//
// Between 2026-08-11 and 2026-08-25 this section gained 950 words while stating
// exactly the same twenty rules: the rule set was frozen and the prose was not.
// A whole-file ceiling misses that whenever another section shrinks by as much,
// which is not hypothetical: on 2026-08-27 the file fell 207 words while this
// section rose 254.
//
// This was a words-PER-RULE budget for one day, and the distribution says that
// was the wrong statistic. Two of the twenty entries hold 45% of the section
// (the surfacing caption at 717 words, closing state at 344; the median is 72).
// So a mean tracks those two and almost nothing else, and one rewrite of the
// caption moved it 12% in a day. A section total catches the same failure, has
// no statistic to misreport, and does not turn one entry's edit into a gate.
const SECTION_LIMIT = 2600;      // 2,342w when set, over 20 rules

test('the primitives section stays under its own budget', () => {
  const surfacing = read('docs/SURFACING.md');
  const section = surfacing
    .split('## Surfacing primitives')[1]?.split('## The surfacing course')[0];
  assert.ok(section, 'the primitives section is where the parser expects it');

  const rules = (section.match(/^\* \*\*/gm) || []).length;
  assert.ok(rules > 10, 'the section parses into primitives');

  const n = words(section);
  assert.ok(n < SECTION_LIMIT,
    `the primitives section is ${n} words across ${rules} rules, over its ` +
    `${SECTION_LIMIT}-word budget. Adding a rule is the section doing its job ` +
    'and costs about a median entry (72 words); explaining one is the failure ' +
    'this catches. Each entry states the rule, then Form where there is a ' +
    'syntax, then Boundary where deleting the clause would change how the rule ' +
    'applies at an edge. Provenance goes to the PR body, which already carries it.');
});

// The parse point the injector depends on. inject-conventions.sh splits here to
// fit the session-start channel, so a rename empties half the payload; it fails
// open to the whole file, which is over the limit and therefore truncated.
test('the course heading the injector splits on is still there', () => {
  assert.match(read('docs/SURFACING.md'), /^## The surfacing course$/m,
    'inject-conventions.sh splits the injected payload on this heading');
});
