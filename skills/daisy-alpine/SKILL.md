---
name: daisy-alpine
description: The binding house style for every HTML page built here: what a page looks like, not how it is built. This is the HTML style guide, the page style guide, the house rules for what a page looks like. Read it BEFORE laying out any page and BEFORE any general design, dashboard, or charting skill, which recommend what these rules forbid: no stat cards, no KPI tiles, no explanatory prose on the page, browsing takes the full viewport, type sized for reading. Use when creating or reviewing an HTML page, artifact, single-file web app, dashboard, interactive prototype, web UI component, or browser tool; when asked why a page looks wrong or how pages here should look; and whenever the user mentions the style guide, house style, page layout, or stat cards. The DaisyUI 5 / Tailwind CSS 4 / Alpine.js mechanics for building it, including component syntax, tooltips, CDN loading and the traps that compile to nothing, are in references/mechanics.md beside this file.
---

# HTML house style

What pages built here look like. How to build them, meaning the DaisyUI,
Tailwind and Alpine mechanics, is
[`references/mechanics.md`](references/mechanics.md) beside this file. The names
this is asked for, and why a doc has to carry the words a stranger would search,
are at
[`docs/HTML-STYLE.md`](https://github.com/mehrlander/web-tools/blob/main/docs/HTML-STYLE.md).

These are standing decisions. If a correction recurs, write it down instead of
relitigating it per page
([CONVENTIONS.md](https://github.com/mehrlander/web-tools/blob/main/docs/CONVENTIONS.md#standing-decisions-write-the-answer-down-not-just-the-question)).
**They override any general design, dashboard, or charting skill, including a
bundled one.** That is not a courtesy note: on 2026-08-29 a session loaded the
bundled `dataviz` skill, whose form heuristic offers "a stat tile or hero number"
as a legitimate answer, and shipped a page of stat cards while this file sat
unloaded. A general skill recommending what rule 1 forbids is the expected case,
not a conflict to weigh. Load the local rule first.

## The rules

**1. No stat cards.** A row of tiles, each a label over a big number, is the
default output of a model asked to build a dashboard and is nearly always wrong.
It spends the page's best space and the reader's first attention on numbers
stripped of meaning: no comparison, baseline, denominator, or movement. That is
what makes it the easy button, glossy and shallow in one gesture, the cheapest
thing that photographs like rigor. Put a headline figure in the header as one
compact line or behind a control, and where figures deserve room give them a
form that holds a comparison. Treat any `stats`, `stat-value`, or KPI-tile grid
as a defect.

**2. No explanatory prose.** GitHub doesn't explain and neither should we. Use
structure, labels, and controls to show relationships: a range control starting
at 2015 says the data starts in 2015. Explanatory prose is unfinished work, and
the fix is usually to improve structural clarity so the text can be removed.

**3. Don't narrow text to a reading column.** `max-w-prose`, `max-w-2xl`,
`max-w-3xl`, `max-w-4xl`, `container mx-auto`, and a `prose` class run without
`!max-w-none`, which is Tailwind's own 65ch cap wearing another name. The bang
is required: typography ships unlayered CSS and Tailwind's utilities are
layered, so the plain `max-w-none` loses whatever the source order. `mx-auto`
is not part of the test: half these caps carry no centering. The page's own
layout sets the width. A reading column is also a common tell for rule 2.
Refused at edit time by the `reading-column` hook and listed by `npm run
reading-column`; `modal-box` sizing is exempt, and a genuine exception takes a
`reading-column-ok` comment on the line or the line above.

**4. Browsing takes the viewport.** A deck, gallery, diff, or result set uses
`fixed inset-0 grid grid-rows-[auto_1fr_auto]`: thin header, content, thin
footer. The content gets the screen and chrome gets the bars. An embedded deck
is small on a desktop and useless on a phone.

**5. A tenant page uses normal flow.** Any page another page may embed, whether
an appendix, a toss render, or a stage preview, takes the same shape without the
fixed root: `min-h-dvh` plus sticky chrome over document scrolling. Reserve
`fixed inset-0` for known top-level pages. On iOS a fixed child measures against
the outer viewport and its right-hand column is cut off inside a narrower
iframe, and headless Chromium will not reveal it. Sticky chrome has two costs:
save and restore document scroll when a detail view replaces a long list, and
drop `viewport-fit=cover` unless the page is genuinely edge-to-edge.

**6. Type is for reading, not for fitting.** If type shrank to fit, the layout is
wrong, not the type. On a phone, test it at arm's length. Decks and documents run
`text-xl`+ with `leading-8`; dense working surfaces run smaller, kept honest by
one size per tier rather than by a number.

**7. Content has one size.** The page has two tiers, content and chrome.
Everything the reader came to read shares a size; `text-xs` and monospace belong
to labels, counters, and timestamps. A smaller summary quietly demotes what may
matter most.

**8. A short text block balances its lines.** One or two sentences left to wrap
break wherever the column ends, and the last line is routinely two words: a lede,
a caption, or a heading reads as broken text before it reads as a sentence. Put
`text-balance` on any block short enough to be read at a glance and `text-pretty`
on running copy, which fixes the widow without evening out lines that should stay
full.

**9. Content starts at the top.** Never vertically centre a slide because it
looks balanced when short; across a deck it moves the first line on every card,
forcing the reader to find it again.

**10. One accent, and it means something.** Colour carries information, not
decoration. Assign it by semantic role, and in a comparison lock each side's
treatment across every view. Where two concerns compete for the accent, let a
control pick which one is marked rather than spending a second colour.

**11. A tooltip worth having is worth building.** Prefer text on the page. A
`title` never carries a fact: it reaches no touch screen, renders outside the
page's theme, and cannot be captured in a screenshot, so a fact parked in one is
invisible to every review that happens through pixels. Every other popup is a
**note** or a **card**, and the whole rule, the criterion that separates them,
what each opens and closes on, and the ✕, is stated once in
[`references/mechanics.md`, "Notes and cards"](references/mechanics.md#notes-and-cards).
In one line: a note is one line the page already implies (a header unwrapped, a
unit spelled out), closes on its own tap, and is written as `data-note="…"`
through [`kits/note.js`](https://github.com/mehrlander/web-tools/blob/main/lib/kits/note.js);
anything that scrolls, can be tapped inside, or whose source a reader might ask
for is a card, which names that source with a ↗ and carries its ✕. Do not use `cursor-help`, daisyUI's `tooltip`, or `data-tip`; this overrides
`references/daisyui.md`. `npm run stranded-titles` lists facts parked in a
`title`; `Note.open('#id')` opens a note on demand for a shot.

## The shape a browsing page takes

```text
fixed inset-0  grid-rows-[auto_1fr_auto]
├── header   identity, compact figure, controls, counter
├── content  the thing; large, top-aligned, scrollable
└── footer   previous, progress, next
```

Use dots for roughly 25 items or fewer, then a progress bar. Support arrow keys,
Escape, and the phone back button. Put filters in a header dropdown, not a chip
row that consumes the viewport.

## Where the numbers went

Put supporting analysis one tap away. An info dialog can hold tables, methods,
and limits; the header keeps one compact line such as
`62/100 category · 35/100 systems · 0/100 schema`.

## What this does not cover

**Themes are separate.** A named palette and font are worth settling, but they do
not repair stat cards, page prose, or small type. Those are composition failures.

**Mechanics are separate**, and they are the other half of building a page here:
[`references/mechanics.md`](references/mechanics.md) for the stack, the CDN
pattern, and the class-level traps that compile to nothing;
`references/daisyui.md` and `references/alpine-v3.md` for component and
directive syntax.
