// kits/annotate.js — notes pinned to pieces of a page: select text (or pick an
// element, or drag a rectangle), write a note, and carry the set out as
// markdown for a chat model, as JSON, or as a jot in the estate registry.
//
// The unit is the ANNOTATION SET, not the single note: the point of the kit is
// making several small notes against one document and shipping them together,
// which is what neither a screenshot nor a copied quote does. Five targeting
// modes, one note shape:
//
//   text     the primary case. A selection is anchored as a text quote
//            (exact + prefix/suffix context, the W3C Web Annotation idea),
//            not as node offsets, so the anchor survives re-render and can be
//            re-found in ANOTHER copy of the document (an agent session
//            holding the same file re-finds it by grep).
//   element  a picked node: hover outlines, tap selects. Anchored by a
//            css path and its text excerpt.
//   region   a dragged rectangle in document coordinates, carrying the text
//            of the blocks it covers. The loosest anchor, for "this area".
//   page     no anchor at all: the note is about the page. The serialization
//            already names the document and the address it was read at, so a
//            complaint dictated here arrives knowing where it was taken,
//            which is the whole reason it exists (the alternative was opening
//            another window and typing the address out by hand).
//   section  a part of a rendered markdown document, carrying that section's
//            SOURCE and its line span in the file. The only mode whose body is
//            markdown rather than rendered text. Two ways in, one target
//            builder: kits/md-doc.js's per-heading menu calls noteSection(),
//            and the card's own Section chip runs the pick engine aimed at
//            sections, outlining the whole run a section covers.
//
//            IT IS PICKED, NEVER INFERRED FROM SCROLL, and the Section chip is
//            the only conditional one on the bar, shown where the document
//            holds a declared render. Both decisions were measured; the notes
//            are at startPick and at the chip.
//
// AND THE ADDRESS FOLLOWS THE SOURCE WHERE THERE IS ONE. On a page rendered
// through kits/md-doc.js, every mode's `Path:` line reads
// `docs/APP.md § Mechanism (lines 16-28)` instead of a css path, because the
// render declared what it is a rendering OF. That is the difference between a
// note a model can act on and a note it has to go looking for: a css path
// addresses a DOM that only exists while the page is open, and the file the
// reader wants changed is on disk. Read at the moment the target is built,
// since a deck slide is dropped when the reader swipes two cards away.
//
// A selection is STAGED the moment it ends, and two controls spend that stage:
// the chip that floats beside the text, and the card's own selection bar, which
// carries the words it is about. The bar exists because the chip is where a
// phone puts its own callout, so the one offer was routinely covered or gone.
//
// The set has FOUR readings, and the card carries three of them behind an
// EXPANDER. Collapsed, the card is somewhere to write one note, with the ones
// already filed listed under the composer in whatever room is left. Expanded
// (the count in the header wears a chevron, and is the control) it grows
// UPWARD from its own bottom edge, and the set gets the room: the same list,
// or either serialization exactly as Copy hands it over, of the whole set or
// of the one selected note. Growing up is not a preference: the card is
// anchored bottom-left, a header drag re-anchors it to the TOP, and expanding
// re-pins the bottom edge so the direction cannot depend on whether the card
// has been moved.
//
// The fourth reading is not in the card and cannot be. IN PLACE, the notes are
// drawn ON the page: every one outlined where it is pinned with its words
// beside it, the card folded back to its header strip. A list and the passages
// it describes cannot both be in one screenshot, which is the whole reason for
// it (showInPlace).
//
// Until 2026-08-25 the two serializations and the actions on the set lived
// ONLY in the FAB drawer's Notes tab, so reading a set at all meant a page
// with a drawer on it, and the kit's own surface could not answer "what have I
// got". They are here now, and the single-note serialization is a reading the
// drawer never had. The drawer's copy stands for the moment.
//
// Highlights paint through the CSS Custom Highlight API when the target
// window has it, so the document's DOM is never rewritten: no wrapper spans,
// nothing for a reactive page (Alpine re-renders) to trip over. Where the API
// is absent the notes still collect and serialize; only the paint is skipped.
//
// The kit operates on a TARGET DOCUMENT handed to enable(), defaulting to its
// own. That is what lets the FAB aim it at a toss subject frame (same-origin
// #gh= renders): the kit runs in the shell realm and annotates the subject's
// document, mounting its UI there too. A #gz= sandbox is opaque and cannot be
// annotated, the same boundary Inspect already has.
//
// The composer's voice half is kits/dictate.js, a SOFT dependency read at the
// point of use: chain it before this file and "+ note" opens listening, omit
// it and everything here still works with the microphone simply absent. That
// is why the load is a pair everywhere the annotator is reached (the page's
// gh.load chain, the FAB's _loadAnnotate) and a check everywhere it is used.
//
// Load-time side effect is registration only (window.Annotate); nothing
// touches a DOM until enable(). The pure helpers are exposed with a leading
// underscore for the node test (tools/test/annotate.test.mjs).
(() => {
  if (window.Annotate) return;

  const UI_ATTR = 'data-annotate-ui';
  const CTX = 32;                 // prefix/suffix context chars around a quote
  const HL_NAME = 'annotate-notes';

  // ── Text indexing: one flat string per root, with a node map ──────────────
  // Quote anchors live in "the document's text" rather than in nodes, so both
  // directions (range → quote, quote → range) go through the same index.
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  const textIndex = (root) => {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
      acceptNode: (n) => {
        for (let el = n.parentElement; el && el !== root; el = el.parentElement) {
          if (SKIP.has(el.tagName) || el.hasAttribute(UI_ATTR)) return 2 /* REJECT */;
        }
        return 1 /* ACCEPT */;
      },
    });
    const nodes = [];
    let text = '', n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: text.length, end: text.length + n.data.length });
      text += n.data;
    }
    return { text, nodes };
  };

  // A boundary point (container, offset) → global text offset. Text-node
  // containers map directly; an element container means "before its Nth
  // child", so the offset is the end of the last text node preceding it.
  const pointOffset = (idx, container, offset) => {
    if (container.nodeType === 3) {
      const row = idx.nodes.find(r => r.node === container);
      return row ? row.start + offset : null;
    }
    const mark = offset < container.childNodes.length ? container.childNodes[offset] : null;
    if (!mark) {
      // past the last child: end of the last indexed text node inside container
      for (let i = idx.nodes.length - 1; i >= 0; i--) {
        if (container.contains(idx.nodes[i].node)) return idx.nodes[i].end;
      }
      return null;
    }
    const pos = mark.compareDocumentPosition
      ? (node) => mark.compareDocumentPosition(node) & 2 /* PRECEDING */
      : () => false;
    let last = null;
    for (const r of idx.nodes) { if (r.node === mark) return r.start; if (pos(r.node)) last = r; }
    return last ? last.end : 0;
  };

  const offsetPoint = (idx, off) => {
    for (const r of idx.nodes) {
      if (off >= r.start && off <= r.end) return { node: r.node, offset: off - r.start };
    }
    return null;
  };

  // ── Quote anchors ─────────────────────────────────────────────────────────
  const quoteFor = (root, range) => {
    const idx = textIndex(root);
    let s = pointOffset(idx, range.startContainer, range.startOffset);
    let e = pointOffset(idx, range.endContainer, range.endOffset);
    if (s == null || e == null || e <= s) return null;
    // A selection routinely grabs the DOM's inter-element whitespace at its
    // edges (measured: a two-bullet selection opened with two blank quoted
    // lines). Shrink to the visible text; a tighter exact also anchors better.
    while (s < e && /\s/.test(idx.text[s])) s++;
    while (e > s && /\s/.test(idx.text[e - 1])) e--;
    if (e <= s) return null;
    return {
      exact: idx.text.slice(s, e),
      prefix: idx.text.slice(Math.max(0, s - CTX), s),
      suffix: idx.text.slice(e, e + CTX),
    };
  };

  // The DISPLAY rendering of a selection, block-aware where the anchor cannot
  // be: `exact` must match the text index byte-for-byte to re-find, so it has
  // no bullet markers or block breaks in it. cloneContents keeps the partial
  // element chain, so list items and paragraphs can be re-marked for the
  // serialized quote. Display only; never used for anchoring.
  const displayFor = (range) => {
    const out = [];
    const walk = (node) => {
      if (node.nodeType === 3) { out.push(node.data); return; }
      if (node.nodeType !== 1) return;
      if (SKIP.has(node.tagName) || (node.hasAttribute && node.hasAttribute(UI_ATTR))) return;
      const tag = node.tagName;
      if (tag === 'BR') { out.push('\n'); return; }
      if (tag === 'LI') out.push('\n- ');
      else if (/^(P|DIV|SECTION|ARTICLE|BLOCKQUOTE|PRE|TR|H[1-6]|DT|DD|FIGCAPTION|UL|OL|TABLE)$/.test(tag)) out.push('\n');
      node.childNodes.forEach(walk);
      if (/^(P|H[1-6]|PRE|BLOCKQUOTE)$/.test(tag)) out.push('\n');
    };
    try { range.cloneContents().childNodes.forEach(walk); } catch { return ''; }
    return out.join('');
  };

  // Re-find a quote in the root and hand back a live Range, or null. When the
  // exact string occurs more than once, prefix/suffix context scores the
  // candidates; the best match wins even if the context has drifted a little.
  const resolveQuote = (root, q) => {
    if (!q || !q.exact) return null;
    const idx = textIndex(root);
    const hits = [];
    for (let at = idx.text.indexOf(q.exact); at !== -1; at = idx.text.indexOf(q.exact, at + 1)) {
      hits.push(at);
      if (hits.length > 200) break;
    }
    if (!hits.length) return null;
    const overlap = (a, b) => {
      let n = 0;
      const m = Math.min(a.length, b.length);
      while (n < m && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
      return n;
    };
    let best = hits[0], score = -1;
    for (const at of hits) {
      const pre = idx.text.slice(Math.max(0, at - CTX), at);
      const suf = idx.text.slice(at + q.exact.length, at + q.exact.length + CTX);
      let sc = overlap(pre, q.prefix || '');
      let m = 0;
      const sl = Math.min(suf.length, (q.suffix || '').length);
      while (m < sl && suf[m] === q.suffix[m]) m++;
      sc += m;
      if (sc > score) { score = sc; best = at; }
    }
    const sp = offsetPoint(idx, best);
    const ep = offsetPoint(idx, best + q.exact.length);
    if (!sp || !ep) return null;
    const r = root.ownerDocument.createRange();
    r.setStart(sp.node, sp.offset);
    r.setEnd(ep.node, ep.offset);
    return r;
  };

  // ── Structural context: css path and heading trail ────────────────────────
  const cssPath = (el, stop) => {
    const parts = [];
    for (let e = el; e && e !== stop && e.nodeType === 1; e = e.parentElement) {
      if (e.id) { parts.unshift('#' + e.id); break; }
      let i = 1;
      for (let s = e.previousElementSibling; s; s = s.previousElementSibling) {
        if (s.tagName === e.tagName) i++;
      }
      parts.unshift(e.tagName.toLowerCase() + (i > 1 ? `:nth-of-type(${i})` : ''));
      if (e.parentElement === stop || !e.parentElement) break;
    }
    return parts.join(' > ');
  };

  // The nearest heading before the element, plus the nearest one above it in
  // rank: "Title › Section". Reads the way a person would cite the location.
  const headingTrail = (el) => {
    const doc = el.ownerDocument;
    const heads = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(h => !h.hasAttribute(UI_ATTR) && (h.compareDocumentPosition(el) & 4 /* FOLLOWING */));
    if (!heads.length) return '';
    const near = heads[heads.length - 1];
    const rank = +near.tagName[1];
    for (let i = heads.length - 2; i >= 0; i--) {
      if (+heads[i].tagName[1] < rank) {
        return heads[i].textContent.trim() + ' › ' + near.textContent.trim();
      }
    }
    return near.textContent.trim();
  };

  // The ADDRESS of a target: a css path to the block it lands in, plus the
  // character span inside that block's own text.
  //
  //   article > p:nth-of-type(3) [42-57]
  //
  // The quote anchor re-finds a passage by CONTENT, which is what survives a
  // re-render; the address says WHERE, which is what content cannot answer
  // when the same phrase appears three times on the page. Both ship, because
  // they fail in opposite directions: the path breaks when the markup moves,
  // the quote goes ambiguous when the text repeats.
  //
  // Offsets are into the block's own text, not the document's, so they stay
  // small enough to check by eye and survive edits elsewhere on the page. A
  // selection crossing block boundaries gets the path alone: an end offset
  // measured against a block the selection leaves would be a wrong number
  // rather than a missing one.
  //
  // AND A THIRD READING, where the page can supply one. A document rendered
  // through kits/md-doc.js knows it is a rendering of markdown at a repo
  // address, so it can answer for any node inside it in the SOURCE's terms:
  // `docs/APP.md § Mechanism (lines 16-28)`. That is the reading a model can
  // act on. It is read here, at the moment the target is built, rather than at
  // serialization time, because the node is in hand now and may not be later:
  // a deck slide is dropped when the reader swipes two cards away, and the note
  // has to survive that.
  //
  // A page that renders markdown some other way, or is not markdown at all,
  // simply has no mdDoc box to find, and the css path is still the answer. The
  // whole integration is one optional read of a global.
  const sourceFor = (block) => {
    try {
      const ref = window.mdDoc && window.mdDoc.sourceRef && window.mdDoc.sourceRef(block);
      return ref || '';
    } catch { return ''; }
  };

  const addressFor = (block, range) => {
    if (!block) return { selector: '', span: null };
    const selector = cssPath(block, S.doc.body);
    const source = sourceFor(block);
    if (!range || !block.contains(range.startContainer) || !block.contains(range.endContainer)) {
      return { selector, span: null, source };
    }
    try {
      const idx = textIndex(block);
      let s = pointOffset(idx, range.startContainer, range.startOffset);
      let e = pointOffset(idx, range.endContainer, range.endOffset);
      if (s == null || e == null) return { selector, span: null, source };
      // Same edge trim quoteFor applies, so the span matches `exact` rather
      // than the raw drag.
      while (s < e && /\s/.test(idx.text[s])) s++;
      while (e > s && /\s/.test(idx.text[e - 1])) e--;
      return { selector, span: e > s ? { start: s, end: e } : null, source };
    } catch { return { selector, span: null, source }; }
  };

  // The source reading WINS where there is one, and it replaces the css path
  // rather than joining it. Both name the same passage, one of them in terms
  // the recipient can open and edit, and printing both would ask the reader of
  // the paste to decide which is authoritative. The css path stays in the JSON,
  // where nothing has to be chosen.
  const addressText = (t) => {
    if (!t) return '';
    if (t.source) return t.source;
    if (!t.selector) return '';
    return t.selector + (t.span ? ` [${t.span.start}-${t.span.end}]` : '');
  };

  const blockOf = (node) => {
    const BLOCK = /^(P|LI|UL|OL|TD|TH|PRE|BLOCKQUOTE|H[1-6]|DD|DT|FIGCAPTION|DIV|SECTION|ARTICLE)$/;
    for (let e = node.nodeType === 1 ? node : node.parentElement; e; e = e.parentElement) {
      if (BLOCK.test(e.tagName)) return e;
    }
    return node.nodeType === 1 ? node : node.parentElement;
  };

  const clip = (s, n = 90) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };

  // A quote body → markdown blockquote lines: trailing space stripped, blank
  // edges dropped, blank runs collapsed to one quoted separator, and the
  // common indent removed (so a <pre> quote keeps its relative indent while a
  // bullet list does not arrive indented by its source markup).
  const quoteLines = (body) => {
    if (!body) return [];
    let lines = body.split('\n').map(l => l.replace(/\s+$/, ''));
    const solid = lines.filter(l => l.trim());
    if (!solid.length) return [];
    const indent = Math.min(...solid.map(l => l.match(/^\s*/)[0].length));
    lines = lines.map(l => l.slice(indent));
    const out = [];
    for (const l of lines) {
      if (!l.trim()) { if (out.length && out[out.length - 1] !== '>') out.push('>'); }
      else out.push('> ' + l);
    }
    while (out.length && out[out.length - 1] === '>') out.pop();
    return out;
  };

  // ── State ─────────────────────────────────────────────────────────────────
  // The punctuation pad's painter, assigned when the UI mounts and read by
  // the shift toggle and by paintDraft. Declared here because both callers
  // predate the assignment in source order; it is a no-op until mount.
  let paintPunct = () => {};

  const S = {
    doc: null, items: [], seq: 0, selId: null,
    ui: null, panel: null, bubble: null, listEl: null,
    mode: null, cleanupMode: null, listeners: [], boxes: [],
    // Reading the set ON THE PAGE rather than in the card: every note's
    // outline plus its words, with the list folded away. A screenshot's mode.
    inPlace: false,
    // THE EXPANDER, and the three fields it opens onto. Collapsed, the card is
    // somewhere to write ONE note and glance at the ones already filed;
    // expanded, it is where the SET is read: the same list with room in it, or
    // either serialization exactly as Copy hands it over, plus the actions on
    // the whole set. `reading` picks which of the three is showing, and each
    // of the three is of the SET: the pane once narrowed to a single selected
    // note behind a scope chip, which put a second question on the row and
    // gave a reader who had tapped a row for some other reason a serialization
    // of one note they had not asked for.
    expanded: false,
    reading: 'notes',
    // WHICH INPUT IS IN USE, learned rather than declared. `precise` means the
    // last thing that touched this card was a mouse or a physical keyboard;
    // false means a finger. It is not a device fact and deliberately not a
    // media query: `(pointer: fine)` is true of an iPad with a keyboard case
    // while the reader is still touching the screen, and that reader would
    // lose the touch affordances they are actively using. The event is the
    // evidence, which is the same rule that let typing work with no detection
    // at all, and it follows a reader who switches hands mid-note.
    precise: false,
    // The passage the reader has selected, staged as a target the moment the
    // selection ends. Two controls offer it (the floating chip by the text, the
    // card's own selection bar) and both spend this rather than re-reading a
    // live selection, which a tap on either of them may already have collapsed.
    sel: null,
  };
  const win = () => S.doc ? S.doc.defaultView : null;

  const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); S.listeners.push([t, type, fn, opts]); };

  // ── Holding a drag against an iOS sheet ───────────────────────────────────
  // `touch-action: none` is NECESSARY AND NOT SUFFICIENT. A page opened from an
  // app on a phone is presented in a sheet the user dismisses by dragging down,
  // and the host decides that from the web view's SCROLL rather than from
  // touches; a handle carrying only touch-action still let the sheet go.
  // Measured on device across five variants, and the negative result is the one
  // worth keeping: touch-action alone dismissed, touch-action plus a cancelled
  // touchmove held, and cancelling touchstart as well also took the text
  // selection and the long-press callout with it. See docs/ios-sheet-drags.md.
  //
  // `{ passive: false }` is not optional: a passive listener cannot cancel
  // anything, and browsers default both events to passive. Nothing is lost by
  // cancelling them, because preventDefault on a TOUCH event suppresses the
  // compatibility MOUSE events rather than the pointer ones, so a pointerdown
  // drag runs exactly as before.
  //
  // It does suppress the compatibility CLICK, though, which is why `skip` is a
  // selector for the clickable children a drag surface may contain: the card's
  // header holds the capture chips, the region cover holds its "+ note".
  const holdTouch = (node, skip) => {
    if (!node || !node.addEventListener) return;
    const stop = (e) => {
      if (skip && e.target && e.target.closest && e.target.closest(skip)) return;
      e.preventDefault();
    };
    node.addEventListener('touchstart', stop, { passive: false });
    node.addEventListener('touchmove', stop, { passive: false });
  };

  // ── Highlight painting (non-destructive) ──────────────────────────────────
  // One stylesheet for the highlights AND for the card's selection lock, and
  // the lock is here rather than inline for a reason worth stating: the two
  // properties it needs are not equals. `-webkit-touch-callout` is absent from
  // the CSSOM's property list, so it survives only as authored attribute text,
  // and ANY later `.style.foo = ` on that element re-serializes the attribute
  // from the parsed declarations and drops it. That is not hypothetical: the
  // frame's own layout writes `gridColumn` on the text cell every repaint, and
  // it silently took the lock off (caught by the test, 2026-08-12). A rule in
  // a stylesheet is parsed once and cannot be clobbered by an inline write.
  const ensureStyle = () => {
    if (!S.doc || S.doc.getElementById('annotate-style')) return;
    const st = S.doc.createElement('style');
    st.id = 'annotate-style';
    st.setAttribute(UI_ATTR, '');
    st.textContent = `
      ::highlight(${HL_NAME}) { background: rgba(250, 204, 21, .40); }
      ::highlight(${HL_NAME}-active) { background: rgba(249, 115, 22, .55); }
      [${UI_ATTR}], [${UI_ATTR}] * {
        -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
      }
      [${UI_ATTR}] textarea, [${UI_ATTR}] input {
        -webkit-touch-callout: default; -webkit-user-select: text; user-select: text;
      }
      /* A PIN IS FURNITURE WHILE THE PAD IS DRIVING IT. The pad aims at the
         armed pin, and a pin's hit box is 32px wide, so the browser's
         caret-from-point kept answering with the pin rather than with the word
         under it. The lookup then returned nothing and the edge did not move
         until the aim point had cleared the pin's own box, which is why the
         edge advanced two characters at a time instead of one. Measured
         2026-08-13: a 120px sweep across the text reported a 32px dead band at
         each pin, and the drag stepped 13, 15, 17. Taps still arm a pin; only
         the length of a pad drag is it transparent. */
      [data-annotate-pad] [data-edge] { pointer-events: none; }
      /* NO DOUBLE-TAP ZOOM ANYWHERE ON THE CARD. touch-action is not
         inherited, so the painted spans, the pins and the hint all computed
         auto inside a scroll box set to pan-y, and a phone reads a double tap
         on auto as a request to zoom to the tapped block. That is now the
         gesture that opens the keyboard, so the reader got both. This is a
         stylesheet rule and every deliberate value on the card is inline
         (none on the root, the drag handle and the pad; pan-y on the scrolling
         panes), so inline specificity keeps all of them and only the unset
         elements change. Cannot be verified here: headless honors touch-action
         but has no double-tap zoom to suppress. */
      [${UI_ATTR}], [${UI_ATTR}] * { touch-action: manipulation; }`;
    S.doc.head.appendChild(st);
  };

  // Paints from S.selId rather than an argument: the selected note is STATE,
  // not a 1.6-second flash, so every repaint agrees about which one is current
  // without the caller having to remember.
  const paint = () => {
    // The overlay first, and outside the capability gate. Element and region
    // outlines are ordinary positioned divs and owe the Highlight API nothing;
    // they were behind its early return, so a browser without it lost the boxes
    // as well as the highlights, which is the half that did not have to go.
    paintBoxes();
    const w = win();
    if (!w || !w.Highlight || !w.CSS || !w.CSS.highlights) return;   // collect-only fallback
    ensureStyle();
    const ranges = [], active = [];
    for (const it of S.items) {
      if (it.target.type !== 'text') continue;
      const r = resolveQuote(S.doc.body, it.target.quote);
      if (r) (it.id === S.selId ? active : ranges).push(r);
    }
    w.CSS.highlights.set(HL_NAME, new w.Highlight(...ranges));
    w.CSS.highlights.set(HL_NAME + '-active', new w.Highlight(...active));
  };

  // The document-coordinate box a note occupies, or null where it has none. A
  // text note answers with the union of its quote's client rects, which only
  // the in-place reading draws: while the card holds the list, the highlight
  // already says where the passage is and a second outline over it is noise.
  // A SECTION IS A RUN OF SIBLINGS, not one node, so it outlines as the union
  // of what it covers: the heading plus everything after it until the next
  // heading of equal or higher rank. That is the same cut kits/md-doc.js makes
  // in the source, applied to the DOM, and it is what makes the in-place
  // reading honest: an outline around the heading alone would claim the note is
  // about a title.
  const sectionEls = (head) => {
    if (!head || !/^H[1-6]$/.test(head.tagName)) return head ? [head] : [];
    const rank = +head.tagName[1];
    const run = [head];
    for (let n = head.nextElementSibling; n; n = n.nextElementSibling) {
      if (/^H[1-6]$/.test(n.tagName) && +n.tagName[1] <= rank) break;
      run.push(n);
    }
    return run;
  };

  const unionRect = (els, w) => {
    const rs = els.map(e => e.getBoundingClientRect()).filter(r => r.width || r.height);
    if (!rs.length) return null;
    const l = Math.min(...rs.map(r => r.left)), t0 = Math.min(...rs.map(r => r.top));
    const rt = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
    return { x: l + w.scrollX, y: t0 + w.scrollY, w: rt - l, h: b - t0 };
  };

  const rectFor = (it) => {
    const w = win();
    const t = it.target;
    if (!w || !t) return null;
    if (t.type === 'section' && t.selector) {
      const e = findElement(t.selector);
      return e ? unionRect(sectionEls(e), w) : null;
    }
    if (t.type === 'element' && t.selector) {
      const e = findElement(t.selector);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + w.scrollX, y: r.top + w.scrollY, w: r.width, h: r.height };
    }
    if (t.type === 'region') return t.rect || null;
    if (t.type === 'text') {
      const r = resolveQuote(S.doc.body, t.quote);
      const rects = r && r.getClientRects ? [...r.getClientRects()] : [];
      if (!rects.length) return null;
      const l = Math.min(...rects.map(x => x.left)), t0 = Math.min(...rects.map(x => x.top));
      const rt = Math.max(...rects.map(x => x.right)), b = Math.max(...rects.map(x => x.bottom));
      return { x: l + w.scrollX, y: t0 + w.scrollY, w: rt - l, h: b - t0 };
    }
    return null;
  };

  // The note itself, drawn on the page beside what it is pinned to. Furniture
  // only: pointer-events off, so it never stands between a tap and a highlight.
  const calloutFor = (i, it, on) => {
    const c = el('div', 'box-sizing:border-box;pointer-events:none;'
      + `background:#fff;border:1px solid ${on ? '#f97316' : '#eab308'};border-left-width:4px;`
      + 'border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.16);padding:5px 9px;'
      + 'max-width:min(260px,66vw);font:12px/1.45 ui-sans-serif,system-ui;color:#27272a;'
      + 'white-space:pre-wrap;word-break:break-word;');
    c.appendChild(el('span', `font-weight:700;color:${on ? '#c2410c' : '#a16207'};`, (i + 1) + '. '));
    c.appendChild(el('span', it.note ? '' : 'color:#a1a1aa;font-style:italic;', it.note || '(no note)'));
    return c;
  };

  // Element and region notes get absolutely positioned outline boxes in an
  // overlay layer (document coordinates, so they ride ordinary scrolling).
  //
  // IN PLACE, the set is drawn ON THE PAGE rather than read in the card: every
  // note gets its outline, text notes included, and its words beside it. That
  // is the reading a screenshot wants, and the one the card could not give:
  // the list and the passage it describes cannot both be in frame when the
  // list is a scrolling pane in a 360px box.
  const paintBoxes = () => {
    const activeId = S.selId;
    for (const b of S.boxes) b.remove();
    S.boxes = [];
    if (!S.doc || !S.ui) return;
    let stack = null;
    S.items.forEach((it, i) => {
      const on = it.id === activeId;
      // A text note's outline belongs to the in-place reading alone.
      const rect = (it.target.type === 'text' && !S.inPlace) ? null : rectFor(it);
      if (rect) {
        const d = el('div', `position:absolute;left:${rect.x}px;top:${rect.y}px;`
          + `width:${rect.w}px;height:${rect.h}px;`
          + `pointer-events:none;z-index:2147482000;border:2px dashed ${on ? '#f97316' : 'rgba(250,204,21,.9)'};`
          + `background:rgba(250,204,21,${on ? '.18' : '.08'});border-radius:4px;`);
        S.doc.body.appendChild(d);
        S.boxes.push(d);
      }
      if (!S.inPlace) return;
      const c = calloutFor(i, it, on);
      if (rect) {
        c.style.position = 'absolute';
        c.style.zIndex = String(Z - 50);
        S.doc.body.appendChild(c);
        // THE MARGIN FIRST, and the space under the outline only when there is
        // no margin to use. A note dropped below its own box lands on the next
        // paragraph, which is the text a reader is most likely to want in the
        // same picture; a page laid out in a column has empty inches either
        // side of it doing nothing. Measured after the append, since both the
        // choice and the clamp need the callout's real width.
        const docW = (S.doc.documentElement && S.doc.documentElement.scrollWidth) || 0;
        const right = rect.x + rect.w;
        const gapR = docW - right - 12, gapL = rect.x - 12;
        // NARROW ENOUGH TO FIT beats a fixed width that misses by a pixel: a
        // page laid out in a column leaves a margin that is whatever it is, and
        // 140px of it still holds a legible line. Under that it is not a margin.
        if (gapR >= 140) {
          c.style.maxWidth = Math.min(260, gapR) + 'px';
          c.style.left = (right + 8) + 'px';
          c.style.top = rect.y + 'px';
        } else if (gapL >= 140) {
          c.style.maxWidth = Math.min(260, gapL) + 'px';
          c.style.left = Math.max(4, rect.x - (c.offsetWidth || 0) - 8) + 'px';
          c.style.top = rect.y + 'px';
        } else {
          const cw = c.offsetWidth || 0;
          c.style.left = Math.max(4, Math.min(Math.max(4, docW - cw - 8), rect.x)) + 'px';
          c.style.top = (rect.y + rect.h + 4) + 'px';
        }
        S.boxes.push(c);
        return;
      }
      // A page note is pinned to nothing, so it has nowhere on the page to sit.
      // The column at the top-right corner is where it goes, stacked in order,
      // fixed rather than absolute: a note about the whole page belongs in
      // whatever part of it the screenshot happens to catch.
      if (!stack) {
        stack = el('div', `position:fixed;right:12px;top:12px;z-index:${Z - 50};pointer-events:none;`
          + 'display:flex;flex-direction:column;gap:6px;align-items:flex-end;');
        S.doc.body.appendChild(stack);
        S.boxes.push(stack);
      }
      stack.appendChild(c);
    });
  };

  const findElement = (selector) => {
    try { return S.doc.querySelector(selector); } catch { return null; }
  };

  // ── The note shape ────────────────────────────────────────────────────────
  // THE PAGE IS THE DEFAULT, and it belongs here rather than in a control. A
  // note that pins to nothing is still a note about the page it was written
  // on: `mdHead` and `jsonFor` put the title and address at the head of every
  // serialization, so page association was never what the `page` target
  // supplied. What it supplies is the ABSENCE of an anchor, which is exactly
  // what an unaimed note has. So an omitted target resolves to it, and the
  // card's job shrinks to offering the four aims that are not the default.
  const PAGE_TARGET = () => ({ type: 'page' });
  const makeItem = (target, note) => ({
    id: 'a' + Date.now().toString(36) + (S.seq++).toString(36),
    at: new Date().toISOString(),
    note: String(note || '').trim(),
    target: target || PAGE_TARGET(),
  });

  // Announce on this window AND on the top one when they differ.
  //
  // The frame case is the normal case, not an edge: a page rendered through
  // toss-render runs in an iframe stamped __fabHosted, so its own drawer
  // declines to mount and the SHELL's is the one on screen. The kit loads with
  // the framed page, so an announcement that only reached its own window would
  // be shouted into the frame nobody is watching. Measured 2026-08-09 on a
  // phone: Review reported "no drawer" with the launcher visible on screen.
  //
  // Cross-origin access throws and a #gz= sandbox is opaque, so both are caught
  // and the local dispatch stands alone. Returns whether any listener claimed
  // the event, which only a cancelable one can report.
  const announce = (name, cancelable) => {
    let claimed = false;
    const fire = (w) => {
      try { claimed = !w.dispatchEvent(new CustomEvent(name, { cancelable: !!cancelable })) || claimed; }
      catch { }
    };
    fire(window);
    try { if (window.top && window.top !== window) fire(window.top); } catch { }
    return claimed;
  };

  const emit = () => announce('annotate:change');

  // THE DRAWER IS NOT PART OF THIS ANY MORE. The card used to hand the set to
  // the FAB drawer's Notes tab: a title button that announced 'annotate:review',
  // a drawer that answered by opening, and a three-way handshake
  // ('annotate:drawer', 'annotate:drawer-query') so the button could say
  // whether a tap would open the tab, close it, or reach nothing at all. All
  // of it existed because the card had nowhere to READ a set, only somewhere
  // to write one. The expander gave it that, so the second surface became a
  // second implementation of a view this file already has, on a page that
  // might not have a drawer, kept in step by three events. Retired 2026-08-25,
  // and the drawer's Notes tab with it.
  //
  // What the FAB still does is START the annotator: the take grid's Annotate
  // entry and the launcher's long-press "Take a note", both of which call
  // enable() and then get out of the way. Turning it on is a launcher's job;
  // reading the set is this card's.

  // ── Reading the set in place ──────────────────────────────────────────────
  const syncPlace = () => {
    const b = S.placeBtn;
    if (!b) return;
    b.style.background = S.inPlace ? '#facc15' : '#fff';
    b.style.borderColor = S.inPlace ? '#eab308' : '#e4e4e7';
    setIcon(b, S.inPlace ? 'eye-slash' : 'eye');
    b.title = S.inPlace
      ? 'Back to the list: take the notes off the page'
      : 'Show every note on the page, beside what it is pinned to';
  };

  const showInPlace = (on) => {
    S.inPlace = !!on;
    // The list folds away rather than the card: the header is the way back, and
    // a mode with no exit visible is the defect the capture chips already fixed
    // once. What is left is one 30px strip, which a screenshot can live with.
    // The expanded set folds away with it, for the same reason and by the same
    // rule: everything below the header is a list, and a list is what this
    // reading exists to replace.
    syncBody();
    if (S.inPlace) setStatus('');
    syncPlace();
    paint();
    emit();
    return S.inPlace;
  };

  // ── Reading the set in the card: the expander ─────────────────────────────
  // Collapsed, the card is somewhere to write ONE note: a composer, and the
  // notes already filed listed under it in whatever room is left. That is the
  // right shape while writing and the wrong one for looking at what you have,
  // which is why reading the set meant leaving for the drawer's Notes tab, on
  // a page that has a drawer at all. The expander answers it here: the card
  // grows and the set gets the three readings, the same three the drawer
  // carries, plus one it does not (a single note serialized on its own).
  //
  // IT GROWS UP. The card is anchored bottom-left and a header drag re-anchors
  // it to the top, so a taller panel would grow DOWNWARD after a drag, off the
  // bottom of the screen. Pinning the bottom edge where it currently sits makes
  // the direction the same either way: the header stays under the thumb that
  // just tapped it, and the readings appear above.
  const anchorBottom = () => {
    const root = S.ui;
    if (!root) return;
    const w = win() || window;
    const vh = (w.innerHeight || 0);
    const r = root.getBoundingClientRect();
    // A card that is not laid out (no layout at all, in a headless run) reports
    // zeros, and a bottom computed from those would jump it to the top of the
    // screen. The 12px it mounts at is the honest fallback.
    const bottom = (r.width || r.height) ? Math.max(0, vh - r.bottom) : 12;
    root.style.top = 'auto';
    root.style.bottom = Math.round(bottom) + 'px';
  };

  // ONE HEIGHT FOR THE THREE READINGS, not one per reading. Sized to content,
  // the card jumped every time the strip was tapped: three short notes made a
  // 415px card and their markdown a 760px one, so the reader's own tap moved
  // the thing they were reading and the header went with it. An open set is a
  // window of a fixed size now, and what does not fit scrolls inside it, which
  // is what a window is for.
  //
  // The height is COMPUTED rather than declared, and it has to be: the
  // collapsed cap is 70vh because the card sits near the bottom edge, but a
  // card dragged halfway up the screen has only the space above its own bottom
  // edge to grow into, and a vh-based figure would run off the top.
  //
  const PANEL_MAX = 'min(480px,70vh)';
  // THE WINDOW APPLIES WHENEVER THE SET IS OPEN, empty or not. It used to wait
  // for a first note, on the reading that one italic line does not need a
  // window: true of the line, false of the reader, who then watched the card
  // jump to a new size the moment they filed anything. One gesture, one size.
  const windowed = () => !!(S.expanded && !S.inPlace);
  const sizeExpanded = () => {
    const p = S.panel;
    if (!p) return;
    if (!windowed()) { p.style.height = ''; p.style.maxHeight = PANEL_MAX; return; }
    const w = win() || window;
    const vh = (w.visualViewport && w.visualViewport.height) || w.innerHeight || 0;
    const bottom = parseFloat(S.ui && S.ui.style.bottom) || 0;
    // A WINDOW OVER THE DOCUMENT, not a takeover of it, and the figure has come
    // down twice. It began as whatever room sat above the card's bottom edge,
    // which on a 720px screen was 696 of it: the page the notes are about went
    // off screen behind the thing describing it. Two thirds read as still too
    // much. Just over half now, capped at 440px, so a phone keeps most of a
    // screenful of document and a tall desktop does not get a column of
    // monospace a foot high.
    const h = Math.max(240, Math.min(440, Math.round(vh * 0.55), vh - bottom - 12));
    // Both, and they are not the same statement: `height` is what makes the
    // three readings agree, `maxHeight` is what keeps the composer opening
    // inside the window rather than pushing it taller.
    p.style.height = h + 'px';
    p.style.maxHeight = h + 'px';
  };

  const expand = (on) => {
    S.expanded = !!on;
    if (S.expanded) anchorBottom();
    syncBody();
    return S.expanded;
  };

  // WHAT IS SHOWING BELOW THE HEADER, decided in one place. Three states share
  // the same strip of card and each hides the other two, so working them out
  // at three call sites is how one of them ends up showing two at once.
  const syncBody = () => {
    const set = S.expanded && !S.inPlace;
    // An expanded EMPTY set shows neither a list nor a serialization: an empty
    // markdown document under a lit Markdown chip reads as something broken,
    // where one line saying where notes come from reads as an invitation. The
    // readings strip stays, since seeing the three on offer is most of what
    // opening an empty set is for, and the window stays too, so filing the
    // first note does not resize the card under the reader.
    const bare = set && !S.items.length;
    const list = !S.inPlace && !bare && (!S.expanded || S.reading === 'notes');
    const serial = set && !bare && S.reading !== 'notes';
    if (S.listEl) S.listEl.style.display = list ? 'flex' : 'none';
    if (S.readBar) S.readBar.style.display = set ? 'flex' : 'none';
    if (S.empty) S.empty.style.display = bare ? 'flex' : 'none';
    if (S.serial) S.serial.style.display = serial ? 'flex' : 'none';
    // The actions are the set's, so they arrive with it and go with an empty
    // one: Copy, Save and Clear over nothing are three offers that cannot be
    // taken up.
    if (S.setActs) S.setActs.style.display = (set && S.items.length) ? 'flex' : 'none';
    // The list takes the leftover height only inside the window, where there IS
    // leftover height. Collapsed it must stay content-sized: a stretched list
    // under a composer with two notes in it is a band of white, which is the
    // defect the list's own bottom padding was tuned around.
    // Longhands, not the `flex` shorthand: they say the same thing to a browser
    // and, unlike the shorthand, they survive a CSSStyleDeclaration that does
    // not implement it, which is what the node test reads the card through.
    if (S.listEl) {
      const w = windowed();
      S.listEl.style.flexGrow = w ? '1' : '';
      S.listEl.style.flexShrink = w ? '1' : '';
      S.listEl.style.flexBasis = w ? '0' : '';
      S.listEl.style.minHeight = w ? '0' : '';
    }
    sizeExpanded();
    syncExpander();
    syncReadBar();
    // Unconditionally: Copy rides the format row now, so leaving a
    // serialization has to take it off. Skipping this when the pane was hidden
    // left the key sitting beside the Notes chip with nothing to act on.
    syncCopyKey();
    if (serial) renderSerial();
  };

  // A serialization is of THE SET. There is no second scope to resolve, so
  // there is nothing here to decide: the two readings show what Copy hands
  // over, and Copy hands over everything.
  const renderSerial = () => {
    if (!S.serialPre) return;
    const text = S.reading === 'json' ? JSON.stringify(toJSON(), null, 2) : toMarkdown();
    S.serialPre.textContent = text;
    syncCopyKey();
    return text;
  };

  // THE COUNT IS THE EXPANDER. It was a bare number sitting beside the title
  // saying how many notes there were and offering nothing; the set's size and
  // the way into the set are one idea, and a separate caret would have been a
  // second control for it on a header that already carries five. It wears a
  // chevron so it reads as a control rather than a label.
  //
  // IT IS ALWAYS OFFERED, and that is a correction. It first went with an
  // empty set, on the reading that a set with nothing in it has no reading to
  // open. True, and beside the point: a control nobody can see on arrival is a
  // control nobody finds, and the first thing a reader does with a fresh page
  // is arrive at it with no notes. Reported from the deployed page within the
  // hour. Opening it empty is what teaches the gesture, so the empty set gets
  // a line saying where notes come from rather than a hidden button.
  //
  // Only the NUMBER comes and goes, so an untouched card reads `Notes ⌄` and a
  // working one `Notes 3 ⌄`. In place it goes entirely, since that reading
  // exists to leave one strip of card for a screenshot.
  const syncExpander = () => {
    const b = S.expandBtn;
    if (!b) return;
    b.style.display = S.inPlace ? 'none' : 'flex';
    setIcon(b, S.expanded ? 'caret-down' : 'caret-up');
    b.style.background = S.expanded ? '#facc15' : '#fff';
    b.style.borderColor = S.expanded ? '#eab308' : '#e4e4e7';
    b.title = S.expanded ? 'Put the set away and go back to writing'
      : 'Open the set: the list with room in it, or either serialization';
  };

  const syncReadBar = () => {
    if (!S.readChips) return;
    for (const [key, b] of Object.entries(S.readChips)) {
      const on = S.reading === key;
      b.style.backgroundColor = on ? '#facc15' : 'transparent';
      b.style.color = on ? '#18181b' : COPY_IDLE;
    }
  };

  const setReading = (key) => {
    S.reading = key;
    // Asking for a reading is asking to see it, so it opens the set if the
    // strip was reached some other way (the API, a test). From the strip
    // itself the card is already open and this is a no-op.
    if (!S.expanded) return expand(true);
    syncBody();
    return S.expanded;
  };

  // THE COPY KEY, which rides the format row and follows the chip beside it.
  // It appears only where it means something: a serialization, the one reading
  // whose bytes are what a reader came here to take away.
  const syncCopyKey = () => {
    const b = S.serialCopy;
    if (!b) return;
    const serial = S.expanded && !S.inPlace && !!S.items.length && S.reading !== 'notes';
    // IT LEAVES THE ROW, and the two things that wants are exclusive, so this
    // is a choice rather than a fix. Reserving its place keeps the reading keys
    // from shifting when a reading changes; letting it go keeps them CENTRED,
    // since the gap a reader sees runs to the nearest control they can actually
    // see. Held, the Notes reading measured 7px of gap on the left and 40 on
    // the right and read as visibly off-centre; released, all three readings
    // measure 7 and 7 and the group steps about 16px as Copy comes and goes.
    // A persistent asymmetry is on screen the whole time a set is open; the
    // step happens only on a tap the reader just made, and lands on the state
    // they asked for. Centring wins.
    b.style.display = serial ? 'flex' : 'none';
    b.style.visibility = '';
    b.title = 'Copy this ' + (S.reading === 'json' ? 'JSON' : 'markdown') + ', exactly as shown';
  };

  // THE COPY REPORTS ON ITSELF, because nothing else here can. The status line
  // this card used to carry is gone (see `setStatus`), and a copy that says
  // nothing is indistinguishable from one that failed until the paste lands.
  // So the key wears the answer for a moment and goes back: a check for the
  // copy that took, a warning for the one that did not. It is the same swap
  // kits/chat-render.js and kits/session-export.js make on their own copy
  // buttons, in inline styles rather than daisyUI classes, since this card
  // mounts into arbitrary documents and cannot assume a stylesheet.
  const flashCopy = (ok) => {
    const b = S.serialCopy;
    if (!b) return;
    clearTimeout(S.copyTimer);
    setIcon(b, ok ? 'check' : 'warning');
    b.style.color = ok ? '#15803d' : '#b91c1c';
    S.copyTimer = setTimeout(() => {
      setIcon(b, 'copy');
      b.style.color = COPY_IDLE;
    }, 1300);
  };

  // Copy WHAT IS SHOWN, which is the WHOLE SET, always. The pane used to
  // narrow to a single selected note behind a scope chip, and the markdown,
  // the JSON and this key all followed it: three surfaces answering a question
  // nobody had asked, and a reader who tapped a row for some other reason
  // could find the pane showing one note without having chosen that. The set
  // is what the serializations are for. A single note's own words still copy
  // from that note's row, which is the errand the scope was standing in for.
  const copyShown = async () => {
    const text = S.serialPre ? S.serialPre.textContent : '';
    if (!text) return false;
    try {
      try { await navigator.clipboard.writeText(text); }
      catch { if (!fallbackCopy(text)) throw new Error('copy failed'); }
      flashCopy(true);
      return true;
    } catch { flashCopy(false); setStatus('Copy failed', true); return false; }
  };

  // ── The staged selection ──────────────────────────────────────────────────
  // The card SAYS what it has. A selection used to be offered only by a chip
  // floating beside the text, which on a phone is where the platform puts its
  // own callout, so the one control was routinely under it or gone with the
  // selection. The bar is in the card, it carries the words it is about, and it
  // outlives the selection that made it: staging happens when the selection
  // ends, so whatever the next tap does to the selection, the offer stands.
  const setSelection = (target) => {
    S.sel = target || null;
    syncSelBar();
  };

  const syncSelBar = () => {
    if (!S.selBar) return;
    const t = S.sel;
    S.selBar.style.display = t ? 'flex' : 'none';
    if (t) S.selQuote.textContent = '“' + clip(t.quote.exact, 80) + '”';
  };

  const noteSelection = () => {
    const t = S.sel;
    if (!t) return false;
    hideSelBtn();
    setSelection(null);
    endMode();
    beginDraft(t, t.quote.exact);
    const s = win() && win().getSelection();
    if (s) s.removeAllRanges();
    return true;
  };

  // A note about the PAGE, pinned to nothing in it. The three other targets
  // all answer "which part", and the case they leave out is the one that sends
  // a reader to another window: the page is wrong, or missing something, and
  // there is no passage to point at. Opening a draft outright, with no gesture
  // to make first, is the whole feature; the address rides the serialization,
  // so the note says where it was taken without anyone typing it out.
  const notePage = (opts = {}) => {
    if (!S.ui) return false;
    endMode();
    const { title, url, view } = docMeta();
    beginDraft(PAGE_TARGET(), 'This page: ' + (title || view || url || 'untitled'), null, opts);
    return true;
  };

  // A note about a SECTION of a rendered markdown document, which is the one
  // target the other four cannot express. A text quote pins to a phrase, an
  // element to a node, a region to a rectangle, and the page to the whole
  // thing; none of them is "this part of this document", which is the unit a
  // document is actually revised in.
  //
  // What makes it possible is kits/md-doc.js's declaration: the heading knows
  // which section it opens, and the section knows its own SOURCE and its line
  // span in the file. So the note carries the markdown, not the rendering, and
  // a model handed the set can return a replacement for lines 16 to 28.
  //
  // Called from md-doc's own section menu, which is the only surface that has
  // a heading in hand. Returns false rather than throwing where the page is
  // not a declared render, so the menu can report an honest failure.
  // ONE BUILDER, two ways in: the menu md-doc puts on every heading, and the
  // Section pick mode below. They differ in how the heading is found and in
  // nothing else, so the target is built once.
  const sectionTarget = (headEl) => {
    const loc = window.mdDoc && window.mdDoc.locate ? window.mdDoc.locate(headEl) : null;
    const sec = loc && loc.section;
    if (!sec) return null;
    return {
      type: 'section',
      selector: cssPath(loc.head || headEl, S.doc.body),
      label: headingTrail(loc.head || headEl),
      source: window.mdDoc.sourceRef(loc),
      title: sec.title,
      lines: { start: sec.startLine, end: sec.endLine },
      // The section's own markdown, clipped: a set is pasted into a chat and a
      // long section would crowd out the notes it is there to carry. The line
      // span above is what a recipient uses to read the rest.
      excerpt: clip(sec.raw, 1200),
    };
  };

  const noteSection = (headEl) => {
    if (!S.ui || !headEl) return false;
    const target = sectionTarget(headEl);
    if (!target) return false;
    endMode();
    beginDraft(target, target.excerpt);
    return true;
  };

  const add = (target, note) => {
    const it = makeItem(target, note);
    S.items.push(it);
    if (S.ui) { paint(); renderList(); }
    emit();
    return it;
  };

  const remove = (id) => {
    S.items = S.items.filter(i => i.id !== id);
    if (S.selId === id) S.selId = null;
    if (S.ui) { paint(); renderList(); }
    emit();
  };

  const clear = () => {
    S.items = []; S.selId = null;
    if (S.ui) { paint(); renderList(); }
    emit();
  };

  // Update an existing note in place. The target is not touched: a note is
  // edited, a passage is re-selected, and conflating the two would silently
  // move an anchor the reader believed was pinned.
  const update = (id, note) => {
    const it = S.items.find(i => i.id === id);
    if (!it) return null;
    it.note = String(note || '').trim();
    it.editedAt = new Date().toISOString();
    if (S.ui) { paint(); renderList(); }
    emit();
    return it;
  };

  // ── Selection: one current note, chosen from either side ──────────────────
  // The list and the document are two views of the same set, so selecting in
  // one selects in the other. Passing null clears it.
  const select = (id, opts = {}) => {
    S.selId = S.items.some(i => i.id === id) ? id : null;
    if (S.ui) { paint(); renderList(); }
    emit();
    const it = S.items.find(i => i.id === S.selId);
    if (it && opts.scroll !== false) scrollToTarget(it);
  };

  const scrollToTarget = (it) => {
    const t = it.target;
    let e = null;
    if (t.type === 'text') {
      const r = resolveQuote(S.doc.body, t.quote);
      if (r) e = blockOf(r.startContainer);
    } else if (t.type === 'element' || t.type === 'section') {
      e = findElement(t.selector);
    } else if (t.type === 'region') {
      win().scrollTo({ top: Math.max(0, t.rect.y - 80), behavior: 'smooth' });
    }
    if (e && e.scrollIntoView) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Which note, if any, sits under a click. Client coordinates. The SMALLEST
  // matching rect wins, so a text quote inside a picked element beats the
  // element that contains it rather than being unreachable behind it.
  const hitTest = (x, y) => {
    let best = null, bestArea = Infinity;
    const w = win();
    for (const it of S.items) {
      const rects = [];
      const t = it.target;
      if (t.type === 'text') {
        const r = resolveQuote(S.doc.body, t.quote);
        if (r) rects.push(...r.getClientRects());
      } else if (t.type === 'section') {
        const e = findElement(t.selector);
        if (e) for (const n of sectionEls(e)) rects.push(n.getBoundingClientRect());
      } else if (t.type === 'element') {
        const e = findElement(t.selector);
        if (e) rects.push(e.getBoundingClientRect());
      } else if (t.type === 'region' && t.rect) {
        const left = t.rect.x - w.scrollX, top = t.rect.y - w.scrollY;
        rects.push({ left, top, right: left + t.rect.w, bottom: top + t.rect.h,
                     width: t.rect.w, height: t.rect.h });
      }
      for (const r of rects) {
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const area = Math.max(1, r.width) * Math.max(1, r.height);
        if (area < bestArea) { bestArea = area; best = it.id; }
      }
    }
    return best;
  };

  // ── Serialization ─────────────────────────────────────────────────────────
  // The subject override wins; the document is the fallback, and it may be
  // absent. After disable() S.doc is null and this falls back to the realm's
  // own document, which a kit running in a bare window (a test's stub, a
  // worker-like host) does not have. Guarding costs one `||` and is the
  // difference between a late 'annotate:change' listener reporting an empty
  // title and one throwing inside someone else's event dispatch.
  // Where the reader is actually LOOKING, which is not always where the file
  // lives. Under a toss the subject is a frame, so its own location addresses
  // a blob the reader cannot re-open; the top window's address is the toss,
  // which names the ref and the page and opens again in one tap. That is the
  // half a note about the page as a whole depends on: "this page, here, now".
  const viewUrl = () => {
    const w = (S.doc && S.doc.defaultView) || window;
    try { if (w.top && w.top !== w && w.top.location.href) return w.top.location.href; } catch { }
    try { return w.location.href || ''; } catch { return ''; }
  };

  const docMeta = () => {
    const d = S.doc || window.document || null;
    const w = d && d.defaultView;
    const url = (window.Annotate.subject && window.Annotate.subject.url) || (w ? w.location.href : '');
    const view = viewUrl();
    return {
      title: (window.Annotate.subject && window.Annotate.subject.title) || (d && d.title) || '',
      url,
      // Only when it says something the source URL does not.
      view: (/^https?:/.test(view) && view !== url) ? view : '',
    };
  };

  // THE PREAMBLE: which document, read where, and what the block below is a
  // reading of. `lead` is the one line that differs between the set and a
  // single note, and it is the only place the two are allowed to differ.
  const mdHead = (lead) => {
    const { title, url, view } = docMeta();
    const L = [`# Notes — ${title || 'untitled page'}`, ''];
    if (url) L.push(url);
    // The live address, on its own line and labeled, so a set pasted into a
    // session says which page it is about without the reader restating it.
    if (view) L.push(`Viewed at: ${view}`);
    if (url || view) L.push('');
    L.push(lead, '');
    return L;
  };

  // ONE note's block, numbered by its place in the set. Shared by both
  // serializations rather than written twice: the shelf's single-note reading
  // and the set the footer copies have to be the same shape, and two builders
  // would drift apart on the first change either one needed.
  const itemMarkdown = (it, n) => {
    const L = [];
    const t = it.target;
    const head = t.type === 'text' ? `"${clip(t.quote.exact, 70)}"`
      // A section names itself. The head is the one line a reader scans, and
      // for a section the title IS the answer, where a css path would be the
      // same noise it is for an element.
      : t.type === 'section' ? `§ ${t.title || 'section'}`
      : t.type === 'element' ? `element ${t.selector || ''}`
      // A page note pins to nothing, on purpose: the head says so, and the
      // header above already carries which page is meant.
      : t.type === 'page' ? 'the page'
      : 'region';
    L.push(`## ${n}. ${head}`);
    if (t.label) L.push(`Context: ${t.label}`);
    // The address rides the paste: a model asked to change this passage can
    // act on the path, where the quote alone leaves it guessing which of
    // three identical phrases was meant.
    const addr = addressText(t);
    if (addr) L.push('Path: `' + addr + '`');
    L.push('');
    const body = t.type === 'text' ? (t.display || t.quote.exact) : (t.excerpt || '');
    // A section's body is MARKDOWN, so the blockquote carries `##` and pipes
    // and fences intact. That is the point of the target: what travels is the
    // thing that can be revised and put back.
    const lines = quoteLines(body);
    if (lines.length) {
      L.push(...lines);
      L.push('');
    }
    // The label is what separates the reader's OWN words from anything the
    // paste's recipient adds around them: without it, a note typed on the
    // page and commentary typed after pasting are indistinguishable
    // (field-tested 2026-08-08, and they were).
    L.push(it.note ? '**Note:** ' + it.note : '**Note:** (none)', '');
    return L;
  };

  const today = () => new Date().toISOString().slice(0, 10);

  const toMarkdown = () => {
    const L = mdHead(`${S.items.length} note${S.items.length === 1 ? '' : 's'} · ${today()}`);
    S.items.forEach((it, i) => L.push(...itemMarkdown(it, i + 1)));
    return L.join('\n');
  };

  const jsonFor = (items) => {
    const { title, url } = docMeta();
    return {
      format: 'annotate/1',
      title, url,
      at: new Date().toISOString(),
      notes: items.map(it => ({ id: it.id, at: it.at, note: it.note, ...it.target })),
    };
  };

  const toJSON = () => jsonFor(S.items);

  // ── Outputs: copy, jot ────────────────────────────────────────────────────
  const fallbackCopy = (text) => {
    const d = S.doc || window.document;
    const ta = d.createElement('textarea');
    ta.setAttribute(UI_ATTR, '');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    d.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = d.execCommand('copy'); } catch { }
    ta.remove();
    return ok;
  };

  const copy = async (kind = 'md') => {
    const text = kind === 'json' ? JSON.stringify(toJSON(), null, 2) : toMarkdown();
    try { await navigator.clipboard.writeText(text); }
    catch { if (!fallbackCopy(text)) throw new Error('copy failed'); }
    return text;
  };

  // One note's WORDS, and nothing else. The set copies as markdown with each
  // note's quote, address and target above it, which is the right shape for
  // handing the review over and the wrong one for the commonest small errand:
  // taking the sentence you just dictated somewhere else. So this copies
  // `note` bare, with no heading, no quote and no address, and says so in its
  // title rather than leaving the reader to find out by pasting.
  const copyNote = async (id) => {
    const it = S.items.find(i => i.id === id);
    if (!it) return false;
    const text = it.note || '';
    if (!text) { setStatus('Nothing to copy: this note has no words yet', true); return false; }
    try {
      try { await navigator.clipboard.writeText(text); }
      catch { if (!fallbackCopy(text)) throw new Error('copy failed'); }
      setStatus('Note copied');
      return true;
    } catch { setStatus('Copy failed', true); return false; }
  };

  // Save the whole set as ONE jot (the markdown serialization), through the
  // same fresh-read → mutate → save discipline estate.js uses, so a
  // concurrent jot from another tab is never clobbered.
  const JOTS_PATH = 'lists/jots.json';
  const registry = () => (window.__shell && window.__shell.REGISTRY_REPO) || 'mehrlander/web-tools-private';

  const saveJot = async () => {
    if (!S.items.length) throw new Error('no notes to save');
    let token = window.TOKEN;
    if (!token) { try { token = localStorage.getItem('ghToken'); } catch { } }
    if (!token || !window.GH) throw new Error('no token: jots need a signed-in shell');
    const reg = new window.GH({ token, repo: registry(), ref: 'main' });
    if (typeof reg.save !== 'function' && window.gh && window.gh.load) await window.gh.load('gh-store.js');
    if (typeof reg.save !== 'function') throw new Error('gh-store.js unavailable');
    let items = [];
    try {
      const raw = JSON.parse((await reg.get(JOTS_PATH)).text);
      items = Array.isArray(raw.items) ? raw.items : [];
    } catch (e) { if (e && e.status && e.status !== 404) throw e; }
    const { title } = docMeta();
    items = [...items, {
      id: 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: toMarkdown(),
      created_at: new Date().toISOString(),
    }];
    await reg.save(JOTS_PATH, { items },
      `Jot "Notes — ${clip(title, 50)} (${S.items.length})" via annotate`);
    return items[items.length - 1];
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  // Light chrome throughout (a field decision, 2026-08-08: no dark fills).
  // Contrast comes from borders and shadow; the highlight yellow is the accent.
  const Z = 2147482600;
  // The read surface's ceiling, in px. Named because two surfaces answer to it:
  // the box itself, and the editor that replaces it, which has to scroll at the
  // same place or a typed note and a dictated one behave differently for no
  // reason a reader could name.
  const VIEW_MAX = 172;
  const BTN = 'border:1px solid #d4d4d8;border-radius:6px;padding:3px 8px;font:600 11px/1.6 ui-sans-serif,system-ui;'
    + 'background:#f4f4f5;color:#27272a;cursor:pointer;';
  // Named because two places set it: the key at rest, and the flash putting it
  // back. A literal in both is a colour that drifts on the next edit to either.
  const COPY_IDLE = '#52525b';

  // THE STATUS LINE IS GONE, and with it the band it sat in. It reported what
  // had happened ("Note added"), which every one of its messages announced
  // about something the reader had just watched happen, and then it stayed:
  // a confirmation with no expiry, still claiming a note was added ten notes
  // later. A card that says nothing is more honest than one whose last true
  // sentence is minutes old.
  //
  // Every call site survives, since a failure is not a confirmation and must
  // not vanish with one. An error reaches the console; the one action whose
  // failure a reader could not otherwise detect, Save jot, says so on its own
  // button (`jotState` below), which is where they were looking anyway.
  const setStatus = (msg, isErr) => {
    if (isErr && msg) { try { console.warn('[annotate] ' + msg); } catch { } }
  };

  const el = (tag, css, text) => {
    const e = S.doc.createElement(tag);
    e.setAttribute(UI_ATTR, '');
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };

  // Phosphor, the house icon set. The kit mounts into ARBITRARY documents (a
  // tossed page, any page the FAB rides), so it cannot assume the host loaded
  // an icon font: an unloaded one renders as empty boxes, which is why this
  // first shipped with text glyphs. Injecting the stylesheet is the better
  // answer than avoiding the convention, and it is skipped where the host
  // already has it.
  const ICONS = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.2/src/regular/style.css';
  const ensureIcons = () => {
    const d = S.doc;
    if (d.querySelector('link[data-annotate-icons], link[href*="phosphor"]')) return;
    const l = d.createElement('link');
    l.rel = 'stylesheet';
    l.href = ICONS;
    l.setAttribute('data-annotate-icons', '');
    l.setAttribute(UI_ATTR, '');
    d.head.appendChild(l);
  };
  // A button whose face is a Phosphor glyph. The name is kept on the element
  // so a mode change can swap it without rebuilding the button.
  const icon = (name, css, title) => {
    const b = el('button', css);
    const i = el('i', 'font-size:16px;line-height:1;');
    i.className = 'ph ph-' + name;
    b.appendChild(i);
    b._icon = i;
    if (title) b.title = title;
    return b;
  };
  const setIcon = (btn, name) => { if (btn && btn._icon) btn._icon.className = 'ph ph-' + name; };

  const mountUI = () => {
    const d = S.doc;
    // ONE surface, not two. The card used to collapse to a launcher pill, which
    // was a second thing to find and a second state to be in; dismissing it now
    // turns the annotator OFF, and the drawer's Notes tab is where it comes
    // back from. That tab is always there and always offers to start, so a
    // pill whose only job was "open the thing you already had" was carrying a
    // state the drawer already holds.
    // Two locks on the whole card, both of them about a phone.
    //
    // NO NATIVE SELECTION ANYWHERE IN IT. Everything here is furniture: the
    // caption, the note rows, the chips, the painted buffer. A long press over
    // furniture means "select this word" to the browser, which is how a card
    // that runs a selection mechanism of its own ended up handing out the
    // platform's instead (field report, 2026-08-12). The read surface carried
    // this already; the card did not, and the card is what a thumb lands on.
    // The textarea opts back in below, since a keyboard needs a real caret.
    //
    // NO TOUCH GESTURES either, except where a child asks for one. A drag
    // starting inside the card must never reach the page under it: it scrolls
    // the document, and inside an in-app browser presented as a sheet, a
    // document that scrolls at its top edge is the gesture that dismisses the
    // sheet. The two scrolling boxes take `pan-y` back, with the chain
    // contained so reaching their end does not hand the rest to the page.
    const root = el('div', `position:fixed;left:12px;bottom:12px;z-index:${Z};font:13px/1.45 ui-sans-serif,system-ui;`
      + 'touch-action:none;');
    // The selection lock is a RULE, in ensureStyle above, keyed on the same
    // attribute every piece of this card carries. Inline it did not survive:
    // the callout half is attribute-only, and the frame rewrites inline styles
    // on the text cell as it lays out.
    ensureStyle();

    // Panel: header / capture / list / footer, each its own band so the card
    // reads as a designed thing rather than a pile of buttons.
    const p = el('div', 'display:none;flex-direction:column;'
      + 'width:min(360px,90vw);max-height:min(480px,70vh);background:#fff;color:#27272a;'
      + 'border:1px solid #e4e4e7;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.16);overflow:hidden;');
    S.panel = p;

    // The header is the drag handle. A capture mode covers the page, so the
    // card has to be movable rather than dismissable: what it is in the way of
    // is exactly what you are trying to select.
    // 8px at the top so the gap above the title matches the 8px down either
    // side. The card's own 1px border counts on all four edges, so equal
    // padding is equal whitespace.
    const head = el('div', 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 8px 6px;'
      + 'cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;');
    holdTouch(head, 'button');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;      // a chip is not a handle
      const r = root.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      // Switch off the bottom anchor once, so the two do not fight.
      root.style.bottom = 'auto';
      root.style.top = r.top + 'px';
      root.style.left = r.left + 'px';
      const move = (ev) => {
        const w = win() || window;
        const maxX = Math.max(0, (w.innerWidth || 800) - r.width);
        const maxY = Math.max(0, (w.innerHeight || 600) - 44);
        root.style.left = Math.max(0, Math.min(maxX, ev.clientX - ox)) + 'px';
        root.style.top = Math.max(0, Math.min(maxY, ev.clientY - oy)) + 'px';
      };
      const up = () => {
        S.doc.removeEventListener('pointermove', move);
        S.doc.removeEventListener('pointerup', up);
        S.doc.removeEventListener('pointercancel', up);
      };
      S.doc.addEventListener('pointermove', move);
      S.doc.addEventListener('pointerup', up);
      S.doc.addEventListener('pointercancel', up);
      e.preventDefault();
    });
    // THE TITLE, THE COUNT AND THE WAY IN ARE ONE CONTROL: `Notes 3 ⌄`. They
    // were three, and the first two were the leftovers of a fourth: a title
    // button whose only job was opening the drawer's Notes tab, a count that
    // said how many and offered nothing, and a chevron. With the drawer gone
    // the title had no errand left, and a card that names itself, counts
    // itself and opens itself is saying one thing three times.
    //
    // It also buys back the header's second LINE. At the card's 360px the row
    // was 346px of content in 342px of room and wrapped the capture group
    // underneath; merged, it comes to roughly 329 and holds one line, which is
    // 30px of card back in a card being trimmed for height.
    //
    // 30px tall, matching the controls under it: a header control half their
    // height reads as a label that happens to be tappable, which is the
    // reading this button spent two rounds shedding. box-sizing, because the
    // height is the whole point and a content-box min-height would add the
    // padding and the border on top.
    S.expandBtn = icon('caret-up', 'box-sizing:border-box;min-height:30px;display:flex;'
      + 'align-items:center;gap:5px;padding:2px 9px;border:1px solid #e4e4e7;border-radius:7px;'
      + 'background:#fff;color:#18181b;font:700 13px ui-sans-serif,system-ui;cursor:pointer;');
    S.expandBtn._icon.style.fontSize = '13px';
    S.expandBtn._icon.style.color = '#71717a';
    S.expandBtn.insertBefore(el('span', '', 'Notes'), S.expandBtn._icon);
    // The number rides between the word and the chevron, and is empty until
    // there is one, so an untouched card reads simply `Notes ⌄`.
    S.countEl = el('span', 'font:400 12px ui-sans-serif,system-ui;color:#71717a;', '');
    S.expandBtn.insertBefore(S.countEl, S.expandBtn._icon);
    S.expandBtn.addEventListener('click', () => expand(!S.expanded));
    head.appendChild(S.expandBtn);

    // ON THE PAGE, the other reading of the same set. The card is where a note
    // is written and read; it is the wrong place to LOOK at a set, because the
    // list and the passages it is about cannot both be in frame. This folds the
    // list away and draws every note where it is pinned, which is the picture
    // worth screenshotting and the one the reader had to describe in words.
    S.placeBtn = icon('eye', 'box-sizing:border-box;min-height:30px;padding:0 8px;'
      + 'border:1px solid #e4e4e7;background:#fff;border-radius:7px;color:#3f3f46;cursor:pointer;'
      + 'display:flex;align-items:center;');
    S.placeBtn.addEventListener('click', () => showInPlace(!S.inPlace));
    head.appendChild(S.placeBtn);
    syncPlace();

    // ONE CONTROL, NOT A ROW OF THEM. The aims were a segmented group of four
    // riding the title row, which is four permanent buttons for a choice made
    // once per note and left alone, and it is what pushed the row to the edge
    // of wrapping. A menu says the same thing in the width of one: the button
    // carries the aim in force, the list carries the alternatives, and the
    // alternatives cost nothing until asked for.
    //
    // It also answers the question a row of toggles could not. Arming Element
    // and then changing your mind meant knowing to tap the lit chip again, an
    // exit with nothing on screen naming it. `Page` is the resting position
    // here, so backing out is picking the top item rather than recalling a
    // gesture.
    S.aimBtn = el('button', 'box-sizing:border-box;min-height:30px;margin-left:auto;'
      + 'display:flex;align-items:center;gap:5px;padding:2px 9px;background-color:#fff;'
      + 'border:1px solid #e4e4e7;border-radius:7px;color:#3f3f46;cursor:pointer;'
      + 'font:600 11px ui-sans-serif,system-ui;white-space:nowrap;');
    S.aimLabel = el('span', '', 'Page');
    S.aimBtn.appendChild(S.aimLabel);
    const aimCaret = el('i', 'font-size:12px;line-height:1;color:#a1a1aa;');
    aimCaret.className = 'ph ph-caret-down';
    S.aimBtn.appendChild(aimCaret);
    S.aimBtn.title = 'What the next note is about';
    S.aimBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAim(); });
    head.appendChild(S.aimBtn);

    // The menu lives on the BODY at fixed position, not inside the header. The
    // card is small and its panel clips; a list hanging out of a 30px row has
    // to escape its own container, and fixed coordinates read off the button
    // are what md-doc's section menu already does on this estate.
    S.aimMenu = el('div', 'display:none;position:fixed;z-index:' + (Z + 2) + ';'
      + 'min-width:196px;background-color:#fff;border:1px solid #e4e4e7;border-radius:10px;'
      + 'box-shadow:0 10px 26px rgba(0,0,0,.14);overflow:hidden;padding:3px;');
    const aimItem = (label, hint, title, fn) => {
      const b = el('button', 'display:flex;flex-direction:column;align-items:flex-start;gap:1px;'
        + 'width:100%;box-sizing:border-box;text-align:left;background-color:transparent;border:0;'
        + 'border-radius:7px;padding:6px 9px;cursor:pointer;color:#3f3f46;');
      b.appendChild(el('span', 'font:600 12px ui-sans-serif,system-ui;', label));
      b.appendChild(el('span', 'font:400 10.5px ui-sans-serif,system-ui;color:#a1a1aa;', hint));
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); closeAim(); fn(); });
      S.aimMenu.appendChild(b);
      return b;
    };
    // PAGE LEADS, and it is the only item that starts a note rather than
    // arming a gesture: there is nothing to aim at, so the draft opens on the
    // tap. It is also the way OUT of any mode, which is the whole reason the
    // resting position is named rather than implied.
    S.pageChip = aimItem('Page', 'no part: this page as a whole',
      'Note this page as a whole: no selection, the address rides the note',
      () => { endMode(); notePage(); });
    S.modeChips = {
      pick: aimItem('Element', 'tap an element, then + note',
        'Tap to select an element, then + note (pick Page to back out)',
        () => S.mode === 'pick' ? endMode() : startPick()),
      // CONDITIONAL, and it is the only item that is. The others work on any
      // page; this one needs a kits/md-doc.js render to aim at, and an item
      // that offers to aim at prose it cannot resolve is the dead control the
      // section menu already refuses to be.
      section: aimItem('Section', 'tap a section, then + note',
        'Tap a section of the document, then + note (pick Page to back out)',
        () => S.mode === 'section' ? endMode() : startPick({ aim: 'section' })),
      region: aimItem('Region', 'drag a rectangle, then + note',
        'Drag a rectangle, then + note (pick Page to back out)',
        () => S.mode === 'region' ? endMode() : startRegion()),
    };
    S.doc.body.appendChild(S.aimMenu);
    p.appendChild(head);

    // THE SELECTION BAR: what the card has recognized, and the one tap that
    // turns it into a note. Hidden until a selection has been staged.
    S.selBar = el('div', 'display:none;align-items:center;gap:6px;margin:0 8px 8px;'
      + 'background:#fefce8;border:1px solid #fde68a;border-radius:9px;padding:5px 6px 5px 9px;');
    S.selQuote = el('div', 'flex:1;min-width:0;color:#854d0e;font:italic 11.5px/1.35 ui-sans-serif,system-ui;'
      + 'overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;');
    S.selBar.appendChild(S.selQuote);
    const selGo = el('button', 'flex:0 0 auto;border:1px solid #eab308;border-radius:7px;'
      + 'background:#facc15;color:#18181b;padding:4px 9px;cursor:pointer;'
      + 'font:700 11px ui-sans-serif,system-ui;white-space:nowrap;', '+ note');
    selGo.title = 'Note the text you selected';
    // pointerdown is where a tap outside the selection collapses it, so the
    // default is refused here exactly as it is on the floating chip. The staged
    // target would survive either way; the selection the reader can still see
    // should survive too, since a control that clears what it is pointing at
    // reads as having missed.
    selGo.addEventListener('pointerdown', (e) => e.preventDefault());
    selGo.addEventListener('click', () => noteSelection());
    S.selBar.appendChild(selGo);
    const selX = icon('x', 'flex:0 0 auto;border:0;background:none;color:#a16207;cursor:pointer;'
      + 'padding:2px;display:flex;align-items:center;', 'Forget this selection');
    selX.addEventListener('pointerdown', (e) => e.preventDefault());
    selX.addEventListener('click', () => {
      setSelection(null);
      const s = win() && win().getSelection();
      if (s) s.removeAllRanges();
    });
    S.selBar.appendChild(selX);
    p.appendChild(S.selBar);

    // Compose: the panel IS the input surface, and by default it is a DISPLAY
    // rather than an input. Speaking fills it; the keyboard opens only if the
    // double tap asks for it. Appears only while a draft is staged.
    S.compose = el('div', 'display:none;flex-direction:column;gap:5px;padding:0 8px 8px;');
    S.compCap = el('div', 'color:#a16207;font-size:11px;font-style:italic;');

    // The read surface: committed text, then the interim in muted italic. Not
    // an input, so tapping it summons nothing.
    // Radius only on the bottom corners, and no top border: the punctuation
    // bar sits directly on top of it with the seam shared, so the two read as
    // one control rather than a strip of buttons floating above a box.
    // The height is WHOLE LINES, not a fraction of the viewport. 22vh landed
    // wherever it landed, which on a phone was five and a half lines: the box
    // ended mid-glyph and the newest line, the one being spoken, was the half.
    // Six lines of 26px, plus the 7px padding and the 1px border on each side,
    // which is why box-sizing is stated rather than inherited: under the
    // border-box every host page sets, the padding comes OUT of the height and
    // 170px was 5.92 lines. Measured by the scenario, not reasoned about.
    S.compView = el('div', 'flex:1;min-width:0;box-sizing:border-box;'
      + `min-height:68px;max-height:${VIEW_MAX}px;overflow-y:auto;background:#fff;`
      // Scrolls, so it takes vertical panning back from the card's lock, and
      // keeps the overscroll to itself.
      + 'touch-action:pan-y;overscroll-behavior:contain;'
      // Ordinary padding. The handles used to need room reserved here, and do
      // not any more: they are painted into the stack below, outside this
      // scrolling box, so a ball above the first line sits in the white space
      // beside the card rather than being clipped or pushing the text down.
      + 'border:0;padding:7px 9px;'
      // Bigger than the card's other type: this is the surface being dictated
      // INTO, read at arm's length while speaking rather than leaned over.
      + 'font:17px/26px ui-sans-serif,system-ui;color:#18181b;white-space:pre-wrap;word-break:break-word;');
    // The read surface is PAINTED by the kit (Dictate.paint), not written to
    // directly, so the buffer, the hypothesis, the caret and the selection all
    // render here exactly as they do in the stage's bar. What this file owns
    // is the gestures over it.
    S.compHint = el('span', 'color:#a1a1aa;', 'Listening. Double-tap or hold to type.');
    S.compBody = el('span', '');
    S.compView.appendChild(S.compBody);
    S.compView.appendChild(S.compHint);
    // No native selection anywhere in the card, which is what buys the right to
    // run a selection of our own. The rule is in ensureStyle; this element only
    // adds the context menu, which no stylesheet can refuse.
    S.compView.addEventListener('contextmenu', (e) => e.preventDefault());
    // The handles are measured against the layer, so scrolling the text under
    // them leaves them behind. Repaint on scroll rather than trying to offset:
    // one source of position beats two that must agree.
    S.compView.addEventListener('scroll', () => { if (S.dict && S.dict.range) paintDraft(); });

    // The editor, focused on open, which is the one moment the keyboard is
    // wanted. It is NOT a bigger box: it used to open at 30vh, which grew the
    // whole card the moment a reader switched from speaking to typing, and
    // nothing about typing asks for more of the page than dictating does. What
    // it gets instead is the room the control row was using, inside the height
    // the frame already had; openEditor pins it to the frame's measured height,
    // so the card holds still through the switch and back.
    // The one child that opts back OUT of the card's locks: a keyboard needs a
    // real caret, a real selection, and a scroll of its own.
    // box-sizing stated, not inherited: the pinned height below is the frame's
    // own, and under content-box the padding would be added to it.
    S.compTa = el('textarea', 'display:none;box-sizing:border-box;min-height:68px;'
      + 'background:#fff;color:#18181b;border:0;padding:8px 10px;'
      + 'font:17px/1.5 ui-sans-serif,system-ui;resize:none;overflow-y:auto;'
      + 'touch-action:pan-y;overscroll-behavior:contain;');
    S.compTa.placeholder = 'Note…';
    S.compTa.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditor(); });
    // PUTTING THE KEYBOARD AWAY IS LEAVING EDIT MODE. On a phone the reader
    // dismisses the keyboard with the keyboard's own key, which is a blur and
    // nothing else: the composer used to sit there afterwards still in edit
    // mode, showing a textarea nobody could type in and a Done button the
    // reader had already, as far as they were concerned, pressed. Taking the
    // blur is what lets the whole control row go in edit mode, since the way
    // out no longer has to be a button inside it.
    //
    // Nothing is lost on the way: closeEditor writes the textarea back to the
    // buffer, so a blur from switching apps, tapping the page, or reaching for
    // a chip on the card all keep the words and simply end the typing.
    S.compTa.addEventListener('blur', () => { if (S.editing) closeEditor(); });
    S.compTa.addEventListener('input', () => sizeEditor());

    // The punctuation PAD, a column down the right-hand side of the text
    // rather than a strip across the top of it. Three reasons, all about a
    // thumb rather than about layout. A right-edge column is where a thumb
    // already rests on a phone, so a mark is reachable without crossing the
    // screen. Vertically stacked keys can be tall AND wide, where six across
    // a narrow card could only be narrow. And three of them, rather than six,
    // means each is big enough to hit without looking.
    //
    // The other three ride a SHIFT. `.` `,` `?` carry ordinary prose; `;` `!`
    // `¶` are the ones reached for deliberately, and a deliberate mark can
    // afford a deliberate second tap. The toggle is momentary in feel but
    // sticky in fact: it stays until tapped back, since a reader inserting a
    // paragraph break often wants another.
    const PRIMARY = [{ m: '.' }, { m: ',' }, { m: '?' }];
    const SHIFTED = [{ m: ';' }, { m: '!' }, { m: '¶', icon: 'paragraph', title: 'New paragraph' }];
    // With a selection live the pad has a better job than inserting marks:
    // fixing the casing the recognizer got wrong, which is the correction a
    // selection is most often made FOR. Same three keys, same thumb, no new
    // control anywhere on the card.
    const CASING = [{ c: 'upper', label: 'AB', title: 'Upper case' },
                    { c: 'lower', label: 'ab', title: 'Lower case' },
                    { c: 'title', label: 'Ab', title: 'Capitalise' }];
    // And a fourth face, for the one repair a dictated note needs most. A
    // pause the reader did not mean as an ending arrives as a full stop with a
    // capital behind it, and putting that right is two edits at one seam.
    // Drop a CARET in the gap and the top key becomes the key that closes it:
    // the cell that writes a full stop is the cell that takes one back, which
    // is why it replaces `.` rather than standing somewhere new. Nothing is
    // lost while it is showing, since a full stop is the one mark that cannot
    // be wanted where one is already sitting.
    //
    // ONE KEY, not a set: the caret is the aim, so `,` and `?` stay where they
    // were and the pad does not rearrange itself under a thumb. The casing
    // swap can take all three because a selection means the reader is fixing
    // a word rather than writing.
    const STITCHED = [{ s: true, icon: 'arrows-in-line-horizontal',
                        title: 'Join this to the sentence before it: the full stop goes and the capital comes down' },
                      { m: ',' }, { m: '?' }];
    const padSet = () => (S.dict && S.dict.hasSelection) ? CASING
      : S.compShift ? SHIFTED
      : (S.dict && S.dict.canStitch) ? STITCHED
      : PRIMARY;
    S.compShift = false;
    // The punctuation column is one grid cell holding four stacked keys, with
    // hairlines of its own by the same means.
    S.compPunct = el('div', 'display:grid;grid-template-rows:repeat(4,1fr);gap:1px;background:#e4e4e7;');

    // Every control is a CELL in one grid now, so no key carries a border or a
    // radius of its own: the frame owns both, and the hairlines between cells
    // are the grid's own background showing through a 1px gap. That is the
    // whole trick behind "continuous", and it beats per-cell borders, which
    // double up wherever two cells meet and have to be unset edge by edge.
    const key = (bg) => 'border:0;background:' + (bg || '#fafafa') + ';color:#3f3f46;'
      + 'cursor:pointer;display:flex;align-items:center;justify-content:center;'
      // overflow:hidden per cell, because a cell that outgrows its column
      // paints over its neighbour rather than pushing it: the edit mode's
      // "Done" label did exactly that to the pad beside it. That label is
      // retired (edit mode has no row at all now), and the rule stays, since
      // it is about any cell that outgrows its column rather than that one.
      + 'font:600 19px/1 ui-sans-serif,system-ui;padding:0;min-height:38px;overflow:hidden;';
    // The BOTTOM ROW is shorter than the mark keys. The marks are aimed at by
    // a thumb over and over inside one note; the five actions along the bottom
    // are hit once each, so they can give their height back to the words. All
    // five have to carry it, including the delete key, which is why this is a
    // constant and not a suffix on four of them: the grid row takes the
    // tallest cell, so one key still at 38 held the whole row there.
    const CROW = 'min-height:30px;';
    const keys = [];
    for (let i = 0; i < 3; i++) {
      const b = el('button', key());
      // pointerdown, not click: a tap must not blur or scroll before the mark
      // registers, and the engine restart is already async.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const spec = padSet()[i];
        if (!S.dict) return;
        if (spec.s) { if (S.dict.stitch()) paintDraft(); return; }
        if (spec.c) { S.dict.recase(spec.c); paintDraft(); return; }
        S.dict.punct(spec.m);
        // A shifted mark drops the shift, the way a phone keyboard does: the
        // sticky case is the one the reader asked for by tapping again.
        if (S.compShift) { S.compShift = false; paintPunct(); }
      });
      keys.push(b);
      S.compPunct.appendChild(b);
    }
    S.compShiftBtn = el('button', key('#f4f4f5') + 'font-size:13px;letter-spacing:.04em;');
    S.compShiftBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // While a selection is live this key drops it, which is the way back to
      // the marks: the pad and the selection are one state, so one key ends
      // both rather than leaving a mode with no exit.
      if (S.dict && S.dict.hasSelection) { S.dict.clearRange(); S.compArmed = null; paintDraft(); return; }
      S.compShift = !S.compShift; paintPunct();
    });
    S.compPunct.appendChild(S.compShiftBtn);

    // Backspace takes the BOTTOM-RIGHT CORNER, under the punctuation column and
    // beside the save key. It sat inside that column, which put the one
    // destructive key in the middle of the inserting ones; the corner is the
    // furthest cell from a mark, still under the same thumb, and the frame's
    // two most consequential keys now sit together where the eye ends up. Red
    // on a tinted cell, because a slip should be recognizable as a slip.
    S.compBack = icon('backspace', key('#fef2f2') + CROW + 'color:#dc2626;',
      'Delete the last word (dictation keeps running)');
    S.compBack._icon.style.fontSize = '18px';
    S.compBack.addEventListener('pointerdown', (e) => { e.preventDefault(); S.dict && S.dict.backWord(); });

    // One painter for the pad, so the shift state has exactly one reading.
    paintPunct = () => {
      const sel = !!(S.dict && S.dict.hasSelection);
      const set = padSet();
      keys.forEach((b, i) => {
        const spec = set[i];
        b.textContent = '';
        // THE GLYPH IS BUILT HERE, not swapped. These keys are plain buttons
        // rather than icon() buttons, since most faces are a character; so
        // there was no `_icon` for setIcon to reach and the one key that
        // wanted a glyph, `¶`, painted EMPTY (measured 2026-08-15, jsdom, the
        // shifted set's third cell). Clearing the text above removes any
        // previous glyph with it, so building the element is also the only way
        // that survives a swap back.
        b._icon = null;
        if (spec.icon) {
          const ic = el('i', 'font-size:19px;line-height:1;');
          ic.className = 'ph ph-' + spec.icon;
          b.appendChild(ic);
          b._icon = ic;
          b.style.fontSize = '';
        } else { b.textContent = spec.label || spec.m; b.style.fontSize = spec.c ? '15px' : '19px'; }
        b.title = spec.title || ('Insert ' + spec.m);
        // The stitch key tints like the accent it is: it appears because of
        // where the caret is, so it has to be visibly not the key that was
        // there a moment ago.
        b.style.background = spec.s ? '#fef9c3' : (sel ? '#eff6ff' : '#fafafa');
      });
      S.compShiftBtn.textContent = sel ? '✕' : (S.compShift ? 'abc' : '·!¶');
      S.compShiftBtn.title = sel ? 'Drop the selection' : 'The other three marks';
      S.compShiftBtn.style.background = sel ? '#eff6ff' : (S.compShift ? '#fef9c3' : '#f4f4f5');
    };
    paintPunct();

    // The bottom row of the frame. It was a free-standing strip under a boxed
    // text area with gaps all round, which is three floating groups where the
    // reader sees one instrument: the marks down the right, the actions along
    // the bottom, and the words in the middle. They are one grid now, hairline
    // to hairline, and the text area is the hole in the middle of it.
    const CBTN = key() + CROW;
    const grow = (b) => { if (b._icon) b._icon.style.fontSize = '18px'; return b; };
    if (hasDictation()) {
      S.compMic = grow(icon('microphone', CBTN, 'Dictate (tap again to stop)'));
      S.compMic.addEventListener('click', () => S.dict && S.dict.toggle());
    }
    // UNDO AND REDO STAND WHERE THE PENCIL STOOD, and the pencil's retirement
    // is what paid for them. It was the way INTO the keyboard, which the double
    // tap already is, on the text or on the canvas, landing the caret where it
    // was aimed rather than at a button's idea of the end; and it had stopped
    // being the way out when the keyboard's own dismiss took that job. A
    // control whose every use has a shorter path is furniture, and this row has
    // no room for furniture.
    //
    // What it makes room for is the one thing a voice buffer could not do. A
    // recognizer mishears a whole phrase, and the delete key takes words one at
    // a time; undo takes the mutation, which is the unit the mistake arrived
    // in. The stack is kits/dictate.js's (whole snapshots, caret included), so
    // both surfaces that drive that buffer get it, not just this card.
    S.compUndo = grow(icon('arrow-counter-clockwise', CBTN, 'Undo the last change'));
    S.compUndo.addEventListener('click', () => { if (S.dict && S.dict.undo()) paintDraft(); });
    S.compRedo = grow(icon('arrow-clockwise', CBTN, 'Redo'));
    S.compRedo.addEventListener('click', () => { if (S.dict && S.dict.redo()) paintDraft(); });
    // THE CURSOR PAD. Press it and drag: the button does not move, the CARET
    // does. On a phone the only way to place a caret was to touch the text at
    // the place you were aiming at, which puts a thumb over the two words
    // either side of it, and a second tap there takes the word instead of
    // moving anything. So the one gesture for "put it between these two" hid
    // its own target and had a homonym. Here the finger is somewhere else
    // entirely and the eye stays on the text, which is the whole trick: what
    // travels is a virtual point that starts wherever the caret already is.
    // touch-action:none is what makes the drag WORK on a phone rather than
    // scrolling the page under it, the same reason the region cover carries
    // it: without it the browser claims the gesture before the second move.
    S.compPad = grow(icon('crosshair', CBTN + 'touch-action:none;',
      'Press and drag to move the cursor, or an armed selection edge'));
    bindCursorPad(S.compPad);
    S.compSave = grow(icon('check', CBTN + 'background:#facc15;color:#18181b;', 'Save note'));
    S.compSave.addEventListener('click', saveDraft);

    // ── The frame ────────────────────────────────────────────────────────
    // One grid, and the text area is the hole in the middle of it:
    //
    //     ┌─────┬─────┬─────┬─────┬─────┬────┐
    //     │                             │ .  │
    //     │           the words         │ ,  │
    //     │                             │ ?  │
    //     │                             │·!¶ │
    //     ├─────┼─────┼─────┼─────┼─────┼────┤
    //     │ mic │  ↶  │  ↷  │  ⌫  │  ✓  │ ⌖  │
    //     └─────┴─────┴─────┴─────┴─────┴────┘
    //
    // Four flexible columns plus a fixed one, so the right column and the
    // corner under it are the same width and the border never jogs. The
    // hairlines are the grid's own background through a 1px gap, which is why
    // no cell carries a border: two adjacent borders would double, and every
    // seam would have to be unset by hand.
    //
    // THE PAD TAKES THE CORNER, and it is the cell that most wants one: it is
    // the only control here that is held and dragged rather than tapped, and a
    // corner is where a thumb rests without covering anything. Undo and redo
    // sit inboard of the microphone, in the order every platform writes them,
    // and delete stays beside save. Every cell in the row is placed EXPLICITLY
    // rather than left to flow, so a missing microphone (a browser with no
    // recognizer) cannot slide the whole row one column left.
    //
    // FIVE flexible columns now, not four: retiring the pencil paid for one of
    // the pair and the row absorbed the other. At the card's 351px on a phone
    // that is a 60px key, wider than it is tall, which is what the row's
    // one-tap-each controls can afford where the mark keys could not.
    const GRID_LINE = '#e4e4e7';
    // minmax(0,1fr), not 1fr: a plain 1fr floors at the cell's min-content, so
    // the pencil growing the word "Done" in edit mode widened its column and
    // shoved the rest of the row sideways. Same standing: the label is gone and
    // the decree that the columns are equal outlives the case that found it.
    const frame = el('div', 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) 46px;gap:1px;'
      + `background:${GRID_LINE};border:1px solid #d4d4d8;border-radius:10px;overflow:hidden;`);
    S.compFrame = frame;
    S.compView.style.gridColumn = '1 / 6';
    S.compTa.style.gridColumn = '1 / 7';
    frame.appendChild(S.compView);
    frame.appendChild(S.compTa);
    frame.appendChild(S.compPunct);
    const place = (node, col) => { node.style.gridColumn = String(col); frame.appendChild(node); };
    // An absent mic still holds its column, and the blank that holds it is kept
    // on S: edit mode hides the row cell by cell, and a filler nobody could
    // reach would have stayed behind as one grey stripe under the textarea.
    S.compFill = S.compMic ? null : el('div', key() + 'cursor:default;');
    place(S.compMic || S.compFill, 1);
    place(S.compUndo, 2);
    place(S.compRedo, 3);
    place(S.compBack, 4);
    place(S.compSave, 5);
    place(S.compPad, 6);

    // The frame sits inside a bare positioned wrapper, and the WRAPPER is the
    // handles' layer. It has to be a second element: the frame clips its own
    // overflow to keep the corners round, and a selection pin routinely hangs
    // above the first line or below the last, where clipping would cut it in
    // half. The wrapper neither clips nor scrolls, so a ball may sit in the
    // white space beside the card. Listeners are delegated, since the painter
    // rebuilds the handles on every repaint.
    const stack = el('div', 'position:relative;');
    S.compStack = stack;
    stack.addEventListener('pointerdown', (e) => {
      const t = e.target;
      // Arming a pin and nothing else. The arrows and their confirm key used to
      // be handled here; the pad moves the armed edge now, and tapping the
      // pinhead again is still how it is put down.
      const edge = t && t.closest && t.closest('[data-edge]');
      if (edge) {
        e.preventDefault(); e.stopPropagation();
        const which = edge.getAttribute('data-edge');
        S.compArmed = (S.compArmed === which) ? null : which;
        paintDraft();
      }
    });
    stack.appendChild(frame);
    // Bound here rather than beside the view, because the pointerup listener
    // needs the stack: a tap on a handle has to reach the same tap counter as
    // a tap on a word, and a handle is not inside the scrolling box.
    bindComposeGestures(S.compView, S.compBody, stack);
    S.compose.appendChild(S.compCap);
    S.compose.appendChild(stack);
    p.appendChild(S.compose);

    // ── THE SET, once the expander has opened it ─────────────────────────
    // AND ITS CONTROLS RIDE THE HEADER, so the card has exactly one row of
    // them. The readings were a row of their own under the composer, which put
    // a strip of buttons BELOW the box a reader was typing into: the composer
    // grew and shrank with the draft, so the controls moved while they were
    // being aimed at, and a header that had just been trimmed to one line had a
    // second line of chrome two rows under it. Built here, beside the readings
    // it belongs to, and inserted into the header above.
    S.readBar = el('div', 'display:none;flex:1;justify-content:center;gap:2px;align-items:center;');

    // THREE SMALL KEYS, not a control bar. The readings were a full-width
    // segmented group, first with words in it and then with glyphs, and both
    // spent most of a 360px row on a choice that is made in one tap and
    // remembered: a slab of button across the card for three states, one of
    // them lit. Once the cells were glyphs the frame was the only thing left
    // claiming that much room, so the frame goes. What is left is three keys
    // the size of the Copy key beside them, and the lit one says which reading
    // is showing.
    //
    // The tap target is the honest cost: about 30px square rather than the
    // 110px cell a stretched group gave, which is under the 44px a platform
    // guideline asks for. Taken deliberately, since the row was carrying more
    // weight than the decision on it, and the keys sit apart from every other
    // control with nothing crowding them.
    S.readGroup = el('div', 'display:flex;gap:2px;align-items:stretch;');
    const readChip = (key, glyph, title) => {
      const b = icon(glyph, 'box-sizing:border-box;min-height:26px;min-width:30px;'
        + 'background-color:transparent;border:0;border-radius:6px;padding:0 6px;'
        + 'color:' + COPY_IDLE + ';cursor:pointer;display:flex;align-items:center;'
        + 'justify-content:center;');
      b._icon.style.fontSize = '15px';
      b.title = title;
      b.addEventListener('click', () => setReading(key));
      S.readGroup.appendChild(b);
      return b;
    };
    S.readChips = {
      notes: readChip('notes', 'list-bullets', 'The notes as a working list'),
      md: readChip('md', 'markdown-logo', 'The set as markdown, exactly as Copy hands it over'),
      json: readChip('json', 'brackets-curly', 'The set as annotate/1 JSON, exactly as Copy hands it over'),
    };
    S.readBar.appendChild(S.readGroup);
    head.insertBefore(S.readBar, S.aimBtn);

    // WHERE NOTES COME FROM, said once, to the reader who opened an empty set.
    // It names the aims the header offers and the one gesture no control can
    // carry, which is the one nobody guesses: selecting text on the page.
    // This is the card's only line of instruction, and it earns the exception
    // by being visible only when there is nothing else to show.
    S.empty = el('div', 'display:none;margin:0 8px 10px;padding:10px 16px;text-align:center;'
      + 'align-items:center;justify-content:center;flex-grow:1;flex-shrink:1;flex-basis:0;min-height:0;'
      + 'color:#a1a1aa;font:italic 12px/1.5 ui-sans-serif,system-ui;',
      'No notes yet. Select text on the page, or use Page, Element or Region above.');
    p.appendChild(S.empty);

    S.listEl = el('div', 'overflow-y:auto;touch-action:pan-y;overscroll-behavior:contain;'
      + 'display:flex;flex-direction:column;gap:5px;min-height:0;padding:0 8px 8px;');
    p.appendChild(S.listEl);

    // A serialization is SHOWN rather than described, which is the one thing a
    // button labelled by its format cannot do: a reader who is about to paste
    // a set into a session wants to see what will land there.
    // COPY WHAT IS SHOWN, and it needs no word at all. It sat in the footer as a
    // pair, "Copy markdown" and "Copy JSON", a format named twice over: once by
    // the strip and again on the button. Moving it beside the format chips made
    // them the qualifier, which left "Copy" doing nothing the glyph was not
    // already doing, on the one row of this card where every pixel is spoken
    // for. The title still says which format, for a pointer that hovers; a
    // finger has the chips a thumb's width to its left.
    // NO BOX AROUND IT. A bordered chip beside the reading keys would read as a
    // fourth key in the set, which is exactly what it is not: they choose a
    // reading and this one performs an errand. Bare glyph, no border and no
    // fill, separated by the group's own gap rather than by a frame. It no
    // longer takes `margin-left:auto`: it sat at the right end of a row it had
    // to itself, and in the header the aim button holds that end.
    // `background-color`, not the `background` shorthand, and that is a note
    // about the test rather than about the browser: jsdom's cssstyle drops a
    // preceding `background` when the `border` shorthand is parsed, so declared
    // that way the fill is invisible to the node test and only a browser ever
    // sees it. The longhand survives, and says the narrower true thing anyway.
    S.serialCopy = icon('copy', 'display:none;box-sizing:border-box;'
      + 'min-height:26px;padding:0 6px;background-color:transparent;border:0;border-radius:7px;'
      + 'color:' + COPY_IDLE + ';cursor:pointer;align-items:center;justify-content:center;');
    S.serialCopy._icon.style.fontSize = '15px';
    S.serialCopy.addEventListener('click', () => copyShown());
    // OUTSIDE the readings group, and that is what centring costs. The three
    // keys sit in a span that takes the header's leftover width and centres
    // them in it, so anything sharing that span moves them when it comes and
    // goes: Copy is absent on the Notes reading, and inside the group its
    // absence would slide all three sideways on every switch into a
    // serialization. It rides between the group and the aim button instead.
    head.insertBefore(S.serialCopy, S.aimBtn);

    // The pane is now nothing but the bytes: its bar went up into the header.
    S.serial = el('div', 'display:none;flex-direction:column;padding:0 8px 8px;'
      + 'flex-grow:1;flex-shrink:1;flex-basis:0;min-height:0;');
    // NOT selectable, like everything else here. The card runs a selection
    // mechanism over the page, so a long press that hands out the platform's
    // own selection inside the card is the confusion the lock exists to
    // prevent; the copy key beside it is the errand a reader would have been
    // dragging across this text to do.
    S.serialPre = el('pre', 'flex:1;min-height:0;margin:0;overflow:auto;touch-action:pan-y;'
      + 'overscroll-behavior:contain;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;'
      + 'padding:7px 9px;white-space:pre-wrap;word-break:break-word;color:#3f3f46;'
      + 'font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;');
    S.serial.appendChild(S.serialPre);
    p.appendChild(S.serial);

    // What is left of the set's actions once copying moved into the tab: the
    // two verbs that are neither a reading nor a format, and so belong to the
    // set however it is being read. A footer of four, two of them naming
    // formats already named a row above, was the row this pair is left from.
    S.setActs = el('div', 'display:none;flex-wrap:wrap;align-items:center;gap:5px;'
      + 'padding:6px 8px;border-top:1px solid #f4f4f5;');
    const setAct = (label, title, fn, css) => {
      const b = el('button', BTN + (css || ''), label);
      b.title = title;
      b.addEventListener('click', fn);
      S.setActs.appendChild(b);
      return b;
    };
    // THE ONE ACTION THAT REPORTS, and it reports on itself. Saving a jot is a
    // network write against a registry that can refuse it (no token, no
    // signed-in shell), and a silent refusal is the one failure here a reader
    // has no other way to notice: a copy that failed shows up on the paste, a
    // clear that failed leaves the notes on screen. The label carries it for
    // two seconds and goes back, so nothing is left claiming a stale success.
    S.jotBtn = setAct('Save jot', 'Save the set as one jot in the estate registry', async () => {
      const b = S.jotBtn;
      const back = () => { b.textContent = 'Save jot'; b.style.color = ''; };
      clearTimeout(S.jotTimer);
      b.textContent = 'Saving…';
      b.style.color = '#71717a';
      try {
        await saveJot();
        b.textContent = 'Saved';
        b.style.color = '#15803d';
      } catch (e) {
        setStatus((e && e.message) || 'jot failed', true);
        b.textContent = 'Failed';
        b.style.color = '#b91c1c';
      }
      S.jotTimer = setTimeout(back, 2000);
    });
    // Tinted for what it does, and a single tap, which is the rule the row's
    // own trash key already follows: a destructive verb behind a confirmation
    // buys one safe tap at the cost of two on everything else.
    setAct('Clear', 'Remove every note in this set', () => clear(),
      'margin-left:auto;background:#fef2f2;border-color:#fecaca;color:#b91c1c;');
    p.appendChild(S.setActs);

    root.appendChild(p);
    d.body.appendChild(root);
    S.ui = root;
    renderList();
  };


  const renderList = () => {
    if (!S.listEl) return;
    // THE NUMBER ALONE. The count is a button now, carrying padding, a border
    // and a chevron that a bare span did not, and the noun was the one part of
    // it that was never load-bearing: it sits beside a title reading Notes.
    // Measured at the card's 360px, the header row comes to 346px of content
    // in 342px of room and wraps the capture group onto a second line, which
    // it did before this too (main: 347px, the same two lines). So the shorter
    // label is not what saves the row; it is what keeps the button from being
    // wider than the span it replaced, which would have been a real cost.
    if (S.countEl) S.countEl.textContent = S.items.length ? String(S.items.length) : '';
    S.listEl.textContent = '';
    // AN EMPTY LIST IS NOT A BAND. Its bottom padding separates the last note
    // from the card's edge; with no notes there is nothing to separate, and
    // the 8px stacked under the composer's own 8px and read as the card
    // being bottom-heavy. Measured with a draft open and nothing filed: 17px
    // below the frame against 9 down either side.
    S.listEl.style.paddingBottom = S.items.length ? '8px' : '0';
    // A NOTE BEING EDITED IS NOT ALSO A ROW. Reopening one through the pencil
    // put it on screen twice: once in the composer with a caret in it, and
    // once as a static row underneath still showing the text being replaced.
    // Which of the two was the note was left to the reader, and the row was
    // the one that looked settled. The composer is the note while it is open;
    // the row comes back when the edit is saved.
    //
    // The number does not move with it. The note still exists, and a count
    // that dropped to 0 while its one note sat in the composer would be
    // reporting a deletion nobody asked for.
    const editing = S.draft && S.draft.editId;
    S.items.forEach((it, i) => {
      if (it.id === editing) return;
      const on = it.id === S.selId;
      const row = el('div', 'position:relative;display:flex;gap:8px;align-items:flex-start;'
        + `background:${on ? '#fffbeb' : '#fff'};border:1px solid ${on ? '#eab308' : '#ececee'};`
        + 'border-radius:10px;padding:7px 10px;cursor:pointer;');
      const body = el('div', 'flex:1;min-width:0;');
      const t = it.target;
      // The caption alone reserves room for the floating keys, so the quote
      // wraps clear of them while the note and the address below run the full
      // width. Reserving it on the ROW would indent every line of every note
      // for controls that are used once.
      body.appendChild(el('div', 'color:#a16207;font-size:11px;font-style:italic;'
        + 'margin-bottom:2px;padding-right:84px;',
        (i + 1) + '. ' + (t.type === 'text' ? '“' + clip(t.quote.exact, 70) + '”'
          : t.type === 'section' ? '§ ' + clip(t.title || t.excerpt, 70)
          : t.type === 'element' ? '⌖ ' + clip(t.excerpt || t.selector, 70)
          : t.type === 'page' ? '▤ this page'
          : '▭ ' + clip(t.excerpt, 70))));
      body.appendChild(el('div', 'font-size:12.5px;color:#3f3f46;white-space:pre-wrap;', it.note || '(no note)'));
      // The address is shown, not just stored: seeing which paragraph a note
      // landed in is half of trusting that it landed on the right one.
      const addr = addressText(t);
      if (addr) {
        body.appendChild(el('div', 'margin-top:3px;color:#a1a1aa;word-break:break-all;'
          + 'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;', addr));
      }
      // THREE BUTTONS OVER THE ROW, where a menu behind a ⋮ used to be. The
      // menu was one tap to open, a second to choose, and a popup placed
      // against the viewport because a scrolling list cannot hold one: roughly
      // forty lines to reach two verbs. Each verb is now its own key, sitting
      // where the menu would have opened.
      //
      // They FLOAT rather than taking a column. A column would push the quote
      // in on every row forever to hold room for controls used once; floating
      // them costs the right end of one clipped line, which the quote is
      // already ellipsing, and buys the note its full width. That is the trade
      // the reader asked for in those words: obscure a little, block nothing.
      // The wash behind them is the row's own colour, so the cluster reads as
      // sitting on the note rather than punched through it.
      //
      // Remove is a single tap now, and it is tinted for it. A destructive
      // verb behind a menu was the older reasoning and it bought a second tap
      // at the cost of two on every edit and every copy; the honest exchange
      // is to make the key look like what it does, which is the same rule the
      // pad's backspace follows. It sits at the far end, furthest from the
      // pencil a reader is actually aiming at.
      const acts = el('div', 'position:absolute;top:4px;right:5px;display:flex;gap:1px;'
        + `background:${on ? 'rgba(255,251,235,.82)' : 'rgba(255,255,255,.82)'};`
        + 'border-radius:8px;padding:1px;');
      const act = (glyph, title, tint, fn) => {
        const b = icon(glyph, 'border:0;background:none;cursor:pointer;border-radius:7px;'
          + 'width:27px;height:24px;display:flex;align-items:center;justify-content:center;'
          + 'padding:0;color:' + tint + ';', title);
        b._icon.style.fontSize = '14px';
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
      };
      acts.appendChild(act('pencil-simple', 'Edit this note', '#a1a1aa', () => editNote(it.id)));
      acts.appendChild(act('copy', 'Copy this note’s text', '#a1a1aa', () => copyNote(it.id)));
      acts.appendChild(act('trash', 'Remove this note', '#dc2626', () => remove(it.id)));
      row.appendChild(body);
      row.appendChild(acts);

      // Tapping a row toggles selection. Tapping the selected one again lets
      // go, which is the only way to clear it without hunting for blank page.
      row.addEventListener('click', () => select(on ? null : it.id));
      if (on) S.selRow = row;
      S.listEl.appendChild(row);
    });
    if (S.selRow && S.selId) {
      try { S.selRow.scrollIntoView({ block: 'nearest' }); } catch { }
      S.selRow = null;
    }
    // Every path that changes the set lands here, so this is the one place the
    // expanded readings have to be brought along: a note added while the JSON
    // is showing repaints the JSON, and the last note removed takes the whole
    // set band with it.
    syncBody();
  };

  // ── The draft: compose in the panel, not on the page ──────────────────────
  // Phone feedback (2026-08-08): the floating bubble was one surface too
  // many. A staged selection becomes a DRAFT: the panel flips to compose mode
  // (caption of what was selected, the input, dictation where the browser has
  // it) and returns to the list on save or cancel. While composing, an
  // element or region draft keeps its outline painted so what you selected
  // stays visible on the page.
  // The draft's text lives in the dictation buffer, which the editor edits and
  // speech appends to. One owner, so the two paths cannot disagree.
  const draftText = () => (S.editing && S.compTa ? S.compTa.value : (S.dict ? S.dict.text : ''));

  const paintDraft = () => {
    if (!S.compBody) return;
    const text = S.dict ? S.dict.text : '';
    if (window.Dictate && window.Dictate.paint) {
      window.Dictate.paint(S.compBody, {
        text, interim: S.compInterim || '',
        range: S.dict ? S.dict.range : null, armed: S.compArmed,
        overlay: S.compStack,      // outside the scroll box, so nothing clips
        // A caret at the very end is a null range, so without this the one
        // place the pad can always reach is the one place it shows nothing.
        endCaret: true,
        // No arrow cluster: the pad drags an armed pin the same way it drags
        // the caret, so a pair of arrows chasing the pin around is furniture
        // for a job already done. The stage keeps them, having no pad.
        arrows: false,
        // And no pins once a mouse or a keyboard is in play: drag, shift-click
        // and shift-arrow do the extending, so the handles are furniture for a
        // job the platform's own gestures already do. The selection stays
        // painted; only the thing you would have tapped goes.
        handles: !S.precise,
      });
    } else { S.compBody.textContent = text; }
    S.compHint.style.display = (text || S.compInterim) ? 'none' : 'inline';
    // THE HINT IS WHERE THE GESTURE IS TAUGHT, and that is load-bearing now
    // that the pencil is gone: a double tap is the only way to the keyboard,
    // and a gesture nobody names is a gesture nobody finds. It still reports
    // the engine rather than the mode, which is the older rule: a staged page
    // note with the microphone off used to say it was listening and hear
    // nothing, which is the worst thing a recorder can say.
    // Both doors are named, and naming the press is honest HERE in a way it
    // would not be generally: the hint shows only while the buffer is empty,
    // and an empty buffer has no words, so every point on the surface is
    // canvas and a press anywhere opens the keyboard.
    S.compHint.textContent = !S.dict ? 'Double-tap or hold to type.'
      : S.dict.listening ? 'Listening. Double-tap or hold to type.'
      : 'Tap the microphone to dictate, or double-tap here to type.';
    // The pad belongs to dictation mode, not to the moment of speaking: the
    // keyboard carries its own punctuation, so typing mode hides it, and a
    // browser with no recognizer never shows it. The text box is a closed box
    // either way now that the pad sits beside it rather than on top of it, so
    // there is no shared seam to open and close.
    // THE MARKS COLUMN ANSWERS ITSELF. It already swaps to the casing keys when
    // a selection is live, and those are the one thing here a keyboard cannot
    // do: there is no key for "capitalise this". So the column goes on a
    // precise device only while there is nothing selected, which is exactly
    // when it is the marks, and every mark on it is a keystroke away.
    const marks = !S.editing && !!S.dict && (!S.precise || S.dict.hasSelection);
    S.compPunct.style.display = marks ? 'grid' : 'none';
    // With the marks away, the text spans the column they held: an empty cell
    // would show as a grey panel, since the grid's background IS the hairline.
    // Six lines now that the row has five flexible columns, and these two
    // numbers have to move with the template: they did not when the row grew,
    // and the read surface stopped one column short, which pushed the marks
    // into a flexible cell and left the fixed one showing as a grey stripe.
    S.compView.style.gridColumn = marks ? '1 / 6' : '1 / 7';
    paintPunct();     // the pad's face follows the selection, so it repaints with the text
    // THE WHOLE CONTROL ROW BELONGS TO THE READ SURFACE. In edit mode it goes,
    // and this is the third answer to one question. First the row's cells were
    // hidden one at a time, which collapsed the row and slid the pencil into
    // the microphone's slot, so a green button in the mic's place read as a
    // live recorder. Then they were dimmed instead, on the rule that a grid
    // cell which disappears takes its column with it and the frame's border
    // must never jog. Both were arguments about which controls to keep, and the
    // honest answer is none: the keyboard brings its own delete, its own caret
    // and its own punctuation, so every key here is either a duplicate or a
    // control for the mode you are not in. Hiding the ROW cannot jog a border,
    // since there is nothing left beside it to line up with; the frame becomes
    // what it looks like, a plain box you are typing in.
    //
    // What that leaves out is Save, and deliberately: the way out of the
    // keyboard is the keyboard's own dismiss, which blurs the textarea and
    // returns the read surface with its own ✓ standing where it always is.
    const row = [S.compMic, S.compFill, S.compUndo, S.compRedo, S.compBack, S.compSave];
    for (const b of row) { if (b) b.style.display = S.editing ? 'none' : 'flex'; }
    // THE PAD IS THE ONE CONTROL A POINTER MAKES POINTLESS. It exists because
    // touching the text to place a caret puts a thumb over the two words
    // either side of the target; a click has no such problem and lands on the
    // character. Undo, redo, delete and save stay on every device, since none
    // of them has a keyboard route here (the modifiers are left to the
    // platform), and the microphone is not an input-kind question at all.
    if (S.compPad) S.compPad.style.display = (S.editing || S.precise) ? 'none' : 'flex';
    // Save takes the corner the pad gave up. A hidden cell does not close its
    // column: the grid's own background IS the hairline, so an empty 46px cell
    // reads as a grey stripe in the bottom corner, which is the same defect the
    // marks column had when the row grew to five and the text span did not.
    if (S.compSave) S.compSave.style.gridColumn = S.precise ? '5 / 7' : '5';
    // Undo and redo say whether there is anything to undo. A key that is
    // always lit is a key you tap to find out, and finding out costs a
    // mutation on a buffer someone is dictating into.
    const step = (b, live) => {
      if (!b) return;
      b.disabled = !live;
      b.style.opacity = live ? '' : '.3';
      b.style.cursor = live ? 'pointer' : 'default';
    };
    step(S.compUndo, !!(S.dict && S.dict.canUndo));
    step(S.compRedo, !!(S.dict && S.dict.canRedo));
    const listening = !!(S.dict && S.dict.listening);
    if (S.compMic) {
      // Red means live, the one convention every recorder shares. It was
      // yellow, which is this UI's ordinary accent and so said "active
      // control" rather than "the microphone is open right now". The glyph
      // stays a microphone: swapping it for a stop square named the action but
      // stopped naming the state, and the state is the thing worth knowing.
      S.compMic.style.background = listening ? '#fef2f2' : '#f4f4f5';
      S.compMic.style.borderColor = listening ? '#dc2626' : '#d4d4d8';
      S.compMic.style.color = listening ? '#dc2626' : '#27272a';
      S.compMic.title = listening ? 'Recording. Tap to stop.' : 'Dictate (tap again to stop)';
    }
  };

  // ── The keyboard, on a device that has one ────────────────────────────────
  // A DRAFT IS OPEN AND SOMEONE IS TYPING: the keys belong to the note. The
  // read surface is a display rather than an input, so it takes no keystrokes
  // of its own, and until now a desktop reader had to ask for a textarea
  // before a keyboard did anything. Nothing about a physical keyboard needs
  // asking: the fact that a printable key arrived IS the device saying it has
  // one, which is a better test than any media query, and it covers a keyboard
  // paired to a phone for free.
  //
  // What this does NOT do is retire edit mode. The textarea is what summons a
  // soft keyboard, and on a phone that is the whole point of it; this only
  // means the mode is unnecessary where a keyboard is already present.
  const EDITABLE = 'input,textarea,select,[contenteditable=""],[contenteditable="true"]';

  // ── The selection's anchor ────────────────────────────────────────────────
  // Extending a selection needs to know which END is being moved, and the
  // buffer holds {start, end} without saying. That is right: which end has the
  // focus is a fact about the gesture in progress, not about the text, so it
  // lives here and dies the moment anything else happens. Defaults read the
  // buffer, so a selection made by drag or long press extends from its far end
  // the first time shift is used on it, which is what every text box does.
  const dropAnchor = () => { S.selAnchor = S.selFocus = null; };
  const anchorOf = (d) => (S.selAnchor != null ? S.selAnchor
    : d.range ? d.range.start : d.text.length);
  const focusOf = (d) => (S.selFocus != null ? S.selFocus
    : d.range ? d.range.end : d.text.length);
  const extendTo = (d, to) => {
    const i = Math.max(0, Math.min(d.text.length, to));
    const a = anchorOf(d);
    S.selAnchor = a;
    S.selFocus = i;
    if (i === a) d.caretAt(a); else d.select(a, i);
  };

  const onKey = (e) => {
    // No draft, no target: the annotator is not a text editor at rest, and a
    // reader picking an element or reading the list is not writing.
    if (!S.draft || S.editing || !S.dict) return;
    // A key that reaches this handler is a physical keyboard, since the soft
    // one only exists inside the textarea, which returns above.
    S.precise = true;
    const t = e.target;
    if (t && t.closest && t.closest(EDITABLE)) return;   // the host's own field wins
    const d = S.dict;
    // THE THREE SHORTCUTS THIS CARD CLAIMS, and the only ones. Undo, redo and
    // word-delete were reachable on a phone (they are keys on the row) and by
    // no keystroke at all, which left a keyboard reader tapping a button for
    // the one operation every editor binds. Claiming them costs the platform
    // nothing here: with a draft staged there is no native editable focused,
    // so the browser's own undo has nothing to undo and its own word-delete
    // has nothing to delete.
    //
    // Both spellings of each, because the platforms disagree and the card does
    // not know which one it is on: cmd or ctrl for undo, alt or ctrl for the
    // word. Redo takes shift-Z and ctrl-Y, which covers the same split.
    const mod = e.ctrlKey || e.metaKey;
    const low = (e.key || '').toLowerCase();
    if (mod && low === 'z') { if (e.shiftKey) d.redo(); else d.undo(); }
    else if (mod && low === 'y') d.redo();
    else if ((e.altKey || e.ctrlKey) && e.key === 'Backspace') d.backWord();
    else if (e.ctrlKey || e.metaKey || e.altKey) return;   // every other shortcut is the platform's
    else {
      onPlainKey(e, d);
      return;
    }
    // The three above share their tail: an edit invalidates the extension, and
    // undo restores a range of its own that the anchor would fight.
    dropAnchor();
    e.preventDefault();
    S.compArmed = null;
    paintDraft();
  };

  const onPlainKey = (e, d) => {
    const at = () => (d.range ? d.range.start : d.text.length);
    const end = () => (d.range ? d.range.end : d.text.length);
    // SHIFT EXTENDS, on the same four keys. A letter typed with shift is just
    // a capital, which is why the modifier guard above lets it through.
    const sh = !!e.shiftKey;
    const plain = (fn) => { dropAnchor(); fn(); };
    if (e.key && e.key.length === 1) plain(() => d.type(e.key));
    else if (e.key === 'Enter') plain(() => d.type('\n'));
    else if (e.key === 'Backspace') plain(() => d.erase());
    else if (e.key === 'ArrowLeft') {
      if (sh) extendTo(d, focusOf(d) - 1);
      else plain(() => d.caretAt(d.hasSelection ? at() : at() - 1));
    } else if (e.key === 'ArrowRight') {
      if (sh) extendTo(d, focusOf(d) + 1);
      else plain(() => d.caretAt(d.hasSelection ? end() : end() + 1));
    } else if (e.key === 'Home') {
      if (sh) extendTo(d, 0); else plain(() => d.caretAt(0));
    } else if (e.key === 'End') {
      if (sh) extendTo(d, d.text.length); else plain(() => d.caretAt(d.text.length));
    } else return;                                       // everything else is the page's
    e.preventDefault();
    S.compArmed = null;
    paintDraft();
  };

  // ── Gestures over the painted buffer ──────────────────────────────────────
  // Four, and no drag among them. A LONG PRESS selects the word under the
  // finger, or OPENS THE KEYBOARD where there is no word under it. A DOUBLE
  // TAP opens the keyboard with the caret where it landed. Tapping a HANDLE
  // arms it. The next tap in the text places the armed edge there.
  //
  // The press has two readings because the surface has two regions, and each
  // reading is the only sensible one for its region. Over words, "take this
  // word" is what a press means everywhere. Off them there is no word to take,
  // and the press used to do nothing at all, which is a dead gesture over the
  // largest target on the card. It is the keyboard's second door now, which
  // matters because the double tap became its only one when the pencil went:
  // one way in is a bet on a gesture landing, and the blank space under the
  // words is exactly where a thumb reaches when it wants to type.
  //
  // Tap-to-arm rather than drag-to-extend is the point. Dragging a handle puts
  // the finger over the words being aimed at, which is the problem every
  // platform then patches with a floating magnifier; not dragging means
  // nothing to magnify. Two taps also survive a scroll, a mis-hit, and a
  // change of mind, none of which a drag does.
  //
  // The tap that lands with nothing armed COLLAPSES the selection to a caret
  // where it landed, so placing an insertion point costs the same gesture as
  // dismissing a selection and there is no third thing to learn.
  const LONG_MS = 450, SLOP = 10, DBL_MS = 300;

  const offsetFromPoint = (host, x, y) => {
    const d = host.ownerDocument, w = d.defaultView;
    let node = null, off = 0;
    if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
    else if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
    if (!node || !w || !window.Dictate) return null;
    // A point in the box's padding can resolve to a node OUTSIDE the painted
    // span (the box itself, the placeholder). offsetAt would walk its children
    // and answer with the buffer's length, which reads as a real position and
    // is not one. Every tap path already gates on hitsText, so this only ever
    // fires for the cursor pad, which aims at points nobody tapped.
    if (host.contains && node !== host && !host.contains(node)) return null;
    return window.Dictate.offsetAt(host, node, off);
  };

  // `surface` is the SCROLL BOX and `host` the painted span inside it. They
  // have to be two things: a span shrink-wraps to its text, so the blank
  // canvas below the last line belongs to the box, and listeners bound to the
  // span never saw a tap there at all. That was the whole of the bug, and it
  // is invisible from the code, since every tap that lands on words works.
  // Offsets still resolve against the span, which is what the painter built.
  //
  // `layer` is where the pointerUP is heard, and it has to be the wider one.
  // A pin sits OUTSIDE the scroll box, in the unclipped overlay, so a tap that
  // lands on one is invisible to a listener bound to the box: the tap after a
  // long press, which is exactly the tap that moves the armed edge, was being
  // eaten by furniture the selection had just painted. Found in a real
  // browser, which is the only place it can be found, since the pin has to
  // have a position for the finger to reach.
  function bindComposeGestures(surface, host, layer) {
    let timer = null, downX = 0, downY = 0, longFired = false, lastTap = 0, taps = 0;
    // A MOUSE DRAG SELECTS, the way it does in every text box ever shipped.
    // The tap-to-arm pins exist because a finger dragging a handle covers the
    // words it is aiming at; a pointer does not, and asking a desktop reader to
    // tap twice for what one drag has always done is the gesture model leaking
    // out of the case it was designed for. `anchor` is the offset the press
    // began on, and it is only ever set for a mouse: on touch the same drag
    // scrolls the box, which is the one thing that must not change.
    let anchor = null, dragging = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    // A tap on the canvas is a request to go back to the end and start
    // appending: it drops the selection, disarms, and puts the caret past the
    // last character, which in this buffer is the same state as having no
    // range at all. It is the one-tap way out of selection mode, and it reads
    // the way tapping past the text reads in any editor.
    //
    // WITH A PIN ARMED it means the opposite, and the two readings do not
    // compete. A tap in the text puts the armed pin where it landed; the blank
    // canvas past the last character is a place, not an absence, and the place
    // it names is the end. So "arm the end pin, tap past the text" is select-
    // to-end, which is the one extent with no other gesture: the last word is
    // often the shortest and the hardest to hit, and dropping the whole
    // selection was the reading a reader gets exactly once before distrusting
    // the canvas. The pin's LABEL is left alone, the same as an in-text tap
    // that crosses the other edge: one rule, which is that the armed pin goes
    // where you tapped.
    const toEnd = () => {
      if (S.compArmed && S.dict.hasSelection) {
        S.dict.moveEdge(S.compArmed, S.dict.text.length);
        paintDraft();
        return;
      }
      S.dict.caretAt(S.dict.text.length);
      S.compArmed = null;
      paintDraft();
    };

    on(surface, 'pointerdown', (e) => {
      if (S.editing || !S.dict || S.padDrag) return;   // the pad owns the pointer
      downX = e.clientX; downY = e.clientY; longFired = false;
      dragging = false;
      if (e.pointerType === 'mouse') S.precise = true;
      else if (e.pointerType === 'touch') S.precise = false;   // a finger takes it back
      anchor = e.pointerType === 'mouse' ? offsetFromPoint(host, e.clientX, e.clientY) : null;
      // SHIFT-CLICK EXTENDS rather than places, and the drag that may follow
      // keeps the same fixed end. The click's own offset becomes the focus, so
      // shift-click then drag reads as one continuous adjustment, which is how
      // it behaves in a text box and how a reader corrects a selection whose
      // far end is off screen.
      if (anchor != null && e.shiftKey) {
        const fixed = anchorOf(S.dict);
        extendTo(S.dict, anchor);
        anchor = fixed;
        dragging = true;
        S.compArmed = null;
        paintDraft();
        return;                       // no long-press timer under a modifier
      }
      dropAnchor();
      clear();
      timer = setTimeout(() => {
        timer = null; longFired = true;
        // OFF THE TEXT, the press is a request for the keyboard. It used to
        // return here on the reading that a press over blank canvas is an aim
        // that missed; what that missed is that the canvas is a region, not a
        // near-miss, and the reader holding a finger on it is not aiming at a
        // word. Nothing is collapsed on the way: openEditor takes the caret
        // the buffer is already holding, so a selection the reader was about
        // to refine arrives in the textarea rather than being dropped.
        if (!window.Dictate.hitsText(host, downX, downY)) { openEditor(); return; }
        const i = offsetFromPoint(host, downX, downY);
        if (i == null) return;
        S.dict.selectWordAt(i);
        S.compArmed = null;
        paintDraft();
      }, LONG_MS);
    });

    on(surface, 'pointermove', (e) => {
      const far = Math.abs(e.clientX - downX) > SLOP || Math.abs(e.clientY - downY) > SLOP;
      if (timer && far) clear();
      // Past the slop with the button down, the drag is a selection. Under the
      // slop it is a click that wobbled, and turning that into a one-character
      // selection is how a text box feels twitchy.
      if (anchor == null || !e.buttons || !(far || dragging)) return;
      const i = offsetFromPoint(host, e.clientX, e.clientY);
      if (i == null) return;
      dragging = true;
      S.compArmed = null;
      // Collapsing back onto the anchor is a caret, not an empty selection.
      // Recorded as the anchor and focus too, so a shift-arrow after a drag
      // carries on from where the drag stopped rather than from the buffer's
      // idea of which end came first.
      S.selAnchor = anchor;
      S.selFocus = i;
      if (i === anchor) S.dict.caretAt(i); else S.dict.select(anchor, i);
      paintDraft();
    });

    on(surface, 'pointercancel', () => { clear(); anchor = null; dragging = false; });

    on(layer || surface, 'pointerup', (e) => {
      clear();
      // A drag ENDS here and claims the release: the tap logic below would
      // read it as a click and put a caret where the selection just finished.
      if (dragging) { dragging = false; anchor = null; taps = 0; return; }
      anchor = null;
      if (S.editing || !S.dict || longFired || S.padDrag) return;
      // Three kinds of target, and only two of them are part of a tap run: the
      // text surface, and the furniture the selection painted (a pin, an
      // arrow, the confirm key). Everything else in the layer, the pad and the
      // bottom row, ends the run and is handled by its own listener.
      const t = e.target;
      const pin = t && t.closest && t.closest('[data-edge]');
      if (!pin && !(surface.contains && surface.contains(t))) { taps = 0; return; }
      // Taps in a run, counted rather than paired. A DOUBLE OPENS THE
      // KEYBOARD, with the caret where it landed, and since 2026-08-14 it is
      // the ONLY way in: the pencil that used to do it is retired, having been
      // a button for a gesture that is both shorter and better aimed. It took
      // the word until 2026-08-13, which the long press already does and does
      // better: the press is the sure gesture where the double is the quick
      // one, and the quick one is better spent on the mode switch. The
      // triple's select-all went with it and could not have stayed: the second
      // tap swaps the read surface for a textarea, so the third lands
      // somewhere this listener cannot hear. Inside the editor select-all is
      // the platform's own gesture, which is where a reader looks for it.
      // ARMING ENDS A RUN. pointerdown already armed or disarmed the pin, and
      // counting the tap as well made "tap a pin, then tap the text" a double
      // and opened the keyboard on the gesture that is meant to move the edge.
      // It was wrong before the double meant anything too, taking the word
      // instead; the keyboard is just the reading nobody could miss.
      if (pin) { taps = 0; return; }
      const now = Date.now();
      taps = (now - lastTap) < DBL_MS ? taps + 1 : 1;
      lastTap = now;
      // Text or canvas is settled once, here, and both answers are a place:
      // the blank space past the last character is the END, which is what a
      // tap there has always meant. A caret-from-point that answers nothing on
      // a point hitsText called text is an anomaly rather than a gesture, and
      // reads as the same place.
      const onText = window.Dictate.hitsText(host, e.clientX, e.clientY);
      const i = onText ? offsetFromPoint(host, e.clientX, e.clientY) : null;
      // A DOUBLE OPENS THE KEYBOARD, and it opens it from the canvas too. The
      // canvas used to win before the count, so a tap past the text could
      // never be part of a run and the gesture that most obviously means
      // "let me type here", tapping the empty space under the words, was the
      // one place it did nothing. Nothing is lost: the single tap there still
      // means the end, and the second tap arrives at the same place.
      // ONE RULE for where the keyboard opens: wherever the taps left the
      // caret. On text that is the offset under the finger; on the canvas the
      // first tap of the run already sent the caret to the end, so passing
      // nothing and letting openEditor read the buffer says the same thing
      // without a second arithmetic for the same idea.
      if (taps === 2) { taps = 0; openEditor(i == null ? undefined : i); return; }
      if (i == null) { toEnd(); return; }
      // A SINGLE TAP PLACES THE CARET, always. It used to do that only when
      // something was already live (a selection, or a caret placed earlier),
      // and did nothing at all otherwise, which is the state a fresh draft is
      // in: the first tap on the words was dead, and dead is what it was
      // reported as. There was never a competing reading to protect, since the
      // tap is the one gesture on this surface with an obvious meaning, and
      // where the caret sits is where the next spoken words land.
      if (S.compArmed) S.dict.moveEdge(S.compArmed, i);
      else { S.dict.caretAt(i); S.compArmed = null; }
      paintDraft();
    });
  }

  // ── The cursor pad ────────────────────────────────────────────────────────
  // A relative pointer, not a scrubber: the drag moves a VIRTUAL POINT that
  // starts at the caret's own position on screen, and each move asks the
  // browser what offset sits under that point. Two things fall out for free
  // that arithmetic over the buffer would have had to reinvent: wrapped lines
  // (the point crosses them the way a finger would) and proportional type
  // (a narrow letter is a short step, a wide one a long step).
  //
  // The gain is under 1, so the thumb travels further than the caret. That is
  // the precision the pad exists for; at 1:1 it is a slower way to do what
  // touching the text already does.
  // BALLISTICS, the thing every pointing device does and no touch surface
  // offers: the gain depends on how fast the finger is moving. Creep and the
  // caret creeps, at well under 1:1, which is the precision the pad exists for;
  // flick and it runs ahead of the thumb, which is how a short button reaches a
  // long buffer. The pair is what makes the edges usable rather than a wall:
  // overshoot on a flick, then crawl back a character at a time, both without
  // lifting.
  //
  // Speed is measured per move event in px/ms and mapped onto the gain by a
  // straight ramp between two anchors. A curve would be defensible and is not
  // obviously better; a ramp is legible, and these three numbers are the whole
  // feel of the control, so they are worth being able to read.
  const PAD_SLOW = 0.45;   // gain at a crawl: 100px of thumb, 45px of travel
  const PAD_FAST = 2.4;    // gain at a flick: the run-ahead
  const PAD_V0 = 0.12;     // px/ms at or under which the crawl gain applies
  const PAD_V1 = 1.5;      // px/ms at or over which the flick gain applies
  const PAD_LINE = 1;      // lines moved per line-height of accumulated travel
  const PAD_EDGE = 6;      // px of scroll per move while pinned at an edge
  // No selection anywhere while a drag is live. The gesture is a press held
  // over a PAGE whose text the browser is perfectly willing to select under it,
  // which on a phone is what a long press MEANS: field-tested, and what came
  // back was a page full of blue. (The card's own lock is a rule in
  // ensureStyle; this one is applied to the host document for the length of a
  // drag and taken off again.)

  // WHAT THE PAD IS AIMING, in client coordinates: the armed pin if a pin is
  // armed, and the caret otherwise. One gesture, two subjects, and which one is
  // a state the reader set by tapping a pinhead. That is what let the arrow
  // cluster go: an armed edge is dragged exactly the way the caret is, so the
  // pad is the only control that moves anything, and there is no second thing
  // to learn or to look at.
  const padPoint = () => {
    const host = S.compBody;
    if (!host || !host.getBoundingClientRect) return null;
    if (S.compArmed && S.compStack) {
      const h = S.compStack.querySelector('[data-edge="' + S.compArmed + '"]');
      const hr = h && h.getBoundingClientRect ? h.getBoundingClientRect() : null;
      // The handle's box is a 32px target around a hairline bar; the bar is its
      // middle, and that is the pixel the offset is read from.
      if (hr && (hr.width || hr.height)) return { x: hr.left + hr.width / 2, y: hr.top + hr.height / 2 };
    }
    const c = host.querySelector('[data-d="caret"]');
    const r = c && c.getBoundingClientRect ? c.getBoundingClientRect() : null;
    if (r && (r.width || r.height)) return { x: r.left, y: r.top + r.height / 2 };
    const b = host.getBoundingClientRect();
    return b ? { x: b.right, y: b.bottom - 8 } : null;
  };

  // Drag mode says so, and says it OUTSIDE the card: everything but the note
  // dims, so the one surface that is still doing anything is the one lit. The
  // alternative was tinting the pad and nothing else, which is a 40px signal
  // for a gesture whose whole point is that the eye is somewhere else.
  const padScrim = (on) => {
    if (S.padScrim) { S.padScrim.remove(); S.padScrim = null; }
    if (!on || !S.doc) return;
    S.padScrim = el('div', `position:fixed;inset:0;z-index:${Z - 2};pointer-events:none;`
      + 'background:rgba(24,24,27,.38);');
    S.doc.body.appendChild(S.padScrim);
  };

  function bindCursorPad(btn) {
    let from = null;
    const noSelect = (e) => { e.preventDefault(); };
    const lit = (on) => {
      btn.style.background = on ? '#eff6ff' : '#f4f4f5';
      btn.style.borderColor = on ? '#bfdbfe' : '#d4d4d8';
      btn.style.color = on ? '#2563eb' : '';
      // The text box picks up the same blue: it is the thing being aimed at,
      // and the ring survives the dimming that everything else gets.
      // The ring goes on the FRAME: the text cell has no border of its own to
      // tint any more, and the thing being aimed is the instrument, not one
      // pane of it.
      if (S.compFrame) {
        S.compFrame.style.boxShadow = on ? '0 0 0 2px #2563eb' : '';
        S.compFrame.style.borderColor = on ? '#2563eb' : '#d4d4d8';
      }
      // The pins stand down for the length of the drag; see the rule in
      // ensureStyle. An ATTRIBUTE on the stack rather than a style on each
      // pin, because the painter rebuilds every pin on every repaint and a
      // repaint happens on every move of the drag.
      if (S.compStack) {
        ensureStyle();
        if (on) S.compStack.setAttribute('data-annotate-pad', '');
        else S.compStack.removeAttribute('data-annotate-pad');
      }
      padScrim(on);
    };
    const move = (e) => {
      if (!from || !S.dict || !S.compView) return;
      e.preventDefault();
      const box = S.compView.getBoundingClientRect();
      // The virtual point ACCUMULATES, one move at a time, each step scaled by
      // how fast that move was. An absolute mapping cannot accelerate: the
      // gain would have to be a property of the whole drag rather than of the
      // moment, and "flick then creep" is two moments.
      const t = (typeof e.timeStamp === 'number' && e.timeStamp) || Date.now();
      const dx = e.clientX - from.lx, dy = e.clientY - from.ly;
      const dt = Math.max(8, t - from.lt);
      const v = Math.hypot(dx, dy) / dt;
      const k = Math.min(1, Math.max(0, (v - PAD_V0) / (PAD_V1 - PAD_V0)));
      const gain = PAD_SLOW + (PAD_FAST - PAD_SLOW) * k;
      from.lx = e.clientX; from.ly = e.clientY; from.lt = t;
      // Clamped as it accumulates, not only where it is read. An unclamped
      // accumulator drifts far outside the box on a flick, and the drag back
      // then spends its first inch returning from somewhere the reader cannot
      // see, which reads as a dead control.
      from.x = Math.min(box.right - PAD_EDGE, Math.max(box.left + PAD_EDGE, from.x + dx * gain));
      from.y = Math.min(box.bottom - PAD_EDGE, Math.max(box.top + PAD_EDGE, from.y + dy * gain));
      // Vertical still lands on LINES rather than between them: the accumulated
      // travel is quantized to line-heights off the starting row, so a slow
      // drag steps one line at a time and a flick crosses several, both landing
      // on a line either way.
      const rows = Math.round((from.y - from.y0) / from.line) * PAD_LINE;
      const vy = from.y0 + rows * from.line;
      // Held against the edge, SCROLL rather than stop. The box shows six
      // lines and a dictated note runs longer than that, so a pad that could
      // only reach what happens to be visible would send the reader back to
      // touching the text for exactly the notes where that is worst.
      const el2 = S.compView;
      if (from.y >= box.bottom - PAD_EDGE && el2.scrollTop + el2.clientHeight < el2.scrollHeight) {
        el2.scrollTop += PAD_EDGE;
      } else if (from.y <= box.top + PAD_EDGE && el2.scrollTop > 0) {
        el2.scrollTop -= PAD_EDGE;
      }
      const cy = Math.min(box.bottom - PAD_EDGE, Math.max(box.top + PAD_EDGE, vy));
      const i = offsetFromPoint(S.compBody, from.x, cy);
      if (i == null) return;
      // An armed pin is what moves, if one is armed. Otherwise the caret, and
      // any selection collapses: a reader dragging the thing that places carets
      // has said which of the two they meant.
      if (S.compArmed) S.dict.moveEdge(S.compArmed, i);
      else S.dict.caretAt(i);
      paintDraft();
    };
    const up = (e) => {
      if (!from) return;
      from = null;
      S.padDrag = false;
      lit(false);
      const d = S.doc;
      d.removeEventListener('pointermove', move, true);
      d.removeEventListener('pointerup', up, true);
      d.removeEventListener('pointercancel', up, true);
      d.removeEventListener('selectstart', noSelect, true);
      d.body.style.userSelect = S.padPrevSelect || '';
      d.body.style.webkitUserSelect = S.padPrevSelect || '';
      d.body.style.touchAction = S.padPrevTouch || '';
      try { if (e) btn.releasePointerCapture(e.pointerId); } catch { }
    };
    holdTouch(btn);
    btn.addEventListener('pointerdown', (e) => {
      if (S.editing || !S.dict) return;      // the keyboard brings its own caret
      const at = padPoint();
      if (!at) return;
      e.preventDefault();
      const w = win();
      const cs = w && w.getComputedStyle ? w.getComputedStyle(S.compView) : null;
      from = { x: at.x, y: at.y, y0: at.y, lx: e.clientX, ly: e.clientY,
               lt: (typeof e.timeStamp === 'number' && e.timeStamp) || Date.now(),
               line: (cs && parseFloat(cs.lineHeight)) || 26 };
      // The flag the rest of the composer reads: while a drag is live, the
      // text box's own tap handling stands down. It has to, and not only for
      // tidiness: a capture can be lost mid-gesture (a browser deciding the
      // touch was a scroll), and the box would then read the tail of a drag as
      // a tap and place the caret a second time, somewhere else.
      S.padDrag = true;
      lit(true);
      // Listeners on the DOCUMENT rather than on the button, the same pattern
      // the card's own drag uses. Pointer capture is best-effort and a lost
      // one must not strand the drag with the scrim up and the page locked.
      const d = S.doc;
      S.padPrevSelect = d.body.style.userSelect || '';
      S.padPrevTouch = d.body.style.touchAction || '';
      d.body.style.userSelect = 'none';
      d.body.style.webkitUserSelect = 'none';
      // And the document holds still. A pad drag is not a scroll, but the page
      // under it will happily take one, and a page that scrolls at its top
      // edge inside a sheet-presented in-app browser is the gesture that
      // dismisses the sheet. The lock is the length of the drag exactly.
      d.body.style.touchAction = 'none';
      d.addEventListener('pointermove', move, true);
      d.addEventListener('pointerup', up, true);
      d.addEventListener('pointercancel', up, true);
      d.addEventListener('selectstart', noSelect, true);
      try { btn.setPointerCapture(e.pointerId); } catch { }
    });
  }

  // `at` is an offset into the buffer to put the caret on, which the double
  // tap supplies: the reader has already pointed at the place they mean, and
  // opening the keyboard with the caret at the end would make them point again
  // through a textarea their thumb is now half covering.
  const openEditor = (at) => {
    if (!S.compose) return;
    // Flush BEFORE stopping. The phrase still on screen is part of what is
    // being edited, and stop() runs the engine's end handler, which clears the
    // interim: the other order opened the keyboard on a draft missing the
    // sentence the reader was looking at when they reached for the keyboard.
    // Same defect the stage's pencil had, found there and fixed in both.
    if (S.dict) S.dict.flush();
    // Remember whether the engine was actually running. Closing used to start
    // it unconditionally, on the reading that "dictation is the default mode",
    // so a reader who had stopped listening, opened the keyboard, and put it
    // away came back to a live microphone they never asked for.
    // Resume what was interrupted, nothing more.
    S.dictWasOn = !!(S.dict && S.dict.listening);
    stopDictation();
    // THE CARD HOLDS STILL THROUGH THE SWITCH. Measured before anything moves:
    // the editor takes the frame's current height and keeps it, so what the
    // reader gets for losing the control row is that row's height in text, and
    // not one pixel of the page besides. The editor used to open at 30vh, which
    // grew the whole card on a change of input method, and nothing about typing
    // asks for more of the page than dictating does.
    const frameH = S.compFrame ? Math.round(S.compFrame.getBoundingClientRect().height) : 0;
    const viewH = S.compView ? Math.round(S.compView.getBoundingClientRect().height) : 0;
    S.editing = true;
    S.compTa.value = S.dict ? S.dict.text : '';
    S.compView.style.display = 'none';
    S.compTa.style.display = 'block';
    // 2px for the frame's own border, which the textarea sits inside. Below a
    // sane floor the measurement is not one (a card that is not laid out yet,
    // a headless run with no layout at all), so the static min-height stands.
    //
    // AND A CEILING, so the editor grows with its text the way the read surface
    // does. The floor is the card as it stands; the ceiling is the card the
    // SAME text would make in dictation, which is the floor plus whatever the
    // read surface had left before its own cap. Without it a typed note began
    // scrolling at whatever height the card happened to be when the keyboard
    // opened, while a dictated one ran on to VIEW_MAX: one buffer, two
    // behaviours, and no reason a reader could name for either.
    S.compTaBase = frameH > 40 ? frameH - 2 : 0;
    S.compTaMax = S.compTaBase ? S.compTaBase + Math.max(0, VIEW_MAX - viewH) : 0;
    S.compTa.style.height = S.compTaBase ? S.compTaBase + 'px' : '';
    sizeEditor();
    // Nothing to repaint on any control: paintDraft takes the whole row away,
    // so there is no button left wearing a face that has to be put back.
    paintDraft();
    S.compTa.focus();
    // THE CARET IS ONE CARET, in both directions. A reader who placed the red
    // one and then reached for the keyboard meant to type THERE; the textarea
    // used to open at the end regardless, so the placing had to be done twice,
    // once in each surface. `at` still wins when the double tap supplies it,
    // since that tap is a placement of its own and a fresher one. A live
    // selection carries across whole, so the keyboard's first character
    // replaces exactly what the red one covered.
    //
    // A null range is the buffer's way of saying "the very end" (dictate.js
    // normalizes a caret there), which is also what an unplaced caret reads as,
    // and the two want the same answer.
    const r = S.dict ? S.dict.range : null;
    const end = S.compTa.value.length;
    const from = typeof at === 'number' ? { start: at, end: at } : (r || { start: end, end: end });
    const lo = Math.max(0, Math.min(end, from.start));
    const hi = Math.max(lo, Math.min(end, from.end));
    try { S.compTa.setSelectionRange(lo, hi); } catch { }
  };
  // Grow to the content, between the floor and the ceiling openEditor measured.
  // Measured from the floor each time rather than from the current height, or
  // the box would ratchet up and never come back down when text is deleted.
  const sizeEditor = () => {
    const ta = S.compTa;
    if (!S.editing || !ta || !S.compTaBase) return;
    ta.style.height = S.compTaBase + 'px';
    const want = ta.scrollHeight || 0;
    ta.style.height = Math.max(S.compTaBase, Math.min(S.compTaMax, want)) + 'px';
  };

  const closeEditor = () => {
    if (!S.editing) return;
    // The edit is the truth on the way out, so dictation resumes from it, AND
    // so does the caret. Read before the assignment, because setting the buffer
    // drops the range by design (the caller has taken the text over, so the old
    // offsets describe something else), and restored after, which is the whole
    // of "the red caret is where you left the keyboard". Without it, leaving
    // edit mode sent the caret to the end and the next spoken words landed
    // there rather than where the reader had been working.
    const s = S.compTa.selectionStart, e = S.compTa.selectionEnd;
    if (S.dict) {
      S.dict.text = S.compTa.value;
      if (typeof s === 'number') {
        if (s === e) S.dict.caretAt(s); else S.dict.select(s, e);
      }
    }
    S.editing = false;
    S.compTa.style.display = 'none';
    S.compTa.style.height = '';
    S.compTaBase = S.compTaMax = 0;
    S.compView.style.display = 'block';
    // The keyboard may still be up: a blur brought us here, but Escape and the
    // Escape does not, and a textarea that is hidden while focused leaves the
    // keyboard over a card that has moved on.
    try { S.compTa.blur(); } catch { }
    paintDraft();
    // Resume only if the keyboard interrupted a live engine. Coming back to
    // where you were is worth not charging for; being switched on is not.
    if (S.dictWasOn && S.dict && S.dict.available()) S.dict.start();
    S.dictWasOn = false;
  };

  const cancelDraft = () => {
    stopDictation();
    // Whether a row was folded away for an edit, read before the draft goes.
    // Every way out of an edit passes through here, and only one of them
    // (saveDraft) re-renders the list on its own, so putting the row back is
    // this function's job rather than each caller's.
    const wasEditing = !!(S.draft && S.draft.editId);
    S.draft = null;
    S.dictWasOn = false;
    if (S.draftBox) { S.draftBox.remove(); S.draftBox = null; }
    if (S.compose) {
      S.compose.style.display = 'none';
      S.editing = false;
      S.compTa.style.display = 'none';
      S.compTa.style.height = '';
      S.compTaBase = S.compTaMax = 0;
      S.compTa.value = '';
      S.compView.style.display = 'block';
      S.compPunct.style.display = 'none';
      // The row comes back with the draft, since S.editing is false by the time
      // anything reads it. This used to be six lines putting the pencil's face
      // back, and the one draft that skipped them opened in dictation under a
      // button reading "Back to dictation" (found headless, 2026-08-09). The
      // pencil is retired and no control here has a second face to be left
      // wearing.
      for (const b of [S.compMic, S.compFill, S.compUndo, S.compRedo, S.compBack, S.compSave, S.compPad]) {
        if (b) b.style.display = 'flex';
      }
      if (S.dict) S.dict.text = '';
      S.compInterim = '';
    }
    if (wasEditing) renderList();
  };

  // A draft is a new note OR an edit of one, and `S.draft.editId` is which.
  // The edit path was removed once, on the reasoning that revising a paragraph
  // belonged in the drawer's roomier box; it is back because the card is where
  // a note is written and so where a reader looks to fix one, and reaching the
  // drawer costs a tab. Only the composer is shared: an edit never re-aims the
  // anchor, since a note is edited and a passage is re-selected, and conflating
  // the two would move a pin the reader believed was placed.
  const beginDraft = (target, caption, rectDoc, opts = {}) => {
    cancelDraft();
    S.draft = { target };
    if (rectDoc) {
      S.draftBox = el('div', `position:absolute;left:${rectDoc.x}px;top:${rectDoc.y}px;`
        + `width:${rectDoc.w}px;height:${rectDoc.h}px;pointer-events:none;z-index:${Z - 100};`
        + 'border:2px solid #f97316;background:rgba(249,115,22,.10);border-radius:4px;');
      S.doc.body.appendChild(S.draftBox);
    }
    S.compCap.textContent = clip(caption, 110);
    S.compose.style.display = 'flex';
    S.panel.style.display = 'flex';
    // Deliberately NOT focusing anything: a focused input is a keyboard, and
    // the point of the voice-first compose surface is that half the viewport
    // stays the page you are annotating.
    paintDraft();
    // Dictation is the DEFAULT mode, so "+ note" starts listening rather than
    // waiting to be asked twice. The tap that opened the draft is the user
    // gesture the recognizer needs, which is why this can start here at all
    // and could not from a timer or a mount.
    //
    // `listen: false` is the exception, and it belongs to exactly one caller:
    // a draft the reader did not ask for by aiming at something. Opening the
    // annotator from the launcher stages a page draft as the standing offer,
    // and an offer that switches the microphone on is a recorder nobody
    // started. Idle, the same draft is a question rather than a claim: dictate
    // it, type it, or ignore it and select a passage instead.
    if (!S.editing && opts.listen !== false && S.dict && S.dict.available()) S.dict.start();
  };

  const saveDraft = () => {
    if (!S.draft) return;
    const { target, editId } = S.draft;
    // Take the interim with it. Tapping save while the last phrase is still
    // grey is not a request to discard that phrase; it is a reader accepting
    // what is on screen.
    if (!S.editing && S.dict) S.dict.flush();
    const note = draftText();
    cancelDraft();
    if (editId) {
      const it = update(editId, note);
      if (it) select(it.id, { scroll: false });
      setStatus('Note updated');
      return;
    }
    const it = add(target, note);
    select(it.id, { scroll: false });
    setStatus('Note added');
  };

  // Reopen a saved note in the composer, its text loaded and the microphone
  // OFF. Idle for the same reason the launcher's staged draft is: an edit is a
  // correction, and a recorder that starts itself over words already written
  // is the one thing a reader cannot undo by not speaking. The mic is a tap
  // away and appends, which is what "say a bit more" should cost.
  const editNote = (id) => {
    const it = S.items.find(i => i.id === id);
    if (!it || !S.compose) return false;
    endMode();
    const t = it.target || {};
    const head = t.type === 'text' ? '“' + clip(t.quote && t.quote.exact, 60) + '”'
      : t.type === 'section' ? '§ ' + clip(t.title || t.excerpt, 60)
      : t.type === 'element' ? '⌖ ' + clip(t.excerpt || t.selector, 60)
      : t.type === 'page' ? 'this page'
      : '▭ ' + clip(t.excerpt, 60);
    // An anchored note keeps its outline painted while it is edited, the same
    // as a fresh draft: what the note is ABOUT has to stay visible.
    let rect = null;
    if (t.type === 'region') rect = t.rect;
    else if (t.type === 'section') {
      const e = findElement(t.selector), w = win();
      if (e && w) rect = unionRect(sectionEls(e), w);
    }
    else if (t.type === 'element') {
      const e = findElement(t.selector), w = win();
      if (e && w) {
        const r = e.getBoundingClientRect();
        rect = { x: Math.round(r.left + w.scrollX), y: Math.round(r.top + w.scrollY),
                 w: Math.round(r.width), h: Math.round(r.height) };
      }
    }
    beginDraft(t, 'Editing: ' + head, rect, { listen: false });
    S.draft.editId = id;
    // After beginDraft, which clears the buffer through cancelDraft.
    if (S.dict) { S.dict.text = it.note || ''; S.dict.clearRange(); }
    paintDraft();
    select(id, { scroll: false });
    return true;
  };

  // ── Dictation ─────────────────────────────────────────────────────────────
  // The engine is kits/dictate.js: a text buffer fed by speech, carrying the
  // four composition rules the prototype at dump/2026-08-08-paste.html
  // established (spoken punctuation is text, a tapped mark rides a
  // stop-restart cycle, a comma lowers the next capital, and the running
  // hypothesis is committable). It lived here until 2026-08-09 and moved out
  // unchanged; what the annotator keeps is the wiring, which is this file's
  // business and not the engine's.
  //
  // The kit is a hard dependency of dictation, not of the annotator: a page
  // that loads annotate.js without it still selects, notes, and serializes,
  // and simply never shows a microphone. So this reads window.Dictate at the
  // point of use rather than assuming the load chain ordered it.
  const hasDictation = () => !!window.Dictate && window.Dictate.available(win() || {});
  const stopDictation = () => { if (S.dict) S.dict.stop(); };

  // ── Selecting from the document side ──────────────────────────────────────
  // A highlight is the note, seen from the page, so tapping one selects it in
  // the list. A tap on bare page clears the selection, which is the gesture
  // people already expect from every list they have used.
  //
  // A CSS Custom Highlight paints without existing in the DOM, so there is
  // nothing to attach a listener to and no e.target to read: the hit has to
  // be computed from the click point against each note's live rects. That is
  // the cost of never rewriting the page's markup, and it is the right trade.
  const onDocClick = (e) => {
    if (S.mode || S.padDrag || !S.items.length) return;   // a mode or the pad owns the pointer
    const t = e.target;
    if (t && t.nodeType === 1 && t.closest && t.closest(`[${UI_ATTR}]`)) return;
    // A click that ends a drag-selection is not a tap on a highlight.
    const sel = win() && win().getSelection();
    if (sel && !sel.isCollapsed) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (hit) select(hit, { scroll: false });
    else if (S.selId) select(null);
  };

  // ── Mode: text selection (always armed while enabled) ─────────────────────
  let selBtn = null;
  const hideSelBtn = () => { if (selBtn) { selBtn.remove(); selBtn = null; } };

  // A live range → the text target a note would be pinned to, or null when the
  // selection has nothing anchorable in it. Computed at selection END rather
  // than when a button is tapped: the range is good now, and the tap that
  // reaches either button is the tap most likely to have ended the selection.
  const targetForRange = (range) => {
    const q = quoteFor(S.doc.body, range);
    if (!q) return null;
    // A drag that starts in inter-element whitespace has an ELEMENT for
    // startContainer; the block (and so the heading trail) should come from the
    // first selected node, not the container.
    const sc = range.startContainer;
    const startNode = sc.nodeType === 3 ? sc : (sc.childNodes[range.startOffset] || sc);
    const block = blockOf(startNode);
    const addr = addressFor(block, range);
    return { type: 'text', quote: q, display: displayFor(range),
             selector: addr.selector, span: addr.span,
             label: block ? headingTrail(block) : '' };
  };

  const onSelectionEnd = () => {
    setTimeout(() => {
      if (S.mode || S.padDrag) return;          // a mode or the pad owns the pointer
      const d = S.doc, sel = win() && win().getSelection();
      if (!d) return;
      hideSelBtn();
      // A COLLAPSED SELECTION LEAVES THE STAGE ALONE. It is the same event as a
      // fresh one, and on a phone it arrives from the very tap that reaches for
      // the card: clearing here made the offer disappear on the way to
      // accepting it. The stage is spent when a note is taken, replaced when
      // another passage is selected, and dropped by the bar's own ✕.
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      // Ignore selections inside our own UI.
      const anc = range.commonAncestorContainer;
      const ancEl = anc.nodeType === 1 ? anc : anc.parentElement;
      if (!ancEl || ancEl.closest(`[${UI_ATTR}]`)) return;
      if (!d.body.contains(ancEl)) return;
      const rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;
      const target = targetForRange(range);
      if (!target) return;
      setSelection(target);
      // And the chip beside the text, which is the desktop's shorter path: the
      // pointer is already there. It spends the same staged target as the bar.
      const bx = Math.min(rect.right + 4, (win().innerWidth || 800) - 70);
      const by = Math.max(6, rect.top - 30);
      selBtn = d.createElement('button');
      selBtn.setAttribute(UI_ATTR, '');
      selBtn.textContent = '+ note';
      selBtn.title = 'Note the text you selected';
      selBtn.style.cssText = `position:fixed;left:${bx}px;top:${by}px;z-index:${Z + 1};` + BTN
        + 'background:#facc15;color:#18181b;box-shadow:0 3px 10px rgba(0,0,0,.4);';
      selBtn.addEventListener('pointerdown', (e) => e.preventDefault());   // keep the selection
      selBtn.addEventListener('click', () => noteSelection());
      d.body.appendChild(selBtn);
    }, 10);
  };

  // ── Mode: element pick ────────────────────────────────────────────────────
  // Is there a markdown render on the page at all? One query, run only when the
  // chips are being synced, which is a mode change or a declaration and never a
  // loop.
  const hasRender = () => {
    try { return !!(S.doc && S.doc.querySelector('[data-md-doc]')); } catch { return false; }
  };

  // What the button says, which is the aim in force. Null mode is `Page`, the
  // resting position, so the control always names something rather than going
  // blank between modes.
  const AIM_LABEL = { pick: 'Element', region: 'Region', section: 'Section' };

  const syncChips = () => {
    for (const [k, b] of Object.entries(S.modeChips || {})) {
      const on = S.mode === k;
      b.style.backgroundColor = on ? '#facc15' : 'transparent';
      b.style.color = on ? '#18181b' : '#3f3f46';
      // The Section item is offered only where it has something to aim at.
      // Kept while its own mode runs, so a render that disappears mid-pick
      // cannot pull the exit out from under the reader.
      if (k === 'section') b.style.display = (on || hasRender()) ? 'flex' : 'none';
    }
    const b = S.aimBtn;
    if (!b) return;
    const on = !!S.mode;
    if (S.aimLabel) S.aimLabel.textContent = AIM_LABEL[S.mode] || 'Page';
    b.style.backgroundColor = on ? '#facc15' : '#fff';
    b.style.borderColor = on ? '#eab308' : '#e4e4e7';
    b.style.color = on ? '#18181b' : '#3f3f46';
  };

  // ── The aim menu ──────────────────────────────────────────────────────────
  // Anchored to the button's own rect and clamped to the viewport, since the
  // card can be dragged anywhere including hard against an edge. Right-aligned
  // to the button because the button is at the row's right end, so the menu
  // grows inward rather than off screen.
  const placeAim = () => {
    const b = S.aimBtn, m = S.aimMenu;
    if (!b || !m) return;
    const w = win();
    const r = b.getBoundingClientRect();
    const vw = (w && w.innerWidth) || 360;
    const vh = (w && w.innerHeight) || 640;
    const mw = m.offsetWidth || 196;
    const mh = m.offsetHeight || 0;
    let left = Math.min(Math.max(6, r.right - mw), Math.max(6, vw - mw - 6));
    // Below by default, above when there is no room, which on a card sitting
    // near the bottom of the screen is the normal case rather than the edge.
    let top = r.bottom + 4;
    if (mh && top + mh > vh - 6) top = Math.max(6, r.top - mh - 4);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
  };

  const closeAim = () => {
    if (!S.aimMenu || S.aimMenu.style.display === 'none') return;
    S.aimMenu.style.display = 'none';
    const d = S.doc || document;
    if (S.aimAway) { d.removeEventListener('pointerdown', S.aimAway, true); S.aimAway = null; }
    if (S.aimKey) { d.removeEventListener('keydown', S.aimKey, true); S.aimKey = null; }
  };

  const openAim = () => {
    const m = S.aimMenu;
    if (!m) return;
    syncChips();
    m.style.display = 'block';
    placeAim();
    const d = S.doc || document;
    // Capture phase, so a tap that lands on the page's own content closes this
    // before that content sees it. The menu's own nodes are excluded by
    // containment rather than by a flag, which survives a re-render.
    S.aimAway = (e) => { if (!m.contains(e.target) && e.target !== S.aimBtn && !S.aimBtn.contains(e.target)) closeAim(); };
    S.aimKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeAim(); } };
    d.addEventListener('pointerdown', S.aimAway, true);
    d.addEventListener('keydown', S.aimKey, true);
  };

  const toggleAim = () => {
    if (S.aimMenu && S.aimMenu.style.display !== 'none') return closeAim();
    openAim();
  };

  const endMode = () => {
    if (S.cleanupMode) S.cleanupMode();
    S.cleanupMode = null;
    S.mode = null;
    closeAim();
    syncChips();
  };

  // The "+ note" confirm chip the staged modes share with the text flow: the
  // gesture SELECTS, the chip is the moment the note begins. Nothing opens an
  // input uninvited.
  const NOTE_BTN = `position:fixed;z-index:${Z + 1};` + BTN
    + 'background:#facc15;border-color:#eab308;color:#18181b;box-shadow:0 3px 10px rgba(0,0,0,.25);';

  // ONE PICK ENGINE, two aims. Element picks the node under the finger; Section
  // picks the SECTION that node belongs to, outlined as the whole run of
  // siblings it covers. Everything between the two is identical and hard-won:
  // the cover, the pointer bookkeeping that tells a tap from a scroll on a
  // phone, the staged outline, the "+ note" confirm. A second copy of that
  // would be a second place for the 2026-08-14 field report to come back.
  //
  // A SECTION IS PICKED, NEVER INFERRED FROM SCROLL. Measured 2026-08-26 in the
  // deck: four declared renders are mounted at once (swipe-deck keeps two
  // slides either side) and only one is on screen, so "the section I am in"
  // has to choose a document before it chooses a section; and at 35% and 70%
  // through one doc the nearest-heading-above rule returned the same long
  // section, which would pin a note three screens above what the reader is
  // looking at while appearing to mean the visible text. A tap answers both at
  // once, which is why this is a mode and not a one-tap action like Page.
  const startPick = (o = {}) => {
    const section = o.aim === 'section';
    endMode();
    S.mode = section ? 'section' : 'pick';
    syncChips();
    // The card STAYS. It used to hide for the length of a capture mode, on the
    // reasoning that it covers a third of a phone screen and the element you
    // want may be under it. True, and the wrong fix: hiding it also hid the
    // chip that exits, leaving the mode with one way out, which was to finish a
    // note. Now it stays on top and moves by its header, so what it covers is
    // a thing you can drag it off rather than a thing you are stuck behind.
    setStatus('');
    const d = S.doc;
    // A COVER, the same shape region already uses, and for a reason a mouse
    // never shows: the mode ran on `mousemove` for the hover and on a captured
    // document `click` for the stage, and a phone sends neither reliably. There
    // is no mousemove before a tap, so `cur` was still null when the click
    // arrived and the handler returned having done nothing; and iOS withholds
    // click entirely from a document-level listener when the tapped element is
    // not itself clickable. Both are invisible from the code, since every mouse
    // path works. Field report, 2026-08-14: "I tap and I don't get the outline."
    //
    // Pointer events on a full-screen cover answer both at once, and take the
    // page's own links out of the gesture as a side effect. touch-action stays
    // AUTO, unlike region's: picking an element means finding it first, so a
    // drag has to keep scrolling the page. That is what separates a tap from a
    // scroll here, rather than a swallowed gesture.
    const cover = d.createElement('div');
    cover.setAttribute(UI_ATTR, '');
    cover.style.cssText = `position:fixed;inset:0;z-index:${Z - 1};cursor:crosshair;`
      + 'background:rgba(24,24,27,.04);';
    d.body.appendChild(cover);
    const mkBox = (css) => {
      const b = d.createElement('div');
      b.setAttribute(UI_ATTR, '');
      b.style.cssText = `position:fixed;pointer-events:none;z-index:${Z - 1};border-radius:4px;display:none;` + css;
      d.body.appendChild(b);
      return b;
    };
    const hover = mkBox('border:2px dashed rgba(250,204,21,.8);');
    const staged = mkBox('border:2px solid #facc15;background:rgba(250,204,21,.12);');
    let cur = null, sel = null, btn = null;
    // What is under a point, with our own furniture stepped over. The cover is
    // the topmost thing everywhere, so elementFromPoint alone would answer with
    // it every time; elementsFromPoint gives the stack and the first row that is
    // not ours is the page. A point over the CARD still answers nothing, which
    // is the old reading kept: an element hidden behind the panel is not what a
    // tap on the panel meant.
    const under = (x, y) => {
      const list = d.elementsFromPoint ? d.elementsFromPoint(x, y) : [d.elementFromPoint(x, y)];
      for (const e of list) {
        if (!e || e === cover) continue;
        if (e.closest && e.closest(`[${UI_ATTR}]`)) return null;
        return e;
      }
      return null;
    };
    const placeAt = (box, r) => {
      box.style.display = 'block';
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const removeBtn = () => { if (btn) { btn.remove(); btn = null; } };
    // What the point RESOLVES to, which is the only thing the two aims disagree
    // about. In section mode a point inside a declared render answers with the
    // heading that opens its section, and a point anywhere else answers with
    // nothing, so prose outside a markdown render simply does not light up.
    const resolve = (el2) => {
      if (!section) return el2;
      const loc = el2 && window.mdDoc && window.mdDoc.locate ? window.mdDoc.locate(el2) : null;
      return (loc && loc.head) || null;
    };
    // And what it OUTLINES: an element is its own rect, a section is the union
    // of the run it covers.
    const rectOf = (el2) => (section ? unionRect(sectionEls(el2), win()) : null)
      || el2.getBoundingClientRect();
    const viewRect = (el2) => {
      const r = rectOf(el2);
      const w = win();
      // unionRect answers in DOCUMENT coordinates (it is shared with the
      // in-place reading, which paints on the page); the outline boxes here are
      // position:fixed. Converting once, here, keeps that difference in one
      // place instead of in every caller.
      return section
        ? { left: r.x - w.scrollX, top: r.y - w.scrollY, width: r.w, height: r.h }
        : r;
    };
    const aim = (x, y) => {
      const el2 = resolve(under(x, y));
      if (!el2) { hover.style.display = 'none'; cur = null; return; }
      cur = el2;
      if (cur !== sel) placeAt(hover, viewRect(cur));
      else hover.style.display = 'none';
    };
    // A tap stages; poking around just moves the stage. Only "+ note" commits.
    const stage = (x, y) => {
      aim(x, y);
      if (!cur) return;
      sel = cur;
      const r = viewRect(sel);
      placeAt(staged, r);
      hover.style.display = 'none';
      removeBtn();
      btn = d.createElement('button');
      btn.setAttribute(UI_ATTR, '');
      btn.textContent = '+ note';
      // Titled, because three controls now say "+ note" (this, the region
      // offer, the selection bar) and only the title separates them for a
      // reader hovering, for a headless scenario, and for a screen reader.
      btn.title = section ? 'Note this section' : 'Note this element';
      btn.style.cssText = NOTE_BTN
        + `left:${Math.max(6, Math.min(r.right - 60, (win().innerWidth || 800) - 70))}px;`
        + `top:${Math.max(6, r.top - 30)}px;pointer-events:auto;`;
      btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const el2 = sel;
        const w = win();
        if (section) {
          const target = sectionTarget(el2);
          // The section went away between the tap and the confirm (a deck slide
          // dropped, a re-render): say so rather than filing a note pinned to
          // nothing.
          if (!target) { endMode(); setStatus('That section is no longer on the page'); return; }
          const u = unionRect(sectionEls(el2), w);
          endMode();
          beginDraft(target, target.excerpt,
            u && { x: Math.round(u.x), y: Math.round(u.y), w: Math.round(u.w), h: Math.round(u.h) });
          return;
        }
        const rr = el2.getBoundingClientRect();
        const rectDoc = { x: Math.round(rr.left + w.scrollX), y: Math.round(rr.top + w.scrollY),
                          w: Math.round(rr.width), h: Math.round(rr.height) };
        const excerpt = clip(el2.innerText || el2.textContent, 400);
        const target = { type: 'element', selector: cssPath(el2, d.body), label: headingTrail(el2),
                         excerpt, source: sourceFor(el2) };
        endMode();
        beginDraft(target, excerpt, rectDoc);
      });
      d.body.appendChild(btn);
    };
    // A tap is a press that neither travelled nor turned into a scroll. The
    // browser says so itself by cancelling the pointer the moment it claims the
    // gesture, which is the signal a distance check alone would miss on a slow
    // drag.
    // Contact is tracked by the events themselves rather than read off
    // `e.buttons`: the spec says a touch pointer reports 1 while it is down,
    // browsers do, and a mode that silently stops staging if one does not is
    // the defect this whole rewrite is about.
    let px = 0, py = 0, held = false, dragged = false;
    const down = (e) => { px = e.clientX; py = e.clientY; held = true; dragged = false; aim(px, py); };
    const move = (e) => {
      // A pointer in contact is a possible scroll; one merely hovering is a
      // mouse looking around, and that still moves the outline.
      if (!held) { aim(e.clientX, e.clientY); return; }
      if (Math.abs(e.clientX - px) > 10 || Math.abs(e.clientY - py) > 10) dragged = true;
    };
    const up = (e) => { held = false; if (!dragged) stage(e.clientX, e.clientY); };
    const cancel = () => { held = false; dragged = true; };
    const key = (e) => {
      if (e.key === 'Escape') { endMode(); setStatus(section ? 'Section pick cancelled' : 'Pick cancelled'); }
    };
    cover.addEventListener('pointerdown', down);
    cover.addEventListener('pointermove', move);
    cover.addEventListener('pointerup', up);
    cover.addEventListener('pointercancel', cancel);
    d.addEventListener('keydown', key, true);
    S.cleanupMode = () => {
      d.removeEventListener('keydown', key, true);
      cover.remove();
      hover.remove();
      staged.remove();
      removeBtn();
    };
  };

  // ── Mode: region rectangle ────────────────────────────────────────────────
  const startRegion = () => {
    endMode();
    S.mode = 'region';
    syncChips();
    setStatus('');
    const d = S.doc;
    const cover = d.createElement('div');
    cover.setAttribute(UI_ATTR, '');
    // touch-action:none is what makes the drag WORK on a phone: without it a
    // finger drag scrolls the page and the cover never sees a gesture
    // (field-tested: "a slight overlay, then nothing").
    // BELOW the card, not above it. The cover used to sit at Z+1 with the
    // panel hidden, which left the mode with one exit: finish a note. On a
    // phone there is no Esc, so a reader who opened Region by mistake was
    // stuck in it. Under the card, the ▭ Region chip stays reachable and stays
    // the way out, and the card moves by its header when it is in the way of
    // what you are trying to draw around.
    cover.style.cssText = `position:fixed;inset:0;z-index:${Z - 1};cursor:crosshair;`
      + 'background:rgba(24,24,27,.06);touch-action:none;';
    const box = d.createElement('div');
    box.setAttribute(UI_ATTR, '');
    box.style.cssText = 'position:fixed;border:2px dashed #facc15;background:rgba(250,204,21,.15);display:none;border-radius:4px;';
    cover.appendChild(box);
    d.body.appendChild(cover);
    let sx = 0, sy = 0, dragging = false, btn = null;
    const removeBtn = () => { if (btn) { btn.remove(); btn = null; } };
    const down = (e) => {
      if (e.target === btn) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      try { cover.setPointerCapture(e.pointerId); } catch { }
      removeBtn();
      box.style.border = '2px dashed #facc15';
      box.style.display = 'block';
      upd(e);
    };
    const upd = (e) => {
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      const w2 = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w2 + 'px', height: h + 'px' });
    };
    const move = (e) => { if (dragging) upd(e); };
    // Mouseup STAGES the rectangle: it stays drawn, another drag replaces it,
    // and only "+ note" opens the input (phone feedback: an input that pops
    // up mid-gesture is a distraction, not a confirmation).
    const up = (e) => {
      if (!dragging) return;
      dragging = false;
      const vx = Math.min(sx, e.clientX), vy = Math.min(sy, e.clientY);
      const vw = Math.abs(e.clientX - sx), vh = Math.abs(e.clientY - sy);
      if (vw < 8 || vh < 8) { box.style.display = 'none'; return; }
      box.style.border = '2px solid #facc15';
      btn = d.createElement('button');
      btn.setAttribute(UI_ATTR, '');
      btn.textContent = '+ note';
      btn.title = 'Note this region';
      btn.style.cssText = NOTE_BTN
        + `left:${Math.min(vx + vw - 60, (win().innerWidth || 800) - 70)}px;`
        + `top:${Math.min(vy + vh + 6, (win().innerHeight || 600) - 36)}px;`;
      btn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const w = win();
        const rect = { x: Math.round(vx + w.scrollX), y: Math.round(vy + w.scrollY), w: Math.round(vw), h: Math.round(vh) };
        // The text the rectangle covers: block-level elements whose boxes
        // intersect it, in document order, clipped.
        const parts = [];
        for (const el2 of d.body.querySelectorAll('p,li,pre,blockquote,h1,h2,h3,h4,h5,h6,td,th,dt,dd,figcaption')) {
          if (el2.closest(`[${UI_ATTR}]`)) continue;
          const r = el2.getBoundingClientRect();
          if (r.left < vx + vw && r.right > vx && r.top < vy + vh && r.bottom > vy) {
            parts.push((el2.innerText || el2.textContent || '').trim());
          }
          if (parts.join(' ').length > 700) break;
        }
        const excerpt = clip(parts.join(' '), 600);
        const first = d.elementFromPoint(Math.max(0, vx + 4), Math.max(0, vy + 4));
        const target = { type: 'region', rect, excerpt, label: first ? headingTrail(first) : '',
                         source: first ? sourceFor(first) : '' };
        endMode();
        beginDraft(target, excerpt, rect);
      });
      cover.appendChild(btn);
    };
    const key = (e) => { if (e.key === 'Escape') { endMode(); setStatus('Region cancelled'); } };
    holdTouch(cover, 'button');
    cover.addEventListener('pointerdown', down);
    cover.addEventListener('pointermove', move);
    cover.addEventListener('pointerup', up);
    d.addEventListener('keydown', key, true);
    S.cleanupMode = () => { cover.remove(); d.removeEventListener('keydown', key, true); };
  };

  // ── The iOS zoom guard ────────────────────────────────────────────────────
  // Safari zooms the page when a focused input computes under 16px, and the
  // note input being 16px is not enough inside a toss: the subject renders in
  // an iframe the shell may scale, so 16 CSS px can land under the threshold
  // as displayed. The decisive control is the TOP document's viewport meta:
  // maximum-scale=1 disables focus auto-zoom while leaving pinch zoom alone
  // (iOS ignores maximum-scale for user gestures since iOS 10). Guarded while
  // the annotator is on, restored exactly on disable; a cross-origin top
  // (#gz= sandbox) is left untouched.
  const guardViewport = () => {
    try {
      const top = win().top.document;
      let m = top.querySelector('meta[name=viewport]');
      if (!m) {
        m = top.createElement('meta');
        m.name = 'viewport';
        top.head.appendChild(m);
        S._vpCreated = true;
      }
      S._vpPrev = m.getAttribute('content') || '';
      const parts = S._vpPrev.split(',').map(s => s.trim())
        .filter(s => s && !/^maximum-scale/.test(s));
      if (!parts.length) parts.push('width=device-width', 'initial-scale=1');
      m.setAttribute('content', parts.concat('maximum-scale=1').join(', '));
      S._vpMeta = m;
    } catch { /* cross-origin top: nothing to guard */ }
  };
  const unguardViewport = () => {
    if (!S._vpMeta) return;
    if (S._vpCreated) S._vpMeta.remove();
    else S._vpMeta.setAttribute('content', S._vpPrev);
    S._vpMeta = null;
    S._vpCreated = false;
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  const enable = (opts = {}) => {
    const doc = opts.doc || window.document;
    if (S.doc === doc && S.ui) { S.panel.style.display = 'flex'; return window.Annotate; }
    disable();
    S.doc = doc;
    window.Annotate.subject = opts.subject || null;   // {title, url} override for serialization
    guardViewport();
    ensureIcons();
    mountUI();
    S.dict = window.Dictate ? window.Dictate.create({
      win,
      onText: () => paintDraft(),
      onInterim: (t) => { S.compInterim = t || ''; paintDraft(); },
      onState: () => paintDraft(),
      onError: (m) => setStatus(m, true),
    }) : null;
    on(doc, 'pointerup', onSelectionEnd);
    on(doc, 'keyup', onSelectionEnd);
    on(doc, 'keydown', onKey);
    on(doc, 'click', onDocClick);
    // kits/md-doc.js announces every render it declares, which is how the
    // Section chip appears on a surface that had no markdown on it when the
    // annotator was switched on. The deck is the case: its slides are rendered
    // after, and again on every swipe.
    on(doc, 'md-doc:declared', () => syncChips());
    const w = win();
    // A rotation or a keyboard changes how much room is above the card's
    // pinned bottom edge, and the expanded ceiling is a pixel figure computed
    // from it, so it has to be recomputed rather than left where it was.
    if (w) on(w, 'resize', () => { sizeExpanded(); paintBoxes(); });
    // The drawer's state, heard on this window and on the top one, since under
    // a toss the kit runs in the frame and the drawer is the shell's. Then ask
    // once: a fab that mounted before this kit loaded has already broadcast,
    // and nothing repeats an announcement nobody was listening for yet.
    paint();
    // Once at mount, because a chip's visibility is part of its state and
    // syncChips has otherwise only ever run on a mode change. Without it the
    // Section chip ships visible and only corrects itself the first time a mode
    // is entered, which on a page with no markdown is never.
    syncChips();
    S.panel.style.display = 'flex';
    return window.Annotate;
  };

  const disable = () => {
    endMode();
    // A drag can be live when the annotator is switched off from elsewhere:
    // the scrim and the page's selection lock are OUTSIDE the card, so they
    // would survive the thing that put them there.
    if (S.doc && S.padDrag) {
      S.doc.body.style.userSelect = S.padPrevSelect || '';
      S.doc.body.style.webkitUserSelect = S.padPrevSelect || '';
      S.doc.body.style.touchAction = S.padPrevTouch || '';
    }
    S.padDrag = false;
    padScrim(false);
    cancelDraft();
    hideSelBtn();
    unguardViewport();
    for (const [t, type, fn, opts] of S.listeners) t.removeEventListener(type, fn, opts);
    S.listeners = [];
    for (const b of S.boxes) b.remove();
    S.boxes = [];
    const w = win();
    if (w && w.CSS && w.CSS.highlights) {
      w.CSS.highlights.delete(HL_NAME);
      w.CSS.highlights.delete(HL_NAME + '-active');
    }
    if (S.ui) S.ui.remove();
    S.ui = S.panel = S.listEl = null;
    S.compose = S.compTa = S.compCap = S.compMic = S.countEl = null;
    S.compView = S.compBody = S.compHint = S.compPunct = null;
    S.compInterim = ''; S.compArmed = null;
    S.compUndo = S.compRedo = S.compFill = S.compBack = S.compShiftBtn = S.compPad = null;
    S.padScrim = null;
    S.compSave = S.compStack = S.compFrame = null;
    if (S.panel) { S.panel.style.height = ''; S.panel.style.maxHeight = PANEL_MAX; }
    closeAim();
    if (S.aimMenu) S.aimMenu.remove();
    S.aimMenu = S.aimBtn = S.aimLabel = null;
    S.pageChip = S.placeBtn = S.expandBtn = S.jotBtn = null;
    S.readBar = S.readGroup = S.readChips = S.empty = null;
    S.serial = S.serialPre = S.serialCopy = S.setActs = null;
    clearTimeout(S.copyTimer);
    S.copyTimer = null;
    S.selBar = S.selQuote = null;
    S.sel = null;
    S.inPlace = false;
    S.expanded = false;
    S.reading = 'notes';
    S.compShift = false;
    S.dict = null;
    S.editing = false;
    S.selId = S.selRow = null;
    S.modeChips = {};
    S.doc = null;
  };

  window.Annotate = {
    enable, disable, add, remove, update, clear, select, copy, copyNote, saveJot, toMarkdown, toJSON,
    startPick, startRegion, notePage, noteSection, editNote, showInPlace, noteSelection,
    // The card's own reading of the set: expand it, and pick which of the
    // three readings shows.
    expand, setReading,
    get items() { return S.items.slice(); },
    get enabled() { return !!S.ui; },
    get inPlace() { return !!S.inPlace; },
    get expanded() { return !!S.expanded; },
    get reading() { return S.reading; },
    // The passage the card is offering to note, or null. A drawer can ask, so
    // the offer does not have to be a thing only the card knows about.
    get staged() { return S.sel; },
    get selected() { return S.items.find(i => i.id === S.selId) || null; },
    subject: null,
    // pure helpers, exposed for tools/test/annotate.test.mjs
    _textIndex: textIndex, _quoteFor: quoteFor, _resolveQuote: resolveQuote,
    _displayFor: displayFor, _quoteLines: quoteLines, _sectionEls: sectionEls,
    _cssPath: cssPath, _headingTrail: headingTrail, _clip: clip,
    _addressFor: addressFor, _addressText: addressText, _hitTest: hitTest,
    _announce: announce, _paintDraft: () => paintDraft(),
    // The keyboard's two doors, for the node test. Every USER path goes through
    // the double tap and the blur; these exist so the default each door applies
    // with no argument can be asserted without a browser's layout.
    _openEditor: (at) => openEditor(at), _closeEditor: () => closeEditor(),
    _state: S,
  };
})();
