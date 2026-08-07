# HTML house style (portable)

What a page built here looks like, as distinct from how it is built. The canonical
source is `mehrlander/web-tools` at `docs/HTML-STYLE.md`. The mechanics (which CDN,
which classes, the `divide-*` trap) live in the [daisy-alpine
skill](../skills/daisy-alpine/SKILL.md), which points here for composition. Local
`CLAUDE.md` rules override these defaults.

This exists because the same three corrections kept being issued by hand. A
correction that recurs is a missing standing decision, not a matter of taste to
re-litigate per page ([CONVENTIONS.md](CONVENTIONS.md#standing-decisions-write-the-answer-down-not-just-the-question)).

## The rules

**No stat cards.** A row of tiles, each a label over a big number, is the default
output of a model asked to build a dashboard, and it is nearly always wrong here.

The objection is not that the figures are uninteresting. It is that the form takes
the most valuable space on the page and the most of the reader's attention, and
returns no relationship for it. A tile isolates its number by construction: no
comparison, no baseline, no denominator, nothing it moved against. Meaning in data
lives in relationships, so a layout whose unit is the isolated figure cannot carry
it, however good the figures are.

That is what makes it an easy button. A tile row looks like analysis and demands to
be read first, while committing to nothing and comparing nothing. It is glossy and
shallow in the same gesture, which is why it is the default: it is the cheapest thing
that photographs like rigor.

The same numbers usually do communicate once arranged to show something. Four tiles
reading 62%, 35%, 75%, 0% say nothing. The same run's counts in a table with a
per-label expected against actual, and the gap between them, show a model collapsing
its categories toward the plurality label. Nothing was added but the relationship.

So: put a headline figure in the header as one compact line, or behind a control, and
give the page to the thing itself. Where figures deserve the room, give them a form
that holds a comparison. Treat any `stats`, `stat-value`, or KPI-tile grid as a
defect. This is the rule most often broken.

**No explanatory prose on the page.** Caveats, methodology, and "how to read this"
belong in the README, the PR body, or behind an info control. A page that has to
explain itself in a paragraph before the content starts is a page whose content is
not carrying its own meaning. Where a qualifier is genuinely needed, **label the
thing rather than writing about it**: a column header reading `brief only` does the
work of a sentence explaining that one model saw less input, and it stays attached to
what it qualifies when the reader scrolls.

**Browsing is a full-viewport takeover.** Anything the reader moves through, a deck,
a gallery, a diff, a result set, takes the whole screen: `fixed inset-0` with
`grid-rows-[auto_1fr_auto]`, a thin header, the content, a thin footer. Not a boxed
widget with page furniture around it. The content gets the viewport; the chrome gets
the two thin bars. A small embedded deck is readable on a desktop and useless on a
phone, which is where these get opened.

**Type is for reading, not for fitting.** Content runs at `text-xl` or larger with
`leading-8`. If content had to shrink to fit, the layout is wrong, not the type. On a
phone the test is whether it reads at arm's length.

**Content is one size.** There are two tiers on the page, not four: content, and
chrome. Everything the reader came to read gets the same size, whatever role it plays
in the layout; `text-xs` and monospace belong to counters, timestamps, and labels.
Sizing a summary below the text it summarizes ranks them for the reader, and that
ranking is nearly always an accident of how the layout was assembled rather than a
judgment anyone made.

**One accent, and it means something.** Pick a semantic colour per role and hold it
across the page, so colour carries information rather than decoration. Where two
things are compared, give each a fixed treatment and never swap them between views.

## The shape that follows

```
fixed inset-0  grid-rows-[auto_1fr_auto]
├── header   thin. identity, the compact figure line, controls, a counter pill
├── content  the thing. large type, top-aligned, scrolls when long
└── footer   thin. prev, progress, next
```

Dot indicators up to about 25 items, a progress bar past that. Keyboard arrows,
Escape, and the phone back button all work. Filters go in a header dropdown, not a
row of chips eating a line of the viewport.

**Content starts at the top.** Do not vertically centre a slide because it looks
balanced when short. Across a deck the content varies in length, so centring moves
the first line to a different height on every card and the reader re-finds it each
time. A fixed start position is what makes a deck scannable at speed.

**`min-w-0` on the scroll track, or the layout bursts.** A grid or flex item defaults
to `min-width: auto`, meaning it refuses to shrink below its content's min-content
width. A track holding 100 slides at `min-w-full` therefore claims 100 viewports,
pushes the fixed container wider than the screen, and drags the header off the right
edge with it. This is the horizontal twin of the `min-h-0` that the `1fr` row already
needs, and it fails the same way: silently, and only on a narrow screen.

**A daisyUI control does not fill its parent, and a phone is where you find
out.** `.input` and `.textarea` carry a default `width: 20rem` capped at 100%,
so in a column narrower than 20rem they look correct and in a wider one they
stop short while their label runs on. Measured at a 390px viewport: the label
342px, the field 320px, a ragged right edge down the whole form. Put `w-full`
on every input, textarea, and select rather than relying on the flex parent to
stretch it, since `align-self: stretch` does not apply to an item with an
explicit width.

**Size a form by its container, not by the viewport.** A pane that is half a
screen on desktop and the whole screen on a phone cannot be laid out with
`sm:`/`lg:`, which ask how wide the *window* is: the same `lg:grid-cols-6` that
reads well full-width puts six columns in a 360px column when the pane is split.
Put `@container` on the column and use `@md:`/`@xl:`, which ask how wide the
*column* is. The variants degrade to one column where they are unsupported,
which is the safe direction.

**Unescape before you escape.** Text pulled from XML, a scraped source, or a provider
export often already carries entities (`&apos;`, `&amp;`, `&#39;`). Escaping it again
turns the ampersand into `&amp;` and renders `teachers&apos;` on the page. Route every
data-derived string through one helper that unescapes, then escapes, so the rule is
applied once and in one place rather than remembered per interpolation.

**Verify it by measuring, not by looking.** A viewport screenshot crops whatever sits
past the frame, so horizontal overflow is invisible to the exact check most likely to
be run. Compare `documentElement.scrollWidth` against `clientWidth` at phone width,
and when listing offending elements, skip any inside a horizontally scrollable
ancestor or every carousel slide reports as a fault.

## Where the numbers went

Removing the stat cards does not mean hiding the analysis. It means the analysis is
one tap away instead of occupying the fold. A dialog behind an info control holds the
tables, the method note, and the honest limits, and the header keeps a single line
like `62/100 category · 35/100 systems · 0/100 schema`.

## What this does not cover

Colour and font as a named, reusable theme are not settled here. A daisyUI theme
block would pin the palette, and it would not fix any rule above: stat cards, page
prose, and small type are composition failures, not colour failures. Worth doing
separately, worth not conflating.
