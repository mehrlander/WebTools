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

One label per unit, in a TSV keyed by `uid`, beside the verdict step 3 gives it.
The two are separate questions and each has its own column.

| Label | Is | Side |
| --- | --- | --- |
| `WHAT` | a rule, a fact of the system, a value it may hold | declaration |
| `HOW` | syntax, a procedure, an invocation | declaration |
| `WHY` | the reason behind the rule | hinge |
| `PROV` | when it changed, what it replaced, what failed | explanation |
| `EVID` | a measurement, a probe, an observation | explanation |
| `NAV` | a pointer to the document or gate that owns something | apparatus |
| `META` | a statement about this document | apparatus |

**A reason nearly always contains a criterion**: a condition, a threshold, a
named exception. Lift the criterion into the declaration; what remains is
`WHY`. Where no criterion can be extracted, keep the clause: it is part of the
rule.

There used to be two why labels, splitting a reason that changes how the rule
applies from one that only makes it feel right. That asked for the same
judgement the lifting already makes, once per clause, and answered it in a
second place. One `WHY` now, and where it is blunt it is blunt.

*Test:* name the condition, threshold or exception the clause adds. If you can
name it, lift it into the declaration. If you cannot, it is `WHY`.

The test used to be "would deleting this change how someone applies the rule at
a boundary case?" That is not a test, because every explanation believes it
changes behaviour and answers yes about itself. Asking for the criterion
demands an artifact instead: either a nameable condition comes out or it does
not, and nothing is settled by how strongly the sentence argues for its own
importance. Being too permissive is part of why the second why label had to
go.

There was briefly a `CUT` label for a passage that should not be there at all.
It was a verdict wearing a label's clothes: whether a unit belongs is not a kind
of content, and putting it here meant the label axis could not be read as a
reading of the document. It is `DROP` below, and the label table is about what a
unit is again.

### 3. Dispose

`KEEP` · `REWRITE` (a removable clause is fused inside) · `MOVE` (belongs to a
named owner) · `DROP` (says nothing the document needs).

**The annotation is a contract.** Every `KEEP` must appear in the result.

**A verdict is orthogonal to a label, not a refinement of it.** A unit is `WHY`
and `DROP` at once, and neither answer narrows the other, which is why they are
two columns and two declared lists rather than one enlarged vocabulary. Both
ride in the standoff, and [`pages/audit-render.html`](../../pages/audit-render.html)
paints one at a time behind a Label / Verdict switch. A `DROP` is struck through
under **either** lens: it is the destructive one, and browsing labels over text
the pass has already condemned is the reading the switch would otherwise allow.

### 4. Rewrite toward the declaration

Each entry: the rule, then its form where there is a syntax, then its boundary
where a clause changes application at an edge.

**Expect to beat the removal floor, and do not expect it.** `KEEP` units
compress too, and a sentence-level pass cannot see that. Per-run figures are in `runs.csv`.

**Start from the projection, not from the original.** `materialize.py` runs what
the annotation states and leaves the rest for you; see "Projecting the
annotation" below.

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

**Two checks the scripts cannot run.** Render before you cut: a definition that
exists only in a tooltip or a `title` attribute is not rendered, and a pass over
the source counts it as prose. And look inside the file: a paragraph repeated
verbatim within one document is invisible to a cross-file duplicate scanner by
construction, and fits inside a word cap. Both are checks, so they are this
skill's; CONVENTIONS.md carried them until 2026-09-05.

**The check does not replace the repo's own gates.** Run them too: a lost pointer
has twice passed `check.py` and been caught by the repo's own derivation.

### 7. Record, and keep the annotation

A run is a directory, `runs/<date>-<patient>/`, holding what it consumed beside
what it produced:

| file | is |
| --- | --- |
| `units.jsonl` | step 1's segmentation |
| `labels.tsv` | step 2's classification, `uid` / `label` / `verdict` |
| `standoff.json` | the annotation: a label and a verdict per unit, each from a declared list |

**Two axes, and a unit carries one of each.** The label says what a unit *is*
(`vocabulary`); the verdict says what this pass decided to do about it
(`verdicts`). They are orthogonal, so a unit is `WHY` and `DROP` at once and
neither answer constrains the other.

The standoff carried only the label until 2026-09-01, on the ground that a
second vocabulary would arrive **closed** inside an artifact whose whole
generality is that its vocabulary is declared. Declaring the second list beside
the first answers that on its own terms, and the cost of the omission had come
due: a page rendering one axis has to encode removal as a label, which is what
`CUT` was, a verdict wearing a label's clothes on the axis that says what a unit
is.

`labels.tsv` **seeds** both axes and owns neither, exactly as it already did for
the label: the pass writes it, the builder copies it in, and the standoff is the
live one from there, since a relabel or a reverdict in the page lands in the
standoff. `check.py` still reads the TSV, so a pass that ends in the page
re-exports it; `tools/test/audit-standoff.test.mjs` fails when the two part.

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

