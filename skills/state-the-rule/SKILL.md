---
name: state-the-rule
description: Separate a governing document's authoritative rules from the explanation around them, so what a reader must obey is stated directly and the intention, history and evidence are preserved elsewhere. Use when a CLAUDE.md, a conventions file, a SKILL.md or any executed instruction set has grown past what it declares; or when the user asks to cut, tighten or compress one. It asks of each unit whether it is binding; whether a document repeats itself or drifts off its theme is a different question over the same units, answered by doc-audit's instruments. Runs as an annotated pass with mechanical checks, so a cut can be shown not to have lost a rule. Not for prose written to be read straight through, which is succinct-text's job.
---

# State the rule

## What this is for

An **executed document** is one an agent loads and acts on without being asked:
a `CLAUDE.md`, an injected conventions file, a `SKILL.md`. Every word in it is a
runtime cost paid on every turn, so cut harder here than in a document someone
chooses to open.

The method separates two things that fuse as a document grows:

- A **declaration** is what the reader must do, must not do, or may rely on.
- An **explanation** is why the declaration exists, where it came from, or what
  it was measured against.

**Favor the mechanical: state the authoritative rule as directly as practical,
so intention, history, and evidence can be separated from it.** Explanation is
not waste. It is not the rule.

## One question over a shared machine

Four moves: inventory the document into span-anchored units, annotate each one,
verify the annotation was honoured, read the seams. Three other questions run the
same four moves over the same units, and differ only in what the walk asks and
what counts as an alarm: `succinct-text` (did the cut lose anything),
`source-anchoring` (does each claim sit on a chain to a source), `outlining`
(does the reported structure cover the whole).

**The machine, the grain doctrine, and the register of questions belong to
doc-audit** (`mehrlander/home`, `projects/doc-audit/`, stated in
`2026-06-23-one-machine-three-questions.md`). This file states one question, its
labels, and its alarm, and nothing about the machine. The label column is data:
`check.py` never branches on it, so a question supplies its own vocabulary and
the checker does not change.

## The pass

Run the seven steps in order. Steps 1, 6 and 7 are mechanical or near-mechanical;
the rest are judgment.

### 1. Segment

```bash
python3 segment.py <file> <first-line> <last-line> > units.jsonl
```

Each unit carries `uid`, character `start`/`end`, `kind`, `words`, `text`. The
source is never modified: annotations live beside it and are addressed by span.

### 2. Classify

One label per unit, in a TSV keyed by `uid`.

| Label | Is | Side |
| --- | --- | --- |
| `WHAT` | a rule, a fact of the system, a value it may hold | declaration |
| `HOW` | syntax, a procedure, an invocation | declaration |
| `WHY-OP` | a reason that changes how the rule applies at a boundary | **see below** |
| `WHY-MOT` | a reason that makes the rule feel right but changes nothing | explanation |
| `PROV` | when it changed, what it replaced, what failed | explanation |
| `EVID` | a measurement, a probe, an observation | explanation |
| `NAV` | a pointer to the document or gate that owns something | apparatus |
| `META` | a statement about this document | apparatus |

**An operative reason nearly always contains a criterion**: a condition, a threshold, a named exception. Lift the
criterion into the declaration and the remainder becomes `WHY-MOT`. Where no
criterion can be extracted, keep the clause: it is part of the rule.

*Test:* would deleting this change how someone applies the rule at a boundary
case? Yes means it is the rule. No means it is explanation.

### 3. Dispose

`KEEP` · `REWRITE` (a removable clause is fused inside) · `MOVE` (belongs to a
named owner) · `DROP`.

**The annotation is a contract.** Every `KEEP` must appear in the result.

### 4. Rewrite toward the declaration

Each entry: the rule, then its form where there is a syntax, then its boundary
where a clause changes application at an edge.

**Expect to beat the removal floor, and do not expect it.** `KEEP` units
compress too, and a sentence-level pass cannot see that. Per-run figures are in `runs.csv`.

### 5. Route what leaves

| Class | Destination |
| --- | --- |
| `PROV` | the PR body or commit that carries the change |
| `EVID` | the measured document that owns the probe |
| an enumerated vocabulary | the vocabulary registry |
| coherent depth that names cleanly | its own linked document |
| `WHY-MOT` | deleted; git holds it |

**Never route to a shadow file.** An annotation anchors to text that exists, so a
note about removed prose anchors to the rule it justified, which is the sentence
most likely to be edited next.

### 6. Check

```bash
python3 check.py units.jsonl annotations.tsv <original> <rewrite> \
  [--section <heading> | --not-section <heading>]
```

Reports `KEEP` units that vanished, `DROP`/`MOVE` units that survived, lost
references, and the size delta.

**Slice both sides when the pass covered part of a file.** Name the annotated
section with `--section`, or the one it left alone with `--not-section`. Without
it a section is measured against the whole document and the size figure inverts.
The two are not a partition: the heading and the rule that ends it fall outside
both.

**Stage one over-reports.** Roughly 70% of candidate breaches on loose prose are
reworded survivors. Probe each candidate for its distinctive content before
calling it a loss.

**Then read the seams**, which is the other half of step 6:

```bash
python3 seams.py units.jsonl annotations.tsv <original> <rewrite>
```

Removing a unit can break the unit next to it, and that neighbour survived, so
the contract counts it honoured. `seams.py` reports the four shapes this has
taken: a neighbour left pointing back at nothing, a heading that swallowed the
line under it, a phrase the rewrite now says twice, and an indent lost at a join.
Advisory, and roughly a third of what it reports is fine.

**The seam pass may absorb a `KEEP`.** When it does, amend the annotation to
`REWRITE` and say why. Do not leave the contract to pass quietly on a unit you
decided to remove after signing it.

**The check does not replace the repo's own gates.** Run them too: a lost pointer
has twice passed `check.py` and been caught by the repo's own derivation.

### 7. Record

Append one row to `runs.csv` and any surprise to `LOG.md`, then **run the repo's
generators after that last edit, not before it**. A record that names a governed
file changes that file's derived state, so recording the run is itself an edit
the generators have to see. The same holds among the generators: one that writes
a governed file runs before one that measures it.

**A lesson that recurs a third time earns a change to this skill or its
tooling.**

## Boundaries

- Only for executed documents. A document written to be read straight through is
  `succinct-text`'s job, and its altitude and extraction moves apply there.
- **Binding is the only question this pass asks.** Redundancy, drift, and a term
  used before its definition are doc-audit's rungs (`audit.py`) over the same
  units, and a high `KEEP` share says nothing about them: this skill's own
  `SKILL.md` shipped a within-file duplicate that a redundancy rung would have
  nominated. Run those too before calling a document finished.
- Do not run it on a record. A dated observation, a lab notebook, a measured
  document: provenance and evidence are the subject there, not the surplus.
  Annotate one to find out; a result near 100% `KEEP` is the signal to stop.
- Do not fold a doctrine change into a compression. Rewriting what a rule *says*
  is a separate decision from stating it more directly.
- The tooling's checks are tested (`tools/test/state-the-rule.test.mjs`, in the
  hub only). The judgment steps are not testable and every figure in `runs.csv`
  was read by hand.

## Files

`segment.py` · `check.py` · `seams.py` · `runs.csv` · `LOG.md`

`reanchor.py` is for the case this pass does not have: an annotation that must
outlive edits to its source rather than being consumed by one run. Offsets are a
hint; the quote selector is the anchor. Seven runs have not needed it.
