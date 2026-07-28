---
id: private-companion-own-card-227u5s
title: Decide whether a -private companion gets its own Repos card
status: backlog
opened: 2026-07-28
next: decide, then make the sidebar and the cards agree either way
---
# Decide whether a -private companion gets its own Repos card

The estate's two repo listings disagree about what a `foo` / `foo-private`
pair is, and PR #307 widened the gap deliberately rather than closing it.

- The **estate cards** nest the companion inside its public parent
  (`applyNesting` in `estate.js`, by the naming convention, no config field),
  so the pair is one card with two faces.
- The **sidebar Repos index** lists both as peer rows, and always has.

That split is what retired the repo menu's "Switch to `<companion>`" row in
#307: the jump was built for a list that shows one of a pair and hides the
other, which is the cards, not the sidebar, so from the sidebar it offered a
jump to a row three lines down.

The user's read at the time: listing them separately in the sidebar makes
sense, and the cards might follow, but hold on the card side. This task is
that hold.

**Done means** the two listings agree, or the disagreement is written down as
intentional with its reason. If the cards do gain a separate card, check
whether anything else keys on the nesting (`face(e)`, `child`, `nested`) and
whether "Switch to the companion" should come back somewhere.

## Progress log
- 2026-07-28: Filed from the PR #307 session, which removed the companion jump
  from the sidebar's repo menu and left the cards' nesting untouched.
