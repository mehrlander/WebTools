#!/usr/bin/env python3
"""Report paths a repo declares in .web-tools.json that no longer resolve.

A repo's .web-tools.json names the artifacts it publishes: its landing page, the
pages on its estate card, the filesets a stage link carries. Those are addresses,
and an address in JSON has the same problem as one in prose, with one difference
that matters: nothing reads it. link-survey.py enumerates a repo with
`git ls-files *.md`, so a declared path is invisible to it, and so is a path
string in a JavaScript registry.

That gap is not hypothetical. On 2026-08-02 mehrlander/budget-wa reorganized its
estate and two pages that mehrlander/home's budget-drs app embeds by path went to
404s, silently, for a day. budget-wa's own CLAUDE.md already recorded that the app
fetched one of them. Prose on the owner's side did not stop it, because the mover
had nothing mechanical to trip over. This is that trip wire, and it belongs to the
mover: a repo runs it over its own declarations and fails its own suite when it
moves something it told the world about.

Which makes the declaration load-bearing rather than decorative. A page worth
embedding from another repo is a page worth declaring here, and once declared, a
rename cannot pass quietly.

Checked keys: landing, pages[].path, stage.files[]. Each names an artifact that
has to exist for the declaration to mean anything.

`stage.targets` is deliberately NOT checked, and the first run of this script is
why: it reported `mehrlander/home:inbox/spend-wa` dead in two repos. A target is
a deposit *destination*, created on first deposit, so its absence says nothing.
Checking it would have made two correct declarations fail, which is the failure
mode this script exists to prevent, pointed the other way.

Two address forms, both accepted anywhere a path is taken:

  path/in/this/repo.html          resolved against ROOT
  owner/repo[@ref]:path/in/it     resolved against a SIBLING CHECKOUT of repo

Verdicts are ok, dead, or unverifiable, with the same rule link-survey.py uses: a
cross-repo address whose sibling checkout is absent is *unverifiable*, never dead,
because a missing clone is not evidence of a bad path and a one-repo machine must
not fail on it. A non-main @ref is unverifiable too: the working tree is one ref
and cannot speak for another.

Usage:
  python3 declared-paths.py [ROOT] [--check] [--quiet]

  ROOT      repo to check (default: cwd)
  --check   exit 1 if anything is dead (exit 0 on unverifiable alone)
  --quiet   print only the summary line

Exit codes: 0 ok, 1 dead found with --check, 2 no .web-tools.json to read.
"""
import json
import sys
from pathlib import Path

CONFIG_NAMES = (".web-tools.json",)   # the legacy .show-repo.json sunset 2026-08-15


def sibling_root(root: Path, repo: str) -> Path:
    """A sibling checkout of `repo` beside `root`, the layout every caller uses."""
    return root.parent / repo


def classify(root: Path, value: str, key: str):
    """Return (verdict, detail). `value` is a local path or owner/repo[@ref]:path."""
    if ":" in value and not value.startswith(("http://", "https://")):
        addr, _, rel = value.partition(":")
        owner_repo, _, ref = addr.partition("@")
        parts = owner_repo.split("/")
        if len(parts) != 2:
            return ("dead", f"{key}: {value} (not owner/repo:path)")
        repo = parts[1]
        if ref and ref != "main":
            return ("unverifiable", f"{key}: {value} (@{ref} is not the checked-out ref)")
        base = root if repo == root.name else sibling_root(root, repo)
        if not base.exists():
            return ("unverifiable", f"{key}: {value} (no {repo} checkout)")
        # A trailing directory is a legitimate stage target, so accept either.
        return ("ok" if (base / rel).exists() else "dead", f"{key}: {value}")
    return ("ok" if (root / value).exists() else "dead", f"{key}: {value}")


def declared(cfg: dict):
    """Yield (key, value) for every address the config states."""
    if isinstance(cfg.get("landing"), str):
        yield ("landing", cfg["landing"])
    for i, page in enumerate(cfg.get("pages") or []):
        if isinstance(page, dict) and isinstance(page.get("path"), str):
            yield (f"pages[{i}] {page.get('title') or ''}".strip(), page["path"])
    stage = cfg.get("stage") or {}
    for i, f in enumerate(stage.get("files") or []):
        if isinstance(f, str):
            yield (f"stage.files[{i}]", f)
    # stage.targets is not yielded: a target is a deposit destination, created on
    # first deposit, so a missing directory is not a broken declaration.


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    check = "--check" in argv
    quiet = "--quiet" in argv
    root = Path(args[0] if args else ".").resolve()

    cfg_path = next((root / n for n in CONFIG_NAMES if (root / n).exists()), None)
    if cfg_path is None:
        print(f"declared-paths: no {CONFIG_NAMES[0]} in {root}", file=sys.stderr)
        return 2
    try:
        cfg = json.loads(cfg_path.read_text())
    except json.JSONDecodeError as e:
        print(f"declared-paths: {cfg_path.name} does not parse: {e}", file=sys.stderr)
        return 2

    rows = [(v, d) for k, val in declared(cfg) for v, d in [classify(root, val, k)]]
    dead = [d for v, d in rows if v == "dead"]
    unver = [d for v, d in rows if v == "unverifiable"]

    if not quiet:
        for label, items in (("dead", dead), ("unverifiable", unver)):
            if items:
                print(f"\n== {label}: {len(items)}")
                for d in items:
                    print(f"  {d}")
    print(f"declared-paths: {len(rows)} declared, {len(dead)} dead, "
          f"{len(unver)} unverifiable ({cfg_path.name})")

    if dead and check:
        print("FAIL: a declared path no longer resolves. Either the artifact moved and "
              "the declaration should follow it, or it was removed and the declaration "
              "should go. Anything embedding it by address is already broken.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
