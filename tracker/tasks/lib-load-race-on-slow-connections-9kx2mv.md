---
id: lib-load-race-on-slow-connections-9kx2mv
title: Guard every lib-booting page against the Alpine load race
status: done
closed: 2026-08-02
opened: 2026-07-26
session: claude/web-tools-project-tracker-reo5qo
---
# Guard every lib-booting page against the Alpine load race

A page whose boot block ends with `gh.load('alpine-bundle.js')` is relying on winning a race it cannot observe. `gh-boot.js` mounts the FAB on a 1500ms timer and, finding no Alpine, loads and starts its own (`lib/gh-boot.js`, the `if (!window.Alpine)` branch). When the page's own chain takes longer than that, gh-boot's Alpine starts first and inits the page's inline `x-data` against helpers that have not loaded, throwing a variable error that names whichever file the chain had not reached.

Confirmed live on `pages/shorter.html`: on an iPhone over 5G, through the `#gh=` toss (which routes the whole chain through the contents API rather than jsDelivr), it failed deterministically with `Can't find variable: ShorterPayload`. Four sequential API round trips exceeded the 1500ms timer. The same page is fine on a desktop and fine in the headless harness, because `tools/render/screenshot.mjs` resolves every `gh.load` to a local file, so the loader never takes time. Recorded in `docs/environment/testing.md`.

`pages/shorter.html` now carries the guard: the boot publishes `window.__shorterReady`, `init()` awaits it before setting a `ready` flag, and both mode templates are gated on `ready`. Gating the template matters as much as awaiting in `init()`, since Alpine renders on init and a template that calls a helper throws before any `await` in `init()` can run.

Exposure elsewhere: 24 other pages define an inline `x-data` and load Alpine at the end of a `gh.load` chain, none guarded. Longest chains are the most exposed (`pages/compression-helper.html` at 9 loads, `pages/nav-repo.html` at 7). All of them will look healthy on a desktop.

Options, roughly in increasing order of blast radius:

- **Per page, as shorter.html does.** No shared change, but 24 near-identical edits, and a new page can forget it.
- **Standardize the promise name** (`window.__pageBoot`) and have `gh-boot.js` await it before starting its own Alpine. One place decides, pages opt in by publishing the promise, and a page that does not is no worse off than today.
- **Fold the guard into the canonical boot block** in `README.md` so new pages get it by construction, whichever of the above is chosen.

Worth deciding whether the FAB's 1500ms timer is the right mechanism at all, given it exists only to mount the FAB on pages that never bring Alpine themselves.
- 2026-08-02: Claimed on `claude/web-tools-project-tracker-reo5qo`. The shared mechanism landed there: gh-boot awaits a page-published window.__pageBoot before starting its own Alpine, the canonical boot block in README.md publishes it by construction, and tools/test/gh-boot-pageboot.test.mjs pins both. Remaining: adopt the published promise in the existing lib-booting pages (the 24 with inline x-data; longest chains first), and decide whether shorter.html keeps its bespoke __shorterReady gate beside the standard name.
- 2026-08-02: Done on `claude/web-tools-project-tracker-reo5qo` (lands via PR #339), by a pivot the options list did not contain: instead of 24 per-page edits, gh-api.js now keeps an in-flight census of load()s on the GH class, and gh-boot's FAB timer waits (bounded) for a beat of loader silence before starting its own Alpine. Every unedited page is covered with nothing to remember, which was the weakness of the per-page option; window.__pageBoot stays as the explicit lane and the canonical boot block in README.md publishes it. Held by tools/test/gh-boot-pageboot.test.mjs (both layers, ordered) and a gh-api.test.mjs unit test on the census. shorter.html keeps its bespoke __shorterReady template gate, which guards a different failure (its own templates rendering before its own helpers) and coexists.
