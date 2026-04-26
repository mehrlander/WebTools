# kits/

Themed logic libraries loaded via `gh.load`. Each kit is a plain script
(no `import`/`export`) that populates a single namespace on `window`.

## Concept

A **kit** is the third category of file in this repo, alongside:

- **Root-level scaffolding** — `gh-fetch.js`, `alpine-bundle.js`,
  `view-registry.js`, `page-toggle.js`, `beam-in.js`. One-of-a-kind
  singletons.
- **`alpineComponents/*.js`** — UI components that register with
  `Alpine.data(name, fn)` inside `alpine:init`.
- **`kits/*.js`** — non-UI logic libraries that register a namespace on
  `window`. No Alpine involvement, no rendering. Pure functions and/or
  stateful service objects.

The shape rules (so the file works through `gh.load`):

1. No static `import` / `export` statements at the top level. (`gh.load`
   uses `new Function(body)()`, which strips `export` keywords and
   chokes on `import`.)
2. Wrap the file body in an IIFE — `(() => { ... })();` — to keep helpers
   private.
3. End the IIFE by assigning the public namespace: `window.foo = { ... };`
4. Third-party libraries load lazily inside functions via dynamic
   `await import('https://unpkg.com/...')`. That's an expression and
   works fine inside `new Function`'s body.
5. Internal "imports" between kits are reads from `window.otherKit`.
   Order them in the page's `gh.load` chain accordingly.

See `SCAFFOLDING.md` at the repo root for the full loader contract.

## Current kits

### compression.js

Brotli/Gzip compression, JS detection (acorn), and bookmarklet packing.
Salvaged from Alp's `utils/kits/{brotli,gzip,acorn,text}.js` — the
originals live at `archive/alp/repo/utils/kits/` for reference.

After loading:

```js
window.compression.brotli  // { compress, decompress, detect, findChunks }
window.compression.gzip    // { compress, decompress, detect, findChunks, sizeOf }
window.compression.acorn   // { parse, isJS }
window.compression.text    // { detectCompressionType, findCompressedChunks,
                            //   templates, assess, pack, process }
```

`text.process(input, opts)` is the high-level entry point that drives the
compression-helper UI: it assesses input, optionally compresses with
brotli or gzip, and optionally packs the result as a self-decompressing
`javascript:` bookmarklet.

`text.findCompressedChunks(str)` scans for `BR64:` / `GZ64:` payloads
embedded in arbitrary text. Detection regexes accept an optional label:
`BR64("mylabel"):...`.

### fills.js

daisyUI/Tailwind template-string helpers salvaged from
`archive/alp/repo/utils/fills.js`. Pure functions returning HTML
strings; zero runtime deps. Designed to be composed inside Alpine
`x-data` templates or anywhere HTML is built by string concatenation.

```js
window.fills.tip(mods, trigger, content)
window.fills.lines(mods, arr)
window.fills.btn(mods, label, click, iconClasses?, extraClasses?)
window.fills.toolbar(mods, ...items)
window.fills.modal(inner)
window.fills.saveIndicator()  // assumes `saving` in surrounding x-data
window.fills.pathInput()      // assumes `_path`/`path` in surrounding x-data
```

`mods` is an array of short tokens (e.g. `['xs','bottom']`). Recognized
tokens map to daisyUI/Tailwind classes; unrecognized tokens are ignored.
See `pages/demos/fills.html` for live examples.

## Salvage roadmap

`pages/compression-helper.html` still loads Alp directly:

```html
<script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@f93d156ef88d/alp.js"></script>
```

and uses Alp custom elements (`<alp-compress-output>`,
`<alp-compress-input>`), Alp's `alp.kit.text` / `alp.kit.acorn`, and
`alp.fills.tip|pathInput|lines`.

The plan is **side-by-side**: leave that page working, salvage Alp's
remaining infrastructure into `kits/`, then build a fresh
`pages/compression-helper-v2.html` (or similar) that consumes the kits
with no external Alp dependency. Each kit ships with a small demo page
under `pages/demos/`.

Roadmap:

1. ✅ `kits/compression.js` — text/brotli/gzip/acorn primitives.
2. ✅ `kits/fills.js` + `pages/demos/fills.html` — template helpers.
3. ⏳ `kits/persistence.js` + `pages/demos/persistence.html` —
   `save(path, data)` / `load(path)` / `remove(path)` / `list(path)`
   over [`idb-keyval`](https://github.com/jakearchibald/idb-keyval).
   Path syntax `"db.store.record"` (or `"page.key"` defaulting both
   halves to the leading segment); per-`db.store` `createStore` cache.
4. ⏳ `kits/messaging.js` + `pages/demos/messaging.html` — `ping(path,
   occasion, data)` / `subscribe(path, fn)` pub-sub keyed on the same
   parsed path.
5. ⏳ `kits/component.js` + `pages/demos/component.html` — thin
   `defineComponent(name, tpl, data)` over Alpine + custom elements.
   No path registry, no Dexie, no implicit ping bus; consumers wire
   persistence/messaging in if they want them.
6. ⏳ `pages/compression-helper-v2.html` — the integration test that
   uses every kit together to replace the existing page's behavior.

The original page keeps working throughout. Once the v2 is verified
in a browser we can decide whether to retire the original.
