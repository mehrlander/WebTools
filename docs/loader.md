# The loader — contract and extension notes

Most pages here load their own code at runtime instead of shipping a bundle:
a page imports `gh-api.js`, then calls `gh.load(...)` for each component and
kit it needs, and each file is fetched (through the GitHub contents API) and
run on the spot. There is no build step in the authoring loop — edit a file
in `lib/`, reload, and the next run uses it.

The repo has two tiers of pages:

- **Simple pages** (`pages/index.html`, `pages/stories/bookmarklets-story.html`,
  `show-repo/repo-drag.html`, `table-compress*.html`) — each is
  self-contained: CDN Tailwind + Phosphor + Alpine (via `<script defer>`),
  then an inline `<script>` with the page's Alpine components. They don't use
  the loader at all.
- **Loader-based pages** (`show-repo/show-repo.html`,
  `show-repo/demo-viewer.html`, `scratch/demo-spacex.html`,
  `lib/kits/demos/{persistence,messaging,io}.html`) —
  use `gh-api.js` (whose bootstrap chains `gh-boot.js` and its auto-loads;
  `gh-store.js` stays opt-in) + `alpine-bundle.js` to load reusable
  components off the repo at runtime.

This doc is about the second tier: the contract a file must honor to be
loadable this way, the timing invariants the boot sequence depends on, and —
because that same contract is what lets a page be frozen into an offline
**build** — how load and build are two readings of one set of rules (see
[Load and build are one contract](#load-and-build-are-one-contract)). The
build/bake tooling and the render harness that exercises all of this live
under [`tools/`](../tools/README.md).

## The loader-based page pattern, annotated

Every loader-based page's `<head>` looks like this, with minor variation:

```html
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web"></script>
<link href=".../daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet" />
<script type="module">
  // ?use=<branch|tag|sha> picks which ref the bundle loads from; defaults to main.
  // gh-api.js auto-bootstraps (sets window.gh, chains gh-boot.js), so the page just
  // chains gh.load() calls below. By the time the import resolves, gh-boot has
  // already loaded gh-auth.js, gh-fetch.js, kits/console.js, and
  // vanilla-bundle.js; gh-store.js stays opt-in.
  //   - No ?use: import from jsDelivr @main; the bootstrap parses repo/ref from
  //     that import URL (import.meta.url).
  //   - ?use=<ref>: fetch gh-api.js from raw.githubusercontent (no branch-tip lag)
  //     and blob-import it, handing repo/ref via window.__ghBlobBoot.
  const ref = new URLSearchParams(location.search).get('use');
  if (ref) {
    window.__ghBlobBoot = { repo: 'mehrlander/web-tools', ref };
    const r = await fetch(`https://raw.githubusercontent.com/mehrlander/web-tools/${ref}/lib/gh-api.js`);
    if (!r.ok) throw new Error(`?use=${ref}: could not fetch gh-api.js (HTTP ${r.status})`);
    const u = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
    try { await import(u); } finally { URL.revokeObjectURL(u); }
  } else {
    await import('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/gh-api.js');
  }

  // await gh.load('gh-store.js');                // optional: write methods

  await gh.load('alpineComponents/repo.js');      // 1) register Alpine.data('repo', ...)
  await gh.load('alpineComponents/navigator.js'); // 2) register Alpine.data('navigator', ...)
  await gh.load('alpineComponents/viewer.js');    // 3) register Alpine.data('viewer', ...)
  await gh.load('alpine-bundle.js');              // 4) register magics + boot Alpine
</script>
```

The page body then has `<body x-data="app()" x-init="init()">` and the
components each use `x-data="repo()"`, `x-data="navigator()"`,
`x-data="viewer()"`.

The `?use=` convention is opt-in per page. Pages that adopt it gain a runtime
ref-pinning hatch: append `?use=<branch|tag|sha>` to the URL and every file
loaded after `gh-api.js` comes from that ref instead of main. The HTML itself
still comes from GitHub Pages on main; only the runtime-loaded files are
ref-pinned. A branch name is cache-safe: the `?use=` boot fetches `gh-api.js`
from `raw.githubusercontent` (no branch-tip cache) and blob-imports it, and
`gh-api.js` then loads the rest through the contents API at that ref, both
fresh on a just-pushed branch. jsDelivr serves only the no-`?use` `@main`
default, which is cache-stable and shared.

The `gh-api.js` auto-bootstrap triggers on either carrier: an import URL with an
`@<ref>` segment pointing at `lib/gh-api.js` (the jsDelivr path), or
`window.__ghBlobBoot = { repo, ref }` set before a blob-import (the `?use=`
path, where `import.meta.url` is an opaque `blob:` URL). Either way it sets the
loader's `loadBase` to `lib/`, so every later `gh.load('kits/x.js')` resolves
under `lib/`. Older pages that hard-code the bundle URL without `@<ref>` and set
no `__ghBlobBoot` are unaffected: neither carrier matches, so the bootstrap
stays dormant and the page instantiates `GH` by hand.

### What each piece contributes

- `lib/gh-api.js` — ESM default export, `class GH`. Imported via
  `<script type="module">`, not `gh.load` (bootstrap: it *is* the loader).
  Minimal cached root: provides `req / get / parseUrl / ago / load` and the
  request/cache plumbing. Read methods (`ls / repos / history / …`) live in
  `gh-fetch.js`; write methods live in `gh-store.js`; token resolution
  lives in `gh-auth.js`. All three are loaded via `gh.load(...)` and patch
  `GH.prototype` in place. **Auto-bootstrap:** when imported from a
  `cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>/lib/gh-api.js` URL, the file parses
  owner/repo/ref out of `import.meta.url`, instantiates `window.gh`, sets
  `window.__bundleRef`, sets `loadBase` to `lib/`, and chains `gh-boot.js`.
  Pages can then skip `new GH(...)` and augmentation boilerplate by reading
  `?use=` from the page URL and embedding it in the bundle's import URL.
- `gh-boot.js` — the startup list, kept out of `gh-api.js` so new entries
  don't require purging the loader from the jsDelivr cache. Loaded by the
  auto-bootstrap; runs four auto-loads in order: `gh-auth.js`,
  `gh-fetch.js`, `kits/console.js` (structured console retention; see
  [kits/README.md](../lib/kits/README.md)), and `vanilla-bundle.js`. It
  also owns the boot's observability: it wraps `GH.prototype.load` so
  every load lands on `window.__loadedScripts` (path, timing, status,
  `by:` attribution; deduped by path; a still-pending row flips to a
  visible error after 15s and self-heals if the load later settles; fires
  a `loadedscripts` event), seeded with `gh-api.js` and itself. It mirrors
  each resolved `read()` onto `window.__reads` (newest value per path,
  fires a `reads` event; the export kit's input), injects the project
  favicon when a page declares none, and under `?use=` paints the corner
  ref badge and auto-mounts the FAB unless the page mounts its own
  (registering `alpineComponents/path-picker.js` alongside it, since the
  FAB's render tab mounts one and a component file loaded after Alpine
  starts never registers). The
  cosmetic pieces are wrapped best-effort; nothing in it may break the
  boot chain.
- `gh-auth.js` — optional augmentation. Patches the `headers` getter so
  that any request with a missing or sentinel-bearing token (`🎟️GitHubToken`)
  lazily resolves from `localStorage.ghToken`. Lets a page do
  `new GH({ repo })` without plumbing tokens through the constructor while
  still preserving the iOS-Shortcut data-URL substitution path. Also
  patches `req` so a 401/403 takes over the page with a token-entry form
  (idempotent), and installs a window `unhandledrejection` handler that
  renders a generic "Boot failed" UI for other rejections that fire while
  `document.readyState === 'loading'` (the heuristic for "boot in
  progress"). Pages whose boot doesn't fit the module-top-level-await
  model can call `window.ghAuth.bootDone()` at the end of their chain to
  suppress the handler. Also exposes
  `window.ghAuth.{resolve,save,clear,prompt,bootDone}` for explicit use.
  Loaded automatically by `gh-boot.js` on bootstrap pages; pages that
  import `gh-api.js` without `@<ref>` must `await gh.load('gh-auth.js')`
  themselves.
- `vanilla-bundle.js` — framework-free ambient helpers, auto-loaded by
  `gh-boot.js`: DOM utilities (`ea`, `el`, `ids`, `ui`, `grab`, `fill`,
  `attr`, `cls`, `listen`, `data`, `tpl`, `on`, `route`), the
  Tailwind/daisyUI string helpers on `window.html` (`html.tip`,
  `html.btn`, …), and `window.copy()`. No dependencies; idempotent on
  re-load.
- `alpine-bundle.js` — IIFE. Inside an `alpine:init` handler it creates
  `Alpine.store('browser')`, `Alpine.store('toasts')`, and magics `$clip`,
  `$paste`, `$toast`. After registering the listener it injects two
  `<script>` tags to load the Alpine collapse plugin, then Alpine itself —
  which fires `alpine:init`, runs all registered handlers, then initializes
  the DOM.
- `alpineComponents/*.js` — each calls `document.addEventListener('alpine:init', …)`
  with `Alpine.data('name', fn)` inside. They reach across to other
  components via `Alpine.store('browser')` and via per-element back-pointers
  (`this.$root.__navigator = this`).
- The view registry (Tabulator/Prism/Marked render modes) lives inside
  `alpineComponents/viewer.js` as a module-private constant.
  Pages don't load it separately.

### The ambient surface

What the boot chain leaves on `window`, in one place. A bootstrap page
(the `@<ref>` jsDelivr import) gets all of it without loading anything
itself; a page that instantiates `GH` by hand gets only what it loads.

| Global | Installed by | What it is |
|---|---|---|
| `gh`, `GH` | `gh-api.js` bootstrap | the live loader instance; the class |
| `__bundleRef` | `gh-api.js` bootstrap | the ref the bundle booted from |
| `__consoleLogs` (+ `consolelog` event) | `gh-api.js` | flattened console capture; the fallback renderers use when `kits/console.js` is absent |
| `__loadedScripts` (+ `loadedscripts` event) | `gh-boot.js` | the load registry: path, timing, status, `by:` attribution; the FAB's Scripts tab reads it |
| `__reads` (+ `reads` event) | `gh-boot.js` | newest `read()` value per path; the export kit's input |
| `__traffic`, `__trafficTotals` (+ `traffic` event, coalesced to 250ms) | `gh-boot.js` | the request ledger: one row per `fetch`, with `method`, status, elapsed, and `wire` from `content-length` (`null` when the response declared none). `method` is what separates a write from a read, since `gh-store` PUTs to the same `contents/` endpoint `gh.load()` GETs from, and `via` is the repo path a `load()`/`read()` was fetching, which separates the loader pulling own code from a page reading a file over that same endpoint. The rows are capped at 400 and the totals are not, so a long crawl trims its history without deflating its count |
| `__trafficRate`, `__trafficRateAt`, `__trafficRateReset` | `gh-boot.js` | newest `x-ratelimit-remaining` seen on any response, when it was seen, and when the window resets |
| `__ghFiles` (+ `ghfiles` event) | `gh-boot.js` | per-path `{ bytes, inlined, sha }` from a `get()` wrapper. `inlined` is true when the pre-build served the file from its cache (sha `build:<ref>`), which is how the FAB's Scripts rows tell a load that cost nothing from one that cost a fetch |
| `Traffic` | `traffic.js` | the pure read over the two above plus Resource Timing: classification, roll-ups, formatting, and the three-state size vocabulary (network / cached / undisclosed) |
| `ghAuth` | `gh-auth.js` | `resolve` / `save` / `clear` / `prompt` / `bootDone` |
| `console.history` / `.subscribe` / `.filter`, `consoleKit` | `kits/console.js` | structured console retention over the base wrapper |
| `html`, the DOM helpers (`ea`, `el`, …), `copy()` | `vanilla-bundle.js` | ambient string/DOM utilities |
| `proof` | `kits/proof.js` | sandboxed proof documents (srcdoc builders); vanilla-demo and chat-render sit on it |
| `chatRender` | `chat-render.js` | chat transcript renderer; fenced blocks become live artifacts. Loads after `swipe-deck.js` |
| `sessionRender` | `session-render.js` | a session record (web-tools-private `sessions/**.json`) as a paged conversation: merges the record's three parallel turn lists on `at`, groups a card per ask and per prose turn, and names what the record could not capture. Loads after `chat-render.js` |
| `swipeDeck` | `swipe-deck.js` | the house swipe format: a snap track of slides, and the fullscreen takeover that frames it. Self-contained, so another repo's page can load it with a plain `<script src>` |
| Alpine stores `browser`, `toasts`; magics `$clip`, `$paste`, `$toast` | `alpine-bundle.js` | exist only after `alpine:init` |
| `Annotate` | `kits/annotate.js` | notes pinned to selections/elements/regions of a target document; serializes to markdown/JSON, saves jots. FAB take "Annotate" and `pages/annotate.html` drive it |
| `__builtOffline` | a build (`kits/build.js` output) | present only on baked/offline pages |
| `window.<kit>` namespaces | each kit | see [kits/README.md](../lib/kits/README.md) |

A new global with no row here is a doc bug; add the row in the same
change that adds the global.

#### The one thing the chain patches: `window.fetch`

`gh-boot.js` replaces `window.fetch` with a wrapper that records the URL,
the status, the elapsed time, and `content-length`. It is worth stating
plainly because a global patch is the kind of thing that should never be
a surprise, and because the boundaries are what make it safe to keep:

- **It never touches the body.** No `clone()`, no `text()`. The same
  `Response` object comes back, with its stream unread, so nothing
  downstream can be starved by the instrument. The cost is that only the
  compressed length is known, which is the figure the tab wants anyway.
- **It never swallows an error.** A rejected fetch is recorded and
  rethrown unchanged.
- **It installs once**, guarded by `__trafficWrapped`, so a re-boot or a
  second bundle on the page does not stack wrappers.
- **It sees only what comes after it.** The document, the CDN tags and
  `gh-api.js` itself are already in flight when the wrapper installs;
  those are Resource Timing's job, which is why the FAB's Traffic tab
  reads both and keeps them in separate bands rather than one total.

A page that wraps `fetch` itself should do so before the bundle import or
accept that its wrapper sits outside this one.

## The load mechanism

`GH.prototype.load`, from `gh-api.js`, is deliberately almost nothing:

```js
const text = (await this.get(this.loadBase + path)).text;   // fetch the file
const scopedGh = new Proxy(this, { /* stamps `by:` on nested gh.load */ });
await new Function('gh', text)(scopedGh);                    // run it as-is
```

The file is fetched and run **verbatim — no source rewriting.** (`read()`,
the data twin, is identical except it returns the file's value instead of
discarding it.) That "as-is" is the whole contract, and it's worth stating
plainly because the docs used to describe the opposite: `load()` *once*
stripped `export` / `export default` out of the source and auto-`return`ed
the first top-level `class`/`function` it found. Both are gone. The strip was
removed (commit `451f963`) because rewriting every file silently corrupted
any that merely *carried* the word `export` in a string or comment —
`kits/build.js`, which emits an `export default` in its output template, was
the file that exposed it.

The framing the strip obscured, and the one to keep: **we don't author
modules.** A loaded file is a plain script body, not an ES module that the
loader de-modularizes. It runs inside `new Function('gh', text)(...)`, so:

1. **No `import` / `export`, ever.** Not "stripped" — *invalid*. Either
   keyword inside a `new Function` body throws `SyntaxError` at load. A file
   that needs a library reaches a global (a `<script>` already on the page)
   or uses `await import(...)`, which is an ordinary expression and is fine.
2. **`gh` is in scope.** The loader injects the instance as the function's
   one argument, so a loaded file calls `gh.load(...)` / `gh.get(...)`
   directly — the injected `gh` is a proxy that records which file each
   nested load came from (`by:` attribution). `window.gh` works too.
3. **`load()` discards the return value; it runs files for their side
   effects.** A loaded file makes itself available by *doing* something:
   `window.X = …`, `Alpine.data('name', …)` inside an `alpine:init` listener,
   or patching `GH.prototype` (as `gh-fetch.js` / `gh-store.js` do). Top-level
   `const`/`let` are local to the run and vanish; there is no auto-`return`
   of a named declaration anymore.
4. **`read()` is the value-returning twin.** When a file's job is to
   *produce* a value rather than register a side effect, it ends with a
   top-level `return X;` and the caller uses `gh.read(path)` (or, for a local
   sibling file on `file://`, deposits on `document.currentScript.value`).
   That's the data path, distinct from code loading.

