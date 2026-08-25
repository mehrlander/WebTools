---
id: use-blob-import-bundle-dtuqjo
title: Load the ?use= bundle by fetch + blob-import instead of jsDelivr
status: done
opened: 2026-07-20
closed: 2026-07-20
session: claude/loading-behavior-tracker-aqbf4f
---
# Load the ?use= bundle by fetch + blob-import instead of jsDelivr

`?use=<ref>` previews a branch of web-tools by loading its built bundle from jsDelivr: the boot does `import('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@<ref>/dist/web-tools.js')` (see `pages/show-repo/show-repo.html` boot block). jsDelivr caches a branch tip for ~12h, so a freshly-pushed commit previews stale until the cache expires or is purged. The documented workaround is to pin `?use=` to a SHA, but that is a foot-gun people keep hitting (branch name is the natural thing to type and the one cache-unstable ref form).

**Why jsDelivr is there at all.** A browser `import()` needs a URL that serves JavaScript with a JS MIME type and CORS. GitHub Pages serves only main, and `raw.githubusercontent.com` serves the file as `text/plain` (which the module loader refuses), so jsDelivr is the one host that re-serves a branch's file importably. It is a convenience, not a necessity.

**The fix.** Replace the jsDelivr `import()` in the `?use=` path with fetch + blob-import: `fetch` the branch's `dist/web-tools.js` text, wrap it in a `Blob`, mint a `blob:` URL, and `import()` that. A blob URL imports regardless of GitHub's MIME type because you set the blob's type yourself. Source of the bytes: `raw.githubusercontent.com/mehrlander/web-tools/<ref>/dist/web-tools.js` for the public case (anonymous, permissive CORS, no 12h branch-tip cache; a SHA is immutable). The bundle is a single self-contained module with no internal imports, so blob-import is clean.

**Scope, deliberately narrow.**
- Change **only** the `?use=` branch. The normal deployed load (no `?use`, same-origin Pages import) stays fastest and untouched.
- jsDelivr stays for every other case that wants the built bundle: bookmarklets and off-Pages consumers pulling `@<ref>/dist/web-tools.js` directly. This is only about the in-page `?use=` preview path.
- Factor a small shared helper the boot and the toss can both call, since the toss (`pages/toss-render.html`, `inlineRelativeDeps`) already fetches-and-inlines a page's deps via the token; dynamic `import()` is the one thing its inliner explicitly does not handle, which is exactly why show-repo's bundle leaks back onto jsDelivr even inside a toss. Closing that is the same helper.

**Answers to the obvious questions (from the source thread).**
- Slower? Not meaningfully: one network round-trip either way; the blob step is in-memory microseconds. A cold ref can be faster (no jsDelivr origin-pull).
- Token required? No: `?use=` only previews the public web-tools repo, and raw serves public files anonymously (its own high limits, not the 60/hr API cap). Private previewing already lives in the toss `#gh=` path via the token; unaffected.
- More aligned? Yes: unifies code-loading onto one technique (fetch our code, run it locally), removes the freshness foot-gun at the root, and matches how the toss handles deps.

**Interim.** A cheaper band-aid exists if this is deferred: resolve `?use=<branch>` to its current SHA at boot (one API call when a token is present) and load `@<sha>`, so the branch name behaves cache-safely. Prefer the fetch+blob-import root fix; keep the SHA resolution only as a stopgap.

**Origin.** Surfaced in the PR #244 discussion (show-repo no-token public browser + dialog scoping), when a `?use=<branch>` preview showed a stale dialog because jsDelivr was serving the pre-change branch bundle.

## Progress log
- 2026-07-20: Filed from the PR #244 thread. Root-caused the stale-preview to jsDelivr's ~12h branch-tip cache on the `?use=` bundle import; scoped the fix to fetch+blob-import on the `?use=` path only, jsDelivr retained for bookmarklets and off-Pages bundle consumers.
- 2026-07-20: Done for the pre-build bundle. The three `dist/web-tools.js` `?use=` boots (`show-repo`, `review`, `prebuild-demo`) now fetch the reffed bundle from `raw.githubusercontent.com` and blob-import it; jsDelivr stays for the no-`?use` same-origin path and off-Pages consumers. Confirmed `raw` resolves slashed branch names (e.g. `microsoft/vscode@release/1.80`), so a `claude/*` branch is cache-safe. The toss leak closes as a consequence: a tossed show-repo's boot `import()` now hits `raw`, not jsDelivr, with no `inlineRelativeDeps` change. The parallel `lib/gh-api.js`-chain boot (~18 other `?use=` pages) is a separate follow-up, `use-gh-api-chain-blob-import-*`, because it needs a blob-safe fallback for `gh-api.js`'s `import.meta.url` ref-detection first. Lands via the loading-behavior-tracker PR.
