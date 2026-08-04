# Project tracker

Cross-session memory for the work of a workspace: what is planned, in flight, blocked, and done, in a form the next session can read. Tracker state lives on `main`. That is the point: one shared place every session knows to check. Canonical source `mehrlander/web-tools` at `docs/TRACKER.md`; local `CLAUDE.md` sets placement and the registry.

**This file is the contract, not the instructions.** It carries the file format, the id scheme, the board's shape, and the reasoning behind each: what you read to adopt a tracker, to write a second implementation of the generator, or to change the design. Every rule about *operating* a tracker (when to file, how to claim, how to close, how to push) has one owner, the [`tasks` skill](../.claude/skills/tasks/SKILL.md), which is what a session loads at the moment it acts. Both are reachable by raw URL from any repo, so neither needs to restate the other, and where they would overlap this file defers.

Prose style: no em dashes. Use colons, commas, semicolons, or new sentences.

## Why

Short-lived branches and sessions cannot see each other. Without a durable list on `main`, every session re-derives the plan from chat, and progress is lost when the context window closes. The tracker is where the plan lives between sessions, so the next session starts where the last one stopped.

## The model

Two kinds of file, both on `main`:

- `tasks/<id>.md`: one file per task, the source of truth.
- `board.md`, and `board.json` beside it: rollups generated from the task files, never hand-edited.

Feature work rides its branch as usual. Tracker changes do not: task files and the generated rollups are committed directly to `main`, which is what makes the tracker shared. Where a session carries a blanket instruction to keep its commits on its feature branch (some environments inject one), these two paths are the standing exception, not a violation. Nothing else about a repo's branch or PR flow changes. The skill carries the push recipe and the scope of the permission.

Scope a tracker to a workspace, a bounded area you keep coherent across sessions. A repo may have several (nested or sibling), each in its own directory; a repo whose work is coherent uses one.

## Task file schema

Two layers. A small closed set of recognized keys drives the tooling; an open set of arbitrary scalar tags rides along, preserved and human-readable, ignored by the generator until promoted.

**Recognized keys.** `id`, `title`, and `status` are required. `project`, `track`, `opened`, `closed`, and `session` are optional and recognized: the generator acts on them when present. The body is the task.

```markdown
---
id: <slug>-<rrrrrr>    # interpretable slug + 6 random base36 chars; see Task id
title: <short imperative>
status: backlog | in-progress | blocked | done
project: <workspace or partition>   # optional, recognized
track: anchor | independent | depends-on:<id>   # optional, recognized
opened: YYYY-MM-DD
closed: YYYY-MM-DD    # set when done
session: <branch>     # set while in-progress
size: XS | S | M | L | XL | ?   # optional, recognized
awaiting: <free text>           # optional, recognized
priority: high        # example open tag: not acted on until promoted
---
# <title>

<what the task is, why, and what "done" means>

## Progress log
- YYYY-MM-DD: <what happened, and the intended next step>
```

**Status carries two companion fields.** `session` names the owning branch while a task is `in-progress`; `closed` dates it when it goes `done`. A `done` task keeps `session` set to the branch that completed it, so the board can say where the work happened after the fact.

**`size` and `awaiting` answer questions `status` does not.** `status` says whether a session can start a task. `size` says how much work it is, and `awaiting` says what is holding it. The three are independent, which is why `awaiting` renders on a `backlog` row and not only on a `blocked` one: a task can be startable in part and still be waiting on someone for the rest. Both are silent on a `done` task, since a finished task's estimate and its old blocker are history, the same rule that already silences `depends-on:`.

Calibrate `size` to the session, the real unit of execution: **XS** folds into another task's pass, **S** is one session with room to spare, **M** is one full session, **L** is several, **XL** is a project. **`?`** means not specifiable yet, which is a state rather than a magnitude: the task needs a design pass before it can be sized, and saying so is more useful than guessing. Treat **XL as a smell** rather than a value, since a task that large is usually several outcomes under one title and wants a phase carved off (see Conflicts' sibling rule in the `tasks` skill against fragmenting one outcome, which runs both directions).

