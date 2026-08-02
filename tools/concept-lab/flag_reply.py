#!/usr/bin/env python3
"""Flag risky vocabulary in a draft reply, using a termlab index.

The response-time half of the term lab: termlab.py studies the corpus,
this reads a draft (stdin or --file) and reports which of its terms the
corpus marks as trouble. Four flags, each with the evidence behind it:

  ambiguous    the term's corpus occurrences cluster into multiple senses;
               the draft should make clear which one it means
  divergent    the term means different things in different repos; risky
               in a cross-repo reply
  ungrounded   the corpus leans on the term referentially but rarely
               grounds it; the draft repeating "the <term>" compounds it
  repo-local   the term is strongly one repo's vocabulary; a reader from
               elsewhere in the estate may not know it

Plus `novel`: a multiword phrase the draft presents referentially ("the
frobnicator") that the corpus has never seen; new coinage or hallucinated
jargon, either way worth a look.

Exit code 0 always; this is advisory, in the idiom of the estate's other
surveys. Intended to sit behind a Stop-hook someday; runs standalone now.

Usage:
  python3 flag_reply.py --index index.json [--file reply.md] [--max 20]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from termlab import GENERIC, REFERENTIAL, STOP, Doc, normalize_phrase  # noqa: E402

# Adverbs and connectives that ride into a referential capture ("the spine
# now carries") and mint phantom phrases.
NON_PHRASE = set("now then later again once twice above below former latter following next last".split())
# Verbs that end a noun phrase; capture is truncated at the first one, an
# idea adopted from the concept-index branch's BOUNDARY set.
VERBS = set("adds allows appears becomes builds calls carries changes contains creates defines describes drives enables explains finds found frames gives has holds includes invokes keeps lands looks makes means moves needs offers organizes points provides reads records refers reflects resolves routed routes runs says sees shows staged stays stores supports takes tells uses writes".split())

AMBIG_SPLIT = 3.0        # sense_split at or above this reads as multi-sense
MIN_MARKEDNESS = 0.03    # the corpus must treat the word as a term at all
MAX_FILE_SHARE = 0.3     # ubiquitous words are style, not jargon
DIVERGE_JS = 0.75        # top JS divergence at or above this reads as split worlds
UNGROUNDED_RATIO = 5.0   # living referential-to-grounded ratio
KEYNESS_LOCAL = 10.0     # log-odds z at or above this reads as one repo's word
LOCAL_SHARE = 0.75       # share of mentions in the leading repo


def load_index(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["terms"]


def find_terms(doc: Doc, terms):
    by_first = {}
    for t in terms:
        by_first.setdefault(t.split()[0], []).append(t.split())
    for lst in by_first.values():
        lst.sort(key=len, reverse=True)
    found = {}
    i = 0
    while i < len(doc.filt):
        for toks in by_first.get(doc.filt[i], ()):
            if doc.filt[i:i + len(toks)] == toks:
                found.setdefault(" ".join(toks), 0)
                found[" ".join(toks)] += 1
                i += len(toks) - 1
                break
        i += 1
    return found


def flags_for(rec):
    out = []
    # A flag is only worth interrupting for when the corpus treats the word
    # as a term (markedness) and it is not simply everywhere (file share).
    if rec.get("markedness", 0) < MIN_MARKEDNESS or rec.get("file_share", 1) > MAX_FILE_SHARE:
        return out
    if rec["sense_split"] >= AMBIG_SPLIT and len(rec["clusters"]) >= 2:
        tops = " / ".join(", ".join(c["top"][:3]) for c in rec["clusters"][:3])
        out.append(("ambiguous", f'{len(rec["clusters"])} senses in corpus: {tops}'))
    if rec["divergence"] and rec["divergence"][0]["js"] >= DIVERGE_JS:
        d = rec["divergence"][0]
        ra, rb = d["repos"]
        out.append(("divergent", f'{ra} [{", ".join(d["top"][ra][:3])}] vs {rb} [{", ".join(d["top"][rb][:3])}] (JS {d["js"]})'))
    if rec["referential"] >= 5 and rec["referential"] / (1 + rec["grounded"]) >= UNGROUNDED_RATIO:
        out.append(("ungrounded", f'{rec["referential"]} referential uses, {rec["grounded"]} grounded in living prose'))
    total = sum(rec["by_repo"].values())
    if total >= 10 and rec.get("keyness"):
        top_repo, share = max(rec["by_repo"].items(), key=lambda kv: kv[1])
        if share / total >= LOCAL_SHARE and rec["keyness"].get(top_repo, 0) >= KEYNESS_LOCAL:
            out.append(("repo-local", f'{round(100 * share / total)}% of uses in {top_repo} (keyness {rec["keyness"][top_repo]})'))
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--index", type=Path, required=True)
    p.add_argument("--file", type=Path)
    p.add_argument("--max", type=int, default=20)
    args = p.parse_args()

    text = args.file.read_text(encoding="utf-8") if args.file else sys.stdin.read()
    terms = load_index(args.index)
    doc = Doc("draft", "draft.md", text)

    used = find_terms(doc, terms)
    findings = []
    for term, n in used.items():
        rec = terms[term]
        for kind, why in flags_for(rec):
            findings.append((kind, term, n, why))

    # Referential presentation of phrases the corpus has never seen.
    known = set(terms)
    seen_novel = set()
    for m in REFERENTIAL.finditer(text):
        phrase = normalize_phrase(m.group(1))
        words = phrase.split()
        for k, w in enumerate(words):
            if w in VERBS:
                words = words[:k]
                break
        phrase = " ".join(words)
        if (phrase and len(words) >= 2 and phrase not in known
                and phrase not in seen_novel
                and not any(w in STOP or w in GENERIC or w in NON_PHRASE for w in words)):
            seen_novel.add(phrase)
            findings.append(("novel", phrase, 1, "presented as established; corpus has no record of it"))

    order = {"ambiguous": 0, "divergent": 1, "ungrounded": 2, "repo-local": 3, "novel": 4}
    findings.sort(key=lambda f: (order[f[0]], -f[2]))
    if not findings:
        print("No flags.")
        return
    for kind, term, n, why in findings[:args.max]:
        print(f"[{kind}] {term} (×{n}): {why}")
    if len(findings) > args.max:
        print(f"… {len(findings) - args.max} more (raise --max)")


if __name__ == "__main__":
    main()
