---
id: file-review-collapsed-density-2rvxfn
title: Give the file-review collapsed row more than a name and a count
status: backlog
project: web-tools
opened: 2026-07-26
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
