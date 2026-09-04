---
id: spike-snags-log-gobdyq
title: Spike the snags log (friction learned the hard way)
status: done
project: repo
opened: 2026-07-15
closed: 2026-09-04
size: M
---
# Spike the snags log (friction learned the hard way)

Decide the shape of a running log of small, atomic "do this differently next
time" corrections, the kind that otherwise scatter into whatever topical doc
happens to fit, or evaporate. Seeded as [`docs/SNAGS.md`](../../docs/SNAGS.md)
with two entries.

**Why it is its own axis.** It keys on an **insight** (a correction), where the
tracker keys on a **task** (intent) and a merge guide on a **PR** (delivery). So
it is orthogonal rather than a second parallel history. The drift guard is that
entries stay an index: a one-liner plus a `→` to the durable doc, never a copy of
it.

## What the spike settled

Every open question is now answered somewhere a reader will actually meet it, so
the answers live in those places rather than here.

| Question | Answer, and where it is stated |
| --- | --- |
| Recurrence mechanism | Mechanical since 2026-08-14. `tools/build/snags-index.mjs` (`npm run snags-index`) generates the index and the commit hook reruns it; `docs/snags.csv` carries `count`, `last_seen`, `seen`. A sighting must be a date, and an unslugged heading is named at the terminal rather than absorbed. |
| Escalation threshold | The third recurrence earns a tracker task. Stated in `docs/CONVENTIONS.md`, and exercised once: `enforce-house-style-ryz0z5` was filed at the third trip on `house-style-not-consulted`. |
| Graduation rule | Stated in SNAGS.md's own header: entries stay an index with a `→` to the doc holding the fix, so they cannot drift from it. |
| Format | A split rather than a schema. The mechanical half is the derived `docs/snags.csv`, gated by `artifacts-lockstep`; the prose stays in the markdown, because the paragraph explaining why a trip was invisible is most of an entry's value. |
| Portability | Adopted. `docs/CONVENTIONS.md` carries the intake rule and the escalation threshold in one sentence, so any repo loading the conventions gets both. |
| PR-body intake and a projector | Not built, and the case for it has only weakened. |

**On the projector, which is the one thing deliberately not built.** The plan was
to extend `scripts/build-merge-guide.py` with a second back end. That script was
retired in PR #358, because a committed projection of merged PRs duplicates what
the pulls endpoint answers live, and the same reasoning applies here: a projector
that only restated PR bodies would repeat the mistake. What SNAGS.md holds that
no API does is the accumulation across PRs, the recurrence count, and the `→` to
the fix. Hand-appending has produced 72 entries with a mechanical count over
them, so the intake machinery has not been missed.

## Progress log
- 2026-07-15: Filed while wrapping PR #219. Name decided: SNAGS.
- 2026-08-05: Correction from the merge-guide retirement (PR #358). The planned
  host script no longer exists, which simplifies rather than blocks: with no
  merge-guide back end, a snags projector would just be its own script, and the
  three divergences the plan reconciled (key, trigger, name) stop being tensions.
- 2026-08-23: A defect in the recurrence mechanism this spike was deciding: seven
  tail entries carried a retired heading form the generator did not parse, so
  their dates were credited to the preceding entry.
- 2026-08-26: That defect fixed, and Format settled as the registry/prose split
  above. The log held 53 entries against a parse that saw 46.
- 2026-09-04: Closed. Verified on `4a085db`: SNAGS.md's header states the
  graduation rule and the recurrence signal, `docs/snags.csv` holds 72 rows with
  counts, CONVENTIONS.md carries the intake rule and the third-recurrence
  threshold, and SURFACING.md's guide template has no `Snags:` section, so
  PR-body intake was answered by not adopting it. The deliverable was the
  answers plus either the machinery or a decision to drop it; both halves exist.
