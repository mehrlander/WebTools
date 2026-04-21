# web-tools scaffolding — loader contract and extension notes

The repo currently has two tiers of pages:

- **Simple pages** (`pages/index.html`, `compression-helper.html`,
  `bookmarklets-story.html`, `quick-dump.html`, `repo-drag.html`,
  `table-compress*.html`) — each is self-contained: CDN Tailwind + Phosphor
  + Alpine (via `<script defer>`), then an inline `<script>` with the page's
  Alpine components. No shared scaffolding at all.
- **Scaffolded pages** (`show-repo.html`, `demo.html`, `demo-viewer.html`,
  `demo-spacex.html`) — use `gh-fetch.js` + `alpine-bundle.js` to load
  reusable components off CDN at runtime.

This doc is about the second tier — the loader contract those pages depend
on, and what can and can't be added to it without breaking it.

## The scaffolded-page pattern, annotated

Every scaffolded page's `<head>` looks like this, with minor variation:

```html
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web"></script>
<link href=".../daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet" />
<script type="module">
  const mod = await import('https://cdn.jsdelivr.net/gh/mehrlander/web-tools/gh-fetch.js');
  window.GH = mod.default;
  const gh = new window.GH({ token: TOKEN, repo: 'mehrlander/web-tools' });

  await gh.load('alpineComponents/repo.js');      // 1) register Alpine.data('repo', ...)
  await gh.load('alpineComponents/navigator.js'); // 2) register Alpine.data('navigator', ...)
  await gh.load('alpineComponents/viewer.js');    // 3) register Alpine.data('viewer', ...)
  await gh.load('alpine-bundle.js');              // 4) register magics + boot Alpine
  window.ViewRegistry = await gh.load('view-registry.js'); // 5) stash registry
</script>
```

The page body then has `<body x-data="app()" x-init="init()">` and the
components each use `x-data="repo()"`, `x-data="navigator()"`,
`x-data="viewer()"`.

### What each piece contributes

- `gh-fetch.js` — ESM default export, `class GH`. Imported via
  `<script type="module">`, not `gh.load` (bootstrap: it *is* the loader).
  Provides `ls / get / req / history / repos / parseUrl / ago / load`.
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
- `view-registry.js` — a `const ViewRegistry = { … }` object, then a literal
  `return ViewRegistry;` at the top level. Used by pages as
  `window.ViewRegistry = await gh.load('view-registry.js')`.

## The load mechanism (the fragile bit)

`GH.prototype.load`, from `gh-fetch.js:8-30`:

```js
const clean = text
  .replace(/export\s+default\s+/g, '')
  .replace(/export\s+/g, '');

const match = clean.match(/(?:class|function)\s+(\w+)/);
const name = match ? match[1] : null;
const body = name ? `${clean}; return ${name};` : clean;
return new Function(body)();
```

Unpacked, this is the contract any file fed through `gh.load()` must honor:

1. **No ES module syntax survives.** The regex only strips `export` /
   `export default`. Any `import …` line will be evaluated literally inside
   `new Function(body)()` and throw `SyntaxError: Cannot use import statement
   outside a module`. **Files loaded via `gh.load()` cannot import anything.**
   They can use globals, and they can use `await import(...)` (dynamic
   import, which is just an expression) if they need ESM.
2. **First top-level `class Name` or `function Name` wins.** If the regex
   matches, `gh.load()` returns that named binding. Multiple top-level
   declarations → only the first is returned.
3. **If no `class Name` / `function Name` match, the file must `return X`
   explicitly** if the caller expects a value. This is how `view-registry.js`
   works — it ends with `return ViewRegistry;` and has a load-bearing
   comment saying so.
4. **Side-effect files return `undefined`.** This is the normal case for
   files that just want to run `document.addEventListener('alpine:init', …)`
   or `customElements.define(…)`. The caller uses them for side effects and
   ignores the return value.
5. **`new Function(body)()` is eval-ish.** No module scope. Top-level
   `const`/`let` live on the function's local scope, not on `window`. So
   "export" means one of: a top-level named `class`/`function`, an explicit
   `return`, or an assignment to `window.X`.

The consequence: if we want to bring in any file from Alp's
`utils/kits/`, which use `import { brotli } from './brotli.js'`, they
**cannot be loaded via `gh.load()`**. They're ESM. They'd have to be loaded
via native `import()` instead.

## The timing invariants, stated explicitly

These hold in the current scaffolded pages and must not be broken by
anything we add:

1. **`gh-fetch.js` is imported first**, via native `import()`. Nothing else
   has dependencies.
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
   why `show-repo.html`'s `app.init()` opens with
   `while(!window.GH || !window.ViewRegistry) await new Promise(r => setTimeout(r, 50));`.
   Alpine can reach `init()` before the module script's final
   `await gh.load('view-registry.js')` resolves, because the two tasks
   (module script vs. Alpine boot) aren't coordinated.
