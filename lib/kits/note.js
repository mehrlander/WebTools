// note.js — the small tooltip: `data-note="…"` in place of `title="…"`.
//
// Framework-free, DOM-only, one delegated listener set, the same shape as
// dock-split.js and swipe-deck.js. Load it and every `[data-note]` on the page
// works, including elements written later by innerHTML, because nothing is
// attached per element.
//
//   <span data-note="Fetched from the repo when opened.">EXTERNAL</span>
//
//   Note.open(elOrSelector)   // for a screenshot, or to point at something
//   Note.close()
//   Note.text(el)             // the note string, or null
//
// ── Why this exists, given the house style already rules on tooltips ────────
//
// The style guide had two tiers and a gap between them. `title` is sanctioned
// for "simple, nonessential labels"; anything carrying a real fact has to be a
// built panel. Most notes are neither: a sentence explaining what a label means
// is too small to earn a panel and too load-bearing to strand in a `title`.
// Written as a `title` it then fails four ways at once, and quietly, because on
// the desktop where the page was built it looks fine:
//
//   1. No touch screen shows it at all.
//   2. A screenshot cannot capture it, so it is invisible to every review that
//      happens through pixels — which here is most of them.
//   3. It renders after the browser's own delay, in the browser's own styling,
//      outside the page's theme.
//   4. `scripts/stranded-titles.py` has to guess whether the fact is reachable,
//      because the attribute says nothing about intent.
//
// This kit is the missing middle tier, and the line between it and a panel is
// not a judgment call about size: **the panel here is `pointer-events:none` and
// therefore cannot be entered.** A note is a string a reader looks at. The
// moment its content needs a tap — a link, a copy button, a table — it is a
// panel and the full rule in `daisy-alpine/references/mechanics.md` applies.
// That also collapses "close after leaving both the control and the tooltip"
// down to leaving the control, which is the one simplification mechanics.md
// explicitly anticipates.
//
// ── The accessibility argument, which cuts against the obvious design ───────
//
// `title` is announced by screen readers. A tooltip that is only visual would
// therefore be a REGRESSION dressed as an improvement, so this follows the
// WAI-ARIA tooltip pattern rather than inventing one: the trigger is focusable,
// the panel is `role="tooltip"`, it opens on focus as well as hover, and
// `aria-describedby` points at it while it is open. The cost is a tab stop per
// note, which is the correct trade and is also the only way a keyboard reaches
// the note at all. A trigger that is already focusable (a button, a link) keeps
// its own tabindex.
(() => {
  const OPEN_MS  = 140;   // hover dwell before opening
  const CLOSE_MS = 220;   // grace after leaving, so a wobbling pointer is fine
  const GAP      = 8;     // px between the trigger and the panel

  const CSS = `
/* The affordance. Not \`cursor:help\`: the question-mark cursor is desktop-only,
   arrives only once the pointer is already there, and is the exact tell the
   house style objects to. A dotted underline is visible before the pointer
   moves and survives a screenshot. */
[data-note]{text-decoration:underline dotted;text-underline-offset:3px;
  text-decoration-thickness:1px;
  text-decoration-color:color-mix(in srgb,currentColor 40%,transparent)}
[data-note]:hover,[data-note]:focus-visible{
  text-decoration-color:color-mix(in srgb,currentColor 75%,transparent)}
[data-note]:focus-visible{outline:2px solid var(--color-primary,#4f8ef7);
  outline-offset:2px;border-radius:2px}
/* An element that draws its own underline, or has none to draw on (an svg
   <text>, a table cell), opts out with data-note-bare and keeps the affordance
   it already has. */
[data-note][data-note-bare]{text-decoration:none}

#wt-note{position:fixed;z-index:9999;max-width:34ch;
  /* Cannot be entered, by design. See the header comment: this is what marks
     the boundary between a note and a panel. */
  pointer-events:none;
  padding:7px 10px;border-radius:7px;
  font-size:12px;line-height:1.45;font-weight:400;text-align:left;
  text-transform:none;letter-spacing:normal;white-space:normal;
  background:var(--color-base-100,#fff);color:var(--color-base-content,#1c1e21);
  border:1px solid var(--color-base-300,#d9dee3);
  box-shadow:0 6px 20px -6px rgb(0 0 0/.28),0 2px 5px -2px rgb(0 0 0/.16);
  opacity:0;transition:opacity 90ms ease}
#wt-note[data-open]{opacity:1}
@media (prefers-reduced-motion:reduce){#wt-note{transition:none}}
`;

  // Hover is a real affordance only on a device that has one. A coarse pointer
  // reports hover on TAP, which would open the note and then immediately fight
  // the tap handler for it; the tap path below is the whole touch story.
  const FINE = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

  let panel = null, current = null, openT = 0, closeT = 0;

  function ensure() {
    if (panel) return panel;
    if (!document.getElementById('wt-note-css')) {
      const st = document.createElement('style');
      st.id = 'wt-note-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    panel = document.createElement('div');
    panel.id = 'wt-note';
    panel.role = 'tooltip';
    document.body.appendChild(panel);
    return panel;
  }

  const trigger = (t) => (t instanceof Element ? t.closest('[data-note]') : null);
  const text = (el) => (el && el.getAttribute ? el.getAttribute('data-note') : null) || null;

  // Visibility is read off the DOM, never off a flag beside it. A separate
  // `isOpen` boolean is the standard way this drifts: the tap handler toggles
  // the flag, some other path closes the panel, and the next tap "closes"
  // something already shut.
  const isOpen = (el) => !!panel && panel.hasAttribute('data-open') && current === el;

  function place(el) {
    const r = el.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    let top = r.top - p.height - GAP;
    if (top < 4) top = r.bottom + GAP;                       // flip under
    let left = r.left + r.width / 2 - p.width / 2;           // centre on trigger
    left = Math.max(4, Math.min(left, innerWidth - p.width - 4));
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  }

  function open(elOrSel) {
    const el = typeof elOrSel === 'string' ? document.querySelector(elOrSel) : elOrSel;
    const t = text(el);
    if (!t) return;
    clearTimeout(openT); clearTimeout(closeT);
    ensure();
    if (current && current !== el) current.removeAttribute('aria-describedby');
    current = el;
    panel.textContent = t;
    // Measure at the final size before positioning, or the first open of a
    // two-line note is placed as though it were one line.
    panel.style.top = '-9999px'; panel.style.left = '0px';
    panel.setAttribute('data-open', '');
    place(el);
    el.setAttribute('aria-describedby', 'wt-note');
  }

  function close() {
    clearTimeout(openT); clearTimeout(closeT);
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    if (panel) panel.removeAttribute('data-open');
  }

  // ── Delegated listeners. Nothing is attached to a note element itself, so a
  // view that replaces its own innerHTML needs no re-init and leaks nothing.

  document.addEventListener('pointerover', (e) => {
    if (!FINE()) return;
    const el = trigger(e.target);
    if (!el || el === current) return;
    clearTimeout(openT);
    openT = setTimeout(() => open(el), OPEN_MS);
  });

  document.addEventListener('pointerout', (e) => {
    if (!FINE()) return;
    const el = trigger(e.target);
    if (!el) return;
    // A move between two children of the same trigger fires out/over; ignore it.
    if (trigger(e.relatedTarget) === el) return;
    clearTimeout(openT);
    closeT = setTimeout(close, CLOSE_MS);
  });

  // Tap toggles. Capture phase, because a note often sits inside a control
  // whose own handler stops propagation, and a bubble-phase listener would
  // never see the tap that is meant to close it.
  document.addEventListener('pointerdown', (e) => {
    const el = trigger(e.target);
    if (el) { isOpen(el) ? close() : open(el); return; }
    if (current) close();                        // a tap anywhere else dismisses
  }, true);

  // Focus is how a keyboard and a screen reader reach a note at all.
  document.addEventListener('focusin', (e) => {
    const el = trigger(e.target);
    if (el) open(el); else if (current) close();
  });
  // `focusin` alone leaves the note open when focus goes NOWHERE — a bare
  // `blur()`, or clicking dead space, fires focusout with no focusin behind it.
  // Measured: without this the panel survives blur and only Escape clears it.
  document.addEventListener('focusout', (e) => {
    if (trigger(e.target) === current && current) close();
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) close(); });

  // A note anchored to a scrolled-away trigger is worse than no note, and
  // repositioning mid-scroll is not worth the frame budget.
  addEventListener('scroll', () => { if (current) close(); }, true);
  addEventListener('resize', () => { if (current) close(); });

  // Give every note a tab stop, unless the element is focusable already. Run on
  // load and on demand; `open()` does not depend on it, so a note in markup
  // written after this ran still opens on hover and tap, just not by Tab.
  function refresh(root = document) {
    root.querySelectorAll('[data-note]:not([tabindex])').forEach((el) => {
      const n = el.tagName.toLowerCase();
      if (n === 'a' || n === 'button' || n === 'input' || n === 'select'
          || n === 'textarea' || n === 'summary') return;
      el.tabIndex = 0;
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { ensure(); refresh(); });
  } else { ensure(); refresh(); }

  window.Note = { open, close, refresh, text, CSS, isOpen: () => !!current };
})();
