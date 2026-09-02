---
id: audit-repaired-units-for-splitting-e6jfgs
title: Audit the three repaired units in the conventions run for splitting
status: backlog
opened: 2026-09-02
size: XS
---
# Audit the three repaired units in the conventions run for splitting

On 2026-09-01 the `2026-08-29-conventions` run was repaired with three merges
and three relabels through `ops.py`, after the segmenter's missing decimal guard
read `1. ` as a sentence ending and cut every numbered item in two
(`skills/state-the-rule/LOG.md`). The merges put each item back together. What
nobody then did was ask the question step 1 of the pass would have asked of the
rejoined unit: does it want splitting?

The three are `conven-058`, `conven-060` and `conven-063`, the numbered items
under "Prose that describes state is unimplemented" in `docs/CONVENTIONS.md`.
Each now reads as a question fused to an instruction, for example
"**Is this a fact the app derives?** Delete it and link the view."

Apply the skill's own bar rather than splitting on sight: split where the two
halves would take different labels, since a boundary whose halves are both
`WHAT` separates two rules without changing what the annotation says about
either. A recorded "checked, does not meet the bar" is a perfectly good outcome
and is most of what this task is for.

## Done when
Each of the three has been read against the splitting bar, and the run either
carries the split (through `ops.py`, so the uids record it) or a note saying it
was checked and did not meet it.

## Progress log
- 2026-09-02: Filed. Carried in the bodies of #558 and #569 rather than being
  fixed in either, which is the second carry and the reason it is a task now.
