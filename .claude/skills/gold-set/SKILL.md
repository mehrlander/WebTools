---
name: gold-set
description: Build a gold set, an independently labeled sample that scores a mechanical classifier or extractor for correctness, by a measurement fan-out of blind readers, an adversarial skeptic on every disagreement, and a scoring script, then decide from the scorecard whether the program should change. Use when the user asks how accurate a classifier, extractor, labeler or parser really is, wants a labeled sample or a gold standard for one, says "score the classifier", "gold set", "how good is the extractor", "per-field precision", or when a verify suite passes and the question is whether the data it holds consistent is actually right. Not for scoring judgment output (use a review panel) and not for acquiring material (use scour).
---

# Gold set

A verify suite proves that an artifact is consistent with its data; it cannot
say the data is right. A **gold set** is the check on correctness: a sample of
the program's inputs labeled by readers who never see the program's answer,
committed as a precious artifact, and a scorecard that measures the program
against it per class, per source, per stratum. The gold set is the deliverable;
the program does not change on the branch that builds it. Whether it should
change is what the scorecard says, and that goes to the tracker.

This is a **measurement fan-out**, the third kind beside judgment (critique,
review from a persona) and acquisition (`/scour`). Its failure modes are
leakage of what the labeler must not see, a permitted answer taken more often
than the seed standard allowed, and malformed output, and all three are fixed
mechanically rather than by prompting. Worked example, with every script and
prompt: budget-wa, `sources/enacted-operating-bills/processing/provisos/gold-set/`
(2,447 provisos, 124 agents, 17 minutes). Environment numbers live in
[`docs/environment/capabilities.md`](https://github.com/mehrlander/web-tools/blob/main/docs/environment/capabilities.md)
and age on their own clock.

## Stage 0: join and sample, by script, committed

**Join first, assume nothing.** The program's predictions, any second
program's records, and the table the reader will be shown usually carry three
id schemes. Write the join as a script, report its rate, and commit the joined
table; check every derived claim about ids against the data (position within
a section, an extraction's own stem and section) rather than the README.
Rows the join cannot verify are excluded from the universe and counted.

**Stratify on everything the score will be cut by, and on the program's own
blind spots.** Source (every one, so an unseen era can be scored as a held-out
set), the predicted class including none-predicted, the program's ambiguity
flag, outline depth, and a length band that keeps the short tail in. The
short, deep tail is where a text classifier fails, and a sample that follows
the corpus's proportions barely reaches it. Within a source, allocate seats by
the square root of cell size with a floor of one, which over-samples rare cells
without abandoning proportion.

**Fold in every existing hand label, unmarked.** They become the human anchor
for the reader, and the reader must not know which rows they are.

**Seed it and write the seed down.** The sample rebuilds byte for byte; the
README names the seed and the md5. Batches of about 40 rows per reader.

The batch file is the blinding: id, locator, depth, leading and parent labels,
text, and any second program's record to be marked. **No prediction, no seed
label, no hand label.** The prompt says so as well, but the file is what
enforces it.

## Stage 1: readers

One agent per batch, the cheaper model, brisk. The prompt carries the class
definitions **verbatim from the source that owns them**, the input and output
paths, the output shape, and two permitted non-answers named as acceptable:
`both` with the two classes, and `fragment` for a piece not interpretable
alone. Per row: class, confidence, one clause of reason, and, where a record
rides along, a mark per field of correct, incorrect or missing.

**End the prompt with a validator the agent runs on its own output**, one
script that reads the output against the input and prints OK or the defects,
with the instruction to fix anything reported before returning. This made 124
of 124 outputs conform; it is the Agent-tool equivalent of Workflow's schema
option, and it is committed. Return value: one line of counts.

Expect the permitted answers to be taken. Readers offered `fragment` used it on
a third of rows where the original hand sample, written without that option,
had typed the same list items by their parent's intent. The permission is a
decision about what the labels mean; make it before the run and say so in the
README, because it will be the largest reader-versus-hand disagreement.

## Stage 2: skeptic

The stronger model, one per reader batch, pipelined: each reader completion
prepares and launches its skeptic. It reviews every row where the reader and
the machine label disagree (the prediction where one exists, else the seed
labeler's label, else nothing) plus a **seeded audit share** of agreements,
about a tenth, flagged in the sample before the run so the selection is not
the skeptic's. A `fragment` against any machine label counts as a
disagreement, and `both` agrees when the machine's label is one of the two.

The prompt says to **default to the reader being wrong** and to quote the
clause that decides it, on every row, confirmations included. Give the
skeptic one thing the reader lacked, the parent paragraph's text, which is
the context the program also lacked: the reader's blind spot and the program's
coincide, and the skeptic breaks the tie with what neither had. Expect about
80 percent confirmed, most overturns landing on the machine's label, a few on
a third answer, and every note usable as evidence. The same validator pattern
gates the output; a confirm must keep the reader's class and an overturn must
change it.

The final label is the skeptic's verdict where a row was reviewed and the
reader's label otherwise. Keep the reader label, the verdict and the note as
separate columns: the CSV is the record, not the summary.

## Stage 3: score, by script, into a dated record

Against the final labels: accuracy, per-class precision and recall, the
confusion matrix; the same by source and by depth; the seed labeler scored
separately where its label exists, and again on its confident rows alone,
since those are what the program was trained on; the program cut by whether
the seed had labeled the row, which is the question of whether it adds
anything beyond its seed; the held-out era on its own, applying the saved
model where committed predictions stop; reader agreement with the hand
labels, exact and overlapping, with the disagreements listed; per-field
precision for the second program beside whatever it was validated with
before; and the skeptic's overturn rate split by why the row was sent.

A `fragment` gold row has no class answer: report the class figures without
those rows, a strict figure counting them wrong, and where the program put
them. The strict figure is usually the honest one.

The scorecard is a dated file: an authored preamble (the run table, the
reading, the proposal) around a figures block the script regenerates from the
CSV. Keep the cost in the run table: agents, wall clock, and tokens summed
from the transcripts' usage blocks, since the completion notification's single
number is not the spend.

## The decision, and where it goes

The gold set does not retrain anything. It says one of three things, and the
scorecard states which:

- **Leave it.** The program scores where it is used; file nothing.
- **Change it, using the gold set for a class it lacks and for the score.** The
  usual case when a program has no abstain class and the gold set found one:
  the gold rows supply that class, the seed keeps supplying the rest, and the
  gold set is split by seed so a held-out fold survives. File the task.
- **Never replace the seed with the gold set.** A few thousand rows cannot
  replace tens of thousands of seed labels that score above 95 percent where
  they fire, and training on the only independent test set leaves nothing to
  score the result against.

Two more rules. The CSV is precious: a rerun of the agent stages produces a
different gold set from the same sample, so the file is committed and the run
directory is not, and more labels come from a new sample with a new seed, never
from relabeling. And a frozen hand sample stays frozen; where the gold set's
standard diverges from it, the scorecard records the divergence rather than
editing the note.

## Running it: bookkeeping is the main loop's whole job

Measure the venue before choosing it: Workflow's cap is min(16, CPUs minus 2)
per run and a small box makes it two; the Agent tool's cap is twenty. In the
Agent tool, pipeline by hand: a pump script that, on each completion, validates
the reader's file, prepares the skeptic's rows, renders its prompt and logs the
ledger, so a notification costs one command and one launch. Count live agents
with `ListAgents`, not from files on disk: an agent whose output is written and
validated still holds its slot until it returns. Log any batch refused or lost
and relaunch it; reconcile the roster against `ListAgents` before declaring
the run complete. Readers cost about 105k tokens and two minutes for 40 rows,
skeptics about 97k and 90 seconds, nearly all of it cache reads of the shared
prompt.
