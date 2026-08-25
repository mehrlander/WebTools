#!/usr/bin/env python3
"""Scan a repo for SUNSET(YYYY-MM-DD) markers and report the ones now due.

A SUNSET marker flags code kept only for backward compatibility, with the date
it can probably be removed:

    // SUNSET(2027-01-01): reads the old manifest name too. Remove once
    // consumer repos are migrated to the new one.

By default this prints only markers whose date is today or earlier (the ones
worth acting on) and stays silent otherwise, so it is safe to run warn-only from
a commit hook. `--all` lists upcoming markers too; `--strict` exits non-zero when
anything is due (for CI). Portable: python3 stdlib only, argv-driven, run from
any repo root.

Usage:
    python3 sunset-scan.py [--all] [--strict] [root]
"""
import datetime
import os
import re
import subprocess
import sys

MARKER = re.compile(r"SUNSET\((\d{4}-\d{2}-\d{2})\)")
SKIP_DIRS = {".git", "node_modules", "dist", ".venv", "__pycache__"}
# A report line carries file:line; the snippet is orientation, not the source.
# One long line should not be able to flood the report.
SNIPPET_MAX = 120


def _snippet(line):
    s = line.strip()
    return s if len(s) <= SNIPPET_MAX else s[:SNIPPET_MAX - 1] + "…"


def _skipped(rel):
    """True for a path inside a SKIP_DIRS directory at any depth."""
    return any(part in SKIP_DIRS for part in rel.replace(os.sep, "/").split("/"))


def tracked_files(root):
    """Prefer git's file list (respects .gitignore); fall back to a walk."""
    try:
        out = subprocess.run(
            ["git", "-C", root, "ls-files"],
            capture_output=True, text=True, check=True,
        ).stdout
        # SKIP_DIRS applies here too, not only to the walk below. A build
        # artifact can be tracked (web-tools commits dist/web-tools.js), and
        # then every marker in its source is reported a second time, from a
        # bundled line thousands of characters wide. A marker in generated
        # output is a copy: acting on it means editing the source anyway.
        return [os.path.join(root, p) for p in out.splitlines()
                if p and not _skipped(p)]
    except Exception:
        files = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            files.extend(os.path.join(dirpath, f) for f in filenames)
        return files


def scan(root):
    """Yield (date, rel_path, lineno, snippet) for every marker found."""
    for path in tracked_files(root):
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                for lineno, line in enumerate(fh, 1):
                    m = MARKER.search(line)
                    if not m:
                        continue
                    try:
                        when = datetime.date.fromisoformat(m.group(1))
                    except ValueError:
                        continue
                    rel = os.path.relpath(path, root)
                    yield when, rel, lineno, _snippet(line)
        except (OSError, UnicodeError):
            continue


def main(argv):
    show_all = "--all" in argv
    strict = "--strict" in argv
    positional = [a for a in argv if not a.startswith("--")]
    root = positional[0] if positional else "."
    today = datetime.date.today()

    due, upcoming = [], []
    for when, rel, lineno, snippet in scan(root):
        (due if when <= today else upcoming).append((when, rel, lineno, snippet))

    due.sort()
    upcoming.sort()

    if due:
        print(f"SUNSET: {len(due)} marker(s) due (on/before {today}):")
        for when, rel, lineno, snippet in due:
            print(f"  {when}  {rel}:{lineno}  {snippet}")
    if show_all and upcoming:
        print(f"SUNSET: {len(upcoming)} upcoming marker(s):")
        for when, rel, lineno, snippet in upcoming:
            print(f"  {when}  {rel}:{lineno}  {snippet}")

    return 1 if (strict and due) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
