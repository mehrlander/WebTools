---
id: lib-root-kit-migration-dind5t
title: One logic shelf: move every window-namespace module into lib/kits/
status: in-progress
session: claude/lib-kits-migration-review-ouipa1
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
- 2026-08-08: claimed on `claude/lib-kits-migration-review-ouipa1` after a fresh-eyes review of the decision. The review re-derived the split: two files added since the 2026-08-07 derivation (`content-registry.js`, PR #375; `estate-search.js`, PR #372) are kits by the rule, so the move is 22 files, not 20. It also found one runtime consumer outside this repo the cost measurement could not see: chat-histories `pages/life-journal.html` loads `lib/swipe-deck.js` from jsDelivr at `@main`; fixed in that repo alongside this migration.
- 2026-08-07 (second entry): **decided. Option A.** One logic shelf: every file
  registering a `window` namespace is a kit; `lib/` root keeps the loader, the
  files extending its prototype, and the boot bundles. Boot membership, a cost
  rather than a structure, passes to a declared manifest. The user's call, made
  after reading the derivation below. **This task is now a move, and only a
  move.**

  Written down in the three places that answer "where does this file go":
  [`docs/code-layers.md`](../../docs/code-layers.md) (the living rule, with why
  this rule and not the retracted ones), [`lib/kits/README.md`](../../lib/kits/README.md)
  (the shelf's own admission rule), and
  [`pages/guides/code-layers.html`](../../pages/guides/code-layers.html) (the
  full record, A marked decided and B through F preserved). All three say the
  tree has not caught up.

  **The split, derived against the tree on 2026-08-07 and current.**

  | | n | Files |
  | --- | --- | --- |
  | stays: defines GH | 1 | `gh-api.js` |
  | stays: extends the prototype | 5 | `gh-auth.js`, `gh-boot.js`, `gh-fetch.js`, `gh-store.js`, `gh-transfer.js` |
  | stays: boot bundle | 2 | `alpine-bundle.js`, `vanilla-bundle.js` |
  | **moves to `lib/kits/`** | **20** | `branch-survey.js`, `chat-render.js`, `data-payload.js`, `github-links.js`, `portable-align.js`, `repo-activity-cache.js`, `repo-address.js`, `repo-checks.js`, `repo-config-cache.js`, `repo-mailbox.js`, `repo-proposals.js`, `repo-sessions-cache.js`, `session-render.js`, `shorter-payload.js`, `source-peek.js`, `surface.js`, `swipe-deck.js`, `traffic.js`, `url-params.js`, `vanilla-demo.js` |
  | **moves to `lib/` root** | 1 | `kits/build.js`, which extends the prototype |
  | deleted | 1 | `diagnostic-vanilla-bundle.js`, zero consumers, and a console-paste snippet rather than a bundle |

  `lib/` root goes 29 → 8; `lib/kits/` goes 22 → 41.

  **Three rulings, settled with the decision so the migration need not stop.**

  1. `kits/build.js` moves to root on the letter of the rule. It patches the
     loader's `.get` during a build and is otherwise not in the runtime chain,
     but an exception written into the rule on day one is how the previous two
     rules died.
  2. `source-peek.js` moves, and its self-install becomes an explicit call from
     the boot manifest. `install()` is already exported; today the file installs
     itself on load and owns four delegated `document` listeners, which is a kit
     deciding where it lives.
  3. The five DOM-touching movers (`chat-render`, `session-render`,
     `source-peek`, `swipe-deck`, `vanilla-demo`) all move. Each was read: each
     takes a host it is handed, or appends something with nowhere else to go.
     The shelf's stated line is "no DOM opinions of its own", not "no DOM".

  **A fourth correction to the mechanical rule**, found while deriving the
  split: the prototype boundary has **three** spellings, not two. Beside the
  direct form and an alias off the class, there is an alias off an *instance*
  (`const p = window.gh.constructor.prototype`), which is how `gh-boot.js` wraps
  `.load`. A detector reading only the first two calls the repo's own boot file
  a kit. `scripts/code-shape-survey.py` was fixed, and the fix strengthens A:
  the rule is one grep, not one grep plus a carve-out for the boot file.

  **Cost, measured rather than estimated.** 31 files carry a runtime
  `gh.load('<mover>')` and break if missed (20 in `lib/`, 10 in `pages/`, 1 in
  `tracker/`). 84 mention a `lib/<mover>` path: 44 in `tools/` (tests and build
  scripts, which fail loudly), 23 in `tracker/` and `docs/` (prose, which goes
  quietly wrong), the rest in `lib/` and `pages/`.

  **Definition of done, superseding the one in the body above.**

  - The 20 moves, `build.js` to root, `diagnostic-vanilla-bundle.js` deleted.
  - All 31 runtime call sites rewritten; `npm test` green; `dist/web-tools.js`
    rebuilt and working (`build-lib.mjs` walks `lib/` recursively so no glob
    changes, but it hardcodes `url-params.js` and `repo-address.js` in its boot
    list and both move).
  - `gh-boot.js`'s 11 `gh.load` calls become a declared boot manifest.
  - A test asserting the rule in all three directions, off
    `scripts/code-shape-survey.py`: nothing in `kits/` extends the prototype,
    nothing in root registers a namespace without extending it or being a
    bundle, everything in `alpineComponents/` registers `Alpine.data`.
  - The 23 prose references corrected.

  Its own PR, not folded into feature work. **Not** in scope: topic sub-shelves
  within `lib/kits/` (option F), which is a separate arrangement question and
  costs nothing to defer.

- 2026-08-07: **the shelf is now measured by a committed instrument, and the
  decision is stated as a document rather than as a paragraph in this file.**
  Delivered on `claude/lib-kits-consolidation-pdhf41`, PR #367. Nothing under
  `lib/` moved.

  - `scripts/code-shape-survey.py` (`npm run code-shape`) emits per-file
    observable properties: what a file attaches to, whether it is boot-loaded,
    whether it touches the hub chain, the DOM, or Alpine. Re-runnable, so the
    next session argues from a current reading rather than from this log.
  - `pages/guides/code-layers.html` carries the argument in five tabs: the
    facts, the shelf as measured, the options, the target, the migration.

  **Three corrections to the 2026-08-06 entry below. Read them before using its
  table, which is otherwise still good.**

  - **`traffic.js` is misfiled in that table.** It sits under "stays,
    scaffolding", but it does not extend `GH.prototype`; it wraps
    `window.fetch` and registers `window.Traffic`. Only its comment says
    otherwise, and the entry sorted it on the prose. Under option A it **moves**,
    making 15 movers rather than 14.
  - **`kits/build.js` extends `GH.prototype`** (it overrides `.read` and
    `.get`), from the shelf whose README says a kit cannot. It is the one file
    no version of the rule places cleanly and it needs an explicit ruling.
  - **The prototype boundary has two spellings**, direct and via an alias
    (`const proto = window.GH.prototype`). A detector reading only the direct
    form reports 2 extenders where there are 5, which is how the first two
    errors survived.

  **A third candidate rule was raised and measured: "a kit is general
  cross-app logic."** It fails the same way portability did. Counting distinct
  non-test files that reference each module's namespace:

  | | median reach | range | 
  | --- | --- | --- |
  | `lib/kits/` (22) | 5.5 | 1 (`xlsx.js`, `guide-index.js`) to 29 (`io.js`) |
  | `lib/` root logic (20) | 4.0 | 2 (`repo-mailbox.js`) to 31 (`vanilla-demo.js`) |

  The ranges overlap almost entirely, the single most-referenced logic module in
  the repo is in root, and the two least-referenced are kits. As a *description*
  the rule is false. As a *target* it has a worse problem: reach is a number that
  moves when an unrelated page is added or deleted, so no test can hold it
  without churning files between folders. Recorded here so it is not proposed a
  fourth time.

  **Two options the guide does not yet carry**, both raised 2026-08-07:

  - **E. No shared logic layer.** Fold each logic module into the component or
    page that uses it; `lib/` keeps only the loader and `alpineComponents/`.
    The reach numbers above are the argument against it: median 4 to 5.5
    consumers per module means folding in means duplicating.
  - **F. Kits organized by topic, as sub-shelves.** Orthogonal to A through D:
    it is about arrangement *within* a shelf, not about which shelf. Cheap and
    compatible with A, but note `guide-index.js`'s own test asserts a flat
    `pages/guides/` for the same reason it would matter here: one flat shelf
    keeps "what is a kit" answerable by path alone.

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
