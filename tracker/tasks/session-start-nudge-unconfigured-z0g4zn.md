---
id: session-start-nudge-unconfigured-z0g4zn
title: Session-start nudge for repos that never opted in
status: backlog
project: conventions
opened: 2026-07-15
size: S
---
# Session-start nudge for repos that never opted in

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

A fourth check, for a repo still on the legacy `.show-repo.json` name, was
carried here and is dropped. No repo has used that name since 2026-08-15, the
shell's read fallback went with the sunset, and `estate.js`'s account-wide
`liveScanConfigs` still probes both names, so such a repo would surface on its
own. Check 3 nudges it anyway.

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
- 2026-08-15: check 4 annotated. No repo carries the legacy manifest name any
  more, and its read fallback was removed (task
  show-repo-edit-web-tools-json-ygramz, closed the same day), so that check is
  now optional rather than required. The wording here previously said the
  check's "population" went to zero, which borrowed a registry term for
  something it does not name.
- 2026-09-04: Check 4 (legacy manifest) deleted rather than kept optional. It had
  already been annotated down to "build it only if a repo on the old name turns
  up", and `liveScanConfigs` is the detector that would say so, which leaves the
  check nothing to add. The remaining work is unchanged: a global `SessionStart`
  hook running checks 1 to 3, plus its install in the account setup script.
