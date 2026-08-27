# What running this has taught

One dated entry per surprise. A lesson that recurs a third time earns a change
to `SKILL.md` or the tooling; until then it lives here.

## 2026-08-26, first three runs (web-tools #509)

**The floor is not a floor.** The annotation predicts what removal alone yields.
A rewrite also compresses the units marked `KEEP`, which a sentence-level pass
cannot see: +12 points over floor on the loosely written primitives, −7 on the
already-tight conventions. Predicted-minus-achieved reads as a **density
signal**, and the two want different treatment.

**A free-hand rewrite beat the instrument, partly by cutting what it protects.**
19 pointers were deleted, almost exactly the `NAV` mass the annotation had
marked `KEEP`. The annotation flagged them, the pass skipped the annotation, and
only the reference check found it.

**Stage one of the contract check is a candidate generator.** 20 breaches
flagged, 14 were reworded survivors. A distinctive-token probe on each candidate
took the list to the 6 that were real.

**Not every lost reference is a defect.** A reference living only inside a unit
the annotation sent away goes with it legitimately. Without that rule the check
fires on correct work, and a check that does that gets ignored.

**References compare by basename.** `surface.md` and `docs/envelopes/surface.md`
name one destination; a path made more specific is not a loss.

**A section must be sliced on both sides.** Comparing a section against a whole
file inverted the size figure from 45% to −16% and would have hidden any real
loss inside the noise.

**A fix applied downstream of its source gets reverted.** The full-path repair
lived only in the repo file, so re-splicing from the working copy undid it and
orphaned two docs a second time. Both times `npm run docs-reach` caught what
`check.py` passed.

**Verify a surprising check result before theorising about the tool.** A
verbatim sentence read as missing; the whitespace normalisation written to fix
it changed nothing, because the sentence really was gone.

**Upstream can move under you.** Two of twenty primitives were rewritten on main
mid-branch. Newer text is authoritative: re-apply the compression to it rather
than merging with it, and keep fresh deliberate work whole even at the cost of
the headline number.

## 2026-08-26, giving the checks a test (web-tools #516)

**The registry enforced this skill's own discipline on it.** `docs/tests.csv`
caps `protects` at 320 characters and says to name what breaks in one sentence,
letting `assertion_names` carry the list. The first draft was a 430-character
inventory and was rejected. The estate had already arrived at declaration over
enumeration for a different artifact, which is worth knowing before proposing it
as a new idea anywhere.

**Every rule worth pinning was one that had been got wrong.** The five
assertions map one-to-one onto entries above: a vanished `KEEP`, a surviving
`DROP`, an excused reference, a real lost reference, a path made more specific.
Nothing was invented to reach a count.

**Segmentation determinism was assumed for three runs and never checked.** It
now is. Had it drifted, every stored annotation would have orphaned at once and
the contract would have been worthless without saying so.

**Regenerate last, not first.** The suite passed locally and CI failed on the
same commit: `docs-reach` had been run, and then `LOG.md` was edited. Mentioning
`docs/tests.csv` in this file makes a skill name that document, which flips its
reach from `app` to `skill`. Third ordering mistake of the same family in one
session (the earlier two reverted a fix by re-splicing from a stale source), so
by this log's own recurrence rule it is now a step in the skill: **run every
generator after the last edit, including edits to this file.**

## 2026-08-26, run on its own SKILL.md (web-tools #516)

**84% `KEEP`, the highest of four runs, and a 9% floor.** A document written to
this discipline has little surplus, which is the expected result and the first
confirmation that the Boundaries stop-signal is calibrated somewhere sensible.

**The pass still found four defects, so a high `KEEP` is not a clean bill.** On
an already-tight document it yields corrections rather than compression: net 2%
after adding a clarification the run showed was needed, against roughly 9% of
removal.

**It carried copies of its own records.** The `+12 / −7` measurement duplicated
`runs.csv` and the lost-pointer anecdote duplicated `LOG.md`. A skill that
maintains records is a skill that can quote them back at itself.

