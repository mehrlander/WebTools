# Text tools on the page at hand

A proposed fifth surface for the FAB drawer: the reader's text, analyzed where
it is being read. Written 2026-08-13 as an exploration, not a decision. The
figures are re-derivable from the files named; the recommendation at the end is
the only part that is a judgment.

## The finding: the instruments exist, the application point does not

The estate has spent real effort on text analysis and has ten working
instruments to show for it. Every one of them runs somewhere other than the
page you are looking at.

| Instrument | Asks | Runs |
| --- | --- | --- |
| [`concept-lab/termlab.py`](../tools/concept-lab/termlab.py) | what vocabulary does this repo coin | agent, over checkouts |
| [`concept-lab/entitylab.py`](../tools/concept-lab/entitylab.py) | what does it name from outside itself, and can a table resolve it | agent, over checkouts |
| [`concept-lab/entityprofile.py`](../tools/concept-lab/entityprofile.py) | what does a standard recognizer see | agent, spaCy |
| [`concept-lab/build-entity-index.py`](../tools/concept-lab/build-entity-index.py) | the pipeline behind `state/entities.json` | agent, offline |
| [`concept-lab/flag_reply.py`](../tools/concept-lab/flag_reply.py) | did this reply use jargon it never introduced | a Stop hook, on a reply |
| [`concept-index/vocab.py`](../.claude/skills/concept-index/vocab.py) | index a repo's declared vocabulary, check a draft against it | agent, on demand |
| [`tools/semsearch.py`](../tools/semsearch.py) | what else in the estate is about this | agent, over an index |
| [`pages/entities.html`](../pages/entities.html) | what each repo names | a browser, over a committed index |
| [`pages/citations.html`](../pages/citations.html) | which bills touch the statute this document discusses | a browser, over two indexes |
| [`pages/shorter.html`](../pages/shorter.html) | can this be said in less | a browser, over pasted text |

Nine of the ten take a corpus or a paste. None takes *this page*. The gap is not
capability. It is that nothing owns the moment where a reader is looking at
something and wants to know what is in it.

The FAB already owns that moment, and nothing else does. It knows the page's
repo, path, and ref; it survives into a toss and retargets at the rendered
subject; and through [`kits/annotate.js`](../lib/kits/annotate.js) it already
holds the two hard pieces: `textIndex(root)`, which flattens a document to one
string with a node map, and quote anchoring that paints through the CSS Custom
Highlight API without rewriting anyone's DOM. A text tab is not new machinery.
It is a second reader of machinery the Notes tab already built.

## Four operations, in ascending cost

Keeping these apart matters, because they have different failure modes and only
the first two are decidable.

**1. Read.** Local, instant, no network. The page's text mass, its longest
sentence, its reading time. The house prose rules checked where they are broken
rather than at commit time: zero em dashes is stated in
[`CONVENTIONS.md`](CONVENTIONS.md) and enforced by nothing in this repo
(`home`'s `lint-conventions.py` covers `home`'s tracked markdown and stops
there). The surfacing set's own first primitive, *Reference is a link*, is a
check nobody runs: a path-shaped token sitting outside any `[](…)` is decidable
from the DOM alone.

**2. Match.** One cached fetch each, still decidable. Terms in the page's text
that resolve to a row in a registry. **Built**, and not in the shape this
document first proposed. The survey below listed nine candidate sources; the
build found that only some of them can be matched at all, which is the section
"The join is the path" further down.

| Class | Source | Answers |
| --- | --- | --- |
| a path that resolves to a tracked file | `EstateSearch.tree(repo, ref)`, already cached per repo and ref | this names a real file; here it is |
| a declared doc | [`docs/docs.json`](docs.json), 51 rows | what that document is, and whether it is living, measured, or a record |
| a declared test | [`docs/tests.json`](tests.json) | what that test protects, and of what kind |
| a harness tool | [`docs/harness.json`](harness.json) | that tool's role, and its layer |
| a surfacing primitive | [`docs/surfacing.json`](surfacing.json), 20 rows | the estate's own glossary, already gated against its prose |
| a prose field name | [`docs/text-fields.csv`](text-fields.csv), 13 names plus aliases | which of thirteen concepts this name is |
| a route key | [`docs/routes.json`](routes.json) | what that address form reaches |
| a page | [`pages/pages.json`](../pages/pages.json) | the live view, its thumb, its source |
| a citation (RCW, bill id, biennium) | `wa-bills` citation index, `state/entities.json`'s `rcwByRepo` | which bills cite it, which repos discuss it |

