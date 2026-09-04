---
id: pane-width-not-window-width-wnabwo
title: Audit the app's views for viewport breakpoints inside the content pane
status: backlog
project: repo
opened: 2026-08-23
size: S
---
# Audit the app's views for viewport breakpoints inside the content pane

Docking the swipe deck narrows the content pane through `--deck-dock-left` and
leaves the window where it was, so any `sm:`/`lg:`/`xl:` rule inside that pane
keeps answering a question nobody asked: how wide is the WINDOW. Nothing is
wrong at any window size, which is why these survive.

**The rule is already written**, so this task is the sweep and nothing else:
`skills/daisy-alpine/references/mechanics.md` rule 10 says to size a pane by its
container, `@container` on the column and `@md:`/`@xl:` in place of `sm:`/`lg:`.
(No longer in `docs/HTML-STYLE.md`, a pointer since 2026-08-31.)

## Three converted, and what each taught

| View | Found | Fix |
| --- | --- | --- |
| Docs (PR #480) | a 20rem side column at `lg:` inside a sub-400px pane, files pushed under the deck and clipped | `@container`, `@2xl:`/`@5xl:` |
| Stage bench | an `xl:` 26rem aside laid out in a 368px pane, overflowing by 24px onto the deposit column | `@container`, `@2xl:`/`@5xl:`/`@7xl:` |
| Files (PR #574) | not a breakpoint at all: `max-w-7xl` on the pane and a `mx-auto` 65ch measure in `viewer.js`, composing into two nested corridors | `!max-w-none` on both |

The Stage bench was measured before and after with a headless probe: 8
overlapping element pairs and 8 elements past the pane's right edge, both to
zero, with the undocked layout unchanged at every width.

**Files is why the sweep cannot be a grep.** `npm run reading-column` reported
"none" over that screen, because a page-shell size and a standing opt-out are
each exempt by design and still compose into a corridor. Look for the second
mechanism, not just the first.

## Done when
Every view reachable in the content pane has been opened with the deck docked and
either reflows or is recorded as deliberately fixed-width.

## Progress log
- 2026-08-23: Filed from PR #480 and logged as
  `viewport-rule-blind-to-a-docked-pane` in SNAGS. The Stage bench converted the
  same day, found the same way.
- 2026-09-03: Files converted by PR #574 without this task being cited.
- 2026-09-04: Recorded that conversion, trimmed the done-condition (the clause
  asking this task to write its own rule is satisfied), and cut the body from
  581 words. Still unaudited: every view but those three.
