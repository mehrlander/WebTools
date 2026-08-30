# kits/

Themed logic libraries loaded via `gh.load`. Each kit is a plain script
(no `import`/`export`) that populates a single namespace on `window`.

## Concept

The repo's code layers, and which folder a new file belongs in, are stated once
in [`docs/code-layers.md`](../../docs/code-layers.md). What follows is the kit
shelf's own admission rule.

A **kit** is a logic library that registers a namespace on `window`, with no
Alpine coupling. (The daisyUI/Tailwind string helpers that used to live here as
`fills.js` now hang off `window.html` in `vanilla-bundle.js`.)

**That is the whole rule, and as of 2026-08-07 it is also the whole boundary.**
This shelf holds every logic module; `lib/` root keeps only the loader, the
files extending its prototype, and the boot bundles. A kit is emphatically not a
"portable capability" and not "cross-app logic": both rules were written down,
measured against this shelf, and found false, which is why the surviving rule
sorts on attachment alone. The reasoning is in
[`docs/code-layers.md`](../../docs/code-layers.md).

The tree matches the rule as of 2026-08-08
([`lib-root-kit-migration-dind5t`](../../tracker/tasks/lib-root-kit-migration-dind5t.md)):
22 kits moved in from `lib/` root, `build.js` moved out to `lib/` root (it
extends `GH.prototype`, which the rule makes scaffolding), and
`tools/test/code-layers.test.mjs` holds the boundary in all three directions,
so a misfiled arrival fails the suite rather than waiting to be noticed.

The line is **no Alpine and no DOM opinions of its own**, not "no DOM." This
entry used to say "no DOM rendering," and the shelf has outgrown it: `cm6.js`
mounts a live editor into a host element you hand it, `io.js` drives file inputs
and the clipboard, `pdf.js` renders pages and projects geometry into screen
space. What a kit must not do is decide where it lives, own reactive state, or
assume a framework. It takes the host it is given and returns a handle. A kit
that wants Alpine reactivity gets a component wrapper: `cm-editor.js` over
`cm6.js` is the reference pair.

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

See [`docs/loader.md`](../../docs/loader.md) for the full loader contract.

## Current kits

The long-form sections below predate the 2026-08-08 migration and cover the
original shelf. The 22 kits that moved in from `lib/` root that day are listed
here with their namespace and role; each carries its full story in its own
header comment, which is the authoritative doc for this group. **(boot)** marks
membership in gh-boot.js's declared BOOT manifest, a fact about cost that the
folder deliberately no longer encodes.

| Kit | Namespace | Role |
|---|---|---|
| `branch-status.js` | `BranchStatus` | branch-estate scan math: the content-level landed/stranded signal |
| `chat-render.js` | `chatRender` | chat transcript renderer; fenced code promoted to live artifacts |
| `claude-mark.js` | `claudeMark` | the Claude logomark, as markup or a node, from one path |
| `content-registry.js` | `ContentRegistry` | the epistemic content registry (`data/design/content.csv`), read in the browser |
| `data-payload.js` | `DataPayload` | reading a data toss: one rule for what a payload is |
| `estate-search.js` | `EstateSearch` | the estate's search calls (tree, names, code, sessions), one cache |
| `github-links.js` | `GithubLinks` | the GitHub destinations for one repo, as menu rows |
| `portable-align.js` | `PortableAlign` | pure assessment of a repo's alignment with the portable set |
| `repo-activity-cache.js` | `RepoActivityCache` | per-repo activity snapshots folded into one cache |
| `repo-address.js` | `RepoAddress` | the `owner/repo[@ref]:path` address grammar **(boot)** |
| `repo-checks.js` | `RepoChecks` | declared staleness checks for a repo, evaluated on sight |
| `repo-config-cache.js` | `RepoConfigCache` | `.web-tools.json` aggregate, history, and alignment grade |
| `repo-mailbox.js` | `RepoMailbox` | the private git-backed request/response channel |
| `repo-proposals.js` | `RepoProposals` | cross-repo edit proposals, the mailbox's write side |
| `repo-sessions-cache.js` | `RepoSessionsCache` | session-record aggregate over the private registry |
| `session-render.js` | `sessionRender` | a session record as a readable, paged conversation |
| `shorter-payload.js` | `ShorterPayload` | reading a shorter toss |
| `source-peek.js` | `SourcePeek` | the hover card behind an exact-file GitHub jump-over **(boot;** the manifest calls `install()`, the kit no longer self-installs**)** |
| `subject-channel.js` | `subjectChannel` | telling the FAB sidebar which file a surface is showing, and giving the page its own back |
| `surface.js` | `Surface` | the surface envelope, in one place **(boot)** |
| `swipe-deck.js` | `swipeDeck` | the house swipe format and its fullscreen takeover |
| `traffic.js` | `Traffic` | the pure read over the traffic ledger gh-boot collects **(boot)** |
| `url-params.js` | `UrlParams` | a page's own input params, fragment first, query fallback |
| `vanilla-demo.js` | `demo` | the living-documentation demo format |

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
`BR64("mylabel"):...`. See `kits/demos/compression.html` for live,
editable examples.

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
`db|store`. See `kits/demos/persistence.html` for live examples.

#### Collections

`collection(path)` is a record-bag API on top of the same idb-keyval store.
Use it when you have a list of records (with ids) instead of a single
blob. The path is `"<db>.<store>"` — the store IS the collection; each
record is one entry keyed by its id.

```js
const items = persistence.collection('dataShelf.items');
const saved = await items.put({ name: 'foo', code: '...' });  // id auto-assigned
await items.get(saved.id);
await items.delete(saved.id);
await items.all();         // [{id, ...}, ...]
await items.find(r => r.tags?.includes('snippet'));
await items.count();
await items.clear();
```

`put` preserves an incoming `id` if present (so re-imports overwrite
cleanly) and assigns a `crypto.randomUUID()` otherwise. There are no
schemas, indexes, or migrations — queries are JS over `all()`. For
collections that outgrow that (millions of records, indexed lookups),
extend the kit with raw-IDB helpers rather than introducing a second
library.

#### IndexedDB introspection

`persistence.idb` is a read-only window into whatever IndexedDB on this
origin holds — including databases this kit didn't create. Used by the
data-shelf importer to migrate from legacy Dexie databases, and useful
anywhere a page wants to surface "what's in IDB?"

```js
await persistence.idb.databases();           // [{name, version}, ...]
await persistence.idb.stores('DataJarDB');   // ['items', 'meta', ...]
await persistence.idb.count('DataJarDB', 'items');
await persistence.idb.readAll('DataJarDB', 'items');  // records[]
```

No writes, no deletes — read-only is the trust boundary. `databases()`
returns `[]` on older Firefox where `indexedDB.databases()` isn't
implemented; treat that as "unknown" not "empty".

### io.js

