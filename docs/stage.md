# The stage: the Web Tools app's working surface

The stage is where a cross-repo fileset is assembled, read, compared, saved,
and sent. This is its reference, split out of [show-repo.md](show-repo.md) on
2026-08-16, where it was the buried middle of the corpus's largest document;
the `#stage=` link is also a surfacing primitive in
[SURFACING.md](SURFACING.md) ("Stage a fileset").
The shell that renders it stays documented in show-repo.md; the honesty caveat
there (a `#stage=` link is token-gated) applies to every handoff.

The stage is `store.stage`, a list of `{repo, ref, path}` refs (plus local items
from drops). One stage sits above any repo, since every item carries its own
origin.

**The stage does not save.** From 2026-08-03 to 2026-08-27 the view carried a
second sub-view, **Saved**, which listed the registry's `.surface` files, and
the bench could promote its working set into one. Both went. What remains is
the bench alone, at `?view=stage`; `?view=surfaces` is a retired alias that
lands on it, so old links resolve.

Why it went is not that a stage and a surface are unrelated. It is that the
association ran one way and stunted the other end: two `.surface` files exist
and neither was ever saved from a bench, while the surface format sat behind a
workbench pill where nobody browsing would look for curated content. The
envelope is unharmed and keeps its reader
([`lib/kits/surface.js`](../lib/kits/surface.js)) and its contract
([envelopes/surface.md](envelopes/surface.md)), where `stage/1` is one profile
of three and `branch-review/1` is the one with a live reader.

The bench is the working set. With nothing staged it is the drop target and the
adder, so a set can be built from a cold start.

What the envelope will not carry is as deliberate as what it will: a proposed
`destination` is a claim about the set and rides along, while a transfer in
flight, the bundle, and the Diff lens's per-side ref override are the tool's
business. The line is whether a field is still true a year later with no tool
running. `stage.targets` stays in the repo manifest for the same reason: where
a repo *accepts* files is a fact about that repo.

**A paste carries several formats, and the stage reads all of them.** One copy
out of a spreadsheet puts three things on the clipboard at once: the cells as
tab-separated text, the same cells as an HTML table, and a picture of the range.
The handler used to read one and return, so which one you got depended on where
the caret was (the page took the image, a form field took the text) and the rest
was gone. Neither behavior was the platform's: `clipboardData.types` had always
listed all three.

Now the flavor that was always taken is still taken, and the rest appear on an
**offer bar** above the staged list, one tap each. A bar rather than a dialog,
since the common case is "take the obvious one and carry on," and the bar is
also the only place that says what a copy actually put on your clipboard. A form
field keeps its native paste untouched and contributes what it cannot hold. Each
flavor is named for what it is, which is load-bearing rather than cosmetic:
tab-separated text is detected and named `.tsv` (at least two lines, every line
carrying the same nonzero number of tabs, so prose with a stray tab is not a
grid), and the reader opens `.tsv` as a **table**. The button path reads
`io.pasteItems()`, so it sees the same set the keyboard path does; on iOS, where
Safari fires no paste event unless an editable is focused, it is the only intake
and used to be text-only.

The reader opens a staged file through `ViewRegistry.READ_MODE`, the same
policy the Files view uses: markdown rendered, JSON as a tree, delimited data as
a table, everything else highlighted, raw past 300 KB. It was the Files view's
private constant until 2026-08-15; the stage wanting it is what made it shared.

**A dropped file is text when its bytes are text.** Every file intake reaches
the stage as an ArrayBuffer, and until 2026-08-17 the item was stamped binary on
that basis alone, so a dropped `.md` was held as opaque bytes: the "Not text"
note instead of the file, no diff, no bundle block, and no link able to carry
it, while the same characters pasted staged as text and opened rendered. The
decision is by capability, in two questions. A type the viewer draws from its
own bytes (image, PDF, workbook) stays bytes, since that is what makes it open
at all; everything else goes to a strict UTF-8 decode, and a decode that throws
or yields a NUL is what binary means here. So any text extension works, not a
list of them, and a `.md` now reads rendered with raw one tap away.

