---
id: repo-level-github-links-shield-9aufgx
title: Repo-level GitHub links in show-repo's shield dialog
status: done
closed: 2026-08-02
resolution: superseded
track: independent
opened: 2026-07-14
priority: low
---
# Repo-level GitHub links in show-repo's shield dialog

The shield button in show-repo opens the repo modal (repoModal, defined in lib/alpineComponents/repo.js), today an auth/token dialog. The file viewer already offers per-file GitHub/Raw/CDN links, but there is no convenient jump to the repository at coarser levels.

Add GitHub links at the right levels to that dialog (or another low-clutter spot): the repository root, and plausibly the current folder and the current ref's tree. Keep it compact; the point is one tap to the corresponding GitHub page, not a link farm.

Done means: from show-repo you can reach the open repo on GitHub at the repo level without hand-editing a URL, and the dialog stays uncluttered.

## Progress log
- 2026-07-14: Filed. Noted while building the stage/explorer work (task 0006); deferred as a small, separable item.
- 2026-08-02: Closed during a groom as superseded: the jump-over work (github-jumpover-coverage-7bkgmk, closed) delivered this task's definition of done in a different low-clutter spot than the shield dialog it suggested. lib/github-links.js names the repo-level GitHub destinations (root, PRs, issues, branches, Actions, declared task board) and the repo menu serves them from the sidebar rows, the Activity chip, and, since today, the estate cards. From show-repo the open repo is reachable on GitHub at repo level with one tap and no hand-edited URL.
