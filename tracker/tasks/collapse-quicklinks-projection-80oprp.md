---
id: collapse-quicklinks-projection-80oprp
title: Collapse quickLinks into a projection of the repos manifest
status: backlog
project: show-repo
opened: 2026-07-17
next: decide whether to retire the resolver and the registry's legacy list, or close this as overtaken; the row it was about no longer exists
---
# Collapse quickLinks into a projection of the repos manifest

The registry now carries two curated lists side by side: `quickLinks` (the
header row) and `repos` (the estate's ecosystem manifest, added with the
estate view). DESIGN.md's ecosystem-manifest idea wants membership defined
once, with the header row a projection. Fold `quickLinks` into `repos` (e.g. a
`quickLink: true` flag or an order field), update `loadQuickLinks()` to read
the projection, and keep a deprecation window where a literal `quickLinks`
field still wins if present.

Done means: one list in the registry defines membership; the header row and
the estate render from it; DESIGN.md and docs/show-repo.md describe the single
source.

## Progress log
- 2026-07-17: Filed from the estate-view session (PR #232), which added
  `repos` beside `quickLinks` rather than migrating in the same change.
- 2026-07-28: overtaken twice, so the task as written no longer describes real
  work. Membership moved to a per-repo property (`quickLink: true` in each
  repo's own .web-tools.json, aggregated by the config cache), which is a
  stronger answer than the projection this task proposed, and then the
  header-nav redesign removed the quick-link row outright: no markup reads
  `quickLinks` now. What is actually left is cleanup, and it is optional.
  loadQuickLinks() still resolves a list, and refreshConfigCache() still seeds
  its crawl from it when the account enumeration fails, so the resolver is
  live even though the display is gone; the registry's .web-tools.json still
  carries both the legacy `quickLinks` list (read only as that fallback) and
  the `repos` list (still the atlas roster in lib/alpineComponents/map.js).
  Membership is therefore defined in three places, which is the one thing this
  task wanted to prevent. Stale docs and comments describing a live row were
  corrected on branch claude/tracker-status-cjogjn; the code and the registry
  manifest were left alone pending a decision.
