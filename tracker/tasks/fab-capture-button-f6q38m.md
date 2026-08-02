---
id: fab-capture-button-f6q38m
title: Capture button on the FAB, serializing what it already collects
status: backlog
project: show-repo
opened: 2026-07-26
next: the write path (a default state/captures/ destination in the registry, per the design points); the clipboard cut shipped 2026-08-02
---
# Capture button on the FAB, serializing what it already collects

The FAB assembles a full diagnostic bundle at page boot, displays it, and throws it away on navigation. Add a button that serializes it instead.

## What already exists

Nothing here needs new collection. All of it is in place:

| Signal | Where |
|---|---|
| console logs with level and timestamp, buffered from before the FAB mounts | `window.__consoleLogs` set by `gh-boot.js`, replayed on adopt, `lib/alpineComponents/fab.js:519-530` |
| error count off that same buffer | `fab.js:858` |
| every `gh.read()`, so network provenance is logged | `window.__reads`, `fab.js:543-547` |
| loaded scripts with per-entry status, Alpine component instances, the rendered ref | Inspect tab |
| the same scan of the subject frame in `#gh=` mode | `adoptSubject()`, `fab.js:563` |

The delta is a serializer and a destination.

## Why

The way a session currently learns whether a browser-only page works is to hand the user a link and ask for a screenshot, then read text out of an image and infer the DOM. The 2026-07-26 session did that three times debugging `pages/branch.html`. A structured capture is strictly better output for the same number of taps from the user, and unlike a screenshot it persists and is diffable.

It also reaches what no sandbox can: `toss-render`'s `#gh=` owner mode cannot be tested from a session at all, because it needs the viewer's browser-local token by definition.

## Design points

- **No pixels.** `getDisplayMedia` is unsupported on iOS Safari, and `html2canvas` re-renders the DOM approximately at the cost of a bundle. State is what is wanted; the visual question is already answered by the user looking at the page.
- **Fidelity is mode-dependent, by design.** `#gh=` address mode mounts the frame with `allow-same-origin` (`pages/toss-render.html:302`), so the shell can reach in. `#gz=` payload mode deliberately does not (`toss-render.html:22-25`), so a capture there covers the shell only. The capture must say which it got rather than imply a full read.
- **Destination: default first, override second.** A fixed path in web-tools-private (`state/captures/`), overridable from the envelope. If the destination must be specified per link it will be forgotten. Copy-to-clipboard is the zero-infrastructure first cut and is useful before any write path exists.
- **Render before write.** Show the bundle in the drawer so a capture is useful even if the commit fails.
- **No separate run-test button yet.** It collapses into capture until a check is slow or has side effects. Adding it earlier is speculative.

## The write path is not new

`lib/repo-activity-cache.js` already describes a page, running in the user's browser with their token, committing derived state to web-tools-private. This is a second instance of a proven pattern, not new architecture.

## What this subsumes

A separate probe or test-runner page was considered and is not needed. A check with no UI is just a page whose body runs it and logs the result; the capture button then works on it for free. One mechanism, not two.

## Definition of done

Tapping capture inside a `#gh=` toss produces a JSON bundle carrying console, errors, reads, scripts, components, and refs for both shell and subject, viewable in the drawer, copyable, and optionally committed to web-tools-private.

## Limits

A capture proves how the page behaved for one viewer, in one browser, on one open. Nothing re-runs it. It is a confirmation instrument, not CI, and should be named that way or it will be trusted past what it earns.

## Progress log
- 2026-07-26 filed from the in-flight session; the idea is the user's, arrived at from the screenshot loop, and the survey of `fab.js` found most of the machinery already built
- 2026-08-02: The clipboard first cut landed on `claude/web-tools-project-tracker-reo5qo` (PR #339): a Copy-capture button on the Inspect header serializes the drawer's bundle (scripts, components, console, reads as path+size) with the mode naming its fidelity, per the design points. Alongside it the GraphQL operations were named and proto.graphql now logs every rejection into the console buffer before the callers degrade, so a capture definitively answers the live-confirm task. Held by tools/test/fab-capture.test.mjs. Remaining: the write path (state/captures/ in the registry, envelope override second), which is the repo-activity-cache pattern reapplied.
