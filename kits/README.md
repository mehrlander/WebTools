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

## Pending: decouple `pages/compression-helper.html` from Alp

The page currently loads Alp directly:

```html
<script src="https://cdn.jsdelivr.net/gh/mehrlander/Alp@f93d156ef88d/alp.js"></script>
```

and uses Alp custom elements (`<alp-compress-output>`,
`<alp-compress-input>`) and Alp's `alp.kit.text` / `alp.kit.acorn` /
`alp.fills.tip|pathInput|lines`.

The decoupling work, ready for a fresh thread:

1. **Switch the page to the scaffolded loading pattern** (mirroring
   `pages/show-repo.html`). Replace the Alp `<script>` tag with:

   ```html
   <script type="module">
     let TOKEN = '🎟️GitHubToken';
     if (TOKEN === '🎟️GitHubToken') {
       try { TOKEN = localStorage.getItem('ghToken') || TOKEN; } catch {}
     }
     const mod = await import('https://cdn.jsdelivr.net/gh/mehrlander/web-tools/gh-fetch.js');
     window.GH = mod.default;
     const gh = new window.GH({ token: TOKEN, repo: 'mehrlander/web-tools' });
     await gh.load('kits/compression.js');
     await gh.load('alpine-bundle.js');
   </script>
   ```

   Plus the standard CDN links for Tailwind / DaisyUI / Phosphor in `<head>`.

2. **Replace `<alp-compress-output>` and `<alp-compress-input>` with
   inline Alpine `x-data` blocks.** They currently share path-bound state
   via Alp's `ping` system at path `alp.compress`. Without that
   infrastructure, the simplest replacement is one parent `x-data` that
   owns the shared state (input, sel) and passes it down — the two child
   blocks become plain templates inside the parent. Or, if it's cleaner,
   put both pieces in a single `x-data` with all the state.

3. **Replace `alp.kit.text` / `alp.kit.acorn` calls with
   `window.compression.text` / `window.compression.acorn`.** API shape is
   identical — `text.process`, `text.findCompressedChunks`,
   `text.detectCompressionType`, `acorn.isJS`. No call-site changes
   beyond the namespace.

4. **Replace `alp.fills.tip / pathInput / lines` with inline DaisyUI
   markup.** Each is just a few spans and inputs; not worth porting as a
   helper.

5. **Drop the path-binding (`path="alp.compress"`) and persistence
   (`save()`, `load()`, `del()`) entirely** unless we want this page to
   persist across reloads. If we do, `localStorage` is the simplest path
   given we now have no IndexedDB framework. (Alp's `dexie.js` could be
   salvaged into a `kits/storage.js` later if persistence becomes a
   recurring need across pages.)

6. **Remove the cross-component `ping('sel')` mechanism.** Replace with
   direct method calls or shared parent state, depending on the layout
   chosen in step 2.

7. **Verify in a browser.** Open the page, paste raw text, toggle
   compressed/packed, switch alg between brotli/gzip, copy output, paste
   compressed input, check that decompression detection lights up.

After this, the Alp CDN reference is gone from this page and we have a
template for any future page that wants compression utilities.
