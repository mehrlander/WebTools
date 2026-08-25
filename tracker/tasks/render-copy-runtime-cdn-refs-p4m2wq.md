---
id: render-copy-runtime-cdn-refs-p4m2wq
title: Inline the run-time CDN references a rendering copy still carries
status: backlog
project: export
opened: 2026-07-27
---
# Inline the run-time CDN references a rendering copy still carries

`exporter.renderCopy()` inlines the `gh.load` chain and the `read()` data, which covers every route the loader owns. It does not cover a page that reaches for our code by some other means at run time, and one pattern does exactly that: the kit demos inject `${base}/kits/<kit>.js` into each proof frame as a plain `<script src>`. That is not a `gh.load`, so it is not in the cache, and the copied page fetches it from jsDelivr when the frame runs.

## Why it is not urgent

Those references resolve wherever jsDelivr does, which is the assumption the rendering copy makes anyway (third-party CDN tags are left alone on purpose). The copy renders correctly in a CodePen today. The count is reported at copy time as `cdnRefs`, so nobody has to discover it on paste.

## Why it still matters

They break on exactly the cases the rendering copy exists for: a private repo, or a branch that has not been pushed. `#gh=` can render such a page, so a viewer can take a copy of something whose proof frames will 404 for them. The reported count is honest but it is a warning, not a fix.

## Shape of the fix

Rewrite `<script src>` values pointing at `cdn.jsdelivr.net/gh/mehrlander/...` into `blob:` or `data:` URLs built from the same cache `collectCache` already gathers. The pieces exist; what is missing is deciding where the rewrite belongs. It is not `bake()`'s job (that owns the module import), and doing it in `renderCopy` means the zip export would keep the old behavior, which is a divergence worth arguing about first.

## Adjacent, smaller

A baked page built from the canonical boot block still carries the `?use=` branch that fetches `gh-api.js` from `raw.githubusercontent.com` and blob-imports it, bypassing the inlined build. Harmless where a rendering copy actually lands (no query string on a paste), but it means a baked page handed a `?use=` goes back to the network. Decide whether bake should neutralize that branch or leave it as the documented escape hatch it is on a deployed page.

## Progress log
- 2026-07-27 filed while adding `renderCopy`; the count exists because the gap was found by a test that blocks every repo host and watches what the copy still asks for (`tools/test/render-copy.mjs`)
