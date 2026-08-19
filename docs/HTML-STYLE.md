# HTML house style (portable)

What pages built here look like, not how they are built. The canonical source is
`mehrlander/web-tools` at `docs/HTML-STYLE.md`. Mechanics live in the
[daisy-alpine skill](../skills/daisy-alpine/SKILL.md). Local `CLAUDE.md` rules
win.

These are standing decisions. If a correction recurs, write it down instead of
relitigating it per page
([CONVENTIONS.md](CONVENTIONS.md#standing-decisions-write-the-answer-down-not-just-the-question)).

## The rules

**No stat cards.** They spend the page’s best space and the reader’s first attention on numbers stripped of meaning: no comparison, baseline, denominator, or movement.

**No explanatory prose.** GitHub doesn't explain and neither should we. Use structure, labels, and controls to show relationships. A range control starting at 2015 says the data starts in 2015. Explanatory prose is unfinished work: unused ideas, loitering.

**A tooltip worth having is worth building.** A native `title` never reaches a phone and nothing in it can be opened, so do the work of a real panel: styled, tappable, carrying the list or the link the fact needs.

**Don't narrow text to a reading column.** The pattern is `max-w-*` plus `mx-auto`, usually
`max-w-2xl` through `max-w-4xl`, or `max-w-prose` at 65ch; `container mx-auto` is the same
move. What you'll usually find is that the text does not belong on the page at all: see
explanatory prose.

**Browsing takes the viewport.** Decks, galleries, diffs, and result sets use
`fixed inset-0 grid grid-rows-[auto_1fr_auto]`: thin header, content, thin footer.
The content gets the screen; chrome gets the bars. An embedded deck is small on a
desktop and useless on a phone.

**Tenants use normal flow.** Any page that may be embedded, whether an appendix, a
toss render, or a stage preview, uses `min-h-dvh`, sticky chrome, and document scrolling.
Reserve `fixed inset-0` for known top-level pages. On iOS, fixed children can
measure against the outer viewport and clip inside a narrower iframe; headless
Chromium will not reveal it.

Sticky chrome has two costs. Save and restore document scroll when a detail view
replaces a long list. Drop `viewport-fit=cover` unless the page is genuinely
edge-to-edge.

**Type is for reading, not fitting.** If type must shrink to fit, the layout is wrong.
On a phone, test it at arm’s length. Decks and documents run `text-xl` with `leading-8`;
dense working surfaces run smaller, kept honest by one size per tier rather than by a
number.

**Content has one size.** The page has two tiers: content and chrome. Everything
the reader came to read shares a size; reserve `text-xs` and monospace for labels,
counters, and timestamps. A smaller summary quietly demotes what may matter most.

**Render Markdown through the guide renderer.**
[`kits/guide-render.js`](https://github.com/mehrlander/web-tools/blob/main/lib/kits/guide-render.js)
brings its own CSS, lifts phone prose to 17px, and redirects blob links to a
renderer. First pass the source through
[`SourcePeek.fenceFrontmatter`](https://github.com/mehrlander/web-tools/blob/main/lib/kits/source-peek.js),
or `marked` turns opening metadata into the first paragraph.

Existing `prose prose-sm` surfaces may stay. For new work, prefer the guide
renderer. Do not convert working pages for symmetry.

**One accent, one meaning.** Assign colour by semantic role, not decoration. In a
comparison, lock each side’s treatment across every view.

**Opacity in tens.** `bg-success/10`, `text-base-content/60`. Steps off the tens
(`/5`, `/15`, `/45`) and the bracket form (`/[5%]`) are not generated here, and
they fail in the worst possible direction: a background falls back to
transparent and TEXT falls back to FULL strength, so a line meant to be quiet
comes out louder than the line it sits under. Nothing errors and nothing looks
broken, which is why it survives review. Measured 2026-08-19 against the app's
own stylesheet; the estate still carries about 120 of them, `branchAccent`'s
state tints among them, which have never drawn.

## The shape that follows

```text
fixed inset-0  grid-rows-[auto_1fr_auto]
├── header   identity, compact figure, controls, counter
├── content  the thing; large, top-aligned, scrollable
└── footer   previous, progress, next
```

Use dots for roughly 25 items or fewer, then a progress bar. Support arrow keys,
Escape, and the phone back button. Put filters in a header dropdown, not a chip row
that consumes the viewport.

**Start content at the top.** Vertical centring moves the first line as slide
length changes, forcing the reader to find it again. A fixed start makes a deck
scannable.

**Put `min-w-0` on the scroll track.** Flex and grid items default to
`min-width:auto`; a track of `min-w-full` slides can claim one viewport per slide
and push the header offscreen. Pair it with `min-h-0` on the `1fr` content row.

## Where the numbers went

Put supporting analysis one tap away. An info dialog can hold tables, methods, and
limits; the header keeps one compact line such as
`62/100 category · 35/100 systems · 0/100 schema`.

## What this does not cover

**Themes are separate.** A named palette and font are worth settling, but they do
not repair stat cards, page prose, or small type. Those are composition failures.
