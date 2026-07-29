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
Deep-link params: `&view=pages|atlas|files|stage|branches|public|surfaces|todo|jots|activity|portable`, `&file=<path>`, `&path=<dir>`.

**Two context levels.** The page is either in the **estate** (the global,
all-repo context) or in a **repo** (a per-repo context with its own views).

The **header carries the app-level nav**: a fixed, app-owned set of the estate's
own views, **Activity** (Open / To-do / Jots by pill), **Repos**, **Surfaces**,
**Stage**, **Tools**, and **Map**, as icon buttons (icon + label on desktop,
icon-only on mobile), lit on the active view and present on every viewport. That is the whole
header: the `#repo` component sits beside the nav but renders nothing (it is the
repo/auth controller and hosts the shared dialog), and there is no auth shield.
The brand icon returns to the **dashboard**: Open for a signed-in viewer, Repos
for a signed-out one. There is no repo-list dropdown and no quick-links row:
**repo selection happens on the Repos dashboard** (a card opens the repo), which
reads better than a dropdown and keeps the header a fixed set rather than one
repos opt into.

The sidebar's **top bar is a crumb trail** (`crumbBar`, the shell's
`sidebarCrumbs`) in both contexts. At the app level it is the **product mark
alone**, which says what a "Views" label used to say and says it in the
vocabulary the repo trail already teaches. In a repo it is the mark, the repo,
and the ref only when it is off the default. The house is the route to the dashboard, which matters on mobile
because an open drawer hides the header brand entirely; dropping the owner
prefix, always this account, is what pays for it, and the full `owner/name`
stays in the tooltip. The mark renders grayscale at rest and in colour on hover,
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
files, branches) plus pins and recents; in the estate, the Repos index and the
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
- **atlas**: a standing structural view, available for every repo regardless of
  its landing.
- **files**: the explorer: breadcrumb + listing, selected file's content
  beneath. Each row has a `+` that stages the file.
- **branches**: the branch review (below).

**GitHub jump-overs.** show-repo is a wrapper over GitHub, not a wall: every
view keeps a one-tap route to the GitHub presentation of what it is showing.
The sidebar top bar links the open repo@ref, the explorer breadcrumb links the
current folder, the viewer's actions link the open file's blob, and every
estate card and surface item carries its github-logo link. A new view should
ship with its jump-over.

## The estate: the all-repo view

The estate (`lib/alpineComponents/estate.js`) is the central dashboard over the
whole repo constellation, and the page's global context (above any single repo,
reached from the header selector's "Repositories" entry, the brand icon, or a
bare page open). It is a context with **views of its own**, switched from
the header nav the way a repo shows landing/atlas/files/…:

- **Repos** (`?view=estate`) — the repo cards.
- **Surfaces** (`?view=surfaces`) — the curated surfaces.
- **Activity** — the live layer: one nav stop with three pill-switched
  sub-tabs, each keeping its own deep link: **Open** (`?view=activity`),
  **To-do** (`?view=todo`), **Jots** (`?view=jots`) (all below).
- **Tools** (`?view=tools`) — a curated gallery of utility pages (below).
- **Map** (`?view=map`) — the portable set, each repo's scope, and its adoption (below).
- **Proposals** (`?view=proposals`) — pending cross-repo edits awaiting a confirm
  (below). The one conditional entry: shown only while something is pending.

The estate component renders Repos / Surfaces / Activity, sharing one lazy mount;
Tools and Map are their own components on their own lazy mounts.

Behind those, past a hairline rule, the header carries a **second nav group: the
repo-sponsored app views** (`appView:true`), one button each, carrying the icon
its repo declared. The list is the sidebar's list (`appNav` reads
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

**Surfaces** come from two places, stacked in one view: the surfacer's format
either way (a `manifest` block and an `items` array; see the home repo's
`projects/surfacer/VISION.md`).

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

**Activity** gathers the estate's live layer under one header-nav stop: Open,
To-do, and Jots, a trio that reads as a gradient of commitment (a jot is
unshaped intent, a to-do is shaped intent, an open branch is intent in
flight). The layout is responsive: on a wide screen all three render at once,
Open as the main column and To-do plus Jots as a right rail, each pane with
its own header and count; on a narrow screen the panes collapse behind a
segmented pill (the shared internal-tab style), each pill carrying its live
count, with Open's as-of readout and Refresh riding the pill row. Each
sub-view keeps its own view key either way, so `?view=activity`,
`?view=todo`, and `?view=jots` all deep-link directly and old links resolve
unchanged.

