# Alp Assessment Notes

A reading of the Alp repo snapshot at `alp/git-ingest.md`, unpacked into
`alp/repo/`. The goal here is to inventory what Alp contains, compare it to
what web-tools already does, and flag what's worth porting.

## How this directory is organized

| Path | What it is |
| --- | --- |
| `alp/git-ingest.md` | Original gitingest dump of the Alp repo. Source of truth. |
| `alp/repo/` | Unpacked files from the dump. Recreated by `/tmp/unpack_alp.py`. Don't hand-edit; regenerate. |
| `alp/NOTES.md` | This file — assessment and porting plan. |

If you re-import a newer Alp dump: replace `git-ingest.md`, rerun the unpack,
and diff `alp/repo/` against the previous snapshot.

## Snapshot summary

37 files, ~148 KB. The repo is a browser-only, CDN-loadable framework that
layers onto Alpine.js + Dexie. It has four conceptual layers:

1. **Boot & proxy system** (`alp.js`, `core.js`) — SHA-pinned ESM loader,
   IndexedDB/Dexie setup with a MemoryDb fallback, a proxy-queue that lets
   user code call `alp.*` before implementations finish loading.
2. **Storage model** (`utils/path.js`, `utils/db-manager.js`, `utils/memory-db.js`)
   — Path format `[db/][store:]record`, multi-db/multi-store, identical API
   for Dexie and the memory fallback.
3. **Component system** (`alp.define`, `Alp` custom-element base, `alp.ping`)
   — Each component is a web component `<alp-{name}>` whose state is bound
   to a path. Saves at a path notify all components bound there via
   `onPing('save-record', data)`.
4. **Kits & Fills** (`utils/kits/*.js`, `utils/fills.js`) — Lazy-loaded
   third-party adapters (brotli, gzip, acorn, dexie, jse, jszip, leg, tb,
   text) and a few DaisyUI-themed HTML snippet helpers.

Plus a handful of demo/example pages and one real app (`bill-browser.html`)
that uses the WA Legislature kit.

## File-by-file inventory

### Core / bootstrap

- `alp.js` (78 lines) — Entry point. Parses `?token=`, fetches latest commit
  SHA from GitHub, sets `window.__alp = { version, token, isAuth, base }`,
  then dynamically imports `core.js?v={sha}`. Also builds the proxy-queue
  that exposes `window.alp`, `alp.kit`, `alp.fills` before real objects load.
- `alp-dev.js` (483 lines) — Single-file dev build: combines `alp.js` +
  `core.js`, strips cache-busting, adds a "fail-fast" proxy that throws loud
  errors on typos / missing methods. Useful reference for how the proxy
  system is supposed to behave.
- `core.js` (324 lines) — The heart. Loads CDN deps (Tailwind, DaisyUI,
  Dexie, Tabulator, Phosphor), imports utils, wires up DB with IndexedDB
  detection, installs console capture, defines the `Alp` base element,
  `define()`, `mk()`, `find()`, `ping()`, `saveRecord`/`loadRecord`/`deleteRecord`,
  stores its own source in IndexedDB for inspection, and exports the `alp` object.

### Storage

- `utils/path.js` (100 lines) — Pure functions: `parsePath`, `buildPath`,
  `buildFullPath`, `displayPath`, `pathsEqual`. Path grammar is
  `[db/][store:]record`.
- `utils/db-manager.js` (140 lines) — `dbManager` singleton. Tracks multiple
  Dexie (or MemoryDb) instances and their stores. Exposes
  `createDb`/`createStore`/`getStore`/`hasDb`/`listDbs`.
- `utils/memory-db.js` (134 lines) — Dexie-shaped in-memory fallback for
  Safari data-URL contexts etc. Supports `.get/.put/.delete/.toArray/.where().startsWith()`.

### Component / UI helpers

- `utils/fills.js` (54 lines) — DaisyUI HTML snippet builders: `pathInput`,
  `saveIndicator`, `toolbar`, `btn`, `modal`, `tip`, `lines`. String-returning
  helpers meant to be interpolated into Alpine templates.
- `utils/kit.js` (11 lines) — Just re-exports the kits.
- `utils/kits/index.js` — Filename list for boot-time preloading.

### Kits (third-party adapters)

- `brotli.js` (30 lines) — `BR64(:|"(label)":)` prefix protocol over
  brotli-wasm. `.compress / .decompress / .detect / .findChunks`.
