---
id: retire-shell-name-the-parts-r152bt
title: Retire `shell`, and name the parts instead of the collection
status: backlog
project: show-repo
opened: 2026-08-15
size: M
---
# Retire `shell`, and name the parts instead of the collection

`shell` names six different things in this repo. `docs/showing.md:58` uses three
of those senses in one paragraph.

| Sense | Where |
| --- | --- |
| a URL parameter, how much furniture is drawn | `?shell=full\|nav\|none` |
| the page's controller and state object | `window.__shell` |
| the application | "the hosted shell" |
| views with no standalone page behind them | "the shell's own" |
| a page's own markup and inline `x-data`, versus lib | `CLAUDE.md`'s `?use=` trap |
| a rendered document in the nesting sense | `showing.md`'s "nested shell" |

**Renaming it does not fix this**, and that is the finding worth keeping.
Every collective considered (`chrome`, `app-chrome`, `surround`) fails the same
way, because which furniture a collective covers depends on the layout:
`HTML-STYLE.md:51` means a header and a footer, `show-repo.html:319` means a
header and a sidebar, and both are already in the tree. The parts are stable
across layouts; the collection is not.

## The work

**1. Split the parameter.** `?shell=` becomes `?header=` and `?sidebar=`.
`shellMode` drives exactly two things, header visibility at
`show-repo.html:202` and the sidebar's initial state at `:4403`, so the enum
bundles two independent booleans and the doc's own table has two columns.
Three things to get right:

- `?sidebar=` means "starts open," not "exists": `full` and `nav` differ only in
  initial state and the hamburger opens it in both, so an omitted value should
  mean the per-width default.
- The two are not orthogonal. The hamburger lives in the header, so `header=0`
  leaves the FAB's Render tab as the only opener. That coupling exists today and
  the preset hid it; document it.
- `showSidebar` (has content worth showing) and `sidebarOpen` (is open) are both
  taken. The new state is `sidebarStart`, never a third `show*`.

Keep `?shell=` as an alias behind `SUNSET(2027-02-01)`, mapping the three
presets onto the pair, since links exist in PR bodies and artifacts. The FAB's
three-segment mode bar becomes two toggles.

**2. Replace the other five senses** with words already in the same sentences:
`window.__app` (the house pattern is `__<componentName>` and the body is
`x-data="app()"` at `:169`, so `__shell` is the only back-pointer not named for
its component), the application's name per docs/APP.md's split (**Web Tools**
where a reader is addressed, **show-repo** on files, routes, and internals),
**native** versus **embedded** views, **the page file** for a page's own inline
code, and **nested/top-level document** for showing.md's pair.

**3. A handful of definitional `chrome` sentences**, not a sweep of all of them.
`HTML-STYLE.md:51` and `showing.md:25`/`:58` are *defining* things and should
name their parts. Everything else stays.

**Leave `fab.js` alone.** Its `chrome` is a different concept: words inside
`BUTTON/A/LABEL/SUMMARY/OPTION/TH/NAV` versus body prose, with an enumerated tag
set at `:1664`, a derived `chromeShare`, seven assertions in
`tools/test/fab-text.test.mjs`, and a recorded design decision in
`docs/text-tools.md`. It is the counterexample: a collective noun is stable when
something enumerates its extent.

**4. The check, built from the residue.** A ban without a check does not hold
(home's `check_retired` in `tools/lint-conventions.py` is the model; this repo
has no equivalent). Both `shell` and `chrome` have legitimate English uses, so
write the pattern and its exemptions from what survives step 2, not before.

## Done when

`?header=` and `?sidebar=` are the address, `?shell=` resolves as a sunset
alias, no sense of `shell` above survives in living prose or identifiers, and a
check keeps it that way.

## Notes

Split across PRs: the parameter is self-contained and small; the prose
replacements are all judgment; `__shell` → `__app` is ~40 files and purely
mechanical. Keep the last one in its own PR, since a mechanical rename reviewed
beside a prose rewrite is how one hides in the other.

Open, and the user's call: whether the parameter values read `?header=0|1` or
`?header=off`, and whether the sidebar's responsive default is expressed by
omission or by a third value.

## Progress log
- 2026-08-16: step 2's word for the application aligned with docs/APP.md,
  which named the product Web Tools and kept show-repo for files, routes, and
  this tracker's project tag; the step's line had said "show-repo for the
  application" a day before that split existed. No build work done.
- 2026-08-15: filed from the session that shipped PR #425, where the analysis
  was done. Origin was a term-squatting problem in that PR's own writing
  (`docs/SNAGS.md`, `live-term-wider-referent`); auditing it surfaced how many
  things `shell` names. Nothing built yet.
