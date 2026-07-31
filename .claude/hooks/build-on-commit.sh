#!/usr/bin/env bash
# PreToolUse(Bash) hook — keep every *deterministic* derived artifact in lockstep
# with its source, in the same commit that changes the source:
#
#   lib/ changed            -> npm run build:lib     -> stage dist/web-tools.js
#   console/ changed        -> npm run build:console -> stage console/suite.js
#   pages/**/*.html changed -> npm run pages-index   -> stage pages/README.md + pages/index.html
#
# Both generators are deterministic, so a commit that didn't really change the
# source produces identical bytes (a no-op `git add`). Thumbnails
# (pages/thumbs/*.png) are deliberately NOT regenerated here — screenshots are
# slow and not byte-deterministic, so auto-regen would write binary churn on
# every commit. Instead the hook *warns* when a page's HTML changes without its
# thumbnail, and the refresh happens once per session at wrap-up
# (see CLAUDE.md "Wrapping up"). Non-blocking: failures warn but never stop the
# commit.
set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
[ -n "$root" ] || exit 0

# The Bash tool's command arrives as JSON on stdin: { tool_input: { command } }.
cmd="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write((JSON.parse(s).tool_input||{}).command||"")}catch{process.stdout.write("")}})' 2>/dev/null || true)"

case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "$root" || exit 0

# --- leg 1: lib/ -> dist/web-tools.js (the pre-build) -------------------------
if git status --porcelain -- lib/ | grep -q .; then
  if npm run build:lib --silent >/dev/null 2>&1; then
    git add dist/web-tools.js 2>/dev/null || true
  else
    echo "build hook: 'npm run build:lib' failed — committing without refreshing dist/web-tools.js" >&2
  fi
fi

# --- leg 1b: console/ -> console/suite.js (base + mods, one paste) ------------
if git status --porcelain -- console/base.js console/mods/ | grep -q .; then
  if npm run build:console --silent >/dev/null 2>&1; then
    git add console/suite.js 2>/dev/null || true
  else
    echo "build hook: 'npm run build:console' failed — committing without refreshing console/suite.js" >&2
  fi
fi

# --- leg 1c: docs/ -> the plugin's vendored conventions -----------------------
# The plugin ships its own copies of the two conventions docs so injection is a
# file read rather than a fetch (see .claude/skills/hooks/inject-conventions.sh).
# A copy is a derived artifact like any other, so it rides the same commit as
# its source rather than drifting until someone notices.
if git status --porcelain -- docs/CONVENTIONS.md docs/SURFACING.md | grep -q .; then
  if cp docs/CONVENTIONS.md docs/SURFACING.md .claude/skills/web-tools/ 2>/dev/null; then
    git add .claude/skills/web-tools/CONVENTIONS.md .claude/skills/web-tools/SURFACING.md 2>/dev/null || true
  else
    echo "build hook: could not refresh the plugin's vendored conventions — committing without them" >&2
  fi
fi

# --- leg 2: pages/**/*.html -> the two catalogs -------------------------------
# Any pending .html change under pages/ (add/edit/delete/retitle) regenerates
# pages/README.md + pages/index.html so the catalogs ride in the same commit.
changed_pages="$(git status --porcelain -- pages/ | grep '\.html' | sed 's/^...//; s/.* -> //' || true)"
if [ -n "$changed_pages" ]; then
  if npm run pages-index --silent >/dev/null 2>&1; then
    git add pages/README.md pages/index.html 2>/dev/null || true
  else
    echo "build hook: 'npm run pages-index' failed — committing without refreshing the pages catalogs" >&2
  fi

  # --- leg 3: thumbnail nudge (warn only, never regenerate) -------------------
  while IFS= read -r p; do
    case "$p" in pages/index.html|pages/thumbs/*) continue ;; esac
    thumb="pages/thumbs/${p#pages/}"; thumb="${thumb%.html}.png"
    if [ -e "$root/$p" ] && ! git status --porcelain -- "$thumb" | grep -q .; then
      echo "build hook: $p changed but $thumb didn't — refresh at wrap-up: npm run pages-shots -- ${p#pages/}" >&2
    fi
  done <<< "$changed_pages"
fi

# --- leg 4: tracker/tasks/ -> tracker/board.md --------------------------------
if git status --porcelain -- tracker/tasks/ | grep -q .; then
  if npm run tracker-board --silent >/dev/null 2>&1; then
    git add tracker/board.md 2>/dev/null || true
  else
    echo "build hook: 'npm run tracker-board' failed — committing without refreshing tracker/board.md" >&2
  fi
fi

# --- leg 5: SUNSET markers now due (warn only) --------------------------------
# Back-compat shims are tagged SUNSET(YYYY-MM-DD); warn at commit time once a
# marker's date has passed so it gets removed rather than lingering forever.
if [ -f scripts/sunset-scan.py ]; then
  out="$(python3 scripts/sunset-scan.py 2>/dev/null || true)"
  [ -n "$out" ] && printf '%s\n' "$out" >&2 || true
fi

exit 0
