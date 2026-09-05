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

ANOTHER REPO'S PAGES. Run from a checkout other than web-tools (or pass
--root) and the picker reads that repo's `.web-tools.json` instead of this
repo's page graph. A repo whose pages are framed by one app declares it:

    "showing": {"hosted": false,
                "app": "projects/budget-drs/app/view/app.html",
                "app_dir": "projects/budget-drs/app/",
                "views": {"submittal": "projects/budget-drs/submittal/",
                          "cem": "projects/budget-drs/cem/"}}

and a change under a view's prefix, or under `app_dir` (the app's own files;
the folder of `app` when omitted), resolves to
the toss of the APP carrying that view, never the framed page on its own. That
was the largest single cause in the 2026-09-05 read of the session store: of
the render-link corrections that named a cause, "wrong route" (a standalone
page where the app was wanted, `#gz=` where `#gh=` was needed) was 30 of 47,
and the rule lived in prose that three files repeated and nothing executed.
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


class GitFailed(RuntimeError):
    """A git command exited non-zero, carrying stderr so a caller can name the
    remedy rather than guess at one."""

    def __init__(self, args, err):
        self.args, self.err = list(args), err
        super().__init__(" ".join(args) + ": " + (err or "exited non-zero"))


def sh(*args, cwd=None, check=False):
    """stdout, stripped. `check=True` raises instead of letting a failed command
    read as an empty result.

    THAT CONFLATION WAS THIS SCRIPT'S WORST BUG, because it fails in the
    direction of confidence. Every read here goes through one helper that
    returned `.stdout.strip()` and never looked at the exit code, so
    `git diff --name-only base...ref` dying with `fatal: no merge base` produced
    `[]`, and `pick()` walked its whole ladder to the last rung and printed "No
    render link: nothing that renders changed." over a nine-file branch. A
    session read that as a verdict and passed it to the user (2026-09-03, PR
    #574; snag `shallow-clone-has-no-merge-base`).

    So the two reads that decide the answer, `changed` and `diff_text`, ask for
    `check=True`. The incidental ones do not: `git rev-parse origin/<branch>`
    on an unpushed branch SHOULD read as empty, which is how `ref_facts` knows
    it is unpushed."""
    r = subprocess.run(args, cwd=cwd or ROOT, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise GitFailed(args, r.stderr.strip())
    return r.stdout.strip()


def repo_slug():
    url = sh("git", "remote", "get-url", "origin")
    m = re.search(r"[:/]([^/:]+)/([^/]+?)(?:\.git)?$", url)
    return f"{m.group(1)}/{m.group(2)}" if m else "owner/repo"


def manifest_showing():
    """The `showing` block of the root's `.web-tools.json`, or {}."""
    try:
        return json.loads((ROOT / ".web-tools.json").read_text()).get("showing", {}) or {}
    except Exception:
        return {}


def frame():
    """The app that frames this repo's pages, and which prefixes it frames as
    which view, from the manifest. Declared rather than derived because the
    app's own view table is JavaScript, and a view's folder is not its key
    (budget-drs: 4 of 30 folders match a key)."""
    m = manifest_showing()
    app = m.get("app")
    if not app:
        return None
    views = {}
    for key, prefixes in (m.get("views") or {}).items():
        views[key] = [prefixes] if isinstance(prefixes, str) else list(prefixes)
    app_dir = m.get("app_dir") or (app.rsplit("/", 1)[0] + "/" if "/" in app else "")
    if app_dir and not app_dir.endswith("/"):
        app_dir += "/"
    return {"app": app, "dir": app_dir, "views": views}


def hosted_ok():
    """Whether this repo serves its pages. A private repo has no Pages site, so
    every hosted form is off the table there and only the toss reaches anything.
    Declared rather than probed: the answer cannot be had offline, and a wrong
    guess produces a link that 404s for the one reader it was written for."""
    return bool(manifest_showing().get("hosted", True))


# ---- what changed --------------------------------------------------------

def changed(base, ref):
    out = sh("git", "diff", "--name-only", f"{base}...{ref}", check=True)
    return [p for p in out.splitlines() if p]


def diff_remedy(exc, base, ref):
    """Why the diff could not be read, and what to run. One case is named
    because it is the one a Claude Code web session hits every time: the sandbox
    clones shallow, so `base` and `ref` share no ancestor inside the graft
    boundary and the three-dot form has no merge base to resolve.

    The two-dot form is NOT the fallback and is named here so the next reader
    does not reach for it: on a shallow clone it compares two grafted tips, which
    measured 300+ files against a nine-file branch (2026-09-03)."""
    shallow = sh("git", "rev-parse", "--is-shallow-repository") == "true"
    if shallow and "merge base" in exc.err.lower():
        return ("this clone is SHALLOW, so " + base + " and " + ref + " share no ancestor "
                "inside the graft boundary and `" + base + "..." + ref + "` has no merge base. "
                "Run `git fetch --unshallow origin` (about 20s) and re-run. Not the two-dot "
                "form: on a shallow clone it compares two grafted tips and names most of the repo.")
    return "git could not read the diff, so the file list is unknown: " + (exc.err or "non-zero exit")


def uncommitted():
    """Files changed but not committed, staged or not.

    Only ever read when the committed diff is EMPTY, and that is the whole
    reason this exists. `git diff base...ref` is a question about commits, so a
    session that stages its work and asks before committing gets a truthful
    "nothing that renders changed" about a branch that has not been written yet,
    and reads it as a verdict on the work in front of it. That is the same
    silent-and-plausible failure this script was written to end, arriving
    through the one input nobody thought to check. Measured 2026-08-22, on this
    script's own second outing: `npm run showing` ran between `git add -A` and
    `git commit`, said no link, and the session passed that on.
    """
    # Parsed by pattern rather than by column, because sh() strips the whole
    # output and porcelain's status field is two characters wide with a leading
    # space in the common case: the strip eats it, and a fixed l[3:] then bites
    # the first character off the first filename and nothing else's.
    out = sh("git", "status", "--porcelain")
    hits = []
    for line in out.splitlines():
        m = re.match(r"\s*\S{1,2}\s+(.*)", line)
        if m:
            hits.append(m.group(1).strip('"').split(" -> ")[-1])
    return hits


def diff_text(base, ref, paths):
    if not paths:
        return ""
    return sh("git", "diff", f"{base}...{ref}", "--unified=0", "--", *paths, check=True)


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
        if "dist/web-tools.js" in src or "dist/app.js" in src:
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

    fr = frame()
    if fr:
        return pick_framed(paths, fr, base, sha, slug, hosted, warn, use_git)

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
            warn.append("lib/ changed but no dist/ bundle did: ?use= fetches the pre-build (dist/app.js for the app, dist/web-tools.js elsewhere), so run `npm run build:lib` and `npm run build:app` and commit, or the link serves the old bundle.")
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

    if use_git and not paths:
        waiting = uncommitted()
        if waiting:
            warn.append("nothing is committed against " + base + " yet, but " + str(len(waiting))
                        + " file(s) are staged or modified ("
                        + ", ".join(waiting[:4]) + ("…" if len(waiting) > 4 else "")
                        + "): this reads COMMITS, so commit and re-run, or pass --files.")
            why.append("no committed change to show yet.")
            return decision("none-yet", [], sha, slug, hosted, why, warn, facts)
    why.append("nothing that renders changed.")
    return decision("none-needed", [], sha, slug, hosted, why, warn, facts)


def pick_framed(paths, fr, base, sha, slug, hosted, warn, use_git):
    """The manifest-declared case: one app frames the repo's pages.

    Three rungs, in order. A path under a declared view's prefix is that view,
    opened in the app. A path under the app's own folder is the app, bare,
    since which view it draws is not knowable from the path. Any other HTML
    file is tossed on its own and SAID to be unframed, because "not declared"
    and "not framed" are different facts and the manifest only knows the
    first."""
    why, subjects, seen, loose = [], [], set(), []
    for p in paths:
        key = next((k for k, pre in fr["views"].items() if any(p.startswith(x) for x in pre)), None)
        if key:
            sub = (fr["app"], key)
        elif fr["dir"] and p.startswith(fr["dir"]):
            sub = (fr["app"], None)
        elif p.endswith(".html"):
            loose.append(p)
            continue
        else:
            continue
        if sub not in seen:
            seen.add(sub)
            subjects.append(sub)
    if subjects:
        # A view beats the bare app when both are present: the bare row would
        # be a second link to the same page, one tap short of the change.
        keyed = [s for s in subjects if s[1]]
        subjects = keyed or subjects
        why.append(fr["app"] + " frames these pages, so the link is the app carrying the view; "
                   "the framed page on its own is the route the store recorded as wrong most often.")
    if loose and not subjects:
        why.append("an HTML file outside the app changed, so it is tossed on its own.")
    for p in loose:
        subjects.append((p, None))
        warn.append(p + " is not declared under showing.views or the app's folder, so it is "
                    "tossed on its own: if the app frames it, declare it and re-run.")
    if not subjects:
        if use_git and not paths:
            waiting = uncommitted()
            if waiting:
                warn.append("nothing is committed against " + base + " yet, but " + str(len(waiting))
                            + " file(s) are staged or modified (" + ", ".join(waiting[:4])
                            + ("…" if len(waiting) > 4 else "") + "): this reads COMMITS, so commit and re-run, or pass --files.")
                why.append("no committed change to show yet.")
                return decision("none-yet", [], sha, slug, hosted, why, warn, {"branch": "", "pushed": True})
        why.append("nothing that renders changed.")
        return decision("none-needed", [], sha, slug, hosted, why, warn, {"branch": "", "pushed": True})
    return decision("toss-app", subjects, sha, slug, hosted, why, warn, {"branch": "", "pushed": True})


# An MCP-written PR body or comment turns a URL of this many characters or more
# into literal text (SURFACING.md, "Surfacing caption"; measured in
# environment/capabilities.md). Chat is untouched, so this is a warning about
# WHERE the link may go, not about the link.
MCP_URL_CAP = 150


def address(mech, page, sha, slug, view=None):
    base = f"https://{slug.split('/')[0]}.github.io/{slug.split('/')[1]}/"
    pretty = page[:-len("index.html")] if page.endswith("/index.html") else page
    if mech == "use":
        q = f"?use={sha}" + (f"&view={view}" if view else "")
        return base + pretty + q
    if mech == "toss-gh":
        return f"{base}pages/toss-render.html?use={sha}#gh={slug}@{sha}:{page}"
    if mech == "toss-app":
        # The renderer is web-tools' own, on main, so no ?use= pins it; the
        # ref belongs to the framed repo and rides in the #gh= address, where
        # the app's embeds inherit it (home CLAUDE.md, "Render path").
        return (f"https://mehrlander.github.io/web-tools/pages/toss-render.html#gh={slug}@{sha}:{page}"
                + (f"?view={view}" if view else ""))
    if mech == "toss-nested":
        return (f"{base}pages/toss-render.html#gh={slug}@{sha}:pages/toss-render.html"
                f"#gh={slug}@{sha}:pages/<the page to render>.html")
    return ""


GLYPH = {"use": "⭐", "toss-gh": "🥏", "toss-nested": "🥏", "toss-app": "🥏"}


def decision(mech, subjects, sha, slug, hosted, why, warn, facts):
    if not hosted and mech in ("use",):
        warn.append("this repo serves no pages, so ?use= has nothing to pin: use the toss instead.")
        mech = "toss-gh"
    links = [{"page": p, "view": v, "url": address(mech, p, sha, slug, v)} for p, v in subjects]
    over = [l for l in links if len(l["url"]) >= MCP_URL_CAP]
    if over:
        warn.append(f"{len(over)} link(s) run {MCP_URL_CAP}+ characters: fine in chat, literal text in an "
                    "MCP-written PR body or comment. There, drop the link to the chat caption "
                    "(SURFACING.md's shortening ladder) rather than trimming the address by hand.")
    return {"mechanism": mech, "sha": sha, "branch": facts["branch"], "pushed": facts["pushed"],
            "repo": slug, "links": links, "why": why, "warnings": warn}


def lines(d):
    out = []
    if d["mechanism"] == "none-yet":
        # NOT "no render link", which is the answer this case is most easily
        # mistaken for and the one that travels into a reply.
        out.append("Nothing committed yet, so there is nothing to link.")
    elif d["mechanism"] == "unknown":
        # The loudest case in the file, and deliberately not phrased as an
        # answer. "No render link" is what this used to print when the diff
        # failed, and it is indistinguishable from a real verdict.
        out.append("CANNOT TELL: the file list could not be read, so this is NOT "
                   "a \"nothing changed\" answer. Fix the read below and re-run.")
    elif d["mechanism"] == "none-needed":
        out.append("No render link: " + " ".join(d["why"]))
    elif d["mechanism"] == "none":
        out.append("No link reaches this. " + " ".join(d["why"]))
        out.append("Send an inspected headless screenshot and say so plainly.")
        out.append("The escape is not a better link but moving the code into lib/, where ?use= reaches it.")
    else:
        g = GLYPH[d["mechanism"]]
        for l in d["links"]:
            via = f"  ({l['via']})" if l.get("via") and l["via"] != "declared route" else ""
            label = l["page"] + (f" ?view={l['view']}" if d["mechanism"] == "toss-app" and l.get("view") else "")
            out.append(f"{g} [{label}]({l['url']}){via}")
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
    ap.add_argument("--root", help="the checkout to read (default: the git toplevel of the current "
                                   "directory, else this repo); another repo's pages come from its "
                                   ".web-tools.json `showing` block")
    a = ap.parse_args()
    global ROOT
    if a.root:
        ROOT = Path(a.root).resolve()
    else:
        top = sh("git", "rev-parse", "--show-toplevel", cwd=Path.cwd())
        if top:
            ROOT = Path(top)
    diff = Path(a.diff).read_text() if a.diff else None
    if a.files is not None:
        # A stated file set pins the SHA too, so a test's expected output does
        # not move with the branch.
        paths = [p for p in a.files.split(",") if p]
        d = pick(paths, a.base, "0" * 40, use_git=False, diff=diff)
    else:
        try:
            d = pick(changed(a.base, a.ref), a.base, a.ref, diff=diff)
        except GitFailed as e:
            facts = ref_facts(a.ref)
            d = decision("unknown", [], facts["sha"], repo_slug(), hosted_ok(),
                         [], [diff_remedy(e, a.base, a.ref)], facts)
    print(json.dumps(d, indent=2) if a.json else "\n".join(lines(d)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
