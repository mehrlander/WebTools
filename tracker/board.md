# Board

_Generated from tasks/. Do not hand-edit._

## On deck
- 🎫 Backfill guide regions into old PR bodies and full-regenerate the merge guide
- 🎫 Converge the branch page's authored layer on the branch-review surface
- 🎫 Make the branch page a navigation target, swipeable from the lists
- 🎫 Show the branch lifespan in the per-repo branch review too
- 🎫 Reach the take-away menu from show-repo's Pages gallery (needs: Find a way to focus attention on one piece of a page's UI)
- 🎫 The build-on-commit hook did not fire, and nothing said so
- 🎫 Fold chat-results into the surface schema, or keep it a sibling
- 🎫 Have data-view open at an addressed item via the fragment next: decide the fragment vocabulary (item index, item name, or both) before building; the delivery half already works
- 🎫 Reclaim the phone viewport in data-view next: user is reviewing the five options; start with demoting the notes (option 3) and the full-bleed toggle (option 5), which need no cross-frame work
- 🎫 A multi-method harness for extracting structure from scanned documents
- 🎫 Estate cards still carry the retired three-icon cluster next: Decide whether a card gets the repo menu, a trimmed cluster, or stays as it is
- 🎫 Capture button on the FAB, serializing what it already collects
- 🎫 Generalize FAB embed handling to declared embeds next: Build only when a real composite page (multiple interactive embeds) exists; nothing schedules this.
- 🎫 Let the FAB collect a toss subject's page actions, not just the shell's
- 🎫 Give the file-review collapsed row more than a name and a count
- 🎫 Find a way to focus attention on one piece of a page's UI
- 🎫 Finish GitHub jump-over coverage across show-repo views next: sweep the remaining views (stage rows, atlas, recent panel, compare) for missing one-tap GitHub links
- 🎫 Check GraphQL query shape offline against GitHub's published schema
- 🎫 Integrate the stage with the surfacer's .surface format next: run in a session with both web-tools and the home repo, to read the surfacer's .surface files directly
- 🎫 Guard every lib-booting page against the Alpine load race (`claude/shorter-tool-toss-render-nr7zoc`)
- 🎫 Move the kit-shaped files out of lib/ root into kits/
- 🎫 Live-confirm the two GraphQL queries the estate depends on
- 🎫 One parser for the owner/repo[@ref]:path address next: the module exists (lib/repo-address.js) and the ref question is answered; what remains is delegating the three copies and the data-view render check
- 🎫 Build our own JSON tree for display, keep vanilla-jsoneditor for editing next: user was leaning toward replacing it outright; the recommendation is the split below, so confirm the split before building
- 🎫 Pinch-zoom and pan for pdf-inspect's page view
- 🎫 Close open table perimeters in the pdf kit's lattice
- 🎫 A column-splitter page for the pdf kit
- 🎫 Two gaps the proposal channel showed on first use next: the removal kind is the one with a waiting job (six inert quickLink flags); the diff pane is polish
- 🎫 Inline the run-time CDN references a rendering copy still carries
- 🎫 Repo-level GitHub links in show-repo's shield dialog
- 🎫 Session-start nudge for unconfigured or legacy-manifest repos (`claude/skills-portable-conventions-8x1lua`) next: write a global SessionStart hook that checks repo state and injects a nudge; wire its install into the Claude Code web account setup script
- 🎫 Give show-repo the ability to edit a repo's .web-tools.json (`claude/skills-portable-conventions-8x1lua`) next: design a minimal config-edit surface in the show-repo shell; first use is a one-tap migrate of a legacy .show-repo.json to .web-tools.json
- 🎫 show-repo - first-class projects, defined by tracker presence
- 🎫 Spike the snags log (friction learned the hard way) (`claude/pr-219-review-22csrh`)
- 🎫 Move StageLink.read onto the shared fragment-first param read (needs: One parser for the owner/repo[@ref]:path address) next: confirm the empty-key change is wanted before touching it; it is the only observable difference
- 🎫 Give the stage a way to carry part of a file
- 🎫 Converge the stage and surface item schemas
- 🎫 Make the take-away menu work inside a toss
- 🎫 Extend fetch + blob-import to the gh-api.js-chain ?use= boot

## In progress
- (none)

## Blocked
- (none)

