# Code layers

Where a new code file goes, and the rule that decides. One statement for the
whole repo, because the alternative is what happened: two layers were named
(kits, components), a third accumulated in `lib/` root with no name, and
`tools/` grew to seventy-seven non-test files of which forty-four are named
nowhere. New logic then lands by gravity, next to whatever it most resembles,
which is how a folder acquires a purpose nobody stated and cannot defend.

Naming a layer is not the same as justifying it. Where a split turns out to have
no rule behind it, this document says so rather than inventing one, and points
at the task that owns the decision. One boundary below is in that state.

Measured with [`scripts/unclaimed-code-survey.py`](../scripts/unclaimed-code-survey.py)
(`npm run code-survey`), which reports per-layer counts of files, files any
prose names, and files a test exercises. It is advisory and heuristic. Its use
here is the layer column, not the individual row: one unnamed file is noise, a
column of them is a category nobody has stated.

## The layers

| Layer | Admission rule | Attaches to |
| --- | --- | --- |
| `lib/` **scaffolding** | extends `GH.prototype`, or boots the chain | `GH.prototype`, or nothing (a bundle) |
| `lib/` and `lib/kits/` **logic module** | pure logic, no Alpine, no DOM opinions of its own. **The split between the two folders is unsettled: see below** | `window.<Name>` |
| `lib/alpineComponents/` **component** | renders and holds reactive state | `Alpine.data(name, fn)` |
| `scripts/` **standalone** | argv-driven, runs from any repo root, no repo of its own | a shell invocation |
| `tools/` **harness** | exercises or builds this repo, in Node, never shipped to a page | a `node`/`npm` invocation |

### `lib/` root or `lib/kits/`: open

Both folders hold files of one shape: a `window` namespace, Alpine-free, pure
logic. **Nothing sorts them,** and the tempting rule, that a kit is a capability
portable to any repo, is false. Counting only a **runtime** dependency on the
hub's own chain (`window.gh`, `gh.load`, `gh.get`, `__loadedScripts`), the
strongest available test of "this file cannot travel":

- **7 of the 21 files in `lib/kits/` have one**: `branch-brief.js`, `brief.js`,
  `build.js`, `export.js`, `wring.js`, `wsl-core.js`, `wsl.js`.
- **6 files in `lib/` root have none**: `data-payload.js`, `github-links.js`,
  `portable-align.js`, `shorter-payload.js`, `url-params.js`, `vanilla-demo.js`.

So a third of the kit shelf is less portable than six files that are not on it.
The folders do not sort on portability, and never have. What actually decided
each file's folder was when it was written and whether anyone thought about it.

**What is clean, and worth keeping:** `lib/` root scaffolding. Extending
`GH.prototype` or being a boot bundle is a mechanical, checkable property, it is
the strongest commitment a `lib/` file can make (a change to the shared object
every page holds), and every file that has it belongs there. Where a file does
both, scaffolding wins: [`lib/gh-auth.js`](../lib/gh-auth.js) and
[`lib/traffic.js`](../lib/traffic.js) extend the prototype *and* register a
namespace, and a reader needs to see the prototype extension first.

**What is open:** whether `lib/` root and `lib/kits/` should be two categories
at all. The measurement above is an argument that they are one, and that the
honest form is a single shelf with `lib/` root reduced to the boot chain. That
is a decision, not a finding, and it belongs to
[`lib-root-kit-migration-dind5t`](../tracker/tasks/lib-root-kit-migration-dind5t.md),
which carries the options and the file counts. Until it is made, **a new logic
module goes in `lib/kits/`**, since that is where the majority already sits and
a wrong guess costs one `git mv`.

The related rule that is not in doubt: a kit that wants Alpine reactivity does
not become a component, it gets a component wrapper.
[`lib/alpineComponents/cm-editor.js`](../lib/alpineComponents/cm-editor.js) over
[`lib/kits/cm6.js`](../lib/kits/cm6.js) is the reference pair. The shape rules a
`lib/` file must honor to load at all are in [`docs/loader.md`](loader.md), and
[`lib/kits/README.md`](../lib/kits/README.md) carries the per-kit table.

## tools/, which is the weak layer

[`tools/README.md`](../tools/README.md) states the folder split
(`render/`, `build/`, `test/`, `graphql/`) and names the files that carry the
contract between them. Below that line most files are named nowhere, and the
survey shows the gap is not spread evenly: it is concentrated in the two folders
of `--script` interaction drivers.

**Every `--script` driver lives in [`tools/render/scenarios/`](../tools/render/scenarios/).**
There is nowhere else, and that is worth stating because there briefly was: a
sibling `render/scripts/` accumulated twenty-nine files of the same shape that
`tools/README.md` never mentioned, and the two folders each grew their own
`sidebar-projects.mjs` against the same UI before being folded together. The
survivors are `sidebar-projects.mjs` and `sidebar-projects-overlay.mjs`, which
still overlap on their default path; only the overlay posture distinguishes
them.

`tools/concept-lab/` is a fourth thing and says so in its own
[README](../tools/concept-lab/README.md): experimental ground, read-only,
prototypes that have not earned a place yet. That is a legitimate admission
rule. It is worth stating rather than leaving to be inferred, because an
exploratory folder with no stated exit condition is how a repo accumulates
permanent prototypes.

## What this document does not do

It does not claim the layers are clean. It claims they are *named*, which is
the condition under which a wrong placement can be argued about. The survey
reports the drift; nothing gates it, and nothing should: a gate on "is this file
mentioned in prose" would be satisfied by mentioning it, which is not the same
as accounting for it.
