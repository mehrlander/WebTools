---
id: split-show-repo-doc-3zh8xw
title: Split docs/show-repo.md along the app's structure
status: done
closed: 2026-08-16
opened: 2026-08-16
project: show-repo
size: L
session: claude/web-tools-app-concept-crg8sl
---
# Split docs/show-repo.md along the app's structure

docs/show-repo.md is the corpus's largest document (about 35,000 words), and
its registry row called it the buried home of the stage contract. The Web
Tools app reframing (docs/APP.md, PR #435) supplies the cleave lines that did
not exist when the doc accreted: the route groups in docs/app-routes.json
(estate views, repo views, shell) and the manifest. Split the doc into
references a reader can actually be sent to, each registered in docs.json,
with show-repo.md keeping the shell's own material (routing, header, sidebar,
the boundary statements) and a pointer where each section left, so existing
anchors keep resolving.

Likely cuts, judged one at a time rather than committed here: the stage
(done, docs/stage.md), the `.web-tools.json` manifest section (about 690
lines; two lib files deep-link its anchor, so the pointer must keep the
heading), the estate's view-by-view material, the branch overlay. Done means
show-repo.md reads as the shell's reference rather than the app's whole
prose, every split doc has a docs.json row and a reach channel, and no
inbound anchor 404s.

## Progress log
- 2026-08-16: third cut and close, same branch: the branch overlay (about 500
  lines, no inbound anchors) moved to docs/branch-overlay.md. Done on
  claude/web-tools-app-concept-crg8sl; lands via PR #435. The done-when holds:
  show-repo.md is about 21,000 words of the shell's own material (views and
  transfer), each split doc (stage.md, manifest.md, branch-overlay.md) has a
  docs.json row and a stated reach, and every inbound anchor resolves through
  a kept heading. The estate's view-by-view material stays by judgment: those
  sections are the shell's screens, which is what the doc is for under the
  split; revisit only if a screen's contract outgrows its section the way the
  stage did.
- 2026-08-16: second cut, same branch: the manifest section (about 690 lines)
  moved verbatim to docs/manifest.md beside manifest.json's field registry;
  show-repo.md keeps the heading and the consumer's boundary, and the two lib
  components' docs links (repo.js, config.js) now aim at the new reference,
  putting it on the app reach channel. show-repo.md is down from about 35,800
  to about 26,300 words. Remaining candidates: the estate's view-by-view
  material, the branch overlay.
- 2026-08-16: filed from the Web Tools app reframing session and claimed on
  claude/web-tools-app-concept-crg8sl, which made the first cut: the stage
  contract moved to docs/stage.md (reach: skill, via the show-repo skill),
  show-repo.md keeps the heading and boundary, SURFACING.md's stage primitive
  updated. Next cut is the manifest section, mind its inbound code anchors.
