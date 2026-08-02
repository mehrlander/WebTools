#!/usr/bin/env python3
"""Vocabulary index and reply check.

Two commands:
  index   walk a repo's prose, emit .concept-index/index.json: the terms the repo
          declares, tiered by how they are declared, plus the file list
  check   read text on stdin, report the entities it names: repo paths mentioned
          without a link, and declared terms used without a handle

Why declaration and not statistics. Two statistical rankings were measured and
both failed the same way: context entropy (PR #336) and in-repo IDF each reward
*rare* vocabulary, and a repo's terms of art are its *shared* vocabulary, spread
across files by definition. Nothing distributional separates "workstream" from
"page"; the difference is that the repo defines one. So declaration is ground
truth and frequency is only a tiebreak.
"""
from __future__ import annotations
import argparse, json, re, subprocess, sys, unicodedata
from collections import Counter, defaultdict
from pathlib import Path

TEXT = {".md", ".txt"}
SKIP = {".git", ".concept-index", "node_modules", "dist", "vendor", "archive"}

WORD = re.compile(r"[A-Za-z](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?")
BOLD = re.compile(r"\*\*(.+?)\*\*", re.S)
HEAD = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.M)
ACRO = re.compile(r"\b([A-Z]{2,6})\b")
REFER = re.compile(r"\b(?:the|this|its)\s+((?:[a-z][\w-]*\s+){0,2}[a-z][\w-]*)", re.I)
DEFN = re.compile(r"\b(?:the\s+)?\*\*([^*]{3,40}?)\*\*\s+(?:is|are|means?)\b", re.I)
CODE_SPAN = re.compile(r"`([^`\n]+)`")
LINK = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
FENCE = re.compile(r"^```.*?^```", re.M | re.S)
PATH_TOKEN = re.compile(r"(?<![\w/.-])([\w][\w.-]*(?:/[\w.-]+)+)(?![\w/])")

STOP = set("""a an and are as at be been being but by can cannot do does did doing for from had has
have he her his i if in into is it its may more most no not of on one or our she so than that the
their them then there these they this those to was we were what when where which who will with you
your only every each any all both few some such own same too very just also now well would could
should must might while because since after before above below over under again further once here
why how whom whose am make made makes making get gets got take takes taken use used uses using see
sees seen say says said go goes going come comes came know knows known think thought want wants
give gives given find finds found tell tells told work works worked call calls called try tries
tried ask asks asked need needs needed feel felt become becomes became leave leaves left put puts
mean means meant keep keeps kept let lets run runs ran move moves moved hold holds held bring
brought happen happens happened write writes wrote provide provides provided include includes
included continue continues set sets learn change changes changed lead leads led understand follow
follows followed stop stops create creates created speak read reads allow allows allowed add adds
added spend grow open opens opened offer offers remember appear appears appeared buy wait serve
send sends sent build builds built stay fall cut reach remain remains remained thing things way
ways time times day days year years first second third last next new old good bad big small long
short high low right left other another much many little able sure whole real true false yes still
even ever never always often sometimes usually rather quite almost enough less least best better
worse worst about against between through during without within along across behind beyond plus
minus per via whether either neither nor yet though although unless until upon whenever wherever
however therefore thus hence moreover furthermore instead""".split())

# Field names from a template are declared vocabulary but not terms of art. They
# give themselves away by appearing in a large share of a repo's files, always in
# the same slot. A cap on document share separates them without a hand list.
#
# The floors matter as much as the share. On a small corpus a share means
# nothing: in a four-file fixture every term used twice is over 30%, which
# swallowed the whole vocabulary before these were added.
TEMPLATE_SHARE = 0.30
TEMPLATE_MIN_CORPUS = 20
TEMPLATE_MIN_FILES = 8


# ---------------------------------------------------------------- shared helpers

def repo_files(root: Path):
    """Tracked files if this is a git checkout, else a walk. Used for both the
    prose corpus and the path list the check command resolves against."""
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files"],
                             capture_output=True, text=True, timeout=30)
        if out.returncode == 0 and out.stdout.strip():
            return [p for p in out.stdout.splitlines() if p]
    except Exception:
        pass
    return [p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()]


def prose(root: Path, paths, exclude=()):
    for rel in paths:
        p = root / rel
        if any(rel.startswith(x) for x in exclude):
            continue
        if p.suffix.lower() in TEXT and not any(x in SKIP for x in Path(rel).parts):
            try:
                yield rel, p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue


def clean(raw: str) -> str:
    s = CODE_SPAN.sub(" ", raw.strip())
    s = LINK.sub(r"\1", s)
    s = re.sub(r"[*_`]", "", s)
    s = "".join(c for c in s if unicodedata.category(c)[0] not in "SC")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = s.strip().rstrip(":.,;").strip()
    s = re.sub(r"^(the|a|an|its|this|that|our)\s+", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).lower()


