---
id: focus-a-ui-component-f0awt7
title: Let a brief cover one picked region instead of a whole page
status: backlog
opened: 2026-07-26
size: M
---
# Let a brief cover one picked region instead of a whole page

Give `lib/kits/brief.js` a scope: assemble a brief covering one region of a
running page and the code behind it, rather than the page whole.

This task was filed as an open design question about how a person designates a
piece of UI at all. That question has since been answered by work that did not
cite it, so what is left is the one consumer that motivated it.

## What is already built

**Designation: `lib/kits/peek.js`.** Point at something and the page answers
with the element; point again in the same spot and it answers with the parent,
then its parent, up to `<body>` and around. The chain is the unit, not the
element, and stepping it re-queries nothing. That is the affordance this task
was written to find, including the granularity fix it said the FAB's Inspect tab
lacked: too coarse for one row inside a component, too fine for a whole sidebar
is exactly what an ancestor chain with a step control resolves.

**Identity: `lib/kits/annotate.js`.** Five targeting modes with one note shape,
each carrying an anchor meant to survive a reload: a W3C-style text quote
(exact plus prefix and suffix) for text, a css path and text excerpt for a
picked element, a rectangle in document coordinates for a region, and a source
file plus line span for a section of a rendered markdown document.

**The hard half, answered honestly rather than solved.** This task worried that
going from a rendered region back to the code responsible for it is the part
that might not be possible, and said that if so, the finding should be stated
and the feature scoped to where the mapping exists. That is what annotate does:
where a render declares what it is a rendering of, the address resolves to
`docs/APP.md § Mechanism (lines 16-28)`; where it does not, the anchor is a css
path, which addresses a DOM that exists only while the page is open. The
distinction is stated at the top of the kit rather than papered over.

**Highlight**, one of the three verbs, is done: element and region notes get
positioned outline boxes.

## What is left

`brief.js` exposes `plan`, `assemble`, `copy`, `stageUrl`, and takes no scope.
On a page that boots the whole pre-build it throws:

> This page boots the whole pre-build (~262K tokens). Brief a single component instead.

There is no way to do what that message says. `app/index.html` is still the page
that most needs this and the one that most resists it, and it is still the test
of whether an answer is real.

So: a scope option on `plan`/`assemble`, fed by a Peek chain, resolving to the
modules behind the picked subtree. The `scope` verb is the work; `filter`, the
third verb this task once listed, has no consumer asking for it and is dropped.

## Done means

`brief` assembles for a picked region of `app/index.html` and names its scope in
the brief header, or the attempt establishes that region-to-module cannot be
resolved for a subtree even with Peek's chain in hand, said in one line here.

## Progress log
- 2026-07-26: Filed from PR #295 wrap-up. The brief kit and the FAB take-away
  menu landed there; this is the piece deliberately left undone. Framing widened
  from "per-Alpine-component briefs" to any UI region, since the component
  registry is the wrong granularity for what a reader points at.
- 2026-09-04: Rewritten to its residual during a tracker refinement pass, and
  sized M rather than `?`. Two of the three things this task set out to decide
  are built and were built without reference to it: `kits/peek.js` (PR #547) is
  the picker, and `kits/annotate.js` is the anchoring vocabulary. The task's own
  fallback position, scope the feature to where the source mapping is declared
  and be honest elsewhere, is the position annotate took. `brief.js` is
  unchanged and still refuses a whole-lib page while naming a per-component
  scope that has no entry point, which is now the whole task.