- `gzip.js` (34 lines) — Same protocol but `GZ64` prefix, uses native
  `CompressionStream`. Plus `sizeOf()`.
- `acorn.js` (10 lines) — Lazy loader for acorn + `isJS()` helper.
- `text.js` (95 lines) — Built on brotli+gzip+acorn. Provides `assess()`,
  `pack()` (wraps content as a `javascript:` bookmarklet with optional
  decompression), `process()` (the full pipeline consumed by
  `compression-helper.html`), and `detectCompressionType` / `findCompressedChunks`.
- `dexie.js` (138 lines) — Standalone Dexie key-value store wrapper.
  Independent of `core.js`. This is the most portable piece.
- `jse.js` (9 lines) — Lazy loader for `vanilla-jsoneditor`.
- `jszip.js` (6 lines) — Lazy loader for JSZip.
- `tb.js` (66 lines) — Tabulator init + downloadJson/downloadZip helpers.
- `leg.js` (152 lines) — Washington Legislature bill scraper (directory
  listing parse, bill XML parse, biennium fetch). Very domain-specific.

### Components (bundled, auto-registered by `core.js`)

- `inspector.js` (97 lines) — Auto-mounted bottom-right gear icon that opens
  a modal listing every record in every db/store, with JSON editor.
- `bill-table.js` (235 lines) — WA Legislature table UI.
- `bill-table-nested.js` (214 lines) — Same, but demonstrates composing
  `<alp-tb>` inside another component.
- `tb.js` (100 lines) — Generic Tabulator wrapper component.
- `tb-nested.js` (25 lines) — Tiny demo of nesting `<alp-tb>`.
- `jse.js` (97 lines) — Generic JSON editor component with db/store/record browsing.

### Demos / examples / docs

- `example.html`, `example-dev.html`, `db-canvas.html`, `bill-browser.html`
- `demos/{tb,tb-nested,jse,bill-table}.html`
- `ShortcutTemplates/json-viewer.html` + its README (templates for Apple
  Shortcuts `📲Input` placeholder substitution — orthogonal to the main framework).
- `README.md`, `FirstSamples.md`

## What compression-helper.html actually needs from Alp

Only these surfaces, used at runtime in the current page:

| Symbol | Source file |
| --- | --- |
| `alp.kit.text.process` | `utils/kits/text.js` |
| `alp.kit.text.findCompressedChunks` | `utils/kits/text.js` |
| `alp.kit.text.detectCompressionType` | `utils/kits/text.js` |
| `alp.kit.acorn.isJS` | `utils/kits/acorn.js` |
| `alp.kit.brotli.*` (transitive, via text.js) | `utils/kits/brotli.js` |
| `alp.kit.gzip.*` (transitive, via text.js) | `utils/kits/gzip.js` |
| `alp.fills.tip` / `pathInput` / `lines` | `utils/fills.js` |
| `alp.define` + lifecycle (`onPing`, `save`, `load`, `ping`, `_path`) | `core.js` |
| Cross-component path-pinging between `<alp-compress-input>` and `<alp-compress-output>` | `core.js` |
| IndexedDB persistence at `alp.compress` path | `core.js` (+ dexie) |

Everything else Alp offers (multi-db paths, inspector, kits.jse/tb/leg,
memory-db, SHA versioning, component source mirror) is unused by
compression-helper. The decoupling job is smaller than it looks.

## Overlap with web-tools as it stands today

web-tools currently ships:

- `alpine-bundle.js` — tiny Alpine init with `$clip`/`$paste`/`toast` magics
  and a `browser` store.
- `alpineComponents/{counter,navigator,viewer,viewer-assembled,repo}.js` —
  classic `Alpine.data('name', …)` components wired to `Alpine.store('browser')`.
- `gh-fetch.js` — ESM `GH` class for listing/fetching GitHub contents.
- `view-registry.js` — per-extension render modules (raw/code/preview/table/codepen).
- `page-toggle.js`, `beam-in.js` — small bookmarklet / paste-in shims.
- `pages/*.html` — self-contained pages loading the above from jsDelivr.
- `archive/` — earlier WebTools-era components (buttons/modals/tabs).

### Where Alp and web-tools diverge

