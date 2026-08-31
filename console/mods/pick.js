// console/mods/pick.js — click-to-collect mode for the glom working set.
// Requires console/base.js (glom).
//
//   glom.pick()        arm the page: hover shows a dashed outline, a tap or
//                      click toggles membership (badges update live), Esc or
//                      glom.pick.done() finishes and reports the set.
//
// Picks are additive to the current working set; pick a member again to remove
// it. Clicks are always swallowed (capture phase, stopImmediatePropagation) so
// picking a link doesn't navigate.
//
// TWO EVENTS, ONE SELECTION. A mouse sends pointerup and then click; iOS sends
// pointerup and, for an element that is not itself clickable, NO CLICK AT ALL
// to a document-level listener. kits/annotate.js carries the field report
// (2026-08-14, "I tap and I don't get the outline") and moved its own picker
// onto pointer events for it; this mod kept the click and would have failed the
// same way on a phone, silently, since every mouse path works.
//
// So both select, and a click arriving right after a pointerup this gesture
// already handled is dropped rather than toggling the same element twice.
//
// A pointerup that ENDED A SCROLL is not a tap, which a mouse never has to
// distinguish. The browser says so itself by cancelling the pointer when it
// claims the gesture; a distance check catches the slow drag it does not.
(() => {
  const g = window.glom;
  if (!g) return console.warn('mods/pick: console/base.js must load first');
  let finish = null;

  const SLOP = 10;      // px of travel that still counts as a tap
  const ECHO = 700;     // ms a click may follow its own pointerup

  g.pick = () => {
    if (finish) return console.warn('pick: already active — Esc or glom.pick.done() to finish');
    const doc = document;
    const style = Object.assign(doc.createElement('style'), { id: 'glom-pick-style' });
    style.textContent = '[data-glom-hover]{outline:2px dashed #f59e0b !important; cursor:copy !important}';
    doc.head.append(style);

    let hover = null, down = null, moved = false, handled = null;
    const setHover = el => {
      hover?.removeAttribute('data-glom-hover');
      (hover = el)?.setAttribute('data-glom-hover', '');
    };

    const take = el => {
      if (!(el instanceof Element) || el === doc.documentElement) return;
      const cur = new Set(g.get());
      cur.has(el) ? cur.delete(el) : cur.add(el);
      g.set([...cur]);
      g.mark();
    };

    const onMove = e => {
      if (down && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > SLOP) moved = true;
      setHover(e.target instanceof Element && e.target !== doc.documentElement ? e.target : null);
    };
    const onDown = e => { down = { x: e.clientX, y: e.clientY }; moved = false; };
    const onCancel = () => { moved = true; };
    const onUp = e => {
      down = null;
      if (moved) return;
      handled = { el: e.target, at: Date.now() };
      take(e.target);
    };
    const onClick = e => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (handled && handled.el === e.target && Date.now() - handled.at < ECHO) { handled = null; return; }
      take(e.target);
    };
    const onKey = e => { if (e.key === 'Escape') g.pick.done(); };

    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('pointermove', onMove, true);
    doc.addEventListener('pointercancel', onCancel, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    finish = () => {
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointercancel', onCancel, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('keydown', onKey, true);
      setHover(null);
      style.remove();
      finish = null;
      console.log(`pick: done — ${g.get().length} in set`);
      return g.get();
    };
    console.log('pick: tap or click to toggle membership, Esc to finish');
  };

  g.pick.done = () => finish ? finish() : (console.warn('pick: not active'), g.get());
})();
