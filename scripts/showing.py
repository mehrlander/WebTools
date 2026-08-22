#!/usr/bin/env python3
"""showing.py - which render link, if any, shows what this branch changed.

    python3 scripts/showing.py                  # against origin/main, HEAD
    python3 scripts/showing.py --json           # the same decision as data
    python3 scripts/showing.py --files a.js,b   # a stated file set, no git

The rules this executes are not new. They are `showing.picker` in
docs/routes.json, whose own note says the mechanism "is derivable rather than
remembered: it follows from which files a branch changed", and the reaches /
misses / trap columns of docs/showing-mechanisms.csv. Both have rendered in the
app's Map view since 2026-08-19, addressed to a person who chooses to go and
read them.

That is the gap this closes, and it is worth stating plainly because it is not
the gap it looks like. The knowledge was complete; what was missing was anything
that RUNS it. A session that is confident it already knows does not open the
table, so the table cannot correct it, and the failure is silent by
construction: a wrong pick yields a link that resolves, renders something
plausible, and shows last week's code. Measured 2026-08-22, when a session
changed lib/alpineComponents/estate.js and reported that no link could show it,
on the reasoning that the change was "in the app shell". It was in lib, `?use=`
reaches it, and the table says so in one row.

So the output is a line to paste, not advice to weigh, and the command takes no
arguments, because a tool consulted only when someone suspects they need it is
consulted exactly when they don't.

WHAT IT CANNOT DO, and says so rather than implying otherwise:

  * It cannot tell whether the change is VISIBLE. A pure refactor gets a
    perfectly correct link that shows nothing new.
  * It cannot see pixels, so it cannot catch the failure docs/showing.md names
    as the shape of every one recorded there: not a link that errors, but one
    that renders something plausible and wrong. The headless screenshot still
    earns its place.
  * It reports every page a shared lib file reaches and does not choose among
    them, since which one is worth looking at is about the change, not the
    graph.
"""

import argparse
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# A lib file this many pages load says little about any one of them. Borrowed
# from lib/kits/route-activity.js, which draws the same line for the same
# reason: the file is still reported everywhere it belongs, it just stops being
# a reason to link one page over another.
WIDE = 3

# The shell APIs a framed page can call correctly and invisibly, because the tab
# belongs to whatever document is on top and a nested shell is never that. This
# is the `none` row's test, and it is the case that cost two rounds to find the
# first time (the favicon, PR #315). Matched against the DIFF, so an untouched
# call already in the file does not condemn a change elsewhere in it.
TOP_LEVEL = [
    (r"document\.title", "document.title"),
    (r"history\.(replace|push)State", "history.replaceState/pushState"),
    (r"rel=[\"']icon[\"']|favicon", "the favicon"),
    (r"\blocation\.(href\s*=|assign|replace)\(", "top-level navigation"),
    (r"\btop\.location", "top.location"),
]


def sh(*args, cwd=ROOT):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True).stdout.strip()


def repo_slug():
    url = sh("git", "remote", "get-url", "origin")
    m = re.search(r"[:/]([^/:]+)/([^/]+?)(?:\.git)?$", url)
    return f"{m.group(1)}/{m.group(2)}" if m else "owner/repo"


def hosted_ok():
    """Whether this repo serves its pages. A private repo has no Pages site, so
    every hosted form is off the table there and only the toss reaches anything.
    Declared rather than probed: the answer cannot be had offline, and a wrong
    guess produces a link that 404s for the one reader it was written for."""
    try:
        m = json.loads((ROOT / ".web-tools.json").read_text())
        return bool(m.get("showing", {}).get("hosted", True))
    except Exception:
        return True


# ---- what changed --------------------------------------------------------

def changed(base, ref):
    out = sh("git", "diff", "--name-only", f"{base}...{ref}")
    return [p for p in out.splitlines() if p]


def diff_text(base, ref, paths):
    if not paths:
        return ""
    return sh("git", "diff", f"{base}...{ref}", "--unified=0", "--", *paths)


def ref_facts(ref):
    """The SHA, and whether it is pushed. Both are mechanism, and both are where
    the other recurring mistake lives: the conventions call a hand-typed ref the
    one place being approximately right is being wrong, since a SHA assembled
    from memory is well-formed and reads as correct to every check until the
    renderer finds no such commit. Nothing here types one."""
    sha = sh("git", "rev-parse", ref)
    branch = sh("git", "rev-parse", "--abbrev-ref", "HEAD")
    remote = sh("git", "rev-parse", f"origin/{branch}") if branch != "HEAD" else ""
    return {"sha": sha, "branch": branch, "pushed": bool(remote) and remote == sha}