The consequence for outside code: anything genuinely modular — Alp's
`utils/kits/` with `import { brotli } from './brotli.js'`, say — **cannot go
through `gh.load()`**. It's ESM; load it with native `import()` instead.

## The timing invariants, stated explicitly

These hold in the current loader-based pages and must not be broken by
anything we add:

1. **`gh-api.js` is imported first**, via native `import()`. Nothing else
   has dependencies. The augmentations are then loaded through
   `gh.load(...)`: `gh-boot.js` handles `gh-auth.js` and `gh-fetch.js`,
   and `gh-store.js` stays opt-in. They require `window.GH` to already exist
   and will throw if pulled directly from a `<script type="module">`.
2. **Any `alpine:init` handler must be registered before Alpine boots.**
   Concretely: every `gh.load('alpineComponents/*.js')` call must happen
   *before* `gh.load('alpine-bundle.js')`. Alpine doesn't start until
   alpine-bundle injects the Alpine `<script>` tag, so the serial `await`s
   in the module script guarantee this.
3. **`alpine-bundle.js` is the boot signal.** It registers the `browser`
   and `toasts` stores on `alpine:init`, then appends Alpine's script tag.
   Whenever Alpine loads, its `alpine:init` fires, our handlers run, stores
   exist, and only then does Alpine walk the DOM and call `init()` on each
   `x-data` component. By that point `Alpine.store('browser')` is defined.
