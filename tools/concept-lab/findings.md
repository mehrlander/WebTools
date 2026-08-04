# Term lab findings

Experiment log for `termlab.py`, run against the four-repo estate
(web-tools, home, chat-histories annotations, budget-wa). Dated sections,
newest last, so the tuning history reads in order. Full reports with
example passages live in the private `home` repo; this public log carries
term names and counts only.

## 2026-08-02, baseline: the PR #336 analyzer on web-tools alone

`index_repo.py` from `agent/concept-index-workflow` ranks by
`context_risk` (dispersion entropy plus referential presentation minus
grounding). Top of the list: "already exists", "asked", "whole point",
"grounds", "depends". The signal exists ("render harness" and "github
contents api" also surface) but generic phrases dominate, and the analyzer
rescans every file per term, taking about two minutes for a 192-file repo.
Both findings shaped the lab tool: single-pass indexing, and ranking gated
by term-ness rather than by any volume-correlated score.

## 2026-08-02, v1: five signals, no gates

First multi-corpus run: 16,479 terms analyzed. What each section returned:

- **Keyness (log-odds)**: clean immediately, no tuning. web-tools =
  branch, diff, path, skill, stage, ref, render; home = plan, fiscal,
  retirement, appropriation; chats = powershell, javascript, xaml;
  budget-wa = proviso, account, opener, medical aid. This section never
  needed another pass.
- **Sense splits**: swamped by frequent words ("count", "reads",
  "context", "across"). Volume factors in the score rewarded exactly the
  words with the least term-ness.
- **Divergence**: real finds buried in noise. "instrument" (web-tools: the
  cross-repo show-repo instrument; budget-wa: procurement instrument
  types) and "chart" were genuine; "m m" (mermaid axis labels), "section
  fund", and "department retirement" were artifacts of building n-grams on
  the stopword-filtered stream, which invents phrases that never appear on
  any page.
- **Ungrounded reference**: swamped by quoted budget-bill boilerplate from
  dated records ("subsection shall lapse", 487 referential uses, all in
  quoted bill text).
- A snippet-alignment bug: masking URLs before tokenizing shifted
  character offsets, so some example passages did not contain their term.

## 2026-08-02, v2: living/record split, surface bigrams, length-preserving masks

Changes: `is_record()` classifies dated entries, chat derivatives, and
data trees; report sections gate on living-side counts. Collocations move
to raw surface adjacency. Masking becomes length-preserving so spans stay
true. Fenced code blocks are masked too.

Results: ungrounded went from bill boilerplate to real findings ("data
view", "spend view", "lens bridge", "fab", "contents api", "aef05
extract"). Sense splits still ranked adverbs first ("actually",
"exactly", "right") because is_termy accepted any word with two strong
marks anywhere, which high-volume words always have. Ground-truth check
against known polysemous estate terms showed the detector itself works:

- "board" split into retirement/investment boards (LEOFF, SIB), the
  tracker board, and the links board.
- "stage" split into show-repo staging vs the structured-stage doctrine
  ("data before display").
- "surface" split into the verb and the cross-repo shelf.
- "arc" split into chat-archive arcs vs narrative arcs in records.

So detection was ahead of ranking, and the remaining work was gates.

## 2026-08-02, v3: markedness, hyphen merging, variants

Changes: hyphens split at tokenization so "data-view" and "data view"
merge onto one term key (their grounding evidence belongs together; v2
listed "data view" as ungrounded while its grounding lived in the
hyphenated spelling). A variants pass counts spaced vs hyphenated surface
forms per term. Markedness (strong marks per living mention) and file
share enter the gates.

Two bugs surfaced in v3's own output: markedness above 1.0 ("state
appropriation" at 18) because strong marks were counted estate-wide while
the denominator was living-only, and hyphenated variant counts inflated by
path slugs and branch names in raw text.

## 2026-08-02, v4: living-side markedness, masked variants, per-file cluster cap

Fixes for both v3 bugs, plus a cap of eight occurrences per file feeding
sense clustering (one demo doc's repeated table rows had formed a
degenerate cluster for "gap").

State of each signal after v4:

- **Signature terms**: now genuinely the estate's coinages: progress log,
  definition of done, chron dump, gh load, caption, drain, rounds,
  lattice, sessionstart. Residual finding worth keeping: tracker task
  boilerplate headings ("Progress log", "Definition of done") rank high
  because they are marked constantly; arguably correct, they are the
  estate's most institutionalized vocabulary.
- **Variants**: immediately useful and cheap. fiscal note (1,475 spaced vs
  228 hyphenated), carry forward (48 vs 302), short term (64 vs 207),
  data view (69 vs 54), drs budget (240 vs 179). Some hyphenation is
  legitimate compound-adjective grammar ("fiscal-note API"), so this is a
  review list, not an error list.
- **Sense splits**: top ranks are moderately real ("style" cleanly
  separates CSS/JS style from the prose-style rule; "shape" separates
  schema-shape from repo-shape). The known-good polysemy cases (board,
  stage, surface) sit in the pool but below the top, because their split
  scores are middling. Ranking here is the open problem.
- **Divergence**: solid at the top once support gates landed
  (per-repo mentions ≥ 6, context mass ≥ 60).
- **Ungrounded**: strong finds with residual generic-phrase noise ("same
  way", "place", "ones") that survives because multiword phrases bypass
  the strong-marks gate.

## Open threads

- Sense-split ranking: separation × entropy × volume still correlates with
  topic breadth. A purity measure per cluster (how exclusive its context
  words are to that cluster) would likely rank board/stage/surface higher
  than framing/naming.
- Generic-phrase suppression for the ungrounded section: an estate-level
  frequency floor for every word in the phrase would kill "same way"
  without a hand list.
- The MiniLM caution from the chat archive (embeddings over-cluster on
  shared vocabulary, measured 2026-06-07) is why everything here is
  lexical. If embeddings enter, they should discriminate within a term's
  occurrences, not across terms.
- Response-time use: the JSON index plus a small checker that flags, in a
  draft reply, terms the index marks as split, divergent, or ungrounded.
  Prototyped as `flag_reply.py`.

## 2026-08-02, flag_reply: the response-time checker

`flag_reply.py` reads the termlab JSON and flags a draft reply's terms.
First run flagged nearly every content word as ambiguous; the fix was the
same lesson as the report, applied harder: a response-time flag needs
markedness ≥ 0.03, file share ≤ 0.3, and sense_split ≥ 3.0 before it is
worth an interruption. After gating, a deliberately jargon-heavy sample
reply returned board, spine, surface, caption, deck, sweep, chron, dump as
divergent or ambiguous, "next biennium" as ungrounded, and the planted
fake term "concept mesh" as novel, with the generic verbs suppressed. On a
plain paragraph of session prose it flagged "workflow" (GitHub Actions in
web-tools vs Apple Shortcuts in the chat archive) and "index" (the npm
pages-index vs budget-wa's SQLite bill index), both genuine cross-corpus
ambiguities. Two capture artifacts fixed along the way: adverbs riding
into referential phrases ("the spine now" minting "spine now") and
noun+verb captures ("tracker shows"), the latter solved with the boundary
verb truncation idea from the concept-index branch.

## 2026-08-02, toolchain: what the sandbox will install

pip reaches PyPI through the proxy: wordfreq, scikit-learn, spacy, and
model2vec all installed. `python3 -m spacy download en_core_web_sm` works
(after `pip install click`), and model2vec fetches
`minishlab/potion-base-8M` from the Hugging Face Hub, so a real (tiny)
embedding model runs in-session with no torch. Nothing is vendored into
the repo; the imports are optional and the tools degrade to the
dependency-free path without them.

## 2026-08-02, v5: surprise prior works, purity ranking does not

The continuous commonness hedge: `surprise(term)` compares the term's
estate rate against its English rate (wordfreq zipf), in bits.
Calibration on knowns: "actually" -1.0, "stage" 0.0, "board" 0.7,
"toss" 3.2, "tracker" 5.3, "proviso" 8.0, "biennium" 13.2. It cleanly
retires the hand-tuned stoplist for gating signature and ungrounded
sections. The subtlety: common English words with specialized estate
senses (board, stage) score near zero, so surprise must always be OR-ed
with markedness, never a lone gate.

Cluster purity was a negative result. With IDF-weighted contexts, big
topic clusters acquire their own exclusive rare vocabulary, so purity is
high for exactly the topic-broad words it was meant to demote; gold
polysemy cases moved down, not up ("board" fell out of the pool entirely
via the markedness gate). Kept in the JSON, dropped as a ranking.

## 2026-08-02, exp_embed: collocates beat both clustering and embeddings

Head-to-head on gold terms with potion-base-8M (KMeans, silhouette-chosen
k) vs lexical clustering vs the token immediately left of the term:

- "board": embeddings found the right 2-way split (retirement vs
  tracker), silhouette only 0.14; the left collocate told the same story
  instantly (state/investment/services vs tracker).
- "workflow": embeddings' k=3 did not align with the true split; the
  collocate did (shortcuts 27x vs github 13x).
- "deck": collocates crisp, embeddings muddled.

Conclusion adopted: senses anchor on collocates (the Sketch Engine
insight). Embeddings are a verifier at best here, consistent with the
2026-06-07 MiniLM finding. Caveat logged: the experiment sampled
occurrences in repo iteration order, so a 300-occurrence cap can starve
later repos.

## 2026-08-02, v6 through v9: anchored senses

`anchored_senses()` groups a term's occurrences by immediate raw-text
neighbor and calls two anchors different senses when their surrounding
contexts diverge. Four measured iterations:

- v6, JS alone: saturates. Any two collocate groups of a frequent word
  diverge lexically, so subtopics read as senses ("employer
  contributions" vs "member contributions").
- v7, weight by repo-disjointness of the anchor pair: the estate-relevant
  definition of ambiguous, and it promoted real finds ("component": web
  component vs ACFR component units). Volume bias remained.
- v8, cap the volume factor: little change; diagnosis showed the real
  fault was anchor selection, not scoring: top-8-by-count anchors were
  all one repo's, so the minority sense never reached the pairing.
- v9, per-repo anchor seats: each repo's strongest anchor gets a seat.
  "board" gained the "board game" sense (family-gaming chats) and rose
  from rank 2134 to 957; "component" reached rank 8.

## 2026-08-02, exp_gold: the benchmark

Twelve hand-verified gold polysemy terms now live in `exp_gold.py`;
score any index against them. v9 baseline: all 12 in pool, median rank
639 of 3286, one in the top 100. Every future scoring change gets this
number.

## Recipe table: what works for what purpose

| Purpose | Method | Verdict |
| --- | --- | --- |
| Repo-distinctive vocabulary | log-odds w/ Dirichlet prior | works as-is since v1 |
| Common-word hedge | wordfreq surprise (estate vs English rate) | works; OR with markedness |
| Estate coinages (glossary seed) | markedness × spread, surprise gate | works, some heading boilerplate |
| Spelling drift | spaced-vs-hyphenated counts on masked text | works, cheap; review list not error list |
| Un-introduced jargon | referential vs grounded, living side only | works after living split + variant merge |
| Cross-repo same-word divergence | per-repo context JS with support gates | works at the top of the list |
| Sense discovery (which senses exist) | immediate collocate anchors, per-repo seats | works; best mechanism found |
| Sense ranking (which terms most split) | anchor JS × repo-disjointness × capped volume | partial; median gold rank 639, the open problem |
| Sense discrimination via embeddings | potion-base-8M + KMeans | correct on clean cases, low margins; verifier not driver |
| Topic-cluster purity | exclusive centroid mass | negative result; kept as data only |
| Response-time flagging | index + markedness/file-share/split gates | works on samples; not yet hook-wired |
| Global "most ambiguous" ranking | any single scalar tried so far | browse view only; per-term evidence is the product |
| Term-shape filtering | spaCy noun-chunk membership | works; would retire hand verb/adverb lists |
| Estate semantic retrieval | potion-8M paragraph index (exp_semsearch) | works; 27s build, complements lexical search |
| Off-the-shelf keywords | YAKE | negative result on this corpus |

## 2026-08-02, ranking search: calling the sense-ranking chase

Offline rescoring over the v9 index (no reruns needed; the JSON carries
every feature) tried repo-usage entropy, markedness products, mention
normalizers, living share, and multi-repo gates against the gold set.
Best variants moved median gold rank from 651 to roughly 500 and top-100
membership from 1 to 4, but every gate that suppressed the home budget
vocabulary also cut a gold member ("board" is 85% home by volume, so any
dominant-repo cap kills it). Conclusion, recorded rather than churned:
a single global "most split terms" ranking conflates several phenomena
and is a browse view at best. The hook use case never needed it: given a
term in a draft, the per-term anchor evidence answers "which senses, in
which repos, with what example," and that part works. Twelve gold cases
is also thin ground for formula fitting; growing the gold set is the
honest prerequisite for another ranking attempt.

## 2026-08-02, exp_pos: noun chunks judge shape, not term-ness

spaCy en_core_web_sm noun chunks over web-tools living prose: 18,387
chunk types vs 5,679 regex candidates. As a candidate source it loses:
the top of the chunk list is generic nouns and pronouns ("page", "repo",
"itself", "nothing"), while the regex harvest's exclusives are the real
coinages (web-tools json, gh api js, definition done). As a shape filter
it wins: "actually" and "exactly" are never noun chunks, so a
chunk-membership gate would retire the hand-kept verb and adverb lists.
Worth integrating if those lists grow again; not integrated today.

## 2026-08-02, exp_semsearch: a semantic layer over the estate, cheap

New capability, not a term signal: potion-base-8M embeds all 59,172
prose paragraphs across the four repos in 27 seconds (no torch, ~60MB
of vectors), and nearest-paragraph query answers arrive instantly.
Quality on real probes:

- "how do I preview a page from a branch before it merges" hit
  show-repo's branch-overlay section and CLAUDE.md's preview mechanism,
  ranks 1 and 2.
- "the decision that tracker boards commit directly to main" hit the
  merge-guide entry recording that exact spec decision, the rule
  statement in the chat-histories CLAUDE.md, and the blog post about the
  convention's history.
- "pension contribution rates increased because of investment losses"
  surfaced ACFR rate-of-return passages from the records layer.

Misses exist (the "who decides ready" query found draft-PR prose but not
SURFACING.md's "Ready is the user's decision" line in the top 3), so it
complements rather than replaces lexical search. This answers the "where
did we settle X" retrieval class that ripgrep cannot.

## 2026-08-02, YAKE: off-the-shelf keywords lose to corpus-aware harvest

`yake` (n≤2) over the same web-tools prose returns "repo, page, file,
branch, session" at the top: statistical keyword extraction tuned for
general documents promotes exactly the corpus-frequent words the
signature list is designed to demote. Two real terms surface ("task
file", "Tailwind CSS") but the markedness harvest dominates it for this
corpus. Negative result, kept so the next "just use a keyword library"
idea starts here.

## 2026-08-02, grounding pointers: the flag carries its own fix

`flag_reply.py --ground <store>` joins the two halves of the lab: for
each ambiguous, divergent, or ungrounded flag it queries the semantic
index for the passage that best introduces the term (hybrid: nearest
paragraphs to "<term> is", kept only if they contain the term, with a
bonus for definitional shape and doc-like paths). After the shape bonus,
"board" and "tracker" ground to docs/TRACKER.md and "diff" to the
edit-review skill's Diff-lens passage. Quality varies with the flag
noise feeding it, but the pattern is the finding: a flag that names the
canonical passage turns "this term is risky" into "link this when you
use it", which is what a response-time hook should actually emit.

## 2026-08-02, graduation: semsearch durable, flag_reply on the hook path

Three moves approved and landed:

- `exp_semsearch.py` graduated to `tools/semsearch.py`: committed
  builder, gitignored vector store (`.concept-lab/`, ~60MB, rebuilt in
  under 30 seconds). Two fixes on the way: runt tail chunks from long
  paragraphs polluted the index (short meta-text embeds near
  everything), and a phrasing rule was measured: with static
  embeddings, query like a note ("wrap up sequence preflight mark PR
  ready" hits SURFACING.md at rank 1), not like a question ("what does
  wrap up mean" matches question-shaped text instead). A side finding:
  duplicate top hits expose the estate's duplicated-claims problem
  automatically (SURFACING.md and its fetched skill copy tied at 0.666).
  Known limit: URL-ish masking eats filename tokens, so queries naming
  files ("paths.json") miss.
- `flag_reply.py` ambiguity evidence now prefers anchor pairs, which
  read like explanations ("tracker _ (7x) vs _ wsib (103x)") over
  cluster word-bags; cluster evidence remains the fallback.
- `flag_reply.py --hook` closes the loop the whole lab aims at: it reads
  a Stop-hook payload, extracts the last assistant message from the
  session transcript, and emits `systemMessage` JSON. Tested against
  this session's own live transcript (501 events): it parsed the reply
  and flagged, among noise, one genuinely ambiguous term ("test": npm
  test in web-tools vs actuarial sufficiency test in home). Registration
  stays opt-in and manual, per the estate's rule against uninvited
  automation.

## 2026-08-02, three modes: single, related, collisions

A reviewing session judged the pooled cross-estate report not yet a
review surface ("everything", "shows", "reason" ranking) and asked for
three modes. Built as `--mode single|related|collisions`, defaulting by
repo count. What the split changed:

- **Single-repo mode needed its own record rule.** The estate-level
  directory heuristic classified nearly all of budget-wa as records, so
  its concept section came back empty. In a coherent content repo the
  undated analysis prose is the repo's voice; only dated snapshot paths
  are records there. With that rule, budget-wa's concept list became its
  actual subject vocabulary: state appropriation, appropriations
  section, veto, provisos, strike, rcw, crosswalk, total appropriation.
  The reviewing session's hypothesis held: candidate quality improves
  sharply when the corpus has one subject.
- **Concepts split into two registers.** Code-register vocabulary
  (underscores, digits, hex fragments, zipf-zero words) reports
  separately from prose concepts; budget-drs's list led with hex color
  codes until the identifier filter learned digits. After the split its
  prose list is the workspace's own vocabulary: data derived marts,
  dims, adjustments, agency budgets, analyst's review note.
- **Anchored senses drop repo-disjointness in single mode** (one repo,
  nothing to be disjoint about); disjointness is stored per pair and
  becomes the collision criterion instead.
- **Collisions mode is real but roughly half-precise.** Requiring JS
  >= 0.75, disjointness >= 0.6, and per-side support surfaces genuine
  same-term/different-domain cases: "class" (pension asset classes in
  home vs CSS class names in web-tools), "balance" (fund balance vs UI),
  "span" (HTML span vs time span), "import", "syntax", "funding",
  "opener", "leoff". Interleaved with them: abstract formal-register
  nouns ("varying", "approach", "notes") that survive every gate tried,
  including surprise, because government-finance prose genuinely uses
  them at elevated rates. A reviewable list of thirty at half precision
  is a usable review surface; the pooled report was not.

## 2026-08-02, the epistemic content registry (ADR initial stage)

An ADR arrived proposing an Epistemic Content and Provenance Registry:
observe mechanically, declare authoritatively, compare for drift, with a
curated `data/design/content.csv` (locator, creation_mode, analysis_use,
description) as the initial stage. This is the principled version of what
`is_record()` gropes at, so it was implemented as `registry.py` and wired
in as the corpus authority: declared classifications control membership
(exclude drops the file, analysis_use decides living), and only
undeclared content falls back to the heuristic. Two deliberate extensions
from estate practice: trailing-`/` subtree locators (the `.paths.json`
idiom) with most-specific-wins resolution, and the ADR's three fragment
syntaxes (`#heading=`, `#column=`, `#html-id=`).

The ADR's spike ran on budget-wa (16 rows covering supplied snapshots,
mechanical indices, model-authored catalogs, a hybrid README, code, a
mixed file, two fragment locators). Results, keyed to the spike's
questions:

- Verifier: clean on first authoring; after renaming a declared file it
  reported the unresolved locator and nothing else. Locator maintenance
  is one advisory line per rename.
- The `#column=notes` fragment extracted genuine authored join
  commentary out of an otherwise mechanical CSV: region locators earn
  their keep on tables.
- The `#heading=` fragment answered spike question 7 against regions:
  markdown heading sections include their subsections, so a locator
  meant to capture "the authored framing above the quoted sections"
  recaptured 110KB of quoted bill text. For prose files, restructuring
  beats region annotation; the finding is recorded in the row itself.
- Corpus effect, measured on the single-repo concept report: with the
  registry, "state appropriation" (403 mentions, dominated by quoted
  bill text in source/ catalogs) left the concepts list, and living
  counts tightened throughout, while the subject vocabulary (veto,
  provisos, strike, rcw, appropriations section) held. Supplied text
  now stays out of the authored voice by declaration, not by directory
  guesswork.

The deferred layers (artifacts/derivations provenance, generated
inventory, comparison) stay deferred per the ADR; the comparison layer's
first real customer will be the moment a registry claim and the
heuristic disagree about a file someone cares about.

## 2026-08-02, the registry ships with the plugin

`registry.py` graduated out of the lab into the portable plugin:
`.claude/skills/content-registry/` bundles the script beside its
SKILL.md the way `tasks` bundles its board generator, and the
marketplace manifest and PORTABLE.md now declare it. A `scaffold`
subcommand emits draft rows from mechanical observation only (file
counts, suffixes, dated-path flags) with both controlling fields left
TODO, keeping the ADR's line: observation states facts, judgment fills
the classification, row by row with the user. termlab and semsearch now
import the registry from its plugin home. Estate-wide availability as
/portable:content-registry follows the next merge to main, since plugin
consumers track main; in-session the skill is live from the checkout.

## 2026-08-04, entitylab: entities are a different population from terms

`entitylab.py` is the complement to termlab, built to test one intuition: that
a per-repo entity list ("just like named entity recognition") would be worth
having. Run over seven checkouts (web-tools, home, chat-histories, budget-wa,
spend-wa, wa-bills, fn-data), about 68 seconds, dependency-free.

The premise turned out to be half wrong in a useful way. Terms of art are
authoritative only in the prose that declares them, so harvesting is the
method. Named entities are authoritative in a table somebody already curates,
so harvesting them is a *fallback*, and the estate is already full of those
tables: OFM's 134-row agency list and 816-row fund reference manual in
budget-wa, spend-wa's 79-row vendor crosswalk with aliases and SWV numbers,
wa-bills' 15,451 bill titles and sponsor rosters, home's `me/people.json`.
Nobody needs a model to discover DSHS.

What the census measured instead:

- **Extraction does not reach the tables.** Resolution of harvested mentions
  against declared tables: budget-wa 14%, spend-wa 26%, home 2%, wa-bills 0%,
  fn-data 0%. The failure is not the extractor. The prose says `OFM` (318
  mentions in budget-wa), `DRS` (3,735 in home), `HCA` (33,145 in fn-data),
  and the tables carry `Office of Financial Management`. The two halves name
  the same entities in different surface forms and nothing bridges them.
  spend-wa is the exception at 26% precisely because its crosswalk is the one
  table in the estate with an `aliases` column and a documented fold.
- **The join key is often absent from the table.** wa-bills declares more
  entity names than any other repo and resolves 0% of its own prose, because
  its tables key bills by URL and title while every mention in prose is a bill
  *number*.
- **Pattern and model fail differently, and the model was not run.**
  *Corrected 2026-08-04, same day:* the first version of this section claimed
  pattern "beats model outright" on the strength of an a priori argument. The
  `--spacy` path was written and never executed, because `en_core_web_sm` had
  failed to install behind a missing `click` (the exact failure this log
  already recorded on 2026-08-02, and did not check for). The claim was an
  assertion formatted as a measurement. What the run actually shows is below.
- **web-tools has no entity layer and should not grow one.** 1% resolution, and
  its top "acronyms" are MDL, LCP, WASM, FAB: technical vocabulary, which is
  termlab's population, not this one. A tooling repo names no entities. This is
  the negative control the census needed.

### The crosswalk is the product, not the per-repo list

A per-repo entity list is a word cloud. The same entity found in repos that
cannot see each other is a join, and that is what the census actually found:
192 RCW citations, 356 bill ids, and 27 session laws each appear in two or more
repos. The widest cases are real objects with genuinely different views:

- `ESSB 5357`, the 2025 rate-override bill: chat-histories 64 (two Gemini deep
  research reports and the chronicle), home 34 (the budget-drs reductions
  register and workshop decisions), fn-data 29 (a dedicated distill file), and
  budget-wa 7 (the ACFR pension-by-plan read and the 2025-27 anomaly report).
- `HB 1661`: fn-data 380, home 21, chat-histories 14, spend-wa 1.
- `RCW 41.50`, the DRS chapter: four repos.

Nothing in the estate can answer "show me everything we hold on ESSB 5357"
today, and every repo holds part of the answer. Entity navigation is orthogonal
to the repo/folder/file axis show-repo already has, which is the argument for
building it rather than a nicer per-repo glossary.

### Table detection is a scaffolder, not an oracle

The entity-table sniffer (a key/code column beside a name column, no filename
rules) found 52 candidates in budget-wa and 219 in chat-histories, and a good
share are not entity registries: raw FY20 budget-to-actual dumps and
`recession_items.csv` have the shape without being a table of entities. That
is the same line the content registry already draws, so it should be drawn the
same way: observation proposes rows, judgment declares them. The candidate
list is a scaffold for a declaration, not a substitute for one.

### Open

- The alias bridge is the one piece worth building before anything renders.
  Every number above understates resolution because acronym-to-legal-name is
  unmapped, and it is a small, mostly hand-authored table per class.
- Precision on `proper` is unmeasured. `State Washington` and `Department
  Health` in the spend-wa list are fold artifacts, and there is no gold set
  here the way `exp_gold.py` supplies one for polysemy.
- Whether a repo's entity index should be committed (the tracker `board.json`
  pattern) or rebuilt on demand (the concept index's "build it, use it, let it
  go") is unsettled. The crosswalk argues for committed, since an estate-level
  join cannot rebuild seven repos on page load.

## 2026-08-04, the model pass, actually run

`en_core_web_sm` over budget-wa and home prose, about 7 minutes for the two
(against 68 seconds for all seven without it). What it returns per class, top
of each list:

| class | budget-wa | home |
| --- | --- | --- |
| `ORG` | 1,310 types. OFM, DRS, State, and `sec`, `XML`, `PDF`, `HTM` | 5,388 types. DRS, OFM, CORE, CFL, ACFR, and `FTE`, `HTML` |
| `PERSON` | 308 types. Treasurer, and `Expenditures`, `Bill No.`, `Provisos` | 2,026 types. Roth, Retirement Specialist, and `JSON`, `Shipped`, `fiscal-note-objects.csv` |
| `GPE` | 128 types. Washington, US, and `biennia`, `PyMuPDF`, `FY` | 456 types. Washington, Marcus, and `drs-part1.csv`, `HB`, `DP` |
| `LAW` | 111 types. Section 122, Chapter 11, Plan 1 | 341 types. TRS Plan 1, Plan 2/3, Chapter 5 |
| `NORP` | 47 types. Congressional, Indian, Veterans | 212 types. and `IndexedDB`, `jsDelivr`, `CLAUDE.md`, `Obsidian` |

Three things are true at once, and the earlier section collapsed them into one
wrong sentence:

1. **The model finds real entities the patterns cannot.** `Washington`,
   `Treasurer`, `Congressional`, `Indian`, `Veterans`, `Roth`, and the
   `LEOFF Plan 2` / `TRS Plan 1` plan names are genuine, and no regex in this
   tool proposes them. For organizations and people it has real recall.
2. **Precision on this corpus is poor, and the failure mode is legible.**
   Markdown and code tokens flood every class: file formats as `ORG`, filenames
   and library names as `PERSON` and `NORP`, a raw table separator row as
   `PRODUCT`. The masking in `harvest()` strips fences and inline code, but the
   model still sees bare technical vocabulary in running prose, which a model
   trained on news has no reason to handle. This is a fixable preprocessing
   and gazetteer problem, not a verdict on models.
3. **It is blind to the citation classes.** On the sentence "The Department of
   Retirement Systems and OFM reviewed ESSB 5357 with the Health Care
   Authority" it returns both organizations correctly and takes `5357` as a
   `CARDINAL`, dropping the bill. Bill ids, RCW cites, and session laws need
   the patterns. That much of the original claim survives, now measured on a
   case rather than argued from the label set.

So the shape is a hybrid, and the honest ordering is the reverse of what the
first pass implied: the model is the recall layer for organizations and
people, the patterns are the precision layer for citations, and a domain
gazetteer built from the tables already in the estate is what filters the
model's output down to something worth reading. None of that is settled by
this run; it is one run of one small model, and `en_core_web_trf` or a
zero-shot extractor like GLiNER was never tried.

## 2026-08-04, entityprofile: the plain NER profile, with precision measured

`entityprofile.py`, spaCy `en_core_web_sm` over the full OntoNotes label set,
seven repos, reported and not committed. Named classes and value classes report
separately, since values outnumber names roughly two to one and would otherwise
swamp the profile. Files over 200 KB are skipped and the count is shown: 123
estate-wide, all supplied material (enrolled bill text, ACFR extracts, raw
deep-research transcripts), and the first attempt without that cap spent over
ten minutes inside home's ten largest files.

### Precision, adjudicated

Two bands per label, 10 names each per repo, judged against the OntoNotes
definitions by one rater (this session), verdicts recorded by name in the
worksheet so the mapping is auditable:

| band | label | correct | judged | precision |
| --- | --- | ---: | ---: | ---: |
| head (top 10 by mentions) | `ORG` | 16 | 70 | **23%** |
| head | `PERSON` | 5 | 67 | **7%** |
| stratified (whole range) | `ORG` | 13 | 68 | **19%** |
| stratified | `PERSON` | 6 | 69 | **9%** |

**The head is not meaningfully better than the tail.** That is the result that
matters, and it kills the obvious shortcut of showing the top names and calling
the rest noise. `wt`'s top ten organizations are HTML, MDL, ref, API, DOM, FAB,
GitHub, PDF, doc, UI: one correct. `bwa`'s top ten people are Bill No,
Expenditures, Bill No., Bill, Provisos, Treasurer, Parts XI-XIX, provisos,
FTS5, Flags: none.

### Flag rate is a weak proxy for precision, not a substitute

Measured across the 14 repo/label pairs with judgments, Pearson r between flag
rate and measured head precision is **-0.54**. The sign is the expected one, so
the shape tests are picking up something real, but r² is 0.29: they explain
under a third of the variation, on n=14. Two pairs make the point directly.
`bills`/`ORG` has the highest flag rate (65%) and 20% precision; `spend`/`ORG`
has a middling flag rate (44%) and the best measured precision of any pair
(50%). Reporting one number as if it were the other would have been wrong in
both directions, which is why the report prints "not judged" rather than
borrowing the flag rate.

### What it does find

Real and worth having, though sparse: DRS, OFM, HCA, DSHS, SIB, Amazon,
GitHub, House, Senate, Medicare, Department of Commerce, L&I, Legislative
Evaluation and Accountability Program, Catholic Community Services, Milliman.
And people nothing in the estate indexes: **Mike Woods, Kate Davis, Jane
Sakson** in fn-data (fiscal-note preparers), **Mark Feldhausen** and **Marcus
Ehrlander** in home.

### The errors are repo-diagnostic, which rescues the contrast

Precision near 20% would normally sink the cross-repo comparison. It does not,
because the *failures differ by repo in a way that tracks the repo's subject*.
web-tools' false organizations are HTML, API, DOM, UI. chat-histories' are
PowerShell, UTC, JavaScript, CSS, XAML. fn-data's are form furniture:
"Individual State Agency", "OFM Review", "C - Expenditures II". budget-wa's are
file formats and citation prefixes. So the profile still discriminates the
repos sharply, but it does so partly through its noise, which means the
contrast is evidence about what a repo is made of rather than a clean list of
what it discusses. Worth stating plainly wherever the contrast is shown.

### Costs and open

- About 4 files per second on 4 cores, roughly 40 minutes for the estate.
- The profile JSON is **101 MB** with 3 sampled mentions per name. The earlier
  caution about mention storage was right: this cannot be a committed per-repo
  artifact in this shape. Counts are cheap; mentions are not.
- `common-word` (wordfreq, zipf >= 3.0) is the single most productive flag,
  leading the reason list for nearly every label. It catches the failure the
  code-shape tests miss, and it is why `PERSON` flag rates rose from about 20%
  under the code-only tests to about 50%.
- Not judged: `GPE`, `LAW`, `NORP`, `EVENT`, `PRODUCT`, `FAC`, `LOC`,
  `WORK_OF_ART`, and every value class. Their flag rates are in the report and
  say nothing about their quality.
- One rater, ten names per band. Wide enough to rank the labels, too thin to
  fit anything.
