// card.js — the CARD of the house popup rule: the ✕ and the ways out.
// The rule itself, and where a note ends and a card begins, is stated once, in
// daisy-alpine/references/mechanics.md ("Notes and cards"). This file
// implements the card's dismissal contract and does not restate the rule.
//
// ── What it owns, and what it deliberately does not ────────────────────────
//
// It owns THE WAY OUT, which is the half that was written five times and got
// written differently each time. It does not own position, size, content, or
// the open state: a card that follows the cursor over a chart and a card
// anchored beside a sidebar row are the same rule and different geometry, and
// a kit that owned the geometry would serve one of them and be forked for the
// other. Same split as dock-split.js, which owns the gesture and not the
// layout.
//
//   Card.closeHTML(pinned)          // the ✕, or '' where none should show
//   Card.wire(el, { onClose, except })  -> { detach() }
//   Card.coarse()                   // no hover available on this screen
//
// Named beside Note, since the two are the halves of one rule. A caller
// renders `closeHTML(pinned)` into its own panel and calls `wire` once, on the
// element:
//
//   popEl.innerHTML = Card.closeHTML(isPinned) + body;
//   const w = Card.wire(popEl, { onClose: unpin, except: ['[data-info-btn]'] });
//
// ── Why the ✕ shows when it does ───────────────────────────────────────────
//
// `closeHTML` renders the button when the card is PINNED, or on any screen
// with no hover. The second half is the one that keeps being missed, and it is
// not a nicety: a touch synthesizes the hover that opens a card and never
// sends the leave that would close it, so on a phone a hover-opened card is
// pinned in all but name and has no way out at all. Measured 2026-09-06 on
// budget-drs's Funding view, where the card had a ✕ in its pinned state and
// none in the state a phone could actually reach.
//
// Tap-outside is a courtesy, never the route. It fires here too, and it lets
// the tap through to whatever was under it, which is correct and is exactly
// why it cannot be the only way out: on a dense page every point outside the
// card is a control, so dismissing means finding somewhere safe to press and
// guessing whether it is.
//
// ── The check, which exists because the silent failure is invisible ────────
//
// A card shell that is `pointer-events: none` unless pinned renders a ✕ that
// cannot be tapped: it is drawn, it looks right, and the tap goes through it
// to the page. `wire` measures the element on a coarse pointer and reports it
// once, naming the element. Found the same day in the lineage graph's shell,
// which schema shares, one commit after the ✕ was added to both.
(() => {
  const CSS = `
/* A ghost: no border, no fill, muted, tucked into the corner. It is a way out,
   not a control the card is about. A bordered button reads as an action the
   card offers, which is what the first draft looked like and why this is a
   rule rather than a preference. */
.wt-card-close{position:absolute;top:6px;right:6px;width:26px;height:26px;
  display:flex;align-items:center;justify-content:center;
  border:0;background:none;border-radius:6px;padding:0;
  font-size:13px;line-height:1;cursor:pointer;
  color:color-mix(in srgb,currentColor 45%,transparent)}
.wt-card-close:hover,.wt-card-close:active{
  background:var(--color-base-200,#eef1f4);color:inherit}
.wt-card-close:focus-visible{outline:2px solid var(--color-primary,#4f8ef7);
  outline-offset:1px}
`;

  function ensureCSS() {
    if (document.getElementById('wt-card-css')) return;
    const st = document.createElement('style');
    st.id = 'wt-card-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // No hover on this screen. `hover: none` rather than a width test: what
  // decides this is whether the reader can hover at all, and a narrow desktop
  // window can hover while a wide tablet cannot.
  const coarse = () => !!(window.matchMedia && window.matchMedia('(hover: none)').matches);

  // The ✕, or nothing. Pass the card's own pinned state; on a coarse pointer
  // the answer is yes either way, since a hover-opened card there is pinned in
  // all but name (see the header).
  function closeHTML(pinned) {
    if (!pinned && !coarse()) return '';
    ensureCSS();
    return '<button type="button" class="wt-card-close" data-wt-card-close '
      + 'aria-label="Close" title="Close">✕</button>';
  }

  const warned = new WeakSet();

  // Every way out, wired once on the card element. Returns { detach } so a
  // view that rebuilds its card can drop the old listeners.
  //
  //   onClose   called by the ✕, by Escape, and by a press outside
  //   except    selectors a press inside must NOT be read as "outside": the
  //             control that toggles this card owns its own toggle, and
  //             without this the press closes the card and the toggle
  //             immediately reopens it, or the reverse.
  function wire(el, { onClose, except = [] } = {}) {
    if (!el || typeof onClose !== 'function') return { detach() {} };

    // The ✕ is inside the element, which a view re-renders, so this is
    // delegated rather than bound to the button.
    const onClick = (ev) => {
      if (!ev.target.closest || !ev.target.closest('[data-wt-card-close]')) return;
      ev.stopPropagation();
      onClose();
    };
    el.addEventListener('click', onClick);

    // Capture phase, because a press often lands on a control whose own
    // handler stops propagation, and a bubble-phase listener never sees the
    // press that is meant to dismiss. The press is NOT swallowed: what was
    // pressed still acts, which is what makes this a courtesy rather than the
    // route out.
    const onDown = (ev) => {
      if (!ev.target.closest) return;
      if (el.contains(ev.target)) return;
      for (const sel of except) if (ev.target.closest(sel)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);

    const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    // A ✕ that cannot be pressed. The shell, not this kit, owns
    // `pointer-events`, so all this can do is say so: measured on the element
    // the caller passed, once, naming it.
    if (coarse() && !warned.has(el)) {
      const pe = getComputedStyle(el).pointerEvents;
      if (pe === 'none') {
        warned.add(el);
        console.warn('[card] this card is pointer-events:none on a screen with no hover, '
          + 'so its ✕ is drawn and cannot be pressed; the shell needs '
          + '`@media (hover:none){ .<shell>.show{pointer-events:auto} }` '
          + '(daisy-alpine mechanics.md, "Notes and cards")', el);
      }
    }

    return {
      detach() {
        el.removeEventListener('click', onClick);
        document.removeEventListener('pointerdown', onDown, true);
        document.removeEventListener('keydown', onKey);
      },
    };
  }

  window.Card = { closeHTML, wire, coarse, CSS };
})();
