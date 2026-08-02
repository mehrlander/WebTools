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
