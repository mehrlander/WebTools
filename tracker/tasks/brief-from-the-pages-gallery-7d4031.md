---
id: brief-from-the-pages-gallery-7d4031
title: Reach the take-away menu from show-repo's Pages gallery
status: backlog
opened: 2026-07-26
track: depends-on:focus-a-ui-component-f0awt7
---
# Reach the take-away menu from show-repo's Pages gallery

The Pages gallery (`lib/alpineComponents/pages.js`) is where a person is
already looking at pages, so it is the natural place to say "take that one."
The take-away menu that does it lives in the FAB on the page itself (PR #295).
Connect the two.

## The constraint that decides the design

Do **not** rebuild the menu on the card. A gallery card holds a path and
nothing else, and the fileset a brief needs is the page's *runtime* closure,
which only a running page knows. Measured while building the kit: grepping
`shorter.html` statically finds 3 `gh.load` calls; the page actually loads 9.
A card-side guess is wrong by 3x and wrong silently.

So the card should **link into** the FAB, not duplicate it: open the page with
the drawer already on the take-away menu. That needs a small addition on the
FAB side (honor a query parameter or hash that opens the drawer to a given tab
and menu), which is also useful on its own for any link that wants to point at
the drawer.

## Notes

Depends on the focus task only loosely: if per-region scope lands first, the
gallery link should carry that too rather than being retrofitted twice.

## Progress log
- 2026-07-26: Filed from PR #295 wrap-up, where the gallery entry point was
  proposed and deliberately not built.
