# The stage: the Web Tools app's working surface

The stage is where a cross-repo fileset is assembled, read, compared, saved,
and sent. This is its reference, split out of [show-repo.md](show-repo.md) on
2026-08-16, where it was the buried middle of the corpus's largest document;
the `#stage=` link is also a surfacing primitive in
[SURFACING.md](SURFACING.md) ("Stage a fileset"), and a saved stage is a
surface ([envelopes/surface.md](envelopes/surface.md), the `stage/1` profile).
The shell that renders it stays documented in show-repo.md; the honesty caveat
there (a `#stage=` link is token-gated) applies to every handoff.

The stage is `store.stage`, a list of `{repo, ref, path}` refs (plus local items
from drops). One stage sits above any repo, since every item carries its own
origin.

A staged fileset *is* a surface
([`docs/envelopes/surface.md`](envelopes/surface.md), the `stage/1` profile), so
the **Stage view holds both sides of that coin**, as two pill-switched
sub-views: the **bench**, which works a surface, and **Saved**, the shelf that
displays the saved ones. Same segmented pill as Activity's three and Map's two,
at every width, each pill carrying a live count (staged items; saved surfaces),
which is what keeps a staged set visible while you read the shelf and the saved
pile visible while you work the bench. Naming the whole view for the display
half alone (it was called Surfaces from 2026-08-03 until 2026-08-04) left the
working half with no word in the UI at all, reachable only by knowing that a
low-contrast pencil opened it.

- The **bench** (`?view=stage`) is the working set. It is not a card on the
  shelf and no card becomes it: **the bench does not move.** With nothing staged
  it is the drop target and the adder, so a set can be built from a cold start.
  When it holds a loaded surface the pill row's right side reads `from <name>`
  and carries **Detach**, where Activity's row puts as-of and Refresh.
- A **saved card** offers **Load onto the stage**, which reads its addressable
  items onto the bench, switches to the bench pill so the load is visible, and
  remembers where they came from, so saving **writes back** to that file rather
  than leaving a near-duplicate beside it. The card is badged `on the stage`.
  Prose items have no file behind them and are reported, not dropped.
- **Detach** keeps the items and drops the write-back, which is how "start from
  this one and make a different one" is said. Clearing the stage detaches too,
  since an origin without its items would aim the next save at a surface the
  bench no longer holds.
- While a surface is on the bench, its card renders what the bench holds, so
  display never disagrees with the set you are holding.
- **Saving a working set appends:** a new v2 `stage/1` file in the registry's
  `surfaces/`, named from its contents, touching nothing already saved. A saved
  set goes away by deleting its own file. Either way the dialog previews the
  exact JSON and names the file, because the serialized form is not guessable
  from the list on screen.

`?view=stage` is still an address: it opens the shelf with the working card's
bench open, so every old link and every `#stage=` transport lands. It is no
longer a pane.

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
grid), and the preview opens `.tsv` as a **table**. The button path reads
`io.pasteItems()`, so it sees the same set the keyboard path does; on iOS, where
Safari fires no paste event unless an editable is focused, it is the only intake
and used to be text-only.

The preview opens a staged file through `ViewRegistry.READ_MODE`, the same
policy the Files view uses: markdown rendered, JSON as a tree, delimited data as
a table, everything else highlighted, raw past 300 KB. It was the Files view's
private constant until 2026-08-15; the stage wanting it is what made it shared.

**A dropped file is text when its bytes are text.** Every file intake reaches
the stage as an ArrayBuffer, and until 2026-08-17 the item was stamped binary on
that basis alone, so a dropped `.md` was held as opaque bytes: the "Not text"
note instead of a preview, no diff, no bundle block, and no link able to carry
it, while the same characters pasted staged as text and opened rendered. The
decision is by capability, in two questions. A type the viewer draws from its
own bytes (image, PDF, workbook) stays bytes, since that is what makes it open
at all; everything else goes to a strict UTF-8 decode, and a decode that throws
or yields a NUL is what binary means here. So any text extension works, not a
list of them, and a `.md` now previews rendered with raw one tap away.

