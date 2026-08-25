---
id: add-task-tracker-skill-iwr1ay
title: Add a task-tracker skill
status: done
opened: 2026-07-14
closed: 2026-07-15
session: claude/agent-file-retrieval-skill-tv4can
---
# Add a task-tracker skill

The tracker's mechanics live only in `docs/TRACKER.md`: the task file schema, the recognized-vs-open key split, the claiming workflow, and the rule that task files and `board.md` are committed directly to `main`, not to feature branches. Nothing surfaces that doc automatically. The `web-tools-conventions` skill mentions the tracker once, as a pointer in the post-merge handoff section, but does not teach its use. The result is that a session filing a task infers the format from the shape of existing task files and can miss the main-branch rule.

Add a `task-tracker` skill that closes this gap, modeled on the existing skills:

- Closest analog is `caption` (`.claude/skills/caption/SKILL.md`): a self-contained skill that owns one mechanical job. The task-tracker skill should likewise own the tracker's operations directly (file a task, claim a task, regenerate and commit the board) rather than only pointing at the doc.
- `web-tools-conventions` is the doc-loader analog if the lighter approach is preferred: a thin skill that loads `docs/TRACKER.md` into context on the right triggers.
- Triggers: "add a task", "file a task", "claim a task", "check the tracker", "regenerate the board", and similar.

Design consideration: `web-tools-conventions` and this skill would have overlapping triggers around post-merge handoff language. The description must draw a clear line (conventions owns PR/surfacing mechanics; task-tracker owns the tracker's file format and workflow) so they don't fire redundantly or ambiguously.

Done means: a session can invoke or be prompted into the skill and get the tracker's schema and the main-branch placement rule without hand-reading `docs/TRACKER.md`, and the trigger boundary with `web-tools-conventions` is clean.

## Progress log
- 2026-07-14: Filed during the stage-copy UX assessment, after the session missed the main-branch placement rule when filing task 0010. The gap: tracker mechanics are documented but not surfaced by any skill.
- 2026-07-15: Claimed on branch claude/agent-file-retrieval-skill-tv4can. Scope expanded to include the collision fix: a same-id filing collision on 0010 (two sessions each picked the next free integer from a stale main; the later merge dropped one task) showed sequential integer ids are the failure. This task now also changes docs/TRACKER.md to a non-colliding id scheme (date + random suffix) and the skill teaches that discipline.
- 2026-07-18: Closed. Delivered via PR #218 (merged 2026-07-15); status was left in-progress after the merge and is flipped now in a tracker sweep.
