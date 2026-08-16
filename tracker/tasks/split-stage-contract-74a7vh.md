---
id: split-stage-contract-74a7vh
title: Split the stage contract out of show-repo.md
status: done
closed: 2026-08-16
resolution: duplicate
opened: 2026-08-16
size: M
---
# Split the stage contract out of show-repo.md

docs/show-repo.md is 35,700 words, 22% of the docs folder, and its own registry
row calls it "the buried home of the stage contract": the 🗂️ stage primitive in
SURFACING.md and the show-repo skill both point at a document where the
contract is one section among thirteen. Extract the stage contract (the
`#stage=` grammar, groups, prompts, modes, `StageLink.read`, the transfer flow)
into its own doc, leaving show-repo.md the shell-and-views account with a link.

Method per docs/text-content.md's show-repo comment-split precedent: a token
comparison is the right first instrument and the wrong last one, so each
passage moves or stays on a substance check, not an overlap score. The manifest
section has docs/manifest.json as its structured stage already, so its prose
may shrink to the judgment layer in the same pass if the reading supports it,
but the stage extraction is the deliverable and the bar for "done".

## Done when

The stage contract lives in its own doc under docs/, named from SURFACING.md's
stage primitive and the show-repo skill; show-repo.md links it and no longer
carries the contract text; docs.json rows updated; `npm test` green.

## Progress log
- 2026-08-16: filed from the docs-organization assessment session
  (`claude/web-tools-docs-assessment-dc9bqv`), user-named in the go list.
- 2026-08-16: refinement close, resolution duplicate. `split-show-repo-doc`
  (closed the same day, PR #435) had already delivered this and more: the
  stage, the manifest, and the branch overlay each got their own doc. This
  task was filed from a scratch branch cut from the very commit that closed
  that one, without re-reading the board first; the duplicate survived under
  an hour because the merge surfaced it.