# ---- who renders what ----------------------------------------------------

def page_files():
    pages = sorted(str(p.relative_to(ROOT)) for p in (ROOT / "pages").rglob("*.html"))
    app = "app/index.html"
    if (ROOT / app).exists():
        pages.append(app)
    return pages


def consumers():
    """lib path -> the pages that load it. Read from the pages themselves: a
    gh.load argument is a path under lib/, and a page importing the pre-build
    adopts the whole of it. Derived rather than declared, because a declared
    copy is a second list to keep in step with the imports it describes."""
    out = {}
    prebuilt = []
    for page in page_files():
        try:
            src = (ROOT / page).read_text(errors="ignore")
        except OSError:
            continue
        for arg in re.findall(r"gh\.load\(\s*['\"]([^'\"]+)['\"]", src):
            out.setdefault(f"lib/{arg}", set()).add(page)
        if "dist/web-tools.js" in src:
            prebuilt.append(page)
    return out, prebuilt


def routes_for(paths):
    """The app routes a changed file carries, from docs/app-routes.csv. The app
    is one page, so this does not change WHICH link to write; it says which view
    to open once there, which is the difference between a link and a link that
    lands somewhere."""
    hits = {}
    f = ROOT / "docs/app-routes.csv"
    if not f.exists():
        return hits
    for row in csv.DictReader(f.open()):
        files = [x for x in (row.get("files") or "").split(";") if x]
        for p in paths:
            if p in files and row["key"] != "shell":
                hits.setdefault(p, []).append(row["key"])
    return hits


# ---- the pick ------------------------------------------------------------

def classify(paths):
    b = {"lib": [], "shell": [], "renderer": [], "dist": [], "other": []}
    for p in paths:
        if p == "pages/toss-render.html":
            b["renderer"].append(p)
        elif p.startswith("dist/"):
            b["dist"].append(p)
        elif p.startswith("lib/"):
            b["lib"].append(p)
        elif (p.startswith("pages/") and p.endswith(".html")) or p == "app/index.html":
            b["shell"].append(p)
        else:
            b["other"].append(p)
    return b


def top_level_hits(text):
    found = []
    for line in text.splitlines():
        if not (line.startswith("+") or line.startswith("-")) or line[1:2] in "++--":
            continue
        for pat, label in TOP_LEVEL:
            if re.search(pat, line) and label not in found:
                found.append(label)
    return found


def pick(paths, base, ref, use_git=True, diff=None):
    slug = repo_slug()
    hosted = hosted_ok()
    facts = ref_facts(ref) if use_git else {"sha": ref, "branch": "", "pushed": True}
    sha = facts["sha"]
    b = classify(paths)
    loads, prebuilt = consumers()
    warn, why, subjects = [], [], []

    if not facts["pushed"]:
        warn.append("HEAD is not pushed: every link below names a commit the renderer cannot fetch.")

    # The renderer previews by nesting, and it has to be asked first: a change
    # to toss-render.html is also a shell change, and the shell rule would send
    # the reader to the deployed renderer to look at itself.
    if b["renderer"]:
        why.append("pages/toss-render.html changed, so the deployed renderer cannot show it: address the branch's own renderer and hand it a page as a trailing fragment.")
        return decision("toss-nested", [("pages/toss-render.html", None)], sha, slug, hosted, why, warn, facts)

    # A page's own file. ?use= cannot reach it: Pages serves the page FILE from
    # the default branch, so the old shell would wrap the new lib, silently.
    if b["shell"]:
        hits = top_level_hits(diff if diff is not None else
                              (diff_text(base, ref, b["shell"]) if use_git else ""))
        if hits:
            why.append("a page shell changed AND the diff touches " + ", ".join(hits)
                       + ": a framed page runs correctly and shows nothing, because the tab belongs to the top-level document.")
            return decision("none", [(p, None) for p in b["shell"]], sha, slug, hosted, why, warn, facts)
        why.append("a page's own file changed, which ?use= never swaps: Pages serves the page file from the default branch.")
        subjects = [(p, None) for p in b["shell"]]
        return decision("toss-gh", subjects, sha, slug, hosted, why, warn, facts)

    # Lib, which is the case that gets called wrong.
    if b["lib"] or b["dist"]:
        if b["lib"] and not b["dist"]:
            warn.append("lib/ changed but dist/web-tools.js did not: ?use= fetches the pre-build, so run `npm run build:lib` and commit, or the link serves the old bundle.")
        rts = routes_for(b["lib"])
        direct = set()
        for p in b["lib"]:
            direct |= loads.get(p, set())
        # THREE WAYS A PAGE REACHES A CHANGE, and they are not equally worth
        # linking. A route DECLARES the file as its own code; a page gh.loads
        # it by name; a page importing the pre-build merely carries it, because
        # the bundle holds the whole of lib whether the page renders that
        # component or not. Collapsing the three was this script's own first
        # bug: a one-component change offered seven links, six of which load
        # the code and draw none of it.
        keys = sorted({k for p in b["lib"] for k in rts.get(p, [])})
        if keys:
            subjects.append(("app/index.html", keys[0] if len(keys) == 1 else None, "declared route"))
            if len(keys) > 1:
                warn.append("the file carries " + str(len(keys)) + " routes ("
                            + ", ".join(keys[:6]) + ("…" if len(keys) > 6 else "")
                            + "), so it dates none of them on its own: open the one you changed.")
        for page in sorted(direct):
            if page != "app/index.html" or not keys:
                subjects.append((page, None, "gh.load"))
        carried = sorted(set(prebuilt) - direct - {s[0] for s in subjects})
        why.append("only lib/ or dist/ changed, and a page's own file is untouched, so the deployed page loading the branch's lib is the real thing.")
        if not subjects and carried:
            subjects = [(p, None, "pre-build") for p in carried]
            carried = []
        d = decision("use", [(p, v) for p, v, _ in subjects], sha, slug, hosted, why, warn, facts)
        for l, s3 in zip(d["links"], subjects):
            l["via"] = s3[2]
        if carried:
            d["carried"] = carried
        return d

    why.append("nothing that renders changed.")
    return decision("none-needed", [], sha, slug, hosted, why, warn, facts)