User-data ingress/egress: file picker, file download, blob preview, and
clipboard. JSZip is loaded lazily from
`cdn.jsdelivr.net/npm/jszip@3.10.1/+esm` only when `saveZip` is called.

```js
await window.io.pick('image/*')                 // → ArrayBuffer
await window.io.pickText('.json')               // → string
window.io.save(blob, 'out.bin')                 // download Blob/typed-array
window.io.saveJson({ a: 1 }, 'data.json')       // download as JSON
await window.io.saveZip([
  { path: 'a.txt', data: 'hello' },
  { path: 'remote.png', url: '/foo.png' }
], 'bundle.zip')
window.io.show(blob, 'application/pdf')         // open in popup window
await window.io.copy('text')                    // clipboard write
await window.io.paste()                         // clipboard read
```

`copy()` and `paste()` mirror the same three branches: a devtools
focus-wait branch (when `document.hasFocus()` is false they wait for
the next page click and retry), the modern `navigator.clipboard` API
when available in a secure context, and a hidden `<textarea>` +
`execCommand` legacy fallback for non-secure contexts like `data:`
URLs and older iOS Safari. `paste()` throws `Paste unavailable in
this context` if all branches fail (e.g. Firefox desktop, where
`readText` is gated and `execCommand('paste')` is blocked). Each
branch logs which path it took to the console. Note that wrapping
`io.paste()` in `setTimeout` may break the user-gesture chain on iOS
16+ — call it directly from the click handler. `pick` / `pickText`
reject on dialog cancel via the `cancel` event. See
`kits/demos/io.html` for live examples.

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
matched verbatim. See `kits/demos/messaging.html` for live examples.

### data-shelf.js

Record-shape conventions for the persistent scratch shelf used by
`popups/data-shelf.html`. Records live in `persistence.collection('dataShelf.items')`;
this kit defines the valid record shape, the `SHELF_TYPES` enum
(`js | html | json | text`), and the predicates / coercion used by the
data-shelf importer when ingesting records from legacy IndexedDB
databases.

```js
window.dataShelf.SHELF_TYPES        // ['js','html','json','text']
window.dataShelf.isShelfShaped(r)   // boolean — minimal shape check
```

UI metadata for each type (label, badge, exec) lives on the data-shelf
page in `cfg.types`; the canonical set of valid type names lives here so
the importer doesn't drift from the page.

### console.js

Console retention/filter/subscribe layer, auto-loaded by `gh-boot.js` after
`gh-fetch.js`. It wraps `console.{log,info,warn,error,debug,table}` *on top
of* gh-api.js's existing hook (gh-api.js stays untouched — it's cache-shy)
and retains structured entries so a renderer can show JSON trees / tables,
not just flattened strings.

```js
console.history                       // live array of retained entries
const off = console.subscribe(fn);    // replays history, then streams new
                                      //   entries; fn gets { clear:true } on clear
console.filter({ level:'error', text:'fetch' });  // query over history
console.clear();                      // clears retained history too
window.consoleKit.truncated;          // count dropped past the 1000-entry cap
```

Each entry is `{ level, args, msg, time, kind? }`: `args` is a
`structuredClone` snapshot of the original call args (JSON-safe fallback,
then `null`), `msg` is the pre-joined text (copy + no-structure fallback).
`console.table` entries also carry `{ table:{data,columns}, kind:'table' }`.

The renderer is `alpineComponents/console.js` (the `debugConsole` component),
which the FAB embeds and `pages/demos/console-kit-demo.html` exercises standalone.
It falls back to gh-api's raw `window.__consoleLogs` when this kit is absent.
Extending native `console` (rather than a separate `journal` global) keeps
callers writing plain `console.log()`; it's the same additive tactic
`console/base.js` uses for its formatting helpers, and the two are
orthogonal (this kit owns retention; base.js owns `style/box/see`).

### cm6.js

