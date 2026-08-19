---
id: estate-activity-signals-cache-38eze9
title: Estate activity signals from a registry activity cache
status: done
project: show-repo
opened: 2026-07-17
session: claude/branches-view-api-caching-ef4l5d
closed: 2026-07-26
---
# Estate activity signals from a registry activity cache

The estate view (PR #232) shows one live signal per repo card: pushed-ago from
a per-repo `/repos` call at render time. The registry's DESIGN.md contemplates
an activity cache (`state/activity.json`: recent commits accumulating and
capped, branches, open PRs per repo, on the same crawl as the config cache).
Build it and let the estate read it: freshness dots in the surfacer's rail
style (pushed since last opened), a latest-activity panel, and cross-repo
recent-commit reads without per-visit API fanout. The branch-review view task
(20260716-jvi) names the same cache as its staging ground; co-design rather
than duplicating the crawl.

Done means: the cache builds under the existing throttle/material-change
regime, the estate renders a freshness signal and a recent-activity strip from
it, and a cold public load is unaffected.

## Progress log
- 2026-07-17: Filed from the estate-view session (PR #232). Estate ships with
  live pushed-ago only; cache design deferred here.
- 2026-07-20: Claimed on branch claude/branches-view-api-caching-ef4l5d and
  built, co-designed with the branch-review view's caching as the task
  anticipated. Shipped: lib/repo-activity-cache.js (pure fold builders, sibling
  of repo-config-cache.js, unit-tested); state/activity.json in the registry
  holding a two-tier per-repo snapshot (cheap summary: pushed-at, counts,
  accumulating-capped recent commits, open PRs; plus the capped landed/stranded
  branch survey stored whole); show-repo's refreshActivityCache crawl on a ~12h
  throttle, sharing one survey path with the branches view via new orchestrators
  in lib/branch-status.js (surveyBranchLive / surveyOlder). Reads: the branches
  view renders cache-first (live fanout only on Refresh); the estate gains an
  Activity view (?view=activity, cross-repo commits + per-repo rollups), a
  landing activity strip and per-card freshness rollups on the Repos view. Also
  fixed the stale branches-view.test.mjs (drifted at the #246 tabs redesign) and
  added repo-activity-cache tests. Flips to done on merge; the cross-repo file
  listing and a GraphQL-batched crawl remain as follow-ons.
- 2026-07-26 closed: Delivered in PR #248 (branch fully merged to main). The two follow-ons the `next` tag named, cross-repo file listing and a GraphQL-batched crawl, were not part of it; refile them if they are still wanted. Found by `/in-flight`, which reconciles every in-progress claim against the branch it names.
