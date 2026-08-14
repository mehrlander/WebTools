# Prior art for scouring

What the existing literature already names, and what it says about the
choices in [SKILL.md](SKILL.md). Assembled 2026-08-13. The short version:
almost every intuition behind this skill is a named result from 1998 to 2002,
and the genuinely new part is only the agent harness around them.

## 1. The hub idea is HITS, and it predicts a genre

"Spend the budget finding sources that lead to many other sources" is
Kleinberg's **hub score** from [HITS](https://en.wikipedia.org/wiki/HITS_algorithm)
(Hyperlink-Induced Topic Search, 1999). The definitions:

- An **authority** is a page with important content, pointed to by many hubs.
- A **hub** is a page that points to many authorities. Hubs "act as
  **resource lists**, guiding users to authorities."
- The two reinforce mutually and are computed by iteration: a good hub points
  to good authorities, a good authority is pointed to by good hubs.

**This is a sharper prediction than "journalism."** HITS says the high-hub
genre is the *resource list*: link directories, "our partners," member
rosters, "related organizations," further-reading pages, blogrolls,
coalition sign-on lists. Those are structural page types, not publisher types,
and they can be recognized cheaply from a URL or a heading without a model.

It also reframes the goal. A scour usually wants authorities, but should
*seed* on hubs. Those are different targets and the same budget cannot chase
both.

## 2. Focused crawling names the whole problem

[Focused crawling](https://en.wikipedia.org/wiki/Focused_crawler)
(Chakrabarti et al., 1999) is the field. Its vocabulary, and what each maps to
here:

| Term | Meaning | Here |
| --- | --- | --- |
| **Frontier** | queue of unvisited URLs awaiting priority | our lead list |
| **Frontier prioritization** | deciding what to fetch next; *the* central problem | we did this ad hoc |
| **Seed selection** | which URLs to start from; "can significantly influence the crawling efficiency" | we never chose systematically |
| **Whitelist strategy** | start from high-quality seeds and confine the crawl to their domains | close to what a roster does |
| **Harvest rate** | relevant pages fetched divided by all pages fetched | we never computed it |
| **Tunneling** | crossing low-relevance pages to reach relevant clusters behind them | see the warning below |

Cheap relevance predictors, all applied *before* fetching:

- **Anchor text** of the inbound link (Pinkerton, the earliest approach)
- **DOM neighborhood** features from the linking page
- **Context graphs** (Diligenti et al.): learn the paths that lead *to*
  relevant pages, not just the pages
- **Ontology-driven** variants map pages onto domain concepts

**The cheapest of these is free and we discard it.** Anchor text costs nothing
to capture at fetch time and is the oldest known signal for whether a link is
worth taking. Our pass kept no links at all, let alone their anchor text.

### The tunneling warning, which cuts against our own result

We measured `leads = 1.04 x pages^0.63` and concluded breadth beats depth.
Tunneling is the literature's counter-case: a highly relevant cluster can sit
behind a page that scores low on its own, and a crawler that always stops
early never reaches it. Interclass rules that capture linkage between topic
classes exist specifically to let a crawler "cross tunnel."

So the honest statement is narrower than what the skill claimed. Our exponent
was measured on shallow reads of already-known-relevant sources, which is
exactly the regime where tunneling never happens. **Breadth beats depth for
enumerating a known neighborhood. It says nothing about reaching a
neighborhood you have not entered**, and may actively mislead there.

## 3. Lead-following is snowball sampling, with its known pathology

Following leads from source to source is
[snowball sampling](https://en.wikipedia.org/wiki/Snowball_sampling), also
called chain-referral sampling, from social research on hidden populations.
The vocabulary matches ours exactly, including "seeds" and "waves."

Its documented failure is the one we should worry about:

> The sample begins with a convenience sample with bias of unknown magnitude
> and unknown direction, and this bias is then compounded in unknown ways as
> the sample expands from wave to wave.

Plus **homophily bias**: referrals resemble their referrer, because people
recommend from their own circle. Applied here: leads harvested from a business
association return more business associations. A roster grown this way encodes
the politics of its seeds and looks complete from inside.

**Respondent-driven sampling** (RDS) is the corrective, and its two mechanisms
port directly:

1. **Cap referrals per source.** RDS gives each participant a fixed small
   number of coupons so no single well-connected node floods the sample. Our
   `leads.md` files informally ran 3 to 10, which is accidentally in range.
2. **Weight by network size and recruitment pattern** to correct for
   differential connectivity.

And one thing this project already did right without knowing why: **promoting
a lead only when two independent sources surface it.** That is a
corroboration filter against homophily, since a lead reachable from two
different parts of the graph is less likely to be an artifact of one seed's
circle. Of the four leads promoted in the actor pass, the strongest
(`wacities-org`) was exactly the one surfaced independently by two passes.

## 4. What is actually new

The classical work assumes an unmetered crawler fetching millions of pages,
where the scarce resource is bandwidth and the hard part is a relevance
classifier. Our situation inverts both:

- **Discovery is metered and reading is free.** Search is ~200 calls per
  session; WebFetch and Wayback CDX are unbounded. Classical crawlers had the
  opposite ratio and no equivalent of a search-engine seed budget.
- **The relevance classifier is free and excellent.** A language model reading
  a page is a better topical judge than the SVM and context-graph machinery
  the literature spends most of its effort on. The expensive part of focused
  crawling in 1999 is the cheap part now.
- **The failure mode moved.** Classical crawlers fail by fetching irrelevant
  pages, measured by harvest rate. Agent scours fail by *confabulating*
  relevance in a prompted field, which no harvest-rate metric detects, and by
  silently dropping items from a batch. Neither has a counterpart in the
  crawler literature.

So: take frontier prioritization, seed selection, anchor-text scoring, harvest
rate, hub-seeking, and the RDS corrections from prior art. The prompting
discipline and the roster reconciliation are ours to work out, because nothing
in the classical setting has an agent that will write a confident sentence to
fill a heading.

## Sources

- [HITS algorithm](https://en.wikipedia.org/wiki/HITS_algorithm), and
  [Link Analysis: Hubs and Authorities on the World Wide Web](https://ranger.uta.edu/~chqding/papers/hits5.pdf)
- [Focused crawler](https://en.wikipedia.org/wiki/Focused_crawler)
- [A Review of Focused Web Crawling Strategies](https://www.proquest.com/scholarly-journals/review-focused-web-crawling-strategies/docview/1288633462/se-2)
- [An Improved Focused Crawler: Using Web Page Classification and Link Priority Evaluation](https://onlinelibrary.wiley.com/doi/10.1155/2016/6406901) (harvest rate, tunneling, interclass rules)
- [Tree-based Focused Web Crawling with Reinforcement Learning](https://arxiv.org/pdf/2112.07620)
- [Snowball sampling](https://en.wikipedia.org/wiki/Snowball_sampling) and
  [Snowball versus respondent-driven sampling](https://pmc.ncbi.nlm.nih.gov/articles/PMC3250988/)
- [Respondent-Driven Sampling, Columbia Mailman](https://www.publichealth.columbia.edu/research/population-health-methods/respondent-driven-sampling)
