---
name: in-flight
description: "Check whether any branch, PR, or tracker task is already working on something before starting it, and report which claims have gone stale. Use when the user asks what is in flight, what is live, whether anything is already working on a topic or a set of files, whether a branch exists for this, what is safe to start, or whether the tracker board can be trusted. Also use when opening a session on a repo with many leftover branches, or when invoked as /in-flight."
---

# In flight

## Premise

Two sessions cannot see each other. What one leaves behind is a branch, a PR, and a tracker task, and only the first two are maintained by anything. A tracker task says `in-progress` until a human edits it, so a claim outlives its work by default: the branch merges, the session ends, and the board goes on asserting that work is underway. Left alone the claim layer degrades into noise, and a board nobody trusts is not consulted before starting work, which is the moment it existed for.

The branch estate has the opposite problem. It is large and almost entirely inert. Branches accumulate because merging does not delete them, so hundreds of refs sit in a repo where two or three carry live work. Scanning them by name, date, or file overlap produces mostly false positives: an old branch differs from the base branch mainly because the base branch moved.

One measurement cuts through both. A branch with no commits outside the base branch cannot be in flight, whatever its name, age, or diff suggests. That reduces a stale estate to a handful of candidates, and the handful is small enough to check honestly.

## Goal and output

A short report answering "is something already going on here?" It is meant to be read before work starts and to end in one of two conclusions: clear to proceed, or read these branches first.

Three findings, in descending reliability:

1. **Live branches.** Branches carrying commits the base branch lacks, with ahead-count, age, PR, authoring session, and claim.
2. **Claims.** Tracker tasks marked `in-progress`, each reconciled against the branch it names.
3. **Stale claims.** Claims whose branch has merged, vanished, or never shared history. These are the repair list.

## Process

**1. Run the script.** It is bundled with this skill, stdlib python, read-only, no network.

```
python3 "${CLAUDE_PLUGIN_ROOT}/in-flight/in-flight.py" <repo> [<repo> ...] --fetch
```

Pass every repo the session touches. Use `--fetch` unless refs were fetched in this session; a survey of stale refs is a survey of the past, and the report says how old they are.

**2. Scope it when the work is known.** If the coming work has a subject, name the paths:

```
--paths projects/budget-drs/ lib/gh-api.js
```

The report then ends in a collision verdict rather than a list. Only live branches are checked, so this stays precise: everything else is merged or on a dead history line and cannot conflict.

**3. Overlay open PRs.** The script has no network by design. Fetch open PRs with the GitHub MCP (`list_pull_requests`, state `open`), write them to a JSON file, and pass `--prs`:

```json
[{"number": 337, "title": "…", "head": "claude/branch-name",
  "draft": false, "repo": "owner/repo", "html_url": "https://…",
  "body": "…"}]
```

`repo` keeps a branch name common to two repos from picking up the other's PR. `body` is optional and used only to recover a session link for a branch whose commits carry no trailer. Skip this step for a quick local check; the branch findings stand without it.

**4. Report, then offer the repair.** Give the verdict first: what is live, and whether it touches the coming work. Then, if there are stale claims, offer to fix them. A stale claim is a task-file edit (`status`, `closed`, a progress-log line) committed straight to the base branch per `docs/TRACKER.md`, not branch work. Do not fix them silently: closing a task is a statement about someone's work, and the reason it landed unnoticed may matter.

## Key insights

- **The ahead-count is the load-bearing measurement.** `git rev-list --count <branch> --not <base>` returning zero is proof, not an estimate. In a merge-commit repo it retires most of the estate in one pass; measured on a 405-branch repo it left two candidates, and both were the two open PRs.

- **A branch with no merge-base is not live, however recent it looks.** A history rewrite orphans every branch cut before it. Those branches keep their dates and their names and can look like current work by every signal except the one that counts. Report them as unrelated, never as live.

- **The ahead-count alone overstates a squash-merge repo.** After a squash the branch stays ahead forever. The correction is the content signal: of the paths the branch touched, how many still differ from the base branch. Zero means the work landed by another route. Report both numbers and let them disagree in the open rather than blending them into a verdict.

- **Do not run content forensics over the whole estate.** Comparing a branch to the base branch is symmetric, so an old branch shows dozens of differing files that are the base branch's own forward drift. Measured on a real repo, a path-overlap scan flagged nearly every branch and meant nothing. Filter to live branches first; the overlap check is precise only once the candidate set is small.

- **A claim is a statement that decays.** It is worth as much as the last time something checked it. The reconciliation is the product here, not the listing: a board that says "3 in progress" when all three branches have merged is worse than one that says nothing, because it invites trust it has not earned.

- **Claims come from the base branch, not the checked-out files.** Tracker state lives on base by design, which is what makes it the one place every session checks. Reading the working tree reports a task closed on base as still in progress for every session on a feature branch, and every session is on a feature branch. Measured here: three tasks closed on main went on reading as in-progress until the source moved. `--worktree` forces the old behavior; the fallback is automatic when base carries no tracker at all.

- **Report an unfed claim layer as a finding.** Zero claims across a hundred-plus tasks does not mean nothing is happening. It means the mechanism is unused and says nothing about what is live. Say so plainly rather than reporting "nothing in progress."

- **Live but unclaimed and PR-less is the interesting row.** Work that was pushed, never delivered, and never written down. It is the case the branch estate hides and the one most likely to be a surprise.

- **The `Claude-Session:` commit trailer is the only session identity git carries.** Commits are SSH-signed, but the key is Anthropic's and constant: measured across 41 distinct sessions in one repo, the signing key never varied, so the signature authenticates the author and not the session. Author and committer are a fixed `Claude <noreply@anthropic.com>`. Nothing else in the object names a session.

- **Read the trailer from the branch's own commits, not a window back from the tip.** A fixed window runs past the branch point into the base branch and counts sessions that never touched this branch. Own commits give a true "worked across N sessions"; a merged branch, having none, falls back to the tip and yields one session rather than a count.

- **Prefer the trailer to the PR body.** Scraping the PR body only works while a PR is open, which is the smallest possible window: one repo measured 2 open PRs against 404 branches. The trailer is attached to the work, survives merge and close, and covered 96% of branches active in the last 30 days across two repos. The misses are honest ones: commits a human authored have no session, and GitHub-generated merge commits carry no trailer.

## Extending

The script takes `--json` for a machine-readable finding, which is the hook for anything that wants to render this rather than read it: a show-repo panel, a session-start check that speaks only when something is live, a periodic sweep over the stale-claim list. Nothing consumes it yet.

The repair step is deliberately manual. If closing stale claims becomes routine and the judgment stops mattering, that is the moment to promote it to a `--fix` flag, not before.

## Bundled

- `in-flight.py`: the survey. Read it when changing what counts as live, or when adding a signal; the classification comments carry the measurements behind each rule.
