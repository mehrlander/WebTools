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

## What reconciliation found

Written 2026-08-09, after the estate was walked against the model rather than
the model against itself. The model was settled on 2026-08-08 and declared six
registries; the repo was running thirteen. The gap was not that the six were
wrong. It was that a declaration table with no population had nothing to be
wrong about, so seven mechanisms with a committed carrier and, in most cases, a
gate had never been asked to say what they govern.

Three of the seven turned out to be field-governable and are now declared and
checked: the owners table (below), the skills census, whose coverage was exact
and whose only guarantee had been that whoever last added a skill remembered to
add a row, and the pages catalog. Four could not be, and the reasons are facts
about their carriers rather than neglect, so each is declared
`fields: ungoverned` with a written `why` and the count is asserted. Counting
them is the point: omitted, they read as absent; declared, they read as four
carriers whose shape the field check cannot yet reach.

**The count is a ledger, and it has already moved down once.** The pages catalog
was in the ungoverned four for a matter of hours, on the stated reason that its
top level is a bare array of groups with no single row array to read. The fix
was not to reshape the carrier, whose layout show-repo reads for this repo and
for every other repo's pages catalog, but to teach the field check a group walk
(`rows: "[].items"`). The general lesson is worth more than the one row: an
`ungoverned` reason names a limitation, and the limitation is as often in the
gate as in the carrier. Read the four remaining as a worklist, not a taxonomy.
The group wrapper's own fields (`label`, `top`) stay undeclared on purpose:
they are structure, not assertions about a page, and take the same standing as a
carrier's note block.

**Three limits of the model surfaced, and none had been visible from inside
it.**

*A carrier can be distributed.* A registry names one carrier path. But the
authoritative statement of what a skill does is each skill's own `SKILL.md`,
one carrier per target, which the declaration table cannot express. This is why
the owners table's family rule stays where it is instead of moving into the
declarations array where its shape belongs.

*A deriver can live outside the repo.* `tracker/board.json` is entirely
computed, and every field would declare `mode: computed` with a deriver, except
that `build-board.py` ships inside the portable plugin. A computed declaration
must name a deriver that exists here, and this one correctly does not.

*A scope can overstate its own gate.* The docs census declared "every file under
docs/" while its gate walks `.md` and `.json` only, leaving four files inside
the stated scope and outside the check. Corrected here by narrowing the scope to
what is enforced, which is the honest direction: the four files are examples,
prototypes, and a favicon, and pulling them into a documentation census would be
filling rows to satisfy a gate.

### The owners table

`docs/owners.json` is the reconciliation's one relocation. It had been a second
block inside `docs/docs.json`, which is the arrangement this model exists to
forbid: a registry does not live inside another registry's carrier, and a
complete census and a curated catalog do not want the same checks. It also
carried no scope, which is why eleven rows read as a thin sample of the estate
rather than a population of the coordination layer, and no coverage gate, which
the catalog framing quietly excused.

Two changes beyond the move. Its scope is written down. And its rows are keyed
by one `subject` field and typed by a `kind`, replacing two mutually exclusive
keys that were doing the work of a type column, because the table was holding
two different objects: ten **assertions** about a repeated statement, and one
**declaration** binding a scope to the carrier that owns a property across it.

What was **not** done, and the reason is in this document: the table was not
flattened into one row per pair. Normalizing it would make the one-owner rule an
assertion over rows, which is attractive, but the storage rules above already
say a committed carrier is a denormalized join, convenient for the browser and
the diff, and the ownership rule is checkable on the nested shape by holding
`subject` unique. Flattening would also not close the hole it was proposed to
close: a second document quietly claiming an owned subject is undetectable in
either shape, because detection needs a corpus scan and not a schema. That is
the detectors' job, and they exist.

The gate that was missing is now there and is a maintenance check, not a
coverage one: every path a locator names must resolve. It stood at 29
references, 0 unresolved, on the day it was written. Whether the table is worth
keeping current was unanswerable before, since nothing would have reported the
rot. It is now observable.

## Federation

How finely responsibility is delegated is a configuration choice, not a
model feature. A workspace that runs its own registries (budget-drs inside
home) declares them in its own properties registry; the repo-level table
covers the repo's own carriers and does not enumerate a project's internals.
The integrity rule spans levels unchanged: no pair, anywhere, has two owners.

### Two normal forms, and how to pick

*(2026-08-09, from walking the origin instrument against this document)*

budget-drs's `properties.csv` and this repo's `properties.json` express the same
model in different normal forms, and neither should convert to the other.

This repo factors a **registries** object out of its declarations, because
several properties share one carrier: five sit on `docs/docs.json` alone, and
without the factoring the carrier, scope, and gate would be restated on every
one of them. budget-drs declares twenty properties across twenty distinct
carriers, so the same factoring would add an object layer with exactly one
declaration hanging off each entry, holding nothing together.

**Fan-out decides it.** One carrier to many properties wants the registry
object; one-to-one does not. That is a property of the estate being described,
not of the describer, so a repo adopting this model picks the form its own
carriers imply rather than the form the hub happens to use. Neither is the
canonical shape.

**The borrowing runs both ways, and the first attempt at it failed usefully.**
The origin instrument carries a field this one lacks: `definition_owner`, naming
per property the document that defines its value domain (`SOURCES.md` owns
`production_mode`'s values, `GRAINS.md` owns `additivity`'s). This document
recorded it as worth adopting. Adopting it was then tried, and should not be.

Reading all 39 declarations to fill the field showed why the hub never had it.
In budget-drs, every one of the twenty properties is defined by a separate
design document, because that repo has a design-doc layer: `SCHEMA.md`,
`GRAINS.md`, `SOURCES.md`, `LAYERS.md`. In the hub, almost every domain is
defined in its own carrier's `note` or in a glossary block beside the rows
(`kinds` in `docs/tests.json`, `layers` in `docs/harness.json`), because here
the carrier's note *is* the design document. The field would have been populated
on a handful of rows and blank on the rest, and a field that is blank by
construction teaches a reader nothing.

**Where a hub domain genuinely is defined elsewhere, the owners table already
says so**, which is the answer to the question `definition_owner` was going to
answer. The code layers are `docs/code-layers.md`'s, and an owners row records
it. That is the table doing exactly its job, and it is a better home for the
relation than a column, because it also carries how the copy relates and what
holds it.

**What the attempt actually found was a missing gate.** Filling the field meant
reading every closed domain, and doing that turned up `analysis_use` declared
open here while the content-registry skill closes it at five values, plus the
larger point: this registry declared eight closed domains and *read none of
them*. budget-drs's `verify-properties.py` hard-fails on any value outside a
declared set, and that hard-fail is most of what makes its registry
load-bearing. The hub's gate checked field names and never values. It now checks
both, 431 values across the eight domains, and the content-registry copy is
recorded in the owners table as the unchecked hand-kept copy it is. The
borrowing was real; it was just a check rather than a column.
