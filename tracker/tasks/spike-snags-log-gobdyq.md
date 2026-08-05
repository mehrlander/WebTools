---
id: spike-snags-log-gobdyq
title: Spike the snags log (friction learned the hard way)
status: backlog
project: repo
track: independent
opened: 2026-07-15
session: claude/pr-219-review-22csrh
---
# Spike the snags log (friction learned the hard way)

A running log of small, atomic "here is a thing to do differently next time"
snags, the kind that today scatter into whatever topical doc happens to fit
(this session put two into `docs/environment/testing.md` and
`docs/github/mcp-server-routing.md`) or evaporate. Seeded small as
[`docs/SNAGS.md`](../../docs/SNAGS.md) with those two entries; this task decides
the shape. **Name decided: SNAGS** (visual, specific, punch-list connotation;
"learned the hard way" is the tagline).

**Why it is its own axis.** It keys on an **insight** (a correction), where the
tracker keys on a **task** (intent) and the merge guide on a **PR** (delivery).
So it is not the two-logs-that-drift risk the conventions warn about: it is
orthogonal, not parallel. The drift guard is that entries stay an index (a
one-liner plus a `→` to the durable doc), never a copy of the doc.

**The active framing (added after the seed).** The value is not only reading it;
it is aggregating and dealing with friction systematically. One trip is noise;
the same trip two or three times is signal. So an entry should carry a
**recurrence marker** (a count, or a short list of when/where it bit), and
recurrence is the trigger to escalate from "noted" to "fixed at the root." That
gives entries a light lifecycle (noted → recurring → addressed) and a handoff: a
recurring speed bump spawns a **tracker task** to eliminate it (friction-log →
tracker, the intake-to-backlog pipeline). Guardrail: the log triages, it does
not do the work; the entry stays atomic and real work moves to the tracker.
Counting only works if a repeat is recognized at trip-time, so entries stay
short and greppable (which argues for a tag once it grows).

**Intake vs. store (the settled architecture).** `docs/SNAGS.md` is the
aggregate store, not a description of the idea. The guide-PR body is the intake:
a snag is authored there in-context as it is hit, riding the wrap-up, then
projected into `SNAGS.md`, the same authored-in-PR-body / generated-into-a-doc
split the merge guide already runs. The twist vs. the merge guide: a snag is
**cross-PR**, so the projection merges-and-counts rather than appends one entry
per PR. A new snag becomes a new entry (hit 1); a snag already present bumps its
count and appends the PR/date; at a threshold it flags for escalation. That
needs a stable **slug** per snag as the match key (the seed entries lead with
one). Until the projector exists, `SNAGS.md` is hand-appended; the projector is
the v1 deliverable. Keep it non-destructive (preserve hand-added entries), like
`build-merge-guide.py`.

**Open questions to settle in the spike:**

- **Recurrence mechanism.** How a repeat is recorded (bump a count vs. append a
  dated context line), the escalation threshold, and the exact hand-off to the
  tracker.
- **PR-body section + unified generator.** Name the guide-region section
  (`Snags:`) and fix the per-entry line format (slug + one-liner + `→`). Build
  the projector *into* `scripts/build-merge-guide.py`, not beside it: the script
  already splits into a shared front end (`fetch_prs`/`merged`/`extract`) and a
  PR-keyed merge-guide back end, so generalize `extract()` to also return the
  `Snags:` block and add a second back end that emits `SNAGS.md`. One walk, one
  parse pass, two connected files. Only a unified pass can cheaply wire the
  cross-links (merge-guide entry ↔ the snags a PR surfaced; a snag's `seen:` ↔
  its PR numbers). Three divergences to respect, so it is one front end with two
  back ends, not one blended emit:
    - **Key:** per-PR immutable entries (merge guide) vs per-slug
      accumulate-and-count (snags). Distinct merge functions.
    - **Trigger:** the merge guide projects merged PRs only; a snag's best
      material is often a dead end, so snags likely project from *closed* PRs
      too. Settle the filter.
    - **Name:** `build-merge-guide.py` emitting `SNAGS.md` is a misnomer and the
      script is advertised in `PORTABLE.md` / `CONVENTIONS.md`. Rename (e.g.
      `build-pr-derived-docs.py`, updating both references) or factor a shared
      `pr-regions` module two thin scripts import.
- **Format.** Is `slug / symptom / corrected move / recurrence / → doc` enough,
  or is a tag/category worth it for retrieval once it grows.
- **Graduation rule.** When does a snag stay a log one-liner vs. graduate into a
  topical doc (testing.md, github/, environment/)? The seed treats substantial
  ones as graduated-with-a-pointer; confirm that rule.
- **Portability.** If it proves useful, does it join the to-go bag
  (`docs/PORTABLE.md`) and get a mention in `CONVENTIONS.md`, or stay
  web-tools-local. A projected-from-PR-body form would ride the surfacing course
  a repo already runs.

**Relationship:** extends task 0004's PR-body projection generator
(`build-merge-guide.py`) rather than standing up a parallel one.

**Deliverable:** a short spike report answering the above, plus either a
formalized `SNAGS.md` + PR-body `Snags:` section + the generator extended to emit
both files, or a decision to drop it.

- 2026-08-05: **Correction, from the merge-guide retirement (PR #358).** The plan
  above builds the snags projector *into* `scripts/build-merge-guide.py`, reusing
  its `fetch_prs`/`merged`/`extract` front end and adding a second back end. That
  script no longer exists: the merge guide and its generator were retired, because
  a committed projection of merged PRs duplicates what the pulls endpoint already
  answers live. Nothing else in the spike is invalidated, and one part of it gets
  simpler. The "one front end, two back ends" framing existed to justify sharing a
  walk with the merge guide; with no merge-guide back end, a snags projector is
  just its own script, and the three divergences the plan carefully reconciled
  (key, trigger, name) stop being tensions to resolve. The cross-link half of the
  argument goes too, since there are no merge-guide entries to link a snag to.

  Worth weighing before building it at all: the reason the merge guide was retired
  applies here in part. A projector that only restates PR bodies would be the same
  mistake. What would justify it is the part `SNAGS.md` holds that no API does,
  which is the accumulation across PRs, the recurrence count, and the `→` to the
  doc carrying the fix. That is authored judgment, not a live read, and it is the
  test any design here should have to pass.
