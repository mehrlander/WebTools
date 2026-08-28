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

Now the flavor that was always taken is still taken, and **every** flavor appears
on a **flavor bar** above the staged list, the taken one ticked, one tap each
way. A bar rather than a dialog, since the common case is "take the obvious one
and carry on," and the bar is also the only place that says what a copy actually
put on your clipboard. Until 2026-08-28 it listed only the LEFTOVERS, which made
it an add list: bringing the html in was one tap and choosing it INSTEAD of the
text was a tap plus hunting the text down in the list below, and choosing
between two readings of one copy is the commoner want. A tick that toggles says
both in one control, and the chip's state is read off the stage rather than held
on the chip, so removing the row below un-ticks it. A form field keeps its native
paste untouched, ticks nothing, and still names what it could not hold.

**Hovering a pill shows what is inside it**, through the house hover card
([`kits/source-peek.js`](../lib/kits/source-peek.js)) rather than anything this
view draws. What separated `html 4.1 KB` from `txt 192 B` was a title attribute
reading "Stage 2026-08-28-paste.html", which is the pill's own label again, so
the flavor with the addresses in it was unopenable until you had committed to
staging it.

The card was a split pill with an eye and a panel for an afternoon, then a
daisyUI tooltip for another: two tap targets inside one badge, and then a dark
box in a light app that reinvented placement, dwell, the keyboard path and the
touch rule, each one worse. **The kit had already decided all of them.**

Using it widened its convention rather than copying it: a peek's subject was
"an exact file on GitHub" and is now **a named text**, of which a repo file is
one case. Nothing in the kit had to change. `data-peek` carries the pasted
file's own name, `seed()` puts the bytes in its cache, and a key that is not an
address never reaches the fetch, since the cache hit comes first; the card's
head falls back to showing the key as the path, which is the file name wanted
here. The extension decides the rendition, so an `.html` flavor
shows as source and a `.md` one renders, unless the seeder overrules it (below).
An **image** carries no peek, since this card reads text; its menu is the whole
of what it offers.

**Each pill carries a menu of what can be done with its flavor.** The pill is
the subject and the menu is the verbs: **Copy**, **Markdown** on markup,
**Base64**, and **Decoded** where the text decodes. Each label names the
**version you get**, not the trip to it. The tap still stages and unstages,
which is what is wanted most and the one thing that should not cost a menu.

**A conversion lands as a pill, and does not open the reader.** Opening it was
the first shape and it was wrong twice over: it takes the screen away from the
bar you are working in, and it answers a question ("what does this look like")
that was not the one asked ("give me this version"). So the bar stops meaning
"what the clipboard held" and starts meaning **what this paste has produced**,
which is also what makes a conversion composable: the markdown that just landed
carries its own Copy and its own Base64, so a second step is a tap rather than a
trip through the staged list. A derived pill is labelled by the **tag** that made
it rather than by its extension, since `md` says nothing next to a paste that
sniffed `.md` and a decode can land on any extension at all. It is also
**dashed**, and stays dashed once it is staged: the border says where the thing
came from, which does not change, while the tick says whether it is on the
stage, which does.

Conversions had a pill of their own for a day, which put a derivation beside the
formats it is made from and could hold only the one anybody had asked for; the
row would have grown by a pill per verb. The shape before that was a links
extractor, as a csv and then as a markdown list, and it is gone entirely:
converting the markup carries every link as `[text](url)` already, in its own
context. What is lost is that reduction, a bare list with the prose stripped
out.

**Copy is the reason the menu exists at all.** The stage is where a paste lands,
so the cheapest way to change what is on the clipboard is to take a flavor back
out of it: copy the html of a copy that only gave you text, or copy the markdown
of a page. It goes through `window.io.copy`, which owns the focus wait, the
insecure-context fallback and the legacy DOM path, rather than
`navigator.clipboard` directly.

**Base64 runs both ways, and `base64Info` is one function rather than a test and
a converter**, so the two cannot disagree about what valid means: an item the
menu offers has already been decoded. Three gates, each paying down a false
positive. The **alphabet** (url-safe accepted) and a **length** that is a
multiple of four, which is what the padding is for and what rules out most
prose; a floor of 16 characters, below which a word like `deadbeef` qualifies on
arithmetic alone; and a decode that lands on something **nameable**, meaning
text, or bytes whose first four say what file they are (png, jpg, gif, pdf, zip,
webp). Unknown binary is refused rather than staged as `.bin`, since "here are
some bytes" is not an answer anybody asked the menu for.

A `data:<mime>;base64,` URI is read too, and **its own media type beats the
sniff**, since it is what the encoder said the bytes were. That is the whole
reason the prefix is worth recognizing rather than the arithmetic, which the
payload passes on its own. Text still wins where the bytes are text, so a
base64'd `image/svg+xml` lands as markup rather than as an opaque file.
Encoding is `b64OfText` (the escape/encodeURIComponent sandwich, since `btoa` is
a byte encoder and throws on the first smart quote) or `b64OfBytes` (chunked, for
a pasted screenshot, which is the case base64 exists for and the only verb a byte
flavor can answer).

**The conversion is Turndown's, and the host loads it**, the same contract the
transform workbench states: `StageIntake.mdOf` owns the options and the GFM
plugin (which is what turns a pasted web-page TABLE into a table rather than a
run of cells) and throws rather than fetching, since a lazy fetch inside a tap
spends the gesture and then reports the loss as something else. Two files and
31 KB, fetched the first time somebody chooses the item and never on a paste
where nobody does. Cached against the **source text**, not the name: two pastes
on one day carry the same sniffed name, so a name-keyed cache hands the second
one the first one's markdown.

**And the markdown opens raw**, where every other `.md` in the app renders.
`READ_MODE`'s rule is right for a document, whose question is what it SAYS; a
conversion is a **payload**, and its question is what it IS, since the reason to
make one is to copy the text somewhere else. Rendering it puts a mode switch
between the reader and the thing they asked for, and strips the `[text](url)`
that was the point. The override is `StageIntake.opensRaw`, keyed on the name
`derivedName` mints, which is a closed loop: the intake is the only producer of
that suffix and the stage's own reader the only consumer.

**The card has to agree with the reader**, or a hover previews a different thing
than the tap opens, so `seedPeeks` passes `'source'` for exactly the names
`opensRaw` claims. That is the second widening the kit absorbed without changing:
`seed(addr, text, kind)` lets a seeder that MADE the bytes state a rendition the
name cannot say, and omitting it leaves the extension deciding as it always
has.

Every derivation is named for its flavor (`-markdown.md`, `-base64.txt`,
`-decoded.<sniffed>`), and the decode is named by what its bytes turned out to be
rather than by the `.txt` they arrived as, which is what split `extForText` out
of `nameForText`. Scoped to the paste's flavors, since the bar is about the
paste; a staged file that arrived some other way keeps its markdown route through
the reader's header, which **focuses instead of adding a pill**, since its
subject is a staged file rather than a flavor of the paste on the bar.

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