**A within-file duplicate, in the document that teaches looking for them.** The
Files section and the Boundaries section both named the test file and what it
pins. Invisible to a cross-file scanner by construction, and it survived being
written, reviewed and shipped.

**The check caught a botched edit batch.** A Python `assert` fired before any
replacement ran, so four of seven edits silently never applied while the script
reported success on the other three. `not-removed 1` was the only signal that
anything was wrong. Verifying against the annotation is worth doing even when
you believe you just made the change.

**`reanchor.py` now states its condition instead of shipping uncalled.** Four
runs have consumed their annotation rather than storing it, so nothing has
needed it. It is for an annotation that must outlive edits to its source, and
the Files section says so rather than listing it as though a step used it.

## 2026-08-26, run on docs/TRACKER.md (web-tools #516)

**229 units, the largest pass so far.** 73% `KEEP`, floor 21%, achieved 19%.
Contract clean: 182/182 `KEEP` honoured, 0 breaches, 0 references lost.

**A sample drawn from the worst section over-predicts the document.** The first
experiment sampled this file's board section and measured 28% cleanly
recoverable. The whole file is 15%. The board section was the densest patch of
provenance in it, and reading a document's yield off its worst region is
optimistic by roughly half. Sample from more than one region, or say the figure
is a ceiling.

**Removal by character span, deleting from the end backwards, scales.** 34 units
came out with no offset drift. Earlier runs used string substitution, which fails
on line-wrap differences and had already cost two rounds of re-matching. Spans are
the better tool once a pass is past about fifty removals.

**Removing a unit can orphan its neighbour, and no check sees it.** Deleting the
retired-`next`-tag provenance left "Where a task's next step belongs is the
Progress log" answering a question nothing had asked. The neighbour survived, so
the contract counted it honoured. This is a real gap: the checks verify that
units are present, never that the prose around a removal still reads. Only a
human pass over the seams catches it, and this run needed one fix out of 34
removals.

**The density signal holds on a fourth document.** Only the 53%-`KEEP` document
beat its floor (+12). The three at 72% or above all missed it (−7, −7, −2).
Predicted-minus-achieved is tracking how much slack the prose carries, not noise.

## 2026-08-26, run on the rest of docs/SURFACING.md (web-tools #516)

**A unit's span begins at the whitespace before it, so a rewrite must carry that
whitespace back.** Replacing eleven spans with text that started at the first
letter glued each rewrite onto the sentence before it: `where no Files tab
exists.Bodies written before 2026-08-08`. Six of eleven were damaged. The
contract check passed all of it, because every `KEEP` was still present and
every `DROP` still gone, which is exactly what it was asked. `grep -n
'[a-z]\.[A-Z]'` found all six in one pass and is now the cheap post-edit sweep.
The applier takes the leading whitespace from the original span.

**The section slice was a hardcoded heading, and the second shape broke it.**
`check.py` sliced to `## Surfacing primitives` by name, so a pass over
everything *but* that section had no way to say so. It now takes `--section` or
`--not-section`. Two things fell out of writing the test: the two are not a
partition, since the heading and the `---` that ends the section belong to
neither; and the slice reproduced the annotated range to the word (1,978 either
way), which is a free check that the range being measured is the range that was
read.

**The seam defect from TRACKER.md recurred, and reading for it worked.** Removing
the four bullets that argued against a merge guide orphaned the sentence after
them: "The general rule this is a case of" pointed at an argument no longer
there. Caught by hand, not by a check, on the second run of deliberately reading
every seam. Restored as "**The general rule:** do not commit what a live read
already answers." That is twice; a third earns a check, if one can be built at
all, since the surviving neighbour is by definition honoured.

**A fifth document, and the density signal holds.** 76% `KEEP`, floor 19%,
achieved 23% (+4). It is the second document to beat its floor and it sits
between the two groups on `KEEP` share, which is where the signal predicted it.