Takes from:

1. upload: the drop-zone (a file, or pasted text; pasted ref lines stage as refs),
2. **a drop anywhere in the host app** (below),
3. a repo: the **Add box** on the bench (below),
4. a repo manifest's `stage.files` (seeds an empty stage when that repo opens),
5. a `#stage=` link.

**A drop anywhere in the app stages, and the intake is why it can.** Until
2026-08-17 the fold lived inside the component, so nothing could stage anything
before the bench had mounted, and the bench mounts on your first visit to the
Stage: a file dragged onto Repos, a file view, or the Map had nowhere to land
and nothing on screen said so. The decisions now sit on `window.StageIntake`
(`take`, `takeFile`, `takeDrop`) with no view attached, and the host owns the
gesture: show-repo's shell takes a window drop on any view, stages it, routes to
the Stage, and, when exactly one file arrived, opens it in the preview. A batch
lands and stays listed, since a modal over a set nobody has seen listed is the
wrong first look at it. `StageIntake.focus(item)` is how the opening is asked
for: it names the item on `store.stageFocus` rather than calling the bench,
because at drop time the bench may not exist yet; the stager reads the key when
it mounts, or on the spot when it is already up, and clears it. Two drops the
shell leaves alone: one over a form field, which keeps its native drop the way
the paste path leaves a field's own paste alone, and one the Stage view's own
root already handled, which it can tell by `defaultPrevented`.

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
  the preview reads to pick a mode and what the destination blob renders as, so
  a wrong sniff used to mean deleting the item and pasting it again. A slash is
  allowed and means a subpath under the destination (`docs/notes.md` lands at
  `<dir>/docs/notes.md`); `..` and empty segments are dropped. Two locals with
  one name is warned about, not refused, since the deposit writes one over the
  other and nothing else on screen would say so. **Ref items do not rename:**
  a ref's `path` is its identity at its source, which the row states, the
  jump-over resolves, and `copyTo` reads back, so editing it would either lie
  about the origin or silently mean "land it elsewhere", which is a destination
  override and a different feature;
- **view** a staged file inline (a preview panel in the stage itself, with a
  GitHub jump-over to the file's true home; it never routes through a repo's
  Files view). **The preview is a position in the stage, not one file:** it
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
  [`tools/test/stage-preview-height.mjs`](../tools/test/stage-preview-height.mjs)
  (`npm run test:preview-height`) holds it: neither claim is visible in a
  screenshot or reachable from jsdom, which has no layout, so the check
  measures the box on a 2-line file and a 4,000-line file and then scrolls the
  long one.

  **The preview also holds the diff**, because the position already names a
  pair: what you are on and what is next to it, so nothing is selected and
  nothing is offered to select. `min(i, n-2)` keeps that valid at the end, so a
  diff is available whenever two or more are staged, and with exactly two it is
  simply "the two" from either position. One header button toggles the modal
  between the file and the comparison, carrying the tagged rows, Copy, the
  review prompts (link-carried bespoke asks first, then the fixed set), and
  **Open in Diff** for the Diff page's split view and real patch. Stepping with
  the diff open re-pairs and re-runs, so walking the set walks its comparisons.
  A `&mode=diff` link opens the preview on its diff rather than selecting a
  control on the page;
- **Out**: the deposit surface, and the only lens on this side now. It covers
  everything leaving the stage: the concatenated bundle (each file under a
  `// === owner/repo[@ref]:path ===` header; icon actions to refresh, copy,
  download, with the size beside it) and the send-to-repo (destination is the
  tap-through selector in folder mode; two-tap Send). There is no Out/Diff pill:
  the two were never two views of one thing. Out is where the set **leaves**;
  Diff was a way to **read** two of its files, and reading belongs in the
  preview (above), which already walks the staged set and can therefore pair
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
stage opens as a diff. A `mode=diff` link opens the **preview** on its diff and runs the
compare on open (no click), so a review link lands the reviewer straight on the
diff; without it a stage opens with the preview closed, on the Out surface (a bundle handoff). `StageLink.mint(items,
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
