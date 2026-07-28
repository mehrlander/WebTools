---
id: links-rail-in-the-shell-gg7ehg
title: Expose the links rail in show-repo's own chrome
status: backlog
project: show-repo
opened: 2026-07-28
---
# Expose the links rail in show-repo's own chrome

`pages/links.html` renders the board's `rail: true` items as a band at the top of its own page. Promoted as an app view it sits in an iframe, so that band is only reachable once you have navigated to the Links view. The intent behind the rail was the opposite: the four or five destinations you open every day, one tap from wherever you are in the shell.

## The constraint, stated correctly

An iframe cannot paint into its parent's chrome. That is real and it is the whole of it. It does not follow that the rail is out of reach, because **the rail does not have to come from the page**. The shell can read `links/board.json` itself and render the `rail: true` slice in its own sidebar.

An earlier session's reply framed this as something we "cannot" do. That was wrong and is corrected here so it is not inherited.

## What it takes

Structurally identical to the app-view block already in the sidebar (`pages/show-repo/show-repo.html`, the `App views` section, and `loadEstateSidebar()` which feeds it):

| Piece | Precedent |
|---|---|
| one token-gated GET of `mehrlander/home` `links/board.json` | the config-cache pass in `loadEstateSidebar()` |
| a `railLinks` getter flattening items and doors | `sidebarAppViews` |
| ~12 lines of sidebar markup | the `App views` block |

No cross-frame work: the frame is not involved.

## The call to make first

`docs/show-repo.md` states the header nav is deliberately "a fixed, app-owned set... rather than one repos opt into." A rail fed from home's board puts repo-sourced content into app-owned chrome. App views already bend that rule, so there is precedent, but this is a decision about what the shell is, not a free win. Settle it before building.

Open sub-questions if it goes ahead: sidebar block versus a header popover; whether the source file is hardcoded or declared by a repo the way `appView` is; whether doors appear in the rail or only their parent.

## Definition of done

The `rail: true` destinations are one tap from any show-repo view, sourced from the same `links/board.json` the page reads, with no second list to maintain.

## Progress log
- 2026-07-28 filed at wrap-up of the links page (PR #308, home PR #365). The flags already exist in `board.json` and drive the page's own band, so nothing needs re-authoring when this is picked up.
