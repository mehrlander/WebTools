---
name: tasks
description: >-
  Operate a repo's project tracker: propose and file a task, claim one, update
  or close it, assess the tracker as a whole, refine the backlog, and
  regenerate the board, following the docs/TRACKER.md schema and the rule that
  task files and board.md commit straight to main (not a feature branch).
  Carries the filing rules: the bar for what deserves a task, the gate that a
  new task is proposed rather than filed unprompted, and the rule against
  fragmenting one outcome into several tasks. Invoking this skill bare (no
  further ask) surfaces a caption of the current board. Use when the user says
  "add a task", "file a task", "make a tracker task", "claim a task", "check
  the tracker", "what's on the board", "regenerate the board", "close task X",
  "assess the tracker", "refine the tracker", "groom the tracker", "clean up
  the backlog", "audit the tasks", or "prune stale tasks", or when a follow-up
  needs to survive across sessions. Owns the tracker's operations and filing
  rules; the web-tools skill owns PR bodies, surfacing links, and the merge
  guide, so route those there.
---

# tasks

The tracker is cross-session memory on `main`: `tracker/tasks/<id>.md` is the
source of truth, `tracker/board.md` a generated rollup. **This skill owns every
rule about operating a tracker**, including when a task should exist.
[`docs/TRACKER.md`](https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/TRACKER.md)
is the contract behind it (file schema, id scheme, board shape, parser
guarantees) and states no behavioral rules; fetch it for the schema in full.
Substitute the current repo into URL templates.

## The filing rules

The failure a tracker actually has is not too few tasks.

**1. The bar.** File only work a later session would otherwise have to rebuild
context to rediscover. Never work this session could do now, and never a
finding already durable in a report, a chron entry, or a PR body. This is the
conventions' Keep focus rule at the filing step.

**2. The gate.** Creating a task needs the user's assent: propose in your reply,
one line each, batched at the end of a pass, and file the ones they name. The
scarce thing is the backlog, not permission to write `main`. Everything else
is unattended and is a standing decision, so do not ask whether to ask:
claiming, updating, closing (a refinement close included, once its findings
are confirmed), an assessment record the user asked for, regenerating the
board, and pushing to `main`.

**3. No fragmenting.** File by outcome, not by observation: related fixes that
land together are one task with a scoped list. Split only where the pieces
decouple (different claimants, different timing, a real dependency boundary),
and never pre-authorize a split inside the file. Delivery stays elastic the
other way: a branch may deliver several tasks and a task may span several PRs;
bundle adjacent small items into the open branch rather than minting a branch
per item.

## Dormant: preserved, and not to be raised

`status: dormant` is kept but off the table. The board renders it in no
section, and you do not surface, count, assess, summarize, or propose reviving
it unless the user names it; mentioning that you are not mentioning it is the
same failure. It is not a weaker `blocked` or a tidier `backlog`, both of which
still ask to be read on every pass. Setting it is the user's call: propose it
the way you propose a close.

## Bare invocation: caption the board

`/tasks` with no further ask captions the board first. Read
`tracker/tasks/*.md` directly, not `board.md`, so rows can link. One
single-column table per status section, no header row, the section name in
caps as the column header; in-progress grouped by owning branch (branch bold
on its own row, each task under it prefixed `↳`, always); backlog and blocked
flat; empty sections omitted; dormant absent. Close with a one-line offer of
the next action.

```
| IN PROGRESS |
|---|
| **claude/some-branch-abc123** |
| ↳ 🎫 [Task title](<blob url>) |

| BACKLOG |
|---|
| 🎫 [Task title](<blob url>) |
```

## No tracker yet

If `tracker/tasks/` does not exist, say so and offer to bootstrap one (an empty
`tracker/tasks/` plus a first task) rather than improvising a format. A repo
may deliberately run none.

## File a task

After the gate clears. Mint `<slug>-<rrrrrr>`, a short slug from the title plus
six base36 characters so two sessions cannot collide:

```
python3 -c "import random,string,sys;print(sys.argv[1]+'-'+''.join(random.choices(string.digits+string.ascii_lowercase,k=6)))" cross-corpus-note-index
```

Write `tracker/tasks/<id>.md`:

```markdown
---
id: <minted id>
title: <short imperative>
status: backlog
opened: <YYYY-MM-DD>
project: <optional workspace>
---
# <title>

<what the task is, why, and what "done" means>

## Progress log
- <YYYY-MM-DD>: <what happened, and the intended next step>
```

`status` is `backlog | in-progress | blocked | done | dormant`. Three optional
keys render on open rows:

- `size: XS | S | M | L | XL | ?`, in sessions: XS folds into another task's
  pass, S is one with room to spare, M one full, L several, XL a project and a
  smell, `?` needs a design pass before sizing.
- `awaiting: <free text>`: what a person has yet to decide. Cleared by hand,
  and valid on a `backlog` row, since a task can be startable in part.
