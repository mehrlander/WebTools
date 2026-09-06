// note.js — the NOTE of the house popup rule: `data-note="…"` in place of
// `title="…"`. The rule itself, and where a note ends and a card begins, is
// stated once, in daisy-alpine/references/mechanics.md ("Notes and cards").
// This file implements the note and does not restate the rule.
//
// Framework-free, DOM-only, one delegated listener set, the same shape as
// dock-split.js and swipe-deck.js. Load it and every `[data-note]` on the page
// works, including elements written later by innerHTML, because nothing is
// attached per element.
//
//   <span data-note="Fetched from the repo when opened.">EXTERNAL</span>
//
// Three optional attributes ride beside it, none of them required:
//
//   data-note-title  a lead line above the note: what the note is ABOUT, where
//                    `data-note` is what it says. A comment's author, a form
//                    field's name, a term before its definition. Rendered bold
//                    on its own row, as textContent, never as markup.
//   data-note-bare   suppress the dotted underline, for an element that has no
//                    room for one (a table cell, an svg <text>).
//   data-note-look   which look the panel takes. The kit ships two: the styled
//                    default, and `plain`, the browser's own tooltip redrawn
//                    (square, no shadow, one size smaller) for a note of a few
//                    words, a header unwrapped, a unit spelled out, where the
//                    styled box reads as more than the text deserves. Resolved
//                    with `closest()`, so `<body data-note-look="plain">` or a
//                    section sets a default and a note can still override it.
//                    Any other token is stamped on the panel as `data-look` and
//                    styled by the page: the sheet render asks for "excel" and
//                    draws Excel's comment box, on a page already drawing Excel.
//
//   Note.open(elOrSelector)   // for a screenshot, or to point at something
//   Note.close()
//   Note.text(el)             // the note string, or null. The lead line is
//                             // read separately, off data-note-title.
//   Note.fits(el)             // false where the note would have to scroll.
//
// ── Two properties that make it a note rather than a restyled `title` ───────
//
// The text is in the DOM, so a screenshot captures it, a phone reaches it, and
// it renders in the page's theme. And the panel holds NOTHING TAPPABLE: no
// link, no button, and no scrollbar. That second property is the whole line
// between a note and a card, and two consequences follow from it here.
//
//   A note FITS. The panel has a maximum height (LINES below) and never
//   scrolls, because a scrolling box has to take the pointer, and a box that
//   takes the pointer is a card. A note that would overflow is a defect in the
//   page, not a layout to accommodate: open() clips it and says so once in the
//   console, naming the element, and Note.fits(el) answers the same question
//   for a test. Move the content to a card.
//
//   A note CLOSES ON ITS OWN TAP. On a screen that cannot hover, the panel
//   takes the tap (pointer-events:auto under `hover: none`) and closes,
//   swallowing it, so the reader never has to find neutral ground on a dense
//   page to dismiss a note. Tap-outside still closes it, and still lets the tap
//   through to what was tapped, which is the courtesy and not the route. Where
//   the pointer can hover the panel stays uninterceptable, so it never sits
//   between the pointer and the control it describes.
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
  const LINES    = 6;     // the most a note may run to; past this it is a card

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
  /* Uninterceptable where the pointer can hover: nothing in a note is tapped,
     and the box must never sit between the pointer and the control. */
  pointer-events:none;
  /* And it never scrolls. A box that scrolls takes the pointer, and a box that
     takes the pointer is a card; see the header. */
  max-height:calc(${LINES} * 1.45em + 14px);overflow:hidden;
  padding:7px 10px;border-radius:7px;
  font-size:12px;line-height:1.45;font-weight:400;text-align:left;
  text-transform:none;letter-spacing:normal;
  /* pre-line, not normal: a caller that wrote a blank line between two
     parts of a note (who left a comment, then what the cell stores) meant
     the break. Runs of spaces still collapse and the text still wraps. */
  white-space:pre-line;
  background:var(--color-base-100,#fff);color:var(--color-base-content,#1c1e21);
  border:1px solid var(--color-base-300,#d9dee3);
  box-shadow:0 6px 20px -6px rgb(0 0 0/.28),0 2px 5px -2px rgb(0 0 0/.16);
  opacity:0;transition:opacity 90ms ease}
#wt-note[data-open]{opacity:1}
/* On a screen with no hover the open note takes its own tap and closes on it,
   so dismissing never depends on finding a tap-safe spot around it. */
@media (hover:none){#wt-note[data-open]{pointer-events:auto}}
/* The plain look: the browser's own tooltip, redrawn so it survives a
   screenshot and keeps the theme. For a few words. */
#wt-note[data-look="plain"]{border-radius:2px;box-shadow:none;padding:2px 6px;
  font-size:11px;line-height:1.35;
  border-color:color-mix(in srgb,var(--color-base-content,#1c1e21) 35%,transparent)}
/* The lead line sits on its own row above the note; a note with none is
   unchanged, since the element is not created at all. */
#wt-note .wt-note-title{display:block;font-weight:600}
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
  const attr = (el, name) => (el && el.getAttribute ? el.getAttribute(name) : null) || '';

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
    // A LEAD LINE, when the note has one. `data-note-title` is the thing the
    // note is about and `data-note` what it says: a comment's author, a form
    // field's name, a term before its definition. Two elements with their own
    // textContent rather than any markup, so nothing a caller writes is ever
    // parsed as HTML.
    const lead = attr(el, 'data-note-title');
    panel.textContent = '';
    if (lead) {
      const h = document.createElement('b');
      h.className = 'wt-note-title';
      h.textContent = lead;
      panel.append(h);
    }
    const body = document.createElement('span');
    body.textContent = t;
    panel.append(body);
    // THE LOOK: the note's own token, else the nearest ancestor's, so a page
    // sets a default once on <body>. `plain` is the kit's; any other token is
    // the page's to style (`#wt-note[data-look="…"]`).
    const look = lookOf(el);
    if (look) panel.setAttribute('data-look', look);
    else panel.removeAttribute('data-look');
    // Measure at the final size before positioning, or the first open of a
    // two-line note is placed as though it were one line.
    panel.style.top = '-9999px'; panel.style.left = '0px';
    panel.setAttribute('data-open', '');
    place(el);
    el.setAttribute('aria-describedby', 'wt-note');
    // A note that would scroll is a card written as a note. Clipped, and
    // said once per element, in the console where the author is looking.
    if (!fits(el) && !warned.has(el)) {
      warned.add(el);
      console.warn('[note] this note overflows ' + LINES + ' lines and is clipped; '
        + 'content this long belongs in a card (daisy-alpine mechanics.md, "Notes and cards")', el);
    }
  }

  const lookOf = (el) => {
    const host = el && el.closest ? el.closest('[data-note-look]') : null;
    return host ? host.getAttribute('data-note-look') || '' : '';
  };
  const warned = new WeakSet();
  // Whether the open panel holds the whole note. Read off the DOM, so it is
  // true of anything a test opens in jsdom (which lays nothing out) and false
  // only where a browser has measured an overflow. The slack is under half a
  // line: a note that exactly fills LINES lines measured a pixel over on a
  // scaled phone context and was reported, which is the one false report
  // this must never make.
  const fits = (el) => !(panel && current === el && panel.scrollHeight - panel.clientHeight > 6);

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
    // The note's own tap: close, and swallow it, so nothing under the panel
    // acts. Only reachable where the panel takes the pointer (hover: none).
    if (panel && current && panel.contains(e.target)) {
      close(); e.preventDefault(); e.stopPropagation(); return;
    }
    const el = trigger(e.target);
    if (el) { isOpen(el) ? close() : open(el); return; }
    if (current) close();                        // a tap anywhere else dismisses
  }, true);
  // The synthesized click that follows a swallowed pointerdown still fires on
  // the panel's target; stop it too, or an <a> under the note navigates.
  document.addEventListener('click', (e) => {
    if (panel && panel.contains(e.target)) { e.preventDefault(); e.stopPropagation(); }
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

  // Give every note a tab stop, unless the element is focusable already.
  function refresh(root = document) {
    root.querySelectorAll('[data-note]:not([tabindex])').forEach((el) => {
      const n = el.tagName.toLowerCase();
      if (n === 'a' || n === 'button' || n === 'input' || n === 'select'
          || n === 'textarea' || n === 'summary') return;
      el.tabIndex = 0;
    });
  }

  // A one-shot pass at load is not enough, and the way it fails is quiet: hover
  // and tap work, so the note looks fine, and only the keyboard and the screen
  // reader are shut out. Measured in home's budget-drs app, where every tab row
  // is written by its view's own render long after load. So watch instead. The
  // scan is one selector over `[data-note]:not([tabindex])`, coalesced to at
  // most one run per 100 ms, and skipped entirely for a mutation that added no
  // element, which is most of them in a text-updating app.
  let pending = 0;
  const observer = new MutationObserver((records) => {
    if (pending) return;
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1) {
          pending = setTimeout(() => { pending = 0; refresh(); }, 100);
          return;
        }
      }
    }
  });

  function start() {
    ensure();
    refresh();
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else { start(); }

  window.Note = { open, close, refresh, text, fits, CSS, LINES, isOpen: () => !!current };
})();
