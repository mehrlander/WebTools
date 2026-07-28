---
name: daisy-alpine
description: Building HTML artifacts and web UI components using DaisyUI 5, Tailwind CSS 4, and Alpine.js. Use when creating single-file web applications, dashboards, interactive prototypes, or browser-based tools. Covers DaisyUI component syntax, Alpine.js V3 patterns, and key migration notes from Alpine V2.
---

# DaisyUI + Alpine.js Reference

Component reference and patterns for building browser-based UI with DaisyUI 5 (Tailwind CSS 4) and Alpine.js.

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
7. A daisyUI semantic colour works only in the utility families daisyUI itself ships. `bg-base-200`, `text-base-content`, and `border-base-300` resolve; `divide-base-200` does not, because daisyUI ships no `divide-*` and Tailwind has no `base-200` in its own colour theme, so the utility compiles to nothing and is dropped silently. Tailwind v4 then defaults `border-color` to `currentColor` (v3 defaulted to `gray-200`), so `divide-y` alone paints hairlines in the **text colour**: black lines where a faint grey was intended. The same trap waits in `ring-*`, `outline-*`, and `accent-*`. Separate rows with `gap`, or write the border explicitly (`[&>*+*]:border-t [&>*+*]:border-base-200`). A Tailwind palette name (`divide-slate-300`) also works and is the tell: if swapping the colour name fixes it, the semantic name was never compiling.

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
