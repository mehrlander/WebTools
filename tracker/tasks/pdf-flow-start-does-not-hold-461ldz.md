---
id: pdf-flow-start-does-not-hold-461ldz
title: pdf.flow's `start` does not survive the column's own layout
status: backlog
opened: 2026-08-29
size: S
---
# pdf.flow's `start` does not survive the column's own layout

`pdf.flow(look, host, { start })` is documented as "0-based page to open on",
and on a document whose pages are not all the same shape it opens somewhere
else. Measured 2026-08-29 from `mehrlander/home` (budget-drs), where a search
result landing deep in a 98-page manual made it visible for the first time.

## The failure

Opening OFM's Part 1 (98pp) at `start: 52` landed the reader on page 35, and
**every** other requested page landed on 35 as well, `start: 0` included. The
handle's own `active()` read 34 immediately after `flow()` resolved, so the
column had already settled on the wrong page before the caller saw it.

Calling `mount.go(52)` a few seconds later lands correctly and sticks. So the
column can reach the page; only the mount-time scroll cannot.

## Cause (suspected)

The kit reserves a page-shaped hole per page from page 1's ratio, then corrects
the ones that differ in a background pass it deliberately does not await
(`if (pages > 1) { (async () => { ... mount.relayout() })() }`). `buildScroll`
takes its scroll before that correction, so the offset it computes is against
provisional heights. The column's scrollHeight was measured growing from about
69,000 to 105,538 pixels after the mount-time scroll had been taken.

`relayout()` preserves `at`, so it is not the culprit: `at` is already wrong by
then, having been read from the provisional scroll.

The kit's own comment anticipates exactly this and records why it was safe when
written: "a PDF usually inherits one MediaBox for the whole document: all eight
documents of the DRS 2019-21 R1 submittal that this was built against are
internally uniform, and none is landscape." Part 1 is not uniform. Its chapter 9
sets the facility-cost tables on wider pages, which is where the estimate
diverges, and the drift is proportional to the distance travelled.

## Done when

`start` lands on the requested page for a document with mixed page shapes, so a
caller does not have to re-assert it. Likely fixes:

- re-apply the start scroll at the end of the background size pass, since it
  already calls `relayout()` and knows whether anything moved;
- or hold the requested start as pending until the reader actually moves, and
  have `relayout()` restore that rather than `at` while it is pending.

## Progress log
- 2026-08-29: Filed from `mehrlander/home` while adding a prose lane to the
  budget-drs app search, which mints document results that open a page. Worked
  around host-side in `submittal.html`'s `mountPages`, which now re-asserts the
  page after the mount until the column agrees twice; that workaround should
  come out once this is fixed. Every existing caller naming a page (a guidance
  cite, a filed section) had the same drift and nobody had noticed, because the
  deep openings were rare until a search result could land anywhere.
