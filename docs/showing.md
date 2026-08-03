# Showing: getting a thing in front of a viewer

The estate answers one question in a dozen ways: **something exists somewhere, and someone needs to look at it.** This file is the machinery. [SURFACING.md](SURFACING.md) is the etiquette that decides what to hand over; [show-repo.md](show-repo.md) is the app you hand it from. The one-line split, since "surfacing" and "showing" are near-synonyms in ordinary English and this only holds if it is stated: **surfacing decides what to hand over; showing is what makes it openable.**

> **The reference is the app, not this file.** The mechanisms, what each reaches and misses, and the rule for picking one all live in [`docs/routes.json`](routes.json) under `showing`, and render live in show-repo's **Map view, Transport tab**. That is deliberate. This material spent a year as 1,589 words in `CLAUDE.md`, 63% of the file, and the session that finally split it had every one of those words in context and still handed over the wrong link. A rule nobody can hold is a rule the app should hold. What stays here is the frame and the record: why the boundaries are where they are, and what it cost to find them.

## The frame

Three independent variables decide everything. Conflating them is what made this hard to state, and "preview" is not a topic: it is one value of the second.

| | Values |
| --- | --- |
| **Subject** | a page (renders itself), a file (needs a renderer), a fileset (needs an envelope), data (needs a viewer), a repo (needs a browser) |
| **Version** | the deployed default branch, a branch, a private repo, bytes carried in the link, a frozen snapshot |
| **Viewer** | holds a GitHub token, signed into Claude, carries nothing |

The mechanism table is a lookup over those three. It is generated from the manifest rather than written here, so it cannot drift from what the router actually accepts.

## The two mechanisms are inverses

This is the part worth understanding rather than looking up, because it explains every entry in the table:

|  | Top-level document | Reaches | Misses |
| --- | --- | --- | --- |
| **`?use=`** | main's page file, real | anything **lib** does, top-level chrome included | the page's own inline shell |
| **🥏 nesting** | the branch's shell, but framed | shell internals: routing, mounting, rendering, address parsing | anything the shell does to the **top-level context** |

A change that is *both* in a page's own inline shell *and* aimed at top-level chrome is reachable by neither, and the escape is not a better link but **moving the code**: in a lib module, `?use=` reaches it, since that is the only mechanism swapping code without swapping which document is on top.

## How it works, in detail

GitHub Pages serves from one branch, typically main, so to render branch code through the canonical URL `lib/gh-api.js` honors a `?use=<branch|tag|sha>` query parameter: pages that adopt the convention read it at boot and load the rest of their code from that ref. Useful when linking the user to a test page that exercises work on a branch. See `README.md` for the canonical boot block.

