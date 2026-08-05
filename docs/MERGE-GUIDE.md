# Merge guide

> [!WARNING]
> **Stale 2026-08-05 (coverage stops at PR #210):**
> the newest entry below is PR #210, merged 2026-07-12. Everything merged since
> is absent, and the count is in the hundreds rather than the dozens. Read this
> file as a log of the first 210 PRs, not as the delivery record. Absence here
> was never proof of non-merge (see below), and right now it is not even weak
> evidence. This projection is being replaced by an index on
> `claude/merge-guide-web-tools-gjhw8l`, so the banner is transitional.

Newest-on-top log of what each session shipped, generated from merged PR
bodies by `scripts/build-merge-guide.py`. A PR body's guide region is the
editable source; do not hand-edit entries below. Regenerate:

    python3 scripts/build-merge-guide.py mehrlander/web-tools --out docs/MERGE-GUIDE.md

Entries predating the generator were hand-authored and are preserved until
backfilled (tracker task 0009).

**The links below are historical addresses, and some of them are dead.** An
entry records what a PR shipped, with each file addressed at `main` as it stood
that day. Later renames and deletions leave those addresses pointing at nothing:
a `[main (was SCAFFOLDING.md)]` link was dead the moment it was written, since
naming the former path is the point. This is a property of a record that links
to a moving target, not rot to repair, and `scripts/link-survey.py` reports the
whole file for that reason. Do not repoint them; a `--refresh` would overwrite
the edit anyway. The current count is 15, all in this file.

---

## 2026-07-12 The portable set becomes a plugin marketplace (PR #210)

The repo now publishes its portable set as a Claude Code plugin marketplace: a `.claude-plugin/marketplace.json` catalog with two plugins, `portable` (caption, load-skill, web-tools-conventions) and `daisy-alpine` (the ambient reference), installable via `/plugin marketplace add mehrlander/web-tools`. The catalog arrived as a coordinated patch from the home repository, applied verbatim; a follow-up commit narrowed the portable plugin's source from `./.claude` to `./.claude/skills` so consumer caches receive exactly the three declared skills and none of the repo's own hooks or settings.

⭐ **Result:** [docs/MARKETPLACE.md](https://github.com/mehrlander/web-tools/blob/main/docs/MARKETPLACE.md)

**Changed:**
- .claude-plugin/marketplace.json ([new](https://github.com/mehrlander/web-tools/blob/main/.claude-plugin/marketplace.json)): the catalog; two plugins, versionless (every main commit ships), strict:false (no file moves)
- docs/MARKETPLACE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/MARKETPLACE.md)): what the catalog publishes, subscription forms, publisher conventions, including the general scoping rule (the source boundary is the sharing boundary, drawn along directory lines)
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)): points at MARKETPLACE.md as the second transport; raw-fetch recipes remain the no-install path

**Notes:** Verified twice in the session environment: `claude plugin validate .` passes, both plugins install from the local path, and after the scoping fix the portable cache holds only the three skill directories. Skills are namespaced (`/portable:caption`), so hand-installed copies coexist. Nothing ships without a catalog entry; the other 35 skills, lib, and pages stay unpublished until someone lists them.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/home-repo-patch-review-yznelr)

## 2026-07-11 📦 artifacts join the surfacing conventions (PR #209)

Claude Code artifacts become the third live-view channel beside ⭐ and 🥏, marked 📦: a baked, self-contained page published to a stable private claude.ai URL, which renders where a 🥏 `#gh=` toss cannot (the Claude app, whose in-app browser holds no token). The caption skill also gains a purpose statement, topical captions (caption-formatted links on a named subject, independent of change state), and a strict-YAML fix to two skill frontmatters.

⭐ **Result:** [docs/artifacts.md](https://github.com/mehrlander/web-tools/blob/main/docs/artifacts.md)

📦 [docs/examples/which-link.html](https://claude.ai/code/artifact/f5ee6c4f-5474-4a77-9c3b-8a61b8d87e7c): the link-choice matrix as an interactive page, itself the pipeline's proof (baked 83 KB, zero external requests, verified on iPhone)

**Changed:**
- docs/artifacts.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/artifacts.md)): constraints, bake-and-publish pipeline, link-choice matrix, stale-session failure mode
- docs/examples/which-link.html ([new](https://github.com/mehrlander/web-tools/blob/main/docs/examples/which-link.html)): CDN-form source of the artifact
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md)): the 📦 primitive; viewer-context caveat on `#gh=`
- .claude/skills/caption/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/caption/SKILL.md)): purpose statement, topical captions, 📦 render line, YAML fix
- .claude/skills/web-tools-conventions/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/web-tools-conventions/SKILL.md)): YAML fix
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)): artifacts.md row
- CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/CLAUDE.md)): 📦 pointer in the preview-mechanism section

**Notes:** The bake pipeline needs one extra step for artifacts: strip the document scaffolding and carry body classes onto a wrapper div, since the Artifact tool wraps content in its own skeleton. Compiled daisyUI responds natively to the viewer's theme toggle (both stamp data-theme). Follow-up open: whether which-link.html graduates to pages/ for a canonical ⭐ URL.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/task-tracker-orientation-2mf290)

## 2026-07-11 show-repo mobile header: brand icon toggles the drawer (PR #208)

On the show-repo page's mobile header, the web-tools brand icon now doubles as the drawer toggle, replacing the separate hamburger button; on desktop, where the sidebar is pinned, the icon still goes home. The header auth shield is removed. Auth state is retained (it still dims unauthenticated pinned private repos and prompts on demand), so only the manual token-entry icon is gone.

⭐ **Result:** [pages/show-repo/show-repo.html](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html)

**Changed:**
- pages/show-repo/show-repo.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/show-repo/show-repo.html), [diff](https://github.com/mehrlander/web-tools/commit/94c6848db1e6a82e990aa1135669962f18e9e713)): brand `brandClick()` opens the drawer below `lg` and goes home at/above it; hamburger and auth-shield buttons dropped
- pages/thumbs/show-repo/show-repo.png: regenerated for the header change

**Notes:** Header-shell change only; the repo picker, file tree, and gallery wiring are untouched. Removing the shield leaves no in-header token-entry point, but on-demand auth still fires when a private repo is opened.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/mobile-show-repo-nav-mm9470)

## 2026-07-11 Compression helper: mobile layout and toolbar (PR #207)

On mobile (below 640px) the compression helper foregoes its drag-resize slider and tightens its toolbar. The output panel takes a fixed 40dvh with the input filling the rest, so no thin divider fights the host sheet's dismiss gesture, and the daisyUI xs fields, which had inherited the body's text-sm and rendered ~40px tall, shrink to 26px to match the Copy button. Desktop keeps the draggable divider and daisyUI's defaults.

⭐ **Result:** [Compression Helper](https://mehrlander.github.io/web-tools/pages/compression-helper.html)

**Changed:**
- pages/compression-helper.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/compression-helper.html)): mobile layout split (an `isDesktop` gate, 40dvh output, divider `hidden sm:block`) and a page-scoped `@media (max-width:639px)` block sizing the `.compress-panel` controls to 26px/11px

