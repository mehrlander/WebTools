---
name: scour
description: Fan out agents to acquire source material that does not exist locally, mapping who says what about a subject across the open web. Use when the user wants to survey a field, find the actors or institutions in some arena, gather primary sources at breadth, build a corpus to delve into later, or says "scour", "find everything about", "map the landscape", "who talks about X", "cast a wide net". This is acquisition fan-out, not judgment fan-out: the agents go get material rather than generate opinions about material already present. Not for reviewing an artifact you already have (use a review panel), and not for answering a question you could answer from one search.
---

# Scour

Acquisition fan-out. Point many agents at the open web to bring back **what is
said and where**, organized so it can be delved into later.

**The output is a corpus, not a report.** The most common way this goes wrong
is producing an agent-written synthesis that argues a conclusion. Synthesis
discards the addresses, the disagreements, and the genres, which are the
durable part. Report what each source says, attribute it, and let structure
carry the meaning. When several sources conflict, that conflict is a finding
to map, never a discrepancy to resolve.

## The budget, which is the whole design constraint

| Tool | Metered? | Answers |
| --- | --- | --- |
| **WebSearch** | **Yes.** 200 calls per session window, shared across every subagent. Raise with `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` | "what exists that I don't know about" |
| **WebFetch** | No | "what does this known URL say" |
| **Wayback CDX** | No | "every URL this domain has ever served" |

