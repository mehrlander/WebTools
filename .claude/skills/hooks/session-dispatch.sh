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
# Adopting this REPLACES a repo's own SessionStart block rather than joining it:
# keeping both runs every script twice at that repo's root. The audit below says
# so out loud, because neither that nor the reverse (a declaration with no
# matching filenames) is visible in the output otherwise.
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

# The OTHER budget, and the one nothing was watching. Past a threshold the
# harness writes a hook's whole stdout to a file and passes along a 2,000-byte
# preview. It is indistinguishable from success from in here: every script
# exited 0, so this reports a clean run while the session receives a fraction.
# Measured 2026-08-26: this dispatcher had been emitting 36,135 bytes and
# delivering about 5% of them since 2026-08-07, and nothing said so for
# nineteen days.
#
# The exact ceiling is not documented anywhere readable. The bound is: the
# smallest persisted output in the session archive is 29.4 KB, so it sits at or
# below that. 28,000 is under the bound and above what a healthy run emits.
#
# Scoped to THIS script's output, and that is correct rather than lucky: the cap
# applies per hook entry, not across the SessionStart event. Measured 2026-08-30
# on one session, this dispatcher's 28,670-character payload was cut while a
# separate 298-character SessionStart hook in the same session arrived whole.
# So a neighbouring hook cannot eat this budget, and this one cannot eat theirs.
#
# This does not shrink anything. A script's payload is its own business, and
# trimming here would cut a neighbour's output at an arbitrary byte. What it
# does is make the failure LOUD, which is the whole difference: the warning is
# printed FIRST, so it lands inside the 2,000 bytes that survive.
OUTPUT_BUDGET="${WEB_TOOLS_OUTPUT_BUDGET:-28000}"

# ── Told, not guessed (2026-08-30) ─────────────────────────────────────────
#
# The ceiling above is shared, and until now only this file knew it. A script
# that sizes its own payload, which today means inject-conventions.sh, had to
# carry a second constant guessing at the ceiling MINUS its siblings, and that
# guess could not see how many siblings there were. Measured 2026-08-30 across
# three checkouts: the guess reserved 1,000 bytes and the siblings emitted
# 1,223.
#
# So the ceiling is exported rather than kept, and the sibling count goes with
# it, since the count is the part a script cannot discover for itself. A script
# reading neither behaves exactly as before; both are hints, and this file stays
# the only enforcer.
export WEB_TOOLS_OUTPUT_BUDGET="$OUTPUT_BUDGET"

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
# a script run twice would double a note into the session's context. Repos are
# deduped alongside, so the audit below counts each checkout once.
scripts=(); owners=(); seen="|"
repolist=(); repohas=(); seenrepo="|"
for repo in "${cands[@]}"; do
  rp=$(cd "$repo" 2>/dev/null && pwd) || continue
  case "$seenrepo" in *"|$rp|"*) continue ;; esac
  seenrepo="$seenrepo$rp|"
  had=0
  for s in "$rp"/.claude/hooks/session-*.sh; do
    [ -f "$s" ] || continue
    dir=$(cd "$(dirname "$s")" 2>/dev/null && pwd) || continue
    real="$dir/$(basename "$s")"
    had=1
    case "$seen" in *"|$real|"*) continue ;; esac
    seen="$seen$real|"
    scripts+=("$real")
    owners+=("$rp")
  done
  repolist+=("$rp")
  repohas+=("$had")
done