**To-do** (`?view=todo`) is a general, personal checklist: not repo-scoped and
not a surface, so it keeps its own tiny file, `lists/todo.json` in the
registry (`{items: [{id, text, done, created_at, done_at}]}`), rather than
reusing the surfaces schema. Add a line, check it off, or delete it; a
checked item moves into a collapsed "done" pile instead of disappearing, so
delete is the only way an item actually goes away. Every mutation writes the
whole file straight through the viewer's token (`gh-store.js`'s `save`), the
same as a surface edit, so it is durable across browsers and devices, not a
per-browser `localStorage` list. Token-gated like Surfaces: no token, no list.

**Jots** (`?view=jots`) is the capture sibling of To-do: quick ideas, one flat
item list in the registry's `lists/jots.json` (`{items: [{id, text,
created_at}]}`), same whole-file write mechanics. The lifecycles differ: a
to-do tracks work and completes; a jot has no done state. It sits in the pile,
newest first with its age showing, until it is promoted somewhere with a real
home (a chron entry, a tracker task, a to-do) or deleted. Two hooks anticipate
the maintenance cycle around that promotion without building it yet: the add
commit carries the jot's text, so the file's git history is itself a capture
log, and the registry sits in agent-session scope, so an agent session can
read the pile and drain it (promote, then delete) the way `chron/dump/` is
drained. The two lists live under `lists/` because they are authored content
with the registry as their source of truth; `state/` stays derived caches
only.

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
branch's **Commits**, and **New pull request** for a row with no PR, plus copy
actions for the branch name and the compare link. It also gives the row's action
line back the width the pair was spending. It shares the sidebar repo menu's
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
route into the branch review). The view's Refresh forces the crawl through the
shell (`refreshActivity`); a normal visit kicks it throttled. The internal view
key stays `activity` (and `?view=activity`), so existing links resolve.

The cache is what makes this affordable. The branch review costs ~2 + 2N calls to
survey N branches, so surveying every repo live on a dashboard is a flood.
Instead `refreshActivityCache` crawls each estate repo on a ~12h per-browser
throttle (heavier than the config crawl, so a longer interval) and stores the
capped landed/stranded survey plus cheap summary signals; the branch review, the
estate cards, and this view all render from the stored result. The per-repo
branch review is **cache-first** too: with a token it renders Landed / Stranded
from `state/activity.json` and marks the header `cached`, running the live fanout
only on an explicit Refresh or where the cache has no coverage. Same survey math
either way (`lib/branch-survey.js` `surveyBranchLive`, shared by the view and the
crawl). Source-of-truth rule as ever: the cache is derived and may be briefly
stale; Refresh re-surveys live.

Token gating: no token means the public default card only, no surfaces, no
activity, and no write controls. In that state the Repos view leads with a
**public banner** that says exactly what is and isn't available and offers the
two real next steps, a token or Public browse, instead of a vague "set a token"
aside. Deep links: `?view=estate` (the bare URL is the Repos estate already; the
param is stamped only when a `repo`/`ref` param is also present), `?view=surfaces`
and `?view=activity` (always stamped, so each is shareable on its own).

**The shared dialog is scoped by how it is opened.** With no repo, from the
**account row** at the top right of the Repos view, it is an **account panel**:
the token control alone, no repo tabs (**Refresh views** left with the header
shield, being the same `refreshConfigs` the Repos view's own **Refresh** button
already ran; the account row is where the token lives now).
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
in the private `home` repo). Three tabs, `lib/alpineComponents/map.js`, each
answering one question about the layer: what travels, who carries it, and how it
moves.

*The set* renders the to-go bag from the hub's committed manifest,
[`docs/portable.json`](portable.json), whose prose parent is
[`docs/PORTABLE.md`](PORTABLE.md) (a test,
`tools/test/portable-manifest.test.mjs`, holds the two consistent, so the UI
never drifts from the catalog). Grouped as plugin skills, docs, and scripts;
each row shows its role and adoption mode (in the plugin, fetched live, fetch
to adopt, on demand) and opens in the shell's own viewer, rendered, so reading
CONVENTIONS.md is one tap from the dashboard. The doctrine kernel rides here as
a doc, so the theory sits beside the conventions it governs. Public: the hub
repo is public, so this half needs no token.

*Scope* and *Adoption* share one per-repo card, since they are two facets of one
object. **Scope** is the repo's own account of what it holds and why, read live
from its `.web-tools.json` `scope` field (inline prose, or a repo path ending in
`.md` linked to its blob). The repo owns the story; the Map view only stacks the
statements, so the cross-repo picture is a view, never an authored central list.
This is the same shape as estate membership and the surface split: a repo owns
what tells its own story. **Adoption** is the alignment read. The roster is the
hub, the registry, and every **estate member** (`estate: true`, read from the
config cache in each repo's own `order`), so the Map grades the same set the
Repos dashboard shows rather than keeping a list of its own. Grading stops at
members deliberately: probing every repo in the cache would make this an
account-wide survey mostly composed of repos that will never carry the set, at
three live reads each. The blind spot that buys is that a repo adopting nothing
is invisible here, since the file that would list it is the first thing adoption
writes. Each repo
is probed live (three parallel reads on its default branch) for the environmental
hooks that carry the set: the plugin-marketplace subscription and enabled plugins
in `.claude/settings.json`, a conventions-wired `CLAUDE.md`, and a
`.web-tools.json`. `lib/portable-align.js` grades the signals (pure, tested)
into a verdict per repo: `aligned` (marketplace, plugins, and wiring all
present), `partial`, `unaligned`, `optout` (the config's
`conventions: "optout"`, respected as deliberate), and the role verdicts
`source` (the hub) and `registry` (the private sister), which hold standing
parts and are not graded on subscriptions they would never carry. Each card
shows the scope headline, the verdict, check/x chips per signal, and a gear that
opens the shell's repo dialog on that repo's Config tab in place (no navigation,
the same `openDialog(repo, { tab })` call the estate Repos card makes), so a
repo's `.web-tools.json` is one tap from the Map. Token-gated (it reads private
repos' settings);
probes are live per view open with a Refresh, and persisting them as a registry
crawl cache (`state/alignment.json` beside the config and activity caches) is the
named follow-up.

*Transport* answers how content moves and renders, from the hub's committed
[`docs/routes.json`](routes.json). Three sections: the **address grammar**
(`owner/repo[@ref]:path`, with a chip per place it is spoken, each opening that
file in the shell viewer), the **delivery modes** `toss-render.html` accepts
(each row carrying whether it ships the bytes inline or fetches a reference, and
the trust posture that buys: a payload renders under an opaque origin that
cannot reach this origin's token, an address-mode fetch is same-origin and can,
which is why only the second is allowlisted), and the **toss routes** resolving
a content type to its renderer page. The modes section leads with the read
order, since it is one rule everywhere: fragment first, query as fallback, in
`toss-render` for its own params and in the renderer pages through
[`lib/url-params.js`](../lib/url-params.js). A payload belongs in the fragment,
which never reaches a server and so escapes the roughly 8KB cap the Pages edge
enforces with a 414; an address is short, and a routed toss hands `?src=` to
the page through the params shim rather than over the wire. Those facts previously existed only as
source comments in three files, so a reader had to reconstruct them; the
manifest owns them instead. The `routes` block is the owner of `toss-render`'s
`TOSS_ROUTES` literal, which stays inlined so the critical render path takes no
fetch, with `tools/test/routes-manifest.test.mjs` failing if the two drift: the
same builder-plus-drift-check shape as the set's manifest test. Public, like the
set, and loaded on first open of the tab rather than at mount.

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

## The stage: a cross-repo fileset

The stage is `store.stage`, a list of `{repo, ref, path}` refs (plus transient
local items from drops). It is an **estate view**, beside Repos and Surfaces:
one stage above any repo, since every item carries its own origin. Takes from:

1. upload: the drop-zone (a file, or pasted text; pasted ref lines stage as refs),
2. a repo: the grab picker in the view (a tap-through path selector over the
   estate's repos; no text input, so no keyboard or iOS focus zoom), or the
   explorer's `+` buttons while visiting a repo,
3. a repo manifest's `stage.files` (seeds an empty stage when that repo opens),
4. a `#stage=` link.