Framework-free [CodeMirror 6](https://codemirror.net/) editor factory. No
Alpine, no DOM opinions beyond mounting into the host you pass. The six CM6
modules load lazily (and once) from esm.sh on first `create()`, deduped by
shared sub-deps, with per-import retry/backoff and attribution so a failed or
hung import names the URL it came from (`?cm6stall=` / `?cm6fail=` reproduce
those paths).

```js
const ed = await window.cm6.create(hostEl, {
  value, language, wrap, lineNumbers, readOnly, fontSize, setup, // 'minimal'|'basic'
  onChange, onSelection, onRun,                                  // onRun binds Mod-Enter
});
ed.getValue(); ed.setValue(str); ed.setLanguage('js'|'html'|'plain');
ed.setWrap(b); ed.setLineNumbers(b); ed.setReadOnly(b); ed.setFontSize(px);
ed.focus(); ed.destroy(); ed.view;

window.cm6.preload();      // warm the module load without creating an editor
window.cm6.loadStatus();   // per-import state, for diagnosing a stall
```

**Load-order requirement:** `cm6` populates `window.cm6`, and the Alpine editors
that build on it — `alpineComponents/cm-editor.js`, `compress-input-cm.js` —
guard at mount and log `window.cm6 is missing` if it isn't there. Put
`gh.load('kits/cm6.js')` ahead of those components in the page's load chain.
Used directly (no Alpine) by `vanilla-demo.js`.

### proof.js

Sandboxed proof documents: code in, self-contained `srcdoc` HTML out. Lifted
out of `vanilla-demo.js` so the demo format and `chat-render.js` share one
copy of the sandbox logic. String-building only — mounting the iframe (and
sizing it from the reporter's `postMessage`) stays with the caller.

```js
proof.doc('render', code, opts);    // code is body markup
proof.doc('context', code, opts);   // injected at {{slot}} in opts.context
proof.doc('jsrender', code, opts);  // JS that builds nodes into the doc body
proof.doc('console', code, opts);   // JS; console output posted as {__c:{level,text}}
// opts: { tw, daisy, inject, base, context }
proof.head(opts); proof.reporter; proof.guard(s);
```

Every doc targets an iframe with `sandbox="allow-scripts"` (opaque origin).
The `render` family posts document height as `{__h: number}`; `console` docs
are for hidden frames, streaming output instead.

**Load-order requirement:** `vanilla-demo.js` and `chat-render.js` read
`window.proof` at call time; put `gh.load('kits/proof.js')` ahead of either
in the page's load chain.

### wring.js

Single-document template induction: give it one document with repeated
structure (a log, raw HTML, structured records) and it returns the recurring
**templates** (fixed boilerplate with variable **slots**) plus the values that
fill each slot. Lossless: templates + slot values reconstruct the original
exactly. Ported from [`mehrlander/wring`](https://github.com/mehrlander/wring)
— the full source modules, test suite, and research record live at
`archive/wring/`; the design doc is `archive/wring/ARCHITECTURE.md` (a
five-stage pipeline: Tokenize → Grammar → Bookend Merge → Selection →
Extraction). The kit is generated from those modules by
`archive/wring/export/build-kit.mjs` — regenerate there rather than editing
by hand.

After loading:

```js
// End-to-end on text: one call, templates out
const run = window.wring.induce(logText, { group: 'align' });
run.result.groups     // [{ template: '192.168.1.${0} - - [...] ${5} ${6}', members, score }]
run.fidelity          // { pass, total } — reconstruction check

// DOM: repeated components from a live document or DOMParser result
const sigs = wring.extractSignaturesFromNodes(document);   // tag#id.class.class strings
const res  = wring.groupByTemplate(sigs, { maxSlots: 2 }); // templates + slot values

// The stages individually
wring.tokenize(text, 'punct')         // Stage 1: lossless tokenizers (punct/word/char/line)
wring.induceGrammar(tokens)           // Stage 2: Re-Pair grammar of exact repeats
wring.groupByTemplate(strings, opts)  // Stage 3-4: Bookend Merge + greedy MDL
wring.groupByAlignment(records, opts) // Stage 3 alternative: positional alignment
wring.selectTemplates(input)          // Stage 4: full MDL + weighted interval scheduling
wring.reconstruct(template, slots)    // Stage 5: exact reconstruction
```

Demo pages: `pages/demos/wring-text.html` (logs/records → templates) and
`pages/demos/wring-dom.html` (DOM signatures or pasted HTML → repeated components).
Kit liveness test: `tools/test/wring.test.mjs` (part of `npm test`; loads the
kit the way `gh.load` does and checks the pipeline invariants end-to-end).

### treemap.js

Pure logic for mapping a file tree as a treemap — no DOM, no colors
(rendering stays with the page; `pages/repo-atlas.html` is the consumer).
Extracted so the kernels run under `npm test`
(`tools/test/treemap.test.mjs`: tiling invariants, rollups, taxonomy).

```js
window.treemap.CATS                       // { code, docs, data, markup, media, styles, other } → labels
window.treemap.categorize('app.js')       // 'code' (extension + special-name taxonomy)
window.treemap.buildTree(entries, 'name') // git-trees entries → node tree (rollups, sorted, parents)
window.treemap.catTotals(node)            // { cat: { bytes, files } } under a node
window.treemap.squarify(items, x, y, w, h)// [{weight}] desc → rects (Bruls et al. squarified)
window.treemap.fmtBytes(6672908)          // '6.4 MB'
```

`squarify` tiles the rect exactly (area ∝ weight, no overlap) and guards
degenerate input: zero/empty weights and extreme skew emit zero-size
rects rather than negative extents.

### build.js (moved to `lib/` root, 2026-08-08)

Lives at [`lib/build.js`](../build.js) now: it extends `GH.prototype`
(overriding `.read` and `.get` while a build runs), which the admission rule
makes scaffolding, and an exception written into a rule on day one is how the
previous two rules died. Its API doc stays here beside its consumers until it
finds a better home.

The single emitter for "the build": a page's `gh.load` chain frozen into
one self-resolving offline artifact. Two consumers share the one emitter
so the format cannot drift: `tools/build/build.mjs` (Node) feeds it a
statically-walked cache and writes `dist/<page>.js`, and `kits/export.js`
(browser) feeds it the runtime `__loadedScripts` cache for offline
exports. The output is the real `gh-api.js` with `GH.prototype.get`
overridden by an inlined `path → source` cache; the actual loader still
runs (same execution, same gh-boot registry), and third-party CDN
libraries stay on the network.

```js
window.buildKit.emit({ ghApiSrc, cache, data?, repo, defaultRef, header?, extraBoot? })
                                        // assemble the build JS (a string)
window.buildKit.bake(pageHtml, buildJs) // rewrite the page's gh-api.js
                                        //   import to a data: URL carrying
                                        //   the build
window.buildKit.bakeable(pageHtml)      // whether there is an import to
                                        //   rewrite at all
await window.buildKit.collectCache(gh, { scripts? })
                                        // { ghApiSrc, cache } gathered at
                                        //   runtime from __loadedScripts
window.buildKit.stripLoader(ghApiSrc)   // gh-api.js minus its bootstrap
                                        //   tail and `export default`
```

`emit` reproduces the bootstrap offline, still honoring `?use=<ref>` (an
explicit ref falls through to the network), and sets
`window.__builtOffline`. Optional `data` does for `read()` what `cache`
does for `get()`: a `path → value` map consulted before the local probe
and before the network, which is how a single-file copy carries data it
cannot lay down as sibling files.

`bake` matches the import **call**, not a literal URL, because two boot
idioms are in use: the canonical block imports the jsDelivr URL directly
(25 pages) while every kit demo builds it from a `base` const and imports
`` `${base}/gh-api.js` `` (33 pages). Matching only the literal form left
the larger half looking chainless when it was merely unreachable, which is
the worse failure: the output looks finished and then asks the network for
its modules. `bakeable` is the honest predicate for "there is nothing to
inline," which is a real state (a page with no chain is already a
standalone artifact). See "Load and build are one contract" in
[`docs/loader.md`](../../docs/loader.md) and the pipeline in
[`tools/README.md`](../../tools/README.md).

### export.js

Export the current page as a portable zip: the page's pristine source
plus the data it `read()`s, laid out so `read()`'s local-first resolution
finds the frozen copies on `file://`. gh-boot's `__reads` registry is the
default manifest, so a page declares its data simply by reading it. With
`{ offline: true }` the page's code is baked in too (via `build.js`)
and unzip-and-open needs no network for own code; third-party CDN
libraries still load from the CDN. This is the "export" leg of the
vocabulary: load → build → bake → export → brief. The FAB's take-away
menu drives it, alongside `brief.js`, its reader-facing sibling below.

`renderCopy` is the third output and answers a different question: not
"archive this page" but "let me render it somewhere else." It returns one
HTML string for pasting into CodePen or any bare HTML preview, so it has
nowhere to put sibling files and inlines the `read()` data as well as the
code. Third-party CDN tags are left alone on purpose, since the
destination has a network and untouched tags are what keep the paste
small. What it cannot inline it counts: `cdnRefs` is the number of
run-time references to this repo's CDN that survive baking (a kit demo
injects `${base}/kits/<kit>.js` into each proof frame as a plain
`<script src>`, which is no `gh.load` and so not in the cache). Those
resolve wherever jsDelivr does and break on a private repo, so they are
reported at copy time rather than discovered on paste.

```js
await window.exporter.renderCopy(opts)  // one pasteable HTML string:
                                        //   { html, path, base, codeFiles,
                                        //     reads, dropped, bytes,
                                        //     chainless, cdnRefs }
await window.exporter.page({ offline?, path?, reads?, filename? })
                                   // build and download the zip
await window.exporter.build(opts)  // same, minus the download: returns
                                   //   { path, base, filename, offline,
                                   //     codeFiles, reads, files }
window.exporter.localForm(path, value) // one read() value in its local
                                       //   <script> deposit form
window.exporter.cdnRefs(html)          // count the run-time CDN references
                                       //   a baked page still carries
```

Every entry point takes `opts.gh` / `opts.scripts` / `opts.reads`, so a
caller can aim the kit at something other than the current window. The FAB
does exactly that inside a toss, where the page on screen is the subject in
the frame and the globals belong to the shell around it.

The page path comes from `opts.path` or the FAB's `[data-path]` stamp;
the page source is fetched pristine from the repo at the booted ref, not
scraped from the post-Alpine DOM. `kits/io.js` and `build.js` load
on demand if absent.

### brief.js

Assemble the current page into a **review brief**: one markdown document
carrying the page source plus the source of the modules the page itself
loaded, sized for pasting into a chat model. The fifth leg of the
vocabulary, and the one aimed at a reader rather than a runtime: `export.js`
answers "unzip and it runs", so it must carry the whole boot chain, while a
brief answers "read this and tell me what you think", so carrying the boot
chain is pure cost. Both read the same `__loadedScripts` closure and
diverge only on what they keep.

The split needs no heuristic, because gh-boot already stamps `auto: true`
on everything it pulled in itself. Four rings: the **page** (full source),
its **own** modules (full source, and what a review is actually about), the
**floor** (the boot chain plus the FAB, listed by name and one-line role,
never by source), and **vendor** (third-party CDN packages, named and
versioned from their URLs). Measured across four pages, dropping the floor
takes a whole-page brief from 25-50K tokens to 10-15K.

```js
window.brief.plan({ path? })       // classify without fetching: { path, repo,
                                   //   ref, own, floor, reads, vendor, wholeLib }
await window.brief.assemble(opts)  // the markdown: { text, bytes, tokens,
                                   //   path, modules, plan }; opts.ask
                                   //   prepends the question being asked
await window.brief.copy(opts)      // assemble + io.copy (iOS-safe)
window.brief.stageUrl({ path?, prompts? })  // the same closure as a #stage= link
```

`app/index.html` is the one page this cannot serve whole: it
imports the 918K pre-build, so its closure is the entire library (~262K
tokens). `assemble` refuses it unless `opts.force`, and points at
per-component scope instead.

`stageUrl` is the seam with the stage: the FAB is the only thing that can
know *which* files a running page pulled in, and the stage is the tool that
specializes in choosing among them. It mints the single-group case of
`StageLink`'s grammar directly, since `stage.js` is a full Alpine component
and is not loaded on an ordinary page.

### md-doc.js

A markdown document rendered as something you can read and take pieces **out
of**. Two jobs over one render, and they are the same complaint from two sides:
a rendered document has thrown away its source, so the table has lost the pipes
that would have let it wrap and the section has lost the `##` that would have
let it travel.

```js
window.mdDoc.split(src)            // [{ index, depth, title, slug, raw, start, end, startLine, endLine }]
window.mdDoc.reference(sec, addr)  // the provenance line(s), as an array
window.mdDoc.payload(sec, addr)    // reference + blank line + sec.raw
window.mdDoc.html(src, o)          // a prose HTML string, tables contained
window.mdDoc.render(host, src, o)  // mounts into host -> { box, sections }
window.mdDoc.enhance(box, src, o)  // the same over markup another renderer made
window.mdDoc.contain(el)           // el, nothing left that can widen a column
window.mdDoc.locate(node)          // { addr, sections, section } for any node in a render
window.mdDoc.sourceRef(node)       // "docs/APP.md § Mechanism (lines 16-28)"
```

**Contain.** A table's intrinsic min-content width is a floor no ancestor can
shrink below, so a wide one widens whatever it is in until something scrolls. In
a swipe-deck slide that something is the slide, which drags the headings and the
prose sideways along with the table. The wrapper does not force `max-content`:
typography's `width: 100%` still wraps cells, so only a table that genuinely
cannot fit starts scrolling.

**Cut.** Every top-level heading gets a control over **that section's source**:
copy it, copy it with a revision ask on top, or open a note pinned to it. One
menu rather than three glyphs, since a heading has room for one mark. Sections
nest the way Wikipedia's do: a section runs to the next heading of equal or
higher rank, so `##` carries its `###`s and each of those still has its own
control. Headings are found through `marked.lexer`, not a line regex, so a `#`
inside a fence is not one; the rendered box's direct-child headings pair against
the same list by order.

**Declare.** The rendered box says which source and which address it is a
rendering of, so `locate()` can answer for any node inside it in the source's
terms. `annotate.js` reads that: on a declared render every note's `Path:` line
is `docs/APP.md § Mechanism (lines 16-28)` rather than a css path, and its
`section` targeting mode is raised from this menu, since the heading is the one
thing that knows which section it opens.

**Enhance** is render's second half, for markup another renderer produced.
`guide-render.js` renders a doc with the link re-aiming a guide body needs, and
the Files pane reads markdown through it; that reader wants the containment and
the controls without giving up the re-aiming. The `src` handed to it must be the
source that produced that markup, and nothing can check it: get it wrong and
every control copies the wrong lines.

Copying the **source** rather than the selection is the whole point. A rendered
section copies as prose with the structure flattened out, and a model asked to
revise that returns a revision of the flattening. The source slice is the thing
that can be revised and put back, which the reference's `lines 43-91` is there
to make possible.

`window.marked` must already be loaded; `window.io.copy` is read when present
for the iOS clipboard path. The copy control carries `data-annotate-ui`, which
is how `annotate.js` knows to keep it out of the text a note is anchored in.
`chat-render.js` keeps its own copy of the table wrap, deliberately: it is a
standalone script a page can drop in from jsDelivr with nothing else.


**Sections nest, and the hierarchy is arithmetic rather than a walk.** `chain`
gives a section's ancestors by rank (innermost first, the shape `Peek.chainOf`
uses so one renderer serves both), `children` the sections exactly one rank
finer before a peer closes the run, `headOf` the heading node for any section
index, and `stats` what a passage holds counted in markdown's units: words,
paragraphs, list items, code blocks, tables, quotes, links. Counted off the
SOURCE, so a fence full of hyphens is one code block rather than the list it
resembles.

