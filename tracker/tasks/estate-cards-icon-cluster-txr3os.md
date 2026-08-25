---
id: estate-cards-icon-cluster-txr3os
title: Estate cards still carry the retired three-icon cluster
status: done
closed: 2026-08-02
session: claude/web-tools-project-tracker-reo5qo
opened: 2026-07-26
---
# Estate cards still carry the retired three-icon cluster

The sidebar's Repos rows used to end in three ~16 px icons: a public/private
marker, a config gear, and a GitHub logo. PR #292 retired that. The marker was
promoted to a single 44 px control that opens the repo menu on a tap, and the
gear and logo moved into that menu, on the grounds that each bought exactly one
tap (open the repo and Config is a sidebar row, GitHub is in the menu) while
costing three cramped targets on every row.

The estate **cards** still carry the same cluster, in
`lib/alpineComponents/estate.js`. It was never the same problem there: a card
has room, and the icons sit in a corner rather than crowding a 44 px row. But
the two surfaces now disagree about how you act on a repo, and a reader who
learns the menu on the sidebar will look for it on a card.

Three ways this could go, and the choice is a design call rather than a
mechanical one:

- Give a card the same repo menu, so one gesture works everywhere.
- Trim the card's cluster to match what the sidebar kept (the marker alone).
- Leave it: a card is a bigger surface and can afford to show its actions
  outright, and consistency of *affordance* may matter less than fitting the
  surface.

Done means the estate cards and the sidebar rows tell the same story about
acting on a repo, whichever of those three that turns out to be.

## Progress log
- 2026-07-26: Filed out of the PR #292 sidebar work, which is where the two
  surfaces diverged. Not a regression; the cards are unchanged. Raised in the
  PR and left for a separate decision rather than widened into that branch.
- 2026-08-02: Done on `claude/web-tools-project-tracker-reo5qo` (lands via PR #339). The decision went to the first option, the same repo menu everywhere: the card now carries the sidebar row's pair of triggers (github button opens the GitHub list, the visibility marker opens the actions list), the gear left for the menu's Config row, and a paired card's face switch rides the actions menu as a contributed row, which the shell now accepts for that kind. Cards and sidebar rows tell the same story, which was the definition of done.
