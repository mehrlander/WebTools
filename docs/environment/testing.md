# Testing HTML/JS in the sandbox

*(verified 2026-07-15)*

How to exercise a page or component in the Claude Code web sandbox. This file
states current truth only; superseded methods and discovery stories live in git
history. Supersede in place, don't append. Builds on the browser and network
facts in [capabilities.md](capabilities.md).

Reach for the lightest tool that proves the thing:

- **real pixels / layout / gesture** → `npm run shot` (pre-installed Chromium
  via Playwright)
- **boot logic / component state, no pixels** → `npm run preview` (jsdom with
  the real Alpine runtime)
- **unit logic for kits and components** → `npm test` (node:test +
  `tools/test/bootstrap.mjs`)
- **static traversal only** → cheerio / linkedom / a Python parser (table at
  the end)

## npm run shot: real pixels from the working tree

```bash
npm run shot -- pages/<page>.html [--ref <ref>] [--query "k=v&..."] \
  [--script <file>] [--build] [--out <png>] [--width N] [--height N] [--full]
```

[`tools/render/screenshot.mjs`](../../tools/render/screenshot.mjs) serves the
working tree over loopback and intercepts every external request through
[`tools/render/cdn.mjs`](../../tools/render/cdn.mjs), which resolves three
kinds of traffic:

- **Own code** (the jsDelivr `gh-api.js` import, then every contents-API
  `gh.load`) → local files, so the render shows branch edits, committed or not.
- **Own data**: `cdn.mjs` impersonates the GitHub API *for this repo only*.
  Contents listings, file reads, `/repos/<repo>` metadata, and `git/trees` are
  answered from the on-disk checkout. No token is involved at any step.
  The `git/trees` blobs carry real byte sizes (2026-07: added for
  repo-atlas, which maps by them). Two fidelity gaps to remember: the
  metadata match is exact-path, so `gh.req('')`'s trailing slash misses it
  (request `https://api.github.com/repos/<repo>` in full), and the walk
  serves the *working tree*, so gitignored files (`tools/.preview`, an
  un-gitignored scratch dir) appear in local renders but not in the live
  API's response.
  Identity endpoints (`/user`, `/user/repos`) are not impersonated; "who am I"
  has no local answer. Other repos' API calls pass through to the network and
  fail on the sandbox's spent anonymous quota.
- **Third-party libs** (Tailwind / daisyUI / Phosphor / Alpine, jsDelivr +
  unpkg) → npm-vendored copies under `node_modules`. The portable, repo-agnostic
  write-up of this vendor-and-intercept technique (with a standalone Playwright
  interceptor) is [`../headless-vendoring.md`](../headless-vendoring.md); this
  section owns the web-tools harness specifics.

Output is a PNG plus a log (intercepts, `__loadedScripts`, console, errors)
under `tools/.preview/`. `--script` runs an async `(page) => {}` to drive the
page into a state first. `--build` renders through `dist/<page>.js` instead of
the live chain; see [`tools/README.md`](../../tools/README.md) for the build /
verify-build companions.

### What renders: three page categories

| Category | First paint needs | Headless result |
|---|---|---|
| self-contained | code only | full render |
| repo-content | this repo's files / tree | full render, served from the checkout |
| identity-bound | "who am I" (e.g. `gh.repos()`) | gh-auth token wall |

The containment pattern for identity-bound pages: boot identity-free when the
URL names a repo. `repo.js pickByName()` picks it without listing anyone's
repos, and `setup(gh, { quiet: true })` fills the picker in the background
(gh-auth's per-request `quiet` flag keeps a 401/403 from taking over the
page). That drops the page into the repo-content category. Worked example:

```bash
npm run shot -- pages/nav-repo.html --query "repo=mehrlander/web-tools&file=README.md"
```

### Limits

- `esm.sh` / `cdnjs` modules aren't vendored, so `kits/cm6.js` (CodeMirror)
  doesn't mount in any harness.
- **The typography plugin is not available (2026-08-01).** `@tailwindcss/typography`
  publishes no `dist/typography.min.css` in its npm tarball, though jsDelivr
  serves one, so `cdn.mjs` has nothing to resolve and any page loading it
  renders **unstyled prose**. A markdown preview therefore looks wider and
  flatter in a shot than in a browser. Vendor the file into
  `node_modules/@tailwindcss/typography/dist/` (curl it from jsDelivr) when the
  shot is *about* prose; `node_modules` is gitignored, so it does not survive
  the container.

  This one was worth writing down for how it failed rather than for the gap
  itself. `readSpec` falls back to a package's declared entry when the request's
  basename matches the package name, which is what makes `npm/marked/marked.min.js`
  resolve. `@tailwindcss/typography` matches that shape too, so a request for
  its **CSS** resolved to `src/index.js` and the page was handed a Node module
  as its stylesheet: the log said `combine 3/3`, no error appeared anywhere, and
  the screenshot disagreed with every real browser. The fallback now requires the
  entry to be the same kind of file that was asked for, so this reads `MISS` and
  the log can be believed.
