# The branch overlay: preview a cross-repo change before it merges

How the Web Tools app shows a branch's version of the estate: the overlay that
substitutes a branch's files while you browse, the branch-detail takeover, the
sidebar's second ref, the ref bar's in-place actions, and dropping a file on a
branch. Split out of [show-repo.md](show-repo.md) on 2026-08-16; the shell that
hosts it stays documented there, and the branch page itself
(`pages/branch.html`) is the shareable single-branch address the surfacing
conventions call the branch anchor.

```
show-repo.html?overlay=<branch>
```

Previews the estate **as if `<branch>` were merged wherever it exists**. The
join it rides is a platform fact the conventions already name: a session uses
one branch name across every repository it touches (a workstream), so a
same-named branch across repos is a session's signature, not a coincidence.
The overlay applies the branch per repo where it exists and falls back to the
default branch where it does not; existence is asked of GitHub (one branch
probe per cached repo, once per session), never assumed.

Why this needs to exist at all: the toss machinery pins two of the three
things a preview depends on, and the third is the one cross-repo changes live
in. `#gh=` pins the subject file and its same-repo dependencies; `?use=` pins
the lib the shell loads; neither reaches the **runtime data reads** the
running app composes itself ("read that other repo's manifest"). Worse, the
read that feeds the sidebar is not even a read of the other repo: it is a
read of the **config cache** (`state/configs.json`), a derived artifact baked
from main-side crawls, which no view-time ref redirection can change. The
overlay closes both gaps for the piece that matters:

- **Manifest splice.** Each overlaid repo's `.web-tools.json` is fetched live
  at the branch and laid over its cached entry before anything derives from
  the cache (membership, groups, icons, `projects` rows, app views). One GET
  per overlaid repo; a branch without a manifest keeps the cached one.
- **Browse at the branch.** Opening an overlaid repo (its row, a project row)
  opens it at the branch ref, so the landing, pins, files, and the repo's own
  live-read config all preview the branch. The crumb trail's ref chip shows
  the off-default ref as usual.
- **A preview says it is one.** The Repos header carries a warning-tinted
  branch chip (tooltip: which repos the branch applied to), and each overlaid
  row gets a matching glyph.
- **Writes are classified, not banned.** The split that matters is whether the
  overlay touches a write's **inputs** or its **target**, and refreshing the
  derived caches touches neither: the crawls build their own clients pinned at
  main, so a Refresh under overlay reads and commits exactly what a normal
  session would, and the buttons work inside a preview the way intuition says
  they should (held by test: the crawl never reads at the overlay branch).
  This shipped guarded at first, on the instinct that a preview must not
  commit derived state; the guard defended nothing and turned Refresh into a
  silent no-op, which is the worse failure. The genuinely hazardous class is
  writes the overlay *does* touch, and it has one known member: the
  contents-API save path commits to the default branch, so editing an
  overlaid repo's config would read branch state into the editor and write it
  to main. Entering the Config view under overlay warns about exactly that
  mix. Note the residual honesty gap the crawls keep: Activity ages update on
  Refresh but describe main, per the general limit below.

Because the parameter rides the query and the toss params shim delivers a
subject's `?query`, a coordinated preview works **before any of it merges**,
through main's deployed toss renderer:

```
…/toss-render.html#gh=owner/web-tools@<branch>:app/index.html?overlay=<branch>
```

The outer `@<branch>` pins the shell (the code half); `?overlay=` pins the
data half. After the shell change merges, the deployed form
`show-repo.html?overlay=<branch>` does the same for data-only branches.

The honest limits, stated rather than implied: the overlay re-derives only
the per-repo **manifests**; other main-derived artifacts (the activity and
sessions caches, tracker boards, generated catalogs) are not overlaid and read
main. And an
overlay link is only as durable as the branch it names: once the branch
merges and is deleted, every probe misses and the link degrades to a plain
main view, which is the correct end state for a preview.

## Branch detail: the takeover

Tapping a branch name in the Activity view's Open list opens the branch
**here**: a full-viewport takeover whose header carries the repo, branch, PR
number, and position (n of m), with the embedded [branch
page](../pages/branch.html) as the body, live at its `#gh=` address so every
fact is an API read at open time. The list supplies the sequence, frozen at
the tap so a cache refresh cannot yank it; swipe on the header or the edge
strips, arrow keys, or the chevrons move through it, clamped at the ends;
Escape or the X closes. Staging a branch's changed files, the name's old tap
action, moved into the branch menu as **Stage changed files**.

