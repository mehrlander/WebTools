---
id: history-safe-toss-render-shim-hkih5m
title: History-safe shim for toss-render address-mode renders
status: done
project: show-repo
opened: 2026-07-17
closed: 2026-07-17
---
# History-safe shim for toss-render address-mode renders

Follow-up to 20260717-p5a. With the >1 MB fix live, the budget-drs app
rendered as home's landing, but its Admin, Spend, and Contracts views never
painted on tab switch. Not a data problem: all seams inline identically for
every view. The app's `go(key)` calls `history.replaceState(null, "", "#" +
key)` on each switch, and inside toss-render's srcdoc iframe that throws a
SecurityError (the URL resolves against the stamped `<base>` while the
document is `about:srcdoc`), killing the switch. The default view escaped
because `init()` renders without `go()`.

Fix in the renderer, not the page: pages authored for Pages should embed
unmodified. `addressHtml` now injects a history-safe shim ahead of the page
(replaceState and pushState wrapped so a throwing call becomes a no-op),
beside the existing `?use` and fetch shims.

Verified with the headless probe driving `window.__go` through
stream/composition/spend/contracts: before, every switch threw and painted
nothing through the toss (all four fine standalone); after, all four paint
through the toss with text sizes and timings identical to standalone.

## Progress log
- 2026-07-17: Found from live use of the merged landing (only the spend-lens
  tabs appeared affected, which was a coincidence of which tabs were clicked;
  every `go()` switch was broken). Shim added, probe green, shipped as the
  follow-up PR to #235.
