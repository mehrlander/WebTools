---
id: proposals-diff-and-removal-w1y9lk
title: Two gaps the proposal channel showed on first use
status: backlog
project: show-repo
opened: 2026-07-28
next: the removal kind is the one with a waiting job (six inert quickLink flags); the diff pane is polish
---
# Two gaps the proposal channel showed on first use

The cross-repo proposal channel shipped 2026-07-28 (web-tools PR #302, task
cross-repo-edit-proposals-evo1ml). Using it immediately found two limits, both
small and both real.

## A proposal cannot remove anything

`set-json-field` sets a key; there is no kind that removes one, and
`put-file` cannot express a removal without knowing the rest of the file,
which is exactly what a scoped-out session does not know. The waiting job:
six repos (home, chat-histories, wa-bills, fn-data, shortcut-tools, spend-wa)
still carry an inert `quickLink: true` after the membership collapse, and no
session in this estate's usual scope can reach them to take it out.

A `unset-json-field` kind is the obvious answer, and it is the same
read-modify-write with a `delete` instead of an assignment. The review pane
already shows a before/after on one key, so it renders with no new UI. Worth
deciding whether a removal that finds nothing to remove is an error or a no-op
(a no-op reads better: the end state is what was asked for).

## The put-file pane shows two files, not a diff

A `set-json-field` row shows a real before/after, because the edit is one
key. A `put-file` row shows the current file and the proposed file side by
side and leaves the comparison to the reader, which is thin for anything
longer than a few lines.

`lib/alpineComponents/stage.js` already carries the LCS `diffLines` the
Diff lens uses (trimmed common prefix/suffix, DP over the middle, a null return
when the middle is too large to DP over). Extracting it to `lib/` and calling
it from both is the fix; the stage's own tests cover the behavior, so the
extraction is verifiable. Doing it inside PR #302 would have meant refactoring
a 1283-line component in a PR already touching it, which is why it waited.

## Progress log
- 2026-07-28: filed at wrap-up of the session that built the channel. Neither
  gap blocks the channel's first use (five proposals are staged and applicable
  as shipped); both are what the second use will want.

## An applied record does not link its commit

`apply()` stores the target commit's sha (`commit: res?.commit?.sha`), which is
the right fact, but a reader holding \`proposals/applied/<id>.json\` has to
build the GitHub URL by hand to see what actually landed. A `commitUrl`, or a
link rendered wherever applied records are read, closes the loop from intent to
bytes. Small, and it belongs with the two above.

- 2026-07-28: added from the first read-through of the channel by someone other
  than its author. The same pass found the record's vocabulary unclear (a record
  reads as though it should carry a patch, and never does) and the `why` bar too
  low; both were fixed in web-tools PR #305 and web-tools-private PR #9 rather
  than filed here, since they were documentation rather than mechanism.
