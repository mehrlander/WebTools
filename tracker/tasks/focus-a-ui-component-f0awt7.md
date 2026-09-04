---
id: focus-a-ui-component-f0awt7
title: Find a way to focus attention on one piece of a page's UI
status: backlog
opened: 2026-07-26
size: ?
---
# Find a way to focus attention on one piece of a page's UI

Settle how a person designates **one region of a running page** and then works
on just that: scope a review to it, filter a listing to it, highlight it in
place. The unit is a piece of UI as a reader perceives it, which is not
necessarily an Alpine component. It might be a toolbar, a card, a panel, one
row of a table, or a subtree that no component boundary matches.

The consumer that motivated it is the review brief (`lib/kits/brief.js`, PR
#295), which today can only take a whole page. On most pages that is 10-15K
tokens and fine; the request behind it was narrower, and better: *focus on some
piece*. But the affordance is worth more than the brief. Scoping, filtering,
and highlighting are the same question asked three ways, and inspection and
review both want the answer.

## What has to be decided

**Designation.** How does the region get picked? Candidates, none settled:

- The FAB's Inspect tab already lists Alpine components and outlines one in
  place on tap. That is a working picker, but its vocabulary is the component
  registry, which is the wrong granularity in both directions: too coarse for
  one row inside a component, too fine for "the whole left sidebar."
- Point-and-pick against the live DOM (hover to outline, tap to select),
  which needs no registry and matches how a person sees the page. Costs a
  mode, and has to survive a drawer sitting over the page.
- A declared region: an attribute a page author puts on a subtree. Precise
  and stable, but only covers regions someone thought to mark.

**Identity.** Whatever is picked has to be nameable in a way that survives a
reload and can be written into a link, a brief header, or a task. A DOM path
is fragile; a component id is stable but only where components exist.

**What "focus" then does.** At least three verbs, and they may not want the
same mechanism:
- *scope*: assemble a brief (or an export) covering only this region and the
  code behind it
- *filter*: hide or de-emphasize everything else in a listing
- *highlight*: outline it in place, which the Inspect tab already does

## Why it is not obvious

Going from a rendered region back to *the code responsible for it* is the hard
half, and it is what a scoped brief needs. For an Alpine component the mapping
exists (the registry knows which file defined it). For an arbitrary subtree it
does not, and a wrong answer is worse than none: a brief that claims to cover a
region while omitting the module that renders it is misleading in a way the
whole-page brief cannot be.

`app/index.html` is the page that most needs this and the one
that most resists it: it boots the whole pre-build (~262K tokens), so
`brief.assemble` refuses it outright. Any answer here should make show-repo
briefable a piece at a time, which is a good test of whether the answer is real.

## Done means

A decided mechanism, not necessarily a large one: a way to pick a region, a way
to name it, and at least one of the three verbs working end to end. If the
honest finding is that region-to-code cannot be done reliably for arbitrary
subtrees, say so and scope the feature to where the mapping exists.

## Progress log
- 2026-07-26: Filed from PR #295 wrap-up. The brief kit and the FAB take-away
  menu landed there; this is the piece deliberately left undone. Framing
  widened from "per-Alpine-component briefs" to any UI region, since the
  component registry is the wrong granularity for what a reader points at.
