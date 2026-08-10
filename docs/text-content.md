# Text content and commentary

Measured 2026-08-10 across `mehrlander/web-tools` (`pages/`, `lib/`) and the
budget-DRS app in `mehrlander/home`, with
[`scripts/text-census.py`](../scripts/text-census.py). Every figure below is one
command away, so re-derive rather than cite:

```bash
python3 scripts/text-census.py . pages lib --weight
```

The estate holds a lot of natural language inside its `.js` and `.html` files.
None of it is declared, so nothing counts it, nothing renders it, nothing
notices when it goes stale, and the
[content registry](../data/design/content.csv) answers for 144,855 words of it
with the single value `exclude`.

The headline is not the one this pass expected. budget-DRS's content discipline
is working: of 18,474 words sitting in text tables, all but **739** are inside
generated payloads that have a carrier behind them. web-tools' content problem
is smaller still, at 801 words. What both repos actually carry, in quantity, is
**commentary**: 137,773 words of it in web-tools' pages and library alone, 18%
of their bytes, and 390 KB gzipped shipped to a browser on every load.

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

## What is there

### web-tools, `pages/` and `lib/`

156 files, 4.80 MB.

| Class | Words | Units |
| --- | --- | --- |
| commentary | 137,773 | 2,748 blocks, 890,141 bytes, 18% of the tree |
| text tables | 801 | 5 tables, none with a carrier |
| inline prose | 4,589 | 190 runs |

Comment blocks by size, where a block is one HTML comment, one `/* */`, or a
run of consecutive `//` lines, which is the unit a person actually wrote:

| Size | Blocks | Words |
| --- | --- | --- |
| under 40 words | 1,776 | 35,185 |
| 40 to 99 | 696 | 41,358 |
| 100 to 249 | 219 | 32,396 |
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
390 KB gzipped. That is not an argument for deleting it. It is an argument that
it is a shipped artifact and should be accounted for like one.

### budget-DRS, the live app

43 files, 4.33 MB, workshop exhibits excluded as generated.

| Class | Words | Units |
| --- | --- | --- |
| commentary | 34,911 | 804 blocks, 218,440 bytes, 5% of the tree |
| text tables, no carrier | 739 | 2 tables |
| text tables inside generated payloads | 17,735 | 14 tables, carrier is the builder's input |
| inline prose | 5,125 | 174 runs |

The 5% is diluted by the committed data payloads. In the hand-written view
modules the density matches web-tools: `app/view/views/spend.js` 28%,
`composition.js` 43%, `app/view/app.html` 35%. The largest single block is 610
words, against web-tools' 5,962.

The 24-to-1 split between carried and uncarried text content is the finding
worth keeping. The repo's "data before display" rule is holding almost
everywhere it applies.

## The two uncarried tables, and they are the whole list

