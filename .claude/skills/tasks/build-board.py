#!/usr/bin/env python3
# Regenerate board.md, board.csv and board-tags.csv from tasks/*.md.
# Frontmatter is flat `key: value` pairs.
# Portable: python3, stdlib only, zero dependencies.
# Canonical source: mehrlander/web-tools at .claude/skills/tasks/build-board.py
# (bundled in the portable plugin; /tasks runs it via ${CLAUDE_PLUGIN_ROOT})
# Usage: python3 build-board.py <tasks_dir> <board_out> [--check]
#   --check writes nothing and exits 1 if any artifact is behind its source,
#   so a test or CI can own the lockstep where a commit hook may never fire.
#
# Three projections from one run, so they cannot drift:
#   board.md        the human list: GitHub, a diff, a clone, a session reading files
#   board.csv       the typed projection: show-repo and anything else machine-side
#   board-tags.csv  the open tags, one row per (task, tag) pair
# The app must never parse the rendered board to recover fields it could have
# been handed (data before display).
#
# Two files rather than one because a task carries two grains and a CSV holds
# one table. The recognized keys are one row per task; the open tags are a bag
# whose keys nobody declares, so they are one row per pair. Encoding the bag
# into a cell would have kept one file and given up the tabular reading that is
# the whole reason these are CSV (docs/registries.md).
import os, pathlib, re, sys, urllib.parse

argv = [a for a in sys.argv[1:] if a != "--check"]
CHECK = "--check" in sys.argv
tasks_dir = pathlib.Path(argv[0] if len(argv) > 0 else "tasks")
out = pathlib.Path(argv[1] if len(argv) > 1 else "board.md")
out_csv = out.with_suffix(".csv")
out_tags = out.with_name(out.stem + "-tags.csv")

# Where a row's link points, as a path relative to the BOARD's folder rather
# than to the cwd, so the same href resolves on GitHub (relative to board.md)
# and in show-repo's board pane (onBoardClick resolves against the board file's
# folder). Computed rather than hardcoded to `tasks/`, since the generator takes
# both directories as arguments and a repo may lay them out differently.
task_href_base = os.path.relpath(tasks_dir, out.parent).replace(os.sep, "/")

# Recognized keys act on the board; everything else is an open tag, preserved
# and never rendered (TRACKER.md, the two-layer rule). The split survives into
# the projection as two files rather than as a nested key.
# A tuple, not a set, and that is load-bearing rather than stylistic: it fixes
# which frontmatter keys are recognized AND, through BOARD_COLS below, the
# column order of the emitted CSV. Set iteration would leak Python's
# per-process string hash randomization into the byte layout, so the same input
# would produce a different file on every run, which is exactly what the
# no-timestamp rule at the bottom of this file exists to prevent. Membership
# tests against ten strings cost nothing.
RECOGNIZED = ("id", "title", "status", "project", "depends-on",
              "opened", "closed", "session", "size", "awaiting")

# The three derived values the task file does not state, plus the two locators.
# Spelled out rather than appended dynamically, since a column that appears or
# moves depending on which tasks happen to carry a field is not a schema.
BOARD_COLS = RECOGNIZED + ("blockedBy", "file", "href", "lastActivity", "logEntries")
TAG_COLS = ("task", "tag", "value")


def csv_text(rows, cols):
    # Same quoting as the estate's other CSV writers (tools/build/registries-load.mjs):
    # quote only when the cell holds a comma, a quote, or a newline, and double
    # an interior quote. Kept here rather than imported because this file is
    # portable and stdlib-only, and `csv` would emit CRLF by default.
    def cell(v):
        s = "" if v is None else str(v)
        return '"' + s.replace('"', '""') + '"' if any(c in s for c in ',"\n') else s
    head = ",".join(cols)
    body = [",".join(cell(r.get(c)) for c in cols) for r in rows]
    return "\n".join([head] + body) + "\n"

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
    # Derived, for board.csv only. A task's real freshness is the newest date
    # in its progress log, not `opened:`; nothing else surfaces it, and it is
    # what separates a live task from one that has only been refined.
    dates = LOG_DATE.findall(text.split("---", 2)[-1])
    d["_last_activity"] = max(dates) if dates else ""
    d["_log_entries"] = len(dates)
    return d


