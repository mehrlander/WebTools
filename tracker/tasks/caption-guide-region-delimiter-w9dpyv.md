---
id: caption-guide-region-delimiter-w9dpyv
title: Teach the guide region a delimiter that survives an agent's readback
status: done
opened: 2026-07-28
closed: 2026-07-28
session: claude/budget-drs-tracker-review-s64mc6
---
# Teach the guide region a delimiter that survives an agent's readback

`SURFACING.md` and the `caption` skill delimit the managed region of a PR body
with `<!-- guide -->` and `<!-- /guide -->`. Measured 2026-07-28: reading a PR
body back through the GitHub MCP `pull_request_read` strips HTML comments and
HTML tags, everywhere in the string, including inside code spans and fences. So
an agent session syncing a body cannot find the region it is supposed to update.

The failure is not a clean miss. A sync that cannot locate its region either
appends a second region or overwrites hand-written prose, which is exactly what
the delimiters exist to prevent. A human editing in the GitHub UI is unaffected,
since the comments are stored and work fine there.

Full probe, controls, and the evidence that this is a readback fault rather than
a write fault: `docs/environment/capabilities.md`, "Reading a PR body back".
Worked example of the alternative in place: PR #303's body.

## Scope
- `[//]: # (guide)` is the candidate. It renders as nothing on GitHub, is not an
  HTML comment, and survived the round trip intact.
- **Recognition must accept both forms.** Every PR body already carrying the HTML
  comments would orphan its region otherwise. Write only the surviving form.
- Two files specify the delimiter and both need it: `docs/SURFACING.md` (the
  guide-body template) and `.claude/skills/caption/SKILL.md` (the sync
  instruction). Check `scripts/build-merge-guide.py` too, since it harvests guide
  regions out of merged PR bodies and will meet both forms in the wild.
- Constraint worth writing down beside the new form: it is a markdown reference
  definition, so it must start a line and sit between blank lines. Inside a list
  item or a blockquote it can render literally.

## Definition of done
- A body carrying either delimiter is parsed; new bodies are written with the
  markdown form.
- The merge-guide builder harvests regions of both forms.
- `npm test` green.

## Progress log
- 2026-07-28 filed at the wrap-up of the tracker-review session (PR #303), which
  hit the bug while syncing its own guide body and lost the region twice before
  measuring the cause.
- 2026-07-28 done on `claude/budget-drs-tracker-review-s64mc6`; lands via PR #303.
  Closed the same day it was filed, and the filing was the error. It was raised
  at wrap-up as a follow-up, then challenged on whether it was resolvable
  in-session, and it was: one constant pair became a tuple of pairs with a loop,
  plus two doc surfaces. Recognition accepts both delimiters so no existing body
  orphans; new syncs write the link-label form.
  `build-merge-guide.py` had no tests and this change touches the function that
  decides what shipped history says, so `tools/test/build-merge-guide.test.mjs`
  now pins both forms, the structural fallback, an unmatched opener, and the
  terse-body case. Suite 583 passing.
  Worth keeping: the filing failed the tracker's own test, "never file for work
  the current session could simply do." The tell was there at filing time, since
  the scope section already named all three files.

- 2026-08-05: "The merge-guide builder harvests regions of both forms" no longer
  holds; that builder was deleted on PR #358. Both delimiter forms are still
  recognized, by `SURFACING.md` and the `caption` skill, which is what the task
  was actually about.