**Two geometries, and the key says which.** An operation over a **span** is keyed
by `uid`. An operation over a **boundary** is keyed by `after`, the unit that
boundary follows.

| operation | is |
| --- | --- |
| `{"op":"split","uid":…,"at":<document offset>}` | one unit becomes two, meeting at `at` |
| `{"op":"merge","uid":…}` | a unit absorbs its successor |
| `{"op":"relabel","uid":…,"label":…}` | a different label from the declared vocabulary |
| `{"op":"verdict","uid":…,"verdict":…}` | a verdict from the declared list |
| `{"op":"note","uid":…,"text":…}` | what the label cannot say; an empty text clears it |
| `{"op":"shift","after":…,"to":<document offset>}` | the boundary after that unit moves |
| `{"op":"insert","after":…,"text":…,"as":…}` | text the document does not have; an empty text clears it, and `as` says how it arrives |

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

**A rebuild is a reset, not a refresh.** `units.jsonl` and `labels.tsv` record
steps 1 and 2, so once a patch has moved the grain the standoff holds units
those inputs never had. Re-running `audit-payload.py standoff` would undo the
pass silently; it reads `from` and refuses without `--reset`.

**Split where the two halves take different labels.** A boundary whose halves
would both be `WHAT` separates two rules without changing what the annotation
says about either, and grain for its own sake is not a finding. On
`CONVENTIONS.md`, 36 of 69 prose units carry a clause boundary and 10 met the
bar; every one of the ten was a rule with its reason fused on. A heading is one
unit, so the page offers no split inside one; a unit spanning a blank line
offers that line.

**Offsets are code points, which is what Python counts.** A browser counts UTF-16
code units, so an astral character (every emoji in these documents) is one index
here and two there, and every offset after the first one drifts. The spans still
resolve, they resolve to the wrong text, so no invariant can see it: a shifted
partition is still a partition. `docs/SURFACING.md` carries 49.

The format does not change. `lib/kits/standoff.js` converts where a number
crosses the boundary, `adopt` on the way in and `emit` on the way out for the
stored file and for a patch `ops.py` will read. An insertion carries no offset at
all, being anchored by uid. A document with no astral character maps to itself.

**`kind` is derived from the span, not carried through the edit, and names a
heading's level (`h1` to `h6`).** It was written
once by `segment.py` and then survived every operation, so a boundary move left
it describing a span that no longer existed: splitting `## Scope and precedence`
gave a unit reading "nd precedence" still labelled `h2`, and three of the
nine headings in `CONVENTIONS.md` offer that split one tap away. `split`, `merge`
and `shift` now re-derive it; the other operations touch no span and do not.
`merge`'s old rule (differing kinds become `mixed`) was a partial version of the
same fix, reading the two operands rather than the result, so merging two
sentences across a blank line kept `sent`.

The derivation is `segment.py`'s own dispatch order read against a span rather
than a block, which is what lets a browser answer without a segmenter. A fence
outranks everything, since only a fence body legitimately holds blank lines;
heterogeneity outranks the remaining markers, so a heading that swallowed across
a break is `mixed` rather than `heading`. `tools/test/state-the-rule.test.mjs`
holds the two to each other over 1,381 units of this repo's documents.

**A boundary is the object, not an edge.** The end of one unit is the start of
the next, so `shift` touches both and the units stay a partition: one label per
character, which is what the word-share figure counts. Overlap is a complaint
rather than a mode. The operation was called `move` until 2026-09-02 and gave the
name up to the `MOVE` verdict, which is a different kind of thing about a
different object.

**An insertion is text the document does not have, so it anchors to a boundary
rather than to a span.** Every other operation moves boundaries and labels and
leaves the bytes alone, which is what lets `target.sha256` stay true across a
session; `insert` states a change to those bytes without making it. It therefore
neither tiles nor covers, and no span invariant can see one, which is why
`insertions` is a list of its own rather than a unit with a zero-width span: such
a unit would fail the span check, need a special case in the tiling arithmetic,
and report `words` counted from text the document does not contain, which feeds
the word-share figure.

**The anchor is the identity.** One insertion per boundary, no id to keep unique,
and an empty text clears it, which is `note`'s shape one geometry over.
`{"after": null}` is the head of the document, the one boundary that follows no
unit. Three interactions follow, and the middle one is a refusal:

| the patch also | the insertion |
| --- | --- |
| `shift`s the anchored boundary | is untouched; the anchor is a uid, not an offset |
| `merge`s the anchor with its successor | refuses the merge |
| `split`s the anchor unit | re-anchors to the second half |