def trim(term: str) -> str:
    out = []
    for w in term.split():
        if out and w in STOP:
            break
        out.append(w)
    return " ".join(out[:4])


def plausible(term: str) -> bool:
    if not term or len(term) < 3:
        return False
    w = term.split()
    if not (1 <= len(w) <= 4) or w[0] in STOP or w[-1] in STOP:
        return False
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9 ._-]*", term))


def line_at(text: str, s: int) -> str:
    lo = text.rfind("\n", 0, s) + 1
    hi = text.find("\n", s)
    return text[lo:hi if hi > 0 else len(text)]


def has_handle(text: str, s: int, term: str) -> bool:
    """A handle names the term. A link or code span merely nearby does not count:
    measured on SURFACING.md, a 200-character window contains some link for 9 of
    9 mentions of 'toss', which makes the loose test unable to say anything."""
    line = line_at(text, s)
    head = term.split()[0]
    for label, _url in LINK.findall(line):
        if head in label.lower():
            return True
    for span in CODE_SPAN.findall(line):
        if head in span.lower():
            return True
    # A gloss in parentheses right after the mention also grounds it.
    tail = text[s:s + len(term) + 90]
    return bool(re.search(re.escape(term) + r"\s*[(—,:]", tail, re.I))


def referential_at(text: str, s: int) -> bool:
    return bool(re.search(r"\b(the|this|that|its|our)\s+$", text[max(0, s - 12):s], re.I))


def scan(texts, cands):
    """One tokenizing pass per document; n-gram lookup against the candidate set."""
    by_n = defaultdict(set)
    for t in cands:
        by_n[len(t.split())].add(t)
    ns = sorted(by_n)
    hits = defaultdict(list)
    for rel, text in texts.items():
        toks = [(m.group(0).lower(), m.start(), m.end()) for m in WORD.finditer(text)]
        L = len(toks)
        for i in range(L):
            for n in ns:
                if i + n > L:
                    break
                phrase = " ".join(w for w, _, _ in toks[i:i + n])
                if phrase in by_n[n]:
                    hits[phrase].append((rel, toks[i][1], toks[i + n - 1][2]))
    return hits


# ---------------------------------------------------------------------- indexing

def collect(texts):
    decl = defaultdict(list)
    refer, acro = Counter(), Counter()
    for rel, text in texts.items():
        for rx, chan in ((BOLD, "bold"), (HEAD, "heading"), (DEFN, "definition")):
            for m in rx.finditer(text):
                t = clean(m.group(1))
                if plausible(t):
                    decl[t].append((rel, chan, re.sub(r"\s+", " ", line_at(text, m.start())).strip()))
        for m in ACRO.finditer(text):
            acro[m.group(1)] += 1
        for m in REFER.finditer(text):
            t = trim(clean(m.group(1)))
            if plausible(t):
                refer[t] += 1
    cands = set(decl)
    cands |= {t for t, n in refer.items() if n >= 3}
    cands |= {a.lower() for a, n in acro.items() if n >= 4}
    return cands, decl


def build_index(root: Path, hubs, exclude=()):
    paths = repo_files(root)
    texts = dict(prose(root, paths, exclude))
    N = max(len(texts), 1)
    cands, decl = collect(texts)
    hits = scan(texts, cands)

    rows = []
    for term in cands:
        occ = hits.get(term, [])
        if not occ:
            continue
        df = len({r for r, _, _ in occ})
        sites = decl.get(term, [])
        in_hub = sorted({r for r, _, _ in sites if r in hubs})
        share = df / N
        if (share > TEMPLATE_SHARE and N >= TEMPLATE_MIN_CORPUS
                and df >= TEMPLATE_MIN_FILES):
            tier = "template"
        elif in_hub:
            tier = "canonical"
        elif sites and (df >= 2 or len(occ) >= 5):
            tier = "local"
        elif len(occ) >= 5 and df >= 2 and (len(term.split()) > 1 or re.search(r"[-.]", term)):
            tier = "assumed"
        else:
            continue
        bare = sum(1 for r, s, e in occ
                   if referential_at(texts[r], s) and not has_handle(texts[r], s, term))
        gloss = next((g for _, c, g in sites if c in ("definition", "bold") and g), "")
        rows.append({
            "term": term, "tier": tier, "uses": len(occ), "files": df,
            "share": round(share, 3),
            "declared_in": (in_hub or sorted({r for r, _, _ in sites}))[:3],
            "channels": sorted({c for _, c, _ in sites}),
            "bare_uses": bare, "bare_ratio": round(bare / len(occ), 2),
            "gloss": gloss[:300],
        })
    order = {"canonical": 0, "local": 1, "assumed": 2, "template": 3}
    rows.sort(key=lambda r: (order[r["tier"]], -r["uses"]))
    return {"schema": 2, "files_scanned": N, "tiers": dict(Counter(r["tier"] for r in rows)),
            "paths": paths, "terms": rows}


