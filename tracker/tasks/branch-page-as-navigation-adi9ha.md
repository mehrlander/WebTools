---
id: branch-page-as-navigation-adi9ha
title: Make the branch page a navigation target, swipeable from the lists
status: backlog
project: show-repo
opened: 2026-07-26
---
# Make the branch page a navigation target, swipeable from the lists

`pages/branch.html` (PR #297) gives one branch a page. It is currently reached only by URL. The lists that should lead to it still do not, and the page has no notion of its neighbours.

## Why

Three branch lists exist (the estate's Open view, the per-repo Branches view, the FAB's render tab) and every row still exits to github.com. The page was built to be their destination; nothing routes to it yet.

Beyond routing, the shape worth having is **swipe**: from a list, open one branch and move left/right through the rest of that list without going back. The list supplies the sequence, the page renders the member. The same applies to open PRs, which is the other list worth traversing this way.

## The design question this forces

If the page is reached by navigation from a list, and can move through that list, it is not really a toss at all. A toss renders a page that has no URL of its own; this one has both a URL and a place in a sequence. That suggests the endpoint is a **show-repo view** (`?view=branch&ref=…`, with the list already in hand) rather than a standalone page addressed by `#gh=`, with the standalone page kept as the shareable single-branch form.

Settle that before building. The two answers differ in where the sequence lives:
- **show-repo view**: the shell already holds the activity cache, so the sequence is free and swipe is cheap. The cost is that a link into it carries more shell.
- **standalone page**: the address must carry the sequence, or the page must re-fetch a list to know its neighbours.

## Definition of done

- Every Open-view row opens the branch page rather than exiting to GitHub, keeping the GitHub menu as a secondary.
- From an opened branch, left/right moves through the list that opened it.
- The same for a list of open PRs.
- The host question above is decided and written down, since it determines the address form.

## Notes

Not urgent. The page is useful today by URL, and this is what makes it feel like part of the shell rather than a detour. Do it after the page has been used enough to know which facts belong above the fold.

## Progress log
- 2026-07-26 filed from the session that built the page (PR #297); the swipe framing and the toss-versus-navigation question are the user's
