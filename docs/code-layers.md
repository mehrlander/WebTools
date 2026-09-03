# Code layers

Where a new code file goes, and the rule that decides. One statement for the
whole repo, because the alternative is what happened: two layers were named
(kits, components), a third accumulated in `lib/` root with no name, and
`tools/` grew to seventy-seven non-test files of which forty-four are named
nowhere. New logic then lands by gravity, next to whatever it most resembles,
which is how a folder acquires a purpose nobody stated and cannot defend.

Naming a layer is not the same as justifying it. Where a split turns out to have
no rule behind it, this document says so rather than inventing one, and points
at the task that owns the decision. The `lib/` root versus `lib/kits/` boundary
was in that state from 2026-07-26, was settled on 2026-08-07, and the tree was
migrated onto the rule on 2026-08-08; the section below states the rule.

Measured with [`scripts/unclaimed-code.py`](../scripts/unclaimed-code.py)
(`npm run code-scan`), which reports per-layer counts of files, files any
prose names, and files a test exercises. It is advisory and heuristic. Its use
here is the layer column, not the individual row: one unnamed file is noise, a
column of them is a category nobody has stated.

## The layers

| Layer | Admission rule | Attaches to |
| --- | --- | --- |
| `lib/` **scaffolding** | extends `GH.prototype`, or is a boot bundle | `GH.prototype`, or nothing (a bundle) |
| `lib/kits/` **kit** | everything else that registers a `window` namespace | `window.<Name>` |
| `lib/alpineComponents/` **component** | renders and holds reactive state | `Alpine.data(name, fn)` |
| `lib/ops/` **op** | is one function expression, reaching neither `window` nor `document` | nothing in a page: its caller evaluates the text |
| `scripts/` **standalone** | argv-driven, runs from any repo root, no repo of its own | a shell invocation |
| `tools/` **harness** | exercises or builds this repo, in Node, never shipped to a page | a `node`/`npm` invocation |

### `lib/` root or `lib/kits/`: settled 2026-08-07

**One place for logic.** Every file that registers a `window` namespace is a kit.
`lib/` root holds the loader, the files extending its prototype, and the boot
bundles, and nothing else. Decided by the user on 2026-08-07 against three
alternatives, all of which are recorded in
[`pages/guides/code-layers.html`](../pages/guides/code-layers.html); the
migration is owned by
[`lib-root-kit-migration-dind5t`](../tracker/tasks/lib-root-kit-migration-dind5t.md).

The tree matches the rule since 2026-08-08: 22 kits moved in from `lib/` root
(the settled split said 20, and two files added while the decision was being
made, `content-registry.js` and `estate-search.js`, were kits by the rule
before it landed, which is the rule demonstrating its own necessity),
`build.js` moved out of `lib/kits/` to `lib/` root, and
`diagnostic-vanilla-bundle.js` was deleted with zero consumers.
[`tools/test/code-layers.test.mjs`](../tools/test/code-layers.test.mjs) holds
the boundary in all three directions, off the same scan, so the next misfiled
file fails the suite instead of accumulating.

**Why this rule and not a better-sounding one.** Two rules were written down
before it and both were retracted within a day, because both sorted on a
property nothing could check:

- *A kit is a capability portable to any repo.* False in the folder. Counting a
  runtime dependency on the hub's own chain (`window.gh`, `gh.load`, `gh.get`,
  `__loadedScripts`), 7 of 21 kits had one while 6 root files had none, so a
  third of `lib/kits/` was less portable than files that were not in it.
- *A kit is general cross-app logic.* Also false, and worse as a target.
  Counting the distinct non-test files that reference each namespace, the two
  folders had medians of 5.5 and 4.0 over ranges of 1 to 29 and 2 to 31: the
  most-referenced logic module was in root and the two least-referenced were
  kits. Reach is also a number that moves when an unrelated page is added, so a
  file would change folders without changing.

Attachment is the only property that is mechanical, stable under unrelated
change, and already satisfied by the code. [`npm run code-shape`](../scripts/code-shape.py)
reads it, so the boundary can be held by a test rather than by anyone
remembering.

**Watch the third spelling.** Extending the prototype is written three ways:
`GH.prototype.x = `, an alias off the class (`const p = window.GH.prototype`),
and an alias off an **instance** (`const p = window.gh.constructor.prototype`,
which is what [`lib/gh-boot.js`](../lib/gh-boot.js) does). A detector reading
only the first two calls the repo's own boot file a kit, and reading only the
first reports 2 extenders where there are 5.

**Where a file does both, scaffolding wins,** since a change to the shared
object every page holds is the stronger commitment and a reader needs to see it
first. [`lib/gh-auth.js`](../lib/gh-auth.js) is the case: it extends the
prototype *and* registers `window.ghAuth`. [`lib/kits/traffic.js`](../lib/kits/traffic.js)
is **not**, despite a comment that reads like it: it wraps `window.fetch` and
registers `window.Traffic`, so it is a kit. It is also boot-loaded, which the
boot manifest records and the folder no longer tries to.

