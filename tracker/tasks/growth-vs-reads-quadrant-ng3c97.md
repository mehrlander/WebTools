---
id: growth-vs-reads-quadrant-ng3c97
title: Read a document's growth against its readership, on the Docs tab
status: backlog
opened: 2026-08-28
size: M
---
# Read a document's growth against its readership, on the Docs tab

The Docs tab now carries both halves of the pair and shows them apart: `words`
with a growth sparkline from the doc-growth payload, and readership as presence
beside access from the sessions cache (PR #528). Nothing crosses them, so the
question they answer together is still asked by eye: **which documents are
growing that nobody reads.**

A quadrant does it directly. Growth on one axis, recorded reads on the other,
each registered doc a point, the four corners named. The one that matters is
high growth and no reads: a document accreting with no reader is the cheapest
kind of rot to find and the easiest to miss in a table sorted by either column
alone. 42 of 70 registered docs had zero recorded reads on 2026-08-28, so the empty
quadrant is most of the corpus and the figure is worth showing rather than
describing. The registry has since grown to 76 rows, so read the zero-read count
live when building rather than quoting this one.

## Where it goes, and why not on Growth

**On Docs, not the Growth tab.** Growth is federated as of 2026-08-28: the repo
is a control and every declaring corpus is a subject. Readership is not. It
joins against `docs/docs.csv`, which is the hub's registry alone, so a quadrant
on Growth would show growth for any selected repo and coverage for exactly one,
which is a view that changes meaning when its control moves. Reach and
readership already live on Docs; this belongs beside them.

Both inputs are in hand there. `loadDocsReg` already reads `docs/docs.csv`, the
growth payload (`docGrowth`, per-path `w`/`delta`), and `loadDocReads`. The work
is the rendering and the reading, not the data.

## Open questions
- Which growth measure: net delta over the whole history, or recent slope. A doc
  that grew once in March and has been still since is not the same finding as
  one still accreting.
- Whether reads should be presence, access, or both. They are two rollups that
  are never summed, so a single axis has to pick one and say which.
- Whether the four corners are labelled or left to the reader. Naming them makes
  the view an argument, which may be the point.
- Whether injected docs belong on it at all. They are the two most-read files in
  the estate and precisely the two no file tool can count, so they distort
  either axis.

## Done when
The Docs tab renders growth against readership for every registered doc, the
zero-read population is legible as a count rather than inferred, and a point
opens its document in the deck the table's rows already use.

## Progress log
- 2026-08-28: filed out of the doc-growth deduplication branch
  (`claude/doc-growth-duplicate-sidebar-4bg2or`, PR #534), which made Growth a
  federated tab and settled that this belongs on Docs instead. Not claimed.
- 2026-09-04: `docs/docs.csv` now holds 76 rows against the 70 this was written
  on. The zero-read figure is not restamped on purpose: it joins the sessions
  cache rather than the registry, and rendering it live is the point of the task.