tasks = [meta(p) for p in sorted(tasks_dir.glob("*.md"))]
# `dormant` is preserved-but-not-surfaced: the task and its history stay in
# tasks/ and in board.csv, and it is rendered on no board section at all. That
# is the whole point of the status, so it takes a bucket the section list below
# never reads rather than a section nobody scrolls to. An unknown status still
# falls to backlog, which is the safe default for a typo but would have been the
# wrong one here: before dormant was recognized it put the task on On deck.
buckets = {"backlog": [], "in-progress": [], "blocked": [], "done": [], "dormant": []}
for m in tasks:
    buckets.get(m.get("status", "backlog"), buckets["backlog"]).append(m)

# Statuses whose open-task decorations are history rather than current state.
SETTLED = ("done", "dormant")

by_id = {m["id"]: m for m in tasks if m.get("id")}


def blocker(m):
    # `depends-on: <id>[, <id>...]` names the tasks this one waits on. Render a
    # dependency only while it still bites: an unmet one on a task that is
    # itself unsettled. A satisfied dependency is history, and a settled task's
    # dependency is history twice over, so both stay quiet. Resolve each id to
    # its title, because the id means nothing to a reader who did not write the
    # task (TRACKER.md, Conventions).
    #
    # The value is a comma-separated scalar rather than a YAML list, because the
    # parser contract is flat `key: value` pairs and a real list is the one
    # thing that would force a YAML dependency. Absence means no dependency, so
    # there is no value that means "independent": that was the whole content of
    # the retired `track` field, and an absent key says it without a row.
    raw = m.get("depends-on", "")
    if not raw or m.get("status") in SETTLED:
        return ""
    unmet = []
    for dep in (d.strip() for d in raw.split(",")):
        if not dep:
            continue
        target = by_id.get(dep)
        if target is None:
            unmet.append(f"`{dep}`, which no task file defines")
        elif target.get("status") not in SETTLED:
            unmet.append(target.get("title", dep))
    if not unmet:
        return ""
    return f" (needs: {'; '.join(unmet)})"


def row(m):
    open_task = m.get("status") not in SETTLED
    # `size` and `awaiting` answer independent questions and both belong to an
    # open task only: a finished task's estimate and its old blocker are
    # history, the same rule that already silences `depends-on` on a settled task.
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
    # One row per task, recognized keys only. A blank cell is "not asserted",
    # which is what an absent frontmatter key means, so nothing is written to
    # stand in for it.
    r = {k: m.get(k, "") for k in RECOGNIZED}
    r["file"] = m.get("_file", "")
    r["href"] = task_href_base + "/" + urllib.parse.quote(m.get("_file", ""))
    r["lastActivity"] = m.get("_last_activity", "")
    r["logEntries"] = m.get("_log_entries", 0)
    dep = blocker(m)
    r["blockedBy"] = dep.strip()[1:-1] if dep else ""   # the rendered phrase, parens off
    return r


def tag_rows(m):
    # The open layer, one row per pair, keyed by the task's id so it joins to
    # board.csv. A task with no id cannot be joined to, so its tags are dropped
    # rather than orphaned; that is the same reason the board keys on id.
    tid = m.get("id", "")
    if not tid:
        return []
    return [{"task": tid, "tag": k, "value": v} for k, v in m.items()
            if not k.startswith("_") and k not in RECOGNIZED]


# No timestamp: the artifact must be byte-identical for the same input, or the
# lockstep checks that re-run the generator would fail on every clean tree.
board_csv = csv_text([record(m) for m in tasks], BOARD_COLS)
# Sorted by (task, tag) so the file does not reorder when a task file's
# frontmatter is reordered; the task order in board.csv follows the filename
# sort that produced `tasks`, and this one has no such order to inherit.
tags_csv = csv_text(sorted((r for m in tasks for r in tag_rows(m)),
                           key=lambda r: (r["task"], r["tag"])), TAG_COLS)

artifacts = ((out, board_md), (out_csv, board_csv), (out_tags, tags_csv))

if CHECK:
    stale = [str(f) for f, want in artifacts
             if not f.exists() or f.read_text() != want]
    if stale:
        sys.exit(f"stale: {', '.join(stale)}\n"
                 f"  run: python3 {sys.argv[0]} {tasks_dir} {out}")
else:
    for f, want in artifacts:
        f.write_text(want)
