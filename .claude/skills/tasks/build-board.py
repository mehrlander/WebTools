#!/usr/bin/env python3
# Regenerate board.md and board.json from tasks/*.md. Frontmatter is flat
# `key: value` pairs.
# Portable: python3, stdlib only, zero dependencies.
# Canonical source: mehrlander/web-tools at .claude/skills/tasks/build-board.py
# (bundled in the portable plugin; /tasks runs it via ${CLAUDE_PLUGIN_ROOT})
# Usage: python3 build-board.py <tasks_dir> <board_out> [--check]
#   --check writes nothing and exits 1 if either artifact is behind its source,
#   so a test or CI can own the lockstep where a commit hook may never fire.
#
# Two projections from one run, so they cannot drift:
#   board.md   the human list: GitHub, a diff, a clone, a session reading files
#   board.json the typed projection: show-repo and anything else machine-side
# The app must never parse the rendered board to recover fields it could have
# been handed (data before display).
import json, os, pathlib, re, sys, urllib.parse

argv = [a for a in sys.argv[1:] if a != "--check"]
CHECK = "--check" in sys.argv
tasks_dir = pathlib.Path(argv[0] if len(argv) > 0 else "tasks")
out = pathlib.Path(argv[1] if len(argv) > 1 else "board.md")
out_json = out.with_suffix(".json")

# Where a row's link points, as a path relative to the BOARD's folder rather
# than to the cwd, so the same href resolves on GitHub (relative to board.md)
# and in show-repo's board pane (onBoardClick resolves against the board file's
# folder). Computed rather than hardcoded to `tasks/`, since the generator takes
# both directories as arguments and a repo may lay them out differently.
task_href_base = os.path.relpath(tasks_dir, out.parent).replace(os.sep, "/")

# Recognized keys act on the board; everything else is an open tag, preserved
# and never rendered (TRACKER.md, the two-layer rule). Listed here so board.json
# can keep the same split rather than flattening it away.
# A tuple, not a set, and that is load-bearing rather than stylistic. `record()`
# below builds board.json's per-task object by iterating this, so set iteration
# order would leak Python's per-process string hash randomization into the key
# order of the emitted JSON: same input, different bytes on every run, which is
# exactly what the no-timestamp rule at the bottom of this file exists to
# prevent. Membership tests against ten strings cost nothing.
RECOGNIZED = ("id", "title", "status", "project", "track",
              "opened", "closed", "session", "size", "awaiting")

LOG_DATE = re.compile(r"^\s*[-*]\s*\**(\d{4}-\d{2}-\d{2})", re.M)


def meta(p):
    text = p.read_text()
    parts = text.split("---")
    if len(parts) < 3:
        return {}
    d = {}
    for line in parts[1].strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            d[k.strip()] = v.strip()
    # The link targets the file on disk, not `id`, so a file whose `id:` drifted
    # from its name still links to something that exists.
    d["_file"] = p.name
    # Derived, for board.json only. A task's real freshness is the newest date
    # in its progress log, not `opened:`; nothing else surfaces it, and it is
    # what separates a live task from one that has only been groomed.
    dates = LOG_DATE.findall(text.split("---", 2)[-1])
    d["_last_activity"] = max(dates) if dates else ""
    d["_log_entries"] = len(dates)
    return d


tasks = [meta(p) for p in sorted(tasks_dir.glob("*.md"))]
buckets = {"backlog": [], "in-progress": [], "blocked": [], "done": []}
for m in tasks:
    buckets.get(m.get("status", "backlog"), buckets["backlog"]).append(m)

by_id = {m["id"]: m for m in tasks if m.get("id")}


def blocker(m):
    # `track: depends-on:<id>` names a task this one waits on. Render it only
    # while it still bites: an unmet dependency on an open task, on a task that
    # is itself not done. A satisfied dependency is history, and a done task's
    # dependency is history twice over, so both stay quiet. Resolve the id to
    # the blocker's title, because the id means nothing to a reader who did not
    # write the task (TRACKER.md, Conventions).
    track = m.get("track", "")
    if not track.startswith("depends-on:") or m.get("status") == "done":
        return ""
    dep = track.split(":", 1)[1].strip()
    target = by_id.get(dep)
    if target is None:
        return f" (needs `{dep}`, which no task file defines)"
    if target.get("status") == "done":
        return ""
    return f" (needs: {target.get('title', dep)})"


def row(m):
    open_task = m.get("status") != "done"
    # `size` and `awaiting` answer independent questions and both belong to an
    # open task only: a finished task's estimate and its old blocker are
    # history, the same rule that already silences `depends-on:` on Done.
    # `status` says whether a session can start this; `awaiting` says what is
    # holding it, which is why it renders on backlog rows too and not only on
    # blocked ones. A task can be startable in part and still be waiting on
    # someone for the rest.
    size = f" · {m['size']}" if open_task and m.get("size") else ""
    wait = f" (awaiting: {m['awaiting']})" if open_task and m.get("awaiting") else ""
    who = f" (`{m['session']}`)" if m.get("session") else ""
    dep = blocker(m)
    # 🎫 marks a tracker task wherever one is surfaced (see CONVENTIONS.md /
    # TRACKER.md): the ticket says "this is a filed task." The title is the
    # link, per SURFACING.md's 🎫 form, so the board is a table of contents
    # rather than a list of strings: one tap reaches the task that holds the
    # why, the definition of done, and the progress log. Brackets in a title
    # are escaped, since one unescaped `]` would truncate the link text.
    label = m.get("title", "(untitled)").replace("[", "\\[").replace("]", "\\]")
    href = task_href_base + "/" + urllib.parse.quote(m.get("_file", ""))
    # Awaiting sits last because it is the only free-text field and the longest.
    return f"- 🎫 [{label}]({href}){size}{who}{dep}{wait}"


lines = ["# Board", "", "_Generated from tasks/. Do not hand-edit._", ""]
for head, key in [("On deck", "backlog"), ("In progress", "in-progress"),
                  ("Blocked", "blocked"), ("Done", "done")]:
    lines.append(f"## {head}")
    lines += ([row(m) for m in buckets[key]] or ["- (none)"])
    lines.append("")
board_md = "\n".join(lines)


def record(m):
    # Recognized keys at the top level, open tags under `tags`, so the two-layer
    # split survives into the projection and a consumer cannot mistake an
    # unpromoted tag for part of the contract.
    r = {k: m[k] for k in RECOGNIZED if m.get(k)}
    r["file"] = m.get("_file", "")
    r["href"] = task_href_base + "/" + urllib.parse.quote(m.get("_file", ""))
    r["lastActivity"] = m.get("_last_activity", "")
    r["logEntries"] = m.get("_log_entries", 0)
    dep = blocker(m)
    if dep:
        r["blockedBy"] = dep.strip()[1:-1]      # the rendered phrase, parens off
    tags = {k: v for k, v in m.items()
            if not k.startswith("_") and k not in RECOGNIZED}
    if tags:
        r["tags"] = tags
    return r


# No timestamp: the artifact must be byte-identical for the same input, or the
# lockstep checks that re-run the generator would fail on every clean tree.
board_json = json.dumps(
    {"tasks": [record(m) for m in tasks]}, indent=1, ensure_ascii=False) + "\n"

if CHECK:
    stale = [str(f) for f, want in ((out, board_md), (out_json, board_json))
             if not f.exists() or f.read_text() != want]
    if stale:
        sys.exit(f"stale: {', '.join(stale)}\n"
                 f"  run: python3 {sys.argv[0]} {tasks_dir} {out}")
else:
    out.write_text(board_md)
    out_json.write_text(board_json)
