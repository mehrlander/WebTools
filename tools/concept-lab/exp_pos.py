#!/usr/bin/env python3
"""Experiment: spaCy noun chunks as the term-candidate source.

The regex harvest (code spans, headings, referential phrases) needs a
stack of gates to hold back adverbs and verb captures. A POS pipeline
gets the same discipline from grammar: noun chunks are term-shaped by
construction. This probes en_core_web_sm over one repo's living prose and
reports the top noun-chunk candidates, their overlap with the regex
harvest, and where the two disagree.

Usage: python3 exp_pos.py repo=/path [--top 30]
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from termlab import STOP, Doc, harvest_candidates, iter_files, normalize_phrase  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("repo")
    p.add_argument("--top", type=int, default=30)
    args = p.parse_args()
    name, _, root = args.repo.partition("=")
    root = Path(root or name)

    import spacy
    nlp = spacy.load("en_core_web_sm", disable=["lemmatizer", "ner"])
    nlp.max_length = 3_000_000

    docs = []
    for path in iter_files(root):
        d = Doc(name, path.relative_to(root).as_posix(), path.read_text(encoding="utf-8", errors="ignore"))
        if d.living:
            docs.append(d)

    chunks = Counter()
    for d in docs:
        for sp in nlp.pipe([d.clean], batch_size=1):
            for ch in sp.noun_chunks:
                term = normalize_phrase(ch.text)
                if term and len(term) > 2 and len(term.split()) <= 4:
                    chunks[term] += 1

    regex_cand, _ = harvest_candidates(docs)
    regex_terms = {t for t, w in regex_cand.items() if w >= 2}

    print(f"living docs: {len(docs)}, noun-chunk types: {len(chunks)}, regex candidate types: {len(regex_terms)}")
    print("\ntop noun chunks:")
    for t, n in chunks.most_common(args.top):
        mark = "=" if t in regex_terms else "+"
        print(f"  {mark} {n:4}  {t}")
    only_regex = regex_terms - set(chunks)
    print(f"\nregex-only candidates (sample of {min(20, len(only_regex))} of {len(only_regex)}):")
    for t in sorted(only_regex, key=lambda x: -regex_cand[x])[:20]:
        print(f"  - {regex_cand[t]:4}  {t}")


if __name__ == "__main__":
    main()
