---
id: fab-capture-button-f6q38m
title: Persist FAB captures, the write path to state/captures/
status: backlog
project: show-repo
opened: 2026-07-26
size: S
---
# Persist FAB captures: the write path to state/captures/

The capture mechanism exists. PR #339 shipped the Copy-capture button on the
FAB's Inspect header: it serializes the drawer's diagnostic bundle (scripts,
components, console, reads as path+size) with the mode naming its fidelity,
held by `tools/test/fab-capture.test.mjs`. What remains is the second delivery
half of the original design: committing a capture instead of only copying it.

- **Destination: default first, override second.** A fixed path in
  web-tools-private (`state/captures/`), overridable from the envelope. If the
  destination must be specified per link it will be forgotten.
- **The pattern is proven, not new.** `lib/kits/repo-activity-cache.js` already
  describes a page, running in the user's browser with their token, committing
  derived state to web-tools-private. This is a second instance.
- **Render before write** stays the rule: the drawer shows the bundle whether
  or not the commit succeeds, and the clipboard path remains beside the write.

## Fidelity, unchanged from the original design

`#gh=` address mode mounts the frame with `allow-same-origin`, so the capture
covers shell and subject; `#gz=` payload mode deliberately does not, so a
capture there covers the shell only and must say which it got. No pixels: state
is what is wanted, and the visual question is answered by the user looking at
the page.

## Done when

Tapping capture inside a `#gh=` toss can commit the JSON bundle to
web-tools-private `state/captures/` (envelope override honored), with the
clipboard path still available and the drawer render unchanged. A capture
remains a confirmation instrument, not CI: it proves how the page behaved for
one viewer, in one browser, on one open.

## Progress log
- 2026-07-26 filed from the in-flight session; the idea is the user's, arrived at from the screenshot loop, and the survey of `fab.js` found most of the machinery already built
- 2026-08-02: The clipboard first cut landed on `claude/web-tools-project-tracker-reo5qo` (PR #339): a Copy-capture button on the Inspect header serializes the drawer's bundle (scripts, components, console, reads as path+size) with the mode naming its fidelity, per the design points. Alongside it the GraphQL operations were named and proto.graphql now logs every rejection into the console buffer before the callers degrade, so a capture definitively answers the live-confirm task. Held by tools/test/fab-capture.test.mjs. Remaining: the write path (state/captures/ in the registry, envelope override second), which is the repo-activity-cache pattern reapplied.
- 2026-08-07: refined per the 2026-08-07 assessment (narrow). Retitled from
  "Capture button on the FAB" to the residual write path; the collection
  survey and the capture-button design points that shipped with PR #339 are
  history in this log, and the stale `next:` tag is dropped.
