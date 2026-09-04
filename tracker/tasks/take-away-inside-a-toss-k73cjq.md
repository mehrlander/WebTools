---
id: take-away-inside-a-toss-k73cjq
title: Make the take-away menu work inside a toss
status: done
opened: 2026-07-26
closed: 2026-09-04
size: M
---
# Make the take-away menu work inside a toss

The FAB's take-away block was hidden inside a toss (`x-show="!viaToss"`), because
`window.gh` belongs to the shell: `gh.get(path)` would have fetched the subject's
path at the **shell's** ref, so a person viewing a page at a branch would silently
have exported main's copy. Tossing is how you look at a page at another ref, so
the affordance disappeared at the moment it was most wanted.

## How it was resolved

`fab.js` grew a `takeTarget` getter that resolves the whole set at once: which
page, whose module registry, whose data, and a `GH` pointed at the right repo and
ref. Outside a toss that is the window. Inside one it reads `subjectScripts` and
`subjectReads` from the frame and constructs `new GH({ repo, ref: takeRef })`,
with `takePath`/`takeRef` following `subjectVia` so a routed subject resolves to
the addressed file rather than the renderer. The ref-honesty requirement is
carried in the code as a rule, not an aspiration: every take label must use the
aimed pair, because a row reading one file over an action staging another "looks
like it was thought about."

The take grid now renders in every context the drawer appears in, toss included,
with no `viaToss` guard. One case beyond the task's design: a `#gz=` payload toss
returns the shell's own HTML, since an opaque-origin payload has nothing to read
and the HTML the shell holds is already the finished artifact.

## Progress log
- 2026-07-26: Filed from PR #295 wrap-up. Behavior unchanged there; the
  hiding rule was inherited from the export button and left alone once the
  wrong-ref hazard was understood.
- 2026-09-04: Closed as delivered, found during a tracker refinement pass rather
  than by the work that did it. The shape matches this task's proposal (aim the
  take at the subject window instead of reading globals, keep the ref honest);
  it arrived as `takeTarget` during the annotate work, which never cited this
  task. Verified on `4a085db`: no `viaToss` guard on the take grid, and
  `takeTarget`/`takePath`/`takeRef` resolve the subject.
