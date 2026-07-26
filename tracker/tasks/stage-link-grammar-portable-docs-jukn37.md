---
id: stage-link-grammar-portable-docs-jukn37
title: Propagate the stage link's new grammar to the portable docs
status: done
track: independent
opened: 2026-07-21
session: claude/stage-link-grammar-docs-jukn37
closed: 2026-07-26
---
# Propagate the stage link's new grammar to the portable docs

PR #257 extended the `#stage=` link from refs-only to a `{refs, commentary, mode}` object: `&prompts=` carries bespoke review prompts (base64url'd `{label, ask}`), `&mode=diff` opens the stage on the Diff tab and runs the compare on open, and `StageLink.read(location)` also seeds the stage from the `?query` (same keys) so a link rides a fragment-stripping context (a toss-render srcdoc, an email, a chat). The mechanics doc (`docs/show-repo.md`) and the `edit-review` skill were updated in that PR, but the traveling docs were not, so they now understate the link.

Stale spots to reconcile:

- **`docs/CONVENTIONS.md`, the "Stage a fileset 🗂️" primitive** (the canonical portable one, loaded into other repos via the `web-tools` skill). It still says the link "carries **refs only**" and shows only `…#stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3`. Update it to say a stage link can also carry **authored commentary** (review prompts) and a **mode**, both of which ride the link because they are authored, not repo content (the refs stay pointers, content stays behind the token), and that the same object can ride the `?query` for a fragment-stripping context, with the fragment the private default. Keep it light: CONVENTIONS.md defers full mechanics to `docs/show-repo.md`, so this is a sentence or two plus a pointer, not a re-spec.
- **Sweep the other traveling references** for the same drift: `docs/PORTABLE.md` (the to-go catalog), the `web-tools` and `show-repo` skills' descriptions of the grammar, and any README boot/grammar mention. Fix only what actually states the old refs-only grammar; do not add the grammar where it wasn't.

This is a content change to portable docs, so it rides its own branch and PR (this task file only captures the work; do not treat the task as the edit). Upstream framing (the "one object, several carriers" surface-schema idea this grammar is the first instance of) is in the closed task `surface-schema-commentary-on-stage-hqz0uu`; this task is the downstream "propagate to the docs that travel" step.

Done means: a reader of `docs/CONVENTIONS.md` (in web-tools or any repo that pulls it) learns that a stage link can carry prompts and a diff mode and can ride the query, without having to open `docs/show-repo.md`; and no other traveling doc still asserts the refs-only grammar.

## Progress log
- 2026-07-21: Filed on main after PR #257 merged. The in-repo mechanics doc and edit-review skill were updated in that PR; the portable CONVENTIONS.md primitive and the rest of the to-go set were not, and now understate the link.
- 2026-07-21: Claimed on branch claude/stage-link-grammar-docs-jukn37 (PR #259). Updated docs/CONVENTIONS.md's 'Stage a fileset' primitive and the show-repo skill's stage-link bullet for the prompts/mode/query grammar; PORTABLE.md rows only point at the grammar, so left unchanged. Flips to done on merge.
- 2026-07-26 closed: Delivered in PR #259 (branch fully merged to main). Found by `/in-flight`, which reconciles every in-progress claim against the branch it names.