Stage-view actions:

- **Recent / Search**: the finder, two tabs. Recent is the latest committed
  files across the estate's root repos (one `recentFiles()` sweep per repo,
  loaded when the stage is first shown), filterable by per-repo pills
  (single-select: tap to show only that repo, tap again for all). Search is
  filename-contains over the same repos' full trees (one cached
  recursive-tree call per repo; matching is local per keystroke). Either way
  each row is one tap to stage, a second to unstage, and the muted line reads
  `repo · folder`;
- **view** a staged file inline (a preview panel in the stage itself, with a
  GitHub jump-over to the file's true home; it never routes through a repo's
  Files view);
- **Out / Diff**: the deposit surface, two lenses in the finder's open style.
  Out covers everything leaving the stage: the concatenated bundle (each file
  under a `// === owner/repo[@ref]:path ===` header; icon actions to view,
  refresh, copy, download — the block renders on demand, since copy and
  download never needed it on screen) and the send-to-repo (destination is
  the tap-through selector in folder mode; two-tap Send). Diff is a line diff
  of two staged items (a pasted local file counts), each side optionally read
  at an override ref, so the same file picked twice with one ref changed is
  the version diff. (The base...head branch compare is not here: it lives
  under the Branches view, with the review it serves.);
- **Save stage**: write the ref list to a NAMED repo's `.web-tools.json`
  `stage.files`. The stage belongs to no repo, so saving one means saying
  where: the registry by default (a general staging), or any repo the field
  names. Refs outside the target save fully qualified;
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
stage opens as a diff. A `mode=diff` link opens on the **Diff** tab and runs the
compare on open (no click), so a review link lands the reviewer straight on the
diff; without it a stage opens on **Out** (a bundle handoff). `StageLink.mint(items,
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
reference instrument), lives in `lib/branch-survey.js` as pure unit-tested
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

The **estate placement** fields let a repo describe how it appears on the
all-repo estate. Membership is a repo property: there is no registry list of
repos. All are optional; a repo with no config is simply off the estate.

- **icon**: Phosphor icon class (e.g. `"ph-scales"`) for the repo's estate card
  and its header quick-link button. The repo owns it.
- **estate**: `true` to appear on the estate. The estate enumerates the account's
  repos and includes those whose config sets this.
- **group**: the estate section this card sits in (e.g. `"core"`, `"data"`).
- **note**: the card's one-line description; overrides the GitHub description.
- **order**: arrangement weight. Group order (a group sorts by its lowest
  member's `order`) and within-group order both derive from it.
- **inbox**: where an unaddressed deposit lands (`"inbox"`, `"@ref:dir"`, or a
  full `owner/repo[@ref]:dir`). See "Inbox and outbox" below. Absent means the
  repo root.
- **outbox**: where this repo stages material for others to pull. Same shape;
  adds an "Open outbox" row to the repo menu.
- **landing**: path to the repo's own landing page, rendered live via
  toss-render `#gh=` (token-authed, so private repos and branches work; gated by
  toss-render's OWNERS allowlist). "The repo builds its own page." Takes the
  front-door slot ahead of `pages` when a repo sets both: the custom page is
  the landing, and the catalog moves to the standalone **Pages** sidebar view
  instead of disappearing. A repo with only `pages` (no `landing`) still gets
  the gallery as its landing, unchanged.
