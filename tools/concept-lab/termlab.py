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

try:  # optional: continuous English-commonness prior (pip install wordfreq)
    from wordfreq import zipf_frequency
except ImportError:
    zipf_frequency = None

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
ANCHOR_MIN = 4               # occurrences before a collocate counts as an anchor
ANCHOR_JS = 0.55             # inter-anchor context divergence that reads as two senses
# Determiners never anchor a sense; a few prepositions genuinely do ("on deck").
ANCHOR_STOP = STOP - set("on off up out down over under".split())


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


def cluster_senses(occs: list[dict], idf: dict | None = None):
    """Greedy centroid clustering of occurrence contexts, then a merge pass.
    With idf, context words are weighted by informativeness so ubiquitous
    words stop gluing unrelated occurrences together."""
    clusters = []  # each: {"centroid": Counter, "members": [occ]}
    for occ in occs:
        ctx = occ["ctx"]
        if idf:
            ctx = Counter({w: c * idf.get(w, 1.0) for w, c in ctx.items()})
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
    merged = [c for c in merged if len(c["members"]) >= MIN_CLUSTER]
    # Purity: how much of each cluster's mass sits on words no other cluster
    # of this term uses. Topic-broad words score low; true senses score high.
    if len(merged) >= 2:
        for i, c in enumerate(merged):
            others = set()
            for j, o in enumerate(merged):
                if j != i:
                    others.update(o["centroid"])
            total = sum(c["centroid"].values()) or 1
            c["purity"] = round(sum(v for w, v in c["centroid"].items() if w not in others) / total, 3)
    return merged


def surprise(term: str, mentions: int, corpus_tokens: int) -> float | None:
    """Bits of estate-vs-English overuse. A phrase's English rate is proxied
    by its rarest word, which overestimates it, so phrase surprise runs
    conservative. None when wordfreq is absent."""
    if zipf_frequency is None or not corpus_tokens:
        return None
    z = min(zipf_frequency(w, "en") for w in term.split())
    est_pm = mentions / corpus_tokens * 1e6
    en_pm = 10 ** (z - 3) if z else 0.001
    return round(math.log2(est_pm / max(en_pm, 0.001)), 2)


def anchored_senses(occs: list[dict], needle_len: int, use_disjoint: bool = True):
    """Sketch-style sense detection: group a term's occurrences by their
    immediate raw-text neighbor (left of first word, right of last). Strong
    collocates whose surrounding contexts diverge are distinct senses:
    tracker|board vs investment|board, slide|deck vs on|deck. Measured
    2026-08-02 to beat both context clustering and tiny embeddings on the
    estate's known polysemy; see findings.md."""
    groups = defaultdict(list)
    for o in occs:
        for side, word in o.get("nbrs", ()):
            if word and word not in ANCHOR_STOP and word not in GENERIC:
                groups[(side, word)].append(o)
    anchors = [(k, v) for k, v in groups.items() if len(v) >= ANCHOR_MIN]
    anchors.sort(key=lambda kv: -len(kv[1]))
    # Top anchors by volume, plus the strongest anchor from each repo not
    # already seated. Without the per-repo seats, a dominant repo's
    # collocates fill the table and the minority sense never reaches the
    # pairing ("tracker board" at 7x vs five retirement anchors at 30-80x).
    selected = anchors[:6]
    seated = {k for k, _ in selected}
    for repo in {o["repo"] for _, v in anchors for o in v}:
        for k, v in anchors:
            if k in seated:
                continue
            reps = Counter(o["repo"] for o in v)
            if reps.most_common(1)[0][0] == repo:
                selected.append((k, v))
                seated.add(k)
                break
    anchors = selected
    out = []
    for (side, word), members in anchors:
        ctx = Counter()
        for o in members:
            ctx.update(o["ctx"])
        label = f"{word} {'_' * needle_len}".strip() if side == "L" else f"{'_' * needle_len} {word}"
        out.append({"anchor": word, "side": side, "label": label, "n": len(members),
                    "ctx": ctx, "repos": Counter(o["repo"] for o in members),
                    "example": members[0]})
    # Two collocate groups of a frequent word always diverge lexically, so
    # JS alone reads subtopics as senses ("employer contributions" vs
    # "member contributions"). What separates the real cases (tracker|board
    # vs investment|board, shortcuts|workflow vs github|workflow) is that
    # their anchors live in different repos: that repo-disjointness is the
    # estate-relevant meaning of "ambiguous" and it weights the score.
    pairs = []
    for i, a in enumerate(out):
        for b in out[i + 1:]:
            js = js_divergence(a["ctx"], b["ctx"])
            if js < ANCHOR_JS:
                continue
            disjoint = round(1 - cosine(a["repos"], b["repos"]), 3)
            weight = (0.15 + disjoint) if use_disjoint else 1.0
            pairs.append((round(js * weight * math.log1p(min(a["n"], b["n"], 20)), 3),
                          js, disjoint, a, b))
    pairs.sort(key=lambda x: -x[0])
    split_pairs = pairs[:3]
    score = pairs[0][0] if pairs else 0.0
    return out, split_pairs, score


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


