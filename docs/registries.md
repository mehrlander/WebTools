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
| **target** | the thing a registry asserts about; not always a file | a docs path, a page, a manifest key, a prose field name, a task |
| **property** | a recognized attribute that may be asserted about a target | role, protects, reach, creation_mode |
| **assertion** | one target's value for one property; a blank is not an assertion | `docs/venues.md . status = living` |
| **scope** | the population a declaration covers | the docs shelf, the harness shelf, a project |
| **registry** | the authoritative committed record of assertions | docs.json, tests.json, harness.json, portable.json |
| **carrier** | the committed file a registry is stored in; not one to one, since one file may carry several registries | docs/routes.json carries three |
| **gate** | the test that fails when a carrier and the repo disagree; this system's foreign keys, because git has none | properties-registry.test.mjs |
| **declaration** | binds `scope × property → registry`: which registry owns a property, and how hard | a row in properties.json's `declarations` |
| **census** | a registry whose scope is intensional: a predicate over the tree; coverage gated, blanks counted | docs.json, tests.json, harness.json |
| **catalog** | a registry whose scope is extensional: the rows are the membership, curation is the definition | portable.json, tools.json, content.csv |
| **crosswalk** | a catalog that curates *which* targets belong and leaves their description to the census that owns them | tools.json over pages.json |
| **properties registry** | the declaration table: every property's registry, mode, and enforcement | properties.json |
| **area** | which side of one question a registry falls on, the reader's grouping | files, names |
| **shelf** | a tree-defined population, the usual way a census scope is written | docs/, tools/test/, tools/ + scripts/ |
| **projection** | a generated view of registry data, never authoritative, never edited | tracker board.md, docs/README.md |

