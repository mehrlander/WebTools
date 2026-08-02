#!/usr/bin/env python3
"""Semantic search over the estate's prose, paragraph by paragraph.

model2vec potion-base-8M embeds every prose paragraph across the given
repos (~59k paragraphs in under 30 seconds for the four-repo estate, no
torch); a query embeds the same way and returns nearest paragraphs. This
is the "where did we settle X" layer that lexical search cannot answer;
it complements ripgrep and the chat-archive catalog rather than
replacing them. Graduated from concept-lab (exp_semsearch) 2026-08-02;
measured examples in tools/concept-lab/findings.md.

The vector store is derived data: rebuild at will, never commit it. The
default location `.concept-lab/semidx` is gitignored.

Build:  python3 tools/semsearch.py build wt=/path home=/path
Query:  python3 tools/semsearch.py query "how do I preview a branch page"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "concept-lab"))
from termlab import Doc, is_record, iter_files  # noqa: E402

MIN_WORDS, MAX_WORDS = 8, 120


def paragraphs(text: str):
    for block in re.split(r"\n\s*\n", text):
        words = block.split()
        if not (MIN_WORDS <= len(words)):
            continue
        for i in range(0, len(words), MAX_WORDS):
            chunk = words[i:i + MAX_WORDS]
            # a runt tail chunk embeds near everything meta; fold it away
            if len(chunk) >= MIN_WORDS:
                yield " ".join(chunk)


def cmd_build(args):
    from model2vec import StaticModel
    import numpy as np
    Path(args.store).parent.mkdir(parents=True, exist_ok=True)
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
    default_store = str(Path(__file__).resolve().parent.parent / ".concept-lab" / "semidx")
    b = sub.add_parser("build")
    b.add_argument("repos", nargs="+")
    b.add_argument("--store", default=default_store)
    b.set_defaults(fn=cmd_build)
    q = sub.add_parser("query")
    q.add_argument("text")
    q.add_argument("--store", default=default_store)
    q.add_argument("-k", type=int, default=5)
    q.add_argument("--living-only", action="store_true")
    q.set_defaults(fn=cmd_query)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
