---
id: build-on-commit-hook-silent-bokkl3
title: The build-on-commit hook did not fire, and nothing said so
status: done
closed: 2026-08-02
project: tooling
opened: 2026-07-26
---
# The build-on-commit hook did not fire, and nothing said so

`.claude/hooks/build-on-commit.sh` is wired as a `PreToolUse(Bash)` hook in `.claude/settings.json` and owns four derived artifacts. During the 2026-07-26 in-flight session it did not run on any commit, and the session had no way to tell.

## What it should have caught

| Trigger | Artifact | What happened |
|---|---|---|
| `pages/**/*.html` changed | `pages/README.md`, `pages/index.html`, `pages/pages.json` | `pages/branch.html` was added and committed with no catalog rows. Caught at wrap-up, five commits later. |
| `tracker/tasks/` changed | `tracker/board.md` | Two tasks committed without a board regen. Caught immediately, because the commit's file count was visibly wrong. |
| `lib/` changed | `dist/web-tools.js` | Rebuilt, but by hand during the session rather than by the hook, so this one is unconfirmed either way. |

The page-catalog miss is the instructive one. A new page not appearing in the catalog is invisible: the page works, the tests pass, and nothing in the diff looks wrong. It survived five commits and would have merged.

## Why it matters more than the two regenerations it cost

The repo's convention is explicit that these four files are not to be hand-edited, on the grounds that the hook owns them. A session reads that and stops thinking about them. If the hook can be silently absent, the convention is worse than no convention, because it actively discourages the check it has stopped performing.

## What to find out

- Whether the hook fired at all, fired and failed quietly, or was never invoked because the harness did not load it. Session start would be where to look.
- Whether this is specific to this session, this repo's settings, or a change in how `PreToolUse(Bash)` hooks are matched.
- Whether the hook's own failure path is silent by design. A hook that regenerates artifacts should be loud when it cannot.

## Definition of done

Either the hook is confirmed working and the cause of this session's silence is identified, or the derived artifacts get a check that does not depend on it. The second is worth doing regardless: a test that regenerates the four artifacts and fails if any differs from what is committed would have caught the catalog miss on the first commit and does not care whether a hook ran.

## Notes

The verify-by-rebuild shape is already the repo's stated pattern for derived artifacts, and home runs exactly this as `tools/verify-artifacts.sh`. This is a gap in coverage, not a new idea.

## Progress log
- 2026-07-26 filed at wrap-up of the in-flight session, after regenerating `pages/README.md`, `pages/index.html`, `pages/pages.json`, and `tracker/board.md` by hand
- 2026-08-02: Closed during a tracker groom: the definition of done was met by later work that never updated this task. The hook-independent check shipped as tools/test/artifacts-lockstep.test.mjs (commit 9df43bf, 2026-07-27), CI runs the suite on every PR (.github/workflows/test.yml, commit 756fe3f), and the cause of the silence (hooks register only when the session project root is the repo) is documented in docs/environment/extending.md and CLAUDE.md, which now names the three owners of the lockstep.
