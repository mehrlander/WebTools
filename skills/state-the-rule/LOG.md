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
