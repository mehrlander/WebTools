@docs/CONVENTIONS.md
@docs/SURFACING.md

## How these instructions are split

The two imports above are the portable half: conventions that apply in any repo. [docs/CONVENTIONS.md](docs/CONVENTIONS.md) is the general-behavior hub; [docs/SURFACING.md](docs/SURFACING.md) is the surfacing system (primitives plus the guide-PR/merge-guide course), split out because it was the bulk of the file. Both are canonical here; other repos load them via the `web-tools` skill (`.claude/skills/web-tools/SKILL.md`), which fetches both from main. Everything below is web-tools-specific, layered on top, including the repo's answers to the conventions' three extension points (preview mechanism, per-session refreshes, guide-PR support). Portable guidance goes in CONVENTIONS.md or SURFACING.md; web-tools machinery goes here.

CONVENTIONS.md is one of several docs written to travel; the full to-go bag (conventions, scripts, the headless-vendoring recipe, the sandbox notes) is catalogued in [docs/PORTABLE.md](docs/PORTABLE.md), which the loader skill points at and which points back. When adding a doc or script meant for reuse elsewhere, list it there.

## Showing: which link shows what

The mechanisms, what each reaches and misses, and the rule for picking one are **not restated here**. They live as data in [`docs/routes.json`](docs/routes.json) under `showing` and render live in show-repo's **Map view, Showing tab**; the frame and the record are in [`docs/showing.md`](docs/showing.md). This section used to be 1,589 words, 63% of this file, and it still did not stop a session with all of it in context from handing over the wrong link. The app holds it now.

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

Every **deterministic** derived artifact is owned by one commit-time hook (`.claude/hooks/build-on-commit.sh`, a `PreToolUse(Bash)` hook wired in `.claude/settings.json`). Before a `git commit` it regenerates and stages, in the same commit, whatever the pending changes touch:

- `lib/` changed → `npm run build:lib` → `dist/web-tools.js`
- `pages/**/*.html` changed → `npm run pages-index` → `pages/README.md` + `pages/index.html`
- `tracker/tasks/` changed → `npm run tracker-board` → `tracker/board.md` + `tracker/board.json`

Don't hand-edit any of those five files; edit the source and let the hook refresh them. Thumbnails (`pages/thumbs/*.png`) are the deliberate exception: not byte-deterministic, so the hook only *warns* when a page changes without its thumb; the actual refresh happens once per session at wrap-up (see "Per-session refresh" above).

**The hook is best-effort, so the lockstep has a second owner.** A hook only runs where the harness registers it, and that turns on the session's project root rather than on anything in this repo: where the root sits above the repo, `.claude/settings.json` is never read and none of its hooks fire, silently (cause and tells: [docs/environment/extending.md](docs/environment/extending.md)). So `npm test` carries [`tools/test/artifacts-lockstep.test.mjs`](tools/test/artifacts-lockstep.test.mjs), which re-runs the two deterministic generators in `--check` mode and fails if a tracked artifact is behind its source. When it fails, run the command it names and commit the result. Regenerating by hand after touching `lib/` or `pages/` is still the fast path; the test is what makes forgetting loud instead of silent.

**And a third owner, which does not depend on anyone remembering.** The test only speaks when the suite is run, so [`.github/workflows/test.yml`](.github/workflows/test.yml) runs `npm test` on every pull request and reports it as a check on the PR. That is the whole reason it exists: a hook that may not fire, guarded by a test that may not be run, was a chain with no link the platform enforced. It is the repo's only workflow triggered by a commit under review, so it is the only one whose result appears as a check rather than only in the Actions tab; `wsl-fetch.yml` is an errand on a cron. The suite is browser-free by construction (`node --test` globs `tools/test/**/*.test.mjs`, and every Playwright-driven check is named without `.test.`), so keep it that way or the runner grows a browser install. One caveat worth knowing: `package-lock.json` is gitignored, so CI resolves dependency ranges fresh on each run and a green check is not a claim about a pinned tree.

## Project tracker

Root-level `tracker/` scoped to repo-wide work (conventions, build tooling, docs, environment). Follows [`docs/TRACKER.md`](docs/TRACKER.md).

- **Placement:** `tracker/` (single tracker, no registry).
- **Board generator:** `npm run tracker-board` (wired into the commit hook above).

## Snags

[`docs/SNAGS.md`](docs/SNAGS.md) is this repo's friction log, the store behind the conventions' "where a friction observation goes instead." Append when a session trips over something whose real fix belongs in a durable doc: one line, symptom then corrected move, with a `→` to that doc. The entry is the index and the doc is the fix, so the two cannot drift. Still provisional and hand-appended; the intake shape, the recurrence mechanism, and the projector are open in [the snags spike](tracker/tasks/spike-snags-log-gobdyq.md).

## Environment & testing

For visual changes, `npm run shot -- <page>` (`--ref` for `?use=`, `--script` for interactions) renders branch pixels headless; send the PNG into chat (conventions: "Show pixels").

[`docs/environment/`](docs/environment/) is a living, dated record of the Claude Code web environment, split by concern: [capabilities](docs/environment/capabilities.md) (network allowlist, headless browser, toolchain), [container](docs/environment/container.md) (what persists across sessions), [testing](docs/environment/testing.md) (the jsdom+Alpine recipe and page-preview constraints), and [extending](docs/environment/extending.md) (the Claude Code component model and the hooks this repo runs). Read it when a task involves testing, verifying, or reaching the network; extend it (edit in place, re-date) when you learn something new. Referenced by plain path, not `@`-imported, so it stays out of context until needed.