- If you're tempted to skip shot and open the live URL instead: GitHub
  **Pages serves `main`**. `?use=<ref>` swaps which ref a page's *loaded
  code* comes from, not the HTML shell, so a brand-new page has no live Pages
  URL until it merges. For branch HTML on a live origin, use toss-render's
  `#gh=` address mode or the FAB's Render tab.

## npm run preview: boot logic under jsdom

`npm run preview` runs a page's full `gh.load` chain and mounts Alpine under
jsdom, then reports each `x-data` container and a `boot:` line. Use it for
"did the components mount, what state" questions; it has no pixels.

jsdom executes neither module scripts nor dynamic `import()`, so preview
rewrites the page before running it:

- the module boot becomes a classic async IIFE;
- the `import(gh-api.js)` call is shimmed with the `import.meta.url`
  self-bootstrap intact;
- persistence's idb-keyval import is rewritten to the vendored copy, so
  persistence round-trips for real over `fake-indexeddb`.

Other remote imports are left alone because some sit inside template strings
that emit user-facing snippets, where a rewrite would corrupt the output. A
page that calls a live non-repo API endpoint gets an empty JSON array and
renders its empty state. Internals: the header comment of
[`tools/render/preview.mjs`](../../tools/render/preview.mjs).

## npm test: unit suites

`npm test` runs one `*.test.mjs` per kit / component on `node --test` (90+
tests, offline via npm-vendored libs). The suite caught a real bug on its
first run: a `versionchange` deadlock in `kits/persistence.js`.

[`tools/test/bootstrap.mjs`](../../tools/test/bootstrap.mjs) does the heavy
lifting: `makeWindow()` applies the jsdom globals and polyfills below and
captures warnings/errors into a `problems` array (assert it stays empty, with
`setMedia(bool)` for breakpoint flips); `startAlpine(window, [paths])` loads
components and boots the real Alpine; `loadKit()` runs a `lib/kits/*.js` file
with its lazy CDN imports rewritten to vendored copies.

Component-test lessons that generalize:

- **Test the eager path.** A test slot holding only lazy bindings (`@click`)
  never exercises init-time evaluation; include an eagerly evaluated binding
  (`x-text` / `:class` / `x-effect`) or the test gives false confidence.
