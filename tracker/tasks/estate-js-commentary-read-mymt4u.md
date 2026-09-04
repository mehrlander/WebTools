---
id: estate-js-commentary-read-mymt4u
title: Read estate.js's commentary the way show-repo.html's was read
status: backlog
opened: 2026-08-10
size: M
---
# Read estate.js's commentary the way show-repo.html's was read

`lib/alpineComponents/estate.js` is the second-heaviest commentary in the estate
after `app/index.html`, and the only other file large enough to be hiding a
document rather than carrying rationale. Measured 2026-09-04: 25,643 comment
words in 566 blocks, 2,523 of its 8,451 lines. (Filing recorded 8,783 words in
194 blocks by a different measure, so read the two as one ranking rather than one
series.)

PR #403 split show-repo's 5,962-word block (that file is `app/index.html` now;
the title keeps its old name because that is what was read): its contract half restated
`docs/show-repo.md` and went, its rationale half moved to the code each passage
explains. The same question is open here, and unanswered: how much of estate.js's
commentary is a second telling of `docs/show-repo.md`'s estate sections, and how
much is rationale sitting where it belongs?

**Do not answer it with a token comparison.** That is the whole lesson of #403
and it is recorded in [`docs/text-content.md`](../../docs/text-content.md): the
comparison found show-repo's coverage gap in minutes and would have authorized
deleting 2,760 words of unique judgment, because the judgments worth keeping are
the ones phrased without an identifier to match on. Use it to rank what to read,
then read.

## Done when
Either the file's commentary is confirmed to be rationale in place, said in one
line in the task's log and nowhere else, or the contract half is retired and the
rest sits at its code, as in #403.

## Progress log
- 2026-08-10: Filed out of the text-content pass. The reason not to trust a
  token comparison is in `docs/text-content.md`.
- 2026-09-04: The measurement command in this task no longer exists.
  `scripts/text-census.py` was deleted and has no successor:
  `scripts/text-carriers.py`, which `docs/text-content.md` was rewritten around,
  answers a different question (prose fields inside data carriers, not comment
  mass inside code). So the first move is a count, by whatever means, and the
  figures above are one taken during this refinement pass with a line-based
  scan. Nothing else about the task changes: the ranking holds, and the point
  stands that the reading, not the count, is the work.
