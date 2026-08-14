# show-repo: browse, stage, and move files across repos

⭐ **Open it:** [show-repo](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html) (the hosted shell; append `?repo=owner/repo` to open a repo)

show-repo is one hosted page that browses **any** GitHub repo and moves files
**between** repos. It is the cross-repo instrument: a session hands the user a
link into it, or configures a repo so the shell presents it well. Rendering a
page is a different job (that is `toss-render`, see the boundary below); show-repo
shows and moves files.

This doc is the reference. The `#stage=` link is also a surfacing primitive in
[`SURFACING.md`](SURFACING.md) ("Stage a fileset 🗂️"), the transfer-side
sibling of the toss `#gh=`/`#gz=` forms.

## The one honesty caveat, up front

A `#stage=` link and any private-repo browse are **token-gated**: they work only
in a browser that holds the viewer's stored `ghToken`, and only for the token
owner. This is the same constraint as toss-render's `#gh=` address mode. Two
consequences:

- A stage link sent to someone without an authorized token fails. The **Claude
  app's in-app browser** keeps its own storage, so the token is not guaranteed
  there (historically absent, but it can be entered, after which the link works);
  treat it as possibly token-less, not certainly so.
- The token-less, works-for-anyone `#gz=` content-carrying form that toss-render
  has is **contemplated but not built** for the stage. To hand a fileset to a
  token-less reader today, download the concatenated bundle and `SendUserFile`
  it, or (for a single page) `#gz=` toss it.

State this whenever you hand over a stage link, the way the toss primitive
states its `#gh=`-vs-`#gz=` split.

## Browsing: the shell and its views

Open a repo with `?repo=owner/repo`, optionally `&ref=<branch|tag|sha>`. Public
repos browse with no auth; private repos and branches need the viewer's token.
Deep-link params: `&view=` takes any of `estate`, `activity`, `sessions`,
`guides`, `chats`, `todo`, `jots`, `stage`, `surfaces`, `tools`, `map`,
`state`, `search`, `proposals`, `public`, `app` (the estate's own views) or
`landing`, `pages`, `atlas`, `files`, `branches`, `config`, `project` (a repo's).
Beside it: `&file=<path>`, `&path=<dir>`, and a second key for the views that
carry one, `&tab=<tab>` (**project**'s pill row, **Map**'s tabs), `&item=`
(**State**), `&detail=` (**Branches**), `&sq=` (**Search**), `&window=`. A view
keeps its default second key out of the URL, so an existing bare link still
opens where it always did. `&view=portable` is a retired alias that still
resolves to the Map.

**Every view is addressable, and one table says so.** The shell holds a `VIEWS`
table, each row naming a view's URL key, how a link opens it, and what it stamps
back; `routeFromUrl` dispatches through it at boot and again on popstate, and
`deepLinkParams` stamps through it. Adding a row is the whole of adding an
addressable view.

It was three hand-copied else-if chains until 2026-08-11 (a dispatch chain in
`init`, the same chain in `restoreFromUrl` for Back, and the stamp chain in
`deepLinkParams`), and by then all three ways of drifting had happened at once:
`?view=pages` stamped and restorable but absent from boot, `?view=proposals`
dispatched by both chains and stamped by neither, `?view=estate` stamped only
beside a `repo`/`ref` param on a premise that had expired. Each was a view the
app could reach and could not name, and none of the three was visible from
inside any one chain.
[`tools/test/show-repo-routing.test.mjs`](../tools/test/show-repo-routing.test.mjs)
keeps the collapse honest (no view name may be compared directly inside the
routing functions; every view the shell enters has a row) and then re-parses
each row's own stamped address, on the default repo and on another, since the
`repo` key is dropped as redundant on the first and that is the case estate
broke in.

**The landing names itself by naming its repo.** A repo's front page is
`?repo=owner/name`, with no `?view=` beside it, since a view key on the
most-linked shape in the app would be redundant on every one of them.
`?view=landing` still resolves, and then clears itself back to the plain form.
The catch was the **default repo**, whose `repo` key is dropped as redundant
everywhere else: that left the hub's own landing with an empty query and no
address at all, the same defect estate had. The landing row puts `repo` back for
that one view, so `?repo=mehrlander/web-tools` persists and reopens where it
says. No other URL changes shape.

**Two context levels.** The page is either in the **estate** (the global,
all-repo context) or in a **repo** (a per-repo context with its own views).

The **header carries the app-level nav**: a fixed, app-owned set of the estate's
own views, **Activity** (Branches / Sessions by pill), **Lists**, **Repos**,
**Stage**, **Tools**, and **Map**, as icon buttons (icon + label on desktop,
icon-only on mobile), lit on the active view and present on every viewport. The
`#repo` component sits beside the nav but renders nothing (it is the repo/auth
controller and hosts the shared dialog), and there is neither an auth shield nor
a brand icon. The far end of the row carries two desktop-only clusters, both
described below: the **rail** (the manifest's `rail: true` links) and the **ref
switch**. The mark left the header because its tap was the
**dashboard** (Activity for a signed-in viewer, Repos for a signed-out one) and
both of those are the first item of the nav it sat against: a second route to a
destination named a few pixels away. It still leads the sidebar crumb trail,
where it is the route home from inside a repo, so the app keeps one copy of it
rather than two. There is no repo-list dropdown and no quick-links row:
**repo selection happens on the Repos dashboard** (a card opens the repo), which
reads better than a dropdown and keeps the header a fixed set rather than one
repos opt into.

### The ref switch: which ref show-repo itself is running

Past the rail, behind a hairline, sits the **ref switch**
(`lib/alpineComponents/refSwitch`), which answers a question none of the rest of
the chrome does: *which ref is this page running off?* and lets you change the
answer.

It is a **text box, always present**, not a button that reveals one. Paste a
branch, tag, or sha, press Enter, and the page reloads running from it. That is
the primary verb and it is deliberately not behind a tap: the state it serves
best is the default branch, where there is nothing to report and everything to
do, so a control you have to open first puts a door in front of the one thing it
exists for.

The same box is the **readout**. It holds the current ref as its value and goes
warning-tinted off the default branch, where a house button appears beside it
back to the live page. One slot answers "what am I running" and "take me
somewhere else", rather than a chip and a field competing for the same corner.
Focus selects the whole value so a paste replaces it; Escape puts the readout
back. Until the box is edited its value is a readout rather than a query, so it
does not filter the list and Enter on it goes nowhere.

Two buttons flank it: a **caret** opening the branch list (typing filters it,
and a Go row appears for a name that is not in the list), and a **lightning
button that jumps to the most recently committed branch**, which hides itself
when the newest branch is the default one.

**It is not the Files view's ref picker, and the two are easy to confuse.** That
one chooses which ref of the *browsed* repo you are reading; this one chooses
which ref of `mehrlander/web-tools` **show-repo itself runs from**. Same
vocabulary, different subject, so the panel spells out the repo and path it acts
on every time it opens.

It switches by navigating to the toss renderer with the ref pinned on **both
halves**, `?use=<ref>` for the renderer's own lib chain and `#gh=…@<ref>:…` for
the page, since `?use=` alone re-pins only the lib a page loads and would leave
the shell (this header included) at the deployed version. The page's current
deep link rides along as the trailing `?query`, so a switch lands on the screen
you were already looking at rather than at the front door.

The branch list is the same survey the fab's Render tab runs
(`branchesForPath`, degrading to an undated list without a token) and it loads
**on hover or focus, once**: a page nobody touches the control on pays nothing.

The fab remains the fuller instrument, and the only one on a phone, since this
cluster is desktop-only, like the rail and for the same overflow reason; the
fab's launcher goes warning-tinted off the default branch on every viewport. The
two answer different questions now. This box switches refs and says which one
you are on. The fab's Render tab reads the ref you landed on, in this order:

- **repo and path as one picker.** Tapping either line opens the tree
  (`pathPicker`, the same tap-through selector this shell uses), rooted at every
  repo the token can see with the current one first at the ref on display.
  Choosing a file renders it **in place**, the same gesture as switching a ref:
  a page through the toss, anything else through the data view, which mounts the
  shared multi-mode viewer (`lib/alpineComponents/viewer.js`) whose modules
  declare their own coverage and whose `raw` module always passes, so no file
  type resolves nowhere. Inside a toss neither is a navigation at all, only a
  re-address: `__tossNavigate` for a page, `__tossRoute` for anything routed,
  which keeps the route map owned by `toss-render.html`. The thing being chosen is a file somewhere, so splitting it in two
  left the repo half inert and the path half unable to leave its own repo.

  **A routed subject is the file, not the app showing it.** A route resolves by
  fetching the renderer page and handing it the envelope, so the shell's own
  stamp names `pages/data-view.html` and the drawer over a markdown read
  reported that as the thing on screen. It is not: a route is a rendering
  strategy for a file the same way the frame is one for a page, and neither is
  what was addressed. `showRoute` re-stamps with the envelope, carrying the
  route key and a `via` naming the renderer, so the identity block, the ref bar,
  the github menu, and the guide all follow the file, a ref switch comes back
  through the same route rather than trying to mount a `.md` as a page, and the
  default-branch row re-addresses instead of leaving for a `canonicalUrl` that
  does not exist. One thing deliberately follows `via` instead: the **take
  grid**, which reaches into the frame's DOM for real, so zipping a markdown
  read gets you `data-view.html` and says so.
  Beside it the github mark is a **menu** rather than a link to one blob: this
  file, its commits, then the repo rows `lib/kits/github-links.js` gives the sidebar
  (repository, pull requests, issues, branches, commits at this ref, actions).
- **the ref bar**, which is the picker. One tap on a row renders there.
- **the guide**: the branch's PR body, rendered, with the blob links inside it
  re-aimed at what can show them (a page becomes a toss, markdown and data
  become a data-view read) and lifted into a chip strip, deduped by file so the
  convention's `[new]` and `[main]` pair does not list everything twice. Arrows
  step through **every PR the branch has had**, newest first, since a merge ends
  a PR but not the branch and the merged one's body is often the better account.
  With no PR the pane still reports the ref's standing: the commit it is at, the
  PR that code came from, and how long ago. That last part is where the version
  chip went; it used to sit above the guide, where its PR number was the one the
  *code* came from and read as competing with the one the *branch* is for.

So the header box is for moving between refs and the fab is for reading the one
you landed on.

The sidebar's **top bar is a crumb trail** (`crumbBar`, the shell's
`sidebarCrumbs`) in both contexts. At the app level it is the **product mark
alone**, which says what a "Views" label used to say and says it in the
vocabulary the repo trail already teaches. In a repo it is the mark, the repo,
and the ref only when it is off the default. The mark is the route to the
dashboard from inside a repo, and now the only one in the chrome; dropping the
owner prefix, always this account, is what pays for its slot, and the full
`owner/name` stays in the tooltip. The mark renders grayscale at rest and in colour on hover,
so it reads as a control rather than as branding. Tapping the repo crumb opens a
**repo switcher**: which repository is showing, current one checked, and nothing
else. A trail names where you are, so the only menu it earns is the set of other
places that slot could hold; acting on a repo lives in the row menu below.
**The drawer no longer closes when you navigate.** It used to dismiss itself on
every tap, on the reasoning that it covers the main area on mobile. But the
sidebar is also the thing you navigate *with*: closing it after each tap means
reopening it for the next, and it hides the fact that the list itself just
changed (a repo's views for the estate's, say). It now closes only when you say
so, by the scrim or the X, which makes the mobile drawer behave like the pinned
desktop sidebar that never closed.

The **sidebar** holds what is contextual: in a repo, its views (landing, atlas,
files, branches), its projects, plus pins and recents; in the estate, the Repos index and the
repo-sourced **app views** (promoted with `appView:true`, e.g. News). The app's
own view set never appears in the sidebar; the app views appear in both places,
since the header is the one-tap route and the sidebar is the one that holds up
when the header nav is too narrow to show them. On desktop the
pinned sidebar hides entirely when the estate has no app views, so the dashboard
runs full-width; on mobile it is a drawer behind the hamburger. See "The
estate", "The stage", and "Public browse" below.

The per-repo views in the sidebar:

- **landing**: the repo's front door. `landingKind(repo)` decides: web-tools →
  its page gallery; a repo whose manifest names a `landing` → that custom page
  (rendered live through toss-render `#gh=`), even if the same manifest also
  declares a `pages` catalog; a repo with a `pages` catalog and no `landing` →
  the gallery, fed from that catalog; every other repo → a synthesized
  overview (stats + README + a jump to the atlas). `landing` outranks `pages`
  for this one front-door slot, but never hides the catalog: see **pages**
  below.
- **pages** *(shown only when it adds something the landing button doesn't
  already)*: the standalone gallery entry, for a repo whose manifest declares
  both `landing` and `pages` — the front door went to the custom page, so this
  is where the catalog lives instead. Renders the identical gallery component
  the landing view uses when `landingKind()==='gallery'`; a repo without both
  fields set never needs it and the sidebar omits it.
- **project**: one workspace's front page, `?repo=…&view=project&project=<path>`
  (`&tab=board|pages|docs` deep-links a pill). What the landing is to a repo,
  this is to a project: a constant header (its name and path, and the routes
  out: its files, its board, its folder on GitHub) over a segmented pill row of
  **Overview / Board / Pages / Docs**, so the body changes while the reader
  never loses which workspace they are standing in.

  - **Overview** repeats the repo's landing decision one level down: an entry
    declaring a `landing` gets that page rendered live under the header
    (toss-render `#gh=` at the browsed ref; the FAB carries the full-page
    bust-out, as for a repo's custom landing), every other project gets the
    README at `<path>/README.md`.
  - **Board** renders a **file** board in-pane (a folder `tracker` keeps the
    header Board button and its open-the-folder behavior instead, having no one
    file to render). Every board tap (estate row, repo sidebar row) routes
    here, so the board reads the same from every level. This is the
    "first-class trackers" half of the project layer.

    It reads **`board.json`**, the typed projection the board generator writes
    beside `board.md` ([TRACKER.md](TRACKER.md)), and falls back to rendering
    the markdown when a ref has no projection: a tracker that has not
    regenerated since the generator learned to emit one still gets its board.
    The projection is what makes this a **review** surface rather than a
    renderer, since a board is a display artifact and recovering fields by
    parsing it would be the display-before-data inversion. What the typed read
    adds: sections grouped and counted with **Done collapsed** (it is the
    majority of every mature tracker, and a list that opens on its own history
    buries the few rows anyone can act on), `size` and `awaiting` per row, and
    a review line counting the open set, how many await someone, how many have
    been quiet three weeks or more, and how many carry no progress log at all.
    That last pair is the signal `board.md` structurally cannot hold, and
    "never logged" is kept distinct from "old" because a task nobody has
    written a line about has not aged, it never started. Rows open their task
    file in the shell's viewer, resolved against the board's folder, which is
    the same resolution the markdown fallback applies to a row's relative link
    (the protocol README, a task) while absolute links behave normally.
  - **Pages** is the workspace's slice of the repo's `pages` catalog,
    **derived rather than declared**: entries whose path sits under the
    workspace folder, plus entries claiming it with a `project` key. One
    catalog, two views of it; there is no per-project pages list to drift
    against the repo's. The tiles are lean cards (a lazy live preview that is
    itself the link, plus the GitHub source jump-over); the shot/live/source
    toggles stay on the repo-level gallery. The pill hides when the slice is
    empty.
  - **Docs** is every markdown file in the workspace, off one recursive tree
    read (the stage Search's primitive, keyed per repo@ref:project): the
    workspace's own root files first, then one group per folder with its full
    relative path as the header, READMEs leading, a path filter box, each row
    opening in the shell's viewer. A workspace keeping a curated `DOCS.md`
    gets it rendered above the mechanical listing. No manifest field feeds
    this; a failed tree read reports itself rather than posing as an empty
    workspace.

  The sidebar's **Projects** section lists the
  open repo's workspaces and lights the one showing; the estate sidebar's nested
  rows open the same view, switching the repo first. A project reads the same
  whichever level you arrived from. A deep link may name a workspace the
  manifest has not listed yet, and the view still opens, on the conventions the
  path implies.
- **atlas**: a standing structural view, available for every repo regardless of
  its landing.
- **files**: the explorer: breadcrumb + listing, selected file's content
  beneath. Each row has a `+` that stages the file.
- **branches**: the branch review (below).

**GitHub jump-overs.** show-repo is a wrapper over GitHub, not a wall: every
view keeps a one-tap route to the GitHub presentation of what it is showing.
The sidebar top bar links the open repo@ref and its recent entries link their
files, the explorer breadcrumb links the current folder, the viewer's actions
link the open file's blob, each staged item and finder row links its own
`repo@ref`, each compare row links its blob at head, and every estate card and
surface item carries its github-logo link. A new view should ship with its
jump-over.

The one glyph carries four meanings, and two rules keep them apart:

| Meaning | Example | Treatment |
| --- | --- | --- |
| Repo **menu** | the sidebar row's github button (`lib/kits/github-links.js`) | icon opens a list |
| Repo or branch **destination** | an estate card, the atlas header's ref chip | plain icon |
| The **manifest** behind a whole view | Map's Showing, Tools' curated list | icon **plus a label** ("Curate"), at the header's far edge |
| An **exact file** | a set row, a route's renderer, a staged item | plain icon **plus a source peek** |

A **source peek** (`lib/kits/source-peek.js`) is a hover card showing the file:
markdown rendered, JSON pretty-printed, everything else as source, a 28-line
excerpt in small type with no footer (the measuring line, "first 28 of 79
lines," was dropped 2026-08-07 along with the JSON shape headline it carried: a
cut excerpt visibly ends mid-document, and the tap carries the full read). A call site adds one attribute,
`:data-peek="owner/repo[@ref]:path"`, and a delegated listener does the rest; a
view holding the bytes already (the Map's two manifests) passes them with
`SourcePeek.seed` so the peek costs no fetch. `lib/gh-boot.js` loads it, the way
it loads the FAB: standing equipment for every page that boots the chain, rather
than a line each page's boot block has to remember. That placement is also what
makes it previewable, since a page shell is served from main even under `?use=`. The peek is what makes the fourth
meaning self-evident: an icon that can show you the file is pointing at a file,
and one that cannot is pointing at something broader. So repo, branch, folder,
and menu icons have none, and neither do the viewer's and the config view's
GitHub actions, which sit above the file's full contents already on screen.

It opens on hover where the pointer can hover, and on focus for a keyboard
reader. On a touch screen it never opens: the icon keeps its single meaning,
which is a tap that jumps to GitHub.

## The estate: the all-repo view

The estate (`lib/alpineComponents/estate.js`) is the central dashboard over the
whole repo constellation, and the page's global context (above any single repo,
reached from the header nav, the sidebar crumb trail's mark, or a bare page
open). It is a context with **views of its own**, switched from
the header nav the way a repo shows landing/atlas/files/…:

- **Repos** (`?view=estate`) — the repo cards.
- **Stage** — one nav stop with two pill-switched sub-views, each keeping its
  own deep link: the **bench** (`?view=stage`) and **Saved** (`?view=surfaces`)
  (below).
- **Activity** — the estate's own motion: one nav stop with four pill-switched
  sub-tabs, each keeping its own deep link: **Branches** (`?view=activity`),
  **Sessions** (`?view=sessions`), **Guides** (`?view=guides`), and **Chats**
  (`?view=chats`) (all below).
- **Lists** — the two personal piles, To-do over Jot, in one pane rather than
  two tabs. Both `?view=todo` and `?view=jots` resolve here (below).
- **Tools** (`?view=tools`) — a curated gallery of utility pages (below).
- **Map** (`?view=map`, `&tab=` deep-links a tab) — the portable set, Surfacing, Showing, the Docs registry, and Tests (below). Per-repo scope and adoption live on the Repos cards.
- **Proposals** (`?view=proposals`) — pending cross-repo edits awaiting a confirm
  (below). The one conditional entry: shown only while something is pending.

The estate component renders Repos / Stage / Activity / Sessions / Lists, sharing one lazy mount;
Tools and Map are their own components on their own lazy mounts.

Behind those, past a hairline rule, the header carries a **second nav group: the
repo-sponsored app views** (`appView:true`), one button each, carrying the icon
its repo declared. Each is addressable as
`?view=app&appRepo=<owner/repo>&appPath=<path>`, and the link stands alone the
way a Surfaces link does: it stamps the promoted page's repo and path
independent of whichever repo is open, so it is shareable on its own. The entry
is a peer of Repos and Surfaces rather than a card in the estate grid, and the
main area renders it live through toss-render `#gh=`.

The list is the sidebar's list (`appNav` reads
`sidebarAppViews`), so the two cannot disagree, and it is the same on desktop and
mobile: the nav scrolls rather than clipping, and the sidebar copy is what a
phone reaches without scrolling it. The rule plus the icons is the whole of the
separation; the app's own entries stay label-only. The header used to be a closed
set the app owned, which left room beside it unused and a published view
reachable only through the drawer. What did not move is the **swipe carousel**,
which still pages `estateNav` alone: an app view renders as an iframe that owns
its own gesture surface, so a swipe could page in and not back out.

**Repos: membership and fields live on each repo.** A repo appears on the estate
by opting in with `estate: true` in its **own** `.web-tools.json`. Every
descriptive field is the repo's too: `group`, `note`, `icon`, `order`, plus its
`pins` and `landing`. The registry holds **no per-repo config**. The single
source of truth for how a repo appears is the repo.

The estate discovers members by enumerating the account's repos (`gh.repos()`,
one list call that also carries description / visibility / pushed-ago) and
reading each one's config. Reads are served through the registry's **config
cache** (`state/configs.json`, below), so a normal load is two GETs, not an
N-repo scan; a cold cache falls back to a live per-repo scan and then rebuilds.

Cards lay out full-width as a three-wide grid grouped by `group` (a section
header + count per group, like the pages index). Group order and within-group
order both derive from each repo's `order` (a group sorts by its lowest member's
order). An `owner/foo-private` companion folds into `owner/foo`'s card by naming
convention (both on the estate; no field), where the visibility glyph becomes a
**toggle**: tap it to flip the card to the private repo's face (title, icon,
note, gear, jumps all switch) and back. The card name opens the repo in the
shell; the github-logo opens it on GitHub; the cloud-download icon opens the repo
in **Public browse**; the `pins` render as direct-jump chips. The gear opens the
shared repo dialog on its **Settings** tab (a form for `icon` / `group` / `note`
/ …, beside the raw-JSON **Config** tab and the **Info** tab), which writes the
repo's own `.web-tools.json` without navigating away.