Every hit here is checkable. That is what makes it a *registry connection*
rather than a guess, and it is the whole reason to prefer it to the recognizer.

**3. Flag.** Heuristic, advisory, never a verdict. The `assumed` tier from the
concept index: a term used referentially with nothing in the corpus declaring
it. This is the signal that retired `spine`, `backbone`, and `weld` in `home`,
so it earns its place. The honest boundary is that the browser sees one page
and the tier is a corpus property, so this pane cannot exist without fetching a
vocabulary index, and it should say so rather than degrade quietly.

**4. Ask.** Costs a model, so it is a hand-off and not a computation. The tab
builds an envelope and gives it away; it runs nothing. Four routes already
exist and none needs inventing:

- to [`pages/shorter.html`](../pages/shorter.html) as a `shorter/1` envelope,
  which is the succinctness ask the user reaches for most
- to the stage's Diff lens with `&prompts=` commentary, which is what the
  `edit-review` skill already mints
- to an annotation set carried out as markdown, which is the Notes tab's
  existing exit
- to a `#gz=` toss of a selection, for a reader with no token

## What the measurements already rule out

Two things, and both were settled here before this document existed.

**Do not build on the recognizer.** `state/entities.json` reports `ORG`
precision of 0.19 stratified and 0.23 at the head, on one rater, with a 0.681
flag rate on web-tools' own `ORG` names. Its top `ORG` entries for this repo are
`ref`, `API`, `HTML`, and `GitHub`. A tab that surfaced that as "terms on this
page" would be wrong four times in five, and would be wrong in the specific way
that is hardest to notice: plausibly.

The removal note in [`pages/entities.html`](../pages/entities.html) already
reached the right conclusion and left it on the shelf: a dictionary lookup over
this prose "may still be worth having. It would be its own thing, run without
the model." Operation 2 is that thing.

**Do not commit a terms index.** `vocab.py` builds a repo's vocabulary in 1.7
seconds over web-tools and the skill declines to commit the result for exactly
the reason [`SURFACING.md`](SURFACING.md) gives for retiring the merge guide:
do not commit what a live read already answers. The browser side should read
the registries live, which is what every other FAB tab already does. The
registries are the index. Nothing new needs a carrier.

## Two subjects, and the tab has to say which

The rendered DOM and the page's source file are different bodies of text, and
conflating them is how this gets confusing.

The **rendered text** is what nothing else can reach, so it is the right
subject. But it is only worth analyzing on a *document page*, one whose job is
to render a body of prose: `data-view`, `toss-render`, `chat-results`,
`branch.html`, `annotate`. On an **app page** like `show-repo` or `transform`
the DOM text is button labels, and a word count over it means nothing.
[`docs/text-content.md`](text-content.md) measured the same split from the other
side: show-repo is 52% comments by byte, and none of that is in the DOM.

So the subject defaults to the rendered text, narrows to the selection when
there is one, and the tab says plainly when the page it is on is an app rather
than a document. Selection-scoped is likely the interaction that carries this:
select a passage, open the drawer, and every operation above applies to the
passage rather than the page.

## The constraint the pixels found, and what was done about it

At 390px the drawer's tab strip was full. Render, Inspect, Traffic and Notes ran
edge to edge with the hard-refresh button, and the strip's own commentary
recorded the last time width was bought: dropping Render's branch count, which
had itself bought room for Traffic's label after it hid below 400px. That
ratchet had one notch left and Text was the fifth tab.

Four ways out were available and three are worse than they sound.

**Scroll** was already the standing fallback, and it is the wrong answer rather
than the cheap one. The strip has carried `overflow-x-auto` since a clipping bug
was fixed, so a fifth tab does not break anything; it just moves off the right
edge, behind a horizontal drag on a strip with no scroll affordance. The tab
most likely to be hidden is the newest one, which is the one nobody knows to
look for.

**Icons for all five** costs the labels that make the strip legible, and buys
more width than the problem needs.

**Pairing Text and Notes under one tab** with an inner segment was this
document's first recommendation. It is honest about their relationship but it
charges a tap on every visit to the second of them, and it solves the width
problem only once: a sixth tab would reopen it.

