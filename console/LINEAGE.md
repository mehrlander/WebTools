# Where the mods came from

Every mod in [`mods/`](mods) has an argument behind it that was had somewhere
else first, usually two or three years ago, usually in a bookmarklet that no
longer exists. This file is the join: one row per mod, the earlier tool it
descends from, and **the approach that was tried and abandoned on the way**,
which is the part worth having.

It exists because the suite reads as though it were designed. It was not. Most
of these mods are the third or fourth answer to a question first asked in 2023,
and knowing which answers already failed is the difference between changing one
and re-losing an argument.

**Provenance.** Derived 2026-08-29 from a code-archaeology pass over the
author's chat archive: 677 conversations carrying page-inspection JavaScript,
2023-10 to 2026-07, sorted into twenty tool families with each complete paste
kept as a dated version. That archive is private (`mehrlander/chat-histories`,
`annotations/code/dom-tools/`), so this file is written to stand alone: dates
and techniques, no links that only resolve for one reader.

## The table

"Ancestor" is the earliest family in the archive doing recognisably the same
work. A blank means the pass found none, which is a claim worth making: those
mods answer problems that only appear once you have a persistent working set,
so they had nothing to inherit.

| Mod | Ancestor | First seen | What was tried first, and dropped |
| --- | --- | --- | --- |
| `pick` | the hover overlay | 2023-12 | Click **cycled ancestors** (`currentIndex = (i+1) % elementStack.length`) because a hover inspector cannot reach a container its own children cover. That job moved to `verbs`, freeing the click for membership. |
| `verbs` | the hover overlay | 2024-07 | Climbing was an interaction, not a vocabulary: one gesture, one element, no way to say it twice. |
| `census` | Structural X-Ray | 2026-02 | Grouped by **typographic signature plus left edge** (font family/size/weight/style/transform, positions clustered at 3px). Ranked by DOM depth, not by count. `geoReg` survives as `summary()`'s kernel. |
| `templates` | Structural X-Ray, `dom-sig` | 2025-05 | Signatures were compared whole, so one hashy class (`css-1a2b3c`) split a group. Slots are the fix. |
| `infer` | the element inspector's *path buddies* | 2024-08 | The same relation read the other way: from one element **to** its structural siblings, live on hover. It died of performance (a table of buddies needed a `WeakMap` cache, a debounced `mousemove` and virtual scrolling, and still stalled). `infer` runs it once, from a set to a selector, and never on hover. |
| `grow` | the element inspector's *path buddies* | 2024-08 | Same ancestor, other half: "everything alike" was a hover readout before it was an operation on a set. |
| `deck` | the popup DOM tree viewers | 2024-09 | **Three attempts to live inside the host page**, all lost: light DOM (host CSS reaches in), shadow DOM (survives CSS, dies on rerender), an iframe (isolated, but no access). Also a full z-index war, clamping every non-static element on the page. `deck` gives up and takes its own window. |
| `columns` | `nice-table` | 2024-03 | Same move on one corpus: a `<pre>` of legislative text split on `<br>` into a sortable table. Generalising it to any repeating set is the whole change. |
| `lasso` | the region-drawing dashboard | 2026-02 | The tabbed analytical view (Summary, Tree, Elements, Attributes) was **abandoned** for drawing rectangles over an iframe and asking which elements fall inside, on the argument that structure reads better geographically than hierarchically. `lasso` keeps the argument and drops the iframe. |
| `scan` | the aside scanner | 2025-06 | `_asideScanInterval`, a bare `setInterval` re-reading a region. No dedupe, no persistence, so a long run drowned in repeats. |
| `harvest` | the aside scanner | 2025-06 | Same origin; the scroll-and-accumulate half. |
| `query` | the XPath tally bookmarklet | 2024-03 | Paths were **tallied and picked from a list** (`tallyXPaths`, `traverseElement`), not written. Fine for one page, unrepeatable on the next. |
| `tap` | — | | Watching the wire has no ancestor in the archive: three years of tools all read the rendered DOM. |
| `semantics` | — | | Nothing in the archive reads JSON-LD or microdata; the assumption throughout was that structure had to be inferred. |
| `join`, `sets`, `recipe`, `watch` | — | | These answer problems that only exist once a selection persists, so there was nothing to inherit. `watch` in particular answers a bug the archive predates. |

## Two things the whole line kept

**A computed identity per element.** From the first tool onward (depth-coloured
labels, 2023-10) every version derives a string that names an element rather
than describing it. It becomes an XPath in 2024, an indexed tag path (`getPath`)
in the bill tooling through 2024, and `sig.path` here. `census` grouping on the
*unindexed* path is the same idea with one character removed.

**Wrapping text nodes to address what is inside an element.** Present as
`wrapWords` in the first overlay bookmarklet (2023-12), as
`tokenizeText`/`untokenizeText` through 2024, and as the X-Ray's **Wrap** toggle
in 2026-02, which spans each text node so grouping can work below element
granularity. No current mod does this. It is the one recurring idea from the
archive with no descendant here, which either means it was never worth it or
means it is the gap.

## One hazard, still live

A `javascript:` URL is URL-decoded before it runs, and this has silently eaten
code twice, two years apart. In 2024-07 a bookmarklet came back out of Chrome
with `%27` where every quote should be. In 2026-03 a pass to protect backticks
by writing them `%60` also decoded a `%360` already sitting in a hue formula
(`%36` is `6`), turning `137.5 * n % 360` into `137.5 * n60`, so every group
was handed the same colour. The session that hunted it called it "a pre-existing
operator error" and never found it.

Nothing in `console/` ships as a bookmarklet today, which is what makes the
hazard invisible rather than absent: paste a mod into a `javascript:` URL and it
returns.