**The header and the embedded page split the identity, and neither repeats the
other.** The header keeps what it alone can say: which repo, which PR, and where
you are in the list. The **branch name lives in the page**, on its own line with
the full width. Both carried it for a day and at phone width both truncated, so
one screen showed two stubs of one name; the header gave it up because it has
less room and more to say. The page drops the repo and the PR link when framed
(`window.self !== window.top`) and shows them standalone.

**The takeover has its own address:** `?view=activity&detail=owner/repo@branch`,
stamped while it is open, following each swipe, and cleared on close, so Back
leaves the takeover rather than the view. The header's link button copies it.
This was the one state in the view with no address: the list had `?view=activity`
and the branch had its standalone page, and the reader in between could be
reached only by tapping. A link naming a branch the current list no longer holds
(a filter hides it, or it landed) still opens, as a list of one, since a link
that resolves to nothing is worse than one with nowhere to swipe.

**Above both sections is the Look row: the branch, running.** Chips naming the
app views this branch changes, each one an address into the deployed app at the
branch's own tip (`app/?use=<sha>&view=<key>`), followed by a render link for
each page the branch changed. It sits above the heading row because it is not a
reading of the branch but the branch itself, and because a constant position is
most of what it is for: a render link was reachable before this, as a dimmed
icon at the end of a file row and a menu row two taps into a card, and was still
asked for in chat every time. Findable in principle is not findable.

**The join is not new and is not re-decided here.** `routeActivity.routesTouched`
has answered "what is this branch working on" since the Routes pane shipped, and
the estate's Open list has painted its answer on branch rows ever since: a hit on
a file fewer than three routes declare puts the branch **on** that route, a hit
only on a widely shared file leaves it merely **near**, and the shell never
counts. That rule carries a scar (the Routes pane's first render claimed work
open on eleven routes off three pull requests) and re-deriving it beside a second
copy is how a scar gets forgotten. What this row adds is the **ref**. The Open
list's chips call the shell's own dispatcher, which walks the page you are
already on to that view: main, rendered from main, at the one moment the branch
was the point.

The shared routes collapse to a `+N shared` count rather than chips, and the
pixels are the argument: one wide file is wide precisely by being declared many
times, so a branch touching `estate.js` brushes nine routes at once, which
rendered as two lines of ghosted labels above the one line that answers the
question, at 430px. It opens nothing, since every route in it is one the rule
says the branch cannot be claimed to change.

Two limits it states rather than hides. `?use=` fetches `dist/web-tools.js` and
not `lib/`, so a branch that changed a component without rebuilding serves the
old bundle under a link that resolves and renders; the row says **bundle not
rebuilt** when the changed files show it. And the routes are read from
`docs/app-routes.csv` at the branch ref, so a branch that adds a route shows it,
while a branch in any other repo gets no row at all rather than a guess: routes
are one page in one repo, and asking every other repo for a CSV it cannot have
is a 404 per branch step for a question the repo's name already settled.

Where the compare is deferred (in show-repo the crawl lends the head's numbers,
so the diff waits for a tap) the row holds its place as the ask for that read.
It renders as absent only when there is genuinely nothing, because a reader who
cannot see the row concludes the branch changes no view.

The same decision the row makes is available at a terminal as
`npm run showing`, which writes the identical `?use=<sha>&view=<key>` address for
a lib-only branch; a test holds the two to each other, because two answers to
"where do I look at this branch" is the state this replaced.

**Its sections are a scroll, not panes: files above the guide.** Guide and Files
were a segmented control under the facts strip until 2026-08-31, and the switch
went because it was answering a question nobody had. The two are not
alternatives, so a tab made each one the cost of hiding the other: a reader
checking what a branch touched lost the judgment that says why, and a reader on
the guide could not see the file it names. Both render now, and the only cost is
a scroll.

