@docs/CONVENTIONS.md
@docs/SURFACING.md

## How these instructions are split

The two imports above are the portable half: conventions that apply in any repo. [docs/CONVENTIONS.md](docs/CONVENTIONS.md) is the general-behavior hub; [docs/SURFACING.md](docs/SURFACING.md) is the surfacing system (primitives plus the guide-PR/merge-guide course), split out because it was the bulk of the file. Both are canonical here; other repos load them via the `web-tools` skill (`.claude/skills/web-tools/SKILL.md`), which fetches both from main. Everything below is web-tools-specific, layered on top, including the repo's answers to the conventions' three extension points (preview mechanism, per-session refreshes, guide-PR support). Portable guidance goes in CONVENTIONS.md or SURFACING.md; web-tools machinery goes here.

CONVENTIONS.md is one of several docs written to travel; the full to-go bag (conventions, scripts, the headless-vendoring recipe, the sandbox notes) is catalogued in [docs/PORTABLE.md](docs/PORTABLE.md), which the loader skill points at and which points back. When adding a doc or script meant for reuse elsewhere, list it there.

## The Web Tools app

[docs/APP.md](docs/APP.md) is the product frame: mission, goals, and the name split (**Web Tools** where a reader is addressed; **show-repo** on files, routes, and the tracker project).

## Showing: which link shows what

The mechanisms, what each reaches and misses, and the rule for picking one are **not restated here**. They live as data in [`docs/showing-mechanisms.csv`](docs/showing-mechanisms.csv) and render in the app's **Map view, Showing tab**; the frame and the record are in [`docs/showing.md`](docs/showing.md). This section used to be 1,589 words, 63% of this file, and it still did not stop a session with all of it in context from handing over the wrong link. The app holds it now.

The one thing worth carrying in your head, because it is the trap:

> **`?use=` swaps only the code a page LOADS.** github.io serves the page **file** from the default branch, so a change to a page's own shell (its markup, an inline `x-data`) shows the old shell wrapped around new lib, silently. Shell change → 🥏 toss `pages/toss-render.html?use=<ref>#gh=mehrlander/web-tools@<ref>:pages/<page>.html`. Lib change → ⭐ `pages/<page>.html?use=<ref>`.

The honesty rule still applies: only a page renders this way; for a kit or doc, ⭐ links the `[new]` blob. Say when no link can show a change, and send a headless screenshot instead.

## Per-session refresh: thumbnails

The conventions' wrap-up step 1 means one thing here: if any `pages/*.html` changed this session (`git diff main...HEAD --name-only`), regenerate just those pages' thumbnails (`npm run pages-shots -- <page…>`) and commit. Thumbs are refreshed once per session, not per commit: screenshots are slow and not byte-deterministic, so the commit hook only nags about them (see "Build-on-commit hook" below). The catalogs need no separate step; the hook regenerates them with each commit.

## Guide-PR support: platform auto-create is on

