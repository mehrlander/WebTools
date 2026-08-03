---
id: integrate-stage-surfacer-format-3bvg2v
title: Integrate the stage with the surfacer's .surface format
status: done
track: depends-on:stage-links-main-area-explorer-7a6gd7
opened: 2026-07-14
---
# Integrate the stage with the surfacer's .surface format

The show-repo stage (task 0006) and the surfacer app (a project in the home repo) are the same idea from two ends: a curated cross-repo set of items. A surface file is essentially the serialized, annotated form of a stage. This task reconciles the two into one format so the local surfacer and the browser show-repo author compatible files.

## The model

- `.web-tools.json` at the repo root is already the central place for a repo's web-tools config: `landing`, `pins`, `stage` ({files, targets}). It stays small (config), and surfaces become a fourth concern.
- A stage item is a degenerate surface item of `kind: "github_blob"` with the annotations empty. The surfacer item schema (id, title, kind, snippet, facet, added_at, commentary, body, related, plus kind-specific path/url/repos/...) is the superset.
- Surfaces are stored as separate files in a `surfaces/` directory (one file per surface), matching the surfacer's `./surfaces/*.surface` model, not inline in `.web-tools.json`. `stage.files` stays the unnamed scratch working set; a named surface is the saved, annotated form. Scratch vs saved.
- Per-item context (title, commentary, body, facet) lives in the surface file, not on-repo: the same file can appear in several surfaces with different framing, and the source repo stays clean. A surface is self-contained context layered over files that live elsewhere.

## Path forward

1. Adopt the surface item shape for stage items (a declared subset: kind, repo/ref/path for github_blob, plus optional title/commentary/body/facet). Contained to seedStage and save in lib/alpineComponents/stage.js and the item objects.
2. Let the Stage view edit per-item context (a commentary field per staged file; optional, unused until wanted).
3. "Save as surface" writes a `.surface` file (manifest + items, carrying schema_version) into the repo's surfaces/ dir, over the Contents API with the viewer's token.
4. Load a surface back into the stage: a surface picker reading surfaces/*.surface.
5. Write the portable convention for `.web-tools.json` and `.surface`, so the surfacer and show-repo target one versioned format. The manifest is now documented in docs/PORTABLE.md and docs/show-repo.md; the surface format is still the only thing the local C# app and the browser page share, so it must be a written contract.

show-repo natively authors github_blob items; the surfacer authors more kinds (story, note, script, recent, local_md). Each surface reads every kind and authors the kinds it knows; show-repo need not produce a story to consume a surface containing one.

## Open question (blocks step 3's target)

Storage does not reconcile by format alone: the surfacer keeps its truth in a local folder watched by a C# FileSystemWatcher; show-repo keeps its truth in a repo reached by token. The bridge is a repo holding surfaces/*.surface that both read. Is the surfacer's local surfaces/ already a Git clone, or standalone? If a clone, the loop closes when show-repo writes to that repo (surfacer sees it on next pull). If standalone, the surfacer needs a pull-from-repo path first. Resolve by inspecting the surfacer directly in a session with the home repo.

## Progress log
- 2026-07-14: Filed from the design discussion on branch claude/task-tracker-discussion-wg27xv (PR #216). Model and path agreed; the surfacer-storage question is the one open dependency. Intended to proceed in a session with both web-tools and the home repo.
- 2026-07-17: The display half landed ahead of the format work: show-repo's new
  estate view (PR #232) reads every surfaces/*.surface in the registry repo and
  renders github_blob/github_dir ({repo, ref, path} or github.com URL), url,
  and note/story items; web-tools-private carries the first file
  (surfaces/landing.surface, PR #1 there). This resolves the storage question
  for the browser side: registry-repo surfaces/ is the token-reachable home.
  Still open here: the stage's save-as-surface authoring path and the written
  format contract.
- 2026-07-20: Two resolutions from the surface-file-format session. (1) The
  open question is answered: the surfacer's local surfaces/ is standalone by
  explicit DEPLOY.md decision (gitignored, OneDrive-synced), not a clone, so
  there is no shared store; the reconciliation is format-level, with local
  surfaces staying machine-bound (path-only sources) and registry surfaces
  portable. (2) Step 5, the written contract, landed as docs/surface.md plus
  schemas/surface-v2.schema.json and schemas/profiles/branch-review-v1.schema.json
  on branch claude/surface-file-format-88jynb: v2 splits kind into type +
  target.source (the {repository, ref, path} form is the stage triple, per
  step 1's intent), adds role/view/change/profile, and documents both readers'
  migration targets without changing them. Steps 2 through 4 (per-item context
  editing, save-as-surface, surface-into-stage) remain, now against the v2
  item shape.
- 2026-07-21: Noted from a chat-histories session: the "each surface reads
  every kind, authors the kinds it knows" posture (above) is also the
  mechanism that would let chat-results envelope items
  (mehrlander/chat-histories' results/<slug>.json) appear in the estate view
  as generic cards, once the v1-to-v2 migration lands. No work done; a
  candidate future bridge, not scoped into this task.

## Progress log
- 2026-08-03: Done, on PR #341, together with its cluster sibling
  stage-surface-convergence-kgtosz. Steps 1, 3, and 4 of the path forward
  shipped: stage items are v2 surface items (lib/surface.js), save-as-surface
  writes a .surface into the registry's surfaces/ over the Contents API, and
  open-as-stage loads one back. Two departures from the plan above, both
  deliberate. The item shape is v2 (`type` plus `target.source`) rather than
  v1's `kind`, since the contract split genre from transport after this task
  was written. And `stage.files` is no longer the saved form at all: it is
  read as a seed and never written, because saving there overwrote the
  previous set and put a cross-repo list in one repo's config.
  Step 2 (a per-item commentary field editable on the bench) is the one part
  not built; the shape carries `commentary` already, so it is a UI affordance
  rather than a format change. Noted here rather than filed.