Takes from:

1. upload: the drop-zone (a file, or pasted text; pasted ref lines stage as refs),
2. **a drop or a paste anywhere in the host app** (below),
3. a repo: the **Add box** on the bench (below),
4. a repo manifest's `stage.files` (seeds an empty stage when that repo opens),
5. a `#stage=` link.

All five append. An intake briefly took a POSITION (2026-08-19), for a
compare-with-the-clipboard that needed its paste in the slot the positional pair
rule read; the reader picks its other side by name now, so where an item landed
stopped mattering and the parameter went with the gesture.

**A drop anywhere in the app stages, and the intake is why it can.** Until
2026-08-17 the fold lived inside the component, so nothing could stage anything
before the bench had mounted, and the bench mounts on your first visit to the
Stage: a file dragged onto Repos, a file view, or the Map had nowhere to land
and nothing on screen said so. The decisions now sit on `window.StageIntake`
(`take`, `takeFile`, `takeDrop`) with no view attached, and the host owns the
gesture: show-repo's shell takes a window drop on any view, stages it, routes to
the Stage, and, when exactly one file arrived, opens it in the reader. A batch
lands and stays listed, since a modal over a set nobody has seen listed is the
wrong first look at it. `StageIntake.focus(item)` is how the opening is asked
for: it names the item on `store.stageFocus` rather than calling the bench,
because at drop time the bench may not exist yet; the stager reads the key when
it mounts, or on the spot when it is already up, and clears it. Two drops the
shell leaves alone: one over a form field, which keeps its native drop, and one
the Stage view's own root already handled, which it can tell by
`defaultPrevented`.

**A paste anywhere stages too, and it took the same move to get there.** The
Stage has taken a paste since 2026-08-15, but through a window listener the
STAGER registered and gated on `view === 'stage'`: the gesture was reachable
only from the view it was staging into, and only once the bench had mounted. On
2026-08-18 the fold followed the drop's out to `StageIntake.takePaste(cd, opts)`
and the shell took the gesture, so a block of refs copied while reading a repo's
files, or a screenshot pasted on the Map, now lands the way a dropped file does:
staged, routed to the Stage, opened when it is the only thing that arrived.

Two things differ from the drop, and neither was a preference. **There is no
`defaultPrevented` tell**, because the ordering runs the other way: a drop on
the Stage hits that view's own ELEMENT handler first and the window second, so
the window can see it was taken, while window listeners fire in registration
order and the shell's `init()` always precedes a component that mounts on first
visit. So the stage's listener was removed rather than coordinated with, and the
shell's is the only one. Being the only one is also what keeps the multi-flavor
contract whole: one reader of the clipboard, so nothing takes `text/plain` out
from under the bar that would have offered the HTML table beside it. And **the
offer bar only fills where it can be seen.** A paste into a form field keeps its
native paste everywhere; on the Stage the flavors the field cannot hold still go
to the bar, and on any other view the clipboard is not read at all, since
recording an offer nobody was told about is worse than not looking.

The offers ride `store.stageOffers` for the reason `stageFocus` does, one step
further along: the paste that produces one can land anywhere, so the named,
deduped flavors have to survive until a bench exists to draw them. Naming and
dedupe are `StageIntake.offerable`'s, so a host gets the same answer the bench
would.

**A pasted grid is a grid whichever delimiter it uses,** and the naming is
where that is decided: `nameForText` picks an extension from the first
characters and `ViewRegistry.READ_MODE` keys on the extension alone, so what a
paste is CALLED is the whole of what the reader then sees. JSON is the one
flavor that can be checked rather than guessed, so it is: `isJson` parses, and
the leading `[` or `{` only guards the parse. Guessing it from that character
alone named a PowerShell script `.json` and sent it to the tree view, which
renders nothing for text that will not parse, so the paste was hidden rather
than merely mislabelled. Until 2026-08-18
`isDelimited` counted tabs only, so a spreadsheet range (which reaches the
clipboard as TSV) opened as a table while the same data pasted as CSV opened as
a wall of text. `delimiterOf` reads tab or comma at the same strictness the tab
test always had, counting separators outside double quotes so a quoted comma
stays a value; tab is tried first, so a TSV whose cells carry prose commas is
still a TSV. A `rows => rows` function is named `.js` in the same pass, and a
JSON array of records now opens as a table rather than a tree, which is what
this policy's sibling on the data-view page (`AUTO_VIEW`) always did by reading
the content.

