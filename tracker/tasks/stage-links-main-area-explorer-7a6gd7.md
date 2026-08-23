---
id: stage-links-main-area-explorer-7a6gd7
title: Stage links and the main-area explorer in show-repo
status: done
opened: 2026-07-14
closed: 2026-07-14
session: claude/task-tracker-discussion-wg27xv
---
# Stage links and the main-area explorer in show-repo

Fold toss-render's link-as-transport insight into show-repo on the transfer side: a link can deliver a set of file refs for action, not only a page to render. Rendering stays with toss-render (the viewer already hands HTML files to it via #gh=, and custom landings embed it); show-repo owns showing and moving files.

Scope:

- Stage links: `#stage=owner/repo[@ref]:p1,p2;owner2/repo2:p3` opens show-repo's Stage view preloaded with those refs. "Copy link" mints one from the current stage. Refs are the primary transport; content stays behind the viewer's token.
- Cross-repo stage: staged items carry {repo, ref, path} in the shared browser store, so the stage survives repo switches and mixes sources. Sending groups by source and copies via gh-transfer. Manifest stage.files accepts bare paths (this repo, default branch) or qualified refs.
- Layout: folder and file navigation moves from the sidebar into the main display (explorer: breadcrumb plus listing, selected file content beneath). The sidebar keeps views, pins, and recents; pins and recents deep-link into the explorer. The Stage view gets the same listing treatment.

Done means: show-repo on main with the new layout, stage links round-trip (mint, reopen), cross-repo send works, and nav-repo.html (which still mounts the old sidebar navigator) is unaffected.

Follow-up, deliberately out of scope: a content-carrying bundle form (#gz= style) for token-less contexts such as the Claude app's in-app browser.

## Progress log
- 2026-07-14: Task opened. Implementation under way on the session branch: explorer and stager components, StageLink grammar, viewer origin support, show-repo restructure.
- 2026-07-18: Closed. Delivered via PR #216 (merged 2026-07-14); status was left in-progress after the merge and is flipped now in a tracker sweep.
