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
    const s = pointOffset(idx, range.startContainer, range.startOffset);
    const e = pointOffset(idx, range.endContainer, range.endOffset);
    if (s == null || e == null || e <= s) return null;
    return {
      exact: idx.text.slice(s, e),
      prefix: idx.text.slice(Math.max(0, s - CTX), s),
      suffix: idx.text.slice(e, e + CTX),
    };
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
    const BLOCK = /^(P|LI|TD|TH|PRE|BLOCKQUOTE|H[1-6]|DD|DT|FIGCAPTION|DIV|SECTION|ARTICLE)$/;
    for (let e = node.nodeType === 1 ? node : node.parentElement; e; e = e.parentElement) {
      if (BLOCK.test(e.tagName)) return e;
    }
    return node.nodeType === 1 ? node : node.parentElement;
  };

  const clip = (s, n = 90) => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
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
      const body = t.type === 'text' ? t.quote.exact : (t.excerpt || '');
      if (body) {
        for (const line of body.split('\n')) L.push('> ' + line);
        L.push('');
      }
      L.push(it.note || '(no note)', '');
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
  const Z = 2147482600;
  const BTN = 'border:0;border-radius:6px;padding:3px 8px;font:600 11px/1.6 ui-sans-serif,system-ui;'
    + 'background:#3f3f46;color:#fafafa;cursor:pointer;';

  const setStatus = (msg, isErr) => {
    if (!S.status) return;
    S.status.textContent = msg || '';
    S.status.style.color = isErr ? '#fca5a5' : '#a1a1aa';
  };

  const mountUI = () => {
    const d = S.doc;
    const root = d.createElement('div');
    root.setAttribute(UI_ATTR, '');
    root.style.cssText = `position:fixed;left:12px;bottom:12px;z-index:${Z};font:13px/1.45 ui-sans-serif,system-ui;`;

    // Launcher pill: count badge, toggles the panel. Bottom-LEFT because the
    // FAB owns bottom-right.
    const pill = d.createElement('button');
    pill.setAttribute(UI_ATTR, '');
    pill.title = 'Annotations: select text on the page to add one';
    pill.style.cssText = 'display:flex;align-items:center;gap:6px;background:#18181b;color:#fafafa;'
      + 'border:1px solid #3f3f46;border-radius:999px;padding:7px 13px;cursor:pointer;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.35);font:600 12px ui-sans-serif,system-ui;';
    pill.innerHTML = '✎ notes';
    S.badge = d.createElement('span');
    S.badge.setAttribute(UI_ATTR, '');
    S.badge.style.cssText = 'background:#facc15;color:#18181b;border-radius:999px;padding:0 7px;font-weight:700;';
    S.badge.textContent = '0';
    pill.appendChild(S.badge);
    pill.addEventListener('click', () => {
      S.panel.style.display = S.panel.style.display === 'none' ? 'flex' : 'none';
    });

    // Panel
    const p = d.createElement('div');
    S.panel = p;
    p.setAttribute(UI_ATTR, '');
    p.style.cssText = 'display:none;flex-direction:column;gap:8px;position:absolute;left:0;bottom:40px;'
      + 'width:min(340px,86vw);max-height:min(480px,70vh);background:#18181b;color:#e4e4e7;'
      + 'border:1px solid #3f3f46;border-radius:12px;padding:10px;box-shadow:0 10px 30px rgba(0,0,0,.45);';

    const bar = d.createElement('div');
    bar.setAttribute(UI_ATTR, '');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;align-items:center;';
    const mkBtn = (label, title, fn) => {
      const b = d.createElement('button');
      b.setAttribute(UI_ATTR, '');
      b.style.cssText = BTN;
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };
    mkBtn('⌖ element', 'Pick one element to annotate (Esc cancels)', () => startPick());
    mkBtn('▭ region', 'Drag a rectangle to annotate an area (Esc cancels)', () => startRegion());
    mkBtn('copy md', 'Copy every note as markdown, ready to paste to a model', async () => {
      try { const t = await copy('md'); setStatus(`Copied ${Math.max(1, Math.round(t.length / 1024))}K markdown`); }
      catch (e) { setStatus(e.message, true); }
    });
    mkBtn('json', 'Copy the set as JSON (annotate/1)', async () => {
      try { await copy('json'); setStatus('Copied JSON'); }
      catch (e) { setStatus(e.message, true); }
    });
    mkBtn('jot', 'Save the set as one jot in the estate registry', async () => {
      try { setStatus('Saving jot…'); await saveJot(); setStatus('Jot saved'); }
      catch (e) { setStatus('Jot: ' + (e.message || e), true); }
    });
    mkBtn('clear', 'Remove all notes', () => { clear(); setStatus('Cleared'); });
    p.appendChild(bar);

    const hint = d.createElement('div');
    hint.setAttribute(UI_ATTR, '');
    hint.style.cssText = 'color:#a1a1aa;font-size:11px;';
    hint.textContent = 'Select text anywhere on the page, then tap “+ note”.';
    p.appendChild(hint);

    S.listEl = d.createElement('div');
    S.listEl.setAttribute(UI_ATTR, '');
    S.listEl.style.cssText = 'overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:0;';
    p.appendChild(S.listEl);

    S.status = d.createElement('div');
    S.status.setAttribute(UI_ATTR, '');
    S.status.style.cssText = 'color:#a1a1aa;font-size:11px;min-height:14px;';
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
    const d = S.doc;
    S.listEl.textContent = '';
    S.items.forEach((it, i) => {
      const row = d.createElement('div');
      row.setAttribute(UI_ATTR, '');
      row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;background:#27272a;'
        + 'border-radius:8px;padding:6px 8px;cursor:pointer;';
      const body = d.createElement('div');
      body.setAttribute(UI_ATTR, '');
      body.style.cssText = 'flex:1;min-width:0;';
      const t = it.target;
      const quote = d.createElement('div');
      quote.setAttribute(UI_ATTR, '');
      quote.style.cssText = 'color:#facc15;font-size:11px;font-style:italic;';
      quote.textContent = (i + 1) + '. ' + (t.type === 'text' ? '“' + clip(t.quote.exact, 70) + '”'
        : t.type === 'element' ? '⌖ ' + clip(t.excerpt || t.selector, 70)
        : '▭ ' + clip(t.excerpt, 70));
      const note = d.createElement('div');
      note.setAttribute(UI_ATTR, '');
      note.style.cssText = 'font-size:12px;white-space:pre-wrap;';
      note.textContent = it.note || '(no note)';
      body.appendChild(quote);
      body.appendChild(note);
      const del = d.createElement('button');
      del.setAttribute(UI_ATTR, '');
      del.style.cssText = BTN + 'padding:1px 7px;background:#3f3f46;';
      del.textContent = '×';
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
  const closeBubble = () => { if (S.bubble) { S.bubble.remove(); S.bubble = null; } };

  const openBubble = (vx, vy, seed, onSave) => {
    closeBubble();
    const d = S.doc;
    const b = d.createElement('div');
    S.bubble = b;
    b.setAttribute(UI_ATTR, '');
    const x = Math.min(Math.max(8, vx), (win().innerWidth || 800) - 268);
    const y = Math.min(Math.max(8, vy), (win().innerHeight || 600) - 120);
    b.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:${Z + 2};width:260px;`
      + 'background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:10px;'
      + 'padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.5);font:12px ui-sans-serif,system-ui;';
    const cap = d.createElement('div');
    cap.setAttribute(UI_ATTR, '');
    cap.style.cssText = 'color:#facc15;font-style:italic;font-size:11px;margin-bottom:6px;';
    cap.textContent = clip(seed, 90);
    const ta = d.createElement('textarea');
    ta.setAttribute(UI_ATTR, '');
    ta.placeholder = 'Note…';
    ta.rows = 2;
    ta.style.cssText = 'width:100%;box-sizing:border-box;background:#27272a;color:#fafafa;'
      + 'border:1px solid #3f3f46;border-radius:6px;padding:5px 7px;font:12px ui-sans-serif,system-ui;resize:vertical;';
    const row = d.createElement('div');
    row.setAttribute(UI_ATTR, '');
    row.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;margin-top:6px;';
    const save = d.createElement('button');
    save.setAttribute(UI_ATTR, '');
    save.style.cssText = BTN + 'background:#facc15;color:#18181b;';
    save.textContent = 'Save note';
    const cancel = d.createElement('button');
    cancel.setAttribute(UI_ATTR, '');
    cancel.style.cssText = BTN;
    cancel.textContent = 'Cancel';
    save.addEventListener('click', () => { onSave(ta.value); closeBubble(); });
    cancel.addEventListener('click', closeBubble);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { onSave(ta.value); closeBubble(); }
      if (e.key === 'Escape') closeBubble();
    });
    row.appendChild(cancel);
    row.appendChild(save);
    b.appendChild(cap);
    b.appendChild(ta);
    b.appendChild(row);
    d.body.appendChild(b);
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
      selBtn = d.createElement('button');
      selBtn.setAttribute(UI_ATTR, '');
      selBtn.textContent = '+ note';
      selBtn.style.cssText = `position:fixed;left:${Math.min(rect.right + 4, (win().innerWidth || 800) - 70)}px;`
        + `top:${Math.max(6, rect.top - 30)}px;z-index:${Z + 1};` + BTN
        + 'background:#facc15;color:#18181b;box-shadow:0 3px 10px rgba(0,0,0,.4);';
      selBtn.addEventListener('pointerdown', (e) => e.preventDefault());   // keep the selection
      selBtn.addEventListener('click', () => {
        const q = quoteFor(d.body, range);
        hideSelBtn();
        if (!q) return;
        const block = blockOf(range.startContainer);
        openBubble(rect.left, rect.bottom + 8, q.exact, (note) => {
          add({ type: 'text', quote: q, selector: block ? cssPath(block, d.body) : '', label: block ? headingTrail(block) : '' }, note);
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

  const startPick = () => {
    endMode();
    S.mode = 'pick';
    setStatus('Pick: tap an element (Esc cancels)');
    const d = S.doc;
    const box = d.createElement('div');
    box.setAttribute(UI_ATTR, '');
    box.style.cssText = `position:fixed;pointer-events:none;z-index:${Z + 1};border:2px solid #facc15;`
      + 'background:rgba(250,204,21,.12);border-radius:4px;display:none;';
    d.body.appendChild(box);
    let cur = null;
    const move = (e) => {
      const el = d.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest(`[${UI_ATTR}]`)) { box.style.display = 'none'; cur = null; return; }
      cur = el;
      const r = el.getBoundingClientRect();
      box.style.display = 'block';
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const click = (e) => {
      if (!cur) return;
      e.preventDefault();
      e.stopPropagation();
      const el = cur;
      const r = el.getBoundingClientRect();
      const excerpt = clip(el.innerText || el.textContent, 400);
      endMode();
      openBubble(r.left, Math.min(r.bottom + 6, (win().innerHeight || 600) - 130), excerpt, (note) => {
        add({ type: 'element', selector: cssPath(el, d.body), label: headingTrail(el), excerpt }, note);
        setStatus('Element note added');
      });
    };
    const key = (e) => { if (e.key === 'Escape') { endMode(); setStatus('Pick cancelled'); } };
    d.addEventListener('mousemove', move, true);
    d.addEventListener('click', click, true);
    d.addEventListener('keydown', key, true);
    S.cleanupMode = () => {
      d.removeEventListener('mousemove', move, true);
      d.removeEventListener('click', click, true);
      d.removeEventListener('keydown', key, true);
      box.remove();
    };
  };

  // ── Mode: region rectangle ────────────────────────────────────────────────
  const startRegion = () => {
    endMode();
    S.mode = 'region';
    setStatus('Region: drag a rectangle (Esc cancels)');
    const d = S.doc;
    const cover = d.createElement('div');
    cover.setAttribute(UI_ATTR, '');
    cover.style.cssText = `position:fixed;inset:0;z-index:${Z + 1};cursor:crosshair;background:rgba(24,24,27,.08);`;
    const box = d.createElement('div');
    box.setAttribute(UI_ATTR, '');
    box.style.cssText = 'position:fixed;border:2px dashed #facc15;background:rgba(250,204,21,.15);display:none;border-radius:4px;';
    cover.appendChild(box);
    d.body.appendChild(cover);
    let sx = 0, sy = 0, dragging = false;
    const down = (e) => { dragging = true; sx = e.clientX; sy = e.clientY; box.style.display = 'block'; upd(e); };
    const upd = (e) => {
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      const w2 = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w2 + 'px', height: h + 'px' });
    };
    const move = (e) => { if (dragging) upd(e); };
    const up = (e) => {
      if (!dragging) return;
      dragging = false;
      const vx = Math.min(sx, e.clientX), vy = Math.min(sy, e.clientY);
      const vw = Math.abs(e.clientX - sx), vh = Math.abs(e.clientY - sy);
      endMode();
      if (vw < 8 || vh < 8) { setStatus('Region cancelled'); return; }
      const w = win();
      const rect = { x: Math.round(vx + w.scrollX), y: Math.round(vy + w.scrollY), w: Math.round(vw), h: Math.round(vh) };
      // The text the rectangle covers: block-level elements whose boxes
      // intersect it, in document order, clipped.
      const parts = [];
      for (const el of d.body.querySelectorAll('p,li,pre,blockquote,h1,h2,h3,h4,h5,h6,td,th,dt,dd,figcaption')) {
        if (el.closest(`[${UI_ATTR}]`)) continue;
        const r = el.getBoundingClientRect();
        if (r.left < vx + vw && r.right > vx && r.top < vy + vh && r.bottom > vy) {
          parts.push((el.innerText || el.textContent || '').trim());
        }
        if (parts.join(' ').length > 700) break;
      }
      const excerpt = clip(parts.join(' '), 600);
      const first = d.elementFromPoint(Math.max(0, vx + 4), Math.max(0, vy + 4));
      openBubble(vx, Math.min(vy + vh + 6, (w.innerHeight || 600) - 130), excerpt || 'region', (note) => {
        add({ type: 'region', rect, excerpt, label: first ? headingTrail(first) : '' }, note);
        setStatus('Region note added');
      });
    };
    const key = (e) => { if (e.key === 'Escape') { endMode(); setStatus('Region cancelled'); } };
    cover.addEventListener('mousedown', down);
    cover.addEventListener('mousemove', move);
    cover.addEventListener('mouseup', up);
    d.addEventListener('keydown', key, true);
    S.cleanupMode = () => { cover.remove(); d.removeEventListener('keydown', key, true); };
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  const enable = (opts = {}) => {
    const doc = opts.doc || window.document;
    if (S.doc === doc && S.ui) { S.panel.style.display = 'flex'; return window.Annotate; }
    disable();
    S.doc = doc;
    window.Annotate.subject = opts.subject || null;   // {title, url} override for serialization
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
    _cssPath: cssPath, _headingTrail: headingTrail, _clip: clip,
    _state: S,
  };
})();