### annotate.js

Notes pinned to pieces of a page: select text (or pick an element, or drag a
rectangle), write a note, and carry the set out as markdown for a chat model,
as JSON (`annotate/1`), or as one jot in the estate registry. The unit is the
**annotation set**, not the single note: several small notes against one
document, shipped together, which is what neither a screenshot nor a copied
quote does.

Text selections anchor as **text quotes** (exact + prefix/suffix context, the
W3C Web Annotation idea) rather than node offsets, so an anchor survives
re-render and can be re-found in another copy of the document; an agent
session holding the same file re-finds it by grep. Highlights paint through
the CSS Custom Highlight API where the target window has it, so the
document's DOM is never rewritten and a reactive page has nothing to trip
over; without the API the notes still collect and serialize. Element picks
anchor by css path plus excerpt; regions by document-coordinate rectangle
plus the text of the blocks they cover.

```js
window.Annotate.enable({ doc?, subject? })  // mount on a target document
                                            // (defaults to this one); subject
                                            // = {title, url} for serialization
window.Annotate.add(target, note)           // programmatic add
window.Annotate.toMarkdown() / .toJSON()    // the set, serialized
window.Annotate.noteMarkdown(id)            // one note, same shape and preamble
window.Annotate.noteJSON(id)                //   (still annotate/1, one note in it)
await window.Annotate.copy('md' | 'json')   // serialize + clipboard
await window.Annotate.saveJot()             // one jot (fresh-read → mutate → save)
window.Annotate.expand(true)                // open the card onto the set
window.Annotate.setReading('notes'|'md'|'json')
window.Annotate.setScope('set' | 'note')    // which subject a serialization has
window.Annotate.disable()
```

