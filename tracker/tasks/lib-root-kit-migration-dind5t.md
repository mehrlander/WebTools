---
id: lib-root-kit-migration-dind5t
title: Move the kit-shaped files out of lib/ root into kits/
status: backlog
project: web-tools
opened: 2026-07-26
---
# Move the kit-shaped files out of lib/ root into kits/

`lib/` root has drifted. `lib/kits/README.md` names exactly seven scaffolding files; nineteen `.js` files now sit beside them, and most of the extras are kits in everything but location.

## The rule that sorts them

Three categories, distinguished by what a file attaches to:

- **Scaffolding (`lib/*.js`)**: extends `GH.prototype`. A kit *cannot* do this, because the kit contract is "registers a namespace on `window`", not "augments an existing prototype". That is the principled reason `gh-fetch.js` is not a kit and never will be.
- **Component (`lib/alpineComponents/*.js`)**: registers with `Alpine.data`, renders DOM.
- **Kit (`lib/kits/*.js`)**: registers its own `window` namespace, pure logic, no DOM, no Alpine.

## What the audit found

Kit-shaped already (own `window` namespace, zero DOM or Alpine references), misfiled only by folder:

| File | Namespace |
|---|---|
| `branch-survey.js` | `window.BranchSurvey` |
| `data-payload.js` | `window.DataPayload` |
| `portable-align.js` | `window.PortableAlign` |
| `repo-activity-cache.js` | `window.RepoActivityCache` |
| `repo-config-cache.js` | `window.RepoConfigCache` |
| `repo-mailbox.js` | `window.RepoMailbox` |
| `shorter-payload.js` | `window.ShorterPayload` |
| `url-params.js` | `window.UrlParams` |

Correctly where they are:

- `gh-api.js`, `gh-auth.js`, `gh-boot.js`, `gh-fetch.js`, `gh-store.js`, `gh-transfer.js`: all extend `GH.prototype`. Scaffolding by the rule above.
- `alpine-bundle.js`, `vanilla-bundle.js`: the boot bundles.
- `chat-render.js` (11 DOM references), `vanilla-demo.js` (7): renderers, not kits.

Dead: `diagnostic-vanilla-bundle.js` has zero consumers anywhere in `pages/`, `lib/`, or `tools/`. Confirm and delete.

## Definition of done

- The eight kit-shaped files move to `lib/kits/`, with their `gh.load()` call sites updated (`branch-survey.js` has 8 consumers, the others fewer).
- `lib/kits/README.md` gains an entry per moved kit and its scaffolding list stops being a partial account of `lib/` root.
- `diagnostic-vanilla-bundle.js` deleted, or its consumer found.
- `npm run build:lib` still produces a working `dist/web-tools.js`; the bundle enumerates `lib/`, so check the build script's globs before moving anything.
- The category rule above lands in `lib/kits/README.md`, so the next file has somewhere to be sorted by rather than defaulting into `lib/` root.

## Notes

Mechanical but wide: the move itself is trivial and the risk is entirely in the `gh.load` chains and the bundle build. Do it as its own PR, not folded into feature work.

## Progress log
- 2026-08-06: **The sorting rule this task uses is one axis short, so re-sort the
  eight-file list before moving anything.** `code-layer-taxonomy-q15jp2` landed
  the repo-wide taxonomy ([`docs/code-layers.md`](../../docs/code-layers.md)),
  which adds the axis the audit above did not have: registering a `window`
  namespace is *necessary* for `lib/kits/`, not sufficient. A kit is a
  **capability** that would be true in any repo; an **estate module** is the same
  file shape carrying this estate's domain (repo addresses, refs, branch state,
  the manifest), and it stays in `lib/` root. The test that separates them: would
  the file have to be explained before someone else could use it.

  Read that way the eight do not move as a block. Clearly estate modules, swept in
  by the mechanical test alone: `branch-survey.js` (knows squashes make ref-level
  merge status meaningless, and what this estate calls "stranded"),
  `portable-align.js` (scores a repo against the web-tools coordination surface),
  `repo-activity-cache.js`, `repo-config-cache.js`, `repo-mailbox.js` (the
  registry-repo request/response channel). Clearly a kit: `url-params.js`, which
  is a general precedence rule with an estate-specific rationale.

  The genuinely arguable pair is `data-payload.js` and `shorter-payload.js`. Both
  read an estate-defined envelope (`data-view/1`, the shorter payload), so they
  look generic and are not: a consumer would need the envelope contract first.
  That call belongs to this task, not to the taxonomy, and it is the one worth
  making deliberately since it sets the precedent for every future payload reader.

  The `diagnostic-vanilla-bundle.js` deletion and the `lib/kits/README.md`
  scaffolding-list fix are unaffected; the latter is partly done, since that
  README's Concept section was reduced to the kit rule plus a pointer.

- 2026-07-26 filed after the lib/ audit prompted by the session-links work; the drift was noticed while deciding where compare-derived logic belongs