- `depends-on: <id>[, <id>...]`: the tasks this one waits on. Absence means no
  dependency; never write a value meaning "none". (Replaced `track:` on
  2026-08-23; migrate an old file's `depends-on:<id>` value and drop the rest.)

Any other scalar (`priority: high`, `owner: marcus`) is an open tag: kept,
shown, not acted on.

## File a runnable task

A task whose method is already a skill carries `action: <skill-name>` and is
written thin, since the reasoning lives in the skill; add `runner: <machine>`
when the session must happen somewhere particular. If the procedure is not a
skill yet, writing the skill is part of filing the task. Work needing no
session belongs in a hook, a test, or CI, not here. Prefer a parameter that
derives ("every month in X with no file in Y") over a literal list.

```markdown
---
id: <minted id>
title: <short imperative>
status: backlog
opened: <YYYY-MM-DD>
action: <skill-name>
runner: <machine, when it is pinned>
---
# <title>

Run `<action>` for <the subject, in one line>.

## Parameters
- <key>: <value, or the rule that derives it>

## Done when
<the observable condition>
```

A machine finds its queue with `grep -rl 'runner: <machine>' */tracker/tasks/
*/*/tracker/tasks/`; both tags ride into `board-tags.csv`.

## Claim, update, close

**Claim:** `status: in-progress`, `session: <your working branch>`, a
progress-log line. Feature work goes on that branch; the task file on `main`
changes when status, owning branch, or the log does.

**Close:** `status: done`, `closed: <YYYY-MM-DD>`, `session:` to the completing
branch, and a final log line citing branch and delivery PR. Close when the
branch work is complete, not at merge: nothing updates a task at merge time,
so a close deferred to merge never happens. Close each task as it finishes and
report the close in your reply.

## Assess the tracker

Assessment interprets and never mutates. Read every task body and log plus the
repo's recent motion, then report: the workstreams the open tasks form,
framing that lags the implementation, decisions hiding inside tasks, scale and
readiness, bundles that travel together, next-session candidates, and a
dispatch brief per bundle. Skip dormant tasks entirely, counts included.

The chat report is the deliverable. Offer, rather than write unprompted, a
durable `tracker/assessments/YYYY-MM-DD.json` (schema `tracker-assessment/1`,
keys in TRACKER.md), anchored to the commit of `main` you read, citing task ids
rather than copying them, pushed by the recipe below. Never edit a past
assessment; supersede it. Acting on what an assessment recommends is
refinement, and the boundary is permission: an assessment-only ask does not
imply consent to refine, while an ask for both, or confirmation in the same
conversation, runs the two as one pass.

## Refine the tracker

Refinement restores scope truth by mutating task files ("groom the tracker"
still invokes it). Read every body and log. Flag a `backlog` or `blocked` task
that is superseded, stale, a duplicate, framed for work that has since landed
or shifted, or oversized, and an `in-progress` task whose `session:` branch is
merged or gone. Check status, not only prose: waiting on an event or a machine
is `backlog` with `awaiting:` or `runner:`, since `blocked` reads as "do not
try"; a `done` without `closed:` or a `backlog` with `session:` is the same
class of finding. Propose; confirm before closing, reframing, or splitting.
Dormant tasks are out of scope unless the user just asked about one.

A refinement close is `status: done`, `closed: <date>`, the open tag
`resolution: superseded | stale | duplicate | dropped`, and the cause in a log
line.

## Commit tracker state to main

**Task files and `board.md` commit directly to `main`, never to a feature
branch.** Edit on a scratch branch cut from `origin/main`, push it to `main`,
return:

```
git fetch origin main
git checkout -B tmp-tracker origin/main
#   ... edit tracker/tasks/*.md ...
python3 "${CLAUDE_PLUGIN_ROOT}/tasks/build-board.py" tracker/tasks tracker/board.md
git add tracker/ && git commit -m "tracker: <what>"
git push origin tmp-tracker:main
git checkout <your-branch> && git branch -D tmp-tracker
```

This push is the standing exception to keeping commits on the feature branch;
it needs no confirmation, only a note in your reply. A non-fast-forward
rejection means another session advanced `main`: fetch, rebase, regenerate,
push again. Task files with distinct ids never conflict; `board.md` is
generated, so take either side and rerun. Never hand-edit `board.md`; where a
commit hook regenerates it, the explicit call is belt-and-suspenders.

## Another repo's tracker

The same recipe against that repo's clone. A statement now false (a moved path,
a dependency closed elsewhere) is corrected unattended; a new task there takes
the filing gate, since it spends that repo's backlog. Name the origin in the
commit message and in a dated log line. If the repo is not in session scope,
leave the correction in your reply rather than filing a task at home to
remember it.

## Boundary with web-tools

This skill owns the tracker. The `web-tools` skill owns PR bodies, `[new]`,
`[main]` and `[diff]` links, the 🎫 marker's display form, the merge guide,
and wrap-up.
