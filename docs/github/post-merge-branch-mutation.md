# Post-Merge Branch Mutation

A developer merges a feature branch into main. Later they return to the original
branch and add commits, amend history, rebase, or force-push.

The work has already been integrated. The merge already exists in the target
branch. But editing continues on the source branch anyway.

It's a small action with persistent effects.

## Why It Creates Problems

A merge commit records the specific commits that were integrated at that moment.
Once created, that record becomes part of the ancestry of the target branch.

The merge commit remains accurate. The problem is that the source branch name no
longer means what people think it means. It once pointed to the reviewed and
merged work. After post-merge edits, it points to something else.

The results are predictable:

- The branch no longer accurately identifies the work that was reviewed and
  merged.
- Other developers holding the prior version of the branch now carry divergent
  history.
- Force-pushes introduce warnings and require reconciliation across clones.
- Pull requests, compare views, CI records, and review history become harder to
  interpret.
- Tools that rely on stable history, such as bisect and blame, become less
  reliable when history is rewritten.
- New work branched from the old tip can produce unexpected duplication or
  conflicts.

Adding commits to a merged branch creates ambiguity. Rewriting or force-pushing
it creates coordination cost.

More broadly, the practice weakens the boundary that a merge is meant to
establish. It treats integration as provisional rather than as a transfer of
work into shared, reviewed state. Over repeated instances, this erodes clarity
about what each merge actually delivered.

## Terminology

The pattern has acquired several names that make its character visible:

- **Necromerging:** Resuming work on a branch after it has already been merged.
- **Zombie branch:** A branch that was merged yet continues to receive commits,
  creating an undead parallel history.
- **Frankenbranch:** A branch extended with new commits after its original
  changes were already incorporated.
- **Ancestral vandalism:** Rewriting commits that are already ancestors of a
  shared branch.
- **Merge-termath:** The secondary confusion generated when a merged branch is
  later altered.
- **Long-lived feature branch syndrome:** The tendency to keep branches mutable
  long after their intended work has been delivered.

These terms function as shorthand. They allow the cost of the pattern to be
named quickly in discussion.

## The Bottom Line

A merged branch should stop being treated as live workspace.

The merge commit remains a faithful record of what entered the target branch,
but the source branch name becomes misleading if new work continues there. The
team now has two meanings for one label: the reviewed work that was integrated,
and the later work that happened afterward.

Teams that treat a merge as a point of closure tend to maintain clearer
histories and fewer ambiguous branches. The alternative is a slow accumulation
of branches that are neither fully alive nor properly dead.

## Rule of Thumb

**Merged means closed.**

Once a branch has been merged into a shared target branch, do not keep working
on it. Delete it, retire it, or leave it untouched.

Follow-up work gets a new branch from the current tip of the target branch. Then
open a new pull request.

A branch is a workbench, not a second home.

---

In this repo, this is the "why" behind the surfacing course's rule that
post-merge edits need a new PR ([SURFACING.md](../SURFACING.md)): when a session
continues editing after a merge (Option 2), the follow-up commits go out as a
*new* PR from the branch rather than reopening the merged one.
