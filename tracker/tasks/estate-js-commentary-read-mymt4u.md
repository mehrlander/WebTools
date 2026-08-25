---
id: estate-js-commentary-read-mymt4u
title: Read estate.js's commentary the way show-repo.html's was read
status: backlog
opened: 2026-08-10
size: M
---
# Read estate.js's commentary the way show-repo.html's was read

`lib/alpineComponents/estate.js` carries 8,783 words of comments in 194 blocks,
21% of its bytes. It is the second-heaviest commentary in the estate after
`app/index.html`, and the only other file large enough to be
hiding a document rather than carrying rationale.

PR #403 split show-repo's 5,962-word block: its contract half restated
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
- 2026-08-10: Filed out of the text-content pass. The measurement is
  `python3 scripts/text-census.py . lib/alpineComponents/estate.js --blocks`;
  the method and the reason not to trust the cheap version are in
  `docs/text-content.md`.
