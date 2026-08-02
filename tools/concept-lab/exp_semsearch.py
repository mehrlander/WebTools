#!/usr/bin/env python3
"""Experiment: paragraph-level semantic search over the estate.

Not a term signal: a new capability probe. model2vec potion-base-8M
embeds every prose paragraph across the repos; a query embeds the same
way and returns nearest paragraphs. If quality holds, this is the
semantic layer the estate's search story lacks (chat-histories search is
lexical; the file-retrieval skill is ripgrep-based).

Build:  python3 exp_semsearch.py build wt=/path home=/path --store idx
Query:  python3 exp_semsearch.py query --store idx "how do I preview a branch page"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from termlab import Doc, is_record, iter_files  # noqa: E402

MIN_WORDS, MAX_WORDS = 8, 120


def paragraphs(text: str):
    for block in re.split(r"\n\s*\n", text):
        words = block.split()
        if not (MIN_WORDS <= len(words)):
            continue
        for i in range(0, len(words), MAX_WORDS):
            yield " ".join(words[i:i + MAX_WORDS])


def cmd_build(args):
    from model2vec import StaticModel
    import numpy as np
    model = StaticModel.from_pretrained("minishlab/potion-base-8M")
    texts, meta = [], []
    for spec in args.repos:
        name, _, root = spec.partition("=")
        root = Path(root or name)
        for path in iter_files(root):
            rel = path.relative_to(root).as_posix()
            doc = Doc(name, rel, path.read_text(encoding="utf-8", errors="ignore"))
            for para in paragraphs(doc.clean):
                texts.append(para)
                meta.append({"repo": name, "rel": rel, "living": not is_record(rel), "text": para})
    emb = model.encode(texts, show_progress_bar=False)
    emb = emb / (np.linalg.norm(emb, axis=1, keepdims=True) + 1e-9)
    np.save(f"{args.store}.npy", emb.astype("float32"))
    Path(f"{args.store}.jsonl").write_text(
        "\n".join(json.dumps(m, ensure_ascii=False) for m in meta), encoding="utf-8")
    print(f"indexed {len(texts)} paragraphs -> {args.store}.npy/.jsonl")


def cmd_query(args):
    from model2vec import StaticModel
    import numpy as np
    model = StaticModel.from_pretrained("minishlab/potion-base-8M")
    emb = np.load(f"{args.store}.npy")
    meta = [json.loads(l) for l in Path(f"{args.store}.jsonl").read_text(encoding="utf-8").splitlines()]
    q = model.encode([args.text])[0]
    q = q / (np.linalg.norm(q) + 1e-9)
    sims = emb @ q
    order = sims.argsort()[::-1]
    shown = 0
    for i in order:
        m = meta[i]
        if args.living_only and not m["living"]:
            continue
        print(f"[{sims[i]:.3f}] {m['repo']}:{m['rel']}")
        print(f"   {m['text'][:220]}")
        shown += 1
        if shown >= args.k:
            break


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("repos", nargs="+")
    b.add_argument("--store", required=True)
    b.set_defaults(fn=cmd_build)
    q = sub.add_parser("query")
    q.add_argument("text")
    q.add_argument("--store", required=True)
    q.add_argument("-k", type=int, default=5)
    q.add_argument("--living-only", action="store_true")
    q.set_defaults(fn=cmd_query)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
