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

A treatment is a mark this project does not own, restyled to say something about how it is being shown. One so far.

### Dimmed (a toss)

A toss shows its **subject's** favicon, not its own, desaturated to `saturate(0.15)` and faded to `globalAlpha` 0.78 on a 64 px canvas, emitted as a PNG. So the tab names the page being rendered without impersonating the deployed one, and the 🥏 frisbee becomes the mark for a render with no addressable subject behind it.

**Except where there is nothing to impersonate.** A repo that serves no Pages has no deployed twin at any ref, so a private page read at its own default branch is not standing in for anything: a toss is the only way to open it at all. Those icons come through undimmed, at full colour, which is also what a bookmark of that address then keeps. Off the default branch the dimming returns and says what it always said, that this is not the canonical version. The test is `has_pages` on the REST repo object, read once per repo and cached, and an unanswered call keeps the dimming. The escape button in the drawer asks the same question of the same endpoint, for the same reason: [`lib/alpineComponents/fab.js`](../../lib/alpineComponents/fab.js), `liveTwin`.

The values were picked against real icons on a light and a dark tab strip: fading harder reads well on light and muddies on dark, where the strip is already dark, and full grayscale is unmistakable but discards the color that makes an icon recognizable at 16 px. Buy the signal in saturation, not in alpha. Dimming rather than a corner badge because a favicon is 16 CSS px, where a badge is about five pixels of mush; the silhouette is the channel that survives.

Mechanics, and the reason the output is a PNG rather than an SVG, live in the block comment above `adoptSubjectIcon` in [`pages/toss-render.html`](../../pages/toss-render.html). Whether the tab can preview a change to it is a different question, answered in `CLAUDE.md` under the preview mechanism.

## Retired

### Grid (former pages-index identity)

<img src="grid.svg" width="48" height="48" alt="2x2 card grid, one accented">

File: [`grid.svg`](grid.svg). A rounded tile holding a 2x2 grid of cards, one accented in amber: the pages index as a collection of tools. Indigo-to-sky gradient.

Served as the pages index's own favicon until we consolidated on the single hex-nut mark. Kept here as a design reference.