**Adding a repo** sets `estate: true` (plus `group` / `note`) in the chosen
repo's own config through the viewer's token (candidates come from the header
picker's account list, minus current members). So both add and edit write the
**repo**, never a registry list.

**Saved surfaces** (the Stage's Saved pane) come from two places,
stacked in one scroll: the surface format
either way (a `manifest` block and an `items` array). The contract is
[`docs/envelopes/surface.md`](envelopes/surface.md); `lib/kits/surface.js` dual-reads
v1 and v2 and normalizes to v2, so an existing v1 file keeps working untouched
and is never rewritten by having been read. Each surface offers **Load onto the
stage**, the bridge onto the bench described under
[The stage](#the-stage-the-working-surface), and a registry one can be edited
in place or deleted (two-tap).

- **General** (top): `surfaces/*.surface` files in the **registry**. These are
  cross-repo estate content, not a repo describing itself, so they stay there.
  Sorted `default` → `standing` → `showcase` (`archive` excluded), each editable
  in place through a JSON dialog (gear on the surface header; "New" seeds a fresh
  one). An agent session with registry access can write or extend one; the estate
  shows it on next load.
- **Per-repo** (below General): a repo that names a `surface` in its **own**
  `.web-tools.json` (a path, or a list of paths, to `.surface` files in that
  repo) contributes them under a section headed by the repo. The config cache
  already carries the declaration, so the estate fetches only the repos that
  declared one, on their default branch: a bounded read over opt-in repos, not a
  scan of every member. These are **read-only** in the estate (the estate holds
  the registry token, not each repo's); the section links each file to its blob,
  edit it where it lives. A repo owns the surface that tells its own story; the
  registry keeps the curated, cross-repo ones. (Follow-up: gate the re-fetch on
  the repo's `pushed_at` so an unchanged file isn't re-read every load.)

A repo that declares a surface also gets a **surface chip** on its Repos-grid
card, deep-linking straight to its section. Rendered item kinds (both sources):
`github_blob` / `github_dir` (open-in-shell + GitHub link; target as `{repo, ref,
path}` or a github.com URL), `url` (external link), `note` / `story` (inline
body), `embed` (a renderer page in an iframe via a toss-render route).

**Activity** gathers the estate's own motion under one header-nav stop. Four
panes on a segmented pill (the shared internal-tab style), switching at every
width, each keeping its own view key so `?view=activity`, `?view=sessions`,
`?view=guides`, and `?view=chats` deep-link directly. Where a pane reads a
cache, its **age pill** rides the pill row: it states the age at every width and
opens the **State** view, where that cache's Refresh lives beside its cost and
its throttle. It replaced an as-of reading that was hidden below `sm` next to a
Refresh button that was not.

The first three are readings of the repos. **Branches** is what is in flight and
**Sessions** is the work that made it: a branch is the artifact and a session is
the act, and each row cross-references the other. **Guides** is the account,
the shelf of `pages/guides/*.html` across the estate, in flight first.
**Chats** is not a reading of the repos at all, and that is why it belongs
rather than despite it. It is a separate **venue**: the conversation half of the
work, read from `mehrlander/chat-histories`. No key joins a chat to a branch or
a session, the archive's ids are chat uuids while sessions carry harness
`session_...` ids, and the two corpora do not overlap in time, so the pane
cross-links chat to chat (tags) and claims no join it does not have. The test it
passes is the one the other three pass, that it reports where work actually
happens; it is the only one that can say so about thinking done outside a
checkout. To-do and Jot failed exactly that test and left (below).

Three things about Chats follow from the archive rather than from taste.

- **It is read one month at a time.** The corpus is 14,844 conversations and
  the annotation layers alone are 1.9 MB and 9.9 MB, so nothing loads it. The
  archive is already sharded by month per layer, so the pane opens on the newest
  month and pages back on demand, two small requests each, and the footer says
  how many of the archive's months are loaded. That count is the honesty: a
  short list means "most of this is not on screen", not "this is all there is".
- **Staleness is the pane's headline.** This is the one subject that advances by
  hand, through an export requested on a website, so how far behind it is *is*
  the state of the venue. The banner reads
  `annotations/catalog/frontier.json`, which chat-histories generates for
  itself, and the repo's own declared `content-date` check reads the same file,
  so the pane and the estate card cannot disagree. Per provider it shows the
  newest chat held, days behind, and the export cadence to read that against,
  marking a provider due only when it is past its **own** longest observed gap.
  The archive can say when it last heard, never how much it is missing, and the
  banner says so where the number is read.
- **It has no cache, so it has no age pill and no Refresh.** The month shards
  are immutable once committed and the frontier moves only when an export lands,
  which is a commit to another repo rather than a crawl this page could run. So
  there is nothing for the State view to hold a row for: what can be stale here
  is the archive itself, and the banner reports that instead. This is the case
  the State view's "a Refresh where one is possible" leaves open, not an
  omission.

The hand catalog wins every collision with the machine layer, and gets a filter
chip of its own: it was summarized through the chat UI and is the archive's
precious layer, so showing the bulk read-through of a chat somebody hand-wrote
would display the lesser of the two. A Gemini row renders its title as text
rather than a link, since Gemini Apps chats have no per-conversation address.

`kits/chat-archive.js` holds the folds and the cached reader, in the memo plus
in-flight-dedup shape `kits/estate-search.js` established; a failed read is
never memoized as empty, because an empty month and an unreachable month look
identical on screen and mean opposite things.

**The stop used to hold four panes**, adding To-do and Jots on the reasoning
that the four read as a gradient of commitment: a jot is unshaped intent, a
to-do is shaped intent, an open branch is intent in flight. That reads well and
was still wrong. A personal checklist is not the estate's activity, it is
something you keep; and holding the two lists here cost the full content column
to the two panes that genuinely are activity. They are their own nav stop now,
**Lists** below.

The layout was responsive before that, the pill on narrow screens only and every
pane side by side on `lg+` (the branch list as the main column, the two lists a
24rem right rail). The rail held its width whether or not either list had
anything in it, so it was a standing claim on the page's scarce axis for content
read on purpose rather than watched. One pane at full width, at any size, is the
same trade the phone was already making, and the pill's counts keep an unopened
pile from going invisible, which is the only thing the rail bought that a tab
does not.

### Lists

**Lists** is To-do over Jot, both on screen at once. Merging them is what made
the tab unnecessary rather than merely fewer: the reason to switch tabs was to
see the other one. Both old keys still resolve here, `?view=todo` and
`?view=jots`, so a saved link lands somewhere real.

The split is fixed halves, each scrolling **inside itself**, so adding to one
never pushes the other off screen. That needs a definite height, which the shell
hands down: for this view only (`listsFill`), the estate pane and its column
become `flex` + `overflow-hidden` instead of the ordinary scrolling column, and
the component root joins the chain. Nothing in the pane adds a card, a border
box, or a second layer of padding: two sections, one hairline between them, and
the scroll on the list rather than the page. Each half keeps its heading and add
form pinned while its list scrolls, since the add form is the reason you came;
the heading row wraps at narrow widths so the input never squeezes, with no
breakpoint to disagree at any size.

**To-do** is a general, personal checklist: not repo-scoped and not a surface,
so it keeps its own tiny file, `lists/todo.json` in the registry (`{items: [{id,
text, done, created_at, done_at, urgent, due}]}`), rather than reusing the
surfaces schema. Add a line, check it off, or delete it; a checked item moves
into a collapsed "done" pile instead of disappearing, so delete is the only way
an item actually goes away.

Two fields say an item needs attention, and they answer the same question by
different routes. **`urgent`** is the flag button: set by hand, cleared by hand.
**`due`** is a plain `YYYY-MM-DD` from the date chip, which lays a transparent
native date input over itself so one tap opens the platform picker. A row is
**hot** when it is flagged or its date has arrived (today or overdue), and a hot
row takes the colored left rail the branch and session rows use for state. The
distinction is the point: a flag has no expiry and decays into noise once a busy
week has flagged everything, while a date arrives on its own and stops mattering
on its own.

Open items sort in three bands, soonest first within each and the file's own
order breaking ties: hot, then dated but not yet, then undated. The chip reads
forward (`3d late`, `today`, `tomorrow`, `4d`, then the date past a week) and
colors by band, and the count beside the total is the hot count. Both fields are
written only when set and deleted when cleared, so "never urgent" and "no longer
urgent" read identically; the done pile ignores both, since a done item is not
urgent whatever it was on the way in. Optional keys are honored where present
and the savers write the parsed items straight back, so a field added by hand or
by an agent session survives a round trip through this pane. Every mutation writes the whole file straight through the viewer's
token (`gh-store.js`'s `save`), the same as a surface edit, so it is durable
across browsers and devices, not a per-browser `localStorage` list. Token-gated
like Surfaces: no token, no list.

**Jot** is the capture sibling: quick ideas, one flat item list in the
registry's `lists/jots.json` (`{items: [{id, text, created_at}]}`), same
whole-file write mechanics. Singular, because you jot one thing; the file keeps
its plural name, since renaming a data file to match a label is a migration that
buys nothing. The lifecycles differ: a to-do tracks work and completes; a jot has
no done state. It sits in the pile, newest first with its age showing, until it
is promoted somewhere with a real home (a chron entry, a tracker task, a to-do)
or deleted. Two hooks anticipate the maintenance cycle around that promotion
without building it yet: the add commit carries the jot's text, so the file's git
history is itself a capture log, and the registry sits in agent-session scope, so
an agent session can read the pile and drain it (promote, then delete) the way
`chron/dump/` is drained.

**Pins** render above the two lists rather than beside them, and have no
`?view` key of their own. They are internal links kept at hand, one flat item
list in the registry's `lists/pins.json` (`{items: [{id, target, title, note,
group, created_at}]}`), each `target` in the `owner/repo[@ref]:path` grammar.
This is the estate-wide personal sibling of the per-repo `pins` manifest field
that fills the sidebar's Pinned block: same keep-at-hand meaning, same open rule
(an extension means a file, anything else opens the Files view at that folder).
Unpinning removes the pointer only; the target stays where it lives. Off the
commitment gradient the other two sit on, deliberately: a jot is unshaped
intent and a to-do is shaped intent, while a pin is memory, a pointer to
something that already has a home.

All three live under `lists/` because they are
authored content with the registry as their source of truth; `state/` stays
derived caches only.

**Branches** (`?view=activity`, called Open until the scope chips arrived) is
**every** branch of the estate in one cross-repo list, freshest first, narrowed
by two axes: **scope** and **repo**.

**Scope** picks which of the survey's `group` values to show, and the chips
carry their counts off the full list, so the row doubles as the estate's branch
census:

| Scope | Shows | For |
| --- | --- | --- |
| **Open** (default) | an open PR, or `stranded` | work in flight |
| **Recent** | `active` | what was touched lately, unjudged |
| **Stranded** | `stranded` | content that exists nowhere on the default branch |
| **Landed** | `landed` | the cleanup pass: content already on the default branch |
| **All** | everything surveyed | the census |

Open is not "recent", which is why it is its own scope rather than a date sort:
a branch merged via a merge commit is an ancestor of the default, so it holds
nothing ahead and would stage to nothing, yet its commit date still reads
recent. Gating on open-PR-or-stranded drops the flood of merged-but-undeleted
session branches.

**Landed is the scope that had no home before.** The crawl always surveyed and
stored it (`state/activity.json` holds every branch it reached, classified, with
the content counts), but this view hard-filtered it away in one line, so the
per-repo **branch review** was the only place a landed branch appeared, one repo
at a time. Exposing `group` as a control is what turns this into the estate's
one branch list; see "The branch review" for what stays repo-scoped (the live
uncapped survey, a repo outside the estate, the in-app compare).

Each row is **highlighted by PR state** (a colored left rail plus
faint tint: green for a ready PR, amber for a draft, muted for a branch with no
PR yet) and carries a **caption-style link cluster**. The row's **primary action
(the branch name, and the leading Stage link) stages the files this branch
changed** against its default (one `compare` call, removed paths skipped) and
jumps to the Stage: navigating a whole branch tree is rarely the point, its diff
is. The staged set is appended and deduped onto any working stage, at `ref=branch`
so an item reads the branch's version and the Stage's Diff tab compares it back.
The rest of the cluster is a **GitHub menu** (below), the guide **PR**, and the
**Session** that authored it (the `claude.ai/code/session_…` link lifted from the
PR body's footer, shown only when present); a per-repo **Branches** drill-down
sits at the row's right (whole-tree browse lives there).

Each row's right edge states the branch's **lifespan**, first commit then latest,
as `15 days → 2 hours`, which answers "how long has this been open" beside "when
was it last touched". Neither costs a call: the crawl's compare already lists a
branch's unique commits oldest-first, so its start is `commits[0]`
(`BranchSurvey.firstCommitDate`) off a response the survey holds anyway. The
start is dropped when it rounds to the same label as the tip (a same-day branch,
where `2h → 2h` is noise) and when it cannot be known honestly: a branch with no
merge base has no unique-commit list, and a compare past GitHub's 250-commit cap
reports a total larger than the list it returns, so the oldest entry present is
not the first. Those rows show the tip age alone.

Where the survey reached a branch, the row also states its **content verdict**:
of the paths the branch uniquely touched, how many are present on the default
branch now (`6/6`, or `1/5` plus `4 missing` with the paths on hover). It is
what makes a Landed row actionable rather than a claim, and it costs nothing:
the crawl stored it. An unsurveyed row shows nothing rather than `0/0`, since
"not measured" and "measured zero" are different answers.

**Repo chips** below the scope chips narrow the list to one repo, `All` first
and a count on each. The row's own **repo chip menu** contributes **Only
`<repo>`** (and **All repos** once filtered), the same filter reached from the
row you are reading rather than from the chip row above. It names the repo
rather than saying "this repo", since the menu is read after the pointer has
left the row it belongs to. Only repos that have open rows get a chip, since the estate is larger than
the set with work in flight and a row of zeroes says nothing, and the row hides
below two of them. It scrolls sideways rather than wrapping, which is what keeps
a second row of controls from pushing the first branch off a phone screen. The
filter narrows what renders, not what is counted: the tab badge and the `All`
chip keep the cross-repo total. A filter naming a repo that goes quiet on a
refresh lapses back to `All` on its own, rather than leaving an empty list with
no lit chip to explain it.

The row's **GitHub menu** replaced a Tree and a Compare link. Those were one tap
each and a menu is two, which pays only because the menu carries destinations
that had no route at all: the PR's **Files changed** and **Checks** tabs, the
branch's **Commits**, and **New pull request** for a row with no PR, plus a copy
action for the branch name. It also gives the row's action
line back the width the pair was spending. A **Copy compare link** row sat
beside that one until 2026-07-30 and was cut: `Compare to <default>` opens the
page the URL names, and the browser copies it from there. It shares the sidebar repo menu's
geometry (`shell.anchorMenu` / `menuStyle`: fixed, aligned to the trigger's own
edge, flipped above near the viewport bottom), its row spec (`.wt-menu-row`,
flat, an out-arrow on anything leaving the app), and its hover behavior. The
`#`-number and the session mark stay outside it: neither is GitHub navigation,
and the session mark has no other route.

Each row opens with its **repo chip**, the repo's own declared icon plus its
short name. It is a control, not a label: it opens the repo's whole grouped
menu in the sidebar's panel, so the branch's destinations and its repo's are
one gesture apart and the control is learned once. The icon is the mark the
repo declares for its estate card, so a row is identifiable before its name is
read.

It reads the registry's **activity cache**
(`state/activity.json`, below) in one GET, so the whole estate renders without a
per-repo API fanout: the branch join to its open PR is `pr.head === branch`, and
the session link rides the cached PR, so nothing is fetched per visit. Landed and
stranded older branches are the per-repo branch review's job, not this "what's in
flight" read. The Repos view borrows the same cache for a **freshness rollup** on
each card (branch count, stranded count, open-PR count, the branch count a one-tap
route into the branch review). The crawl is forced from the State view through the
shell (`refreshActivity`); a normal visit kicks it throttled. The internal view
key stays `activity` (and `?view=activity`), so existing links resolve.

That forced crawl runs for tens of seconds across the whole estate, so it
**reports itself**. While it runs, the header's as-of readout becomes
`Refreshing activity · 4 of 11 repos` with the repos currently in flight named
after it (the pool runs two at once, so it is a list), over a determinate bar
whose only input is repos finished over repos total. Nothing finer is counted
and no in-flight fraction is estimated: per-repo cost varies by an order of
magnitude, and a sub-counter ticking several times a second is the churn this
replaces. The crawl **commits only when something materially changed**, which
used to make a productive refresh and a no-op refresh end identically, so the
run closes with a toast, `Activity refreshed · 3 repos changed` or `No activity
changes · 11 repos checked`, and names any repo the crawl failed on (previously
a `console.warn` and nothing else). The count comes from
`RepoActivityCache.changedRepos`, which `cacheChanged` is defined in terms of,
so the number reported and the gate that skipped the commit cannot disagree.

The cache is what makes this affordable. The branch review costs ~2 + 2N calls to
survey N branches, so surveying every repo live on a dashboard is a flood.
Instead `refreshActivityCache` crawls each estate repo on a ~12h per-browser
throttle (heavier than the config crawl, so a longer interval) and stores the
capped landed/stranded survey plus cheap summary signals; the branch review, the
estate cards, and this view all render from the stored result. The per-repo
branch review is **cache-first** too: with a token it renders Landed / Stranded
from `state/activity.json` and marks the header `cached`, running the live fanout
only on an explicit Refresh or where the cache has no coverage. Same survey math
either way (`lib/kits/branch-survey.js` `surveyBranchLive`, shared by the view and the
crawl). Source-of-truth rule as ever: the cache is derived and may be briefly
stale; Refresh re-surveys live.

### Sessions

**Sessions** (`?view=sessions`) is every recorded Claude Code session, newest
first. Branches answers what is in flight; this answers what a stretch of work
was about, how long it ran, what it fought, and which files it opened. Each row
carries the day and the record's short id (its own filename, so what is on screen
is what you type at `search.py --show`), the branches it was sitting on, the
opening ask, and a count row: user turns, tool calls, failures, distinct files,
and output tokens. The rail goes amber where the session hit failures and stays
muted otherwise, deliberately not green-for-clean, since a clean session is the
normal case and a page of green rails says nothing.

Two axes, the same shape as Branches. **Scope** is time (`Week`, `Month`, `All`)
plus **Snagged**, which is not a time window at all: it is every session that hit
a failing tool call, however old, and it is the cross-session recurrence question
a corpus can count and a person cannot. **Repo** chips narrow it further, off the
scoped list, and lapse back to All when the scope stops holding that repo.

Tapping a row, on either the ask or the short id, opens the session as a
**conversation**: the record is fetched and handed to the swipe deck
(`lib/kits/session-render.js`), one card per ask and per assistant prose turn, with
the tool calls attaching to the turn that issued them. Both halves are there,
the calls carry their arguments and whatever body the record kept, and fenced
blocks get chat-render's live views. The record is cached per id, and the
renderer chain loads on first use, so a visit that never opens a session pays
nothing for it.

The deck's first card names what the record could not hold, and its last is the
closing summary: the files with their read/edit/write breakdown, the tool
histogram, and the tokens. Those two cards are the whole of what an inline
expansion used to show below the row. That expansion is gone, and its going is
the point: it put a summary between the reader and the conversation, so reaching
the thing worth reading took two taps through a pane answering a question nobody
had asked, and it made one record two surfaces to keep honest.

A branch chip opens **that branch**, at [`pages/branch.html`](../pages/branch.html)
(🌿), the estate's canonical single-branch address. It used to switch panes and
filter Branches by repo, which answers "show me this branch" by leaving the
reader somewhere else with the branch still to find and the session they were
reading lost. A session's branch is frequently merged and so absent from that
list altogether, which the old filter could not express.

The same deck has a page of its own at [`pages/session.html`](../pages/session.html),
addressed `#id=<short>`, `#gh=owner/repo:path`, or `#gz=` for a reader with no
token. It opens the conversation on arrival; its facts card is the after-close
state, not a waiting room.

Below the list, **File attention** is the cross-session rollup: per path, how
many **distinct** sessions opened it. Distinct sessions is the number that
resists one session's habits, since one session editing a file forty times says
the session was busy while ten sessions opening it says the file is load-bearing.
It carries its own honesty note, and that note is load-bearing too: the counts
come from four file tools (`Read`, `Edit`, `Write`, `NotebookEdit`) and nothing
else, so a file read through a shell command leaves no trace, subagent traffic is
excluded upstream, and a doc injected at session start reads **zero** while being
among the most-read files in the estate. Without that stated, the ranking says
the opposite of the truth on exactly the docs that matter most.

### Sessions cache (`state/sessions.json`)

The third derived cache, and the odd one: its source is not another repo's
config but the registry's own **captured** layer, the per-session records the
Stop hook publishes (`web-tools-private/sessions/README.md`). It exists because
that layer cannot be read directly. The store is 4.6 MB across 40 records and
grows about six a day, and one record runs to half a megabyte. Measured on the
first live crawl (2026-08-05, 42 records) the whole cache is 135 KB, about 1 KB a
row: smaller than the largest single record, 34x smaller than the store, and a
full record is fetched only when a row is opened.

The crawl is genuinely incremental where the other two are not. A published
record is addressed by a git blob sha, so one recursive trees call names every
record and its sha, and `stalePaths` re-reads only those whose sha moved. In
steady state that is the day's handful plus the live session's own record, which
is republished on every Stop and so is always stale by design, with no special
case for "the current one". `refreshSessionsCache` runs it on a ~3h per-browser
throttle (lighter than the activity crawl, being a tree read and a few blobs, so
a shorter interval) and commits only when the folded rows materially changed.

The fold's scope is the **full** listing, never the batch it read: a record the
per-crawl cap deferred keeps its row, and only a record genuinely gone from the
store loses one. That is the same distinction `buildCache` draws in the activity
cache, for the same reason, and it matters more here because the source is
unregenerable.

A sha is not the only way a row goes stale, and the second way has no natural
tell. A published record is frozen, so a row built by an older summarizer would
keep its blob sha forever and never be re-read: add a field and it stays empty
for the whole back catalogue. Each row therefore carries the summarizer's
version (`v`, `ROW_V` in the lib), and `stalePaths` treats a version behind as
stale exactly like a sha that moved. One pass after a summarizer change re-reads
the store and heals it.

**Two rollups ride the cache, and the split is not tidiness.** `attention` folds
each row's `files`, which is that session's busiest eight, and answers "what is
the estate working on." `docAttention` folds `docFiles`, the row's **complete**
`docs/` slice, and answers "who opened this document," which the first cannot:
a doc opened once in a session that touched forty files is exactly the reading
being counted and exactly what a top-eight discards, and a registry row would
have said zero with nothing on screen to suggest otherwise. Uncapped is
affordable because the set is closed and small (43 files in this repo's `docs/`,
a handful per session). `fileAttention(rows, cap, field)` computes both, so the
two numbers cannot come to mean different things.

Token gating: no token means the public default card only, no surfaces, no
activity, no sessions, and no write controls. In that state the Repos view leads with a
**public banner** that says exactly what is and isn't available and offers the
two real next steps, a token or Public browse, instead of a vague "set a token"
aside. Deep links: `?view=estate`, `?view=stage`, `?view=activity`, and
`?view=sessions`, each always stamped and so shareable on its own. Estate was
the exception until 2026-08-11, stamped only alongside a `repo`/`ref` param on
the reasoning that the bare URL was the Repos estate already. That premise
expired when the bare URL started routing a token-bearing browser to Activity:
signed in, Repos had no address, and copying it handed the reader Branches.

**The shared dialog is scoped by how it is opened.** With no repo, from the
**account row** at the top right of the Repos view, it is an **account panel**:
the token control alone, no repo tabs (**Refresh views** left with the header
shield, being the same `refreshConfigs` the Repos view carried its own button
for; that button is now the State view's config row, and the account row is
where the token lives).
With a repo, from a card gear, a sidebar Repos row, or the Map, it is the **repo
dialog**: the **Info** tab (repo facts, the token control, a Public-browse
shortcut, and the repo name as the one-tap GitHub link), plus the **Settings**
and **Config** tabs. It is the path for a repo you are *not* in; the open repo's
manifest is edited in the roomier Config view. The dialog's former GitHub /
jsDelivr-CDN / flat-tree link list was retired (2026-07-19): GitHub is the header
link, and a file listing lives in Public browse.

**Map** (`?view=map`, always stamped; `?view=portable` still resolves here) turns
the coordination layer itself into a first-class object, and is the operational
face of the constellation doctrine ([`docs/CONSTELLATION.md`](CONSTELLATION.md)
is the portable kernel, opened from the set header; the full worked instance is
in the private `home` repo). Five tabs, `lib/alpineComponents/map.js`, each
answering one question about the layer: what travels (the set), what to hand
over in chat (Surfacing), how content moves and shows (Showing), what the
documentation holds and what holds it (Docs), and what the suite checks
(Tests). Who carries the set is a fact about a repo and lives on the Repos
cards.

**The open tab is addressable:** `?view=map&tab=surfacing|showing|docs|claims|tests`,
on the same `tab` key the project view's pills use, with the default (`set`)
left out of the URL so a plain `?view=map` link is unchanged. The tab is held
by the shell rather than by `map()`, because the URL is the shell's to own and
the component mounts lazily; the component renders whichever tab is set, watches
the shell for a back-button change, and fetches that tab's manifest on arrival
by whatever route. That last part is the failure this replaced: the four
non-default tabs used to fetch from the click handler alone, so a tab nobody
tapped had nothing to render.

*Portable* (labelled The set until 2026-08-07; the `?tab=set` URL key is
unchanged) renders the to-go bag from the hub's committed manifest,
[`docs/portable.json`](portable.json), whose prose parent is
[`docs/PORTABLE.md`](PORTABLE.md) (a test,
`tools/test/portable-manifest.test.mjs`, holds the two consistent, so the UI
never drifts from the catalog). Grouped as plugin skills, docs, and scripts;
each row shows its role and adoption mode (in the plugin, fetched live, fetch
to adopt, on demand) and opens in the shell's own viewer, rendered, so reading
CONVENTIONS.md is one tap from the dashboard. The doctrine kernel rides here as
a doc, so the theory sits beside the conventions it governs. Public: the hub
repo is public, so this half needs no token.

*Scope and adoption moved to the Repos cards on 2026-08-03.* They are facts
about a repo, and a card is where a repo is described, so a second grid of the
same repos with different columns was a copy of the roster. It also ended a real
drift: the Map kept its own roster, and a repo that joined the estate was never
graded. The cards are the roster now, so there is no second list to disagree.

On a card: the **verdict** badge beside the name, then the four checks as chips
(marketplace, plugins, conventions, config), failing ones visible rather than
collapsed into a score, since a failing check is the next step. **Scope** is the
repo's own account of what it holds and why, read live from its
`.web-tools.json` `scope` field (inline prose, or a repo path ending in `.md`
linked to its blob) and **expanded on tap** rather than carried open: it is a
paragraph worth reading once, and on a card it would push the live rows off the
bottom. The repo owns the story; the estate only stacks the statements, so the
cross-repo picture is a view, never an authored central list. The hub and the
registry carry a role instead of a grade, since grading the hub against its own
set says nothing. Grading stops at estate members deliberately: probing every
repo in the cache would make this an account-wide survey mostly composed of
repos that will never carry the set, at three live reads each. The blind spot
that buys is that a repo adopting nothing is invisible, since the file that
would list it is the first thing adoption writes. Graded by [`lib/kits/portable-align.js`](../lib/kits/portable-align.js), which is pure and
tested.

**The grade is read, not probed.** It rides the config cache
(`state/configs.json`), computed by the crawl that already reads each repo's
manifest, so a card costs nothing beyond the cache read the estate was making
anyway. The first cut fanned out three live reads per member on every estate
load, which is the bill that comes due when a Map tab becomes a dashboard: a tab
is opened sometimes, a dashboard is the front door. The trade is that a grade is
as fresh as the last crawl rather than as fresh as the render, which is right,
since adoption changes when someone edits a settings file. The State view's
config row re-crawls when the answer matters now. A repo the crawl has not reached shows no
verdict and no chips: absent means not read, never not aligned.

*Surfacing* indexes the primitives from [`docs/surfacing.json`](surfacing.json),
one card each (glyph, use, form, boundary). The ownership runs opposite to
every other tab, and the header says so: [`SURFACING.md`](SURFACING.md) is the
authoritative carrier, since it is what sessions load and follow, and the
manifest is its gated index (membership held two-way to the doc's bullet
lead-ins by `tools/test/surfacing-manifest.test.mjs`; the card summaries are
paraphrases and stay unchecked, which the Docs registry's claims table states).
Surfacing decides what to hand over; Showing is what makes it openable.

*Showing* (named Transport until 2026-08-04; renamed because
[`SURFACING.md`](SURFACING.md) already uses "transport" for the stage link, and
the lead section here was titled Showing all along) answers how content moves,
renders, and gets looked at, from the
hub's committed [`docs/routes.json`](routes.json). It opens with **Showing**,
the mechanism table: given a subject at a version and a viewer, which link
reaches it and, more usefully, what each one cannot show. That table is the
reason `CLAUDE.md` no longer carries 1,589 words on the subject and
[`showing.md`](showing.md) carries only the frame and the record; a rule nobody
could hold in their head is one the app holds instead. Then three sections on
the machinery: the **address grammar**
(`owner/repo[@ref]:path`, with a chip per place it is spoken, each opening that
file in the shell viewer), the **delivery modes** `toss-render.html` accepts
(each row carrying whether it ships the bytes inline or fetches a reference, and
the trust posture that buys: a payload renders under an opaque origin that
cannot reach this origin's token, an address-mode fetch is same-origin and can,
which is why only the second is allowlisted), and the **toss routes** resolving
a content type to its renderer page. The modes section leads with the read
order, since it is one rule everywhere: fragment first, query as fallback, in
`toss-render` for its own params and in the renderer pages through
[`lib/kits/url-params.js`](../lib/kits/url-params.js). A payload belongs in the fragment,
which never reaches a server and so escapes the roughly 8KB cap the Pages edge
enforces with a 414; an address is short, and a routed toss hands `?src=` to
the page through the params shim rather than over the wire. Those facts previously existed only as
source comments in three files, so a reader had to reconstruct them; the
manifest owns them instead. The `routes` block is the owner of `toss-render`'s
`TOSS_ROUTES` literal, which stays inlined so the critical render path takes no
fetch, with `tools/test/routes-manifest.test.mjs` failing if the two drift: the
same builder-plus-drift-check shape as the set's manifest test. Public, like the
set, and loaded on first open of the tab rather than at mount.

*Docs* renders the documentation registry,
[`docs/docs.json`](docs.json), in the same lazy shape. Two tables. The
**documents census**: every `.md`/`.json` under `docs/`, each with its subject,
its status (**living** claims current truth and is wrong when stale; **record**
preserves a moment and is wrong when rewritten; **measured** carries dated
observations and is corrected by re-probing), its **reach** and **words** (both
derived, see below), and its maintenance (authored or generated, with the
discipline that keeps it true); complete by construction, since
`tools/test/docs-registry.test.mjs` holds the folder and the table to exactly one
row per file. The census is navigated from a folder rail
(2026-08-07): each directory is a row with rolled-up file count and word mass
and its own GitHub link, the selected folder shows its direct files beside it
with that folder's README subject as the gloss, and a reach filter moves the
counts without changing the tree's shape. A row is read in place: its title
opens the document in the house swipe deck (`lib/kits/swipe-deck.js`, loaded on
demand), full length with the peek's own rendition helpers so deck and peek
cannot drift, paging through the selected folder's files as filtered, opened
on the tapped row; its GitHub icon, inline with the badges and always visible,
carries the source peek for the desktop glance, one details toggle on the
reach strip shows every row's maintenance at once, and the files view stays
the route for working on a file rather than reading it. The file list runs two
columns above `xl` so a wide screen is used rather than left as a gutter. And the **shared claims**: statements that live in
more than one place, each with its one authoritative carrier and its typed
repetitions (copy, paraphrase, pointer, live read; a copy says who keeps it, by
hand or by a named builder), where an absent check renders in the warning tone
rather than being omitted, because an unchecked copy should look unchecked every
time the tab opens. The claims table renders on its own **Claims** tab
(2026-08-07), off [`docs/owners.json`](owners.json); the `?tab=claims` key is
unchanged, the way `?tab=set` outlived "The set". It keys on claims rather than files, so trailing the census it
read as an appendix, first open, then folded behind a count; a tab keeps the
census on one viewport and gives the table its own. The registry is authoritative for the claims it covers and
owes the repo no inventory of them; the census, by contrast, is complete.
The census half is public, like the other two tabs.

Three numbers sit on a row, and they answer three different questions. **Reach**
(derived by `tools/build/docs-reach.mjs`, gated against the registry) says who
*can* get to a file, strongest channel first: injected, project, skill, app,
orphan. **Words** says how much of the folder it is. **Readership**, the eye
column, says who actually opened it: distinct sessions, read from the private
registry's `docAttention` rollup. Reach and readership are the pair worth reading
together, since an orphan nobody opens and an orphan opened in nine sessions are
different problems.

Readership is the one token-gated thing on the tab. Without a token the column
is **absent** rather than blank, because a blank one reads as "nobody opened
it." Its caveats sit in the strip above it and are load-bearing: only sessions
the recorder captured are covered, only the four file tools count (a file read
through a shell command or by a subagent leaves no trace), and an **injected**
doc says `injected` rather than reporting the zero it is guaranteed to score.
That last case is the reason the caveats are on screen instead of in this file:
`CONVENTIONS.md` and `SURFACING.md` are among the most-read documents in the
estate and are precisely the two no file tool can see, so a bare count would rank
them last.

*Tests* is the same census one axis over, from [`docs/tests.json`](tests.json):
every file in the suite with its kind (gate, lockstep, tool, kit, behavior,
component, guard) and what breaks if it is deleted, its assertions, method,
runner and boot-smoke count all derived from the files and gated against the
registry. The strip cuts the total by kind rather than reporting it, since a
pass count cannot tell a boot check from an adversarial gate, and a browser
check reports **no** assertion count rather than zero, because `test()` is not
its unit. Public.

**Tools** (`?view=tools`) is a curated gallery of the utility pages the owner
reaches for (the text-diff tool, the transform/compress round-trip, and so on),
an estate-level peer beside Repos / Surfaces / Stage / Map. It reuses the
pages-catalog card (thumbnail or live preview, an open link, a source link),
fed from a hand-curated manifest, [`docs/tools.json`](tools.json), rather than a
repo scan. Each entry is `{ path, title, note, icon }`, where `path` is a bare
hub path (`pages/diff-tool.html`, the hub at main) or a qualified cross-repo ref
(`owner/repo[@ref]:path`), the same grammar as a pages catalog entry. Public: the
hub is public, so the thumbnails (jsDelivr), the hosted render URL, and the blob
source resolve with no token; a cross-repo or off-default entry renders through
toss-render `#gh=` the same way the pages catalog does. The list is authored, a
sibling to `pins` and `stage.files`, maintained by hand
(`lib/alpineComponents/tools.js`).

### State (`?view=state`)

**State** (`lib/alpineComponents/state-view.js`) lists everything the estate
keeps derived, each piece with its age, what builds it, what the build costs,
and a Refresh where one is possible. It is the address the age pills open, and
the reason the four estate Refresh buttons could go.

**Each row says who uses it, as view keys.** `feeds` is a list of shell view
keys (`estate`, `activity`, `sessions`, `guides`, `search`) rendered as chips
that route through the shell's own `go*` methods, so a tap goes and looks at the
data being consumed. The list is deliberately only the clean answers. The prose
it replaced also named the sidebar, quick links, and things below view
granularity, which is where the detail now lives instead: configs also drives
the sidebar, the quick-link row, and every promoted app view; activity also
feeds the Repos cards' per-repo rollups; sessions also feeds the branch rows'
session links and the Search view's session lane. None of those is a view, so
inventing keys for them would be the over-normalization
[registries.md](registries.md) warns against. The entity index's consumers are
`pages` rather than views, kept as a separate field because a page opens at its
own URL while a view is a stop inside this shell, and one chip cannot honestly
mean both. Each row's crawl cost rides its Refresh button's tooltip, where it is
actionable, rather than a line of its own.

**The JSON is read in the app, not on GitHub.** Every registry row carries one
**Expand** control, a bare caret at the row's end: expanding a row to see its
detail is the gesture people arrive with, where `{}` said "JSON" only to someone
who already knew. It carried a caption first (`Expand`/`Collapse`, then `Expand`
alone) and carries none now. A caret at the end of a row is the most established
control on the web, the panel it opens is directly beneath it, and every other
affordance on the row is already a word, so the caption was a third label
competing on a line that has Refresh and a chip strip. Size carries it instead. It opens a panel with two tabs, **Contents** and
**History**, described below. The file's SIZE is not on the row: it is one more
figure on a line already carrying a path, a grain, and three ages, and it
answers no question the reader arrived with. It rides the Expand control's
tooltip, where it qualifies what pressing costs, which is also what keeps the
one `ls state` read earning its place. The **Contents** tab fetches the file and shows the bytes, verbatim,
in a scrolling `pre` with a line count and a Copy button and nothing else. It
ran through the shared multi-mode viewer first, which brought a mode switcher, a
filter, a sort, a search, an undo pair, a tree toggle, an open-out, and a
GitHub/Raw/CDN menu, all stacked above the data on a phone. That is an editor's
chrome, and nothing here is edited: the crawl owns these files, so every control
but copy answered a question the row does not raise. The full multi-mode reading
stays one tap away at the github mark and at the data route
(`toss-render.html#data=`), where a reader who wants to pivot a table should go.
Nothing is re-serialized, since the crawls already write a 2-space indent and the
row's promise is that this is what is committed. One row is open at a time: these run 68 KB to 818 KB,
so mounting four is a cost with no reader. The fetch is not cached, since the
row's whole promise is that what you are looking at is what is committed now.
The path beside each label is a plain label, not a link: it used to be an anchor
to GitHub, which is the one destination a tap on this page should not have, and
the small github mark tight beside it is the deliberate way out. That mark rides
the **filename** at the house size (16px, the shell's default for the mark,
explicit or inherited, and what this view's own header mark already used; it
shipped at 14px, one of only two such instances in the codebase, which put two
github marks at two sizes on one screen). Riding the filename is the shell's own
convention for a jump-over naming an exact file (the estate's surface rows, the Map's item rows, the repo dialog's
title all place it the same way): beside the name it opens, faint and small,
rather than in a strip at the far end of the card. It sat with Expand at first
because the two read as one group of file controls, which they are not, since
Expand acts on the panel and the mark leaves the page. Moving it also fixed an
omission: naming an exact file, it must carry `data-peek`, the narrow rule
[source-peek](https://github.com/mehrlander/web-tools/blob/main/lib/kits/source-peek.js)
states so that a reader can tell a file jump-over from a repo, branch, or menu
one. Refresh sits at the row's top right and Expand at its bottom right, on the
consumer line, with the chips wrapping inside their own box so a third chip
never pushes the control to a line of its own. The panel is separated
by a hairline and bleeds to the card's edges rather than sitting in a bordered,
tinted, indented box of its own: that box, inside the card, around a viewer that
draws its own frame, was four nested edges squeezing an editor that then
truncated its own filename. The viewer is handed the file's basename for the
same reason, since the row two lines up already names the path in full and
`origin` still carries the real one for its links. Height is a share of the
viewport, not a fixed 26rem that was cramped on a phone and stingy on a desktop.

The card's icon rides its title line rather than a gutter to the left. Hanging
it cost about 28px of width on every row, narrowed the description into three
wrapped lines on a phone, and left every line beneath it choosing between a
matching indent and a ragged edge. The guides row has
none of these controls, because the shelf is assembled in memory: there is
nothing committed to look at, and nothing with a past to read.

**An age pill aims at its row.** `?view=state&item=<key>` names one entry
(`configs`, `activity`, `sessions`, `entities`, `guides`, `search`, `page`), in
the same idiom `&detail=` uses to open one branch inside the Activity takeover:
the estate addresses one entry in a rendered set by naming it in the URL, not by
scrolling on a callback. Rows carry `id="state-<key>"`, so the anchor is a real
element. The named row is tinted and scrolled to on arrival, and the tint fades
after a few seconds rather than latching, since it answers "which one did I come
here for" and stops meaning anything once that is read; the `?item=` persists, so
the link stays shareable and a reload lands the same way. A bare `?view=state`,
which is what the nav opens, singles out nothing.

The view exists because "refresh" was one icon over two unrelated verbs. A
**crawl** commits a file to the registry and can be hours stale; a **local
recompute** (the search caches, the stage bundle, an Inspect rescan) is instant,
stores nothing, and has no age at all. Both wore the same button in six places,
and the as-of reading that says whether to press was the part hidden below `sm`,
so a phone kept the control and dropped the fact. Three sections carry the
split: **Derived** (the registry's `state/`), **Read live** (the guides shelf,
cheap enough to redo on demand, so nothing is committed), and **This browser**
(the search caches and the page itself, both gone on reload, neither estate
state).

**Built and checked are two different ages, and one alone misreads.** `built` is
the last commit touching the file; `checked` is this browser's throttle stamp
(`wt:*CacheCheckedAt`). Every crawl here commits only on material change, so
"built 3d ago, checked 12m ago" means current, not stale, which is precisely
what a lone as-of could never say. The build time is read as the file's last
commit rather than its own `generatedAt`, because reading four `generatedAt`
fields would cost 1.5 MB of JSON for four timestamps, and for a file only the
crawl writes, the commit is the write. Staleness is only claimed where the
source declares a bar: past twice a crawl's own throttle, or past the 30 days
the entity index's repo check already uses. The whole view costs one `ls state`
plus one commit read per file, regardless of estate size, and it kicks no crawl
on arrival: a view that ran a crawl to show you how old things were would answer
its own question before you read it.

**The probe answers the question the age was standing in for.** An age says how
old a file is; the question anyone opens this view with is whether there is
anything to fetch, and until the probe the only proxy was the clock (a row went
bold past twice its own throttle, which is a guess dressed as a reading). Two
calls answer it as a fact for the whole view, whatever the estate's size: one
account repo listing gives every repo's live `pushed_at`, and one commits call
on the registry's `sessions/` tree gives the records written. Each is compared
against the row's own `built` date, which the view has already read, so the
probe needs no cache contents and reads no file. Comparing against each cached
entry's own stamp would have meant pulling 66 KB, 371 KB and 279 KB of JSON to
count timestamps. It runs as a second pass after the ages, unawaited, so a slow
or failed probe leaves every row exactly as it was.

**It reports a fact about the source, never a verdict about the cache**, and the
distinction is not pedantry. A push that never touched a manifest still moves
`pushed_at`, so "3 repos pushed since built" is true where "3 repos changed"
would not be; a PR opened with no push changes what the activity cache stores
and moves no `pushed_at` at all. The same figure is an over-count in one
direction and an under-count in the other, and each row's tooltip says which way
its own reading leans. **The Refresh button's weight now rides the probe**,
which is what that weight always claimed to say: solid where the source has
moved, soft where it has not, and back to the twice-the-throttle clock only for
a row the probe cannot answer. The entity index gets no probe, because its
source is the content of ~4,000 files across seven checkouts and the honest
probe is the rebuild.

**History answers what an age cannot: how often this really changes.** Beside
Expand, every registry row carries a **History** caret that opens the file's
change log, and the two share one slot, since a row is being read one way or the
other, as the panel's second tab. It first shipped as a second caret beside
Expand, on the argument that the bytes and the file's past are different
subjects rather than two readings of one thing. Overruled 2026-08-10, and the
reason generalizes: at the control strip nobody is reading an argument about
subjects, they are reading two adjacent disclosure triangles on one row and
wondering what the second one does. The distinction was real and belonged one
level in, where a tab strip states it in two words and the panel is already
open. The tabs are two plain words: a glyph beside an exact word is decoration,
the same charge that kept `{}` off the Expand control. The tab choice sticks
across rows for the life of the panel, so a reader working down the histories
does not re-pick it on every row, and each tab loads on its first showing and
then holds. The list is the registry's own commits touching that path, one call
per open (the same `history` the row already makes for `built`, asked for twenty
rows rather than one), each with its stamp, its age, and the gap to the change
before it. The header folds that into the reading worth having, a count, a span,
and a **median** gap, set beside the throttle that governs when the file is
checked. Two measured numbers side by side, not a verdict: a store that changes
every 3h under a 12h throttle is a fact about the estate the schedule has to
answer for, and the panel's job is to put them in one line rather than to grade
them.

**What changed is lazy, and read through each store's own fingerprint.** Tapping
an interval fetches its two committed versions and names the records that moved:
`4 of 19 repos · 21%`, at the grain the row already declares. Because the
magnitude is lazy, that control exists before its own answer does, and it
carried the words "what changed" twenty times down the column to say so. It is a
caret now, in the idiom the panel already uses, and the reading takes its place
on the tap: the column stays quiet until it has something to report. The comparison is
each cache's *own* change detector, the one its crawl uses to decide whether to
commit at all (`hash` in the config and activity caches, with `alignHash` beside
it where a moved alignment grade counts as a changed cache; the record's blob
`sha` in the sessions cache; the serialized record for the entity index, which
keeps no fingerprint). So the panel's answer and the commit gate are one
reading and cannot drift into disagreeing. It is lazy because these files run 68
KB to 818 KB: diffing twenty intervals up front would read a megabyte and a half
to fill a column nobody asked for. Adjacent intervals share a version, and a
version addressed by sha cannot move, so it is parsed once and kept, which is
the opposite of the peek panel's rule and for the same reason: the peek promises
the current bytes, a version promises an immutable one.

**How long a run took is the one thing a read could not answer, so the crawls
record it.** Each cache file carries a bounded `runs` ring
([`lib/kits/crawl-runs.js`](https://github.com/mehrlander/web-tools/blob/main/lib/kits/crawl-runs.js)):
per run, when it finished, how long it took, how much it examined, and how much
changed or failed. Two constraints make it free. It **rides the commit that
already happens**, so it adds no commit of its own: a run log written on every
run would destroy the material-change gate that keeps the registry from filling
with no-op commits, and a separate file beside each cache would double them.
And it is **invisible to the change detectors**, because all three caches decide
whether to commit by comparing their record collections (`repos`, `rows`) rather
than the whole document, so a `runs` key can never cause a commit by itself.
That is a property of those three functions, which is why the ring must stay a
top-level sibling of the records. The config cache gained a `changedRepos` to
match the activity cache's, so the count written into the record and the gate
that decided to write it are one derivation rather than two that can part. A
field the crawl did not measure is **dropped rather than written as zero**: the
config crawl swallows a per-repo read failure, and `0 failed` would be a claim
where an absent key is not. The record is optional by construction: a window
without the kit carries the ring forward and still commits, since nothing about
an extra reading may stand between a crawl and the commit it exists to make.

The panel reads the ring in the **one eager read** it makes: the newest
committed version, whose window is the same twenty, so a single fetch fills the
duration column for every row and is also the version the first interval needs,
making that expansion cost one read rather than two. Buffering the *no-op* runs
locally and flushing them into the next commit was considered and dropped: the
buffer would be per-browser, so a run count assembled that way would silently
undercount every device that never commits again, which is worse than a figure
plainly absent.

**Two limits remain, and each is carried by the thing it qualifies rather than
by a notice.** A crawl commits only on material change, so a run that found
nothing leaves no trace: the log counts changes, not runs, and a quiet week
reads exactly like a week nobody opened the page. That is carried by the
summary's own first word, `10 changes`, which is the whole caveat in one word in
the place the eye lands first. Separately, a row is dated when a crawl *noticed*
a change rather than when it happened, so a gap bounds the interval instead of
measuring it, and the cadence is partly a fact about the estate and partly a
fact about how often the page was open. No label can carry that, so it hangs on
the gap figure's own hover, where someone puzzling over a long gap will look.
Both are limits of *reading* rather than writing; the fix for either is to have
the crawl record something. Duration was a third and was lifted exactly that
way, which is the exception that shows the rule, and it needs no notice either:
a duration shows or it does not.

**This shipped as a paragraph and the paragraph was removed** (2026-08-10),
which is worth recording because the mistake is easy to repeat. All of the above
sat as 40 words of standing prose above the rows, printed on every open. Not
over-claiming is a property of the **labels**; standing prose is insurance
against a misreading, and it earns its space only where the labels actually
invite one. Two of the three clauses restated what the rendering already said,
and on a 430px phone the block was four of about ten visible lines, read once
and noise thereafter. The general rule: **prose in the interface is the
expensive fallback for a label that cannot be made honest, and it should be
rare.** The same pass moved the probe's reading off the Refresh button's
tooltip, where it duplicated the probe line an inch to its left; the button
again says only what pressing it does and costs, and the visible line beside it
is the basis for the button's weight.

**The fourth file has no button, and says so.** `state/entities.json` is derived
like the other three and cannot be rebuilt from a page: it needs spaCy over
~4,000 files across seven checkouts, about half an hour. It gets a full row
anyway, naming its builder and why the control is missing. A freshness surface
that lists only what it can fix repeats the omission it was built to end.

**A deep link mounts the view before auth resolves**, so its first read finds no
token and it would otherwise hold its signed-out state for the life of the page.
The shell announces `web-tools:auth-state` from the same watch that reloads the
estate, and the view re-reads on it. Signed out is a note, not an error: nothing
has gone wrong, the registry rows simply have no ages yet.

Reaching the two rows the shell does not own: the guides shelf keeps its stamp
in the estate component (it is the one derived thing with no file to read a date
off), mirrored onto `__shell.guidesLoadedAt` as it lands, and re-read by
announcement (`web-tools:refresh-guides`); the page reload asks the fab for its
`hardRefresh`, the one implementation, via `web-tools:hard-refresh`. The
registry's authored content (lists, surfaces, the private config) and its
captured records (sessions, mailbox, proposals) are named at the foot of the
view and deliberately have no rows: neither is derived, so neither has an age to
report or a crawl to run.

## Public browse: the no-token file browser

Public browse (`lib/alpineComponents/public-browse.js`) is the intentional
**non-auth** capability, an estate-level view beside Repos / Surfaces / Stage. It
lists and previews any **public** repo entirely through jsDelivr: `GH.flatTree()`
(the `data.jsdelivr.com` flat listing) for the file tree and `GH.rawUrl()` (the
`cdn.jsdelivr.net` raw address) for a file's bytes. The point is the signed-out
case: GitHub's anonymous REST API is capped at 60 requests/hour/IP and
`recentFiles` alone can spend that, whereas jsDelivr serves public repos from its
CDN with no token and no GitHub quota. It works signed in too, as a rate-safe
listing. Honest limits: public repos only (a private repo 404s, with a specific
message pointing at the token), and the listing is jsDelivr's cache of a ref, so
a brand-new push can lag ~12h. Reached from the sidebar, an estate card's
cloud-download icon (which seeds it to that repo via the reactive `publicSeed`),
or `?view=public`. Further jsDelivr endpoints (versions, resolved, stats) are a
tracker follow-up.

## The stage: the working surface

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

Takes from:

1. upload: the drop-zone (a file, or pasted text; pasted ref lines stage as refs),
2. a repo: the **Add box** on the bench (below), or the explorer's `+` buttons
   while visiting a repo,
3. a repo manifest's `stage.files` (seeds an empty stage when that repo opens),
4. a `#stage=` link.

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
- **view** a staged file inline (a preview panel in the stage itself, with a
  GitHub jump-over to the file's true home; it never routes through a repo's
  Files view). **The preview is a position in the stage, not one file:** it
  carries an index, so the staged set is walkable by swipe on a phone or by the
  header arrows and the arrow keys anywhere. Same gesture and constants as the
  estate's branch takeover, so a horizontal drag reads alike in both and a
  vertical one still scrolls the file. Every position opens: a binary local
  file and a failed fetch render a note in place of the viewer rather than
  refusing, so `2 / 3` always means the second of three and a step never skips.

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

### The `#stage=` link grammar

```
#stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3
```

Groups are `;`-separated, paths `,`-separated within a group, `@ref` optional
(absent means the source repo's default branch). Paths are URL-encoded per
component with `/` left readable. The link carries **refs only**; file content
stays behind the viewer's token. Full base:

```
https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html#stage=owner/repo@ref:path1,path2
```

Mint one by hand by grouping items by `repo@ref` and joining. Example: two files
from a branch of this repo plus one from another repo →

```
…/show-repo.html#stage=mehrlander/web-tools@my-branch:lib/gh-api.js,lib/stage.js;mehrlander/home:inbox/note.md
```

#### Commentary: the `&prompts=` param

A link is one object with two halves, **refs** (the `#stage=` spec) and
**commentary** (an optional `&prompts=` param). The refs are pointers, so their
content stays behind the token; the prompts are authored text, so they ride the
link. `prompts=` is a base64url'd JSON list of `{label, ask}` review asks:

```
…/show-repo.html#stage=owner/repo@ref:before.md;owner/repo@head:before.md&prompts=<base64url(JSON)>
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

## The branch review: landed / stranded per branch

The **branches** view (`lib/alpineComponents/branches.js`) rolls every branch of
the open repo into **recently active** (commits in the last 14 days; judge
nothing yet), **likely landed**, and **likely stranded**, on a content-level
signal rather than `ahead_by`: which of the branch's uniquely-touched paths
hold, at the branch tip, bytes the default branch holds right now, at the same
path or moved anywhere in the tree. **Missing** counts paths absent from the
default branch in both path and bytes, the strong stranded evidence. Squash
merges and history rewrites make ref-level "unmerged" (and `ahead_by`, whose
count on a rewrite-orphaned branch spans its whole line, marked `*`) unreliable;
the content columns are the ones to read.

The math is the browser port of home's `tools/branch-survey.sh` (the CLI
reference instrument), lives in `lib/kits/branch-survey.js` as pure unit-tested
functions, and is held in agreement with the CLI by
`scripts/check-branch-survey.mjs` (on home's 56-branch estate: 52 exact, 4
divergent only where the CLI's git rename detection credits moved-and-evolved
content the API cannot see, all in the conservative direction). Fetch cost: one
branch list, one recursive tree for the default branch, then per branch one
compare (with a commits-list fallback for no-merge-base branches) and one
recursive tree, streamed so rows fill in as they land.

Advisory and read-only, matching the CLI's posture: the view frames the
per-branch reconcile judgment and decides nothing. Each row jumps to the branch
tree and `main...branch` compare on GitHub (ground truth), opens the branch or
the in-shell compare here, and the header links GitHub's branches UI, where the
delete action itself lives. Deep link: `?view=branches`.

## The branch overlay: preview a cross-repo change before it merges

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
…/toss-render.html#gh=owner/web-tools@<branch>:pages/show-repo/show-repo.html?overlay=<branch>
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

### Branch detail: the takeover

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

**Its three sections are panes, not a scroll.** Guide, Files and Commits switch
on a segmented control under the facts strip, with the counts on the labels, so
the changed files are one tap from the top instead of below a screen of guide.
Guide leads when the branch has one; Files leads when it does not. On a narrow
viewport the file rows also start collapsed, since four open cards is most of a
phone screen and the dense row list is what is worth seeing first there.

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

#### One mechanism, two levels

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

Three things that took measuring. The deck leaves `via` off and the fab fills it
from the page it recorded at mount, so an announcer never has to work out what
app it is inside. `subjectFramed` is new and splits what `viaToss` had
conflated: a toss subject lives in a frame the fab reaches into, a deck slide is
in this document, and the annotator was reporting itself blind on a file it
could annotate perfectly well. And the drawer moved from `z-50` to `z-[75]`,
above the deck's takeover: it now describes the file on screen, and a drawer
behind the thing it describes is a coupling nobody can reach.

This is the first of three steps. The next is `__tossNavigate` from the deck, so
a ref row re-renders the slide instead of navigating away; the one after is a
second, compare-against ref in the sidebar, which is what would let the card's
four source tabs (Diff, Patch, New, Base, all one comparison in four
renderings) collapse into a Compare pane whose two ends the reader chooses.

Measured end to end by `tools/render/scenarios/branch-deck.mjs`, which is also
what caught both of those faults above.

### Drop a file on a branch

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

## `.web-tools.json`: the repo manifest

Root `.web-tools.json` is the repo's **web-tools config file** (canonical location
documented in [PORTABLE.md](PORTABLE.md)). show-repo is one consumer: it reads the
`landing`, `pins`, and `stage` fields to decide how to present the repo. Those
fields sit at the top level, not under a `showRepo` key, because they describe the
repo in ways any web-tools page may read, not just this shell. The shell probes
the file once per `repo@ref` (a 404 means no config), parses it as **data**, never
executed, and falls back to the legacy `.show-repo.json` name during the rename's
deprecation window. Fields:

```json
{
  "icon": "ph-scales",
  "estate": true,
  "group": "data",
  "note": "One-line description shown on the estate card.",
  "order": 30,
  "landing": "pages/landing.html",
  "pages": [
    { "path": "pages/news/news.html", "title": "News", "note": "The news dashboard.",
      "appView": true, "viewLabel": "News", "icon": "ph-newspaper" }
  ],
  "pins": ["pages", "lib/alpineComponents", "docs/CONVENTIONS.md"],
  "stage": {
    "files": ["lib/foo.js", "owner/repo@ref:path/to/bar.js"],
    "targets": ["owner/repo:dir"]
  },
  "conventions": "optout"
}
```

Every path in that config is an address, and nothing used to read them: `link-survey.py` enumerates a repo with `git ls-files *.md`, so a declared page could be moved or deleted with no check anywhere noticing. [`scripts/declared-paths.py`](../scripts/declared-paths.py) checks `landing`, `pages[].path` and `stage.files` against the working tree and sibling checkouts, and belongs in the declaring repo's own verify suite: the mover is the only party who can catch a rename at the moment of the rename. That makes declaring a page load-bearing rather than decorative. If it is worth another repo embedding, it is worth declaring here.

The fields themselves are **not listed here.** They live as data in
[`docs/manifest.json`](manifest.json), one row per field with its type, its
consumer, and what it does, held to the estate's real manifests by
`tools/test/manifest-registry.test.mjs`. This section used to carry that list as
3,000 words of prose, 8% of all documentation in the repo, and prose could not
be checked against anything: `quickLink` was live in two of the four manifests
and appeared in no field list, and `pages[].order` was declared by two repos and
read by no code at all. Both surfaced on the gate's first run.

What stays here is the part a field registry cannot carry: how fields interact,
and why the mechanisms behind them are shaped the way they are.

**Membership is a repo property.** There is no registry list of repos. All
fields are optional, and a repo with no config is simply off the estate.

**`landing` and `pages` are not mutually exclusive.** A repo setting both gets
the custom page as its front door and the catalog as a standalone Pages view;
setting only `pages` gets the gallery as the landing. Neither arrangement hides
the other.

**When an app view is the right call.** A view whose subject is *the estate* is
built into the shell (Activity, Sessions, Repos, Surfaces, Stage, Map,
Proposals, and the Lists pane, which is operational to the tool). A view whose subject
is *content* is an app view over the repo that owns it: the renderer stays
public here, the content stays wherever it belongs. News and Links are both that
shape, home's data through a web-tools page. Two consequences before building
one: the page gets the main area minus the sidebar, so it has to survive at two
thirds width; and the shell already supplies a header and the sidebar label, so
a promoted page should stand its own masthead down when `window.self !==
window.top` (`pages/links.html` does, `pages/news/news.html` does not yet). An
app view cannot reach the shell's chrome at all, being in an iframe, so anything
wanting persistent presence has to be built into the shell instead.

**Checks: the boundary, and why the estate can afford them.** A check asks a
question about *data* and never runs code; anything needing execution stays in a
test suite. That is what keeps the convention cheap and portable, and why a repo
declaring no checks pays nothing. Only what is *not* passing renders, on either
surface: badging green states would make the block furniture, and furniture
stops being read. A check that cannot be evaluated renders too, in grey rather
than amber, because a check whose file was renamed out from under it has been
silently invalidated and silence there is the failure the mechanism exists to
prevent.

Two surfaces take two routes to one definition. A repo view evaluates live on
open: cheap for one repo, always current. The estate grid cannot, since M checks
across N repos on every load is the per-visit fanout the activity cache exists to
avoid, so the crawl probes each repo and the cards judge what it stored. That
works because `lib/kits/repo-checks.js` splits `probe` (gather each check's raw fact)
from `verdict` (facts plus a clock become pass or fail). A verdict is volatile
and a fact is not: `13d since 2026-07-18` becomes 14d tomorrow with nothing in
the repo having changed, while `2026-07-18` changes only when the repo does.
Caching verdicts would rehash every entry every day and commit on every crawl
forever, the same trap the activity cache's crawl-timestamp exclusion already
avoids. Caching facts keeps the hash stable and lets a card opened weeks after a
crawl render a correct, staler verdict with no network at all. A declaration
rides the hash beside its fact, so editing a threshold reaches the cards on the
next crawl; a crawl that ran checks and found none clears them, while one that
skipped keeps what it had, or a retired check would haunt a card forever.

**`tracker` is the one content-typed check kind.** The other five ask about a
path's shape or age; this one reads a tracker's typed projection
([TRACKER.md](TRACKER.md)) and counts. It still sits inside the boundary, since a
projection is a committed file and the check is one API read. It is what puts
*"6 awaiting someone"* on a repo card, the fact a board cannot state from a card
and the one a person wants when deciding what to pick up. Quiet is measured from
the *oldest open task* and only when `staleAfterDays` is declared, since how long
a backlog may sit is a per-workspace judgment; done tasks are excluded from every
count, so old history cannot hold a tracker stale.

**Links: two declarative layers, and the split is what keeps the rail honest.**
*Which board* is the `links` field, editable through the repo dialog's Config
tab. *What is on the rail* is the board itself: the `rail` flag, array order, and
each item's `icon`, `title`, and `doors`. Nothing is re-authored, since the flag
already drives the board's own masthead band. Placement follows the verb: a rail
item leaves the app, or opens a repo in it, which is not what a nav item does, so
it sits at the far end of the header rather than as a third nav group, icon-only.
That cluster is desktop-only, the one place the two viewports differ, because
below `lg` the nav already scrolls and a second header cluster would compete for
the same overflow. The sidebar's Links block is the phone's route to the rail and
the wide reading of it on desktop. A `snippet` item is skipped in both: a
`javascript:` URL is something to copy, not somewhere to go.

**Projects: the defining convention.** A workspace running a tracker (a
`tracker/` directory holding `tasks/`, per [TRACKER.md](TRACKER.md)) is a
project. A tracker at the repo root marks the repo itself and earns no row, so
"repo or project" needs no separate registry of what counts. That convention is
also why the task-board button needs no declaration: the same layout puts the
generated rollup at `<workspace>/tracker/board.md`, so the row derives it.

The field is declarative rather than discovered live (walking a tree for
`tracker/` dirs is API-costly), which makes it generatable: home's
`tools/generate-tracker-registry.py` syncs it from the trackers it finds, so the
manifest cannot drift from the ground truth. All three lists hang their rows off
the same 1 px rule, placed on the centre of the glyph above them, which is what
says "these belong to that" without spending an indent. The estate sidebar reads
the field from the config cache it already holds, so those rows cost no extra
fetch; the open repo reads its own live manifest instead, the one `loadConfig`
fetched at the browsed ref, so inside a repo the list follows the ref and needs
no cache entry. That split is why a `projects` field existing only on a branch is
invisible from the estate (the cache is a main-derived artifact) until it merges,
while the repo's own sidebar shows it as soon as you browse the branch; the
**branch overlay** above previews the estate side live.

**Two fields are not show-repo's.** `conventions` is read by the portable
conventions and `sessions` by a plugin hook outside any page. The registry's
`consumer` column carries that distinction for every field, which is what the
prose kept losing by noting it in passing on two entries.

### One membership list

A repo is in the estate when its own `.web-tools.json` says `estate: true`. That
one answer, aggregated by the config cache, serves every consumer: the Repos
grid, the sidebar index (`estateRepos`), the activity crawl, the stage's repo
pickers, and the Map's adoption roster. The **one** private string this public
page names is the registry repo itself
(`REGISTRY_REPO = mehrlander/web-tools-private`), where the cache lives, never
the repos in it.

Two rival lists were retired in favor of it, and both had drifted:

- `quickLink: true` fed the header quick-link row. The header-nav redesign
  deleted the row, and by then the flag was set on seven of the eight members,
  so as a prominence subset it distinguished nothing.
- The registry manifest's `repos` array fed the Map's roster. It sat one member
  short, having never picked up a repo that joined the estate.

Each was a central list standing in for a property every repo can state itself,
which is what let them drift. If a prominence subset is wanted again, it belongs
in `order` on the membership, not in a second flag.

### Config cache (`state/configs.json`)

With a token, show-repo keeps a **derived** cache of the account's repo configs
in the registry repo, built by `lib/kits/repo-config-cache.js`. `refreshConfigCache`
enumerates the account's repos (`gh.repos()`) and folds each one's
`.web-tools.json` into `web-tools-private/state/configs.json`, appending a
bounded on-change version history per repo. A per-browser throttle
(`localStorage`, default 6h) keeps the crawl occasional, forced after a config
save; a material-change check keeps commits sparse.

This cache is the **read path** for estate membership, so
a normal load is two GETs (the cache + the account list), not an N-repo scan; a
cold cache falls back to a live per-repo scan and then rebuilds. Source of truth
stays each repo's own `.web-tools.json`; the cache is derived, for breadth
(reading across repos at once) and config history a single read can't show. The
per-repo write flows (add-to-estate, the placement editor) read a repo's **live**
config, not this cache, whenever they
operate on that repo. Stage history falls out for free: a repo's declared
`stage.files` lives in its config, so versioning the config versions the declared
stage. Design and future ideas: `web-tools-private/DESIGN.md`.

### Mailbox (`mailbox/requests` → `mailbox/results`)

An async request/response channel between an agent session (limited repo scope)
and show-repo (the user's full-access token), built by `lib/kits/repo-mailbox.js`.
The agent drops a request file in the registry repo; show-repo, on load with a
token, fulfills every pending request and writes the result back; the agent
reads it on a later turn. This lets the agent see files and answers from repos it
never added to its own scope, by borrowing the browser's token asynchronously.

`processMailbox()` polls once per page load (a pending request wants prompt
service, and listing is one call), keyed by request filename so nothing re-runs.
It is **read-only**: the kinds (`tree`, `branches`, `fetch`) only read the user's
repos and only write results into the mailbox, so auto-fulfilling on load never
spends write access on agent-authored instructions. It is manual-triggered, not
live: show-repo is the worker and only runs when the user opens it. Protocol and
schema: `web-tools-private/mailbox/README.md`.

**A fourth kind, `ask`, addresses the user instead of their repos**, and it
completes the channel family rather than extending it. Lay the two channels out
by who has to act and one cell is empty:

| | Deferred read | Deferred write |
| --- | --- | --- |
| **from a repo** | mailbox `tree`/`branches`/`fetch`, answered on load | proposals, answered on your confirm |
| **from you** | **`ask`**, answered when you go and get it | (nothing: handing you a file is immediate) |

An ask names what is wanted in **prose** and where it lands as a **structured
`dest`**. The split is the design: what is wanted often has no filename
("whatever is in that folder", "a listing of that directory"), so a path schema
would drop the real cases or fake them, while `dest` has to be an address
because it aims the stage and lets one list span every repo.

**It is never auto-fulfilled, and the guard must run before `fulfill()`.**
`fulfill()` returns a *result* for an unsupported kind rather than throwing, and
writing a result is what marks a request answered, so an ask reaching the fulfil
loop would be closed by its own rejection on the first page load and never seen.
`processMailbox` skips on `RepoMailbox.isAsk`, which keys on the record and not
on a validation verdict, so a half-written ask waits for a person rather than
being answered by its own malformity.

**The Stage reads and closes them**, in the lens column under the destination
picker, because that is the order of the act: read what is wanted, aim (one tap,
the destination pills are already there), add the material through the intakes
that already exist (upload, paste, dictation), send, close. No new transport was
built; the only new steps are the reading and the closing. Closing writes a
result at the request's own name, carrying `answered: true` when material was
sent and `false` on a decline, `ok: true` either way. A message is optional on a
send and required on a decline, since "nothing references that file, stop
looking" is often worth more to the next session than the file, while a bare
refusal wastes its time as surely as silence.

### Inbox and outbox

Two optional manifest fields naming where material lands and where it is
staged. `inbox` is the **receiver's** declared landing spot for a deposit that
names no directory; `outbox` is a **sender's** shelf of material it is making
available to be pulled. Both are read by `lib/kits/repo-address.js`
(`RepoAddress.box(config, 'inbox'|'outbox', repo)`).

**A box is a folder by default, and can name a branch.** That was an open
design question, and it is settled as a per-repo choice rather than a global
one, with the discoverable option as the default:

| Declaration | Means |
| --- | --- |
| `"inbox": "inbox"` | the folder `inbox/` on the repo's default branch |
| `"outbox": "@shelf:out"` | the folder `out/` on the branch `shelf` |
| `"inbox": "owner/repo@ref:dir"` | a box that lives in another repo |
| absent | nothing declared (deposits land at the root) |

Folder is the default because a folder is visible in ordinary browsing while a
branch is invisible unless something points at it, and a consumer that forgets
the ref reads the default branch and silently finds nothing. Writing into a
branch also presumes the branch exists: the Contents API can PUT to an existing
one, but creating a ref needs the Git Data API, which this lib does not carry.
A repo that wants transient bulk kept off its main history says so by naming a
ref, and pays the discoverability cost knowingly.

**Inbox, on the send side.** The Stage view's send resolves an unaddressed
deposit (a repo picked with no directory) against the *destination* repo's
manifest, one read keyed to that repo, cached for the session. The armed
button names the resolved directory (`Send to inbox/ ?`), so the second tap
confirms where the files actually go rather than hiding a redirect. Root stays
the fallback, so a repo declaring nothing behaves exactly as before. Nothing
creates the folder in the background: the commit that lands the first file is
what makes it exist.

**A project can declare one too, and the repo's is the root project's.** A
`projects` entry takes an `inbox` in the same grammar, so a repo carrying
several workspaces can aim a deposit at the one that owns it. The two levels do
different jobs and neither replaces the other:

| | Repo-level `inbox` | A `projects` entry's `inbox` |
| --- | --- | --- |
| How many | exactly one | any number |
| Answers | a deposit addressed to `owner/repo` with no directory | a destination you choose |
| Reached by | automatic resolution at send | tapping its pill |

There is one repo-level box because the input carries nothing to discriminate
on: a file sent to `mehrlander/home` cannot be *inferred* to belong to a
particular workspace. A project inbox therefore never enters automatic
resolution. Conceptually the repo is its own root project, which is why its
default lives as a top-level key rather than as a synthetic entry in `projects`:
no migration, and the new field is purely additive.

**Declared, not derived,** which is where `inbox` parts from the sibling
`tracker` field. A board is derived from the convention (`<path>/tracker/board.md`)
because a board is a **link**, and a wrong guess costs a 404. An inbox is a
**write target**, and a wrong guess files a deposit into a plausible folder that
nothing drains, where it is not missing so much as quietly elsewhere. The
measured case: `mehrlander/home` ran an undeclared root `dump/` beside its
declared `chron/dump/` from 2026-07-30 to 2026-08-12, and because every reader
it had (its repo map, its staleness check, its drain skill) watched the declared
one, the map reported the tray empty while four files sat in the other.

**Destination pills.** The Stage view's Out pane renders every declared box
across the picker's repos as a one-tap strip under the destination picker, read
from the shell's config cache (one pass at load, already in memory), so the
strip costs no fetches. Only **declared** boxes appear. The picker beside it
already lists every folder that *exists*, which is a different claim, and the
difference is the point: a browser cannot tell you which plausible folder is
drained. A repo with no pill is visibly missing a declaration rather than
quietly defaulting, which is the pressure worth having. Tapping a pill sets the
destination and the picker's own trigger label together, since the picker
commits its label on a pick and would otherwise name one place while the send
went to another.

**Outbox, on the pull side.** A repo declaring one gets an **Open outbox** row
in its repo menu, which opens the Files view at that folder. The pull itself is
ordinary browsing or staging from there. For a **public** repo the outbox is
also the one cross-repo handoff that needs no token at all: `raw.githubusercontent.com/owner/repo/<ref>/<path>`
serves it to any reader, which is the gap the `#gz=` bundle form is contemplated
for on the private side.

### Proposals (`proposals/pending` → `proposals/applied`)

The write-side counterpart to the mailbox, built by `lib/kits/repo-proposals.js` and
reviewed in the **Proposals** view (`?view=proposals`,
`lib/alpineComponents/proposals.js`). A session that cannot reach a repo drops a
proposed edit into the registry; show-repo shows it and commits it to the target
with the user's token, on a two-tap confirm.

The asymmetry with the mailbox is the point. The mailbox fulfills on load
because its kinds only read. A proposal writes to a repo the session could not
reach, so **nothing is ever applied automatically**: page load costs one
directory listing to count what is pending, and the count is all that happens
without a gesture. The nav entry appears only while something is pending, so an
empty channel costs no attention.

A proposal record (`proposals/pending/<id>.json`) carries `id`, `kind`, `repo`,
`path`, `why`, and an optional `ref`. Three kinds:

- **`put-file`** replaces `path` with `content` in full. Use when the session
  knows the file end to end.
- **`set-json-field`** sets one top-level `field` to `value` in a JSON file,
  read-modify-write against whatever the file says at apply time. This is the
  honest kind when the session cannot read the target: it proposes a field, not
  a guess at the rest of the file. Key order is preserved, a new key lands last,
  and the file is re-serialized with two-space indent and a trailing newline.
  **`field` is a literal top-level key, not a path**: there is no dot or bracket
  notation, so `"a.b"` sets a key named `a.b` rather than descending, and a JSON
  file whose top level is an array is refused. The `value` may be any JSON, so a
  key can be set to a whole nested structure; what is missing is addressing into
  one.
- **`unset-json-field`** removes one top-level `field`, the same
  read-modify-write with a delete in place of the assignment, and the same
  literal-key limit. It exists because absence is not expressible any other way:
  `set-json-field` can only assign, and `put-file` needs the rest of the file,
  which a session scoped out of the target repo does not have. A record carrying
  a `value` is refused rather than ignored, since it almost always means a set
  was intended. **A removal that finds nothing to remove is done, not failed**:
  the end state is what was asked for, so it reports through the same *Already
  applied* path below and is retired rather than written again. A missing target
  file counts the same way, so a removal never creates a file.

**Three deliveries, and the tap decides.** A record may suggest one with
`deliver`, but both routes are always on the card, because the person holding
the token knows whether this repo wants a PR today and the proposing session
does not:

| `deliver` | What the apply does |
| --- | --- |
| `commit` (default) | commits straight onto the target ref, the original behavior |
| `branch` | cuts `proposal/<id>` off the target ref and commits there, leaving the target untouched |
| `pr` | the same branch, plus a **draft** pull request |

The PR's title and body are authored from the record: the `why` becomes the
body, a `*-json-field` kind gets its before/after as a fenced block (a removal
showing `(removed)` on the after side), and the
signature and record path go in a footer. It opens as a draft, since marking a
PR ready is the reviewer's move.

PR delivery is the only route that works against a **protected branch**, and it
is the honest one for a code change, since GitHub's diff view reads better than
any card and the PR survives as the durable record. A one-key config edit is
usually better off as a commit.

Two implementation notes worth knowing. Creating the branch needs the Git Data
API (`createRef` in `gh-transfer.js`), since the Contents API can write to a ref
but not make one; an existing `proposal/<id>` is treated as a resume rather than
a collision. And **opening the PR is a separate permission** from writing: a
fine-grained token can carry `contents: write` without `pull_requests: write`,
so a PR failure never erases the branch and commit that already landed. The
record reports both and hands over a compare link.

**Preflight checks, on the card, before the tap.** Every row answers the
premises the proposal rests on, live against the target:

| Check | Means |
| --- | --- |
| **Target is readable** | the file exists and parses (JSON, for the two `*-json-field` kinds) |
| **Change is still needed** | the target does not already carry this exact change |
| **Target unchanged since proposed** | `expectSha` still matches, skipped when none was recorded |
| **declared premises** | each entry in the record's optional `expect: [{ field, equals }｜{ field, absent }]` |

A failing check disables Apply, so a proposal whose premises no longer hold
cannot be tapped through by mistake. **Already applied is a state, not a
failure**: when the target already carries the change, the row says so and
offers **Already done, retire it**, which writes the tombstone without touching
the target. `apply()` refuses such a proposal even if called directly.

**Only a success retires a proposal.** A failed apply used to write the same
`applied/` tombstone as a successful one, so a write that failed marked the
record spent and it vanished from the list without ever landing. A failure is
now kept under `proposals/attempts/<id>-<timestamp>.json`, and the proposal
stays pending. When reading the channel's state, `applied/` means it landed,
`attempts/` means it did not.

**The list drops a row without waiting for the API.** The contents listing is
eventually consistent, so a read a second after the tombstone lands often still
reports the proposal pending, which made applied rows appear to linger. The view
remembers what it retired for the life of the page and filters those names out
of every reload.

**The staleness guard.** A record may carry **`expectSha`**, the blob sha of the
target as it stood when the proposal was written. At apply time a different sha
refuses the write, with the two shas named, and a target that has since been
deleted refuses the same way. This matters most for `put-file`, which replaces
rather than merges and would otherwise erase a change nobody reviewed; the
`*-json-field` kinds merge into current content, so they are safer without one. The
refusal is not the end: the card offers an explicit **Apply anyway**, and a
forced write is stamped `forced` in the applied record along with both shas, so
a deliberate override stays distinguishable from a clean apply. A record with no
`expectSha` behaves as before, last write wins, which is the honest default for
a session that never read the file.

**Provenance.** Three optional fields ride along and are copied into the applied
record: **`by`** (who or what authored it), **`session`** (a link back to the
session that did), and **`authored`** (the date). A proposal is an instruction
to write to a repository, so who issued it, and from where, is part of what a
reviewer is judging. The card shows them under the diff.

A record's optional **`ref` targets a branch**. Both halves honor it: the review
pane reads the target at that ref, so the before/after is that branch's file,
and the write commits to that branch. The branch must already exist, since the
Contents API can write to a ref but not create one. Omitted, `ref` means the
repo's **default branch**, whatever it is named, rather than literally `main`.

Every row **resolves against the live target before it can be applied**, and the
view shows the resulting bytes (a before/after on the key for the JSON kinds; a
line diff for `put-file`, via the shared `kits/text-diff.js`, with side-by-side
panes as the fallback for a new file or a pair past the diff cap), so a reviewer
confirms what will happen rather than what was promised.
A target that cannot be read, or is not the JSON it claims to be, lists as
unresolved with its error and no Apply. The write goes through `gh-transfer.js`'s
`saveRaw` (lazy-loaded, stale-SHA retry), and the outcome is written to
`proposals/applied/<same-name>.json`, which is what marks a proposal spent:
`gh-store` has no delete, so a result file is the tombstone, exactly as in the
mailbox. A successful record carries the landed commit as both `commit` (the
sha) and **`commitUrl`** (the github.com address), so a reader holding only the
JSON can open what actually landed without building the URL by hand.

**A record is an instruction, not a patch.** Nothing in the channel carries a
diff in any format, and none is stored. The before/after in the review pane is
computed when the card renders, against the target as it stands at that moment,
which is why a `(not set)` line is a live fact about the target rather than a
claim made when the proposal was written. A stored diff would describe the file
as it was on the day it was authored and quietly go wrong afterwards. Once
applied, the resulting bytes are an ordinary commit in the target repo, which is
where a durable diff belongs; the `applied/` record keeps the outcome and that
commit's sha.

**Three prose fields, three jobs.** A record is read cold, weeks later, on a
phone, by someone deciding whether to write to a repository. The first attempt
at that put everything in one `why`, which rendered as a wall of text repeating
the same explanation on every card, so they are split:

| Field | Job | On the card |
| --- | --- | --- |
| `summary` | one line: what this does to which repo | always visible |
| `why` | the detail worth reading once: context, provenance, consequence | behind the **Why** toggle |
| `caution` | the judgment call the reader must not scroll past | always visible, amber |

Only `why` is required, and validation still refuses a record without one before
the network is touched. A record carrying just a `why` reads correctly anyway:
its first sentence stands in as the summary and the remainder becomes the
detail, so nothing written before the split needs rewriting. Keep the shared
explanation (what a `scope` field is, say) in `why`, where it collapses, and
keep `summary` specific to the one repo, since that is the line that repeats
down the list.

### The repo menu

`repo-menu.js` is one panel showing one of **three lists** for one repo. It
hangs off a Repos row's two trailing buttons, and off the Activity view's repo
chip, as a dropdown anchored to whichever was used, positioned from its rect
(the rows sit in a scrolling column that would clip a nested panel) and flipped
above the trigger near the bottom of the list.

**Actions**, off the visibility marker, is where you act **on** a repo rather
than navigate to it: **Config**, its declared outbox, and **Copy browse link**.
It is a short list because every row that left had somewhere better to be. Files
and Branches expanded into the repo's folders and its branch list, and "what is
inside" is a browsing question the sidebar and the Files view already answer
once you are in the repo. **Open** went because tapping the row itself is what
opens the repo. **Switch to the `-private` companion** went because the sidebar
lists that companion as its own row: the jump was built for a list that shows
one of a pair and hides the other, which is the estate **cards** (they nest the
private repo inside its public parent), not this one. A menu offering a jump to
a row three lines down answers a question the list has already answered.
Nothing expands, so nothing carries a chevron.

**GitHub**, off the github-logo button beside it, is where that repo lives:
**Repository**, **Pull requests**, **Issues**, its **Task board** (the
`tracker` field), **Branches**, **Commits**, **Actions**, each with an
out-arrow. The list is `lib/kits/github-links.js`, a pure string builder with no
fetches, so the Activity view's repo chip fills the same panel from the same
rows. This was a single **Open on GitHub** row inside the actions list, pointing
at the repo root: the one destination a reader could have guessed, while the
rest of a repo's GitHub surface had no route at all. Splitting it out is what
let it grow, and it stays cheap because the lists share one panel, so hovering
from one trigger to another swaps the rows in place where separate panels would
close one under the pointer.

**Repo**, off the Activity view's chip, is both of the above in two sections.
The sidebar can afford to split its material across two buttons, because the
row itself opens the repo and the list shows every sibling; an Activity row is
about a **branch**, in a view with no sidebar on screen, so its chip is the
reader's only route to the repo and carries the lot. Sections rather than a
submenu: a submenu hides half the answer behind a second gesture, and seeing
where you can go is the whole point of a jump-over list.

It is **the repo, twice**, then where it goes on GitHub, as one flat list:

```
  Show web-tools branches only     ← contributed by the view
  ────────────────────────────
  ⟨⟩ web-tools                     ← opens the repo here
  ⌥ web-tools                   ↗  ← opens the repo on GitHub
  Pull requests · Issues · Task board · Branches · Commits · Actions ↗
```

**Flat, and flat again on purpose.** The list briefly grew two sections, each
with an indent and a bold head row, and then the app section lost its children;
one section is not a structure, and the styling was carrying a hierarchy that
had stopped existing. What separates the two halves now is the **out-arrow**,
which is the honest distinction anyway: those rows leave the app and these do
not. The only styling left is mono on the two rows whose label is a **repo
name** rather than a phrase, matching how repo names are set everywhere else,
and one rule under the caller's row, which acts on the list you are in rather
than going anywhere.

The app half used to carry **Files**, **Branch review** and **Config**. They
are gone for the reason the sidebar's own menu never had them: once the repo is
open, its views **are** the sidebar, so each row bought one tap and made the app
half look like a section when it is a destination.

The app's mark is drawn **inline** rather than loaded from `lib/favicon.svg`,
as an outline rendition of it: an `<img>` cannot take `currentColor`, so the
file would sit in brand blue beside a column of muted glyphs and stay blue on
hover. Two numbers in it are derived from Phosphor rather than chosen, and both
were wrong on the first pass: the **viewBox** is padded to 29 units around a
22-unit mark (~76%), since a Phosphor glyph keeps margin inside its own box and
a mark drawn edge-to-edge in the same 16 px reads a size larger; the **stroke**
is `29 × 16/256 = 1.81`, Phosphor's regular weight carried onto that viewBox.

That replaced an inert uppercase label plus a row underneath it: **Open repo**
and **Repository** were one idea named twice, and reading them together made
the two halves look like two vocabularies for the same thing. Now they are the
same name under two marks, and a rule does the separating that a label used to.

Both lists are flat, short, and **compact by pointer**: 26 px rows at 13 px for
a fine pointer, 32 px for a thumb, in a 184 px panel. Both heights are under the
44 px floor, which is for a cold target in chrome, not for a panel the pointer
has already aimed at and opened. A list where **every** row leaves the app drops
the out-arrow column: the GitHub menu's seven identical arrows said what the
github-logo that opened it already said. A mixed list, like the branch menu,
keeps them, since there the arrow marks the odd row out.

Where the pointer can hover (`(hover: hover) and (pointer: fine)`) either
trigger **opens on hover**, after ~140 ms so that crossing a row does not open
it, closing ~220 ms after the pointer leaves both the trigger and the panel,
which is what lets it cross the 2 px gap between them. A tap works everywhere,
and a second tap on the same trigger dismisses. The Activity view's two menus
(its repo chip and its per-branch GitHub menu) follow the same timings.

**The delay applies to a swap as well as to a first open**, which is the part
that had to be found by using it. The two triggers are neighbours and the panel
opens past both, so the pointer's route from one button to the panel runs over
the other; swapping on contact made the GitHub menu unreachable from the GitHub
button, the marker's menu replacing it every time. A crossing takes tens of
milliseconds and a decision takes longer, so one threshold separates them.

The pair replaced a three-icon cluster (visibility marker, config gear, GitHub
logo) on every row. Those icons measured about 16 px against a 44 px tap-target
floor and each bought exactly one tap. The two that came back each open a list
rather than a single destination; the marker is the old inert `<span>` promoted,
so the row keeps its public/private state while carrying its menu. They sit
tight together and carry **no chrome of their own** on a fine pointer (28 px
wide, no hover background), since a background per glyph made the pair read as
two tiles when the row's own tint is already the feedback and the glyph turning
primary is already the state. A thumb gets 40 px. Two other presentations were built here and taken
back out: a press-and-hold, since a visible control answering a single tap does
the same work without a gesture to discover, and a bottom sheet, since nothing
about a short list justifies throwing the menu to the far edge of the screen.

### Editing the manifest from the shell

Two surfaces edit the same file. The **Config view** (`lib/alpineComponents/config.js`,
the sidebar's Config row) is the roomy one and covers the **currently-open
repo**: a Settings form and a raw JSON pane side by side on desktop, tabbed on
mobile, kept in sync both ways. The **repo dialog** (`repoModal` in
`lib/alpineComponents/repo.js`) is the compact one and covers **any** repo
without navigating to it, reached from an estate card's gear, a sidebar Repos
row, or the Map; its **Settings** and **Config** tabs are the same two panes.

Either way the JSON editor loads the current `.web-tools.json` (or an all-empty
template when the repo has none, so the shape is there to fill in), validates on
every keystroke, links to this doc for the field format, and on Save commits the
file through the viewer's token (`gh-store.js`'s `save`, a Contents API PUT to
the repo's default branch). Editing needs auth, so Save is disabled without a
token.

- **Where it lives**: the open repo's config is a sidebar row like any other
  repo view, so it sits with the views rather than behind an icon; the sidebar's
  top-bar gear was retired as a duplicate of that row. Another repo's config
  stays a dialog, so opening it does not move you off the repo you are in.
- **Layout**: the Settings pane is two sections built the same way, **General**
  and **Projects**, each a header line over a bordered card. Field widths are
  **container** queries (`@container` on the column, `@md:`/`@xl:` on the grids),
  not viewport breakpoints, because that column is half a pane on desktop and a
  whole screen on a phone: `lg:grid-cols-6` would put six columns in a 360px
  column. Every control carries `w-full`, since daisyUI's `.input` and
  `.textarea` default to `width: 20rem` and otherwise stop short of their label.
  The pane's cap is high enough that on a 1440 screen its own width is what
  binds, and it gives the form three fifths to the JSON pane's two, the JSON
  being a mirror of the form rather than the thing people came to use. Both
  rules generalize and are in [HTML-STYLE.md](HTML-STYLE.md).

  **Two things follow from the form being several screens long** once a repo
  declares projects and pages. The JSON pane **sticks** on desktop and fills the
  viewport (`lg:sticky` plus a `100dvh`-based height), because a pane that
  scrolled away after 600px left a tall dead column beside the rest of the form
  and stopped mirroring exactly when there was something to mirror. And the save
  bar sticks to the bottom of the scrolling pane at every width, since a button
  at the far end of three screens is a scroll each time you use it.
- **Auto-migration**: a save always writes `.web-tools.json`. A repo still on the
  legacy `.show-repo.json` is edited the same way; the save lands the new name,
  which readers already prefer, so the legacy file goes inert. No delete step
  (the gh layer has no delete helper), and the section flags the migration when
  it loaded from the legacy name.
- **Projects** (Config view only): the workspace list, `projects`, as its own
  section under the repo-level fields. It reconciles two facts that are easy to
  let drift apart. A project is **declared** by an entry in that array, which is
  what the sidebar, the Repos card, and the project view all read. A project is
  **detected** by the defining convention, a folder carrying `tracker/tasks/`,
  which is what **Scan** reads out of a recursive tree fetch (a button, not a
  load-time read: it is a whole-tree request and the form is useful without it).
  The section shows one list of both, so the two disagreements are visible where
  the fix is: a workspace running a tracker that nothing declares comes with a
  **Declare** button, and a declaration the scan cannot corroborate carries a
  quiet `no tracker` badge rather than an error, since declaring a workspace
  without a tracker is allowed. The repo-root tracker marks the repo itself and
  is never offered, matching home's `tools/generate-tracker-registry.py`, which
  performs the same walk to sync the same field. Detection keys on `tasks/`
  rather than `board.md` because the board is generated and a fresh tracker may
  not have one yet.

  Per entry the form edits `label`, `landing`, and `tracker` (with a **No board**
  checkbox for `tracker: false`). Two rules keep a save from restructuring a
  file nobody opened the form to restructure: an entry keeps the shape it was
  authored in, so a bare path string stays a string until a field is set on it
  and drops back to one when the last field is cleared; and an empty field
  clears its key rather than storing `""`, the same minimality the repo-level
  fields already follow. Adding a project is `projects` only. Creating the
  workspace, its tracker, and its README is repo work that happens in the repo.

- **Pages and Stage** (Config view only): the last two fields that were
  JSON-pane-only. **Pages** lists the catalog, one card per entry, with the path,
  title, note, and the app-view toggle editable and an add-by-path box; a
  qualified `owner/repo[@ref]:path` entry carries a `cross-repo` badge, since
  that file is not in this repo. A page's `icon`, `thumb`, `project`, and
  `viewLabel` are not rendered and are carried through untouched, which is the
  case `config-form.test.mjs` holds: a form that silently dropped the keys it
  does not show would be worse than no form. **Stage** is the two path lists as
  line-per-entry text, the same shape as Pins. **Scope** sits in General beside
  Note, since it is prose about the repo; it renders monospaced when its value
  is a `.md` path, which is the one hint that the field takes both forms.
- **Scope of the form**: every manifest field now has a control except a page's
  `icon`, `thumb`, `project`, and `viewLabel`, and the `links` board path. Those
  are preserved on save and edited in the JSON pane. An icon picker is still the
  open piece.

## Transfer: moving files to another repo

"Copy to repo" writes the staged fileset to a destination via `gh-transfer.js`
(lazy-loaded on first send). Mechanics:

- Destination spec: `owner/repo`, `owner/repo:dir`, or `owner/repo@ref:dir`.
- Each file lands as **its own commit** through the Contents API; the payload
  stays **base64 end to end**, so binaries copy as faithfully as text.
- **Two-tap confirm**: the first tap arms for 3 seconds, the second sends. A
  cross-repo write with the viewer's token stays a deliberate gesture.
- Writes land on the destination's **default branch** unless an `@ref`/branch is
  given.
- The Contents API caps a file at ~1 MB; a larger file **errors** rather than
  writing an empty file at the destination.
- A file that would copy onto itself (same repo, no `:dir`, same ref) is
  refused with a prompt to add a `:dir` or `@ref`.

## Boundary: show-repo vs toss-render vs artifacts

Three cross-repo live-view channels, one job each:

- **show-repo** *shows and moves* files (browse, stage, transfer, manifest). Its
  own marker in chat is 🗂️ for a stage link.
- **toss-render** (`#gh=` / `#gz=`, marked 🥏) *runs* a page: it renders HTML
  live. show-repo's custom landings and the viewer's "Toss render" action both
  hand a file to toss-render at its own `repo@ref`.
- **artifacts** (marked 📦) *publish* a self-contained snapshot to a stable
  `claude.ai` URL, which renders in the Claude app on sign-in alone, so it needs
  no token where a toss or stage would want one. See [`artifacts.md`](artifacts.md).
- **review** (`pages/review.html`, marked 🔍) *reads* a changeset: one card per
  changed file with a CM6 diff against the base, patch text, and the caption's
  `[new]/[main]/[diff]` links. Address grammar `#gh=owner/repo[@ref][:path][&base=…]`
  (the toss `#gh=` address plus a base); token-gated the same way. Folding its
  per-file dossier (`lib/alpineComponents/file-review.js`) into this shell as a
  view is on the roadmap below.

## Roadmap (not built)

- A content-carrying `#gz=`-style stage bundle for token-less contexts.
- A review view: mount `fileReview` cards (pages/review.html's dossier) over
  the stage's Compare result, so a ref-diff reads in place instead of only
  listing files.
- Batch-as-one-commit transfer (needs the Git Data API; Contents-API
  per-file commits are the current scope).

Private-repo landing presence used to sit on this list as *federation*: a
curated `landing.json` in `mehrlander/home`, read through a single `HOME_REPO`
hinge. It is off the list because it shipped in the per-repo form described
above: a repo opts itself in through its own `.web-tools.json` (`estate`, plus `pages`
and `appView` for what it publishes), the config cache aggregates the opt-ins, and
the registry repo is the only private name this public page carries.

## Using it from a Claude session

- **Hand the user a browse link:** `…/show-repo.html?repo=owner/repo` (add
  `&ref=` for a branch, `&view=files&path=<dir>` to land in a folder). The
  bare page URL is the estate (the all-repo dashboard).
- **Hand the user a stage link (🗂️):** mint `#stage=…` per the grammar above.
  State the token caveat. For a token-less reader, download the concatenated
  bundle and `SendUserFile` it instead.
- **Set a repo up for show-repo:** write its `.web-tools.json` (`landing`,
  `pins`, `stage.files`, `stage.targets`).
- **Surface something for the user:** with registry access, add an item to a
  `surfaces/*.surface` file in `web-tools-private` (or add a new surface file);
  the estate renders it on the user's next visit. Items follow the surfacer
  schema (`id`, `title`, `kind`, `snippet`, `facet`, `commentary`, `added_at`,
  plus kind fields); flip a surface's `category` to `archive` to retire it. For a
  surface that belongs to one repo rather than the whole estate, commit the
  `.surface` file **in that repo** and name it in the repo's `.web-tools.json`
  (`surface`: path or list); it renders under that repo's section in the estate,
  no registry access needed.
