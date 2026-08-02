# Concept lab

Experimental ground for the term-and-ambiguity work: what should eventually
feed a concept index (PR #336) and a response-time jargon check, prototyped
against the real estate corpora until the signals earn their keep. Sibling
of the advisory surveys in `home` (`duplicated-claims-survey.py`,
`data-provenance-survey.sh`): heuristic, read-only, evidence not verdicts.

## termlab.py

Dependency-free multi-corpus analyzer. Point it at several repo checkouts;
it scans their Markdown, harvests candidate terms (code spans, headings,
link texts, definition patterns, referential phrases, surface collocations),
and scores five signals:

| Signal | Question it answers | Method |
| --- | --- | --- |
| Signature terms | what are the estate's own coined terms | markedness (how often prose marks the word as a term) × cross-repo spread |
| Surface variants | is one term written several ways | spaced vs hyphenated counts on masked text |
| Sense splits | is one term used with several meanings | greedy cosine clustering of per-occurrence context vectors |
| Cross-repo divergence | does a shared term live in different worlds per repo | Jensen-Shannon divergence of per-repo context distributions |
| Ungrounded reference | which terms are leaned on but never introduced | referential uses ("the spine") vs nearby definitions, links, code spans |

Plus per-repo distinctive vocabulary by log-odds with an informative
Dirichlet prior (Monroe, Colaresi, Quinn 2008).

Run:

```bash
python3 tools/concept-lab/termlab.py \
  wt=/path/web-tools home=/path/home chats=/path/chat-histories bwa=/path/budget-wa \
  --json index.json --report report.md
```

About three minutes for the four-repo estate (~1,600 files). Output JSON is
the machine layer (one record per term, all signals); the report is the
human layer, gated and ranked for reading.

Two design decisions that made the difference between noise and signal, both
measured in [findings.md](findings.md):

- **Living prose is scored separately from records.** Dated chron entries,
  chat-archive derivatives, and data catalogs quote outside material
  (entire budget bills, chat titles); their vocabulary is real but it is
  not the estate's working vocabulary, and unsplit it swamped every
  section. `is_record()` holds the heuristic.
- **Term-ness gates rank, volume does not.** Frequent words win every
  volume-ranked list ("across", "actually"). Markedness, the rate at which
  the prose itself marks a word as a term, is what pushes "board" and
  "stage" above them.

## Relation to the concept-index branch (PR #336)

That branch establishes the representation (`.concept-index/index.json`)
and the delivery path (plugin skill plus opt-in workflow). This lab is
where the analysis inside it gets iterated. Signals that hold up here are
candidates to graduate into `index_repo.py`; the lab stays multi-corpus and
messy on purpose.
