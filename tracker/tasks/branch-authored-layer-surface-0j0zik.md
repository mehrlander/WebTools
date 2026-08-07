---
id: branch-authored-layer-surface-0j0zik
title: Converge the branch page's authored layer on the branch-review surface
status: done
project: web-tools
opened: 2026-07-26
closed: 2026-08-06
session: claude/show-repo-progress-b8l63x
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
- 2026-08-06: Closed by answering the first bullet the other way. `branch-review/1` does **not** become the format, and the page's authored layer stopped being the thing that needed a producer.

  **The task predates the merge guide's retirement, and the same argument applies to it.** Serializing the guide's judgment into a surface would have created a second hand-maintained account of one branch, in a second format, needing a second sync. `MERGE-GUIDE.md` was retired on 2026-08-05 for exactly that, and the general rule it left behind covers this case: do not commit, or re-author, what a live read already answers.

  **What shipped instead.** The branch page renders the PR body itself, through `kits/guide-render.js` extracted from the FAB, which had been the only surface showing a guide since PR #295. The page was already fetching `pull.body` into `brief.pr.body` and rendering a button. So the judgment layer needed no new writer, no new format, and no envelope: it needed the renderer that already existed to be reachable from the page that already had the data. It now works on every branch with a PR rather than on the zero branches that ever carried an envelope.

  **Two things fell out of the same pass.** The page took `pulls[0]` and had no way to reach an earlier PR, which is wrong on exactly the post-merge case the conventions document; it now steps through all of them. And `#gh=owner/repo&pr=<n>` addresses a PR directly, resolving to the head and base the PR was actually opened against.

  **What the profile is still for.** The materialized bundle its own doc describes: a review package resolved and inlined for a token-less reader. That is a different job from this page, and its zero instance count is not evidence of a gap in it. The `?src=`/`#gz=` envelope stays on the page for a branch with no PR to carry the judgment.
- 2026-08-07: Closed on `claude/make-work-conventions-b74b4t` (PR #371). The
  decision: branch-review/1 is THE format /caption emits; the plain
  branch-brief shape stays accepted by the page reader as a hand-authoring
  convenience only. The emitter is `.claude/skills/caption/build-branch-review.mjs`
  (git-derived compare and changes, both-schema validation before emitting,
  --link gzips the surface into the 🌿 fragment), documented in the caption
  skill. The first real instance is recorded on PR #371 (comment of
  2026-08-07); zero instances is no longer true. Gated by
  tools/test/branch-review-emit.test.mjs: schema validity, projection through
  BranchBrief.readAuthored onto the four authored fields, invalid-means-error,
  and the gz round-trip. Full-page render verification is by the live link;
  the sandbox cannot serve the compare endpoints the derived layer needs.

