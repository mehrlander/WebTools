---
id: speed-up-show-repo-cold-load-u3846j
title: Speed up show-repo's cold load
status: done
project: repo
opened: 2026-07-13
closed: 2026-07-13
session: claude/speed-up-show-repo-load-3cdvl0
---
# Speed up show-repo's cold load

show-repo has quietly become a daily landing page (used to combine/stage
files across repos), not just an occasional file browser, so its load time
now matters in a way it didn't when the page was young. Reported symptom:
noticeably slow on a phone. Root-caused in chat (PR #213 discussion, not
committed anywhere else) to two independent things, neither a regression
from #213 itself:

## 1. It never moved onto the pre-build

Every page's own library code (`lib/*.js`) can boot two ways: the live
`gh.load` chain (one GitHub Contents-API round trip per file, ~8 sequential
hops today: `gh-boot` -> `gh-store` -> `repo.js` -> `navigator.js` ->
`viewer.js` -> `compare.js` -> `alpine-bundle.js`), or the pre-build
(`dist/web-tools.js`, one jsDelivr fetch, everything inlined). The pre-build
already exists, is already committed and kept current by the commit-time
build hook, and already has a working per-ref preview path
(`pages/demos/prebuild-demo.html`'s `?use=<ref>` re-pin to jsDelivr). show-repo
predates the pre-build and was simply never switched onto it.

**Proposed fix:** swap show-repo's boot block to the `prebuild-demo.html`
pattern (`import('../dist/web-tools.js')`, re-pinned to jsDelivr under
`?use=<ref>` for branch preview). Verify with `npm run verify-build` that
the two boot paths render identically before relying on it. This only
changes *how show-repo's own UI code* loads — it is always the public
mehrlander/web-tools repo regardless of which (possibly private) repo the
user is currently browsing, so no public/private branching is needed here.

## 2. The sidebar's "Recent" panel fetches inefficiently

`lib/gh-api.js`'s `recentFiles()` (used by show-repo's sidebar) fetches the
commit list once, then walks it in a loop, `await`-ing each commit's detail
**one at a time**, to find `n` distinct changed file paths (up to 8-9 serial
round trips in the worst case). It does not block the rest of the page —
Alpine mounts independently — but it does tie up the browser's small pool
of concurrent connections to `api.github.com` during the exact window the
file tree and landing view are also trying to load.

Two candidate fixes, with a real tradeoff between them; the executing
session should pick after weighing it (and jsDelivr cannot substitute for
either, public or private, since it mirrors file *content*, not commit or
git-log data):

- **Parallelize the existing loop.** Keep fetching each commit's detail,
  but fire the requests together (`Promise.all` over the commit list)
  instead of `await`-ing them one at a time. Same request *count*, but the
  latency collapses to one round trip's worth. Preserves the current
  per-file data exactly.
- **Compare API.** Replace the loop with one call to
  `GET /repos/{owner}/{repo}/compare/{base}...{head}` (base = oldest fetched
  commit, head = current ref), which returns every changed file across the
  range in a single response. Fewer *requests*, which also helps the
  unauthenticated rate limit. **Caveat:** the compare `files` array is an
  aggregate diff with no per-commit dates, so this drops the per-file age
  the sidebar currently shows (`recentFiles()` sets `date` per file;
  show-repo's `loadRecent()` renders it as `f.age`). Taking this path means
  either dropping the age column deliberately or sourcing the dates another
  way. Also note `compare` excludes the base commit's own changes and caps
  at 250 commits / 300 files (fine at the current n, worth knowing).

The parallelize option is the low-risk, feature-preserving one; compare is
leaner on requests but changes what the panel can display. No fixed
preference here.

**Also worth doing:** defer firing `loadRecent()` until just after the file
tree's first paint (rather than the instant repo/ref resolves), so it never
contends with the requests that matter for the user's immediate view. Check
whether the same applies to other calls made around repo-pick time (e.g.
`rc.setup()`'s background repo listing already does this; `pickByName()`'s
repo-metadata call is harder to defer since the tree needs the default
branch first, but it's one call, not a bottleneck).

## What "done" means

- show-repo boots via `dist/web-tools.js` (or a documented reason it can't).
- `recentFiles()` no longer serializes n round trips (parallelized or
  collapsed to one compare call), and/or fires after first paint instead of
  blocking the sidebar's early network window. If the compare path is taken,
  the per-file age is either preserved or its removal is a stated choice.
- A rough before/after check (round-trip count is enough; no need for real
  mobile timing) shows the reduction.

No fixed opinion on sequencing or exact mechanism beyond the above — the
owner explicitly wants the executing session to find the best approach and
report back.

## Progress log
- 2026-07-13: opened, from the show-repo auth-shield session (PR #213). Diagnosis and proposed fixes are chat-only until now; this file is their first durable record.
- 2026-07-13: revised section 2 after re-reading the code: the compare-API swap would drop the per-file age the sidebar shows, so it is now presented as a tradeoff against plain parallelizing, not the recommended path.
- 2026-07-13: claimed by claude/speed-up-show-repo-load-3cdvl0. Plan: swap show-repo's boot onto the pre-build; defer loadRecent() until the file tree's first load completes; parallelize recentFiles() in small batches, keeping the per-file dates. Owner note for this session: deferral matters more than raw recent-panel speed.
- 2026-07-13: implemented all three (boot swap, deferral behind a new navigator loadedOnce flag, batched-parallel recentFiles with dates preserved) in PR #214. Round trips: ~12 sequential API calls at boot become 1 same-origin fetch; the Recent fetch now fires after the tree lands, in 1 to 2 parallel waves. verify-build's byte gate is flaky for this page (thumbnail nondeterminism); pixel-diff showed live vs pre-build at 4 px. Next: review and merge PR #214, then set done.
- 2026-07-18: Closed. Delivered via PR #214 (merged 2026-07-13); status was left in-progress after the merge and is flipped now in a tracker sweep.
