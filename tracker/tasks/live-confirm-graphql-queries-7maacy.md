---
id: live-confirm-graphql-queries-7maacy
title: Live-confirm the BranchSessions query
status: backlog
project: show-repo
opened: 2026-07-26
size: XS
---
# Live-confirm the BranchSessions query

One residual confirmation. The task originally covered the two GraphQL queries
in `lib/gh-fetch.js` that had never run against the real API; `branchesForPath`
was live-confirmed on 2026-08-02 (and its logging corrected on 2026-08-06, both
below), leaving `branchSessions` (`Commit.history` + `messageBody`, PR #297).

The schema shape is already answered offline: the sibling task
(`graphql-schema-contract-check-cpuvb5`) validates both documents against
GitHub's published schema in `npm test`. What a live run still has to show is
semantic: whether `messageBody` holds the session-link trailer we assume, and
whether permissions elide nodes we expect.

## Definition of done

- The query runs on the throttled estate crawl (~12h per repo) and returns
  data rather than erroring. The confirming observation is a session icon on a
  **recent branch with no PR and no survey row**, the only case the walk
  serves; most rows resolve from the compare instead (exact, and not GraphQL).
- A FAB capture taken when the crawl fires settles it definitively, the same
  way one settled `branchesForPath`.
- If rejected, record the error text here.

## Notes

The call site is `fab.js`'s branch scan, guarded by a `typeof` check and cached
under a `walk|<repo>` scan key, so a rejection degrades silently rather than
failing the pane. That guard is why nothing has surfaced either way.

Not on a hot path: it runs once per repo per crawl. A rejection costs session
links on uncovered rows, not a page.

## Progress log
- 2026-07-26 filed from the in-flight session, consolidating the residual live-confirm from PR #241 with the same check for PR #297
- 2026-07-30 the sibling task (`graphql-schema-contract-check-cpuvb5`) landed, so
  the shape half is now answered offline in `npm test`: both queries validate
  clean against GitHub's published schema. This task is unchanged in scope, but
  narrower in expectation. The failure it was written to catch, a field name or
  a nesting the schema does not allow, is ruled out for the documents as
  written, so what remains to look for is semantic: whether `messageBody` holds
  the trailer we assume, and whether permissions elide nodes we expect.
- 2026-08-02: BranchesForPath is live-confirmed, by the first FAB capture rather than by eyeballing the tab. The user ran data-view at ?use= with a token and the capture carried: `gh-fetch: GraphQL BranchesForPath rejected: Could not resolve file for path 'pages/data-view.html'.` repeated once per branch lacking the file. So the query shape is valid and the API answered; the failure was OURS: graphql() treated any errors array as fatal, discarding the partial data GitHub returns beside per-branch file misses. Fixed on `claude/web-tools-project-tracker-reo5qo` (PR #339): partial responses now return with a console note, held by tools/test/gh-graphql-partial.test.mjs. Still open: BranchSessions, which runs on the throttled estate crawl; its confirm remains a session icon on a recent no-PR Open row, or a capture taken when the crawl fires.
- 2026-08-06: the same query, live again from a home page, showed the 2026-08-02 fix half-done. Partial data came back correctly, but the console note fired on it: five warnings across the paginated scan, 434 field errors in total, against mehrlander/home's 472 branches with the file on 38. That is a per-branch census printed as a fault, and it buries the rejections the log exists to surface. `graphql()` now takes an `expected` predicate and `branchesForPath` declares the missing-file case, so only undeclared field errors print. BranchSessions is still unconfirmed and unchanged.
- 2026-08-07: refined per the 2026-08-07 assessment (narrow). Retitled to the
  one remaining confirmation; the BranchesForPath half is history in this log
  rather than open scope.
- 2026-09-04: Verified still live during a refinement pass. `branchSessions` is
  defined in `gh-fetch.js` and called from one place, `fab.js`'s branch scan.
  Nothing has confirmed or rejected it since 2026-08-06, which is consistent
  with the guard: a failure costs session links on uncovered rows and says
  nothing. Unchanged in scope; the call site is now named so the next session
  does not search for it.
