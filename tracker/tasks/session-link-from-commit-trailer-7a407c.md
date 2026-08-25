---
id: session-link-from-commit-trailer-7a407c
title: Resolve a branch's session from the commit trailer, not the open PR body
status: done
project: show-repo
opened: 2026-07-26
closed: 2026-07-26
session: claude/active-work-branches-sd289p
---
# Resolve a branch's session from the commit trailer, not the open PR body

The estate's Activity view shows a session icon per branch, linking the Claude Code session that authored it. It is dark for most branches. The cause is structural, not flaky.

## Why

`lib/gh-fetch.js:175` scrapes the session URL from the **open PR body**:

```js
session: (String(p.body || '').match(/https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/) || [''])[0],
```

`estate.js:560` then gates the icon on `row.pr && row.pr.session`. So the icon can only ever light for a branch with an **open** PR, while the Open list also admits stranded branches that have none. Those rows are dark by construction.

The window that leaves is tiny: 2 open PRs against 404 branches in `mehrlander/home`, 3 against 291 in `mehrlander/web-tools`.

The `Claude-Session:` commit trailer is the better source. It is attached to the work, survives merge and close, and is per-commit, so a branch worked across sessions shows all of them. Measured coverage on branches active in the last 30 days:

| repo | active branches | resolvable from trailer |
|---|--:|--:|
| mehrlander/home | 126 | 121 |
| mehrlander/web-tools | 110 | 107 |

The misses are honest: a human-authored commit has no session, and a GitHub-generated merge commit carries no trailer.

Ruled out: deriving the session from the commit signature. Commits are SSH-signed, but the key is Anthropic's and constant (41 distinct sessions in one repo, one signing key), so the signature authenticates the author and not the session. Author and committer are a fixed `Claude <noreply@anthropic.com>`.

## Definition of done

- A branch's session resolves from its commits' `Claude-Session:` trailer, with the open PR body kept only as a fallback.
- The icon lights for branches with no PR, which is the common case in the Open list.
- Sessions are read from the branch's own commits (those the default branch lacks), not a fixed window back from the tip. A window runs past the branch point and attributes base-branch sessions to the branch; `in-flight.py` hit exactly this and reported five sessions for a one-commit branch.
- A branch worked across several sessions shows that, rather than only the newest.

## Approach

The working reference implementation is `sessions_for()` in `.claude/skills/in-flight/in-flight.py` (PR #297), with tests in `tools/test/in-flight.test.mjs` including a regression test for the count bleed. It reads local git; the estate needs the same logic over the API.

Open question, and the reason this is not a one-line change: where the commit messages come from. The activity cache (`lib/repo-activity-cache.js`) currently serializes `openPRs` only. Options, cheapest first:

1. Have the branch survey carry each branch's tip commit message, if it already reads commits.
2. One `GET /repos/{o}/{r}/commits?sha=<branch>&per_page=5` per Open-list branch, cached alongside the existing activity signals.
3. A GraphQL batch over the Open list, one call for all branches.

Option 3 is likely right given the estate view already batches, but confirm what the survey fetches before choosing. Whichever is picked, the cache schema in `repo-activity-cache.js` needs a per-branch session field and a version bump.

## Progress log
- 2026-07-26 filed from the in-flight session (PR #297), which built and measured the trailer-based resolution locally
- 2026-07-26 done on `claude/active-work-branches-sd289p`; lands via PR #297. `branchSessions()` added to `lib/gh-fetch.js` (one GraphQL call per repo, fail-soft), carried through the crawl and the activity cache's change-detection hash, and the icon regated on `row.session` with the PR body as fallback. 12 tests in `tools/test/estate-branch-sessions.test.mjs`; full suite 444/444. Verified headless in the Activity view: the no-PR row carries the icon, genuinely session-less rows stay dark.
- 2026-07-26 open caveat: the GraphQL shape could not be exercised from the sandbox (its proxy serves only a pinned set of GraphQL operations), so the call is fail-soft by design. Confirm in a real browser that the Open view shows sessions on PR-less rows after the next crawl; if the query is rejected the links are simply absent and nothing else breaks.
