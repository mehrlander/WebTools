---
name: daisy-alpine
description: Building HTML artifacts and web UI components using DaisyUI 5, Tailwind CSS 4, and Alpine.js. Use when creating single-file web applications, dashboards, interactive prototypes, or browser-based tools. Covers DaisyUI component syntax, Alpine.js V3 patterns, and key migration notes from Alpine V2.
---

# DaisyUI + Alpine.js Reference

Component reference and patterns for building browser-based UI with DaisyUI 5 (Tailwind CSS 4) and Alpine.js.

## House style: read this before laying out a page

This file covers **how to build**. These cover **what to build**, and they are not
preferences to weigh. Each one is here because the same correction kept being issued
by hand. Full statement and reasoning: `docs/HTML-STYLE.md` in `mehrlander/web-tools`.

1. **No stat cards.** A row of tiles, each a label over a big number, is the default
   output of a model asked to build a dashboard and is nearly always wrong. It takes
   the top of the page and the reader's attention and returns no relationship for it:
   a tile isolates its number by construction, with no comparison, baseline, or
   denominator, and meaning in data lives in relationships. That is what makes it an
   easy button, glossy and shallow in one gesture, the cheapest thing that photographs
   like rigor. Put a headline figure in the header as one compact line or behind a
   control, and where figures deserve room give them a form that holds a comparison.
   Treat any `stats`, `stat-value`, or KPI-tile grid as a defect.
2. **No explanatory prose.** GitHub doesn't explain and neither should we. Use structure,
   labels, and controls to show relationships: a range control starting at 2015 says the
   data starts in 2015. Explanatory prose is unfinished work: unused ideas, loitering.
   Its tell is text narrowed to a reading column (`max-w-*` plus `mx-auto`, `max-w-prose`,
   `container mx-auto`); what you will usually find is that the text does not belong on
   the page at all.
3. **Browsing is a full-viewport takeover.** A deck, gallery, diff, or result set is
   `fixed inset-0` with `grid-rows-[auto_1fr_auto]`: thin header, content, thin
   footer. Not a boxed widget with page furniture around it. **A page another
   page may embed takes the same shape without the fixed root:** `min-h-dvh`
   plus `sticky top-0`/`sticky bottom-0` chrome over normal flow, because a
   fixed root inside an iframe measures against the outer viewport on Safari and
   its right-hand column is cut off in any host narrower than the window.
4. **Type is for reading, not for fitting.** If type shrank to fit, the layout is wrong,
   not the type. Decks and documents run `text-xl`+ with `leading-8`; dense working
   surfaces run smaller. Two tiers only, content and chrome: everything the reader came
   to read gets the same size, and `text-xs` belongs to counters, timestamps, and labels.
5. **Content starts at the top.** Never vertically centre a slide because it looks
   balanced when short; across a deck it moves the first line on every card.
6. **One accent, and it means something.** Colour carries information, not decoration.
   In a comparison, each side keeps a fixed treatment across every view.

## References

- **DaisyUI 5 components**: See `references/daisyui.md` for complete component syntax, class names, and usage rules
- **Alpine.js V3 patterns**: See `references/alpine-v3.md` for V3 API and key differences from V2
- **Reactivity cost in long lists**: See `references/reactivity-cost.md` for the per-row binding pattern that scales badly with N, the direct-DOM fix, and the DOM-reuse gotcha
- **Full demo**: See `references/demo-sortable.html` for a complete working example demonstrating CDN usage, DaisyUI components, Alpine.js patterns, Phosphor Icons, and third-party library integration

## Key Conventions

