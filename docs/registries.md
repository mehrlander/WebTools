# Registries: the metadata model

How the estate keeps stored information about its own contents, settled
2026-08-08 after the harness registry re-derived, without noticing, the
convention budget-drs had already built as its controlled-property registry.
This document states the model once so the next accounting is an instance of it
rather than a third invention. It is written to travel; the origin instrument is
budget-drs's `properties.csv` in `mehrlander/home`.

**What each field means is not here.** The declaration table is
[`registries.csv`](registries.csv), one row per registry; its columns are
declared in [`properties.csv`](properties.csv), one row per column; the values of
every closed domain are glossed in [`vocabularies.csv`](vocabularies.csv). All
three render in the app's **Map view, Registries tab**, which defines its own
columns from them, so a reader who wants to know what `membership` or `required`
holds should open the tab rather than read a paragraph about it. Gated by
[`properties-registry.test.mjs`](../tools/test/properties-registry.test.mjs).

This document carries what the tab cannot: the model, and the reasons.

## The model

Five things, normalized. A **target** is anything addressable by locator, files
being the common case (budget-drs asserts properties of tables and rows; a
content locator can refine below a file). A **property** is a named
classification with a value domain, **closed** when its values are enumerated and
**open** otherwise. A **scope** is the population a declaration covers. A
**registry** is the committed carrier of assertions, one registry to one file. A
**declaration** binds `scope × property → registry`; an **assertion** binds
`target × property → value`, and a blank is not an assertion.

The load-bearing choice is what an assertion does *not* carry: its registry. The
carrier is resolved through the declaration, which is what makes "one target must
not answer to two registries" a checkable configuration rule rather than a
comment in a generator. The committed CSVs are denormalized joins of declarations
with their assertions, convenient for the browser and the diff. The test suite is
the integrity layer: gates are this system's foreign keys, because git has none.

A **projection** is a generated view of registry data, never authoritative and
never edited: `tracker/board.md`, `docs/README.md`.

**A registry is a registry.** There are no species of them, and the words that
implied there were are retired. `census`, `catalog` and `crosswalk` were values
of a single `kind` column from 2026-08-09 to 2026-08-18, and that column answered
two questions at once. The tell was in the app: `crosswalk` had to be unioned
back into `catalog` to count the set correctly, then counted again on its own,
because it was never a third answer to the first question. The two questions are
now `membership` (can the row set be recomputed) and `inherits` (whose
descriptions does it borrow), each with an answer that states a fact rather than
names a kind. They cut across each other rather than nesting.

## The integrity rule: ownership, not overlay

Any applicable `target × property` resolves to **at most one** authoritative
registry, exactly one where the declaration requires it. Two registries claiming
the same pair is an **invalid configuration**, surfaced by the gate, never
resolved by precedence. Where nesting is intended, the subtraction is written
into the scope definition (the harness scope is code under `tools/` and
`scripts/`, *except* `tools/test/`, which the tests registry owns), so
disjointness stays explicit and the check stays simple.

The contrast that earns the rule its name: `.paths.json` keeps its
nearest-declaration-wins cascade because frozen-ness has **overlay** semantics,
many declarers layering policy over nested scopes, refinement being the point.
Property assertions have **ownership** semantics, one authoritative answer per
pair. Overlay resolves quietly; ownership must fail loudly, because knowing that
two registries contend is the entire value of the governance layer.

Three things follow, and each was learned by getting it wrong:

**Resolve a collision by inheritance, never by renaming.** The rule was written
on 2026-08-08 and nothing read it until 2026-08-13, when its gate was finally
built and found the rule false in two places (`role` on nine scripts, shared by
harness and portable; `title` and `note` on four pages, shared by pages and
tools). A rename would have satisfied the gate while leaving one claim stored
twice, which is worse than the collision it hides: the duplication survives and
the instrument that could find it is defused. Decide which registry owns the
claim, blank it in the other, join at render time.

**The gate decides on assertions, not declarations.** Two registries may declare
the same property name, which is common and fine (`kind`, `role`, `title` and
`note` all recur); what fails is both carrying a **value** for it on one target.
That is what lets an inheriting registry declare a property it fills only where
no computed set owns it.

