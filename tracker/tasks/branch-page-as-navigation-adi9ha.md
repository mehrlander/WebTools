---
id: branch-page-as-navigation-adi9ha
title: Make the branch page a navigation target, swipeable from the lists
status: done
project: show-repo
opened: 2026-07-26
closed: 2026-07-31
session: claude/project-pages-docs-udzi51
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

There is a further fork inside the first answer, and the user leans toward the second half of it: whether the standalone page survives as the shareable single-branch form, or whether show-repo simply absorbs it and the standalone page goes away. Absorption is the cleaner end state and should be the default unless a reason to keep both turns up.

## What this does to the surfacing convention

Worth stating because it is most of the appeal. Today 🌿 has to be a 🥏 toss, because `pages/branch.html` is a page with no deployed URL until PR #297 merges, and even after it merges the address is a bare `#gh=` with nothing around it. A reader has to be told what they are looking at.

Once the branch view lives in show-repo it is a deployed page with a real URL, so the 🌿 link becomes an ⭐-class canonical reference: no toss, no token-gated fetch of the page shell, no fragment to explain. The shell also supplies the framing that makes it self-explanatory, which the standalone page cannot do on its own.

So the surfacing payoff is not cosmetic. It moves the branch link from the private-safe fallback channel into the ordinary one, and at that point the tossed form documented in `docs/SURFACING.md` under 🌿 can be dropped rather than carried as a caveat.

## Definition of done

- Every Open-view row opens the branch page rather than exiting to GitHub, keeping the GitHub menu as a secondary.
- From an opened branch, left/right moves through the list that opened it.
- The same for a list of open PRs.
- The host question above is decided and written down, since it determines the address form.
- The 🌿 entry in `docs/SURFACING.md` is updated to the resulting address, and its tossed fallback removed if the view is deployed.

## Notes

Not urgent. The page is useful today by URL, and this is what makes it feel like part of the shell rather than a detour. Do it after the page has been used enough to know which facts belong above the fold.

## Progress log
- 2026-07-26 filed from the session that built the page (PR #297); the swipe framing and the toss-versus-navigation question are the user's
- 2026-07-26 added the surfacing consequence (🥏 becomes ⭐, the caveat can be dropped) and the absorb-versus-keep-both fork, after the standalone 🌿 link 404ed on an un-deployed page and made the cost of the current form concrete
- 2026-07-31 closed. The branch-detail takeover delivered the substance on main
  (c98ac78 through d82c3ec): Open rows open the branch in-app, swipe moves
  through the list that opened it (the Open list is the open-PR list), and the
  host question is decided and written down in docs/show-repo.md ("Branch
  detail: the takeover"): the sequence lives in the shell, branch.html survives
  as the shareable single-branch form and the embedded renderer. The one
  outstanding bullet, the SURFACING.md 🌿 entry, lands via PR #331: canonical
  branch.html address, ?view=activity named as the browsing route, the tossed
  fallback retired.
