# Text content and commentary

Where the estate's authored text lives, whether the carrier holding it is in
any shape to be relied on, and how much text never reached a carrier at all.
Measured 2026-08-10 across `mehrlander/web-tools` and `mehrlander/home`, with
two instruments that make every figure below one command away:

```bash
python3 scripts/text-census.py . pages lib --weight   # text with no carrier
python3 scripts/text-carriers.py . --fields           # the carriers we have
```

Re-derive rather than cite. The numbers move as the repos do.

Two questions, and they needed different work:

1. **How organized are the carriers we have?** Every authored carrier in both
   repos is declared, which is better than expected. The vocabulary inside them
   was not: budget-DRS used **16 different field names for what is broadly one
   concept**, an authored justification or gloss, across 46 carriers and 31,883
   words. [`docs/text-fields.csv`](text-fields.csv) now states twelve names with
   the rule for picking among them, and every prose field name in budget-DRS
   maps to one of them.
2. **What never reached a carrier?** Widening the census from `.js`/`.html` to
   `.py` roughly doubled the commentary found in budget-DRS's app and took its
   uncarried text tables from 2 to 10. Six registry rows moved another 53,115
   words from "no carrier" to correctly declared as supplied or generated, and
   the largest remaining uncarried table, the app's ten view blurbs, now has one.

## Three kinds, three different answers

The kinds are not degrees of one thing. They differ in who the reader is, and
that decides where each belongs.

| Kind | Reader | Belongs in | Failure mode |
| --- | --- | --- | --- |
| **Text content** | the app's reader | a data carrier (CSV, JSON) with declared authorship | only an editor can find or revise it |
| **Commentary** | whoever edits the file | the source file | grows into a document with no registry row |
| **Inline prose** | the app's reader | rendered from a carrier | a sentence with no owner, category, or check |

The census names them `text-table`, `commentary`, and `inline`. None is an
error and the script never says otherwise. A comment is supposed to exist, and
a three-row gloss table is not worth a CSV.

---

# Part 1: the carriers we have

[`scripts/text-carriers.py`](../scripts/text-carriers.py) finds every CSV column
and JSON key whose values are sentences, then asks whether anything in the repo
names the file and whether the text is the estate's own voice or quoted source.

## Declaration is not the problem

| | Carriers | Authored words | Undeclared |
| --- | --- | --- | --- |
| budget-DRS | 160 (67 authored) | 53,852 | **0** |
| web-tools | 22 (16 authored) | 13,978 | 1,031 in one file |

Every authored carrier in budget-DRS is named by a registry, a README, or
`CLAUDE.md`. web-tools has one exception,
[`tracker/assessments/2026-08-07.json`](../tracker/assessments/2026-08-07.json).
Whatever else is wrong here, text is not being filed into files nobody knows
about.

## The vocabulary is the problem

budget-DRS's 67 authored carriers use **65 distinct prose field names**, and
**80% of them appear in exactly one carrier**. web-tools is the same shape at a
smaller scale: 25 names, 64% used once.

Sixteen of budget-DRS's names are doing one job:

| Field | Carriers | Words |
| --- | --- | --- |
| `note` | 25 | 15,567 |
| `basis` | 6 | 1,205 |
| `evidence` | 4 | 1,934 |
| `why` | 3 | 868 |
| `origin`, `notes`, `method`, `detail` | 2 each | 6,389 |
| `rationale`, `comment`, `reason`, `concordance`, `implication`, `premise`, `description`, `work` | 1 each | 5,920 |
| **total** | **46 carriers** | **31,883** |

That is not a naming quibble. It means no reader and no tool can ask this repo
for its authored rationale and get an answer, and the estate's own
`concept-index` and `semsearch` tools cannot weight a `why` differently from an
`item_title`. A vocabulary nobody has stated is the honest measure of how
organized the carriers are, and this one has never been stated.

Note what the spread is *not* evidence of. `note` at 25 carriers is a
reasonable default and most of those rows are fine. The cost lands on the tail:
`premise`, `concordance`, `implication`, and `work` each exist once, and a
reader meeting one of them has no way to know whether it means what `basis`
means somewhere else.