**The ordering rule applies to the generators themselves.** Step 7 was followed
and the suite still failed by nine words: `tests-index` writes `docs/tests.csv`,
which is a row the docs legs measure, so running it last left the registry a
restamp behind. Fourth time this family has bitten, and the fix is one clause,
not a new step: a generator that writes a governed file runs before one that
measures it.

## 2026-08-27, run on home/CLAUDE.md, and the seam check (web-tools #516)

**The segmenter assumed a blank line under every heading, and a second repo did
not.** home's `CLAUDE.md` puts bullet lists directly under `###` headings, so
`re.match(r'\s*#{1,6} ', block)` classified whole 700-word sections as one
`heading` unit. 140 units for 6,895 words, which is not an annotation. A heading
now owns its own line and the rest of its block is segmented on its own terms,
and a run of list items with no blank lines between them splits per item: 355
units for the same words. This was the first run outside web-tools and the
defect was in the first command.

**The seam defect earned its check on the third recurrence, and the check found
six of seven.** Built before fixing anything, so it got an honest test.
`seams.py` reports a neighbour left pointing back at nothing, a heading that
swallowed the line under it, a phrase the rewrite now says twice, and an indent
lost at a join. It caught all of those; it missed one indent case, and three of
its nine reports were fine. Two of its four checks were written wrong the first
time: one read a field that does not exist in a unit, so it could never fire, and
one compared a `REWRITE`'s *original* text against its neighbours when the
symptom is in the output. Dead code that cannot fire is worse than no check.

**A check that ran against the wrong file printed a clean result and said
nothing.** Twice, because the working directory had changed and `CLAUDE.md` was
relative. `check.py` and `seams.py` now print `READ <orig> -> <new>` on every run.

**The seam pass can legitimately absorb a `KEEP`, and the contract cannot say
so.** Two units were folded into rewrites while fixing seams, and the contract
reported them as breaches. Amending the annotation to `REWRITE` is the honest
move and is now in step 6; silently letting the contract pass would have made the
contract worth less than the trouble of writing it.

**The loosest document yet, and a duplicate hiding in plain sight.** 65% `KEEP`,
floor 35%, achieved 38%. Five sentences restated the portable PR and merge rules
that arrive injected into the same context window, so both copies were loaded on
every turn. And "Six exist" named six of eight projects, omitting one the same
file referenced two sections later: an enumeration of what the tree already
derives, wrong at the moment it was read.

**Growth, measured.** home's `data/doc-growth.json` (landed the same day) puts
`CLAUDE.md` at 316 words in March and 6,776 in August, across 109 edits, with not
one negative weekly delta in 23 weeks. That is the phenomenon this skill exists
for, and it is the first time the estate has had a number for it.

## 2026-08-27, re-running CONVENTIONS.md without the fourth question

**The rule that protected reasons was not what was holding this document back.**
`docs/CONVENTIONS.md` carried "Is this a reason somebody chose something? Keep
it," and it was the worst of the six runs: 13% achieved against a 20% floor. The
obvious hypothesis was that the rule was protecting the surplus in its own file.
Re-run with the rule gone, it annotates at **93% `KEEP`, floor 1%, achieved 6%**,
the tightest document the method has measured, tighter than its own `SKILL.md`.
Six trims, all of them a reason fused to a rule the rule did not need: a cost
comparison after "do not ask," a "so the set is auditable" after a shape that
already showed it, a lead-in that restated its own paragraph.

So the 13% was honest, and the density signal was right about it: a 72%-`KEEP`
document misses its floor because there is little to take, not because a rule
forbade taking it. The fourth question was doing its damage in the documents
that cited it, not in the one that stated it.

**A near-100% `KEEP` is the signal to stop, and this is what it looks like from
just inside.** The boundary in the skill says so; this run is the first to test
it rather than assert it. The right reading is that `CONVENTIONS.md` is finished
as a compression target, and the next thing it needs is a reader, not a pass.
