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
# came to about 600 bytes when this was measured, so 27,000 leaves roughly 2 KB
# of margin under the bound.
#
# The number is set from the CHANNEL, not from what happens to fit today. If the
# payload later outgrows it the partial load below fires and says so, which is
# the check working rather than a number that needs raising.
#
# Raised from 26,000 on 2026-08-27, before it had ever fired. The docs-editing
# sessions shrank SURFACING.md by 207 words and grew its primitives section by
# 254, which took the payload to 63 bytes under the old number. A budget that
# close is a tripwire rather than a budget, and the fallback here is coarse:
# over by one byte drops every primitive. Headroom is worth more than precision
# on a number whose real ceiling is undocumented anyway.
#
# ── Derived from the ceiling, not duplicating it (2026-08-30) ──────────────
#
# It was a flat 27,000, and a flat number cannot be right. The limit applies to
# the dispatcher's COMBINED output, so the room left for this script is the
# ceiling minus whatever its siblings emit, and 27,000 was one guess at that
# subtraction frozen into a second constant. Two numbers encoding one fact drift
# apart: the dispatcher's ceiling could move and this would not follow, and a
# session that opened one more checkout would add session scripts this had no
# way to see.
#
# Measured 2026-08-30 at this repo's own root, three checkouts and seven session
# scripts: the siblings emitted 1,223 bytes against the 1,000 the flat number
# implicitly reserved. Rung 1 fitted anyway, by 347 bytes, because the ceiling
# is itself conservative against the measured bound. That is luck, not headroom.
#
# So the reserve is now derived, and both its parts come from that measurement
# rather than from what happens to fit. The shape it found is lopsided: of six
# siblings, four emitted nothing at all, one emitted 69 bytes and one emitted
# 1,061 (home's memory manifest). So the reserve is a BASE covering the one
# chatty script, plus a small per-sibling term covering the label line the
# dispatcher prefixes to each script that speaks. Scaling the whole reserve per
# sibling would have overstated it by half, and dropping a rung on an estimate
# that wrong is worse than the guess it replaced.
#
# Add a checkout and the reserve grows by its label lines, which tightens this
# script rather than letting the total cross the ceiling with nothing said.
#
# It is still an estimate, and a sibling that suddenly prints 5 KB still
# overruns. What changes is who notices: the dispatcher's warning fires on the
# total, and this script's own rung is chosen against the room actually left.
CEILING=${WEB_TOOLS_OUTPUT_BUDGET:-28000}
SIBLINGS=${WEB_TOOLS_SESSION_SIBLINGS:-0}
# One chatty script (1,061 measured) with a little over it.
BASE_RESERVE=${WEB_TOOLS_INJECT_BASE_RESERVE:-1100}
# The dispatcher's `[repo/script.sh]` label line, about 32 bytes.
PER_SIBLING=${WEB_TOOLS_INJECT_PER_SIBLING:-40}
case "$SIBLINGS" in ''|*[!0-9]*) SIBLINGS=0 ;; esac
BUDGET=${WEB_TOOLS_INJECT_BUDGET:-$((CEILING - BASE_RESERVE - SIBLINGS * PER_SIBLING))}
[ "$BUDGET" -gt 0 ] 2>/dev/null || BUDGET=1

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd) || exit 0
# Resolved rather than joined, because the recovery block prints it for a reader
# to act on and "$HERE/../web-tools" is a path a person has to unpick.
DOCS=$(cd "$HERE/../web-tools" 2>/dev/null && pwd) || DOCS="$HERE/../web-tools"

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
# The primitives section alone, from its heading to the course's.
primitives_only() {
  sed -n "/^## Surfacing primitives\$/,/^${COURSE_HEADING}\$/p" "$DOCS/SURFACING.md" \
    | sed "/^${COURSE_HEADING}\$/d"
}

surfacing_head() {
  if grep -qF "$COURSE_HEADING" "$DOCS/SURFACING.md"; then
    sed "/^${COURSE_HEADING}\$/,\$d" "$DOCS/SURFACING.md"
  else
    cat "$DOCS/SURFACING.md"
  fi
}