**Comparison needs an identity space**, since the same page is `annotate.html` to
the page gallery and `pages/annotate.html` to the Tools gallery. That is what
`identity` is for. An opaque key is comparable to nothing, which is honest rather
than lax: a route key and a docs path are not the same kind of name, so no
comparison of them means anything. Matching is exact, so `content.csv`'s
directory locators do not collide with the files beneath them; nesting stays a
scope question, handled by subtraction as above.

And one rule that generalizes past this one: **a gate that passes on a clean tree
would pass identically if it were broken.** The suite drives the same normalizer
with a synthetic pair, so the detector is held to detecting.

## The schema boundary

The properties registry is not a schema registry. Its reach is exactly this: for
a **governed** carrier, the registry names the carrier's key field (structural
identity, exempt), and every other per-row field must be a declared property,
because an undeclared field appearing in a computed set is the early symptom of
an unaccounted classification, which is the drift this instrument exists to
catch. Registry-level blocks are the carrier's own metadata and outside the rule.
Files the registry does not govern are untouched by it.

**What no registry reaches at all** is the prose living inside `.js` and `.html`.
[`data/design/content.csv`](../data/design/content.csv) covers it by declaring it
`exclude`, which is an honest accounting rather than a fix;
[`text-content.md`](text-content.md) measures what that hides and proposes a
carrier for it.

**The index governs the carriers, and now itself.** A registry row in the
registry index was an unaccounted classification of exactly the kind the field
check catches everywhere else, and the check could not reach the file it reads
the carriers from. The gate now applies the same rule to itself. The
self-reference terminates the way `docs/README.md`'s does, being generated from
the registry it is a row in: one more pass settles it, and the gate asserts
convergence rather than assuming it.

**CSV is the format for one reason, and it is not readability: a CSV cannot hold
two tables.** That is what makes "a registry is a file" true by construction
rather than by convention, and it is what let `carrier`, `rows` and `format`
collapse into a single `path` on 2026-08-16. `carrier` existed only to name a
file that might hold several registries; with one table per file the word had
nothing left to mean. The gate asserts a `path` is a plain file path, so two
registries cannot quietly move back into one file.

The one thing CSV costs is the null. A blank cell cannot be told from an empty
string, so **a blank means NOT ASSERTED**, and any property that must distinguish
"checked, and the answer is none" carries an explicit token. `gate` is the first:
`none` where nothing holds a registry, never a blank. Read the token, never the
truthiness. A renderer that tested `gate` for truth showed a shield linking to a
file called `none` for eleven days while the ledger figure beside it, which read
the token, had the count right.

## The reader's view

Four fields exist for the person reading the tab rather than for the model
(`title`, `gloss`, `area`, and the derived `renders_in`), and they are declared
and gated like everything else, because a classification held in a renderer's
source is exactly the unaccounted kind.

**`area` groups the tab, and the question is the point, not the label.** Without
a stated rule the grouping is re-litigated on every addition, so the rule has to
be answerable by someone who has never read this file. "Does the target have a
path in this tree" is; a topical judgment is not. Files takes half the rows, so
the split does little sorting, and that is accepted: a rule anyone can apply is
worth more than a balanced one that needs a judgment call.

**The first attempt was three areas and it did not survive contact.** The names
were split into `conventions` and a `presentation` group, a **topical** grouping
whose topic did not describe the targets: two of its four are names a program
parses, the other two vocabulary a person picks from, and `manifest-fields` sat
under conventions while being a program-parsed key like the routes. The seam that
does exist inside `names` is program-parsed versus human-chosen, and it was not
adopted either, because it classifies by the target's **consumer** rather than by
the target. A registry is defined by what it asserts about, so a consumer axis
would be a second dimension wearing one field. One axis that is right beats two
that are tangled.

**`renders_in` is derived**, the files under `lib/`, `pages/` and `app/` that
name a registry's path in code, stamped by
[`registries-reach.mjs`](../tools/build/registries-reach.mjs) over the same
comment-stripped corpus as the docs registry's `reach`. It exists because the
audits below converge on one law: an authored claim nothing reads goes wrong. A
registry no surface renders is that exposure at the registry grain, committed and
gated and met by nobody. The badge asks the question; it does not settle it,
since a GitHub-rendered projection is a legitimate answer.

