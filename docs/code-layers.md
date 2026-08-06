# Code layers

Where a new code file goes, and the rule that decides. One statement for the
whole repo, because the alternative is what happened: two layers were named
(kits, components), a third formed in `lib/` root with no name, and `tools/`
grew to seventy-seven non-test files of which forty-four are named nowhere. New logic then lands by
gravity, next to whatever it most resembles, which is how a folder acquires a
purpose nobody stated and cannot defend.

Measured with [`scripts/unclaimed-code-survey.py`](../scripts/unclaimed-code-survey.py)
(`npm run code-survey`), which reports per-layer counts of files, files any
prose names, and files a test exercises. It is advisory and heuristic. Its use
here is the layer column, not the individual row: one unnamed file is noise, a
column of them is a category nobody has stated.

## The layers

| Layer | Admission rule | Attaches to |
| --- | --- | --- |
| `lib/` **scaffolding** | extends `GH.prototype`, or boots the chain | `GH.prototype`, or nothing (a bundle) |
| `lib/` **estate module** | owns logic that knows *this estate's* domain: repo addresses, refs, branch state, the manifest | `window.<Name>` |
| `lib/kits/` **kit** | a capability that would be true in any repo: a file format, a codec, an editor, a transport | `window.<name>` |
| `lib/alpineComponents/` **component** | renders and holds reactive state | `Alpine.data(name, fn)` |
| `scripts/` **standalone** | argv-driven, runs from any repo root, no repo of its own | a shell invocation |
| `tools/` **harness** | exercises or builds this repo, in Node, never shipped to a page | a `node`/`npm` invocation |

### Kit or estate module: the distinction that was missing

Both register a `window` namespace, both are Alpine-free, both are pure logic.
Mechanically they are the same file. The question that separates them is **what
the module knows**, and it is worth asking because the answer decides whether
someone else can take the file:

- [`lib/kits/pdf.js`](../lib/kits/pdf.js) knows about PDFs. Drop it in an
  unrelated repo and it still works.
- [`lib/branch-survey.js`](../lib/branch-survey.js) knows that a branch has a
  merge-base, that a squash makes ref-level merge status meaningless, and that
  this estate calls the result "stranded." Drop it elsewhere and it carries this
  estate's model with it.

So: **a kit is a capability, an estate module is a domain.** A file that would
have to be explained before it could be reused is an estate module, whatever
shape it has.

The hard case is a file that reads one of this estate's own envelope formats:
[`lib/data-payload.js`](../lib/data-payload.js) and
[`lib/shorter-payload.js`](../lib/shorter-payload.js) are pure, generic-looking
functions over text, and a consumer would still need the envelope contract
before either was any use. Naming the boundary is what this rule is for; where
those two land is [`lib-root-kit-migration-dind5t`](../tracker/tasks/lib-root-kit-migration-dind5t.md)'s
call to make, and it sets the precedent for every payload reader after them.

The consequence is that "registers a `window` namespace" is a *necessary*
condition for `lib/kits/`, not a sufficient one, and the earlier per-file audit
in [`lib-root-kit-migration-dind5t`](../tracker/tasks/lib-root-kit-migration-dind5t.md)
sorted on the mechanical half alone. Its list needs re-reading against this
column before anything moves; that is that task's business, not this document's.

### Where a file that fits two rules goes

Two files extend `GH.prototype` *and* register a namespace
([`lib/gh-auth.js`](../lib/gh-auth.js), [`lib/traffic.js`](../lib/traffic.js)).
Scaffolding wins: a prototype extension is a change to the shared object every
page holds, which is the stronger commitment and the one a reader needs to see
first.

A kit that wants Alpine reactivity does not become a component; it gets a
component wrapper. [`lib/alpineComponents/cm-editor.js`](../lib/alpineComponents/cm-editor.js)
over [`lib/kits/cm6.js`](../lib/kits/cm6.js) is the reference pair. The shape
rules a `lib/` file must honor to load at all are in
[`docs/loader.md`](loader.md); [`lib/kits/README.md`](../lib/kits/README.md)
carries the kit shelf's per-kit table.

## tools/, which is the weak layer

[`tools/README.md`](../tools/README.md) states the folder split
(`render/`, `build/`, `test/`, `graphql/`) and names the files that carry the
contract between them. Below that line most files are named nowhere, and the
survey shows the gap is not spread evenly: it is concentrated in the two folders
of `--script` interaction drivers.

**`tools/render/scenarios/` and `tools/render/scripts/` are one category in two
folders.** Both hold files of the same shape, a default-exported
`async (page, ctx) => {}` handed to `screenshot.mjs --script`. Neither name
means anything the other does not, and both were created on the same day in
2026-07. Asserting is not the line either, though it looks like one at first:
three of twenty scenarios print `ASSERT` and none of twenty-nine scripts do, so
the split it describes is three files against forty-six, not one folder against
the other. The README names `scenarios/` and has never mentioned `scripts/`, so
half the category has been invisible since it appeared.

This document does not merge them. Forty-nine files, each with an invocation
line in its own head comment, is a mechanical change wide enough to deserve its
own pass and its own diff, the same argument that keeps the `lib/` root
migration separate. What it does is stop the split being accidental: until they
are merged, **`scenarios/` is the name and `scripts/` is the accident**, so a
new driver goes in `scenarios/`.

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
