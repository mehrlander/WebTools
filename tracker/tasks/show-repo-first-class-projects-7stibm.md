---
id: show-repo-first-class-projects-7stibm
title: show-repo - first-class projects, defined by tracker presence
status: done
opened: 2026-07-22
closed: 2026-07-31
session: claude/project-pages-docs-udzi51
---
# show-repo: first-class projects, defined by tracker presence

Give show-repo a project layer for repos that hold several workspaces, with
one defining convention: a `tracker/` directory marks a workspace. At the repo
root it marks the repo itself; nested (home's `projects/budget-drs/tracker/`,
`projects/budget-wa/tracker/`) it marks a project. "Repo or project" then
needs no separate registry of what counts: whatever runs a tracker is a
first-class unit, and giving projects first-class treatment gives trackers
first-class treatment in the same stroke.

## Why
home is one repo carrying several real operations (budget-drs, budget-wa,
bills, fiscal-notes), each with its own front door, board, and renderable
artifacts, but show-repo today presents the repo as one flat tree with one
landing. The concrete prompt: budget-wa's spend operation has a toss-renderable
estate page and a rich analysis layer that a reader cannot reach as a unit;
the budget-drs app links out to a GitHub tree URL because there is no project
landing to point at. Origin: the 2026-07-22 budget-drs contracts session
(home PR #333).

## Scope
- **Discovery.** How the shell learns a repo's projects: walk for `tracker/`
  directories (API-costly on big trees), read a committed registry (home
  already generates `trackers.md` via `tools/generate-tracker-registry.py`),
  or declare them in `.web-tools.json`. Likely answer: manifest declaration
  with the registry as generator, so discovery is one fetch.
- **Project landing.** Per project: its README lead, its board (On deck and
  In progress at minimum), its pins or renderable front door (a 🥏-able page
  like budget-wa's estate map), in the idiom of the existing repo landing.
- **Board rendering.** Boards become navigable surfaces in the shell rather
  than raw markdown blobs; this is the "first-class trackers" half.
- **Stage and link grammar.** Whether a project gets an addressable handle in
  links (`#project=` or a landing path), so a session can hand over "open
  budget-wa" as one tap.

## Definition of done
- A repo with nested trackers presents its projects as navigable units in
  show-repo, each with a landing that surfaces its board and front door.
- The defining convention (tracker presence marks a workspace) recorded in
  docs/show-repo.md, with the discovery mechanism named in the manifest docs.

## Progress log
- 2026-07-22 filed from the home budget-drs contracts session, where the
  missing project landing forced a bare GitHub tree link as the "comprehensive
  operation" target.
- 2026-07-31 claimed on `claude/project-pages-docs-udzi51` (PR #331). The
  project view grew Overview / Pages / Docs pills: a `projects` entry's new
  `landing` field takes Overview rendered live (the budget-drs case this task
  opened with; home's paired branch declares it), Pages derives the workspace's
  slice of the repo catalog (path prefix or a `project` claim key, deliberately
  no per-project list), and Docs lists every markdown file off one recursive
  tree with a curated DOCS.md lead. `&tab=` deep-links a pill, which covers the
  scope item about an addressable handle. Remaining scope: boards as navigable
  surfaces in the shell (today the Board button still opens the raw file in
  the viewer), and the merged docs recording the convention.
- 2026-07-31 done on `claude/project-pages-docs-udzi51`; lands via PR #331. The
  Board pill closed the remaining scope: a file board renders in-pane with its
  relative task links resolved into the shell's viewer, and every board tap
  routes there. The defining convention and the derived Pages/Docs mechanisms
  are recorded in docs/show-repo.md; home's paired branch declares budget-drs
  and budget-wa landings.