5. **Component-to-component handles rely on element back-pointers.**
   `init() { this.$root.__navigator = this }` in `navigator.js`, and other
   pages do `while(!navEl.__navigator) await new Promise(r => setTimeout(r, 50));`
   to wait for it. This is the current idiom for "have I mounted yet?".
6. **Token sentinel `🎟️GitHubToken`.** Both `gh-fetch.js` (in `headers`) and
   pages look for that exact string and replace it (or fall back to
   `localStorage.ghToken`). Anything we add that touches tokens must use
   the same sentinel.

## What breaks the pattern

A short list of footguns to avoid when adding new files:

- **Adding `import` / `export` statements to a file that's meant to be
  loaded via `gh.load()`.** `export default` and `export ` are stripped;
  `export { a, b }` becomes `{ a, b }` (a syntax error or expression
  statement depending on context); `import` always throws.
- **Multiple top-level `class Foo` / `function Foo` declarations in one
  file.** Only the first one is returned. Consolidate or put them inside
  an IIFE that explicitly `return`s what it wants.
- **Registering `alpine:init` handlers after `alpine-bundle.js` loads.**
  Race depends on Alpine's CDN speed; intermittent. The rule is: all
  component files go before alpine-bundle.
- **Declaring top-level `const X = …` and expecting `gh.load()` to return
  it.** It won't — `const` is local to the eval'd function body. Either
  assign to `window.X`, use `class X {}`, or append `return X;` at the
  bottom (see `view-registry.js`).
- **Forgetting the `🎟️GitHubToken` sentinel.** Any new file that wants a
  token should look for that exact sentinel and fall back via
  `try { localStorage.getItem('ghToken') } catch {}` to stay data-URL-safe.
- **Relying on `Alpine.store('…')` at module top level.** Stores only
  exist after `alpine-bundle.js`'s `alpine:init` listener runs. Access
  them inside `init()` / methods / getters, not at the top level of the
  file.

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

### Option B — make `gh-fetch.js` richer

Best for: things every scaffolded page wants (retry/backoff for rate
limits, a batch loader, a tiny pub-sub, a token-picker UI helper, a
`persist(key, data)` helper that saves to the user's home repo the way
`show-repo.html` currently does).

Rules:
- `gh-fetch.js` is already an ESM class with a default export. Adding
  methods is cheap.
- Keep it import-only (no side effects at module level). The page decides
  when to instantiate.
- Anything that reaches into Alpine (stores, magics) does *not* belong
  here — that's alpine-bundle's job.

Cost: every scaffolded page gets it free. Risk: it becomes a kitchen sink.
Good rule of thumb: only add a method if at least two pages would use it.

### Option C — add a third scaffolding file

Best for: a concern that is not "GitHub access" and not "Alpine init" —
e.g., a view-registry expansion, a component loader convention, a
compression kit, a persistent storage helper.

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

Current precedent: `view-registry.js` is a plain-script file loaded via
`gh.load` that returns the registry object. `gh-fetch.js` is native ESM.
Pick the style deliberately; the two can't be interchanged freely because
of the `new Function()` constraint.

### Option D — step outside the pattern for one-off pages

Best for: pages that don't need repo browsing at all (e.g., the current
`compression-helper.html`).

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
  `view-registry.js` since that's where Tabulator is used today.

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
  new scaffolding file. **Option C, plain-script flavor, or ESM** — and
  the choice matters: if we want individual components (like an updated
  `alpineComponents/foo.js`) to call `save()`/`load()`, the runtime needs
  to be attached to globals before alpine-bundle loads. ESM with dynamic
  import + `window.assign` is fine; plain-script loaded ahead of
  alpine-bundle is fine too.

## Quick checklist for "can I load this file through gh.load?"

- [ ] Does it have `import` statements at the top? → **No, use native ESM
      import instead.**
- [ ] Does it have multiple top-level named `class` / `function`
      declarations and you want all of them? → **No, wrap in IIFE and
      `return` the object.**
- [ ] Does it need to produce a value for the caller (not just side
      effects)? → **Ensure exactly one top-level `class Name` /
      `function Name`, or end with `return X;`.**
- [ ] Does it use `Alpine.store(...)` / `Alpine.data(...)`? → **Yes — fine,
      but register them inside `document.addEventListener('alpine:init', …)`
      and load the file before `alpine-bundle.js`.**
- [ ] Does it need a token? → **Use the `🎟️GitHubToken` sentinel with the
      `localStorage.ghToken` fallback, data-URL-safe.**

If any "No" above is a hard requirement, use a native `import()` instead
of `gh.load()` for that file. Mixing is fine: a page can do

```js
import GH from '.../gh-fetch.js';
const { text } = await import('.../compression/text.js');
const gh = new GH({ token, repo });
await gh.load('alpineComponents/foo.js');
await gh.load('alpine-bundle.js');
```

and everything orders correctly as long as each `await` completes before
the next starts.
