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

## 2026-08-29, held against doc-audit's segmenter, and merged into its machine

**Two segmenters over the same file type, and each found a defect in the other.**
`mehrlander/home`'s `projects/doc-audit/audit.py` has cut markdown into
span-anchored paragraph units since June, three months before `segment.py` was
written, and neither knew. Rolling `segment.py` up by block and applying
`audit.py`'s own filters reproduces **137 of 138** paragraph units across four
documents: `docs/CONVENTIONS.md` 31/31, `home/CLAUDE.md` 29/29,
`doc-audit/README.md` 18/18, all with zero start-offset disagreements. So the
grains were never incompatible. They are two settings of the dial that
doc-audit's own synthesis declared in June, and `audit.py`'s docstring already
called its own grain a compromise: "honest about working on the typographic
paragraph, not the rhetorical move."

**The fence defect, which shipped.** `segment.py` recognised a fence only when it
opened a block. Two shapes slipped through: a fence opened inside a list item,
and a fence whose body holds a blank line, which the block splitter shreds into
pieces carrying no marker at all. Four blocks of `docs/SURFACING.md` hit it, and
the guide-PR template's placeholder lines were annotated as though they were
rules in the shipped run. Fixed by masking fenced regions before blocks are cut,
which is what `audit.py` always did. Pinned by a test that fails on the old
segmenter.

**And the defect on the other side.** `audit.py` removes a fence and *then*
splits on blank lines, so a removed fence can leave a blank line where the source
had none. On `SURFACING.md` that cut the "Toss a live view" bullet into two units
at spans 2575..3340 and 3626..3940. One list item, no paragraph break in the
source, two units scored independently. That is the whole of the remaining
disagreement, and it is a paragraph boundary the document does not contain.

**The label column is data, and now that is shown rather than assumed.**
`check.py` branches only on `verdict`; it never reads `label`. Run with
doc-audit's theme-and-fit vocabulary (`core` / `supporting` / `off`) substituted
and no code changed, it reports honestly on a clean cut (7/7 honoured, 29%) and
names the breach under the foreign vocabulary when a `KEEP` is removed
(`8w [core] Bloat often is not fluff, it is drift.`). So the receipt was already
the family's shared receipt.

**`seams.py` was designed in June, in another repo, and built here in August
without knowing.** doc-audit's `2026-06-10-arriving-together-as-flow-audit.md`
specifies step 7b, a flow walk over the edit seams, and gives the same reason for
the same scope limit: "Seams only, so the burden stays proportional to the edit."
It was run by hand and never mechanized. That is what the split costs, and it is
why the machine now has one owner: doc-audit states it, this skill states one
question over it.

## 2026-08-30 — the grain was a starting guess, and now it moves

**Ten fused units, split, with the bar stated: split where the two halves take
DIFFERENT labels.** 36 of `docs/CONVENTIONS.md`'s 69 prose units carry a clause
boundary, which is what the earlier measurement counted; most of those are two
rules joined by a semicolon, and separating them changes nothing the annotation
says about either. Grain for its own sake is not a finding. The ten that
qualified were all one shape: a rule with its reason fused on, seven of them
labelled `WHY-OP` whole (so the rule half was reading as a reason) and three
labelled `WHAT` whole (so the reason half was reading as a rule).

**What it moved.** 81 units to 91. `explanation` went from 1% of the document's
words to 3.4%, `hinge` from 18% to 15.3%, `declaration` unchanged at 65%. The
document was not more explanatory than it looked; two chunks of pure motivation
were hidden inside declaration units and seven operative reasons were inflating
the hinge share by carrying their rules with them.

**A rebuild is a reset, not a refresh, and the builder now says so.**
`units.jsonl` and `labels.tsv` record steps 1 and 2. Once a patch has moved the
grain, the standoff holds units those inputs never had, and re-running
`audit-payload.py standoff` would silently undo the pass. `from` is the tell, so
the builder reads it and refuses without `--reset`. Nothing had gone wrong yet;
the trap was one command away and invisible.

**The two implementations were diffed on real work rather than a fixture.** The
same 20-operation patch through `ops.py` and through `lib/kits/standoff.js`
produced byte-identical output, 91 units, field order included.

## 2026-09-01 — the second axis, and the label that was a verdict

**A removal mechanism was asked for, and the only axis on screen was the wrong
one.** The page painted `vocabulary` and nothing else, so "mark this as clutter"
arrived as `CUT`, an eighth label. It worked and it was a category error: the
label axis says what a unit **is**, and whether a unit belongs is a disposition.
The tell was that nothing else on the edit axis could follow it. Once one verdict
sits among the labels a reader expects `MOVE` beside it, and there is nowhere to
put one.

**The objection to a second axis was real and it was answered, not overruled.**
This skill held that the standoff carries the label and not the verdict, because
a second vocabulary would arrive **closed** inside an artifact whose whole
generality is that its vocabulary is declared. The criterion in that sentence is
`closed`, not `second`. Declaring `verdicts` beside `vocabulary` satisfies it,
and `ops.py` and `lib/kits/standoff.js` now check a unit's verdict against the
declared list exactly as they check its label.

**The waiver is the part worth keeping.** An annotation with no `verdicts` block
is one-axis, not invalid: holding every prior standoff to a list it never
declared would fail each of its units at once. Both checkers skip the verdict
where none is declared, and a test holds that skip so it cannot be tidied away.

