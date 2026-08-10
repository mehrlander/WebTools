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

Two questions, and they need different work:

1. **How organized are the carriers we have?** Every authored carrier in both
   repos is declared, which is better than expected. The vocabulary inside them
   is not: budget-DRS uses **16 different field names for what is broadly one
   concept**, an authored justification or gloss, across 46 carriers and 31,883
   words.
2. **What never reached a carrier?** Widening the census from `.js`/`.html` to
   `.py` roughly doubled the commentary found in budget-DRS's app and took its
   uncarried text tables from 2 to 10. Six registry rows added in this pass
   moved another 53,115 words from "no carrier" to correctly declared as
   supplied or generated.

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

# Proposed: a text carrier registry

Not an extension of `content.csv`. That registry's subject is a file's
epistemic origin; this one's subject is where a displayed string comes from.
Same estate, different question, and fusing them would give one row two keys.

Carrier `data/design/text.csv`, one row per **text set**, meaning a coherent
body of strings with one author and one purpose:

| Column | Values | Notes |
| --- | --- | --- |
| `id` | slug | the set's handle |
| `carrier` | path | where the strings live. A `.js`, `.html`, or `.py` path is a declared exception, not a hidden one |
| `rendered_by` | path | the page or module that displays them |
| `audience` | `reader`, `editor` | `editor` is commentary; the row counts it rather than relocating it |
| `field` | column or key name | drawn from a stated vocabulary, which is the fix for Part 1 |
| `category` | `gloss`, `blurb`, `caveat`, `definition`, `narrative`, `quoted-source`, `chrome` | what kind of text |
| `creation_mode` | the `content.csv` vocabulary | reused deliberately, not redefined |
| `rows` | integer | how many strings, so drift is visible |
| `gate` | path or empty | the check that holds it |

A violator becomes a mechanical statement rather than an opinion: a row with
`audience: reader` whose `carrier` is a source file. Registering the row does
not fix it and is not meant to. It moves the text from invisible to declared,
which is the step that lets it be counted, reviewed, and scheduled.

**The `field` column is the part Part 1 needs**, and it is the reason to build
this registry rather than only run the surveys. Sixteen names for one concept
persist because nothing states the vocabulary; a registry with a controlled
`field` set makes the seventeenth name fail a check instead of joining the pile.

Adding the registry means a row in [`docs/properties.json`](properties.json) in
the same commit, per [`docs/registries.md`](registries.md).

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

In order of ratio, best first:

1. **State the field vocabulary.** One table of names with one meaning each,
   and a rule for picking among them. Nothing else in this document unblocks as
   much: it is the prerequisite for the `text.csv` `field` column, for a gate,
   and for any tool that wants to ask the estate a question about its own
   reasoning.
2. **The `VIEWS` blurbs.** One CSV retires a regex parser and its two drift
   guards and gives ten reader-facing paragraphs a carrier.
3. **The spend glosses.** 22 definitions of the app's own taxonomy, readable
   today only by opening a JavaScript file.
4. **Decide the show-repo authority question.** 23,665 words in the page and
   23,920 in the doc, overlapping 4.5%. A decision about which is the record,
   not a cleanup, and until it is made both keep growing.
5. **Register, do not move.** For everything else a row saying where the text is
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