**Boot membership is not a folder.** It is the second question about a `lib/`
file, it is a cost rather than a structure, and encoding it in the tree is what
every failed rule was really attempting. Since 2026-08-08 the boot chain is a
declared manifest: the `BOOT` array at the top of
[`lib/gh-boot.js`](../lib/gh-boot.js), data rather than calls, with the FAB's
conditional equipment declared beside it as `FAB_BOOT`, so what a page pays to
start is one read. The manifest also owns `SourcePeek.install()`, which used to
be a self-install inside the kit.

The related rule that is not in doubt: a kit that wants Alpine reactivity does
not become a component, it gets a component wrapper.
[`lib/alpineComponents/cm-editor.js`](../lib/alpineComponents/cm-editor.js) over
[`lib/kits/cm6.js`](../lib/kits/cm6.js) is the reference pair. The shape rules a
`lib/` file must honor to load at all are in [`docs/loader.md`](loader.md), and
[`lib/kits/README.md`](../lib/kits/README.md) carries the per-kit table.

### `lib/ops/`: added 2026-09-03

**An op is one file that is one value.** A single parenthesised function
expression, one serialisable argument in, one serialisable result out, and no
reference to `window` or `document`. It attaches to nothing a page holds; the
caller evaluates the text and calls what comes back. That is the whole rule,
and [`code-shape.py`](../scripts/code-shape.py) reports it as `expression`.

It is a layer rather than a stricter kind of kit because the same file has two
runners that share nothing else: a page in this app, and a phone with no page
at all, which fetches the text and runs it inside a `data:` URL that Shortcuts
coerces to text and never displays (shortcut-tools' `Run-Op`, on the
`Get-FromJs` route that library's `docs/idioms.md` names as its one door to
JavaScript). A kit's contract admits a page, so nothing stops a kit from being
unusable off one, and the phone would learn that at run time. An op's contract
forbids the page, and the test learns it first.

Two rules follow from the phone runner, stated in
[`lib/ops/README.md`](../lib/ops/README.md): an op is synchronous, because the
coercion captures the page before a promise resolves; and a credential arrives
as input, because the phone has none of the app's storage. Both are
consequences of the attachment rule, not additions to it.

Measured when the layer was added, and the reason it was named rather than left
implicit: a heuristic pass over `lib/kits/` found 27 of 66 kits already
reaching no browser API, a split in the folder that nothing had stated. That is
the condition this document exists to catch. They stay kits, since each
registers a namespace, which is the attachment that decides; the op layer is
where a new page-free function goes, not a migration target for the 27.

## tools/, which is the weak layer

Since 2026-08-08 the accounting below has a carrier:
[`docs/harness.csv`](harness.csv), the harness registry, one row per code file
under `tools/` and `scripts/` (`tools/test/` stays with the test registry).
`role` is authored and a blank role is counted rather than hidden;
invocation, named, and tested are stamped by
[`tools/build/tools-index.mjs`](../tools/build/tools-index.mjs) and held in
step with its sources by the suite. It renders in the Web Tools app's Map view, Harness tab. The
registry does not change the judgment below; it makes the gap it describes
visible per file rather than per column.

[`tools/README.md`](../tools/README.md) states the folder split
(`render/`, `build/`, `test/`, `graphql/`) and names the files that carry the
contract between them. Below that line most files are named nowhere, and the
scan shows the gap is not spread evenly: it is concentrated in the two folders
of `--script` interaction drivers.

**Every `--script` driver lives in [`tools/render/scenarios/`](../tools/render/scenarios/).**
There is nowhere else, and that is worth stating because there briefly was: a
sibling `render/scripts/` accumulated twenty-nine files of the same shape that
`tools/README.md` never mentioned, and the two folders each grew their own
`sidebar-projects.mjs` against the same UI before being folded together. The
survivors are `sidebar-projects.mjs` and `sidebar-projects-overlay.mjs`, which
still overlap on their default path; only the overlay posture distinguishes
them.

`tools/concept-lab/` was a fourth thing here until 2026-08-25, when it moved to
the private `home` estate as `projects/local-models/instruments/concept-lab/`.
Its stated admission rule (experimental ground, read-only, prototypes that have
not earned a place yet) was legitimate and is not what moved it. What moved it
was the constellation rule read as written: a repo boundary exists where a
*visibility* boundary exists, and topic is handled by folders. Those instruments
analyse the private estate's own prose, and keeping them public cost a redaction
rule, with their experiment log carrying counts here and full passages there.

`semsearch.py` went with it. It had graduated out of the folder in 2026-08-02
and lived in `tools/`, but it imports `termlab`, and vendoring the forty-four
lines it needs would have put a copy on the far side of a repo boundary. The
warning that folder prompted still stands for any successor: an exploratory
folder with no stated exit condition is how a repo accumulates permanent
prototypes.

## What this document does not do

It does not claim the layers are clean. It claims they are *named*, which is
the condition under which a wrong placement can be argued about. The scan
reports the drift; nothing gates it, and nothing should: a gate on "is this file
mentioned in prose" would be satisfied by mentioning it, which is not the same
as accounting for it.
