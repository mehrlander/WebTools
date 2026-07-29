@docs/CONVENTIONS.md
@docs/SURFACING.md

## How these instructions are split

The two imports above are the portable half: conventions that apply in any repo. [docs/CONVENTIONS.md](docs/CONVENTIONS.md) is the general-behavior hub; [docs/SURFACING.md](docs/SURFACING.md) is the surfacing system (primitives plus the guide-PR/merge-guide course), split out because it was the bulk of the file. Both are canonical here; other repos load them via the `web-tools` skill (`.claude/skills/web-tools/SKILL.md`), which fetches both from main. Everything below is web-tools-specific, layered on top, including the repo's answers to the conventions' three extension points (preview mechanism, per-session refreshes, guide-PR support). Portable guidance goes in CONVENTIONS.md or SURFACING.md; web-tools machinery goes here.

CONVENTIONS.md is one of several docs written to travel; the full to-go bag (conventions, scripts, the headless-vendoring recipe, the sandbox notes) is catalogued in [docs/PORTABLE.md](docs/PORTABLE.md), which the loader skill points at and which points back. When adding a doc or script meant for reuse elsewhere, list it there.

## Preview mechanism: test page on a branch via `?use=`

GitHub Pages serves from one branch, typically main, so to render branch code through the canonical URL `lib/gh-api.js` honors a `?use=<branch|tag|sha>` query parameter: pages that adopt the convention read it at boot and load the rest of their code from that ref. Useful when linking the user to a test page that exercises work on a branch. See `README.md` for the canonical boot block.