The Claude Code web settings for this account enable "Create pull requests automatically" with "Create as draft" (turned on 2026-07-10), so a session started after that gets its draft PR on first push; a session predating the toggle, or one working in an added repo, opens the draft itself via the GitHub MCP (the toggle was probed not to fire retroactively into an in-flight session). Body sync is by hand via `/caption`; no hook or CI tracks it. `BRANCH-GUIDE.md` files are historical (retired by PR #205); delete any stray one on sight.

## gh-api.js edits

Any turn that modifies `lib/gh-api.js` must end with the jsDelivr purge link so the user can flush the CDN cache with one tap:

> [https://purge.jsdelivr.net/gh/mehrlander/web-tools/lib/gh-api.js](https://purge.jsdelivr.net/gh/mehrlander/web-tools/lib/gh-api.js)

## The pre-build & the build-on-commit hook

`dist/web-tools.js` is **the pre-build**: the whole `lib/` frozen into one self-booting offline artifact, so a page can adopt the entire library with one import instead of a `gh.load` chain. It's generated (`npm run build:lib`) and it's the one tracked file under the otherwise-gitignored `dist/`. Full story in [`tools/README.md`](tools/README.md#the-pre-build).

The `gh.load` chain it replaces is the repo's default, not a legacy path: 36 page files use it, and [`docs/loader.md`](docs/loader.md) is the only statement of the contract a file must honor to be loadable that way, plus the timing invariants the boot sequence depends on. Read it before adding a file to `lib/` or changing how a page boots. Which folder the file belongs in at all is the prior question, answered once in [`docs/code-layers.md`](docs/code-layers.md) and measured by `npm run code-survey`. It is also the argument that load and build are two readings of one set of rules, which is why the pre-build works at all.

Every **deterministic** derived artifact is owned by one commit-time hook, [`.githooks/pre-commit`](.githooks/pre-commit). Before a `git commit` it regenerates and stages, in the same commit, whatever the pending changes touch:

- `lib/` changed → `npm run build:lib` → `dist/web-tools.js`
- `pages/**/*.html` changed → `npm run pages-index` → `pages/README.md` + `pages/index.html`
- skills, `lib/`, `pages/`, or `docs/` changed → `npm run docs-reach` → the `reach` and `words` fields in `docs/docs.json`
- `docs/docs.json` changed → `npm run docs-readme` → `docs/README.md`, then `npm run docs-reach` again (leg 3c)
- `docs/SNAGS.md` changed → `npm run snags-index` → the index block at its top
- `tracker/tasks/` changed → `npm run tracker-board` → `tracker/board.md` + `tracker/board.json`

`reach` and `words` are the odd ones: derived fields in an otherwise authored
file, so `docs/docs.json` is hand-edited everywhere except those two keys.
`reach` says who can get to a doc and moves when a skill or page names a file,
an edit nowhere near the registry; `words` says how much of the folder it is.
The two disagree, which is why the Docs tab shows both: the orphans are the
larger count and the smaller mass. `tools/test/docs-registry.test.mjs` holds
both to the derivation and names the restamp command when they part.

Leg 3c exists because 3a and 3b are a cycle: `docs/README.md` is generated *from*
the registry and is also a row *in* it. One more stamp settles it. The stamp
itself runs to a fixpoint for the same reason one level down, and asserts
convergence rather than assuming it.

Don't hand-edit any of those five files; edit the source and let the hook refresh them. Thumbnails (`pages/thumbs/*.png`) are the deliberate exception: not byte-deterministic, so the hook only *warns* when a page changes without its thumb; the actual refresh happens once per session at wrap-up (see "Per-session refresh" above).

**It is a git hook, not a Claude Code hook, deliberately:** a `PreToolUse` hook is read only when the session's project root IS this repo, so a multi-repo session ran it never and said nothing. [`.claude/hooks/session-githooks.sh`](.claude/hooks/session-githooks.sh) sets `core.hooksPath`; `--no-verify` bypasses. Why, and what it does not generalize to: [extending.md](docs/environment/extending.md).

**Best-effort still.** A clone that never set `core.hooksPath` runs nothing, so `npm test` keeps [`tools/test/artifacts-lockstep.test.mjs`](tools/test/artifacts-lockstep.test.mjs), which re-runs each generator in `--check` mode and fails if a tracked artifact is behind its source. Run the command it names and commit the result.

Regenerating by hand after touching `lib/` or `pages/` is still the fast path; the test makes forgetting loud instead of silent. Why each generator has to be byte-deterministic, and the tracker board's 2026-08-05 counterexample, are in [`tools/README.md`](tools/README.md#the-refresh-model).

**And a third owner, which does not depend on anyone remembering.** The test only speaks when the suite is run, so [`.github/workflows/test.yml`](.github/workflows/test.yml) runs `npm test` on every pull request and reports it as a check on the PR. That is the whole reason it exists: a hook that may not fire, guarded by a test that may not be run, was a chain with no link the platform enforced. It is the repo's only workflow triggered by a commit under review, so it is the only one whose result appears as a check rather than only in the Actions tab; `wsl-fetch.yml` is an errand on a cron. The suite is browser-free by construction (`node --test` globs `tools/test/**/*.test.mjs`, and every Playwright-driven check is named without `.test.`), so keep it that way or the runner grows a browser install. One caveat worth knowing: `package-lock.json` is gitignored, so CI resolves dependency ranges fresh on each run and a green check is not a claim about a pinned tree.

## Project tracker

Root-level `tracker/` scoped to repo-wide work (conventions, build tooling, docs, environment). Follows [`docs/TRACKER.md`](docs/TRACKER.md).

- **Placement:** `tracker/` (single tracker, no registry).
- **Board generator:** `npm run tracker-board` (wired into the commit hook above).

## Registries

A committed JSON or CSV that inventories or classifies part of the tree is a
**registry**; adding one means adding a row to
[`docs/registries.csv`](docs/registries.csv) in the same commit. The model,
the rules, and what its audits found are in
[`docs/registries.md`](docs/registries.md); read it before inventing a carrier,
since the answer is usually a row in one that exists. The one trap: **one
property about one target answers to one registry** (gated); resolve a
collision with a **crosswalk** (curation inheriting a census's description),
never by renaming a side, which keeps the duplicate.


## Snags

[`docs/SNAGS.md`](docs/SNAGS.md) is this repo's friction log, the store behind the conventions' "where a friction observation goes instead." Its own header carries the intake shape, the recurrence rule, the generated index, and what is still provisional; this section restated them and was the copy.

## Environment & testing

For visual changes, `npm run shot -- <page>` (`--ref` for `?use=`, `--script` for interactions) renders branch pixels headless; send the PNG into chat (conventions: "Show pixels").

[`docs/environment/`](docs/environment/) is a living, dated record of the Claude Code web environment, split by concern: [capabilities](docs/environment/capabilities.md) (network allowlist, headless browser, toolchain), [container](docs/environment/container.md) (what persists across sessions), [testing](docs/environment/testing.md) (the jsdom+Alpine recipe and page-preview constraints), and [extending](docs/environment/extending.md) (the Claude Code component model and the hooks this repo runs). Read it when a task involves testing, verifying, or reaching the network; extend it (edit in place, re-date) when you learn something new. Referenced by plain path, not `@`-imported, so it stays out of context until needed.
