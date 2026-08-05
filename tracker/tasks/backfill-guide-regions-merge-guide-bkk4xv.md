---
id: backfill-guide-regions-merge-guide-bkk4xv
title: Backfill guide regions into old PR bodies and full-regenerate the merge guide
status: done
closed: 2026-08-05
resolution: superseded
session: claude/merge-guide-web-tools-gjhw8l
project: repo
track: depends-on:automate-merge-guide-from-pr-bodies-uaect4
opened: 2026-07-14
---
# Backfill guide regions into old PR bodies and full-regenerate the merge guide

The merge-guide generator shipped in task 0004 (PR #216) reads a PR body's
guide region and projects it into `docs/MERGE-GUIDE.md`, non-destructively. It
does not yet own the historical entries: 43 legacy hand-authored entries are
preserved as-is, and old PR bodies are not the source of truth for them. This
task closes that gap (the old parts 1 and 2 of task 0004).

Two parts:

1. **Retroactive backfill:** for each merged PR whose body lacks a proper guide
   region, stamp one in (the `<!-- guide -->` managed block). Seed from the
   existing merge-guide entry where one exists; write from the PR's diff and
   commits where not. Backfilled links use commit-SHA and main-blob URLs only
   (old branches are deleted, so branch links are dead). Then run the generator
   with `--refresh` so every entry becomes generated from its body, and the
   legacy hand entries retire.
2. **Rogue commits:** merges and direct pushes with no PR (the "PR #TBD"
   entries; tracker commits are excluded by design, the tracker is their log).
   Either a hand-maintained section the generator preserves (it already keeps
   non-PR entries verbatim), or synthetic entries; decide when building.

Note: the generator's structural fallback already extracts a decent entry from
most post-#205 bodies without a marker, so a first cheap pass is just running
it additively (no `--refresh`) with API access to fill the entries missing
since #211 (#211-#215 and any later), before the fuller marker backfill.

Done means: every merged PR that should appear has a body guide region,
`build-merge-guide.py --refresh` reproduces `MERGE-GUIDE.md` faithfully from
PRs alone, and no entry depends on hand-curation that is not also in its PR
body.

## Progress log
- 2026-07-14: split from task 0004 when the generator + conventions update shipped on PR #216. Cheapest next step: an additive run with API access to fill #211-#215 (their bodies are structured; the sandbox proxy 403s api.github.com, so run it where the API is reachable, or feed --from-json from MCP-fetched bodies).
- 2026-08-05: Closed as superseded on `claude/merge-guide-web-tools-gjhw8l`. The
  task's premise was that `MERGE-GUIDE.md` should hold a copy of each PR's guide
  region, so old bodies had to be stamped with regions to fill it. That premise
  was dropped: the file is now the `--index` projection, one line per merged PR,
  with the account left in the PR body on GitHub. Both parts go with it. The
  retroactive backfill is unnecessary, since an index needs only number, title,
  and merge date, which every PR carries, and the file now covers all 344 merged
  PRs back to 2025-11 rather than 43 entries stopping at #210. The rogue-commit
  part turned out to be one entry, not a class: a single direct merge from
  2026-05-29, now kept by hand under a trailing "Merges without a pull request"
  heading that the generator preserves verbatim.

  Two findings worth keeping. The transport was never blocked: the sandbox proxy
  403s `api.github.com`, but the generator's `--from-json` reads exactly the
  shape the GitHub MCP's `list_pull_requests` returns, which is how the index was
  built here (logged in `docs/SNAGS.md`). And the copy projection could not have
  been completed even in principle: `extract()` yields nothing for a terse body
  and drops that PR silently, so a `--refresh` run reproduces the file faithfully
  only for PRs whose bodies were written to the convention.