LIVING_USES = {"concept-vocabulary", "prose-review"}


def build(repos: dict[str, Path], min_mentions: int, mode: str = "related"):
    # In a coherent single-subject repo the undated analysis prose IS the
    # repo's voice; only dated snapshot paths count as records there. The
    # broader directory heuristic is for pooled estate runs, where whole
    # data trees quote outside material.
    record_fn = (lambda rel: bool(DATED.search(rel))) if mode == "single" else is_record
    # A repo's epistemic content registry (data/design/content.csv, see
    # registry.py) is authoritative where it declares: exclude drops the
    # file, analysis_use decides living, and only undeclared content falls
    # back to the heuristic. Declaration over observation, per the ADR.
    try:
        from registry import Registry
    except ImportError:
        Registry = None
    registries = {r: Registry.load(root) for r, root in repos.items()} if Registry else {}
    docs: list[Doc] = []
    for repo, root in repos.items():
        reg = registries.get(repo)
        for path in iter_files(root):
            rel = path.relative_to(root).as_posix()
            row = reg.classify(rel) if reg else None
            if row is not None and row.analysis_use == "exclude":
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            doc = Doc(repo, rel, text)
            doc.living = (row.analysis_use in LIVING_USES) if row is not None else not record_fn(rel)
            docs.append(doc)

    cand, per_doc_forms = harvest_candidates(docs)
    coll = collocations(docs)
    terms = {t for t, w in cand.items() if w >= 2} | set(coll)
    # single-word candidates need extra evidence: harvested at least twice
    terms = {t for t in terms if " " in t or cand[t] >= 2}
    terms -= STOP
    terms = {t for t in terms if t not in GENERIC and len(t) > 2}

    all_occs = find_all_occurrences(docs, terms)
    records = {}
    df = Counter()
    for doc in docs:
        df.update(set(doc.filt))
    n_docs = len(docs) or 1
    idf = {w: math.log(n_docs / c) for w, c in df.items()}
    corpus_tokens = sum(len(d.filt) for d in docs)

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
            raw_i = doc.filt_pos[i]
            last = doc.filt_pos[i + len(needle) - 1] if i + len(needle) - 1 < len(doc.filt_pos) else raw_i
            nbrs = []
            if raw_i > 0:
                nbrs.append(("L", doc.tokens[raw_i - 1]))
            if last + 1 < len(doc.tokens):
                nbrs.append(("R", doc.tokens[last + 1]))
            occs.append({"repo": doc.repo, "rel": doc.rel, "ctx": ctx, "doc": doc,
                         "span": span, "living": doc.living, "nbrs": nbrs})
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
                if not record_fn(key[1]):
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

        clusters = cluster_senses(occs_sampled, idf)
        anchors, anchor_pairs, anchor_split = anchored_senses(occs, len(needle), use_disjoint=(mode != "single"))
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
            "anchor_split": anchor_split,
            "anchor_senses": [
                {"pair": [f'{a["label"]} ({a["n"]}x)', f'{b["label"]} ({b["n"]}x)'],
                 "js": js, "disjoint": dj, "min_n": min(a["n"], b["n"]),
                 "repos": [a["repos"].most_common(1)[0][0], b["repos"].most_common(1)[0][0]],
                 "examples": [
                     {"text": snippet(a["example"]["doc"], a["example"]["span"]),
                      "src": f'{a["example"]["repo"]}:{a["example"]["rel"]}'},
                     {"text": snippet(b["example"]["doc"], b["example"]["span"]),
                      "src": f'{b["example"]["repo"]}:{b["example"]["rel"]}'},
                 ]}
                for _, js, dj, a, b in anchor_pairs
            ],
            "surprise": surprise(term, len(occs), corpus_tokens),
            "purity": round(sum(c.get("purity", 0) * len(c["members"]) for c in clusters)
                            / max(1, sum(len(c["members"]) for c in clusters)), 3) if len(clusters) >= 2 else 0.0,
            "clusters": [
                {
                    "size": len(c["members"]),
                    "purity": c.get("purity"),
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


def write_single(data, path: Path, top=30):
    """Mode 1: one repository, one coherent subject. Concepts, their
    senses, their grounding. No cross-repo machinery."""
    recs = list(data["terms"].values())
    repo = next(iter(data["repos"]))
    lines = [f"# Concept report: {repo}", ""]
    lines.append(f"Files scanned from {data['repos'][repo]}. Terms analyzed: {len(recs)}.")

    def concepty(r):
        sur = r.get("surprise")
        return (r["living"] >= 8 and r["file_share"] <= 0.35
                and (r["markedness"] >= 0.05 or (sur is not None and sur >= 2 and r["markedness"] >= 0.02)))

    HEXISH = re.compile(r"[0-9a-f]{4,8}$")
    def identifier(r):
        # code-register vocabulary: underscores, digits or hex fragments
        # (color codes, ids), or words English has never seen (zipf 0 makes
        # surprise explode past anything prose reaches)
        return ("_" in r["term"] or (r.get("surprise") or 0) >= 15
                or any(HEXISH.match(w) or any(c.isdigit() for c in w)
                       for w in r["term"].split()))

    ranked = sorted((r for r in recs if concepty(r)),
                    key=lambda r: -(r["markedness"] * math.log1p(r["living"])
                                    * (0.5 + max(r.get("surprise") or 0, 0))))
    lines += ["", "## Concepts (the repo's own prose vocabulary)", ""]
    for rec in [r for r in ranked if not identifier(r)][:top]:
        lines.append(f'- **{rec["term"]}**: {rec["living"]} living mentions, '
                     f'markedness {rec["markedness"]}, surprise {rec.get("surprise")}, '
                     f'grounded {rec["grounded"]}, referential {rec["referential"]}')
    lines += ["", "## Schema and identifiers (code-register vocabulary)", ""]
    for rec in [r for r in ranked if identifier(r)][:top]:
        lines.append(f'- **{rec["term"]}**: {rec["living"]} living mentions, grounded {rec["grounded"]}')

    lines += ["", "## Senses (anchored splits within this repo)", ""]
    pool = [r for r in recs if r["anchor_senses"] and r["living"] >= 6
            and (r["markedness"] >= 0.03 or (r.get("surprise") or 0) >= 2)]
    for rec in sorted(pool, key=lambda r: -r["anchor_split"])[:top]:
        pr = rec["anchor_senses"][0]
        lines.append(f'### {rec["term"]}  (score {rec["anchor_split"]}, {rec["mentions"]} mentions)')
        lines.append(f'- **{pr["pair"][0]}** vs **{pr["pair"][1]}** (JS {pr["js"]})')
        for ex in pr["examples"]:
            lines.append(f'  > {ex["text"]}  \n  > — `{ex["src"]}`')
        lines.append("")

    lines += ["## Ungrounded (leaned on, never introduced)", ""]
    pool = [r for r in recs if r["living"] >= 8 and r["referential"] >= 5
            and (r["strong_forms"] >= 1 or " " in r["term"]) and r["file_share"] <= 0.3
            and (r.get("surprise") is None or r["surprise"] >= 1.5)]
    for rec in sorted(pool, key=lambda r: -(r["referential"] / (1 + r["grounded"])))[:top]:
        ratio = round(rec["referential"] / (1 + rec["grounded"]), 1)
        if ratio < 3:
            break
        lines.append(f'- **{rec["term"]}**: {rec["referential"]} referential, {rec["grounded"]} grounded; ratio {ratio}')

    lines += ["", "## Surface variants", ""]
    for rec in sorted((r for r in recs if r.get("variants")),
                      key=lambda r: -min(r["variants"].values()))[:top]:
        v = rec["variants"]
        lines.append(f'- **{rec["term"]}**: spaced {v["spaced"]}x, hyphenated {v["hyphenated"]}x')

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_collisions(data, path: Path, top=30):
    """Mode 3: only strong same-term/different-domain cases across repos."""
    recs = list(data["terms"].values())
    lines = ["# Cross-estate collision report", ""]
    lines.append(f'Corpora: {", ".join(data["repos"])}. Only anchor pairs with high '
                 "context divergence AND high repo disjointness qualify; everything "
                 "else belongs in a single-repo report.")

    lines += ["", "## Anchor collisions (same term, different domains)", ""]
    hits = []
    for rec in recs:
        # cross-domain contexts diverge for ANY common word, so the collision
        # list without a term-ness gate is a list of ordinary vocabulary;
        # markedness or surprise must vouch for the term first
        sur = rec.get("surprise")
        if sur is not None and not (sur >= 4 or (sur >= 1 and rec["markedness"] >= 0.03)):
            continue
        if sur is None and rec["markedness"] < 0.03:
            continue
        for pr in rec["anchor_senses"]:
            if pr["js"] >= 0.75 and pr.get("disjoint", 0) >= 0.6 and pr.get("min_n", 0) >= 6:
                hits.append((pr["js"] * pr["disjoint"] * math.log1p(min(pr["min_n"], 20))
                             * (1 + rec["markedness"]), rec, pr))
    hits.sort(key=lambda x: -x[0])
    seen = set()
    shown = 0
    for _, rec, pr in hits:
        if rec["term"] in seen:
            continue
        seen.add(rec["term"])
        lines.append(f'### {rec["term"]}  ({pr["repos"][0]} vs {pr["repos"][1]}, JS {pr["js"]}, disjoint {pr["disjoint"]})')
        lines.append(f'- **{pr["pair"][0]}** vs **{pr["pair"][1]}**')
        for ex in pr["examples"]:
            lines.append(f'  > {ex["text"]}  \n  > — `{ex["src"]}`')
        lines.append("")
        shown += 1
        if shown >= top:
            break

    lines += ["## Context divergence (whole-term, strong support)", ""]
    shown = 0
    for rec in sorted(recs, key=lambda r: -(r["divergence"][0]["js"] if r["divergence"] else 0)):
        if not rec["divergence"] or rec["term"] in seen:
            continue
        d = rec["divergence"][0]
        ra, rb = d["repos"]
        if d["js"] < 0.85 or min(rec["by_repo"].get(ra, 0), rec["by_repo"].get(rb, 0)) < 10:
            continue
        lines.append(f'### {rec["term"]}  (JS {d["js"]}, {ra} {rec["by_repo"].get(ra)}x vs {rb} {rec["by_repo"].get(rb)}x)')
        for r_ in (ra, rb):
            ex = d["examples"][r_]
            lines.append(f'- **{r_}**: [{", ".join(d["top"][r_])}]')
            lines.append(f'  > {ex["text"]}  \n  > — `{r_}:{ex["src"]}`')
        lines.append("")
        shown += 1
        if shown >= top:
            break

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


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
                       and (r.get("surprise") is None or r["surprise"] >= 1.0
                            or r["markedness"] >= 0.08)
                       and sum(1 for n in r["by_repo"].values() if n >= 3) >= 2),
                      key=lambda r: -sig_score(r))[:top]:
        lines.append(
            f'- **{rec["term"]}**: {rec["mentions"]} mentions ({rec["living"]} living) '
            f'across {rec["by_repo"]}; marked {rec["strong_forms"]}×, markedness {rec["markedness"]}, '
            f'surprise {rec.get("surprise")}'
        )

    lines += ["", "## Surface variants (same term, written differently)", ""]
    for rec in sorted((r for r in recs if r.get("variants")),
                      key=lambda r: -min(r["variants"].values()))[:top]:
        v = rec["variants"]
        lines.append(
            f'- **{rec["term"]}**: spaced {v["spaced"]}×, hyphenated {v["hyphenated"]}×; '
            f'repos {rec["by_repo"]}'
        )

    lines += ["", "## Anchored senses (collocates that split a term)", ""]
    pool = [r for r in recs if r["anchor_split"] > 0 and r["living"] >= 6
            and r["file_share"] <= 0.4]
    for rec in sorted(pool, key=lambda r: -r["anchor_split"])[:top]:
        lines.append(f'### {rec["term"]}  (anchor split {rec["anchor_split"]}, '
                     f'surprise {rec.get("surprise")}, {rec["mentions"]} mentions, repos {rec["by_repo"]})')
        for p_ in rec["anchor_senses"]:
            lines.append(f'- **{p_["pair"][0]}** vs **{p_["pair"][1]}** (JS {p_["js"]})')
            for ex in p_["examples"]:
                lines.append(f'  > {ex["text"]}  \n  > — `{ex["src"]}`')
        lines.append("")

    lines += ["", "## Sense splits (one term, multiple lexical neighborhoods)", ""]
    pool = [r for r in recs if r["sense_split"] > 0 and r["markedness"] >= 0.03
            and r["file_share"] <= 0.3
            and (r.get("surprise") is None or r["surprise"] >= 0.5 or r["markedness"] >= 0.05)
            and r["living"] >= 6 and r["living"] / r["mentions"] >= 0.25]
    for rec in sorted(pool, key=lambda r: -r["sense_split"] * (0.2 + r["purity"]))[:top]:
        lines.append(f'### {rec["term"]}  (split {rec["sense_split"]}, purity {rec["purity"]}, '
                     f'surprise {rec.get("surprise")}, {rec["mentions"]} mentions, repos {rec["by_repo"]})')
        for c in rec["clusters"]:
            lines.append(f'- **{c["size"]}×** p{c.get("purity")} [{", ".join(c["top"][:6])}] ({c["repos"]})')
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
            and (r["strong_forms"] >= 1 or " " in r["term"]) and r["file_share"] <= 0.3
            and (r.get("surprise") is None or r["surprise"] >= 1.5)]
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
    p.add_argument("--mode", choices=["single", "related", "collisions"],
                   help="report mode; defaults to single for one repo, related for several")
    args = p.parse_args()
    repos = {}
    for spec in args.repos:
        name, _, path = spec.partition("=")
        repos[name] = Path(path or name).resolve()
    mode = args.mode or ("single" if len(repos) == 1 else "related")
    data = build(repos, args.min_mentions, mode)
    data["mode"] = mode
    writer = {"single": write_single, "collisions": write_collisions}.get(mode, write_report)
    if args.json:
        args.json.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"json: {args.json}")
    if args.report:
        writer(data, args.report)
        print(f"report: {args.report}")
    if not args.json and not args.report:
        writer(data, Path("termlab-report.md"))
        print("report: termlab-report.md")


if __name__ == "__main__":
    main()
