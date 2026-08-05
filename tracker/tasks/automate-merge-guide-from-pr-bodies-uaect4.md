---
id: automate-merge-guide-from-pr-bodies-uaect4
title: Automate the merge guide from PR bodies
status: done
project: repo
track: independent
opened: 2026-07-10
closed: 2026-07-14
session: claude/task-tracker-discussion-wg27xv
---
# Automate the merge guide from PR bodies

Transition `docs/MERGE-GUIDE.md` from hand-authored to generated, with merged
PR bodies as the editable source of truth for shipped history (PR #205
established the guide-PR convention and the `<!-- guide -->` managed region
this depends on).

**Part 3 (the generator) and the conventions update shipped in PR #216.**
`scripts/build-merge-guide.py` extracts a PR body's guide region (the
`<!-- guide -->` markers, or the structural ⭐/Changed/Notes span for
pre-marker PRs), rewrites branch URLs to main, drops the branch-only Next
steps, and emits `docs/MERGE-GUIDE.md` newest-first. It is non-destructive
(preserves existing entries, `--refresh` regenerates covered ones) and runs
live (GH_TOKEN) or offline (`--from-json`). CONVENTIONS.md, PORTABLE.md, and
the wrap-up now describe the generated model; the merge guide's 43 legacy
entries are preserved. Parts 1 and 2 (retroactive backfill, rogue commits)
are split out to task 0009.

Three parts:

1. **Retroactive backfill:** stamp a `<!-- guide -->` region into each merged
   PR's body. Seed from existing merge-guide entries where one exists; write
   from the PR's diff and commits where not. Backfilled links use commit-SHA
   and main-blob URLs only (old branches are deleted, so branch links are dead).
2. **Rogue commits:** merges and direct pushes with no PR (the "PR #TBD"
   merge-guide entries; tracker commits are excluded by design, the tracker is
   their log). Either a hand-maintained section the generator preserves, or
   synthetic entries; decide when building.
3. **Generator:** `scripts/build-merge-guide.py` walking merged PRs newest-first,
   extracting managed regions, rewriting branch URLs to main, emitting
   `docs/MERGE-GUIDE.md`. Needs API access at generation time; output stays a
   committed file so the projection survives offline. Joins the portable set
   (PORTABLE.md row); consider a wrap-up step or merge-triggered Action to run it.

Done (scope now, after the 0009 split) means: generator in `scripts/`, the
merge-guide section of CONVENTIONS.md and the wrap-up updated to the generated
model, MERGE-GUIDE.md carrying the generated banner. Closes when PR #216
merges. Retroactive backfill and rogue commits (the old parts 1 and 2) move
to task 0009.

## Progress log
- 2026-07-10: opened, from the PR-as-branch-guide session (PR #205). Next step: backfill design pass over the merged-PR list to size the work.
- 2026-07-14: generator built and wired into the conventions on PR #216 (session claude/task-tracker-discussion-wg27xv). Validated on fixtures (marker, structural, terse-stub, preserve, URL-rewrite, section-strip); ran non-destructively against the real MERGE-GUIDE.md (43 entries preserved, banner installed). Live corpus run blocked in-sandbox (proxy 403 to api.github.com); runs where API access exists. Hand-authoring has effectively stopped since PR #210 (no entries for #211-#215), so backfill scope is everything from #211 back that lacks a body guide region. Retroactive backfill + rogue commits split to task 0009.
- 2026-07-18: Closed. Delivered via PR #216 (merged 2026-07-14); status was left in-progress after the merge and is flipped now in a tracker sweep.
- 2026-08-05: Correction to the line above, which said the live corpus run was "blocked in-sandbox (proxy 403 to api.github.com)". The 403 is real; the block was not. `--from-json` exists precisely so the generator can run against MCP-fetched data, and the GitHub MCP's `list_pull_requests` returns objects of that shape. The claim was carried forward unchallenged for three weeks and 147 PRs, which is what let the file stand still. Logged in `docs/SNAGS.md`. The projection has since changed to `--index`, so the copy this task built is no longer what the file holds; see `backfill-guide-regions-merge-guide-bkk4xv`.

- 2026-08-05: The generator this task delivered was retired on PR #358, along with
  `docs/MERGE-GUIDE.md`. Not a defect in the build: the premise was that shipped
  history needs an in-repo copy to be durable, and that stopped being true once the
  estate could read the pulls endpoint live. Recorded as a closed task rather than
  reopened, since the work was completed as specified.
