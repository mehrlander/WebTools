#!/usr/bin/env bash
# SessionStart hook: run every checkout's own session scripts.
#
# The harness has no glob for session-start scripts. `npm test` discovers 70
# files from `tools/test/**/*.test.mjs`, and git discovers its hooks from a
# folder once `core.hooksPath` is set, but a Claude Code hook has to be named
# individually in `.claude/settings.json`, and that file is read only when the
# session's project root IS that repo. In a multi-repo session the root sits
# above the checkouts, so none of their session hooks fire, silently. Measured
# 2026-07-31: a session rooted at /home/user ran none of home's four.
#
# This supplies the missing glob, at the only layer that can. The plugin
# registers once, at user scope, for every session; discovery is then by
# filename, the same contract the test suite already uses:
#
#     .claude/hooks/session-*.sh   ->  runs at session start
#     anything else in that folder ->  ignored
#
# So web-tools' own session-start.sh is picked up and its build-on-commit.sh is
# not, exactly as tools/test/bootstrap.mjs stays out of `node --test`. A repo
# opts a script out by naming it something else. The NAME is the declaration,
# which is why this does not also require the executable bit: a lost mode bit
# should not turn into a script that silently stops running.
#
# Scripts run in PARALLEL under a per-script timeout, so total wall clock is
# the slowest script rather than the sum. The dispatcher does not police what a
# script costs, any more than `node --test` polices a slow test; it bounds it.
# Keeping session start cheap is the script's job, and the convention is: gate
# on file reads, and do expensive work only when the gate says it is due. All
# of home's probes already work that way (news-fetch's own comment: "two file
# reads and no network").
#
# The default budget is 120s because that is the internal timeout the longest
# existing script already sets for itself, so adopting the dispatcher does not
# change what any repo was already willing to wait for. Override with
# WEB_TOOLS_SESSION_BUDGET. A script that genuinely needs longer should
# background itself rather than hold the session open.
#
# Never fails into the session. Every path exits 0.
set -uo pipefail

# Drain stdin unconditionally: SessionStart delivers a JSON payload, and
# leaving it unread risks EPIPE upstream on the runs where we do nothing.
cat >/dev/null 2>&1

BUDGET="${WEB_TOOLS_SESSION_BUDGET:-120}"

# Handed to every dispatched script so a repo can call something the plugin
# ships (inject-conventions.sh) without knowing where the cache put it, or
# which commit it is pinned at. Resolved from this file rather than from
# CLAUDE_PLUGIN_ROOT, which is substituted into hook commands but does not
# resolve in a plain shell.
WEB_TOOLS_HOOKS=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd) || WEB_TOOLS_HOOKS=""
export WEB_TOOLS_HOOKS

ROOT=${CLAUDE_PROJECT_DIR:-$PWD}
[ -d "$ROOT" ] || exit 0

# Candidates: the project root, its children, and its siblings. Those are the
# three shapes a multi-repo session actually takes (root above the checkouts,
# root *is* the checkout, root beside its siblings). Bounded on purpose, and
# deliberately the same search session-record.sh already uses; no tree walk.
cands=("$ROOT")
for d in "$ROOT"/*/; do [ -d "$d" ] && cands+=("${d%/}"); done
PARENT=$(dirname "$ROOT")
case "$PARENT" in
  /|.|"$ROOT") ;;
  *) for d in "$PARENT"/*/; do [ -d "$d" ] && cands+=("${d%/}"); done ;;
esac

# Collect, deduped by resolved path: the searches above overlap by design, and
# a script run twice would double a note into the session's context.
scripts=(); owners=(); seen="|"
for repo in "${cands[@]}"; do
  for s in "$repo"/.claude/hooks/session-*.sh; do
    [ -f "$s" ] || continue
    dir=$(cd "$(dirname "$s")" 2>/dev/null && pwd) || continue
    real="$dir/$(basename "$s")"
    case "$seen" in *"|$real|"*) continue ;; esac
    seen="$seen$real|"
    scripts+=("$real")
    owners+=("$(cd "$repo" 2>/dev/null && pwd || echo "$repo")")
  done
done
[ "${#scripts[@]}" -gt 0 ] || exit 0

TMP=$(mktemp -d 2>/dev/null) || exit 0
trap 'rm -rf "$TMP"' EXIT

# Each script runs with its OWN checkout as both cwd and CLAUDE_PROJECT_DIR, so
# a script written for `.claude/settings.json` needs no change to run here.
i=0
for s in "${scripts[@]}"; do
  repo="${owners[$i]}"
  {
    ( cd "$repo" && CLAUDE_PROJECT_DIR="$repo" timeout "$BUDGET" bash "$s" ) \
      >"$TMP/$i.out" 2>/dev/null
    printf '%s' "$?" >"$TMP/$i.rc"
  } &
  i=$((i+1))
done
wait

# Label output by repo only when more than one contributed, so the common
# single-checkout session reads exactly as it does today.
multi=0
for o in "${owners[@]}"; do
  [ "$o" != "${owners[0]}" ] && multi=1 && break
done

i=0
for s in "${scripts[@]}"; do
  rc=$(cat "$TMP/$i.rc" 2>/dev/null || echo 0)
  label="$(basename "$(dirname "$(dirname "$(dirname "$s")")")")/$(basename "$s")"
  if [ "$rc" = "124" ]; then
    # Worth saying out loud: a killed script produced nothing, and silence
    # would read as "nothing was due".
    echo "[$label] exceeded ${BUDGET}s at session start and was stopped."
  elif [ -s "$TMP/$i.out" ]; then
    [ "$multi" = "1" ] && echo "[$label]"
    cat "$TMP/$i.out"
  fi
  i=$((i+1))
done
exit 0