4. **`x-init="init()"` on the body still races the module script.** That's
   why `show-repo/show-repo.html`'s `app.init()` opens with
   `while(!window.GH) await new Promise(r => setTimeout(r, 50));`.
   Alpine can reach `init()` before the module script's final
   `gh.load(...)` resolves, because the two tasks (module script vs.
   Alpine boot) aren't coordinated.
5. **Component-to-component handles rely on element back-pointers.**
   `init() { this.$root.__navigator = this }` in `navigator.js`, and other
   pages do `while(!navEl.__navigator) await new Promise(r => setTimeout(r, 50));`
   to wait for it. This is the current idiom for "have I mounted yet?".
6. **Token sentinel `🎟️GitHubToken`.** Both `gh-api.js` (in `headers`) and
   pages look for that exact string and replace it (or fall back to
   `localStorage.ghToken`). Anything we add that touches tokens must use
   the same sentinel.
7. **Boot failures are handled centrally by `gh-auth.js`.** Loader-based
   pages no longer wrap their module script in `try { ... } catch { ... }`.
   The boot chain is just a sequence of `await` calls. Failures propagate
   as unhandled rejections; gh-auth.js's `unhandledrejection` handler
   renders either the 401/403 token-entry form (via the `req` patch) or a
   generic "Boot failed" UI (gated on `document.readyState === 'loading'`).
   Module top-level await keeps readyState at `'loading'` until the chain
   settles, so the gate cleanly distinguishes boot-time rejections from
   later ones (e.g., from a click handler). Pages whose boot lives in a
   classic-script IIFE — where readyState transitions before the IIFE
   awaits resolve — should either convert to `<script type="module">` or
   call `window.ghAuth.bootDone()` at the end of their chain to opt into
   "boot is over, stop showing boot UI" semantics.
