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

### persistence.js

String-path key/value over
[`idb-keyval`](https://github.com/jakearchibald/idb-keyval). All values
go through IndexedDB's structured clone, so `Uint8Array`, `Date`,
`Map`, `Blob`, etc. round-trip with their types intact.

```js
await window.persistence.save('myPage.foo', { a: 1, when: new Date() });
await window.persistence.load('myPage.foo');
await window.persistence.remove('myPage.foo');
await window.persistence.list('myPage.x');         // keys in myPage/default
await window.persistence.entries('myPage.x');      // [key, value][]
await window.persistence.clearStore('myPage.x');   // wipe one store
window.persistence.parsePath('a.b.c');             // { db, store, key }
```

Path syntax: `"<db>.<key>"` defaults `store="default"`; `"<db>.<store>.<key>"`
is explicit. Single-segment paths throw — every caller picks its own
namespace so devtools shows separate IndexedDB databases and data from
different pages can't collide. `createStore` handles are cached per
`db|store`. See `pages/demos/persistence.html` for live examples.

### messaging.js

In-memory pub/sub keyed on opaque path strings. No parent/child path
propagation — exact-match only. Subscribers receive
`(occasion, data, path)`.

```js
const off = window.messaging.subscribe('compress.sel', (occ, data) => { ... });
window.messaging.publish('compress.sel', 'change', { start: 0, end: 4 });
window.messaging.subscriberCount('compress.sel');
window.messaging.activePaths();
off();
```

Path strings are conventionally the same shape as `persistence.js`
(`"<db>.<store>.<key>"`) but this kit doesn't parse them — keys are
matched verbatim. See `pages/demos/messaging.html` for live examples.

### component.js

Thin wrapper for registering an Alpine-backed custom element.

```js
window.component.defineComponent('my-counter',
  attrs => `<button @click="inc()" x-text="count"></button>`,
  attrs => ({ count: Number(attrs.start ?? 0), inc() { this.count++ } })
);
<my-counter start="5"></my-counter>
window.component.find('my-counter').inc();   // reach in from outside
```

Tag names must contain a hyphen (custom-element rule). After Alpine
binds, the data object is stashed on the host as `host.__data`. If the
data factory's object has an `onMount(host)` method it's called once
after binding — that's where you'd subscribe to `messaging` or load
`persistence`.

No path registry, no implicit message bus, no schema. Consumers wire
persistence/messaging in by hand. See `pages/demos/component.html` for
live examples; see `pages/compression-helper-v2.html` for the
integration test wiring all kits together.

## Salvage status

The original `pages/compression-helper.html` still loads Alp directly
(`<script src=".../mehrlander/Alp@.../alp.js">`) and continues to work.
`pages/compression-helper-v2.html` is the in-repo reimplementation
that replaces every Alp dependency with `kits/` modules:

- `alp.kit.text` / `alp.kit.acorn` → `compression.text` / `compression.acorn`
- `alp.fills.tip|lines` → `fills.tip|lines`
- `alp.define` → `component.defineComponent`
- IndexedDB-backed `save()`/`load()` → `persistence.save/load` (idb-keyval)
- `ping('sel')` / `onPing('sel', sender)` → `messaging.publish/subscribe`

The original page is the safety net; v2 lives next to it until verified
end-to-end in a browser. After that, the original can be retired and
the external Alp CDN reference goes away.

| Kit | Demo | Status |
|---|---|---|
| `compression.js` | (used in `compression-helper-v2.html`) | done |
| `fills.js` | `pages/demos/fills.html` | done |
| `persistence.js` | `pages/demos/persistence.html` | done |
| `messaging.js` | `pages/demos/messaging.html` | done |
| `component.js` | `pages/demos/component.html` | done |
| (integration) | `pages/compression-helper-v2.html` | done — needs browser verification |
