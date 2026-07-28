---
id: caption-guide-region-delimiter-w9dpyv
title: Teach the guide region a delimiter that survives an agent's readback
status: backlog
track: independent
opened: 2026-07-28
next: recognize both delimiters, write only the surviving one; the HTML form must keep parsing or every existing guide region orphans
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