**A third kind of offer reads the links out.** A copy off a web page splits
across two clipboard flavors and the split is unhelpful in both directions:
`text/plain` carries every link's label and not one of its addresses, and
`text/html` carries the addresses inside markup nobody wants to read. Both were
stageable and neither answered "just give me the links", which is a common thing
to want and took several steps to get.

So the **Inside** row, a sibling of the two chip rows above and deliberately a
third thing rather than a third meaning for either. The flavors bar offers
another ENCODING the platform already made; the transform chip offers another
TOOL for what was read; this makes a NEW ARTIFACT by reading structure out of
one. It runs over the pending OFFERS as well as the staged items, and that is
what makes the case it exists for one tap: an extraction that only saw the stage
would charge a tap on the html offer first, to stage a document nobody wanted.

The reading is `StageIntake.linksOf(text, name)`, keyed on the name the intake
already chose for the reason `transformKindOf` is. Markup (`.html`, `.xml`) goes
through `DOMParser` and `a[href]`; the other three text kinds (`.md`, `.txt`)
are scanned for markdown links, angle autolinks, and bare addresses, with the
markdown spans blanked first so one link is one row. `.csv` and `.js` are not
sources: the first is the transform chip's, and a URL in a comment is not a link
anybody asked for. An in-page `#anchor` and a `javascript:` handler are dropped,
`mailto:` is kept, and one address appears once however often the page repeats
it, first label winning, since a masthead included in the copy is not forty
findings. A relative href stays relative: a paste carries the markup and not the
page it came off, so there is no base to resolve against and inventing an origin
would be a guess presented as a fact.

**The artifact is a `.csv`, and that is the one choice here worth defending.**
It opens as a table with a per-column filter (`READ_MODE`), its raw mode is the
pasteable `text,url` lines, and `transformKindOf` calls it rows, so the
extraction lands ON the machinery that already exists rather than beside it. A
rendered markdown list would be tappable and be a dead end. It is named for its
source (`2026-08-28-paste.html` gives `2026-08-28-paste-links.csv`) so the pair
reads as a pair, and an extraction already on the stage is not offered again,
the flavors bar's own dedupe rule and needed for the same reason: the sources
survive being extracted, so a second tap would otherwise stage a second
identical table. The offer rides the reader's header too, since a single arrival
opens on itself and the reader is then looking at the markup rather than at the
row that carries the chip.

**The stage is also the transform workbench's door.** The workbench
(`lib/alpineComponents/transform-workbench.js`) has shipped inside show-repo
since the pre-build began globbing `lib/alpineComponents`, booting on every load
with nothing ever mounting it: reachable only as a Tools gallery card opening the
standalone page in another tab. `StageIntake.transformKindOf(item)` names what
the tool could do with a staged item, and the bench offers it as a chip.

Three kinds, and they are not equally certain. A **bundle** is the tool's own
`{fn, data}` output, recognized by the same `fn`/`fn_<tab>` key the workbench
tests itself for, so it is exact. **rows** is the data it eats: a `.csv`, a
`.tsv`, or a JSON array of records. A **transform** is a `rows => rows` function,
the loosest of the three and the most interesting, since pasting one is how work
RESUMES in the tool rather than starts. Recognition rides the name the intake
already chose rather than sniffing again, which is why the naming fix above is
what makes it trustworthy: before it, a pasted CSV was called `.txt` and nothing
could tell it from prose.

