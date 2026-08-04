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
output of a model asked to build a dashboard, and it is nearly always wrong here. It
spends the top of the page, the most valuable space, on figures the reader did not
ask for and cannot act on. Four tiles reading 62%, 35%, 75%, 0% tell nobody which
model is better. Put a headline figure in the header as one compact line, or behind
a control, and give the page to the thing itself. This is the rule most often broken,
so treat any `stats`, `stat-value`, or KPI-tile grid as a defect.

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

**Type is for reading, not for fitting.** Primary content runs at `text-xl` or larger
with `leading-8`, secondary at `text-base`. Reach for `text-xs` only in chrome:
counters, timestamps, monospace metadata. If content had to shrink to fit, the layout
is wrong, not the type. On a phone the test is whether it reads at arm's length.

**One accent, and it means something.** Pick a semantic colour per role and hold it
across the page, so colour carries information rather than decoration. Where two
things are compared, give each a fixed treatment and never swap them between views.

## The shape that follows

```
fixed inset-0  grid-rows-[auto_1fr_auto]
├── header   thin. identity, the compact figure line, controls, a counter pill
├── content  the thing. large type, vertically centred when short, scrolls when long
└── footer   thin. prev, progress, next
```

Dot indicators up to about 25 items, a progress bar past that. Keyboard arrows,
Escape, and the phone back button all work. Filters go in a header dropdown, not a
row of chips eating a line of the viewport.

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
