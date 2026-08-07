---
id: show-repo-edit-web-tools-json-ygramz
title: Retire .show-repo.json, delete the legacy file on migrate, drop the read fallback
status: backlog
project: show-repo
opened: 2026-07-15
size: S
---
# Retire .show-repo.json: delete the legacy file on migrate, drop the read fallback

The capability this task was filed for has shipped. `lib/alpineComponents/config.js`
is a structured `.web-tools.json` editor covering General, Projects, Pages, Stage,
and Scope, held by `tools/test/config-form.test.mjs`, and saving a config loaded
from the legacy `.show-repo.json` name already migrates it to `.web-tools.json`.
What remains is finishing the retirement of the legacy name:

- **Delete the old file on migrate.** The original scoping note said `gh-store.js`
  had no delete; it does now. After a legacy migrate save succeeds, call it on
  `.show-repo.json` so the repo does not carry two manifests. Say so in the toast.
- **Drop the read fallback at sunset.** `lib/alpineComponents/navigator.js:279`
  carries the `SUNSET(2026-08-15)` legacy-name read entry, and `config.js`'s
  `load()` tries both names. Once the estate's repos are migrated, remove both
  fallbacks and the migrate banner itself.

## Done when

A repo carrying only `.show-repo.json` can be migrated from the shell with the
old file removed in the same pass, and after the sunset date no code path reads
the legacy name.

## Progress log
- 2026-07-15: filed while wrapping PR #222 (the manifest rename). Migrate action
  scoped but not built; deferred here so the PR could wrap up.
- 2026-08-07: refined per the 2026-08-07 assessment (close-or-reframe). The
  general config editor and the migrate-on-save both shipped since filing,
  without this task being claimed; retitled to the true residual (legacy-file
  delete plus fallback removal) and dropped the stale `next:` tag.