The chip is a sibling of the flavors bar, not part of it: that bar offers other
readings of one paste, this offers another TOOL for what was already read.
Tapping it opens the workbench as a **swipe-deck takeover**, the same kit the
reader moved onto the same day, so the header, Escape, the phone Back button,
history-backed dismissal and correct nesting all come for free and opening the
workbench from an open reader drills rather than stacking two scrims. A deck of
one, since a workbench is not a set to walk. The item's text goes over through
`processText`, the tool's own sniff chain, so a bundle rehydrates whole and a
CSV parses, with one reader of those shapes rather than two.

It mounts **fresh on each open**, which is right rather than a compromise: the
tool persists its tab sources in localStorage and deliberately never persists
data, and every open here arrives carrying an item to load. That is also what
keeps the one-instance rule true, since the tool addresses its viewer and table
by document id rather than through its root.

**The host has to bring the libraries:** PapaParse, which the parse path calls
unguarded, and Tabulator, whose absence is worse than an error, because the
table's render hook reads `typeof Tabulator === "undefined"` and returns,
drawing the whole chrome around an empty pane in silence. That is what the first
mount here actually did, which is why the scenario asserts the drawn rows rather
than the parsed ones.

The offer also rides the **reader's header**, not only the bench, and that is
where it matters most: a single arrival routes to the Stage and opens on itself,
so the reader is looking at the file rather than at the row. It is recomputed
per slide, since the compare is a property of the SET and holds across positions
while the transform is a property of the ITEM and does not.

**A bundle is the one kind that skips the offer and opens the tool directly.**
Every other arrival opens on its content, which is the right first look at
something you just pasted. A bundle's content is base64 gzip, so a tree of it
shows a handful of unreadable strings and the only thing that can read it is the
tool that wrote it. It is also the kind recognition is exact about, which is what
makes skipping the offer defensible here and nowhere else.

**The one platform limit worth stating plainly: iOS Safari fires no `paste`
event unless an editable is focused.** A window listener therefore has no intake
at all on an iPhone, so the gesture there is a TAP: the app header carries a
Paste button at every width, beside the sidebar toggle and outside the nav,
which scrolls on a phone. It routes exactly as the window listener does, staging
and then opening on the Stage, and the bench keeps its own Paste button for the
same act in place. All three run one implementation,
`StageIntake.takeClipboard`, which reads through `kits/io.js`.

Two things that path has to get right, and both were wrong until 2026-08-19.
**Reading the clipboard needs the tap's own user activation,** so nothing may be
awaited before the read; the button used to lazy-load the io kit inside its own
handler, which spends the gesture and then reports the loss as a clipboard
failure. The kit is preloaded at boot instead. And **the textarea fallback must
read its value rather than ask `execCommand('paste')` whether it worked**: on
iOS that returns false and pastes anyway, because the real read happens behind
the edit-menu pill the platform puts up, so gating on the return value made
every iOS paste resolve null and surface as "Paste unavailable in this context",
a sentence about the browser rather than about what happened. The recipe is the
`ios-clipboard` skill's, measured on a device.

Stage-view actions:

- **Add**: three panes behind the app's segmented pill, over one corpus (the
  estate's root repos) and one outcome (a staged ref). They share those but are
  not one question, so each pane owns its own state and shows only its own kind
  of row:

  | Pane | Answers | Rows |
  | --- | --- | --- |
  | **Browse** | where does it live | repos, then folders, then files; crumbs walk back up |
  | **Recent** | what changed lately | the cross-repo sweep, narrowed by single-select repo badges |
  | **Search** | what is it called | filename-contains across every root repo |

  These were briefly folded into a single query box (2026-08-04, same day).
  That put recent files in the same list as the repos you navigate, and a list
  that is half places-to-go and half things-that-happened reads as neither. The
  panes are back; what survives from the one-box build is the part that was
  about cost rather than layout.

  **Browse and Search share one tree cache.** Entering a repo reads its
  recursive tree, and tapping Search reads only what is still missing, so
  browsing pays for searching in advance instead of the two fetching the same
  thing twice. One recursive read per repo also answers every folder level, so
  descending never costs another call. The pill tap is the gate on that cost,
  which is what a tap is for and a keystroke is not.

  Each file row is one tap to stage and a second to unstage; the muted line
  reads `repo · folder`. Search's input is 16px below `sm` so iOS does not zoom
  on focus, and a leading `@` is eaten rather than matched, since the sigil
  `mention` needs mid-prose is redundant in a field that is already a file
  search. Browse has no text input at all, which is the tap-through picker's
  own rule and its reason. Local files are the one source that is not a repo
  file, so they stay a header action (the paperclip) belonging to no pane;
