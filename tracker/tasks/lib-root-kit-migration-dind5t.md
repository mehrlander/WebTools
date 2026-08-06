---
id: lib-root-kit-migration-dind5t
title: Settle whether lib/ root and lib/kits/ are one category, then move what the rule says
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
- 2026-08-06 (second entry, replacing the first): **the axis this task's audit
  used is not wrong, it is the only one there is, and the folders do not follow
  it either.** Earlier today `code-layer-taxonomy-q15jp2` landed a rule saying a
  kit is a capability true in any repo and a `lib/` root module is the same shape
  carrying this estate's domain, and an entry here re-sorted the eight-file list
  against it. Both are retracted. The rule was measured against the shelf the
  same day and is false.

  **The measurement.** Counting only a RUNTIME dependency on the hub's own chain
  (`window.gh`, `gh.load`, `gh.get`, `__loadedScripts`), the strongest available
  test of "this file cannot travel":

  - 7 of the 21 files in `lib/kits/` have one: `branch-brief.js`, `brief.js`,
    `build.js`, `export.js`, `wring.js`, `wsl-core.js`, `wsl.js`.
  - 6 files in `lib/` root have none: `data-payload.js`, `github-links.js`,
    `portable-align.js`, `shorter-payload.js`, `url-params.js`,
    `vanilla-demo.js`.

  A third of the kit shelf is less portable than six files that are not on it.
  Both folders hold one shape: a `window` namespace, Alpine-free, pure logic.
  Nothing sorts them. What decided each file's folder was when it was written.

  **So this task is no longer a move, it is a decision, and the move follows.**
  Three options, with what each costs:

  - **A. One shelf.** `lib/kits/` holds every namespace-registering logic module;
    `lib/` root reduces to the boot chain (extends `GH.prototype`, or is a
    bundle), which is the one boundary that is mechanical and checkable, and a
    test can enforce it. Ends the question rather than relocating it. This is the
    option the measurement argues for, and it is the completion of the older
    "anything used across the estate is a kit" theory.

    **The full split under A, so a session need not re-derive it.** The rule is
    one grep: does the file extend `GH.prototype` or boot the chain. 24 of the 28
    files in `lib/` root are decided by it with no judgment; 4 need a read.

    | Verdict | n | Files |
    | --- | --- | --- |
    | stays, scaffolding | 6 | `gh-auth.js`, `gh-boot.js`, `gh-fetch.js`, `gh-store.js`, `gh-transfer.js`, `traffic.js` |
    | stays, defines GH | 1 | `gh-api.js` |
    | stays, bundle | 3 | `alpine-bundle.js`, `vanilla-bundle.js`, `diagnostic-vanilla-bundle.js` (delete this one, zero consumers) |
    | **moves to `lib/kits/`** | **14** | `branch-survey.js`, `data-payload.js`, `github-links.js`, `portable-align.js`, `repo-activity-cache.js`, `repo-address.js`, `repo-checks.js`, `repo-config-cache.js`, `repo-mailbox.js`, `repo-proposals.js`, `repo-sessions-cache.js`, `shorter-payload.js`, `surface.js`, `url-params.js` |
    | read first | 4 | `chat-render.js`, `source-peek.js`, `swipe-deck.js`, `vanilla-demo.js`, all DOM-touching |

    The four are not blocked, only unautomated. `lib/kits/README.md` already
    allows a kit to touch the DOM ("no DOM opinions of its own, not no DOM";
    `cm6.js`, `io.js`, `pdf.js` all do), so the question per file is whether it
    decides where it lives or takes a host it is handed. Answer it by reading,
    and record the answer rather than the verdict.

    Cost is in the `gh.load` chains, not the moves: `branch-survey.js` alone has
    8 consumers. `npm run build:lib` enumerates `lib/`, so check the build
    script's globs before moving anything, and `dist/web-tools.js` has to come
    out working.
  - **B. Two shelves on a mechanical property.** Keep the split but sort on
    something checkable rather than on a judgment about portability: a demo page,
    or presence in the pre-build's public surface. Needs the property picked and
    measured first; nobody has shown one that cuts the shelf usefully.
  - **C. Status quo, stated.** Say in `docs/code-layers.md` that placement is
    historical and either folder is acceptable. Cheapest, and it leaves the next
    file's author with no answer, which is the condition this task exists to end.

  Recommendation: **A**. It is the only option whose rule the code already
  satisfies, so adoption is a `git mv` and a test rather than a re-argument per
  file. Awaiting the user's call; nothing moves until then.

  **Two smaller items in this task are unaffected by the decision** and can go in
  the same pass: deleting `diagnostic-vanilla-bundle.js` (still zero consumers),
  and `lib/kits/README.md`'s scaffolding list, which was a partial account of
  `lib/` root. That README's Concept section was already reduced to the kit rule
  plus a pointer, and now also carries the measurement.

  Vocabulary note, since it is the reason the wrong rule sounded right:
  **"estate" is doing three jobs in this repo.** The multi-repo constellation
  (prose, everywhere), show-repo's all-repo dashboard
  (`lib/alpineComponents/estate.js`, a concrete UI surface), and, for one day,
  "the hub's own domain" in the coinage "estate module." The third is retired.
  The first two are both load-bearing and are not going to merge, so a reader
  has to take the sense from context. Not a task; recorded here because the
  ambiguity is what let a plausible rule get written down unchallenged.

- 2026-07-26 filed after the lib/ audit prompted by the session-links work; the drift was noticed while deciding where compare-derived logic belongs