# Three rungs, not two, because the drop from "everything" to "CONVENTIONS.md
# alone" is a cliff: 127 bytes over the budget cost every surfacing primitive
# when this first fired for real on 2026-08-27. What goes first is what a
# session can most afford to lose.
#
# SURFACING.md's front matter is its opening: what the document is and where
# its canonical copy lives, under 1 KB, and nothing in it is a rule (the two
# per-repo settings lived there until 2026-09-05 and are CONVENTIONS.md's now,
# under Scope and precedence, so they ride the rung that never drops). The
# primitives are the rules themselves. So the head goes before they do, and
# CONVENTIONS.md, the hub, goes last of all.
# ── The recovery block, and why it is printed first ────────────────────────
#
# The budget below can be respected and the payload still lost. The ceiling is
# the harness's, not this script's: past it the whole stdout goes to a file and
# the session gets a ~2 KB preview. Measured 2026-08-30 on a live session, the
# preview is 1,997 bytes and it ends partway into CONVENTIONS.md's opening.
#
# So the first ~1,500 bytes of this script's output are the only part guaranteed
# to reach a reader, and until now they carried provenance. The dispatcher's
# warning does arrive and says "assume it did not", which states the problem and
# not the remedy: it names no file, no path, and no ordering against the work the
# session was actually asked to do.
#
# This block is the remedy, and it is printed UNCONDITIONALLY because the
# condition is unknowable from in here. Truncation happens downstream of this
# script, after it has exited 0. What the session can see, and this script
# cannot, is the wrapper around its own context, so the test is handed to the
# only party able to run it.
#
# Absolute paths, because the recovery has to work with no network and no
# GitHub token: these files ship inside the plugin and are already on disk. That
# is also why they beat `/web-tools`, which fetches from main and can fail
# exactly when things are already going wrong.
#
# Kept near 350 bytes, and the size is load-bearing: at 480 it cost a rung, which
# would have traded SURFACING.md's opening sections away in every session to buy
# a message that matters in the few that are cut. One directory rather than two
# paths is most of the saving.
recovery() {
  echo "RECOVERY: if the text above says \"Output too large\" or \"OUTPUT TRUNCATED\","
  echo "this payload was CUT and little of what follows reached you. Read"
  echo "CONVENTIONS.md and SURFACING.md from $DOCS"
  echo "before acting on the request in hand; both are on disk, no network needed."
  echo "Otherwise ignore this: the same text is below."
  echo
}

emit() {
  recovery
  # Say where this came from before saying it. Injected text arrives with no
  # provenance otherwise, and "which copy of the conventions is this" is a
  # question that has already cost a session once.
  echo "===== Portable working conventions, injected from the portable plugin ====="
  echo "Canonical source: mehrlander/web-tools docs/CONVENTIONS.md and docs/SURFACING.md."
  echo "This copy ships with the plugin and refreshes with 'claude plugin update'."
  echo "NOT INCLUDED: SURFACING.md's \"The surfacing course\" (the guide-PR lifecycle"
  echo "and wrap-up). It is delivered when you create a pull"
  echo "request; read it sooner with /web-tools, or at docs/SURFACING.md."
  if [ "${1:-}" = "skip_head" ]; then
    echo "ALSO NOT INCLUDED, to fit the channel: SURFACING.md's opening (what the"
    echo "document is and where it lives). Every primitive is below."
  fi
  echo
  cat "$DOCS/CONVENTIONS.md"
  echo
  if [ "${1:-}" = "skip_head" ]; then primitives_only; else surfacing_head; fi
  echo
}

# ── The receipt ────────────────────────────────────────────────────────────
#
# This script is the only party that knows what it supplied. The payload is two
# documents concatenated and names neither, so a later reader can only
# pattern-match content back to a path, and the rungs below mean the answer is
# not even fixed: what arrives depends on which one fired.
#
# So each document gets one `[startup-context]` line carrying its path, a
# content hash, its byte count, WHICH RUNG DELIVERED IT, and how many bytes of
# it actually went out. sessions/tools/record.py reads them out of the
# transcript's hook_success entry into the record's `startup_context`, and the
# Map view's Docs tab shows presence beside access rather than the hard-coded
# word "injected".
#
# The `delivered` field is the part that earns this. The 2026-08-26 failure was
# a payload silently cut to 5%, invisible because the script exited 0 and the
# hook reported success. A receipt that states the rung turns the same silence
# into a value that changed.
#
# `bytes` and `sent` are two different facts and were one field until
# 2026-08-30. `bytes` is the document on disk, which is what a reader wants when
# asking how big SURFACING.md is; `sent` is what this script put on the channel,
# which at rung 2 is the primitives section alone and at the partial rung is
# nothing. Reporting only the first made every receipt claim the whole file had
# arrived, so the one number that could have contradicted `delivered` agreed
# with it instead. The Map view's Injection tab reads `sent` to draw what
# actually landed against what the container holds.
#
# Budgeted like the rest of the payload, and RESERVED FIRST. A receipt is what
# reports a dropped payload, so it must be the last thing dropped; that argues
# for reserving room, not for exempting it. Exempting it is just an overrun
# nobody counted, which is how this first shipped and what CI caught.
sha_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    printf ''
  fi
}

