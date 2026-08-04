#!/usr/bin/env python3
"""Report markdown links that no longer resolve, in three classes.

  internal    a link to another file in the same repo
  cross-repo  a relative path that escapes the repo root into a sibling
              checkout (../../budget-wa/...). It never resolves on github.com
              and resolves locally only when that checkout happens to be there
  github      a github.com/OWNER/REPO/blob|tree/main/... URL whose path is gone

The cross-repo class is the one with no owner on either side. A store can
reorganize without knowing who reads it, and the reader finds out only if
someone happens to run something. mehrlander/home held 45 dead links into
mehrlander/budget-wa across two moves of one estate, and ran broken for a day
before an unrelated suite turned it up (2026-08-03). Both repos now run this.

Nothing here is repo-specific: the root is argv, siblings are discovered rather
than listed, and the owner is a flag. One copy serves every caller.

Two findings worth keeping, because both produced confident wrong answers:

  A ref can contain slashes (claude/some-branch-abc123), so a URL cannot be
  split into ref and path without knowing the ref. Only .../main/... is
  checkable, and a link to a branch points at a moving target anyway.

  A shallow checkout cannot answer where a file went: `git log` truncates with
  no error, so every trace reads "never existed". Claude Code web checkouts are
  shallow. Run `git rev-parse --is-shallow-repository` before concluding a
  target was deleted rather than renamed; see web-tools
  docs/environment/container.md.

Verdicts are ok, dead, or unverifiable. A link into a store with no checkout is
*unverifiable*, never dead: absence of a checkout is not evidence of a bad path,
and a one-repo machine must not fail on it.

Usage:
  python3 link-survey.py [ROOT] [--owner NAME] [--cross-repo] [--check]

  ROOT          repo to survey (default: cwd)
  --owner       GitHub owner whose URLs are checkable (default: mehrlander)
  --cross-repo  report only the cross-repo and github classes
  --check       exit 1 if any cross-repo or github link is dead; implies
                --cross-repo. The internal class is never gated: it turns on
                judgment this cannot supply (a target may have been retired on
                purpose, and repointing would be guessing).

Sibling checkouts resolve by $REPO_NAME (upper, dashes to underscores), then
$REPO_NAME_REPO, then a directory beside ROOT. A bare $HOME is never consulted:
it is the user's home directory, and reading it marks every link into a repo
named "home" dead.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

LINK = re.compile(r'(?<!!)\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)')
FENCE = re.compile(r'^\s*(```|~~~)')
# Shapes that are documentation of a path, not a path: filename templates and
# elided middles. Checking them produces noise no reader can act on.
TEMPLATE = re.compile(r'YYYY|MM/|[<>]|\$\{|\.\.\.')


def strip_uncheckable(text):
    """Blank fenced blocks, inline code, and blockquotes, preserving line numbers.

    Blockquotes go because captured or quoted material carries someone else's
    links, which this repo neither owns nor can fix.
    """
    out, fence = [], None
    for line in text.split("\n"):
        m = FENCE.match(line)
        if fence:
            out.append("")
            if m and line.strip().startswith(fence):
                fence = None
            continue
        if m:
            fence = m.group(1)
            out.append("")
            continue
        if line.lstrip().startswith(">"):
            out.append("")
            continue
        out.append(re.sub(r'`[^`]*`', "", line))
    return "\n".join(out)


def sibling_root(root, name):
    var = name.upper().replace("-", "_")
    for key in (var, f"{var}_REPO"):
        if key != "HOME" and os.environ.get(key):
            return Path(os.environ[key])
    return root.parent / name


def classify(root, owner, src, target):
    """Return (class, verdict, detail), or None when the link is not ours to check."""
    path = target.strip("<>").split("#")[0]
    if not path or path.startswith(("mailto:", "tel:")):
        return None

    m = re.match(rf'https://github\.com/{re.escape(owner)}/([\w.-]+)/(?:blob|tree)/main/(.*)', path)
    if m:
        repo, rel = m.group(1), m.group(2)
        base = root if repo == root.name else sibling_root(root, repo)
        if not base.exists():
            return ("github", "unverifiable", f"no {repo} checkout")
        return ("github", "ok" if (base / rel).exists() else "dead", f"{repo}:{rel}")
    if path.startswith("http"):
        return None

    resolved = (src.parent / path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        # Escapes the repo. The first segment below the shared parent names the
        # sibling, which is how this avoids carrying a per-repo list of stores.
        name = None
        try:
            name = resolved.relative_to(root.parent).parts[0]
        except (ValueError, IndexError):
            pass
        if name and not sibling_root(root, name).exists():
            return ("cross-repo", "unverifiable", f"no {name} checkout")
        return ("cross-repo", "ok" if resolved.exists() else "dead", path)
    return ("internal", "ok" if resolved.exists() else "dead", path)


def survey(root, owner):
    files = subprocess.run(["git", "-C", str(root), "ls-files", "*.md"],
                           capture_output=True, text=True).stdout.split()
    findings = []
    for f in files:
        p = root / f
        try:
            text = strip_uncheckable(p.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, OSError):
            continue
        for m in LINK.finditer(text):
            if TEMPLATE.search(m.group(2)):
                continue
            got = classify(root, owner, p, m.group(2))
            if not got or got[1] == "ok":
                continue
            findings.append((got[0], got[1], f, text[:m.start()].count("\n") + 1,
                             m.group(1)[:44], got[2]))
    return findings


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    flags = [a for a in argv if a.startswith("--")]
    owner = next((f.split("=", 1)[1] for f in flags if f.startswith("--owner=")), "mehrlander")
    check = "--check" in flags
    only_cross = check or "--cross-repo" in flags

    root = Path(args[0] if args else ".").resolve()
    findings = survey(root, owner)
    if only_cross:
        findings = [x for x in findings if x[0] != "internal"]

    dead = [x for x in findings if x[1] == "dead"]
    unver = [x for x in findings if x[1] == "unverifiable"]
    for cls in ("cross-repo", "github", "internal"):
        rows = [x for x in dead if x[0] == cls]
        if rows:
            print(f"\n== {cls}: {len(rows)} dead")
            for _, _, f, ln, label, detail in rows:
                print(f"  {f}:{ln}  [{label}] -> {detail}")
    if unver:
        print(f"\n== unverifiable: {len(unver)} link(s), "
              f"{', '.join(sorted({x[5] for x in unver}))}")
        print("   Not evidence of a bad path. Check out the store, or set its "
              "$REPO_NAME, and rerun.")
    print(f"\nlink-survey: {len(dead)} dead, {len(unver)} unverifiable, "
          f"across {len(set(x[2] for x in findings))} file(s)")
    if check and dead:
        print("FAIL: a cross-repo link no longer resolves", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
