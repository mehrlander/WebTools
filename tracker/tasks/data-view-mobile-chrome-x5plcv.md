---
id: data-view-mobile-chrome-x5plcv
title: Reclaim the phone viewport in data-view
status: backlog
track: independent
opened: 2026-07-25
next: user is reviewing the five options; start with demoting the notes (option 3) and the full-bleed toggle (option 5), which need no cross-frame work
---
# Reclaim the phone viewport in data-view

`pages/data-view.html` gives too much of a phone screen to chrome before any
data shows, and a JSON payload shows two mode switchers at once. Filed from the
2026-07-25 session that built the `#data=` route (PR #288), with the numbers
measured rather than estimated so a later session need not re-derive them.

## Measured, at 390x844 (headless, both payload shapes)

| Band | Envelope (3 items) | Bare JSON |
| --- | --- | --- |
| Page header (title, note) | 92 | 28 |
| Item strip | 36 | 0 |
| Item note | 40 | 0 |
| Viewer header (name, size, copy, modes, links) | 40 | 40 |
| **Chrome before data** | **280 of 844 (33%)** | **120 of 844 (14%)** |

Two things the measurement settled, both against the intuition that prompted it:

- **Controls are not the cost, prose is.** The viewer header, which carries the
  copy button, is 40px. The envelope's `note` plus the per-item `note` are 132px
  of the 280. Moving buttons into the FAB buys back under 5% of the screen;
  demoting the notes takes the envelope case from 33% to roughly 17%, at parity
  with the bare case.
- **The bare case is already fine** at 14%. The problem is envelope-shaped.

Separately, vanilla-jsoneditor adds its **own 64px toolbar inside** the content
box, carrying its own `text / tree / table` switcher. So a JSON payload stacks
two mode switchers four bands apart. Real overhead for bare JSON is 184px (22%),
and the redundancy is more confusing than the space is expensive. That thread is
its own task: `own-json-tree-retire-vje-i0lcj2`.

## The wrinkle any FAB-based option has to clear

The obvious move, "give the page's buttons to the FAB," is blocked by two facts
in `lib/alpineComponents/fab.js`, neither specific to this page:

1. A page reached through `#data=` renders **inside toss-render's iframe**, which
   stamps `window.__fabHosted`, so the page's own fab declines to mount. The fab
   a phone user taps belongs to toss-render, not to data-view.
2. **Subject components do not contribute actions.** The scan collects `actions`
   only when `shell` is true (`fab.js:625`), and the subject frame is scanned with
   `shell: false` (`fab.js:651`), so a tossed page's `actions` array is read past
   and dropped. Under `#gz=` the opaque origin blocks the cross-frame read
   entirely.

So "page buttons in the FAB" is a fab.js capability that is currently blocked,
not a data-view feature. Unblocking it fixes every tossed page.

## Options, as presented 2026-07-25

1. **Make subject actions reachable in the FAB.** Prerequisite for anything else
   here, independently correct, fixes all tossed pages. Works in `#gh=`/route
   mode only; cannot work under `#gz=`.
2. **Resolve the double mode switcher.** When the active mode brings its own
   chrome, suppress the viewer's mode strip or collapse its header to one
   control. Shared-viewer change, wants care.
3. **Demote the notes on small viewports.** Envelope `note` and per-item `note`
   behind a tap. Biggest win per unit of work, no FAB dependency.
4. **A dedicated FAB Data tab** (item list plus mode picker). The original idea,
   the most work: needs option 1, then cross-frame item state, and functions in
   one of two toss modes. Also moves *navigation* into a drawer, which is the
   change most likely to feel worse on a phone: the 36px item strip is how a
   reader knows the payload has three files.
5. **A full-bleed toggle.** One control hides all page chrome and gives the
   viewport to the viewer. Cheap, no FAB dependency, serves the "let me actually
   read this" moment directly.

Recommended: 3 and 5 first (most of the win, no cross-frame work, reversible),
then 1 on its own merits, and reassess 4 only if anything still feels cramped.

Sequencing note: 5 wants the fragment work (`toss-fragment-passthrough-558xcw`)
first, since a full-bleed toggle is exactly the state that should ride the hash.

## Definition of done

Whichever options are chosen, measured again at 390x844 and reported the same
way, so the before and after are comparable.

## Progress log
- 2026-07-25: filed from the `#data=` route session (PR #288). Measurements
  taken headless with the repo's screenshot tool; the two fab.js blockers were
  confirmed by reading the scan, not inferred. Nothing built; the user is
  reviewing the options.
- 2026-08-02: Groom note: option 1 (subject actions reachable in the FAB) has since landed (commit e857f07, task fab-subject-side-actions closed today), so the fab.js blocker paragraph is dated: only the #gz= half of it still holds, and by design. Options 3 and 5 remain the recommended start and are still unbuilt.
