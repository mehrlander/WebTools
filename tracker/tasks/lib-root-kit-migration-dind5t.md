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
- 2026-07-26 filed after the lib/ audit prompted by the session-links work; the drift was noticed while deciding where compare-derived logic belongs
