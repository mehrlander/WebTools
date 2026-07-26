---
id: toggle-only-tailwind-classes-gxi5tq
title: Toggle-only Tailwind classes are never generated, so the spinners do not spin
status: backlog
track: show-repo
opened: 2026-07-26
next: Sweep for animate-spin and any other toggle-only utility, then pick a remedy
---
# Toggle-only Tailwind classes are never generated, so the spinners do not spin

A Tailwind utility that only ever reaches the DOM by being **toggled onto an
existing element** is never emitted by `@tailwindcss/browser@4`. The class lands
in `className` and computes to nothing: the browser build generates rules for
classes it finds present in the document, and flipping an attribute on a node
that is already there does not put a new class in front of it.

Confirmed on `show-repo` by inspecting the live stylesheets: `.rotate-180` and
`.animate-spin` have no rule at all, while `.truncate` (present in the initial
markup) does. It fails silently. Nothing errors, and the element simply does not
turn or spin.

PR #292 fixed the caret half of this. `crumb-bar.js`, `repo-menu.js`, and
`path-picker.js` now ship two static glyphs (`ph-caret-down` / `ph-caret-up`)
swapped with `x-show`, so both classes exist from the start; `path-picker`'s
caret had silently never turned since it was written.

**The spinners are still affected.** `:class="…configRefreshing && 'animate-spin'"`
appears in `lib/alpineComponents/estate.js` (the Repos view's Refresh) and
`lib/alpineComponents/repo.js`, and neither spins. Scope of the fix:

- Sweep for every toggle-only utility, not just `animate-spin`. Any
  `:class="cond && '<utility>'"` where the utility appears nowhere else in the
  initial markup is suspect.
- Pick a remedy. Either the always-present-element trick used for the carets, or
  a plain rule in the page's own `<style>` block for the handful of utilities
  that are genuinely only ever toggled. The second is less clever and probably
  right for animations.

Done means the refresh spinners actually spin, and the constraint is written
down somewhere a future change will hit it (it already is, in
[`docs/environment/testing.md`](../../docs/environment/testing.md)).

## Progress log
- 2026-07-26: Filed out of the PR #292 sidebar work, where the caret half was
  found and fixed. The finding and the testing lesson (assert on computed
  effect, not on the class attribute) are recorded in
  `docs/environment/testing.md`. The spinner half was left alone as outside that
  branch's scope.
