#!/usr/bin/env python3
# Regenerate board.md from tasks/*.md. Frontmatter is flat `key: value` pairs.
# Portable: python3, stdlib only, zero dependencies.
# Canonical source: mehrlander/web-tools at .claude/skills/tasks/build-board.py
# (bundled in the portable plugin; /tasks runs it via ${CLAUDE_PLUGIN_ROOT})
# Usage: python3 build-board.py <tasks_dir> <board_out>
import os, pathlib, sys, urllib.parse

tasks_dir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "tasks")
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "board.md")

# Where a row's link points, as a path relative to the BOARD's folder rather
# than to the cwd, so the same href resolves on GitHub (relative to board.md)
# and in show-repo's board pane (onBoardClick resolves against the board file's
# folder). Computed rather than hardcoded to `tasks/`, since the generator takes
# both directories as arguments and a repo may lay them out differently.
task_href_base = os.path.relpath(tasks_dir, out.parent).replace(os.sep, "/")

def meta(p):
    parts = p.read_text().split("---")
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
    return f"- 🎫 [{label}]({href}){who}{dep}"

lines = ["# Board", "", "_Generated from tasks/. Do not hand-edit._", ""]
for head, key in [("On deck", "backlog"), ("In progress", "in-progress"),
                  ("Blocked", "blocked"), ("Done", "done")]:
    lines.append(f"## {head}")
    lines += ([row(m) for m in buckets[key]] or ["- (none)"])
    lines.append("")
out.write_text("\n".join(lines))
