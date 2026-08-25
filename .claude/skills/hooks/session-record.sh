#!/usr/bin/env bash
# Stop hook: record this session into whichever checkout declares a sessions store.
#
# Why this ships with the plugin rather than being installed by hand. The
# recorder's own installer writes ~/.claude/settings.json, which is provisioned
# fresh for every container, so a hand-installed hook records exactly one
# session: the one that installed it. Measured 2026-07-30, one record on file
# after a day in which at least five sessions ran. A plugin hook arrives with
# the marketplace install instead, which is the only channel that repeats.
# See docs/environment/extending.md.
#
# The store is found declaratively, not by name: a checkout whose
# .web-tools.json declares "sessions" owns the record tree, and its
# <store>/tools/on-stop.sh does the recording and publishing. This hook holds no
# knowledge of the record schema, so the store can change its format without a
# plugin release.
#
# Most sessions have no store checked out. That case costs one grep and exits
# silently, which is the behavior to preserve: a logger that cannot find its
# store is not an error worth reporting into someone's session.
#
# Never fails into the session. Every path exits 0.
set -uo pipefail

# Drain stdin first, unconditionally. The payload carries the transcript path,
# and leaving it unread risks EPIPE upstream on the turn we decide to do nothing.
PAYLOAD=$(cat)

# Invoke through `bash` rather than executing directly: a plugin is delivered by
# copy into the cache, and the executable bit is not something to depend on.
delegate() {
  [ -f "$1/tools/on-stop.sh" ] || return 1
  printf '%s' "$PAYLOAD" | bash "$1/tools/on-stop.sh" >/dev/null 2>&1
  return 0
}

# An explicit store wins outright, for a layout this search would not guess.
if [ -n "${SESSIONS_STORE:-}" ]; then
  delegate "$SESSIONS_STORE"
  exit 0
fi

ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
[ -d "$ROOT" ] || exit 0

# Candidates: the project root, its children, and its siblings. Those are the
# three shapes a multi-repo session actually takes (root above the checkouts,
# root *is* the store, root is one checkout beside the store). Bounded on
# purpose; this runs on every turn, so no walk of the tree.
cands=("$ROOT")
for d in "$ROOT"/*/; do [ -d "$d" ] && cands+=("${d%/}"); done
PARENT=$(dirname "$ROOT")
case "$PARENT" in
  /|.|"$ROOT") ;;
  *) for d in "$PARENT"/*/; do [ -d "$d" ] && cands+=("${d%/}"); done ;;
esac

mans=()
for repo in "${cands[@]}"; do
  [ -f "$repo/.web-tools.json" ] && mans+=("$repo/.web-tools.json")
done
[ "${#mans[@]}" -gt 0 ] || exit 0

# Cheap gate before paying for a Python start. Almost every session stops here.
grep -l '"sessions"' "${mans[@]}" >/dev/null 2>&1 || exit 0

STORE=$(python3 - "${mans[@]}" <<'PY' 2>/dev/null
import json, os, sys

for manifest in sys.argv[1:]:
    try:
        with open(manifest, encoding="utf-8") as fh:
            declared = json.load(fh).get("sessions")
    except Exception:
        continue
    if not isinstance(declared, str) or not declared:
        continue
    store = os.path.join(os.path.dirname(manifest), declared)
    # Only a store that carries the runner counts. A checkout can declare the
    # field on a branch that predates the tooling, and that is not a failure.
    if os.path.isfile(os.path.join(store, "tools", "on-stop.sh")):
        print(store)
        break
PY
)

[ -n "$STORE" ] && delegate "$STORE"
exit 0
