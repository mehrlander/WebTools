# Favicon archive

The project's icon work in one place: the marks it ships, and the ones it has retired. New favicon designs live here so the history stays visible and nothing gets lost the next time we iterate.

## Active

### Hex nut (project mark)

<img src="../../lib/favicon.svg" width="48" height="48" alt="slot-split hex nut">

Canonical file: [`lib/favicon.svg`](../../lib/favicon.svg). A slot-split hex nut: a hexagon (modular; its left/right points read as `<` `>`) with a round bore, split down the middle to pop the angle brackets. Blue-600.

This is the library-wide mark. `lib/gh-boot.js` inlines a copy and injects it as the default favicon on any loader page that declares no icon of its own, and the [pages index](../../pages/index.html) points its `<link rel="icon">` and header logo here too.

### Per-page emoji marks

Eleven pages carry their own emoji favicon, written inline as a `data:image/svg+xml` URI holding a single `<text>` glyph: 🌿 branch, 📊 data-view, 🔖 links, 🧪 console-playground, 💎 shorter, 🔍 review and pdf-inspect, ✍️ word-select, 🐈‍⬛ compression-helper, 🥏 toss-render. A page that declares none inherits the hex nut from `gh-boot.js`, so the estate needs no per-page icon file and no registry.

## Treatments

### Dimmed (a toss)

[`pages/toss-render.html`](../../pages/toss-render.html) shows the **subject's** favicon rather than its own, redrawn desaturated and faded, so the tab says which page is open without impersonating the deployed one. The frisbee survives as the fallback and gains a meaning: no addressable subject behind this render.

Address mode renders same-origin, so the shell reads the icon the frame actually resolved (`link[rel~=icon]`, by attribute) rather than reconstructing what it ought to be; that picks up `gh-boot`'s runtime injection and any page that sets its icon late. A repo-relative href is fetched through the token at the same ref, which is the only way a private repo's icon file is reachable. A `#gz=` payload gets the same treatment when its icon is self-contained, since a payload renders under an opaque origin and only the shell's copy of the HTML is readable.

Values are `saturate(0.15)` at `globalAlpha` 0.78, drawn to a 64 px canvas and emitted as a PNG data URI. They were picked against real icons on a light and a dark tab strip: fading harder reads well on light and muddies on dark, and full grayscale is unmistakable but discards the color that makes an icon recognizable at 16 px. Buy the signal in saturation, not in alpha. Canvas rather than an SVG `<image>` wrapper, because SVG favicons render under a restricted mode whose handling of nested images is not worth depending on.

Chrome keys its favicon cache by **icon** URL, and a data URI is its own content, so every subject gets a distinct entry and none can go stale. History and bookmarks key on the **page** URL, which is identical for every toss (the address rides in the fragment), so those surfaces keep whichever icon was recorded last. Not fixable from the page.

## Retired

### Grid (former pages-index identity)

<img src="grid.svg" width="48" height="48" alt="2x2 card grid, one accented">

File: [`grid.svg`](grid.svg). A rounded tile holding a 2x2 grid of cards, one accented in amber: the pages index as a collection of tools. Indigo-to-sky gradient.

Served as the pages index's own favicon until we consolidated on the single hex-nut mark. Kept here as a design reference.
