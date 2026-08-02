#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "templates" / "concept-index.yml"
TARGET = Path(".github/workflows/concept-index.yml")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("root", nargs="?", default=".")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()

    target = Path(args.root).resolve() / TARGET
    wanted = TEMPLATE.read_text(encoding="utf-8")
    current = target.read_text(encoding="utf-8") if target.exists() else None

    if args.check:
        print("current" if current == wanted else "missing-or-stale")
        raise SystemExit(0 if current == wanted else 1)

    target.parent.mkdir(parents=True, exist_ok=True)
    if current == wanted:
        print(f"current: {target}")
        return
    shutil.copyfile(TEMPLATE, target)
    print(f"{'updated' if current is not None else 'installed'}: {target}")


if __name__ == "__main__":
    main()
