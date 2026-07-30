---
name: bake-page
description: >-
  Turn a CDN-driven HTML artifact into one self-contained file:
  Tailwind and daisyUI compiled and pruned, Phosphor icons inlined as SVG,
  Alpine and other runtime JS inlined. Use when a page needs to render inline
  (preview box, data URL, iPhone) without CDN loads, or when the user asks to
  "bake" a page or wants a self-contained, offline, or single-file version.
---

# Bake Page

## Why this exists

- The user builds HTML artifacts that must render inline (preview box, iPhone
  shortcuts), where CDN support is limited.
- Baking injects the pieces into the page, so it renders anywhere. Author in CDN
  form, the editable source, and hand over the baked twin.

## Supported libraries

`scripts/bake.js` handles Tailwind and daisyUI (compiled) and Phosphor (icons
inlined) directly, plus the runtime libraries in its `RUNTIME` map: Alpine,
lodash, clipboard, jszip, get-xpath, winbox, tabulator, each baked when it
appears in a recognized form (see Detection). For other libraries, see Extend.

## Run

```bash
npm i tailwindcss @tailwindcss/cli daisyui @phosphor-icons/core alpinejs   # deps the default stack uses
node scripts/bake.js input.html output.html
```

Detects libraries (combine URL + Alpine script + markup), strips those CDN tags,
bakes each detected library, writes one file. Prints what it baked and flags any
library it has no recipe for. Honors `<!--CSS-->` / `<!--JS-->` markers; else
injects before `</head>` and `</body>`.

## Detection

The script bakes only what appears in the page in a form it recognizes. Each
kind has its tell:

- **Tailwind**: a `@tailwindcss/browser` reference, or the `daisyui` string
  (which needs it).
- **daisyUI**: the literal `daisyui` anywhere on the page.
- **Phosphor**: the `@phosphor-icons/web` package, or any `ph-` class.
- **Alpine**: the unpkg Alpine tag, or any `x-data` in the markup.
- **Runtime libs** (lodash, clipboard, jszip, get-xpath, winbox, tabulator):
  only from a `cdn.jsdelivr.net/combine/` URL, and only if the name has a
  `RUNTIME` recipe.

Tailwind and Phosphor are caught however they arrive, since their tells are
loose markup signals. The runtime libs are strict: combine URL plus a known
name. A standalone CDN tag is invisible, and a combine name with no recipe is
reported (`NOT baked, add a recipe`), not silently dropped.

## Key insights

- **Tailwind scans source as text**, not as a DOM. A class your JS assembles at
  runtime is invisible and gets dropped. A literal string is kept even inside an
  Alpine `:class="open && 'rotate-180'"`, because the scanner sees `rotate-180`
  as text. Safelist or write the literal when a class is built dynamically.
- **Phosphor swap specifics**: weight maps to a folder (`ph`=regular,
  `ph-bold`=bold, ...); non-regular weights add a filename suffix
  (`plus-bold.svg`); SVGs use `fill="currentColor"`, so `text-*` color and a
  `size-[1em]` class make them act like the font glyph did. Carry any extra
  attributes on the `<i>` (`:class`, `x-show`) onto the `<svg>`, or the bindings
  die. A swapper that reads only `class` loses them. The swap resolves static
  classes only: an icon selected through a dynamic `:class` never swaps. Render
  one `<i>` per variant with the full static class and toggle with `x-show`.
- **Alpine cannot be pruned**; inline it as-is, before `</body>`. Styled-but-no-
  clicks means the inlined Alpine did not run.
- **Injection uses function replacers, and must.** `String.replace` reads `$$`,
  `$&`, `` $` ``, `$'` and `$1` in a replacement *string* as patterns, and a
  minified bundle is full of them. This was not theoretical: Alpine registers
  every magic through ``Object.defineProperty(t, `$${n}`, …)``, so a string
  replacement shipped ``` `${n}` ``` and each magic registered without its `$`.
  Every expression using `$el`, `$refs`, `$dispatch`, `$watch` or `$nextTick`
  then failed with "not defined", silently, in a bundle whose source clearly
  contains the name. This entry used to read "inlined Alpine lacks `$nextTick`,
  though the string appears in the bundle" and recommend `requestAnimationFrame`
  as a drop-in. That was the symptom, one magic of five, mistaken for a
  property of the runtime. **Verify by diffing:** the inlined bytes must equal
  the npm dist byte for byte.
- **Blob URLs abort on opaque origins** (`file://`, data-URL pages): a worklet
  or worker module built via `URL.createObjectURL` throws. Build the module URL
  as `'data:text/javascript,' + encodeURIComponent(src)`.
- **Size floor** is roughly the inlined runtime JS (Alpine ~45 KB). CSS scales
  with classes used; a non-interactive page bakes small.

## How it works

The process recognizes three kinds of library, each baked a different way.

- **Tailwind**: the engine generates CSS from the classes in the markup, so the
  bucket holds Tailwind core and any Tailwind plugin (daisyUI is one). `@import
  "tailwindcss" source(none);` plus a `@plugin` line per plugin, run through
  `@tailwindcss/cli --minify` with `@source` pointed at the page. The
  `source(none)` scopes the scan to the page alone, so only its used utilities
  and components ship and a busy working directory cannot leak stray classes in.
  A plain stylesheet from another library is inlined as CSS (Inline), not
  compiled.
- **Swap** (Phosphor): a class maps to a static SVG. Scan markup, read the asset,
  inline it, drop the font.
- **Inline** (Alpine, lodash, clipboard, jszip, winbox, tabulator, most JS):
  runtime behaviour, cannot become CSS. Paste the minified npm dist into a
  `<script>`. Nearly free per library.

## Extend

Adding a library means classifying it into one of those three kinds:

- **Tailwind** (a plugin): add its `@plugin` line to the compile input.
- **Swap** (an icon set or other class-to-asset mapping): write a small swapper
  that finds the class pattern, reads the asset, inlines it, and carries extra
  attributes.
- **Inline** (a runtime JS or CSS library): add one line to the `RUNTIME` map in
  `scripts/bake.js` pointing at the npm dist file, install the package, re-run.

`scripts/bake.js` prints `NOT baked, add a recipe` for unknown combine packages.
Map and notes for the common combine stack (lodash, clipboard, winbox, jszip,
get-xpath, tabulator, vanilla-jsoneditor): `references/library-recipes.md`.

## Verify

Headless load from `file://`: expect zero non-`file:` requests, click an Alpine
control and read state back, screenshot to catch a missing icon. A page that
takes a microphone probes with `--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required`.
Recipe:
`references/verify.md`.

## Re-hydrate

The CDN form is the source; baking never alters authored markup (classes,
`x-data`, icon names). To go back, keep or restore the source rather than
reversing a baked file.
