# show-repo: the shell of the Web Tools app

⭐ **Open it:** [Web Tools](https://mehrlander.github.io/web-tools/app/) (the hosted shell; append `?repo=owner/repo` to open a repo)

show-repo is the one hosted page behind the **Web Tools app**, the front door
to the estate. It began as a repo browser and file mover, and that trunk still
organizes this doc, but the scope is wider now: the estate dashboard and its
activity, session, guide, and chat readings, the stage, the lists, the map,
and the tools, every destination declared in
[app-routes.csv](app-routes.csv). [APP.md](APP.md) states the mission and
the name split (Web Tools where a reader is addressed; show-repo for the file,
the routes, and this doc). It is the cross-repo instrument: a session hands
the user a link into it, or configures a repo so the shell presents it well.
Rendering a page is a different job (that is `toss-render`, see the boundary
below); show-repo shows, moves, and operates.

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
`landing`, `pages`, `atlas`, `config`, `project` (a repo's). `files` and
`branches` are retired per-repo views whose keys still resolve, to the Files
view and to Activity.
Beside it: `&file=<path>`, `&path=<dir>`, and a second key for the views that
carry one, `&tab=<tab>` (**project**'s pill row, **Map**'s tabs), `&item=`
(**State**), `&detail=` (**Branches**), the `&sq=` family (**Files**: `sq`,
`smode`, `srepo`, `sref`, `spath`, `sfile`), `&window=`. A view
keeps its default second key out of the URL, so an existing bare link still
opens where it always did. `&view=portable` is a retired alias that still
resolves to the Map. Across all of them, `&shell=nav|none` says how much of the
app is drawn around whichever view the address names (below).

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

### The shell mode: how much of the app surrounds the view

`?shell=` decides how much of show-repo is drawn around whichever view the rest
of the address names. Three values, and `full` is the default and stays out of
the URL, so nothing written before this existed changed shape:

| Value | Header | Sidebar |
| --- | --- | --- |
| `full` (default) | yes | out on a wide screen, away on a phone |
| `nav` | yes | away at every width; the header's hamburger opens it |
| `none` | no | away; the FAB's Render tab is the way back |

**It exists because most of these views have no page behind them.** Four do: a
custom landing, a project landing, an app view, and the atlas are all iframes
over a real standalone page, so the FAB offers a **bust-out** that leaves the
embed and opens that page full-viewport. Files, Branches, Map, Search, State,
Activity, and a repo's default overview are the shell's own, with nothing to
bust out to. `?shell=none` is the address that shows one of them alone.

**The sidebar is one boolean at every width now** (`sidebarOpen`), and the
viewports differ in two things only: below `lg` it overlays with a scrim, at
`lg` and up it is a column the main area sits beside, and it starts out on the
wide one and away on the phone. Before this it could not be closed on a desktop
at all: an unconditional `lg:translate-x-0` pinned the column open and the
hamburger that would have collapsed it was `lg:hidden`. The header now carries
that toggle at every width, lit while the sidebar is out, and the sidebar's own
X is no longer phone-only either.

**Toggling the sidebar does not touch the URL.** `syncUrl` pushes a history
entry per distinct address, so an addressable sidebar would stack one on every
tap and make Back walk them. The mode already carries the part worth linking
to, which is how the screen **opens**; moving the sidebar inside a mode is
reading, not navigation.

It is a **reading parameter**, in the class `?use=`, `?overlay=`, and `?window=`
belong to: it says how to present the screen, not which screen. So it gets no
`VIEWS` row and is stamped unconditionally beside whatever the view table
stamped, which is also what carries it through a ref switch (that mints its
address from an empty base, where `?use=` must not survive but this must).
`show-repo-routing.test.mjs` holds the two properties the table's own rows get
for free: the address reopens as itself, and an unrecognized value reads as
`full` rather than hiding the header with no way back.

**Named `shell` because that is already this app's word for it**, the heading
this section sits under and the `window.__shell` the page hangs its state on.
`chrome` was the first name and was dropped: in a browser the chrome is the
browser's, which is the one thing this cannot touch. `frame` was dropped too,
since the drawer's width bar already means a frame and two meanings in one tab
is how a bar gets misread.

**The FAB's Render tab carries the header half of it**, as one on/off control
sharing the row with the width presets, which is what makes `none` a mode rather
than a trap: the same control that sets it brings the app back. It offers the
header and nothing else. The sidebar already has two owners a reader can reach,
the header's hamburger and `?shell=nav` in the address, so a third copy in the
drawer would be a control for the thing standing next to it; the header is the
part with no in-app control, since the header cannot carry the button that hides
the header. That leaves the drawer a binary, and a binary needs no row of its
own. Since the drawer offers one control over three modes, the shell remembers
which header-bearing mode it left, so turning the header off and back on from a
`?shell=nav` link does not silently promote the reader to `full` and spring the
sidebar out at them.

That control is not hard-coded. The drawer's opt-in contract now has a **state**
half beside the `actions` half a page already had: a component exposing
`toggles` as `[{ key, label, icon, on, title, set }]` gets one control per
entry, inline with the presets past a hairline, and the FAB reads and calls
without holding an opinion about what a toggle means. Unlike `actions`, a
toggle is re-read from the live component on every paint, since a verb is fully
described by a closure and a state is not.

**The row holds one line, and that decides the labelling.** Four labelled width
presets plus one labelled toggle wrapped on a 390pt device, so the presets went
**icon-only under a single `Width` label**: one word for the group instead of
four for its members, with a phone, a tablet, and a monitor carrying what they
name and the arrows meaning the device in your hand. The toggle keeps its word,
since an icon alone cannot say which part of a page it means and it is the odd
one out in a row otherwise about size. Nothing on the row explains itself in
prose either: a contributed `hint` line was tried and dropped, having spent two
lines saying what the tooltip and the address already said. The one line that
survives is the width caveat, which appears only off Actual and reports what no
icon can.

Fixing that surfaced an older defect in the same scan: the contract was read
through `Alpine.$data(el)`, which returns the merged data **stack**, so every
component nested inside the shell answered for the shell's properties as its
own. It arrived visible (fourteen identical bars, one per nested component) and
had been sitting quietly in `description` and `actions`, whose values happened
to be empty wherever anyone looked. The scan now reads the element's own scope.

**A third half arrived on 2026-08-19: `menu`,** which fills the launcher's
long-press menu rather than anything inside the drawer. A component exposing
`[{ label, icon, run }]` gets one row per entry under the built-in rows ("Take
a note", and since 2026-08-22 "Web Tools home", which leaves for the deployed
app at the default branch), and show-repo contributes exactly one, the app-wide
paste. The contract exists because the drawer is the wrong place for a verb you
want *before* the drawer: opening it is a tap and a tab, and for the paste
specifically it would also spend the user activation a clipboard read has to
ride.

Two things are load-bearing about it. **Rows are read when the menu opens, not
when the drawer scans.** `detect()` runs on drawer open, so a menu sourced from
its output would be empty on the first long press of a page load, which is the
press that matters; `readPageMenu()` does its own narrow pass over `[x-data]`,
cheap enough to redo every time and therefore correct on a view that mounted
late. And **every row is one line.** "Take a note" carried a two-line
explanation until this change, and it went for the same reason the toggle bar's
`hint` did: a menu raised by a held finger is read in the half-second before the
finger lifts, so a paragraph there is something to get past rather than
something to read. There is no `desc` field to put one in.

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

**It is not the Files view's ref picker, and the two are easy to confuse.**
That one chooses which ref of the *browsed* repo you are reading; this one
chooses which ref of `mehrlander/web-tools` **show-repo itself runs from**. Same
vocabulary, different subject, so the panel spells out the repo and path it acts
on every time it opens. This one stays its own component rather than adopting
`refPicker`, because picking a ref and *navigating to it* are different verbs.

It switches by navigating to the toss renderer with the ref pinned on **both
halves**, `?use=<ref>` for the renderer's own lib chain and `#gh=…@<ref>:…` for
the page, since `?use=` alone re-pins only the lib a page loads and would leave
the shell (this header included) at the deployed version. The page's current
deep link rides along as the trailing `?query`, so a switch lands on the screen
you were already looking at rather than at the front door.

The branch list is the same scan the fab's Render tab runs
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

- **landing**: the repo's front page, and it is the **README**, for every repo.
  Stats, the description, the README rendered, and a jump to the atlas.

  It used to be a decision. `landingKind()` picked one of three things for this
  slot, and the two that were not the README won whenever they were declared:
  the hub got its page gallery, any repo with a `pages` catalog got the same,
  and a repo naming a `landing` got that page. So the one thing every
  repository has, and the first thing a reader arriving at one is looking for,
  was the thing displaced. A front door showing something other than the README
  has to be worth more than the README, and a gallery and a custom page are
  destinations rather than front doors. Both moved out to rows of their own
  (2026-08-14), where each says what it is instead of standing in for something
  else, and the overview's own carve-out went with them: it had skipped the
  README fetch on the hub, since the hub was the one repo that never rendered
  one.
- **pages**: the gallery, from web-tools' `pages/pages.csv` or any repo's `pages`
  catalog. A standing row now, wherever there is a catalog; it used to appear
  only when a custom `landing` had taken the front door from it.
- **Landing** *(a repo declaring one)*: the repo's own declared front page,
  rendered live. It goes through the **app view** rather than a landing kind of
  its own, since "render this repo's page as an addressable view" is a thing
  this shell already does for `appView: true` pages. That deleted a branch
  rather than moving one, and the page keeps the FAB's full-page bust-out that
  every framed view has.
- **atlas**: a standing structural view, available for every repo.
- **Files** *(a route out, not a view)*: hands the estate's **Files** view this
  repo at the ref being browsed and goes there, carrying an ↗ so the row says
  it leaves. A repo keeps a one-tap way to its files, and there is one place
  they are read.
- **config**: the repo's `.web-tools.json`, as a form and as raw JSON.

**Two per-repo views were removed rather than moved** (2026-08-14), and the
question they answer is the test: *does this repository answer it better than
the estate does?*

| Retired | Why | Where it went |
| --- | --- | --- |
| **files** | the tree walk. Reading a file is not a per-repo job: it is wanted by name, by folder, or by content, and across repos as often as within one | the estate's **Files** view, which walks the same tree and reads the file in place |
| **branches** | the per-repo branch review | **Activity → Branches**, the same rollup with the same landed/stranded signal, across every repo at once, opening the branch takeover |

Neither key 404s: `?view=files` aliases onto the Files view and carries its
`?path=` through as the folder scope, `?view=branches` aliases onto Activity,
and a `?file=` link opens the central reader scoped to that file's folder. What
the explorer uniquely had was a **live directory read**, and only one thing on
it was ever missed: a file's size on its row. That turned out not to need the
live read at all, since the recursive trees call reports a blob's size on the
entry, so the Files view now shows the size off the cache it already walks and
gives up nothing but the guarantee that the number is a second old. The cache
is what buys free descent and folder counts. The ref compare went with the
branch review, its only caller anywhere,
and the component was deleted with `nav-repo.html`, its last mount, a day later.

**`?ref=` moved with them.** The browsed ref was the Files view's key, stamped
by its row, back when that view was the only thing that read it. The atlas, the
config form, the pages gallery and mention all read it, so it is repo-scoped
state and stamps beside `repo` from any repo view.

**GitHub jump-overs.** show-repo is a wrapper over GitHub, not a wall: every
view keeps a one-tap route to the GitHub presentation of what it is showing.
The sidebar top bar links the open repo@ref and its recent entries link their
files, the Files view's reader links the open file's blob at its own repo and
ref, each staged item and finder row links its own
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
- **Files** (`?view=search`) — the central file surface: file names at any ref under any folder, contents through the code-search API, the session records, and the file itself read in place (below). The `?view=` key stays `search`, its name since the view was a results list: an address is not a label, and every link ever shared still opens it.
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

**Hiding one is the exception, and it writes the registry.** A member can be
kept off the dashboard without leaving it, through the `hidden` list in the
private registry's own `.web-tools.json` (an array of `owner/repo`). The
asymmetry is the argument: membership and every descriptive field are
properties of the repo, and *not wanting to look at something* is a property of
the person looking, so it belongs where the other viewer-owned estate content
already lives, beside the pins and the lists. Nothing is written to the repo it
names, which is what makes it reversible from here.

A hidden repo drops out of the sidebar Repos index, the app-view nav (its
promoted `pages` with it), the Repos grid, and the activity crawl, so it stops
costing a per-branch scan as well as attention. It keeps `estate: true` and
every field it declared, and opening it by address still works. The **Hide from
the estate** row on the repo actions menu writes the list from the sidebar row,
the card, or the Hidden row alike, and the Repos view carries a folded
**Hidden** section whose count is the only thing visible until it is opened:
one line, and a Show button per row, since a list you cannot undo from is a
trap. The write leaves a local override behind that retires itself once the
config crawl agrees, the same self-retiring idiom the Unfiled rows use, so a
just-hidden repo does not reappear for a pass and read as a failed write.

It does not compete with `conventions: 'optout'` below, though the questions
sound alike. Optout is the repo's own statement that it is not part of this
estate; `hidden` is the dashboard being told what to draw, for a repo that
still is. Setting `estate: false` instead would drop the repo's group, note,
icon and order on the way out and make coming back a reconstruction.

**Unfiled: the rest of the account**, below a rule at the foot of the grid. The
membership filter above discards most of what the load already fetched, since
`gh.repos()` returns every repo you own and the cards keep only the opt-ins, so a
repo you own but have not filed was visible nowhere except the Add form's
`datalist`. That models non-membership as "not yet added" and leaves the decision
itself unrepresented: there was no way to say *I looked at this one and it does
not belong here*.

The rows split three ways, on **two independent axes**, so neither subsumes the
other:

| State | Set by | Asks | Group |
| --- | --- | --- | --- |
| archived | GitHub | is this finished? | Retired |
| `conventions: 'optout'` | the repo's `.web-tools.json` | is it on my dashboard? | Set aside |
| neither | | undecided | Unfiled |

A live repo can be off the dashboard, which is why both exist. `archived` is the
cheaper of the two and the only one needing no file in the repo, which is what
makes it reachable for a 2018 repo that will never carry a `.web-tools.json`; it
also rides in free on the list call already being made. Undecided sorts newest
push first and stays open; the two settled groups fold, because an undecided list
that never empties is a second inventory and one that drains is a work surface.

Each row carries the three outcomes it actually has. **Adopt** routes into the
existing Add form prefilled, so membership keeps one implementation and `group` /
`note` stay available. **Set aside** writes `conventions: 'optout'`, the field
[`kits/portable-align.js`](../lib/kits/portable-align.js) has graded since PR #222
and which until now had a schema entry, a reader, and no way to set it. Both go
through one `patchRepoConfig`, so both write the **repo**.

**Retire is a link out, and deliberately not a write.** Deleting needs a
`delete_repo`-scoped token and this one is `repo`-scoped on purpose (the view's own
"Get a token" link says so), so widening it for a twice-a-year action would put a
delete-capable credential in `localStorage` and into every tossed page. GitHub's
danger zone also offers Archive above Delete and demands the name typed, which is
better space in front of the decision than a dialog here would be. So the page
names the destination, GitHub performs the act, and the next load tells the truth
on its own: because `archived` arrives in the list call, a repo archived on GitHub
moves itself into Retired with nothing stored here. An archived row is muted, keeps
its browse jump (the point of archiving rather than deleting is that it stays a
reference shelf), and drops both write actions rather than offering what the API
will refuse. The foot of the section carries the other end of the same errand, a
link to `github.com/new`: create there, adopt on the row, it gets a card.

One wrinkle the writes share: a config lands in the repo instantly but reaches
these rows only through the config cache, which rebuilds asynchronously. A local
override carries the row in the meantime and **retires itself once the cache
agrees**, rather than being cleared per load, which would bounce a just-filed row
back to Unfiled for a pass and read as a failed write.

The same population is what the tracker's *session-start nudge for unconfigured
repos* addresses from the agent side. Both read `conventions: 'optout'`, so keep
them on that one field rather than growing a second vocabulary.

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

**Activity** gathers the estate's own motion under one header-nav stop. Five
panes on a segmented pill (the shared internal-tab style), switching at every
width, each keeping its own view key so `?view=activity`, `?view=sessions`,
`?view=guides`, `?view=chats`, and `?view=routes` deep-link directly. Where a
pane reads a cache, its **age pill** rides the pill row: it states the age at
every width and opens the **State** view, where that cache's Refresh lives
beside its cost and its throttle. It replaced an as-of reading that was hidden
below `sm` next to a Refresh button that was not.

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

### Routes (`?view=routes`)

**Routes** is the fifth pane and the first keyed to something other than git.
Branches, Sessions, Guides and Chats all answer *who was working, and when*: the
unit is a piece of work. Routes answers *on what*: the unit is a destination in
the app. The estate had no reading of that at all, though the UI layer is where
most of the work lands, and the app could not previously say what its own
destinations were: `VIEWS` in `show-repo.html` dispatches and stamps them and
carries no label, no gloss, and no idea which code draws the screen.

[`docs/app-routes.csv`](app-routes.csv) is that statement, one row per
address: what it is for, which group it is reached from, and the files that
render it. `tools/test/app-routes.test.mjs` holds it to the `VIEWS` table both
ways, so a route cannot exist in the router and not the manifest, and every
declared file has to exist. The word is overloaded on purpose-free grounds and
worth stating once: these are **app routes**, addresses in this page;
[`docs/routes-routes.csv`](routes-routes.csv)'s rows are **toss routes**, a content type
mapped to a renderer page. Different targets, so neither describes the other.

The pane reads the manifest and one `commits?path=` call per declared carrier
against the hub, ranks the rows freshest first, and joins each to the open pull
requests whose files it touches. Nothing is cached and nothing is crawled: these
routes belong to one page in one repo, so the read is about two dozen requests
and is taken live, which is also why this pane has no age pill.

**Every read is at the ref the code came from, not at main.** The manifest and
the `VIEWS` table are held in lockstep at a ref, so reading the code from one
and the manifest from another breaks the invariant the gate protects. Pinning
the manifest to main did exactly that on the first preview of the branch that
added it: the pane reported `GitHub Error 404` for a file that did not exist on
main yet, and the failure read as an auth problem even though the rate figure in
the same message showed the token had worked. `?use=` is the app's standing
answer to "which ref am I running" (the ref switch reads the same key) and a
`#gh=` toss injects the addressed ref under that key through toss-render's
params shim, so one read covers the deployed page, a `?use=` preview, and a
tossed branch alike. The commit dates ride the same ref, so the whole pane
speaks about one tree, and a non-default ref is shown as a chip in the header
rather than left to be inferred. The error names the address it could not read,
which is what the first diagnosis lacked.

**The join is files, and files are coarser than routes.** That is the pane's one
real limit and it is shown rather than filed:

- **The shell is excluded.** `app/index.html` holds the router,
  the header, the sidebar, and every pane's outer markup, so a commit to it
  would date every route at once. It gets a row of its own at the foot instead,
  because leaving it silently out would leave a reader wondering why the busiest
  file in the app never dates anything.
- **A wide file cannot be a row's reason.** Nine routes render from
  `estate.js`. A file carrying three or more routes still dates a row that has
  nothing narrower, and the row says `shared` beside the date, so a borrowed
  reading is never mistaken for a claim about that route in particular.
- **A blank `files` is a finding.** Three routes (landing, pages, project)
  render from components defined inline in the shell and so have no code of
  their own. The header counts them. That count is a reading of the app's shape,
  which is why the manifest grades `files` as `counted` rather than required.

A row's label opens the route through the shell's own dispatcher, so it is the
same navigation a header tab performs. Only a bare `?view=<key>` is offered: an
address carrying a placeholder (a repo, a file path, a promoted page) has no
single destination, and those rows show the address as text rather than a link
that would land nowhere. Such an address is also trimmed to its `?view=` half on
the row, with the full shape in the expanded detail: `?view=app&appRepo=<owner/
repo>&appPath=<path>` wrapped to two lines on a phone to say what the row's tone
now says. The `shell` group (App view, Public browse) reads muted, because
neither is a screen this app draws.

**Rows fold into nav stops, which is the level the router flattens away.** The
app addresses sub-tabs two ways: six are their own `?view=` key (Activity's
five, Lists' two, Stage's two) and twelve are `?view=<parent>&tab=` (Map's
eight, Project's four). The reason is archaeological rather than designed. Each
flattened key used to *be* a nav stop and kept its key when its pane moved under
another, so saved links keep resolving; Map's tabs were never separate
destinations and were born as `&tab=`. A view key that outlived its stop is a
fossil, and a flat list rendered fossils at the same rank as live destinations,
which is what read oddly. Each route therefore declares its `stop`, held to
`estateNav` by the gate, so the flattening is stated here rather than inferred,
and the header counts it once as a figure rather than repeating a sentence on
every folded stop. A stop owning one route is not a grouping and renders as a
plain row.

**The join runs both ways.** A route row lists the pull requests open against
it; a **Branches** row carries a chip strip of the routes it is working on, off
the same manifest, the same PR file lists, and the same narrow/wide rule, so the
two readings cannot disagree. That shared half (the manifest plus one
`pulls/N/files` per open PR, about six calls) loads on either pane, so visiting
one warms the other, and the Branches pane skips the per-carrier dating it has
no use for. A chip taps through to its route. Rows from every other repo carry
nothing rather than an empty strip: routes are one page in one repo, and a row
that cannot be answered should not look like a row with no answer.

**The grouping takes its order from the ranking rather than recomputing it.**
That is what keeps freshest-first true at both levels at once: stops appear in
the order their freshest member does, rows keep their rank order inside. An
earlier draft grouped by a fixed manifest order and cost the pane its headline,
an hour-old route sitting below a six-day-old one because they were in different
sections. Deriving the group order from the rank is what makes grouping safe.

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

**Scope** picks which branches to show, and the chips carry their counts off the
full list, so the row doubles as a running count of the estate's branches. Four scopes read
the scan's `group` values; **Abandoned** reads the PR index instead, which is
why it is a chip rather than a fifth group:

| Scope | Shows | For |
| --- | --- | --- |
| **Open** (default) | an open PR, or `stranded` | work in flight |
| **Recent** | `active` | what was touched lately, unjudged |
| **Stranded** | `stranded` | content that exists nowhere on the default branch |
| **Landed** | `landed` | the cleanup pass: content already on the default branch |
| **Abandoned** | a PR closed unmerged | work decided against, still in the list |
| **All** | everything scanned | the whole list |

**Abandoned is the scope the content scan could not have.** Its verdict is
landed-or-not, and abandoned work is landed nowhere, so a closed-unmerged branch
sat among the stranded looking exactly like work still waiting to be finished.
The two answers are opposite: stranded asks to be rescued, abandoned asks to be
deleted. It is appended to the chip row rather than slotted beside Stranded,
where it reads better: the row scrolls sideways on a phone, so a chip inserted
mid-row pushes Landed and All off the screen and moves every position a reader
had learned. Like Open, it ignores the window, since a branch abandoned in May
is as abandoned as one abandoned yesterday.

Open is not "recent", which is why it is its own scope rather than a date sort:
a branch merged via a merge commit is an ancestor of the default, so it holds
nothing ahead and would stage to nothing, yet its commit date still reads
recent. Gating on open-PR-or-stranded drops the flood of merged-but-undeleted
session branches.

**Landed is the scope that had no home before.** The crawl always scanned and
stored it (`state/activity.json` holds every branch it reached, classified, with
the content counts), but this view hard-filtered it away in one line, so the
per-repo **branch review** was the only place a landed branch appeared, one repo
at a time. Exposing `group` as a control is what turns this into the estate's
one branch list; see "The branch review" for what stays repo-scoped (the live
uncapped scan, a repo outside the estate, the in-app compare).

Each row is **highlighted by PR state** (a colored left rail plus faint tint)
and carries a **caption-style link cluster**. The state is what became of the
branch, in six answers rather than two: green for a ready open PR, amber for a
draft, blue for one that **merged**, red for one **closed unmerged**, and muted
for a branch never proposed at all. The sixth is the honest one, `PR ?`: the
crawl's PR index reaches back only so far (below), and a branch older than that
gets no claim either way.

Until 2026-08-15 the row read the open-PR list alone, so "no PR" meant "no OPEN
PR" and every merged branch, which is most of the Recent window since branches
are not deleted here, was reported as though it had never been proposed. Two
readings of the same branch disagreed inside one app: the row said no PR while
the detail takeover, which reads `state=all` per branch, showed the merged one.
The list now reads a per-repo index of the same shape (`gh.branchPulls`), so the
answer costs one call per repo instead of one per branch. The `#`-number links
whichever PR the row is about, merged included, and its mark carries the state,
with the word beside it where the width allows and a `+N` when a head has had
several PRs over its life. `New pull request` in the row menu is gated on the
absence of an **open** PR, so a merged branch that kept going can still open one.

**The action line is two columns, not one wrapping row**, and that is what keeps
the arrows out of trouble. They used to be the last item in a wrapping flex with
`ml-auto`, so the moment anything ahead of them overflowed (the route chips, on
the one repo that has them) they dropped to a line of their own and sat there
right-aligned against nothing: a reader loses a row's shape when its rightmost
fact moves. The left box wraps within itself and the right box never shrinks, so
the **arrows hold the right edge of the first line at every width**.

That also settles the chips without a breakpoint. They stay inline on a desktop,
where the left box has room to spare and the alternative was more of the empty
space this layout already has too much of, and they fall to a second line on a
phone, where they do not. One rule, two behaviours.

**Inside the left box the order runs GitHub, session, files, Stage, then the
chips, and that order is load-bearing.** The three middle controls are the row's
own and sit to the LEFT of the chips: with the session mark after them, the one
repo that has chips carried it halfway across the row while every other row
carried it at the left, and a mark a reader scans down a column for cannot move
with a neighbour's width. The session slot is **reserved rather than collapsed**
for the same reason, so a branch with no resolvable session costs one glyph of
empty space instead of pulling the two controls after it out of column.

The GitHub button is **the mark alone**. The word "GitHub" beside a GitHub logo
said nothing the logo had not and cost about fifty pixels on the row where pixels
are scarce. The caret stays, since that is what says "menu" rather than "link",
and the title carries the sentence.

**Files** is the route the row was missing. The branch name opens the detail
too, but on the Guide where there is one, so "show me what changed" cost a tap,
a read, and a second tap; this is that destination on its own glyph, the one the
detail's file deck already wears. It carries **two numbers, and the same two on
every row**: how many files this branch changed, and how many of them are new.
Both are free, from the compare the crawl already runs for each open PR's
ahead/behind pair, and from the scan's own compare where it reached the
branch: every file in either response carries a status and a line count, and
`BranchStatus.fileStats` reads them. A row with stranded content adds one more
thing, the **missing** count in amber, which opens the pane already filtered to
those files.

Each count opens a **card**: one for new files, one for changed, one for missing,
and one for each of the ahead/behind arrows. The card is the reason the row can
afford to show so few numbers. It is a real
panel rather than a `title` attribute, which is what a title cannot be: one
string, in the browser's own type, at the browser's own delay, with nothing in
it a reader can open. Three bands:

1. **The head:** the count and the `+/-` line total, both describing *this
   class* rather than the branch. The crawl's stored count answers first and the
   listed files answer once they land, so the two numbers always come from one
   source.
2. **The shape**, and it needs no call at all: how many of each extension and
   each top-level folder, capped at six and biggest first. `BranchStatus.fileStats`
   builds it during the crawl and it rides in the cache, so the card is useful in
   its first frame. An extensionless file reports `(none)` and a repo-root file
   reports `(root)`, named rather than dropped, since a branch that only touches
   root config is a real shape. A dotfile is extensionless by this reading, which
   keeps `.gitignore` out of the histogram as a bar of one.
3. **The files**, from the compare, fetched when the card opens and swapped in
   underneath, each carrying its own `+/-`. The folder is muted and the filename
   is not, so a truncation eats the half that matters least. **A row opens its
   own diff in place**, because the compare embeds the unified patch beside the
   file list: the card is already holding every diff it can show, and expanding
   one asks nobody for anything. The patch renders in the same tinting the
   file-review card uses, capped at 400 lines, since the pre-build's own diff is
   three lines of a quarter megabyte each and would freeze the panel drawing
   them. A small out-arrow keeps the route to the file on GitHub.

**The missing card is the odd one, and it is the one that needs no fetch.**
`missing` is the scan's verdict about paths rather than a status in a diff, so
its list comes from the crawl's own `missingPaths` and is complete the moment the
card opens; the diff, when it lands, only adds line counts and a patch to the
rows it recognises, and a path it does not name keeps its row and claims nothing.
Its digest is built client-side from the same `BranchStatus.fileKind`, so the
three histograms cannot disagree about what an extension is. It also carries one
line of prose saying what the word means, since the other two classes name
themselves and this one is a verdict: a card listing files under a bare word
nobody defined is the tooltip problem again in a nicer box.

It leans on `BranchBrief`'s own sixty-second memo rather than caching anything of
its own, which is what keeps the read affordable: hovering one row twice is a
single call, and opening the branch detail afterwards is none, since the takeover
reads through the same memo. That is also why **paths are not stored in the crawl
cache**. A path list per branch across the estate is hundreds of kilobytes read
on every Activity load, spent to save a call on the rows a reader actually opens.
A no-merge-base branch has no compare at all, so its card shows the shape and
says plainly that there is no diff to list.

Hovering opens a card on a fine pointer, tapping opens it everywhere, and its
footer opens the branch view's Files pane. Removals and renames stay out of the
row and out of the cards, in the pairs' plain hover text, since a scanned list
carries two classes and a card is opened one at a time.

**A card's read is written back into the row it was opened from.** The compare
it fetches is seconds old against a crawl that may be hours old, so its numbers
are simply better: a branch has usually gained files and commits since. Without
the write-back, a card opens over a row saying 62 changed and reports 71 itself,
which is two readings of one branch a tap apart, disagreeing. `absorbCompare`
patches the counts, the shape digest and the ahead/behind pair into whichever
cache entries the row derives from, and the branches pill grows a small dot
naming how many rows have outrun the age it states.

Two limits, and both are deliberate. It is **in memory only**: the crawl owns
`state/activity.json`, and writing the private registry from a hover would put a
commit-shaped cost on a gesture meant to be cheap, so this lasts the visit and
the next crawl makes it durable. And it does **not touch the verdict**, since
landed / differs / missing is a function of two trees that a compare cannot
supply; refreshing the counts around it and leaving it alone is the honest
half-update rather than a stale verdict quietly restamped as fresh.

**This deliberately overlaps the branch detail**, and the overlap runs in the
card's favour on cost: the detail fetches a file's content per card opened, while
this one fetched every patch at once without meaning to, as part of a compare it
needed anyway. What the detail still owns is the full dossier per file (the
new-file and base-file tabs, the annotations) and the registry grouping. If the
overlap keeps growing, the honest next move is to put the dossier in the card
rather than to keep two readings of one branch.

**The palette says one thing each.** Neutral is changed, green is added, amber
is stranded. Green used to tint the whole control when the scan found nothing
missing, a signal the absent missing count and the Landed chip were already
carrying twice over; freeing it is what lets a file-plus glyph read as a
different thing from a files glyph at eighteen pixels. Spacing carries the
grouping: four pixels binds a glyph to its number, eight separates the two pairs
inside the control, twelve separates controls, without which a row with two new
files and two missing ones read as `2 2`.

The landed **ratio** rode here until 2026-08-18, so a scanned row read
`28/80 landed 11 missing *` while an unscanned row read nothing at all: four
mono elements on the busy rows, none on the quiet ones, and no column a reader
could scan down. A ratio is a verdict and this is a route, so the verdict moved
to where there is room to state it whole (the hover, and the Files pane's own
strip, which names all three classes) and the row kept the counts every row can
carry plus the one flag worth raising unasked. A no-merge-base row keeps its
numbers rather than blanking, since the mark beside them already says that every
number on that row spans more than the branch. A cache written before the
breakdown existed shows its total as one number and claims no split, rather than
printing a split of zeroes.

**That mark reads `no merge base`, and until 2026-08-19 it was an asterisk.**
One amber character, with its entire meaning in a `title` attribute, saying
something a reader cannot afford to miss: that every number beside it is
measuring something wider than the branch. A tooltip never appears on a phone,
so on a phone it said nothing at all. Thirteen characters is a real cost on this
row and it is the right trade, since the alternative was a caveat nobody could
reach. The general rule it is a case of is now in
[HTML-STYLE.md](HTML-STYLE.md), and [`scripts/stranded-titles.py`](../scripts/stranded-titles.py)
counts the remaining cases.

**Stage** sends the files this branch changed to the Stage (one `compare` call,
removed paths skipped), appended and deduped onto any working stage at
`ref=branch`, so an item reads the branch's version and the Stage's Diff tab
compares it back. It was the row's original name-tap action, then a row in the
GitHub menu, and a control of its own since 2026-08-18: it acts on this app's
own Stage, so a menu whose every other row opens `github.com` was the wrong
place for it. Its spinner rides in the button that was pressed rather than in a
separate label at the head of the line.

The **Session** that authored the branch is the `claude.ai/code/session_…` link
read from the branch's own commit trailer, with the PR body's footer as
fallback; a per-repo **Branches** drill-down sits at the row's right (whole-tree
browse lives there).

**The arrows are commits, and both of their cards are free.** They state how
many commits the branch has that the default branch does not (green, muted at
zero, which flags a branch with nothing left to stage) and how many the default
has that the branch does not. Neither is lines and neither is files, a thing they
said only in a `title` attribute, which never appears on a phone, so the pair read
as two bare numbers a reader could reasonably take for either.

The **ahead** list is the compare's own `commits`, which is exactly the set and
which the file cards already fetch. The **behind** list is the newest commits on
the default branch, which the crawl has always fetched once per repo for its own
moved-or-not gate (`recentCommits`) and never read for anything else: main's side
was sitting in the cache unread the whole time. That is why both arrows became
cards at once rather than one now and one when someone paid for it.

Behind is answered twice, and sharpens: before the compare lands it takes the
newest `behind_by` of the cached log, which is exact while the default branch is
linear and costs nothing; once the compare is in hand it takes everything newer
than `merge_base_commit`, which is exact regardless. A branch that forked before
the cached window gets a card that says so and keeps its count, rather than an
empty list under a number. `ACTIVITY_RECENT_COMMITS` rose from 12 to 40 on
2026-08-19 for exactly this: the estate routinely runs branches 20 to 40 behind,
and the wider page is the same call and about 5 KB per repo.

Each row's right edge states the branch's **lifespan**, first commit then latest,
as `15 days → 2 hours`, which answers "how long has this been open" beside "when
was it last touched". Neither costs a call: the crawl's compare already lists a
branch's unique commits oldest-first, so its start is `commits[0]`
(`BranchStatus.firstCommitDate`) off a response the scan holds anyway. The
start is dropped when it rounds to the same label as the tip (a same-day branch,
where `2h → 2h` is noise) and when it cannot be known honestly: a branch with no
merge base has no unique-commit list, and a compare past GitHub's 250-commit cap
reports a total larger than the list it returns, so the oldest entry present is
not the first. Those rows show the tip age alone.

Where the scan reached a branch it also measures a **content verdict**: of the
paths the branch uniquely touched, how many hold content the default branch has
now. It is what makes a Landed row actionable rather than a claim, and it costs
nothing, since the crawl stored it. The row shows the verdict's one urgent half,
the missing count; the whole of it is one hover away and lives fully in the
branch view's Files pane.

**Three classes, and the third one had no name.** A touched path is **landed**
(those bytes are on the default branch, at this path or moved anywhere in the
tree, or the branch deleted the path and so stranded nothing), **differs** (the
default branch holds the path with other bytes, which is either unlanded edits
or the default's own drift since, and separating those costs a history walk the
scan does not make), or **missing** (neither the path nor the bytes, the only
class that says deleting the branch would lose something). The three sum to the
touched total. Until 2026-08-18 the row showed `28/80` beside `11 missing` and
named nothing else, so a reader could only read the pair as a failed
subtraction. `landed` now rides the ratio, since a bare `28/80` does not say
which direction is good, and the full partition is in the hover.

**Both halves are routes into the files.** Tapping the count opens the branch
detail on its **Files** pane; tapping `11 missing` opens it filtered to those
eleven, as diffs a reader can actually read. What they replaced was inert text
whose tooltip pasted up to twelve missing paths under a sentence describing the
paths that were *present*, so the wrong list sat under the wrong clause and
nothing in it could be opened. The counts and the filter live on in the pane
itself, which re-measures them rather than only rendering what it was handed;
see [branch-overlay.md](branch-overlay.md).

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
flat, an out-arrow on anything leaving the app), and its hover behavior.

**Every row in it opens `github.com`, with one exception, and the rule is what
put Stage on the action line.** The `#`-number, the session mark, the files
route and the Stage all stay outside: none is GitHub navigation. `Copy branch
name` is the exception that earns its place, since a branch name is long,
hyphenated, and typed into git commands and `#gh=` addresses with no address bar
to lift it from, which makes it the ADDRESS of what the other rows open rather
than an action somewhere else.

Each row opens with its **repo chip**, the repo's own declared icon plus its
short name. It is a control, not a label: it opens the repo's whole grouped
menu in the sidebar's panel, so the branch's destinations and its repo's are
one gesture apart and the control is learned once. The icon is the mark the
repo declares for its estate card, so a row is identifiable before its name is
read.

It reads the registry's **activity cache**
(`state/activity.json`, below) in one GET, so the whole estate renders without a
per-repo API fanout: the branch join to its PR is `pr.head === branch`, against
two stored lists (the open PRs, which carry the guide body, and `branchPRs`, the
lean any-state index that says what became of each head), and the session link
rides the cached PR, so nothing is fetched per visit. `prReach` travels with the
index: the read is capped at 100 PRs per repo, and the oldest `updated_at` it
reached is what lets a row distinguish "no PR" from "past what this can see". Landed and
stranded older branches are the per-repo branch review's job, not this "what's in
flight" read. The Repos view borrows the same cache for a **freshness rollup** on
each card (branch count, stranded count, abandoned count, open-PR count, with the
branch count a one-tap route into the branch review and the abandoned count a
one-tap route into the Abandoned scope). That last badge is computed in the view
from the same rows the pane's chip counts, not counted in the crawl over the full
branch list: one word, one derivation, or the card would report a larger number
than the chip and make a reader distrust both. The crawl is forced from the State view through the
shell (`refreshActivity`); a normal visit kicks it throttled. The internal view
key stays `activity` (and `?view=activity`), so existing links resolve.

That forced crawl runs for tens of seconds across the whole estate, so it
**reports itself**. While it runs, the header's as-of readout becomes
`Refreshing activity · 4 of 11 repos` with the repos currently in flight named
after it (the pool runs two at once, so it is a list), over a determinate bar
whose only input is repos finished over repos total. Nothing finer is counted
and no in-flight fraction is estimated: per-repo cost varies by an order of
magnitude, and a sub-counter ticking several times a second is the churn this
replaces. The numbers come off the shell's **progress channel**, a slot per cache
key, which all three crawls write and every reader draws: this pane, the
Sessions pane, and the State view's rows. Pressing Refresh in any of them lights
the others, and nothing holds a second copy of the reading. The verb and the
unit ride in the slot rather than being inferred by whoever draws it, since only
the crawl knows whether it is counting repos or session records.

**One pass, and it was two.** The refresh shipped split, a quick pass (commits,
PRs, branch dates) so the list landed in seconds and a scan true-up behind it.
The call log priced that: `deep` gates the **scan alone**, so the second pass
re-fetched every cheap read the first had just made, and a refresh of 11 repos
spent 66 calls, a fifth of the run, asking for the same commits and the same two
PR lists twice inside a minute. The seconds it bought back were real and did not
cover that, so the Refresh button and the arrival kick each run one crawl,
scan included. The quick shape stays supported because one caller still wants
it: `goGuides` warms this cache for a pane that needs the repo list and the open
PRs and no branch verdicts at all. Retired 2026-08-17; the run record still
carries `pass: 'quick' | 'scan'`, since those two differ by an order of
magnitude in cost and averaging them would mean nothing.

**Every cache read that feeds the commit is FRESH** (`gh.get(path, GH.FRESH)`),
and the split refresh is what forced it. GitHub answers an API read with
`Cache-Control: private, max-age=60`, so the scan pass, running seconds behind
the quick pass, was handed the very copy the quick pass had just replaced: it
folded onto a stale base and then failed `409 does not match …` on the dead sha
it had been given along with it. The 409 was the guardrail rather than the bug,
since a matching sha would have meant one pass silently reverting the other. The
same rule now covers the config and sessions crawls, which read a cache and
write it back the same way. Measured 2026-08-16; the first bite of this is on
`GH.FRESH` in lib/gh-api.js.

**FRESH was not enough, because the layer under it is the API's own lag.** The
409 came back on the next run with the browser cache out of the picture, and the
crawl's own call log named it: six PUTs to `state/activity.json` in one refresh,
`422, 409, 409, 409`, each retry carrying a sha a fresh read had just supplied.
GitHub's contents API is read-after-write **eventual**, so a read seconds after a
commit can be answered by a replica that has not seen it, and no cache header
reaches that. The answer is not a longer retry but a better source: this page
knows what it wrote and what sha the write returned, so
[`lib/kits/last-write.js`](https://github.com/mehrlander/web-tools/blob/main/lib/kits/last-write.js)
notes each committed document and `readForFold` reconciles the next read against
it, newest **document stamp** winning rather than the clock. The sha then rides
into `save(path, doc, msg, { sha })` and no read is consulted at all. The retry
behind it got more patient too (six attempts, backoff to seconds), and its
recovery read got cheaper: it buys the sha from the parent directory's listing,
about a kilobyte, rather than re-reading a 370 KB cache to look at forty
characters.

The crawl **commits only when something materially changed**, which
used to make a productive refresh and a no-op refresh end identically, so the
run closes with a toast, `Activity refreshed · 3 repos changed` or `No activity
changes · 11 repos checked`, and names any repo the crawl failed on (previously
a `console.warn` and nothing else). The count comes from
`RepoActivityCache.changedRepos`, which `cacheChanged` is defined in terms of,
so the number reported and the gate that skipped the commit cannot disagree.

**A verdict is carried when neither of its inputs moved.** A branch's
landed-or-stranded call is a function of exactly two things, its own tip and the
default branch, so a pass where neither moved is re-deriving an answer it
already has. The crawl now hands the scan the previous rows and the default
tip it judged against (`scan.mainSha`), and `BranchStatus.needsScan` decides
per branch: the branch moved, or main moved, or there is no stored row, or the
stored row is an error. When nothing needs scanning the default tree is not
read either, so an untouched repo costs nothing. The same pair gates the open-PR
compares, since `main...head` cannot move while the PR's `updated_at` and main's
tip both hold.

One case trades exactness for cost on purpose, and it is the one the log made
impossible to ignore. web-tools' history was rewritten, so every branch older
than the rewrite **404s** on compare and falls into the fallback: a 50-commit
read plus a second compare, three calls to re-derive a verdict about dead
history, times thirty branches, on every crawl. Those rows carry `noBase`, and a
`noBase` row is now carried while its tip holds even when main moved. Measured
2026-08-17: 98 of one refresh's 145 calls were that one repo's dead branches.

**And the reading that is still open.** The run after the carry rule landed came
back with **86 of its 183 calls at 404**, spread across every repo and mostly on
`compare`, including one repo (wa-bills) paying 93 calls of the run to re-derive
branches that answer 404 every time. Two of those calls are the same shape and
mean opposite things: GitHub answers `compare` with 404 both when there is **no
common ancestor** (a real verdict about two histories, which the scan handles)
and when a ref or a permission is missing (a fault). The log could not tell them
apart, because the traffic ledger never touches a response body. It does now, by
one narrow route: `gh.req` already parses the error message, so it hands it to
the ledger through `window.__noteApiError`, and a failed row in the call log
carries `msg` and the rate-limit remaining at that moment. The next run says
which kind of 404 it hit; until then the shape of the failure is recorded and
its meaning is not.

Beside it, the same cost lesson one level down: an **errored scan row is
carried** like a `noBase` one, and a bounded few (`ACTIVITY_ERROR_RETRY`, three
per repo per crawl) are retried, so a transient failure heals within a few
crawls while a permanent one stops costing the estate anything.

**What the call log bought, in its first three readings.** The crawl's own log is
the instrument for its cost, and the first run it recorded (2026-08-17, 373
calls, 58s) named three things prose had not. Its top row was 79 GraphQL posts
for 75s of request time, three per repo where two were `branchesDated` and
`branchSessions` walking the same refs connection with the same page size: they
are one call now (`gh.branchesDatedSessions`), since the crawl has always wanted
both. Its heaviest row by bytes was eleven reads of `state/activity.json` for
7.2 MB, of which the conflict recovery's share is gone (it buys the sha from a
listing) and the views' share is gone too: the crawl hands its document along on
the `web-tools:activity-refreshed` event, so a listener that used to re-read
370 KB now reads nothing and a detail-less event still falls back to reading.
Its third reading was the scan itself: with the split gone, 69 compares and 30
commit reads stood out as one repo re-deriving verdicts nobody had asked it to
re-derive, which is the carry rule above. And a run that died on a phone at
`Load failed` after 300-odd successful calls bought one retry for a **dropped
connection**, reads only, in both `GH.req` and `gh.graphql`: a rejected fetch is the network rather than GitHub, an HTTP error
is not retried because the answer will not change in 600ms, and a write is never
retried because it may have landed.

The cache is what makes this affordable. The branch review costs ~2 + 2N calls to
scan N branches, so scanning every repo live on a dashboard is a flood.
Instead `refreshActivityCache` crawls each estate repo on a ~30m per-browser
throttle and stores the capped landed/stranded scan plus cheap summary signals; the branch review, the
estate cards, and this view all render from the stored result. The per-repo
branch review is **cache-first** too: with a token it renders Landed / Stranded
from `state/activity.json` and marks the header `cached`, running the live fanout
only on an explicit Refresh or where the cache has no coverage. Same scan math
either way (`lib/kits/branch-status.js` `scanBranchLive`, shared by the view and the
crawl). Source-of-truth rule as ever: the cache is derived and may be briefly
stale; Refresh re-scans live.

**Two gates decide what a pass actually pays for**, and they answer different
questions. The **scan gate** has been there since the crawl was written: a repo
whose `pushed_at` has not moved since its last `scannedAt` cannot have changed a
branch verdict, so its stored rows carry forward and the tree reads go where
something moved. The **watermark gate** is newer and covers the rest of the
pass. Measured 2026-08-21, a run over ten repos spent 231 calls, of which 168
were the scan the first gate already rations; the remaining ~62 were four calls
per repo fired unconditionally, so a completely quiet estate still paid them.

A repo is **quiet** when both its `pushed_at` and its **PR watermark**
(`gh.prWatermark`, one row of the same `pulls?state=all&sort=updated` list
`branchPulls` reads a hundred of) match what the last successful crawl recorded.
A quiet repo is skipped whole and carries its stored entry forward through the
same `buildCache` path a failed repo takes. A quiet estate therefore costs one
account listing plus one watermark per repo, about a dozen calls, which is what
let the throttle come down from twelve hours to thirty minutes: the floor fell,
not the ceiling. A repo that moved still pays its summary, and one that was
pushed still pays its scan.

**Both halves are required, and the second is the one to keep.** `pushed_at`
cannot see a pull request opening, merging or closing, and this cache stores
exactly that in `openPRs`, `branchPRs` and `prReach`. Gating on pushes alone
would freeze every branch row's PR verdict until something happened to push,
and nothing on screen would look wrong. The watermark over-reports instead
(`updated_at` moves on a comment or a review), which costs a crawl that then
finds nothing material and skips its commit. That is the direction a gate must
err in.

The watermarks live in `localStorage`, not in the cache, because the committed
file has no safe place for them: riding the material hash would restamp and
recommit a 700 KB file whenever anyone commented on a PR, and staying out of it
would mean a crawl never persists what it just learned, so the next pass sees
the same movement and never converges. A forced pass ignores the gate entirely,
since Refresh has to mean "go and look". `tools/test/activity-watermark-gate.test.mjs`
holds each of those clauses.

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

**Each count in that row opens a card**, the same panel the branch row's counts
open, with a third kind of body: label and number, biggest first. This row is the
branch row's twin and it had the branch row's old defect, which is why it got the
same answer. Four glyph-and-number pairs stated their *unit* only in a `title`,
and the breakdown behind each number had no other route at all, so on a phone the
strip was four bare digits. Turns splits into user turns and assistant messages;
tool calls into the per-tool histogram, which also owns the failure count, since
the amber failures pair is a subset of those calls rather than a fifth axis;
files into the busiest paths; and the token total into output, input, and the two
cache halves, with output leading because cache reads run two orders of magnitude
larger and measure the harness rather than the work.

**These cards cost nothing.** Where the branch row's cards fetch a compare, every
number here is already in the session record the pane is rendering, so the card
is complete in its first frame and no read can sharpen it. `rowCardSummary`
answers for this kind first and returns the stored count, which is also what
keeps the head honest: 62 files opened over a list of the two busiest is the
right reading, and a head that shrank to the list's length would be the mistake
the branch cards had to be taught not to make.

Two marks in that row are **dimmed twins**: a files glyph and a Claude star,
shown greyed when the record *could not say* rather than when there was nothing
to report. Each now carries a `&mdash;` beside it, the same dash this component
uses everywhere for "unknown", because a grey icon alone is indistinguishable
from a zero. Which of the two causes applies (a pre-schema-3 record, or a session
that never committed) is still only in the title, and that is the honest
remainder rather than a claim to have finished.

The sessions crawl reports the same way Branches does, off the same channel:
while it runs, the pane's age pill is joined by `Reading records · 18 of 120
records` over a determinate bar above the list. It is the lighter of the two
crawls (a tree read, then up to 120 record blobs six at a time, against a branch
scan per repo), but a cold pass is still tens of seconds, and it had a spinner
and one word. The Guides shelf gets neither line nor bar: it is assembled in
memory from one listing per repo, with no denominator worth drawing, so its pill
says `Reading…` and that is the honest whole of it.

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
case for "the current one". `refreshSessionsCache` runs it on a ~15m per-browser
throttle (lighter than the activity crawl, being a tree read and a few blobs) and
commits only when the folded rows materially changed. This crawl never needed the
activity crawl's watermark gate: being incremental by blob sha, a pass over a
store where nothing moved is one tree read and no blob reads at all.

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
[`docs/portable.csv`](portable.csv), whose prose parent is
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
repo in the cache would make this an account-wide scan mostly composed of
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

*Surfacing* indexes the primitives from [`docs/surfacing.csv`](surfacing.csv),
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
hub's committed [`docs/showing-mechanisms.csv`](showing-mechanisms.csv),
[`docs/routes-modes.csv`](routes-modes.csv), [`docs/routes-routes.csv`](routes-routes.csv)
and the frame in [`docs/routes.json`](routes.json). It opens with **Showing**,
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
[`docs/docs.csv`](docs.csv), in the same lazy shape. Two tables. The
**documents table**: every `.md`/`.json` under `docs/`, each with its subject,
its status (**living** claims current truth and is wrong when stale; **record**
preserves a moment and is wrong when rewritten; **measured** carries dated
observations and is corrected by re-probing), its **reach** and **words** (both
derived, see below), and its maintenance (authored or generated, with the
discipline that keeps it true); complete by construction, since
`tools/test/docs-registry.test.mjs` holds the folder and the table to exactly one
row per file. The table is navigated from a folder rail
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
(2026-08-07), off [`docs/owners.csv`](owners.csv); the `?tab=claims` key is
unchanged, the way `?tab=set` outlived "The set". It keys on claims rather than files, so trailing the documents it
read as an appendix, first open, then folded behind a count; a tab keeps the
documents on one viewport and gives the claims their own. The two registries differ in
how membership is decided, which is the whole reason they cannot share a pane: the claims are
curated and authoritative only for what they cover, while the documents are computed from the
folder and therefore complete. The documents half is public, like the other two tabs.

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

*Tests* is the same shape one axis over, from [`docs/tests.csv`](tests.csv):
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
pages card (thumbnail or live preview, an open link, a source link),
fed from a hand-curated manifest, [`docs/tools.csv`](tools.csv), rather than a
repo scan. Each entry is `{ path, title, note, icon }`, where `path` is a bare
hub path (`pages/diff-tool.html`, the hub at main) or a qualified cross-repo ref
(`owner/repo[@ref]:path`), the same grammar as a pages catalog entry. Public: the
hub is public, so the thumbnails (jsDelivr), the hosted render URL, and the blob
source resolve with no token; a cross-repo or off-default entry renders through
toss-render `#gh=` the same way the pages catalog does. The list is authored, a
sibling to `pins` and `stage.files`, maintained by hand
(`lib/alpineComponents/tools.js`).

### Files (`?view=search`): the central file surface

**Files** (`lib/alpineComponents/search-view.js`) is where files are found
**and read**. It is named for the thing rather than the verb, so it sits beside
Repos and Stage rather than reading as an activity next to them; the URL key
stays `search`. Three modes behind a pill row, all served by the same core the
sidebar finder uses ([`lib/kits/estate-search.js`](../lib/kits/estate-search.js),
one implementation, one cache, so a tree the finder fetched is a tree this view
never re-fetches):

| Mode | Reaches | Misses |
| --- | --- | --- |
| **Names** | the repo trees, at **any ref**, under any folder: browsed one level or matched recursively | nothing inside a file |
| **Contents** | full text, through the code-search API | non-default branches, a push the index has not caught, files over ~384 KB, past ten calls a minute |
| **Sessions** | the captured session records (the opening ask, every stored prompt and reply, the closing message) | anything not captured |

**Names is two readings of one corpus, and the query box is the switch.** Type
and it is a recursive match: every path under the scope that contains what you
typed, flat, stated relative to the scope. Clear the box and it is **one level**:
the folders and files sitting directly in the scope, folders first with the
count of blobs below each, a `..` at the top, and a folder row that descends
rather than opening anything. That second reading is the file tree, and it has
folders in it, which a recursive match structurally cannot: this is why an empty
query here is an answer rather than a miss, and why the two are one control
rather than a browse toggle beside a search box.

Both readings come off the same cached recursive tree
(`EstateSearch.names` and `EstateSearch.level`), so descending a folder after
the repo's first read costs no fetch at all. A level needs a repo, since a level
of "every repo at once" is not a place; under **All** an empty query stays the
recursive listing.

**The controls say what they are; the prose says only what is missing.** The
slot under them used to carry a paragraph per mode explaining what that mode
was, above controls already saying it. A Files pill over a repo rail over a
branch picker does not need telling. What no layout can show is a **limit**, so
that is all the line carries now: Contents keeps its caveats, Sessions names the
corpus it greps, Files says nothing at all except in the one state where its
button is dead. An error still surfaces whole.

Each scope is the control its subject deserves:

- **Repos are a rail**, single-select badges with "tap it again for all", the
  stage's Recent filter idiom. The set is small, fixed, and the thing switched
  most, which is the case a `<select>` serves worst: it hides every option
  behind a tap and reports the current one in a slot that reads as a form field
  rather than as a place you are standing.
- **The ref is a picker** (`lib/alpineComponents/refPicker`), a dated
  newest-first branch list with the default branch as its own row. It is the
  the estate's only branch picker as of 2026-08-14. It replaced the explorer's
  hand-rolled copy, and with it a silent defect: that copy read the browser
  store's `ensureBranches`, one uncapped-at-100 REST page in alphabetical order,
  so a repo past a hundred branches was quietly missing rows and the newest was
  rarely near the top. The picker paginates `branchesDated`. (`repo.js` keeps
  its own, in the non-inline template two demo pages mount; it is the last
  copy.) Its box
  **filters** rather than leads, which inverts the header ref switch on purpose:
  there you know the name of where you are going, here you are choosing among
  what exists. A tag, a sha, or a branch past the scan's reach is still
  reachable, offered as typed at exactly the point the list runs out of
  matches. The default branch is handed back as `''`, never by name, so a scope
  meaning "whatever this repo calls its default" keeps meaning that when the
  repo changes. It stands down under **All**, where there is no one repo to
  list and each answers at its own default.
- **The folder is the tap-through picker** (`pathPicker` in `dir` mode), rooted
  at the scoped repo at the scoped ref and opening *inside* it, since a one-row
  "pick a repo" level in a control two slots right of the repo rail is a tap
  asking a question with one answer.

Switching repos drops the ref and the folder with it: both name places inside
the repo you just left.

**Four filters over one list, not a search box with extras.** A query, a repo,
a ref, and a folder scope each narrow the same set, and none of the four is
required except in the sense that something has to be: **an empty query under a
repo or a folder is a listing**, so the button reads *List* rather than
*Search* and the same call serves browsing. Only an unscoped empty query is a
miss, since reading every tree the token can see is not a listing anyone asked
for, and that one dead state says so in its facts line rather than only greying
out its own button. (Under a repo, an empty query is never dead: it is the walk.)

**A bare arrival lists the browsed repo.** Nothing seeded is still a request,
and the request is "show me files". The view first shipped landing on an empty
box over an empty list with the button dead and no account of why, which is a
front door that reports nothing; it now scopes to whatever repo the shell is
browsing, at the ref being browsed when that is off the default, and lists it.
Only a bare arrival: a seed carrying a query means that query, over whatever
scope it named, every repo included. The repo select carries the scoped repo as
an option even when it is not on the estate, since a select holding a value it
has no option for renders blank, which reads as no scope while the list under it
is scoped.

The scope narrows before the cap is spent, and in Contents it rides the
API's own `path:` qualifier, so scoping narrows the search rather than the
results it already paid for. A row is stated **relative to the scope** and drops
the repo badge when a single repo is the scope, which is what stops a scoped
listing from repeating itself on every line and truncating the only part that
differs. The folder icon on a row scopes to it, and appears only where that
would go somewhere; the crumb trail above walks back out.

**A hit opens where it was found.** The shared viewer (`viewer.js`, embedded
with `bindStore:false`, the same way the stage previews a staged file) renders
the file beside the results on a wide screen and in place of them on a phone,
with a labelled way back. It opens in the mode the file's type deserves rather
than the tree walk's `raw`: markdown rendered, JSON as a tree, delimited data as
a table, everything else syntax-highlighted, and raw past 300 KB, since Prism
highlights synchronously and this estate holds megabyte files. It carries the file's true `origin`, so its GitHub /
Raw / CDN / toss links point at the file's own repo and ref rather than at
whatever repo the shell happens to be browsing, and reading a hit never switches
that repo. The position steps through the file hits, so a result set is walkable
without returning to the list. One button leaves for the repo's **Files** view,
for when the question is where a file *sits* rather than what it says.

**Why it is not the repo's Files view.** Every repo carries its own Files view,
and reading a file there means first choosing a repository and then walking a
tree. A file is rarely wanted as a position in a tree; it is wanted by name, by
folder, or by what is inside it, and this view answers all three, across every
repo at once, which no per-repo tree walk can. The per-repo walk was retired
with the rest of the duplication on 2026-08-14; `?view=files` aliases here,
carrying its `?path=` as the folder scope, and a repo's sidebar keeps a Files
row that hands this view the repo it is standing in.

**The screen is the address, not the query behind it.**
`?view=search&sq=&smode=&srepo=&sref=&spath=&sfile=` round-trips the query, the
mode, both scopes, and the open file, `sfile` being an `owner/repo[@ref]:path`
address. A screen with no query at all is still worth addressing, which is why
the row stamps on any field rather than on `sq` alone.

Every run re-executes; the caches underneath make re-matching cheap, and
**Refresh caches** (`EstateSearch.reset`) is the explicit way to force fresh
fetches, which is the view-level answer to "the results seem cached". **Show
more** raises the cap and re-runs, and appears only where more can actually come
from: the names lane holds the whole match set in memory, the code-search API
pages at 100 and this view reads one page, and the session grep returns
everything already.

### State (`?view=state`)

**State** (`lib/alpineComponents/state-view.js`) lists everything the estate
keeps derived, each piece with its age, what builds it, what the build costs,
and a Refresh where one is possible. It is the address the age pills open, and
the reason the four estate Refresh buttons could go.

**Branches and Sessions share one Refresh.** They are two crawls over two
sources into two files, and nothing about that changed: the branch scan reads
every estate repo on github.com (231 calls and about 28 seconds on the run
logged 2026-08-21) while the sessions fold reads one folder in the registry and
a blob per record that moved (4 calls, about a second). They are two rows for
that reason, each with its own store, throttle, history, and probe. What they
are not is two decisions. A session ending moves both at once, its record
landing in the registry and its commits landing on a branch, so a press that
refreshed one and left the other was asking the reader about a boundary that is
internal to the crawls. The two rows sit in an **Activity** group under one
button, which runs both, sessions first, and reports once; the throttled
background passes stay independent on their own intervals, since the cost gap is
a real reason to fetch one four times as often as the other. `GROUPS` in
`state-view.js` declares the group and names the shell method that runs it,
and `tools/test/state-view-groups.test.mjs` holds the fold and checks that the
method the view names is one the shell actually defines.

The row that reads `Branches` was `Branch activity` until the group arrived.
That label was the confusion in three words: **Activity** is the nav stop over
five views with Sessions among them, so a row wearing it read as *the* activity
cache and made the Sessions row look like a half that had been split off. Under
the group heading the row is Branches, which is what its own `used by` chip
always said.

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
(`toss-render.html#data=`). **Wrong 2026-08-21:** that sentence used to end "where
a reader who wants to pivot a table should go," and the data route has never had
grouping or aggregation in it. It is a viewer, five ways of reading the same
bytes. Grouping lives in the transform workbench's Pivot view
([`pages/transform.html`](../pages/transform.html)), a different page for a
different verb. Nothing is re-serialized, since the crawls already write a 2-space indent and the
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

**A crawl started here draws its own bar.** Taking the Refresh controls off the
panes moved the button to the reading that says whether to press it, and for one
release left behind the reading the crawl was already producing: the Branches
pane has had a determinate per-repo bar since the crawl learned to report, and
the same crawl pressed here ran for the same tens of seconds behind a spinner saying only
`Running…`. A control moved without its progress is a control made worse, so the
bar moves with it. Under the ages line each row draws `Reading configs · 31 of 44
repos`, `Scanning branches · 4 of 11 repos · chat-histories, home`, or `Reading
records · 18 of 120 records`, over a bar whose only input is items finished over
items total. All three read the shell's one progress channel
(`crawlProgress`, a slot per cache key), the same one the Branches and Sessions
panes draw, and **the crawl names its own verb and unit**, since only it knows
whether it is counting repos or session records, and whether the scan is
running. A crawl that fans
out unpooled (configs) names nothing in flight, because "every repo" is not a
reading. Nothing is smoothed between two ticks, for the same reason the pane's
bar smooths nothing. The bar spanned **two passes** for a day, since the activity
refresh ran quick-then-scan and a bar that filled, reached the end and started
over says the run has finished when it has not, which is the one thing a
progress bar must never say. The refresh is one pass now (the second was
re-fetching the first's cheap reads), so items finished over items total is
again the whole measure. The throttled background passes publish into no slot and so
draw no bar, which is the point: a list refreshing on its own schedule must not
grow a progress bar nobody asked for. The guides row has no bar either, having
nothing to count.

**Under the bar, the wire.** The bar says how far along; the line beneath it
says what the crawl is doing right now, as the request itself: `GET
repos/mehrlander/home/git/trees/main?recursive=1`, with this crawl's call count
at the right. It comes off gh-boot's traffic ledger, the same capped ring of
every request the page makes that the FAB's Traffic tab reads, tailed here
through its coalesced `traffic` event (one per 250ms, which is what makes a
per-request readout affordable on a crawl that fires hundreds). Three decisions
in it are the honesty: the path is **verbatim** past the host, since a
prettified path stops being the thing being reported and the host is the only
part that repeats on every line; the **method leads**, because a PUT here is the
commit, the one request in a run that changes anything, and it read as an
ordinary row without it; and the count is **this crawl's**, off a baseline the
slot stamps when it opens, since the page makes requests the crawl did not. A
status appears only when it is a failure, because 200 on every line is furniture
and a 409 is the whole story. Only api.github.com rows are shown: a font or a
CDN module arriving mid-crawl is a true row and a misleading one. This is the
one place the reading goes, rather than onto the panes: those show a list being
filled, and this view's subject is the refresh itself.

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

**Calls answers what the other two readings cannot: what the run SPENT.** The
bar and the wire are live and gone when the crawl ends; the same traffic is kept
in `state/calls.json`, one run per cache key, written by the crawl as it closes
and overwritten by the next. The tab opens on the run: its verb, when, how long,
how many calls, how many bytes disclosed, and how many passes. Then **by shape**,
which is the reading the list cannot give: the path with the parts that vary
between one call and the next taken out (owner and repo, shas, numbers, and a
query's values but not its keys), counted and timed, commonest first. That is
what turns 214 rows into `×167 GET repos/…/…/git/trees/<sha>?recursive`, which
is a fact about the crawl's design rather than about one call. The full list sits
underneath, since a shape can hide the one call that failed; a non-GET method and
a status past 399 are the two things marked, for the same reason they are marked
on the wire.

Three things it does not do, each on purpose. **Only the last run per crawl**, so
the file stays small: the `runs` ring beside the caches already carries the
history at four numbers a run, and twenty runs of two hundred rows would be a
projection nobody reads. **It costs a commit per run**, including a run that
changed nothing, which is exactly what the caches' material-change gate avoids
for them; that is why the log is a separate file, so the gate still holds where
it matters and a log whose whole subject is the run has nothing to compare
against. And **a run that outran the ledger says so**: gh-boot trims its traffic
ring at 400 entries, so the stored rows are the tail, the run's own call count
comes off the totals (which survive trimming), and the tab prints the warning
rather than presenting a short list as complete.

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
before it. An interval's magnitude reads `6 of 11 repos changed · 55%`: the verb is
there because the count alone left the reader to supply one, and "changed" is
the honest superset of the chips below it, which split added from removed from
moved. The expanding row says what it is reading while it reads (`reading
activity.json at both commits…`), since the two versions of the cache itself are
the source and nothing here reads a log. The header folds the list into the
reading worth having, a count, a span,
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

The stage's contract lives in its own reference now, [stage.md](stage.md):
the bench and Saved, intake (the paste offer bar, the Add panes, manifest
seeds), the walkable preview and its diff, the Out surface, save-as-surface,
and the `#stage=` link grammar with `&prompts=` and `&mode=`. What stays here
is the boundary: the stage is `store.stage`, one list of `{repo, ref, path}`
refs (plus local items) sitting above any repo, and a staged fileset *is* a
surface ([envelopes/surface.md](envelopes/surface.md), the `stage/1`
profile), which is why the Stage view holds the bench and the shelf as one
nav stop.

The other things that stay here are the **app-wide drop and paste**, because
they are the shell's gestures rather than the stage's: a file dropped, or
anything pasted, on any view is staged, routes to the Stage, and opens in the
preview when it is the only one. The shell owns the listeners, the drag cue,
and the routing (`wireAppDrop`, `wireAppPaste`); what an arriving thing becomes
is `window.StageIntake`'s, one answer shared with the bench's own drop-zone.
Both gestures used to work only on the Stage, which meant you had to already be
where you were trying to get to.

The paste is the shell's **only** window paste listener, and that is a
constraint rather than a tidiness note. Window listeners fire in registration
order and `init()` runs before any component mounts, so a second listener in the
stage could not use `defaultPrevented` to tell that this one had already acted;
one reader is also what keeps a paste's several flavors from being split between
two handlers. The stage's own listener was removed when this one arrived
(2026-08-18).

**The platform floor underneath all of it is that a phone has no paste event at
all.** iOS Safari fires one only when an editable is focused, so the window
listener that is the desktop's whole story is worth nothing there and the
gesture the platform does give is a tap. So there are two tap triggers behind
the one call (`pasteAnywhere` → `StageIntake.takeClipboard`), and they are two
answers to "where would you reach for this", not two implementations:

* the **launcher's long-press menu**, which the shell fills through the FAB's
  `menu` contract (below), a gesture on a control already floating over every
  view;
* the **bench's own Paste button**, for when you are already on the Stage.

**A header button was the third for one day** (shipped and removed 2026-08-19),
and the fact that it went is the part worth recording. It was the discoverable
route: visible without knowing a gesture exists, which the long press is not.
It came out because the header is the app's scarcest row, holding identity, a
nav that already scrolls at phone widths, and the sidebar toggle, and because
the long press was confirmed working on a device first. That leaves the phone's
only intake behind an undiscoverable gesture, which is a real cost knowingly
taken rather than an oversight; if the menu proves too well hidden the button
is twenty lines and comes back.

Each trigger must read the clipboard on the tap's **own** user activation,
which is why `pasteAnywhere` awaits nothing before `takeClipboard`, why
`takeClipboard` throws rather than lazily fetching `kits/io.js`, and why the
shell preloads that kit at boot. An `await` before the read spends the gesture,
and the failure then looks like a clipboard problem rather than a sequencing
one.

**An empty clipboard is reported as information, not as an error** (changed
2026-08-19, from a phone). `io.pasteItems()` returns an empty list both for a
genuinely empty clipboard and for a read the platform refused without throwing,
and nothing downstream can tell those apart, so the message says what happened
("Nothing came off the clipboard") rather than guessing why. Tapping Paste
before copying anything is the ordinary case, and the red alert it used to raise
read as a broken button. A read that *throws* is a real failure and keeps the
error colour.


### Where a takeover sits

A swipe-deck takeover (the file preview, the branch reader, the Map's docs, the
transform workbench) is framed by two CSS variables the kit reads and this app
sets: `--deck-left` and `--deck-top`, both defaulting to zero, so a page with no
chrome beside its content gets the whole viewport as every consumer always did.

**At `lg` and up the takeover lives in the view pane; below it takes the
window.** One breakpoint for both axes, and it is the sidebar's, because that is
where the sidebar stops being an off-canvas drawer and starts taking layout
space. Above it the deck starts after the sidebar and below the header, so both
stay visible and usable while it is open. Below it the deck covers everything,
which is what a phone always did and what a short screen wants.

Until 2026-08-18 the panel was a centred `max-w-4xl` card with a margin, a
rounded border and a shadow, over a full-viewport overlay. That reads as a
dialog pasted on top of the app rather than part of it, and here it floated
across the sidebar, so chrome you were still meant to use sat under something
you had to dismiss first. The phone case was already right; this makes the
desktop match it.

Two things the change costs, both stated because they are silent. The overlay's
desktop margin used to be the click-outside-to-dismiss target and a filled frame
leaves none, so ✕, Escape and the Back button carry dismissal everywhere now,
as they already did on a phone. And the sidebar is reachable during a takeover
for the first time, so navigating while one is open changes the view underneath
it rather than being blocked.

**Leaving the view closes the takeover.** Newly reachable and newly a problem:
the deck no longer covers the chrome, so a tap navigates while the deck keeps
painting the view you left. Measured before fixing, opening the workbench on the
Stage and tapping Map left the workbench on screen with the rail and the URL
both saying Map. It hangs off `syncUrl()` rather than a watcher on `view`, for
ordering rather than taste: every `go*` method routes through there
synchronously, so at the moment a paste calls `goStage()` no deck exists yet and
it is a no-op, where a queued watcher could as easily have fired after the
preview opened and closed the very thing the paste was routing to. It uses the
kit's `drop()` rather than `close()`, since the navigation is already the
history event.

**The breakpoint alone is not the condition,** which is the trap: the desktop
sidebar is conditional (`showSidebar`, `sidebarOpen`, and the `lg:hidden` on the
aside), so a signed-out dashboard or a put-away sidebar has no column there. A
deck inset by a column that is not present clips the very view it is covering.
CSS owns the widths, `syncDeckFrame()` owns whether they apply, and the header's
height is measured rather than restated, since it is conditional too and a
hidden header measures zero for free.

## The branch review: landed / stranded per branch

**Retired as a per-repo view on 2026-08-14; the reading lives in Activity's
Branches tab**, which is the same rollup with the same signal across every repo
at once and opens the branch takeover. `?view=branches` aliases there.

The math outlived the view and is the part worth knowing. Every branch sorts
into **recently active** (commits in the last 14 days; judge nothing yet),
**likely landed**, and **likely stranded**, on a content-level signal rather
than `ahead_by`: which of the branch's uniquely-touched paths hold, at the
branch tip, bytes the default branch holds right now, at the same path or moved
anywhere in the tree. **Missing** counts paths absent from the default branch in
both path and bytes, the strong stranded evidence. Squash merges and history
rewrites make ref-level "unmerged" (and `ahead_by`, whose count on a
rewrite-orphaned branch spans its whole line, marked `*`) unreliable; the
content columns are the ones to read.

It is the browser port of home's `tools/unmerged-branches.sh` (the CLI reference
instrument), lives in `lib/kits/branch-status.js` as pure unit-tested functions,
and is held in agreement with the CLI by `scripts/check-branch-status.mjs` (on
home's 56-branch estate: 52 exact, 4 divergent only where the CLI's git rename
detection credits moved-and-evolved content the API cannot see, all in the
conservative direction). Fetch cost per branch: one compare (with a
commits-list fallback for no-merge-base branches) and one recursive tree, over
one branch list and one default-branch tree.

Advisory and read-only, matching the CLI's posture: it frames the per-branch
reconcile judgment and decides nothing. The delete action lives on GitHub.

## The branch overlay: preview a cross-repo change before it merges

The overlay's contract lives in its own reference now,
[branch-overlay.md](branch-overlay.md): the branch-detail takeover, the
overlay's file substitution, the sidebar's second ref, the ref bar's in-place
actions, and dropping a file on a branch. What stays here is the boundary:
the overlay is how the shell reads a branch's version of the estate in place,
and the branch page (`pages/branch.html`) remains the shareable single-branch
address.


## `.web-tools.json`: the repo manifest

The manifest's contract lives in its own reference now,
[manifest.md](manifest.md): the file's shape, the membership rule, the config
cache, the mailbox, inbox and outbox, proposals, the repo menu, and editing
the manifest from the shell, with the field list as data in
[manifest-fields.csv](manifest-fields.csv). What stays here is the consumer's boundary:
show-repo reads `landing`, `pages`, `pins`, and `stage` to decide how to
present a repo, probes the file once per `repo@ref`, and parses it as data,
never executed; a 404 means no config.


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

- **Hand the user a browse link:** `…/app/?repo=owner/repo` (add
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
