# What the hub knows about the rest of the estate

The registries answer questions about this repository. A handful reach past it,
and until 2026-08-20 nothing said which were which: the distinction sat inside
twenty-two prose `scope` sentences, where it could not be grouped, filtered, or
counted. `span` is now a column ([registries.csv](registries.csv), domain in
[vocabularies.csv](vocabularies.csv), gated by
`tools/test/properties-registry.test.mjs`), and the Map view's Registries tab
carries both counts.

This document is the reasoning the column cannot hold, and the measurement that
prompted it.

## The asymmetry

[portable.csv](portable.csv) enumerates what leaves the hub: 45 files, each with
the route a consumer takes it by. There is no inbound counterpart. The hub knows
exactly what it ships and nothing about what came back, what was adopted, what
forked, or what grew locally.

That gap is invisible while every governed thing lives here. It becomes visible
the moment another repo grows one, which is what happened with skills: home
committed ten, `wa-fiscal-reports` among them, and both of the Map view's skill
surfaces read folders in this repo, so none of the ten existed anywhere a reader
could see them.

## The measurement, 2026-08-20

All eleven repos declaring `estate: true`, probed directly rather than through
the crawl.

| | instances | current | behind |
| --- | --- | --- | --- |
| committed skills outside the hub | 15, in 3 repos | 14 local | 1 forked |
| trackers | 13, in 8 repos | 2 | 11 on the retired `board.json` |
| `.paths.json` declarations | 2 | both | hub carries none |

The skills: home 10, chat-histories 4, wa-bills 1. The fork is wa-bills'
`web-tools-conventions`, a 110-line copy of the hub's `web-tools` skill whose
description still names the merge-guide lifecycle retired on 2026-08-05, and
which loads `CONVENTIONS.md` alone, missing the `SURFACING.md` split. The plugin
has shipped the current version to that repo the whole time; the committed copy
is what fires.

The trackers are the sharper number. [PR #441](https://github.com/mehrlander/web-tools/pull/441)
replaced `board.json` with `board.csv` plus `board-tags.csv`. Eleven instances
never followed, across seven repos, and nothing anywhere reports it.

## Three shapes, and which one to reach for

The estate already runs all three. Naming them is most of the work.

**Hub-scoped.** Population and carrier both here; the checkout is a complete
enumeration. Eighteen of twenty-two registries, and the right default.

**Estate-scoped aggregate.** The population spans repos, the carrier stays here,
and the rows are collected rather than inspected.
[manifest-fields.csv](manifest-fields.csv) is the working example: it governs
every key in use across the estate's manifests, and it works because
`.web-tools.json` is a file each repo writes about itself, which the config
crawl already fetches. Reach for this when the hub genuinely needs one table.

**Per-repo declaration.** The governed artifact is a file the hub defines and
each repo carries, with no aggregate at all. `.paths.json` is the case, and it
is the one that cannot be a row in `registries.csv`: the table asserts that a
carrier exists in this repo and is a CSV, this repo has no `.paths.json`, and
the two live instances are JSON. That is a fact about the model rather than an
oversight, and `registries.csv`'s own scope sentence has recorded the miss since
2026-08-16. The gate is right to refuse it; what was missing was somewhere to
say so.

## The rule the skills work follows

**Each repo authors its own record; the hub only aggregates.** A repo declares
its skills in its own `.web-tools.json`, the crawl that already fetches that file
for the adoption grade carries them to the Repos card, and no hub code inspects
another repo's tree. The alternative, having the crawl list `.claude/skills/`
per repo, costs a request per repo and puts the hub in the position of knowing
things nobody declared.

Hand-kept lists drift, so the declaration is generated where it can be: home
runs `tools/declare-skills.py` under its pre-commit hook. A repo without that
generator still declares by hand, and the honest reading is that its list is as
old as its last edit.

## Why `origin` has no `pulled` value

Two values, `local` and `forked`, and the missing third is the point. A pulled
skill installs from the marketplace into the plugin cache and is never committed
in the consuming repo, so a repo's `.claude/skills/` holds exactly what the hub
did not ship it.

Of the two, only `forked` is a defect. A local skill is a stated position: its
subject is one repo's own domain, so the hub does not ship it and should not.
`wa-fiscal-reports` and `drs-funds` are the cases, and rendering them as gaps
would be the same error as grading a repo unaligned for declining the
conventions, which is why `portable-align.js` already paints `optout` neutral.
The Repos card follows that: a fork reads as a warning and a local skill reads
as quiet.

Nothing on disk distinguishes the two, so `origin` is a judgment and the
generator refuses to stamp it. An authored `forked` survives a restamp; a bare
name reads as local.

## Left undone

- wa-bills and chat-histories declare no skills yet, so their five do not reach
  a card. Neither is writable from the session that measured them.
- The tracker drift has no surface at all. It is the same shape as the skills
  gap and would be answered the same way, by a declaration each repo writes and
  the crawl already reads.
- Nothing gates a fork against its upstream. The `forked` value records the
  judgment; it does not check whether the copy still matches.