**The order is the decision.** Files lead because the list is what a branch page
is opened for and the part that cannot be read anywhere else in one place; the
guide is prose and reads perfectly well below it. That also settles the
complaint the tabs were introduced for, which was the changed files sitting
below a full screen of guide. The heading row keeps the count the Files tab
carried, so "how much is here" is still answered without opening anything, and
the guide keeps a marker there (its number, with a down arrow) that scrolls to
it, because a section below the fold needs something at the top saying it is
there.

**The file rows start collapsed, at every width.** They opened on a wide screen
with a modest change set while the files were a pane of their own with nothing
under them. They are not any more: an open card pushes the guide, and four of
them put it three screens down on a change set the reader could otherwise take
in at a glance. Closed, the list is the scannable manifest the stacking was for,
and the diff is one tap on a row or the deck button on the heading row.

**The list is one panel** rather than a bordered box per registry group. Thirty
files across two or three boxes was a column of borders carrying no information,
and stacking the sections raises the bar: the list has to hold together tightly
enough to leave the guide reachable under it. One border, hairline rows, group
headers as tinted bars inside it.

**It carries the content verdict, and carries it as a filter.** The panel's own
header row is the three counts the estate row's chip shows (`landed`, `differs`,
`missing`, summing to the total), each one tappable to show only that class,
which is what the estate chip links into: a reader who taps `11 missing` on a row
lands here on those eleven files, open as diffs, rather than on a tooltip listing
paths. A caption inside the thing it captions is one element instead of two,
which is the density argument in one row. Filtering runs above the registry
grouping, so one rule covers the list, the groups and the file deck instead of
each filtering for itself, and the heading reports what it is showing out of what
there is.

It is a filter and not a badge per row, for the reason the collapsed-density
pass took a control off every row: thirty rows are read by scanning, and a glyph
on each is a column of noise. The one exception is a **missing** file, which
carries a mark while the list is unfiltered, since that is the class worth
spotting unasked; once a filter is on, the strip has already said what every row
is.