## Done
- 🎫 Add a task-tracker skill (`claude/agent-file-retrieval-skill-tv4can`)
- 🎫 Build an agent-assisted file-retrieval skill (`claude/agent-file-retrieval-skill-tv4can`) next: build corpus_search.py (find) with a sources config and a file-per-document default, plus read_doc.py (read) and a SKILL.md that fixes the search-and-present flow; dogfood on this repo's content
- 🎫 App views - designate a page as an estate-level view (`claude/web-tools-app-views-m3pkyo`) next: landed; News goes live in the estate switcher when home#314 reaches main
- 🎫 Automate the merge guide from PR bodies (`claude/task-tracker-discussion-wg27xv`)
- 🎫 Branch-review view in show-repo (`claude/web-tools-branch-tracking-n1zawm`) next: session refreshes (show-repo thumbnail) at wrap-up, then review via PR #236
- 🎫 Teach the guide region a delimiter that survives an agent's readback (`claude/budget-drs-tracker-review-s64mc6`)
- 🎫 Collapse quickLinks into a projection of the repos manifest (`claude/tracker-status-cjogjn`) next: done; landing via web-tools PR #302 and web-tools-private PR #8 (merge #302 first)
- 🎫 Confirm-gated cross-repo edit proposals via a web-tools-private channel (`claude/tracker-status-cjogjn`) next: done as a first cut; the four scope drafts are staged as pending proposals for the user to apply
- 🎫 Estate activity signals from a registry activity cache (`claude/branches-view-api-caching-ef4l5d`)
- 🎫 Update estate tests to the groupSections layout (`claude/viewer-button-dropdown-0h4u57`)
- 🎫 Extract drop-zone as a reusable Alpine component (`claude/tracker-summary-nu74te`)
- 🎫 Generalize the gallery to a per-repo pages catalog (`claude/web-tools-app-views-m3pkyo`) next: landed; live gallery for home needs home#314 on main (config cache reads main)
- 🎫 History-safe shim for toss-render address-mode renders next: done; hash-routing pages now switch views inside toss #gh= renders
- 🎫 Private-repo landing federation via the home registry next: closed as superseded; the goal shipped per-repo, not federated
- 🎫 Render files over 1 MB in toss-render and the shell viewers next: done — raw media type with git-blobs fallback landed in toss-render (ghText, showAddress, fetchShim) and gh-api.js get(); A/B headless test confirms the 5.9 MB DRS bundle is delivered where the old path returned blank
- 🎫 Repo-designated inbox and outbox in .web-tools.json (`claude/tracker-status-cjogjn`) next: done as a first cut; folder-vs-branch settled as a per-repo choice, both fields wired
- 🎫 Resolve a branch's session from the commit trailer, not the open PR body (`claude/active-work-branches-sd289p`)
- 🎫 Singleton fab with toss-render integration (`claude/fab-render-toss-render-ua6p3p`)
- 🎫 Speed up show-repo's cold load (`claude/speed-up-show-repo-load-3cdvl0`)
- 🎫 Fix the stage Diff lens B-select display desync (`claude/web-tools-diff-review-s0nrq7`)
- 🎫 Propagate the stage link's new grammar to the portable docs (`claude/stage-link-grammar-docs-jukn37`)
- 🎫 Stage links and the main-area explorer in show-repo (`claude/task-tracker-discussion-wg27xv`)
- 🎫 Stand up the project tracker (`claude/tracker-concept-assessment-yto1m1`)
- 🎫 Carry commentary on a stage (prompts= link field, seed of a surface schema) (`claude/web-tools-diff-review-s0nrq7`)
- 🎫 Toggle-only Tailwind classes do generate, and the spinners do spin (`claude/web-tools-tracker-review-m49yxc`)
- 🎫 Pass a trailing fragment through toss-render to the rendered page (`claude/toss-render-data-formats-4t55x7`) next: done on claude/toss-render-data-formats-4t55x7; lands via PR #288. Follow-on: have data-view consume the fragment for item selection
- 🎫 Structural response decode + differentiated errors in toss-render next: done; renders survive every media-type labeling and the error panel names the failing stage
- 🎫 toss-render ?query forwarding drops multi-param page queries (`claude/web-tools-tracker-review-bw48ga`) next: done on claude/web-tools-tracker-review-bw48ga; both fixes taken, the slice read and the documentation
- 🎫 Load the ?use= bundle by fetch + blob-import instead of jsDelivr (`claude/loading-behavior-tracker-aqbf4f`)