- **rename** a **local** item: the pencil on its row turns the name into an
  input with the stem preselected, Enter or a blur commits, Escape drops it. A
  local name is authored nowhere (a drop takes the file's own, a paste and a
  dictation get one sniffed from the first few characters), and it is read in
  four places: the row, the bundle header, the `name` a local item rides on a
  `#gz=` link, and the deposited path. The **extension** is the whole of what
  the reader uses to pick a mode and what the destination blob renders as, so
  a wrong sniff used to mean deleting the item and pasting it again. **A guessed
  extension is drawn as a guess:** where the name came from the sniff rather
  than from a file, a clipboard MIME type, or a link payload, the item carries
  `sniffed` and its extension draws with a dotted underline. Dotted and not
  dimmed, since dimming the one part worth a second look is backwards. That
  marker is the whole of what was missing: the pencil has always been the
  correction, and nothing said a correction was wanted. A rename clears it,
  because the name is authored from then on. A slash is
  allowed and means a subpath under the destination (`docs/notes.md` lands at
  `<dir>/docs/notes.md`); `..` and empty segments are dropped. Two locals with
  one name is warned about, not refused, since the deposit writes one over the
  other and nothing else on screen would say so. **Ref items do not rename:**
  a ref's `path` is its identity at its source, which the row states, the
  jump-over resolves, and `copyTo` reads back, so editing it would either lie
  about the origin or silently mean "land it elsewhere", which is a destination
  override and a different feature;
