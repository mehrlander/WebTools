#!/usr/bin/env python3
"""Term lab: experimental multi-corpus term and ambiguity analysis.

Scans the Markdown prose of one or more repos and looks for the estate's key
terms and the ways they wobble. Dependency-free by design, like the other
advisory surveys in this constellation. Signals, each with its own section in
the report:

  keyness       log-odds with an informative Dirichlet prior (Monroe et al.
                2008): which terms are distinctively *this* repo's vocabulary
                against the rest of the estate.
  sense splits  per-occurrence context clustering: a term whose occurrences
                fall into two or more well-separated lexical neighborhoods is
                a polysemy candidate (used with different meanings).
  divergence    Jensen-Shannon divergence between repos' context
                distributions for shared terms: same word, different worlds.
  grounding     referential presentation ("the spine") vs nearby definitions,
                links, or code spans; heavily referenced but never grounded
                terms are the "assumes you already know" candidates.

Output is evidence with example passages, never a verdict. Everything here is
a heuristic to be read, filtered, and tuned; see the sibling findings.md.

Usage:
  python3 termlab.py repoA=/path/to/repoA repoB=/path/to/repoB \
      [--json out.json] [--report out.md] [--min-mentions 4]
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

TEXT_SUFFIXES = {".md"}
SKIP_DIRS = {
    ".git", ".concept-index", "node_modules", "dist", "vendor", "archive",
    "thumbs", "conversations", "threads-rendered",
}
# Snapshot/export trees in the chat archive are data, not prose we own.
SKIP_PATTERNS = (re.compile(r"\d{4}-\d{2}-\d{2}-.*export"),)

STOP = set(
    "a an and are as at be been but by can could did do does for from had has have he her hers here him his how i if in into is it its just may me might more most much my no nor not of on once one only or other our out over own she so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours also all any because before after both each few during about above below between again further don doesn't isn't it's across inside outside within without behind beyond among along around toward towards onto upon per via versus vs since rather instead every however whether either neither although though unless yet even still e g etc ie".split()
)
# Words too generic to anchor a sense cluster even though they pass STOP.
GENERIC = set(
    "file files new use used using uses way ways thing things work works working session sessions repo repos repository repositories page pages user time first two see run runs running make makes made need needs get gets change changes changed add adds added set line lines link links name names case cases part parts kind rather still already same one like say says want".split()
)
# No hyphen inside a token: "data-view" and "data view" must land on the same
# term key so grounding evidence merges; the variants pass reports the surface
# split separately.
WORD = re.compile(r"[A-Za-z][A-Za-z0-9_']*")
CODE = re.compile(r"`([^`\n]{2,80})`")
HEADING = re.compile(r"^#{1,6}\s+(.+)$", re.M)
LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
DEFINITION = re.compile(
    r"\b([A-Za-z][\w'-]*(?:[\s-]+[A-Za-z][\w'-]*){0,3})\s+(?:is|are|means|refers to|describes)\b", re.I
)
REFERENTIAL = re.compile(r"\b(?:the|this|that|its|our)\s+([A-Za-z][\w-]*(?:[\s-]+[A-Za-z][\w-]*)?)\b", re.I)
URLISH = re.compile(r"https?://\S+|[\w./-]+\.(?:md|html|js|py|json|sh|png|css|yml|mjs|txt|csv)\b")

# Living prose vs records. Dated entries, chat-archive derivatives, and data
# catalogs quote a lot of outside material (whole budget bills, chat titles);
# their vocabulary is real but it is not the estate's own working vocabulary,
# and in v1 it swamped every report section. Heuristic, documented in
# findings.md; tune per estate.
DATED = re.compile(r"(?:^|/)20\d\d-\d\d-\d\d")
RECORD_HINTS = tuple(re.compile(p) for p in (
    r"^chron/", r"^news/", r"^annotations/", r"^results/",
    r"^(analysis|source|normalized|index|schema)/", r"^docs/MERGE-GUIDE",
    r"^pages/drop/", r"^(chronicle|work-history|drs-research|drs-budget|cfl-process|cem|web-tools)\.md$",
))


def is_record(rel: str) -> bool:
    return bool(DATED.search(rel)) or any(p.match(rel) for p in RECORD_HINTS)


CONTEXT_RADIUS = 10          # filtered tokens each side of an occurrence
MAX_OCC_PER_TERM = 400       # cap occurrences fed to clustering
CLUSTER_JOIN = 0.16          # cosine to join an existing sense cluster
CLUSTER_MERGE = 0.5          # cosine at which two clusters are the same sense
MIN_CLUSTER = 3              # occurrences before a cluster counts as a sense


def iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        parts = path.relative_to(root).parts
        if any(p in SKIP_DIRS for p in parts):
            continue
        if any(pat.search(p) for p in parts for pat in SKIP_PATTERNS):
            continue
        yield path


class Doc:
    __slots__ = ("repo", "rel", "text", "clean", "tokens", "spans", "filt", "filt_pos", "living")

    def __init__(self, repo: str, rel: str, text: str):
        self.repo = repo
        self.rel = rel
        self.text = text
        self.living = not is_record(rel)
        # Mask URLs, paths, and fenced code blocks before tokenizing so they
        # don't pollute contexts. Length-preserving, so token spans keep
        # pointing into the original text for snippet extraction.
        blank = lambda m: " " * (m.end() - m.start())
        clean = re.sub(r"```.*?```", blank, text, flags=re.S)
        clean = URLISH.sub(blank, clean)
        self.clean = clean
        self.tokens = []
        self.spans = []
        for m in WORD.finditer(clean):
            self.tokens.append(m.group(0).lower())
            self.spans.append(m.span())
        self.filt = []      # stopword-filtered token stream
        self.filt_pos = []  # index into self.tokens for each filtered token
        for i, tok in enumerate(self.tokens):
            if tok not in STOP:
                self.filt.append(tok)
                self.filt_pos.append(i)


def normalize_phrase(raw: str) -> str:
    toks = [w.lower() for w in WORD.findall(raw)]
    while toks and toks[0] in STOP:
        toks.pop(0)
    while toks and toks[-1] in STOP:
        toks.pop()
    toks = [t for t in toks if t not in STOP]
    return " ".join(toks[:4])


HARVEST_PATS = (
    ("code", CODE, 1), ("heading", HEADING, 2), ("link", LINK, 1),
    ("definition", DEFINITION, 2), ("referential", REFERENTIAL, 1),
)


def harvest_candidates(docs: list[Doc]):
    """Terms the prose itself marks as terms, plus per-doc form evidence."""
    cand = Counter()
    per_doc = {}  # (repo, rel) -> Counter[(kind, term)]
    for doc in docs:
        forms = Counter()
        for kind, pat, weight in HARVEST_PATS:
            for m in pat.finditer(doc.text):
                term = normalize_phrase(m.group(1))
                if term and 2 < len(term) and len(term.split()) <= 4:
                    cand[term] += weight
                    forms[(kind, term)] += 1
        per_doc[(doc.repo, doc.rel)] = forms
    return cand, per_doc


def collocations(docs: list[Doc], top_n: int = 300) -> list[str]:
    """Frequent surface bigrams by PMI. Adjacency is taken on the raw token
    stream, so only phrases that actually appear on the page count; building
    n-grams on the stopword-filtered stream invents phrases like "department
    retirement" out of "department of retirement" (the v1 mistake)."""
    uni, bi = Counter(), Counter()
    for doc in docs:
        uni.update(doc.filt)
        for a, b in zip(doc.tokens, doc.tokens[1:]):
            if a in STOP or b in STOP or a in GENERIC or b in GENERIC:
                continue
            bi[(a, b)] += 1
    total = sum(uni.values()) or 1
    scored = []
    for (a, b), n in bi.items():
        if n < 8:
            continue
        pmi = math.log(n * total / ((uni[a] or 1) * (uni[b] or 1)))
        scored.append((pmi * math.log1p(n), f"{a} {b}"))
    scored.sort(reverse=True)
    return [t for _, t in scored[:top_n]]


