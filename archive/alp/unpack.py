#!/usr/bin/env python3
"""
Unpack `alp/git-ingest.md` (a gitingest-style single-file dump of the Alp repo)
into individual files under `alp/repo/`.

Run from the repo root:
    python3 alp/unpack.py

Effect: wipes `alp/repo/` and recreates it from the current dump. Safe to rerun.
"""

import sys
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
SRC = HERE / "git-ingest.md"
OUT_ROOT = HERE / "repo"
SEP = "================================================"


def main() -> int:
    if not SRC.exists():
        print(f"missing: {SRC}", file=sys.stderr)
        return 1

    lines = SRC.read_text().splitlines()

    # A file header is three consecutive lines: SEP, "FILE: <name>", SEP.
    entries = []
    i = 0
    while i < len(lines):
        if (
            lines[i] == SEP
            and i + 2 < len(lines)
            and lines[i + 2] == SEP
            and lines[i + 1].startswith("FILE:")
        ):
            fname = lines[i + 1][5:].strip()
            entries.append((fname, i + 3))  # content starts after second SEP
            i += 3
        else:
            i += 1

    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True)

    for idx, (fname, content_start) in enumerate(entries):
        end = entries[idx + 1][1] - 3 if idx + 1 < len(entries) else len(lines)
        content_lines = lines[content_start:end]
        while content_lines and content_lines[-1] == "":
            content_lines.pop()
        content = "\n".join(content_lines)
        if content and not content.endswith("\n"):
            content += "\n"

        out_path = OUT_ROOT / fname
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(content)

    print(f"Extracted {len(entries)} files to {OUT_ROOT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
