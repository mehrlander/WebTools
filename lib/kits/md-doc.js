// kits/md-doc.js — a markdown document rendered as something you can read and
// take pieces OUT of.
//
// Two jobs over one render, and they are the same job seen from either end:
//
//   CONTAIN    a wide table, code block or image scrolls or shrinks inside its
//              own box rather than widening the column it sits in. Without this
//              the widest thing in a doc sets the width of everything around it,
//              and a reader dragging sideways to see column six drags the prose
//              with it.
//   CUT        every heading gets a control that copies THAT SECTION'S SOURCE,
//              with the address it came from on top. Wikipedia's [edit] link,
//              answering a different verb: the unit a reader wants to act on
//              is the section, and what they want to act on it WITH is the
//              markdown, not the HTML it was rendered into.
//
// The two arrived together because they are the same complaint from two sides.
// A rendered document is a reading surface that has thrown away its source:
// the table has lost the pipes that would have let it wrap, and the section has
// lost the `##` that would have let it travel. Both are recoverable only by the
// surface that still holds the source, which is this one.
//
// WHY THE SOURCE AND NOT THE SELECTION. Copying a rendered section gives you
// prose with the structure flattened out: a table becomes tab-separated runs, a
// link becomes its label, a fenced block loses its fence. Handing that to a
// model and asking for a revision gets you a revision of the flattening. The
// source slice is the thing that can be revised and put back, which is the
// whole point of cutting at a section rather than at a paragraph.
//
//   mdDoc.split(src)                 -> [{ index, depth, title, slug, raw,
//                                          start, end, startLine, endLine }]
//   mdDoc.reference(sec, addr)       -> the provenance line(s), as an array
//   mdDoc.payload(sec, addr)         -> reference + blank line + sec.raw
//   mdDoc.html(src, o?)              -> a prose HTML STRING, tables contained
//   mdDoc.render(host, src, o?)      -> mounts into host; returns { box, sections }
//   mdDoc.contain(el)                -> el, nothing left that can widen a column
//
// `addr` is `{ repo, ref, path, url }`, all optional. It is what makes a copied
// section worth pasting: a section with no address is a passage nobody can find
// again, and the address is the half the reader cannot reconstruct.
//
// SECTIONS NEST, the way Wikipedia's do: a section runs from its heading to the
// next heading of EQUAL OR HIGHER rank, so copying `## Surfacing primitives`
// brings its `###` subsections with it and each of those still has its own
// control. A reader asking for "this section" nearly always means the part of
// the document under that title, not the paragraphs before the next subheading.
//
// Requires `window.marked` to be loaded already (the same lazy load every other
// markdown surface here does), and reads `window.io.copy` when it is present
// for the iOS clipboard path. No Alpine, no gh, no DOM opinions of its own: it
// takes the host it is handed.
//
// kits/chat-render.js carries its own copy of the table wrap, and keeps it: it
// is a standalone script a page can drop in from jsDelivr with nothing else,
// and tools/test/chat-render-wide-table.test.mjs pins it there. The wrap is six
// lines; the independence is worth more than the six.
(() => {
  if (window.mdDoc) return;

  const H = 'h1,h2,h3,h4,h5,h6';
  const PROSE = 'prose prose-sm !max-w-none break-words prose-pre:bg-base-200 prose-pre:text-base-content';

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k) n.append(k);
    return n;
  };

  // ── Contain ───────────────────────────────────────────────────────────────
  // Three elements can be wider than the column they are in, and each widens it
  // rather than being clipped by it. A TABLE's intrinsic min-content width (the
  // longest unbreakable run in each column) is a floor no ancestor can shrink
  // below. A PRE is `white-space: pre`, so a long command line does not wrap at
  // all. An IMG is its own pixel width. In a swipe-deck slide, the thing that
  // ends up scrolling is the SLIDE, which drags the headings and the prose
  // sideways along with whatever overflowed and reads as the document being
  // broken.
  //
  // The table's wrapper does not force `max-content` on it. Typography's default
  // `width: 100%` still wraps cells, so a table that CAN fit still fits and only
  // one that genuinely cannot starts scrolling. Same call, and the same reasons,
  // as chat-render's.
  //
  // INLINE STYLES, NOT UTILITY CLASSES, and that is the lesson kits/guide-render.js
  // paid for: a class that arrives in the DOM from a JS string depends on the
  // Tailwind browser build having generated a rule for it, and when it has not
  // there is no error anywhere, just a layout that quietly does not hold. The
  // `pre` case makes the point twice over, since the rule that normally saves it
  // belongs to the typography plugin: a page that renders prose without loading
  // that plugin has `overflow-x: visible` on every code block. Measured 2026-08-26
  // in the headless render, where the plugin ships no dist CSS and resolves to a
  // miss: a 922px command line inside a 398px column, slide scrollWidth 938
  // against a 430px track. The utility classes stay on the wrapper as the
  // readable statement of intent; the inline style is what makes it true.
  function contain(root) {
    if (!root) return root;
    for (const t of root.querySelectorAll('table')) {
      if (t.parentElement && t.parentElement.hasAttribute('data-md-scroll')) continue;
      const box = el('div', {
        class: 'overflow-x-auto max-w-full',
        style: 'overflow-x:auto;max-width:100%',
        'data-md-scroll': '',
      });
      t.replaceWith(box);
      box.append(t);
    }
    // A pre scrolls as ITSELF: it is already a block with its own edges, so
    // there is nothing a wrapper would add.
    for (const pre of root.querySelectorAll('pre')) {
      pre.style.overflowX = 'auto';
      pre.style.maxWidth = '100%';
    }
    for (const img of root.querySelectorAll('img')) {
      if (!img.style.maxWidth) img.style.maxWidth = '100%';
    }
    return root;
  }

  // ── Cut ───────────────────────────────────────────────────────────────────
  // GitHub's own slug rule, near enough to link with: lowercased, punctuation
  // dropped, spaces hyphenated. Used for the blob URL's fragment, so a copied
  // reference opens on the section rather than at the top of a long file.
  const slugify = (s) => String(s || '').trim().toLowerCase()
    .replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-');

  // The headings, found in the SOURCE rather than in the rendered HTML, and
  // found through the parser rather than by a line regex. `# ` inside a fenced
  // block is not a heading and a regex cannot tell; the lexer already knows.
  //
  // Only TOP-LEVEL heading tokens count. A heading inside a blockquote or a
  // list item is a nested token, and render() pairs this list against the box's
  // direct-child headings, so the two agree by construction: both take exactly
  // the headings that sit at the document's own level.
  //
  // Offsets come from locating each token's `raw` forward from where the last
  // one ended, rather than from summing raw lengths. Summing drifts the moment
  // one token's raw is not byte-exact; searching forward re-anchors on every
  // token and cannot drift past the next match.
  function headings(src) {
    const marked = window.marked;
    if (!marked || !marked.lexer) return [];
    let toks;
    try { toks = marked.lexer(String(src ?? '')); } catch { return []; }
    const out = [];
    let at = 0;
    for (const t of toks) {
      const raw = typeof t.raw === 'string' ? t.raw : '';
      const i = raw ? src.indexOf(raw, at) : -1;
      const start = i >= 0 ? i : at;
      if (i >= 0) at = i + raw.length;
      else at = at + raw.length;
      if (t.type === 'heading') out.push({ depth: t.depth, title: String(t.text || '').trim(), start });
    }
    return out;
  }

  // Line numbers, because the point of copying a section is usually to get a
  // revision back, and "lines 43-91 of this file" is what turns a revision into
  // an edit somebody can apply. One pass over the newlines, so a long document
  // costs one scan rather than one per section.
  const lineIndex = (src) => {
    const nl = [];
    for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) nl.push(i);
    return (offset) => {
      let lo = 0, hi = nl.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < offset) lo = mid + 1; else hi = mid; }
      return lo + 1;
    };
  };

  function split(source) {
    const src = String(source ?? '');
    const heads = headings(src);
    if (!heads.length) return [];
    const lineAt = lineIndex(src);
    return heads.map((h, k) => {
      // To the next heading of equal or higher rank: the section INCLUDES its
      // subsections. A `##` copied without its `###`s is a fragment of an
      // argument, and the reader who wanted the fragment has the subsection's
      // own control right there.
      let end = src.length;
      for (let j = k + 1; j < heads.length; j++) {
        if (heads[j].depth <= h.depth) { end = heads[j].start; break; }
      }
      const raw = src.slice(h.start, end).replace(/\s+$/, '');
      return {
        index: k,
        depth: h.depth,
        title: h.title,
        slug: slugify(h.title),
        raw,
        start: h.start,
        end: h.start + raw.length,
        startLine: lineAt(h.start),
        endLine: lineAt(h.start + Math.max(0, raw.length - 1)),
      };
    });
  }

  // The address, in the estate's own `owner/repo[@ref]:path` grammar, because
  // that is the form every tool here can already resolve. The blob URL rides
  // beside it for the reader rather than for a tool, with the line anchor
  // GitHub understands.
  function reference(sec, addr = {}) {
    const { repo, ref, path, url } = addr || {};
    const where = path
      ? (repo ? repo + (ref ? '@' + ref : '') + ':' + path : path)
      : '';
    const L = [];
    const lines = sec && sec.startLine ? ` lines ${sec.startLine}-${sec.endLine}` : '';
    if (where) L.push(`From ${where}${lines}`);
    else if (lines) L.push(`From lines ${sec.startLine}-${sec.endLine}`);
    if (url) L.push(url + (sec && sec.startLine ? `#L${sec.startLine}-L${sec.endLine}` : ''));
    return L;
  }

  // The reference ALWAYS rides, and that is a decision rather than an
  // oversight. A section pasted into a chat without it is a passage the reader
  // then has to place by hand, which is the one part of the job they cannot do
  // from what is on their screen. A section pasted WITH it and not wanted costs
  // deleting two lines. The asymmetry decides it, the same way it decides the
  // annotator's preamble.
  function payload(sec, addr = {}) {
    if (!sec) return '';
    const head = reference(sec, addr);
    return head.length ? head.join('\n') + '\n\n' + sec.raw : sec.raw;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // `proseClass: ''` means the caller's own container is already the prose box,
  // so what comes back is the BODY rather than a second wrapper. A stray div
  // between a `.prose` element and its children is not fatal (typography
  // matches descendants), but it takes over `> :first-child`, and a caller who
  // has said "I have a container" should get what goes in it.
  function html(source, o = {}) {
    const marked = window.marked;
    if (!marked) return '';
    let out = marked.parse(String(source ?? ''));
    if (typeof o.sanitize === 'function') out = o.sanitize(out);
    const bare = o.proseClass === '' || o.proseClass === null;
    const box = el('div', { class: bare ? null : (o.proseClass || PROSE), html: out });
    contain(box);
    return bare ? box.innerHTML : box.outerHTML;
  }

  const copyText = async (text) => {
    if (window.io && typeof window.io.copy === 'function') return window.io.copy(text);
    return navigator.clipboard.writeText(text);
  };

  // The control lives INSIDE the heading, appended after its text, rather than
  // in a row of its own. A row would push every heading down a line and give
  // the document a second rhythm; inside, it rides the heading's own baseline
  // and disappears into it when nothing is hovering.
  //
  // `data-annotate-ui` is not decoration: kits/annotate.js walks the document's
  // text to anchor a quote and rejects any subtree carrying that attribute, so
  // stamping it here keeps a copy button out of the text a note is taken on.
  // Without it a selection dragged across a heading would carry an invisible
  // glyph into the quote and the anchor would not re-find itself.
  function copyControl(getText, o) {
    const b = el('button', {
      type: 'button',
      class: 'md-sec-copy align-middle ml-2 opacity-25 hover:opacity-100 focus:opacity-100 '
           + 'transition-opacity cursor-pointer not-prose',
      title: 'Copy this section as markdown, with its source address',
      'data-annotate-ui': '',
      'aria-label': 'Copy this section',
    }, el('i', { class: 'ph ph-copy text-[0.7em]' }));
    b.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const text = getText();
      const mark = b.firstElementChild;
      try {
        await copyText(text);
        mark.className = 'ph ph-check text-[0.7em]';
        b.classList.add('opacity-100', 'text-success');
      } catch {
        mark.className = 'ph ph-warning text-[0.7em]';
        b.classList.add('opacity-100', 'text-warning');
      }
      setTimeout(() => {
        mark.className = 'ph ph-copy text-[0.7em]';
        b.classList.remove('opacity-100', 'text-success', 'text-warning');
      }, 1400);
      if (typeof o.onCopy === 'function') o.onCopy(text);
    });
    return b;
  }

  function render(host, source, o = {}) {
    if (!host) return { box: null, sections: [] };
    const src = String(source ?? '');
    const marked = window.marked;
    host.textContent = '';
    if (!marked) {
      const pre = el('pre', { class: 'text-sm font-mono whitespace-pre-wrap m-0', text: src });
      host.append(pre);
      return { box: pre, sections: [] };
    }
    let out = marked.parse(src);
    if (typeof o.sanitize === 'function') out = o.sanitize(out);
    const box = el('div', { class: o.proseClass || PROSE, html: out });
    contain(box);

    let sections = [];
    if (o.sections !== false) {
      sections = split(src);
      // Pairing by ORDER, over the box's DIRECT children. Both lists are "the
      // headings at the document's own level", taken from the same parse, so
      // they line up one to one. A mismatched length means something rewrote
      // the HTML between the parse and here, and the honest answer is to attach
      // to as many as agree rather than to guess which side is right.
      const heads = [...box.querySelectorAll(':scope > ' + H.split(',').join(', :scope > '))];
      const n = Math.min(heads.length, sections.length);
      for (let i = 0; i < n; i++) {
        const sec = sections[i];
        heads[i].setAttribute('data-md-section', String(i));
        heads[i].id = heads[i].id || sec.slug;
        if (o.copy !== false) heads[i].append(copyControl(() => payload(sec, o.addr || {}), o));
      }
    }
    host.append(box);
    return { box, sections };
  }

  window.mdDoc = { split, reference, payload, html, render, contain, _slugify: slugify };
})();