---

# Part 2: text that never reached a carrier

[`scripts/text-census.py`](../scripts/text-census.py) reads `.js`, `.mjs`,
`.html`, and `.py`, splits what it finds into the three kinds, and separates
generated payloads and supplied files, whose text has a carrier somewhere else.
It reads the repo's `data/design/content.csv` where one exists, so it reports
against the declaration rather than beside it.

## web-tools, `pages/` and `lib/`

156 files, 4.81 MB.

| Class | Words | Units |
| --- | --- | --- |
| commentary | 138,089 | 2,757 blocks, 892,473 bytes, 18% of the tree |
| text tables | 801 | 5 tables, none with a carrier |
| inline prose | 4,589 | 190 runs |

Comment blocks by size, where a block is one HTML comment, one `/* */`, or a
run of consecutive `//` lines, which is the unit a person actually wrote:

| Size | Blocks | Words |
| --- | --- | --- |
| under 40 words | 1,784 | 35,337 |
| 40 to 99 | 696 | 41,358 |
| 100 to 249 | 220 | 32,560 |
| 250 to 599 | 50 | 17,776 |
| 600 or more | 7 | 11,058 |

The mass is not in the tail. Over half the words sit in blocks of 40 to 249
words, which is the file-header essay this codebase writes on nearly every
module: [`lib/kits/dictate.js`](../lib/kits/dictate.js) opens with 703 words,
[`lib/kits/repo-proposals.js`](../lib/kits/repo-proposals.js) with 861,
[`lib/alpineComponents/ref-switch.js`](../lib/alpineComponents/ref-switch.js)
with 669. That is a convention, consistently applied, and it is the most
defensible prose in the estate. It is also entirely undeclared.

### The outlier, and it is a document

[`pages/show-repo/show-repo.html`](../pages/show-repo/show-repo.html) is 295 KB,
of which **153,676 bytes (52%) are comments**: 23,665 words in 327 blocks. One
block, at line 4370, runs **5,962 words** under the heading "Design notes: the
estate, the landing mechanism, the views, the stage."

The page also has a companion doc, [`docs/show-repo.md`](show-repo.md), at
23,920 words. The two are almost exactly the same size, and they are not
copies: an 8-gram comparison puts the overlap at 4.4% of the comments and 4.6%
of the doc. That is the harder problem. Two parallel bodies of design prose
about one subject, neither declared as the authority, and no way for a reader
to tell which is current.

The transfer cost is real and separable. Stripping comments takes the page from
295 KB to 139 KB, and gzipped from 92.0 KB to 31.5 KB, so **two thirds of what
this page ships is commentary**. Across `pages/` and `lib/` the figure is
391 KB gzipped. That is not an argument for deleting it. It is an argument that
it is a shipped artifact and should be accounted for like one.

## budget-DRS, the live app

112 files, 5.05 MB, workshop exhibits excluded as generated, builders included.

| Class | Words | Units |
| --- | --- | --- |
| commentary | 68,306 | 1,563 blocks, 447,432 bytes, 8% of the tree |
| text tables, no carrier | 1,361 | 10 tables |
| text tables inside generated payloads | 17,735 | 14 tables, carrier is the builder's input |
| inline prose | 8,578 | 482 runs |

The 8% is diluted by the committed data payloads. In the hand-written view
modules the density matches web-tools: `app/view/views/spend.js` 28%,
`composition.js` 43%, `app/view/app.html` 35%. The largest single block is 610
words, against web-tools' 5,962.

The 13-to-1 split between carried and uncarried text content is still the
finding worth keeping. The repo's "data before display" rule is holding nearly
everywhere it applies.

## What widening the net cost, and what it found

Reading `.py` was not a rounding error. In the same scope, adding builders to
`.js` and `.html`:

| | `.js`/`.html` only | with `.py` |
| --- | --- | --- |
| commentary | 34,911 words | 68,306 |
| uncarried text tables | 739 words, 2 tables | 1,361 words, 10 tables |

