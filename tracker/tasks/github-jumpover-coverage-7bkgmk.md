---
id: github-jumpover-coverage-7bkgmk
title: Finish GitHub jump-over coverage across show-repo views
status: done
project: show-repo
opened: 2026-07-17
closed: 2026-07-30
session: claude/github-icon-placement-3d06i7
---
# Finish GitHub jump-over coverage across show-repo views

The estate session (PR #232) named the principle: show-repo is a wrapper over
GitHub, and every view keeps a one-tap route to the GitHub presentation of
what it is showing. Landed so far: sidebar top bar (repo@ref), explorer
breadcrumb (current folder), estate cards and surface items; the viewer's
per-file GitHub action and the repo dialog's link predate it. Sweep what
remains: stage rows (each staged item's blob at its true repo@ref), the
sidebar Recent entries, compare results (per-file blob at head), and the atlas
header. Keep the treatment uniform (the muted github-logo icon, target
_blank) and the design-notes GITHUB JUMP-OVERS paragraph current.

Done means: each main-area view and sidebar panel either carries its jump-over
or the design notes record why it deliberately does not.

## Progress log
- 2026-07-17: Filed from the estate-view session; principle documented in
  docs/show-repo.md and the page's design notes, first three jump-overs landed.
- 2026-07-30: Closed on `claude/github-icon-placement-3d06i7`. All four named
  gaps filled: staged rows and the Recent/Search finder (stage.js `itemGh`, at
  each item's own repo@ref), the sidebar Recent entries (shell `fileGhUrl`),
  compare's per-file rows (blob at head; a `removed` file stays inert, having
  no head-side blob), and the atlas header (its ref chip became the repo's
  link). The sweep turned up the reason coverage alone was not enough: the one
  glyph carries four meanings (repo menu, repo/branch destination, the manifest
  behind a whole view, an exact file), and the Map's Transport header showed
  the cost, setting a bare icon after the code span naming
  pages/toss-render.html while pointing at docs/routes.json. So the pass also
  separated them: a manifest link is labelled ("Curate") and sits at the
  header's far edge, and an exact-file link carries a source peek
  (lib/source-peek.js). The viewer's and config view's GitHub actions
  deliberately have none, both sitting above the file's contents already on
  screen; that exception is recorded in the design notes.