- **view** a staged file inline (a reading panel in the stage itself, with a
  GitHub jump-over to the file's true home; it never routes through a repo's
  Files view). **The reader is a position in the stage, not one file:** it
  carries an index, so the staged set is walkable by swipe on a phone or by the
  header arrows and the arrow keys anywhere. Same gesture and constants as the
  estate's branch takeover, so a horizontal drag reads alike in both and a
  vertical one still scrolls the file. Every position opens: a binary local
  file renders as an image (its bytes ride to the viewer as a data URI, since
  the image mode's usual fetch needs a repo and a pasted file has none) and a
  failed fetch renders a note in place of the viewer rather than refusing, so
  `2 / 3` always means the second of three and a step never skips.

  **The modal is a fixed height at every width**, `h-full` on a phone and
  `85vh` above it. It was `h-auto` under a `max-h` cap until 2026-08-15, and
  the two complaints that produced were one bug: the dialog resized as you
  stepped through the staged set, and long files would not scroll. An
  auto-height box gives its children no definite height to divide, so the
  viewer's `fill` body never became a scroll container and the box's own
  `overflow-hidden` clipped whatever passed the cap with no scrollbar
  anywhere. Pinning the height fixes both, and
  [`tools/test/stage-reader-height.mjs`](../tools/test/stage-reader-height.mjs)
  (`npm run test:reader-height`) holds it: neither claim is visible in a
  screenshot or reachable from jsdom, which has no layout, so the check
  measures the box on a 2-line file and a 4,000-line file and then scrolls the
  long one.

  **The comparison is a LEVEL over the reader, not a mode on it.** It was a mode
  until 2026-08-19: the same overlay, its slides rebuilt as diffs, one header
  button to flip back. That put the wrong meaning on the one control every
  reader reaches for. A header's ✕ dismisses the overlay, so from inside a
  comparison it read as "leave the comparison" and did "leave the file as well,"
  while the way back was a second, quieter button beside it.

  So it **drills** (`swipeDeck.drill`), and the kit's own conventions do the
  rest: the dismiss becomes a back chevron, the crumb carries where you came
  from, and the module-level deck stack makes Escape and the phone Back button
  pop one level rather than the lot. There is no partner button for coming back,
  which is the point of a level. It is the shape the estate already uses one
  floor up, where a branch takeover drills into
  [`kits/file-deck.js`](../lib/kits/file-deck.js), and inside this component,
  where the transform workbench drills off this same reader.

  One deliberate deviation from the kit's default, which returns you to the
  parent exactly where you left it: **the comparison walks the same set the
  reader does**, so comparison *n* is the file at *n* seen against its pair, and
  backing out lands where the walk got to rather than where it started.
  Returning to the entry point would silently discard the walk. The branch
  drill has no such problem, since a branch and its files are different things.

  The position already **proposes** a pair (the file you are on, and the one next
  to it), so a comparison is available whenever two or more are staged, nothing
  has to be chosen to get one, and with exactly two it is simply "the two." What
  the position proposes the reader can override (the pair, below). The
  comparison carries Copy, the review prompts (link-carried bespoke asks first,
  then the fixed set), **Open in Diff** for the Diff page's folding and its
  apply step, and **three readings of the one alignment**:

  | View | Is | Default |
  | --- | --- | --- |
  | **Unified** | one column of tagged lines, full context | under 768px |
  | **Split** | two columns, a changed line and its replacement on one row, with the moved words marked inside it | 768px and up |
  | **Patch** | a real unified diff: `@@` hunks at three lines of context, the two file lines, copyable | never |

  The ops are diffed **once** and each view renders from them, which makes
  switching free and is the only thing that makes the three agree. The
  width-dependent default is `pages/diff-tool.html`'s rule and its reason: two
  columns of code do not fit on a phone, and a reader who opens a comparison
  there should not have to fix that first. It is read once at mount, so a
  rotation does not move it mid-read, and the choice then survives closing the
  comparison, unlike the pick, because it is a preference about how you read
  rather than a choice about what you are reading.

  **Copy hands over what is on screen:** the real patch in Patch view, the
  tagged block in the other two. One verb, one button, and the title says which.

  Two pieces of that moved into
  [`kits/text-diff.js`](../lib/kits/text-diff.js) rather than being written
  here, because the page and the stage would otherwise hold a copy each.
  `patch()` is the hunk assembly, whose failure mode is silent: an off-by-one in
  a hunk header still renders as a tidy patch and fails only when something
  tries to apply it. `wordParts()` is the word diff as tokens rather than
  markup, since the page styles its marks from a stylesheet and the stage has
  none to use (the house rule is no vanilla CSS); `words()` is now that function
  rendered the page's way, so one dynamic-programming walk serves both.

  A `&mode=diff` link opens the reader with
  the comparison already drilled over it, rather than selecting a control on the
  page. The reader's one way in names what a tap does rather than how it is
  wired: `Compare a.md ↔ b.md`;

  **A slide's compare is the slide's own**, which took a fix on 2026-08-19. The
  comparison deck mounts the active slide and its two neighbours, each a diff of
  a different pair, and all three used to write one set of component fields. The
  last builder won, so on any stage of three or more the reader saw `a ↔ b`
  while the copy header and the **Open in Diff** address named `b ↔ c`, the
  neighbour drew no rows at all (its compare returned early on the busy flag),
  and the slide past it drew the first pair's rows under its own heading. Two
  staged items hid all three, since `min(i, n-2)` makes both slides pair 0,1,
  which is why the coverage passed. Each slide now resolves its own pair and
  holds the result; what the reader is ON is published to the fields every
  control outside the slide reads, on render and again on every step, so
  stepping re-aims the copy and the handoff and not only the rows;

  **The pair is where you are, against what you picked.** Side A is the file on
  screen at every position. It used to be `min(i, n-2)`, which kept the pair
  valid at the end of the list by sliding it backwards, so on the last slide A
  was the file BEFORE the one being read and the diff ran in a direction nobody
  asked for. Fixing A to the position costs the last slide its old direction,
  which is the trade.

  Side B is a **pick**, and the neighbour when there is none. The positional rule
  was a defensible minimum rather than a principle: it can only express ADJACENT
  pairs, so on a stage of five, "compare the first with the last" had no way to be
  said at all. Position proposes and the picker disposes, which keeps the
  zero-configuration case (two staged, open it, that is the pair) and adds the
  reach the rule could not. The diff bar states A, then offers B as a control,
  because that is the shape of the question: you are reading this one, against
  what? The two halves therefore do not look alike. Choosing opens a list of every
  other staged item, each with **where it came from** (`me/repo@ref`, or `local`),
  since two staged items can share a filename across repos or refs and the name
  alone is then the one thing that cannot tell them apart. The list opens in flow
  under the bar rather than floating: a slide is an `overflow-auto` box, so an
  absolutely-positioned panel is clipped by the very scroll container it sits in,
  and on a phone a deck slide is the whole screen, where a menu anchored near the
  top edge is the harder thing to hit.

  The pick is held by item **key**, never by index, because the stage moves under
  a reader: a drop, a paste or a remove renumbers everything, and an index would
  quietly re-aim the comparison at a file nobody chose. A key whose item has left
  stops resolving and the default takes over, and the key is forgotten so the
  picker shows no choice that no longer exists. It ends with the **reading**, not
  with the overlay: `drop()` is the deck kit's general teardown and so fires
  `onClose` exactly as the reader's own ✕ does, which means a deck rebuilt around
  a changed set looks identical to an exit from the outside. `_pReplacing` is what
  separates them, and without it staging anything while reading silently
  un-picked what the reader had chosen to compare against;

  **A compare-with-the-clipboard shipped and was withdrawn the same day.** It
  staged the clipboard in the next position and turned the diff on, which worked,
  but it fused an intake with a selection: the stage has three paste buttons
  already, and what was missing was the SELECTION rather than a fourth way to
  paste. Pasting and then picking the result says the same thing with each tap
  meaning one thing. What it left behind is the position parameter on the
  intake's fold, also withdrawn, and the observation that a stage of ONE has
  nothing to compare against, which remains true and is answered by staging a
  second item rather than by a bespoke gesture;

  **The reader says which file is on screen, and the sidebar follows it.** The
  FAB drawer floats over the reader still aimed at whatever it was aimed at
  before, which for the Stage view is the app shell: a reader six files into a
  set they assembled had a Render tab naming `show-repo` and rooting its path
  picker there. So the reader announces on the subject channel
  ([`kits/subject-channel.js`](../lib/kits/subject-channel.js), the one
  toss-render stamps and [`kits/file-deck.js`](../lib/kits/file-deck.js) already
  speaks on), once per position and through the comparison walk too, since side
  A of a comparison is the position. The drawer then names the staged file, roots
  its path picker at that repo and ref, aims its github menu at that blob and
  reads that ref's guide, and the reader's header grows the same door into the
  sidebar the file deck has. A **local** item announces `local` plus its label
  rather than staying silent, which folds the ref bar and the path picker away;
  silence would leave the drawer describing the shell, so stepping off a repo
  file onto a pasted one would watch the sidebar keep naming the file just left.

  **No `base` rides along, and that is the one field the file deck announces and
  this does not.** `base` is what raises the drawer's compare bar, whose pick
  travels back on `__compareRef` for the *cards* to read. This reader owns its
  comparison and reads no such global, so a base would hang a second compare
  control in the drawer that changes nothing on screen. The comparison stays
  where the position lives.

  **And the ref bar re-addresses rather than navigating away.** Its rows say
  "render this file at that ref," which everywhere else means leaving for the
  renderer; over a hand-assembled set that drops the set. The file deck answers
  by re-rendering the slide where it stands. The stage answers in its own verb:
  the version **joins the set and is read**, with what you were reading one swipe
  away and a comparison of the two one tap away. Nothing is removed, and `grab`
  dedupes, so asking twice seeks rather than duplicating. The fab asks any routed
  subject that has installed the handle, rather than the one route name it used
  to test for: what establishes that a surface can re-address is the handle, not
  what its route is called;

- **Out**: the deposit surface, and the only lens on this side now. It covers
  everything leaving the stage: the concatenated bundle (each file under a
  `// === owner/repo[@ref]:path ===` header; icon actions to refresh, copy,
  download, with the size beside it) and the send-to-repo (destination is the
  tap-through selector in folder mode; two-tap Send). There is no Out/Diff pill:
  the two were never two views of one thing. Out is where the set **leaves**;
  Diff was a way to **read** two of its files, and reading belongs in the
  reader (above), which already walks the staged set and can therefore pair
  two of it with no second set of controls. (The base...head branch compare is
  not here either: it lives under the Branches view, with the review it serves.);
- **Save**: the pin on the Staged header, opening the dialog above.
  This replaced a write of `stage.files` into a named repo's `.web-tools.json`,
  which overwrote the previous save, put a cross-repo set in one repo's config,
  and dropped local files in silence. A manifest's `stage.files` is still
  *read* as a seed (below); nothing writes it from here;
- **Persistent link**: mint the `#stage=` URL that reopens this exact stage
  anywhere (ref items only; local files cannot ride a link).

## The `#stage=` link grammar

```
#stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3
```

Groups are `;`-separated, paths `,`-separated within a group, `@ref` optional
(absent means the source repo's default branch). Paths are URL-encoded per
component with `/` left readable. The link carries **refs only**; file content
stays behind the viewer's token. Full base:

```
https://mehrlander.github.io/web-tools/app/#stage=owner/repo@ref:path1,path2
```

Mint one by hand by grouping items by `repo@ref` and joining. Example: two files
from a branch of this repo plus one from another repo →

```
…/app/#stage=mehrlander/web-tools@my-branch:lib/gh-api.js,lib/stage.js;mehrlander/home:inbox/note.md
```

### Commentary: the `&prompts=` param

A link is one object with two halves, **refs** (the `#stage=` spec) and
**commentary** (an optional `&prompts=` param). The refs are pointers, so their
content stays behind the token; the prompts are authored text, so they ride the
link. `prompts=` is a base64url'd JSON list of `{label, ask}` review asks:

```
…/app/#stage=owner/repo@ref:before.md;owner/repo@head:before.md&prompts=<base64url(JSON)>
```

The Diff lens shows those bespoke asks first (a sparkle marks them), above its
six fixed general prompts, each still one-click-copying both compared texts plus
the diff plus that ask.

An optional `&mode=diff` is the third part of the object: the intent that this
stage opens as a diff. A `mode=diff` link opens the **reader** on its diff and runs the
compare on open (no click), so a review link lands the reviewer straight on the
diff; without it a stage opens with the reader closed, on the Out surface (a bundle handoff). `StageLink.mint(items,
base, { prompts, mode })` encodes all of it (a bare prompts array is still
accepted for the legacy call), and `StageLink.parseLink(hash)` returns `{ items,
prompts, mode }`; the bare `StageLink.parse(hash)` still returns just the items
for callers that only want refs. A soft cap (24 entries) keeps a runaway prompt
list from bloating the URL. This `{refs, commentary, mode}` shape is the seed of
a richer surface schema: the same object a manifest's `stage` block or a future
standalone surface file would carry, with file content the file-only extra the
token-gated link cannot hold.

`StageLink.read(location)` reads that object from the **hash first, then the
`?query`** (same keys: `stage`, `prompts`, `mode`). The fragment stays the
default and the private form; the query fallback is what lets a stage ride a
context that eats the `#`: a `toss-render` srcdoc (whose params shim answers
`?query` lookups, so `…show-repo.html?stage=…&mode=diff` renders a staged diff
inside the toss), an email or chat that strips the fragment, a deep link. When
minting a query-form link into a toss `#gh=` address, encode the inner `&`
separators as `%26` so the toss's own hash parser keeps them inside the `gh=`
value.
