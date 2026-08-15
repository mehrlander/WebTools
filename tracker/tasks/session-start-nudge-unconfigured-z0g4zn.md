---
id: session-start-nudge-unconfigured-z0g4zn
title: Session-start nudge for unconfigured or legacy-manifest repos
status: backlog
project: conventions
opened: 2026-07-15
session: claude/skills-portable-conventions-8x1lua
next: write a global SessionStart hook that checks repo state and injects a nudge; wire its install into the Claude Code web account setup script
---
# Session-start nudge for unconfigured or legacy-manifest repos

A global `SessionStart` hook (in `~/.claude/settings.json`, installed by the
Claude Code web account setup script) that, each session, checks the current repo
and injects a one-line nudge into context so Claude raises it early. The setup
script runs once at provisioning and cannot see the current repo mid-session; the
hook runs every session with `CLAUDE_PROJECT_DIR`, so the checking belongs in the
hook, not the setup script.

## Checks and outcomes

1. **Signed up** (repo `.claude/settings.json` enables `portable@web-tools`, or
   `CLAUDE.md` imports `CONVENTIONS.md`) -> silent.
2. **Opted out** (`.web-tools.json` has `"conventions": "optout"`) -> silent.
3. **Neither** -> nudge: "this repo is not set up for the conventions and has not
   opted out; offer to install the plugin or add an opt-out."
4. **Legacy manifest** (`.show-repo.json` present, `.web-tools.json` absent) ->
   nudge: "the web-tools manifest uses the old name; offer to rename it." A
   session has git, so it can do the `git mv` (and remove the old file), which the
   show-repo shell alone cannot (see task 0013). **This check's population is
   empty as of 2026-08-15**: the estate's config sweep found every configured
   repo on the new name, and the readers' legacy fallback was removed on its
   sunset date. Such a repo now reads as unconfigured and gets check 3, which
   nudges anyway, so check 4 is optional and buys only a more precise fix
   ("rename it" rather than "set one up"). Build it only if a repo on the old
   name actually turns up.

## Notes

- Fail-soft: a missing interpreter or a failed check degrades to no nudge, not a
  blocked start.
- The `"conventions": "optout"` field already exists in the `.web-tools.json`
  schema (PR #222) to receive check 2.
- Part of this lives outside the repo (the account setup script installs the
  hook), so it is a separate deliverable from the repo-side conventions.

## Progress log
- 2026-07-15: filed while wrapping PR #222. Designed in that session's discussion;
  not built. The opt-out contract landed in PR #222; the hook and setup-script
  install are the remaining work.
- 2026-08-15: check 4 annotated. The legacy-manifest population went to zero
  and its read fallback was removed (task show-repo-edit-web-tools-json-ygramz,
  closed the same day), so that check is now optional rather than required.
