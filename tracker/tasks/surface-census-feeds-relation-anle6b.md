---
id: surface-registry-feeds-relation-anle6b
title: Make the cache-to-surface dependency checkable, not prose
status: backlog
opened: 2026-08-09
size: M
awaiting: nothing; PR #387 landed `feeds` as routed view keys, which retires this task's interim step
---
# Make the cache-to-surface dependency checkable, not prose

show-repo's State view (PR #387) gives each derived cache a `feeds` field naming
what depends on it. It was filed as free prose ("the Activity view, the Repos
cards' rollups, the Branches view's landed/stranded verdicts"), and #387 landed
it instead as an array of routed view keys rendered as chips that navigate. So
the edge is already linkable and readable in one direction. What remains is that
it is still **authored**, and still cannot be read the other way ("what does the
Activity view depend on?").

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
- `module -> view` is one authored field on a surface registry, saying which
  component backs each view key. Small and stable.
- `cache -> view` is the composition. Never stored, never authored, and so
  structurally unable to disagree with either input.

Note the correction this encodes: derivation alone yields
`activity.json -> lib/alpineComponents/estate.js`, which is COARSER than the
prose, because estate.js reads three of the four caches and backs several views.
The authored middle hop is what recovers the resolution, and it is why a pure
scanner does not solve this.

**Scope the registry to routed view keys**, the 22 the shell validates before
mount. That vocabulary is closed and already enforced in code, so a registry over
it is checkable against something. Chrome regions (the sidebar, quick links, the
app-view mechanism) have no closed vocabulary anywhere; inventorying them means
inventing the vocabulary and the registry in one move, with nothing to hold either
to. Leave them prose until a second consumer needs them named.

**Sub-view cases stay prose and get counted.** "The Repos cards' rollups", "the
branch rows' session links", "the Search view's session lane" are finer than any
view key. Carry them in a `note` beside the structured part; do not build a
locator refinement for them. The content registry's refinement earns its keep
across many rows, one field's prose does not.

**No overlap with `pages-catalog`.** A routed view is not a page:
`show-repo.html` is one page carrying all 22 views. Disjoint, but the registry
scope must say so, the way `harness` subtracts `tools/test/`.

## Scoped list
- ~~The cheap interim: a locator gate extracting view-name tokens from each
  `feeds` string.~~ Retired by #387, which made `feeds` an array of routed keys
  rather than prose, so there are no tokens to extract. The gate it described is
  now smaller and total rather than partial: assert every `feeds` entry is a
  routed key. Still worth doing first, still about twenty lines, still the
  `owners-registry.test.mjs` pattern, but it covers the field completely instead
  of roughly half.
- The surface registry itself: carrier, `target: a routed view`, the `component`
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
- 2026-08-10: #387 landed `feeds` as routed view keys (`['activity','guides','estate']`),
  not prose, which is what this task's scope decision had called for anyway. Three
  of its findings held on contact: the routed-key vocabulary was the right scope,
  chrome regions stayed prose, and the sub-view cases went to `docs/show-repo.md`
  rather than growing a locator. The interim gate shrank accordingly. Unblocked;
  the derivation-granularity finding is still the part worth not rediscovering.
- 2026-08-18: prose updated for the vocabulary retirement (web-tools PR #441): what this task
  proposes is a registry, and `census` is no longer a word the estate uses for one. The id keeps
  its original slug, since the board links by filename and a reader's handle is the title.
