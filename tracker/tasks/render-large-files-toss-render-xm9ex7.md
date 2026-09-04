---
id: render-large-files-toss-render-xm9ex7
title: Render files over 1 MB in toss-render and the shell viewers
status: done
project: show-repo
opened: 2026-07-17
closed: 2026-07-17
---
# Render files over 1 MB in toss-render and the shell viewers

toss-render fetches page files and their relative deps through the contents
API with the JSON media type (`Accept: application/vnd.github.v3+json`, in
`ghText` and the runtime fetch shim). For a file over 1 MB GitHub returns
`"content": ""`, so the render comes back empty. The concrete casualty: the
budget-drs app bundle (`mehrlander/home
projects/budget-drs/drs-budget-synthesis.html`, 5.9 MB, self-contained) cannot
render as a `#gh=` toss or as a show-repo custom landing, which blocks the
app-as-landing dashboard direction for the home repo.

Fix by requesting the raw media type (`application/vnd.github.raw+json`,
served for files 1 to 100 MB) or falling back to the git blobs API when the
JSON response carries no content. Audit the same limit in show-repo's viewer
path and `gh-api.js`'s `get()`.

Done means: a `#gh=` toss of the DRS bundle renders, a manifest `landing`
pointing at a >1 MB page renders in the shell, and the estate's landing
surface item can point at a live render instead of the blob.

## Progress log
- 2026-07-17: Filed from the repo-strategy assessment and estate-view session;
  the 1 MB ceiling was confirmed by reading ghText and the fetch shim, not yet
  live-tested against a large file.
- 2026-07-17: Fixed. Switched the three toss-render.html render-path fetches
  (ghText, showAddress, the injected fetchShim) from the JSON media type to the
  raw media type (`application/vnd.github.raw+json`, served for files 1-100 MB),
  with a git-blobs-by-sha fallback for the rare JSON-with-empty-content case; a
  shared `readContents()` sniffs the response (raw text vs JSON directory/error).
  Also gave `gh-api.js` `get()` the same git-blobs fallback when `content` is
  empty, preserving its return shape, so every consumer (including show-repo's
  config/README reads) is >1 MB-safe. show-repo needs no direct edit: its custom
  landing and "Toss render" action both route through toss-render `#gh=`.
  Verified with a headless Chromium A/B test against a mock emulating GitHub's
  exact raw-vs-JSON semantics: OLD (v3+json) delivers a 1,893-char blank shell
  (no title, no marker); NEW (raw+json) delivers the full 6.12 MB bundle to the
  iframe (document.title "DRS budget synthesis", source marker present). The
  `<base>` injection was confirmed harmless (identical render with/without).
- 2026-07-17: Full visual confirmed. The initial blank headless shots were a
  harness issue, not the fix: the sandbox Chromium was not routing CDN loads
  through the agent proxy. Fixed the harness by pre-fetching the five CDN assets
  (Alpine, DaisyUI, Tailwind-browser, Phosphor, Tabulator) through the proxy and
  serving them to Chromium via route interception. The bundle then renders the
  full interactive dashboard through the toss `#gh=` path (Alpine boots, sidebar
  + stacked-area chart + item panel), pixel-identical to the standalone render
  (byte-identical screenshots). The only residual is a real GitHub token hitting
  the real raw endpoint, which the session token cannot do (no App access); the
  raw-vs-JSON semantics were reproduced exactly in the mock.
