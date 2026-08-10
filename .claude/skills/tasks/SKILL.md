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
  the backlog", "audit the tasks", "prune stale tasks", "check what's parked
  for you", "what's in my queue", or "anything left for this machine", or when
  a follow-up needs to survive across sessions. Owns the tracker's operations and filing
  rules; the web-tools skill owns PR bodies, surfacing links, and the merge
  guide, so route those there.
---

# tasks

The tracker is cross-session memory on `main`: `tracker/tasks/<id>.md` is the
source of truth, `tracker/board.md` is a generated rollup.

**This skill owns every rule about operating a tracker**, including when a task
should exist at all. [`docs/TRACKER.md`](https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/TRACKER.md)
is the contract behind it: the file schema, the id scheme, the board's shape,
the parser guarantees, and why each is the way it is. Fetch it when you need the
schema in full or are changing the design. It states no behavioral rules, so
nothing here is a restatement of it. Substitute the current repo into URL
templates.

## The filing rules

Read these before writing a task file. They answer the failure a tracker
actually has, which is not too few tasks.

**1. The bar.** File only work that a later session would otherwise have to
rebuild context to rediscover. Not every edit, and never work the current
session could simply do. Filing what you could finish now converts an hour of
work into a standing item someone must re-read, re-prioritize, and reconstruct.
Do the work; let the diff and the reply be the record. A finding already written
into a report, a chron entry, or a PR body is durable, so it does not also need
a task. This is the conventions' [Keep focus](https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/CONVENTIONS.md)
rule at the filing step.

**2. The gate.** Filing a *new* task needs the user's assent. Propose in your
reply, one line each, and file the ones they name. Batch the proposal at the end
of a pass so it is one decision rather than several.

**Know why you are asking.** It is not that writing to `main` needs clearance;
that permission is standing and covers every tracker write. You are asking
because the backlog is the scarce thing and a task nobody will claim costs more
than it saves. So the question is "is this worth carrying", not "may I commit".
Ask it once, take the answer, and move on.

Only *creating* a task is gated. Claiming, updating, closing (a refinement
close included, once its findings are confirmed), writing an assessment record
the user asked for, regenerating the board, and pushing to `main` are
unattended: they describe work
that already exists, and gating them would grow the backlog. This is a standing
decision, so take the gate without asking whether to ask.

