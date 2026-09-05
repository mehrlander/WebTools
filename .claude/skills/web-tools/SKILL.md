---
name: web-tools
description: >-
  Load the portable working conventions from mehrlander/web-tools
  (docs/CONVENTIONS.md plus docs/SURFACING.md) into the current session:
  the general-behavior hub plus the surfacing system (universal primitives
  and the guide-PR course they engage once you open a PR). Use
  in any repo when the user mentions
  "my conventions", "house rules", surfacing/per-file link format, "file
  card"/"file chip"/"send the file", show-pixels/screenshot-it, "hand over
  the artifact"/SendUserFile, "lead with the live view", branch anchor,
  wrap-up, or PR body shape, or when invoked explicitly
  as /web-tools.
---

# web-tools conventions loader

The user's cross-repo working conventions live in two canonical, repo-agnostic
files in the public repo `mehrlander/web-tools`, loaded together as one set:

- `docs/CONVENTIONS.md` — the **hub**: general behavior and scope (prose style,
  standing decisions, leave-it-nicer, keep-focus, the session/repository/workstream
  vocabulary).
- `docs/SURFACING.md` — the **surfacing system**: the primitives (explicit-markdown
  links, reference-is-a-link, the per-file `[new]/[main]/[diff]` list, show-pixels,
  the render forms, branch anchor, the caption) and the surfacing course (guide PR
  body as the durable account, wrap-up).

This skill fetches both fresh so any session in any repo follows the same
conventions without keeping a stale copy.

