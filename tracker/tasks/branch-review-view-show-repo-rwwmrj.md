---
id: branch-review-view-show-repo-rwwmrj
title: Branch-review view in show-repo
status: done
project: show-repo
opened: 2026-07-16
closed: 2026-07-17
session: claude/web-tools-branch-tracking-n1zawm
---
# Branch-review view in show-repo

## Concept

Add a `branches` view to show-repo, beside Landing and Atlas, that lists
every branch of the current repo with a landed / stranded rollup and links
each row to its GitHub tree and compare view. show-repo has quietly become
the daily landing page, and branch management is a standing, named pain
point on the home side. This puts the read where the user already lands and
turns the per-branch reconcile judgment into a click instead of a re-run.

The reference implementation already exists at the CLI: home's
`tools/unmerged-branches.sh` (home tracker, "Branch survey instrument", done
2026-07-06). It classifies every unmerged branch into recently-active /
likely-landed / likely-stranded and links each row out to GitHub. This task
ports that read into the browser, where it works across any repo the
viewer's token scopes (including private ones), interactively, rather than
as a static markdown report over a single local clone.

## The load-bearing design point

Do not key the landed signal on `ahead_by`. home's history rewrite left most
old branches with no merge-base, so `ahead_by` spans a branch's whole line
and means nothing (the CLI marks these with `*`). The CLI instead uses a
content signal: does each uniquely-touched path hold bytes that exist on
main, at the same path or moved anywhere in the tree. A view keyed on
`compare().ahead_by` would reproduce exactly the misleading signal the CLI
worked around, and would read *less* accurately than the tool already in
hand on the repo that needs it most.

The content check ports to the API cheaply. One recursive-tree call
(`GET /repos/{repo}/git/trees/{defaultRef}?recursive=1`) returns every path
and blob SHA on the default branch in a single response: the browser
equivalent of the CLI's `main_blobs` set. Then per branch, compare its
changed-file blob SHAs against that set. That is the CLI's algorithm in API
form.

## What is already there to build on

Every data primitive exists and is proven in `lib/gh-fetch.js` and
`lib/alpineComponents/compare.js`:

- `branchesDated()`: every branch with tip-commit dates, sorted newest-first
  (the recently-active window keys on this).
- `compare(base, head)`: GitHub's compare object (status, ahead_by,
  behind_by, commits, per-file status and patch) for the per-branch drill-in.
- `compare.js` already renders per-file diff status and emits an LLM-ready
  serialization (`buildDump`) that a multi-branch review could reuse per row.
- The shared browser store already caches a branch list (`ensureBranches`),
  and refs are already surfaced (the `@` ref switcher, the off-main banner,
  the "Compare to main" button).

The missing piece is purely a new top-level view that iterates branches and
renders the rollup, slotting in beside Landing and Atlas via the same
`view`-string plus sidebar-button pattern the page already uses.

## Connection to other work

- **Merge-guide automation** ("Automate the merge guide from PR bodies", and
  the backfill task). Both efforts reconstruct shipped-versus-unshipped from
  diffs and both want an LLM-ready serialization of a comparison. Consider
  whether the branch-review view and the merge-guide generator are two faces
  of one "read the estate from the API" engine rather than two builds.
- **The private per-repo registry.** The branch review is one more per-repo
  read that today would hit the GitHub API on every visit. The direction
  already forming on main (the `.web-tools.json` per-repo config, the
  private-registry-driven quick-links, and the derived config cache with
  per-repo history in the private repo) is where centralized facts about
  each repo live so a page need not ask each time. That is the natural place
  to stage or cache this read, so a later session should co-design the two
  rather than hard-wire the branch view to live API calls only. Reference,
  not a dependency: the view can ship against the live API first and fold in
  later.

## What "done" means

- A `branches` view registered beside Landing and Atlas, driven by the same
  `app().view` string and a sidebar button, deep-linkable via `?view`.
- Per branch: last-activity date, a landed / stranded classification on the
  content-level signal (not `ahead_by`), and links to the branch tree and
  the `main...branch` compare, plus a header link to GitHub's branches UI.
- Advisory only. The delete / reconcile action stays the user's, per branch;
  the view frames it and decides nothing, matching the CLI instrument's
  reserved-decision posture.
- A stated check that the browser classification agrees with
  `unmerged-branches.sh` on a sample of home branches, so the port does not
  silently regress the content signal.

## Progress log
- 2026-07-16: opened, from a cross-repo branch-review synthesis session.
  Origin material: home's `tools/unmerged-branches.sh` and its "Branch survey
  instrument" task (the CLI instrument and its baseline); home's 2026-07-06
  branch-survey handoff and the June 14 reconcile memo (the hand-done
  predecessor). Architectural read confirmed show-repo already holds every
  primitive (`branchesDated`, `compare`, `compare.js`/`buildDump`). Not yet
  claimed.
- 2026-07-17: Claimed on branch claude/web-tools-branch-tracking-n1zawm. Plan:
  port the CLI's content-level signal into a pure module (lib/branch-status.js,
  unit-tested, checked for agreement against home's unmerged-branches.sh), extend
  branchesDated with tip sha and subject, and build the branches view on top
  (compare + recursive-tree per branch against one default-branch tree read).
- 2026-07-17: Built and pushed on the session branch; PR #236 (draft) carries
  the guide. lib/branch-status.js (pure math) + lib/alpineComponents/branches.js
  (the view) + branchesDated pagination/tip-sha/subject; 18 new tests, suite
  222/222. The stated check ran against home's 56-branch estate via
  scripts/check-branch-status.mjs: 52 exact, 4 divergent only where the CLI's
  git rename detection credits moved-and-evolved content (conservative
  direction), API-shaped input drift 0. Flips to done on merge.
- 2026-07-18: Closed. Delivered via PR #236 (merged 2026-07-17); status was left in-progress after the merge and is flipped now in a tracker sweep.

- 2026-08-05: The open question under "Connection to other work", whether the
  branch-review view and the merge-guide generator were two faces of one
  "read the estate from the API" engine, is answered: the generator was retired on
  PR #358 and the reading side is the survivor. Any future merged-PR view belongs
  in show-repo beside this one, reading the pulls endpoint, with nothing committed.