**3. No fragmenting.** File by outcome, not by observation. Related fixes that
would land together belong in one task with a scoped list. Splitting them hides
the backlog's shape and multiplies filing overhead. Split only where the pieces
genuinely decouple: different claimants, different timing, or a real dependency
boundary. Do not pre-authorize a split inside a task file either ("or split this
out later if it does not fit"), which is how one task silently becomes two.

Delivery scope stays elastic in the other direction: a branch or PR may deliver
several tasks, and a task may span several PRs. When adjacent small items can be
cleared in one pass, bundle them into the open branch rather than minting a
branch per item. The task files, not the branch topology, carry the accounting.

## Bare invocation: caption the board

Called with no further ask (e.g. `/tasks` on its own), caption the current board
before doing anything else. Read `tracker/tasks/*.md` directly rather than
parsing `board.md`'s prose, so the rows can link. Close with a one-line offer of
the next action. When the ask names an action instead, skip the caption and go
straight to it.

One single-column table per status section, no header row, the column header
being the section name in caps. In-progress groups by owning branch: the branch
name bold on its own row, then each task under it prefixed `↳` (always, even for
a single task). Backlog and blocked are flat. Omit an empty section. This is the
`caption` skill's grouped-table grammar applied to tasks; that skill owns the
general form.

```
| IN PROGRESS |
|---|
| **claude/some-branch-abc123** |
| ↳ 🎫 [Task title](<blob url>) |
| ↳ 🎫 [Second task on the same branch](<blob url>) |

| BACKLOG |
|---|
| 🎫 [Task title](<blob url>) |
```

## No tracker yet

If `tracker/tasks/` doesn't exist in this repo, say so rather than silently
improvising a format. Offer to bootstrap one (an empty `tracker/tasks/` plus a
first task file) rather than assuming a tracker is wanted. A repo may
deliberately run no tracker.

## File a task

After the gate above clears. Mint the id as `<slug>-<rrrrrr>`, a short
interpretable slug from the title plus a 6-char base36 suffix that keeps two
sessions from colliding:

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

Status is one of `backlog | in-progress | blocked | done`. Two optional keys
answer what `status` cannot, and both are recognized: the board renders them on
open rows.

- `size: XS | S | M | L | XL | ?` calibrated to the session, the real unit of
  execution. **XS** folds into another task's pass, **S** is one session with
  room to spare, **M** is one full session, **L** is several, **XL** is a
  project and is a smell rather than a value. **`?`** means it needs a design
  pass before it can be sized, which is worth saying rather than guessing.
- `awaiting: <free text>` names what is holding a task. It is free text and
  cleared by hand, and it renders on a `backlog` row as readily as a `blocked`
  one, because a task can be startable in part and still be waiting on someone
  for the rest. It is not `depends-on:`: nothing mechanically knows when a
  person has decided.

Any scalar beyond the recognized set (`priority: high`, `owner: marcus`) is an
open tag: preserved, shown, not acted on. Full schema in `TRACKER.md`.

## File a runnable task

A task whose method is already settled carries `action: <skill-name>` and is
written thin: no argument, no history, because the reasoning lives in the skill.
Add `venue: <name>` when the session has to happen somewhere particular. Its
value set is the first column of `venues.md`: `web`, `cli`, `cowork`,
`dispatch`, `actions`, `runner`, `remote`. The body carries one line naming
which constraint parked it, since the tag cannot tell a permanent constraint
from a temporary one. (Until 2026-08-10 this tag was `runner: <machine>`;
migrate any you find, and note that `runner` is now a venue value rather than a
key.)

```markdown
---
id: <minted id>
title: <short imperative>
status: backlog
opened: <YYYY-MM-DD>
action: <skill-name>
venue: <name, when it is pinned>
---
# <title>

Run `<action>` for <the subject, in one line>.

## Parameters
- <key>: <value, or the rule that derives it>

## Done when
<the observable condition>
```

Two rules decide whether this shape applies at all. **If the procedure is not a
skill yet, writing the skill is part of filing the task**: the catalog is the
skill set and nothing else, so an `action` naming a procedure that exists only
in prose points at nothing. And **work needing no session belongs in a hook, a
test, or CI**, not here. Prefer a parameter that derives ("every month in X with
no file in Y") over a literal list, so the task stays true as the work lands.
Shape and reasoning in `TRACKER.md`.

## Pick up the queue for this venue

**Standing phrase: *"check what's parked for you"*** (also "what's in my queue",
"anything left for this machine"). It means: find every open task tagged for a
venue this session can serve, across every tracker in the clones on hand, and
report them before starting anything.

**Select over a set, not a value.** A session cannot always name its own venue:
`cli`, `cowork`, and `dispatch` on one desktop are indistinguishable from
inside, and a Cowork session has no reliable way to know a phone reached it. So
grep the venues this machine serves. A desktop:

```
grep -rlE '^venue: (cli|cowork|dispatch)$' */tracker/tasks/ */*/tracker/tasks/
```

Add `runner` once a self-hosted runner is registered on it; a sandbox session
greps `web` alone. Skip anything already `status: done`.

Then report each hit as its title, its tracker, its `size`, and its constraint
line, and stop. **Picking up is not claiming**: the user chooses what to start,
and claiming follows the rules below. An `action:` tag says the method is
settled and names the skill to run; without one the task is an ordinary task
that happens to be parked here.

Both tags ride into `board.json` under `tags`, so anything machine-side can
select on them without the generator changing.

## Claim, update, close

**Claim:** set `status: in-progress`, add `session: <your working branch>`, and
append a progress-log line. Do the feature work on that branch; update the task
file on `main` when status, owning branch, or the progress log changes.

**Close:** set `status: done`, `closed: <YYYY-MM-DD>`, `session:` to the
completing branch, and add a final log entry citing the branch and delivery PR
("Done on `claude/foo-ab12`; lands via PR #299"). Close when the branch work is
complete, not at merge, because nothing updates the task at merge time and a
close deferred to merge never happens. Close each task as it finishes even when
others remain in progress on the same branch. Report the close and its branch in
your reply.

## Assess the tracker

Assessment interprets the tracker as a whole; it recommends and never mutates.
Read every task file's body and progress log plus the repo's recent motion
(the newest commits, merged PRs), then report in chat: the workstreams the
open tasks form, framing that lags the implementation, decisions hiding inside
tasks, differences in scale and readiness, bundles that would travel together,
and good next-session candidates. Dispatch briefs, a ready-to-launch prompt
per bundle, are among the most useful outputs: converting backlog into
launchable work is much of an assessment's point.

The chat report is the deliverable. Offer to keep it as a durable record,
`tracker/assessments/YYYY-MM-DD.json` (schema `tracker-assessment/1`; contract
and required keys in TRACKER.md), rather than writing one unprompted: a record
earns its commit when the judgment would otherwise have to be rebuilt. Anchor
it to the commit of `main` you actually read, cite task ids rather than
copying what the task files already say, and push it to `main` by the same
scratch-branch recipe as any tracker state. Never edit a past assessment: it
is a dated record, aged rather than wrong when the tracker moves on; supersede
it with a new one.

Mutating anything the assessment recommends is refinement, below. The
boundary between the two is permission, not sequencing: an assessment-only
ask does not imply consent to refine, but when the user asks for both, or
confirms the findings in the same conversation, one pass assesses and then
applies the agreed refinement without a second round trip.

## Refine the tracker

Refinement restores scope truth by mutating task files. It is the operation
earlier material called grooming; "groom the tracker" still invokes it. Read
every task file's body and progress log, not just `board.md`. Flag each
`backlog`/`blocked` task that is superseded, stale, a duplicate, framed for
work that has since landed or shifted (wants reframing or narrowing to the
true residual), or oversized (wants splitting), and any `in-progress` task
whose `session:` branch is merged or gone. A recent assessment's `hygiene`
findings are a natural worklist. Propose findings; get confirmation before
closing, reframing, or splitting.

Check the status itself, not only the prose. A `blocked` task waiting on an
external event wants `awaiting:` and a `backlog` status; one waiting on a
particular venue wants `venue:` and the same, since both are startable and
`blocked` reads as "do not try." Leave `blocked` to what genuinely depends on
other work. A `done` task missing `closed:`, or a `backlog` task carrying a
`session:`, is the same class of finding.

There is no status for a refinement close, since a real `done` means the work
was completed. Set `status: done` and `closed: <date>` as usual, add the open
tag `resolution: superseded | stale | duplicate | dropped`, and name the cause
in a progress-log line.

## Commit tracker state to main

**Task files and `board.md` commit directly to `main`, never to a feature
branch.** That is what makes the tracker shared. Do the edit on a scratch branch
cut fresh from `origin/main`, push it to `main`, and return to your working
branch:

```
git fetch origin main
git checkout -B tmp-tracker origin/main
#   ... edit tracker/tasks/*.md ...
python3 "${CLAUDE_PLUGIN_ROOT}/tasks/build-board.py" tracker/tasks tracker/board.md
git add tracker/ && git commit -m "tracker: <what>"
git push origin tmp-tracker:main
git checkout <your-branch> && git branch -D tmp-tracker
```

This push is the standing exception to any instruction to keep commits on the
feature branch. It needs no confirmation, only a note in your reply.

If the push is rejected as non-fast-forward, another session advanced `main`:
fetch, rebase, regenerate the board, push again. Task files with distinct ids do
not conflict; `board.md` may, and it is generated, so take either side and rerun
the generator.

Never hand-edit `board.md`. Where a repo's commit hook regenerates it (web-tools
runs `npm run tracker-board`), the explicit call above is belt-and-suspenders;
run it anyway when working outside the hook.

## Another repo's tracker

The same recipe, run against that repo's clone, is how you correct a task
elsewhere; nothing else changes. What differs is when you may.

**Correct, unattended:** a statement that is now false (a path that changed
repos, a corpus that moved, a dependency closed elsewhere). Same standing
permission as updating your own task. Note it in your reply.

**File, gated:** a new task in another repo's tracker takes the filing gate,
because it spends that repo's backlog.

Name the origin in the commit message and add a dated progress-log line saying
where the correction came from, so the edit is not an unexplained write from a
session that was working somewhere else. If the repo is not in session scope,
leave the correction in your reply rather than filing a task at home to
remember it. [TRACKER.md](https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/TRACKER.md)
carries the reasoning and the reference-prefix rule that prevents most of these.

## Boundary with web-tools

This skill owns the tracker: operations, filing rules, and the main-branch
workflow. The `web-tools` skill owns the surfacing layer: PR bodies,
`[new]/[main]/[diff]` links, the 🎫 marker's display form, the merge guide, and
wrap-up. When the ask is about a task file or the board, stay here.
