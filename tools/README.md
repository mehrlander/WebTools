# tools/ — headless render + build harness

Node tooling for exercising repo pages inside the Claude Code web sandbox, where
the JS CDNs our pages use at runtime (jsDelivr, unpkg) are blocked and there's no
GitHub token. See [`docs/environment/`](../docs/environment/) for the sandbox
facts these build on.

Everything here resolves the same two networks of dependencies to local files:

- **Own code** — the page's first jsDelivr `/gh/` import of `gh-api.js`, then
  every `gh.load()` after it via the GitHub contents API → the on-disk working
  tree (so a render reflects branch edits, not what `main` serves; no token).
- **Third-party libs** — Tailwind / daisyUI / Phosphor / Alpine off jsDelivr +
  unpkg → npm-installed copies under `node_modules`.

## Layout

Three categories, one folder each, plus one folder of generated input (they
share no module imports — render and build touch only via subprocess and the
`dist/` artifact):

- [`render/`](render/) — exercise a page headlessly, offline. `preview.mjs`
  (jsdom logic render) + `screenshot.mjs` (Chromium pixel render), with
  `cdn.mjs` (the URL → local resolver) and `scenarios/` (interaction scripts).
- [`build/`](build/) — snapshot a page's own-code graph into an offline
  artifact. `build.mjs` / `bake.mjs`, with `graph.mjs` (the static `gh.load`
  walk) and `kit-shim.mjs` (run a browser kit in Node). `verify-build.mjs` is
  the bridge: it drives the render tools to prove a build matches live.
- [`test/`](test/) — the unit/logic suite behind `npm test` (`node --test`,
  no framework dep). `bootstrap.mjs` carries the shared setup: `loadKit()`
  runs a `lib/kits/*.js` file against a plain `window` with its CDN
  `import()`s rewritten to npm-vendored copies (the preview shim's tactic,
  unit-test-sized), and `makeWindow()`/`startAlpine()` package the jsdom +
  real-Alpine recipe from
  [`docs/environment/testing.md`](../docs/environment/testing.md) for
  component logic tests. One `*.test.mjs` per kit/component beside it.
- [`graphql/`](graphql/) — one generated file, the pruned GitHub schema the
  suite typechecks `lib/gh-fetch.js`'s queries against. Tracked, unlike the
  other generated outputs, because the test needs it offline.

The build/bake
*format* itself lives outside `tools/`, in [`../lib/build.js`](../lib/build.js)
(`window.buildKit`) — one emitter shared by `build/`'s Node tools (static cache)
and `kits/export.js` (browser, runtime cache) so the two can't drift. The
contract that makes all of this possible is in [`../docs/loader.md`](../docs/loader.md).

## The tools

