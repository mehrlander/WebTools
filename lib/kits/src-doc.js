// A RENDERED VIEW OF A SOURCE FILE SAYS SO, AND SAYS WHICH FILE.
//
// That is the whole of this kit, and it is deliberately the whole: what the
// source IS (markdown with sections, code with lines, something later) belongs
// to the kit that renders it. This holds only the part every one of them needs,
// which is the announcement.
//
// It was kits/md-doc.js's, privately, until 2026-08-31. Nothing was wrong with
// it there while markdown was the only kind that declared; the moment a second
// one did, the choice was to copy twenty-five lines or to lift them, and the
// estate has spent this branch removing the results of the first choice.
//
// THE STATE IS A PROPERTY, THE ATTRIBUTE IS THE FINDABLE HALF. A declaration
// carries the source text, and an attribute would mean serializing a document
// into the DOM. `stateOf` walks up to the nearest declared box and reads the
// property off it.
//
// DECLARING ANNOUNCES, because the surfaces that care are built before the
// render happens: kits/annotate.js's card is mounted when the annotator is
// enabled, and an aim has no business existing on a page with nothing to aim
// at. A chip decided once at mount would be wrong on every deck, where the
// slide renders later and again on every swipe. One event is cheaper than a
// poll and honest in both directions.
(function () {
  const ATTR = 'data-src-doc';
  const EVENT = 'src-doc:declared';

  // Every declaration carries `kind`, the row from docs/routes-kinds.csv that
  // says what this render is. The rest is the declaring kit's own: md-doc adds
  // `sections`, code-doc adds `lines`.
  function declare(box, state) {
    if (!box) return box;
    box.setAttribute(ATTR, '');
    box.__srcDoc = state;
    try {
      const d = box.ownerDocument;
      if (d && d.defaultView && d.defaultView.CustomEvent) {
        d.dispatchEvent(new d.defaultView.CustomEvent(EVENT, { detail: { box } }));
      }
    } catch { /* a detached or exotic document: the declaration still stands */ }
    return box;
  }

  const boxOf = (node) => {
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    return el && el.closest ? el.closest('[' + ATTR + ']') : null;
  };

  const stateOf = (node) => {
    const box = boxOf(node);
    return box && box.__srcDoc ? { box, ...box.__srcDoc } : null;
  };

  // WHAT A DOCUMENT DECLARES, for a caller with no node in hand. `stateOf`
  // reads from a node up; this reads from the document down, which is the
  // question a CONTROL asks before anything has been aimed at.
  //
  // TWO CONDITIONS, and both are needed. The kind has to DECLARE an aim, and
  // the render has to have something for it to hit.
  //
  // The first is the row: source code declares and offers no aim of its own,
  // since a line range is what an ordinary text selection already spans, while
  // markdown offers one because a section is a run of siblings no selection
  // lands on cleanly. The second is `units`, which the declaring kit counts in
  // its own terms (md-doc: sections; code-doc: lines). A heading-less markdown
  // file declares with zero and an aim that cannot hit anything is worse than
  // an absent one, which md-doc found the hard way before the count moved here.
  //
  // Counting them separately per kind was the alternative, and it puts the same
  // rule in every kit that ever declares.
  function declaredIn(doc, o) {
    const wantAim = !o || o.aim !== false;
    try {
      for (const box of (doc || document).querySelectorAll('[' + ATTR + ']')) {
        const st = box.__srcDoc;
        if (!st) continue;
        if (wantAim && !(st.kind && st.kind.aim && st.units > 0)) continue;
        return { box, ...st };
      }
    } catch { /* a cross-origin frame, or no document at all */ }
    return null;
  }

  // The line a character offset falls on, 1-based, counted against the DECLARED
  // SOURCE rather than against what is on screen. A highlighter wraps tokens in
  // spans and a viewer may soften wrapping, so the rendered text is not the
  // file; the source is, and it is the thing a line number has to agree with.
  const lineAt = (source, offset) => {
    let n = 1;
    const end = Math.min(Math.max(offset, 0), source.length);
    for (let i = 0; i < end; i++) if (source.charCodeAt(i) === 10) n++;
    return n;
  };

  window.srcDoc = { ATTR, EVENT, declare, boxOf, stateOf, declaredIn, lineAt };
})();
