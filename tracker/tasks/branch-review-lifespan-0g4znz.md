---
id: branch-review-lifespan-0g4znz
title: Show the branch lifespan in the per-repo branch review too
status: done
project: show-repo
opened: 2026-07-26
closed: 2026-07-31
session: claude/project-pages-docs-udzi51
---
# Show the branch lifespan in the per-repo branch review too

The estate's Open view now states each branch's lifespan, first commit then latest, as `15 days → 2 hours` (PR #298). The per-repo branch review renders the same surveyed rows and still shows the tip age alone.

## Why

The data is already there. `BranchStatus.surveyBranchLive` returns `firstDate` for every surveyed branch, and the branch review is one of its two callers, so the field arrives in `older[]` whether the view reads it live or from the activity cache. What is missing is the render: `lib/alpineComponents/branches.js` prints `r.ago` in the row's right-hand cell.

The gap matters more here than in the Open view. The branch review's whole subject is older branches, where "last touched 4 months ago" says nothing about whether the branch represents a week of work or one commit.

## Definition of done

- The Landed / Stranded tables show the span where it is known, in the Open view's form and with its collapse rules: drop the start when it rounds to the tip's label, and when it is `''` (no merge base, or a compare past GitHub's 250-commit cap).
- The Recent tab is date-only and never surveyed, so it has no start to show. Leave it alone.
- Reuse the Open view's helpers rather than restating the formatting. They currently live on the estate component (`branchStart` / `branchSpanTitle`); moving them somewhere both components can reach is part of the work.

## Notes

Small and self-contained. The one judgment call is the table cell: the review is a dense table where the Open view is a card list, so the span may want to be two columns rather than one arrow-joined string.

## Progress log
- 2026-07-26 filed at PR #298 wrap-up, from the follow-on the lifespan work exposed
- 2026-07-31 done on `claude/project-pages-docs-udzi51`; lands via PR #331. The
  collapse rules moved to lib/branch-status.js (lifespanStart / lifespanTitle),
  the estate delegates to them, and the review's Age cell states the span in
  the Open view's one-cell arrow form (the two-column alternative was not
  needed at the table's density). The cached render carries firstDate through
  applyCachedSurvey, so cache-first rows state the same span a live survey
  would; Recent stays date-only as scoped.
