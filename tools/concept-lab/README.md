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

## entitylab.py

The complement to termlab, and the split between them is the point.
termlab asks what vocabulary a repo **coins** (terms of art: "stage",
"proviso", "toss"). entitylab asks what it **names** from the world
outside it (agencies, funds, vendors, statutes, bills, people). The two
populations want opposite treatments: a term of art is authoritative only
in the prose that declares it, so harvesting is the method, while a named
entity is authoritative in a table somebody already curates, so
harvesting it is a fallback.

So the tool reports the gap rather than just a list:

| Column | Question it answers | Method |
| --- | --- | --- |
| declared | which entity tables the repo already holds | a key/code column beside a name column, in any CSV or JSON; no filename rules |
| mentioned | which entities its prose names | six citation patterns (RCW, bill id, session law, biennium, fiscal year, USC/CFR) plus acronym and proper-noun shape |
| resolved | how many mentions a declared table can name | folded string match against names and aliases |

With two or more corpora it also emits the **crosswalk**: entities named
in more than one repo. That section is the actual product. A per-repo
entity list is a word cloud; the same bill cited in four repos that
cannot see each other is a join.

```bash
python3 tools/concept-lab/entitylab.py bwa=/path/budget-wa --report bwa.md
python3 tools/concept-lab/entitylab.py wt=... home=... bwa=... fn=... \
  --report estate.md --json estate.json
python3 tools/concept-lab/entitylab.py home=/path/home --spacy   # model vs pattern
```

About 70 seconds for seven repos without `--spacy`, and about 7 minutes
for two with it. `--spacy` adds an `en_core_web_sm` pass over the prose
classes. Measured on budget-wa and home: it finds real organizations the
patterns miss, and misfires badly on this corpus's markdown and code
tokens (`XML`, `HTML`, and `FTE` as `ORG`; `JSON` and
`fiscal-note-objects.csv` as `PERSON`; `jsDelivr` and `CLAUDE.md` as
`NORP`). It also cannot see the citation classes at all: on `ESSB 5357`
it takes `5357` as a `CARDINAL` and drops the bill. Treat it as a
recall aid over a domain gazetteer, not as the extractor. Findings and
the per-repo resolution rates are in [findings.md](findings.md).

## entityprofile.py

The plain version of the question entitylab talked itself out of: point a
standard entity recognizer at each repo and see what comes back. spaCy
`en_core_web_sm` over the full OntoNotes label set, reported and not
committed.

Four levels are kept distinct in the data, because collapsing them is
what turns an entity profile into a word list:

| Level | Example | Held as |
| --- | --- | --- |
| type | `ORG` | an OntoNotes label |
| name | `OFM`, `Office of Financial Management` | a surface form, never merged |
| mention | one occurrence, with file and context | up to 3 sampled per name; counts stay complete |
| entity | the thing both names denote | **not resolved.** The schema leaves room; alias resolution is its own project |

Two families report separately, since values outnumber names by an order
of magnitude and would otherwise swamp the profile: **named**
(`PERSON NORP FAC ORG GPE LOC PRODUCT EVENT WORK_OF_ART LAW LANGUAGE`)
and **value** (`DATE TIME PERCENT MONEY QUANTITY ORDINAL CARDINAL`).

**Two quality numbers, and they are not the same number.** *Flag rate* is
mechanical: the share of a label's names tripping a shape test, each test
named in the output so a reader can disagree with it. *Precision* is
adjudicated, by reading a stratified sample and marking each name right
or wrong for its type. A label with no judgments reports "not judged"
rather than borrowing its flag rate, because the two diverge sharply:
code-shape tests catch about a fifth of `PERSON` names while by eye more
than half are wrong, the dominant failure being an ordinary domain noun
in title case (`Expenditures`, `Provisos`, `Detail`). The `common-word`
test exists for exactly that gap and uses wordfreq, so `Expenditures`
(zipf 3.52) flags where a real surname (0.0) does not.

```bash
python3 tools/concept-lab/entityprofile.py scan wt=... home=... --sample 1500 --out prof.json
python3 tools/concept-lab/entityprofile.py worksheet prof.json --out judge.json
# fill in each verdict: correct | wrong | unclear
python3 tools/concept-lab/entityprofile.py report prof.json --judgments judge.json --out profiles.md
```

Roughly 4 files per second on 4 cores.

## build-entity-index.py

The pipeline, so the committed index is derived rather than authored.
Chains scan, gazetteer, and confirmation into one command and writes
`web-tools-private/state/entities.json`. Before it existed the steps
were all committed but the glue between them was not, which meant the
index could not be reproduced without re-deriving three ad-hoc scripts
and a hand-typed metadata block from the findings log.

```bash
python3 tools/concept-lab/build-entity-index.py \
  --repos wt=… home=… chats=… bwa=… spend=… bills=… fn=… \
  --gaz-from bwa=… spend=… \
  --out ../web-tools-private/state/entities.json
```

`--profile-cache` reuses an existing scan instead of spending half an
hour re-running the model, which is what makes iterating on the
gazetteer or the metadata cheap. The adjudicated precision figures live
in `PRECISION` as data, each with its sample size, rather than being
retyped per run: retyping is how a measured figure becomes a remembered
one.

## The experiment scripts

- `exp_embed.py`: embeddings vs collocates vs lexical clustering on probe
  terms.
- `exp_gold.py`: the gold polysemy benchmark; run it after any scoring
  change.
- `exp_pos.py`: spaCy noun chunks as candidate source vs shape filter.
- `../semsearch.py`: the semantic search layer, graduated out of the lab
  to `tools/semsearch.py`; default store `.concept-lab/semidx`
  (gitignored, rebuild at will).
- the epistemic content registry graduated to the portable plugin
  (`.claude/skills/content-registry/`): a repo's curated
  `data/design/content.csv` declares creation_mode and analysis_use per
  locator; scaffold, verify, and corpus subcommands. termlab and
  semsearch consult it before falling back to heuristics.
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
