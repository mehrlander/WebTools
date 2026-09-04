---
id: pr-body-open-threads-z5o66p
title: Make the PR bodies' open threads readable as one list
status: backlog
opened: 2026-08-09
size: M
---
# Make the PR bodies' open threads readable as one list

The guide PR body's **Next steps / open threads** block is already the estate's
informal backlog. SURFACING.md calls it "the heart" of the body and the wrap-up
routes leftovers there explicitly. The tracker is the formal, policed axis; this
is the unpoliced one, and it is doing more work.

| | Count |
| --- | --- |
| Tracker tasks, all time | 72 at filing; 94 on 2026-09-04 |
| Last 100 closed PRs carrying Next steps | 82 (2026-08-09) |
| Bullet items in those 82 bodies | ~185 (2026-08-09) |

Nothing collects the items and nothing can say whether one was done, dropped or
forgotten. **The point is the read side and a way to retire an item, not moving
any of this into the tracker**: the value is that filing there costs nothing.

## Scope
- **A third state in the template.** `docs/SURFACING.md`'s Next steps bullets
  become `- [ ] `, so they are GitHub task-list items, tappable on a phone. Most
  of the value, no tooling. `~~strikethrough~~` carries "turned out irrelevant,"
  which a checkbox cannot say and which reads correctly with no reader. Portable,
  so it belongs in SURFACING.md: home and chat-histories run the same form.
- **A reader kit**, `lib/kits/guide-threads.js`, folding open plus recent merged
  PRs into one list of unchecked items. Pure fold, crawl in the shell, the split
  `guide-index.js` and `repo-activity-cache.js` use; `guide-render.js` is the
  parsing precedent. Merged PRs mean pagination and caching guide-index did not.
- **A surface** in the estate view beside Lists (To-do over Jot). An open thread
  is a fourth point on that gradient of commitment.
- **Write-back** through a plain API PATCH, not the GitHub MCP, whose write path
  backtick-wraps link shapes it distrusts and would mangle unrelated prose.

## Not in scope
Triaging the existing ~185 items. Build the reader, look at the list, then decide
whether to triage or declare everything before a cutoff expired. Committing to
the triage first is how this becomes an XL.

## Done when
An unchecked thread from any repo's PR bodies appears in one list without walking
GitHub by hand, and ticking it there marks it in the body it came from.

## Progress log
- 2026-08-09: Filed from the dictation-extraction session, itself one of PR
  #377's open threads. Counts are that session's read of the last 100 closed PRs.
- 2026-09-04: Tracker side restamped, 72 to 94. The PR figures stand at their
  2026-08-09 reading; note which way the gap moved, since the repo was near
  PR #440 then and is at #581 now. The order-of-magnitude finding widened.