**Notes:** Both changes are mobile-only, gated below 640px (the repo's sheet-modal breakpoint). Desktop drag verified headless (150 to 270px). The host-sheet gesture conflict and the cm6/CodeMirror input are not reproducible in the sandbox (no native sheet; esm.sh off the allowlist), so the on-device feel is unverified.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/compression-helped-page-render-oadoxe)

## 2026-07-10 Skills library and load-skill mechanism (PR #206)

Publishes Marcus's personal skill library at `skills/` (34 skills, manifest.json, README) as a static resource, deliberately outside `.claude/skills/` so nothing auto-fires, and adds the `load-skill` registered skill: given an explicit "load skill X," it fetches `<source>/<name>/SKILL.md` (default source this library, discovery via `skills/manifest.json`) and applies it in the current session. This gives the account-level chat skills a public, fetchable home and a third transport alongside account provisioning (chat, automatic) and the sync-hook pull (conventions, always-on): deliberate load-by-name. The follow-on commit wires load-skill into the portable process (PORTABLE.md hook recipe, gitignore block, catalog) and notes that home's `me/claude-skills/` snapshot is retired in favor of this library.

⭐ **Result:** [skills/README.md](https://github.com/mehrlander/web-tools/blob/main/skills/README.md)

**Changed:**
- .claude/skills/load-skill/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/load-skill/SKILL.md)): the deliberate loader; explicit signal only, never opportunistic
- skills/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/skills/README.md)): the registered-vs-library split, editing and lineage notes
- skills/manifest.json ([new](https://github.com/mehrlander/web-tools/blob/main/skills/manifest.json)): the discovery catalog
- skills/* (34 skill folders, ~250 files): the library content, mirrored from the account-level set
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)): load-skill fetch line, gitignore path, catalog rows for the loader and the library

**Notes:** The branch was pushed 2026-07-10 but its PR form was never submitted; the draft PR was recovered and merged the same day from the home session that reconciled the skill estate. Library content is public from this commit onward.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/skills-library-and-load-skill-2026-07-10)

## 2026-07-10 The PR becomes the branch guide (PR #205)

Retires the per-branch `BRANCH-GUIDE.md`: a branch's draft PR, opened at first push, now carries the branch guide in its body (synced per push inside a `<!-- guide -->` managed region, narrative in PR comments), collapsing the surfacing course's three sequential drafts to two and mooting the fold-and-delete step and the leak-to-main problem. Adds the `/caption` and `/reorient` skills and the 🧭 guide pointer, and records the added-repo session mechanics in the environment docs.

⭐ **Result:** [docs/CONVENTIONS.md](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md)

**Changed:**
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md)): guide-PR section replaces branch guide + PR body; wrap-up ends in "mark ready"; 🧭 pointer and caption sizes added to the primitives
- CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/CLAUDE.md)): guide-PR support extension point (platform auto-create on, 2026-07-10)
- .claude/skills/caption/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/caption/SKILL.md)): the caption emitter and guide-PR body-sync engine
- .claude/skills/reorient/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/reorient/SKILL.md)): fixed-form session recap
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)): catalog rows and sync-hook fetch lines for the two skills
- docs/environment/container.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/environment/container.md)): added-repos section (session metadata, compare-link bridge)
- BRANCH-GUIDE.md: deleted; also clears the stray guide PR #204 left on main

**Notes:** Draft creation is platform-owned where the auto-create setting is on; it was probed not to fire retroactively into a session started before enabling, so such sessions (and added repos) open the draft via the API. Marking ready stays the user's tap. PR #205 is itself the first guide PR.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/repo-structure-branch-guide-m0v7ib)

## 2026-07-08 Show-repo: per-repo landing page with pinned sidebar (PR #199)

Rebuilds `pages/show-repo/show-repo.html` around a per-repo landing page with a pinned sidebar. The sidebar lists the repo's views (landing, atlas, files) so there is no separate toggle; the repo picker and auth live in the header. Every repo gets a landing: web-tools' is its pages gallery, others get a synthesized overview. The atlas is light-themed. The repo component gains an `inline` mode for compact header embedding, with a redesigned dropdown showing language, stars, and recency per repo.

⭐ **Result:** [pages/show-repo/show-repo.html](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html)

**Changed:**
- pages/show-repo/show-repo.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/show-repo/show-repo.html))
  renders on: [pages/index.html](https://mehrlander.github.io/web-tools/pages/index.html)
- pages/repo-atlas.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/repo-atlas.html))
- lib/alpineComponents/repo.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/alpineComponents/repo.js))
- tools/build/pages-index.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/pages-index.mjs))
- pages/pages.json (generated gallery catalog, fetched at runtime)
- CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/CLAUDE.md))

**Notes:** Landing mechanism is stubbed at one decision point (`app.landingKind`); only web-tools resolves ('gallery'). Per-repo `pages/landing.html`, default overview, and the task-0002 home-registry federation are future work. State rides the URL (`?repo&ref&file&view`); no remote persistence. Singleton fab integration with toss-render is tracked as task 0003.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/show-repo-pages-integration-uzn9gw)

## 2026-07-08 Two-layer tracker task schema and comments model (PR #198)

The tracker task-file schema was implicit about which frontmatter keys the generator acts on versus which it merely tolerates. Rewrote the schema section as two layers: a small closed set of recognized keys (required `id`/`title`/`status`, optional `project`/`track`/`opened`/`closed`/`session`) drives the board, and an open set of arbitrary scalar tags rides along, preserved and human-readable, ignored until promoted. Added the parser contract (flat `key: value`, split on first colon, no YAML library, unknown keys preserved), the graduation rule, and a Comments subsection stating the append-vs-overwrite model.

⭐ **Result:** [docs/TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md)

**Changed:**
- docs/TRACKER.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), [diff](https://github.com/mehrlander/web-tools/commit/b269acf))

**Notes:** No generator change; the reference board generator already keeps every colon-split key and buckets only on `status`, so the open-world contract documents existing behavior. `next` was demoted from a featured field to a tolerated open tag, with light consistency edits in the claiming and board-format sections. PORTABLE.md and the CONVENTIONS.md cross-references were left untouched.

## 2026-07-08 Enlarge hex-nut favicon to fill the tab slot (PR #TBD)

The tab favicon rendered small because the hexagon path occupied only ~69% of the 32x32 canvas width and ~60% of its height, so the browser scaled a mostly-empty canvas into the ~16px tab slot. Tightening the SVG `viewBox` to `4.5 4.5 23 23` frames the artwork, so the mark now fills the slot like other tab icons.

⭐ **Result:** [pages/index.html](https://mehrlander.github.io/web-tools/pages/index.html)

**Changed:**
- lib/favicon.svg ([new](https://github.com/mehrlander/web-tools/blob/main/lib/favicon.svg), [diff](https://github.com/mehrlander/web-tools/commit/d6b6a38))
- lib/gh-boot.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/gh-boot.js), [diff](https://github.com/mehrlander/web-tools/commit/d6b6a38))
- dist/web-tools.js ([new](https://github.com/mehrlander/web-tools/blob/main/dist/web-tools.js))   (generated by the commit hook)

**Notes:** viewBox-only change; path and mask coordinates are untouched, and the mask rects use `userSpaceOnUse` so they stay aligned. `lib/favicon.svg` and the inlined data URI in `lib/gh-boot.js` are hand-synced twins, both edited. `gh-boot.js` is not `gh-api.js`, so no jsDelivr purge is required.

## 2026-07-08 Rewrite tracker spec and implement root-level tracker (PR #TBD)

Rewrote `docs/TRACKER.md` for clarity (dropped jargon, stated the model in concrete terms) and stood up the first live tracker at `tracker/`.

**Changed:**
- docs/TRACKER.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), [diff](https://github.com/mehrlander/web-tools/compare/291e7c0...claude/tracker-concept-assessment-yto1m1))
- tracker/tasks/0001.md ([new](https://github.com/mehrlander/web-tools/blob/main/tracker/tasks/0001.md))
- tracker/board.md ([new](https://github.com/mehrlander/web-tools/blob/main/tracker/board.md))
- tools/build/tracker-board.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/tracker-board.mjs))
- .claude/hooks/build-on-commit.sh ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/hooks/build-on-commit.sh), [diff](https://github.com/mehrlander/web-tools/compare/291e7c0...claude/tracker-concept-assessment-yto1m1))
- CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/CLAUDE.md), [diff](https://github.com/mehrlander/web-tools/compare/291e7c0...claude/tracker-concept-assessment-yto1m1))
- package.json ([new](https://github.com/mehrlander/web-tools/blob/main/package.json), [diff](https://github.com/mehrlander/web-tools/compare/291e7c0...claude/tracker-concept-assessment-yto1m1))

**Notes:** The spec rewrite drops "durable shared surface," "status-claim channel," and "out of band" in favor of plain language: tracker state lives on main, task files are committed directly to main. Scoping language softened to permit nested and repo-wide trackers. Implementation follows the existing commit-hook pattern (leg 4). The seed task (0001) is a bootstrap: it rides this branch because the tracker does not exist on main yet.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/tracker-concept-assessment-yto1m1)

---

## 2026-07-07 Hex-nut index favicon + archive, the surfacing caption, and the project-tracker convention (PR #195)

The pages index adopts the canonical hex-nut mark (retiring its four-quadrant grid) with a new `docs/favicons/` archive; the per-file caption primitive is rewritten as the **surfacing caption** (uniform list plus a trailing 🥏 render line); and the opt-in **project-tracker** convention is published.

⭐ **Result:** [pages index](https://mehrlander.github.io/web-tools/pages/) — the hex-nut mark now in the header.

**Changed:**
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md), [diff](https://github.com/mehrlander/web-tools/commit/714cbf4)) — "Surfacing caption" primitive (uniform list + trailing 🥏 render line) plus tracker/merge-guide and post-merge-HP cross-refs
- docs/TRACKER.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), [diff](https://github.com/mehrlander/web-tools/commit/5820597)) — opt-in project tracker: one file per task under `tasks/` plus a generated `board.md`, a durable-status-claim rule, a python3 reference generator
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md), [diff](https://github.com/mehrlander/web-tools/commit/5820597)) — manifest row for TRACKER.md
- pages/index.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/index.html)) — favicon link and header logo point at `../lib/favicon.svg` (the hex nut)
- tools/build/pages-index.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/pages-index.mjs), [diff](https://github.com/mehrlander/web-tools/commit/2982903)) — both favicon refs now point at `../lib/favicon.svg`
- docs/favicons/grid.svg + docs/favicons/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/favicons/README.md), [diff](https://github.com/mehrlander/web-tools/commit/2982903)) — the retired grid, moved to a new favicon archive with a gallery README

**Notes:** Docs-heavy, low-risk. The favicon change is page HTML, live on the canonical index at merge. The tracker is publish-only: no live tracker is wired into web-tools itself. Folded from `BRANCH-GUIDE.md` at wrap-up; merged PR #193/#194 in first and regenerated the catalogs (favicon ref verified, reference board generator run).

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/pages-index-link-99qruu)

## 2026-07-07 mark simplified to color-or-CSS; the playground becomes a tabbed help() guide (PR #193)

`mark` drops its bespoke shorthand for a two-mode API (a bare color recolors its layout-safe outline; a `:`-bearing string is raw CSS you own), and the console-playground page turns into an infographic, tabbed guide that a new global `help()` opens.

⭐ **Result:** [Console suite guide](https://mehrlander.github.io/web-tools/pages/console-playground.html) — Playground fixtures + five reference tabs; `help()` reopens it from any page the suite is pasted into.

**Changed:**
- console/base.js ([new](https://github.com/mehrlander/web-tools/blob/main/console/base.js), [main](https://github.com/mehrlander/web-tools/blob/df8b498/console/base.js), [diff](https://github.com/mehrlander/web-tools/commit/8eea9f3)) — `mark`: bare color → `outline` (was a border), a `:`-bearing string passes through as raw CSS, `bg-`/`outline-` prefix branches and the border fallback removed; hover grows the outline only (dropping the `border-width` bump that reflowed already-bordered elements like table cells); new global `help()` opens the guide, `help(obj)` still inspects
- pages/console-playground.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/console-playground.html), [main](https://github.com/mehrlander/web-tools/blob/df8b498/pages/console-playground.html)) — tabbed guide (Playground + five reference tabs); infographic cards (icon, tagline, input→output pills, terse beats, color-coded per area) + a landing loop diagram; docs injected lazily on tab open so the headless pass still sees only fixtures
- console/mods/census.js, console/mods/templates.js ([diff](https://github.com/mehrlander/web-tools/commit/8eea9f3)) — pass a bare hue to `mark` instead of the retired `outline-<hue>-2` form
- console/suite.js ([new](https://github.com/mehrlander/web-tools/blob/main/console/suite.js)) — regenerated by the build-on-commit hook

**Notes:** The rich prefix shorthand (`bg-`, `p-`, digits→size) now lives only in the console-text formatter `f()`, so the two grammars can't drift into looking alike but differing. Verified green: `npm test` 144/144 (pins suite.js) + `playground-pass.mjs` 10/10 real-Chromium. Landed over three commits (8eea9f3 mark + guide, 38cd225 infographic pass, 52619c2 light code blocks). Merged fast via the UI before a wrap-up ran, so this merge-guide entry and the deletion of the leaked `BRANCH-GUIDE.md` are a follow-up (PR #193 → this cleanup PR). Latent and untouched: `f()` inline `border:` tokens at base.js:371/:376 render nothing (mangled to `color:border:…`); the supported path is f()'s 3rd argument.

[Session diff](https://github.com/mehrlander/web-tools/compare/df8b498...52619c2)

## 2026-07-07 The console suite: 19 mods, one paste, a playground, a real-browser pass (PR #192)

`console/base.js` grew a modular ecosystem: nineteen mods under `console/mods/` assembled into a one-paste `console/suite.js` covering the find → dance → grab loop end to end, with base itself untouched beyond a one-line `_f` fix (digit-only strings now text-match instead of slicing).

⭐ **Result:** [pages/console-playground.html](https://mehrlander.github.io/web-tools/pages/console-playground.html) — the suite pre-loaded over live fixtures; docs in [console/README.md](https://github.com/mehrlander/web-tools/blob/main/console/README.md)

**Changed:**
- console/mods/ ([new](https://github.com/mehrlander/web-tools/tree/main/console/mods)) — core (shared kernels + the `glom.onSet` bus), verbs (lockstep up/down/over), query (`q()`, a browser-native Playwright-style chain grammar with dance stages), grow (by-example expansion, class-intersection or computed-style fingerprints), pick (click-to-collect), infer (selector synthesis with an honest extra/missing report), watch (self-healing set via MutationObserver + infer), tap (fetch/XHR capture; `replay`/`walk` paginate an API from one captured request), veins (join API payload fields to the elements they feed), columns (repeating set → table, feeds `packTable`), harvest (sweep virtualized lists), lasso (drag-rectangle select), census (rank repeating structures by count × geoReg), templates (Wring's bookend-merge engine vendored behind path-qualified signatures: hashy classes become `${0}` slots), sets (named working sets), join (relational joins: structural + geometric), semantics (JSON-LD/microdata/og), deck (live side-window), recipe (session journal → replayable script)
- console/suite.js ([new](https://github.com/mehrlander/web-tools/blob/main/console/suite.js)) — generated by tools/build/console-suite.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/console-suite.mjs)); the build-on-commit hook gained a console leg
- console/base.js ([new](https://github.com/mehrlander/web-tools/blob/main/console/base.js), [main](https://github.com/mehrlander/web-tools/blob/2c7837a/console/base.js)) — the `_f` digit-string fix only
- pages/console-playground.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/console-playground.html)) — dependency-free fixtures for every mod
- tools/test/console-suite.test.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/test/console-suite.test.mjs)) — 42 jsdom tests incl. a suite.js freshness pin; tools/test/playground-pass.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/test/playground-pass.mjs)) — 10 real-Chromium checks for what jsdom can't see (visible, geoReg, style-grow, virtualized harvest, geometric join, synthetic-pointer lasso)

**Notes:** No lib/ dependency by design — templates vendors Wring's Stage-3 engine (trimmed) rather than loading the kit; the path-qualified segmenter is worth porting upstream to mehrlander/wring. Chromium surfaced two real findings: a top-level `const top` collides with `window.top`, and scroll anchoring fights windowed rendering (the feed fixture sets `overflow-anchor: none`, as production virtual scrollers do). Cross-realm duck-typing (regexes via `typeof v.test`) bit four times under jsdom testing; single-realm browser use is unaffected. Also this session: stale issues #133/#137/#138/#139 closed (all previously fixed on main); no in-repo task tracker exists yet if one is wanted.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/review-main-commit-oya9hs)

## 2026-07-07 Wrap-up gains a conflict-detection preflight (PR #191)

The wrap-up sequence now opens with a preflight that test-merges the branch against fresh main, so a session catches a branch main has diverged out from under before it opens a PR GitHub flags as unmergeable.

⭐ **Result:** [docs/CONVENTIONS.md — Wrap-up & PR creation](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md#wrap-up--pr-creation)

**Changed:**
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md#wrap-up--pr-creation), [diff](https://github.com/mehrlander/web-tools/commit/6c4a552)): new step 1 "Preflight: confirm the branch still merges cleanly" (`git fetch origin main && git merge-tree --write-tree origin/main HEAD`), sequence renumbered 1→4, UI-trigger note extended to surface a preflight conflict.

**Notes:** Portable, so it applies to any repo adopting the surfacing course, not just web-tools. Names committed generated artifacts (bundles, lockfiles, indexes) as the usual conflict culprit; that general claim passes the applies-in-any-repo test and stays in the portable doc, while the web-tools-specific filenames would be a CLAUDE.md instantiation (not yet added). Landed over three commits: introduced (6c4a552), made portable (2115fb6), then tightened to the doc's one-line-step voice with the older-git fallback dropped (228cfd8). Dogfooded its own step 1 at this wrap-up: `merge-tree` returned clean against origin/main.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/wrap-up-conflict-detection-m3e6x4)

## 2026-07-06 Docs catch up with the code: index pointer, gh-boot chain, four kits (PR #190)

Three docs rewritten offline landed as full replacements: the README stops hand-curating a drifted pages table and points at the generated index, the loader contract now describes the real gh-boot.js chain (with a new "ambient surface" table of window globals by installer), and the kits census documents build.js, export.js, wsl-core.js, and wsl.js.

⭐ **Result:** [README.md](https://github.com/mehrlander/web-tools/blob/main/README.md)

**Changed:**
- README.md ([new](https://github.com/mehrlander/web-tools/blob/main/README.md), [diff](https://github.com/mehrlander/web-tools/commit/722933b)): pages table replaced by an index pointer plus a short prose list of durable entries; bootstrap description corrected (gh-api.js chains gh-boot.js, which auto-loads gh-auth.js, gh-fetch.js, kits/console.js, vanilla-bundle.js); inline kit censuses now point at lib/kits/README.md; broken kits/README.md relative link fixed
- docs/loader.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/loader.md), [diff](https://github.com/mehrlander/web-tools/commit/722933b)): canonical head block corrected for the boot chain (pages no longer told to load gh-fetch.js themselves); new gh-boot.js and vanilla-bundle.js entries; new "The ambient surface" table of window globals by installer, with the rule that a new global without a row is a doc bug; timing invariant 1 adjusted
- lib/kits/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/lib/kits/README.md), [diff](https://github.com/mehrlander/web-tools/commit/722933b)): gh-boot.js added to the scaffolding census; build.js, export.js, wsl-core.js, wsl.js documented with their window surfaces; salvage table extended with four rows; two `../docs/loader.md` links fixed to `../../` ([diff](https://github.com/mehrlander/web-tools/commit/eb4d915), one of them a pre-existing break on main)

**Notes:** Drafted offline against main at 9c521a1; main had not moved on these paths, so the replacements landed verbatim after a hunk-by-hunk review against the intended change list. Every documented global (the gh-boot chain, `__loadedScripts`, `__reads`, `buildKit`, `exporter`, `wslCore`, `wsl`, the vanilla-bundle helpers, `consoleKit`) was spot-checked against lib/ source. New prose carries no em dashes except the established `` - `file.js` — `` list-lead form, deliberately unnormalized.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/docs-file-replacements-j32sut)

## 2026-07-06 toss-render: pill → FAB; document the 🥏 toss primitive (PR #189)

Drops the floating "Copy toss link" pill that sat over rendered content on toss-render (its adjacent reset reloaded the page on tap), surfacing those actions through the FAB via a generic `actions` contract; and documents the 🥏 toss as a portable surfacing primitive so any repo wired to the web-tools portable can render a page (including from a private repo or a branch) without a hosted URL.

⭐ **Result:** [toss-render.html](https://mehrlander.github.io/web-tools/pages/toss-render.html)

**Changed:**
- pages/toss-render.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/toss-render.html), [main](https://github.com/mehrlander/web-tools/blob/main/pages/toss-render.html), [diff](https://github.com/mehrlander/web-tools/commit/b62a78e)): pill removed; `tossRender` x-data exposes `description` + `actions` through the FAB, render path stays vanilla; carries address-mode relative-dep inlining (`inlineRelativeDeps`) + `fetchShim`.
- lib/alpineComponents/fab.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/alpineComponents/fab.js), [diff](https://github.com/mehrlander/web-tools/commit/b62a78e)): FAB reads an `actions` array off each `[x-data]` and renders it in the always-visible header; additive.
  renders on: [toss-render.html](https://mehrlander.github.io/web-tools/pages/toss-render.html)
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md), [diff](https://github.com/mehrlander/web-tools/commit/bc48f8f)): "Toss a live view" primitive (🥏 marker; `#gz=` portable snapshot + `#gh=owner/repo[@ref]:path` owner-only branch/private render); external-proxies ban now names the services and routes to the toss alternative.

**Notes:** Recovers four commits stranded on `claude/unmerged-branches-review-bkn37j` after PR #181 merged (post-merge work never got its own PR), brought over as one clean commit. The "DUMBO" nickname was already renamed out of the code; it survives only in one commit message. Portability: `#gz=` works for anyone; `#gh=` is owner-gated (`OWNERS`) and flagged not-portable, so the branch/private live render is an owner privilege, the snapshot is universal.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/frisbee-icon-render-page-rdc108)

## 2026-07-02 Repo Atlas: zoomable treemap map of any repo (PR #188)

Overnight creative build: an interactive treemap of a repo's git tree (files as cushion-shaded tiles sized by bytes or file count, colored by type), with animated zoom, search, type isolation, an insights sidebar, PNG export, and shareable URL state; it also maps dropped local folders and zips entirely in-tab.

⭐ **Result:** [repo-atlas.html](https://mehrlander.github.io/web-tools/pages/repo-atlas.html) (defaults to this repo; takes `?repo=owner/name` for any public repo, plus `ref`, `path`, `q`, `cat`, `area`)

**Changed:**
- pages/repo-atlas.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/repo-atlas.html), [diff](https://github.com/mehrlander/web-tools/commit/d3482ef))
- lib/kits/treemap.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/kits/treemap.js), [diff](https://github.com/mehrlander/web-tools/commit/ac6e0f8)): the pure kernels (taxonomy, tree build, squarified layout, fmtBytes)
  renders on: [repo-atlas.html](https://mehrlander.github.io/web-tools/pages/repo-atlas.html)
- tools/test/treemap.test.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/test/treemap.test.mjs), [diff](https://github.com/mehrlander/web-tools/commit/ac6e0f8)): tiling invariants; caught a real negative-extent bug
- tools/render/cdn.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/render/cdn.mjs), [diff](https://github.com/mehrlander/web-tools/commit/706ce8c)): impersonated git/trees carries real blob sizes (lstat-based, crash-safe, cached)
- tools/build/pages-index.mjs, lib/kits/README.md, docs/environment/testing.md, pages/thumbs/repo-atlas.png ([session diff](https://github.com/mehrlander/web-tools/compare/main...claude/creative-exploration-mqersv)): blurb, kit docs, harness fidelity notes, thumbnail

**Notes:** Tile colors are the dataviz reference palette's dark categorical slots, CVD-validated all-pairs; the floor-band pairs are covered by secondary encoding (gaps, direct labels, legend, tooltips, type table). An 8-angle self-review applied 10 findings, notably XSS-safe links (paths segment-encoded and attribute-escaped) and the symlink-safe harness walk. Parked follow-ups: per-directory lazy fetch for API-truncated trees, `io.jszip()` so the zip pin lives in one place, an IDB atlas as a second kit consumer. The branch name contains a slash, so `?use=` previews needed a commit SHA; not an issue once merged.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/creative-exploration-mqersv)

## 2026-06-26 Name the fetch≠invoke gap in the conventions sync (PR #187)

Close the trap that let a downstream adopter's conventions sync silently no-op: a `SessionStart` hook that *writes* the loader skill to disk makes it available, not *invoked*, so on its own it never loads `CONVENTIONS.md`. Make the fetch→invoke pairing explicit at the source.

⭐ **Result:** [docs/PORTABLE.md, "Staying current: refresh at session start"](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md#staying-current-refresh-at-session-start) — the `[!IMPORTANT]` fetch≠invoke callout pairing the hook with the always-on CLAUDE.md line, plus a stronger inject-via-`additionalContext` variant.

**Changed:**
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md#staying-current-refresh-at-session-start), [diff](https://github.com/mehrlander/web-tools/commit/2d75f69)) — rewrote the misleading "installing once is enough" line; `[!IMPORTANT]` fetch≠invoke callout; "Stronger variant: inject the conventions" subsection with a `[!WARNING]` that its missing-`jq`-and-`python3` case must fail loud if adopted as a guarantee ([commit](https://github.com/mehrlander/web-tools/commit/452a4bc))
- .claude/skills/web-tools-conventions/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/web-tools-conventions/SKILL.md), [diff](https://github.com/mehrlander/web-tools/commit/2d75f69)) — mirrored the caveat in the installer section; widened the `description` trigger vocabulary ("file card"/"file chip"/"send the file", show-pixels, hand-over)

**Notes:** Docs-only; nothing regenerates. `CONVENTIONS.md` left unchanged — its content was never the gap, only its delivery. Reviewed by a second pass: keep skill-fetch as the default and inject as the stronger variant (inject dumps the whole doc into every session, bypassing the two-severable-layers design, and drops the loader skill so `/web-tools-conventions` vanishes). Both `jq` (1.7) and `python3` (3.11) confirmed in the sandbox, so neither inject path is vapor. Follow-up to #185.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/web-tools-sync-fetch-invoke-wgoyjh)

## 2026-06-26 WSL Sync group-header redesign + primary/secondary nav (PR #186)

Restyle the Summary table's Tabulator group headers and the page chrome so the table reads as a structured, scannable product rather than a flat list.

⭐ **Result:** [wsl-sync.html](https://mehrlander.github.io/web-tools/pages/wsl-sync/wsl-sync.html?use=claude/legislation-tabulator-grouping-o7jj9z) — open the **Summary** tab for the group headers (branch preview until merged; the redesigned page header shows immediately).

**Changed:**
- pages/wsl-sync/wsl-sync.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/wsl-sync.html), [diff](https://github.com/mehrlander/web-tools/commit/32bb6b2))
- pages/wsl-sync/pension-dash.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/pension-dash.html), [diff](https://github.com/mehrlander/web-tools/commit/098d743)) — companion `HB` indicator moved to the date pill's top-right

**Notes:** Pure presentation, no data/logic change. Group header: bill numbers in a fixed 132px cell (centered, so single-chamber bills balance and two-chamber pairs clear the hairline pipe with symmetric gutters), category-tinted `numbers │ title │ description` rules, history-count badges elevated to each number's top-right corner. Page header splits Summary (primary view) from a labeled "SOURCES" segmented cluster; flag columns widened to 112px so headers stop clipping. The 132px cell is tuned to 4-digit/4-digit pairs (digits are tabular-nums); a rare 3-bill cluster would be wider and could crowd the pipe. Verified headless on both single- and two-bill group rows.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/legislation-tabulator-grouping-o7jj9z)

## 2026-06-26 Portable "stay current" pattern: a SessionStart hook that refreshes the loader skill (PR #185)

Document a fail-soft `SessionStart` hook a consuming repo can run to re-fetch the `web-tools-conventions` loader skill each session, so the skill file itself never goes stale (the conventions it loads were already fetched live, so only the loader could drift).

⭐ **Result:** [docs/PORTABLE.md, "Staying current: refresh at session start"](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md#staying-current-refresh-at-session-start) — the reusable recipe (committed hook + gitignored fresh skill + fail-soft fetch over the allowlisted raw host), framed as the companion to the one-time install above it.

**Changed:**
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md#staying-current-refresh-at-session-start), [diff](https://github.com/mehrlander/web-tools/commit/82c8167)) — new "Staying current" section after "How to adopt"
- .claude/skills/web-tools-conventions/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/web-tools-conventions/SKILL.md), [diff](https://github.com/mehrlander/web-tools/commit/dfccbcb)) — the "re-run the installer when the skill changes" note now points at the new section

**Notes:** Docs-only; no `lib/` or `pages/`, so nothing regenerates. The pattern is for *consuming* repos; web-tools is the source and never runs the hook on itself. Verified this session: the raw skill URL fetches `200` (4377 bytes), so the recipe's load-bearing GET works. Keep the hook **synchronous** so it finishes before skill discovery and the freshly-fetched skill is live the same session. `mehrlander/home` is the first repo running it.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/sessionstart-portable-docs-ec4f50)

## 2026-06-26 "Hand over the artifact": SendUserFile as a file-card default (PR #184)

Make handing the user a downloadable artifact a surfacing default: when producing an HTML page, zip, or audio file, send it via `SendUserFile` so they get a click-to-download file card, and pin the terms "file card" / "file chip" to the tool so they resolve.

⭐ **Result:** [docs/CONVENTIONS.md, "Hand over the artifact"](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md) — a new surfacing primitive beside "Show pixels": proactive by default, gated on whether the user would open / run / iterate on the file, and composing with the screenshot primitive (screenshot to show, card to hand over).

**Changed:**
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md), [diff](https://github.com/mehrlander/web-tools/commit/e351360)) — "Hand over the artifact" primitive; names file card / file chip / "send the file"
- docs/environment/capabilities.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/environment/capabilities.md), [diff](https://github.com/mehrlander/web-tools/commit/e351360)) — dated "Surfacing files to the user: the file card" note; type→rendering map (images inline; HTML / zip / mp3 → download chip), flagged user-observable-only

**Notes:** Docs-only; no `lib/` or `pages/`, so nothing regenerates. The convention reaches always-on context because `CONVENTIONS.md` is `@`-imported into `CLAUDE.md`, so the terms resolve in new sessions once merged, and propagate to other repos via the conventions skill. The capabilities note deliberately records what the agent can't self-verify (the rendered chip is visible only on the user's side), per the env-docs observed-and-dated discipline.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/gracious-bohr-8ti9l5)

## 2026-06-24 Project mark (hex-nut favicon) + pages landing-page polish (PR #182)

Gave web-tools a project mark and turned the pages index into a proper landing page: a slot-split hex nut (tools + the web's `<` `>` + hexagonal modularity) that loader pages adopt as their default favicon, a cleaner index header, and a "lead with the live view" convention so a README opens with its rendered artifact.

⭐ **Result:** [pages index](https://mehrlander.github.io/web-tools/pages/) — reached by a quick ⭐ link from the README; clearer header (`show-repo` label, a pre-rendered-screenshot caption that links the build script), grid logo. The [hex-nut mark](https://github.com/mehrlander/web-tools/blob/main/lib/favicon.svg) rides as the default favicon on loader pages that set none.

**Changed:**
- lib/favicon.svg ([new](https://github.com/mehrlander/web-tools/blob/main/lib/favicon.svg), [diff](https://github.com/mehrlander/web-tools/commit/24598f9)) — project mark, slot-split hex nut in blue-600
- lib/gh-boot.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/gh-boot.js), [diff](https://github.com/mehrlander/web-tools/commit/24598f9)) — favicon fallback injection; bespoke per-page favicons win
- tools/build/pages-index.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/pages-index.mjs), [diff](https://github.com/mehrlander/web-tools/commit/139735b)) — `show-repo` label, pre-rendered caption, grid favicon + inline logo, README lead link
- pages/favicon.svg ([new](https://github.com/mehrlander/web-tools/blob/main/pages/favicon.svg), [diff](https://github.com/mehrlander/web-tools/commit/139735b)) — grid mark, the pages-index identity
- README.md ([new](https://github.com/mehrlander/web-tools/blob/main/README.md), [diff](https://github.com/mehrlander/web-tools/commit/139735b)) — leads with the ⭐ live-index link
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md), [diff](https://github.com/mehrlander/web-tools/commit/139735b)) — "Lead with the live view" surfacing primitive

**Notes:** Favicon fallback is non-destructive (fills only pages with no icon) and verified headless both ways; standalone non-loader pages (e.g. diff-tool) don't get it. After merge, purge main's gh-boot.js from jsDelivr (~12h cache): https://purge.jsdelivr.net/gh/mehrlander/web-tools/lib/gh-boot.js . The grid stays on the pages index; a hex-nut mark in the README H1 was explored and deferred. pages/index.html + pages/README.md regenerate via the commit hook; dist/web-tools.js is the pre-build.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/dreamy-pascal-luo2b0)

## 2026-06-16 Portable conventions: à la carte adoption, terminology, concision (PR #179)

Make the portable docs set adoptable piece by piece (CONVENTIONS.md severable into universal surfacing primitives and an opt-in PR-workflow course), retire the overloaded "spine" term for a distributed vocabulary, and run a succinctness + layering pass on CONVENTIONS.md.

⭐ **Result:** [docs/CONVENTIONS.md](https://github.com/mehrlander/web-tools/blob/claude/stoic-clarke-c8jwcl/docs/CONVENTIONS.md) — two-layer adoption framing up top, the course consolidated into one section (three artifacts + comparison table), and course machinery (wrap-up, UI-trigger, next-PR) moved under the opt-in course instead of the universal primitives

**Changed:**
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/claude/stoic-clarke-c8jwcl/docs/CONVENTIONS.md), [main](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md), [diff](https://github.com/mehrlander/web-tools/commit/6a83400)) — à la carte intro and opt-in boundary in [b428527](https://github.com/mehrlander/web-tools/commit/b428527); "spine" → course/moments/shape in [2582de4](https://github.com/mehrlander/web-tools/commit/2582de4); terse rewrite + layering fix in [6a83400](https://github.com/mehrlander/web-tools/commit/6a83400)
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/claude/stoic-clarke-c8jwcl/docs/PORTABLE.md), [main](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md), [diff](https://github.com/mehrlander/web-tools/commit/b428527)) — CONVENTIONS row notes severability; MERGE-GUIDE line ties to the opt-in course
- .claude/skills/web-tools-conventions/SKILL.md ([new](https://github.com/mehrlander/web-tools/blob/claude/stoic-clarke-c8jwcl/.claude/skills/web-tools-conventions/SKILL.md), [main](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/web-tools-conventions/SKILL.md), [diff](https://github.com/mehrlander/web-tools/commit/2582de4)) — description + Apply reflect the severable/opt-in intent and new vocabulary

**Notes:** Rule content (link formats, artifact shapes, handoff) preserved; only adoption framing, terminology, and concision changed. The succinctness pass restored load-bearing lines a first draft had dropped (merge-guide "reading it for inclusion," the HP diagnostic-tests preliminary, "a stale guide is worse than none," the `[new]/[main]/[diff]` definitions). Artifact headings left un-numbered so the durable `#branch-guide` anchor (linked from the #171 entry below) keeps resolving. The two "spine" mentions in that #171 entry are historical and intentionally left as-is.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/stoic-clarke-c8jwcl)

## 2026-06-16 SHARE.md: paste-ready pointer to the portable set (PR #178)

A copy-paste message for sending another Claude Code session to web-tools' portable docs, closing the chicken-and-egg where a session doesn't know it can read another repo (it can't via git or MCP scope, but a raw HTTP GET of a public file works and is allowlisted). Follow-up to PR #177.

⭐ **Result:** [docs/SHARE.md](https://github.com/mehrlander/web-tools/blob/main/docs/SHARE.md) — the why (restricted cross-repo git/MCP; raw GET as the bypass) plus the fetch command itself, leading with `PORTABLE.md` and swappable to a single doc

**Changed:**
- docs/SHARE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/SHARE.md), [diff](https://github.com/mehrlander/web-tools/commit/d803a8f)) — the pointer; tightened in [f4a57f7](https://github.com/mehrlander/web-tools/commit/f4a57f7)
- docs/PORTABLE.md, docs/README.md ([diff](https://github.com/mehrlander/web-tools/commit/d803a8f)) — cross-link to it ("Pointing a session here" / index entry)

**Notes:** Access facts confirmed by probe this session: raw.githubusercontent of our files → 200; a blocked host → 403 `x-deny-reason`. SHARE.md is the pointer *to* the portable set, not a member of it (it names web-tools URLs); it links capabilities.md for the fuller "two gates" constraints.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/docs-share-pointer-k3n9w)

## 2026-06-16 Portable headless-vendoring recipe + the to-go-set manifest (PR #177)

A self-contained, repo-agnostic guide to building with Tailwind / daisyUI / Alpine / Phosphor and rendering them headless where a sandbox blocks their CDNs (vendor from npm, intercept the requests, serve from `node_modules`), plus a `PORTABLE.md` manifest cataloguing the docs meant to travel to other repos.

⭐ **Result:** [docs/headless-vendoring.md](https://github.com/mehrlander/web-tools/blob/main/docs/headless-vendoring.md) — the recipe, with a standalone Playwright interceptor and a verified daisyUI theme-explorer example; catalogued in [docs/PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)

**Changed:**
- docs/headless-vendoring.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/headless-vendoring.md), [diff](https://github.com/mehrlander/web-tools/commit/98ac4a6)) — vendor + intercept concept; `render.mjs` handles `/combine/` and is CDN-field-aware (unpkg vs jsdelivr defaults); framing, chat-image, and feedback-loop notes
- docs/PORTABLE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md), [diff](https://github.com/mehrlander/web-tools/commit/1d9f57d)) — the to-go-set manifest, bidirectional with the conventions skill
- docs/examples/theme-explorer.html ([new](https://github.com/mehrlander/web-tools/blob/main/docs/examples/theme-explorer.html), [diff](https://github.com/mehrlander/web-tools/commit/81d1276)) — daisyUI theme picker + paired-pill token matrix; the verified example
- .claude/skills/web-tools-conventions/SKILL.md, docs/README.md, CLAUDE.md ([diff](https://github.com/mehrlander/web-tools/commit/1d9f57d)) — point at / surface the manifest
- docs/environment/testing.md, docs/environment/capabilities.md, tools/render/cdn.mjs ([diff](https://github.com/mehrlander/web-tools/commit/1d9f57d)) — one-line pointers → headless-vendoring.md (one direction, to keep it portable)

**Notes:** Portable by design (no web-tools internals); examples verified by running the doc's `render.mjs` extracted verbatim (no MISS, no console errors). Convention settled this session: author pages with one tag per library, not jsDelivr `/combine/` (the interceptor still handles combine for pre-existing pages). The earlier landing-demo example was dropped; theme-explorer is the single canonical example.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/headless-tailwind-daisyui-alpine-ue50gn)

## 2026-06-13 RCW pension crosswalk page over the full corpus (PR #175)

A standalone, self-contained pension reference: wsl-core's PENSION_MAP layered over every RCW title, chapter, and section caption, searchable and filterable, usable saved as a single local file offline.

⭐ **Result:** [pension-map](https://mehrlander.github.io/web-tools/pages/wsl-sync/pension-map.html) — quick-find pills (trust-fund expenses 41.50.255 highlighted), cite-scoped search (`41.50 payment`), pension-only filter, per-chapter section detail, grouped tag view with `#tag` filtering, full-code browse tree

**Changed:**
- pages/wsl-sync/pension-map.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/pension-map.html), [diff](https://github.com/mehrlander/web-tools/commit/619907c)) — corpus embedded gzip+base64 (1.2 MB), inflated at boot via native DecompressionStream; refresh one-liner in the header comment
- pages/thumbs/wsl-sync/pension-map.png ([new](https://github.com/mehrlander/web-tools/blob/main/pages/thumbs/wsl-sync/pension-map.png), [diff](https://github.com/mehrlander/web-tools/commit/b962c36)); pages/README.md + pages/index.html hook-regenerated

**Notes:** Pension semantics mirrored by hand from `lib/kits/wsl-core.js` PENSION_MAP (drift risk noted in both files). Corpus is the 2025 RCW archive; 2026 session law (e.g. ch. 68, 2026 Laws amending 41.50.255, the trust-fund expenses section) not reflected until refreshed. PENSION_MAP cite 41.40.761 is absent from the corpus, likely repealed; tag omitted, may warrant a PENSION_MAP cleanup. Quick-find pills are a placeholder set of five; curate as needed.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/practical-noether-ks7579)

## 2026-06-12 nav-repo lens browser; identity-free boot; testing.md rewrite (PR #174)

New page nav-repo answers "what is show-repo for": a repo@ref header with Files / Pages as top-level lens tabs, shareable `?repo=&ref=&file=&tab=` URL state, and an identity-free boot, so public repos browse with no token; the headless harness now impersonates the GitHub API from the local checkout, so these pages screenshot for real.

⭐ **Result:** [pages/nav-repo.html](https://mehrlander.github.io/web-tools/pages/nav-repo.html?repo=mehrlander/web-tools&file=README.md)

**Changed:**
- pages/nav-repo.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/nav-repo.html)): the lens-tab page; show-repo left intact as-is
- lib/alpineComponents/repo.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/alpineComponents/repo.js)): `pickByName()` (boot without listing anyone's repos), `setup({quiet})`, auto-pick guard
  renders on: [nav-repo](https://mehrlander.github.io/web-tools/pages/nav-repo.html), [show-repo](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html)
- lib/gh-auth.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/gh-auth.js)) + lib/gh-fetch.js: per-request `quiet` flag keeps background 401/403s from taking over the page
- pages/show-repo/show-repo.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/show-repo/show-repo.html)): drop `x-init="init()"` (Alpine auto-calls `init()`; every boot API call ran twice); same fix in nav-repo
- tools/render/cdn.mjs + screenshot.mjs: own-data API shims (`/repos/<repo>` metadata, `git/trees` from the working tree) and a `--query` flag
- tools/build/pages-shots.mjs: honors `<meta name="shot-query">`, so auth-dependent pages declare a representative thumbnail state
- docs/environment/testing.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/environment/testing.md)): rewritten as a reference (tool-per-section, render-category table, gotchas; 64% of prior length)

**Notes:** Token-bearing browser path unverified in-session (headless covers the anonymous path; suite 93 passing). The Actions lens (token-holding executor for requests a session can't perform, e.g. delete a branch) is designed in concept but deferred to its own session.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/keen-carson-w36rui)

## 2026-06-12 Index ↔ show-repo convergence; toss-render address mode; ?use= announces itself (PR #173)

The repo's two navigation surfaces grew together: the pages index gained path-transparent chips, shareable filters, and the FAB; show-repo gained a pages view of the browsed repo; embed.html became toss-render.html with a token-safe address mode; and `?use=` pages now badge their ref and auto-mount the FAB.

⭐ **Result:** [pages/index.html](https://mehrlander.github.io/web-tools/pages/) — chips show full locations (`?filter=`/`?q=` deep-link), header links show-repo, FAB mounted

**Changed:**
- tools/build/pages-index.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/pages-index.mjs)): path chips with dimmed prefixes, URL state, show-repo link, gh-api boot + FAB on the generated index; `pages/show-repo/index.html` (stale hand-written list) deleted
- lib/alpineComponents/pages.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/alpineComponents/pages.js)): collapsible Pages section — scans the browsed repo/ref for .html files; thumbnail/live cards, rendered+source links, open-in-viewer
  renders on: [show-repo](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html)
- pages/toss-render.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/toss-render.html)), renamed from embed.html (no redirect): payload modes unchanged (opaque-origin sandbox); new `#gh=owner/repo[@ref]:path` address mode fetches with the stored token and renders same-origin with `<base>` + `?use=` shim, allowlisted to `mehrlander/*` so crafted links can't spend or read the token
- bookmarklets/toss-render.js ([new](https://github.com/mehrlander/web-tools/blob/main/bookmarklets/toss-render.js)), renamed from embed-page.js, retargeted; text also inlined in the page header comment — re-save the 🥏 bookmarklet
- lib/gh-boot.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/gh-boot.js)): `?use=` shows a corner badge naming the booted ref and auto-mounts the FAB (skipped when the page mounts its own; try/caught)
- lib/alpineComponents/fab.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/alpineComponents/fab.js)), viewer.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/alpineComponents/viewer.js)): "Open at ref in toss-render" / "Toss render" links into address mode
- docs/CONVENTIONS.md + CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md)): "Show pixels" — send rendered screenshots into chat; `npm run shot` wiring
- tools/test/pages.test.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/test/pages.test.mjs)): 7 jsdom tests for the pages view

**Notes:** toss-render address mode is the repo's first "open page X at ref Y" URL; the FAB Render overlay and show-repo's off-ref page cards route through it. Address mode was unverifiable in-session (API rate limit): first thing to try post-merge. Suite: 93 passing.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/modest-newton-cm6is8)

## 2026-06-11 Import Wring: template-induction kit, demo pages, repo snapshot (PR #172)

Wring (single-document template induction: one document with repeated structure in, recurring templates plus slot values out, losslessly) moves into web-tools as a kit, two demo pages, a test in the npm suite, and a full snapshot of the source repo.

⭐ **Result:** [pages/demos/wring-text.html](https://mehrlander.github.io/web-tools/pages/demos/wring-text.html) (logs/records to templates); the DOM twin is [wring-dom.html](https://mehrlander.github.io/web-tools/pages/demos/wring-dom.html)

**Changed:**
- lib/kits/wring.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/kits/wring.js), [diff](https://github.com/mehrlander/web-tools/commit/9cba52b)): the engine as a kit (`window.wring`); generated, regenerate via `archive/wring/export/build-kit.mjs`
  renders on: [wring-text](https://mehrlander.github.io/web-tools/pages/demos/wring-text.html), [wring-dom](https://mehrlander.github.io/web-tools/pages/demos/wring-dom.html)
- pages/demos/wring-text.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/demos/wring-text.html)), pages/demos/wring-dom.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/demos/wring-dom.html)): the demos, re-plumbed to `gh.load` the kit with `?use=`
- tools/test/wring.test.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/test/wring.test.mjs)): kit invariants on node:test; wring.js also joins kits-register.test.mjs
- archive/wring/ ([tree](https://github.com/mehrlander/web-tools/tree/main/archive/wring), [IMPORT.md](https://github.com/mehrlander/web-tools/blob/main/archive/wring/IMPORT.md)): byte-for-byte snapshot of `mehrlander/wring@23114dc` (source modules, six-harness suite, research record)
- lib/kits/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/lib/kits/README.md), [diff](https://github.com/mehrlander/web-tools/commit/9cba52b)): wring section + salvage-table row

**Notes:** Mid-branch, main's pages reorg and npm-test suite merged in; the wring artifacts were realigned to both (pages into `pages/demos/`, standalone test recast onto node:test). Follow-up outside this repo: tombstone README in `mehrlander/wring`, then archive it on GitHub.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/peaceful-carson-f7ymn5)

## 2026-06-11 Pages index: location-based filter chips + name search; kit demos surfaced (PR #170)

The visual index gained a filter bar (location-based chips plus a name/title search box), and the demo/story pages were reorganized into real folders (`pages/demos/`, `pages/stories/`) so the categories are locations, not name guesses. The kit demos under `lib/kits/demos/` are now pulled into the catalog too.

⭐ **Result:** [pages/index.html](https://mehrlander.github.io/web-tools/pages/): chips scope by location, the search box narrows within the selection (pick `All` for a repo-wide name search)

**Changed:**
- tools/build/pages-index.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/pages-index.mjs), [diff](https://github.com/mehrlander/web-tools/commit/f63eeae)): a second source root (`lib/kits/demos/`, the `kit-demos` group), location-based chips from each group's top segment, and the `q` search getter; regenerates `pages/index.html` + `pages/README.md`
- tools/build/pages-shots.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/build/pages-shots.mjs), [diff](https://github.com/mehrlander/web-tools/commit/f63eeae)): same two-source model so kit demos get thumbnails under `pages/thumbs/kit-demos/`
- pages/demos/, pages/stories/ ([tree](https://github.com/mehrlander/web-tools/tree/main/pages/demos)): six demo pages and the bookmarklets story relocated (files + thumbs); FAB `data-path` and inbound links in README/docs/kit-readmes updated to match
- docs/loader.md ([diff](https://github.com/mehrlander/web-tools/commit/f63eeae)): corrected a stale `pages/demos/{persistence,…}` path to the real `lib/kits/demos/`

**Notes:** `scratch/demo-spacex` and `show-repo/demo-viewer` deliberately left in their own folders (they belong to those projects), so they appear under those chips, not `demos`. Demo pages load deps via absolute jsDelivr URLs, so moving them deeper didn't affect loading. Built on PR #170 (the earlier chip-prototype commit is part of the same branch).

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/nice-hamilton-z1wj9e)

## 2026-06-11 Branch-guide convention: third spine artifact + prose-style rule (PR #171)

Working branches now carry a live `BRANCH-GUIDE.md` (pushed first thing, accurate per push, folded into this guide and deleted at wrap-up, never landing on main), and the portable conventions gain a no-em-dash prose rule plus a consolidated "Wrapping up & PR creation" section.

⭐ **Result:** [Branch guide section in docs/CONVENTIONS.md](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md#branch-guide)

**Changed:**
- docs/CONVENTIONS.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md), [main](https://github.com/mehrlander/web-tools/blob/c6cfa35/docs/CONVENTIONS.md), [diff](https://github.com/mehrlander/web-tools/commit/8775a57)): three-artifact surfacing spine, Branch guide section, branch-guide-enforcement extension point, wrap-up rewrite; prose-style rule and em-dash removal in [626bbb9](https://github.com/mehrlander/web-tools/commit/626bbb9)
- CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/CLAUDE.md), [main](https://github.com/mehrlander/web-tools/blob/c6cfa35/CLAUDE.md), [diff](https://github.com/mehrlander/web-tools/commit/8775a57)): answers the new extension point (enforcement: none yet)
- docs/MERGE-GUIDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/MERGE-GUIDE.md), [diff](https://github.com/mehrlander/web-tools/commit/8775a57)): header pointer fixed (convention lives in CONVENTIONS.md); this entry

**Notes:** The session dogfooded the convention; its own branch guide folded into this entry. Enforcement deferred until a guide actually leaks to main (then: hook nag or CI guard). Pre-existing em dashes in older merge-guide entries left as written.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/trusting-volta-wsl8nh)

## 2026-06-11 npm test: kit + Alpine-component suite; persistence deadlock fix (PR #169)

The repo's first automated test suite — 76 tests on Node's built-in runner, offline via npm-vendored libs — and its first run caught a real bug: `kits/persistence.js` could deadlock IndexedDB version upgrades.

⭐ **Result:** [tools/test/bootstrap.mjs](https://github.com/mehrlander/web-tools/blob/main/tools/test/bootstrap.mjs) — run it all with `npm test`

**Changed:**
- tools/test/ ([new](https://github.com/mehrlander/web-tools/tree/main/tools/test), [diff](https://github.com/mehrlander/web-tools/commit/d4b042da70c61d138bb7af83d3f743fdb69875e7)) — bootstrap.mjs (the jsdom+Alpine bootstrap testing.md had flagged "not yet built", plus `loadKit()` with CDN-import→npm rewrites) and 7 suites: compression, persistence, messaging, wsl-core, kit-registration smoke, counter, sheet-modal
- lib/kits/persistence.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/kits/persistence.js), [main](https://github.com/mehrlander/web-tools/blob/2731a43/lib/kits/persistence.js), [diff](https://github.com/mehrlander/web-tools/commit/d4b042da70c61d138bb7af83d3f743fdb69875e7)) — cached connections now yield to `versionchange`; previously a second store on the same db (or another tool's upgrade) blocked the version bump forever
  renders on: [data-shelf](https://mehrlander.github.io/web-tools/popups/data-shelf.html), [idb-nav](https://mehrlander.github.io/web-tools/popups/idb-nav.html), [persistence demo](https://mehrlander.github.io/web-tools/lib/kits/demos/persistence.html)
- docs/environment/testing.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/environment/testing.md), [diff](https://github.com/mehrlander/web-tools/commit/d4b042da70c61d138bb7af83d3f743fdb69875e7)) — follow-up note replaced with the built bootstrap + two new gotchas (Alpine ESM entry, global rAF)
- tools/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/tools/README.md), [diff](https://github.com/mehrlander/web-tools/commit/d4b042da70c61d138bb7af83d3f743fdb69875e7)), package.json ([diff](https://github.com/mehrlander/web-tools/commit/d4b042da70c61d138bb7af83d3f743fdb69875e7)) — `test/` documented; `test` script + brotli-wasm/acorn devDeps
- dist/web-tools.js — hook-regenerated (persistence fix rides into the pre-build)

**Notes:** Also audited the issue backlog: #133/#137/#138/#139 were all already fixed in main, just never closed.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/stoic-volta-xnpbvh)

## 2026-06-11 WSL closeout: docs synced to kits, monthly fetch cron (PR #166)

Closed out the WSL arc: the folder's docs now describe the kit/snapshot architecture #162 actually shipped, and the fetch Action gained its planned monthly cron.

⭐ **Result:** [pages/wsl-sync/README.md](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/README.md) — the rewritten front-door doc

**Changed:**
- pages/wsl-sync/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/README.md), [main](https://github.com/mehrlander/web-tools/blob/0379536/pages/wsl-sync/README.md), [diff](https://github.com/mehrlander/web-tools/commit/5235ceb)) — rewritten around the wsl-core/wsl kits and the committed snapshot as source of truth; obsolete IDB seed snippet dropped; fast-xml-parser 4.5.1 pin rationale recorded (audit advisory is XMLBuilder-only, unused here)
- .github/workflows/wsl-fetch.yml ([new](https://github.com/mehrlander/web-tools/blob/main/.github/workflows/wsl-fetch.yml), [main](https://github.com/mehrlander/web-tools/blob/0379536/.github/workflows/wsl-fetch.yml), [diff](https://github.com/mehrlander/web-tools/commit/8beb91e)) — monthly cron, `--full` on the open biennium; the meta.json-only guard keeps quiet months commit-free
- pages/wsl-sync/fetch-data.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/fetch-data.mjs), [diff](https://github.com/mehrlander/web-tools/commit/5235ceb)) — header comment now matches the `new Function` + `makeParsers` injection it actually does
- pages/wsl-sync/IMPORT.md, .gitignore ([diff](https://github.com/mehrlander/web-tools/commit/5235ceb)) — #162 restructure noted as provenance history; dead `.wsl-api.node.mjs` ignore dropped

**Notes:** Docs plus the cron; no page runtime touched. Also adds the retroactive #160/#161 entry below. Deferred deliberately: the wsl-sync real-browser thumbnail pass and the fast-xml-parser v5 bump (rationale now in the README).

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/festive-mendel-ojely2)

## 2026-06-11 embed payload moves to the URL fragment (PR #165)

Fixes the bookmarklet's "URL too long" failure on real-sized files: the payload now rides in the `#fragment`, which never reaches the server, so GitHub Pages' ~8KB edge cap (Fastly 414s longer query strings) no longer applies — the bound becomes the browser's own ~2MB. Follow-up to #164.

⭐ **Result:** [embed.html#gz=…](https://mehrlander.github.io/web-tools/pages/embed.html#gz=H4sIAAAAAAAAAyXHOw7DIAwA0Ku42aMkK6HMHdKlSg9AwcGW-ERgRaKn79C3PX3zxUk_EUhSNFpYIprwBY-p6Olf_Sm-Q5Me8T4cJct42MSxq1Ryaad1uHpuZ7Rdhcp-PaN1OLJgasphFqwrIQcStczzRYPRtJiduMFjf24g1V4Y0QPnxh5BCOH92uCoNiTMoidazA9QuvH2qQAAAA) — same demo, now fragment-borne

**Changed:**
- pages/embed.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/embed.html), [diff](https://github.com/mehrlander/web-tools/commit/9d2ede1)) — reads `#params` first with `?query` back-compat; reloads on `hashchange` (fragment-only navigation is same-document, so the boot script wouldn't otherwise re-run when following a second embed link).
- bookmarklets/embed-page.js ([new](https://github.com/mehrlander/web-tools/blob/main/bookmarklets/embed-page.js), [diff](https://github.com/mehrlander/web-tools/commit/9d2ede1)) — emits `#gz=`.
  renders on: [embed](https://mehrlander.github.io/web-tools/pages/embed.html)
- README.md ([new](https://github.com/mehrlander/web-tools/blob/main/README.md#bookmarklets), [diff](https://github.com/mehrlander/web-tools/commit/9d2ede1))

**Notes:** Verified headlessly up to 724KB of HTML (310KB fragment). Re-installing the bookmarklet is required — the old copy still emits `?gz=`.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/peaceful-lovelace-ga5wj4)

## 2026-06-10 embed-page bookmarklet + inline-HTML modes (PR #164)

From any github.com blob page, one bookmarklet click renders that file as live HTML: the file's content travels gzipped inside the URL to embed.html's new `?gz=` mode. Follow-up to #163.

⭐ **Result:** [embed.html?gz=…](https://mehrlander.github.io/web-tools/pages/embed.html?gz=H4sIAAAAAAAAAyXHOw6DMAwA0Ku47AhYQ5q5A10qeoA0MdhSfkospPT0Hfq2p28-O-kFgSQGo4UloDm_4DFmPf2rP9l3aNID3ocjJxkPGzl0FXPKrViHq-dWgu3qrOzXEqzDkQVjUw6TYF0J-SRRyzxfNBhNi9mJGzz25wZS7YUBPXBq7BGEEN6vTU-0mB-RNkyHoAAAAA) — a demo page unpacked from the URL itself

**Changed:**
- bookmarklets/embed-page.js ([new](https://github.com/mehrlander/web-tools/blob/main/bookmarklets/embed-page.js), [diff](https://github.com/mehrlander/web-tools/commit/673b5e3)) — reads the file text from the blob page's own DOM (private repos work), stamps a jsDelivr `<base>` for relative assets, gzips, navigates.
  renders on: [embed](https://mehrlander.github.io/web-tools/pages/embed.html)
- pages/embed.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/embed.html), [main](https://github.com/mehrlander/web-tools/blob/84bb12c/pages/embed.html), [diff](https://github.com/mehrlander/web-tools/commit/673b5e3)) — adds `?gz=` (base64url gzipped HTML) and `?html=` (base64 HTML) srcdoc modes alongside `?url=`.
- README.md ([new](https://github.com/mehrlander/web-tools/blob/main/README.md#bookmarklets), [diff](https://github.com/mehrlander/web-tools/commit/673b5e3)) — bookmarklet listed.

**Notes:** Inline modes render in a sandboxed iframe (`allow-scripts`, no `allow-same-origin`) so URL-borne HTML can't touch this origin's localStorage (gh token). Encoding the blob *URL* instead wouldn't render — github.com refuses framing and raw/jsDelivr serve HTML as `text/plain` — hence content-in-URL. Practical bound: very large files brush Chrome's ~2MB URL limit.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/peaceful-lovelace-ga5wj4)

## 2026-06-10 embed.html: iframe a base64-encoded URL (PR #163)

New page that takes `?url=<base64 URL>` and renders it in a full-viewport iframe — the iframe is the page.

⭐ **Result:** [embed.html?url=…](https://mehrlander.github.io/web-tools/pages/embed.html?url=aHR0cHM6Ly9leGFtcGxlLmNvbQ==) — example.com in the frame

**Changed:**
- pages/embed.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/embed.html), [diff](https://github.com/mehrlander/web-tools/commit/fcc3dda))
- pages/thumbs/embed.png ([new](https://github.com/mehrlander/web-tools/blob/main/pages/thumbs/embed.png), [diff](https://github.com/mehrlander/web-tools/commit/9d859f9))

**Notes:** Accepts standard or URL-safe base64, http(s) only; sites sending `X-Frame-Options`/`frame-ancestors` refuse to load — remote server's choice.

[Session diff](https://github.com/mehrlander/web-tools/compare/84bb12c...9d859f9)

## 2026-06-10 WSL Sync on gh.load kits + Alpine + JSON snapshot (PR #162)

Rebuilt both WSL Sync pages on the repo's standard rails — committed JSON snapshot as the data source, Alpine (jQuery dropped), and the gh-api/`gh.load` kit chain — with one WSL core shared by the pages and the Node fetch Action.

⭐ **Result:** [pension-dash](https://mehrlander.github.io/web-tools/pages/wsl-sync/pension-dash.html) — 52 pension clusters from the snapshot

**Changed:**
- lib/kits/wsl-core.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/kits/wsl-core.js), [diff](https://github.com/mehrlander/web-tools/commit/1d4fbd5)) — dependency-free core: parsers as a `makeParsers({ XMLParser, flatten })` factory + classify + list/group helpers (pension-map folded in). Same file runs in the browser (`gh.load`) and Node (`new Function`).
  renders on: [wsl-sync](https://mehrlander.github.io/web-tools/pages/wsl-sync/wsl-sync.html), [pension-dash](https://mehrlander.github.io/web-tools/pages/wsl-sync/pension-dash.html)
- lib/kits/wsl.js ([new](https://github.com/mehrlander/web-tools/blob/main/lib/kits/wsl.js), [diff](https://github.com/mehrlander/web-tools/commit/1d4fbd5)) — browser kit: registers `window.wsl` (lazy parsers, fetch helpers, snapshot loader, RCW display utilities).
  renders on: [wsl-sync](https://mehrlander.github.io/web-tools/pages/wsl-sync/wsl-sync.html), [pension-dash](https://mehrlander.github.io/web-tools/pages/wsl-sync/pension-dash.html)
- pages/wsl-sync/wsl-sync.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/wsl-sync.html), [diff](https://github.com/mehrlander/web-tools/commit/1d4fbd5)), pension-dash.html ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/pension-dash.html), [diff](https://github.com/mehrlander/web-tools/commit/1d4fbd5)) — boot gh-api, `gh.load` the kit + alpine-bundle, drive Alpine off `window.wsl`.
- pages/wsl-sync/fetch-data.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/fetch-data.mjs), [diff](https://github.com/mehrlander/web-tools/commit/1d4fbd5)) — runs `wsl-core` via `new Function` + npm XML libs; the source-rewrite hack is gone.
- removed pages/wsl-sync/{wsl-api,pension-map,wsl-data}.js (folded into the kits)

**Notes:** Lazy parsers mean snapshot-only pension-dash never loads fast-xml-parser, so it renders fully headless (0 console errors). wsl-sync's grid (Tabulator) can't paint under the headless renderer — its thumb is chrome-only and a real-browser grid pass is still pending.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/wsl-sync-json-alpine-xh7m89)

## 2026-06-10 WSL data pipeline: fetch Action + first snapshots (PRs #160 & #161)

Added the GitHub Actions path for WSL bill data — public-repo runners have the egress to `wslwebservices.leg.wa.gov` that the sandbox lacks — and hardened it through live runs that committed the first snapshots.

⭐ **Result:** [WSL fetch workflow](https://github.com/mehrlander/web-tools/actions/workflows/wsl-fetch.yml) — dispatch from the Actions tab; the snapshot commits to `data/<biennium>/`

**Changed:**
- .github/workflows/wsl-fetch.yml ([new](https://github.com/mehrlander/web-tools/blob/main/.github/workflows/wsl-fetch.yml), [diff](https://github.com/mehrlander/web-tools/commit/bda895a)) — #160 added it (manual dispatch); #161 made it install from package.json ([diff](https://github.com/mehrlander/web-tools/commit/b7d8db2)) and default to fetch-all ([diff](https://github.com/mehrlander/web-tools/commit/1f64117))
- pages/wsl-sync/fetch-data.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/fetch-data.mjs), [diff](https://github.com/mehrlander/web-tools/commit/578ef12)) — parameterized by biennium; each biennium archives to its own `data/<biennium>/`
- pages/wsl-sync/data/2025-26/ ([new](https://github.com/mehrlander/web-tools/tree/main/pages/wsl-sync/data/2025-26), [diff](https://github.com/mehrlander/web-tools/commit/ad7f5f6)) — snapshots from real Action runs; the final full 4,691-bill snapshot rode in on #162's branch ([f7e1ffd](https://github.com/mehrlander/web-tools/commit/f7e1ffd))

**Notes:** Two PRs, one arc: #160 the workflow, #161 the parameterization and smoke-tested runs. *(Entry written retroactively 2026-06-11.)*

[Session diff](https://github.com/mehrlander/web-tools/compare/54bdfb7...2e0fb65)

## 2026-06-10 WSL Sync thumbnails + `/+esm` render fix (PR #159)

Filled the two empty pages/wsl-sync cards in the pages index, fixing the render harness's handling of jsDelivr `/+esm` imports along the way.

⭐ **Result:** [pages/index.html](https://mehrlander.github.io/web-tools/pages/index.html) — the wsl-sync cards now show previews

**Changed:**
- pages/thumbs/wsl-sync/pension-dash.png, wsl-sync.png ([new](https://github.com/mehrlander/web-tools/tree/main/pages/thumbs/wsl-sync), [diff](https://github.com/mehrlander/web-tools/commit/0e2e9bc))
- tools/render/cdn.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/tools/render/cdn.mjs), [main](https://github.com/mehrlander/web-tools/blob/f11f3f6/tools/render/cdn.mjs), [diff](https://github.com/mehrlander/web-tools/commit/0e2e9bc)) — `/+esm` specs now resolve to the package's ESM entry, not the UMD default; jquery vendored
- docs/environment/testing.md, docs/MERGE-GUIDE.md ([diff](https://github.com/mehrlander/web-tools/commit/0e2e9bc))

**Notes:** pension-dash's thumb shows its real empty state; wsl-sync's shows header chrome only — its fast-xml-parser dep is CJS-only, which jsDelivr bundles to ESM server-side but the local resolver can't. Also adds the retroactive #158 entry below. Remaining wsl-sync work (Actions-based data fetch, load-from-repo path) deferred to a follow-up session.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/blissful-keller-tc8vl6)

---

## 2026-06-09 WSL bill apps move to pages/ + repo-side fetcher (PR #158)

Moved the WA Legislature pension-bill apps from `tools/wsl-sync/` to `pages/wsl-sync/` (they're served pages, not build tooling) and added a Node fetcher that writes the six sync stores as IDB-shaped JSON, bypassing the browser CORS paste-shuffle.

⭐ **Result:** [pension-dash](https://mehrlander.github.io/web-tools/pages/wsl-sync/pension-dash.html) (empty until IndexedDB is seeded; see [README](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/README.md))

**Changed:**
- pages/wsl-sync/fetch-data.mjs ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/fetch-data.mjs), [diff](https://github.com/mehrlander/web-tools/commit/62868d9)) — `npm run wsl-fetch`; reuses wsl-api.js's parsers, writes `data/*.json`
- pages/wsl-sync/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/pages/wsl-sync/README.md), [diff](https://github.com/mehrlander/web-tools/commit/62868d9)) — the two data paths + console seed snippet
- tools/wsl-sync/ → [pages/wsl-sync/](https://github.com/mehrlander/web-tools/tree/main/pages/wsl-sync) ([diff](https://github.com/mehrlander/web-tools/commit/10847a1)) — wsl-sync.html, pension-dash.html, wsl-api.js, pension-map.js, rcw/ moved unmodified
- package.json ([diff](https://github.com/mehrlander/web-tools/commit/62868d9)) — `wsl-fetch` script + fast-xml-parser/flat devDeps

**Notes:** Merged unexercised: `data/` is empty (the fetcher needs egress to `wslwebservices.leg.wa.gov`, not on the sandbox allowlist — run locally or via CI), and the pages read only IndexedDB, so committed `data/` won't show until seeded (README snippet) or a load-from-repo path exists. *(Entry written retroactively 2026-06-10; rode in on the branch above.)*

[Session diff](https://github.com/mehrlander/web-tools/compare/c042b30...f11f3f6)

---

## 2026-06-09 Build-on-commit hook + wrap-up ritual (PR #157)

Unified the derived-artifact refresh model: the commit-time hook now owns the pages catalogs alongside the pre-build, and thumbnails refresh once per session via the new "wrap up" ritual.

⭐ **Result (tooling + conventions — view the doc):** [tools/README.md — The refresh model](https://github.com/mehrlander/web-tools/blob/main/tools/README.md#the-refresh-model)

**Changed:**
- .claude/hooks/build-on-commit.sh ([new](https://github.com/mehrlander/web-tools/blob/main/.claude/hooks/build-on-commit.sh), [was prebuild-on-commit.sh](https://github.com/mehrlander/web-tools/blob/d82ce35/.claude/hooks/prebuild-on-commit.sh), [diff](https://github.com/mehrlander/web-tools/commit/ddd9c3a)) — new legs: regenerate+stage `pages/README.md` + `pages/index.html` when `pages/**/*.html` is dirty; warn when a page changes without its thumb
- CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/main/CLAUDE.md), [diff](https://github.com/mehrlander/web-tools/commit/ddd9c3a)) — "Wrapping up" ritual (thumbs → merge-guide entry → PR) + the merged-branch closer line for post-merge responses
- tools/README.md ([new](https://github.com/mehrlander/web-tools/blob/main/tools/README.md#the-refresh-model), [diff](https://github.com/mehrlander/web-tools/commit/ddd9c3a)) — "The refresh model" section
- .claude/settings.json, docs/environment/extending.md, tools/build/build-lib.mjs ([diff](https://github.com/mehrlander/web-tools/commit/ddd9c3a)) — hook rename references

**Notes:** Deliberate split: deterministic artifacts ride in the commit that changes their source; thumbnails (slow, not byte-deterministic) refresh per-session at wrap-up, with the hook nagging if forgotten. The hook only governs commits made through Claude sessions; `pages-index --check` remains the audit. Conventions take effect for sessions started after merge.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/eager-davinci-ekveex)

---

## 2026-06-05 Split tools/ into render+build; rewrite loader doc (PR #152)

Reorganized the `tools/` harness into `render/` + `build/`, and rewrote the loader contract doc to match the current loader and tell the load↔build story.

⭐ **Result (doc + tooling — view the file):** [docs/loader.md](https://github.com/mehrlander/web-tools/blob/main/docs/loader.md)

**Changed:**
- docs/loader.md ([new](https://github.com/mehrlander/web-tools/blob/main/docs/loader.md), [main (was SCAFFOLDING.md)](https://github.com/mehrlander/web-tools/blob/main/docs/SCAFFOLDING.md), [diff](https://github.com/mehrlander/web-tools/commit/6de6e79))
- tools/ → [render/](https://github.com/mehrlander/web-tools/tree/main/tools/render) + [build/](https://github.com/mehrlander/web-tools/tree/main/tools/build) ([diff](https://github.com/mehrlander/web-tools/commit/6de6e79))
- tools/README.md, README.md, docs/README.md ([diff](https://github.com/mehrlander/web-tools/commit/6de6e79))

**Notes:** Dev-only tooling + docs; no page runtime touched. The two tool clusters share no module imports (they couple only via subprocess + the `dist/` artifact), which is why the folder split is clean. The loader-doc rewrite corrects a stale "load mechanism" section (the `export`-strip/auto-return was removed in `451f963`) and documents a new contract clause: a runtime-computed `gh.load()` path is invisible to the static build graph, so it isn't cached offline.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/build-process-review-glCSc)

---

## 2026-05-29 Establish the merge-guide convention (branch `claude/merge-results-guide-lcnVY`)

A standing, on-demand log so session results are one tap away.

⭐ **Result:** [Merge guide section in CLAUDE.md](https://github.com/mehrlander/web-tools/blob/claude/merge-results-guide-lcnVY/CLAUDE.md#merge-guide)

**Changed:**
- CLAUDE.md ([new](https://github.com/mehrlander/web-tools/blob/claude/merge-results-guide-lcnVY/CLAUDE.md#merge-guide), [main](https://github.com/mehrlander/web-tools/blob/main/CLAUDE.md))
- MERGE-GUIDE.md, this log ([new](https://github.com/mehrlander/web-tools/blob/claude/merge-results-guide-lcnVY/MERGE-GUIDE.md))

**Notes:** On-demand only. This entry is the format's worked example.

[Session diff](https://github.com/mehrlander/web-tools/compare/main...claude/merge-results-guide-lcnVY)