def find_all_occurrences(docs: list[Doc], terms: set[str]):
    """One pass per doc: match every term's token sequence against the
    filtered stream. Longest match at a position wins; overlapping shorter
    terms still match at their own positions."""
    by_first = defaultdict(list)
    for t in terms:
        toks = t.split()
        by_first[toks[0]].append((toks, t))
    for lst in by_first.values():
        lst.sort(key=lambda x: -len(x[0]))
    occs = defaultdict(list)  # term -> [(doc, filt index, span)]
    for doc in docs:
        filt = doc.filt
        for i, tok in enumerate(filt):
            for toks, term in by_first.get(tok, ()):
                n = len(toks)
                if filt[i:i + n] == toks:
                    lo = doc.spans[doc.filt_pos[i]][0]
                    hi = doc.spans[doc.filt_pos[i + n - 1]][1]
                    occs[term].append((doc, i, (lo, hi)))
    return occs


def cosine(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    small, big = (a, b) if len(a) < len(b) else (b, a)
    dot = sum(v * big.get(k, 0) for k, v in small.items())
    if not dot:
        return 0.0
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb)


def js_divergence(a: Counter, b: Counter) -> float:
    ta, tb = sum(a.values()), sum(b.values())
    if not ta or not tb:
        return 0.0
    keys = set(a) | set(b)
    js = 0.0
    for k in keys:
        pa, pb = a[k] / ta, b[k] / tb
        m = (pa + pb) / 2
        if pa:
            js += 0.5 * pa * math.log2(pa / m)
        if pb:
            js += 0.5 * pb * math.log2(pb / m)
    return round(js, 3)