**Carrier, gate and target were used from the start and defined nowhere**, which
is how this table came to be audited on 2026-08-13: `carrier` ran to 225 uses
across 26 files and `gate` to 154 across 39, and `carrier` was load-bearing
inside the one definition that did exist ("a **registry** is the committed
carrier of assertions"), so the defined term rested on an undefined one. The
repo's own vocabulary tool could not see either, by construction: `vocab.py`
tiers a term `assumed` only when it is multi-word or hyphenated, so a bare
undeclared noun is invisible to it however often it runs. Nothing was going to
find these but a reader.

Two of the rows above are new mechanisms rather than back-filled words.
**Crosswalk** names the shape two catalogs had already grown into, and **area**
is the grouping the Registries tab renders. Both are gated.

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

### The gate that was missing, and what it found

The paragraph above was written on 2026-08-08 and nothing read it until
2026-08-13. Its own gate did not exist: `properties-registry.test.mjs` held six
checks and every one of them compared a registry against **its own** carrier,
so the one rule requiring a cross-registry read was the only rule with nothing
behind it. It was false in two places when the gate first ran:

| Pair | Property | Targets | State |
| --- | --- | --- | --- |
| harness-census × portable-catalog | `role` | 9 scripts | paraphrases; `text-census.py` already stale, harness knowing about `.mjs` and `.py` and portable not |
| pages-catalog × tools-gallery | `title`, `note` | 4 pages | `note` differed on all four, `title` on one |

Both are now resolved by **inheritance**, and the manner matters more than the
fix. A rename would have satisfied the gate while leaving one claim stored
twice, which is worse than the collision it hides: the duplication survives and
the instrument that could find it is defused. So the rule is: decide which
registry owns the claim, blank it in the other, join at render time.

The gate decides on **assertions, not declarations**. Two registries may declare
the same property name, which is common and fine (`kind`, `role`, `title` and
`note` all recur); what fails is both carrying a **value** for it on one target.
That is what lets a crosswalk declare a property it fills only where no census
owns it: portable-catalog still declares `role`, blank on the nine scripts and
present on the seventeen skills, whose `skills-catalog` row carries a
model-facing trigger description rather than a reader's one-liner.

Comparison needs an identity space, since the same page is `annotate.html` to
the pages catalog and `pages/annotate.html` to the tools shelf. A registry
declares `identity`: `path` where its key is a repo-relative path,
`path:<prefix>` where it is relative to one, absent where the key is opaque. An
opaque target never collides, which is honest rather than lax: a route key and a
docs path are not the same kind of name, so no comparison of them means
anything. Matching is exact, so `content.csv`'s directory locators do not
collide with the files beneath them; nesting stays a scope question, handled by
subtraction as above.

One more thing the fix needed, and it generalizes past this rule: **a gate that
passes on a clean tree would pass identically if it were broken.** The suite
therefore drives the same normalizer with a synthetic pair, so the detector is
held to detecting.

### The crosswalk shape

Both resolutions produced the same object, so it has a name. A **crosswalk** is
a catalog that curates *which* targets belong to something and leaves each
target's description to the census that owns it. `docs/tools.json` asserts only
which pages the Tools view shelves and what icon each gets; `docs/portable.json`
asserts only what travels, how a consumer takes it, and its invocation.

The count does not fall when a registry becomes one. Reshaping tools-gallery
leaves sixteen registries, not fifteen: a crosswalk asserting `icon` about a
page is still a registry with a target and a property. What goes away is the
duplication, which is the better win and worth naming as itself.

A crosswalk pays for its shape with a gate of its own, because dropping a field
makes a new silent failure possible: a shelved row whose page is gone renders
with no title and no description at all. So every `tools.json` row must resolve
to a row in `pages/pages.json`, checked.

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

**What no registry reaches at all** is the prose living inside `.js` and
`.html`. [`data/design/content.csv`](../data/design/content.csv) covers it by
declaring it `exclude`, which is an honest accounting rather than a fix;
[`text-content.md`](text-content.md) measures what that hides and proposes a
carrier for it.

**The index governs the carriers and nothing governed the index.** A registry
row in `properties.json` was itself an unaccounted classification: the field
check above reaches into the carriers and cannot reach the file it reads them
from, because that file is the index rather than a peer among the sixteen. So
the gate now applies the same rule to itself, holding the registry row to a
named field set. Adding a field to a registry row is a deliberate act that has
to change a test, on the same reasoning as `fields: ungoverned`.

## The reader's view

Three fields exist for the person reading the tab rather than for the model, and
they are declared and gated like everything else, because a classification held
in a renderer's source is exactly the unaccounted kind.

- **title**: the identity, two or three words. "Documentation inventory", "Test
  coverage map", "Renderer dispatch table". A reader meets this before the
  mechanics.
- **gloss**: one sentence on what the registry governs, for someone who does not
  already know. Every *declaration* carried a gloss from the start and no
  *registry* did, and closing that asymmetry is what these two fields are.
- **area**: which side of one question the registry falls on.

| Area | The membership question | Count |
| --- | --- | --- |
| **files** | Does the target have a path in this tree? | 9 |
| **names** | Everything else: a name something declared, the registry being what declares it | 7 |

The question is the point, not the label. Without a stated rule the grouping is
re-litigated on every addition, so the rule has to be answerable cold, by
someone who has never read this file. "Does it have a path" is; a topical
judgment is not.

Files takes 9 of 16, so the split does little sorting. That is accepted rather
than fixed: a mechanical rule anyone can apply cold is worth more than a
balanced one that needs a judgment call, and if `names` ever earns a subdivision
it can be split then, from a boundary that already holds.

**The first attempt was three areas and it did not survive contact.** Files were
`contents`, and the seven names were split into `conventions` and a
`presentation` group holding the routes, the showing mechanisms, and the
surfacing primitives. That grouping was **topical**, and the topic did not
describe the targets. Two of its four are names a program parses:
`routes-routes` owns `toss-render.html`'s inlined `TOSS_ROUTES` literal and
`routes-modes` is what the renderer dispatches on. The other two are vocabulary
a person picks from when writing. `manifest-fields`, filed under conventions,
is a program-parsed key like the routes, so the label had it on the wrong side.

The seam that actually exists inside `names` is program-parsed versus
human-chosen, and it was not adopted, because it classifies by the target's
**consumer** rather than by the target. The model says a registry is defined by
what it asserts about, so a consumer axis would be a second dimension wearing
one field. Better to keep one axis that is right than two that are tangled.

Two naming notes, both collisions caught before they landed. `domain` was the
first candidate for `area` and means the permissible value set throughout this
document. `family` was the second and is already `owners.kind`'s value for a row
that declares a rule over a scope. `title` was preferred to `label` because five
registries already use `title` for a display name while `pages-catalog.label` is
the slug.

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

All seven turned out to be field-governable, and every one is now declared and
checked. That was not the first answer. Five were initially marked
`fields: ungoverned` with a written reason, and the count was asserted so it
could only move deliberately. It moved four times in two days, always down, and
ended at zero.

**The escape hatch went nought for five, and that is the finding.** Each reason
sounded like a fact about a carrier. Each was wrong:

| Registry | The reason given | What was true |
| --- | --- | --- |
| pages catalog | a bare array of groups, no single row array to read | the field check assumed one flat array; `rows: "[].items"` walks the groups |
| tracker board | the deriver ships in the plugin, not this repo | `.claude/skills/tasks/build-board.py` is vendored here and always was |
| routes manifest | four sibling blocks, not one population | several registries may share a carrier with different `rows`; it is three |
| surfacing index | an index of prose, no properties to declare | twenty rows carrying six fields |
| manifest fields | the target is a key, not a row | the target grain is irrelevant, and `fields` is a row array |

Two were false statements about the repo. Three were true statements about the
gate mistaken for statements about the carrier. None survived being checked, and
the checking took minutes in each case, because the answer was always visible in
the carrier itself.

**So the ledger is now a prohibition.** The assertion reads zero rather than a
count, and `fields: ungoverned` remains only so that adding one is a deliberate
act that has to change a test. Treat the field as a smell and never a resting
state: the record says a reason to leave a carrier ungoverned is more likely to
be an unchecked assumption than a fact.

### The same audit, run on `required`

`why` was wrong five times because nothing read it. That is a property of
unchecked authored fields, not of that field, so the obvious next question was
which other claim in this table nothing reads. `required` was the answer.

Fifty-four declarations graded a property `value`, meaning an assertion is
present for every target. Nothing checked any of them; the value gate read only
the closed domains. Three were false:

- `tests-census.assertions` and `boot_smoke`, blank on the ten browser-driven
  checks that are not `node:test` files. Blank there is correct and meaningful,
  never zero, because `test()` is not their unit. The **grade** was wrong, and
  both are now `counted`, which is what a blank worth counting has always meant.
- `pages-catalog.title`, blank on one page that genuinely had no `<title>`.
  Here the **data** was wrong, and the page got a title.

Both repairs are in the table, and they are not the same repair: one moved the
claim to fit the world, the other moved the world to fit the claim. Deciding
which way to go is the judgment the gate cannot make, which is why it reports
rather than fixes.

`value` now means what it says on every governed property, not only the ones
carrying a closed domain: 2,304 presence assertions across 52 declarations,
where there were none.

**The general rule this table keeps teaching.** An authored field that no gate
reads will be wrong, and the error rate is not small: `why` ran nought for five,
`required` ran fifty-one for fifty-four. Both were written carefully by someone
who believed them. The fix is never to write more carefully; it is to make the
claim readable by a check, or to stop making it.

### Where the audit stops, and why

`values` is the third of the authored trio and it does not get the same
treatment, because the check that would do it cannot decide.

A declared domain is enforced against the data. The reverse, that a property
with a closed domain has one declared, is not, and the tempting heuristic is a
ratio: few distinct values over many rows means a closed vocabulary. Run it and
it flags four. Two are real and now declared: `harness-census.layer`, six values
over 113 rows, whose domain was already written in the carrier's own `layers`
glossary; and `portable-catalog.use`, five over forty.

The other two are exactly why this stays a judgment. `tracker-board.project`
shows eight values over thirty-two rows and `tests-census.runner` ten over 129,
and both are *young enumerations, not closed vocabularies*. Every new project
and every new npm script adds a value. Closing them would turn ordinary growth
into a build failure and teach everyone to widen the declaration without
thinking, which is worse than not checking. `harness-census.invocation` makes
the point sharply: it reads as twenty-one distinct values because it carries
`npm:<script>`, a grammar rather than an enumeration, and no ratio can see the
difference.

So the rule above has a boundary worth stating with it. Make a claim readable by
a check **where a check can decide**. Where it cannot, the honest move is to say
so here rather than to ship a gate that is right twice and wrong twice and
therefore ignored. A noisy gate is a third way for an unchecked claim to hide.

**Two limits of the model surfaced, and neither had been visible from inside
it.** A third was claimed and was not real, which is recorded above.

*A carrier can be distributed.* A registry names one carrier path. But the
authoritative statement of what a skill does is each skill's own `SKILL.md`,
one carrier per target, which the declaration table cannot express. This is why
the owners table's family rule stays where it is instead of moving into the
declarations array where its shape belongs.

*A scope can overstate its own gate.* The docs census declared "every file under
docs/" while its gate walks `.md` and `.json` only, leaving four files inside
the stated scope and outside the check. Corrected by narrowing the scope to what
is enforced, which is the honest direction: the four files are examples,
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
both, and the content-registry copy has since gained a lockstep of its own
(`content-domain-lockstep.test.mjs`) comparing the declared domains token for
token against the skill bullets that define them, so the owners row that said
"nothing holds them together" now names what does. The borrowing was real; it
was just a check rather than a column.