- **pages**: a hand-declared page catalog: a flat list of `{ path, title, note }`
  entries (optional `icon`, `thumb`, and the app-view fields below). A repo
  declaring a non-empty `pages` gets the **gallery**: the same card grid
  with the screenshot / live / source toggle, chip grouping, and search that
  web-tools gets from its generated `pages.json`, but fed from this hand-declared
  catalog as one group. It surfaces as the **landing** when the repo has no
  `landing` field, or as a standalone **Pages** sidebar entry when the repo
  also has one (so `landing` and `pages` aren't mutually exclusive: a repo can
  set both, and both stay reachable). A private repo has no committed
  thumbnails, so each tile renders **live** through toss-render `#gh=`
  (token-authed, lazy on scroll); the source toggle reads the file through the
  viewer's token. This is a sibling to `pins`/`stage.files`, maintained by
  hand. (web-tools keeps its generated `pages.json` for its own gallery; the
  component reads whichever catalog a repo offers.)
  - **path**: the page. A **bare repo-relative path** (`"pages/foo.html"`, this
    repo at its default branch) or a **qualified cross-repo ref**
    (`"owner/repo[@ref]:path"`), the same grammar as `stage.files`. The
    cross-repo form lets a repo promote a page whose file lives elsewhere: home
    declares the news app view as `"mehrlander/web-tools:pages/news/news.html"`,
    owning the promotion while the renderer stays in web-tools (the page reads
    home's data through the viewer's token regardless of where it is hosted).
  - **title**: the card's heading (defaults to the filename).
  - **note**: the card's one-line description.
  - **icon**: Phosphor class, used as the app-view icon when promoted, in the
    header nav and the sidebar alike.
  - **appView**: `true` to promote this page to its own **estate-level view**,
    a peer of Repos / Surfaces / Stage, shown in the header nav's second group
    and in the sidebar (estate membership one
    level up: the target is a rendered page, not a repo). Collected across
    every repo's config through the config cache, token-gated (no token, no app
    view, like Surfaces), and rendered live in the estate main area via
    toss-render `#gh=`. The page still appears in the repo's own gallery too;
    the flag is additive.

    *When to reach for it.* A view whose subject is **the estate** is built into
    the shell (Activity, Repos, Surfaces, Stage, Map, Proposals, and the To-do
    and Jots lists, which are operational to the tool). A view whose subject is
    **content** is an app view over the repo that owns it: the renderer stays
    public here, the content stays wherever it belongs. News and Links are both
    that shape, home's data through a web-tools page. Two consequences worth
    knowing before building one: the page gets the main area minus the sidebar,
    so it has to survive at two thirds width; and the shell already supplies a
    header and the sidebar label, so a promoted page should stand its own
    masthead down when `window.self !== window.top` (`pages/links.html` does,
    `pages/news/news.html` does not yet). An app view cannot reach the shell's
    chrome at all, being in an iframe, so anything wanting persistent presence
    has to be built into the shell instead.
  - **viewLabel**: the sidebar label for the promoted view (defaults to `title`,
    then the filename).
