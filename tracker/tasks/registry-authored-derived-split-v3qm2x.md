---
id: registry-authored-derived-split-v3qm2x
title: Separate authored from derived data across the registries
status: backlog
opened: 2026-08-18
size: L
---
# Separate authored from derived data across the registries

Three kinds of file should be distinguishable on sight: an **authored source** no
generator touches, a **derived** file a generator rewrites whole, and a **view**
joined at read time. Today one file kind pretends to be all three.

Half the enforcement exists. `docs/properties.csv` declares each property
`recorded` or `computed` (152 of them on 2026-09-04, 110 and 42). The gate is:
a property's declared mode must match which file its column lives in.

## The survey, measured 2026-08-18

| Layer | Where the mixing is | Fix |
| --- | --- | --- |
| 1 | 4 registries hold 17 authored columns beside 14 computed: `registries`, `tests`, `docs`, `harness` | split the carrier |
| 2 | `NOTES` in `pages-index.mjs` (26 hand-written blurbs, `pages.note` declared `computed` while a human writes it, so the declaration is false); `INJECTED`/`PROJECT_FILES` in `docs-reach.mjs` | authored carrier |
| 3 | 18 values in 5 glossaries in `map.js`, plus `ADOPT_VERDICT`/`DUE` in `estate.js` and `STATUS_TAG` in `file-review.js` | move to `docs/vocabularies.csv` |
| 4 | presentation mappings (`KIND_TONE`, `MODE_ICON`, `TYPE_ICONS`) | stay, named as deliberate |

32 closed value domains; three have per-value meaning recorded in data.

**Why it happened, since it decides the fix.** A registry absorbs authored
judgment when its subject has nowhere to keep its own: zero of the 63 files under
`docs/` carry frontmatter, and a `.mjs` carries none, so the registry row was the
only slot. Where a subject does describe itself, the registry stays clean:
`tracker-board` is 100% computed because `tracker/tasks/*.md` carry frontmatter.

## Decide first, because it changes the shape

1. **Sibling CSV or the subject file?** Per registry, not globally. Frontmatter is
   right for `docs/*.md` and wrong for `role` across 147 harness files.
2. **Suffix or folder?** `docs-derived.csv` or `authored/`+`derived/`. The folder
   is the stronger signal and moves 22 paths.
3. **`registries.csv` is 11 authored columns and one computed.** A whole file for
   22 values may cost more than it buys; the alternative is one named exception.

## Stages, each green on its own

1. Layer 3, which exercises the join before anything structural moves.
2. Layer 2, which corrects the false `mode` declaration stage 3's gate needs.
3. Layer 1, with the mode-matches-file gate alongside, since the gate is what
   keeps the split from decaying.

## Done when
Every property's declared `mode` matches the file its column lives in, a gate
holds it, and no authored value remains in a generator or component except
Layer 4.

## Why it is worth carrying
The costs are already here: the `words` merge conflict fires for any two branches
touching `docs/`; three generators are read-modify-write merges rather than
emitters; the commit hook's leg 3c fixpoint exists because `docs/README.md` is a
row in the registry that generates it; and `tests.csv` hides a small authored
table inside 145 KB of machine output.

## Progress log
- 2026-08-18: Filed out of the JSON-to-CSV migration (PR #441), which made the
  mixing legible. Survey measured against that branch's tip.
- 2026-08-18: Corrected after the vocabulary pass. The defect is not confined to
  one kind of registry: `pages` is curated and has it too. Table names updated.
- 2026-09-04: Property count restamped 126 to 152; body cut from 1,038 words to 534. The survey tables keep their 2026-08-18 measurements, which carry
  the shape of the finding rather than a total. Still first: decision 1.
