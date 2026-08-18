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

**No explanatory prose.** Gmail doesn't explain and neither should we. Use structure, labels, and controls to show relationships. A choice documents scope implicitly. A tooltip can define.

**Browsing takes the viewport.** Decks, galleries, diffs, and result sets use
`fixed inset-0 grid grid-rows-[auto_1fr_auto]`: thin header, content, thin footer.
The content gets the screen; chrome gets the bars. An embedded deck is small on a
desktop and useless on a phone.

**Tenants use normal flow.** Any page that may be embedded—an appendix, toss
render, or stage preview—uses `min-h-dvh`, sticky chrome, and document scrolling.
Reserve `fixed inset-0` for known top-level pages. On iOS, fixed children can
measure against the outer viewport and clip inside a narrower iframe; headless
Chromium will not reveal it.

Sticky chrome has two costs. Save and restore document scroll when a detail view
replaces a long list. Drop `viewport-fit=cover` unless the page is genuinely
edge-to-edge.

**Type is for reading, not fitting.** Use `text-xl` or larger with `leading-8`.
If the type must shrink, the layout is wrong. On a phone, test it at arm’s length.

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
renderer. Tailwind v4 puts utilities in a layer, so unlayered
`.prose{max-width:65ch}` beats `.max-w-none`; use `!max-w-none` or keep the 65ch
measure deliberately. Do not convert working pages for symmetry.

**One accent, one meaning.** Assign colour by semantic role, not decoration. In a
comparison, lock each side’s treatment across every view.

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

**Controls get `w-full`.** DaisyUI inputs and textareas default to `width:20rem`
capped at 100%, so they stop short in wider columns. Put `w-full` on every input,
textarea, and select; flex stretch does not override an explicit width.

**Size forms to their container.** Viewport breakpoints can put six columns inside
a 360px split pane. Mark the pane `@container` and use `@md:` and `@xl:`. Without
container-query support, one column is the safe failure.

**Unescape, then escape.** Source text may already contain entities. Escaping it
again prints `teachers&apos;`. Route every data-derived string through one helper
that decodes first and escapes once.

**Measure overflow.** Screenshots hide whatever falls beyond the viewport. At phone
width, compare `documentElement.scrollWidth` with `clientWidth`. Ignore elements
inside a horizontally scrollable ancestor, or every carousel slide becomes a false
alarm.

## Where the numbers went

Put supporting analysis one tap away. An info dialog can hold tables, methods, and
limits; the header keeps one compact line such as
`62/100 category · 35/100 systems · 0/100 schema`.

## What this does not cover

**Themes are separate.** A named palette and font are worth settling, but they do
not repair stat cards, page prose, or small type. Those are composition failures.
