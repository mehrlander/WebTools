// dock-split.js — the drag handle between two panes.
//
// Framework-free and DOM-only, the same shape as swipe-deck.js and
// chat-render.js, loaded via gh.load. It owns the GESTURE and nothing else:
// the caller places the handle, decides what the number means, and applies it.
// That split is not tidiness. A splitter in a CSS grid moves a track; the one
// between show-repo's docked deck and the list behind it moves a custom
// property that a `fixed` overlay and a `padding-right` both read. A kit that
// owned the layout could serve one of those and would have to be forked for the
// other, which is how the estate ends up with two splitters again.
//
//   dockSplit.attach(handle, {
//     axis: 'col',                       // 'col' vertical seam | 'row' horizontal
//     bounds: () => el.getBoundingClientRect(),   // what the percentage is OF
//     from: 'end',                       // measure the pane at the right/bottom
//     value: () => pct,                  // the current split, 0..100
//     onChange: pct => { … },            // during the drag, rAF-throttled
//     onCommit: pct => { … },            // once, on release
//     min: 20, max: 80, step: 2,   // min/max also take () => pct
//   }) -> { destroy(), refresh() }
//
// ── Where this came from, and the one thing it adds ────────────────────────
//
// Ported from the splitter in home's budget-drs app (app/view/app.html), which
// is the implementation this estate actually likes, and it was welded into one
// private page: CSS in a style block, the drag in an Alpine method. Copying it
// a second time was the obvious move and the wrong one, since a private-to-
// private copy is what home's own commit discipline rules out; the hub is where
// a shared component goes, and budget-drs adopts it from here.
//
// Every hard-won detail travels: the divider is a LINE with a pill handle and a
// hit area far larger than either, the drag classes go on the document so the
// cursor and the selection survive the pointer leaving a 6px track, pointer
// capture sits in a try/catch because it throws on an id the browser no longer
// considers active and an unguarded throw there attaches no listeners at all,
// the listeners go on `window` since captured events still bubble, and the
// readout sits ~96px off the seam so a thumb does not cover the number it is
// there to show.
//
// The one thing that did NOT travel is the gap: the original carries
// `role="separator"` and `aria-orientation` with no `tabindex` and no key
// handler, so it promises a keyboard affordance to a screen reader and delivers
// none. Arrows, PageUp/PageDown and Home/End move it here, and `aria-valuenow`
// reports where it is.
(() => {
  const CSS = `
.dk-split{position:relative;touch-action:none;
  display:flex;align-items:center;justify-content:center;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  --dk-line:var(--color-base-300)}
.dk-split.is-col{cursor:col-resize;background:linear-gradient(to right,transparent calc(50% - .5px),
  var(--dk-line) calc(50% - .5px),var(--dk-line) calc(50% + .5px),transparent calc(50% + .5px))}
.dk-split.is-row{cursor:row-resize;background:linear-gradient(to bottom,transparent calc(50% - .5px),
  var(--dk-line) calc(50% - .5px),var(--dk-line) calc(50% + .5px),transparent calc(50% + .5px))}
.dk-split:hover,.dk-split:focus-visible{--dk-line:var(--color-primary)}
.dk-split:hover::before,.dk-split:focus-visible::before{border-color:var(--color-primary)}
.dk-split:focus-visible{outline:none}
/* The grip. A hairline is not something a finger believes it can take hold of,
   so the line carries a pill at its middle: small, rounded, and the only part
   that looks like a physical control. It grows while dragging.
   base-100 fill so the line does not show through it, and a shadow so it sits ON
   the rule rather than reading as a thickening OF it. Its border is base-content
   at 22% rather than the line's own base-300, and that is not a preference: a 1px
   base-300 capsule on a base-300 rule is invisible, and the handle is the whole
   reason the rule is allowed to be 1px. The first port of this kit used
   var(--dk-line) for the border and lost the grip at rest, which is the one
   defect a screenshot of a mid-drag state cannot show. */
.dk-split::before{content:"";border-radius:999px;
  background:var(--color-base-100);
  border:1px solid color-mix(in srgb,var(--color-base-content) 22%,transparent);
  box-shadow:0 1px 3px rgb(15 23 42 / .14);
  transition:border-color .12s,background-color .12s,width .12s,height .12s}
.dk-split.is-col::before{width:8px;height:40px}
.dk-split.is-row::before{height:8px;width:40px}
/* The hit area, which is the difference between a control and a target you
   miss. Bigger than the track in the axis that matters, and invisible. */
.dk-split::after{content:"";position:absolute;top:0;left:0;right:0;bottom:0}
.dk-split.is-col::after{left:-15px;right:-15px}
.dk-split.is-row::after{top:-15px;bottom:-15px}
.dk-split.is-dragging{--dk-line:var(--color-primary);z-index:30}
.dk-split.is-dragging::before{background:var(--color-primary);border-color:var(--color-primary)}
.dk-split.is-col.is-dragging::before{width:8px;height:60px}
.dk-split.is-row.is-dragging::before{height:8px;width:60px}
/* The readout floats out of the track over the panes, which is why the handle
   raises its z-index while dragging. A pill with a lifted shadow, matching the
   grip it belongs to, rather than a plain rounded box. */
.dk-readout{position:absolute;pointer-events:none;white-space:nowrap;
  font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;
  padding:2px 7px;border-radius:999px;
  background:var(--color-primary);color:var(--color-primary-content);
  box-shadow:0 6px 18px -4px rgb(15 23 42 / .45);
  opacity:0;transition:opacity .1s}
.dk-split.is-dragging .dk-readout{opacity:1}
.dk-split.is-col .dk-readout{left:50%;transform:translateX(-50%);top:calc(50% - 96px)}
.dk-split.is-row .dk-readout{top:50%;transform:translateY(-50%);left:calc(50% - 108px)}
/* Centred on the seam is right when the seam sits in a pane that does not clip.
   The deck's does: its overlay is overflow-hidden, so a centred badge loses its
   outer half and reads as a rendering fault rather than a number. The 'after'
   placement puts it wholly inside the pane the handle belongs to. (No backticks
   in here: this comment lives INSIDE a template literal, and a stray pair ends
   the string and turns the rest of the stylesheet into JavaScript. Cost one
   screenshot that came back with no seam and a syntax error in the log.) */
.dk-split.is-col .dk-readout.at-after{left:10px;transform:none}
.dk-split.is-row .dk-readout.at-after{top:10px;transform:none;left:calc(50% - 108px)}
/* Document-wide while a drag is live: the pointer routinely leaves the track,
   and without these it flickers back to a text caret and starts selecting the
   page it is dragging over. */
html.dk-dragging *{user-select:none !important;-webkit-user-select:none !important}
html.dk-dragging-col *{cursor:col-resize !important}
html.dk-dragging-row *{cursor:row-resize !important}
`;

  let styled = false;
  function ensureCss() {
    if (styled || document.getElementById('dk-split-css')) { styled = true; return; }
    const el = document.createElement('style');
    el.id = 'dk-split-css';
    el.textContent = CSS;
    document.head.appendChild(el);
    styled = true;
  }

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function attach(handle, o = {}) {
    if (!handle) throw new Error('dock-split: no handle');
    ensureCss();
    const axis = o.axis === 'row' ? 'row' : 'col';
    const vert = axis === 'col';
    // min and max take a number, or a function returning one, and a function
    // is what a caller needs whenever the stop is a PIXEL fact. 300px is 31% of
    // a 980px pane and 16% of a 1920px one, so no fixed percentage expresses it,
    // and the two callers with measured pixel floors (budget-drs' Funding view
    // and its submittal reader) had to open these wide and clamp again inside
    // onChange. That worked and cost two things: aria-valuemin and aria-valuemax
    // then reported stops the handle never honoured, and each caller needed a
    // refresh() to correct a readout this kit had already painted from a value
    // the layout refused. Read on every clamp, so a stop that moves with the
    // container is followed rather than frozen at attach.
    const bound = (v, dflt) => {
      const f = typeof v === 'function' ? v : () => v;
      return () => { const n = Number(f()); return Number.isFinite(n) ? n : dflt; };
    };
    const minOf = bound(o.min, 20), maxOf = bound(o.max, 80);
    const step = Number.isFinite(o.step) ? o.step : 2;
    const from = o.from === 'start' ? 'start' : 'end';
    const read = () => clamp(Number(o.value ? o.value() : 50) || 0, minOf(), maxOf());

    handle.classList.add('dk-split', vert ? 'is-col' : 'is-row');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', vert ? 'vertical' : 'horizontal');
    if (!handle.hasAttribute('tabindex')) handle.setAttribute('tabindex', '0');
    if (o.label && !handle.getAttribute('aria-label')) handle.setAttribute('aria-label', o.label);

    const readout = document.createElement('span');
    readout.className = 'dk-readout' + (o.readout === 'after' ? ' at-after' : '');
    handle.appendChild(readout);

    // aria-valuemin and aria-valuemax are stamped here rather than once at
    // attach, because a function bound moves with the container. show() runs at
    // attach and on every apply, so the three values are always one reading.
    const show = (pct) => {
      readout.textContent = Math.round(pct) + '%';
      handle.setAttribute('aria-valuenow', String(Math.round(pct)));
      handle.setAttribute('aria-valuemin', String(Math.round(minOf())));
      handle.setAttribute('aria-valuemax', String(Math.round(maxOf())));
    };
    show(read());

    // One rAF per frame at most, shared by the pointer and the keys. The
    // synthetic resize is what makes a child that measured itself once (a
    // table, a chart, a virtualised list) re-measure: nothing else tells it the
    // pane moved, because no window dimension changed.
    let raf = 0;
    const apply = (pct) => {
      show(pct);
      o.onChange?.(pct);
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        window.dispatchEvent(new Event('resize'));
      });
    };

    function onPointerDown(ev) {
      if (ev.button != null && ev.button !== 0) return;
      // Capture is an optimisation, not the mechanism: it keeps a fast drag
      // that outruns the cursor on the handle. It throws on a pointer id the
      // browser does not consider active, and an unguarded throw here aborts
      // before a single listener is attached, so the splitter silently does not
      // drag. The listeners go on window regardless, since captured events
      // still bubble there and one path then serves both.
      try { handle.setPointerCapture(ev.pointerId); } catch {}
      ev.preventDefault();
      handle.classList.add('is-dragging');
      document.documentElement.classList.add('dk-dragging', vert ? 'dk-dragging-col' : 'dk-dragging-row');
      let last = read();
      const move = (e) => {
        const r = o.bounds ? o.bounds() : document.documentElement.getBoundingClientRect();
        const span = vert ? r.width : r.height;
        if (!span) return;
        const away = vert
          ? (from === 'end' ? r.right - e.clientX : e.clientX - r.left)
          : (from === 'end' ? r.bottom - e.clientY : e.clientY - r.top);
        last = clamp(Math.round(away / span * 100), minOf(), maxOf());
        apply(last);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        handle.classList.remove('is-dragging');
        document.documentElement.classList.remove('dk-dragging', 'dk-dragging-col', 'dk-dragging-row');
        o.onCommit?.(last);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    // The half the original never had. `role="separator"` with no key handler
    // announces a control to a screen reader and then ignores it; a pointer is
    // also simply the wrong instrument for the last two percent.
    function onKeyDown(ev) {
      const grow = from === 'end' ? -1 : 1;   // which arrow makes this pane bigger
      let next = null;
      const k = ev.key;
      if (k === (vert ? 'ArrowLeft' : 'ArrowUp')) next = read() - step * grow;
      else if (k === (vert ? 'ArrowRight' : 'ArrowDown')) next = read() + step * grow;
      else if (k === 'PageUp') next = read() - step * 5 * grow;
      else if (k === 'PageDown') next = read() + step * 5 * grow;
      else if (k === 'Home') next = from === 'end' ? maxOf() : minOf();
      else if (k === 'End') next = from === 'end' ? minOf() : maxOf();
      if (next == null) return;
      ev.preventDefault();
      const pct = clamp(Math.round(next), minOf(), maxOf());
      apply(pct);
      o.onCommit?.(pct);
    }

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('keydown', onKeyDown);
    // A touch that begins on the handle must not also scroll the page under it.
    // `touch-action:none` covers the pointer path; this covers the compatibility
    // events, which preventDefault on a touch event suppresses separately.
    const swallow = (e) => e.preventDefault();
    handle.addEventListener('touchstart', swallow, { passive: false });
    handle.addEventListener('touchmove', swallow, { passive: false });

    return {
      refresh(){ show(read()); },
      destroy(){
        handle.removeEventListener('pointerdown', onPointerDown);
        handle.removeEventListener('keydown', onKeyDown);
        handle.removeEventListener('touchstart', swallow);
        handle.removeEventListener('touchmove', swallow);
        readout.remove();
        handle.classList.remove('dk-split', 'is-col', 'is-row', 'is-dragging');
      },
    };
  }

  window.dockSplit = { attach, CSS };
})();