- **pins**: folders/files surfaced in the sidebar Pinned block. A last segment
  with an extension opens as a file; otherwise it opens the Files view at that
  folder.
- **links**: path to the repo's **links board** (`"links/board.json"`, or a
  qualified `owner/repo[@ref]:path`), the store `pages/links.html` renders. The
  shell reads it and surfaces the items flagged `rail: true` as **the rail**:
  the handful of destinations worth a tap from anywhere. Nothing is re-authored,
  since the flag already drives the board's own masthead band.

  Two layers, both declarative, and the split is what keeps the rail honest.
  **Which board** is this field, in the repo's own config, editable through the
  repo dialog's Config tab. **What is on the rail** is the board itself: the
  `rail` flag, array order, each item's `icon`, `title`, and `doors`. The
  sidebar's Links block carries an icon for each layer's answer: a bookmark that
  opens the board, and a pencil that opens it in edit mode (`?edit=1` on the
  toss address, which the params shim delivers to the page).

  Placement follows the verb. A rail item leaves the app, or opens a repo in it,
  which is not what a nav item does, so it sits at the **far end of the header**
  rather than as a third nav group: icon-only, tooltip carrying the title and
  note. That cluster is desktop-only, the one place the two viewports differ,
  because below `lg` the nav already scrolls and a second header cluster would
  compete for the same overflow. The **sidebar block** is the phone's route to
  the rail and the wide reading of it on desktop, spelling out each label and
  wrapping its doors. A `snippet` item is skipped in both: a `javascript:` URL
  is something to copy, not somewhere to go.
- **tracker**: where the repo keeps its task board (`"tracker/board.md"`, or a
  folder). Adds one row, **Task board**, to the repo's **GitHub menu** (the
  sidebar Repos row's github button, and the Activity view's repo chip). It is
  the one row in that menu GitHub cannot name for itself: every other row is a
  fixed GitHub route, while where a repo tracks its work is a repo property. A
  path with an extension links the blob, a bare path links the tree; declaring
  none simply drops the row. See [TRACKER.md](TRACKER.md) for the board itself.
