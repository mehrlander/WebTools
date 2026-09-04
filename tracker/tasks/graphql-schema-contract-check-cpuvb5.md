---
id: graphql-schema-contract-check-cpuvb5
title: Check GraphQL query shape offline against GitHub's published schema
status: done
project: show-repo
opened: 2026-07-26
closed: 2026-07-30
session: claude/web-tools-tracker-review-bw48ga
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
- 2026-07-30 built. The unknown resolved in the good direction: `docs.github.com`
  is on the allowlist and the SDL is a plain 1.5 MB GET, no token. It returns an
  intermittent 503 (twice in about twenty tries, from both `curl` and node), so
  the generator retries; that is now in
  [environment/capabilities.md](../../docs/environment/capabilities.md), along
  with the general form of the move: an API that publishes a static schema turns
  "will this be accepted" into an offline typecheck.

  Shape as scoped. The three query documents are lifted into `GH.queries` in
  `lib/gh-fetch.js` and the methods send them by name.
  `npm run graphql-schema` fetches the published SDL, validates the documents
  against the **full** schema, then writes the slice they reach to
  `tools/graphql/github-schema.pruned.graphql`: 16 types, 1.7 KB, which settles
  the size question in favor of committing. Kept fields carry their whole
  argument list, so a missing required argument is still an error, and the
  generator refuses to write a prune the queries do not validate against.
  `tools/test/graphql-schema.test.mjs` runs the check in `npm test`, offline.

  Because the prune is derived from the queries, the check could have been
  vacuous, so three controls hold it honest: a misspelled field, a selection
  into a scalar, and a dropped required argument each have to fail. They do.

  The finding worth keeping: **all three queries validate clean against the
  published schema.** That is not the live confirmation
  (`live-confirm-graphql-queries-7maacy`, still open and unchanged), but the
  most likely failure it anticipates, a field name or a nesting the schema does
  not allow, is now ruled out for the shapes as written.

  Not wired into `artifacts-lockstep.test.mjs`: regeneration needs the network,
  so a `--check` there would fail offline. The drift guard is instead in the
  test, which requires every name in `GH.queries` to appear in the pruned
  schema's header.
