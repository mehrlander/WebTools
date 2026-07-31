#!/usr/bin/env bash
# Emit the portable working conventions into session context, from disk.
#
# This is the injection variant of the conventions loader (PORTABLE.md,
# "inject the conventions, don't just fetch them"), with the fetch removed. The
# hub's own copies of CONVENTIONS.md and SURFACING.md ride inside the plugin,
# beside the loader skill that names them, so injection is two file reads with
# no network, no `curl`, no `jq`, and no interpreter to be missing. The warning
# that variant carries, about degrading silently to no-injection on a host
# lacking jq and python3, does not apply here: there is nothing left to lack.
#
# Freshness rides the plugin, which is the mechanism that already repeats.
# `claude plugin update portable@web-tools` pulls the tip of main into the
# container, and these files come with it. A fetch-per-session bought nothing
# that an update does not, and cost a network round trip at every start.
#
# NOT registered as a hook itself, because injection is a per-repo decision:
# it puts the full conventions into every session unconditionally, which is the
# right default for a repo whose CLAUDE.md deliberately does not restate them,
# and the wrong one for a repo that just wants the skills. A repo opts in
# through the dispatcher, by dropping one line in its own hooks folder:
#
#     # .claude/hooks/session-conventions.sh
#     exec bash "$WEB_TOOLS_HOOKS/inject-conventions.sh"
#
# $WEB_TOOLS_HOOKS is exported by session-dispatch.sh, so the repo never has to
# know where the plugin cache put this file, or which commit it is pinned at.
#
# Plain stdout on purpose. A SessionStart hook's stdout lands in session
# context, and the dispatcher concatenates several scripts' output, so emitting
# the additionalContext JSON envelope here would be spliced into neighbouring
# plain text and parse as neither.
#
# Never fails into the session. Every path exits 0.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd) || exit 0
DOCS="$HERE/../web-tools"

for f in CONVENTIONS SURFACING; do
  [ -f "$DOCS/$f.md" ] || exit 0
done

# Say where this came from before saying it. Injected text arrives with no
# provenance otherwise, and "which copy of the conventions is this" is a
# question that has already cost a session once.
echo "===== Portable working conventions, injected from the portable plugin ====="
echo "Canonical source: mehrlander/web-tools docs/CONVENTIONS.md and docs/SURFACING.md."
echo "This copy ships with the plugin and refreshes with 'claude plugin update'."
echo

for f in CONVENTIONS SURFACING; do
  cat "$DOCS/$f.md"
  echo
done
exit 0
