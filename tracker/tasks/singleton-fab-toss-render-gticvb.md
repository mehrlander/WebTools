---
id: singleton-fab-toss-render-gticvb
title: Singleton fab with toss-render integration
status: done
track: independent
opened: 2026-07-08
session: claude/fab-render-toss-render-ua6p3p
closed: 2026-07-26
---
# Singleton fab with toss-render integration

The fab should be a singleton per viewport: when toss-render renders a page that
mounts its own fab, exactly one fab appears, and its drawer reports the subject
page, not the shell. This resolves the current conflict where both the shell and
the rendered page mount a fab, stacked at the same corner with disjoint and
partly wrong information.

## What the 2026-07-18 assessment established

- The rendered page's fab is context-blind in a toss, not merely covered up.
  `fab.infer()` reads `location.hostname`; in the srcdoc iframe that is
  `about:srcdoc`, so repo comes up empty and every API affordance (version
  readout, render tab, branch list) falls back to `mehrlander/web-tools`, which
  is wrong for a toss of any other repo.
- The earlier design note here ("same document, simple global check") was
  stale. `#gh=` renders into a srcdoc iframe with `allow-same-origin`
  (`showTrusted`), `#gz=` into an opaque-origin sandbox. Two documents, so a
  window-global singleton guard never fires. The guard has to be a flag stamped
  into the inner page's HTML by toss-render's prelude (`addressHtml` /
  `showHtml`), which toss-render controls in both modes.
- Toss-render is the only party that knows the subject: it parses
  owner/repo/ref/path from the address. Consolidation is therefore context
  hand-down (shell to fab), not deduplication of two blind instances.
- The repo is determined, not chosen. The render tab's branch list must target
  the repo that supplies the rendered page: the hosting repo on a directly
  served page, the addressed repo in a toss. No repo picker.
- The render tab's one proven use case is "is there a newer version of this
  page on an unmerged branch?" The current tab (free ref input, full branch
  list, overlay iframe) over-serves ref selection, which `?use=` and `#gh=`
  already handle in the URL, and under-serves that question: the branch list is
  not scoped to the file.

## What "done" means

- `fab.js` mounts at most one fab per viewport. The inner copy sees a host flag
  stamped by toss-render's prelude and declines to mount.
- Toss-render stamps subject context (`window.__tossSubject = {repo, ref,
  path}` or equivalent) and the shell fab adopts it: header identity, version
  readout, and render tab all target the subject repo. Shell plumbing stays
  partitioned from subject inventory (the old Toss/Page tab split, driven by
  the stamp rather than by script tagging).
- "Render at ref" inside a toss rewrites the `#gh=` address at the picked ref
  and re-renders, instead of opening a second overlay iframe inside the iframe.
- Outside toss-render, behavior is unchanged.

## Follow-on (separate scope, noted so it survives)

Redesign the render tab around the file-scoped question: list branches of the
subject repo where this path's blob differs from main (one GraphQL query
comparing each branch tip's object sha for the path against main's), dated,
newest first. Demote the free ref input; arbitrary refs are already served by
the URL machinery.

## Progress log
- 2026-07-08: filed.
- 2026-07-18: assessment pass (session claude/fab-render-toss-render-ua6p3p):
  confirmed the inner fab is context-blind in the srcdoc iframe rather than
  merely overlapped; corrected the stale same-document design note; scoped step
  one to a prelude-stamped host flag plus mount guard and context hand-down,
  with the file-scoped branch list as follow-on. Next: implement the stamp and
  guard.
- 2026-07-18: Claimed on branch claude/fab-render-toss-render-ua6p3p. Implementing
  the full scope in one pass: prelude stamp + mount guard (de-clash), subject
  adoption in the shell fab, and the render tab redesign around the file-scoped
  differs-from-main branch list.
- 2026-07-18: Implemented and pushed (PR #241, draft): __fabHosted guard stamped
  by every toss-render mode and the fab overlay; __tossSubject adoption
  (header, version, links, render tab retarget); render tab rebuilt as the
  file-scoped branch survey on gh-fetch's new branchesForPath, with tab-badge
  differs count and in-place re-toss via __tossNavigate. jsdom tests + headless
  scenario green. Remaining: live GraphQL confirmation with a token.
- 2026-07-26 closed: Delivered in PR #241, merged 2026-07-18. The branch predates the history rewrite so it shares no ancestor with today's main, which is why it read as unmerged. The one live-confirm the `next` tag named (branchesForPath against the real API) is refiled as its own task, alongside the same check for branchSessions. Found by `/in-flight`, which reconciles every in-progress claim against the branch it names.
