---
id: tracker-review-in-show-repo-v5km6b
title: Tracker review in show-repo, over a typed board projection
status: done
project: show-repo
opened: 2026-08-03
closed: 2026-08-03
session: claude/budget-drs-tracker-assessment-fwa13q
size: L
---
# Tracker review in show-repo, over a typed board projection

show-repo's Board pane fetches `board.md` and hands it to `marked`, so the app's
understanding of a tracker is a string. It can display the list and can answer
nothing about it. This task gives the app typed state and builds the review
surface on top.

## Board versus review

Two different questions, and only the first is served today.

| | Answers | Needs |
| --- | --- | --- |
| Board | what is on deck, in progress, blocked | the list |
| Review | is this tracker honest: what is stale, mis-statused, waiting on the user, ready to close | typed state plus derived signals |

`board.md` structurally cannot serve the second, and parsing it in the app to
recover the fields would be the display-before-data inversion that
`favoring-the-mechanical` exists to prevent.

## Why a projection rather than reading the task files

The app cannot read `tasks/*.md` directly at render time: `gh.get()` is one
request per file and there is no bulk-content path in `lib/gh-api.js`, so
budget-drs would be 99 requests to paint one board. `board.json` is one fetch,
the same fetch the pane already makes.

`board.md` does not go away and must not. A session reads files, not apps, and a
session is the tracker's primary consumer; show-repo is also token-gated. One
generator, two projections: `board.md` for humans, GitHub, and sessions,
`board.json` for the app.

## The review signals

Taken from a tracker assessment run by hand on 2026-08-03, which is the honest
spec: this is what had to be computed with a script because nothing surfaced it.

- **Last activity**, the newest date in the progress log, not `opened:`. The
  single most useful signal. It separated four live backlog tasks from seven
  that had sat untouched for weeks.
- **Log volume**, entry count beside last activity. Seven backlog tasks carried
  progress logs consisting only of maintenance entries ("scouted", "parked",
  "moved out of Blocked"). A task drawing review passes and no work is telling
  you review will not move it; 27 branches in five weeks were named for such a
  pass. The count is mechanical; classifying an entry as work or maintenance is
  judgment and stays out.
- **`awaiting:` and `size:`**, once those graduate.
- **Branch liveness** for `session:`: merged, open, or gone. The grooming rule
  already says an in-progress task whose branch is gone should be released, and
  nothing checks it.
- **Schema drift.** Eleven done tasks carried `branch:` where the schema names
  `session:`, an unrecognized open tag, so the board showed no owner for any of
  them for weeks. A review surface showing eleven owner-less done tasks would
  have asked the question itself.

## The precedent

`pages/branch.html` renders one branch from live API reads, and the Activity
view browses the open ones as a full-viewport takeover. Nothing authored, so
nothing goes stale. The gap is symmetric: there is a branch page and no task
page, and `board.json` is what makes a task page as cheap as the API makes the
branch page.

## Definition of done

- The generator emits `board.json` beside `board.md` from the same run, so the
  two cannot drift; the existing lockstep owners (commit hook, `npm test`, CI)
  cover it.
- The Board pane reads `board.json` when present and falls back to rendering
  `board.md`, so no repo breaks before its next `/tasks` run.
- The pane carries the review signals above.
- A `tracker` check kind puts the headline count on the estate card, the first
  content-typed kind beside the five path-shaped ones in `lib/repo-checks.js`.

## Progress log
- 2026-08-03: Filed. Grew out of a budget-drs tracker assessment whose findings
  were all downstream of the board being untyped. Depends on `size:` and
  `awaiting:` graduating first, since the view's value is rendering them.
- 2026-08-03: the generator half landed on this branch (PR #345): `size` and `awaiting` graduated, `board.json` emitted beside `board.md` with `href`, `lastActivity`, and `logEntries` derived, 11 new tests. budget-drs is calibrated on `main` and is the live sample: 99 records, 49 KB. What remains here is the app half, the pane reading the projection and the `tracker` check kind.
- 2026-08-03: the pane half landed on the same branch. It reads `board.json` and falls back to rendering `board.md` where a ref has no projection, groups the four sections with counts and Done collapsed, carries `size` and `awaiting` per row, and shows days-since-last-log with its entry count. A review line counts the open set, how many await someone, how many have been quiet three weeks or more, and how many have no log at all. 13 new cases; `tools/render/scripts/project-board-review.mjs` drives it headless from real records. Remaining: the `tracker` check kind on the estate card.
- 2026-08-03: done on `claude/budget-drs-tracker-assessment-fwa13q`; lands via PR #345. The fourth definition-of-done bullet closed with a `tracker` check kind in `lib/repo-checks.js`, the first content-typed one: it reads a board projection and counts, and its fact stays time-independent (counts plus the oldest last-activity date, never an age) so the activity cache does not rehash nightly. web-tools declares it on its own tracker, so the kind is live rather than merely available. No UI change was needed, since the checks panel and the estate badge already render whatever `notable()` returns. One deviation worth naming: this task file rode the feature branch rather than going straight to `main` as the convention says, because the same commits regenerate the board through a changed generator and splitting it out would have meant conflicting board regenerations. It reaches `main` when the PR does.