**The numbers behind this table, and the traps around them, live in
[`docs/environment/capabilities.md`](https://github.com/mehrlander/web-tools/blob/main/docs/environment/capabilities.md)**,
which is where environment facts belong because they age on a different clock
from method. Measured there: the shared 200-call budget and its verbatim
refusal, the 20-subagent concurrency cap and its silent-drop failure, that
subagents share the container rather than just the budget, that agent
transcripts are durable and greppable outside the repo, and that
`web.archive.org` is gated per container and can change under a session.

The four operative consequences for a scour:

1. **Only new-domain discovery needs search.** Reading is free and enumerating
   a known domain is free, so spend search on seeds and nothing else.
2. **Expect the wall without being able to predict it.** Plan against 200 in a
   window, degrade gracefully, and record which items ran after it hit.
3. **Reconcile the roster against what actually launched.** The concurrency
   cap's real cost is an item that never dispatched and therefore never
   reports.
4. **Probe Wayback CDX before planning around it**, and treat `000` as
   plan-without-it.

### Wayback CDX, when it answers

CDX enumerates every capture of a host without a search call and reaches pages
that no longer exist:

```
https://web.archive.org/cdx/search/cdx?url=<host>&matchType=domain\
&collapse=urlkey&fl=original,timestamp,statuscode,mimetype&limit=100000&output=text
```

**It is not a substitute for search.** CDX enumerates *within* a host you
already know and cannot tell you a host exists. So the metered step stays
metered: new-domain discovery is either a search call or a link followed from a
page you already have, which is the whole reason lead-harvesting matters.

`matchType=prefix` with a path scopes it to a section. This replaces "site:"
search entirely and is the right tool the moment a domain is known to matter.
Query the bare host; `www.` canonicalizes to the same bucket and doubles the
work for identical results.

## Allocation: spread, do not deepen

Measured on this estate's 20 sources, leads surfaced against pages read fit:

```
leads = 1.04 x pages^0.63     R^2 = 0.75, n = 20
```

The exponent below 1 is saturation: each further page of the *same* source
yields fewer organizations not already seen. Holding reading effort fixed at
32 pages, 8 sources at 4 pages each returns roughly 20 leads against 9 for one
source at 32 pages.

**So: many seeds read shallowly beats few seeds read deeply, for discovery.**
Go deep only after a source is known to matter, and understand that as
extraction rather than discovery.

Corollary for search spend: buy *seeds*, plural and cheap. One search returning
eight plausible domains is worth more than eight searches refining one.

**The limit on that rule, from the crawling literature: tunneling.** A highly
relevant cluster can sit behind a page that scores low on its own, and a
crawler that always stops shallow never reaches it. Our exponent was measured
on shallow reads of already-known-relevant sources, the exact regime where
tunneling cannot occur. So breadth beats depth for **enumerating a
neighborhood you are already inside**, and says nothing about **reaching one
you have not entered**. When a promising path runs through an unpromising
page, take it anyway. See [PRIOR-ART.md](PRIOR-ART.md).

## Propose before spending

A scour costs dozens of agents and the session's whole search budget. Loading
this skill is not authorization to run one. State the intended scale (how many
seeds, how many agents, roughly how much search) and get a go, unless the user
already named the scale. Work the session conceives is a proposal.

## The loop

1. **Seed** with search. Spend a small, fixed number of calls to get an initial
   spread of domains. Record the budget you intend to spend before starting.
   Seed selection materially determines the whole run's efficiency, so pick for
   spread across kinds of actor, not for the best single answer.
2. **Enumerate** each seed with CDX where the domain matters, free.
3. **Read** shallowly across many seeds with WebFetch, capturing outbound links
   and their anchor text (see Instrumentation).
4. **Harvest leads** from what was read. These are free seeds, and they are how
   the run grows without more search.
5. **Promote** a lead to a full source when two independent reads surface it.
   Independent corroboration is the cheapest available relevance filter, and
   it is the specific defence against homophily (below).
6. Return to 3 with the promoted leads. Stop when a round promotes nothing.

### Hunt hubs deliberately. Measured at 10x to 93x

A **hub**, in Kleinberg's sense, is a page that points to many good sources:
a member directory, a partners or funders page, a board list, a coalition
sign-on. One of them can substitute for many searches. Recognizable from URL
slugs without a model (`/members`, `/partners`, `/board`, `/resources`,
`/coalition`, `/affiliates`), so sort those to the front of any queue.

Measured on 14 domains, search forbidden, three hub fetches each, against the
same domains' article-page yield from an earlier pass:

| Form | Hub orgs | Multiple over article pages |
| --- | ---: | ---: |
| Membership associations (AWC, AWB) | 117 to 119 | 87x to 93x |
| Resource bodies, think tanks | 25 to 34 | 30x to 47x |
| Unions | 3 to 16 | 2x to 11x |
| **State agencies** | **0 to 13** | **0 to 20x** |

**The predictor is organisational form, not publishing genre.** Ask: *does
this body have a roster, and is publishing it part of what it is?* An
association exists to represent members, so the members are on the site. An
executive agency has no members and its "resources" point inward at its own
programs; two agencies returned clean zeros across five hub pages. That is a
real answer, not a failed fetch, and it means hub-hunting is worth almost
nothing on government domains and worth almost everything on associations.

**Count entities, but do not conflate them.** A membership roster yields
member companies, not policy actors, so raw hub yield is not the same unit as
a curated lead. And a *declared* partners page differs in epistemic status
from board members' *employer* affiliations, which is an inferred tie; keep
them apart in the corpus.

Seeding on hubs and collecting authorities are different targets. Say which
one a given round is doing.

### Four ways a search-free traversal dies, and only one is a real null

Measured across 14 domains: **6 did not return a clean result.** Tell the
shapes apart, because they call for different responses.

- **403 at the homepage** ends everything. Traversal is *binary*: every later
  step depends on the entry page, so a block there yields nothing, not a
  partial. This is the case search exists to cover, and the reason search
  cannot be fully designed away. Budget a search call per blocked domain.
- **Cloudflare** may yield to a readability proxy (`https://r.jina.ai/<url>`),
  but budget two fetches, since one gets you only the homepage.
- **Client-rendered and empty**: the fetch *succeeds* with no extractable
  text. Not a block, and not a null. Diagnose it separately or you will record
  a false zero.
- **Genuine null**: hub pages exist and name nobody. Record it as a finding.

Also: the WebFetch summarizer sometimes returns `Anthropic` or
`Anthropic's Claude Agent SDK` as page content. Four independent agents caught
and excluded it. Instruct entity-counting precisely enough that an agent
notices.

### Lead-following is snowball sampling, and inherits its bias

Chain-referral sampling has a documented pathology: **homophily**, where
referrals resemble their referrer. Leads harvested from a business
association return more business associations, and the resulting roster
encodes the politics of its seeds while looking complete from the inside.

Two mitigations, both borrowed from respondent-driven sampling:

- **Cap leads taken per source** so one well-connected node cannot flood the
  roster. Roughly 3 to 10 is the range this estate ran at.
- **Require independent corroboration** before promotion, per step 5.

And state the seed set in the output. A reader cannot discount a bias that is
not disclosed.

## Instrumentation, and the mistake to avoid

The 2026-08-13 run could not answer "which sources are the best hubs" because
**only 7 of 776 content files preserved a single outbound URL.** Agents
summarized prose and dropped link structure. The link graph cost nothing to
collect and was simply never requested.

**A partial record already exists, and most people do not know it.** Every
subagent's full turn-by-turn transcript is a real file at
`~/.claude/projects/<session>/subagents/agent-<id>.jsonl`, holding every tool
call with its arguments. That means the **fetch sequence is recoverable after
the fact** even when the agents' written output dropped it: this estate
recovered 1,687 fetches across 511 hosts from transcripts, having preserved a
URL in only 7 of 776 content files. The transcripts sit outside every repo and
die with the environment, so distil what matters into a committed artifact
while it is alive (`analysis/extract_agent_trace.py` is the worked example).

What transcripts do **not** give you is link structure, because WebFetch
returns a small model's answer rather than the page's markdown. So:

**Require of every fetched page:** the URL, the outbound links with their
target domains, **the anchor text of each link**, and which targets were
already known. That turns hub-scoring from an estimate into a computation, and
it is free at collection time.

Anchor text earns its own mention because it is the oldest and cheapest
relevance predictor in the crawling literature, available *before* deciding
whether to fetch a link, and this estate threw away 100 percent of it.

**Track harvest rate**, the crawler field's standard measure: relevant pages
fetched over all pages fetched. Ours is unknown because relevance was never
recorded per fetch. Two numbers make a run comparable to the next one:
harvest rate, and new-domains-discovered per search call.

## Prompting the agents

**Name the null result as an acceptable answer, explicitly.** Measured on 49
states run twice: asked for "any connection to X," 49 of 49 agents produced
one and 0 of 49 cited anything. Given "if you find one, don't force it if
there isn't one," 32 of 42 explicitly marked the comparison as unsourced. The
escape hatch did not surface more connections; it surfaced **disclosure**.

A requested section will be filled. So for every field you ask for, either
supply the escape hatch or expect confabulation in that field, and treat an
unhedged claim in a prompted section as the lowest-trust sentence in the
document.

Give each agent: one subject, the output shape, the honesty rules (mark
anything not directly fetched, never present a search snippet as a page read),
and an explicit instruction not to run git.

## Running the fan-out

- **Dispatch in waves under the concurrency cap**, and after each wave
  reconcile your roster against what actually launched. An item that never
  dispatched never reports, and nothing surfaces it.
- **Commit after each wave.** Agent output exists only in the container.
- **Expect uneven sourcing across a large batch** as the search budget drains,
  and record which items ran degraded. The damage is per-claim, not per-source.
- **Keep a superseded pass rather than deleting it.** A second run under a
  different prompt is only measurable against the first if both survive.

## Shape on disk

```
roster.json              the registry; content_status derived from disk, never authored
<source-slug>/
  README.md              what this source says, its positions, what it links out to
  content/*.md           one file per page fetched: YAML frontmatter
                         (url, title, org, domain, fetched, topics, outbound[])
                         then the actual text
  leads.md               organizations surfaced while reading this source
analysis/                scripts that measure the corpus, each with --check
```

Keep a superseded pass rather than deleting it: a second run under a different
prompt is only measurable against the first if both survive. Mark the old one.

## Reporting back

Build **source maps**, not conclusions. When a corpus holds several published
figures for one quantity, the artifact is a table of figure, publisher, basis,
date, and location, with **no figure marked correct**. On this estate seven
institutions published Washington's pension funded ratio between 38% and 103%
depending on discount-rate choice; putting them in a column immediately caught
a file that had inverted its source, which prose had hidden. A source map is a
check, not only a display.