# ------------------------------------------------------------------------ check

def check_text(index, text, repo=None, ref="main", tier_filter=None):
    """The reply check: what did this text name, and did it give a handle?"""
    def url(p):
        return f"https://github.com/{repo}/blob/{ref}/{p}" if repo else p

    # A fenced block is a demonstration, not prose. Measured on a reply of mine:
    # 7 of 12 flags came from one code block quoting a tool's own output.
    text = FENCE.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    known = set(index.get("paths", []))
    basenames = defaultdict(list)
    for p in known:
        basenames[p.rsplit("/", 1)[-1]].append(p)

    linked = {u for _, u in LINK.findall(text)}
    linked_text = " ".join(lbl for lbl, _ in LINK.findall(text))

    # 1. Repo paths named without a link. Decidable, so it leads.
    paths_found = []
    for m in PATH_TOKEN.finditer(text):
        tok = m.group(1).rstrip(".,;:)")
        hit = tok if tok in known else None
        if not hit and tok in basenames and len(basenames[tok]) == 1:
            hit = basenames[tok][0]
        if not hit:
            continue
        inside = any(tok in u for u in linked) or tok in linked_text
        if not inside and not any(p["path"] == hit for p in paths_found):
            paths_found.append({"path": hit, "as_written": tok, "url": url(hit)})

    # 2. Declared terms used without a handle at first mention.
    tiers = set(tier_filter or ("canonical",))
    by_term = {t["term"]: t for t in index["terms"] if t["tier"] in tiers}
    hits = scan({"_": text}, set(by_term))
    terms_found = []
    for term, occ in hits.items():
        s = occ[0][1]
        if has_handle(text, s, term):
            continue
        # A single ordinary word used attributively ("bare paths") is not the
        # reader's problem; a definite reference to it ("the stage link") is.
        if len(term.split()) == 1 and not referential_at(text, s):
            continue
        row = by_term[term]
        if row["tier"] == "canonical" or row["uses"] >= 8:
            terms_found.append({
                "term": term, "tier": row["tier"], "mentions": len(occ),
                "declared_in": row["declared_in"],
                "url": url(row["declared_in"][0]) if row["declared_in"] else None,
                "gloss": row["gloss"][:200],
            })
    terms_found.sort(key=lambda r: (r["tier"] != "canonical", -r["mentions"]))
    return {"paths_unlinked": paths_found, "terms_unhandled": terms_found}


def render(res):
    out = []
    if res["paths_unlinked"]:
        out.append(f"Repo files named without a link ({len(res['paths_unlinked'])}):")
        for p in res["paths_unlinked"]:
            out.append(f"  - {p['as_written']}  ->  {p['url']}")
    if res["terms_unhandled"]:
        out.append(f"\nDeclared terms used without a handle ({len(res['terms_unhandled'])}):")
        for t in res["terms_unhandled"]:
            src = t["declared_in"][0] if t["declared_in"] else "?"
            out.append(f"  - {t['term']}  [{t['tier']}, x{t['mentions']}]  defined in {src}")
            if t["gloss"]:
                out.append(f"      {t['gloss'][:150]}")
    return "\n".join(out) or "nothing flagged"


# ------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("index")
    i.add_argument("root", nargs="?", default=".")
    i.add_argument("--output", default=".concept-index/index.json")
    i.add_argument("--hub", action="append", default=[],
                   help="exact repo-relative path of a governing doc (repeatable)")
    i.add_argument("--exclude", action="append", default=[])
    c = sub.add_parser("check")
    c.add_argument("--index", required=True)
    c.add_argument("--repo")
    c.add_argument("--ref", default="main")
    c.add_argument("--json", action="store_true")
    c.add_argument("--tier", action="append", default=[])
    a = ap.parse_args()

    if a.cmd == "index":
        root = Path(a.root).resolve()
        idx = build_index(root, tuple(a.hub), tuple(a.exclude))
        out = Path(a.output) if Path(a.output).is_absolute() else root / a.output
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(idx, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{out}  ({idx['files_scanned']} files, {idx['tiers']})")
    else:
        idx = json.loads(Path(a.index).read_text(encoding="utf-8"))
        res = check_text(idx, sys.stdin.read(), a.repo, a.ref, tuple(a.tier) or None)
        print(json.dumps(res, indent=2, ensure_ascii=False) if a.json else render(res))


if __name__ == "__main__":
    main()
