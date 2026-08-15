---
id: sidebar-compare-view-lkjang
title: Give the sidebar a compare-against ref, and collapse the card's source tabs
status: done
size: L
opened: 2026-08-14
closed: 2026-08-15
session: claude/pr-file-swiping-jgj0kc
---
# Give the sidebar a compare-against ref, and collapse the card's source tabs

The FAB owns "which version of this am I looking at". Comparison is the same
question asked twice, so it should own that too: one ref becomes two, and the
card stops carrying the choice.

**What is there now.** `fileReview` offers four source tabs, Diff, Patch, New
and Base, and they are **one comparison in four renderings**. `Base` is the
merge-base sha the host passed, `New` is the branch tip, `patch` is the
compare API's patch between exactly those two, and the CM6 diff renders the same
pair. So a reader gets four buttons and no way to ask the question they actually
have, which is "against main" or "against the previous commit on this branch".
The card is where the complexity would land if it grew, and it is the wrong
place for it: a deck slide is a reading surface, and the Map view's Docs deck
reads better than the file deck largely because a doc slide has no tab strip.

**What already exists to build on.** The file deck announces its subject on the
channel the fab adopts (`__tossSubject` plus `toss-subject`, route `deck`),
so the drawer already names the file, its ref, and the branches carrying a
different copy of it, and follows the reader from slide to slide. Shipped in
PR #411. `kits/branch-brief.js` splits the reads (`readGuide`,
`readCompare`) behind a sixty-second cache, so a second ref costs one more
cached read rather than a second architecture.

**Scope.**

1. A second ref in the drawer's Render tab: the compare-against. Default the
   merge base, offer main, the default branch, and the branches the survey
   already lists. A sibling control to the ref bar, not a new pane.
2. The card takes both refs and renders one **Compare** pane. Diff, Patch, New
   and Base collapse into it; the split/unified toggle stays. Where the two refs
   are the same there is nothing to compare, and the pane says so.
3. Step 2 of the coupling, which this needs: `__tossNavigate` from the deck, so
   choosing a ref re-renders the slide in place instead of navigating away to
   toss-render. Deliberately not built in PR #411, because what "render at ref X"
   means for a slide that is currently a diff card is a question this task
   answers.

**Decide inside the task, not before it.** Whether `New` and `Base` survive
as words. They come from the surfacing caption's `[new]`/`[main]`
vocabulary, so the two surfaces agreeing has real value, but in a tab strip
beside a left-to-right diff they read backwards (after, then before). Renaming
touches shared vocabulary; the cheap alternative is to swap the order and keep
the words.

**Done when** a reader in the file deck can choose what the file is compared
against from the sidebar, the card shows one Compare pane driven by it, and no
file's diff is computable only against the merge base.

## Progress log
- 2026-08-14: Filed from the session that built the file deck (PR #411). Step 1 of the coupling shipped there; this is steps 2 and 3. Not started in that branch on purpose: it moves vocabulary the surfacing caption also uses, and the branch was already large.
- 2026-08-15: Done on `claude/pr-file-swiping-jgj0kc`; lands via PR #411. All three scope items shipped. (1) The drawer's Render tab grew a compare bar under the ref bar: the announced merge base, any surveyed branch, or off. (2) A `read` host's strip is the file plus one Compare pane; Diff, Patch, New and Base are gone there, and the split/unified toggle stayed. (3) The deck publishes `__deckNavigate` and the fab tries it before navigating, so a ref pick rebuilds the slide in place. The open question about the words `New` and `Base` was answered by removal rather than renaming: neither appears on a reading surface, and a review list keeps both, so the surfacing caption's vocabulary is untouched. Two facts had to stop being carried when either ref moves: the API patch (only true of the merge base) and the compare's `status`/line counts/rename mapping.