8. **A pre-build page boots Alpine inside its import, so its own `gh.load`
   chain always runs late.** This is invariant 4 in its sharpest form. A page
   that does `await import('../dist/web-tools.js')` gets the whole auto-boot
   chain, ending in `alpine-bundle.js`, before the import resolves; the
   `gh.load(...)` calls it writes underneath therefore run *after* Alpine has
   walked the DOM and called `init()`. Every kit such a page loads for itself
   is undefined at component-init time. Which one you notice is arbitrary: it
   is whichever the component touches first, so the same bug surfaced as
   `reviewTarget.parse` on one path and `BranchBrief.fetchBrief` one `await`
   later on another (2026-08-07, `branch.html`, in a real browser).

   The build fixes its own two instances of this by forcing `url-params.js`
   and `repo-address.js` into the auto-boot chain, and
   [`tools/build/build-lib.mjs`](../tools/build/build-lib.mjs) says why in
   those words. That does not extend to a kit only one page wants, so such a
   page declares a **ready gate**: a plain `<script>` *above* the module
   creating `window.__depsReady`, the module resolving `window.__depsDone()`
   in a `finally`, and the component opening `init()` with
   `await window.__depsReady`. The promise has to be created above the module
   because a component that starts during the import would otherwise find the
   promise itself undefined. Held by
   [`tools/test/page-deps-gate.test.mjs`](../tools/test/page-deps-gate.test.mjs),
   which is static: the failure is a race, so a passing run proves nothing and
   only the shape can be pinned.

