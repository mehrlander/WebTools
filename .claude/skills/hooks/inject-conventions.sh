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

# ── The budget, and why this file has one ──────────────────────────────────
#
# A SessionStart hook's stdout is not unbounded. Past a threshold the harness
# writes the whole thing to a file and passes along a 2,000-byte preview, which
# looks exactly like success: the script exits 0 and the session reports the
# hook ran. Measured 2026-08-26: home's own loader had been emitting 36,135
# bytes since 2026-08-07 and delivering 1,843 of them, about 5%. SURFACING.md
# never arrived at all, for nineteen days, in every session that had no
# web-tools checkout to @-import it from.
#
# The exact ceiling is not documented anywhere we can read. What is measured is
# a bound: the smallest persisted output in the session archive is 29.4 KB, so
# the ceiling sits at or below that. BUDGET is set under the bound with room for
# the other scripts the dispatcher runs alongside this one, since the limit
# applies to their combined output and not to this script's alone. Those others
# came to about 600 bytes when this was measured, so 26,000 leaves roughly 3 KB
# of margin under the bound.
#
# The number is set from the CHANNEL, not from what happens to fit today. If the
# payload later outgrows it the partial load below fires and says so, which is
# the check working rather than a number that needs raising.
BUDGET=${WEB_TOOLS_INJECT_BUDGET:-26000}

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd) || exit 0
DOCS="$HERE/../web-tools"

for f in CONVENTIONS SURFACING; do
  [ -f "$DOCS/$f.md" ] || exit 0
done

# SURFACING.md is two documents under one roof, and only one of them governs
# every reply. The primitives are how a session surfaces any turn's work: the
# links, the caption, the render rule, the closing state. The course is the
# guide-PR lifecycle, which the document itself calls "idle until you open a
# PR", and which is 11 KB of the 27.
#
# So the course does not ride session start. pr-subscribe-hint.sh delivers it
# at the moment a PR is created, which is the moment it becomes true, and the
# pointer below names it for the session that wants it sooner. That is a
# delivery decision and not a claim that the course matters less: it is the
# half whose trigger is knowable, so it is the half that can be sent on demand.
#
# Splitting on the heading couples this script to SURFACING.md's structure. The
# coupling is deliberate and gated: injected-docs.test.mjs asserts the section
# parses where this expects it, so a rename turns CI red instead of silently
# emptying the payload. Failing open (whole file) rather than closed is the
# other half of that: an over-budget payload is caught below, while a payload
# missing its primitives would be invisible.
COURSE_HEADING='## The surfacing course'
surfacing_head() {
  if grep -qF "$COURSE_HEADING" "$DOCS/SURFACING.md"; then
    sed "/^${COURSE_HEADING}\$/,\$d" "$DOCS/SURFACING.md"
  else
    cat "$DOCS/SURFACING.md"
  fi
}

emit() {
  # Say where this came from before saying it. Injected text arrives with no
  # provenance otherwise, and "which copy of the conventions is this" is a
  # question that has already cost a session once.
  echo "===== Portable working conventions, injected from the portable plugin ====="
  echo "Canonical source: mehrlander/web-tools docs/CONVENTIONS.md and docs/SURFACING.md."
  echo "This copy ships with the plugin and refreshes with 'claude plugin update'."
  echo "NOT INCLUDED: SURFACING.md's \"The surfacing course\" (the guide-PR lifecycle,"
  echo "wrap-up, and post-merge handoff). It is delivered when you create a pull"
  echo "request; read it sooner with /web-tools, or at docs/SURFACING.md."
  echo
  cat "$DOCS/CONVENTIONS.md"
  echo
  surfacing_head
  echo
}

BODY="$(emit)"

# Over budget is reported, never silently truncated, and never simply dropped.
# The harness would cut this mid-sentence with nothing to say so; a session that
# knows it received a partial payload can go read the rest, which is the whole
# difference between a degraded load and a load that lies about itself.
if [ "${#BODY}" -gt "$BUDGET" ]; then
  echo "===== Portable conventions: PARTIAL LOAD ====="
  echo "The injected payload is ${#BODY} bytes, over its ${BUDGET}-byte budget, and the"
  echo "harness truncates a large hook payload to a 2,000-byte preview without saying so."
  echo "Only CONVENTIONS.md is injected below. Run /web-tools to load the surfacing"
  echo "primitives before surfacing any work."
  echo
  cat "$DOCS/CONVENTIONS.md"
  exit 0
fi

printf '%s\n' "$BODY"
exit 0