1. Use CDN delivery (jsDelivr for Tailwind/DaisyUI/libraries, unpkg for Alpine): no build step
2. Single-file artifacts: inline styles and scripts
3. DaisyUI semantic colors (`primary`, `base-100`, etc.) over Tailwind color names
4. Alpine's `x-data`, `x-show`, `x-bind` for reactivity: no React
5. Use Phosphor Icons via CDN for iconography: no inline SVGs
6. No `<style>` blocks: no vanilla CSS, no `<style type="text/tailwindcss">`, no `@apply`. Generally, avoid all efforts to override styles in third-party components.
7. A daisyUI semantic colour works only in the utility families daisyUI itself ships. `bg-base-200`, `text-base-content`, and `border-base-300` resolve; `divide-base-200` does not, because daisyUI ships no `divide-*` and Tailwind has no `base-200` in its own colour theme, so the utility compiles to nothing and is dropped silently. Tailwind v4 then defaults `border-color` to `currentColor` (v3 defaulted to `gray-200`), so `divide-y` alone paints hairlines in the **text colour**: black lines where a faint grey was intended. The same trap waits in `ring-*`, `outline-*`, and `accent-*`. Separate rows with `gap`, or write the border explicitly (`[&>*+*]:border-t [&>*+*]:border-base-200`). A Tailwind palette name (`divide-slate-300`) also works and is the tell: if swapping the colour name fixes it, the semantic name was never compiling. Inside an `x-for`, reach for the index rather than the adjacency selector; see 8.
8. **Structural selectors are wrong inside an `x-for`, including the adjacency fix above.** Alpine inserts each clone *after* the `<template>` rather than replacing it, so the template stays in the DOM and occupies the parent's first child slot. Measured with jsdom against the real runtime, three rows in a bare parent:

   ```
   children: template,span,span,span
   :first-child matches a clone?  false      (the template is :first-child)
   :last-child  matches a clone?  true       (only while nothing follows the loop)
   :scope > * + * hits:           span,span,span
   ```

   So `first:` matches nothing at all, `last:` matches only when the loop is the last thing in its parent (add a footer under it and that silently stops too), and `[&>*+*]:border-t` puts a border on **every** row including the first, because the first clone's preceding sibling is the template. All three compile and all three are real CSS, so nothing warns; the rule just lands on the wrong element or on none.

   Take the position from the loop, which is the one source that knows it: `x-for="(row, i) in rows"` then `:class="{ 'border-t border-base-200': i }"`. Or separate with `gap` on a flex/grid parent, which is ordinal-free. Reserve `first:`/`last:`/`[&>*+*]:` for static markup.

9. **A daisyUI control does not fill its parent, and a phone is where you find out.** `.input` and `.textarea` compute to `width: clamp(3rem, 20rem, 100%)`, so in a column narrower than 20rem they look correct and in a wider one they stop short while their label runs on. Measured at a 390px viewport: the label 342px, the field 320px, a ragged right edge down the whole form. Put `w-full` on every input, textarea, and select rather than relying on the flex parent to stretch it, since `align-self: stretch` does not apply to an item with an explicit width.

10. **Size a pane by its container, not by the viewport.** A pane that is half a screen on desktop and the whole screen on a phone cannot be laid out with `sm:`/`lg:`, which ask how wide the *window* is: the same `lg:grid-cols-6` that reads well full-width puts six columns in a 360px column when the pane is split. Put `@container` on the column and use `@md:`/`@xl:`, which ask how wide the *column* is. The variants degrade to one column where they are unsupported, which is the safe direction.

11. **Tailwind v4 layers its utilities; the typography stylesheet is unlayered, and unlayered wins.** `.prose{max-width:65ch}` therefore beats `.max-w-none` on the cascade-layer rule rather than on specificity, and nothing in the class list looks wrong. Reach for `!max-w-none`, or keep the 65ch measure on purpose and centre the column. Prefer `lib/kits/guide-render.js` for anything new, which brings its own CSS and sidesteps this; do not convert a working surface just for symmetry.

## CDN Patterns

Use jsDelivr `combine` to bundle multiple packages in a single request. Tailwind, DaisyUI, icons, and any other libraries go through jsDelivr. Alpine goes through unpkg; when plugins join, a jsDelivr combine keeps them one tag with core last.

### Scripts (jsDelivr combine)
```html
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web,npm/clipboard"></script>
```

### Styles (jsDelivr combine)
```html
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet" />
```

### Alpine + plugins (jsDelivr combine, defer)
```html
<script defer src="https://cdn.jsdelivr.net/combine/npm/@alpinejs/collapse/dist/cdn.min.js,npm/@alpinejs/sort/dist/cdn.min.js,npm/alpinejs/dist/cdn.min.js"></script>
```

Alpine core must load last when combining with plugins. Use `defer` so Alpine initializes after the DOM is ready.

### Phosphor Icons

Use `<i class="ph ph-icon-name">` for regular weight, `ph-bold`, `ph-fill`, etc. for variants. Avoids inline SVGs entirely.
```html
<i class="ph ph-caret-down"></i>
<i class="ph ph-file-text"></i>
<i class="ph ph-check"></i>
```
