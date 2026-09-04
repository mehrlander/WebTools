---
id: live-confirm-graphql-queries-7maacy
title: Live-confirm the BranchSessions query
status: backlog
project: show-repo
opened: 2026-07-26
size: XS
---
# Live-confirm the BranchSessions query

`branchSessions` (`Commit.history` + `messageBody`, PR #297) has never been seen
running against the real API. Its shape is already validated offline against
GitHub's published schema by `npm test`, so what remains is semantic: does
`messageBody` hold the session-link trailer we assume, and do permissions elide
nodes we expect.

Called from one place, `fab.js`'s branch scan, behind a `typeof` guard and cached
under a `walk|<repo>` key. That guard is why nothing has surfaced either way: a
rejection costs session links on uncovered rows and says nothing.

## Done when
It runs on the throttled estate crawl (~12h per repo) and returns data. The
confirming sight is a session icon on a **recent branch with no PR and no survey
row**, the only case the walk serves; every other row resolves from the compare,
which is exact and not GraphQL. A FAB capture taken when the crawl fires settles
it definitively, as one did for `branchesForPath`. If rejected, record the error
text here.

## Progress log
- 2026-07-26: Filed, consolidating the residual confirms from PR #241 and #297.
- 2026-08-02: The sibling query `branchesForPath` was live-confirmed by the first
  FAB capture, and the capture found a bug that was ours: `graphql()` treated any
  `errors` array as fatal, discarding the partial data GitHub returns beside
  per-branch file misses. Fixed in PR #339.
- 2026-08-06: That fix was half-done. Partial data came back correctly but the
  console note fired on it, printing 434 field errors across mehrlander/home's
  472 branches as faults. `graphql()` now takes an `expected` predicate so only
  undeclared field errors print.
- 2026-08-07: Retitled to the one remaining confirmation.
- 2026-09-04: Verified still live and still unconfirmed. Call site named above so
  the next session does not search for it. Body cut from 653 words.