- [`app/view/app.html:580`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/view/app.html#L580), 10 entries, 456 words. The `VIEWS` registry's per-view `blurb` fields.
- [`app/view/views/spend.js:34`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/view/views/spend.js#L34), 22 entries, 283 words. Object glosses: `"Employee Benefits": "The benefits load on staff pay."` These are the app's definitions of its own spend taxonomy and they exist nowhere else in the repo.

The first has a second reason to move.
[`app/data-explorer/tools/build-data-explorer.py`](https://github.com/mehrlander/home/blob/main/projects/budget-drs/app/data-explorer/tools/build-data-explorer.py)
regex-parses those `blurb` strings back out of `app.html` so the Views manifest
can reuse them, and carries two guards against "regex shape drift." The guards
are the tell. The builder is doing the right thing about the wrong carrier: the
app shell is being treated as the registry, which inverts the rule the rest of
the repo follows. A CSV with `view, title, lens, blurb` would let the shell and
the manifest read the same rows, and the regexes would go away.

### One layer further back: prose in the builders

Across budget-DRS's 21 build scripts there are **113 reader-facing prose
literals** written directly into Python, separate from 61 guard and assertion
messages, which are legitimately code. `build-atlas.py` carries eight `blurb`
strings in a literal list; `build-lineage.py` carries 18, including
multi-sentence provenance rationale; `build-reversions.py` carries the
two-routes caveat as a wrapped string. These are the same species as a text
table, hidden one level deeper because the census only reads `.js` and `.html`.

## What already works, and it is most of the estate

Three carriers are already in place, which is why the remedy is extension
rather than invention.

**Prose in CSV columns.** budget-DRS holds 270,014 words across 171
prose-bearing CSV columns. `data/authored/` is an explicit 19-file shelf of
human decisions with prose columns (`rationale`, `evidence`, `reason`, `basis`,
`note`). Its subject is classification decisions rather than presented text,
which is why the app's glosses did not land there, but the habit is established.

**Prose in JSON registries.** web-tools holds 11,232 words across ten
`docs/*.json` registries, rendered live in show-repo's Map view.
[`routes.json`](routes.json) is the model case: the showing mechanisms are data,
the page renders them, and `CLAUDE.md` says so explicitly after 1,589 words of
restated prose failed to do the job.

**The content registry.** [`data/design/content.csv`](../data/design/content.csv)
declares creation mode and corpus membership per path, with a controlled
vocabulary and fragment locators.

The gap is narrow and specific. Mapping the census onto the content registry:

| `analysis_use` | Comment words swept in |
| --- | --- |
| `exclude` | 144,855 |
| `concept-vocabulary` | 1,093 |
| `prose-review` | 46 |
| undeclared | 0 |

Coverage is complete. Two rows do the work:

```
pages/,hybrid-authored,exclude,"Browser pages and their thumbnails; the prose lives in HTML comments, not extractable as text"
lib/,hybrid-authored,exclude,Library JavaScript; code register, not prose
```

The first states the problem and then declares it out of scope. The second
calls 91,711 words "not prose." Both were reasonable when written, because
nothing could extract the text. The census can, so the reason has expired.

## Proposed: a text carrier registry

Not an extension of `content.csv`. That registry's subject is a file's
epistemic origin; this one's subject is where a displayed string comes from.
Same estate, different question, and fusing them would give one row two keys.

Carrier `data/design/text.csv`, one row per **text set**, meaning a coherent
body of strings with one author and one purpose:

| Column | Values | Notes |
| --- | --- | --- |
| `id` | slug | the set's handle |
| `carrier` | path | where the strings live. A `.js` or `.html` path is a declared exception, not a hidden one |
| `rendered_by` | path | the page or module that displays them |
| `audience` | `reader`, `editor` | `editor` is commentary; the row counts it rather than relocating it |
| `category` | `gloss`, `blurb`, `caveat`, `definition`, `narrative`, `quoted-source`, `chrome` | what kind of text |
| `creation_mode` | the `content.csv` vocabulary | reused deliberately, not redefined |
| `rows` | integer | how many strings, so drift is visible |
| `gate` | path or empty | the check that holds it |

A violator becomes a mechanical statement rather than an opinion: a row with
`audience: reader` whose `carrier` is a source file. Registering the row does
not fix it and is not meant to. It moves the text from invisible to declared,
which is the step that lets it be counted, reviewed, and scheduled.

Adding the registry means a row in [`docs/properties.json`](properties.json) in
the same commit, per [`docs/registries.md`](registries.md).

## Proposed: what a gate can and cannot hold

Be honest about the split, because the tempting check is the one that would
misfire.

**Checkable, and worth checking:**

- An **undeclared** text table over N prose-valued entries in a source file.
  Unambiguous, and `--tables` already reports it, with generated payloads
  separated out so a built `data.js` does not read as a violation.
- A comment block over N words. `--check N` exits 1 and names the offenders.
- Drift between a declared `rows` count and the carrier's actual row count, the
  same shape as the registry gates already running.

**Not checkable, and a gate would be wrong:**

- Whether a given sentence is content or commentary. That is the judgment the
  registry records, not one a script can make.
- Whether a comment is too long in general. The 40-to-249-word file-header
  essay is this codebase's convention and is good. A hard ceiling would fire on
  915 blocks that are working as intended.

So the recommended gate is narrow: fail on an undeclared text table, and report
everything else. Same posture as
[`scripts/link-survey.py`](../scripts/link-survey.py), which gates the
cross-repo classes and never gates the internal one, and
[`unclaimed-code-survey.py`](../scripts/unclaimed-code-survey.py), which never
gates at all.

Placement follows the estate's existing owner split:
[`.githooks/pre-commit`](../.githooks/pre-commit) for the local pass and
[`.github/workflows/test.yml`](../.github/workflows/test.yml) for the one the
platform enforces, since a hook that may not fire needs a check that runs on
every pull request.

## What to do first, if anything

In order of ratio, best first:

1. **The `VIEWS` blurbs.** One CSV retires a regex parser and its two drift
   guards and gives ten reader-facing paragraphs a carrier. Smallest change,
   with a builder already asking for it.
2. **The spend glosses.** 22 definitions of the app's own taxonomy, readable
   today only by opening a JavaScript file.
3. **Decide the show-repo authority question.** 23,665 words in the page and
   23,920 in the doc, overlapping 4.5%. This is a decision about which is the
   record, not a cleanup, and until it is made both keep growing.
4. **Register, do not move.** For everything else a row saying where the text is
   and who wrote it is worth more than relocating it, at a fraction of the cost.

The 113 builder literals are deliberately last. They are real, they are
consistent, and none of them is currently wrong.

## What the census cannot see

Stated so the numbers are not read as more than they are.

- **Python, Markdown, and CSV are out of scope.** It reads `.js` and `.html`
  only, which is why the builder literals had to be counted by hand.
- **A template literal that emits JavaScript** reads as prose to a word
  counter. The `inline` class filters the obvious cases and still leaks.
- **"Generated" is detected from a banner** in the first 800 bytes. A payload
  built without one will be reported as having no carrier.
- **Consistency is not correctness.** The census says where text lives, never
  whether it is true or current.
