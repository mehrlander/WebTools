---
id: toggle-only-tailwind-classes-gxi5tq
title: Toggle-only Tailwind classes do generate, and the spinners do spin
status: done
opened: 2026-07-26
closed: 2026-07-26
session: claude/web-tools-tracker-review-m49yxc
---
# Toggle-only Tailwind classes do generate, and the spinners do spin

Filed to sweep and fix every toggle-only Tailwind utility, on the premise that
`@tailwindcss/browser@4` never generates a class that reaches the DOM only by
being toggled onto an existing element. **The premise is wrong, so there was
nothing to fix.** Tailwind's browser build watches the document and emits the
rule when the class appears. A toggled utility works.

Measured on the real `show-repo` page, toggling `animate-spin rotate-180` onto a
live element:

| | `.truncate` | `.animate-spin` | `@keyframes spin` | `.rotate-180` |
|---|---|---|---|---|
| before the toggle | present | absent | absent | absent |
| after the toggle | present | present | present | present |

with `getComputedStyle(el).animationName === 'spin'` and `rotate === '180deg'`
after. Driving the actual Repos-view Refresh button (flipping
`window.__shell.configRefreshing`) adds the class and spins the icon. Confirmed
against both the vendored `@tailwindcss/browser@4.3.3` and the bytes jsDelivr
serves the deployed page, so this is not version skew.

**Why the original reading looked solid.** The observation was real: before
anything toggles, `.animate-spin` genuinely has no rule while `.truncate` does.
The rule simply has not been generated *yet*. Two measurement traps made that
look like a permanent absence, and both are easy to fall into again:
cross-origin sheets (daisyUI, Phosphor) throw on `cssRules` and contribute
nothing silently, and Tailwind nests its output in `@layer`, so a naive
`startsWith('.truncate')` scan reports absent for rules that are plainly there.

**What the real hazard is.** Not toggling, but a class name **assembled from
fragments** (`'ph-' + name`), which no text scan can see. That bites the
`bake-page` path, whose compiler scans source as text and therefore *does* keep
a literal inside `:class="open && 'rotate-180'"`. Same hazard in both builds,
and it is worth designing around; toggling is not.

PR #292's two-glyph carets stay as they are. Swapping `ph-caret-down` /
`ph-caret-up` with `x-show` is a reasonable way to build a caret and is what a
Phosphor glyph swap needs anyway, since the glyph is itself a class. It was
simply not compensating for a Tailwind limitation.

Done means the wrong constraint is off the books, which it now is:
[`docs/environment/testing.md`](../../docs/environment/testing.md) carries the
corrected entry with the evidence above.

## Progress log
- 2026-07-26: Filed out of the PR #292 sidebar work, where the caret half was
  found and fixed. The finding and the testing lesson (assert on computed
  effect, not on the class attribute) are recorded in
  `docs/environment/testing.md`. The spinner half was left alone as outside that
  branch's scope.
- 2026-07-26: Closed not-a-bug on `claude/web-tools-tracker-review-m49yxc`.
  Tried to reproduce before sweeping and could not: the spinners spin. Rewrote
  the `docs/environment/testing.md` entry, which had recorded the wrong
  constraint and would have sent future changes around a problem that does not
  exist. The assert-on-computed-effect note from the original entry is what
  survives, and is what settled it.
