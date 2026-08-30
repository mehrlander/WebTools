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

### 7. Record, and keep the annotation

A run is a directory, `runs/<date>-<patient>/`, holding what it consumed beside
what it produced:

| file | is |
| --- | --- |
| `units.jsonl` | step 1's segmentation |
| `labels.tsv` | step 2's classification, `uid` / `label` / `verdict` |
| `standoff.json` | the annotation: one label per unit, from a declared vocabulary |

**The standoff carries the label, not the verdict.** The label says what a unit
*is* and is the axis any question over this machine supplies; the verdict is
what *this* pass decided to do about it, and `check.py` reads it from
`labels.tsv`. Putting both in the standoff put a second closed vocabulary inside
the artifact whose whole generality is that its vocabulary is declared.

**The standoff does not contain the document.** It names its target and carries
a `sha256` of the bytes it was made against, so whether it still describes that
file is a question with an answer rather than an assumption. Built and joined to
a source copy for delivery by `tools/build/audit-payload.py` (hub only), which
refuses to build a payload once the digests part.

Keeping the two inputs is what makes the pass re-runnable rather than only its
result surviving. `runs/2026-08-29-conventions/` is the worked example, rendered
by `pages/audit-render.html`.

Then append one row to `runs.csv` and any surprise to `LOG.md`, and **run the
repo's generators after that last edit, not before it**. A record that names a governed
file changes that file's derived state, so recording the run is itself an edit
the generators have to see. The same holds among the generators: one that writes
a governed file runs before one that measures it.

**A lesson that recurs a third time earns a change to this skill or its
tooling.**

## Revising the annotation

Step 1's grain is a starting guess and step 2's label is a first reading. Both
are revised by a **patch**, a list of operations over the stored standoff:

```bash
python3 ops.py <standoff.json> <patch.json> <doc.md> [--write]
```

| operation | is |
| --- | --- |
| `{"op":"split","uid":…,"at":<document offset>}` | one unit becomes two, meeting at `at` |
| `{"op":"merge","uid":…}` | a unit absorbs its successor |
| `{"op":"relabel","uid":…,"label":…}` | a different label from the declared vocabulary |
| `{"op":"note","uid":…,"text":…}` | what the label cannot say; an empty text clears it |

**Operations are keyed by uid, not by array index.** RFC 6902 is the standard and
the wrong altitude: its paths are positions, so inserting one unit invalidates
every later path and a split reads as two array mutations nothing can check as a
split. `why` is accepted on any operation.

**A patch is valid against its base or it does not run.** Every operation is
checked after it is applied, and a failure anywhere refuses the whole patch,
so a bad last step cannot leave the earlier ones on disk. The invariants are
the ones a stored run is already held to: units tile the document with no
unannotated gap, every span resolves to non-whitespace, every label is in the
declared vocabulary, uids are unique. Without `--write` the run is a dry run.

**The uid records the grain's history and the patch does not.** A split suffixes
its parent (`046` becomes `046a`/`046b`, and splitting a half gives `046aa`), and
each unit carries `from`. So a patch is a transport, not a second history to
store: nothing keeps the patch files.

**Where a patch comes from.** `pages/audit-render.html` (hub) offers the four
operations on the selected unit and accumulates them, applying each one
optimistically so the view moves under your thumb; it splits at connective
boundaries, which is where 40% of fused prose units divide. Where the page is
reading a branch it saves the result there, with the patch as the commit
message; a commit and the default branch both refuse, since the contents API
writes to a branch name and a change to the default one arrives through a pull
request.

**Two implementations, held to each other.** `ops.py` is the rules in Python,
`lib/kits/standoff.js` the same rules in JavaScript, because the work happens in
both places and a browser cannot run the first. They are not a layering:
`tools/render/scenarios/audit-edit.mjs` diffs their output over one patch, so a
drift is a failed comparison rather than a surprise months later. The two
serializations agree byte for byte with `audit-payload.py`'s, which a test
holds, so a save from the page and a rebuild from the run do not reformat each
other's file.

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
- The tooling's checks and the patch operations are tested
  (`tools/test/state-the-rule.test.mjs`), the browser's copy of the rules
  separately (`tools/test/standoff-kit.test.mjs`), and a stored run is held to
  its target and to the page that shows it (`tools/test/audit-standoff.test.mjs`);
  all three hub only. The judgment steps are not testable and every figure in `runs.csv`
  was read by hand.

## Files

`segment.py` · `check.py` · `seams.py` · `ops.py` · `runs.csv` · `LOG.md` · `runs/<date>-<patient>/`

Hub only, and not part of the skill: `lib/kits/standoff.js` (the same rules for a
browser), `tools/build/audit-payload.py` (the artifact and its delivery payload),
`pages/audit-render.html` (the view that shows and edits one).

`reanchor.py` resolves an annotation into an edited document across four tiers
and reports which one caught each unit, so a run can say how much annotation an
edit actually cost. Offsets are a hint; the quote selector is the anchor. No run
has called it yet, but a stored standoff is exactly the case it exists for: the
digest in `standoff.json` says an annotation has gone stale, and `reanchor.py`
is what says by how much.