One frame rides beside them without a fetch: the estate's front door is the
**Web Tools app** (the show-repo shell), and
[`docs/APP.md`](https://github.com/mehrlander/web-tools/blob/main/docs/APP.md)
in the hub states its mission and the name split (Web Tools where a reader is
addressed; show-repo on files and routes). Read it when a task turns on what
the app is for or what it should be called.

## Fetch (primary path)

```bash
for f in CONVENTIONS SURFACING; do
  echo "===== docs/$f.md ====="
  curl -fsSL "https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/$f.md"
done
```

`raw.githubusercontent.com` is on the Claude Code web sandbox allowlist, and
the repo is public, so this needs no auth. Fetch both: surfacing lives in
`SURFACING.md`, so `CONVENTIONS.md` alone loses every surfacing rule.

## Report what this repo pins (do this every time)

Immediately after the fetch, before any editing, report the repo's frozen
paths. This is the step that makes pinned material legible **at edit time**;
everything else about the status convention (the declaration, the verify-suite
gate) fires after the work is already done, which is too late to stop a session
from editing an exhibit and reverting it.

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/markers/status.py" declared
```

Outside a skill invocation, resolve the script per the recipe in
[`markers/SKILL.md`](../markers/SKILL.md).

- **Nothing declared** (most repos): say nothing. Silence is the correct
  report, and a line of boilerplate every session trains the reader to skip it.
- **Anything declared:** name the frozen areas in one line, and say that a
  frozen artifact is re-anchored through its builder, never hand-edited. Then
  run `status.py is <path>` before touching anything near one.

The register is short by construction, so this costs a line. Read the reason it
exists as narrowly as it is meant: it tells you what **not** to edit. It says
nothing about where new material belongs.

## Check that this repo's guards are actually registered (do this every time)

A repo's `.claude/settings.json` is read only when the session's **project root
is the repo**. Where the root sits above it (the repo arriving as an additional
directory), that file is never read, so every hook it declares silently never
fires: no build-on-commit, no dependency install, and no `SessionStart` step
that installs git hooks. Nothing reports this, and the failure looks exactly
like everything working.

```bash
root=$(git rev-parse --show-toplevel) && key="${root//\//-}"
if grep -q '"hooks"' "$root/.claude/settings.json" 2>/dev/null \
   && [ ! -d "$HOME/.claude/projects/$key" ]; then
  echo "UNREGISTERED: $root declares hooks, but the session project root is elsewhere"
  ls "$HOME/.claude/projects/"
fi
```

When it fires, say so in one line and name the consequence, since the user
cannot see it. Then, for the rest of the session, run by hand whatever those
hooks were meant to do. Git hooks are the recoverable case and worth doing
immediately: `git config core.hooksPath .githooks` (or whatever path the repo
uses) restores a pre-commit guard for the life of the container.

This is why a check that must not be skipped belongs in a **test or verify
suite**, which runs wherever it is invoked, rather than in a hook. Plugins are
the dependable channel for the same reason: they install from user settings,
not project settings, so they are present either way.

## Apply

Apply the two files as one set, substituting the current repo into the URL
templates. `CONVENTIONS.md` is the general-behavior hub. `SURFACING.md` holds
the **surfacing primitives** (universal, no setup) and the **surfacing course**
(the guide-PR lifecycle, wrap-up, and handoff), which does nothing
until the repo opens a PR. Two per-repo settings carry defaults and rarely move:
pages render one way, the 🥏 toss, so there is no preview mechanism to
configure, and per-session refreshes are normally none (`CONVENTIONS.md`
states both, under Scope and precedence). Where the current repo's
own CLAUDE.md conflicts on a point, the current repo wins.

## Fallbacks

If `curl` to `raw.githubusercontent.com` is denied (restrictive network
policy), in order:

1. **GitHub MCP:** add `mehrlander/web-tools` to the session scope if needed
   (`mcp__claude-code-remote__list_repos`, then `add_repo`), then
   `mcp__github__get_file_contents` with owner `mehrlander`, repo
   `web-tools`, for each of `docs/CONVENTIONS.md` and `docs/SURFACING.md`.
2. **WebFetch** on the same raw URLs.

## The rest of the portable set: the manifest

This skill is just the loader. The full catalog of what travels from
`mehrlander/web-tools` to any repo, and how each piece is consumed, lives in one
surfaced file:

- **[`docs/PORTABLE.md`](https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/PORTABLE.md)** — the manifest. Fetch it the same way (raw URL) to see the menu.

Highlights it lists, fetchable directly by raw URL when relevant:

- `docs/headless-vendoring.md` — build with Tailwind / daisyUI / Alpine /
  Phosphor and screenshot or test them headless in a sandbox that blocks their
  CDNs. Self-contained; usable without any other web-tools machinery.
- `docs/environment/*.md` — dated notes on the Claude Code web sandbox (network
  allowlist, persistence, testing recipes). Sandbox-level, so they apply in any
  repo.

## Installing this skill into another repo

From a session in the target repo:

```bash
mkdir -p .claude/skills/web-tools
curl -fsSL https://raw.githubusercontent.com/mehrlander/web-tools/main/.claude/skills/web-tools/SKILL.md \
  -o .claude/skills/web-tools/SKILL.md
```

Then commit and push. Skills register at session start, so the skill becomes
invocable in sessions started from a branch that contains it (the session
that installs it can still read the file directly). Optionally, make adoption
always-on by adding one line to the target repo's own CLAUDE.md:

> Run the `web-tools` skill at the start of any session that will modify files.

`mehrlander/web-tools` holds the canonical copy of both this skill and the
conventions; the conventions are fetched live, so target repos only need to
re-run the installer when the *skill itself* changes. A repo can automate even
that with a fail-soft `SessionStart` hook that re-fetches this file each session
(see [`docs/PORTABLE.md`](https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/PORTABLE.md),
"Staying current: refresh at session start").

**Fetch is not invoke.** Installing this skill, or re-fetching it (by hand or via
that hook), only makes it *available*; it does not *run* it, and writing a skill
file emits nothing to context. So the conventions govern a session only when the
skill is actually invoked: by model judgement, by `/web-tools`, or by
the always-on CLAUDE.md line above. Pair any install path with that line, or the
conventions stay fetched-but-unused. To drop the dependency on the agent obeying
the line entirely, use the stronger `SessionStart` variant in `docs/PORTABLE.md`
("Stronger variant: inject the conventions") that fetches both `CONVENTIONS.md`
and `SURFACING.md` and emits them as `additionalContext`, so they're in context
every session without anyone having to invoke anything.
