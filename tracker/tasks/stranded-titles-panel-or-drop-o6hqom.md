---
id: stranded-titles-panel-or-drop-o6hqom
title: Decide the remaining stranded title attributes, panel or leave
status: backlog
opened: 2026-08-19
size: M
priority: low
---
# Decide the remaining stranded title attributes, panel or leave

`npm run title-survey` reports 89 **stranded** titles across the app: places
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