def cluster_senses(occs: list[dict]):
    """Greedy centroid clustering of occurrence contexts, then a merge pass."""
    clusters = []  # each: {"centroid": Counter, "members": [occ]}
    for occ in occs:
        ctx = occ["ctx"]
        if not ctx:
            continue
        best, best_sim = None, 0.0
        for cl in clusters:
            sim = cosine(ctx, cl["centroid"])
            if sim > best_sim:
                best, best_sim = cl, sim
        if best is not None and best_sim >= CLUSTER_JOIN:
            best["centroid"].update(ctx)
            best["members"].append(occ)
        elif len(clusters) < 12:
            clusters.append({"centroid": Counter(ctx), "members": [occ]})
        elif best is not None:
            best["members"].append(occ)
    # merge near-duplicate clusters
    merged = []
    for cl in sorted(clusters, key=lambda c: -len(c["members"])):
        for m in merged:
            if cosine(cl["centroid"], m["centroid"]) >= CLUSTER_MERGE:
                m["centroid"].update(cl["centroid"])
                m["members"].extend(cl["members"])
                break
        else:
            merged.append(cl)
    return [c for c in merged if len(c["members"]) >= MIN_CLUSTER]


def log_odds(counts: dict[str, Counter]):
    """Monroe et al. informative-Dirichlet log-odds, per repo vs the rest."""
    bg = Counter()
    for c in counts.values():
        bg.update(c)
    bg_total = sum(bg.values()) or 1
    a0 = 500.0
    out = {}
    for repo, c in counts.items():
        rest = Counter(bg)
        rest.subtract(c)
        n_i, n_j = sum(c.values()) or 1, sum(rest.values()) or 1
        scores = {}
        for term, y_i in c.items():
            a = a0 * bg[term] / bg_total
            y_j = rest[term]
            try:
                d = math.log((y_i + a) / (n_i + a0 - y_i - a)) - math.log((y_j + a) / (n_j + a0 - y_j - a))
                var = 1.0 / (y_i + a) + 1.0 / (y_j + a)
                scores[term] = round(d / math.sqrt(var), 2)
            except ValueError:
                continue
        out[repo] = scores
    return out


def snippet(doc: Doc, span, width=110) -> str:
    lo = max(0, span[0] - width)
    hi = min(len(doc.text), span[1] + width)
    s = " ".join(doc.text[lo:hi].split())
    return (("…" if lo else "") + s + ("…" if hi < len(doc.text) else ""))