| Command | What it does |
|---|---|
| `npm test` | Run the unit/logic suite under [`test/`](test/) with Node's built-in runner: kit behavior (compression round-trips, persistence over fake-indexeddb, messaging, wsl-core parsing/classification, xlsx OOXML structural parsing), a registration smoke test across every kit, and jsdom + real-Alpine component logic tests (counter, sheet-modal). Offline; third-party libs come vendored from `node_modules`. |
| `npm run preview <page>` | **Logic** render under jsdom: runs the full `gh.load` chain, mounts Alpine, reports which `x-data` containers mounted + their state. No pixels; `esm.sh`/cm6 can't load (reported, non-fatal). jsdom runs no module scripts or dynamic `import()`, so the boot block is rewritten to a classic IIFE with the `import(gh-api.js)` call shimmed. |
| `npm run shot <page> [--build] [--ref R] [--script s.mjs] [--full] [--out p.png]` | **Pixel** render with the pre-installed Chromium → PNG. Runs the real `gh.load` chain (or the build, with `--build`). `--script` drives the page into a state first (see below). |
| `npm run build <page>` | Emit `dist/<page>.js`: the offline form of the page's `gh.load` chain. |
| `npm run build:lib` | Emit `dist/web-tools.js`: **the pre-build** — the whole `lib/` as one self-booting offline artifact (see [The pre-build](#the-pre-build)). |
| `npm run bake <page>` | Emit `dist/<page>.html`: the chain inlined into a standalone page. |
| `npm run verify-build <page>` | Build + render live + render via the build, assert the two are **byte-identical**. |
| `npm run pages-shots` | Regenerate `pages/thumbs/*.png` — one headless screenshot per page, the card previews for the visual index. Uses the [`screenshot.mjs`](render/screenshot.mjs) renderer; see [Cataloging the pages](#cataloging-the-pages). |
| `npm run pages-index` | Regenerate both catalogs of every page: [`pages/README.md`](../pages/README.md) (link-dense table) and [`pages/index.html`](../pages/index.html) (visual card index). A *catalog* generator, not part of the code pipeline below — see [Cataloging the pages](#cataloging-the-pages). |
| `npm run pages` | `pages-shots` then `pages-index` — refresh thumbnails and both catalogs in one step. |
| `npm run graphql-schema [-- --check]` | Regenerate [`graphql/github-schema.pruned.graphql`](graphql/): fetch GitHub's published SDL (1.5 MB) and write only the slice `lib/gh-fetch.js`'s queries reach (~2 KB), so `npm test` can typecheck them offline. The **one generator that needs the network**, which is why it stays out of the commit hook and the lockstep test; the drift guard lives in [`test/graphql-schema.test.mjs`](test/graphql-schema.test.mjs) instead. Run it after editing a query. |
| `node tools/build/repo-pages-shots.mjs --repo <owner/name> --root <checkout> --out <thumbs-dir>` | Shoot ANOTHER repo's `pages` catalog into the private thumb cache (`web-tools-private/thumbs/`), so show-repo's gallery can show clickable screenshots for that repo. Serves the source checkout, vendors CDN libs from this repo's `node_modules`. Not an npm script (it takes a target). |

Shared internals: [`render/cdn.mjs`](render/cdn.mjs) (URL → local
classification, used by the renderer), [`build/graph.mjs`](build/graph.mjs)
(static walk of a page's `gh.load`/`_selfLoad` graph), and
[`build/kit-shim.mjs`](build/kit-shim.mjs) (run a browser kit in Node).

Outputs land in `tools/.preview/` (PNG + a `.shot.log` listing intercepts,
`__loadedScripts`, console, errors). `dist/` and `tools/.preview/` are gitignored.

### Driving state before the shot (`--script`)

`--script <file.mjs>` runs an interaction step after the page settles, so a render
can capture a *state* — a drawer open, a toggle ticked, a breakpoint — not just the
landing view. The file default-exports `async (page, ctx) => {}` and gets the
Playwright `page` (`ctx.repoRoot` too). Scenarios live in
[`tools/render/scenarios/`](render/scenarios/); the PNG/log pick up the scenario
name in their suffix.

Every driver lives there and there is nowhere else to put one. Two of them,
`sidebar-projects.mjs` and `sidebar-projects-overlay.mjs`, still overlap on
their default path; only the overlay posture distinguishes them.

Example — the FAB's Export controls, opened to the Render
tab with "Fully offline" ticked:

```
npm run shot pages/demos/sheet-modal-demo.html \
  -- --script tools/render/scenarios/fab-export.mjs --out tools/.preview/fab-export.png
```

Two harness facts a scenario sometimes has to work around (the FAB one does both):
the FAB opens via pointer drag/tap physics that synthetic input doesn't drive
reliably, and its render-tab content is gated by `<template x-if="path">` where
`path` is inferred from a `*.github.io` URL (empty on the `127.0.0.1` loopback). So
a scenario may set component state through `window.Alpine.$data(host)` to reach the
state a real Pages URL would have, then exercise the actual control via the UI.

## Where "the build" sits — and why it stays off the dev path

`build.mjs` does **not** rewrite the dependency graph. It emits the real
`gh-api.js` loader with `GH.prototype.get` overridden by an inlined cache of every
own-repo file the page reaches. The actual loader runs — same strip+wrap+execute,
same `gh-boot` registry/attribution, same `read()` tracking — only the source
bytes come from memory instead of the API. Third-party libs are untouched: they
stay on the page's CDN `<script>`/`<link>` tags.

Because the cache is just a `path → source` map that `gh.get` looks up, **load
order is irrelevant** — the build collects the reachable *set*, including lazy
`_selfLoad` targets (fab's console panel, the export kit), so the built page
is fully offline-capable.

The build and the runtime loader **optimize opposite things**. `gh.load` exists
for freshness — edit a file, see it immediately — fetching own code through the
contents API (not jsDelivr) precisely to dodge CDN caching. The build is the
opposite: a *delivery snapshot*, regenerated on demand, not polled. So the build
should never go back onto jsDelivr (that reintroduces the 12h branch-tip cache the
loader was written to avoid). Its caching-free homes are:

- **Inlined into HTML** (see "bake", below) — nothing to fetch; the code is in the
  document.
- **A same-origin Pages asset** (`<script src="../dist/x.js">`) — normal Pages
  caching (~10 min, ETag-revalidated), hard-bustable with `?v=<sha>`. For a shipped
  page, not the inner loop.

A page adopts the build by swapping one line — its loader import:

```js
// gh-for-review (unchanged): runtime loads from the CDN at ?use=<ref>
await import(`https://cdn.jsdelivr.net/gh/mehrlander/web-tools@${ref}/lib/gh-api.js`);
// the build (offline / production twin): same chain, served from the inlined cache
await import('../dist/diff-tool.js');
```

Everything after that line resolves from the cache. The build still honors
`?use=<ref>` (an explicit ref falls through to the network), so a built page can be
re-pinned for review. This is the **gh-for-review / build-for-delivery** split —
one source line, two modes. `verify-build` is the guarantee: on every page tried so
far the build render is MD5-identical to the live `gh.load` render.

## Vocabulary (load → build → bake → pack)

Four distinct steps, kept on four distinct words so "bundle" stops meaning three
things:

- **load** — the fresh, per-file, ref-pinnable runtime path (`gh.load`). The dev /
  review loop.
- **build** — a snapshot of a page's own **code** graph → `dist/<page>.js` (this
  tool). `vanilla-bundle.js` / `alpine-bundle.js` keep "bundle" as hand-authored
  runtime grab-bags — distinct from a build-produced graph.
- **bake** — inline a build into a page's HTML to get one standalone document.
  `tools/build/bake.mjs` rewrites the page's `gh-api.js` import to a `data:` module
  carrying the build, so the page boots with zero own-code network (verified
  byte-identical to live on `sheet-modal-demo`).
- **export** — [`lib/kits/export.js`](../lib/kits/export.js)'s "page + the data it
  `read()`s" zip (the FAB's **"Export"** button, `window.exporter`). Runtime;
  **data** by default, **`{ offline: true }`** also bakes the code in.

So "bundle" now means only the hand-authored grab-bags (`vanilla-bundle.js`,
`alpine-bundle.js`); the four verbs above are the pipeline.

## The pre-build

`npm run build` snapshots *one page's* reachable graph. **The pre-build**
(`npm run build:lib` → [`build-lib.mjs`](build/build-lib.mjs)) snapshots the
*whole* `lib/`: every `lib/*.js` inlined into one self-resolving artifact at
`dist/web-tools.js`. It's the same emitter (`lib/build.js`), just seeded
with all of `lib/` instead of a page's boot block — so the format can't drift
from the per-page build, and `verify-build` still holds for pages.

The difference a consumer sees is **one import instead of a `gh.load` chain.**
The artifact auto-boots: importing it runs gh-boot's base chain, registers every
Alpine component, then boots Alpine via `alpine-bundle.js`. A page drops the
whole chain and writes one line:

```js
// loader (dev / freshness): per-file, ref-pinnable, network for own code
await import(`https://cdn.jsdelivr.net/gh/mehrlander/web-tools@${ref}/lib/gh-api.js`);
// pre-build (delivery / simplicity): whole library, one fetch, no own-code network
await import('../dist/web-tools.js');
```

Everything is then live — `x-data="repo()"`, `x-data="counter()"`, etc. — with
no per-component load. The pure kits (`compression`, `persistence`, `io`, …)
ride along **cached but not executed**; a page's `gh.load('kits/x.js')` resolves
instantly from the inlined cache. Third-party libs (Tailwind/daisyUI/Phosphor/
Alpine/CodeMirror) stay on their CDN tags, and `?use=<ref>` re-pins the bundle to
that ref for review. It does so by **fetch + blob-import from
raw.githubusercontent**, not jsDelivr's `/gh/` CDN: raw serves public files
anonymously with permissive CORS and no branch-tip cache, so a fresh push
previews immediately (jsDelivr's `/gh/` listing lags ~12h, which used to make a
just-pushed branch preview stale). A blob URL imports despite raw's `text/plain`
type because the blob sets its own JS type, and the bundle is one self-contained
module (no internal imports), so blob-import is clean and a branch name is
cache-safe (no SHA needed). The no-`?use` path stays the same-origin Pages
import, untouched. [`pages/demos/prebuild-demo.html`](../pages/demos/prebuild-demo.html)
is the worked example.

This is the **delivery** twin of the loader's **freshness**: develop against the
`gh.load` chain (edit a file, reload, see it), ship against the pre-build (one
dependable, offline, shared-cacheable artifact). Where it differs from a
per-page build: the per-page build is leaner (only what one page reaches) but
needs a build per page; the pre-build is one artifact reused everywhere, at the
cost of carrying components a given page may not use (harmless — an unused
`Alpine.data` registration only costs anything when an `x-data` references it).

**Staying current.** `dist/web-tools.js` is **committed** (the one exception to
the gitignored `dist/`) and served same-origin by Pages — never back onto
jsDelivr, whose cache the loader exists to dodge. It's kept in lockstep with
`lib/` by the commit-time hook (see [The refresh model](#the-refresh-model)).
The build is deterministic (sorted cache + sorted boot, no date stamp), so it
only shows a diff when `lib/` actually changed. Don't hand-edit
`dist/web-tools.js`.

**bake + export compose** into a page that opens with no network at all:
`kits/export.js`'s `{ offline: true }` mode (the FAB's **"Fully offline"** toggle)
bakes the code in *and* lays the `read()` data out local-first, in one zip. The
browser gathers the cache from `window.__loadedScripts` and calls the same
`window.buildKit` emit/bake the Node tools use.

## Cataloging the pages

`pages-index.mjs` is the odd one out in this folder: it resolves no dependency
graph and emits no `dist/` artifact. It walks the `pages/` tree, reads each page's
`<title>`, and regenerates **two** catalogs from the same data:

- [`pages/README.md`](../pages/README.md) — a dense markdown table, two links per
  page (**rendered** github.io URL + **code** view on github.com). GitHub renders a
  folder's `README.md` beneath its file listing, so it surfaces where you browse.
- [`pages/index.html`](../pages/index.html) — the **visual index**: a light-themed
  card per page, grouped by directory, whose default preview is the page's
  screenshot (from `pages/thumbs/`, generated by `pages-shots.mjs`) with a toggle to
  a **live** iframe of the page or its **HTML source**. Per-page blurbs live in the
  `NOTES` map at the top of `pages-index.mjs` — edit them there.

It's a *catalog*, deliberately kept off the load → build → bake → export → brief
vocabulary (those five verbs are about a page's own-code graph; this is about the
repo's set of pages). The catalogs regenerate automatically at commit time (see
[The refresh model](#the-refresh-model)); `npm run pages` (= `pages-shots` then
`pages-index`) is the manual full refresh, and `pages-index --check` exits non-zero
when either committed catalog is stale, as an audit. The thumbnails are committed
PNGs, so the index stays self-contained rather than re-rendering every page at
view time.

## The refresh model

Every derived artifact in the repo is refreshed one of two ways, split on one
property: whether its generator is **deterministic**.

**Deterministic artifacts ride in the commit that changes their source.** The
commit-time hook
([`.claude/hooks/build-on-commit.sh`](../.claude/hooks/build-on-commit.sh), a
`PreToolUse(Bash)` hook wired in `.claude/settings.json`) fires before every
`git commit` and regenerates + stages whatever the pending changes touch:

| Source dirty | Generator | Staged into the same commit |
|---|---|---|
| `lib/` | `npm run build:lib` | `dist/web-tools.js` |
| `pages/**/*.html` | `npm run pages-index` | `pages/README.md`, `pages/index.html` |

Both generators are byte-deterministic, so the hook can fire on every commit and
no-op invisibly when nothing real changed. It's non-blocking: a generator failure
warns and the commit proceeds.

**Thumbnails (`pages/thumbs/*.png`) refresh once per session, at wrap-up.**
Screenshots are slow (a Chromium render per page) and not byte-deterministic
(PNG encoding, font raster), so regenerating per commit would write ~100KB of
binary churn for every touched page on every commit. Instead the hook *warns*
when a page's HTML changes without its thumbnail, and the refresh happens
deliberately — `npm run pages-shots -- <changed pages…>` — as part of the
session wrap-up ritual in the root `CLAUDE.md` ("Wrapping up"). Until then,
`pages/index.html` degrades gracefully: a missing thumb shows the
"no screenshot" placeholder.

Nothing is generated server-side: GitHub Pages serves `main` as-is, with no CI
and no deploy build. Committed artifacts are the truth, which is what lets a
branch be previewed pre-merge via `?use=<sha>`. Authored docs (the merge guide,
`docs/environment/`, this file) are never auto-generated.

One human touch remains: a new page lists under its `<title>` until a blurb is
added to the `NOTES` map at the top of `pages-index.mjs`.

## Extending

- **New third-party dep shows up MISS in a `.shot.log`?** `npm i -D` it; the
  resolver maps `npm/<pkg>[@ver]/<file>` and unpkg paths to `node_modules`
  automatically. Add an entry to `CDN_DEFAULT` in `cdn.mjs` only when a package's
  CDN-default file differs from its npm `main`/`browser` (as for the Alpine
  globals and daisyUI's compiled CSS).
- **`esm.sh` modules are not vendored** (e.g. `kits/cm6.js`'s CodeMirror 6). They
  load lazily, so a page still boots and screenshots; the editor just won't mount
  until used. Vendoring esm.sh's bundled output is the open piece for cm6 pages.
