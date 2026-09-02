#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit): refuse a class that narrows text to a
# reading column, at the moment it would be written. daisy-alpine rule 3 has
# forbidden it since 2026-08-31 and the rule caught nothing, because a rule only
# fires when it is read and this class arrives as a model default. Engine and
# the full argument: reading-column.py beside this file.
#
# IT JUDGES THE RESULT, NOT THE EDIT. The hook applies the pending edit in
# memory and scans what the file would become, so three things follow: a new
# violation is refused, a file that already carried one cannot be edited until
# it is clean, and a fixing edit always passes because its result is clean.
# The middle case is the point rather than a side effect. It is also why the
# opt-out exists: `reading-column-ok` on the line suppresses it, and being
# greppable keeps the exceptions countable.
#
# Deliberately a PLUGIN hook, not a repo one. A repo's .claude/settings.json is
# read only when the session's project root IS that repo, so in a multi-repo
# session it is never loaded (extending.md, measured 2026-07-25). A plugin's
# hooks.json is registered by the plugin and fires from any root, which is also
# what puts every repo under the rule rather than this one.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" \
HOOK_PAYLOAD="$(cat)" python3 - <<'PY'
import importlib.util, json, os, sys

# Loaded by path, not imported: the engine keeps the hyphenated filename its
# scanner family uses, and inside a heredoc `__file__` is stdin, so the bash
# wrapper supplies the directory.
engine = os.path.join(os.environ.get("HOOK_DIR", ""), "reading-column.py")
try:
    spec = importlib.util.spec_from_file_location("reading_column", engine)
    rc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rc)
    scan_text, EXTENSIONS, OPT_OUT = rc.scan_text, rc.EXTENSIONS, rc.OPT_OUT
except Exception:
    sys.exit(0)  # engine missing or broken: never block on our own fault

try:
    d = json.loads(os.environ.get("HOOK_PAYLOAD", "") or "{}")
except Exception:
    sys.exit(0)

tool = d.get("tool_name", "")
inp = d.get("tool_input") or {}
path = inp.get("file_path") or ""
if tool not in ("Edit", "Write", "MultiEdit") or not path:
    sys.exit(0)
if os.path.splitext(path)[1] not in EXTENSIONS:
    sys.exit(0)


def current():
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def apply_one(text, edit):
    old, new = edit.get("old_string", ""), edit.get("new_string", "")
    if not old:
        return text
    return text.replace(old, new) if edit.get("replace_all") else text.replace(old, new, 1)


if tool == "Write":
    result = inp.get("content", "")
elif tool == "Edit":
    result = apply_one(current(), inp)
else:
    result = current()
    for edit in inp.get("edits") or []:
        result = apply_one(result, edit)

hits = scan_text(result, path)
if not hits:
    sys.exit(0)

# One message per distinct class, so a file with nine `max-w-4xl` reads as one
# instruction with nine line numbers rather than nine paragraphs.
by_class = {}
for _, line, cls, msg in hits:
    by_class.setdefault((cls, msg), []).append(line)

parts = []
for (cls, msg), lines in by_class.items():
    where = ", ".join(f"line {n}" for n in lines[:8])
    if len(lines) > 8:
        where += f", and {len(lines) - 8} more"
    parts.append(f"{msg} ({where})")

reason = (
    f"{os.path.basename(path)} would still narrow text to a reading column after this edit.\n\n"
    + "\n\n".join(parts)
    + f"\n\nFix every line above in this edit; the check reads the whole resulting file, "
      f"not just the part you changed. A genuine exception takes a `{OPT_OUT}` comment on the line."
)

print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": reason,
}}))
PY
