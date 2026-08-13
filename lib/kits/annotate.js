// kits/annotate.js — notes pinned to pieces of a page: select text (or pick an
// element, or drag a rectangle), write a note, and carry the set out as
// markdown for a chat model, as JSON, or as a jot in the estate registry.
//
// The unit is the ANNOTATION SET, not the single note: the point of the kit is
// making several small notes against one document and shipping them together,
// which is what neither a screenshot nor a copied quote does. Four targeting
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
  const addressFor = (block, range) => {
    if (!block) return { selector: '', span: null };
    const selector = cssPath(block, S.doc.body);
    if (!range || !block.contains(range.startContainer) || !block.contains(range.endContainer)) {
      return { selector, span: null };
    }
    try {
      const idx = textIndex(block);
      let s = pointOffset(idx, range.startContainer, range.startOffset);
      let e = pointOffset(idx, range.endContainer, range.endOffset);
      if (s == null || e == null) return { selector, span: null };
      // Same edge trim quoteFor applies, so the span matches `exact` rather
      // than the raw drag.
      while (s < e && /\s/.test(idx.text[s])) s++;
      while (e > s && /\s/.test(idx.text[e - 1])) e--;
      return { selector, span: e > s ? { start: s, end: e } : null };
    } catch { return { selector, span: null }; }
  };

  const addressText = (t) => {
    if (!t || !t.selector) return '';
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
    ui: null, panel: null, bubble: null, status: null, listEl: null,
    mode: null, cleanupMode: null, listeners: [], boxes: [],
    // What the card knows about the drawer it hands the set to. Null means
    // nobody has answered yet, which is not the same as "no drawer": the
    // review button stays live and its click is what settles the question.
    drawer: null,
  };
  const win = () => S.doc ? S.doc.defaultView : null;

  const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); S.listeners.push([t, type, fn, opts]); };

  // ── Highlight painting (non-destructive) ──────────────────────────────────
  const ensureStyle = () => {
    if (S.doc.getElementById('annotate-style')) return;
    const st = S.doc.createElement('style');
    st.id = 'annotate-style';
    st.setAttribute(UI_ATTR, '');
    st.textContent = `
      ::highlight(${HL_NAME}) { background: rgba(250, 204, 21, .40); }
      ::highlight(${HL_NAME}-active) { background: rgba(249, 115, 22, .55); }`;
    S.doc.head.appendChild(st);
  };

  // Paints from S.selId rather than an argument: the selected note is STATE,
  // not a 1.6-second flash, so every repaint agrees about which one is current
  // without the caller having to remember.
  const paint = () => {
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
    paintBoxes();
  };

  // Element/region notes get absolutely positioned outline boxes in an overlay
  // layer (document coordinates, so they ride ordinary scrolling).
  const paintBoxes = () => {
    const activeId = S.selId;
    for (const b of S.boxes) b.remove();
    S.boxes = [];
    for (const it of S.items) {
      let rect = null;
      if (it.target.type === 'element' && it.target.selector) {
        const el = findElement(it.target.selector);
        if (el) {
          const r = el.getBoundingClientRect();
          rect = { x: r.left + win().scrollX, y: r.top + win().scrollY, w: r.width, h: r.height };
        }
      } else if (it.target.type === 'region') {
        rect = it.target.rect;
      }
      if (!rect) continue;
      const d = S.doc.createElement('div');
      d.setAttribute(UI_ATTR, '');
      d.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;`
        + `pointer-events:none;z-index:2147482000;border:2px dashed ${it.id === activeId ? '#f97316' : 'rgba(250,204,21,.9)'};`
        + `background:rgba(250,204,21,${it.id === activeId ? '.18' : '.08'});border-radius:4px;`;
      S.doc.body.appendChild(d);
      S.boxes.push(d);
    }
  };

  const findElement = (selector) => {
    try { return S.doc.querySelector(selector); } catch { return null; }
  };

  // ── The note shape ────────────────────────────────────────────────────────
  const makeItem = (target, note) => ({
    id: 'a' + Date.now().toString(36) + (S.seq++).toString(36),
    at: new Date().toISOString(),
    note: String(note || '').trim(),
    target,
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

  // "Show me the whole set." An announcement, not a surface: the FAB drawer's
  // Notes tab answers it, and there is deliberately no fallback sheet here. A
  // second implementation of the same view is the copy that ages, and gh-boot
  // mounts the drawer on every page that has not opted out of it.
  // The drawer answers by preventing the default, and it TOGGLES: asking for a
  // tab that is already open and in front of you can only mean "put it away".
  // A click that nobody claims is the one honest reading of "there is no
  // drawer on this page", so it is remembered and the button stops offering.
  const review = () => {
    if (announce('annotate:review', true)) return;
    S.drawer = { present: false, open: false, tab: '' };
    syncReview();
    setStatus('No drawer on this page to review in; Copy markdown still works', true);
  };

  // The fab broadcasts 'annotate:drawer' whenever its open state or tab
  // changes, and answers 'annotate:drawer-query' on mount, so the button can
  // say what a tap will do before it is tapped rather than after.
  const onDrawerState = (e) => {
    const d = (e && e.detail) || {};
    S.drawer = { present: true, open: !!d.open, tab: d.tab || '' };
    syncReview();
  };

  const syncReview = () => {
    const b = S.reviewBtn;
    if (!b) return;
    const d = S.drawer;
    const absent = !!(d && d.present === false);
    const showing = !!(d && d.present !== false && d.open && d.tab === 'notes');
    b.disabled = absent;
    b.style.cursor = absent ? 'default' : 'pointer';
    b.style.opacity = absent ? '.4' : '';
    b.style.background = showing ? '#facc15' : '#fff';
    b.style.borderColor = showing ? '#eab308' : '#e4e4e7';
    b.style.color = showing ? '#18181b' : '#3f3f46';
    b.title = absent ? 'No drawer on this page; Copy markdown still works'
      : showing ? 'Close the notes drawer'
      : 'Open the drawer’s Notes tab: read, edit, copy, or save the set';
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
    beginDraft({ type: 'page' }, 'This page: ' + (title || view || url || 'untitled'), null, opts);
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
    } else if (t.type === 'element') {
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

  const toMarkdown = () => {
    const { title, url, view } = docMeta();
    const L = [`# Notes — ${title || 'untitled page'}`, ''];
    if (url) L.push(url);
    // The live address, on its own line and labeled, so a set pasted into a
    // session says which page it is about without the reader restating it.
    if (view) L.push(`Viewed at: ${view}`);
    if (url || view) L.push('');
    L.push(`${S.items.length} note${S.items.length === 1 ? '' : 's'} · ${new Date().toISOString().slice(0, 10)}`, '');
    S.items.forEach((it, i) => {
      const t = it.target;
      const head = t.type === 'text' ? `"${clip(t.quote.exact, 70)}"`
        : t.type === 'element' ? `element ${t.selector || ''}`
        // A page note pins to nothing, on purpose: the head says so, and the
        // header above already carries which page is meant.
        : t.type === 'page' ? 'the page'
        : 'region';
      L.push(`## ${i + 1}. ${head}`);
      if (t.label) L.push(`Context: ${t.label}`);
      // The address rides the paste: a model asked to change this passage can
      // act on the path, where the quote alone leaves it guessing which of
      // three identical phrases was meant.
      const addr = addressText(t);
      if (addr) L.push('Path: `' + addr + '`');
      L.push('');
      const body = t.type === 'text' ? (t.display || t.quote.exact) : (t.excerpt || '');
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
    });
    return L.join('\n');
  };

  const toJSON = () => {
    const { title, url } = docMeta();
    return {
      format: 'annotate/1',
      title, url,
      at: new Date().toISOString(),
      notes: S.items.map(it => ({ id: it.id, at: it.at, note: it.note, ...it.target })),
    };
  };

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
  const BTN = 'border:1px solid #d4d4d8;border-radius:6px;padding:3px 8px;font:600 11px/1.6 ui-sans-serif,system-ui;'
    + 'background:#f4f4f5;color:#27272a;cursor:pointer;';

  const setStatus = (msg, isErr) => {
    if (!S.status) return;
    S.status.textContent = msg || '';
    S.status.style.color = isErr ? '#b91c1c' : '#71717a';
    S.status.style.padding = msg ? '0 14px 8px' : '0 14px';
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
    // Through the ATTRIBUTE, for the reason the read surface already had to:
    // -webkit-touch-callout is not in the CSSOM's property list, so a cssText
    // assignment drops it and the iOS callout comes back while user-select
    // appears to have been set. Authored text survives verbatim.
    root.setAttribute('style', (root.getAttribute('style') || '') + PAD_LOCK);

    // Panel: header / capture / list / footer, each its own band so the card
    // reads as a designed thing rather than a pile of buttons.
    const p = el('div', 'display:none;flex-direction:column;'
      + 'width:min(360px,90vw);max-height:min(480px,70vh);background:#fff;color:#27272a;'
      + 'border:1px solid #e4e4e7;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.16);overflow:hidden;');
    S.panel = p;

    // The header is the drag handle. A capture mode covers the page, so the
    // card has to be movable rather than dismissable: what it is in the way of
    // is exactly what you are trying to select.
    const head = el('div', 'display:flex;align-items:center;gap:8px;padding:10px 14px 8px;'
      + 'cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;      // the × is not a handle
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
    head.appendChild(el('span', 'font:700 13px ui-sans-serif,system-ui;color:#18181b;', '✎ Notes'));
    S.countEl = el('span', 'color:#71717a;font-size:12px;', '0');
    head.appendChild(S.countEl);
    const close = el('button', 'margin-left:auto;border:0;background:none;color:#a1a1aa;'
      + 'font-size:16px;line-height:1;cursor:pointer;padding:2px 6px;', '×');
    close.title = 'Put the annotator away (the notes keep; the drawer’s Notes tab brings it back)';
    close.addEventListener('click', () => disable());
    head.appendChild(close);
    p.appendChild(head);

    const chip = (label, title, fn) => {
      const b = el('button', 'border:1px solid #e4e4e7;background:#fff;color:#3f3f46;border-radius:999px;'
        + 'padding:4px 12px;font:600 12px ui-sans-serif,system-ui;cursor:pointer;', label);
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    // Mode chips are toggles and SHOW their state (field feedback: a mode
    // you cannot see is a mode you doubt); tapping the active one exits.
    const capture = el('div', 'display:flex;gap:6px;align-items:center;padding:0 14px 8px;');
    // Page is not a mode and does not join modeChips: there is nothing to aim
    // and nothing to exit, so tapping it opens the draft outright. It leads the
    // row because it is the widest target and the one needing no gesture at
    // all, which is the case the other two could not serve: a complaint about
    // the page itself, dictated where the page is, rather than restated later
    // in some other window with the address typed out by hand.
    S.pageChip = chip('▤ Page', 'Note this page as a whole: no selection, the address rides the note',
      () => notePage());
    capture.appendChild(S.pageChip);
    S.modeChips = {
      pick: chip('⌖ Element', 'Tap to select an element, then + note (tap again to exit)',
        () => S.mode === 'pick' ? endMode() : startPick()),
      region: chip('▭ Region', 'Drag a rectangle, then + note (tap again to exit)',
        () => S.mode === 'region' ? endMode() : startRegion()),
    };
    capture.appendChild(S.modeChips.pick);
    capture.appendChild(S.modeChips.region);
    capture.appendChild(el('div', 'flex:1;'));
    // The way to the drawer rides the chip row rather than a footer band of
    // its own: three capture chips and one way out is a single row's worth of
    // control, and a band under the list bought nothing but height on a card
    // that already covers a third of a phone.
    //
    // It was a yellow pill reading "Review", and both halves misreported. The
    // word named a stage of work rather than the thing the tap does, and the
    // button looked identical whether it would open the drawer, close it, or
    // (with no drawer on the page) do nothing at all. It wears the drawer's
    // own sidebar mark now, and its fill and title follow the drawer's state,
    // which the fab broadcasts. Same rule the mode chips already follow: a
    // control that cannot show its state is a control you doubt.
    S.reviewBtn = icon('sidebar-simple', 'border:1px solid #e4e4e7;background:#fff;color:#3f3f46;'
      + 'border-radius:999px;padding:4px 10px;cursor:pointer;display:flex;align-items:center;');
    S.reviewBtn.addEventListener('click', review);
    capture.appendChild(S.reviewBtn);
    syncReview();
    p.appendChild(capture);

    // Compose: the panel IS the input surface, and by default it is a DISPLAY
    // rather than an input. Speaking fills it; the keyboard opens only if the
    // pencil asks for it. Appears only while a draft is staged.
    S.compose = el('div', 'display:none;flex-direction:column;gap:6px;padding:0 14px 10px;');
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
      + 'min-height:68px;max-height:172px;overflow-y:auto;background:#fafafa;'
      // Scrolls, so it takes vertical panning back from the card's lock, and
      // keeps the overscroll to itself.
      + 'touch-action:pan-y;overscroll-behavior:contain;'
      // Ordinary padding. The handles used to need room reserved here, and do
      // not any more: they are painted into the stack below, outside this
      // scrolling box, so a ball above the first line sits in the white space
      // beside the card rather than being clipped or pushing the text down.
      + 'border:1px solid #e4e4e7;border-radius:8px;padding:7px 9px;'
      // Bigger than the card's other type: this is the surface being dictated
      // INTO, read at arm's length while speaking rather than leaned over.
      + 'font:17px/26px ui-sans-serif,system-ui;color:#18181b;white-space:pre-wrap;word-break:break-word;');
    // The read surface is PAINTED by the kit (Dictate.paint), not written to
    // directly, so the buffer, the hypothesis, the caret and the selection all
    // render here exactly as they do in the stage's bar. What this file owns
    // is the gestures over it.
    S.compHint = el('span', 'color:#a1a1aa;', 'Listening. Tap the pencil to type instead.');
    S.compBody = el('span', '');
    S.compView.appendChild(S.compBody);
    S.compView.appendChild(S.compHint);
    // No native selection: no highlight to fight with, and on iOS no callout
    // bubble landing over the words being read. This is what buys the right
    // to run a selection of our own.
    // Written to the style ATTRIBUTE, not through .style: -webkit-touch-callout
    // is not in the CSSOM's property list, so an assignment through the object
    // is dropped by anything validating (jsdom does, and the test caught it).
    // The attribute is authored text and survives verbatim.
    // Written to the ATTRIBUTE rather than through .style, and no longer
    // conditional on the dictation kit being loaded: -webkit-touch-callout is
    // not in the CSSOM's property list, so an assignment through the object is
    // dropped by anything validating (jsdom does, and the test caught it), and
    // a card whose selection lock arrived only when a sibling kit happened to
    // load first is a lock that is off exactly when nobody notices.
    S.compView.setAttribute('style', (S.compView.getAttribute('style') || '') + PAD_LOCK);
    S.compView.addEventListener('contextmenu', (e) => e.preventDefault());
    // The handles are measured against the layer, so scrolling the text under
    // them leaves them behind. Repaint on scroll rather than trying to offset:
    // one source of position beats two that must agree.
    S.compView.addEventListener('scroll', () => { if (S.dict && S.dict.range) paintDraft(); });

    // The editor: the deliberate second act. A bigger box, focused on open,
    // which is the one moment the keyboard is wanted.
    // The one child that opts back OUT of the card's locks: a keyboard needs a
    // real caret, a real selection, and a scroll of its own.
    S.compTa = el('textarea', 'display:none;min-height:30vh;background:#fff;color:#18181b;'
      + 'border:1px solid #d4d4d8;border-radius:8px;padding:8px 10px;'
      + 'font:17px/1.5 ui-sans-serif,system-ui;resize:none;overflow-y:auto;'
      + 'touch-action:pan-y;overscroll-behavior:contain;');
    S.compTa.setAttribute('style', (S.compTa.getAttribute('style') || '')
      + 'user-select:text;-webkit-user-select:text;-webkit-touch-callout:default;');
    S.compTa.placeholder = 'Note…';
    S.compTa.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditor(); });

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
    const padSet = () => (S.dict && S.dict.hasSelection) ? CASING : (S.compShift ? SHIFTED : PRIMARY);
    S.compShift = false;
    S.compPunct = el('div', 'display:none;flex-direction:column;gap:4px;width:46px;flex:none;');

    const key = (bg) => 'border:1px solid #e4e4e7;background:' + (bg || '#fff') + ';color:#3f3f46;'
      + 'border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;'
      + 'font:600 19px/1 ui-sans-serif,system-ui;height:38px;padding:0;';
    const keys = [];
    for (let i = 0; i < 3; i++) {
      const b = el('button', key());
      // pointerdown, not click: a tap must not blur or scroll before the mark
      // registers, and the engine restart is already async.
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const spec = padSet()[i];
        if (!S.dict) return;
        if (spec.c) { S.dict.recase(spec.c); paintDraft(); return; }
        S.dict.punct(spec.m);
        // A shifted mark drops the shift, the way a phone keyboard does: the
        // sticky case is the one the reader asked for by tapping again.
        if (S.compShift) { S.compShift = false; paintPunct(); }
      });
      keys.push(b);
      S.compPunct.appendChild(b);
    }
    S.compShiftBtn = el('button', key('#f4f4f5') + 'font-size:13px;letter-spacing:.04em;height:32px;');
    S.compShiftBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // While a selection is live this key drops it, which is the way back to
      // the marks: the pad and the selection are one state, so one key ends
      // both rather than leaving a mode with no exit.
      if (S.dict && S.dict.hasSelection) { S.dict.clearRange(); S.compArmed = null; paintDraft(); return; }
      S.compShift = !S.compShift; paintPunct();
    });
    S.compPunct.appendChild(S.compShiftBtn);

    // Backspace joins the pad rather than sitting in the bottom row. It is
    // tapped AS YOU GO, at the same rhythm as the marks and by the same thumb,
    // so putting it a row away made the one control you reach for mid-sentence
    // the only one you had to look for. It is styled apart, not alike: a red
    // glyph on a tinted key, because it is the one key here that destroys
    // rather than inserts and a slip should be recognizable as a slip.
    S.compBack = icon('backspace', key('#fef2f2') + 'border-color:#fecaca;color:#dc2626;height:38px;',
      'Delete the last word (dictation keeps running)');
    S.compBack._icon.style.fontSize = '19px';
    S.compBack.addEventListener('pointerdown', (e) => { e.preventDefault(); S.dict && S.dict.backWord(); });
    S.compPunct.appendChild(S.compBack);

    // One painter for the pad, so the shift state has exactly one reading.
    paintPunct = () => {
      const sel = !!(S.dict && S.dict.hasSelection);
      const set = padSet();
      keys.forEach((b, i) => {
        const spec = set[i];
        b.textContent = '';
        if (spec.icon) { setIcon(b, spec.icon); b.style.fontSize = ''; }
        else { b.textContent = spec.label || spec.m; b.style.fontSize = spec.c ? '15px' : '19px'; }
        b.title = spec.title || ('Insert ' + spec.m);
        b.style.background = sel ? '#eff6ff' : '#fff';
        b.style.borderColor = sel ? '#bfdbfe' : '#e4e4e7';
      });
      S.compShiftBtn.textContent = sel ? '✕' : (S.compShift ? 'abc' : '·!¶');
      S.compShiftBtn.title = sel ? 'Drop the selection' : 'The other three marks';
      S.compShiftBtn.style.background = sel ? '#eff6ff' : (S.compShift ? '#fef9c3' : '#f4f4f5');
      S.compShiftBtn.style.borderColor = sel ? '#bfdbfe' : (S.compShift ? '#eab308' : '#e4e4e7');
    };
    paintPunct();

    // The bar inserts; the control row acts. Delete used to sit at the end of
    // the bar, where it read as a seventh mark and was one slip away from the
    // exclamation point. It belongs with the mic and the pencil: those change
    // what the draft IS, and so does dropping a word.
    // The control row's buttons are sized for a thumb, not for a toolbar: 20px
    // glyphs in a 42px-tall key. They were 16px in a 30px key, which is the
    // size a mouse pointer wants and the size a phone misses.
    const CBTN = BTN + 'padding:10px 15px;border-radius:8px;font-size:13px;';
    const cRow = el('div', 'display:flex;gap:6px;align-items:center;');
    const grow = (b) => { if (b._icon) b._icon.style.fontSize = '20px'; return b; };
    if (hasDictation()) {
      S.compMic = grow(icon('microphone', CBTN, 'Dictate (tap again to stop)'));
      S.compMic.addEventListener('click', () => S.dict && S.dict.toggle());
      cRow.appendChild(S.compMic);
    }
    // The pencil is the MODE switch, not a one-way door: dictation is the
    // default and typing is the other half of the same toggle.
    S.compEdit = grow(icon('pencil-simple', CBTN, 'Type instead (opens the keyboard)'));
    S.compEdit.addEventListener('click', () => (S.editing ? closeEditor() : openEditor()));
    // In edit mode the button grows the word DONE, and wears a CHECK.
    //
    // It wore a microphone first, on the theory that the icon should say where
    // the tap LANDS (back in dictation) while the word says what the tap IS.
    // Adding the word was already the second attempt, after readers reported
    // finding no confirm at all. Both readings were wrong, and the field shot
    // of 2026-08-10 shows why: three signals stack. The glyph is a microphone,
    // the fill was amber, and the real mic button hides in edit mode, so this
    // one SLIDES INTO THE MIC'S SLOT. Together they say "recording" while the
    // keyboard is open and nothing is being heard. A check says the one thing
    // the button actually does, in the same green as the pin cluster's confirm
    // key, and the mic now stays put and disabled rather than vanishing.
    S.compEditTxt = el('span', 'display:none;margin-left:7px;vertical-align:middle;');
    S.compEditTxt.textContent = 'Done';
    S.compEdit.appendChild(S.compEditTxt);
    cRow.appendChild(S.compEdit);
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
      'Press and drag to move the cursor'));
    bindCursorPad(S.compPad);
    cRow.appendChild(S.compPad);
    cRow.appendChild(el('div', 'flex:1;'));
    S.compSave = grow(icon('check', CBTN + 'background:#facc15;border-color:#eab308;color:#18181b;',
      'Save note'));
    S.compSave.addEventListener('click', saveDraft);
    cRow.appendChild(S.compSave);

    // Text and pad side by side, the pad on the right where the thumb is. It
    // used to be a strip stacked ON the text with the seam shared, which read
    // as one control and was the right answer while the marks were six narrow
    // cells. Three big keys are not furniture to hide against an edge; they
    // are the thing being aimed at, so they get their own column and a gap.
    // The stack is also the handles' LAYER: it does not scroll and does not
    // clip, so a ball may hang above the text box's first line or below its
    // last. Its listeners are delegated, since the painter rebuilds those
    // elements on every repaint and a per-element handler would not survive.
    const stack = el('div', 'display:flex;gap:6px;align-items:stretch;position:relative;');
    S.compStack = stack;
    stack.addEventListener('pointerdown', (e) => {
      const t = e.target;
      const dir = t && t.getAttribute && t.getAttribute('data-nudge');
      if (dir && S.dict && S.compArmed) {
        e.preventDefault(); e.stopPropagation();
        S.dict.nudge(S.compArmed, +dir); paintDraft(); return;
      }
      // Confirm: the edge is where it should be. Disarms and keeps the
      // selection, which is what tapping the pinhead again does, said with a
      // word instead of a reach back into the text.
      if (t && t.getAttribute && t.getAttribute('data-disarm')) {
        e.preventDefault(); e.stopPropagation();
        S.compArmed = null; paintDraft(); return;
      }
      const edge = t && t.closest && t.closest('[data-edge]');
      if (edge) {
        e.preventDefault(); e.stopPropagation();
        const which = edge.getAttribute('data-edge');
        S.compArmed = (S.compArmed === which) ? null : which;
        paintDraft();
      }
    });
    stack.appendChild(S.compView);
    stack.appendChild(S.compPunct);
    // Bound here rather than beside the view, because the pointerup listener
    // needs the stack: a tap on a handle has to reach the same tap counter as
    // a tap on a word, and a handle is not inside the scrolling box.
    bindComposeGestures(S.compView, S.compBody, stack);
    S.compose.appendChild(S.compCap);
    S.compose.appendChild(stack);
    S.compose.appendChild(S.compTa);
    S.compose.appendChild(cRow);
    p.appendChild(S.compose);

    S.listEl = el('div', 'overflow-y:auto;touch-action:pan-y;overscroll-behavior:contain;'
      + 'display:flex;flex-direction:column;gap:6px;min-height:0;padding:0 14px 10px;');
    p.appendChild(S.listEl);

    // The status line reports what HAPPENED (a note added, a copy made, a jot
    // that failed). It does not explain how to use the card: the lit chip
    // already says which mode is on, and a paragraph of instructions under a
    // list is the kind of text nobody reads twice and everybody scrolls past
    // forever. It collapses to nothing when there is nothing to report.
    S.status = el('div', 'color:#71717a;font-size:11px;padding:0 14px;background:#fafafa;');
    p.appendChild(S.status);

    root.appendChild(p);
    d.body.appendChild(root);
    S.ui = root;
    renderList();
  };


  const renderList = () => {
    if (!S.listEl) return;
    if (S.countEl) S.countEl.textContent = S.items.length
      ? S.items.length + ' note' + (S.items.length === 1 ? '' : 's') : '';
    S.listEl.textContent = '';
    S.items.forEach((it, i) => {
      const on = it.id === S.selId;
      const row = el('div', 'display:flex;gap:8px;align-items:flex-start;'
        + `background:${on ? '#fffbeb' : '#fff'};border:1px solid ${on ? '#eab308' : '#ececee'};`
        + 'border-radius:10px;padding:7px 10px;cursor:pointer;');
      const body = el('div', 'flex:1;min-width:0;');
      const t = it.target;
      body.appendChild(el('div', 'color:#a16207;font-size:11px;font-style:italic;margin-bottom:2px;',
        (i + 1) + '. ' + (t.type === 'text' ? '“' + clip(t.quote.exact, 70) + '”'
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
      // Remove only. Editing a note lives in the drawer's Notes tab, which has
      // a box you can write a sentence in; this card's job is capture and
      // selection. Keeping a pencil here too would be a second editor for the
      // same text in a worse place, and it sat two pixels from the delete.
      const del = el('button', 'border:0;background:none;color:#a1a1aa;cursor:pointer;font-size:16px;'
        + 'line-height:1;width:30px;height:26px;display:flex;align-items:center;justify-content:center;'
        + 'margin:-2px -2px 0 0;', '×');
      del.title = 'Remove this note';
      del.addEventListener('click', (e) => { e.stopPropagation(); remove(it.id); });
      row.appendChild(body);
      row.appendChild(del);
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
      });
    } else { S.compBody.textContent = text; }
    S.compHint.style.display = (text || S.compInterim) ? 'none' : 'inline';
    // The hint reports the engine rather than the mode. It read "Listening"
    // unconditionally, which was true of every draft until one could open
    // idle: a staged page note with the microphone off said it was listening
    // and heard nothing, which is the worst thing a recorder can say.
    S.compHint.textContent = !S.dict ? 'Tap the pencil to type.'
      : S.dict.listening ? 'Listening. Tap the pencil to type instead.'
      : 'Tap the microphone to dictate, or the pencil to type.';
    // The pad belongs to dictation mode, not to the moment of speaking: the
    // keyboard carries its own punctuation, so typing mode hides it, and a
    // browser with no recognizer never shows it. The text box is a closed box
    // either way now that the pad sits beside it rather than on top of it, so
    // there is no shared seam to open and close.
    S.compPunct.style.display = (!S.editing && !!S.dict) ? 'flex' : 'none';
    paintPunct();     // the pad's face follows the selection, so it repaints with the text
    // The arrows are the ARMED state's controls, not the selection's: with a
    // selection but no pin armed there is no edge for them to move, and a pair
    // of arrows that need a prior tap to mean anything is worse than no arrows.
    // Save STAYS live while a pin is armed. The arrows ride the pin now, so
    // there is no contest for the row, and a reader who is done adjusting can
    // ship without disarming first.
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
      S.compMic.title = S.editing ? 'Dictation is paused while you type'
        : (listening ? 'Recording. Tap to stop.' : 'Dictate (tap again to stop)');
      // In edit mode the mic STAYS and goes dim rather than vanishing. Hiding
      // it collapsed the row and slid the Done button into its place, which is
      // half of why that button read as a microphone that was live. A dimmed
      // mic holds the slot and says the plain thing: dictation is off.
      S.compMic.disabled = !!S.editing;
      S.compMic.style.opacity = S.editing ? '.35' : '';
      S.compMic.style.cursor = S.editing ? 'default' : 'pointer';
    }
    // Delete belongs to the dictation buffer; the keyboard has its own.
    if (S.compBack) S.compBack.style.display = S.editing ? 'none' : 'flex';
    // So does the cursor pad: a textarea has a caret the platform moves.
    // Back to '' rather than to flex, which is what the punctuation keys use.
    // A button's own display is inline-block, and its line box is what gives
    // the control row its height: as a flex container the pad lost the leading
    // and stood 42px against its neighbours' 47.8 (measured, not eyeballed).
    if (S.compPad) S.compPad.style.display = S.editing ? 'none' : '';
  };

  // ── Gestures over the painted buffer ──────────────────────────────────────
  // Three, and no drag among them. A LONG PRESS selects the word under the
  // finger (or drops a caret, on whitespace). Tapping a HANDLE arms it. The
  // next tap in the text places the armed edge there.
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
  // A double tap paints a handle AT the point that was tapped, so the third
  // tap of a triple lands on the pin rather than on the word, and a pin is not
  // inside the scroll box: the run was being broken by furniture the run
  // itself had just put there. Measured in a real browser (the triple selected
  // nothing and armed a pin instead), which is the only place it can be: the
  // handle has to have a position for the finger to find it.
  function bindComposeGestures(surface, host, layer) {
    let timer = null, downX = 0, downY = 0, longFired = false, lastTap = 0, taps = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    // A tap on the canvas is a request to go back to the end and start
    // appending: it drops the selection, disarms, and puts the caret past the
    // last character, which in this buffer is the same state as having no
    // range at all. It is the one-tap way out of selection mode, and it reads
    // the way tapping past the text reads in any editor.
    const toEnd = () => {
      S.dict.caretAt(S.dict.text.length);
      S.compArmed = null;
      paintDraft();
    };

    on(surface, 'pointerdown', (e) => {
      if (S.editing || !S.dict || S.padDrag) return;   // the pad owns the pointer
      downX = e.clientX; downY = e.clientY; longFired = false;
      clear();
      timer = setTimeout(() => {
        timer = null; longFired = true;
        // A long press that misses the text leaves everything alone. A tap is
        // a commit and means what it lands on; a press held over blank canvas
        // is an aim that missed, and collapsing the selection the reader was
        // about to refine would be the wrong reading of a slip.
        if (!window.Dictate.hitsText(host, downX, downY)) return;
        const i = offsetFromPoint(host, downX, downY);
        if (i == null) return;
        S.dict.selectWordAt(i);
        S.compArmed = null;
        paintDraft();
      }, LONG_MS);
    });

    on(surface, 'pointermove', (e) => {
      if (timer && (Math.abs(e.clientX - downX) > SLOP || Math.abs(e.clientY - downY) > SLOP)) clear();
    });

    on(surface, 'pointercancel', clear);

    on(layer || surface, 'pointerup', (e) => {
      clear();
      if (S.editing || !S.dict || longFired || S.padDrag) return;
      // Three kinds of target, and only two of them are part of a tap run: the
      // text surface, and the furniture the selection painted (a pin, an
      // arrow, the confirm key). Everything else in the layer, the pad and the
      // bottom row, ends the run and is handled by its own listener.
      const t = e.target;
      const pin = t && t.closest && t.closest('[data-edge],[data-d="nudge"]');
      if (!pin && !(surface.contains && surface.contains(t))) { taps = 0; return; }
      // The canvas wins before the count, so a tap past the text always means
      // the end even when it lands third in a quick run.
      if (!pin && !window.Dictate.hitsText(host, e.clientX, e.clientY)) { taps = 0; toEnd(); return; }
      // Taps in a run, counted rather than paired. A DOUBLE takes the word,
      // the same as a long press: the faster of the two when the target is
      // already in view, and offering both costs nothing (one is quick, the
      // other is sure). A TRIPLE takes the whole buffer, which is the
      // selection a reader wants most often after a bad stretch and the one
      // with no other gesture: word, then everything.
      const now = Date.now();
      taps = (now - lastTap) < DBL_MS ? taps + 1 : 1;
      lastTap = now;
      // Counted BEFORE the point is resolved, because select-all does not need
      // one: making it wait on a caret-from-point would make the whole-buffer
      // gesture depend on which character the third tap happened to land on.
      // It also overrides the pin the second tap just painted there.
      if (taps >= 3) { S.dict.select(0, S.dict.text.length); S.compArmed = null; paintDraft(); return; }
      if (pin) return;                    // pointerdown already armed or stepped it
      const i = offsetFromPoint(host, e.clientX, e.clientY);
      // The run survives this. hitsText already said the point is on text, so
      // a caret-from-point that answers nothing is an anomaly, not a gesture:
      // resetting the count here would let one bad reading swallow the third
      // tap of a triple.
      if (i == null) { toEnd(); return; }
      if (taps === 2) { S.dict.selectWordAt(i); S.compArmed = null; paintDraft(); return; }
      if (S.compArmed) { S.dict.moveEdge(S.compArmed, i); }
      else if (S.dict.range) { S.dict.caretAt(i); S.compArmed = null; }
      else return;                        // a single tap on plain text with nothing live waits
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
  // Horizontal is continuous and geared down, so the thumb travels further
  // than the caret: that is the precision the pad exists for.
  //
  // VERTICAL IS STEPPED, one line per PAD_LINE of travel, and that is not a
  // refinement of the same idea but a correction to it. Geared the same way,
  // the box's own height did the damage: six lines inside 172px meant a finger
  // crossing the box was the whole buffer, and every drag that went a little
  // too far clamped to the first line and read as "the cursor jumped to the
  // beginning" (field report, 2026-08-12). A line is a discrete thing to move
  // by, so the pad moves by lines, and the x it lands at is the one the reader
  // set with their thumb rather than one recomputed per line.
  const PAD_GAIN = 0.6;
  const PAD_LINE = 42;     // px of travel per line moved
  const PAD_EDGE = 6;      // px of scroll per move while pinned at an edge
  // No selection anywhere while a drag is live. The gesture is a press held
  // over a page whose text the browser is perfectly willing to select under
  // it, which on a phone is what a long press MEANS: field-tested, and what
  // came back was a page full of blue.
  const PAD_LOCK = 'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;';

  // Where the caret IS, in client coordinates. The painted caret when there is
  // one, and the end of the last painted line otherwise, which is the same
  // place a null range means.
  const caretPoint = () => {
    const host = S.compBody;
    if (!host || !host.getBoundingClientRect) return null;
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
      if (S.compView) {
        S.compView.style.boxShadow = on ? '0 0 0 2px #2563eb' : '';
        S.compView.style.borderColor = on ? '#2563eb' : '#e4e4e7';
      }
      padScrim(on);
    };
    const move = (e) => {
      if (!from || !S.dict || !S.compView) return;
      e.preventDefault();
      const box = S.compView.getBoundingClientRect();
      const vx = from.x + (e.clientX - from.px) * PAD_GAIN;
      const vy = from.y + Math.round((e.clientY - from.py) / PAD_LINE) * from.line;
      // Held against the edge, SCROLL rather than stop. The box shows six
      // lines and a dictated note runs longer than that, so a pad that could
      // only reach what happens to be visible would send the reader back to
      // touching the text for exactly the notes where that is worst.
      const el2 = S.compView;
      if (vy > box.bottom - PAD_EDGE && el2.scrollTop + el2.clientHeight < el2.scrollHeight) {
        el2.scrollTop += PAD_EDGE;
      } else if (vy < box.top + PAD_EDGE && el2.scrollTop > 0) {
        el2.scrollTop -= PAD_EDGE;
      }
      const cx = Math.min(box.right - PAD_EDGE, Math.max(box.left + PAD_EDGE, vx));
      const cy = Math.min(box.bottom - PAD_EDGE, Math.max(box.top + PAD_EDGE, vy));
      const i = offsetFromPoint(S.compBody, cx, cy);
      if (i == null) return;
      // Always a caret, never an edge of a selection: the pad answers "where
      // does the next word go", and a reader who wanted the selection kept
      // would not be dragging the thing that places carets.
      S.dict.caretAt(i);
      S.compArmed = null;
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
    btn.addEventListener('pointerdown', (e) => {
      if (S.editing || !S.dict) return;      // the keyboard brings its own caret
      const at = caretPoint();
      if (!at) return;
      e.preventDefault();
      const w = win();
      const cs = w && w.getComputedStyle ? w.getComputedStyle(S.compView) : null;
      from = { x: at.x, y: at.y, px: e.clientX, py: e.clientY,
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

  const openEditor = () => {
    if (!S.compose) return;
    // Flush BEFORE stopping. The phrase still on screen is part of what is
    // being edited, and stop() runs the engine's end handler, which clears the
    // interim: the other order opened the keyboard on a draft missing the
    // sentence the reader was looking at when they reached for the pencil.
    // Same defect the stage's pencil had, found there and fixed in both.
    if (S.dict) S.dict.flush();
    // Remember whether the engine was actually running. Closing used to start
    // it unconditionally, on the reading that "dictation is the default mode",
    // so a reader who had stopped listening, tapped the pencil, and tapped
    // Done came back to a live microphone they never asked for. Resume what
    // was interrupted, nothing more.
    S.dictWasOn = !!(S.dict && S.dict.listening);
    stopDictation();
    S.editing = true;
    S.compTa.value = S.dict ? S.dict.text : '';
    S.compView.style.display = 'none';
    S.compTa.style.display = 'block';
    // Green, and a check. Amber is this UI's live accent and the Save key
    // already wears it; green is the pin cluster's confirm colour and means
    // the same thing here, "that is the text I want".
    S.compEdit.style.background = '#dcfce7';
    S.compEdit.style.borderColor = '#86efac';
    S.compEdit.style.color = '#15803d';
    S.compEdit.title = 'Done: back to dictation';
    setIcon(S.compEdit, 'check');
    if (S.compEditTxt) S.compEditTxt.style.display = 'inline';
    paintDraft();
    S.compTa.focus();
  };
  const closeEditor = () => {
    if (!S.editing) return;
    // The edit is the truth on the way out, so dictation resumes from it.
    if (S.dict) S.dict.text = S.compTa.value;
    S.editing = false;
    S.compTa.style.display = 'none';
    S.compView.style.display = 'block';
    S.compEdit.style.background = '#f4f4f5';
    S.compEdit.style.borderColor = '#d4d4d8';
    S.compEdit.style.color = '';
    S.compEdit.title = 'Type instead (opens the keyboard)';
    setIcon(S.compEdit, 'pencil-simple');
    if (S.compEditTxt) S.compEditTxt.style.display = 'none';
    paintDraft();
    // Resume only if the keyboard interrupted a live engine. Coming back to
    // where you were is worth not charging for; being switched on is not.
    if (S.dictWasOn && S.dict && S.dict.available()) S.dict.start();
    S.dictWasOn = false;
  };

  const cancelDraft = () => {
    stopDictation();
    S.draft = null;
    S.dictWasOn = false;
    if (S.draftBox) { S.draftBox.remove(); S.draftBox = null; }
    if (S.compose) {
      S.compose.style.display = 'none';
      S.editing = false;
      S.compTa.style.display = 'none';
      S.compTa.value = '';
      S.compView.style.display = 'block';
      S.compPunct.style.display = 'none';
      // The pencil is a MODE switch, so clearing S.editing without putting its
      // face back left it wearing the editor's: after saving a note you typed,
      // the next draft opened in dictation under a button reading "Back to
      // dictation" with a microphone on it. Found by a headless scenario that
      // could no longer find the control it needed (2026-08-09).
      S.compEdit.style.background = '#f4f4f5';
      S.compEdit.style.borderColor = '#d4d4d8';
      S.compEdit.style.color = '';
      S.compEdit.title = 'Type instead (opens the keyboard)';
      setIcon(S.compEdit, 'pencil-simple');
      if (S.compEditTxt) S.compEditTxt.style.display = 'none';
      if (S.dict) S.dict.text = '';
      S.compInterim = '';
    }
  };

  // A draft is always a NEW note. Reopening one to edit it used to route
  // through here too; that path is gone, because editing a note is the drawer's
  // job now and a compose box built for catching one dictated sentence was the
  // wrong place to revise a paragraph anyway.
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
    const { target } = S.draft;
    // Take the interim with it. Tapping save while the last phrase is still
    // grey is not a request to discard that phrase; it is a reader accepting
    // what is on screen.
    if (!S.editing && S.dict) S.dict.flush();
    const note = draftText();
    cancelDraft();
    const it = add(target, note);
    select(it.id, { scroll: false });
    setStatus('Note added');
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

  const onSelectionEnd = () => {
    setTimeout(() => {
      if (S.mode || S.padDrag) return;          // a mode or the pad owns the pointer
      const d = S.doc, sel = win() && win().getSelection();
      hideSelBtn();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      // Ignore selections inside our own UI.
      const anc = range.commonAncestorContainer;
      const ancEl = anc.nodeType === 1 ? anc : anc.parentElement;
      if (!ancEl || ancEl.closest(`[${UI_ATTR}]`)) return;
      if (!d.body.contains(ancEl)) return;
      const rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;
      const bx = Math.min(rect.right + 4, (win().innerWidth || 800) - 70);
      const by = Math.max(6, rect.top - 30);
      selBtn = d.createElement('button');
      selBtn.setAttribute(UI_ATTR, '');
      selBtn.textContent = '+ note';
      selBtn.style.cssText = `position:fixed;left:${bx}px;top:${by}px;z-index:${Z + 1};` + BTN
        + 'background:#facc15;color:#18181b;box-shadow:0 3px 10px rgba(0,0,0,.4);';
      selBtn.addEventListener('pointerdown', (e) => e.preventDefault());   // keep the selection
      selBtn.addEventListener('click', () => {
        const q = quoteFor(d.body, range);
        hideSelBtn();
        if (!q) return;
        const display = displayFor(range);
        // A drag that starts in inter-element whitespace has an ELEMENT for
        // startContainer; the block (and so the heading trail) should come
        // from the first selected node, not the container.
        const sc = range.startContainer;
        const startNode = sc.nodeType === 3 ? sc : (sc.childNodes[range.startOffset] || sc);
        const block = blockOf(startNode);
        const addr = addressFor(block, range);
        beginDraft({ type: 'text', quote: q, display,
                     selector: addr.selector, span: addr.span,
                     label: block ? headingTrail(block) : '' }, q.exact);
        const s = win().getSelection();
        if (s) s.removeAllRanges();
      });
      d.body.appendChild(selBtn);
    }, 10);
  };

  // ── Mode: element pick ────────────────────────────────────────────────────
  const syncChips = () => {
    for (const [k, b] of Object.entries(S.modeChips || {})) {
      const on = S.mode === k;
      b.style.background = on ? '#facc15' : '#fff';
      b.style.borderColor = on ? '#eab308' : '#e4e4e7';
      b.style.color = on ? '#18181b' : '#3f3f46';
    }
  };

  const endMode = () => {
    if (S.cleanupMode) S.cleanupMode();
    S.cleanupMode = null;
    S.mode = null;
    syncChips();
  };

  // The "+ note" confirm chip the staged modes share with the text flow: the
  // gesture SELECTS, the chip is the moment the note begins. Nothing opens an
  // input uninvited.
  const NOTE_BTN = `position:fixed;z-index:${Z + 1};` + BTN
    + 'background:#facc15;border-color:#eab308;color:#18181b;box-shadow:0 3px 10px rgba(0,0,0,.25);';

  const startPick = () => {
    endMode();
    S.mode = 'pick';
    syncChips();
    // The card STAYS. It used to hide for the length of a capture mode, on the
    // reasoning that it covers a third of a phone screen and the element you
    // want may be under it. True, and the wrong fix: hiding it also hid the
    // chip that exits, leaving the mode with one way out, which was to finish a
    // note. Now it stays on top and moves by its header, so what it covers is
    // a thing you can drag it off rather than a thing you are stuck behind.
    setStatus('');
    const d = S.doc;
    const mkBox = (css) => {
      const b = d.createElement('div');
      b.setAttribute(UI_ATTR, '');
      b.style.cssText = `position:fixed;pointer-events:none;z-index:${Z + 1};border-radius:4px;display:none;` + css;
      d.body.appendChild(b);
      return b;
    };
    const hover = mkBox('border:2px dashed rgba(250,204,21,.8);');
    const staged = mkBox('border:2px solid #facc15;background:rgba(250,204,21,.12);');
    let cur = null, sel = null, btn = null;
    const placeAt = (box, r) => {
      box.style.display = 'block';
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const removeBtn = () => { if (btn) { btn.remove(); btn = null; } };
    const move = (e) => {
      const el2 = d.elementFromPoint(e.clientX, e.clientY);
      if (!el2 || el2.closest(`[${UI_ATTR}]`)) { hover.style.display = 'none'; cur = null; return; }
      cur = el2;
      if (cur !== sel) placeAt(hover, cur.getBoundingClientRect());
      else hover.style.display = 'none';
    };
    // A tap stages; poking around just moves the stage. Only "+ note" commits.
    const click = (e) => {
      if (!cur) return;
      e.preventDefault();
      e.stopPropagation();
      sel = cur;
      const r = sel.getBoundingClientRect();
      placeAt(staged, r);
      hover.style.display = 'none';
      removeBtn();
      btn = d.createElement('button');
      btn.setAttribute(UI_ATTR, '');
      btn.textContent = '+ note';
      btn.style.cssText = NOTE_BTN
        + `left:${Math.min(r.right - 60, (win().innerWidth || 800) - 70)}px;top:${Math.max(6, r.top - 30)}px;pointer-events:auto;`;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const el2 = sel;
        const rr = el2.getBoundingClientRect();
        const w = win();
        const rectDoc = { x: Math.round(rr.left + w.scrollX), y: Math.round(rr.top + w.scrollY),
                          w: Math.round(rr.width), h: Math.round(rr.height) };
        const excerpt = clip(el2.innerText || el2.textContent, 400);
        const target = { type: 'element', selector: cssPath(el2, d.body), label: headingTrail(el2), excerpt };
        endMode();
        beginDraft(target, excerpt, rectDoc);
      });
      d.body.appendChild(btn);
    };
    const key = (e) => { if (e.key === 'Escape') { endMode(); setStatus('Pick cancelled'); } };
    d.addEventListener('mousemove', move, true);
    d.addEventListener('click', click, true);
    d.addEventListener('keydown', key, true);
    S.cleanupMode = () => {
      d.removeEventListener('mousemove', move, true);
      d.removeEventListener('click', click, true);
      d.removeEventListener('keydown', key, true);
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
        const target = { type: 'region', rect, excerpt, label: first ? headingTrail(first) : '' };
        endMode();
        beginDraft(target, excerpt, rect);
      });
      cover.appendChild(btn);
    };
    const key = (e) => { if (e.key === 'Escape') { endMode(); setStatus('Region cancelled'); } };
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
    on(doc, 'click', onDocClick);
    const w = win();
    if (w) on(w, 'resize', () => paintBoxes());
    // The drawer's state, heard on this window and on the top one, since under
    // a toss the kit runs in the frame and the drawer is the shell's. Then ask
    // once: a fab that mounted before this kit loaded has already broadcast,
    // and nothing repeats an announcement nobody was listening for yet.
    on(window, 'annotate:drawer', onDrawerState);
    try { if (window.top && window.top !== window) on(window.top, 'annotate:drawer', onDrawerState); } catch { }
    announce('annotate:drawer-query');
    paint();
    S.panel.style.display = 'flex';
    return window.Annotate;
  };

  const disable = () => {
    endMode();
    // A drag can be live when the annotator is switched off from the drawer:
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
    S.ui = S.panel = S.status = S.listEl = null;
    S.compose = S.compTa = S.compCap = S.compMic = S.countEl = null;
    S.compView = S.compBody = S.compHint = S.compPunct = null;
    S.compInterim = ''; S.compArmed = null;
    S.compEdit = S.compEditTxt = S.compBack = S.compShiftBtn = S.compPad = null;
    S.padScrim = null;
    S.compSave = S.compStack = null;
    S.reviewBtn = S.pageChip = null;
    S.compShift = false;
    S.dict = null;
    S.editing = false;
    S.selId = S.selRow = null;
    S.modeChips = {};
    S.doc = null;
  };

  window.Annotate = {
    enable, disable, add, remove, update, clear, select, copy, saveJot, toMarkdown, toJSON,
    startPick, startRegion, notePage, review,
    get items() { return S.items.slice(); },
    get enabled() { return !!S.ui; },
    get selected() { return S.items.find(i => i.id === S.selId) || null; },
    subject: null,
    // pure helpers, exposed for tools/test/annotate.test.mjs
    _textIndex: textIndex, _quoteFor: quoteFor, _resolveQuote: resolveQuote,
    _displayFor: displayFor, _quoteLines: quoteLines,
    _cssPath: cssPath, _headingTrail: headingTrail, _clip: clip,
    _addressFor: addressFor, _addressText: addressText, _hitTest: hitTest,
    _announce: announce, _paintDraft: () => paintDraft(),
    _state: S,
  };
})();
