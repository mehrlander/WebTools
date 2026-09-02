# Constellation architecture (portable kernel)

The theory of what goes where, and why, across a set of related repos. This is
the portable kernel: the principles that travel to any such set. The full,
worked doctrine (with the account's own repos, the triggering cases, the history
mechanics) lives in the private `home` repo at
`created/2026-06-27-constellation-architecture.md`, with mechanics in the
`2026-06-27-constellation-mechanics.md` companion. This file is the public,
reusable statement; that one is the instance.

The Web Tools app's **Map** view is the operational face of this doctrine: it renders the
portable set (below) and, per repo, the repo's own scope statement beside a live
read of how far the repo carries the set. The theory here is what the per-repo
scope stories apply.

## The constraint that selects everything: the ephemeral fresh clone

Every session starts from a fresh, ephemeral clone, in a container reclaimed
afterward, holding a credential scoped to the repo being worked on. Nothing
persists between sessions except what is committed, and nothing is reachable that
the repo-scoped token cannot reach. The test for any structural question is:
what does this look like when the repo is cloned cold by an agent with only its
own credential? Mechanisms that need per-clone setup, a second credential scope,
or a manual update step are the ones that fail quietly in this model.

## Principle 1: commit discipline

Committable is small, diffable source: text, code, markdown, small structured
inputs that are the source of truth. Not committable is generated, large, or
binary output. Keep the latter out by gitignore-and-regenerate (the default), an
external store fetched on demand, or git-LFS in its one narrow case (a large,
many-revision input a session usually does not need, with skip-smudge).
"Regenerable" is safe only when the builder is committed and deterministic and
the inputs are durably sourced; otherwise it is data loss with extra steps.

## Principle 2: visibility is the (almost) only thing that forces a repo boundary

Once discipline rather than size keeps a repo clean, most reasons to split
evaporate. "It got big" is the commit rule's job; "it is a different topic" is a
folder's job. The one thing a folder cannot express is visibility: you cannot
make one folder of a private repo public, or one folder of a public repo
private. So the split rule is crisp: a repo boundary exists where a visibility
boundary exists, and otherwise usually does not. Generalize "visibility" to the
unit of publication and access (an independent collaborator set, release surface,
or the option to open-source one part later) and it covers the near neighbors
too. Clone weight is a secondary, real, but rarely decisive tiebreaker.

## Principle 3: conventions sync by pull from a public hub

Conventions are not secret. The moment the source of truth for them is public,
every consumer (public or private) can fetch it with no credentials. So a public
hub holds the conventions and orchestration patterns; every repo is a consumer
via a committed, fail-soft pull; private repos hold private content, never
private rules. The consequence: there is never a need for private-to-private
convention sync. The hub's public-ness is load-bearing, not incidental, because
it is what gives the fresh-clone fetch its no-auth property.

Two guards make this robust rather than merely elegant. Anything critical must
live in the consumer's own committed contract (its `CLAUDE.md`), always present,
since the pull is fail-soft; the hub carries the shared, evolving, elaborative
layer. And a hub that is fetched and then invoked is a supply-chain surface: the
hub must be owned and trusted, and pinning is the lever if that trust ever needs
hardening.

## Principle 4: bootstrapping and staying-in-sync are one operation

"How do we start a new repo from the same base" and "how do we keep repos
current as conventions evolve" are the same question, answered by one mechanism.
Drop the committed bootstrap seed into a new repo and it pulls the current
conventions on its first session. There is no separate initialize step to drift
from the update step. The only thing ever copied is that seed, the minimal thing
that lets everything else be pulled; a repo cannot pull the mechanism by which it
pulls.

## Principle 5: the repo owns its own story

A repo's account of what it holds and why is a property of the repo, not of the
set. It is stated on the repo's own terms and does not change when a sibling
appears or disappears. Housing it centrally invites writing it comparatively, as
differentiation, which rots the moment the roster changes. So each repo declares
its own scope (in its `.web-tools.json` `scope` field, per
[`PORTABLE.md`](PORTABLE.md)); the cross-repo picture is a view that stacks those
statements, never an authored central list. This is the same shape as estate
membership (a repo opts in on its own config; there is no registry roster of
members) and as the surface split (a repo owns the surface that tells its own
story; the registry keeps only the curated, cross-repo ones).

## Principle 6: documentation has four places, and everything else is a question

Four slots. A markdown file in none of them is a **residual**.

| Slot | Holds |
| --- | --- |
| `docs/`, at a workspace root | documentation about the workspace |
| `README.md`, in any folder | what that folder is |
| beside the files it describes | a reference about that folder's own contents |
| `CLAUDE.md` or `AGENTS.md`, at a repo root | the agent contract |

A **workspace** is a repo, or a project folder inside one. A project that accumulates
documents gets its own `docs/` rather than sending them up to the repo's, which is the
same move as principle 2 one level down: a folder can express topic, and `docs/` is
where it expresses genre.

**`docs/` is the default and the third slot is narrow.** The third holds a reference
whose subject is the files sitting with it, so it is decided by what the document is
about, never by what moving it would cost. A folder that has quietly accumulated
documents about the workspace is a `docs/` nobody made, whatever the inbound reference
count says.

The Web Tools project view reads the first slot: its Docs pill renders the
workspace's `docs/README.md` above the mechanical listing (or `DOCS.md`, the older
name, where that is all there is), and counts the markdown inside source packages
(`data/source/`, `source-docs/`) rather than listing it, since a pull's provenance
README is material, not documentation.

A residual is a question, not a defect, and two answers close it: a document about one
folder becomes that folder's `README.md`; a document about the workspace moves to its
`docs/`. Where neither reading fits, leave it and say which it failed.

Counted by [`scripts/doc-placement.py`](../scripts/doc-placement.py)
(`npm run doc-placement`), which takes repo paths and reports the four slots plus the
residual by directory. It sorts on basename shape, so it cannot separate the third slot
from a file that drifted, and reports what else is in the directory instead: eight
capitalised documents beside sixteen CSVs is a data-design folder documenting itself,
one beside nothing is a document with nowhere to be. Advisory, never gates.