# The audit, and the reason it exists: both states below look exactly like
# success from the outside. A repo still declaring SessionStart in its own
# .claude/settings.json is either invisible here (no session-*.sh to discover,
# so this runs nothing for it) or running its scripts twice (settings.json
# fires them when that repo is the root, and so does this). Measured
# 2026-07-31: home sat in the first state with four scripts and a
# core.hooksPath line, so a session rooted at /home/user left its pre-commit
# lint switched off and nothing said so.
#
# Keyed on the repo's own SessionStart declaration, not on an empty hooks
# folder. A repo whose only hook is PreToolUse (web-tools' build-on-commit.sh)
# is correct rather than misconfigured, and a check that nags it would be
# muted within a week.
notes=()
n=${#repolist[@]}
for ((r = 0; r < n; r++)); do
  cfg="${repolist[$r]}/.claude/settings.json"
  [ -f "$cfg" ] || continue
  grep -q '"SessionStart"' "$cfg" 2>/dev/null || continue
  name=$(basename "${repolist[$r]}")
  if [ "${repohas[$r]}" = "1" ]; then
    notes+=("[$name] .claude/settings.json still declares SessionStart, and session-*.sh files exist. Those run twice when $name is the project root. Drop the SessionStart block; this dispatcher owns them now.")
  else
    notes+=("[$name] .claude/settings.json declares SessionStart, but no .claude/hooks/session-*.sh exists, so none of $name's session work ran here. Give each entry its own session-*.sh file to make it discoverable from any project root.")
  fi
done

if [ "${#scripts[@]}" -eq 0 ]; then
  for note in "${notes[@]}"; do echo "$note"; done
  exit 0
fi

TMP=$(mktemp -d 2>/dev/null) || exit 0
trap 'rm -rf "$TMP"' EXIT

# Each script runs with its OWN checkout as both cwd and CLAUDE_PROJECT_DIR, so
# a script written for `.claude/settings.json` needs no change to run here.
#
# WEB_TOOLS_SESSION_SIBLINGS is per script: how many OTHERS are running, which
# is what a self-sizing script needs to reserve room for. Set inside the loop
# rather than exported once, so it stays true from each script's own point of
# view.
i=0
for s in "${scripts[@]}"; do
  repo="${owners[$i]}"
  {
    ( cd "$repo" && CLAUDE_PROJECT_DIR="$repo" \
        WEB_TOOLS_SESSION_SIBLINGS="$((${#scripts[@]} - 1))" \
        timeout "$BUDGET" bash "$s" ) \
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

# Assembled into a buffer rather than streamed, so the total can be measured
# before any of it is emitted. That ordering is the point: a warning about
# truncation is worthless after the truncated text.
ASSEMBLED=""
i=0
for s in "${scripts[@]}"; do
  rc=$(cat "$TMP/$i.rc" 2>/dev/null || echo 0)
  label="$(basename "$(dirname "$(dirname "$(dirname "$s")")")")/$(basename "$s")"
  if [ "$rc" = "124" ]; then
    # Worth saying out loud: a killed script produced nothing, and silence
    # would read as "nothing was due".
    ASSEMBLED+="[$label] exceeded ${BUDGET}s at session start and was stopped."$'\n'
  elif [ -s "$TMP/$i.out" ]; then
    [ "$multi" = "1" ] && ASSEMBLED+="[$label]"$'\n'
    ASSEMBLED+="$(cat "$TMP/$i.out")"$'\n'
  fi
  i=$((i+1))
done

# Last, so a misconfiguration reads as a footnote to the session's notes
# rather than burying them.
for note in "${notes[@]}"; do ASSEMBLED+="$note"$'\n'; done

# The one thing printed before anything else, and only when it is true. Naming
# the biggest contributor is what makes it actionable: "the output is too large"
# sends a reader looking, while "session-load-conventions.sh is 36 KB of it"
# does not.
if [ "${#ASSEMBLED}" -gt "$OUTPUT_BUDGET" ]; then
  biggest=""; biggest_n=0; i=0
  for s in "${scripts[@]}"; do
    n=$(wc -c <"$TMP/$i.out" 2>/dev/null || echo 0)
    if [ "$n" -gt "$biggest_n" ]; then
      biggest_n=$n
      biggest="$(basename "$(dirname "$(dirname "$(dirname "$s")")")")/$(basename "$s")"
    fi
    i=$((i+1))
  done
  echo "===== SESSION START: OUTPUT TRUNCATED ====="
  echo "These hooks produced ${#ASSEMBLED} bytes, over the ${OUTPUT_BUDGET}-byte budget."
  echo "The harness passes along only the first ~2,000 bytes of a payload this size and"
  echo "writes the rest to a file nothing reads, so MOST OF WHAT FOLLOWS DID NOT ARRIVE."
  [ -n "$biggest" ] && echo "Largest contributor: $biggest at ${biggest_n} bytes."
  echo "Whatever a session-start script was meant to tell you, assume it did not. Run"
  echo "/web-tools for the conventions, and shrink the script named above."
  echo
fi

printf '%s' "$ASSEMBLED"
exit 0