Reopening a note through its pencil folds that note's ROW out of the list: the
composer is the note while it is open, and the row comes back when the edit is
saved. It used to be on screen twice, once with a caret in it and once as a
static row still showing the text being replaced.

The card reads its own set behind an **expander**, which is its header's
`Notes` button: the card's name, its count and its way in are one control. It
grows upward from the card's bottom edge, pinning that edge first so a card
that has been dragged (which re-anchors it to the top) grows the same
direction as one that has not.

What opens is one window of a fixed height, the same for every reading and the
same empty as full, with the body scrolling inside it. The window is 55% of the
viewport and never past 440px, so the card stays a window over the document
rather than a takeover of it. One row carries the format chips and then a copy
key, which is a glyph and no word because the chips beside it are the
qualifier. The footer is Save jot and Clear, and there is no status line: Save
jot reports on its own label, and every other message it used to carry
announced something the reader had just watched happen and then stayed.

**Four readings, and the fourth is not of the set.** The list, then markdown and
JSON exactly as Copy hands them over, then **DOM** (2026-08-29): the element the
note is pinned to, its selector and how many nodes that selector matches, its
box, layout and tree position, then its subtree and the ancestors containing it.

**And it is DRAWN, not printed.** The other two readings ARE bytes, so a `<pre>`
is the honest shape for them: what is on screen is what Copy hands over. This
one is a description, and it first shipped as a monospace blob holding its
columns with `padEnd(9)`, which is a serialization pretending to be a layout and
loses the pretence the moment a value wraps. It has its own pane now: the tag as
a pill with its id and classes as chips, the ancestor trail as a scrolling row,
the selector in a box with a green `unique` or amber `N matches` verdict beside
it, an aligned label grid, the own text clamped, and the subtree indented by
padding rather than by spaces. `domText` survives as the copy payload, so Copy
still hands over something a model can read.

**The outlines live in the document, not the viewport.** Every live highlight
(the pick's hover and staged boxes, the region's rectangle, and its "+ note")
is `position: absolute` in document coordinates, so it travels with the thing it
is drawn around and needs no repainting. They were fixed, placed from a viewport
rect and never repainted, so a scroll left the highlight sitting where the
element used to be: measured 2026-08-30, a 260px scroll produced exactly 260px
of drift. The filed notes' outlines were already drawn this way; this makes the
live ones agree with them. The region's box is the one exception and only while
the drag is live, where the page cannot scroll anyway and viewport coordinates
are exact; it pins to the document the moment it stages.

**The trail is tappable**, and it is the only thing in the pane that is. A crumb
re-points the reading at that ancestor, and where a mode is running it moves the
outline too, through a `S.restage` hook the pick publishes: a crumb that renames
the pane while the highlight stays three levels down is two answers to one
question. The subject is always the last crumb, so the trail scrolls to its end
after every draw.

**A section reads in markdown's units, and steps through markdown's hierarchy.**
Section was excluded from this reading at first, on the grounds that it would
answer with an `h2` in a div where the reader is asking about a passage. That was
the right observation and the wrong fix: a section gets its own reading rather
than none. It shows the rank and title, the source address with its line span,
the size in words, what the passage HOLDS (paragraphs, list items, code blocks,
tables, links), the slug, the first lines of the source with its hashes intact,
and the subsections under it.

The two structures over a rendered markdown document **do not agree**, which is
the whole reason this is a second reading rather than a relabelled first.
`### Form` is inside `## Marker` inside `# Status` in markdown, and all three are
flat siblings in the DOM. So the repeat tap and the trail walk `mdDoc.chain`,
which is arithmetic over the ranks `split` already knows, and `mdDoc.headOf`
reaches the heading node of a section other than the located one. The aim carries
its KIND for the same reason: a heading element can be aimed at either way and
the node alone cannot say which was meant.

Structure cannot be a reading of the set, because "what is this element and what
contains it" is a question about one node and eight notes have no single answer
to it. **The subject is the LIVE AIM first**: the node a pick has staged, or the
rectangle a region has drawn, then the selected note, then the draft being
written, then the most recent note.

That order is the correction the reading needed, and both halves of it were
measured wrong first. It keyed on the filed note, so a reader aiming at things
watched the pane say "select a note" through an entire pick, cycling included:
the answer arrived only after the question had stopped being asked. And with one
note filed and nothing selected it showed instructions where an answer was
expected.

**A rectangle gets its own answer**, since it is not a node: what it covers,
through `Peek.covers`. Contained roots where there are any, the text blocks it
touches where there are none, and the heading says which. Contain alone is
useless on a phone, where a box drawn with a thumb is narrower than any block in
a text column and the precise answer is almost always empty.

**Both aims open the card on it**, Region when the box is drawn and Element when
the aim is chosen. Each is one deliberate act with one question behind it, and
the pane that answers should be open before the first tap rather than found
afterwards. What is still refused is expanding on every TAP, which would grow
the card under a reader mid-gesture. Section stays out too: its notes are about
markdown SOURCE and its aim resolves to the heading that owns a run, so this
reading would answer with an `h2` where the reader is asking about a passage.

The "+ note" offer moves out of the card's way when they do, through one shared
`placeOffer`: two candidate tops in the caller's order, then a fallback clear of
the card's top edge. Measured at 430px, the region's had been landing at 528
inside a card spanning 488 to 928 and could not be tapped at all, which made the
answer cost the control it was an answer about. The element pick's offer had the
same latent clash, sitting 30px above whatever it outlined.

Two consequences of not being of the set. An empty set does not empty it, where
markdown and JSON go bare. And the copy key is offered on a draft with nothing
filed yet, since `copyShown` takes what is on screen.

`kits/peek.js` is what it calls, and it is a soft dependency the way `dictate.js`
is: load `annotate.js` alone and every other reading works with the chip simply
absent. Peek's computations read the element's own document and need no
`enable()`, so nothing of Peek's own UI is mounted by asking. Both loaders chain
the trio, and the FAB's `_loadAnnotate` treats either extra as best-effort: a
failure costs one chip, not the notes.

