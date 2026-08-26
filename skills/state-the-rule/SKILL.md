---
name: state-the-rule
description: Separate a governing document's authoritative rules from the explanation around them, so what a reader must obey is stated directly and the intention, history and evidence are preserved elsewhere. Use when a CLAUDE.md, a conventions file, a SKILL.md or any executed instruction set has grown past what it declares; when the user asks to cut, tighten, compress or audit such a document; or when they say a document is bloated, over-explained, or repeats itself. Runs as an annotated pass with mechanical checks, so a cut can be shown not to have lost a rule. Not for prose written to be read straight through, which is succinct-text's job.
---

# State the rule

## What this is for

An **executed document** is one an agent loads and acts on without being asked:
a `CLAUDE.md`, an injected conventions file, a `SKILL.md`. Every word in it is a
runtime cost paid on every turn, and every word of justification competes with
the rule it justifies.

The method separates two things that fuse as a document grows:

- A **declaration** is what the reader must do, must not do, or may rely on.
- An **explanation** is why the declaration exists, where it came from, or what
  it was measured against.

**Favor the mechanical: state the authoritative rule as directly as practical,
so intention, history, and evidence can be separated from it.** Explanation is
not waste. It is not the rule.

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

**`WHY-OP` is the one that pays attention.** An operative reason nearly always
contains a **criterion**: a condition, a threshold, a named exception. Lift the
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
compress too, and a sentence-level pass cannot see that. Measured: +12 points
over floor on loose prose, −7 on prose already tight.

### 5. Route what leaves

| Class | Destination |
| --- | --- |
| `PROV` | the PR body or commit that carries the change |
| `EVID` | the measured document that owns the probe |
| an enumerated vocabulary | the vocabulary registry |
| coherent depth that names cleanly | its own linked document |
| `WHY-MOT` | deleted; git holds it |

**Never route to a shadow file.** An annotation anchors to text that exists;
removed prose has no span, and a note about it anchors to the rule it justified,
which is the sentence most likely to be edited next.

### 6. Check

```bash
python3 check.py units.jsonl annotations.tsv <original> <rewrite>
```

Reports `KEEP` units that vanished, `DROP`/`MOVE` units that survived, lost
references, and the size delta.

**Stage one over-reports.** Roughly 70% of candidate breaches on loose prose are
reworded survivors. Probe each candidate for its distinctive content before
calling it a loss.

**The check does not replace the repo's own gates.** Run them too. Both times a
pointer was lost in a way `check.py` passed, `npm run docs-reach` caught it.

### 7. Record

Append one row to `runs.csv` and any surprise to `LOG.md`.

**A lesson that recurs a third time earns a change to this skill or its
tooling.** That is the whole improvement mechanism, and it is the same
recurrence rule the estate's snags log runs on.

## Boundaries

- Only for executed documents. A document written to be read straight through is
  `succinct-text`'s job, and its altitude and extraction moves apply there.
- Do not run it on a record. A dated observation, a lab notebook, a measured
  document: provenance and evidence are the subject there, not the surplus.
  Annotate one to find out; a result near 100% `KEEP` is the signal to stop.
- Do not fold a doctrine change into a compression. Rewriting what a rule *says*
  is a separate decision from stating it more directly.
- The tooling's checks are tested (`tools/test/state-the-rule.test.mjs`, in the
  hub only). The judgment steps are not testable and every figure in `runs.csv`
  was read by hand.

## Files

`segment.py` · `reanchor.py` (survive an edit; offsets are a hint, the quote
selector is the anchor) · `check.py` · `runs.csv` · `LOG.md`

In the hub, `tools/test/state-the-rule.test.mjs` pins the five rules the checks
learned by getting them wrong.