def build(repos: dict[str, Path], min_mentions: int):
    docs: list[Doc] = []
    for repo, root in repos.items():
        for path in iter_files(root):
            rel = path.relative_to(root).as_posix()
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            docs.append(Doc(repo, rel, text))

    cand, per_doc_forms = harvest_candidates(docs)
    coll = collocations(docs)
    terms = {t for t, w in cand.items() if w >= 2} | set(coll)
    # single-word candidates need extra evidence: harvested at least twice
    terms = {t for t in terms if " " in t or cand[t] >= 2}
    terms -= STOP
    terms = {t for t in terms if t not in GENERIC and len(t) > 2}

    all_occs = find_all_occurrences(docs, terms)
    records = {}

    for term in terms:
        needle = term.split()
        occs = []
        by_repo_mentions = Counter()
        living_mentions = 0
        for doc, i, span in all_occs.get(term, ()):
            ctx = Counter(
                w for w in doc.filt[max(0, i - CONTEXT_RADIUS): i]
                + doc.filt[i + len(needle): i + len(needle) + CONTEXT_RADIUS]
                if w not in GENERIC and w not in needle
            )
            occs.append({"repo": doc.repo, "rel": doc.rel, "ctx": ctx, "doc": doc,
                         "span": span, "living": doc.living})
            by_repo_mentions[doc.repo] += 1
            living_mentions += doc.living
        if len(occs) < min_mentions:
            continue
        # grounding evidence from the per-doc harvest, dict lookups only
        seen_docs = {(o["repo"], o["rel"]) for o in occs}
        forms, forms_living = Counter(), Counter()
        for key in seen_docs:
            doc_forms = per_doc_forms.get(key, ())
            for kind, _, _ in HARVEST_PATS:
                n = doc_forms[(kind, term)] if (kind, term) in doc_forms else 0
                forms[kind] += n
                if not is_record(key[1]):
                    forms_living[kind] += n

        per_file = Counter()
        occs_for_cluster = []
        for o in occs:
            per_file[(o["repo"], o["rel"])] += 1
            if per_file[(o["repo"], o["rel"])] <= 8:
                occs_for_cluster.append(o)
        if len(occs_for_cluster) > MAX_OCC_PER_TERM:
            step = len(occs_for_cluster) / MAX_OCC_PER_TERM
            occs_sampled = [occs_for_cluster[int(i * step)] for i in range(MAX_OCC_PER_TERM)]
        else:
            occs_sampled = occs_for_cluster

        clusters = cluster_senses(occs_sampled)
        total_in_clusters = sum(len(c["members"]) for c in clusters) or 1
        sense_split = 0.0
        if len(clusters) >= 2:
            masses = [len(c["members"]) / total_in_clusters for c in clusters]
            ent = -sum(p * math.log(p) for p in masses) / math.log(len(clusters))
            sep = 1 - max(
                cosine(a["centroid"], b["centroid"])
                for x, a in enumerate(clusters) for b in clusters[x + 1:]
            ) if len(clusters) > 1 else 0
            sense_split = round(ent * sep * math.log1p(total_in_clusters), 3)

        repo_ctx = defaultdict(Counter)
        for o in occs:
            repo_ctx[o["repo"]].update(o["ctx"])
        div_pairs = []
        rp = [r for r in repos
              if by_repo_mentions[r] >= 6 and sum(repo_ctx[r].values()) >= 60]
        for x, ra in enumerate(rp):
            for rb in rp[x + 1:]:
                div_pairs.append((js_divergence(repo_ctx[ra], repo_ctx[rb]), ra, rb))
        div_pairs.sort(reverse=True)

        strong = forms["code"] + forms["heading"] + forms["definition"]
        strong_living = forms_living["code"] + forms_living["heading"] + forms_living["definition"]
        records[term] = {
            "term": term,
            "_files": list(seen_docs),
            "mentions": len(occs),
            "living": living_mentions,
            "files": len(seen_docs),
            "by_repo": dict(by_repo_mentions),
            "forms": dict(forms),
            "strong_forms": strong,
            "strong_living": strong_living,
            "grounded": forms_living["definition"] + forms_living["code"] + forms_living["link"],
            "referential": forms_living["referential"],
            "sense_split": sense_split,
            "clusters": [
                {
                    "size": len(c["members"]),
                    "top": [w for w, _ in c["centroid"].most_common(8)],
                    "repos": dict(Counter(m["repo"] for m in c["members"])),
                    "example": snippet(c["members"][0]["doc"], c["members"][0]["span"]),
                    "example_src": f'{c["members"][0]["repo"]}:{c["members"][0]["rel"]}',
                }
                for c in clusters[:6]
            ],
            "divergence": [
                {
                    "js": js, "repos": [ra, rb],
                    "top": {
                        ra: [w for w, _ in repo_ctx[ra].most_common(6)],
                        rb: [w for w, _ in repo_ctx[rb].most_common(6)],
                    },
                    "examples": {
                        r: next(
                            {"text": snippet(o["doc"], o["span"]), "src": o["rel"]}
                            for o in occs if o["repo"] == r
                        )
                        for r in (ra, rb)
                    },
                }
                for js, ra, rb in div_pairs[:2]
            ],
        }

    term_counts = {r: Counter() for r in repos}
    for term, rec in records.items():
        for r, n in rec["by_repo"].items():
            term_counts[r][term] += n
    keyness = log_odds(term_counts)
    docs_by_key = {(d.repo, d.rel): d for d in docs}
    for term, rec in records.items():
        rec["keyness"] = {r: keyness[r].get(term, 0.0) for r in repos if rec["by_repo"].get(r)}
        rec["markedness"] = round(min(1.0, rec["strong_living"] / max(1, rec["living"])), 3)
        rec["file_share"] = round(rec["files"] / max(1, len(docs)), 3)
        # surface variants: does the estate write this multiword term with
        # spaces, hyphens, or both?
        words = term.split()
        if 2 <= len(words) <= 3 and rec["mentions"] >= 8:
            pat = re.compile(r"\b" + r"([ -])".join(re.escape(w) for w in words) + r"\b", re.I)
            spaced = hyphenated = 0
            for key in rec.pop("_files", ()):
                doc = docs_by_key.get(key)
                if doc is None:
                    continue
                for m in pat.finditer(doc.clean):
                    if "-" in m.groups():
                        hyphenated += 1
                    else:
                        spaced += 1
            if spaced >= 3 and hyphenated >= 3:
                rec["variants"] = {"spaced": spaced, "hyphenated": hyphenated}
        rec.pop("_files", None)

    return {"repos": {r: str(p) for r, p in repos.items()}, "terms": records}