**The element pick steps up.** A second tap within 14px of the last one selects
the parent, then its parent, wrapping at `<body>`: the same gesture and the same
slop as `peek.js`, and the fix for the complaint this mode always invited, that
a tap lands on the smallest node under the finger. Section mode is exempt, since
its own resolve already answers with the heading that owns a section and
stepping would leave the aim the chip is named for.

**The FAB drawer's Notes tab is retired** (2026-08-25). It was the only place a
set could be READ until the expander existed, which made it a second
implementation of one view, on a page that might not have a drawer, kept in
step by three window events (`annotate:review`, `annotate:drawer`,
`annotate:drawer-query`). All of that is gone, along with the card's own title
button that opened it. What the FAB still does is START the annotator: the take
grid's Annotate entry and the launcher's long-press "Take a note".

The FAB's take grid carries it as **Annotate** (the one take that operates on
the view rather than carrying it away), aiming at the subject frame's
document inside a readable `#gh=` toss; a `#gz=` sandbox is opaque and gets
the shell, which the take's caveat says. `pages/annotate.html` is the page
half: load any `owner/repo[@ref]:path` document and annotate it.

The composer's voice half is **`dictate.js`**, below, and it is a soft
dependency: load `annotate.js` alone and everything works except the
microphone, which simply never appears. Both loaders here chain the pair.

### dictate.js

Voice input as a plain text buffer. `Dictate.create({win, onText, onInterim,
onState, onError})` returns a handle over `SpeechRecognition`; read `text`
back, or paint it from the callbacks. Every option is optional.

Extracted from `annotate.js` on 2026-08-09, where it had been written as a
callback factory with no reference to the annotator so that this would be a
move. The value is four **text** rules, none of them about speech recognition:

- **Spoken punctuation is text, tapped punctuation is punctuation.** Engines
  guess badly at where a comma goes, so a recognized `.` is rewritten to the
  word " period" and real marks arrive only from the caller's mark row. The
  guess is removed rather than corrected.
- **The stop-mark-restart cycle.** Nothing can be injected into a live
  recognition stream, so a tapped mark parks itself, stops the engine, and the
  end handler writes it and starts again.
- **Continuation casing.** After a comma or semicolon the next utterance is
  the same sentence, so its leading capital is lowered. This is what makes
  stitched fragments read as prose.
- **The running hypothesis is committable.** `flush()` commits the interim the
  reader can see, because they have read it; the alternative is losing a
  sentence to a pause they did not know they owed the recognizer.

```js
const d = Dictate.create({ win })   // win: a window or an accessor for one
d.start() / d.stop() / d.toggle()
d.punct('.')                        // a real mark; '¶' breaks the paragraph
d.backWord()                        // drop a word without stopping the engine
d.flush()                           // commit the interim, return the buffer
d.text                              // get/set
Dictate.available(win)              // is there a recognizer there
```

`win` is a parameter rather than a global read because the annotator points it
at a frame's window: the kit runs in the shell realm and dictates into a
document it does not own.

### peek.js

What is under the pointer, and what contains it. Point at something and the page
answers with the element; point again in the same spot and it answers with that
element's parent, then its parent, up to `<body>` and around.

**The chain is the unit, not the element.** A tap builds the ancestor chain from
the hit node to `<body>` and parks at index 0; everything after that moves an
index rather than re-querying, so stepping is exact and reversible and the
outline growing is all the feedback the gesture needs. The step is a *proximity*
test (a tap within 14px of the last one steps up) because a phone has no Alt and
no hover, and it wraps because on a touch screen there is no other way back from
an overshoot.

```js
window.Peek.enable({ doc, onSelect })   // doc defaults to this one
window.Peek.select(el) / .up() / .down() / .to(i)
window.Peek.current() / .chain()
window.Peek.facts(el) / .tree(el, {depth, nodes}) / .html(el) / .json()
await window.Peek.copy('facts'|'tree'|'html'|'json'|'selector')
```

Four readings of one node, because "what is this" has four answers depending on
why you are asking: **facts** (identity, the selector *and its match count*, the
box, layout, tree position), **tree** (the subtree as an indented outline, depth-
and node-capped: structure plus own text with the attribute noise dropped),
**html** (the exact `outerHTML`, truncated on screen and whole on copy), and
**json** (the facts as a record, for a model or a note).

`layout` reports what kind of box it is rather than one `display`. A flex or grid
CONTAINER names its own axis, gaps and alignment; a flex or grid CHILD names its
parent's mode and its own side of that contract, since `display: block` for
something a grid is placing says nothing at all. Defaults are dropped throughout,
so a row of `normal` and `auto` never reaches the panel.

Two things it does that are easy to get wrong, both measured on 2026-08-29:

- **The selector pins siblings by position, not by climbing.** Prefixing
  ancestors separates cousins and never separates siblings, since two `<li>` with
  the same classes have the same ancestor path by construction. The first
  algorithm climbed to `<body>` still matching two, then fell back to something
  matching three. Each segment now carries `:nth-child(n)` only where its atom is
  ambiguous among its own siblings, which both terminates and stays readable.
- **The panel docks away from the tap point.** A panel that grows over the point
  just tapped eats the repeat tap, and the second tap landed on the breadcrumb
  strip instead of stepping up. It docks off the *point*, not the selection: the
  point is fixed for the length of a walk, where the selection grows to fill the
  screen and would flip the dock under the reader.

**It is a library before it is a UI.** Every computation reads the element's own
document rather than the enabled one, so `facts()`, `tree()`, `html()`,
`chainOf()`, `atom()`, `selectorFor()` and `covers()` work on any element or
rectangle in any document with no `enable()`, no cover and no panel.

`covers(rect, {doc, mode})` is the rectangle half, in document coordinates so a
live drag and a filed region note ask the same question. `contain` returns the
covered elements whose parent is not covered, which is `console/mods/lasso.js`'s
selection-roots rule; `touch` returns the text blocks the box overlaps, keeping
the innermost where they nest. Blocks rather than whatever element is deepest,
because a box over prose overlaps the links inside it and "three `<a>` elements"
is a true answer to a question nobody drew a box to ask. The block set is the one
annotate's region excerpt already reads, so the two agree about what a region
covers. That is what `annotate.js`'s DOM
reading calls; reading the enabled document here would have made the whole kit
conditional on its own UI.

Its outlines are `position: absolute` in document coordinates. They were fixed
and repainted from a scroll listener, which works and lags: the box is redrawn
AFTER the scroll it is reacting to, so it swims against the element on a phone.
Document coordinates never move relative to what they are drawn around and need
no listener at all.