- **Don't rebuild slotted children from a string.** `$el.innerHTML =
  shell($el.innerHTML)` detaches nodes Alpine has queued effects on, and the
  orphaned effects throw on flush. Move the existing children with
  `appendChild` (preserves node identity), assemble chrome synchronously, then
  `initTree` only the new chrome.
- Read state back with `Alpine.$data(el)`; let `$nextTick` callbacks flush
  with a couple of awaited timer ticks before asserting.
- **A green logic test proves state, not visibility.** A component can mount,
  hold correct state, and dispatch the right events while its panel renders at
  zero size. The case that taught this: `x-collapse` on an element with no
  companion `x-show` sets `el.hidden = true` (the plugin keys on `_x_isShown`,
  which only `x-show` sets), so a browse panel mounted via `x-if` never showed,
  though its picker was fully wired. Logic tests driving the data passed; only a
  render (`npm run shot`) caught the blank panel. Pair `x-collapse` with an
  `x-show`, or, when you only need presence toggling and not the height
  animation, mount with a plain `x-if` and no `x-collapse`.
- **Reactive values fail `deepStrictEqual`.** `Alpine.$data(el)` and anything
  read through it are `@vue/reactivity` proxies; a strict structural compare
  rejects the proxy prototype ("same structure but not reference-equal"). Strip
  to plain first: `JSON.parse(JSON.stringify(v))`.

### Rolling jsdom + Alpine by hand

`bootstrap.mjs` encodes all of this; the list exists for when you're outside
it.

- **Node's own `Event` / `CustomEvent` globals** break cross-realm
  `dispatchEvent`: assign `global.Event = window.Event`, same for
  `CustomEvent`.
- **Expose the DOM globals Alpine reaches for:** `ShadowRoot`, `Node`,
  `HTMLElement`, `DocumentFragment`, `MutationObserver`, `Element`,
  `customElements`.
- **Polyfill `matchMedia`** (with a settable `matches`) and
  **`requestAnimationFrame`**, the latter on both the window and `global`;
  Alpine's `x-show` transitions call it bare in the Node realm.
- **Bind `getComputedStyle`** onto `global` (`window.getComputedStyle.bind(window)`):
  `x-transition` reads it bare to time transitions. Without it, a component
  carrying an `x-transition` throws on mount (`getComputedStyle is not defined`)
  in a `requestAnimationFrame` callback; jsdom's returns empty durations, so the
  transition resolves instantly.

## Gotchas

- On a partial render, check the intercept log for `MISS` before suspecting
  resolver semantics; an unvendored spec in a `/combine/` URL serves as empty.
- A package with no `jsdelivr`/`browser` field needs a `CDN_DEFAULT` entry in
  `cdn.mjs`, else the fallback picks `module`, an ESM file that throws inside
  a classic `<script>`.
- `cdn.mjs` mirrors jsDelivr's value-adds: `/+esm` imports get the package's
  ESM entry, and a requested `.min.*` falls back to the unminified file when
  the tarball ships none. One gap is in principle unfixable locally: real
  jsDelivr bundles a CJS dependency graph into ESM server-side, so a CJS-only
  package's `/+esm` import misses; no rendered page currently hits it.
- Import `alpinejs/dist/module.esm.js`, never bare `alpinejs`: the package has
  no `exports` map, CJS interop double-wraps the default export, and the
  symptom is `Alpine.start is not a function`.

## Fallback: driving Chromium directly

For HTML that isn't a repo page (a scratch file, a `data:` URL, a non-gh.load
site), drive the pre-installed Chromium yourself; the binary inventory is in
[capabilities.md](capabilities.md#browsers--headless-rendering-available).

```js
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] });
const p = await b.newPage();
await p.goto('file:///tmp/site/page.html');
await p.screenshot({ path: '/tmp/shot.png', fullPage: true });
await b.close();
```

Chromium ships its own trust store and doesn't trust the sandbox's TLS
inspection CA, so any `https://` URL fails with
`net::ERR_CERT_AUTHORITY_INVALID` without `--ignore-certificate-errors`
(curl / Node / Python use the system bundle and don't need it). The flag
doesn't bypass the allowlist; denied hosts still return the proxy's 403 page,
just as page content.

## Parsing / testing HTML without a browser

| Tool | Lang | Runs `<script>`? | Use when |
|---|---|---|---|
| **cheerio** | Node | No | jQuery-style traversal of static markup |
| **linkedom** | Node | No | DOM API on static markup |
| **happy-dom** | Node | Sometimes (construction-dependent) | lighter DOM, partial JS |
| **jsdom** | Node | Yes (`runScripts: 'dangerously'`) | inline scripts must execute |
| **BeautifulSoup / lxml / selectolax / parsel** | Python | No | Python-side traversal |

## Tailwind generates a toggled utility lazily, not never (2026-07-26)

`@tailwindcss/browser@4` emits a utility's rule **the moment the class appears in
the DOM**, including when Alpine toggles it onto an element that was already
there. It watches the document and regenerates. A toggle-only utility therefore
works, and needs no workaround.

This corrects an earlier entry here that said the opposite. The observation
behind it was real and is easy to repeat: open a page, inspect the stylesheets,
and `.animate-spin` and `.rotate-180` genuinely have no rule while `.truncate`
does. The wrong part was the inference. Nothing has toggled yet, so the rule has
not been generated yet; it appears when the class does. Measured on
`show-repo`, before and after toggling `animate-spin rotate-180` onto a live
element:

| | `.truncate` | `.animate-spin` | `@keyframes spin` | `.rotate-180` |
|---|---|---|---|---|
| before the toggle | present | absent | absent | absent |
| after the toggle | present | present | present | present |

with `getComputedStyle(el).animationName === 'spin'` and `rotate === '180deg'`
after. Driving the real Repos-view Refresh button (`estate.js`, flipping
`configRefreshing`) spins it. Verified against both the vendored
`@tailwindcss/browser@4.3.3` and the bytes jsDelivr serves the deployed page.

**The baked path does not change this.** A page built by the `bake-page` skill
has its CSS compiled ahead of time with no runtime observer, but that compiler
scans **source as text**, so a literal in `:class="open && 'rotate-180'"` is
found and kept. What breaks under baking is a class *assembled* from fragments
(`'ph-' + name`), which no text scan can see. That, not toggling, is the hazard
worth designing around, and it is the same hazard in both builds.

Two carried-over notes that remain correct on their own terms:

- **Two static glyphs swapped with `x-show`** (`ph-caret-down` / `ph-caret-up`,
  as `crumb-bar.js`, `repo-menu.js`, and `path-picker.js` do) is a fine way to
  build a caret, and is what a Phosphor icon swap needs anyway, since the glyph
  itself is a class. Read it as a style choice, not as a workaround for a
  Tailwind limitation that does not exist.
- **Assert on computed effect, not on the class attribute**, and not on
  stylesheet text. `getComputedStyle(el).animationName` is the honest check;
  `className.includes('animate-spin')` passes either way. Stylesheet text is
  worse than it looks: cross-origin sheets (daisyUI, Phosphor) throw on
  `cssRules` and silently contribute nothing, and Tailwind nests its output in
  `@layer`, so a naive `startsWith('.truncate')` scan reports absent for rules
  that are plainly there. That combination is how the original entry got written.

`isVisible` is separately misleading for a bottom sheet, which parks itself
off-screen with a transform rather than hiding, so it reads as visible when
closed; compare `getBoundingClientRect()` against the viewport instead.