def is_termy(rec) -> bool:
    """Evidence the estate treats this as a term, not just a word it uses:
    marked as code/heading/definition at least twice, or a multiword phrase."""
    return rec["strong_forms"] >= 2 or " " in rec["term"]


def write_report(data, path: Path, top=25):
    recs = list(data["terms"].values())
    lines = ["# Term lab report", ""]
    lines.append(
        f'Corpora: {", ".join(data["repos"])}. Terms analyzed: {len(recs)}. '
        "Counts split living prose from dated records and quoted material; "
        "report sections gate on the living side."
    )

    lines += ["", "## Estate signature terms (the semantic map's nodes)", ""]
    def sig_score(r):
        spread = sum(1 for n in r["by_repo"].values() if n >= 3)
        return spread * r["markedness"] * math.log1p(r["living"])
    for rec in sorted((r for r in recs if r["living"] >= 20
                       and r["markedness"] >= 0.04 and r["file_share"] <= 0.35
                       and sum(1 for n in r["by_repo"].values() if n >= 3) >= 2),
                      key=lambda r: -sig_score(r))[:top]:
        lines.append(
            f'- **{rec["term"]}**: {rec["mentions"]} mentions ({rec["living"]} living) '
            f'across {rec["by_repo"]}; marked {rec["strong_forms"]}×, markedness {rec["markedness"]}'
        )

    lines += ["", "## Surface variants (same term, written differently)", ""]
    for rec in sorted((r for r in recs if r.get("variants")),
                      key=lambda r: -min(r["variants"].values()))[:top]:
        v = rec["variants"]
        lines.append(
            f'- **{rec["term"]}**: spaced {v["spaced"]}×, hyphenated {v["hyphenated"]}×; '
            f'repos {rec["by_repo"]}'
        )

    lines += ["", "## Sense splits (one term, multiple lexical neighborhoods)", ""]
    pool = [r for r in recs if r["sense_split"] > 0 and r["markedness"] >= 0.03
            and r["file_share"] <= 0.3
            and r["living"] >= 6 and r["living"] / r["mentions"] >= 0.25]
    for rec in sorted(pool, key=lambda r: -r["sense_split"])[:top]:
        lines.append(f'### {rec["term"]}  (split {rec["sense_split"]}, {rec["mentions"]} mentions, repos {rec["by_repo"]})')
        for c in rec["clusters"]:
            lines.append(f'- **{c["size"]}×** [{", ".join(c["top"][:6])}] ({c["repos"]})')
            lines.append(f'  > {c["example"]}  \n  > — `{c["example_src"]}`')
        lines.append("")

    lines += ["## Cross-repo divergence (same term, different worlds)", ""]
    seen = []
    for rec in sorted(recs, key=lambda r: -(r["divergence"][0]["js"] if r["divergence"] else 0)):
        if not rec["divergence"] or not is_termy(rec):
            continue
        seen.append((rec, rec["divergence"][0]))
        if len(seen) >= top:
            break
    for rec, d in seen:
        ra, rb = d["repos"]
        lines.append(f'### {rec["term"]}  (JS {d["js"]}, {ra} {rec["by_repo"].get(ra)}× vs {rb} {rec["by_repo"].get(rb)}×)')
        for r in (ra, rb):
            lines.append(f'- **{r}**: [{", ".join(d["top"][r])}]')
            ex = d["examples"][r]
            lines.append(f'  > {ex["text"]}  \n  > — `{r}:{ex["src"]}`')
        lines.append("")

    lines += ["## Referential but ungrounded (assumes you already know)", ""]
    pool = [r for r in recs if r["living"] >= 8 and r["referential"] >= 5
            and (r["strong_forms"] >= 1 or " " in r["term"]) and r["file_share"] <= 0.3]
    for rec in sorted(pool, key=lambda r: -(r["referential"] / (1 + r["grounded"])))[:top]:
        score = round(rec["referential"] / (1 + rec["grounded"]), 1)
        if score < 3:
            break
        lines.append(
            f'- **{rec["term"]}**: {rec["referential"]} referential uses in living prose, '
            f'{rec["grounded"]} grounded; ratio {score}; repos {rec["by_repo"]}'
        )

    lines += ["", "## Repo-distinctive vocabulary (log-odds keyness)", ""]
    for repo in data["repos"]:
        ranked = sorted(
            (r for r in recs if r["keyness"].get(repo, 0) > 1.96),
            key=lambda r: -r["keyness"][repo],
        )[:15]
        lines.append(f'- **{repo}**: ' + ", ".join(f'{r["term"]} ({r["keyness"][repo]})' for r in ranked))

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("repos", nargs="+", help="name=path pairs")
    p.add_argument("--json", type=Path)
    p.add_argument("--report", type=Path)
    p.add_argument("--min-mentions", type=int, default=4)
    args = p.parse_args()
    repos = {}
    for spec in args.repos:
        name, _, path = spec.partition("=")
        repos[name] = Path(path or name).resolve()
    data = build(repos, args.min_mentions)
    if args.json:
        args.json.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"json: {args.json}")
    if args.report:
        write_report(data, args.report)
        print(f"report: {args.report}")
    if not args.json and not args.report:
        write_report(data, Path("termlab-report.md"))
        print("report: termlab-report.md")


if __name__ == "__main__":
    main()