The merge refusal is not tidiness. The survivor keeps the first unit's uid, so
the anchor would still resolve, now naming the boundary past the absorbed unit:
it would pass every check and sit in the wrong place. Held with the rest of the
parity in `tools/test/state-the-rule.test.mjs`, which runs one patch through both
implementations and compares the result.

**Where a patch comes from.** `pages/audit-render.html` (hub) offers the
operations on the selected unit and accumulates them, applying each one
optimistically so the view moves under your thumb; it splits at connective
boundaries, which is where 40% of fused prose units divide. Undo replays
`apply(base, patch[0..n])`, so there is no inverse operation to write, and what
travels is the applied prefix.

**Edges are placed against the RENDERED document.** `lib/kits/standoff.js` maps
each rendered text node back to the source by finding it with a moving cursor,
which works because the rendered text is a subsequence of the source. What it
cannot find it leaves unmapped, and an unmapped run offers no offset, so markup
is not a place: `**`, `[`, `](url)` and a fence's backticks are in no text node.
An inline construct is atomic on top of that. That was once a necessity, since
each unit was rendered from its own slice of source and a boundary inside a
link's label left one side holding an unclosed delimiter. The page renders the
document once now and paints units as ranges over its text, so no boundary can
break an element and atomicity is a **choice** about what a unit should mean
rather than a patch over a rendering failure. It is kept: a boundary inside a
link's label is not a place a reader can mean. Nothing else is refused, measured:
no boundary in the stored run sits inside a construct, and the three the
interface offers inside a heading render correctly. This is a **placement** rule
and not an invariant: `check.py` is stdlib Python with no markdown parser, and a
second disagreeing implementation would be worse than none, so a hand-authored
patch can still do what the interface cannot. Where the page is
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

## Projecting the annotation

```bash
python3 materialize.py <standoff.json> <doc.md> [--out <file>] [--json]
```

**Two of the four verdicts execute, and the other two are reported.** `DROP`
removes its span and every insertion is placed; `KEEP` is a no-op. `REWRITE`
names no replacement and `MOVE` names no destination, so neither can run without
inventing text, and inventing text is the one thing a projection must not do.
Both are left standing and named. What comes out is a **draft for step 4**, not a
finished rewrite.

`MOVE` is left standing rather than removed, which is the one place this
disagrees with `check.py`. That check reads `DROP` and `MOVE` together as
"should have left", which is right when it is *judging* a rewrite a person made:
the person put the moved text somewhere. Here there is nowhere to put it.

**An insertion inherits the separator already standing at its boundary, and
`as` overrules it.** A gap holding a blank line separates blocks, so the text
arrives as its own block; anything else is a run, so it joins with a space.
Reading the separator off the document is mechanical; choosing one would be the
same guess as inventing a `REWRITE`. The head of the document is a block by
construction, having no separator to read.

The reading is not always available. A file's final newline is a terminator
rather than a paragraph break, so at the tail the gap answers "run" for a reason
unrelated to intent, and a closing block was unsayable until 2026-09-02.
`"as": "block"` or `"as": "run"` on the insertion states the shape at any
boundary, which is not the same kind of guess because it is not a guess: the
annotator said it. Unset writes no key at all, a state rather than a third value
of one, and the page's `arrives as` control can return to it. `"run"` at the
head is refused, having nothing to run into. `materialize.py` reports how many
insertions stated a shape and how many read one, since an honored override the
account does not mention reads as a reading.

**It does not tidy.** Removing a span leaves the whitespace the span sat in, and
collapsing that is neither stated by the annotation nor invariant over markdown,
since inside a fenced block whitespace is content. The artifacts are counted and
reported instead.

**The digest is the gate, and it is also the insertion's whole lifecycle.** A
standoff's spans are offsets into particular bytes, so a projection onto any
other bytes would splice in the wrong places and is refused. The same refusal is
what retires an insertion: applying the output over the target changes the bytes,
the digest stops matching, and a second run cannot double-apply. Nothing marks an
insertion "applied", and nothing needs to. The text is then ordinary document
text, annotated like any other, and the annotation that proposed it wants
`reanchor.py`, not another projection.

Held by `tools/test/state-the-rule.test.mjs`, which pins each of those against a
mutation that would break it.

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

`segment.py` · `check.py` · `seams.py` · `ops.py` · `materialize.py` · `runs.csv` · `LOG.md` · `runs/<date>-<patient>/`

Hub only, and not part of the skill: `lib/kits/standoff.js` (the same rules for a
browser), `tools/build/audit-payload.py` (the artifact and its delivery payload),
`pages/audit-render.html` (the view that shows and edits one).

`reanchor.py` resolves an annotation into an edited document across four tiers
and reports which one caught each unit, so a run can say how much annotation an
edit actually cost. Offsets are a hint; the quote selector is the anchor. No run
has called it yet, but a stored standoff is exactly the case it exists for: the
digest in `standoff.json` says an annotation has gone stale, and `reanchor.py`
is what says by how much.
