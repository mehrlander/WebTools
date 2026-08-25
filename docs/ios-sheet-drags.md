# Dragging inside an iOS sheet dismisses the sheet

Measured on an actual iPhone, 2026-08-12, against a probe page carrying one cell
per technique. The negative results are the value here: the fix everyone reaches
for is necessary and, on its own, does not work.

## Context

A web page opened from an app on iPhone is usually presented in a **sheet**: a
WKWebView in a card the user can dismiss by dragging down. Any custom drag in
the page that moves downward competes with that dismissal.

Symptom: a splitter, slider, or drag handle either does not move at all, or
moves for a moment and then the whole sheet slides away.

## Mechanism

The host dismisses the sheet from the **scroll** of the web view, not from
touches directly. Two independent paths feed it, and they need different fixes.

1. **A gesture that starts on your drag handle.** If the browser reads the touch
   as a scroll, the scroll reaches the host and the host dismisses.
2. **A gesture that starts inside a scrollable element.** That gesture *is* a
   scroll. When the element reaches its top and the finger keeps pulling, the
   overscroll chains outward to the document and then to the host.

Path 2 cannot be fixed with `touch-action`, because the touch legitimately
belongs to a scroller.

## What does not work

Dragging downward on a handle:

| Variant | Technique | Result |
| --- | --- | --- |
| A | nothing (`touch-action: auto`) | sheet dismisses |
| B | `touch-action: none` on the handle | **still dismisses** |
| C | B plus non-passive `touchmove` + `preventDefault()` | holds |
| D | C plus non-passive `touchstart` + `preventDefault()` | holds, and no text selection |
| E | `preventDefault()` only, no `touch-action` | holds |

**B is the one to remember.** `touch-action: none` is the answer everyone
reaches for, it is necessary, and inside a sheet it is not sufficient.

`preventDefault()` on a Pointer Event does nothing here. Pointer events cannot
cancel scrolling; only `touch-action` and cancelled touch events can.

## The fix, path 1: a drag handle

```css
.drag-handle {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
```

```js
handle.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
handle.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
```

`{ passive: false }` is mandatory. A passive listener cannot cancel anything,
and browsers default `touchstart` and `touchmove` to passive at the document
level. Attach to the element, and be explicit.

Cancelling `touchstart` also removes the text selection and the long-press
callout that dragging a bar otherwise triggers, which is the second reason to
prefer D over C.

This costs no pointer events: `preventDefault()` on a touch event suppresses the
compatibility **mouse** events, not the Pointer Events, so a `pointerdown` drag
handler still runs.

**It does suppress the compatibility click**, so a drag surface holding
clickable children has to skip them:

```js
const stop = (e) => {
  if (e.target.closest('button')) return;
  e.preventDefault();
};
```

In Alpine, `@touchstart.prevent @touchmove.prevent` is equivalent, because
Alpine sets `passive` only for an explicit `.passive` modifier.

## The fix, path 2: a scrollable pane

| Variant | Technique | Result |
| --- | --- | --- |
| F | default `overscroll-behavior: auto` | sheet dismisses |
| G | `overscroll-behavior: contain` | holds |
| H | G plus holding `scrollTop` at 1 | holds, but feels wrong |

```css
.pane {
  overflow: auto;
  overscroll-behavior: contain;
}
```

H works by never letting the scroller sit exactly at 0, so a downward drag
always has somewhere to go. It is a real technique and worth knowing, and it
leaves a permanent pixel of offset under content that should sit flush, so
prefer G.

## Related trap: pointer capture

`setPointerCapture()` throws on a pointer id the browser does not hold as
active. Unguarded, the throw aborts the handler before any listener is attached,
so the drag silently does not work at all.

```js
try { handle.setPointerCapture(e.pointerId); } catch (_) {}
```

Put the `pointermove` / `pointerup` listeners on `window` (or the document)
rather than on the handle. Captured events still bubble, so one path serves both
the captured and the uncaptured case.

## A related question, asked the same way and answered no

Whether a page can fire the phone's HAPTIC on its own gesture was measured with
the same one-cell-per-technique method and came back negative:
[ios-haptics.md](ios-haptics.md). The reachable buzz belongs to a real user
activation of a native control and cannot be aimed at a moment the page picks.

## How to test this

Do not reason about it. Headless browsers reproduce scrolling and
`touch-action`, but not a native host's sheet dismissal, so any conclusion drawn
in emulation about whether the sheet survives is a guess.

Build a small self-contained page with one cell per technique, each cell
differing only in the technique, and open it on the device inside the sheet.
Have each cell report its own move-event count: a variant that appears to work
but recorded two move events actually lost the gesture to the browser.

## Where this is applied in web-tools

`holdTouch()` in [`lib/kits/annotate.js`](../lib/kits/annotate.js) is variant D,
with the skip selector above; it arms the cursor pad, the annotator card's drag
handle, and the region cover. The launcher in
[`lib/alpineComponents/fab.js`](../lib/alpineComponents/fab.js) carries the same
through an Alpine binding. [`pages/dictate.html`](../pages/dictate.html) carries
its own copy for its cursor pad and its selection pins. Path 2 is
`overscroll-behavior: contain` on the composer's two scrolling boxes, its
editor, and the fab drawer's panes.

**A surface that must SCROLL cannot use variant D at all,** which is the case
`pages/dictate.html` hit with its long-press-and-drag selection. `touch-action`
is latched at touchstart, so it cannot be turned off once a gesture is under
way; cancelling touchstart would kill the pane's ordinary scrolling; and at
touchstart nothing yet knows the touch will become a long press. What is left is
**variant E**, a cancelled `touchmove` and nothing else, gated on a flag the
long press sets. An ordinary swipe scrolls; only the extension is held.

That also keeps the gesture alive rather than merely tidy. A browser that
decides a touch is a scroll fires `pointercancel` and stops sending
`pointermove`, so a custom drag on a scrollable surface does not just fight the
sheet, it ends.

**A handle that is REBUILT cannot be held from an ancestor,** which the dictate
page hit and is worth knowing before reaching for one listener on a container. A
touch keeps the element it started on as its target even after that element
leaves the document, and a detached target has no path to an ancestor's
listener, so a delegated hold goes quiet on the first repaint of a drag. That is
the one moment it is for. Two answers, by whether the element is enumerable:
the pins are two nodes, so the page re-attaches to each on every paint; the
text spans are many and rebuilt every frame, so the listener goes on the ONE
node the touch started on, captured at pointerdown, and rides it into
detachment. Both are what "attach to the element, and be explicit" above costs
when the element is not stable.
