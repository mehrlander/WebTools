---
id: surface-census-feeds-relation-anle6b
title: Make the cache-to-surface dependency checkable, not prose
status: backlog
opened: 2026-08-09
size: M
awaiting: PR #387 (the State view) to land; the `feeds` field it introduces is the subject
---
# Make the cache-to-surface dependency checkable, not prose

show-repo's State view (PR #387) gives each derived cache a `feeds` field naming
what depends on it, in free prose: "the Activity view, the Repos cards' rollups,
the Branches view's landed/stranded verdicts". The strings name real things and
nothing recognizes them, so the edge cannot be linked, checked, or read the
other way ("what does the Activity view depend on?").

The registry reconciliation (PR #388) settled enough of the surrounding model
that this is now a shaped problem rather than an open one. Recording the design
so a later session does not rederive it.

**Do not author both sides.** `feeds` on a cache row and `reads` on a surface row
are one relation, and two hand-kept sides is exactly the configuration the
ownership rule in `docs/registries.md` rejects. Filing that shape the week after
the reconciliation removed the old instances would be a regression.

**The two-hop composition instead.** Measured 2026-08-09: every cache read goes
through a kit constant (`RepoConfigCache.CACHE_PATH`, `RepoActivityCache.CACHE_PATH`,
the sessions kit's, and `PATH`/`REG_PATH` on the two entities pages), not
scattered fetches, so:

- `cache -> module` derives by scanning those constants. Nobody authors it.
- `module -> view` is one authored field on a surface census, saying which
  component backs each view key. Small and stable.
- `cache -> view` is the composition. Never stored, never authored, and so
  structurally unable to disagree with either input.

Note the correction this encodes: derivation alone yields
`activity.json -> lib/alpineComponents/estate.js`, which is COARSER than the
prose, because estate.js reads three of the four caches and backs several views.
The authored middle hop is what recovers the resolution, and it is why a pure
scanner does not solve this.

**Scope the census to routed view keys**, the 22 the shell validates before
mount. That vocabulary is closed and already enforced in code, so a census over
it is checkable against something. Chrome regions (the sidebar, quick links, the
app-view mechanism) have no closed vocabulary anywhere; inventorying them means
inventing the vocabulary and the census in one move, with nothing to hold either
to. Leave them prose until a second consumer needs them named.

**Sub-view cases stay prose and get counted.** "The Repos cards' rollups", "the
branch rows' session links", "the Search view's session lane" are finer than any
view key. Carry them in a `note` beside the structured part; do not build a
locator refinement for them. The content registry's refinement earns its keep
across many rows, one field's prose does not.

**No overlap with `pages-catalog`.** A routed view is not a page:
`show-repo.html` is one page carrying all 22 views. Disjoint, but the census
scope must say so, the way `harness-census` subtracts `tools/test/`.

## Scoped list
- The cheap interim, available as soon as #387 lands and worth doing first: a
  locator gate that extracts view-name tokens from each `feeds` string and
  resolves them against the routed key list. Roughly half the prose becomes
  checkable, and it fails when a view is renamed out from under a string. Same
  pattern as `tools/test/owners-registry.test.mjs`, pointed at a different
  vocabulary. About twenty lines, no census required.
- The surface census itself: carrier, `target: a routed view`, the `component`
  field, a scope naming the 22 keys and their disjointness from `pages-catalog`,
  and a row in `docs/properties.json`.
- The `cache -> module` scanner, and the composition that replaces `feeds`.

## Done when
`feeds` is no longer an authored field, the cache-to-view edge answers in both
directions, and a renamed view fails the suite rather than silently orphaning a
string.

## Progress log
- 2026-08-09: Filed from the PR #388 session. Design settled against the
  reconciled model; the derivation-granularity finding above is the part worth
  not rediscovering. Blocked on #387 only because the subject field does not
  exist on main yet.
