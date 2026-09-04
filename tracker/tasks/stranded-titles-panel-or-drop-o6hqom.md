---
id: stranded-titles-panel-or-drop-o6hqom
title: Decide the remaining stranded title attributes, panel or leave
status: backlog
opened: 2026-08-19
size: M
priority: low
---
# Decide the remaining stranded title attributes, panel or leave

`npm run stranded-titles` reported 89 **stranded** titles across the app when
this was filed, and 120 on 2026-09-04: places
where a `title` attribute is the only route to a fact, so a phone reader never
reaches it at all. PR #447 fixed the worst cases on the branch row and the
sessions row and left the rest, because HTML-STYLE.md's rule turns on judgment
the survey cannot supply: *a tooltip worth having is worth building*, and some
of these tooltips are not worth having in the first place.

They sit in four components, and the concentration is the point. This is a
habit rather than a scattering of accidents:

| Component | Stranded |
| --- | --- |
| `lib/alpineComponents/estate.js` | 24 |
| `lib/alpineComponents/map.js` | 20 |
| `lib/alpineComponents/state-view.js` | 15 |
| `lib/alpineComponents/fab.js` | 13 |
| everything else | 17 |

The method is settled, so this needs no design pass. For each one, decide
between three answers: **build the panel** where the fact is worth reaching
(the row card in `estate.js` is the worked precedent, and a list card costs
nothing when the data is already in hand), **put words on the page** where a
mark is carrying meaning no reader can guess, or **leave it** where the title
is a convenience label for a control whose action is obvious and reachable by
tapping. Most of the 89 are the third answer, which is why this is low
priority rather than a defect list.

Do it a component at a time; they decouple cleanly and nothing here needs to
land together.

## Done when

Every stranded title in those four components has been decided rather than
merely counted, and the ones that earned a panel have one.

**Not** when the survey reports zero, and that distinction matters enough to
state. The count cannot see its own best outcome: a mark that gains visible
text still reports stranded while the *reason* stays in its title, which is the
right result for a reader and no movement in the number. Two marks already sit
in that state deliberately (the dimmed twins on a session row, where the visible
dash says "unknown" and the title distinguishes the two causes). Read the list,
not the total.

## Progress log
- 2026-08-19: Filed. Findings and the audit behind them are in web-tools PR #447
  and its survey comment; the reasoning about why three hand passes got this
  wrong is recorded in home `chron/2026/08/2026-08-19-the-hand-audit-was-wrong-three-times.md`.
  Next step is a component at a time, `map.js` first as the largest untouched one.
- 2026-08-28: Command name corrected here; it is `npm run stranded-titles`, and
  `npm run title-survey` never shipped. The count has moved 89 to 110, and the
  three largest components have all grown: estate.js 24 to 29, map.js 20 to 27,
  state-view.js 15 to 16. The rule this task decides against now carries the
  replacement it was missing (web-tools PR #543): HTML-STYLE.md states the four
  behaviours a built panel owes, and daisy-alpine carries it as house-style rule
  7, which is what should stop the total climbing while the backlog is worked.
- 2026-09-04: 120 stranded, up from 110 a week earlier and 89 at filing. That is
  the second consecutive reading where the count rose after the fix meant to hold
  it: house-style rule 7 (PR #543) landed 2026-08-28 and the total gained ten in
  the six days after. The rule is not holding the line on its own, which argues
  for working the list a component at a time rather than waiting on it. The
  four-component table is the 2026-08-19 survey and is not restamped; rerun the
  command for current per-component figures.