CONV_SHA=$(sha_of "$DOCS/CONVENTIONS.md")
SURF_SHA=$(sha_of "$DOCS/SURFACING.md")
CONV_BYTES=$(wc -c <"$DOCS/CONVENTIONS.md" | tr -d ' ')
SURF_BYTES=$(wc -c <"$DOCS/SURFACING.md" | tr -d ' ')

receipt() {
  printf '[startup-context] {"path":"web-tools/docs/%s.md","via":"session_hook","source":"portable-plugin:docs/%s.md","sha256":"%s","bytes":%s,"sent":%s,"delivered":"%s","basis":"receipt"}\n' \
    "$1" "$1" "$2" "$3" "$4" "$5"
}

# CONVENTIONS.md rides every rung whole, so its `sent` is its size. SURFACING.md
# never does: the course is withheld by design even at rung 1, so its best case
# is stated as what it is, and `sent` says how much of the file that was.
receipts() {
  receipt CONVENTIONS "$CONV_SHA" "$CONV_BYTES" "$CONV_BYTES" full
  receipt SURFACING "$SURF_SHA" "$SURF_BYTES" "${2:-0}" "$1"
}

# BYTES, NOT CHARACTERS. `${#BODY}` counts characters in a UTF-8 locale and
# bytes in C, and the channel this budget describes is bytes. The two differ by
# about 200 here, since these documents carry ⭐ 🥏 📦 and their friends, and
# that gap is enough to choose a rung that then overflows. Measured 2026-08-27
# from one commit: the sandbox (LC_ALL=C) chose the primitives rung at 26,745
# bytes and the GitHub runner (C.UTF-8) chose the wider one at 27,639, over the
# budget, because it was measuring the same payload in the smaller unit.
bytes_of() { printf '%s' "$1" | wc -c | tr -d ' '; }

# The receipt is part of the payload, so it is budgeted like the rest. Reserving
# it FIRST rather than exempting it is the whole point: a receipt is the thing
# that reports a dropped payload, so it must be the last thing dropped, and a
# receipt sitting outside the accounting is simply an overrun nobody counted.
# Sized on the longest rung label, so the reservation is an upper bound whichever
# rung ends up firing.
# Sized on the longest rung label AND on the file's own size as the widest `sent`
# value, so the reservation is an upper bound whichever rung fires.
RESERVED=$(bytes_of "$(receipts primitives_only "$SURF_BYTES")")
BUDGET=$((BUDGET - RESERVED))

# Rung 1: everything but the course.
BODY="$(emit)"

# Rung 2: drop SURFACING.md's front matter, keeping every rule.
if [ "$(bytes_of "$BODY")" -gt "$BUDGET" ]; then
  BODY="$(emit skip_head)"
  DROPPED_HEAD=1
fi

# Over budget is reported, never silently truncated, and never simply dropped.
# The harness would cut this mid-sentence with nothing to say so; a session that
# knows it received a partial payload can go read the rest, which is the whole
# difference between a degraded load and a load that lies about itself.
if [ "$(bytes_of "$BODY")" -gt "$BUDGET" ]; then
  recovery
  echo "===== Portable conventions: PARTIAL LOAD ====="
  echo "The injected payload is $(bytes_of "$BODY") bytes, over its ${BUDGET}-byte budget, and the"
  echo "harness truncates a large hook payload to a 2,000-byte preview without saying so."
  echo "Only CONVENTIONS.md is injected below. Run /web-tools to load the surfacing"
  echo "primitives before surfacing any work."
  echo
  cat "$DOCS/CONVENTIONS.md"
  receipts omitted 0
  exit 0
fi

printf '%s\n' "$BODY"
if [ "${DROPPED_HEAD:-}" = "1" ]; then
  receipts primitives_only "$(bytes_of "$(primitives_only)")"
else
  receipts without_course "$(bytes_of "$(surfacing_head)")"
fi
exit 0
