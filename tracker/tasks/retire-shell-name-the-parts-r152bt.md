---
id: retire-shell-name-the-parts-r152bt
title: Retire `shell`, and name the parts instead of the collection
status: backlog
project: show-repo
opened: 2026-08-15
size: M
---
# Retire `shell`, and name the parts instead of the collection

`shell` names six different things here, three of them inside one paragraph of
`docs/showing.md`.

| Sense | Where |
| --- | --- |
| a URL parameter, how much furniture is drawn | `?shell=full\|nav\|none` |
| the page's controller and state object | `window.__shell` |
| the application | "the hosted shell" |
| views with no standalone page behind them | "the shell's own" |
| a page's own markup and inline `x-data`, versus lib | `CLAUDE.md`'s `?use=` trap |
| a rendered document in the nesting sense | `showing.md`'s "nested shell" |

**Renaming it does not fix this**, which is the finding worth keeping. Every
collective considered (`chrome`, `app-chrome`, `surround`) fails the same way,
because which furniture a collective covers depends on the layout: daisy-alpine's
"content gets the screen and chrome gets the bars" means a header and a footer,
while the app's header-plus-sidebar block means something else, and both are in
the tree. The parts are stable across layouts; the collection is not.

The counterexample proves the rule. **Leave `fab.js` alone**: its `chrome` means
words inside `BUTTON/A/LABEL/SUMMARY/OPTION/TH/NAV` versus body prose, with an
enumerated tag set, a derived `chromeShare`, seven assertions in
`tools/test/fab-text.test.mjs` and a recorded decision in `docs/text-tools.md`.
A collective noun is stable when something enumerates its extent.

## The work

**1. Split the parameter.** `?shell=` becomes `?header=` and `?sidebar=`.
`shellMode` drives exactly two things in `app/index.html`, header visibility and
the sidebar's initial state, so the enum bundles two independent booleans. Three
things to get right:

- `?sidebar=` means "starts open," not "exists": `full` and `nav` differ only in
  initial state and the hamburger opens it in both, so an omitted value means the
  per-width default.
- They are not orthogonal. The hamburger lives in the header, so `header=0`
  leaves the FAB's Render tab as the only opener. The coupling exists today and
  the preset hid it; document it.
- `showSidebar` and `sidebarOpen` are both taken. The new state is
  `sidebarStart`, never a third `show*`.

Keep `?shell=` as an alias behind `SUNSET(2027-02-01)`, since links exist in PR
bodies and artifacts. The FAB's three-segment bar becomes two toggles.

**2. Replace the other five senses** with words already in the same sentences:
`window.__app` (the house pattern is `__<componentName>` and the body is
`x-data="app()"`, so `__shell` is the only back-pointer not named for its
component); the application's name per `docs/APP.md`'s split; **native** versus
**embedded** views; **the page file**; and **nested/top-level document**.

**3. A handful of definitional `chrome` sentences**, not a sweep. The defining
uses are `skills/daisy-alpine/SKILL.md` rules 5 and 7 and `docs/showing.md`'s
nesting section.

**4. A check, written from the residue.** A ban without one does not hold (home's
`check_retired` in `tools/lint-conventions.py` is the model; this repo has no
equivalent). Both words have legitimate English uses, so write the pattern and
its exemptions from what survives step 2, not before.

## Done when
`?header=` and `?sidebar=` are the address, `?shell=` resolves as a sunset alias,
no sense above survives in living prose or identifiers, and a check holds it.

## Notes
Three PRs: the parameter is small and self-contained, the prose replacements are
judgment, and `__shell` → `__app` is ~40 files and purely mechanical. Keep the
last alone, since a mechanical rename reviewed beside a prose rewrite is how one
hides in the other.

**The user's call:** `?header=0|1` or `?header=off`, and whether the sidebar's
responsive default is expressed by omission or a third value.

## Progress log
- 2026-08-15: Filed from PR #425, where the analysis was done. Origin was a
  term-squatting problem in that PR's own writing (`live-term-wider-referent` in
  SNAGS.md).
- 2026-08-16: Step 2's word for the application aligned with `docs/APP.md`.
- 2026-09-04: Every line number in this task had rotted and
  `pages/show-repo.html` does not exist; the app is `app/index.html` and
  `docs/HTML-STYLE.md` is a pointer since 2026-08-31. References are by content
  now. Verified still true: `?shell=` and `shellMode` live in `app/index.html`,
  `chrome` still definitional in the skill. Body cut from 885 words.
