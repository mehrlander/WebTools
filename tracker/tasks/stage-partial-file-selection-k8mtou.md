---
id: stage-partial-file-selection-k8mtou
title: Give the stage a way to carry part of a file
status: backlog
opened: 2026-07-26
size: M
---
# Give the stage a way to carry part of a file

The stage is the repo's tool for choosing which files travel, and it works at
whole-file granularity only. Every carrier built on it (`#stage=`, the bundle
download, the Diff lens, the brief's hand-off from PR #295) inherits that.

The gap shows up whenever the interesting part is a region rather than a file:
one function out of a 1,100-line component, the branch's actual change inside a
file that is mostly unrelated, the piece of a page someone wants a second
opinion on.

## Not urgent, and worth saying why

At the sizes measured while building the brief kit, a whole page plus its own
modules is 10-15K tokens, which fits any model comfortably. So this is not
blocking the review path today. It becomes real when the unit of attention is
smaller than a file, which is the same pressure
`focus-a-ui-component-f0awt7` describes from the UI side.

## What has to be decided

- **Grammar.** `#stage=` addresses items as `owner/repo[@ref]:path`. A range
  needs a form that does not collide with the existing separators (`;` between
  groups, `,` between paths) and stays readable, e.g. a `#L120-L145` suffix
  matching the caption convention already used in chat.
- **Anchoring.** Line numbers rot. A range pinned to a ref is stable; one
  pinned to a branch tip is not. Decide whether ranges resolve at mint time or
  read time, and say so in the grammar.
- **The UI.** Selecting a range in the stage's file view, and showing that an
  item is partial rather than whole.

Contract lives in `docs/show-repo.md` and `lib/alpineComponents/stage.js`
(`StageLink`).

## Progress log
- 2026-07-26: Filed from PR #295 wrap-up. Raised there while deciding whether
  the brief should route through the stage; the conclusion was that the FAB
  computes the fileset and the stage receives it, which leaves this gap
  visible but not blocking.
