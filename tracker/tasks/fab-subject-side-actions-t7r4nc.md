---
id: fab-subject-side-actions-t7r4nc
title: Let the FAB collect a toss subject's page actions, not just the shell's
status: backlog
project: fab
opened: 2026-07-27
---
# Let the FAB collect a toss subject's page actions, not just the shell's

Inside a toss the drawer adopts the subject for everything except one thing. Identity, version readout, branch survey, Inspect and the take target all read out of the subject frame. Page-contributed **actions** do not: `detect()` gates their collection on the component being shell-side.

```js
if (shell && data && Array.isArray(data.actions) && data.actions.length) groups[key].actions = data.actions;
```

So the drawer tells you that you are looking at `word-select.html`, then offers buttons belonging to `toss-render.html`, with nothing saying so. That is a correctness problem in its own right, and it is what makes a change to toss-render's own actions impossible to preview.

## Why the gate exists, and why it does not have to

The stated reason is ownership: a subject's action closures belong to its own window. That is a real consideration for *invoking* them, not a barrier to *reaching* them. In `#gh=` address mode the frame is mounted `allow-same-origin` precisely so the shell can reach in, and Inspect already does: it reads `win.__loadedScripts`, `win.Alpine`, and scans the subject's component tree through that same door.

## What it would unblock

Measured 2026-07-27: a nested self-toss (`#gh=…:pages/toss-render.html?gh=…:pages/<page>.html`) renders correctly two frames deep, and the outer FAB adopts the **inner toss-render** as its subject. With subject-side collection it would therefore surface the branch's `tossRender.actions`, which is the one preview no mechanism currently reaches (`?use=` pins lib, not the page file; the outer shell always wins the singleton). Today changes to toss-render's `actions` land at merge and are visible at no point before it. See `CLAUDE.md`, "When toss-render itself is the change".

## Design points

- **Both sets, labelled.** Not a swap. "Copy toss link" is genuinely a shell capability, since only the shell knows the address. The drawer carries both, distinguished by origin; the `from` field added in PR #300 already carries the contributing component.
- **Navigation semantics need a decision per action.** A subject action doing `location.href = …` runs in the frame, not the top. show-repo's bust-out action is exactly that shape.
- **`#gz=` stays out, permanently.** A payload toss renders under an opaque origin on purpose, so nothing can be collected. Not a gap to close.
- **Errors cross a window boundary.** A closure invoked from the shell can throw in the subject's window; `runAction` should report that as the subject's failure rather than the drawer's.

## Definition of done

In a `#gh=` toss, the take rows show the subject's page actions alongside the shell's, each attributed, each invoking in its own window. A nested self-toss shows a branch's toss-render actions.

## Limits

This does not make toss-render fully self-previewing. Even with the change, a nested preview shows both the branch's actions (as subject) and the deployed shell's at once. Readable with attribution, but a preview with a footnote.

## Progress log
- 2026-07-27 filed from PR #300, after three rounds of "I removed that, why is it still there" traced to this one gate; the nesting behaviour above was measured, not assumed
