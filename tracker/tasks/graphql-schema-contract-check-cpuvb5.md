---
id: graphql-schema-contract-check-cpuvb5
title: Check GraphQL query shape offline against GitHub's published schema
status: backlog
project: show-repo
opened: 2026-07-26
---
# Check GraphQL query shape offline against GitHub's published schema

The sandbox cannot POST GraphQL, so queries in `lib/gh-fetch.js` ship unverified and carry a live-confirm follow-up (`live-confirm-graphql-queries-7maacy`). But the question those queries actually raise is a typecheck, not a data question, and a typecheck needs no network at all.

## Why

GitHub publishes its GraphQL schema as a static SDL document. It is the same for every user of the API, changes on GitHub's release cadence rather than per request, and needs no token. Validating a query document against it is offline, deterministic, and catches the failure that actually happens in this code: a wrong field name, a wrong nesting, a missing argument.

That converts the standing habit (ship unverified, file a task, wait for a browser) into an edit-time check. It does not remove the live-confirm task; the two answer different questions.

| Check | Answers | Needs |
|---|---|---|
| Schema validation (this task) | will the query be accepted | a static document |
| Live confirm (`live-confirm-graphql-queries-7maacy`) | does it return what we think, under our permissions | a browser with a token |

## Scope

- Lift the query documents out of `lib/gh-fetch.js` into named exports so a checker can read them without executing anything.
- Obtain the schema. GitHub serves it as a static file from `docs.github.com`. **The one unknown is whether the sandbox proxy permits that GET.** A plain HTTPS GET of a public document is the easiest thing for a proxy to allow, but it has not been probed. Five minutes settles it.
- Validate with `graphql`'s `parse` + `validate`. Offline once the schema is in hand.
- Wire into the test suite so it runs with everything else.

## Size discipline

The full schema is a couple of megabytes, which does not belong in a commit. Two acceptable shapes, in the repo's usual idiom: fetch on demand and gitignore the copy, or commit a pruned schema covering only the types the queries touch (roughly fifteen) and regenerate it from the full document. Committing the whole thing is the option to avoid.

## Definition of done

A check that fails when a query names a field or nesting the schema does not have, running offline in the normal suite.

## Limits

Catches shape, not semantics. It cannot tell whether `messageBody` contains what we assume, how pagination behaves, or whether permissions silently elide nodes. Those stay with the live-confirm task.

## Fallback if the proxy blocks the schema GET

The schema arrives by another route: a pruned copy committed once, or fetched by the browser and stored in web-tools-private, which is the same write path the activity cache already uses.

## Progress log
- 2026-07-26 filed from the in-flight session, after `branchSessions` shipped unverifiable for the second time in the repo's history