Both `?use=` boots now fetch the reffed code from `raw.githubusercontent.com` and blob-import it, so a **branch name is cache-safe on every `?use=` page** and a fresh push previews immediately, no SHA needed. The **pre-build `dist/web-tools.js` boot** (show-repo, review, prebuild-demo) blob-imports the whole reffed bundle (see [tools/README.md](../tools/README.md#the-pre-build)); the **`lib/gh-api.js` chain boot** (every other lib-booting page) blob-imports the reffed `gh-api.js`, which then loads the rest through the contents API at that ref (a `window.__ghBlobBoot` carrier hands repo/ref past the opaque `blob:` URL, since `import.meta.url` can no longer supply the ref). jsDelivr is used only where it is cache-stable or unavoidable: the no-`?use` `@main` default that every chain page imports (this repo's one CDN entry point), and the two bundle demos (`alpine-bundle-demo`, `vanilla-bundle-demo`), whose proof frames load lib via classic `<script src>` that raw's `text/plain` + `nosniff` cannot back, so their `?use=` handoff stays on jsDelivr.

**What `?use=` swaps, and what it doesn't (the boundary with 🥏).** `?use=` only redirects the code a page *loads* (`gh.load(...)`, the `dist/` import): github.io still serves the **page file itself from main**, and only its downstream lib is pinned to the ref. So `?use=` previews branch work that lives in `lib/` or `dist/`, but **not** a change to a page's own inline shell (its markup, or an `x-data` defined inline in the file). For a page whose branch change is in the shell, `?use=` on the deployed URL runs main's old shell with branch lib and shows the pre-change page. Preview those with the **🥏 toss `#gh=` address mode** instead (`pages/toss-render.html#gh=mehrlander/web-tools@<ref>:pages/<page>.html`): it fetches the branch's actual file via the token, stamps a `?use` shim so the shell's own lib chain loads from `<ref>` too, and reroutes the page's relative deps and `fetch()`es to the same ref (see the `toss-render.html` head comment). So the rule of thumb: **lib/dist change → ⭐ `?use=`; page-shell change on an un-deployed branch → 🥏 toss `#gh=`.** A 🥏 link always points at `toss-render.html`, never at the page's own URL.

**A toss carries main's lib, including the FAB.** The two rules above are about the *subject*, and they leave a gap that has now cost two rounds of "I looked and it isn't there": `toss-render.html` is served from main, so the shell around a tossed page, and every module that shell loads, comes from **main** no matter which ref the `#gh=` address names. A branch change to `lib/alpineComponents/fab.js` is therefore invisible through a plain 🥏 link to a branch page: the subject renders from the branch and the drawer around it is the deployed one. Nothing reports the mismatch, because nothing is wrong; the FAB's own `?use=`-was-ignored check does not fire, since no `?use=` was asked for.

The fix is to pin the shell too, with `?use=` in the **query** and the address in the fragment (`toss-render.html` reads the parameter from `location.search` only):

> `https://mehrlander.github.io/web-tools/pages/toss-render.html?use=<ref>#gh=mehrlander/web-tools@<ref>:pages/<page>.html`

So when a branch touches anything the shell loads, hand over that form rather than the bare toss, and say which half each ref is pinning. When the branch touches only the subject page, the bare 🥏 link is still correct and the extra parameter is noise.

**Every page that boots lib honors `?use=`, and every one carries the FAB.** Both were once partial, and the gap was silent in a way that cost real time: five pages pinned the ref in their own boot block and ignored the parameter, while the FAB reported a preview based on the address bar rather than on what loaded, so a `?use=` link to one of those pages showed a preview banner over default-branch code. The FAB now cross-checks `window.gh.ref` and says plainly when `?use=` was ignored. When adding a page, use the canonical boot block (see `README.md`) rather than a hardcoded ref; `gh-boot.js` mounts the FAB unless the page mounts its own or sets `data-no-fab` on `<html>`/`<body>`.

The honesty rule still applies: only a page renders this way; for a kit or doc, ⭐ links the `[new]` blob.

**When toss-render itself is the change, nest it.** A 🥏 link is served by **main's** `toss-render.html`, so the deployed shell is the one parsing the address. Branch work on that page previews by **nesting**: address the branch's own `toss-render.html` as the subject, and hand it the page you actually want as the trailing fragment.

> `https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=mehrlander/web-tools@<ref>:pages/toss-render.html#gh=mehrlander/web-tools@<ref>:pages/<page>.html`

Main renders the branch's shell, which renders the page two frames deep. Both halves of an address reach the inner shell for real: a `?query` arrives through the params shim, and a trailing `#frag` rides the frame's `blob:` URL as a genuine `location.hash`. So routing, frame mounting, rendering, and **address-bar parsing** are all previewable. This file used to say the last of those was out of reach, on the grounds that a nested shell never sees an address bar; that stopped being true when fragment delivery landed, and it was measured wrong twice before it was measured right.

The drawer around it is a separate question, and the answer is **both sides, attributed**. `detect()` collects page-contributed actions from the subject as well as the shell, so a nested preview shows the branch's `tossRender.actions` as the subject's, alongside the deployed shell's. The shell's rows carry a stacked-windows glyph and say "contributed by this renderer" in their tooltip; the unmarked rows are the branch's. That is a preview with a footnote rather than a clean one, so say which rows you mean. Invoking across the window boundary is handled rather than avoided: the FAB focuses the subject's frame first, because an unfocused document cannot write the clipboard, and an action that navigates returns `{ nav }` for the FAB to perform top-side, since `location.href` inside the frame moves the frame. [`tools/test/subject-actions.mjs`](../tools/test/subject-actions.mjs) holds all of it at depth 2, and [`tools/test/fab-subject-actions.test.mjs`](../tools/test/fab-subject-actions.test.mjs) holds the collection shape in `npm test`.

**What nesting cannot reach: the top-level chrome.** A nested shell really runs, but never as the **top-level document**, and the tab belongs to whatever document is on top. So a shell change acting on that context executes correctly and shows nothing. The favicon is the case that found this (PR #315): the branch's shell reads its subject's icon and sets it on its own framed document, invisibly, while main's outer shell keeps the frisbee. The rest of the class is `document.title`, `history.replaceState`, and top-level navigation. `absUrl` had already met the seam without naming it, special-casing `location.protocol === 'blob:'` to reach for `top.location`, since a nested shell has no visitable address of its own.

A change that is *both* in a page's own inline shell *and* aimed at top-level chrome is reachable by neither, and the escape is not a better link but **moving the code**: in a lib module, `?use=` reaches it, since that is the only mechanism swapping code without swapping which document is on top.

Two things measured at depth 2 that look like bugs and are not. The icon arrives **dimmed twice**, because each shell dims its own subject and the outer shell's subject is the inner shell. And the tab's icon and its label describe **different levels**: the icon chains to the innermost page, while the label names the outer shell's own subject. Both are each shell being accurate about what it was asked to render; only the icon's transitivity is accidental, arising from reading the subject document's resolved icon. Apt enough for a toss of a toss, visible only when nesting deliberately, and left alone.

The rule that outlives the specifics: before claiming a branch change is visible through a link, check whether it lives in **lib** (previewable with `?use=`), in a **page shell** (previewable only when the page is the toss subject, which for toss-render means nesting), or in a page shell **acting on the top-level document** (previewable by neither). Headless evidence is the substitute; say so rather than implying the link will show it.

**Viewer context adds a third channel, the 📦 artifact.** Both 🥏 forms assume something about where the link opens: `#gh=` needs the viewer's browser to hold the `ghToken`. The Claude app's in-app browser keeps its own storage, so the token is not guaranteed there (historically absent, though it can be entered, after which `#gh=` works there too). Treat the token as possibly absent in the app: when it is, `#gh=` fails, so for a link the user will open there, bake the page self-contained (`bake-page` skill) and publish it as a 📦 artifact (renders on claude.ai sign-in, no token needed); 🥏 `#gz=` is the no-build fallback. Matrix and pipeline: [docs/artifacts.md](artifacts.md).