- **scope**: the repo's own account of what it holds and why, surfaced as the
  headline of its card in the estate's **Map** view. Either **inline prose**
  (`"scope": "A private orchestration base…"`, a sentence or a few) or a **file
  pointer** (a repo path ending in `.md`, e.g. `"scope": "docs/SCOPE.md"`, linked
  to its blob, for a repo with a longer story). The repo owns the story; the Map
  view stacks the per-repo statements rather than keeping a central list, so a
  repo's scope is stated on its own terms and does not depend on its siblings.
  The state carried by the config cache, so a scope edit versions with the config.
- **surface**: a path (or a list of paths) to `.surface` file(s) in this repo,
  surfaced under a per-repo section in the estate's Surfaces view and as a chip
  on this repo's Repos-grid card. Read-only in the estate (edit the file in its
  repo). See "The estate" → Surfaces above.
- **stage.files**: a durable staged-files list. Entries are **bare paths**
  (`"lib/foo.js"`, meaning this repo at its default branch) or **qualified refs**
  (`"owner/repo[@ref]:path"`). Seeded into the stage only when the stage is
  otherwise empty, so a working set the user built always wins.
- **stage.targets**: default transfer destinations (`"owner/repo:dir"`
  strings), offered in the Copy-to-repo field.
- **conventions**: not a show-repo field. `"optout"` marks a repo that has
  deliberately not adopted the portable conventions, so a session-start nudge
  stops asking. Absent means unset. Documented in [PORTABLE.md](PORTABLE.md).

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
in the registry repo, built by `lib/repo-config-cache.js`. `refreshConfigCache`
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
and show-repo (the user's full-access token), built by `lib/repo-mailbox.js`.
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

### Inbox and outbox

Two optional manifest fields naming where material lands and where it is
staged. `inbox` is the **receiver's** declared landing spot for a deposit that
names no directory; `outbox` is a **sender's** shelf of material it is making
available to be pulled. Both are read by `lib/repo-address.js`
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

**Outbox, on the pull side.** A repo declaring one gets an **Open outbox** row
in its repo menu, which opens the Files view at that folder. The pull itself is
ordinary browsing or staging from there. For a **public** repo the outbox is
also the one cross-repo handoff that needs no token at all: `raw.githubusercontent.com/owner/repo/<ref>/<path>`
serves it to any reader, which is the gap the `#gz=` bundle form is contemplated
for on the private side.

### Proposals (`proposals/pending` → `proposals/applied`)

The write-side counterpart to the mailbox, built by `lib/repo-proposals.js` and
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
`path`, `why`, and an optional `ref`. Two kinds:

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
body, a `set-json-field` gets its before/after as a fenced block, and the
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
| **Target is readable** | the file exists and parses (JSON, for `set-json-field`) |
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
rather than merges and would otherwise erase a change nobody reviewed;
`set-json-field` merges into current content, so it is safer without one. The
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
view shows the resulting bytes (a before/after on the key, or the two files side
by side), so a reviewer confirms what will happen rather than what was promised.
A target that cannot be read, or is not the JSON it claims to be, lists as
unresolved with its error and no Apply. The write goes through `gh-transfer.js`'s
`saveRaw` (lazy-loaded, stale-SHA retry), and the outcome is written to
`proposals/applied/<same-name>.json`, which is what marks a proposal spent:
`gh-store` has no delete, so a result file is the tombstone, exactly as in the
mailbox.

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
out-arrow. The list is `lib/github-links.js`, a pure string builder with no
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
- **Auto-migration**: a save always writes `.web-tools.json`. A repo still on the
  legacy `.show-repo.json` is edited the same way; the save lands the new name,
  which readers already prefer, so the legacy file goes inert. No delete step
  (the gh layer has no delete helper), and the section flags the migration when
  it loaded from the legacy name.
- **Scope**: this is a raw-JSON editor, the thin first slice of the config-edit
  surface (tracker task 0013). Per-field controls (an icon picker, a pins list)
  are the larger goal, not built here.

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
