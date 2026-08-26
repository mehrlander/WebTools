---
id: stage-link-onto-url-params-u9o7ny
title: Move StageLink.read onto the shared fragment-first param read
status: done
closed: 2026-08-02
session: claude/web-tools-project-tracker-reo5qo
depends-on: one-repo-address-parser-5gtv92
opened: 2026-07-25
---
# Move StageLink.read onto the shared fragment-first param read

PR #291 added `lib/url-params.js`, which states the fragment-first,
query-fallback rule once, and moved `chat-results` and `data-view` onto it.
`StageLink.read` (`lib/alpineComponents/stage.js`) predates it and implements
the same rule with its own code: it tests whether the hash carries the key,
and if not, synthesizes a hash string from the query and reparses.

The rule is the same. The behavior differs in exactly one case, measured by
running both against the same input:

| input | `StageLink.read` | `UrlParams.get` |
| --- | --- | --- |
| `#stage=o/r:a.md` + `?stage=o/r:b.md` | `a.md` | `a.md` |
| `?stage=o/r:b.md` only | `b.md` | `b.md` |
| `#stage=` (empty) + `?stage=o/r:b.md` | *no items* | `b.md` |

`StageLink` tests for the key's **presence**; `UrlParams` treats absent and
empty alike as a miss, so a bare `#stage=` cannot shadow a populated
`?stage=`. The helper's behavior is the better one (a truncated link that
kept the fragment key but lost its value falls back instead of silently
staging nothing), but it is a behavior change on a link format that exists in
the wild, so it deserves a decision rather than a quiet swap.

## Why this is not urgent

`StageLink.read` is correct for every link anyone actually mints. The value is
consistency: one implementation of the rule means one place to change it, and
the stage is the only remaining reader with its own.

## What makes it more than a swap

`StageLink.read` does not read one key: it reads `stage`, `prompts`, and
`mode` together and must keep them from the **same source**, so a fragment
`#stage=` is not paired with a stray `?prompts=` from a different link. Any
move has to preserve that grouping, which `UrlParams.get`'s per-key read does
not give on its own. Either add a grouped read to the helper, or read the
three keys through it and require them to agree on origin.

Pairs naturally with `one-repo-address-parser-5gtv92`: both are about the
stage and the toss routes sharing implementations rather than only conventions.

## Definition of done

- `StageLink.read` reads through `lib/url-params.js`, with the three keys still
  taken from one source.
- The empty-key case is decided deliberately and covered by a test either way.
- `tools/test/stage.test.mjs` still passes unchanged, or its changed
  expectations are the decision above and nothing else.

## Progress log
- 2026-07-25: filed at wrap-up of PR #291. The divergence was found by running
  both readers side by side while answering how the toss routes compare to the
  stage, not by reading the code.
- 2026-07-30 unblocked: `one-repo-address-parser-5gtv92` closed, so
  `StageLink.parseItem` now delegates and `lib/repo-address.js` is loaded
  wherever the stage runs. This task is unchanged in scope. It is about the
  other half of `StageLink.read`, the fragment-first param read, and its open
  decision (whether a bare `#stage=` should fall back to a populated `?stage=`)
  is still a decision, not a discovery.
- 2026-08-02: Done on `claude/web-tools-project-tracker-reo5qo` (lands via that branch's PR). UrlParams gained source(), StageLink.read picks its source through it, and the three keys still travel together. The open decision went the helper's way: an empty #stage= falls back to a populated ?stage=, covered by a test; the fragment still reaches parseLink raw, so encoded paths survive. The pre-build now boots url-params.js ahead of the components.
