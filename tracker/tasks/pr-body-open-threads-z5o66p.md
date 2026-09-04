---
id: pr-body-open-threads-z5o66p
title: Make the PR bodies' open threads readable as one list
status: backlog
opened: 2026-08-09
size: M
---
# Make the PR bodies' open threads readable as one list

The guide PR body's **Next steps / open threads** block is already the estate's
informal backlog, and the convention says so: SURFACING.md calls it "the heart"
of the body, and the wrap-up sequence routes leftovers there explicitly ("a next
step the branch will not reach either rides forward in the guide body or becomes
a task"). The tracker is the formal, policed axis; this is the unpoliced one, and
it is doing more work.

Measured on web-tools, 2026-08-09:

| | Count |
| --- | --- |
| Tracker tasks, all time | 72 (16 backlog, 56 done); 94 on 2026-09-04 |
| Last 100 closed PRs carrying Next steps | 82 |
| Bullet items in those 82 bodies | ~185 |

So the informal ledger is an order of magnitude larger than the formal one and
has no read surface at all. Nothing collects the items, and nothing can say
whether one was done, dropped, or forgotten. The point of the task is the read
side and a way to retire an item, NOT to move any of this into the tracker: the
whole value is that filing there costs nothing and clutters nothing.

## Scope

- **A third state in the template.** Change the template's Next steps bullets in
  `docs/SURFACING.md` from `- ` to `- [ ] `, so they are GitHub task-list items.
  This alone is most of the value and needs no tooling: checkboxes in a PR body
  are tappable on a phone. `~~strikethrough~~` carries "turned out irrelevant,"
  which a checkbox cannot say and which reads correctly with no reader.
- **A reader kit,** `lib/kits/guide-threads.js`, folding open PRs plus recent
  merged ones into one list of unchecked items. Pure fold, crawl in the shell,
  the split `kits/guide-index.js` and `kits/repo-activity-cache.js` already use;
  `kits/guide-render.js` already parses a guide body and is the parsing
  precedent. Cross-repo, like guide-index. The corpus is merged PRs rather than
  open ones, so it needs pagination and caching that guide-index did not.
- **A surface** in show-repo's estate view, beside Lists (To-do over Jot). An
  open thread is a fourth point on that gradient of commitment, and the pane is
  where the other two already live.
- **Write-back** for ticking an item from that surface. Through a plain API
  PATCH, not the GitHub MCP: SURFACING.md records that the MCP write path
  backtick-wraps link shapes it distrusts, so round-tripping a whole body risks
  mangling prose unrelated to the checkbox.

The template change is portable and belongs in `docs/SURFACING.md`, not in
web-tools' `CLAUDE.md`: home and chat-histories run the same guide-PR form and
would carry the same ledger.

## Not in scope

Triaging the existing ~185 items. Build the reader, look at the list, then
decide whether to triage or declare everything before a cutoff date expired.
Committing to the triage before seeing the corpus is how this becomes an XL.

## Done when

An unchecked open thread from any repo's PR bodies appears in one list without
walking GitHub by hand, and ticking it there marks it in the body it came from.

## Progress log
- 2026-08-09: Filed from a session working on the dictation extraction, which is
  itself one of PR #377's open threads and the observation that started this. The
  counts above are from that session's read of the last 100 closed PRs.
- 2026-09-04: The formal side restamped, 72 tasks to 94 (24 backlog, 70 done).
  The PR-body figures are still the 2026-08-09 reading, and are not restamped
  because re-measuring means walking 100 bodies. Note which way the gap has
  moved: the repo was near PR #440 when this was filed and is at #581 now, so
  the informal ledger grew by roughly 140 PRs while the formal one grew by 22.
  The order-of-magnitude finding this task rests on has widened, not closed.
