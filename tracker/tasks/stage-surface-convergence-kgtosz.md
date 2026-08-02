---
id: stage-surface-convergence-kgtosz
title: Converge the stage and surface item schemas
status: backlog
opened: 2026-07-18
---
# Converge the stage and surface item schemas

The stage and the surface are the same substrate (ordered lists of cross-repo refs) with different verbs: the stage is a workbench (bundle, send, link), the surface a shelf (arrangement, commentary). Keep them as two named things but converge at the schema level: a stage item becomes a surface item restricted to the ref kinds. Two bridges then follow: "open as stage" on a surface (pull its ref items into the stage, ignore prose) and "save as surface" from the stage (promote a working set; commentary enters at the moment of promotion, which is when it is worth writing). Optional per-item note on staged refs rides the shared shape for free; the bundle can carry it in its header lines. A markdown literate source form (ref lines as machine-readable spine, prose between) is the possible future shared format, not part of this task. Context: PR #239's stage rework and the session discussion behind it. Done means: shared item vocabulary defined, both bridges working in show-repo, docs/show-repo.md updated.

Related smaller lever, take or split: the finder's root repos (Recent/Search) come from pickerRoots (open repo + quick links + targets); the estate registry could drive them instead.

## Progress log
- 2026-07-18: Filed at wrap-up of the stage-rework session (PR #239), which moved the stage to the estate context and left this convergence as the agreed direction.
- 2026-07-20: The shared item vocabulary now exists as a written contract:
  docs/surface.md plus the v2 core schema and the branch-review/1 profile,
  landed on branch claude/surface-file-format-88jynb. A stage item is the v2
  file item's target.source triple ({repository, ref, path}) with annotations
  empty, as this task predicted; the optional per-item note rides the shared
  shape as commentary. The two bridges (open-as-stage, save-as-surface) and
  the estate.js migration to dual-read remain the build work here.
- 2026-07-21: A chat-histories session, working an unrelated trawl-display
  review, noticed the same convergence applies one repo over:
  `results/<slug>.json`'s `source{repo,path,ref}` (docs/CHAT-RESULTS.md in
  that repo) is the same ref triple as the stage item / v2 `target.source`.
  No work done here; noted so extending this convergence outward doesn't
  start from scratch later.
- 2026-08-02: Cluster ordering decided while clearing the smaller levers (chat-results decision, StageLink.read, the proposal-channel leftovers, all closed today): this task and integrate-stage-surfacer-format-3bvg2v share the one remaining build (estate.js dual-read, then the two bridges with per-item commentary), and stage-partial-file-selection-k8mtou waits behind them so its grammar lands on the converged schema.