Python belongs in scope because a build script is where a page's reader-facing
strings go to hide. A `blurb` list in
[`build-atlas.py`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/atlas/tools/build-atlas.py)
reaches a reader exactly as one in a view module does, and until this pass the
two could not be counted by the same means: the 113 builder literals in the
first version of this document had to be counted by hand.

The census separates the guard messages, which are legitimately code. The
distinction is mechanical: a string inside a `raise`, `assert`, `sys.exit`, or
`print` is addressed to whoever ran the build.

## Six registry rows, and 53,115 words

The other half of "never reached a carrier" is text the registry mislabels
because the covering row is a directory. Four rows added to home's
`data/design/content.csv` and two to web-tools':

| Row | Was | Is | Words |
| --- | --- | --- | --- |
| `chron/2026/04/2026-04-19-paul-ford-code-bloomberg-article.html` | `mixed` under `chron/` | `supplied` | 27,870 |
| `chron/blog/index.html` | `mixed` under `chron/` | `mechanical` | 18,039 |
| `pages/wsl-sync/data/` | `hybrid-authored` under `pages/` | `supplied` | 6,900 |
| `pages/wsl-sync/rcw/` | `hybrid-authored` under `pages/` | `supplied` | 100 |
| `chron/index.md`, `chron/blog/index.md` | `mixed` under `chron/` | `mechanical` | the rest |

The first is a saved Bloomberg article, captured whole: 27,870 words of
somebody else's prose that the `chron/` row counted as this repo's own. The
second is the generated HTML twin of every blog post, so counting it doubles
the blog. The `wsl-sync` pair is legislative data fetched by a cron.

None of these was a mistake at the time. Each is a directory row that was right
when written and outlived a file that landed under it. That is the recurring
shape of this problem, and it argues for the periodic re-run rather than for
more rows up front.

Home's uncarried inline prose fell from 75,280 words to 29,371 as a result, and
its registry now covers 324 of 324 files that hold prose.

---

# The specific violators

## Text tables with no carrier

The clearest case, because there is no judgment in it. Reader-facing prose
keyed by something, with nothing behind it:

