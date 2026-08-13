---
name: ios-sheet-drag
description: Keep a drag interaction working on iPhone when the page is opened in a sheet, the presented card the user dismisses by dragging down. Use when a splitter, slider, resize handle, drag-to-reorder, or canvas pan closes the sheet or refuses to move on iOS, when a scrollable pane dismisses the sheet on overscroll, or when touch-action:none did not fix it. Also use before building any custom drag gesture for a page that will be opened from an app on a phone.
---

# Dragging inside an iOS sheet

A page opened from an app on iPhone is usually presented in a **sheet**, a card the
user dismisses by dragging down. Any downward drag in the page competes with that.

The host dismisses on the web view's **scroll**, not on touches. Two paths feed it,
and they need different fixes.

## Path 1: a drag handle

`touch-action: none` alone is **not enough**. Measured on device: with it, the
sheet still took the drag. Cancel the touch events too.

```css
.drag-handle {
  touch-action: none;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
```

```js
handle.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
handle.addEventListener("touchmove",  e => e.preventDefault(), { passive: false });
```

`{ passive: false }` is mandatory; a passive listener cannot cancel anything.
Cancelling `touchstart` also kills the text selection and long-press callout a
drag on a bar otherwise triggers.

This costs no pointer events: `preventDefault()` on a touch event suppresses the
compatibility **mouse** events, not Pointer Events, so a `pointerdown` drag
handler still runs. `preventDefault()` on a Pointer Event does nothing here,
since pointer events cannot cancel scrolling.

In Alpine: `@touchstart.prevent @touchmove.prevent` (it attaches non-passively
unless you add `.passive`).

## Path 2: a scrollable pane

`touch-action` cannot reach this one, because a gesture starting in a scroller
legitimately *is* a scroll. At the pane's top, continued pulling chains the
overscroll outward and the host reads it as dismiss.

```css
.pane { overflow: auto; overscroll-behavior: contain; }
```

Holding `scrollTop` at 1 so the pane never sits exactly at the top also works and
feels worse: it leaves a permanent pixel of offset under content meant to sit
flush. Prefer `contain`.

## Also

`setPointerCapture()` throws on a pointer id the browser does not hold active,
and the throw aborts the handler before any listener is attached, so the drag
silently never works. Wrap it in `try/catch` and put `pointermove` / `pointerup`
on `window`; captured events still bubble there, so one path serves both cases.

## Testing

Headless browsers reproduce `touch-action` and scrolling but not a native host's
sheet dismissal, so emulation cannot answer whether the sheet survives. Build one
small self-contained page with a cell per technique, differing only in the
technique, and open it on the device. Have each cell print its own move-event
count: a variant that looks like it worked but logged two moves actually lost the
gesture to the browser.
