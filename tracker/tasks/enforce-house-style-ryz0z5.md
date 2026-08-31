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

- **A scan for the rule with a mechanical tell.** `HTML-STYLE.md` already says to
  treat any `stats`, `stat-value`, or KPI-tile grid as a defect, which is a
  grep, not a judgment. It is the only house rule that is; the rest (page prose,
  type sized for reading, browsing takes the viewport) turn on reading the page.
  Gate it the way `dead-opacity.py` gates, since there is no judgment in it.
- **Widen what the existing scanners see.** `dead-opacity.py` and
  `stranded-titles.py` both default to `lib app pages`, so the 2026-08-29 page,
  built in `dump/`, was checked by nothing. Either widen the defaults or make
  them read the branch diff, which is the shape `npm run showing` already uses.
- **Then measure whether the description change worked.** PR #554 added
  `skillAttention`, so the question is now answerable: over the sessions after
  2026-08-30, does `daisy-alpine` fire on page work, and does it still trail
  `dataviz` (5 invocations to 4 across the 266 sessions before the change)?
  That is the test of the fix, and it needs elapsed time rather than a session.

**Done when** a stat-card grid in a changed file fails the suite, the scanners
reach files outside `lib app pages`, and the invocation counts have been read
once against the pre-change baseline.

## Progress log
- 2026-08-30: Filed at the third recurrence, per the conventions' rule that the third earns a task. The discovery half shipped in PR #554; this is the enforcement residual it does not cover.
