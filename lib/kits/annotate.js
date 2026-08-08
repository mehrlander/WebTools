// kits/annotate.js — notes pinned to pieces of a page: select text (or pick an
// element, or drag a rectangle), write a note, and carry the set out as
// markdown for a chat model, as JSON, or as a jot in the estate registry.
//
// The unit is the ANNOTATION SET, not the single note: the point of the kit is
// making several small notes against one document and shipping them together,
// which is what neither a screenshot nor a copied quote does. Three targeting
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
  const S = {
    doc: null, items: [], seq: 0,
    ui: null, panel: null, bubble: null, badge: null, status: null, listEl: null,
    mode: null, cleanupMode: null, listeners: [], boxes: [],
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

  const paint = (activeId) => {
    const w = win();
    if (!w || !w.Highlight || !w.CSS || !w.CSS.highlights) return;   // collect-only fallback
    ensureStyle();
    const ranges = [], active = [];
    for (const it of S.items) {
      if (it.target.type !== 'text') continue;
      const r = resolveQuote(S.doc.body, it.target.quote);
      if (r) (it.id === activeId ? active : ranges).push(r);
    }
    w.CSS.highlights.set(HL_NAME, new w.Highlight(...ranges));
    w.CSS.highlights.set(HL_NAME + '-active', new w.Highlight(...active));
    paintBoxes(activeId);
  };

  // Element/region notes get absolutely positioned outline boxes in an overlay
  // layer (document coordinates, so they ride ordinary scrolling).
  const paintBoxes = (activeId) => {
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

  const add = (target, note) => {
    const it = makeItem(target, note);
    S.items.push(it);
    if (S.ui) { paint(); renderList(); }
    return it;
  };

  const remove = (id) => {
    S.items = S.items.filter(i => i.id !== id);
    if (S.ui) { paint(); renderList(); }
  };

  const clear = () => { S.items = []; if (S.ui) { paint(); renderList(); } };

  // ── Serialization ─────────────────────────────────────────────────────────
  const docMeta = () => {
    const d = S.doc || window.document;
    const w = d.defaultView;
    return {
      title: (window.Annotate.subject && window.Annotate.subject.title) || d.title || '',
      url: (window.Annotate.subject && window.Annotate.subject.url) || (w ? w.location.href : ''),
    };
  };

  const toMarkdown = () => {
    const { title, url } = docMeta();
    const L = [`# Notes — ${title || 'untitled page'}`, ''];
    if (url) L.push(url, '');
    L.push(`${S.items.length} note${S.items.length === 1 ? '' : 's'} · ${new Date().toISOString().slice(0, 10)}`, '');
    S.items.forEach((it, i) => {
      const t = it.target;
      const head = t.type === 'text' ? `"${clip(t.quote.exact, 70)}"`
        : t.type === 'element' ? `element ${t.selector || ''}`
        : 'region';
      L.push(`## ${i + 1}. ${head}`);
      if (t.label) L.push(`Context: ${t.label}`);
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
  };

  const el = (tag, css, text) => {
    const e = S.doc.createElement(tag);
    e.setAttribute(UI_ATTR, '');
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };

  const mountUI = () => {
    const d = S.doc;
    const root = el('div', `position:fixed;left:12px;bottom:12px;z-index:${Z};font:13px/1.45 ui-sans-serif,system-ui;`);

    // Launcher pill: count badge, toggles the panel. Bottom-LEFT because the
    // FAB owns bottom-right.
    const pill = el('button', 'display:flex;align-items:center;gap:6px;background:#fff;color:#18181b;'
      + 'border:1px solid #d4d4d8;border-radius:999px;padding:7px 13px;cursor:pointer;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.15);font:600 12px ui-sans-serif,system-ui;', '✎ notes');
    pill.title = 'Annotations: select text on the page to add one';
    S.badge = el('span', 'background:#facc15;color:#18181b;border-radius:999px;padding:0 7px;font-weight:700;', '0');
    pill.appendChild(S.badge);
    pill.addEventListener('click', () => {
      S.panel.style.display = S.panel.style.display === 'none' ? 'flex' : 'none';
    });

    // Panel: header / capture / list / footer, each its own band so the card
    // reads as a designed thing rather than a pile of buttons.
    const p = el('div', 'display:none;flex-direction:column;position:absolute;left:0;bottom:40px;'
      + 'width:min(360px,90vw);max-height:min(480px,70vh);background:#fff;color:#27272a;'
      + 'border:1px solid #e4e4e7;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.16);overflow:hidden;');
    S.panel = p;

    const head = el('div', 'display:flex;align-items:center;gap:8px;padding:10px 14px 8px;');
    head.appendChild(el('span', 'font:700 13px ui-sans-serif,system-ui;color:#18181b;', '✎ Notes'));
    S.countEl = el('span', 'color:#71717a;font-size:12px;', '0');
    head.appendChild(S.countEl);
    const close = el('button', 'margin-left:auto;border:0;background:none;color:#a1a1aa;'
      + 'font-size:16px;line-height:1;cursor:pointer;padding:2px 4px;', '×');
    close.title = 'Hide the panel';
    close.addEventListener('click', () => { p.style.display = 'none'; });
    head.appendChild(close);
    p.appendChild(head);

    const chip = (label, title, fn) => {
      const b = el('button', 'border:1px solid #e4e4e7;background:#fff;color:#3f3f46;border-radius:999px;'
        + 'padding:4px 12px;font:600 12px ui-sans-serif,system-ui;cursor:pointer;', label);
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    const capture = el('div', 'display:flex;gap:6px;padding:0 14px 8px;');
    capture.appendChild(chip('⌖ Element', 'Pick one element to annotate (Esc cancels)', () => startPick()));
    capture.appendChild(chip('▭ Region', 'Drag a rectangle to annotate an area (Esc cancels)', () => startRegion()));
    p.appendChild(capture);

    S.hint = el('div', 'padding:2px 14px 12px;color:#8f8f98;font-size:12px;line-height:1.5;',
      'Select text on the page and tap “+ note”, or capture a unit with Element or Region.');
    p.appendChild(S.hint);

    S.listEl = el('div', 'overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;padding:0 14px 10px;');
    p.appendChild(S.listEl);

    // Footer: the one primary action first, the rest quiet.
    const foot = el('div', 'display:flex;align-items:center;gap:4px;padding:9px 14px;'
      + 'border-top:1px solid #f0f0f2;background:#fafafa;');
    const primary = el('button', 'border:1px solid #eab308;background:#facc15;color:#18181b;border-radius:8px;'
      + 'padding:5px 12px;font:600 12px ui-sans-serif,system-ui;cursor:pointer;', 'Copy markdown');
    primary.title = 'Copy every note as markdown, ready to paste to a model';
    primary.addEventListener('click', async () => {
      try { const t = await copy('md'); setStatus(`Copied ${Math.max(1, Math.round(t.length / 1024))}K markdown`); }
      catch (e) { setStatus(e.message, true); }
    });
    foot.appendChild(primary);
    const quiet = (label, title, fn, css = '') => {
      const b = el('button', 'border:0;background:none;color:#52525b;border-radius:6px;'
        + 'padding:5px 8px;font:600 12px ui-sans-serif,system-ui;cursor:pointer;' + css, label);
      b.title = title;
      b.addEventListener('click', fn);
      foot.appendChild(b);
      return b;
    };
    quiet('JSON', 'Copy the set as JSON (annotate/1)', async () => {
      try { await copy('json'); setStatus('Copied JSON'); }
      catch (e) { setStatus(e.message, true); }
    });
    quiet('Jot', 'Save the set as one jot in the estate registry', async () => {
      try { setStatus('Saving jot…'); await saveJot(); setStatus('Jot saved'); }
      catch (e) { setStatus('Jot: ' + (e.message || e), true); }
    });
    quiet('Clear', 'Remove all notes', () => { clear(); setStatus('Cleared'); },
      'margin-left:auto;color:#b91c1c;');
    p.appendChild(foot);

    S.status = el('div', 'color:#71717a;font-size:11px;min-height:15px;padding:0 14px 8px;background:#fafafa;');
    p.appendChild(S.status);

    root.appendChild(p);
    root.appendChild(pill);
    d.body.appendChild(root);
    S.ui = root;
    renderList();
  };

  const renderList = () => {
    if (!S.badge) return;
    S.badge.textContent = String(S.items.length);
    if (S.countEl) S.countEl.textContent = S.items.length
      ? S.items.length + ' note' + (S.items.length === 1 ? '' : 's') : '';
    if (S.hint) S.hint.style.display = S.items.length ? 'none' : 'block';
    S.listEl.textContent = '';
    S.items.forEach((it, i) => {
      const row = el('div', 'display:flex;gap:8px;align-items:flex-start;background:#fff;'
        + 'border:1px solid #ececee;border-radius:10px;padding:7px 10px;cursor:pointer;');
      const body = el('div', 'flex:1;min-width:0;');
      const t = it.target;
      body.appendChild(el('div', 'color:#a16207;font-size:11px;font-style:italic;margin-bottom:2px;',
        (i + 1) + '. ' + (t.type === 'text' ? '“' + clip(t.quote.exact, 70) + '”'
          : t.type === 'element' ? '⌖ ' + clip(t.excerpt || t.selector, 70)
          : '▭ ' + clip(t.excerpt, 70))));
      body.appendChild(el('div', 'font-size:12.5px;color:#3f3f46;white-space:pre-wrap;', it.note || '(no note)'));
      const del = el('button', 'border:0;background:none;color:#a1a1aa;font-size:15px;'
        + 'line-height:1;cursor:pointer;padding:0 2px;', '×');
      del.title = 'Remove this note';
      del.addEventListener('click', (e) => { e.stopPropagation(); remove(it.id); });
      row.appendChild(body);
      row.appendChild(del);
      row.addEventListener('click', () => reveal(it));
      S.listEl.appendChild(row);
    });
  };

  // Tapping a row scrolls its subject into view and flashes it active.
  const reveal = (it) => {
    const t = it.target;
    let el = null;
    if (t.type === 'text') {
      const r = resolveQuote(S.doc.body, t.quote);
      if (r) el = blockOf(r.startContainer);
    } else if (t.type === 'element') {
      el = findElement(t.selector);
    } else if (t.type === 'region') {
      win().scrollTo({ top: Math.max(0, t.rect.y - 80), behavior: 'smooth' });
    }
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    paint(it.id);
    setTimeout(() => paint(), 1600);
  };

  // ── The note bubble (shared by all three modes) ───────────────────────────
  // Deliberately minimal after the first phone test: no quoted-text preview
  // (the selection is highlighted on the page right behind it), one ✓ to
  // save, and cancel is a tap anywhere else. It opens where the "+ note"
  // button sat, so it reads as the button expanding into an input.
  const closeBubble = () => {
    if (S._bubbleAway) { S._bubbleAway(); S._bubbleAway = null; }
    if (S.bubble) { S.bubble.remove(); S.bubble = null; }
  };

  // Centered on the viewport width (phone feedback: a side-hugging bubble
  // hides the very text being annotated), just under the selection, and
  // draggable by its grip when it still covers something worth seeing.
  const openBubble = (vy, onSave) => {
    closeBubble();
    const d = S.doc;
    const w = win();
    const vw = w.innerWidth || 800;
    const width = Math.min(480, vw - 24);
    const x = Math.round((vw - width) / 2);
    const y = Math.min(Math.max(8, vy), (w.innerHeight || 600) - 96);
    const b = d.createElement('div');
    S.bubble = b;
    b.setAttribute(UI_ATTR, '');
    b.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:${Z + 2};width:${width}px;`
      + 'background:#fff;border:1px solid #d4d4d8;border-radius:12px;padding:8px;'
      + 'box-shadow:0 10px 32px rgba(0,0,0,.18);display:flex;gap:8px;align-items:flex-end;';
    // Drag grip: pointer capture so a touch drag moves the bubble instead of
    // scrolling the page.
    const grip = d.createElement('div');
    grip.setAttribute(UI_ATTR, '');
    grip.title = 'Drag to move';
    grip.textContent = '⠿';
    grip.style.cssText = 'align-self:stretch;display:flex;align-items:center;color:#a1a1aa;'
      + 'cursor:grab;touch-action:none;padding:0 2px;font-size:14px;user-select:none;';
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const r = b.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const move = (ev) => {
        b.style.left = Math.max(4, Math.min(ev.clientX - dx, vw - 60)) + 'px';
        b.style.top = Math.max(4, Math.min(ev.clientY - dy, (w.innerHeight || 600) - 40)) + 'px';
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    const ta = d.createElement('textarea');
    ta.setAttribute(UI_ATTR, '');
    ta.placeholder = 'Note…';
    ta.rows = 1;
    // 16px is the iOS threshold: any focused input smaller than that zooms
    // the whole page, the wrong move for a tool that lives ON the page.
    ta.style.cssText = 'flex:1;min-width:0;background:#fafafa;color:#18181b;border:1px solid #d4d4d8;'
      + 'border-radius:8px;padding:7px 9px;font:16px/1.35 ui-sans-serif,system-ui;resize:none;overflow-y:auto;';
    // Grow with the text, capped at roughly a third of the screen so the
    // page behind stays the visible context.
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, Math.round((w.innerHeight || 600) * 0.33)) + 'px';
    });
    const ok = d.createElement('button');
    ok.setAttribute(UI_ATTR, '');
    ok.title = 'Save note (Enter)';
    ok.textContent = '✓';
    ok.style.cssText = BTN + 'background:#facc15;border-color:#eab308;color:#18181b;'
      + 'padding:7px 13px;font-size:15px;border-radius:8px;';
    const commit = () => { const v = ta.value; closeBubble(); onSave(v); };
    ok.addEventListener('click', commit);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === 'Escape') closeBubble();
    });
    b.appendChild(grip);
    b.appendChild(ta);
    b.appendChild(ok);
    d.body.appendChild(b);
    // Registered on the next tick so the tap that opened the bubble does not
    // immediately close it.
    const away = (e) => { if (!b.contains(e.target)) closeBubble(); };
    setTimeout(() => { if (S.bubble === b) d.addEventListener('pointerdown', away, true); }, 0);
    S._bubbleAway = () => d.removeEventListener('pointerdown', away, true);
    ta.focus();
  };

  // ── Mode: text selection (always armed while enabled) ─────────────────────
  let selBtn = null;
  const hideSelBtn = () => { if (selBtn) { selBtn.remove(); selBtn = null; } };

  const onSelectionEnd = () => {
    setTimeout(() => {
      if (S.mode) return;                       // pick/region modes own the pointer
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
        openBubble(rect.bottom + 10, (note) => {
          add({ type: 'text', quote: q, display, selector: block ? cssPath(block, d.body) : '', label: block ? headingTrail(block) : '' }, note);
          const s = win().getSelection();
          if (s) s.removeAllRanges();
          setStatus('Note added');
        });
      });
      d.body.appendChild(selBtn);
    }, 10);
  };

  // ── Mode: element pick ────────────────────────────────────────────────────
  const endMode = () => {
    if (S.cleanupMode) S.cleanupMode();
    S.cleanupMode = null;
    S.mode = null;
  };

  // The "+ note" confirm chip the staged modes share with the text flow: the
  // gesture SELECTS, the chip is the moment the note begins. Nothing opens an
  // input uninvited.
  const NOTE_BTN = `position:fixed;z-index:${Z + 1};` + BTN
    + 'background:#facc15;border-color:#eab308;color:#18181b;box-shadow:0 3px 10px rgba(0,0,0,.25);';

  const startPick = () => {
    endMode();
    S.mode = 'pick';
    setStatus('Pick: tap to select an element, then “+ note” (Esc cancels)');
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
        const excerpt = clip(el2.innerText || el2.textContent, 400);
        endMode();
        openBubble(Math.min(rr.bottom + 6, (win().innerHeight || 600) - 130), (note) => {
          add({ type: 'element', selector: cssPath(el2, d.body), label: headingTrail(el2), excerpt }, note);
          setStatus('Element note added');
        });
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
    setStatus('Region: drag a rectangle, then “+ note” (Esc cancels; drag again to redo)');
    const d = S.doc;
    const cover = d.createElement('div');
    cover.setAttribute(UI_ATTR, '');
    cover.style.cssText = `position:fixed;inset:0;z-index:${Z + 1};cursor:crosshair;background:rgba(24,24,27,.06);`;
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
      btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
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
        endMode();
        openBubble(Math.min(vy + vh + 6, (w.innerHeight || 600) - 130), (note) => {
          add({ type: 'region', rect, excerpt, label: first ? headingTrail(first) : '' }, note);
          setStatus('Region note added');
        });
      });
      cover.appendChild(btn);
    };
    const key = (e) => { if (e.key === 'Escape') { endMode(); setStatus('Region cancelled'); } };
    cover.addEventListener('mousedown', down);
    cover.addEventListener('mousemove', move);
    cover.addEventListener('mouseup', up);
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
    mountUI();
    on(doc, 'pointerup', onSelectionEnd);
    on(doc, 'keyup', onSelectionEnd);
    const w = win();
    if (w) on(w, 'resize', () => paintBoxes());
    paint();
    S.panel.style.display = 'flex';
    return window.Annotate;
  };

  const disable = () => {
    endMode();
    closeBubble();
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
    S.ui = S.panel = S.bubble = S.badge = S.status = S.listEl = null;
    S.doc = null;
  };

  window.Annotate = {
    enable, disable, add, remove, clear, copy, saveJot, toMarkdown, toJSON,
    startPick, startRegion,
    get items() { return S.items.slice(); },
    get enabled() { return !!S.ui; },
    subject: null,
    // pure helpers, exposed for tools/test/annotate.test.mjs
    _textIndex: textIndex, _quoteFor: quoteFor, _resolveQuote: resolveQuote,
    _displayFor: displayFor, _quoteLines: quoteLines,
    _cssPath: cssPath, _headingTrail: headingTrail, _clip: clip,
    _state: S,
  };
})();