`awaiting` is free text and cleared by hand. It is not typed and not auto-satisfied, because nothing mechanically knows when a person has decided, which is exactly what distinguishes it from `depends-on:`. Its natural values carry colons ("awaiting: OFM ruling: candidate 1"); the parser splits on the first colon, so they survive.

**Task id.** The `id` is a filing handle: it names the task file (`<id>.md`). Mint it as a short interpretable slug plus a random suffix, `<slug>-<rrrrrr>`, mirroring how a working branch is named (`fn-data-tracker-assessment-npjxbj`). The slug is a few lowercase hyphen-separated words drawn from the title, kept under about 40 characters, so a directory listing reads as a table of contents and a `depends-on:<id>` reference reads as a phrase. The six-character random suffix, from base36, is what keeps two sessions from colliding when they file at the same time. Do not use a sequential integer: two sessions each reading `main` and picking "the next free number" pick the same one, and the merge that lands second silently drops one task (see Conflicts). The slug is frozen at filing: it is a handle, not a live summary, so if the title later changes, leave the filename and `id` as they are.

Bring existing tasks aboard the new form at first opportunity. The generator keys on the filename, so a mixed directory works and nothing forces a flag-day, but the target is one scheme everywhere, not a standing exception for old files. The next time a session touches a tracker that still carries legacy ids (integers like `0001`, or the earlier dated form `20260716-8p0`), migrate them: rename each `tasks/<old-id>.md` to a slug, set the file's `id` to match, update any `depends-on:<old-id>` references that point at it, regenerate the rollups, and commit the renames to `main` like any other tracker change. The board is keyed by title, so the rename does not change it; the diff is the filenames and the one `id` line each.

**Parser contract.** Frontmatter is flat `key: value` pairs, split on the first colon, scalars only. No YAML library, no lists, no nesting, no multi-line values. Unknown keys are preserved and ignored, never errors. This is deliberate: a file arriving from any channel (a web edit, a paste) needs no valid YAML to parse, so imperfect input degrades to an ignored tag rather than a failure. It is a feature, not a limitation to fix.

**Open tags.** A session may add any scalar key it likes (`priority: high`, `owner: marcus`, `risk: high`) with no predefinition. Open tags are preserved, shown to a human, and not acted on by the generator.

**Graduation rule.** A tag starts open. It becomes recognized only when it earns it: when grouping or sorting the board by it is worth the code. Then you teach the generator that one key. The schema grows by evidence, not up front. Define only what the machine needs; leave the rest open.

**Where comments go.** Current-state facts (a priority, a size, a one-line flag) are scalar frontmatter tags, overwritten in place, so the file always shows the present value. Narrative is body prose: the description for standing context, the `## Progress log` for the append-only dated thread. Lists and threads stay out of frontmatter, since that is the one thing that would force a real YAML parser, and the body already does it better.

## Board format

`board.md` is generated from the task files, four sections in order:

- **On deck** (`status: backlog`)
- **In progress** (`status: in-progress`), each line naming the owning branch from `session`
- **Blocked** (`status: blocked`)
- **Done** (`status: done`)

One line per task, each prefixed with the 🎫 task marker ([SURFACING.md](SURFACING.md) owns the marker), keyed by title (not id); in-progress lines also show the owning branch. Nothing else: an open tag is never rendered, per the two-layer rule above.

**The title is a link to the task file**, `🎫 [title](tasks/<file>.md)`, which is the marker's form everywhere else and makes the board a table of contents rather than a list of strings: the row says what the work is, and one tap reaches the file holding the why, the definition of done, and the progress log. The href is relative to the **board's** folder, since that is the one base both consumers resolve against: GitHub renders `board.md` in place, and show-repo's board pane resolves a row's relative href against the board file's folder and opens the task in its viewer. It targets the file on disk rather than the `id` field, so a task whose id drifted from its filename still links to something that exists. The id appearing in an href is not a breach of "keyed by title": that rule governs visible text, and a reader sees only the title. The generator used to make one exception, a `next` tag it rendered while the schema did not define it, retired 2026-08-01 because a half-recognized key is the one thing the two-layer split exists to prevent. Where a task's next step belongs is the Progress log, which the file format already carries for it. The board is a faithful projection of the task files. Regenerate and commit both rollups with any commit that changes what the board shows: status, owning branch, or an unmet dependency.

