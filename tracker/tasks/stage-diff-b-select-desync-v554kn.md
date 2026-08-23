---
id: stage-diff-b-select-desync-v554kn
title: Fix the stage Diff lens B-select display desync
status: done
opened: 2026-07-20
closed: 2026-07-20
session: claude/web-tools-diff-review-s0nrq7
---
# Fix the stage Diff lens B-select display desync

When two items auto-pair on a `#stage=` link open (or any time a second item is staged into an empty-diff stage), `diffB` is correctly set to the second item and the diff runs before to after, but the B `<select>` stays displaying the first item's label. Confirmed by headless probe: `diffB === 1` while the select shows value `0`, and a `nextTick` does not resync it. The diff output is right; only the B dropdown mislabels, in exactly the edit-review marquee flow.

Cause is the classic Alpine gotcha: `x-model.number="diffB"` on a `<select>` whose `<option>`s are `x-for`'d from `items` (`lib/alpineComponents/stage.js`, the Diff lens template around the A/B selects, and the `autoPair` watcher in `init`). The pairing assignment lands in the same reactive flush the second option mounts, so the value bind runs before its option exists and never re-fires.

A one-line `$nextTick` deferral of the `diffB` assignment was tried during PR #257 and did not stick (the select still showed index 0) and broke a unit test, so it was reverted. The real fix is a small template change done deliberately: bind `:selected="i === diffB"` on the options, or drive the select value explicitly after the option DOM exists, rather than relying on `x-model` alone to push a programmatic value into an `x-for` select.

Done means: opening a two-item stage (or a `#stage=` two-refs link) shows the B select naming the second item, matching the item the diff actually uses; `tools/test/stage.test.mjs` stays green; and the fix is verified headless with `tools/render/scenarios/stage-diff-review.mjs` (or a sibling), reading the select's rendered value, not just the model.

## Progress log
- 2026-07-20: Filed from the PR #257 review of #256. Found via the headless render of the Diff lens; the screenshot showed B labeled "before" over a correct before-to-after diff. Cosmetic but confusing; sits in the edit-review link-open path, which is also the path with no end-to-end test yet.
- 2026-07-20: Done on branch claude/web-tools-diff-review-s0nrq7 (PR #257). Fixed during the stage redesign: the A/B selects dropped `x-model.number` for an explicit `:selected="i === diffX"` + `@change` binding, the reliable pattern for a programmatically-set value over `x-for` options. Verified in real Chromium (where it reproduced; jsdom never exhibited the desync, so no unit test was added, the headless render is the check): the B select now shows the paired item, not the first. The earlier `$nextTick` deferral attempt was the wrong lever.
