---
id: branch-authored-layer-surface-0j0zik
title: Converge the branch page's authored layer on the branch-review surface
status: backlog
project: web-tools
opened: 2026-07-26
---
# Converge the branch page's authored layer on the branch-review surface

`pages/branch.html` takes an optional authored envelope (intent, open, omitted, per-file notes) delivered by `?src=` or `#gz=`. It reads two shapes today: a plain `branch-brief/1` object, and a `branch-review/1` surface projected onto the same four fields. Only the plain form has ever been written.

## Why this matters beyond tidiness

The guide-PR body is already doing surface work by hand: a curated file list, per-item annotation, roles (changed versus context), and an account of what is outstanding. That is `branch-review/1`'s stated job, and its own doc says the insight is that the diff is the authoritative record while the surface is the manifest layer over it. So `/caption` at full size is an unserialized branch-review surface, and the branch page is the reader that would give it somewhere to render.

That also supplies the missing motive for the surface v2 reader migration, which `docs/envelopes/surface.md` defers as out of scope: right now v2 is a contract nobody has a reason to migrate for.

## Definition of done

- Decide whether `branch-review/1` becomes *the* authored format for this page or stays one accepted shape beside the plain form.
- If it becomes the format, `/caption` (or a sibling) emits one, and the page's own reader drops the plain branch-brief shape or keeps it as a documented convenience.
- Either way, at least one real surface exists and renders, since the profile currently has zero instances repo-wide.

## Dependencies

Reading a v2 profile in the estate is gated on the v1→v2 reader migration; this page is not, because it reads the profile directly rather than through the estate's surface reader. So this task can proceed independently, and doing so gives the estate migration a worked example.

## Progress log
- 2026-07-26 filed from the session that built the page (PR #297), which added the dual reader precisely so this convergence would not require changing the page