| Concern | web-tools today | Alp |
| --- | --- | --- |
| Component style | `Alpine.data(name, fn)` inside regular DOM | Custom element `<alp-{name}>` rendering an Alpine root internally |
| State sharing | `Alpine.store('browser')` + direct `__foo` handles on elements | Path-bound components + `alp.ping(path, data, occasion)` pub/sub |
| Persistence | ad-hoc: `localStorage`, manual IndexedDB | baked-in: every component has `this.save/load/del` at its path |
| GitHub access | `GH` class (explicit instance) | `alp.js` fetches one SHA at boot for cache-busting only |
| Cache busting | jsDelivr `@commit` pins in HTML | Runtime SHA → `?v=` on every import |
| Third-party libs | loaded per-page in the HTML | centralized CDN loads in `core.js` + lazy kits |
| Tables / JSON editor | `view-registry` loads Tabulator for one view mode | first-class `alp-tb` / `alp-jse` components with persistence and ZIP export |
| Compression | delegated to Alp | delegated to Alp |
| Inspector / debugging | none | auto-mounted modal data browser |
| HTML budget per page | small | bigger, but `alp.js` centralizes dependencies |

## What's worth lifting

**Clear wins, small surface, mostly zero-dependency:**

- `utils/kits/brotli.js` + `utils/kits/gzip.js` + `utils/kits/acorn.js` —
  self-contained, lazy-loaded. These three plus `text.js` fully unblock
  compression-helper.
- `utils/kits/text.js` — the actual `assess/pack/process` logic the
  compression page drives. Worth bringing in verbatim.
- `utils/kits/dexie.js` — a nice minimal Dexie KV wrapper. Useful any time
  a page wants persistence without reaching for Alp's full component model.
- `utils/kits/tb.js` — Tabulator helpers (`downloadJson`, `downloadZip`) are
  reusable without adopting components.
- `view-registry.js` already covers a lot of `alp-jse` / `alp-tb`'s use
  cases, so we probably don't need those whole components.

**Medium — adoptable if we want Alp's component model:**

- `utils/path.js` (path grammar) — pleasant once you need multi-db.
- `utils/fills.js` — only worth it if we adopt template-string components.
- `components/inspector.js` — delightful during development, but depends on
  `alp.load()` cataloging every store, which assumes Alp's full DB manager.

**Probably skip (for now):**

- `alp.js` + `core.js` boot machinery. The proxy-queue is clever but it's a
  lot of indirection for a project whose goal is to be less opinionated.
- `utils/db-manager.js` + `utils/memory-db.js` — only useful if we commit to
  Alp's component model.
- `utils/kits/leg.js` — WA-specific scraper; unless bills are a target here,
  leave it in Alp.
- `ShortcutTemplates/` — a separate Apple Shortcuts workflow, unrelated.

## Suggested next step: decouple compression-helper

The smallest move that gets the stated goal:

1. Pull `brotli.js`, `gzip.js`, `acorn.js`, `text.js` into
   `web-tools/compression/` as plain ESM (no Alp imports, no path helpers).
   They have zero dependencies beyond the `brotli-wasm` / `acorn` CDN imports
   they already do.
2. Rewrite `pages/compression-helper.html` to:
   - Import that local ESM `text.js`.
   - Replace `alp-compress-output` / `alp-compress-input` custom elements
     with a single `x-data` Alpine block (or two linked stores) — no custom
     elements needed.
   - Replace `this.save/load/ping` with either a small dexie wrapper (port
     of Alp's `dexie.js`) or plain `localStorage` if persistence-per-path
     isn't actually needed here.
   - Drop `alp.fills.tip/pathInput/lines` in favor of inline DaisyUI markup;
     it's a handful of spans.
3. Once decoupled, delete the `<script src=".../Alp@f93d156ef88d/alp.js">`
   pin from the page.

This keeps the "simpler/smaller" ethos and still captures the actually-useful
work from Alp (the compression protocol + packing bookmarklet logic).

## Things to decide before porting components

- Do we want a path-addressed, IndexedDB-backed component model at all, or
  should web-tools stay in the "each page owns its storage" lane? Alp's
  biggest value-add is the former; if we say no, most of `core.js` is dead
  weight for us.
- If yes, do we adopt Alp's `<alp-*>` custom-element wrapping or keep the
  existing `Alpine.data(name, fn)` idiom and just bolt the `path/save/load/ping`
  helpers onto it as a mixin?
- Do we want a centralized CDN-deps loader like `core.js` does, or keep
  dependencies declared per-page?

These are the three forks in the road. The answers to them determine which
of the "medium" bucket above is worth pulling in.
