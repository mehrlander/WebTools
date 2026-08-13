---
name: ios-sheet-drag
description: Keep a drag interaction working on iPhone when the page is opened in a sheet, the presented card the user dismisses by dragging down. Use when a splitter, slider, resize handle, drag-to-reorder, or canvas pan closes the sheet or refuses to move on iOS, when a scrollable pane dismisses the sheet on overscroll, or when touch-action:none did not fix it. Also use before building any custom drag gesture for a page that will be opened from an app on a phone.
---

# Dragging inside an iOS sheet

**Load [`docs/ios-sheet-drags.md`](https://github.com/mehrlander/web-tools/blob/main/docs/ios-sheet-drags.md) and follow it.** That doc is the
measurement and the fix for both paths, including the variant table, the
compatibility-click trap, and where the estate already applies it. This file is
the trigger surface: a doc cannot be found by a session that does not know it
exists, and a session hitting this bug is searching for a symptom, not a filename.

Two things worth carrying in your head, because they are what make the bug
survive a first fix:

- **`touch-action: none` is necessary and not sufficient.** Measured on device,
  the sheet still took the drag. Cancel `touchstart` and `touchmove` too, both
  non-passively, or `preventDefault()` cannot bite.
- **A scrollable pane is a second path, and `touch-action` cannot reach it,**
  since a gesture starting in a scroller legitimately is a scroll. That one wants
  `overscroll-behavior: contain`.

And one rule about settling it: headless browsers reproduce `touch-action` and
scrolling but not a native host's sheet dismissal, so emulation cannot answer
whether the sheet survives. Build a probe page with one cell per technique and
open it on the phone.