def address(mech, page, sha, slug, view=None):
    base = f"https://{slug.split('/')[0]}.github.io/{slug.split('/')[1]}/"
    pretty = page[:-len("index.html")] if page.endswith("/index.html") else page
    if mech == "use":
        q = f"?use={sha}" + (f"&view={view}" if view else "")
        return base + pretty + q
    if mech == "toss-gh":
        return f"{base}pages/toss-render.html?use={sha}#gh={slug}@{sha}:{page}"
    if mech == "toss-nested":
        return (f"{base}pages/toss-render.html#gh={slug}@{sha}:pages/toss-render.html"
                f"#gh={slug}@{sha}:pages/<the page to render>.html")
    return ""


GLYPH = {"use": "⭐", "toss-gh": "🥏", "toss-nested": "🥏"}


def decision(mech, subjects, sha, slug, hosted, why, warn, facts):
    if not hosted and mech in ("use",):
        warn.append("this repo serves no pages, so ?use= has nothing to pin: use the toss instead.")
        mech = "toss-gh"
    links = [{"page": p, "view": v, "url": address(mech, p, sha, slug, v)} for p, v in subjects]
    return {"mechanism": mech, "sha": sha, "branch": facts["branch"], "pushed": facts["pushed"],
            "repo": slug, "links": links, "why": why, "warnings": warn}


def lines(d):
    out = []
    if d["mechanism"] == "none-needed":
        out.append("No render link: " + " ".join(d["why"]))
    elif d["mechanism"] == "none":
        out.append("No link reaches this. " + " ".join(d["why"]))
        out.append("Send an inspected headless screenshot and say so plainly.")
        out.append("The escape is not a better link but moving the code into lib/, where ?use= reaches it.")
    else:
        g = GLYPH[d["mechanism"]]
        for l in d["links"]:
            via = f"  ({l['via']})" if l.get("via") and l["via"] != "declared route" else ""
            out.append(f"{g} [{l['page']}]({l['url']}){via}")
        out.append("why: " + " ".join(d["why"]))
        if d.get("carried"):
            out.append(f"({len(d['carried'])} more pages import the pre-build, so they LOAD the change "
                       "without rendering it: " + ", ".join(d["carried"][:4])
                       + ("…" if len(d["carried"]) > 4 else "") + ")")
    for w in d["warnings"]:
        out.append("! " + w)
    return out


def main():
    ap = argparse.ArgumentParser(description="Which render link shows this branch's changes.")
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--files", help="comma-separated paths instead of a git diff (for tests)")
    ap.add_argument("--diff", help="a file holding diff text to scan for top-level-document calls, "
                                   "instead of reading git (for tests)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    diff = Path(a.diff).read_text() if a.diff else None
    if a.files is not None:
        # A stated file set pins the SHA too, so a test's expected output does
        # not move with the branch.
        paths = [p for p in a.files.split(",") if p]
        d = pick(paths, a.base, "0" * 40, use_git=False, diff=diff)
    else:
        d = pick(changed(a.base, a.ref), a.base, a.ref, diff=diff)
    print(json.dumps(d, indent=2) if a.json else "\n".join(lines(d)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
