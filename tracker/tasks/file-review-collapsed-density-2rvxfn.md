---
id: file-review-collapsed-density-2rvxfn
title: Give the file-review collapsed row more than a name and a count
status: done
project: web-tools
opened: 2026-07-26
closed: 2026-08-06
session: claude/show-repo-progress-b8l63x
---
# Give the file-review collapsed row more than a name and a count

A collapsed `fileReview` card shows a status letter, the path, and `+N/-N`. Everything else waits behind the expand, including things that cost nothing.

## What is actually free

Expanding does two jobs at once, and only one is expensive:

- **Already in memory** when the list renders: the `new` / `base` / `raw` / `toss` links (pure getters over repo, ref, and path), and **the patch text itself**, which the compare API returns with the file list. So the Patch tab and the copy-patch action need no fetch either.
- **Needs a call**: the commit-sha link (one per file), and `newText`/`baseText` from the contents API, which the CM6 diff and the New/Base tabs require.

`toggle()` calls `load()` on open, so a collapsed row has paid nothing and a spinner appears even when the patch is already in hand.

## Definition of done

- Opening a card renders the patch immediately and fetches content only when Diff, New, or Base is selected.
- The cheap links reach the collapsed row without adding a second line: fourteen files on a phone already run several screens, so this is an icon cluster at the right edge, not a row of its own.
- The commit link stays behind the expand; hoisting it to every row means one API call per row on load.

## Progress log
- 2026-07-26 filed from the session that built the branch page, which mounts the same cards; the density question came up while reading the review page on a phone
- 2026-08-06: Done, on both hosts (the branch page and pages/review.html), and the list stopped being cards.

  **The free half was freer than the task said.** Opening a card no longer fetches at all when the compare handed it a patch, and neither does a card that starts open, which the branch page does for every file on a modest branch: twelve files mounted was twenty-four contents calls behind a spinner, to show what twelve cards were already holding. The fetch moved to `setTab`, so Diff, New and Base pay for themselves and Patch never does. The Diff tab now shows before the content is loaded, since hiding it until `diffable` is known would hide the control that makes it known.

  **The collapsed row got the density rather than a second line.** The directory dims and elides from the left while the filename keeps full weight, a five-block bar carries the add/remove proportion beside the numbers, and there is exactly ONE action icon, routed by file type through `kits/guide-render.js` so a page opens rendered and a doc opens read. The task proposed an icon cluster; four icons times thirty rows read as noise, and the other links stay behind the expand where there is room to label them.

  **The cards became a list.** One bordered container with hairline rows, no per-card border and no gap. Thirty boxes with spacing between them spent vertical space on borders carrying no information, which is what made the list hard to scan in the first place.

  **Two things this cost, both recorded:** the first cut truncated the directory with CSS `direction: rtl`, which handed the string to the bidi algorithm and rendered `.claude/skills/caption/` as `/claude/skills/caption.`; and nothing in the suite covered this component at all, so `tools/test/file-review-card.test.mjs` is new and pins the fetch discipline, the elision, and the bar.