**The label rides the selected tab.** Built, and then replaced, and the way it
was wrong is the useful part. Putting the active tab's name inside its own
button fits, and it reflows: the label grows in whichever button is selected, so
every icon to its right shifts on every tap.

A tab strip is a **spatial memory**. The third icon is Traffic, always, and a
reader who has used the strip twice reaches for a position rather than reading a
row. A strip that rearranges itself cannot be one. Measured at 390px, the five
tab states produced five distinct layouts and an icon travelled up to **49px**
between two of them, about 1.6 icon widths, far enough to put a different tab
under the finger that just tapped.

**One label, in a fixed slot at the left.** This is what shipped. The slot names
whichever tab is selected and the icons after it hold one set of coordinates for
the life of the strip, whatever is active and however long its name. Reading
order follows: what you are looking at, then what you could switch to. The slot
is sized to the longest label rather than to its content, since a slot that
resizes is the same bug moved one element to the left. The label is not a
control and carries no button styling; it takes the selected icon's colour,
which is what ties the two together and why the icon keeps its pill.

Two checks hold it. [`fab-text.test.mjs`](../tools/test/fab-text.test.mjs) fails
if a tab has no pane, since under this rule a paneless tab does not even carry a
name to explain itself, and pins the label as derived from `activeTab` rather
than stored beside it.
[`fab-tabstrip-geometry.mjs`](../tools/test/fab-tabstrip-geometry.mjs)
(`npm run test:tabstrip`) measures the icons in a real browser at 390px and
fails on more than one layout. It is a browser check rather than a suite test
because jsdom lays nothing out, so every rectangle there is zero; it was
confirmed against the previous layout as a negative control, where it reports
the five layouts and the 49px.

## What was built, and the two things the build corrected

**Read is in**, and only Read: the pane reports words against a chrome
denominator, sentence count and average, reading time, the longest sentence with
its text, and the two house-rule checks. No network, no model, and the pane says
so in a closing line rather than leaving the boundary implied.

Two things this document had wrong, both found by running it.

**The app-versus-document gate is words per text run, not chrome share.** The
first attempt counted the share of words sitting in buttons, links and labels.
Measured across six fab-bearing pages it inverts the thing it was meant to
separate, putting the most document-like page at 2% and an app at 9%. Words per
run separates cleanly, because an app's text arrives as thousands of
one-to-three-word labels while a document's arrives as sentences:

| Page | Words per run | Reads as |
| --- | --- | --- |
| links | 1.1 | app |
| data-view | 3.0 | app |
| show-repo | 4.0 | app |
| pages index | 5.0 | app |
| annotate | 8.3 | prose |
| shorter | 20.0 | prose |

The gate sits at 6, in the gap. The sample is small and covers only pages that
mount a fab, which is the honest limit of the calibration.

**The prose checks have to be withheld on an app, and this is not a
precaution.** The bare-path check reads 186 on the pages gallery and 53 on
show-repo, because a file browser listing file names is doing exactly what it
should. Unwithheld, that would be the pane's loudest number and its least true
one.

## The join is the path

Match is built, and building it settled the question the operation list left
open: **what, exactly, is a term matched against?**

The intended design was a glossary. Take the estate's terms of art, find them in
the prose, link each to where it is declared. There is nothing to match against,
and the reason is structural rather than a gap somebody forgot to fill:

- [`docs/surfacing.json`](surfacing.json)'s rows are keyed by sentence-shaped
  titles (*Reference is a link*, *Toss a live view*). Those phrases do not occur
  in prose. The single words that do occur (toss, stage, caption) appear nowhere
  in the carrier as keys, and deriving them would be guesswork.
- [`docs/text-fields.csv`](text-fields.csv) and
  [`docs/properties.json`](properties.json) are keyed by ordinary English words:
  note, open, scope, role, reach. Matching those against prose returns noise at a
  rate that would bury anything true.
- [`tracker/board.json`](../tracker/board.json) is keyed by task titles, which
  are sentences.

The estate has no committed vocabulary keyed by surface form, and that is a
decision rather than an oversight: `vocab.py` builds one in 1.7 seconds and the
`concept-index` skill declines to commit the result, on the same rule that
retired the merge guide. Inventing one inside a UI component would be inventing
a registry the estate has decided not to keep.

What it has instead is better for this purpose. **Three registries are keyed by
path**, and a path is a token that really does appear in this prose:

| Registry | Covers | Says |
| --- | --- | --- |
| [`docs/docs.json`](docs.json) | `docs/` | subject, status |
| [`docs/tests.json`](tests.json) | `tools/test/` | protects, kind |
| [`docs/harness.json`](harness.json) | `tools/`, `scripts/` | role, layer |

So path matching **is** registry matching here, with no glossary in the middle
and no guess in any step. A path outside those three shelves resolves in the
tree and gets a link with no gloss, which is the honest result rather than a gap
to apologize for.

Three rules the build settled, each visible in the pane:

- **Named and bare are different questions about the same token.** A path in a
  code span breaks no rule (a citation is not a reference), so it is not counted
  as a bare path; it is still a file the page is about, so it is resolved. One
  walk, two answers.
- **A candidate that does not resolve is not a finding.** It is usually another
  repo's path or a filename-shaped string. Listed, never flagged.
- **Only the tree read may fail the answer.** A registry that will not read
  costs a gloss; the row still resolves and links.

## What a sentence is, settled by a document with tables in it

The first live run against a real document, this file rendered through the data
route, reported a longest sentence of stitched-together table cells: *"…already
cached per repo and ref this names a real file; here it is a declared doc, 51
rows what that document is…"*. Visibly wrong, and wrong in the direction that
flatters the figure.

The cause is how text runs are joined, and both obvious answers fail:

- **Join every run with a space** and a table's cells run together, because a
  cell carries no terminal punctuation for a sentence splitter to find. That was
  the bug.
- **Join every run with a newline** and any sentence containing an `<a>` or a
  `<code>` is cut into pieces, which is most of this estate's prose.

So runs join with a **space inside one block** and a **newline between blocks**,
and a block boundary ends a sentence whether or not it is punctuated. Whitespace
inside a run collapses first, so the newline can mean exactly one thing: source
formatting puts real newlines inside a single text node, and splitting on those
cut sentences in half. The block set is a tag list rather than
`getComputedStyle`, because the read also runs over a cloned selection fragment,
which is in no document and has no computed style to ask for.

## Selection scope, and the bug it hid

The read takes a live selection as its subject when there is one, and the whole
page otherwise. That is the reading this tab exists for: the question asked of
the passage in front of you, which is the one thing every other instrument in
the estate answers badly by taking a corpus.

It did not work at first, and would not have worked in any amount of code
review. **The tap that opens the drawer destroys the selection.** Pressing
anywhere outside a selection collapses it, and the launcher is outside every
selection by construction, so the only route to the tab clears its subject.
The fix is one line at the launcher's existing `pointerdown`: snapshot the
selection before the tap lands. That is a listener on the fab's own element,
not on the host document, which matters because this drawer already declines to
arm a listener on someone's page for a tab they may only be glancing at.

Found by shooting it. The screenshot said "The whole page" where the scenario
had selected a paragraph.

## What to build next

Operations 1 and 2 are in. Operations 3 and 4 are not, and the honest reading of
what the build learned is that neither is a small increment:

- **Flag** wants the corpus the browser does not have. The `assumed` tier is a
  property of a repo's whole prose, not of one page, so this pane can only reach
  it by fetching a vocabulary index, which is the artifact the estate declines
  to commit. The likely resolution is that Flag stays an agent-side answer and
  the tab links to it rather than reimplementing it.
- **Ask** may not belong in this tab at all. The FAB already has a take-away
  menu whose entire job is handing the page somewhere else, with five named
  outputs. A sixth that hands the text to `shorter.html` is a row in that menu,
  not a section here.

Everything from here should be able to name what it would be wrong about.

## Open

- Whether the Ask routes belong in this tab or in the existing take-away menu.
  Leaning toward the menu, for the reason above.
- Whether the words-per-run gate holds on a page rendering a long markdown
  document, which the calibration sample does not contain: the pages with the
  most prose in this repo (`word-select`, `console-playground`) load no lib
  chain, so they mount no fab and could not be measured.
- Whether Match should offer the ⭐ live view for a resolved `pages/*.html`
  rather than only the blob. `pages/pages.json` carries the address; it is a
  fourth registry read, and the rule that only the tree may fail the answer
  already covers the cost of one more.
- Whether a resolved path should be tappable to the **stage** rather than to
  GitHub, since a list of the files a document names is exactly a fileset.