## What breaks the pattern

A short list of footguns to avoid when adding new files:

- **Adding `import` / `export` to a file loaded via `gh.load()`.** Both are
  invalid inside the loader's `new Function` body and throw at load — they
  are *not* stripped (that rewriting was removed; see "The load mechanism").
  Reach a global or use `await import(...)` instead.
- **Expecting `gh.load()` to hand back a value.** It doesn't — it runs the
  file for side effects and discards the result. Expose via `window.X`,
  `Alpine.data(...)`, or a `GH.prototype` patch; if you genuinely need a
  returned value, that's `read()`, not `load()`.
- **Computing a `gh.load(...)` path at runtime** (`gh.load(name)` or a
  template literal). It loads fine, but the static build walker only sees
  string-literal arguments, so a computed path is invisible to the build and
  won't be cached — the offline page then silently falls back to the network
  for it. Keep load paths literal; see [Load and build](#load-and-build-are-one-contract).
- **Registering `alpine:init` handlers after `alpine-bundle.js` loads.**
  Race depends on Alpine's CDN speed; intermittent. The rule is: all
  component files go before alpine-bundle.
- **Declaring top-level `const X = …` and expecting it to be visible
  elsewhere.** It's local to the eval'd function body and vanishes. Assign
  to `window.X`, or register a side effect.
- **Forgetting the `🎟️GitHubToken` sentinel.** Any new file that wants a
  token should look for that exact sentinel and fall back via
  `try { localStorage.getItem('ghToken') } catch {}` to stay data-URL-safe.
- **Relying on `Alpine.store('…')` at file top level.** Stores only exist
  after `alpine-bundle.js`'s `alpine:init` listener runs. Access them inside
  `init()` / methods / getters, not at the top level of the file.

## Load and build are one contract

The same rules that make a file *loadable* also make a page *buildable* into a
single offline artifact — because the build is the loader, not a separate
pipeline. `tools/build/build.mjs` (and the in-browser FAB export) emit the
real `gh-api.js` with exactly one thing overridden: `GH.prototype.get` reads
from an inlined `path → source` cache instead of the network. Everything
above still applies verbatim — same `new Function('gh', text)`, same
side-effect convention, same timing — only the *origin of the bytes* changes.

So the contract has two readings:

- **Load** (runtime, the dev loop): own code is fetched per-file through the
  contents API, freshest-wins, ref-pinnable with `?use=<ref>`. Edit a file in
  `lib/`, reload, see it. This is what the rest of this doc describes.
- **Build** (delivery): the reachable set of own-code files is frozen into
  `dist/<page>.js`, which a page adopts by pointing its `gh-api.js` import at
  the local build instead of jsDelivr. `bake` goes one further and inlines
  that into the page's HTML, so the page opens with zero own-code network. The
  build still honors `?use=<ref>` (an explicit ref falls through to the
  network), so a built page can be re-pinned for review.

A file that honors the contract is buildable for free — that's the *payoff*
of the discipline, not just its cost. Two consequences follow directly from
the mechanism:

- **Dependency edges must be statically discoverable.** The build's graph
  walker finds what to cache by scanning source for *string-literal*
  `gh.load('…')` / `_selfLoad('…')` arguments. A path computed at runtime
  loads but is invisible to the build, so it won't be cached and the offline
  page falls back to the network for it (the footgun above). Keep load paths
  literal.
- **`gh.load`-style vs. native ESM also decides build-portability.** A
  `gh.load`-loaded file rides into the build automatically; a file pulled in
  with native `import()` is opaque to the build the same way a third-party CDN
  lib is — it stays on the network. So the ESM-vs-`gh.load` choice in the
  options below is *also* a choice about whether the file can ship inside an
  offline build.

The operational side — the four verbs `load → build → bake → export`, the
commands, and the byte-identical `verify-build` guarantee — lives in
[`tools/README.md`](../tools/README.md).

## Options for adding new capability

Roughly in order of "how much do we disturb the current pattern".

### Option A — drop files alongside `alpine-bundle.js` and load them the same way

Best for: more Alpine components (like compression UIs), additional
magics/stores, anything that extends `Alpine.data`/`Alpine.store`.

Rules:
- Use the `document.addEventListener('alpine:init', () => { Alpine.data(…) })`
  idiom.
- No ES imports. If the code needs a library, either (a) add a plain
  `<script src=…>` to the CDN combine in the page, or (b) `await import(...)`
  dynamically inside the component's methods.
- Load it before `alpine-bundle.js` in the page's module script.

Cost: adds one line per page; fine for a handful of additions.

### Option B — extend `gh-api.js` (or its augmentations)

Best for: things every loader-based page wants (retry/backoff for rate
limits, a batch loader, a tiny pub-sub, a token-picker UI helper, a
`persist(key, data)` helper that saves to the user's home repo the way
`show-repo/show-repo.html` currently does).

Rules:
- `gh-api.js` is the ESM root (default export `class GH`); `gh-fetch.js`
  and `gh-store.js` are augmentations loaded via `gh.load(...)` that patch
  `GH.prototype`. Adding methods to either is cheap.
- Put read-only / cached helpers in `gh-fetch.js`; put mutation helpers in
  `gh-store.js`; only put true plumbing (request, cache, parseUrl, load)
  in `gh-api.js`.
- Keep all three import-only / side-effect-free at module level. The page
  decides when to instantiate and which augmentations to load.
- Anything that reaches into Alpine (stores, magics) does *not* belong
  here — that's alpine-bundle's job.

Cost: every loader-based page gets it free. Risk: it becomes a kitchen sink.
Good rule of thumb: only add a method if at least two pages would use it.

### Option C — add a third loader file

Best for: a concern that is not "GitHub access" and not "Alpine init" —
e.g., a component loader convention, a compression kit, a persistent
storage helper.

Rules:
- Decide up front whether it's ESM (loaded via native `import()`) or
  `gh.load`-compatible (plain script). Don't try to be both.
- ESM is better for anything with internal imports or multiple exports.
  Consumers pay one extra `await import(…)` in the module script.
- Plain-script form is only better if the file registers side effects
  against a global Alpine (which is what `alpineComponents/*.js` already
  does).
- Name it clearly: `foo-kit.js` for ESM with exports, `foo-register.js`
  for side-effect-only scripts meant for `gh.load`, or similar.

Current precedent: `gh-api.js` is native ESM. `gh-fetch.js` and
`gh-store.js` are plain-script augmentations loaded via `gh.load` that
mutate `GH.prototype`. `alpineComponents/*.js` are plain-script
side-effect files loaded via `gh.load`. Pick the style deliberately;
ESM and `gh.load`-style files can't be interchanged freely because of
the `new Function()` constraint.

### Option D — step outside the pattern for one-off pages

Best for: pages that don't need repo browsing at all (e.g., the simple
`pages/stories/bookmarklets-story.html` or `table-compress.html`).

