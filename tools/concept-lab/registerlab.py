#!/usr/bin/env python3
"""Register lab: which phrases in a draft are plain, and which are hip speak.

The third lab in this folder. `termlab` asks whether a term is *ambiguous*;
`entitylab` asks whether a name is *resolvable*; this one asks whether a
phrase is *plain*, in the sense a reader means when they say a passage does
not read like a textbook.

The target is not jargon. Jargon is a solved and separate problem: a term of
art from a real field ("noun phrase", "Dirichlet prior") is fine, because the
reader can look it up and the field will agree on the answer. What this looks
for is the other thing, the register that sits between plain description and
declared vocabulary:

  figurative   a physical or bodily word doing abstract work: the spine, the
               shelf, the mailbox, heavy lifting, load-bearing.
  insider      ordinary English words welded into a private handle: the toss,
               the drain, the rounds, the honesty gate.
  idiom        a fixed figurative multiword borrowed from another domain: the
               fast path, a red build, the binding constraint.

Six signals, each reported separately and each scored on its own against the
hand-labeled set in `data/register-gold.csv`, because the useful output of
this file is not a verdict on a phrase. It is a statement of which measures
carry the distinction and which do not.

  displacement  concreteness of the head minus mean concreteness of the words
                it lives among, over every corpus occurrence. Turney et al.
                2011's abstract-context test: a concrete word in an abstract
                frame is being used figuratively. This is the load-bearing
                one, and the name is deliberate.
  body          highest concreteness over the phrase's content words, so a
                concrete modifier counts even when the head is abstract
                ("heavy lifting", "load-bearing").
  unrated       the head is absent from the 37,058-word norm set. Proxy for
                Latinate or technical vocabulary, which the norms under-cover.
  commonness    general-English frequency (wordfreq zipf) of the head. The
                prediction under test is that hip speak reaches for *common*
                words and terminology reaches for rare ones.
  insider       log ratio of the phrase's rate here to its rate in general
                English. High means this corpus says it far more than English
                does, whatever the words are.
  ungrounded    referential presentation ("the X") against nearby grounding,
                borrowed wholesale from termlab. Coinage, not register.

What works, measured on 76 of the 88 hand-labeled phrases in
`data/register-gold.csv` over three checkouts (2026-08-23):

  signal              all   figurative  insider  idiom
  head concreteness  0.717     0.783     0.574   0.604
  displacement       0.702     0.750     0.576   0.641
  unattested         0.738     0.831     0.738   0.590
  deverbal           0.590     0.501     0.804   0.719
  composite          0.759     0.796     0.622   0.756

Read the columns, not the first one. No single measure is good, and the
reason is that the first column averages three different phenomena: a
figurative phrase is caught by how concrete it is, an insider phrase by how
often the same word is a verb here, and neither measure sees the other's
class at all. The composite that beat its parts is concreteness plus
deverbal share; adding Books attestation lowers it.

What does not work, and each of these is a measurement rather than a guess:

  context concreteness  The Turney test needs an abstract frame to contrast
                        against. Across 76 phrases the mean concreteness of
                        the surrounding ten words runs 2.67 to 3.54, sd 0.15,
                        against sd 0.89 for the phrases themselves. Expository
                        technical prose is uniformly abstract, so there is no
                        contrast to exploit and `displacement` collapses onto
                        the word's own rating.
  frequency contrast    Corpus rate against general-English rate is *inverted*
                        (0.344). It measures topic, not register: `pull
                        request` and `Dirichlet prior` are the phrases this
                        estate says far more than English does.
  Books attestation     Separates alone (0.738) and poisons every composite.
                        "Absent from print" is equally true of a minted
                        compound and of any ordinary modern technical one.
  grounding             0.506, chance. It finds coinage, which is a different
                        question from register: a coinage can be plain and a
                        borrowed idiom can be established.

The open limitation, stated because it bounds every number above: these are
scores on a phrase *type*, not on an occurrence. Nothing here separates a
concrete word used literally from the same word used figuratively, so a draft
saying `windows laptop` and one saying `the spine` are scored alike. The
governing-token gap printed by `flag` is an attempt at it and is not
validated; it correctly promotes `different route` and `sandbox` and
correctly leaves `windows laptop` high, which is a wash.

Usage:
  python3 registerlab.py score  repoA=/path repoB=/path [--gold data/register-gold.csv]
  python3 registerlab.py flag   repoA=/path --file draft.md
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from termlab import (  # noqa: E402
    CONTEXT_RADIUS, GENERIC, STOP, Doc, find_all_occurrences, iter_files,
    normalize_phrase,
)

CONC_PATH = HERE / "data" / "concreteness.tsv"
BOOKS_CACHE = HERE / "data" / "books-cache.json"
GOLD_PATH = HERE / "data" / "register-gold.csv"
MIN_OCC = 2          # occurrences before a corpus-derived signal means anything
CTX_MIN_RATED = 4    # rated context words needed for one occurrence to count


# --------------------------------------------------------------- resources

CONC_URL = ("https://raw.githubusercontent.com/ArtsEngine/concreteness/master/"
            "Concreteness_ratings_Brysbaert_et_al_BRM.txt")


def load_concreteness(path: Path = CONC_PATH) -> dict[str, float]:
    """Brysbaert, Warriner & Kuperman (2014) norms, unigrams only.

    Column 1 is the bigram flag; the multiword rows are a different
    population and mixing them shifts the scale.

    Fetched on first use and left untracked: 1.6 MB of somebody else's survey
    data is a download, not a repo artifact."""
    if not path.exists():
        import urllib.request
        print(f"fetching concreteness norms -> {path}", file=sys.stderr)
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(CONC_URL, timeout=120) as r:
            path.write_bytes(r.read())
    conc = {}
    if not path.exists():
        return conc
    with path.open(encoding="utf-8", errors="replace") as fh:
        next(fh, None)
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) > 2 and p[1] == "0":
                try:
                    conc[p[0].lower()] = float(p[2])
                except ValueError:
                    pass
    return conc


BOOKS_API = "https://books.google.com/ngrams/json"


def books_rates(phrases: list[str], cache_path: Path = BOOKS_CACHE) -> dict[str, float]:
    """Rate per word in the Google Books English 2019 corpus, 2015 to 2019.

    The conventionalization test. A compound attested in books is standard
    English or standard terminology; one absent from 155 billion words of
    print was minted somewhere, and here is a candidate.

    Cached to disk because the answer for a phrase does not change and the
    endpoint is slow and unauthenticated."""
    import urllib.parse, urllib.request
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    todo = [p for p in phrases if p not in cache]
    for i in range(0, len(todo), 8):
        batch = todo[i:i + 8]
        q = urllib.parse.urlencode({
            "content": ",".join(batch), "year_start": 2015, "year_end": 2019,
            "corpus": "en-2019", "smoothing": 3})
        try:
            req = urllib.request.Request(f"{BOOKS_API}?{q}",
                                         headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                got = json.loads(r.read().decode("utf-8"))
        except Exception as e:                       # noqa: BLE001
            print(f"  books batch failed: {e}", file=sys.stderr)
            continue
        found = {}
        for row in got:
            ts = row.get("timeseries") or [0.0]
            found[row["ngram"].lower()] = sum(ts) / len(ts)
        for phrase in batch:
            # absent from the response means zero occurrences, which is the
            # informative answer, not a missing value
            cache[phrase] = found.get(phrase.lower(), 0.0)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, indent=0, sort_keys=True), encoding="utf-8")
    return cache


def load_zipf():
    try:
        from wordfreq import zipf_frequency
    except ImportError:
        return None
    return lambda w: zipf_frequency(w, "en")


# ------------------------------------------------------------------ corpus

def read_docs(repos: dict[str, Path]) -> list[Doc]:
    docs = []
    for name, root in repos.items():
        for path in iter_files(root):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            docs.append(Doc(name, path.relative_to(root).as_posix(), text))
    return docs


# Grounding: a term is grounded near a definition verb, a code span, or a
# parenthetical that names it. Same idea termlab uses, kept local so this
# file can be read on its own.
GROUNDS = re.compile(r"\b(is|are|means|refers to|called|named|defined as)\b", re.I)
REFERENTIAL_DET = re.compile(r"\b(the|this|that|these|those|its|our)\s+$", re.I)


def measure(docs: list[Doc], terms: set[str], conc: dict[str, float]):
    """One pass: per term, occurrence count, mean context concreteness,
    and referential-versus-grounded counts. Living prose only, since a dated
    record is a snapshot of an older register and should not vote on the
    current one."""
    living = [d for d in docs if d.living]
    occs = find_all_occurrences(living, terms)
    out = {}
    for term, hits in occs.items():
        toks = term.split()
        own = set(toks)
        ctx_scores, referential, grounded = [], 0, 0
        by_repo = Counter()
        for doc, i, (lo, hi) in hits:
            by_repo[doc.repo] += 1
            window = doc.filt[max(0, i - CONTEXT_RADIUS): i] + \
                doc.filt[i + len(toks): i + len(toks) + CONTEXT_RADIUS]
            rated = [conc[w] for w in window if w not in own and w in conc]
            if len(rated) >= CTX_MIN_RATED:
                ctx_scores.append(sum(rated) / len(rated))
            before = doc.clean[max(0, lo - 24):lo]
            after = doc.clean[hi:hi + 60]
            if REFERENTIAL_DET.search(before):
                referential += 1
            if GROUNDS.search(after[:40]) or "(" in after[:12] or "`" in before[-3:]:
                grounded += 1
        out[term] = {
            "n": len(hits),
            "ctx_conc": (sum(ctx_scores) / len(ctx_scores)) if ctx_scores else None,
            "ctx_n": len(ctx_scores),
            "referential": referential,
            "grounded": grounded,
            "by_repo": dict(by_repo),
        }
    corpus_tokens = sum(len(d.filt) for d in living)
    return out, corpus_tokens


SENT_CAP = 30           # sentences per head word fed to the tagger


def verb_shares(docs: list[Doc], heads: set[str]) -> dict[str, float]:
    """Share of a word's corpus uses that are tagged VERB.

    The insider class is largely deverbal: `the toss`, `a sweep`, `the drain`,
    `the harvest` are verbs pressed into service as nouns with a determiner
    in front. WordNet would answer this from its lexicon, but the estate has
    already measured that sense counts here index lexicographic attention
    rather than usage, so the corpus is asked instead. A word this corpus uses
    both ways is one whose noun form is a handle somebody minted.

    Sampled rather than exhaustive: the tagger is the expensive step and a
    share estimated on 30 sentences is stable enough to rank on."""
    try:
        import spacy
    except ImportError:
        return {}
    nlp = spacy.load("en_core_web_sm", disable=["ner", "lemmatizer", "parser"])
    sents = defaultdict(list)
    pat = {h: re.compile(rf"[^.!?\n]*\b{re.escape(h)}\b[^.!?\n]*[.!?]") for h in heads}
    for doc in docs:
        if not doc.living:
            continue
        low = doc.clean.lower()
        for h, rx in pat.items():
            if len(sents[h]) >= SENT_CAP or h not in low:
                continue
            for m in rx.finditer(doc.clean):
                sents[h].append(m.group(0)[:400])
                if len(sents[h]) >= SENT_CAP:
                    break
    out = {}
    for h, lst in sents.items():
        if not lst:
            continue
        verb = noun = 0
        for sp in nlp.pipe(lst, batch_size=64):
            for tok in sp:
                if tok.text.lower() != h:
                    continue
                if tok.pos_ == "VERB":
                    verb += 1
                elif tok.pos_ in ("NOUN", "PROPN"):
                    noun += 1
        if verb + noun:
            out[h] = verb / (verb + noun)
    return out


# ----------------------------------------------------------------- signals

def signals(term: str, rec: dict, conc: dict, zipf, corpus_tokens: int,
            books: float | None = None, words: int = 1,
            verb_share: float | None = None) -> dict:
    toks = [t for t in term.split() if t not in STOP]
    head = toks[-1] if toks else term
    content = [t for t in toks if t not in GENERIC] or toks
    rated = [conc[t] for t in content if t in conc]

    head_conc = conc.get(head)
    ctx = rec.get("ctx_conc")
    sig = {
        "n": rec["n"],
        "head": head,
        "head_conc": head_conc,
        "ctx_conc": ctx,
        "displacement": (head_conc - ctx) if (head_conc is not None and ctx is not None) else None,
        "body": max(rated) if rated else None,
        "unrated": 1.0 if head_conc is None else 0.0,
        "commonness": zipf(head) if zipf else None,
        "ungrounded": rec["referential"] / (1 + rec["grounded"]),
        "words": words,
        "deverbal": verb_share,
    }
    # unattested: absent from print. Only asked of compounds, because a
    # single word's Books rate answers for its literal sense and every live
    # metaphor here ("the spine") is attested that way. The measure is a
    # conventionalization test for phrases, not a register test for words.
    if books is None or words < 2:
        sig["unattested"] = None
    else:
        sig["unattested"] = -math.log10(max(books, 1e-12))
    # insider: how much more this corpus says the phrase than English would
    # by chance. Expected rate is the product of the component words' English
    # probabilities, so a multiword coinage is measured against the chance of
    # its words landing together rather than against its rarest word, which
    # was the v1 bug: it scored every minted compound as *less* insider than
    # English, because a phrase is always rarer than any word in it.
    if zipf and rec["n"] and corpus_tokens:
        here = rec["n"] / corpus_tokens
        expected = 1.0
        for t in toks:
            z = zipf(t)
            expected *= (10 ** z) / 1e9 if z else 1e-9
        sig["insider"] = math.log10(max(here, 1e-12) / max(expected, 1e-12))
    else:
        sig["insider"] = None
    return sig


# --------------------------------------------------------------- scoring

def composite(sig: dict) -> float | None:
    """Concreteness plus deverbal share, the one combination that beat its
    own parts (0.759 against 0.717 for concreteness alone).

    Books attestation is deliberately absent. It scores 0.738 on its own and
    drags every composite it joins down to 0.716 or below, because "absent
    from print" is true of a minted compound and of any ordinary modern
    technical compound alike: `the Dirichlet prior`, `the commit hook` and
    `the body sync` all score a perfect zero against Books and are all plain.
    The corpus ends in 2019 and is books, so it cannot see the vocabulary at
    issue. A technical reference corpus would answer; print does not."""
    if sig.get("head_conc") is None:
        return None
    conc = max(0.0, min(1.0, (sig["head_conc"] - 2.5) / 2.5))
    return conc + (sig.get("deverbal") or 0.0)


def auc(pairs: list[tuple[float, int]]) -> float | None:
    """Rank AUC with tie handling. pairs are (score, label 1=hip)."""
    pairs = [(s, y) for s, y in pairs if s is not None]
    pos = [s for s, y in pairs if y == 1]
    neg = [s for s, y in pairs if y == 0]
    if not pos or not neg:
        return None
    wins = 0.0
    for a in pos:
        for b in neg:
            wins += 1.0 if a > b else 0.5 if a == b else 0.0
    return wins / (len(pos) * len(neg))


def load_gold(path: Path):
    rows = []
    for r in csv.DictReader(path.open(encoding="utf-8")):
        key = normalize_phrase(r["phrase"])
        if key:
            rows.append((key, r["phrase"], r["label"], r["kind"], r.get("note", "")))
    return rows


def cmd_score(repos, gold_path, out_json=None):
    conc, zipf = load_concreteness(), load_zipf()
    if not conc:
        sys.exit(f"no concreteness norms at {CONC_PATH}")
    gold = load_gold(gold_path)
    docs = read_docs(repos)
    print(f"docs {len(docs)} ({sum(1 for d in docs if d.living)} living), "
          f"gold {len(gold)}", file=sys.stderr)
    recs, corpus_tokens = measure(docs, {g[0] for g in gold}, conc)
    books = books_rates(sorted({g[1].lower() for g in gold}))
    heads = set()
    for key, *_ in gold:
        t = [w for w in key.split() if w not in STOP]
        if t:
            heads.add(t[-1])
    vshare = verb_shares(docs, heads)
    print(f"tagged verb share for {len(vshare)} of {len(heads)} heads", file=sys.stderr)

    scored, missing = [], []
    for key, phrase, label, kind, note in gold:
        rec = recs.get(key)
        if not rec or rec["n"] < MIN_OCC:
            missing.append((phrase, label, kind, rec["n"] if rec else 0))
            continue
        s = signals(key, rec, conc, zipf, corpus_tokens,
                    books.get(phrase.lower()), len(phrase.split()) - 1,
                    vshare.get(([w for w in key.split() if w not in STOP] or [key])[-1]))
        s.update(phrase=phrase, key=key, label=label, kind=kind, note=note,
                 y=1 if label == "hip" else 0)
        scored.append(s)

    names = ["head_conc", "displacement", "body", "unrated", "commonness",
             "insider", "unattested", "ungrounded", "deverbal", "composite"]

    for s_ in scored:
        s_["composite"] = composite(s_)
    print(f"\nscored {len(scored)} of {len(gold)}; "
          f"{sum(s['y'] for s in scored)} hip / {sum(1 - s['y'] for s in scored)} plain")
    print(f"dropped {len(missing)} for fewer than {MIN_OCC} corpus occurrences\n")
    print(f"{'signal':<14} {'AUC':>6}  {'n':>4}  reading")
    print("-" * 62)
    results = {}
    for nm in names:
        a = auc([(s[nm], s["y"]) for s in scored])
        n = sum(1 for s in scored if s[nm] is not None)
        results[nm] = a
        if a is None:
            print(f"{nm:<14} {'--':>6}  {n:>4}  no variance")
            continue
        read = ("separates" if a >= .70 else "weak" if a >= .60 else
                "chance" if a >= .40 else "inverted")
        print(f"{nm:<14} {a:>6.3f}  {n:>4}  {read}")
    # Context concreteness is the denominator of the displacement measure, so
    # its spread decides whether that measure is doing anything the head's own
    # rating does not.
    ctx = [s["ctx_conc"] for s in scored if s["ctx_conc"] is not None]
    if ctx:
        m = sum(ctx) / len(ctx)
        sd = (sum((x - m) ** 2 for x in ctx) / len(ctx)) ** .5
        hd = [s["head_conc"] for s in scored if s["head_conc"] is not None]
        mh = sum(hd) / len(hd)
        sdh = (sum((x - mh) ** 2 for x in hd) / len(hd)) ** .5
        print(f"\ncontext concreteness  mean {m:.2f}  sd {sd:.2f}  range {min(ctx):.2f}-{max(ctx):.2f}")
        print(f"head concreteness     mean {mh:.2f}  sd {sdh:.2f}  range {min(hd):.2f}-{max(hd):.2f}")

    print("\nby kind (hip kinds against every plain item)")
    print(f"{'kind':<12} {'n':>3}  " + "  ".join(f"{n[:9]:>9}" for n in names))
    print("-" * (18 + 11 * len(names)))
    plain = [s for s in scored if s["y"] == 0]
    for kind in ("figurative", "insider", "idiom"):
        grp = [s for s in scored if s["y"] == 1 and s["kind"] == kind]
        if not grp:
            continue
        cells = []
        for nm in names:
            a = auc([(s[nm], 1) for s in grp] + [(s[nm], 0) for s in plain])
            cells.append(f"{a:>9.3f}" if a is not None else f"{'--':>9}")
        print(f"{kind:<12} {len(grp):>3}  " + "  ".join(cells))

    if out_json:
        Path(out_json).write_text(json.dumps(
            {"auc": results, "rows": scored, "missing": missing}, indent=1), encoding="utf-8")
        print(f"\njson: {out_json}")
    return scored, missing, results


NP_SKIP = re.compile(r"^(it|this|that|they|we|you|i|he|she|there|what|which|who)$", re.I)


def cmd_flag(repos, draft_path: Path, top: int):
    """Read a draft and rank its noun phrases by register.

    The spans come from spaCy noun chunks rather than from a referential
    regex with a hand-kept verb list behind it. That list was what minted
    `corpus leans` and `draft presented` as phrases in the last run of the
    sibling tool: a grammar knows where a noun phrase stops and a word list
    only knows the words somebody remembered to add."""
    import spacy
    conc, zipf = load_concreteness(), load_zipf()
    text = draft_path.read_text(encoding="utf-8")
    text = re.sub(r"```.*?```", " ", text, flags=re.S)      # a fenced block is a demo
    nlp = spacy.load("en_core_web_sm", disable=["ner"])
    spans = Counter()
    govern = defaultdict(list)   # key -> concreteness of each governing token
    for chunk in nlp(text).noun_chunks:
        key = normalize_phrase(chunk.text)
        if key and len(key.split()) <= 4 and not NP_SKIP.match(key):
            spans[key] += 1
            # The governor is the verb the phrase is subject or object of, or
            # the noun it hangs off. Document-level context concreteness came
            # out flat (sd 0.15), so the only place left to look for the
            # abstract frame a live metaphor sits in is the one word that
            # actually predicates something of the phrase.
            gov = chunk.root.head
            if gov is not chunk.root and gov.pos_ in ("VERB", "NOUN", "ADJ", "ADP"):
                g = conc.get(gov.lemma_.lower()) or conc.get(gov.text.lower())
                if g is not None:
                    govern[key].append(g)
    if not spans:
        print("no noun phrases found.")
        return

    docs = read_docs(repos)
    recs, corpus_tokens = measure(docs, set(spans), conc)
    heads = {([w for w in k.split() if w not in STOP] or [k])[-1] for k in spans}
    vshare = verb_shares(docs, heads)

    out = []
    for key, n_draft in spans.items():
        rec = recs.get(key) or {"n": 0, "ctx_conc": None, "ctx_n": 0,
                                "referential": 0, "grounded": 0, "by_repo": {}}
        head = ([w for w in key.split() if w not in STOP] or [key])[-1]
        sig = signals(key, rec, conc, zipf, corpus_tokens, None,
                      len(key.split()), vshare.get(head))
        sc = composite(sig)
        if sc is None:
            continue
        gov = govern.get(key)
        gov_conc = (sum(gov) / len(gov)) if gov else None
        sig["governor_conc"] = gov_conc
        # local displacement: how much more concrete the phrase is than the
        # thing predicated of it in this sentence
        local = None if gov_conc is None or sig["head_conc"] is None else \
            sig["head_conc"] - gov_conc
        sig["local_displacement"] = local
        why = []
        if sig["head_conc"] and sig["head_conc"] >= 4.0:
            why.append(f"concrete head ({sig['head_conc']:.1f})")
        if (sig["deverbal"] or 0) >= 0.15:
            why.append(f"used as a verb {sig['deverbal']:.0%} of the time here")
        if rec["n"] == 0:
            why.append("no corpus record")
        elif sig["ungrounded"] >= 5:
            why.append(f"{rec['referential']} referential uses, {rec['grounded']} grounded")
        if local is not None:
            why.append(f"governor {gov_conc:.1f}, local gap {local:+.1f}")
        out.append((sc, local, key, n_draft, rec["n"], "; ".join(why) or "concreteness only"))

    for label, keyfn in (("composite (concreteness + deverbal)", lambda o: o[0]),
                         ("+ local displacement", lambda o: o[0] + 0.4 * (o[1] or 0))):
        ranked = sorted(out, key=keyfn, reverse=True)
        print(f"\n== ranked by {label} ==")
        print(f"{'score':>5}  {'phrase':<28}{'draft':>5}{'corpus':>7}  why")
        print("-" * 96)
        for o in ranked[:top]:
            print(f"{keyfn(o):>5.2f}  {o[2]:<28}{o[3]:>5}{o[4]:>7}  {o[5]}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["score", "flag"])
    p.add_argument("repos", nargs="+", metavar="name=/path")
    p.add_argument("--gold", type=Path, default=GOLD_PATH)
    p.add_argument("--json", dest="out_json")
    p.add_argument("--file", type=Path, help="draft to flag")
    p.add_argument("--top", type=int, default=25)
    a = p.parse_args()
    repos = {}
    for spec in a.repos:
        name, _, path = spec.partition("=")
        repos[name] = Path(path or name)
    if a.cmd == "flag":
        if not a.file:
            sys.exit("flag needs --file")
        cmd_flag(repos, a.file, a.top)
    else:
        cmd_score(repos, a.gold, a.out_json)


if __name__ == "__main__":
    main()
