#!/usr/bin/env bash
# Best-effort: point git at the committed hooks directory.
#
# `.git/hooks/` is local-only and absent on clone, so this repo's pre-commit
# guard (.githooks/pre-commit, which keeps dist/, the page catalogs, the docs
# registry and the tracker board in lockstep with their sources) needs one line
# per clone to activate.
#
# It is a session-*.sh file, not a .claude/settings.json entry, and that is the
# reason it works: a settings entry is read only when the session's project root
# IS this repo, while the `portable` plugin's session-dispatch.sh discovers this
# by filename from any root. Home carries the identical script for the identical
# reason (mehrlander/home .claude/hooks/session-git-config.sh, 2026-07-31).
#
# Nothing here depends on ordering against the sibling session scripts, which
# the dispatcher runs in parallel.
#
# Never fails the session: all errors are swallowed, always exits 0.
git -C "${CLAUDE_PROJECT_DIR:-.}" config core.hooksPath .githooks >/dev/null 2>&1 || true
exit 0