Rules:
- Just use CDN Alpine + inline components, like the existing simple pages.
- Keep any "kit" files as plain ESM modules under a dedicated folder and
  `import` them directly in a `<script type="module">` block. No `gh.load`,
  no alpine-bundle.

Cost: more duplication across pages. Benefit: maximum independence and
zero bootstrap machinery.

## Concrete framing for "pulling in Alp-style capability"

Mapping the options to what Alp offered:

- **Compression helpers (`brotli.js`, `gzip.js`, `acorn.js`, `text.js`)** —
  these are ESM with internal imports. They are **Option C, ESM flavor**:
  drop them under `compression/` and `import` them directly from pages.
  They can't go through `gh.load`. They also don't need to, because they
  don't touch Alpine.

- **Tabulator helpers (`kits/tb.js` — `downloadJson`, `downloadZip`)** —
  same thing, ESM helpers. Either **Option C** or inline into
  `alpineComponents/viewer.js` since that's where Tabulator
  is used today.

- **Dexie key-value wrapper (`kits/dexie.js`)** — ESM, fits **Option C**.
  Useful enough to live in its own `storage.js` or similar and be imported
  by any page that wants persistence beyond localStorage.

- **Alpine-data components (Alp's `alp-tb`, `alp-jse`, `inspector`)** —
  these would be **Option A**-shaped if rewritten as
  `Alpine.data('jse', () => …)` registrations. But they currently depend
  on Alp's path/save/load/ping runtime — either we port that runtime (big)
  or rewrite each component against our own store. Probably skip unless
  we commit to a storage model.

- **Path/save/load/ping model (`core.js`)** — if we ever want it, it's a
  new loader file. **Option C, plain-script flavor, or ESM** — and
  the choice matters: if we want individual components (like an updated
  `alpineComponents/foo.js`) to call `save()`/`load()`, the runtime needs
  to be attached to globals before alpine-bundle loads. ESM with dynamic
  import + `window.assign` is fine; plain-script loaded ahead of
  alpine-bundle is fine too.

## Quick checklist for "can I load this file through gh.load?"

- [ ] Any `import` / `export` at the top? → **Remove them — they throw at
      load. Reach a global or use `await import(...)`.**
- [ ] Does it need to produce a value for the caller? → **That's `read()`,
      not `load()`. End the file with `return X;` and call `gh.read(path)`.**
- [ ] Side-effect file (component / kit / augmentation)? → **Expose via
      `window.X`, `Alpine.data(...)`, or a `GH.prototype` patch — `load()`
      ignores the return value.**
- [ ] Are its `gh.load(...)` paths string literals? → **Keep them literal so
      the build can see them; a computed path won't be cached offline.**
- [ ] Does it use `Alpine.store(...)` / `Alpine.data(...)`? → **Register them
      inside `document.addEventListener('alpine:init', …)` and load the file
      before `alpine-bundle.js`.**
- [ ] Does it need a token? → **Use the `🎟️GitHubToken` sentinel with the
      `localStorage.ghToken` fallback, data-URL-safe.**

If a file is genuinely modular (real `import`/`export`), use a native
`import()` instead of `gh.load()` for it. Mixing is fine: a page can do

```js
import GH from '.../lib/gh-api.js';
const { text } = await import('.../compression/text.js');
const gh = new GH({ token, repo });
await gh.load('gh-fetch.js');
await gh.load('alpineComponents/foo.js');
await gh.load('alpine-bundle.js');
```

and everything orders correctly as long as each `await` completes before
the next starts.
