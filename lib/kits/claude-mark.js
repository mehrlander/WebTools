// claude-mark.js — the Claude logomark, from one path.
//
// Linking a session is a house idiom: the eleven-ray mark in #d97757, no label,
// exactly as show-repo's Activity rows draw a branch's or a record's session. A
// generic open-in-new arrow says "a link"; this says WHICH link, which is the
// whole reason the estate reaches for it.
//
// It had nowhere to come from. The same path sat inline in six places
// (estate.js three times, fab.js, branch-brief.js, pages/session.html), so
// every new consumer either pasted a seventh copy or improvised an arrow
// instead, and the swipe deck's header did exactly that. docs/SNAGS.md's
// `claude-logomark-copied` named the fix on recurrence and this is it; every
// one of those copies now reads this file.
//
// gh-boot carries it in the BOOT manifest, so it is on every loader page. That
// is not generosity: fab.js draws the mark and the FAB is itself standing
// equipment, so no page chain could have owned it. The Alpine consumers read
// it through `x-html` at render time rather than interpolating it into a
// template string, which is what keeps a BOOT entry sufficient; the reasoning
// is in the manifest entry beside it.
//
//   claudeMark.svg(o?)  -> '<svg …>'   markup, for a template literal
//   claudeMark.el(o?)   -> SVGElement  a node, for append()
//   claudeMark.PATH     -> the eleven-ray `d`
//   claudeMark.CLAY     -> '#d97757'
//
// Two shapes because the consumers are two kinds: the Alpine components build
// markup strings, and the DOM kits append nodes. One path constant serves both,
// which is the point; a second rendering would be the duplication again.
//
// Options: `cls` the svg's classes (default `w-6 h-6 shrink-0`), `color` the
// stroke (default CLAY). Pass `currentColor` for the muted rendering the
// Sessions pane uses on a record that names no session, where the mark is
// saying "this would be here" rather than offering a link.
(() => {
  const CLAY = '#d97757';

  // Eleven rays from the centre. Written out rather than generated: the angles
  // are not evenly spaced, so a loop would be a second, wrong drawing of it.
  const PATH = 'M12,12 L12.0,1.6 M12,12 L17.62,3.25 M12,12 L21.46,7.68 '
    + 'M12,12 L22.29,13.48 M12,12 L19.86,18.81 M12,12 L14.93,21.98 '
    + 'M12,12 L9.07,21.98 M12,12 L4.14,18.81 M12,12 L1.71,13.48 '
    + 'M12,12 L2.54,7.68 M12,12 L6.38,3.25';

  // `style` rather than a Tailwind class for the stroke: the colour is the
  // brand's, not the theme's, so it must not move with the palette. It reads
  // `currentColor` fine too, which is how the muted case shares one code path.
  const svg = ({ cls = 'w-6 h-6 shrink-0', color = CLAY } = {}) =>
    `<svg viewBox="0 0 24 24" class="${cls}" style="stroke:${color}" stroke-width="2.2"`
    + ` stroke-linecap="round" fill="none" aria-hidden="true"><path d="${PATH}"/></svg>`;

  // Parsed through a container so the result lands in the SVG namespace, which
  // createElement('svg') would not give.
  const el = (o) => {
    const box = document.createElement('div');
    box.innerHTML = svg(o);
    return box.firstElementChild;
  };

  window.claudeMark = { CLAY, PATH, svg, el };
})();
