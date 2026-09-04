---
id: registry-authored-derived-split-v3qm2x
title: Separate authored from derived data across the registries
status: backlog
opened: 2026-08-18
size: L
---
# Separate authored from derived data across the registries

The estate applies authorship separation to its content and not to its own
registries. Three kinds of file should be distinguishable on sight: an
**authored source** a human writes and no generator touches, a **derived** file
a generator owns outright and rewrites whole, and a **view** assembled at read
time by joining them. Today one file kind pretends to be all three.

The enforcement is already half-built. `docs/properties.csv` declares `mode` as
`recorded` or `computed` for every property definition, so the gate is: a
property's declared mode must match which file its column lives in. That turns
those declarations from description into structure. 152 of them as of
2026-09-04 (110 recorded, 42 computed), up from 126 at filing.

## Two causes, measured 2026-08-18

They are different problems and want different fixes.

**A registry ends up holding authored judgment when its subject has no home for its own metadata.**
`tracker-board` and `tracker-tags` are 100% computed with zero authored columns,
because their source is `tracker/tasks/*.md`, files that carry frontmatter and
prose for their own sake. The board is a pure projection nobody hand-edits. The
four mixed registries are the ones whose subjects say nothing about themselves:
**zero of the 63 files under `docs/` carry frontmatter**, and a `.mjs` carries
none either. The authored judgment was homeless, the registry row was the only
place with a slot for that file, and the two merged.

**Per-value prose went to app code because the model had no table for it.**
`properties.gloss` says what a column means; until `docs/vocabularies.csv` was
created on 2026-08-16 nothing said what a *value* means. A component was the
only carrier that could both hold a sentence and render it. The prediction holds
on inspection: all five glossaries in `map.js` are per-value and none is
per-column.

## The survey

**32 closed value domains. Three have per-value meaning recorded in data.**

Layer 1, authored columns sharing a file with computed ones (4 registries, 17
authored beside 14 computed):

| registry | authored | computed |
| --- | --- | --- |
| registries | path, key, identity, kind, target, scope, fields, gate, area, title, gloss | renders_in |
| tests | kind, protects | assertions, assertion_names, method, runner, boot_smoke |
| docs | subject, status, maintenance | reach, words |
| harness | role | layer, lines, invocation, emits, named, tested |

Layer 2, authored values inside generator source (2 sites): `NOTES` in
`tools/build/pages-index.mjs` holds 26 hand-written page blurbs, and
`pages.note` is declared `computed` while a human writes it, so the
`mode` declaration is currently false. `INJECTED` / `PROJECT_FILES` in
`tools/build/docs-reach.mjs` is the authored decision about which docs are
injected, and the computed `reach` column derives from it.

Layer 3, authored value definitions inside app components (18 values in 5
glossaries): `map.js` holds `REACH` (5), `METHOD_HINT` (5), `KIND` (4),
`USE_LABEL` (2), `RUNNER_HINT` (2). More of the same in `estate.js`
(`ADOPT_VERDICT`, `DUE`) and `file-review.js` (`STATUS_TAG`).

Layer 4, presentation mappings (`KIND_TONE`, `INVOKE_TONE`, `MODE_ICON`,
`TYPE_ICONS`): a badge colour is a view decision, not a claim about the world.
These stay in the component, and this line is here so that staying is a decision
rather than an oversight.

## Settle first, because it changes the shape

Where does an authored half live: a sibling CSV keyed the same way, or the
subject file itself? Frontmatter is the estate's own working precedent
(`tracker-board` runs on it) and is clearly right for `docs/*.md`. It is clearly
wrong for `role` across 147 harness files, which would mean editing 147 files to
change a convention. Decide per registry, not globally.

Second, smaller: suffix (`docs.csv` + `docs-derived.csv`) or folder
(`authored/`, `derived/`). The folder is the stronger signal, since the boundary
would be visible in a file tree, and it moves 22 paths.

Third: `registries.csv` is 11 authored columns and one computed. A whole file
for one column of 22 values may cost more than it buys. The alternative is to
accept it as the one deliberate exception and say why in the row.

## Stages, each shipping green on its own

1. **Layer 3.** Move the five `map.js` glossaries into `docs/vocabularies.csv`,
   roughly doubling it. Smallest, clearest, and it exercises the join on real
   content before anything structural moves.
2. **Layer 2.** `NOTES` becomes an authored carrier; the injected list becomes
   data. This also corrects a false `mode` declaration, which stage 3's gate
   depends on being honest.
3. **Layer 1.** Split the mixed carriers per the decision above, and land the
   mode-matches-file gate alongside, since that gate is what keeps the split
   from decaying.

## Done when

Every property's declared `mode` matches the file its column lives in, a gate
holds it, and no authored value or per-value definition remains in a generator
or a component except the Layer 4 presentation mappings, which are named as
deliberate.

## Why it is worth carrying

The costs of mixing are already in the repo. The `words` merge-conflict snag
(SNAGS.md, 2026-08-10) fires for any two branches touching `docs/` and
disappears when a derived column stops sharing a file with authored prose. The
three restamping generators are read-modify-write merges rather than emitters
because of it. The commit hook's leg 3c fixpoint exists because `docs/README.md`
is generated from a registry it is also a row in. And `tests.csv`, 145 KB of
mostly machine output, hides a small authored table a reviewer would actually
read.

## Progress log
- 2026-08-18: filed out of the JSON-to-CSV migration (PR #441), which put every
  registry in a CSV and made the mixing legible for the first time. The survey
  above is measured against that branch's tip. Next step is the sibling-versus-
  frontmatter decision, which nothing else can proceed without.
- 2026-08-18: corrected after the vocabulary pass. The finding was stated as a rule about
  censuses and was mis-scoped: `pages` is a curated registry with exactly the same defect, its
  26 page blurbs living in the generator. The rule is about any registry whose rows describe
  files, not about one kind. Ids and the `kind` column changed in the same pass, so the tables
  above use the current names.
- 2026-09-04: Property count restamped, 126 to 152, during a refinement pass.
  The survey tables are deliberately not restamped: they are measured against
  the 2026-08-18 branch tip and carry the shape of the finding rather than
  totals. Unchanged and still first: the sibling-versus-frontmatter decision,
  which nothing else can proceed without.
