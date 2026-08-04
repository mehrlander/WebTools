#!/usr/bin/env python3
"""Entity profile: what named things does a repo discuss, and of what kinds.

A per-repo NER profile over spaCy's OntoNotes label set, reported rather than
committed. The question it answers is the plain one: point a standard entity
recognizer at each repo and see what comes back, with enough counts, flags, and
source context that the method stays inspectable instead of turning quietly
into something else.

Four levels, kept distinct in the data because collapsing them is what turns an
entity profile into a word list:

  type     an OntoNotes label: ORG, PERSON, LAW.
  name     an extracted surface form: "OFM", "Office of Financial Management".
  mention  one occurrence of a name, with its file and surrounding text.
  entity   the thing two names may both denote. NOT resolved here. The schema
           leaves room (names are never merged, and each keeps its own counts)
           but no normalization is attempted, since alias resolution is its own
           project: spend-wa needed a hand-curated crosswalk to do it for
           vendors alone.

Two families, reported separately, because values outnumber names by an order
of magnitude and would otherwise swamp the profile:

  named    PERSON NORP FAC ORG GPE LOC PRODUCT EVENT WORK_OF_ART LAW LANGUAGE
  value    DATE TIME PERCENT MONEY QUANTITY ORDINAL CARDINAL

Two quality numbers, and they are NOT the same number:

  flag rate    mechanical. The share of a label's names tripping one of the
               shape tests below. Cheap, reproducible, and blind to the failure
               mode that dominates PERSON here (ordinary domain nouns in title
               case). A low flag rate is not a claim of quality.
  precision    adjudicated. Requires a human (or a model acting as one) to read
               a sample and mark each name right or wrong. `worksheet` emits the
               sample; `score` folds the judgments back in. Absent unless
               somebody actually did it.

Usage:
  python3 entityprofile.py scan  name=/path/repo [...] --out prof.json [--sample N]
  python3 entityprofile.py report prof.json --out profiles.md
  python3 entityprofile.py worksheet prof.json --out judge.json [--per-label 12]
  python3 entityprofile.py report prof.json --judgments judge.json --out profiles.md
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from entitylab import iter_files, mask, TEXT_SUFFIXES, MAX_PROSE_BYTES  # noqa: E402

try:
    from wordfreq import zipf_frequency
except ImportError:
    zipf_frequency = None

NAMED = ["ORG", "PERSON", "GPE", "LAW", "NORP", "PRODUCT", "EVENT",
         "WORK_OF_ART", "FAC", "LOC", "LANGUAGE"]
VALUE = ["DATE", "MONEY", "CARDINAL", "PERCENT", "QUANTITY", "ORDINAL", "TIME"]
ALL_LABELS = NAMED + VALUE

CONTEXT = 110          # characters each side of a sampled mention
SAMPLES_PER_NAME = 3   # mentions kept per name; counts stay complete

# ---------------------------------------------------------------- flag tests
#
# Each test is separately named and separately reported. They are deliberately
# crude and deliberately visible: the point is that a reader can see which rule
# fired and disagree with it, not that the set is complete. Measured limitation,
# recorded because it drove the design: the code-shape tests below catch about a
# fifth of PERSON names while by eye more than half are wrong, because the
# dominant PERSON failure is a common domain noun in title case ("Expenditures",
# "Provisos", "Detail"). `common-word` exists to cover exactly that gap.

FLAG_TESTS = {
    "filename": lambda s: bool(re.search(
        r"\.(md|py|js|mjs|json|jsonl|csv|tsv|html?|sh|ya?ml|png|svg|txt|parquet|xlsx?|pdf)$", s, re.I)),
    "path": lambda s: "/" in s or s.startswith("."),
    "identifier": lambda s: bool(re.search(r"_|[a-z][A-Z]", s)),
    "markup": lambda s: bool(re.search(r"[|`~>#*\\\[\]{}]", s)),
    "numeric": lambda s: bool(re.search(r"\d", s)),
    "short-caps": lambda s: bool(re.fullmatch(r"[A-Z0-9]{2,5}", s)),
    "non-ascii-op": lambda s: bool(re.search(r"[≥≤→←…±×÷]", s)),
}


def flag_common_word(s: str) -> bool:
    """A single ordinary English word, however capitalized, is rarely a name.

    zipf 3.0 is about one occurrence per million words. "Expenditures" is 3.52,
    "Provisos" 1.66, and real surnames are 0.0, so the cut separates the
    dominant PERSON failure from actual people. Multiword names are exempt:
    "Health Care Authority" is three common words and a real organization.
    """
    if zipf_frequency is None or len(s.split()) != 1:
        return False
    return zipf_frequency(s.lower(), "en") >= 3.0


def flags_for(name: str) -> list[str]:
    hits = [k for k, fn in FLAG_TESTS.items() if fn(name)]
    if flag_common_word(name):
        hits.append("common-word")
    return hits


# --------------------------------------------------------------------- scan


def scan_repo(label: str, root: Path, nlp, sample: int | None,
              max_bytes: int = 200_000, seed: int = 7) -> dict:
    """Profile one repo.

    `max_bytes` excludes the bulk tail, and the exclusion is reported rather
    than silent. Estate-wide only 123 markdown files exceed 200 KB, and they
    are supplied material rather than the repo's own voice: enrolled bill text,
    ACFR table extracts, raw deep-research transcripts. That is the same split
    termlab draws between living prose and records. It is also where the cost
    sits: a 1.4 MB bill dump is pathological for both the masking regexes and
    the parser, and the first attempt at this scan spent over ten minutes
    inside home's ten largest files alone.
    """
    files = [p for p in iter_files(root, TEXT_SUFFIXES, MAX_PROSE_BYTES)]
    oversize = [p for p in files if p.stat().st_size > max_bytes]
    files = [p for p in files if p.stat().st_size <= max_bytes]
    total_files = len(files) + len(oversize)
    sampled = False
    if sample and len(files) > sample:
        random.Random(seed).shuffle(files)
        files = sorted(files[:sample])
        sampled = True

    texts, rels = [], []
    for path in files:
        try:
            texts.append(mask(path.read_text(encoding="utf-8", errors="replace")))
        except OSError:
            continue
        rels.append(str(path.relative_to(root)))

    counts: dict[str, Counter] = defaultdict(Counter)
    mentions: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    files_with: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))

    for rel, doc in zip(rels, nlp.pipe(texts, batch_size=16, n_process=3)):
        for ent in doc.ents:
            if ent.label_ not in ALL_LABELS:
                continue
            name = re.sub(r"\s+", " ", ent.text).strip()
            # A name that is only whitespace or punctuation is a tokenizer
            # artifact, not a finding.
            if not name or not re.search(r"[A-Za-z0-9]", name) or len(name) > 90:
                continue
            counts[ent.label_][name] += 1
            files_with[ent.label_][name].add(rel)
            bucket = mentions[ent.label_][name]
            if len(bucket) < SAMPLES_PER_NAME:
                a = max(0, ent.start_char - CONTEXT)
                b = min(len(doc.text), ent.end_char + CONTEXT)
                snippet = re.sub(r"\s+", " ", doc.text[a:b]).strip()
                bucket.append({"file": rel, "text": snippet})

    labels = {}
    for lab in ALL_LABELS:
        c = counts.get(lab)
        if not c:
            continue
        names = []
        for name, n in c.most_common():
            names.append({
                "name": name, "mentions": n,
                "files": len(files_with[lab][name]),
                "flags": flags_for(name),
                "samples": mentions[lab][name],
            })
        flagged = sum(1 for e in names if e["flags"])
        labels[lab] = {
            "family": "named" if lab in NAMED else "value",
            "names": len(names), "mentions": sum(c.values()),
            "flagged_names": flagged,
            "flag_rate": round(flagged / len(names), 3) if names else None,
            "flag_reasons": Counter(f for e in names for f in e["flags"]).most_common(),
            "entries": names,
        }
    return {
        "repo": label, "root": str(root),
        "files_scanned": len(rels), "files_total": total_files, "sampled": sampled,
        "skipped_oversize": len(oversize), "max_bytes": max_bytes,
        "labels": labels,
    }


# ------------------------------------------------------------------ worksheet


def worksheet(profiles: list[dict], per_label: int, seed: int = 11) -> dict:
    """Stratified sample for adjudication: is this name really of this type?

    Sampled across the frequency range rather than off the top, since the head
    of a label's list is not representative of it.
    """
    rng = random.Random(seed)
    items = []
    for prof in profiles:
        for lab, d in prof["labels"].items():
            pool = d["entries"]
            if not pool:
                continue
            take = min(per_label, len(pool))
            # Stratify: split the ranked list into `take` bands, draw one each.
            band = len(pool) / take
            for i in range(take):
                lo, hi = int(i * band), max(int(i * band), int((i + 1) * band) - 1)
                e = pool[rng.randint(lo, hi)]
                items.append({
                    "repo": prof["repo"], "label": lab, "name": e["name"],
                    "mentions": e["mentions"], "flags": e["flags"],
                    "rank": pool.index(e) + 1, "of": len(pool),
                    "sample": e["samples"][0]["text"] if e["samples"] else "",
                    "verdict": None,   # "correct" | "wrong" | "unclear"
                })
    return {"note": "Set each verdict to correct, wrong, or unclear. "
                    "Judge the TYPE assignment, not whether the name is interesting.",
            "items": items}


def score(profiles: list[dict], judgments: dict) -> dict:
    per: dict[tuple, Counter] = defaultdict(Counter)
    for it in judgments.get("items", []):
        if it.get("verdict") in ("correct", "wrong", "unclear"):
            per[(it["repo"], it["label"])][it["verdict"]] += 1
    out = {}
    for (repo, lab), c in per.items():
        judged = c["correct"] + c["wrong"]
        out[f"{repo}/{lab}"] = {
            "judged": judged + c["unclear"],
            "correct": c["correct"], "wrong": c["wrong"], "unclear": c["unclear"],
            "precision": round(c["correct"] / judged, 2) if judged else None,
        }
    return out


# --------------------------------------------------------------------- report


def pct(x):
    return "-" if x is None else f"{100 * x:.0f}%"


def render(profiles: list[dict], scores: dict | None) -> str:
    o = ["# Entity profiles", "",
         "One profile per repo from spaCy `en_core_web_sm` over the OntoNotes",
         "label set. Report only: nothing here is committed as a per-repo index,",
         "and no manifest or show-repo surface reads it.", "",
         "**Two numbers, and they measure different things.** *Flag rate* is",
         "mechanical, the share of a label's names tripping a shape test",
         "(filename, identifier, digits, markup, common English word). It is",
         "cheap and reproducible and it is not a quality score. *Precision* is",
         "adjudicated by reading a stratified sample and marking each name right",
         "or wrong for its type. Where precision is absent, nobody has judged",
         "that label and its flag rate says nothing about how good it is.", ""]

    o += ["## Coverage", "", "| repo | files scanned | of total | named names | named mentions | value names | value mentions |",
          "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for p in profiles:
        n = [d for l, d in p["labels"].items() if d["family"] == "named"]
        v = [d for l, d in p["labels"].items() if d["family"] == "value"]
        note = f"{p['files_total']}" + (" (sampled)" if p["sampled"] else "")
        if p.get("skipped_oversize"):
            note += f", {p['skipped_oversize']} skipped >{p['max_bytes']//1000}KB"
        o.append(f"| {p['repo']} | {p['files_scanned']} | {note} | "
                 f"{sum(d['names'] for d in n)} | {sum(d['mentions'] for d in n)} | "
                 f"{sum(d['names'] for d in v)} | {sum(d['mentions'] for d in v)} |")
    o.append("")

    for p in profiles:
        o += [f"## {p['repo']}", ""]
        for family, labs in (("Named entities", NAMED), ("Values", VALUE)):
            present = [l for l in labs if l in p["labels"]]
            if not present:
                continue
            o += [f"### {family}", "",
                  "| type | names | mentions | flag rate | precision | top flag reasons |",
                  "| --- | ---: | ---: | ---: | ---: | --- |"]
            for lab in sorted(present, key=lambda l: -p["labels"][l]["mentions"]):
                d = p["labels"][lab]
                s = (scores or {}).get(f"{p['repo']}/{lab}") or {}
                prec = pct(s.get("precision")) if s.get("precision") is not None else "not judged"
                reasons = ", ".join(f"{k} {v}" for k, v in d["flag_reasons"][:3]) or "-"
                o.append(f"| `{lab}` | {d['names']} | {d['mentions']} | "
                         f"{pct(d['flag_rate'])} | {prec} | {reasons} |")
            o.append("")
            if family == "Named entities":
                for lab in sorted(present, key=lambda l: -p["labels"][l]["mentions"])[:6]:
                    d = p["labels"][lab]
                    o.append(f"**`{lab}`**, top names (flags in brackets):")
                    o.append("")
                    for e in d["entries"][:12]:
                        fl = f" [{', '.join(e['flags'])}]" if e["flags"] else ""
                        o.append(f"- **{e['name']}** {e['mentions']}x in {e['files']} files{fl}")
                    ex = next((e for e in d["entries"][:12] if e["samples"]), None)
                    if ex:
                        o.append("")
                        o.append(f"  > …{ex['samples'][0]['text']}…")
                        o.append(f"  > <sub>`{ex['samples'][0]['file']}`</sub>")
                    o.append("")
    return "\n".join(o)


def render_contrast(profiles: list[dict]) -> str:
    o = ["## Cross-repo contrast", "",
         "The same label across repos, unfiltered. Read it against each repo's",
         "flag rate above: a contrast is only as good as the label carrying it.", ""]
    for lab in ["ORG", "PERSON", "GPE", "LAW", "NORP", "EVENT"]:
        rows = [(p["repo"], p["labels"][lab]) for p in profiles if lab in p["labels"]]
        if not rows:
            continue
        o.append(f"**`{lab}`**")
        o.append("")
        o.append("| repo | names | mentions | flag rate | top names |")
        o.append("| --- | ---: | ---: | ---: | --- |")
        for repo, d in rows:
            top = ", ".join(e["name"] for e in d["entries"][:8])
            o.append(f"| {repo} | {d['names']} | {d['mentions']} | {pct(d['flag_rate'])} | {top} |")
        o.append("")
    return "\n".join(o)


# ----------------------------------------------------------------------- cli


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scan")
    s.add_argument("corpora", nargs="+", metavar="name=path")
    s.add_argument("--out", type=Path, required=True)
    s.add_argument("--sample", type=int, default=None,
                   help="cap files per repo (documented in the report)")
    s.add_argument("--max-bytes", type=int, default=200_000,
                   help="skip files larger than this; count is reported")

    r = sub.add_parser("report")
    r.add_argument("profile", type=Path)
    r.add_argument("--judgments", type=Path)
    r.add_argument("--out", type=Path, required=True)

    w = sub.add_parser("worksheet")
    w.add_argument("profile", type=Path)
    w.add_argument("--out", type=Path, required=True)
    w.add_argument("--per-label", type=int, default=12)

    a = ap.parse_args()

    if a.cmd == "scan":
        import spacy
        nlp = spacy.load("en_core_web_sm", disable=["lemmatizer"])
        profiles = []
        for spec in a.corpora:
            name, path = spec.split("=", 1)
            root = Path(path).expanduser().resolve()
            print(f"scanning {name}…", file=sys.stderr, flush=True)
            profiles.append(scan_repo(name, root, nlp, a.sample, a.max_bytes))
            print(f"  done {name}", file=sys.stderr, flush=True)
        a.out.write_text(json.dumps(profiles, indent=1), encoding="utf-8")
        print(f"wrote {a.out}", file=sys.stderr)

    elif a.cmd == "worksheet":
        profiles = json.loads(a.profile.read_text())
        a.out.write_text(json.dumps(worksheet(profiles, a.per_label), indent=1),
                         encoding="utf-8")
        print(f"wrote {a.out}", file=sys.stderr)

    elif a.cmd == "report":
        profiles = json.loads(a.profile.read_text())
        scores = None
        if a.judgments and a.judgments.exists():
            scores = score(profiles, json.loads(a.judgments.read_text()))
        text = render(profiles, scores)
        if len(profiles) > 1:
            text += "\n" + render_contrast(profiles)
        a.out.write_text(text, encoding="utf-8")
        print(f"wrote {a.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


# ---------------------------------------------------------------- index build
#
# Appended 2026-08-04. The profile JSON is 101 MB because it carries sampled
# mentions; that is a working artifact, not something to commit. This projects
# it down to what a surface actually renders: per-label counts, the top names,
# and the gazetteer-confirmed core. Mentions are dropped entirely. The result is
# a few hundred KB and lands in the private registry, because the names in it
# come from private repos.

def build_index(profiles, confirmed, meta, top_n=20):
    repos = {}
    for p in profiles:
        labels = {}
        for lab, d in p["labels"].items():
            labels[lab] = {
                "family": d["family"], "names": d["names"], "mentions": d["mentions"],
                "flagRate": d["flag_rate"],
                "flagReasons": dict(d["flag_reasons"][:5]),
                "top": [{"name": e["name"], "mentions": e["mentions"],
                         "files": e["files"], "flags": e["flags"]}
                        for e in d["entries"][:top_n]],
            }
        core = [r for r in confirmed.get(p["repo"], []) if r["type_agrees"]]
        repos[p["repo"]] = {
            "filesScanned": p["files_scanned"], "filesTotal": p["files_total"],
            "skippedOversize": p.get("skipped_oversize", 0),
            "sampled": p["sampled"],
            "labels": labels,
            "confirmed": sorted(core, key=lambda r: -r["mentions"]),
        }
    return {"generatedAt": meta["generatedAt"], "method": meta["method"],
            "precision": meta["precision"], "repos": repos}