- [`app/view/app.html:580`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/view/app.html#L580), 10 entries, 456 words. The `VIEWS` registry's per-view `blurb` fields.
- [`app/view/views/spend.js:34`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/view/views/spend.js#L34), 22 entries, 283 words. Object glosses: `"Employee Benefits": "The benefits load on staff pay."` The app's definitions of its own spend taxonomy, existing nowhere else in the repo.
- [`app/lineage/tools/build-lineage.py:103`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/lineage/tools/build-lineage.py#L103), 12 entries, 389 words. Provenance rationale keyed by script path, the largest of the builder tables.
- [`data/design/catalog/tools/build-source-bundles.py:85`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/data/design/catalog/tools/build-source-bundles.py#L85), 17 entries, 256 words.

The first has a second reason to move.
[`app/data-explorer/tools/build-data-explorer.py`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/data-explorer/tools/build-data-explorer.py)
regex-parses those `blurb` strings back out of `app.html` so the Views manifest
can reuse them, and carries two guards against "regex shape drift." The guards
are the tell. The builder is doing the right thing about the wrong carrier: the
app shell is being treated as the registry, which inverts the rule the rest of
the repo follows. A CSV with `view, title, lens, blurb` would let the shell and
the manifest read the same rows, and the regexes would go away.

---

---

# The vocabulary, and what replaced the registry this document first proposed

## What was proposed, and why it was wrong

The first draft of this document proposed `data/design/text.csv`: one row per
text set, carrying `carrier`, `rendered_by`, `field`, `rows`, and the rest. That
was a mistake, and the estate's own rule says why. **Do not commit what a live
read already answers.** `text-carriers.py` derives the carrier, the field, the
row count, and the word count on every run; committing them would add a refresh
obligation and a way to be out of date, which is exactly the argument that
retired `docs/MERGE-GUIDE.md`.

What a survey cannot derive is what a name *means*. That is the whole finding of
Part 1, and it needs one row per **name**, not one per carrier.

## The carrier: docs/text-fields.csv

Thirteen sanctioned names, each with the audience it implies, a gloss, and the
`use_when` rule that settles which to pick. A definition alone never settles
that, which is why `use_when` is required rather than optional:

| Field | Audience | For |
| --- | --- | --- |
| `gloss` | reader | what the row's subject is |
| `narrative` | reader | prose meant to be read as prose |
| `payload` | reader | text the row exists to carry, not text about it |
| `rationale` | reader | why this judgment, against the alternative |
| `use_when` | reader | when to pick this over its neighbour |
| `scope` | reader | what it covers and deliberately does not |
| `evidence` | reader | the measured check, with figures |
| `caveat` | reader | what limits or qualifies it |
| `provenance` | reader | where it came from, how to reproduce it |
| `upkeep` | editor | what keeps it true, and who does it |
| `open` | editor | what is unresolved |
| `note` | editor | the deliberate catch-all |
| `quoted` | reader | verbatim from a source |

It is portable, because a concept named once should be the same concept in every
repo, and it is declared in [`docs/properties.json`](properties.json) with
[`tools/test/text-fields-registry.test.mjs`](../tools/test/text-fields-registry.test.mjs)
as its gate. That test holds the size (a vocabulary that grows a name whenever a
carrier wants one is not a vocabulary), the typing, and two properties that are
invisible on reading the file: the alias map has to be a function, and no alias
may also be a sanctioned name.

## Conformance by declaration, not by rename

The `instead_of` column is the part that makes this usable on an estate that
already exists. It lists the names in use that each sanctioned name accounts
for, so `text-carriers.py` resolves an old name rather than reporting it as a
violation. **An existing carrier conforms by declaration.** Renaming is optional
and separate, and mostly not worth it: `blurb` appears in 23 places across
budget-DRS, and renaming it to `gloss` would buy nothing the alias map does not
already give while touching a live app in 23 places.

Measured after the vocabulary was written against both repos:

| | On a sanctioned name | An alias of one | A value, not prose | Unclaimed |
| --- | --- | --- | --- | --- |
| budget-DRS | 17,817 words | 28,744 | 7,291 | **0** |
| web-tools | 1,573 words | 11,758 | 815 | **0** |

Every prose field name in both repos now maps to one of thirteen stated
concepts, and `text-carriers.py --check` exits 0 on both.
Both reached zero, but not by the same route, and the difference is the point.
budget-DRS's residue was absorbed by alias rows. web-tools' last name, `prompt`
in a tracker assessment, was not: it holds a session instruction, so the row
exists to CARRY the text rather than to describe something else. Every other
name in the set annotates a subject, and that one is the subject. It earned a
thirteenth name, `payload`, rather than an alias to something it is not.

That is the intended way for the vocabulary to grow: a name is added when a
carrier turns out to hold a kind the set genuinely lacks, and the count in
[`text-fields-registry.test.mjs`](../tools/test/text-fields-registry.test.mjs)
has to move in the same commit, so growth is deliberate.

The alias lists were built from the observed names, not invented: the run that
produced them is `text-carriers.py --offvocab`, and a name entered the list only
after its actual values were read.

---

# The worked example: the VIEWS blurbs

The migration this document listed as the highest-ratio move, done, so the
convention has a case rather than only a rule.

[`data/design/views.csv`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/data/design/views.csv)
is now the carrier for ten views' `title`, `lens`, `kind`, and `gloss`. It sits
beside `view-grains.csv` and `view-tabs.csv`, which are the same kind of
manifest about the same views, and that placement was not a preference: the
verify suite's leaf-homing rule rejected it anywhere else.

What the shell keeps is the structural half of each entry (lens/kind, icon,
source, data links, embed), and it merges the text in from a generated
`views-data.js` at module scope, so every consumer still reads one `VIEWS`
object. `build-data-explorer.py` reads the CSV directly, and the two drift
guards it carried against its own regexes are gone, replaced by a stronger
check: the carrier and the shell have to agree about which views exist, which
neither could notice before.

`app/data-explorer/data.js` came out **byte-identical**, which is what a refactor
onto a structured stage is supposed to leave behind.

Three things the migration turned up that generalize:

* **A fallback hides a break.** The merge falls back to the view key for a
  missing title and an empty string for a missing blurb. That is right at
  runtime and exactly wrong to leave unchecked, since a stale payload renders as
  a plausible header with the prose silently gone.
  [`verify-views-text.mjs`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/view/tools/verify-views-text.mjs)
  walks carrier to payload to shell and was confirmed against a negative
  control.
* **Two verify scripts were reading the fields being moved.** Both now read the
  carrier, which is a better place to read them from.
* **Widening a check's assumption exposed a second one.** Letting the lineage
  verifier accept a payload in the page's own directory made its bare `src=`
  pattern match a comment explaining why a relative `src="./data.js"` resolves
  against nothing. Anchoring the match to a real script tag fixed it. A check
  that has only ever seen one shape encodes that shape as a rule without saying
  so.


---

# Proposed: what a gate can and cannot hold

Be honest about the split, because the tempting check is the one that would
misfire.

**Checkable, and worth checking:**

- An **undeclared** text table over N prose-valued entries in a source file.
  Unambiguous, and `--tables` already reports it, with generated payloads
  separated out so a built `data.js` does not read as a violation.
- A prose field whose name is not in the stated vocabulary.
- An authored carrier nothing in the repo names. `text-carriers.py --check`
  exits 1 on one; both repos pass today except for a single web-tools file.
- A comment block over N words. `text-census.py --check N` names the offenders.
- Drift between a declared `rows` count and the carrier's actual row count, the
  same shape as the registry gates already running.

**Not checkable, and a gate would be wrong:**

- Whether a given sentence is content or commentary. That is the judgment the
  registry records, not one a script can make.
- Whether a comment is too long in general. The 40-to-249-word file-header
  essay is this codebase's convention and is good. A hard ceiling would fire on
  916 blocks that are working as intended.
- Whether a directory row still fits every file under it. That is what the
  six-row correction above was, and it needed reading, not a rule.

So the recommended gate is narrow: fail on an undeclared text table and on an
off-vocabulary field name, and report everything else. Same posture as
[`scripts/link-survey.py`](../scripts/link-survey.py), which gates the
cross-repo classes and never gates the internal one, and
[`unclaimed-code-survey.py`](../scripts/unclaimed-code-survey.py), which never
gates at all.

Placement follows the estate's existing owner split:
[`.githooks/pre-commit`](../.githooks/pre-commit) for the local pass and
[`.github/workflows/test.yml`](../.github/workflows/test.yml) for the one the
platform enforces, since a hook that may not fire needs a check that runs on
every pull request.

# What to do first, if anything

Two of the five are done, and are described above: the field vocabulary and the
`VIEWS` blurbs. What remains, in order of ratio:

1. **The spend glosses.** 22 definitions of the app's own taxonomy, readable
   today only by opening a JavaScript file. The `VIEWS` migration is the pattern
   and this one is simpler, being a flat map with no structural half.
2. **Decide the show-repo authority question.** 23,665 words in the page and
   23,920 in the doc, overlapping 4.5%. A decision about which is the record,
   not a cleanup, and until it is made both keep growing.
3. **Turn on the vocabulary gate.** `text-carriers.py --check` exits 0 on both
   repos today. Running it in the verify suites would hold that, at the cost of
   a failure the next time a genuinely new concept appears, which is the
   intended cost and is what `payload` was.
4. **Register, do not move.** For everything else a row saying where the text is
   and who wrote it is worth more than relocating it, at a fraction of the cost.

# What the census cannot see

Stated so the numbers are not read as more than they are.

- **Markdown and CSV prose are out of the census's scope** by design; the
  carrier survey covers CSV and JSON, and nothing covers `.md`, which is the
  one gap left.
- **A template literal that emits JavaScript** reads as prose to a word
  counter. The `inline` class filters the obvious cases and still leaks.
- **"Generated" is detected from a banner** in the first 800 bytes, or from a
  `mechanical`/`supplied` row in `content.csv`. A payload built without either
  reports as having no carrier, which is how the blog twin was found.
- **The field-name census counts names, not meanings.** Two carriers using
  `note` for genuinely different things read as agreement here.
- **Consistency is not correctness.** Neither instrument says whether any of
  this text is true or current.
