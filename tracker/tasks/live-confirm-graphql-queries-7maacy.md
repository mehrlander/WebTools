---
id: live-confirm-graphql-queries-7maacy
title: Live-confirm the two GraphQL queries the estate depends on
status: backlog
project: show-repo
opened: 2026-07-26
---
# Live-confirm the two GraphQL queries the estate depends on

Two GraphQL queries in `lib/gh-fetch.js` have never run against the real API. Both fail soft, so neither can break a view, but neither is known to work either. One browser open with a token settles both.

## Why

The Claude Code web sandbox cannot exercise them. Its proxy serves only a pinned set of GraphQL operations (`This GraphQL query is not enabled for this session`), and direct REST via `curl` is gated too, so a session can unit-test the surrounding logic against a stubbed transport but cannot validate the query shape. Each was therefore written to degrade rather than throw.

| Query | Added by | Degrades to |
|---|---|---|
| `branchesForPath` (`Commit.file(path:)`) | PR #241 | the render tab's unjudged dated list |
| `branchSessions` (`Commit.history` + `messageBody`) | PR #297 | no session links on rows the compare did not cover |

The first was carried as a post-merge follow-up on PR #241 and rode its task's `next` tag until that task was closed. The second has the same shape. One task, not two.

## Definition of done

- Open the estate with a token and confirm each query returns data rather than erroring.
- `branchSessions`: session icons appear on Open rows whose branch has no PR. Most rows should resolve from the compare instead (exact, and not GraphQL), so the specific case to look for is a **recent branch with no PR and no survey row**, which is the only one the walk serves.
- `branchesForPath`: the fab's render tab classifies branches rather than showing the dated fallback.
- If either is rejected, record the error text here. The likely failure is a field name or a nesting the schema does not allow, which the message names precisely.

## Notes

Neither query is on a hot path. `branchSessions` runs once per repo per crawl (throttled ~12h); `branchesForPath` runs when the render tab opens. A rejection costs a feature, not a page.

## Progress log
- 2026-07-26 filed from the in-flight session, consolidating the residual live-confirm from PR #241 with the same check for PR #297
- 2026-07-30 the sibling task (`graphql-schema-contract-check-cpuvb5`) landed, so
  the shape half is now answered offline in `npm test`: both queries validate
  clean against GitHub's published schema. This task is unchanged in scope, but
  narrower in expectation. The failure it was written to catch, a field name or
  a nesting the schema does not allow, is ruled out for the documents as
  written, so what remains to look for is semantic: whether `messageBody` holds
  the trailer we assume, and whether permissions elide nodes we expect.
