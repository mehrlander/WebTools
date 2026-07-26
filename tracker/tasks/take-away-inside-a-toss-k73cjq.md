---
id: take-away-inside-a-toss-k73cjq
title: Make the take-away menu work inside a toss
status: backlog
opened: 2026-07-26
---
# Make the take-away menu work inside a toss

The FAB's take-away block is hidden inside a toss (`x-show="!viaToss"`, a rule
that predates PR #295 and applied to the old export button too). That is
correct today and still wrong overall.

**Why it is correct today.** In a toss the FAB is the *shell's*, adopting the
rendered subject. `window.gh` therefore belongs to the shell, so
`gh.get(path)` would fetch the subject's path at the **shell's** ref, not the
tossed one. Silently exporting main's copy of a page you are viewing at a
branch is worse than offering nothing.

**Why it still matters.** Tossing is how you look at a page at another ref. So
the moment a person is most likely to want to take a copy is exactly the moment
the affordance disappears.

## What it needs

The subject's own closure lives in the toss frame's window, not the shell's:
`__loadedScripts` and `__reads` are per-window, and the subject frame is
reachable (`window.__tossFrame` / `__tossSubject`, which the Inspect tab
already scans to list the subject's components). So the shape is probably:

- teach `lib/kits/brief.js` to take a `win` (default `window`) and read the
  closure and `gh` from it rather than from globals,
- have the FAB pass the subject frame when `viaToss`,
- keep the ref honest: the brief header must name the ref actually rendered.

The Inspect tab having already solved the cross-frame scan is the reason to
believe this is tractable.

## Progress log
- 2026-07-26: Filed from PR #295 wrap-up. Behavior unchanged there; the
  hiding rule was inherited from the export button and left alone once the
  wrong-ref hazard was understood.
