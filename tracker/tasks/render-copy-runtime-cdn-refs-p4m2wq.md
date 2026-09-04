---
id: render-copy-runtime-cdn-refs-p4m2wq
title: Inline the run-time CDN references a rendering copy still carries
status: backlog
project: export
opened: 2026-07-27
size: S
---
# Inline the run-time CDN references a rendering copy still carries

`exporter.renderCopy()` inlines the `gh.load` chain and the `read()` data, which covers every route the loader owns. It does not cover a page that reaches for our code by some other means at run time, and one pattern does exactly that: the kit demos inject `${base}/kits/<kit>.js` into each proof frame as a plain `<script src>`. That is not a `gh.load`, so it is not in the cache, and the copied page fetches it from jsDelivr when the frame runs.

## Why it is not urgent

Those references resolve wherever jsDelivr does, which is the assumption the rendering copy makes anyway (third-party CDN tags are left alone on purpose). The copy renders correctly in a CodePen today. The count is reported at copy time as `cdnRefs`, so nobody has to discover it on paste.

## Why it still matters

They break on exactly the cases the rendering copy exists for: a private repo, or a branch that has not been pushed. `#gh=` can render such a page, so a viewer can take a copy of something whose proof frames will 404 for them. The reported count is honest but it is a warning, not a fix.

## Shape of the fix

Rewrite `<script src>` values pointing at `cdn.jsdelivr.net/gh/mehrlander/...` into `blob:` or `data:` URLs built from the same cache `collectCache` already gathers.

**The placement question is settled: it goes in `bakeHtml`.** The task was filed worrying that putting the rewrite in `renderCopy` would leave the zip export behind, a divergence to argue about first. There is nothing left to argue: `lib/kits/export.js` defines one `bakeHtml` helper that calls `collectCache`, and both `renderCopy` and the zip path call it. A rewrite there covers both, and it is not `bake()`'s job, which owns the module import. The one real limit to state in the change: the zip only bakes under `offline: true`, so a plain `-export.zip` keeps the CDN references by design.

## Adjacent, smaller

A baked page built from the canonical boot block still carries the `?use=` branch that fetches `gh-api.js` from `raw.githubusercontent.com` and blob-imports it, bypassing the inlined build. Harmless where a rendering copy actually lands (no query string on a paste), but it means a baked page handed a `?use=` goes back to the network. Decide whether bake should neutralize that branch or leave it as the documented escape hatch it is on a deployed page.

## Progress log
- 2026-07-27 filed while adding `renderCopy`; the count exists because the gap was found by a test that blocks every repo host and watches what the copy still asks for (`tools/test/render-copy.mjs`)
- 2026-09-04: Placement settled by reading `lib/kits/export.js` rather than by
  arguing: `bakeHtml` is already shared by `renderCopy` and the zip, so the
  divergence the task was holding for has no substance. What remains is writing
  the rewrite. Sized S.
