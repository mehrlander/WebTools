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
