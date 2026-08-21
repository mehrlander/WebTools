---
id: app-view-fab-subject-1evnwv
title: The FAB drawer should let you pick which layer it describes
status: done
closed: 2026-08-21
session: claude/toss-url-shorthand-dz0xpt
opened: 2026-08-20
size: M
---
# The FAB drawer should let you pick which layer it describes

A page reaches the screen through a stack of frames, and the drawer describes
exactly one of them without saying which. Give it a chooser at the top: one row
per layer, outermost to innermost, current one selected. The drawer then
describes whichever you pick.

## Why this replaces the question that was filed here

This task used to ask a yes-or-no: should the drawer describe the app shell or
the page inside it? Both answers are wrong in some context, which is the tell
that the question was wrong. The stack is real and the reader can see it is
real; hiding it behind a winner is what made the indicator dishonest. Showing it
is simpler to explain than either winner would have been.

It also removes the half that made the original fix risky. Announcing a subject
upward needs a matching clear when the frame goes, or the drawer describes a
page no longer on screen. A chooser derived by WALKING THE LIVE FRAME TREE has
nothing to clear: a layer that goes away stops being in the list. Prefer the
walk to the announcement for that reason.

## The stacks that occur

| context | layers, outermost first |
| --- | --- |
| a deployed page | the page |
| a toss | `toss-render`, the subject |
| the app view, a project landing | the app shell, `toss-render`, the page |
| a nested toss | the app shell (sometimes), `toss-render`, `toss-render`, the page |

One row is the degenerate case, and should read as a label rather than a
control.

## Decisions inside it

- **What the launcher glyph summarizes.** It is one mark and the stack is many.
  Proposal: it follows the SELECTED layer, which defaults to the innermost
  readable one, and every row in the chooser carries its own off-ref mark so a
  layer that is off its default branch cannot hide behind a neutral launcher.
- **How far the selection reaches.** Proposal: all of it. The ref bar, the
  branch list, the path picker, the guide, Inspect, and the take actions all
  follow the selection. A drawer where half the panes follow and half do not is
  worse than either fixed choice.
- **Labels.** A phone drawer has room for a filename and a ref chip, not a path.
  The role (app, renderer, page) is the caption.

## The limit, which the chooser should say out loud

Only same-origin layers can be walked. A `#gz=` payload toss renders under an
opaque origin, so the innermost layer is sealed and cannot be identified. The
chooser lists what it can reach and names the sealed one as sealed, rather than
omitting it and implying a shorter stack.

## Done when

- The drawer's top strip lists the layers, marks the selected one, and every
  pane below it describes that layer.
- Opening a page in the app view selects the page, and the launcher tints from
  it, so branch code no longer reads as canonical.
- A one-layer context shows no strip at all, which is one step past the label
  this asked for: a one-row chooser is a control that cannot do anything, and
  the identity block below already names the page.
- An opaque layer is listed and named as unreachable.

## Progress log
- 2026-08-20: filed alongside PR #465, which fixed the two defects underneath
  the same indicator (the escape button's destination and the favicon dimming)
  and left this one.
- 2026-08-20: a closer read found the old framing was a design change rather
  than a bug fix: `app/index.html` already reasons about the framed FAB and
  offers the bust-out action as its mitigation.
- 2026-08-20: reframed by Marcus, from "which layer should win" to "show the
  choice." Rewritten around that. The bust-out action stays useful and stops
  being the answer to this.
- 2026-08-21: claimed on `claude/toss-url-shorthand-dz0xpt`, restarted from main
  after PR #465 merged.
- 2026-08-21: done on `claude/toss-url-shorthand-dz0xpt`; lands via PR #467. The
  walk turned up two things the design did not anticipate, both now handled: an
  in-document subject (a deck slide) has no frame to walk to, and a raw stamp
  from a route-blind shell has to be resolved the same way in the walk as in
  adoptSubject or the refresh undoes the rewrite. The launcher tint needed no
  change: it already followed the selected layer.