**What the tests caught that the pass did not.** Two things, both invisible in
the render. The stored run's `vocabulary` still declared `CUT` after every unit
had left it, because the in-place patch preserved the block it was not asked to
touch. And the two palettes shared three rgb values, so `NAV` and `MOVE` were
one swatch in the Standoff table, the single view that shows a label chip and a
verdict chip side by side. Neither is visible under one lens at a time, which is
why the gate is on the palettes rather than on a screenshot.

**Text decoration was the free channel.** The tint, the ticks and the opacity
are all spent on the active lens; `text-decoration` was not, which is why the
verdict could arrive beside the label rather than displacing it. A `DROP` is
struck through under either lens.

## 2026-09-01 — `1. ` is not a sentence, and the render was the only thing that said so

**The fifth guard was missing.** `GUARD` protected `e.g.`, `i.e.`, `etc.`, `vs.`
and a decimal point, and the decimal one needs a digit on **both** sides, so a
list marker slipped through: `1. ` is a digit, a period and a space, which the
sentence splitter read as a sentence ending after "1". Every numbered item became
two units, one holding the marker and one holding the item.

**Nothing in the annotation was wrong, which is why nothing caught it.** The
units tiled, every span resolved, every label was declared, and a bare `1.` got
labelled `META` because that is the best a labeller can do with it. The check
suite passed on all of it. The defect existed only in the render: a marker alone
is an `<ol>` with an empty `<li>` and an item without its marker is a bare
paragraph, so a three-step list drew as three empty numbers over three
unindented sentences. It was reported from a screenshot.

**The stored run was repaired with the machine's own operations**, three merges
and three relabels through `ops.py`, rather than by re-segmenting. Re-segmenting
would have been correct and would have discarded ten patched units and every
label; a patch keeps both and records the judgment. `labels.tsv` and
`units.jsonl` were then regenerated from the result, since both describe the
current grain.

**A second, smaller thing came out of the same spot.** A sentence taken from
INSIDE a list item is a legitimate unit that also does not render as one: the
marker went to the first sentence, so every later sentence hung unindented under
the item it belongs to. The page now wraps such a continuation in a marker-less
list, which gives it the item's indent by construction rather than by a padding
constant guessed to match the prose styles.

**The general shape, since the segmenter will meet it again: a grain defect can
be invisible to every invariant and visible only when rendered.** The invariants
are about the partition; whether a unit can stand alone is a different question,
and the only two things asking it are `balanced()` and a person looking at the
page.

**Wrong 2026-09-03 (web-tools #569) → the 2026-09-03 entry below:** `balanced()`
no longer exists. The page renders the document once and paints the units over
its text nodes, so a unit that is not a whole markdown construct renders
correctly and nothing has to ask whether it can stand alone. A person looking at
the page is the only thing asking now, and the question it answers is a
different one.

## 2026-09-03 — the three rejoined items wanted splitting after all

**The repair left a question nobody asked.** The 2026-09-01 merges put each
numbered item back together and stopped there; step 1 of the pass would then
have asked whether the rejoined unit wants splitting, and nothing did. Tracker
task `audit-repaired-units-for-splitting-e6jfgs` is that question, filed after it
had been carried in two PR bodies.

**All three met the bar, and the run's own precedent is what settled it.** The
bar is "split where the two halves would take different labels", and
`CONVENTIONS.md` already carries three pairs of exactly this shape: 009/010,
021/022 and 066/067 each put a rule in `WHAT` and the action it licenses in
`HOW`. `1. **Is this a fact the app derives?** Delete it and link the view.` is
that shape a fourth time. The three splits and three relabels went through
`ops.py`, so `conven-058a`/`conven-058b` record how the grain got here.

**The counter-argument, recorded because it is not silly.** Each half depends on
the other: "Delete it and link the view" is not a rule you can apply without its
condition. That did not disqualify 021/022 or 023a/023b either, both of whose
second halves need the first for their referent, so dependency between halves is
not what the bar measures.

**And the split found a hole in the page.** A `split` hands the separator to one
side, so a unit can end on a space, and a space at a line break has a zero-width
box and a `Range` over it no box at all. Both of `rectAt`'s measurements came
back empty and `conven-063a`'s end edge reported itself unpinnable: pinned at
900px, not at 390px, on the same annotation. The fallback for a boundary in
markup was already there and already right, so it now runs for this case too.
The hole was in the page, not in the split: `openSplit`'s own regex takes the
whitespace with the first half, so the page could always produce this and the
payload had simply never carried one.

## 2026-09-05, an edited document under a stored run (web-tools, the followups after #600)

**A document edit is a reset of its run, and the reset is reproducible.** The
digest gate on `docs/CONVENTIONS.md` fired on an ordinary edit (two settings
folded in, one paragraph moved out). The sanctioned route is re-segment and
re-label, which discards the 2026-08-30 grain patch. Matching each new unit's
text against the old standoff carried 43 of 57 labels; the four seams that
pass had split still joined cleanly, so a patch of four splits re-cut them at
the same offsets; ten units were new and labelled by hand; one new sentence
was split where its halves take different labels. The whole rebuild is one
script, so the next edit costs a run of it and a look at what it could not
match.

**Offsets are code points, and the gates that read them raw find out the day
the document gains its first astral character.** The moved sentence carried
🥏, the one such character CONVENTIONS.md has ever held, and every unit after
it reported a one-unit gap in `audit-standoff.test.mjs` and the kit's
invariant check, both of which slice in UTF-16 without `adopt`. Fixed in the
document (the toss named in words), not in the gates: SURFACING.md carries 49
of these and its run is not gated the same way, so the gates were never wrong
about the file they read. The trap is worth knowing before a glyph is moved
into an annotated document.
