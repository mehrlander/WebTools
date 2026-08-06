---
id: code-layer-taxonomy-q15jp2
title: Name the code layers and account for tools/
status: done
opened: 2026-08-04
closed: 2026-08-06
session: claude/web-tools-tracker-review-ij4pjj
next: done on claude/web-tools-tracker-review-ij4pjj; the taxonomy is docs/code-layers.md, the survey is scripts/unclaimed-code-survey.py
---
# Name the code layers and account for tools/

The kit discipline did not rot; the taxonomy under it went incomplete. Measured
2026-08-04 (files; named in any doc; named in any test):

| Layer | Files | Documented | Tested |
| --- | --- | --- | --- |
| lib/kits/ | 21 | 20 | 20 |
| lib/ flat | 26 | 24 | 21 |
| lib/alpineComponents/ | 31 | 20 | 19 |
| scripts/ | 6 | 6 | 2 |
| tools/ (non-test) | 57 | 14 | 7 |

Two named boxes exist (kits: portable capability with a demo and lazy deps;
alpineComponents: UI). A third formed silently in flat lib/: show-repo's domain
modules (branch-survey, repo-checks, portable-align, source-peek and siblings),
well-tested but belonging to no stated category, so new logic lands by
gravity rather than by rule. The genuinely weak layer is tools/, where most
files are named nowhere.

Done means: (1) the taxonomy stated once, in one authoritative carrier (likely
a section beside lib/kits/README.md's per-kit table), naming each layer's
admission rule, including the third category; (2) an advisory unclaimed-code
survey in the data-provenance-survey.sh idiom that lists code files no doc
names, so the tools/ gap and future drift are visible rather than remembered
(heuristic, non-blocking); (3) the docs registry's claims table gains the
taxonomy's carrier row if the statement ends up repeated anywhere.

Context that would otherwise need rebuilding: the measurement method and the
finding live in PR #350's session (the documentation-registry work); the
registry itself (docs/docs.json) is the precedent for how the statement should
be shaped: one owner, gated copies, unchecked declared honestly.

## Progress log
- 2026-08-06: done on `claude/web-tools-tracker-review-ij4pjj`. All three parts
  landed, and the survey changed two of the answers on the way.

  **(1) The taxonomy** is [`docs/code-layers.md`](../../docs/code-layers.md), a
  new doc rather than a section of `lib/kits/README.md` as this task guessed.
  That README is the kit shelf's front door, not a place a reader looks to ask
  "where does this file go," so its former three-category list was reduced to the
  kit's own admission rule plus a pointer, and `CLAUDE.md` names the new doc
  beside `docs/loader.md`. Six layers, each with an admission rule.

  **The third category needed a second axis, not just a name.** The rule already
  in use ("registers a `window` namespace") is mechanical and cannot separate
  `lib/kits/pdf.js` from `lib/branch-survey.js`, which are the same file shape.
  The axis that does: a **kit** is a capability true in any repo, an **estate
  module** is the same shape carrying this estate's domain. The test is whether
  the file would have to be explained before someone else could use it. That
  makes the namespace test necessary and not sufficient, which invalidates the
  premise of `lib-root-kit-migration-dind5t`'s eight-file list; noted in that
  task's log, where five of the eight re-sort as estate modules and two are
  genuinely arguable.

  **(2) The survey** is [`scripts/unclaimed-code-survey.py`](../../scripts/unclaimed-code-survey.py)
  (`npm run code-survey`), in the `data-provenance-survey.sh` idiom: heuristic,
  advisory, always exits 0. Two independent signals per file rather than one,
  because they fail differently: named in prose, and exercised by a test. A file
  can be tested and undocumented (it works, nobody says why it exists) or
  documented and untested. Layers are directories taken as they are rather than
  from a list the script carries, so it says something true about any repo and
  grows a row when a repo grows a folder. Portable, so it is in `docs/portable.json`
  and the PORTABLE.md scripts table. It is scoped by argument on purpose: unscoped
  it reports `archive/` and the vendored `skills/` shelf, which are unnamed
  deliberately, and drowns the layers that matter.

  **(3) The registry** gained the `docs/code-layers.md` row and a claims-table
  entry naming it authoritative, with `lib/kits/README.md` as a pointer and
  `tools/README.md` as a paraphrase that owns the `tools/` split in detail.

  **What the survey found that the filed table did not.** The `tools/` gap is not
  spread across the folder: 44 of its 77 non-test files are unnamed, and 45 of the
  55 unnamed files in `lib/`, `scripts/`, and `tools/` combined sit in exactly two
  directories, `tools/render/scenarios/` (20) and `tools/render/scripts/` (29).
  Those two hold files of identical shape, a default-exported
  `async (page, ctx) => {}` handed to `screenshot.mjs --script`, created on the
  same day in 2026-07, with nothing separating them by content. Asserting looked
  like the line and is not: three of twenty scenarios print `ASSERT` and none of
  twenty-nine scripts do, a split of three files against forty-six rather than one
  folder against the other. `tools/README.md` names `scenarios/` and had never
  mentioned `scripts/`, so half the category had been invisible since it appeared.

  Not merged, deliberately: 49 files each carrying an invocation line in its own
  head comment is a mechanical change wide enough to want its own diff, the same
  argument that keeps the `lib/` root migration separate. What both READMEs now
  say instead is that `scenarios/` is the name and `scripts/` is the accident, so
  a new driver has somewhere to go. No task filed for the merge: it is a rename
  anyone can do in one pass, and the rule is written down, which was the actual
  gap.

  One thing this displaced rather than added: `CLAUDE.md` has a 1,600-word ceiling
  held by test, and the pointer took it over. The test says the fix is extraction
  rather than shaving, and the Snags section turned out to restate
  `docs/SNAGS.md`'s own header nearly claim for claim, so it was reduced to a
  pointer. Net effect on a session's reading is negative.
- 2026-08-04: Filed from the docs-registry session at the user's request; measurements above are from that session's survey.
