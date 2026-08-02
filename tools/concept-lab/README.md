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

Optional dependencies sharpen it (`pip install wordfreq scikit-learn
model2vec spacy`): wordfreq backs the surprise prior, model2vec and
scikit-learn back `exp_embed.py`. Everything degrades to the
dependency-free path without them.

Run (three modes; defaults to `single` for one repo, `related` for several):

```bash
python3 tools/concept-lab/termlab.py bwa=/path/budget-wa --report bwa.md
python3 tools/concept-lab/termlab.py wt=... home=... --report related.md
python3 tools/concept-lab/termlab.py wt=... home=... chats=... bwa=... \
  --mode collisions --report collisions.md
```

`single` is the concept report for one coherent corpus (concepts split
into prose and code registers, within-repo senses, grounding, variants).
`related` is the full pooled report. `collisions` emits only strong
same-term/different-domain cases across repos.

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

## The experiment scripts

- `exp_embed.py`: embeddings vs collocates vs lexical clustering on probe
  terms.
- `exp_gold.py`: the gold polysemy benchmark; run it after any scoring
  change.
- `exp_pos.py`: spaCy noun chunks as candidate source vs shape filter.
- `../semsearch.py`: the semantic search layer, graduated out of the lab
  to `tools/semsearch.py`; default store `.concept-lab/semidx`
  (gitignored, rebuild at will).
- `registry.py`: the epistemic content registry (ADR initial stage): a
  repo's curated `data/design/content.csv` declares creation_mode and
  analysis_use per locator; `verify` and `corpus` subcommands; termlab
  and semsearch consult it before falling back to heuristics.
- `flag_reply.py`: the response-time checker. `--ground <store>` appends
  the canonical passage to link per flag; `--hook` reads a Stop-hook
  payload on stdin, checks the session's last assistant message, and
  emits `systemMessage` JSON. Nothing registers it automatically; a repo
  opts in by adding a Stop hook entry that pipes the payload to
  `flag_reply.py --hook --index <index.json>`.

## Relation to the concept-index branch (PR #336)

That branch establishes the representation (`.concept-index/index.json`)
and the delivery path (plugin skill plus opt-in workflow). This lab is
where the analysis inside it gets iterated. Signals that hold up here are
candidates to graduate into `index_repo.py`; the lab stays multi-corpus and
messy on purpose.