The pointer path is a full-screen cover taking `pointerup`, with
`elementsFromPoint` to see past it. `console/mods/pick.js` does the same job off
`mousemove` + `click`, which does not work on iOS; `annotate.js` carries the
field report and the fix, and this is that fix extracted. Self-contained on
purpose, and it does duplicate about twenty lines of `console/base.js`'s `sig`
and `rect`: base.js is a DevTools paste installing a dozen globals, this is a
`gh.load` kit installing one, and sharing would mean one adopting the other's
distribution. The page half is [`pages/peek.html`](../../pages/peek.html), whose fixtures are chosen so each structure buries the thing you would actually want several levels under whatever your finger lands on;
the browser facts (pointer path, outlines, auto-dock) are driven by
`tools/render/scenarios/peek-walk.mjs`, since jsdom has no layout.

### wsl-core.js

Dependency-free core for Washington State Legislature data: URL builders
for the `wslwebservices.leg.wa.gov` endpoints, the XML→record parsers as
a factory, pension classification against a built-in RCW map, and pure
list/group helpers. The one twist on the kit shape: it imports nothing,
taking its XML libraries through `makeParsers({ XMLParser, flatten })`,
so the same file runs in the browser (via `gh.load`, with `wsl.js`
injecting the CDN builds) and in Node (`fetch-data.mjs` injects the npm
builds). Registers `globalThis.wslCore`.

```js
wslCore.URLS.legislation(sinceDate)   // + prefiles, sponsors, rcwFor,
                                      //   actionsFor, historyFor
wslCore.makeParsers({ XMLParser, flatten })
  // → { parseLegislationXml, parsePrefilesXml, parseSponsorsXml,
  //     parseRcwXml, parseActionsXml, parseHistoryXml, transform }
wslCore.classifyPensionBill(rcwList)  // → pension/adjacent labels + cites
wslCore.PENSION_MAP                   // systems / general / governance /
                                      //   adjacent / special
wslCore.consolidate(recs, pk)         // group + merge records on a key
wslCore.groupWithCompanions(bills)    // bill groups via companion links
```

### wsl.js

Browser wrapper over `wsl-core.js`: loads the core, lazy-loads
`fast-xml-parser` and `flat` from the CDN on first parse (a snapshot-only
page never pulls them), and registers `window.wsl` with the parsers,
fetch-and-parse helpers for the WSL services (CORS permitting), a
committed-snapshot loader with an IndexedDB overlay, and RCW reference
lookups with linkify/tooltip/popup builders. Returns its async wiring, so
`gh.load('kits/wsl.js')` resolves when `window.wsl` is ready. Consumers
live in `pages/wsl-sync/`.

```js
await wsl.loadStore({ stores, biennium?, base?, overlay? })
  // committed JSON snapshot; IDB overlays only the keyed stores
  //   (rcws / history / actions), so a stale paste never shadows the
  //   auto-refreshed lists
wsl.saveStore(key, value)
await wsl.getLegislation(sinceDate)  // + getPrefiles, getSponsors,
                                     //   getRcwFor, getActionsFor,
                                     //   getHistoryFor
await wsl.preload()                  // RCW reference JSON (page-relative
                                     //   ./rcw/, beside the wsl pages)
wsl.linkifyList(chapters, fullRcws)  // + linkifyTitles, chapterTooltip,
                                     //   titleTooltip, buildRcwPopup,
                                     //   buildPensionPopup,
                                     //   buildAdjacentPopup,
                                     //   buildChapterPopup, buildTitlePopup
```

### pdf.js

Browser PDF extraction: text with resolved fonts and per-character geometry,
the vector rules a page draws, and table structure recovered two independent
ways. Consolidates a strand of console and bookmarklet work that ran from
2025-04 to 2026-05 and never landed in a repo, so this is its first tested
form.

The split is the point. `geom`, `stream`, and `lattice` are **pure**: plain
arrays in, plain arrays out, no pdf.js and no DOM. Every structural decision
the kit makes lives there, which is why the whole table-detection surface is
testable under node against synthetic geometry. Only `open()` needs pdf.js,
and only `doc` needs pdf-lib (both load lazily from jsDelivr).

The two libraries load **separately**, and a caller that only reads should say
so. `loadPdfjs()` is the reading half, `loadPdfLib()` the writing half, and
`loadLibs()` still means both. `open()` takes the first, everything under `doc`
takes the second, and nothing takes both. That matters to anyone rendering
rather than editing: the viewer's `pdf` mode
([`alpineComponents/viewer.js`](../alpineComponents/viewer.js)) draws a page
with pdf.js alone, so it no longer pulls roughly a megabyte of editor library
it never calls before the first pixel. `tools/test/viewer-pdf.mjs` asserts that
request is never made, since the regression is invisible from the pixels.

A viewer also does not want `open()`. It parses every page's text and operator
list up front, which is exactly right for extraction and wrong for showing page
1 of a 200-page submittal; go through `pdfjsLib` directly for that.

```js
const d = await pdf.open('/report.pdf');   // url, File/Blob, or bytes
const d = await pdf.pick();                // file picker, for console use

d.items      // text: {x1,y1,x2,y2,base,str,fontSize,bold,italic,glyphs,…}
d.paths      // rules: {h: [{y,x1,x2,color,width}], v: [{x,y1,y2,…}]}

d.rows(1)     // items grouped by baseline, top to bottom
d.chunks(1)   // adjacent items merged into runs, split on gaps and style
d.columns(1)  // column edges by alignment frequency (both edges histogrammed)
d.gutters(1)  // column edges by whitespace — the complementary read
d.grids(1)    // ruled tables: cells with spans, plus a dense .matrix

const v = d.viewOf(1, {scale: 1.5});   // projection bound to that page's viewport
v.items(d.page(1))                     // items as {left,top,right,bottom,w,h,glyphs}
v.at(px, py, projected)                // point hit test
v.select(dragRect, projected, {mode: 'contain'})   // drag selection
v.unbox(dragRect)                      // screen rectangle back to PDF space

pdf.stream.recurring(d.items)                // what repeats across pages
pdf.stream.trim(d.items, {y1: 60, y2: 735})  // cut by a box + page range
pdf.stream.split(items, [60, 220, 380])      // assign by where a chunk starts
pdf.lattice.grids({h, v}, items, {snap: 3})  // the pipeline, own tolerances
await pdf.doc.slice(d.bytes, 3, 7)           // pdf-lib page range → bytes
```

`stream` and `lattice` read the same page from unrelated evidence (where the
text sits, versus the rules drawn on it), so running both and comparing is a
control that one method run twice cannot give you. Agreement is evidence;
disagreement is a finding.

`view` is the bridge to anything visual, and it is pure: hand it a viewport (or
any `{width, height, transform}`) and it projects geometry into screen space and
back through the real inverse matrix. That belongs in the kit and not in each
overlay, because every previous attempt rewrote it inline and the 2026-05 one
converted mouse pixels back by dividing by the scale, which drops the
translation and drifts. An Alpine component that wants drag-selection is then a
pointer-event shell over `v.select`, the same way `cm-editor.js` is a shell over
`cm6.js`.

