---
id: enforce-house-style-ryz0z5
title: Enforce the house style, now that it is findable
status: backlog
opened: 2026-08-30
size: M
---
# Enforce the house style, now that it is findable

Third recurrence of `house-style-not-consulted` in [SNAGS.md](../../docs/SNAGS.md)
(2026-08-04, 2026-08-29, 2026-08-30). PR #554 fixed the discovery half: the style
guide now states its own names, and `daisy-alpine`'s description leads with the
binding rules instead of selling syntax reference. Nothing yet **catches** a
violation, so the next recurrence is silent again.

Three pieces, one outcome:

- **A scan for the rule with a mechanical tell.** Rule 1 says to treat any
  `stats`, `stat-value`, or KPI-tile grid as a defect, which is a grep, not a
  judgment. Gate it the way `dead-opacity.py` gates, since there is no judgment
  in it. **Rule 3 (reading columns) turned out to be equally mechanical and was
  done first**, in PR #565: `.claude/skills/hooks/reading-column.py` plus a
  `PreToolUse` guard, with 69 violations cleared. What remains here is rule 1;
  the rest (page prose, type sized for reading, browsing takes the viewport)
  turn on reading the page.
- **Widen what the existing scanners see.** `dead-opacity.py` and
  `stranded-titles.py` both default to `lib app pages`, so the 2026-08-29 page,
  built in `dump/`, was checked by nothing. Either widen the defaults or make
  them read the branch diff, which is the shape `npm run showing` already uses.
**The discovery half is confirmed to have worked, so it is no longer part of
this task.** Read from `skillAttention` on 2026-09-03, across 296 sessions:
`daisy-alpine` fired 5 times in the 267 sessions before 2026-08-31 and 8 times
in the 29 since, moving from 1.9% of sessions to 28%. It was the most-invoked
skill in the post-change window, ahead of `tasks`. `dataviz`, which it trailed
5 to 4 before the change, has not fired since 2026-08-28. PR #554 worked; what
is left here is the catching, not the finding.

**Done when** a stat-card grid in a changed file fails the suite and the
scanners reach files outside `lib app pages`.

## Progress log
- 2026-09-01: Rule 3 landed on `claude/map-injection-tab-wrapping-veo5r5` (PR #565), which corrects this task's claim that rule 1 was the only rule with a mechanical tell. The guard ships in the portable plugin rather than under `scripts/`, which also answers the second bullet for this rule: a `PreToolUse` hook is path-independent, so a page built in `dump/` is covered even though the scanners' default roots are not. Rule 1 and the invocation-count reading are the residual.
- 2026-08-30: Filed at the third recurrence, per the conventions' rule that the third earns a task. The discovery half shipped in PR #554; this is the enforcement residual it does not cover.