**Dependencies render only while they bite.** A task carrying `track: depends-on:<id>` shows ` (needs: <blocker title>)`, resolved to the blocker's title because the id means nothing to a reader who did not write the task. The line is suppressed once the dependency is satisfied (the blocker is `done`) and on a `done` task, whose dependency is history either way. So a board stays quiet about the dependencies it has already cleared and speaks up about the ones a session would trip over. A `depends-on:` pointing at an id no task file defines renders as such rather than silently vanishing, since a dangling reference is the one case worth interrupting for.

### The typed projection

The same run writes **`board.json`** beside `board.md`. Two projections of one source, so they cannot drift, and each is shaped for a reader the other cannot serve.

| | Reader | Carries |
| --- | --- | --- |
| `board.md` | a session reading files, GitHub, a diff, a clone, chat | the human list, portable, no token needed |
| `board.json` | show-repo, and anything else machine-side | every field per task, unrendered |

`board.md` is not optional and does not go away. A session reads files rather than apps, and a session is the tracker's primary consumer; an app view is also token-gated. The projection exists so that a consumer never has to parse the rendered board to recover a field it could have been handed, which is the display-before-data inversion.

Each record carries the recognized keys at the top level and open tags under `tags`, so the two-layer split survives and a consumer cannot mistake an unpromoted tag for part of the contract. It adds three derived values the task file does not state:

- **`href`**, the same board-relative link the markdown row uses.
- **`lastActivity`**, the newest date in the progress log. A task's real freshness, and the one signal that separates a live task from one that has only been groomed; `opened:` cannot say it and neither can `board.md`. Empty when a task has no log rather than falling back to `opened:`, since a guess here reads as a fact.
- **`logEntries`**, the count beside it. A task drawing progress-log entries that never become work is telling you review will not move it. The count is mechanical; classifying an entry as work or maintenance is judgment and stays out.

The artifact carries no timestamp, so the same input produces the same bytes and the lockstep checks that re-run the generator against a clean tree do not fail on every run.

The generator ships with the `portable` plugin as `tasks/build-board.py` (python3, stdlib only, zero dependencies). It is one canonical implementation, so every tracker's board comes out the same shape and a repo does not write its own. A repo running without the plugin fetches that same script by raw URL into a gitignored path (see [PORTABLE.md](PORTABLE.md)); it is the same file reached by a different transport, not a reimplementation. The skill carries the invocation.

## Conflicts

Each session should edit only the task file it owns, so task conflicts should be rare. If two sessions edit the same task file, resolve that file as real content.

The collision that is not rare is two sessions **filing** at once. With sequential integer ids they pick the same next number, so each creates the same filename with different content. Nothing warns the first pusher: a fast-forward push raises no conflict, and the add/add only surfaces at the second session's merge, where it is resolved in that session's favor and the earlier task drops from `main`. The random suffix in the id above is the fix: two independently minted ids do not collide, so concurrent filings land as two separate files with no contact.

`board.md` is generated. If it conflicts, take either side and regenerate it. A concurrent filing still leaves the board stale (each side regenerated it against a partial set of task files), so rerun the generator after resolving; that is the same benign generated-file case.

## One logging axis

The surfacing course logs by PR (a unit of delivery); the tracker logs by task (a unit of intent). Pick one as the primary log. Running both produces two records that drift. For solo, topic-driven work the task is the more natural unit. The tracker is independent of the surfacing primitives and the course; adopt it alone or alongside either.

## Extension points (set in local CLAUDE.md)

- **Placement:** where trackers live (e.g. `projects/<name>/tracker/`, with an optional repo-root `tracker/` for repo-wide meta-work that belongs to no single project).
- **Registry:** an optional generated index of all trackers, for multi-tracker repos; single-tracker repos omit it.

The board generator is not an extension point: it ships with the plugin as one canonical script (above), so placement is the only per-repo choice about the board.