[`pages/pdf-inspect.html`](../../pages/pdf-inspect.html) draws every layer on
top of the rendered page, with drag-selection wired to `view.select`, and a
Stack mode that lays the pages on a third axis so what recurs reads as a band
through the document and a trim can be seen cutting before it commits. It is
the visual check the numeric suites cannot be, and it has already found three
real defects. Version pinning is settled by running rather than by changelog:
`npm run test:pdf-versions`. Tolerances, failure modes, the measured font-alignment numbers, the
government-PDF pathologies, and the honest limits are in
[`docs/pdf-structure.md`](../../docs/pdf-structure.md).

**Two ways in, and the difference is the point.** The page reads a local file
(picker or drop) and an **address**, `#gh=owner/repo[@ref]:path`, so a PDF
anywhere in any repo is a link rather than a download-and-drag; it accepts
`?src=` in the same grammar, which is what the `#pdf=` toss route feeds it. So
`#data=<a pdf>` is the FIRST LOOK, the viewer's `pdf` mode drawing a page with
a pager, and `#pdf=<the same file>` is the WORKBENCH, this page with its
layers, trim and two table readings. One decision, spelled two ways, so the
link says which one was meant. Both are in [`docs/routes-routes.csv`](../../docs/routes-routes.csv).

**The first look pages on [`swipe-deck.js`](swipe-deck.js), and that is the
alignment rather than a detail.** The estate already pages branches, then a
branch's files, one card at a time; a PDF is the case that makes the pattern
three levels deep, because a file can have pages of its own. Nothing about the
third level is special, so it does not get a gesture of its own. `core()` is
what an inline pane wants (the track without the takeover chrome), and it
brings the part that matters most for a big document for free: slides build
lazily and drop once the reader is two away, so a 200-page submittal rasterizes
three canvases rather than 200. The arrows drive the track rather than keeping a
page number beside it, so the pager and a thumb cannot disagree: there is one
position, the track's scroll offset.

### xlsx.js

OOXML (`.xlsx`) structural inspector: unzip, walk every XML/rels part, and
surface the internal cross-references — shared strings, styles, sheet rels,
comments, calc chain, defined names — plus reconstructed sheet data. Pulled
from three dropped prototypes into one pure kit: no DOM rendering, no
jQuery/Tabulator. `analyze()` takes already-extracted XML strings and is
synchronous and part-order-independent (cross-file resolution happens in a
finalize pass once every part is walked), which fixes a real bug in the
source prototypes: they resolved shared-string cell values inline during a
concurrent, unordered zip read, so a sheet processed before
`sharedStrings.xml` got empty string values. `readZip()` is the thin
JSZip-backed convenience wrapper a page actually calls (JSZip loads lazily,
same pattern as `io.js`).

```js
const result = await window.xlsxKit.readZip(fileOrArrayBuffer);
// result: { el, connectedPaths, conns, xl: { sheets, strings, styles,
//           comments, relationships, definedNames, calcChain } }

xlsxKit.summary(result)             // { total, connected, unconnected, connectedPct }
xlsxKit.views.paths(result)         // one row per distinct XML element path
xlsxKit.views.connections(result)   // one row per sheet: cells/strings/styles/
                                    //   formulas/merged cells/comments/named
                                    //   ranges/calc-chain entries
xlsxKit.views.unconnected(result)   // paths with no recognized structure
xlsxKit.views.files(result)         // one row per XML part: category, paths,
                                    //   connected count, sheets touched
xlsxKit.sheetRows(result.xl.sheets.sheet1)
                                    // -> [{ Row, A, B, C, ... }], sparse rows/
                                    //   columns left as gaps, not compacted
xlsxKit.colLetter(26)               // 'AA'
```

`analyze(parts)` — the pure entry point — takes `[[path, xmlString], ...]` or
`{path: xmlString}` for already-extracted `.xml`/`.rels` parts, so it's
testable with plain fixture strings (`tools/test/xlsx.test.mjs`) and needs no
real `.xlsx` file or JSZip. Two known limitations inherited from the source
prototypes (not fixed, since a real fix needs cross-referencing
`workbook.xml`'s `<sheets>` order, a nontrivial addition): named-range and
calc-chain sheet association assumes `sheetN.xml`'s file number matches
workbook sheet order, which can drift after a sheet reorder or rename; and
cell-to-column mapping trusts each `<c>`'s `r` attribute (falling back to
positional order only when `r` is absent), which is standard but not
universal among third-party writers. See `kits/demos/xlsx.html` for live
examples.

## Salvage status

Every kit is in active use. The custom-element wrapper that used to live
here as `component.js` now lives in `alpine-bundle.js` as the `x-define`
directive — see the bundle demo at `pages/demos/alpine-bundle-demo.html` for
examples.

| Kit | Demo | Notes |
|---|---|---|
| `compression.js` | `kits/demos/compression.html` | brotli + gzip + acorn |
| `persistence.js` | `kits/demos/persistence.html` | idb-keyval + collections |
| `messaging.js` | `kits/demos/messaging.html` | exact-match pub/sub |
| `io.js` | `kits/demos/io.html` | pick / save / clipboard |
| `data-shelf.js` | `popups/data-shelf.html` | record shape + importer support |
| `console.js` | `pages/demos/console-kit-demo.html` | console retention + `debugConsole` renderer |
| `cm6.js` | `vanilla-demo.js` / `pages/drop/cm6-editor.html` | lazy CodeMirror 6 editor factory |
| `cm6-merge.js` | `pages/review.html` | read-only CM6 split/unified diff views; display sibling of `cm6.js` |
| `text-diff.js` | `pages/diff-tool.html` / the stage's Diff lens | patience line diff + word diff; pure, no renderer. `cm6-merge.js` is the other diff shelf: this one computes, that one displays |
| `review-target.js` | `pages/review.html` | parse/mint the review address grammar (`gh=owner/repo[@ref][:path][&base=]`) |
| `brief.js` | the FAB's "Take this page" menu | page + its own modules as one pasteable markdown brief |
| `wring.js` | `pages/demos/wring-text.html` / `pages/demos/wring-dom.html` | template induction; generated from `archive/wring/` |
| `treemap.js` | `pages/repo-atlas.html` | squarified treemap kernels + file taxonomy |
| `../build.js` | `tools/build/` + the FAB export | one emitter, two consumers; `lib/` root since 2026-08-08 (extends `GH.prototype`) |
| `export.js` | the FAB's export control | page + `read()` data as a zip |
| `wsl-core.js` | `pages/wsl-sync/` + Node fetch | dependency-free; libs injected |
| `wsl.js` | `pages/wsl-sync/` | browser wrapper; lazy XML libs |
| `xlsx.js` | `kits/demos/xlsx.html` | OOXML structural walk; pure/testable, lazy JSZip |
| `pdf.js` | `pages/pdf-inspect.html` + `npm run test:pdf` | pure geom/stream/lattice/view; lazy pdf.js + pdf-lib |
