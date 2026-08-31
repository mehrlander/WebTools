# DaisyUI, Tailwind and Alpine mechanics

How a page here is built. What it should look like is the house style in
[`SKILL.md`](SKILL.md) beside this file; that one is binding and this one is the
means. Every rule below is here because it compiles, renders, or silently does
nothing in a way nobody would guess from reading the class list.

## Rules that look like taste and are not

**A theme colour takes opacity in tens, 10 through 90.** `bg-success/10`,
`text-base-content/60`. Anything else on a daisyUI theme colour generates no
rule: `/0`, `/100`, every step off the tens, and the bracket form (`/[5%]`).
Stock palette colours are unaffected and take any step, so `bg-red-500/33` is
fine. The reason to care is the direction of the failure, not the tidiness: a
background falls back to transparent and TEXT falls back to FULL strength, so a
line meant to be quiet comes out louder than the line above it. Nothing errors,
which is why it survives review. Enforced by `npm run opacity-scan`
(`scripts/dead-opacity.py`), gated in `tools/test/dead-opacity.test.mjs`, which
also carries the measurement.

**A Phosphor class names an icon or renders nothing at all.** The class resolves
to a `:before` rule keyed by name, so a name the font does not carry leaves a
zero-width blank: no console error, no fallback glyph. Weights are font
FAMILIES, so the pair is `{weight} ph-{name}` and never `ph-play-fill`; and a
plausible name from another icon family (Octicons' `git-compare`, Font Awesome's
`arrow-down-to-bracket`) is not a Phosphor name. Enforced by `npm run icon-scan`
(`scripts/blank-icons.py`), gated in `tools/test/blank-icons.test.mjs`.

**A bound boolean attribute takes `!!`.** `:disabled="!!row.busy"`, never
`:disabled="row.busy"`. Alpine's `x-bind` coerces an undefined result to `''`
whenever the expression contains a dot, and `bind()` removes an attribute only
for `null`, `undefined` and `false`, so `''` takes the other branch and WRITES
it. A property that is simply absent therefore disables the button, freezes the
input, or checks the box, and the author is looking at a field that is plainly
not true. Only a bare fetch is exposed: `!row.busy` and `row.busy === true`
already yield a real boolean and need nothing. Two shipped controls were dead
this way before anyone found the cause (PR #469), both with passing suites,
because a test that calls a method on the component cannot see an attribute the
template put on a button. Enforced by `npm run bool-attr-scan`
(`scripts/bound-boolean-attrs.py`), gated in
`tools/test/bound-boolean-attrs.test.mjs`.

**A bound attribute holding a constant does not need binding.** `:title="'a
kind\'s units'"` escapes the apostrophe for the template literal, so the
attribute reaches Alpine as an unterminated string and the whole expression
throws on every load. A constant is a plain `title=`.

**Put `min-w-0` on the scroll track.** Flex and grid items default to
`min-width:auto`; a track of `min-w-full` slides can claim one viewport per slide
and push the header offscreen. Pair it with `min-h-0` on the `1fr` content row.
The same default is why `truncate` on a flex child never shrinks it, and why an
implicit grid column, which sizes to max-content, makes every `min-w-0` beneath
it inert until the column is capped with `grid-cols-[minmax(0,1fr)]`.

**An `x-for` template inside `<svg>` draws nothing.** Alpine clones a
`<template>` into the HTML namespace, so `<path>` parses as an unknown HTML
element. Build the markup as a string and assign it through `x-html` on a
wrapping `<div>`, which lets the parser switch namespace.

**An `<input type=range>` is clamped by the browser at creation.** One built
while its `:max` is still a placeholder has its DOM value clamped, and `x-model`
writes the clamp back, so the thumb and the readout part company for the life of
the page. Create it with `x-if` once the real bounds are in hand.

**Render Markdown through the guide renderer.**
[`kits/guide-render.js`](https://github.com/mehrlander/web-tools/blob/main/lib/kits/guide-render.js)
brings its own CSS, lifts phone prose to 17px, and redirects blob links to a
renderer. First pass the source through
[`SourcePeek.fenceFrontmatter`](https://github.com/mehrlander/web-tools/blob/main/lib/kits/source-peek.js),
or `marked` turns opening metadata into the first paragraph. Existing `prose
prose-sm` surfaces may stay; prefer the guide renderer for new work, and do not
convert working pages for symmetry.

## A compliant tooltip

The house style forbids `cursor-help`, daisyUI's `tooltip`, and `data-tip`, and
requires that a custom one work on every screen size. Enable hover only when
`(hover: hover) and (pointer: fine)` match: open after about 140 ms and close
about 220 ms after leaving both the control and the tooltip. Tapping the control
must toggle it using its actual visibility, not a separate state flag, so the two
cannot fall out of step. Dismiss on Escape or a capture-phase `pointerdown`
outside the control and tooltip; `@click.outside` alone is not enough, because a
handler that stops propagation strands the panel open. A `pointer-events-none`
panel cannot be entered, which collapses "leaving both" to leaving the control.

## References

- **DaisyUI 5 components**: See `daisyui.md` for complete component syntax, class names, and usage rules
- **Alpine.js V3 patterns**: See `alpine-v3.md` for V3 API and key differences from V2
- **Reactivity cost in long lists**: See `reactivity-cost.md` for the per-row binding pattern that scales badly with N, the direct-DOM fix, and the DOM-reuse gotcha
- **Full demo**: See `demo-sortable.html` for a complete working example demonstrating CDN usage, DaisyUI components, Alpine.js patterns, Phosphor Icons, and third-party library integration

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
