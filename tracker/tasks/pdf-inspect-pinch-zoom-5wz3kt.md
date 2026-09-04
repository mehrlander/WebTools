---
id: pdf-inspect-pinch-zoom-5wz3kt
title: Pinch-zoom and pan for pdf-inspect's page view
status: backlog
opened: 2026-07-26
size: M
---
# Pinch-zoom and pan for pdf-inspect's page view

The one usability gap left in `pages/pdf-inspect.html` after PR #294, named
rather than guessed at: it was hit on a phone and reported.

## The problem

Page mode defaults to fit-to-width, and a US Letter page fitted to a 390px
viewport renders at about 0.58 scale. Everything is legible in the sense that it
is drawn correctly, and nothing is readable. The zoom control steps to 1x, 2x,
3x, but at those scales the page overflows and the only way around it is a
two-finger scroll, which is not what a reader's hands do to a document.

## What is in the way

The stage carries `touch-none` and `preventDefault` on pointerdown, because a
drag there is a selection and must not scroll the page underneath. That is the
right call for the selection and it is exactly what blocks the browser's own
pinch handling.

So the two gestures have to be told apart by pointer count: one pointer is a
selection drag, two is a pinch. `setPointerCapture` on the first pointer
complicates the second, so the handler needs a small pointer map rather than the
single `_orbit`-style object the stack uses.

## Worth deciding first

Whether pinch changes `scale` (re-rendering the page at the new scale, which is
sharp and costs a pdf.js render) or applies a CSS transform to the existing
canvas (instant and blurry, resolving to a real render when the gesture ends).
The second is what a document viewer does, and it is more work.

The overlay is projected through `pdf.view` at the render scale, so whichever
route is taken, the overlay and the canvas must be transformed together or the
boxes drift off the ink. That is the trap.

## Not this task

The orbit gesture in stack mode fights the Claude app's sheet, which reads a
horizontal drag as a swipe to dismiss. That is outside the page's control; the
axis picker and saved views exist so the gesture is never the only route.

## Progress log
- 2026-07-26: Filed at the wrap-up of PR #294, from using the page on a phone.