Its first run also caught a defect in the shared scanner: a `/*` inside a `//`
line comment opened a phantom block that swallowed hundreds of code lines, which
had been mis-filing `docs/app-routes.csv` as an orphan. An instrument built to
find unread carriers found a bug in the instrument it was copied from, which is
the pattern working. Its second lesson is duller and cost more: the corpus
boundary is a literal list of directories, and when the app moved from `pages/`
to `app/` nothing here moved with it, so the scanners read the app without
reading the app's own shell.

## Storage rules

Where an assertion lives follows from its mode and its readers. **Recorded**
values are stored, always: judgment cannot be recomputed. **Computed** values are
stored only where a page or a gate needs a committed artifact (the browser
fetches files, it does not run generators; a gate needs a stable thing to hold; a
diff makes a derived change reviewable), and then the gate holds it to its source.
What a live read already answers is never stored, branch state and CI status
being the standing examples. Model-bridged output is stored when it is expensive
and irreproducible, regenerated when it is scripted; chat-histories' two catalog
layers are the worked precedent.

## What the audits keep teaching

Three passes over this table, each on a different authored field, produced one
finding and two boundaries on it.

**An authored field that no gate reads will be wrong, and the error rate is not
small.** `why` ran nought for five: five carriers were marked `fields:
ungoverned` with a written reason, and every reason was either a false statement
about the repo or a true statement about the gate mistaken for one about the
carrier. None survived being checked, and the checking took minutes in each case.
`required` then ran fifty-one for fifty-four: fifty-four declarations graded a
property `value` and nothing checked any of them, and three were false. Both
fields were written carefully by someone who believed them. The fix is never to
write more carefully; it is to make the claim readable by a check, or to stop
making it. `fields: ungoverned` now asserts zero and remains only so that adding
one is a deliberate act that has to change a test.

**The repair is a judgment the gate cannot make.** Of the three false `required`
grades, two moved the claim to fit the world (`tests.assertions` and `boot_smoke`
are blank on browser-driven checks, where blank is correct and meaningful because
`test()` is not their unit, so both became `counted`) and one moved the world to
fit the claim (`pages.title` was blank on a page that genuinely had no `<title>`,
and the page got one). That is why the gate reports rather than fixes.

**Make a claim readable by a check where a check can decide.** `values` is the
third of the authored trio and does not get the same treatment. The tempting
heuristic is a ratio: few distinct values over many rows means a closed
vocabulary. Run it and it flags four. Two are real. The other two are *young
enumerations, not closed vocabularies*: every new project and every new npm
script adds a value, so closing them would turn ordinary growth into a build
failure and teach everyone to widen the declaration without thinking.
`harness.invocation` makes the point sharply, reading as twenty-one distinct
values because it carries `npm:<script>`, a grammar rather than an enumeration,
which no ratio can see. Where a check cannot decide, the honest move is to say so
here rather than ship a gate that is right twice and wrong twice and therefore
ignored. A noisy gate is a third way for an unchecked claim to hide.

**Where a check can decide only part of a field, spend it on bounds.** The
question above is put as though a claim were either checkable or not, and
`app-routes.reads` is the case that is both. It names the derived caches each
routed view consumes, and a scan settles less of it than it looks: every cache
read goes through a kit constant, so `cache → module` derives cleanly, but
`estate.js` reads three of the four caches and backs seven routed views, so the
derivation stops one hop short of the answer and a composition through it would
be coarser than the sentence it replaced. Neither authoring the field nor
deriving it works. So the field is authored at the resolution the answer needs
and the scan is spent on **bounds**: no view may claim a read no file of its own
makes, and where a reading file backs exactly one route the claim is forced
rather than merely allowed. That leaves 4 of its 11 entries genuinely authored,
the residue being which of one wide component's views consumes which cache.
[`cache-readers.mjs`](../tools/build/cache-readers.mjs) derives it,
[`state-feeds.test.mjs`](../tools/test/state-feeds.test.mjs) holds both bounds,
and nothing stores the composition.

### Two limits of the model, neither visible from inside it

*A carrier can be distributed.* A registry names one path. But the authoritative
statement of what a skill does is each skill's own `SKILL.md`, one carrier per
target, which the declaration table cannot express. This is why the owners
table's family rule stays where it is rather than moving into the declarations.

