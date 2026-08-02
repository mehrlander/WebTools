#!/usr/bin/env python3
"""Experiment: do tiny static embeddings separate a term's senses better
than lexical context clustering, and do immediate collocates carry the
sense signal on their own?

For each probe term, three views over the same occurrences:
  collocates  the token immediately left of the term (tracker|links|
              retirement + board), the cheapest possible sense anchor
  lexical     the termlab cluster assignment (context-vector cosine)
  embedding   model2vec potion-base-8M over occurrence snippets, KMeans
              with silhouette-chosen k, top collocate shown per cluster

Prints per-term tables to eyeball whether embedding clusters align with
collocate groups (the ground truth a human reads off instantly). Requires
model2vec and scikit-learn; degrades to collocates-only without them.

Usage: python3 exp_embed.py wt=/path/... [--terms board,stage,...]
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from termlab import STOP, Doc, find_all_occurrences, iter_files  # noqa: E402

DEFAULT_TERMS = "board,stage,surface,deck,arc,index,workflow,spine,sweep,style"


def load_docs(repos):
    docs = []
    for repo, root in repos.items():
        for path in iter_files(Path(root)):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            docs.append(Doc(repo, path.relative_to(root).as_posix(), text))
    return docs


def main():
    p = argparse.ArgumentParser()
    p.add_argument("repos", nargs="+")
    p.add_argument("--terms", default=DEFAULT_TERMS)
    p.add_argument("--max-occ", type=int, default=300)
    args = p.parse_args()
    repos = dict(spec.partition("=")[::2] for spec in args.repos)
    terms = args.terms.split(",")

    docs = load_docs(repos)
    occs = find_all_occurrences(docs, set(terms))

    try:
        from model2vec import StaticModel
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score
        import numpy as np
        model = StaticModel.from_pretrained("minishlab/potion-base-8M")
    except ImportError:
        model = None
        print("model2vec/sklearn unavailable; collocates only\n")

    for term in terms:
        hits = occs.get(term, [])[: args.max_occ]
        if len(hits) < 10:
            print(f"== {term}: only {len(hits)} occurrences, skipped\n")
            continue
        lefts = Counter()
        snippets = []
        for doc, i, span in hits:
            left = doc.filt[i - 1] if i > 0 else "^"
            lefts[left] += 1
            lo, hi = max(0, span[0] - 120), min(len(doc.text), span[1] + 120)
            snippets.append(" ".join(doc.text[lo:hi].split()))
        print(f"== {term} ({len(hits)} occurrences)")
        strong = [(w, n) for w, n in lefts.most_common(8) if n >= 3 and w not in STOP]
        print(f"   left collocates: {strong}")

        if model is None:
            print()
            continue
        import numpy as np
        emb = model.encode(snippets)
        emb = emb / (np.linalg.norm(emb, axis=1, keepdims=True) + 1e-9)
        best_k, best_s, best_lab = None, -1, None
        for k in (2, 3, 4, 5):
            if k >= len(snippets):
                break
            lab = KMeans(n_clusters=k, n_init=4, random_state=0).fit_predict(emb)
            s = silhouette_score(emb, lab)
            if s > best_s:
                best_k, best_s, best_lab = k, s, lab
        print(f"   embedding: k={best_k} silhouette={best_s:.3f}")
        by_cluster = defaultdict(list)
        for lab, (doc, i, span), snip in zip(best_lab, hits, snippets):
            by_cluster[lab].append((doc, i, snip))
        for lab in sorted(by_cluster, key=lambda l: -len(by_cluster[l])):
            members = by_cluster[lab]
            cl_lefts = Counter(d.filt[i - 1] if i > 0 else "^" for d, i, _ in members)
            top_left = ", ".join(f"{w}({n})" for w, n in cl_lefts.most_common(3))
            repos_in = Counter(d.repo for d, i, _ in members)
            print(f"   - c{lab} n={len(members)} lefts[{top_left}] repos{dict(repos_in)}")
            print(f"     e.g. {members[0][2][:130]}")
        print()


if __name__ == "__main__":
    main()
