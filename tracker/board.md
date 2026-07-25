# Board

_Generated from tasks/. Do not hand-edit._

## On deck
- 🎫 Backfill guide regions into old PR bodies and full-regenerate the merge guide
- 🎫 Fold chat-results into the surface schema, or keep it a sibling
- 🎫 Collapse quickLinks into a projection of the repos manifest next: decide the projection rule (a flag on repos entries, or first-N) and migrate loadQuickLinks
- 🎫 Confirm-gated cross-repo edit proposals via a web-tools-private channel next: Design the proposal record + the show-repo pending panel; reuse gh-transfer's confirm gate
- 🎫 Have data-view open at an addressed item via the fragment next: decide the fragment vocabulary (item index, item name, or both) before building; the delivery half already works
- 🎫 Reclaim the phone viewport in data-view next: user is reviewing the five options; start with demoting the notes (option 3) and the full-bleed toggle (option 5), which need no cross-frame work
- 🎫 A multi-method harness for extracting structure from scanned documents
- 🎫 Generalize FAB embed handling to declared embeds next: Build only when a real composite page (multiple interactive embeds) exists; nothing schedules this.
- 🎫 Finish GitHub jump-over coverage across show-repo views next: sweep the remaining views (stage rows, atlas, recent panel, compare) for missing one-tap GitHub links
- 🎫 Integrate the stage with the surfacer's .surface format next: run in a session with both web-tools and the home repo, to read the surfacer's .surface files directly
- 🎫 Build our own JSON tree for display, keep vanilla-jsoneditor for editing next: user was leaning toward replacing it outright; the recommendation is the split below, so confirm the split before building
- 🎫 Private-repo landing federation via the home registry next: superseded by tasks generalize-gallery-pages-catalog-m3b8pa (gallery generalization) and app-views-estate-level-btp6m4 (app views); reassess whether any federation-specific work remains
- 🎫 Repo-designated inbox and outbox in .web-tools.json (`claude/pr-219-review-22csrh`)
- 🎫 Repo-level GitHub links in show-repo's shield dialog
- 🎫 Session-start nudge for unconfigured or legacy-manifest repos (`claude/skills-portable-conventions-8x1lua`) next: write a global SessionStart hook that checks repo state and injects a nudge; wire its install into the Claude Code web account setup script
- 🎫 Give show-repo the ability to edit a repo's .web-tools.json (`claude/skills-portable-conventions-8x1lua`) next: design a minimal config-edit surface in the show-repo shell; first use is a one-tap migrate of a legacy .show-repo.json to .web-tools.json
- 🎫 show-repo - first-class projects, defined by tracker presence
- 🎫 Spike the snags log (friction learned the hard way) (`claude/pr-219-review-22csrh`)
- 🎫 Converge the stage and surface item schemas
- 🎫 toss-render ?query forwarding drops multi-param page queries next: decode the gh param from the raw fragment slice (not URLSearchParams) so a bare & in the page query survives, or document the %26 requirement in the head comment and the on-page help
- 🎫 Extend fetch + blob-import to the gh-api.js-chain ?use= boot

## In progress
- 🎫 Estate activity signals from a registry activity cache (`claude/branches-view-api-caching-ef4l5d`) next: review the branch build; the cross-repo file-listing and the GraphQL-batched crawl (fewer calls) remain as follow-ons
- 🎫 Singleton fab with toss-render integration (`claude/fab-render-toss-render-ua6p3p`) next: live-confirm branchesForPath (GraphQL Commit.file) with a token, then wrap up PR #241
- 🎫 Propagate the stage link's new grammar to the portable docs (`claude/stage-link-grammar-docs-jukn37`)

## Blocked
- (none)

## Done
- 🎫 Add a task-tracker skill (`claude/agent-file-retrieval-skill-tv4can`)
- 🎫 Build an agent-assisted file-retrieval skill (`claude/agent-file-retrieval-skill-tv4can`) next: build corpus_search.py (find) with a sources config and a file-per-document default, plus read_doc.py (read) and a SKILL.md that fixes the search-and-present flow; dogfood on this repo's content
- 🎫 App views - designate a page as an estate-level view (`claude/web-tools-app-views-m3pkyo`) next: landed; News goes live in the estate switcher when home#314 reaches main
- 🎫 Automate the merge guide from PR bodies (`claude/task-tracker-discussion-wg27xv`)
- 🎫 Branch-review view in show-repo (`claude/web-tools-branch-tracking-n1zawm`) next: session refreshes (show-repo thumbnail) at wrap-up, then review via PR #236
- 🎫 Update estate tests to the groupSections layout (`claude/viewer-button-dropdown-0h4u57`)
- 🎫 Extract drop-zone as a reusable Alpine component (`claude/tracker-summary-nu74te`)
- 🎫 Generalize the gallery to a per-repo pages catalog (`claude/web-tools-app-views-m3pkyo`) next: landed; live gallery for home needs home#314 on main (config cache reads main)
- 🎫 History-safe shim for toss-render address-mode renders next: done; hash-routing pages now switch views inside toss #gh= renders
- 🎫 Render files over 1 MB in toss-render and the shell viewers next: done — raw media type with git-blobs fallback landed in toss-render (ghText, showAddress, fetchShim) and gh-api.js get(); A/B headless test confirms the 5.9 MB DRS bundle is delivered where the old path returned blank
- 🎫 Speed up show-repo's cold load (`claude/speed-up-show-repo-load-3cdvl0`)
- 🎫 Fix the stage Diff lens B-select display desync (`claude/web-tools-diff-review-s0nrq7`)
- 🎫 Stage links and the main-area explorer in show-repo (`claude/task-tracker-discussion-wg27xv`)
- 🎫 Stand up the project tracker (`claude/tracker-concept-assessment-yto1m1`)
- 🎫 Carry commentary on a stage (prompts= link field, seed of a surface schema) (`claude/web-tools-diff-review-s0nrq7`)
- 🎫 Pass a trailing fragment through toss-render to the rendered page (`claude/toss-render-data-formats-4t55x7`) next: done on claude/toss-render-data-formats-4t55x7; lands via PR #288. Follow-on: have data-view consume the fragment for item selection
- 🎫 Structural response decode + differentiated errors in toss-render next: done; renders survive every media-type labeling and the error panel names the failing stage
- 🎫 Load the ?use= bundle by fetch + blob-import instead of jsDelivr (`claude/loading-behavior-tracker-aqbf4f`)