The verdict is measured **here**, from two recursive tree reads (the base and
the branch tip) run through `BranchStatus.pathStates`, and not awaited: the file
list paints off the compare and the marks arrive a moment later. Two trees is
about a fifth of what the compare it follows already spent, and it is paid once
per branch per reading pass. A host that already knows the answer lends it
(show-repo's crawl computed the same verdict for its row chip) on the same
provisional contract as `facts`, which makes the counts right in the first frame
and the `missing` filter exact before any tree is read, since the crawl stored
those paths themselves. Measuring anyway is what keeps a cold, unhosted
`branch.html` able to show the same thing, and keeps one rule producing both
readings.

**The two warnings beside the strip open their own line.** `tree truncated` says
GitHub would not list a repo's whole tree, and `not measured` says the scan
failed; both are statements that the counts above them may be wrong, and both
carried the actual reason (which consequence, which error) only in a `title`,
which is the one place a caveat about a number must never be the sole occupant.
They are buttons now, and tapping one opens a line under the strip carrying the
reason: for a truncated tree, that a path GitHub left out reads as missing here,
so the missing count is a ceiling rather than an answer. See
[HTML-STYLE.md](HTML-STYLE.md) for the rule and
[`scripts/stranded-titles.py`](../scripts/stranded-titles.py) for what still breaks it. Where the branch has **no merge base** there is no compare and so no
diff to render, and the pane falls back to listing the lent missing paths as
links, which is the actionable half of a scan whose counts otherwise span more
than the branch.

There were three panes until 2026-08-15, and **Commits** was the third. It
earned its place nowhere: its count restated the strip's own ahead figure (a
compare's `total_commits` is its `ahead_by`), and twelve commit subjects beside
a PR body describing the same work in prose is the body's job done worse. What
it did carry alone is a branch with **no pull request**, where the subjects are
the only account of what the branch did, so that case moved into the Guide
pane, which is where a reader looks for an account: the card names itself
("what this branch did, no pull request describes it") rather than printing
bare shas under a tab. The tab now always shows, since there is always
something to say about a branch, and tapping it asks for the compare when the
commits are what it will have to say. The deferral is unchanged for a branch
that has a guide: it still renders on the pulls call alone.

Since 2026-08-06 the embedded page carries the branch's **guide** as well: the
PR body, rendered through `kits/guide-render.js`, the renderer the FAB drawer
has used since PR #295. The takeover therefore shows the whole picture in one
place, judgment and mechanics both, and the two are sourced differently on
purpose: the guide is READ from where it is written, and the file list is
DERIVED from the compare. Neither is a copy of the other, which is what keeps
this from being a second account of the branch to maintain (the reasoning is
the merge guide's, one level down: do not restate what a live read answers).
Arrows step through every PR the branch has had, since a merge ends a PR and
not the branch, and `#gh=owner/repo&pr=<n>` addresses a PR directly, resolving
to its own head and base rather than to today's default branch.

This settles the host question in the branch-page-as-navigation task: the
sequence lives in the shell, which already holds the list, and the standalone
`branch.html` survives as both the shareable single-branch form and the
renderer the takeover embeds, so there is exactly one branch-detail
implementation. Deployed, the in-app route replaced the exit to GitHub as the
Open row's primary read, and the 🌿 entry in
[SURFACING.md](SURFACING.md) now names `branch.html` as the canonical
shareable address with `?view=activity` as the browsing route, its tossed
fallback retired.

### One mechanism, two levels

Until 2026-08-13 the takeover was bespoke: an overlay, a hand-rolled
touchstart/move/end drag, a two-phase commit animation, an instant facts card,
and an `<iframe>` of `branch.html` with a postMessage channel to talk to it. It
is now a **swipe-deck** whose slides each mount the `branchBrief` component
directly in this shell's Alpine, and the file deck **drills** from it: same
chrome, same gesture, one level down.

**The iframe was the whole reason for the rest, and it was never needed.** The
shell's own bundle already registers `branchBrief` and `fileReview`, and every
kit the branch view wants loads into it with zero network requests, so the frame
was a second copy of a library already running. Removing it deleted about 540
lines here and 165 in `branch-brief.js`, and replaced them with an `open()` call
and a render function.

What that buys is not tidiness, it is the gesture. A native scroll-snap track
runs on the compositor thread, keeps tracking when the main thread is busy
rendering a diff, carries the platform's fling and deceleration, is
interruptible mid-flight, and has the neighbouring branches really there under
the finger. The hand-rolled drag had none of that: it ran on the main thread,
sampled `touchmove` at a lower resolution than the compositor does, called
`preventDefault` so the browser had to wait for it, read no velocity at all
(commit was `|dx| > min(90px, 22%)`, so a fast flick of 60px was rejected and a
slow crawl of 100px committed), spent about 400 ms sliding one surface out and
back in, and locked out a second swipe while it did. `show-repo.html`'s own
dashboard pager is now the only hand-rolled swipe left in the app.

**What the header carries.** The deck's slots take the takeover's chrome one for
one: the branch's last segment as the title, `repo · #PR` as the subtitle, the
repo's icon, the PR as the header exit, `n / m` in the pill, the pager in the
footer, and copy-this-link as an action. The **last segment** rather than the
whole name, for the reason the file deck titles a file by its filename: a header
at phone width has room for one of the two, and `claude/` distinguishes nothing.
The full name is written once, in full, on the slide's own identity line, which
is also why a framed slide drops the repo and the PR link it used to carry.

**Three things the shell still owns.** The sequence and the position (`detail`),
because the address is stamped from them; the header, through `deckChrome` and
`dressDeck`; and `onSlideMeta`, which is how a **merged** PR number reaches the
header at all, since the activity crawl asks GitHub for open pull requests only
and a finished branch has none in the cache.

**Opening replaces rather than stacks.** Two branch decks is the same level
twice, not a level down, and the finder's open-branch event and a `&detail=`
deep link can both fire while one is open. The old deck is `drop()`ped rather
than closed: `close()` leaves through history, and a history round trip cannot
land while a newer deck sits on top of it, so the old deck would defer to the
top of the stack forever and leak, still mounted. The replacement then reuses
its history entry, so Back still costs one press.

**The kit chain is pulled on first use** in `mountDeck`, and it is not optional.
The pre-build auto-boots every component, so the shell has `branchBrief`, but
not `kits/branch-brief.js`, which that component reads; a slide mounted without
it renders "this page has not finished loading its code" and nothing else. That
is the one thing the iframe did for free, since `branch.html` named the whole
chain and nobody had to notice it existed.

**A slide the reader leaves is emptied.** swipe-deck built lazily from the
start, and that was only half the job: `built[i]` never cleared, so the deck
retained every slide ever visited. Free when a slide is inert chat DOM, and not
free at all when it is a live app with fourteen file cards under it. Stepping
this deck through twelve branches left twelve mounted branch views and 168
mounted cards behind, with the DOM climbing 7,100 → 25,160 nodes,
monotonically, so it got slower the longer you read. Zero network requests over
the same eleven steps, so nothing was being fetched. The kit now drops any slide
more than `keep` positions away (default 2, one slide of hysteresis so a step
back does not re-render), Alpine tears the tree down on removal, and
`release(i, slide)` hands the caller back anything of its own: here and in the
file deck, the keyed global the mount travelled through. The same twelve steps
now plateau at four views and 10,712 nodes.

**And the diff is not read until it is asked for.** A branch is two calls, and
they cost two different things: the pulls call is the PR body and a few KB, the
compare is ahead/behind, the commits, and every changed file with its patch
embedded, in one response with no way to ask for a subset. On this repo that is
1.82 MB over 23 files, 1.60 MB of it `dist/web-tools.js`, whose own diff is 52
lines with three of them a quarter of a megabyte each. The pre-build rides in
nearly every commit here, so nearly every branch pays it, and the reader who
only wanted the guide paid it too. Worse, warming two neighbours meant three
copies in flight to show three PR bodies.

`kits/branch-brief.js` now caches the two reads separately (`readGuide`,
`readCompare`; `readBrief` composes them), `assemble` tolerates an absent
compare and marks the brief `pending`, and the view reads the guide at mount and
the compare when the reader taps Files or Commits. Opening a branch and swiping
three times moves no compare at all; one tap moves one.

Two things make the deferral invisible rather than merely cheap. The head's
numbers come from **`facts`**, which the host lends off the row the reader
tapped: the activity crawl already read ahead, behind, the branch's first date
and its sessions, so the badge and the strip are right on the first frame and
the compare overwrites them when it lands. And `facts` is also the **switch**: a
surface that lends nothing, meaning a cold `pages/branch.html`, has no other
source for the head, so there the compare is read up front exactly as before.
The rule is "defer when something else can answer the head, never otherwise",
which is why it turns on `facts` and not on `framed`. The warm follows the same
logic one step out: it always takes the guide and the registry, and takes a
neighbour's compare only once this slide has read its own, which is to say only
for a reader who is actually looking at diffs.

**One tap from a branch to its files.** The deck button used to appear only on
the Files pane, which made the file reader something a reader found *after*
opening a list: two taps, and the second discoverable only once the first had
been made. It now sits on the tab row at every pane, wears the only colour in
that row, and fetches the compare itself when the diff has not been read, which
after the deferral is the usual case. The Files tab keeps the list, for scanning
and for choosing where to start; the button is for reading. Cost of the
promotion: three tab labels with counts plus four controls do not fit a 390px
row, so the tab strip now scrolls rather than clipping its last label under the
first button.

**A file opens as itself.** The card had four tabs and all four were source
(Diff, Patch, New, Base), which is right for source and wrong for everything
else. A `.gz` printed "Binary or oversized content" and then printed the
content, mojibake and all, because the notice and the New pane were gated on
different conditions; a `.md` opened on a diff of its markup; a `.png` had no
view at all. `fileReview` now reads a `kind` off the extension, with the NUL
sniff as the fallback, and computes its tab strip from it: markdown renders
through `kits/guide-render.js` (one definition of what this estate's prose looks
like, and the link re-aiming comes with it), an image and an SVG show from the
bytes as a data: URL, a gzip is **inflated** natively by
`DecompressionStream` so a `urls.txt.gz` shows its urls, and anything else
binary gets a stated fact and the exits with its decode dropped so no pane can
reach it. Source files are unchanged.

Where a file LANDS is the surface's call, and that is what `read` says: the deck
is for reading, so a document opens rendered there and diffed in a list; an
image and an archive have no useful diff either way and open as themselves
everywhere. The deck also passes `bare`, dropping the card's own collapsed row,
since the deck header already names the file. This is why `lib/gh-api.js` gained
`bytes()`: `get()` is a UTF-8 decode, lossy by construction for anything that is
not text, and `get()` is now that method plus the decode.

Touching the client at all deserves its own note, because every page in the
estate loads it. It was a placement call rather than a necessity: the same two
calls could have lived in the component, at the cost of repeating the client's
over-1MB blobs fallback. What the call costs is a **cache-skew window**:
`toss-render.html` imports `gh-api.js` from jsDelivr on `@main`
(`?use=<ref>` reads raw.githubusercontent with `cache: 'no-store'` and is
therefore always current), and the client and the component are separate cache
entries, so after a merge the CDN can serve a new component against an old
client. The purge link shortens that window and does not close it, so
`fileReview._bytes()` falls back to the two calls by hand when `gh.bytes` is
absent. Nothing else in the estate calls it, and `gh.decode()` stayed where it
was for the three pages that do use it.

**One row of controls, and one copy button.** The github menu and two copy
buttons sat on a strip above the tabs, which put two rows of chrome between the
card's header and its content on a phone and separated the copies from the tabs
that decide what there is to copy. They are on the tab row now, at its right
end, with the tab strip scrolling so they keep their place at any width. And
there is one copy button rather than two: "content" and "patch" asked the reader
to map a label onto the tab they were on, and offered "content" for a PNG. It
takes whatever is showing, says so in its tooltip, and hides on a pane a
clipboard cannot take (an image, a binary). On the Diff pane it takes the
unified patch, since a CM6 editor is not text.

**The slide is the frame.** A card in the Files pane is one row among thirty
and earns its border, its tint and its own capped, scrolling pane. A card that
IS a deck slide does not, and stacking the two was measurable: at 1280px, three
nested scrollers and 562px lost between the viewport and the prose, with two
scrollbars visible at once. Under `bare` the card now drops its border, its
inner padding and its `max-h`, so the slide is the only vertical scroller and
the prose gets the deck's full column. The image pane keeps its frame in both
hosts, because the checkerboard IS the frame and a transparent PNG without an
edge has no visible bounds.

**Rendering follows the house rule, not a fourth copy of it.** The Read pane
goes through `kits/guide-render.js`, the renderer the guide bodies already use,
and fences frontmatter through `SourcePeek.fenceFrontmatter` first, which is the
same fix `map.js`'s `renderDoc` borrows for the Docs deck. The one duplication
left is deliberate: the card repeats source-peek's markdown test rather than
calling it, because source-peek is a kit this card does not otherwise need and a
card that called a `.md` plain source because a kit was late would be worse than
the repeat. The two are held together by assertion instead
(`file-review-card`, "the two classifiers agree"). The estate's answer to which
renderer to use at all is in [HTML-STYLE.md](HTML-STYLE.md).

**The crumb is budgeted.** The deck header reads `<branch> · <dir>`, every
branch here is a `claude/<slug>` running to twenty-five characters, and CSS
truncates from the right, so a deep path lost its own folder and kept the repo
root: the specific half discarded to keep the general one. The directory now
elides from the middle (`sources/…/drs.wa.gov`) and the whole crumb has a
character budget scaled off the viewport, spent from the left, so the branch
gives way before the folder does. Verified in the browser at 320, 390 and 430 by
comparing the element's scrollWidth to its clientWidth; below about 360px the
ten-character floor on the branch still overflows and CSS truncation takes over.

**The deck tells the sidebar what it is showing.** The FAB already answers
"which version of this am I looking at": its Render tab names a repo, a ref and
a path, roots its path picker there, aims its github menu at it, and its ref bar
lists the branches carrying a different version of that file, one tap to render
at any of them. It learns all of that from one channel, `window.__tossSubject`
plus a `toss-subject` event, which `toss-render` stamps per render and the fab
adopts. Nothing about that channel is toss-specific but its name: it already
carries a `route` for "a file the renderer could not show as a page, so an app
is showing it instead", which is exactly a deck slide. So the file deck
announces on it, and the sidebar follows the reader from file to file.

**The machinery is a kit now, and this doc records the deck's half of it.**
[`kits/subject-channel.js`](../lib/kits/subject-channel.js) owns which windows
are listening, what is saved before the first write, and the answer bridged back
down; the deck asks it for a channel and says which file per slide. The lift
came with the second announcer, the Stage's reader
([`stage.md`](stage.md)), which is also what retired the fab's one whitelisted
route name: it asked for `route === 'deck'`, and what establishes that a surface
can re-address is the handle it installed rather than what its route is called.
The one thing the kit fixes rather than moves is that the snapshot is taken when
the channel opens, not at the first write, so a surface's own handle can never
be what gets restored to the page it borrowed from.

Three things that took measuring. The deck leaves `via` off and the fab fills it
from the page it recorded at mount, so an announcer never has to work out what
app it is inside. `subjectFramed` is new and splits what `viaToss` had
conflated: a toss subject lives in a frame the fab reaches into, a deck slide is
in this document, and the annotator was reporting itself blind on a file it
could annotate perfectly well. And the drawer moved from `z-50` to `z-[75]`,
above the deck's takeover: it now describes the file on screen, and a drawer
behind the thing it describes is a coupling nobody can reach.

**Which WINDOW is listening was the part that was wrong first.** Inside a toss
the deck runs in the frame, whose own fab declined to mount (`toss-render`
stamps `__fabHosted`), and the fab that is listening is the shell's, one window
up. An announcement written only to `window` reached nobody, so the whole
feature was invisible through exactly the link branch work gets reviewed with.
The deck now writes to every window that might hold a fab, this one and the
parent when hosted, and hands both back on close. An address-mode toss is
same-origin so the parent is reachable; a `#gz=` payload toss is opaque, the
access throws, and that is the honest end of it.

**And the deck offers its own door.** On a phone the deck is the whole screen
with the launcher on top of it, so the sidebar reads as belonging to what you
are looking at. On a desktop the deck is a centred panel and the fab reads as
belonging to the page behind it, so nothing says the two are connected. One
header action opens the drawer on the Render tab, through a
`web-tools:open-drawer` announcement the fab listens for (the same idiom as its
hard refresh, and it crosses the frame boundary the same way the subject does).
Deliberately a door and not a duplicate: a second branch dropdown in the deck
header would be the third copy of FAB turf in the app.

**What a swipe costs the drawer.** Adoption was written for tosses, which
re-address rarely and change everything when they do, so it dropped the lot. A
deck announces on every swipe and changes only the path, and dropping the lot
there re-ran the whole branch scan per swipe and re-parsed the guide body:
visibly reloading the drawer while the reader was moving between files. The
invalidation now splits by what each thing is keyed on. Guide, version chip and
default branch belong to repo + ref and survive a swipe. The branch scan is
the one genuinely per-file answer ("which branches carry a different copy of
THIS path") and reloads. Measured after: zero guide re-renders per swipe.

Two smaller cuts fell out of the same question. Ahead/behind is a property of
the branch pair rather than of the file, but the scan hands back fresh row
objects each time, so twelve rows meant twelve REST compares per swipe for an
answer that had not changed; it is memoized per `repo|base...branch`, holding
two integers rather than going through `branch-brief`'s cache, which holds the
whole compare with its patches. And `loadBranchPrs` now goes through
`BranchBrief.readGuide` where the page has it: the same pulls call, behind the
sixty-second cache the deck has already warmed, so the drawer joins a read
instead of issuing a second identical one.

Measured end to end by `tools/render/scenarios/branch-deck.mjs`, which is also
what caught both of those faults above.

## The sidebar owns the second ref too

The drawer answered "which version am I looking at". From 2026-08-14 it answers
"against what", and the file surface answers neither. That is the whole
division: **the sidebar owns the comparison, and a card showing a file does
what it is told.**

The card's four source tabs were the argument for it. Diff, Patch, New and Base
are four renderings of one fixed pair, and on a reading surface the question is
not which of four renderings but against what: the branch's merge base, the
default branch, another branch entirely. That is a ref, and a ref is the one
thing the drawer already knows how to pick. So on a `read` host the strip
collapses to the file and one **Compare** pane, and the pair arrives from
outside.

Two channels, one per direction, and neither side holds a reference to the
other. Up: the deck's subject announcement gained `base` and `baseName`, which
is what makes the compare bar appear at all; a page rendered at a ref has no
second version in play and gets no bar. Down: `web-tools:compare-ref` carries
`{repo, ref, base, baseName, off}`, with `window.__compareRef` holding the last
one for a slide that mounts after the choice was made. `off` is a field rather
than a null payload, because null already means "nobody has published
anything", and a deck that has just opened must not read the previous deck's
silence as an instruction.

Three things the move costs, all of them facts that were only ever true of the
announced base:

- **The API patch.** The compare endpoint's patch text describes the merge
  base and nothing else, so moving the base drops it: the diff is computed from
  the two files instead, and the copy button on that pane goes with the patch
  it used to hand over.
- **The status.** `added`, `removed` and `renamed` are the same kind of claim,
  so once the base moves the card stops trusting them and derives status from
  what the two fetches found. A file "added" on this branch may well exist on
  the branch now being compared against.
- **The rename mapping.** `previousPath` is how the announced base saw the
  file, so on any other ref it is a guess. It is still the best guess going, so
  it is tried first and the current path is the fallback, at one extra call on
  a renamed file only.

Only the base side refetches. The new side did not move, and on a deck slide it
is already on screen: refetching it would blank the pane the reader is looking
at to arrive back at the same bytes.

The comparison is a property of the branch pair, so it survives a swipe and
does not survive the branch changing under it, and leaving the deck takes it
with it rather than leaving a pair on the global naming a branch nothing on
screen is showing. A card also declines a pair addressed to another repo or
another ref: the channel is a global, and silently diffing against a ref the
reader never chose for this file is the worst failure available here.

The cross-window case is the same asymmetry as the announcement and needs the
same bridge. Inside a toss the cards are in the frame and the listening fab is
the shell's, so it publishes on a window the cards are not in; the deck relays
shell to frame, one direction, for as long as it is open.

`tools/render/scenarios/sidebar-compare.mjs` runs the round trip in a browser,
which is the only place the two halves meet: jsdom holds the publish
(`fab-toss.test.mjs`) and the adoption (`file-review-card.test.mjs`)
separately. `SHOT=menu` and `SHOT=card` point the same scenario at the picker
and at the slide.

## And the ref bar acts in place too

The bar above it still went to the renderer: outside a toss it navigates to
`toss-render`, inside one it re-addresses through `__tossNavigate`. Over a deck
both are wrong. The reader is thirty files into a changeset, and answering
"show me this at main" by leaving for a single-file renderer throws away the
list, their place in it, and the way back.

A deck can do better, because it already owns the slide: change the ref,
rebuild the two or three slides that are mounted, and the reader has not moved.
So the deck publishes `__deckNavigate({repo, ref, path})` on the windows it
announces to, borrowed and returned with the subject, and `goTarget` tries it
before it navigates. **The handle's answer is authoritative:** false means the
deck genuinely cannot show that file (another repo, or a path not in this
changeset), and then it is a real navigation after all. That is what keeps the
path picker working, which reaches `goTarget` by the same route.

Moving the ref voids the same class of fact the compare bar's move does, one
step further out: `patch`, `status`, `additions`, `deletions` and
`previousPath` are all things the compare said about **the branch**, so a slide
rebuilt at another ref is passed none of them and derives what it needs from
the two fetches. The crumb changes too, and it has to: its whole job is to say
where the reader is, so the ref takes the head slot from the parent deck's
title, and a caller-supplied context that was itself naming the ref gives way
rather than leaving both refs in one line saying neither is current.

That closes the three steps this section has been tracking since the deck
first announced.

## Drop a file on a branch

The Activity view's branch menu carries **Drop a file here**: GitHub's
new-file form opened on that branch with the filename prefilled
(`github.com/<repo>/new/<branch>?filename=…`), defaulting into the repo's
declared `inbox` (else `dump/`), date-stamped and still editable in the form.
It exists for the phone flow: paste long content straight onto a session's
branch without routing it through a chat context, with no placeholder commit
and no cleanup. In the frame vocabulary above this is a deliberately
*ambient* write with matching frames: the form both shows and targets the
named branch. The chat-side twin is the `drop-link` skill, which mints the
same URL on request.

Session drops are intake, not cargo: the session that receives one promotes
or consumes it, and wrap-up leaves the intake folder empty, so a merge
carries no drop residue. Gitignore cannot do that job (it governs untracked
files, and a drop is a commit); the convention is the mechanism, and it is
the same one home's `chron/dump` already runs ("trends toward empty"). A
repo that instead wants transient bulk kept off main entirely declares a
branch box (`"inbox": "@drops:inbox"`), per Inbox and outbox below.