Both `?use=` boots now fetch the reffed code from `raw.githubusercontent.com` and blob-import it, so a **branch name is cache-safe on every `?use=` page** and a fresh push previews immediately, no SHA needed. The **pre-build `dist/web-tools.js` boot** (show-repo, review, prebuild-demo) blob-imports the whole reffed bundle (see [tools/README.md](tools/README.md#the-pre-build)); the **`lib/gh-api.js` chain boot** (every other lib-booting page) blob-imports the reffed `gh-api.js`, which then loads the rest through the contents API at that ref (a `window.__ghBlobBoot` carrier hands repo/ref past the opaque `blob:` URL, since `import.meta.url` can no longer supply the ref). jsDelivr is used only where it is cache-stable or unavoidable: the no-`?use` `@main` default that every chain page imports (this repo's one CDN entry point), and the two bundle demos (`alpine-bundle-demo`, `vanilla-bundle-demo`), whose proof frames load lib via classic `<script src>` that raw's `text/plain` + `nosniff` cannot back, so their `?use=` handoff stays on jsDelivr.

This is the repo's **preview mechanism** for the conventions' ⭐ links: a changed page (or a component a page loads) previews live at

> `https://mehrlander.github.io/web-tools/pages/<page>.html?use=<ref>`

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

The drawer around it is a separate question, and the answer is **both sides, attributed**. `detect()` collects page-contributed actions from the subject as well as the shell, so a nested preview shows the branch's `tossRender.actions` as the subject's, alongside the deployed shell's. The shell's rows carry a stacked-windows glyph and say "contributed by this renderer" in their tooltip; the unmarked rows are the branch's. That is a preview with a footnote rather than a clean one, so say which rows you mean. Invoking across the window boundary is handled rather than avoided: the FAB focuses the subject's frame first, because an unfocused document cannot write the clipboard, and an action that navigates returns `{ nav }` for the FAB to perform top-side, since `location.href` inside the frame moves the frame. [`tools/test/subject-actions.mjs`](tools/test/subject-actions.mjs) holds all of it at depth 2, and [`tools/test/fab-subject-actions.test.mjs`](tools/test/fab-subject-actions.test.mjs) holds the collection shape in `npm test`.

**What nesting cannot reach: the top-level chrome.** A nested shell really runs, but it never runs as the **top-level document**, and the tab belongs to whatever document is on top. So a change to what the shell does to that context executes correctly and shows nothing. The favicon is the clean case (PR #315): the branch's shell reads its subject's icon and sets it, on its own framed document, invisibly, while main's outer shell keeps the frisbee. `document.title` has always been in the same position, unnoticed until the favicon work measured it: a nested preview's tab names the inner *shell*, not the page addressed through it. The rest of the class is `history.replaceState` and top-level navigation. `absUrl` had already met the seam without naming it, special-casing `location.protocol === 'blob:'` to reach for `top.location`, since a nested shell has no visitable address of its own.

So the two mechanisms are **inverses**, and the gap is the quadrant neither covers:

|  | Top-level document | Reaches | Misses |
| --- | --- | --- | --- |
| **`?use=`** | main's page file, real | anything **lib** does, top-level chrome included | the page's own inline shell |
| **🥏 nesting** | the branch's shell, but framed | shell internals: routing, mounting, rendering, address parsing | anything the shell does to the **top-level context** |

A change that is *both* in a page's own inline shell *and* aimed at top-level chrome is reachable by neither. The escape is not a better link, it is **moving the code**: relocate that logic into a lib module and `?use=` reaches it, because `?use=` is the only mechanism that swaps code without swapping which document is on top. Measured at depth 2, where the icon arrives dimmed twice (each shell dims its subject, and the outer shell's subject is the inner shell); apt for a toss of a toss, and not worth suppressing.

The rule that outlives the specifics: before claiming a branch change is visible through a link, check whether it lives in **lib** (previewable with `?use=`), in a **page shell** (previewable only when the page is the toss subject, which for toss-render means nesting), or in a page shell **acting on the top-level document** (previewable by neither). Headless evidence is the substitute; say so rather than implying the link will show it.

**Viewer context adds a third channel, the 📦 artifact.** Both 🥏 forms assume something about where the link opens: `#gh=` needs the viewer's browser to hold the `ghToken`. The Claude app's in-app browser keeps its own storage, so the token is not guaranteed there (historically absent, though it can be entered, after which `#gh=` works there too). Treat the token as possibly absent in the app: when it is, `#gh=` fails, so for a link the user will open there, bake the page self-contained (`bake-page` skill) and publish it as a 📦 artifact (renders on claude.ai sign-in, no token needed); 🥏 `#gz=` is the no-build fallback. Matrix and pipeline: [docs/artifacts.md](docs/artifacts.md).

## Per-session refresh: thumbnails

The conventions' wrap-up step 1 means one thing here: if any `pages/*.html` changed this session (`git diff main...HEAD --name-only`), regenerate just those pages' thumbnails (`npm run pages-shots -- <page…>`) and commit. Thumbs are refreshed once per session, not per commit: screenshots are slow and not byte-deterministic, so the commit hook only nags about them (see "Build-on-commit hook" below). The catalogs need no separate step; the hook regenerates them with each commit.

## Guide-PR support: platform auto-create is on

The Claude Code web settings for this account enable "Create pull requests automatically" with "Create as draft" (turned on 2026-07-10), so a session started after that gets its draft PR on first push; a session predating the toggle, or one working in an added repo, opens the draft itself via the GitHub MCP (the toggle was probed not to fire retroactively into an in-flight session). Body sync is by hand via `/caption`; no hook or CI tracks it. `BRANCH-GUIDE.md` files are historical (retired by PR #205); delete any stray one on sight.

## gh-api.js edits

Any turn that modifies `lib/gh-api.js` must end with the jsDelivr purge link so the user can flush the CDN cache with one tap:

> [https://purge.jsdelivr.net/gh/mehrlander/web-tools/lib/gh-api.js](https://purge.jsdelivr.net/gh/mehrlander/web-tools/lib/gh-api.js)

## The pre-build & the build-on-commit hook

`dist/web-tools.js` is **the pre-build**: the whole `lib/` frozen into one self-booting offline artifact, so a page can adopt the entire library with one import instead of a `gh.load` chain. It's generated (`npm run build:lib`) and it's the one tracked file under the otherwise-gitignored `dist/`. Full story in [`tools/README.md`](tools/README.md#the-pre-build).

Every **deterministic** derived artifact is owned by one commit-time hook (`.claude/hooks/build-on-commit.sh`, a `PreToolUse(Bash)` hook wired in `.claude/settings.json`). Before a `git commit` it regenerates and stages, in the same commit, whatever the pending changes touch:

- `lib/` changed → `npm run build:lib` → `dist/web-tools.js`
- `pages/**/*.html` changed → `npm run pages-index` → `pages/README.md` + `pages/index.html`
- `tracker/tasks/` changed → `npm run tracker-board` → `tracker/board.md`

Don't hand-edit any of those four files; edit the source and let the hook refresh them. Thumbnails (`pages/thumbs/*.png`) are the deliberate exception: not byte-deterministic, so the hook only *warns* when a page changes without its thumb; the actual refresh happens once per session at wrap-up (see "Per-session refresh" above).

**The hook is best-effort, so the lockstep has a second owner.** A hook only runs where the harness registers it, and that turns on the session's project root rather than on anything in this repo: where the root sits above the repo, `.claude/settings.json` is never read and none of its hooks fire, silently (cause and tells: [docs/environment/extending.md](docs/environment/extending.md)). So `npm test` carries [`tools/test/artifacts-lockstep.test.mjs`](tools/test/artifacts-lockstep.test.mjs), which re-runs the two deterministic generators in `--check` mode and fails if a tracked artifact is behind its source. When it fails, run the command it names and commit the result. Regenerating by hand after touching `lib/` or `pages/` is still the fast path; the test is what makes forgetting loud instead of silent.

## Project tracker

Root-level `tracker/` scoped to repo-wide work (conventions, build tooling, docs, environment). Follows [`docs/TRACKER.md`](docs/TRACKER.md).

- **Placement:** `tracker/` (single tracker, no registry).
- **Board generator:** `npm run tracker-board` (wired into the commit hook above).

## Environment & testing

For visual changes, `npm run shot -- <page>` (`--ref` for `?use=`, `--script` for interactions) renders branch pixels headless; send the PNG into chat (conventions: "Show pixels").

[`docs/environment/`](docs/environment/) is a living, dated record of the Claude Code web environment, split by concern: [capabilities](docs/environment/capabilities.md) (network allowlist, headless browser, toolchain), [container](docs/environment/container.md) (what persists across sessions), [testing](docs/environment/testing.md) (the jsdom+Alpine recipe and page-preview constraints), and [extending](docs/environment/extending.md) (the Claude Code component model and the hooks this repo runs). Read it when a task involves testing, verifying, or reaching the network; extend it (edit in place, re-date) when you learn something new. Referenced by plain path, not `@`-imported, so it stays out of context until needed.
