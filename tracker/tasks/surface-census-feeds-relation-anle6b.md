---
id: surface-census-feeds-relation-anle6b
title: Make the cache-to-surface dependency checkable, not prose
status: in-progress
session: claude/surface-census-feeds-relation-1v5n23
opened: 2026-08-09
size: M
---
# Make the cache-to-surface dependency checkable, not prose

Each derived cache carries a `feeds` field naming what depends on it (PR #387,
an array of routed view keys rendered as chips that navigate). It is still
**authored**, and still answers in one direction only: nothing says what the
Activity view depends on.

## The design, settled and recorded so it is not rederived

**Do not author both sides.** `feeds` on a cache row and `reads` on a surface row
are one relation; two hand-kept sides is what `docs/registries.md`'s ownership
rule rejects.

**Two hops, composed.** Every cache read goes through a kit constant
(`RepoConfigCache.CACHE_PATH`, `RepoActivityCache.CACHE_PATH`, the sessions
kit's, `PATH`/`REG_PATH` on the entities pages), not scattered fetches, so:

- `cache → module` derives by scanning those constants. Nobody authors it.
- `module → view` is one authored field: which component backs each view key.
- `cache → view` is the composition. Never stored, so it cannot disagree.

**Why a pure scanner does not do it.** Derivation alone yields
`activity.json → estate.js`, coarser than the prose it replaces, because
estate.js reads three of four caches and backs several views. The authored middle
hop recovers the resolution.

**Scope: the 22 routed view keys** the shell validates before mount. Closed and
already enforced, so a registry over it is checkable against something. Chrome
regions have no closed vocabulary anywhere, so inventorying them means inventing
vocabulary and registry at once with nothing holding either; leave them prose
until a second consumer needs them. Sub-view cases ("the Repos cards' rollups")
are finer than any view key and ride a `note` beside the structured part. And a
routed view is not a page, `app/index.html` carrying all 22, so the scope must
say it is disjoint from `pages-catalog` the way `harness` subtracts `tools/test/`.

## Scoped list
1. A gate asserting every `feeds` entry is a routed key. ~20 lines on the
   `owners-registry.test.mjs` pattern. First, and total now that `feeds` is an
   array rather than the prose the gate was first scoped against.
2. The surface registry: carrier, `target: a routed view`, the `component` field,
   the scope above, and a row in `docs/properties.csv`.
3. The `cache → module` scanner, and the composition that replaces `feeds`.

## Done when
`feeds` is no longer authored, the edge answers both ways, and a renamed view
fails the suite rather than orphaning a string.

## Progress log
- 2026-08-09: Filed from the PR #388 session, against the reconciled registry
  model. Blocked only on #387 landing the subject field.
- 2026-08-10: #387 landed `feeds` as routed keys, which is what the scope
  decision had called for. Three findings held on contact: routed keys were the
  right scope, chrome regions stayed prose, sub-view cases went to
  `docs/show-repo.md`. Unblocked.
- 2026-08-18: Prose updated for the vocabulary retirement (PR #441): `census` is
  no longer a word the estate uses for a registry. The filename keeps its slug.
- 2026-09-04: `awaiting: nothing` dropped, `properties.json` corrected to `.csv`,
  `id:` restored to the filename per the frozen-slug rule, body cut from 839
  words. The derivation-granularity finding is the part worth not rediscovering.
- 2026-09-04: Claimed on `claude/surface-census-feeds-relation-1v5n23`.
