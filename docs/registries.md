# Registries: the metadata model

How the estate keeps stored information about files, settled 2026-08-08 after
the harness census re-derived, without noticing, the convention budget-drs had
already built as its controlled-property registry. This document states the
model once so the next accounting is an instance of it rather than a third
invention. It is written to travel; the origin instrument is budget-drs's
`properties.csv` in `mehrlander/home`, and this repo's declaration table is
[`properties.json`](properties.json), gated by
[`properties-registry.test.mjs`](../tools/test/properties-registry.test.mjs).

## The model

Five things, normalized. A **target** is anything addressable by locator, files
being the common case (budget-drs asserts properties of tables and rows; a
content-registry locator can refine below a file). A **property** is a named
classification with a value domain. A **scope** is the population a
declaration covers. A **registry** is the committed carrier of assertions. A
**declaration** binds `scope × property → registry`; an **assertion** binds
`target × property → value`.

The load-bearing choice is what an assertion does *not* carry: its registry.
The carrier is resolved through the declaration, which is what makes "one
target must not answer to two registries" a checkable configuration rule
rather than a comment in a generator. The committed JSON and CSV files are
denormalized joins of declarations with their assertions, one file per
registry, convenient for the browser and the diff. The test suite is the
integrity layer: gates are this system's foreign keys, because git has none.

## Vocabulary

| Word | Means | Examples here |
| --- | --- | --- |
| **property** | a recognized attribute that may be asserted about a target | role, protects, reach, creation_mode |
| **scope** | the population a declaration covers | the docs shelf, the harness shelf, a project |
| **registry** | the authoritative committed record of assertions | docs.json, tests.json, harness.json, portable.json |
| **census** | a registry whose scope is intensional: a predicate over the tree; coverage gated, blanks counted | docs.json, tests.json, harness.json |
| **catalog** | a registry whose scope is extensional: the rows are the membership, curation is the definition | portable.json, tools.json, content.csv |
| **properties registry** | the declaration table: every property's registry, mode, and enforcement | properties.json |
| **shelf** | a tree-defined population, the usual way a census scope is written | docs/, tools/test/, tools/ + scripts/ |
| **projection** | a generated view of registry data, never authoritative, never edited | tracker board.md, docs/README.md |

Census and catalog are not two species of registry; they are two ways of
giving the scope. That is also why a catalog can never carry a coverage gate:
there is no independent population to check it against, only
promise-to-implementation gates like the portable catalog's.

## The integrity rule: ownership, not overlay

Any applicable `target × property` resolves to **at most one** authoritative
registry, exactly one where the declaration requires it. Two registries
claiming the same pair is an **invalid configuration**, surfaced by the gate,
never resolved by precedence. Where nesting is intended, the subtraction is
written into the scope definition (the harness shelf is "code under `tools/`
and `scripts/`, *except* `tools/test/`, which the tests census owns"), so
disjointness stays explicit and the check stays simple.

The contrast that earns the rule its name: `.paths.json` keeps its
nearest-declaration-wins cascade because frozen-ness has **overlay**
semantics, many declarers layering policy over nested scopes, refinement being
the point. Property assertions have **ownership** semantics, one authoritative
answer per pair. Overlay resolves quietly; ownership must fail loudly, because
knowing that two registries contend is the entire value of the governance
layer.

## Declarations

Each declaration carries, beyond its property and registry:

- **mode**: `recorded` (authored judgment, irreplaceable, never machine-
  edited) or `computed` (stamped by a named **deriver**, held to a
  re-derivation by a lockstep or registry gate, never hand-edited). Mode sits
  on the declaration, not the property, since the same property could be
  recorded in one scope and computed in another.
- **required**: what the gates actually enforce today, not an aspiration.
  `value` (an assertion is present for every target; true of every computed
  field by construction, and of recorded fields a gate checks),
  `counted` (a blank is legal and surfaced as a ledger figure, the
  count-rather-than-ban posture the censuses run for authored judgment), or
  `none` (optional, or filled by practice with no gate behind it).
- **values**: the closed domain where one exists; open otherwise.

## The schema boundary

The properties registry is not a schema registry. Its reach is exactly this:
for a **governed** carrier, the registry names the carrier's key field
(structural identity, exempt), and every other per-row field must be a
declared property, because an undeclared field appearing in a census is the
early symptom of an unaccounted classification, which is the drift this
instrument exists to catch. Registry-level blocks (a note, a glossary) are the
carrier's own metadata and outside the rule. Files the registry does not
govern are untouched by it.

## Storage rules

Where an assertion lives follows from its mode and its readers. **Recorded**
values are stored, always: judgment cannot be recomputed. **Computed** values
are stored only where a page or a gate needs a committed artifact (the browser
fetches files, it does not run generators; a gate needs a stable thing to
hold; a diff makes a derived change reviewable), and then lockstep discipline
applies. What a live read already answers is never stored, branch state and
CI status being the standing examples. Model-bridged output (a bulk model
read-through standing in for judgment) is stored when it is expensive and
irreproducible, regenerated when it is scripted; chat-histories' two catalog
layers are the worked precedent.

## Federation

How finely responsibility is delegated is a configuration choice, not a
model feature. A workspace that runs its own registries (budget-drs inside
home) declares them in its own properties registry; the repo-level table
covers the repo's own carriers and does not enumerate a project's internals.
The integrity rule spans levels unchanged: no pair, anywhere, has two owners.