*A scope can overstate its own gate.* The docs registry declared "every file
under docs/" while its gate walks `.md` and `.json` only, leaving four files
inside the stated scope and outside the check. Corrected by narrowing the scope
to what is enforced, which is the honest direction: pulling examples, prototypes
and a favicon into a documentation registry would be filling rows to satisfy a
gate.

## Federation

How finely responsibility is delegated is a configuration choice, not a model
feature. A workspace that runs its own registries (budget-drs inside home)
declares them in its own properties registry; the repo-level table covers the
repo's own carriers and does not enumerate a project's internals. The integrity
rule spans levels unchanged: no pair, anywhere, has two owners.

### The level above: the estate

The same delegation runs one level up, and there `span` says which way. A
hub-scoped registry is bounded by this checkout; an estate-scoped one holds an
aggregate of rows each repo authors about itself, the crawl collecting rather
than the hub inspecting. Four of twenty-two currently span the estate.

A third shape does not fit the table at all: a governed artifact each repo
carries with no aggregate anywhere, which is why `.paths.json` is still
unregistered after the audits kept naming it. The gate requires a carrier that
exists here and is a CSV, and both facts about `.paths.json` are the opposite.
That refusal is correct, and [estate-span.md](estate-span.md) is where it is
recorded, along with the outbound/inbound asymmetry it belongs to and the
measurement behind the column.

### Two normal forms, and how to pick

budget-drs's `properties.csv` and this repo's registry pair express the same
model in different normal forms, and neither should convert to the other. This
repo factors a **registries** object out of its declarations because several
properties share one carrier, and without the factoring the path, scope and gate
would be restated on every one of them. budget-drs declares twenty properties
across twenty distinct carriers, so the same factoring would add an object layer
with exactly one declaration hanging off each entry.

**Fan-out decides it.** One carrier to many properties wants the registry object;
one-to-one does not. That is a property of the estate being described, not of the
describer, so a repo adopting this model picks the form its own carriers imply
rather than the form the hub happens to use. Neither is the canonical shape.

**The column grain is the same shape under two vocabularies.** This repo's
`properties.csv` describes the columns of its registries, and budget-drs's
`data/design/lineage/columns.csv` describes the columns of its tables (145 of
them, 12 of which are registries). The hub needs no separate column file because
its registries are its only governed tables; budget-drs does because most of its
tables are not. Field for field:

| hub `properties.csv` | budget-drs `columns.csv` | difference |
| --- | --- | --- |
| `registry`, `property` | `table`, `column` | the key |
| `mode`: recorded, computed | `role`: source, carried, computed | `carried` has no hub value; the hub says borrowing at registry grain, as `inherits` |
| `deriver` | `op`, `sources` | budget-drs carries the refs, the hub names the script |
| `values` | `domain`, resolved in `domains.csv` | an inline set against a keyed universe |
| `gloss` | `transform`, `note` | one sentence either side |
| `required`, `form`, `exclusive` | `additivity` | the enrichment each side needed |

Neither vocabulary converts to the other, for the reason above: no consumer
reads both, and a rename is a cost with nothing waiting for it. What this table
buys is that a reader meeting `mode` here and `role` there does not have to
rediscover that they are one concept, which is how the sentence "neither shape
maps onto the other" got written on 2026-09-05 and retracted the same day.

**The borrowing runs both ways, and one attempt at it failed usefully.** The
origin instrument carries a `definition_owner` field, naming per property the
document that defines its value domain. Adopting it here was tried and should not
be: budget-drs has a design-doc layer, so every one of its properties is defined
by a separate document, while in the hub almost every domain is defined in its
own carrier or in a glossary beside the rows. The field would have been populated
on a handful of rows and blank on the rest, and a field that is blank by
construction teaches a reader nothing. Where a hub domain genuinely is defined
elsewhere, the owners table already says so, and it is the better home because it
also carries how the copy relates and what holds it.

**What the attempt actually found was a missing gate.** Filling the field meant
reading every closed domain, and doing that turned up this registry declaring
eight closed domains and *reading none of them*. budget-drs's
`verify-properties.py` hard-fails on any value outside a declared set, and that
hard-fail is most of what makes its registry load-bearing. The hub's gate checked
field names and never values. It now checks both. The borrowing was real; it was
just a check rather than a column.
