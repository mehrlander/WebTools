---
id: retire-shell-name-the-parts-r152bt
title: Retire `shell`, and name the parts instead of the collection
status: backlog
project: show-repo
opened: 2026-08-15
size: M
---
# Retire `shell`, and name the parts instead of the collection

`shell` names six different things in this repo, three of them inside one
paragraph of `docs/showing.md` (the one on what a nested preview cannot reach).

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
the daisy-alpine skill's "content gets the screen and chrome gets the bars"
means a header and a footer, while the app's header-plus-sidebar block means
something else, and both are already in the tree. The parts are stable
across layouts; the collection is not.

## The work

**1. Split the parameter.** `?shell=` becomes `?header=` and `?sidebar=`.
`shellMode` drives exactly two things in `app/index.html`, header visibility
(`x-show="shellMode !== 'none'"`) and the sidebar's initial state, so the enum
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
the body is `x-data="app()"`, so `__shell` is the only back-pointer not named
for its component), the application's name per docs/APP.md's split (**Web Tools**
where a reader is addressed, **show-repo** on files, routes, and internals),
**native** versus **embedded** views, **the page file** for a page's own inline
code, and **nested/top-level document** for showing.md's pair.

**3. A handful of definitional `chrome` sentences**, not a sweep of all of them.
The defining uses are in `skills/daisy-alpine/SKILL.md` (rules 5 and 7, "the
page has two tiers, content and chrome") and in `docs/showing.md`'s nesting
section. Those should name their parts; everything else stays.

**Leave `fab.js` alone.** Its `chrome` is a different concept: words inside
`BUTTON/A/LABEL/SUMMARY/OPTION/TH/NAV` versus body prose, with an enumerated tag
set, a derived `chromeShare`, seven assertions in
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
- 2026-09-04: Addresses repaired in a refinement pass; the finding is unchanged.
  Every line number in this task had rotted, and `pages/show-repo.html` does not
  exist at all: the app is `app/index.html`, and `docs/HTML-STYLE.md` became a
  32-line pointer on 2026-08-31 when the rules moved into
  `skills/daisy-alpine/SKILL.md`. References are now by content rather than by
  line, since this task will outlive any line number it cites. Verified still
  true: `?shell=` and `shellMode` are live in `app/index.html`, and `chrome` is
  still used definitionally in the skill.
