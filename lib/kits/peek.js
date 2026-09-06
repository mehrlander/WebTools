// kits/peek.js — what is under the pointer, and what contains it.
//
// Point at something and the page answers with the element. Point again in the
// same spot and it answers with that element's parent, then its parent, up to
// the body and around. That second gesture is the whole kit: the thing a
// reader wants is almost never the node their finger landed on. A tap lands on
// a <span> inside a <td> inside a <tr>; the thing they mean is one of the
// three, and which one is a question only they can answer, so the tool's job
// is to make asking it cost one tap rather than a trip to DevTools.
//
// THE CHAIN IS THE UNIT, not the element. enable() arms the page; a tap builds
// the ancestor chain from the hit node up to <body> and parks at index 0.
// Everything after that moves an index: the ▲▼ keys, the breadcrumb, and the
// repeat tap. Nothing re-queries the DOM, so stepping is exact and reversible,
// and the outline growing is the only feedback the gesture needs.
//
// WHY A SECOND TAP AND NOT A MODIFIER. A phone has no Alt and no hover, and
// this kit is aimed at one. So the step is a proximity test: a tap within
// STEP_SLOP of the last one steps up, anything further starts a new chain. It
// wraps at <body> because the reader who overshoots by one has no other way
// back on a touch screen, and a chain is short enough that a full lap is
// cheaper than a second control they have to find.
//
// THE POINTER PATH IS NOT NEGOTIABLE. A full-screen cover taking pointerdown,
// with elementsFromPoint to see past it. console/mods/pick.js does the same
// job off `mousemove` + `click`, and that pair does not work on iOS: there is
// no mousemove before a tap, and iOS withholds click from a document-level
// listener when the tapped element is not itself clickable. kits/annotate.js
// carries the field report (2026-08-14, "I tap and I don't get the outline")
// and the fix; this is the fix, extracted.
//
// FOUR READINGS OF ONE NODE, because "what is this" has four different
// answers depending on why you are asking:
//
//   facts     identity, the inferred selector AND how many nodes it matches,
//             the box, layout, the tree position. The selector's match count
//             is the field that earns the panel: a selector nobody counted is
//             a guess, and the count is what says whether it addresses this
//             node or forty.
//   tree      the subtree as an indented outline, depth- and node-capped.
//             The readable serialization: structure plus own text, with the
//             attribute noise dropped.
//   html      outerHTML, the exact one. Truncated on screen, whole on copy.
//   json      the facts as a record, for a model or a note.
//   render    the subtree wrapped as a page that renders on its own, proved
//             in a frame before it is copied. See THE FRAGMENT below.
//
// THE FRAGMENT (wrap). A subtree's outerHTML does not render alone: its
// classes are compiled by the page's Tailwind build, its components are
// daisyUI's, its theme is an attribute on <html> three levels up, and its
// Alpine attributes bind to state that is not coming along. wrap() assembles
// the page a reviewer can open: the vendor tags the page's own head carries
// (absolute stylesheet and script URLs, this repo's own code excluded), the
// head's small <style> blocks, the theme, the body's classes, and the subtree
// with every framework attribute stripped. What comes out is the RENDERED
// state, a snapshot, and the render reading shows it in a srcdoc frame so
// what is seen is what is copied, by construction. A pick that renders wrong
// in the frame is information: an ancestor gave it something (a grid cell, a
// height chain, a group-hover), and stepping up one rung is the fix.
//
// Self-contained on purpose, and it does duplicate console/base.js's `sig`
// and `rect` in about twenty lines. base.js is a DevTools paste that installs
// a dozen globals; this is a gh.load kit that installs one. Sharing would mean
// one of them adopting the other's distribution, which is a bigger change than
// the duplication is a cost. Named here so the next reader does not rediscover
// it as a defect.
//
//   Peek.enable({doc, onSelect})   arm; doc defaults to this one
//   Peek.disable()
//   Peek.select(el) / .up() / .down() / .to(i)
//   Peek.current() / .chain()
//   Peek.facts(el) / .tree(el, o) / .html(el) / .json() / .wrap(el)
//   await Peek.copy('facts'|'tree'|'html'|'json'|'render'|'selector')
//   Peek.enable({ view: 'render' }) opens on that reading.

(() => {
  if (window.Peek) return; // idempotent — gh.load re-executes files

  const UI = 'data-peek-ui';
  const Z = 2147483000;
  const STEP_SLOP = 14;      // px; a repeat tap inside this steps up the chain
  const TREE_DEPTH = 3;
  const TREE_NODES = 120;
  const HTML_CHARS = 4000;

  const S = {
    doc: null, cover: null, panel: null, hoverBox: null, selBox: null,
    chain: [], at: 0, lastPt: null, view: 'facts', dock: 'bottom',
    onSelect: null, cleanup: [],
  };

  const clip = (s, n) => (s = String(s ?? '').replace(/\s+/g, ' ').trim(),
                          s.length > n ? s.slice(0, n - 1) + '…' : s);
  const win = () => S.doc?.defaultView || window;
  // A CSS identifier escape, which is NOT window.esc: that one makes text
  // inert inside markup, this one makes a class or id safe inside a selector.
  // Text on its way into this kit's panel goes through window.esc.
  const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&'));

  // ── Facts about one node ──────────────────────────────────────────────────

  // The atom is what a node looks like on its own: tag, id, and up to four
  // classes. Four because a Tailwind element routinely carries thirty and the
  // rest are presentational; the ones that identify it are almost always first.
  const atom = (el) => {
    if (!el || !el.tagName) return '';
    const t = el.tagName.toLowerCase();
    if (el.id) return t + '#' + cssEsc(el.id);
    const cls = [...el.classList].slice(0, 4).map(c => '.' + cssEsc(c)).join('');
    return t + cls;
  };

  // Tag plus the one thing most likely to identify it, for a strip that has to
  // hold a dozen of these on one line.
  const shortAtom = (el) => {
    const t = el.tagName.toLowerCase();
    if (el.id) return t + '#' + el.id;
    const c = [...el.classList][0];
    return c ? t + '.' + (c.length > 14 ? c.slice(0, 13) + '\u2026' : c) : t;
  };

  // Every computation below reads the element's OWN document rather than the
  // enabled one, so facts(), tree() and html() are a LIBRARY: annotate calls
  // them for a note's target with no enable(), no cover and no panel of ours.
  // Reading S.doc here would have made the whole kit conditional on its UI.
  const docOf = (el) => el.ownerDocument;
  const winOf = (el) => el.ownerDocument.defaultView || window;
  const count = (doc, sel) => { try { return doc.querySelectorAll(sel).length; } catch { return 0; } };

  // One segment of a selector: what identifies this node AMONG ITS SIBLINGS.
  // The position is added only where the atom is ambiguous there, so a selector
  // stays readable wherever a class already does the work.
  //
  // This is what makes the climb below terminate. Prefixing ancestors separates
  // cousins and never separates siblings: two <li> with the same classes have
  // the same ancestor path by definition. Measured 2026-08-29 on the demo
  // page's nested list, the old climb ran all the way to <body> still matching
  // two, then fell back to a bare `li:nth-of-type(1)` matching three, which is
  // worse than the rung it gave up on.
  const segment = (el) => {
    if (el.id) return '#' + cssEsc(el.id);
    const a = atom(el);
    const sibs = [...(el.parentElement?.children || [])];
    let same = 0;
    for (const s of sibs) { try { if (s.matches(a)) same++; } catch { same = 2; break; } }
    return same > 1 ? a + `:nth-child(${sibs.indexOf(el) + 1})` : a;
  };

  // Shortest selector that reaches this node, climbing until it is unique. With
  // sibling-pinned segments a full path is unique by construction, so this
  // terminates; the count rides along anyway, because a page with duplicate ids
  // can still make a liar of it, and a selector nobody counted is a guess.
  const selectorFor = (el) => {
    const doc = docOf(el);
    if (el.id) { const s = '#' + cssEsc(el.id); return { sel: s, n: count(doc, s) }; }
    let sel = segment(el);
    if (count(doc, sel) === 1) return { sel, n: 1 };
    for (let p = el.parentElement; p && p !== doc.documentElement; p = p.parentElement) {
      sel = segment(p) + ' > ' + sel;
      if (count(doc, sel) === 1) return { sel, n: 1 };
      if (p.id) break;   // an id prefix is as anchored as a selector gets
    }
    return { sel, n: count(doc, sel) };
  };

  const tagPath = (el) => {
    const parts = [];
    for (let n = el; n && n.tagName; n = n.parentElement) parts.unshift(n.tagName.toLowerCase());
    return parts.join('/');
  };

  // Direct text nodes only. An element's own words are what distinguishes it
  // from its container; textContent just repeats the subtree.
  const ownText = (el) => clip([...el.childNodes]
    .filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' '), 200);

  // Everything except id and class, which the atom already carries. Long
  // values are clipped here rather than at render, so the record and the panel
  // agree about what the attribute says.
  const attrs = (el) => [...el.attributes]
    .filter(a => a.name !== 'id' && a.name !== 'class' && a.name !== UI)
    .map(a => ({ name: a.name, value: clip(a.value, 120) }));

  // Only the properties that change how a box behaves. A full computed style is
  // 340 entries and answers nothing; the trick is which handful, and that
  // depends on what KIND of box it is.
  //
  // A flex or grid CHILD is the case a bare `display` reads worst on: the
  // values deciding where it sits are its own flex/self properties and its
  // parent's display, and reporting `display: block` for something a grid is
  // placing says nothing at all. So the parent's layout mode pulls in the
  // child's side of that contract, and a container reports its own axis.
  // Defaults are dropped throughout: a row of `normal` and `auto` is noise.
  const layout = (el) => {
    const w = winOf(el);
    const cs = w.getComputedStyle(el);
    const out = { display: cs.display };
    if (cs.position !== 'static') out.position = cs.position;
    if (cs.overflow !== 'visible') out.overflow = cs.overflow;
    if (cs.zIndex !== 'auto') out.zIndex = cs.zIndex;

    const keep = (k, v, ...dull) => { if (v && !dull.includes(v)) out[k] = v; };

    // As a CONTAINER.
    if (/flex/.test(cs.display)) {
      keep('flow', cs.flexDirection + (cs.flexWrap !== 'nowrap' ? ' ' + cs.flexWrap : ''), 'row');
      keep('justify', cs.justifyContent, 'normal', 'flex-start');
      keep('align', cs.alignItems, 'normal', 'stretch');
      keep('gap', cs.gap, 'normal', '0px');
    } else if (/grid/.test(cs.display)) {
      const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length;
      if (cols) out.cols = cols + ' column' + (cols === 1 ? '' : 's');
      keep('gap', cs.gap, 'normal', '0px');
    }

    // As a CHILD of one.
    const par = el.parentElement && w.getComputedStyle(el.parentElement);
    if (par && /flex|grid/.test(par.display)) {
      out.parent = par.display;
      if (/flex/.test(par.display)) {
        keep('flex', cs.flex, '0 1 auto');
      } else {
        keep('area', cs.gridArea, 'auto / auto / auto / auto', 'auto');
      }
      keep('self', cs.alignSelf, 'auto');
    }
    return out;
  };

  const facts = (el) => {
    const r = el.getBoundingClientRect();
    const w = winOf(el);
    const { sel, n } = selectorFor(el);
    const sibs = [...(el.parentElement?.children || [])];
    let depth = 0; for (let p = el.parentElement; p; p = p.parentElement) depth++;
    return {
      atom: atom(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      classes: [...el.classList],
      selector: sel,
      matches: n,
      path: tagPath(el),
      rect: { x: Math.round(r.left + w.scrollX), y: Math.round(r.top + w.scrollY),
              w: Math.round(r.width), h: Math.round(r.height) },
      layout: layout(el),
      text: ownText(el),
      attrs: attrs(el),
      depth, index: sibs.indexOf(el), siblings: sibs.length, children: el.children.length,
    };
  };

  // ── The two serializations ────────────────────────────────────────────────

  // Structure and own text, indented. The readable one: what raw outerHTML is
  // hiding behind forty class names.
  const tree = (el, o = {}) => {
    const maxD = o.depth ?? TREE_DEPTH, maxN = o.nodes ?? TREE_NODES;
    const lines = [];
    let truncated = false;
    const walk = (n, d) => {
      if (lines.length >= maxN) { truncated = true; return; }
      const t = ownText(n);
      lines.push('  '.repeat(d) + atom(n) + (t ? `  "${clip(t, 48)}"` : ''));
      if (d >= maxD) { if (n.children.length) lines.push('  '.repeat(d + 1) + `… ${n.children.length} more`); return; }
      for (const c of n.children) walk(c, d + 1);
    };
    walk(el, 0);
    if (truncated) lines.push(`… capped at ${maxN} nodes`);
    return lines.join('\n');
  };

  const html = (el) => el.outerHTML || '';

  // ── The standalone fragment ───────────────────────────────────────────────

  // Attributes that bind to a framework the fragment does not carry: Alpine's
  // x-*, its :bind and @event shorthands, and this kit's own furniture mark.
  // x-cloak goes with them, or a page that hides until Alpine starts would
  // stay hidden forever in a frame where it never does.
  const FRAMEWORK_ATTR = /^(x-|:|@)/;
  // A <style> block bigger than this is a compiled sheet (the Tailwind build
  // writes one into <head>), which the vendor script tag recompiles anyway;
  // the small ones are what a kit injected by hand and would otherwise be lost.
  const STYLE_MAX = 8000;

  const stripFramework = (node) => {
    for (const n of [...node.querySelectorAll(`[${UI}]`)]) n.remove();
    const all = [node, ...node.querySelectorAll('*')];
    for (const n of all) {
      for (const a of [...n.attributes]) {
        if (FRAMEWORK_ATTR.test(a.name) || a.name === 'x-cloak') n.removeAttribute(a.name);
      }
    }
    return node;
  };

  // The page a picked subtree renders in on its own. Returns the HTML string;
  // wrapInfo() beside it says what was carried and what was left, for the
  // panel line and for a caller that wants to report before pasting.
  const wrapInfo = (el) => {
    const doc = docOf(el);
    const tags = [], skipped = [];
    for (const n of doc.head.querySelectorAll('link[rel="stylesheet"][href], script[src], style')) {
      if (n.closest && n.closest(`[${UI}]`)) continue;
      if (n.tagName === 'STYLE') {
        const css = n.textContent || '';
        if (css.length > STYLE_MAX) { skipped.push('a ' + Math.round(css.length / 1024) + 'K compiled <style>'); continue; }
        if (css.trim()) tags.push('<style>' + css + '</style>');
        continue;
      }
      const u = n.getAttribute('src') || n.getAttribute('href') || '';
      if (!/^https?:/i.test(u)) { skipped.push(u || '(relative)'); continue; }
      if (/\/mehrlander\//.test(u)) { skipped.push(u); continue; }
      if (n.tagName === 'SCRIPT' && (n.type === 'module' || n.type === 'text/plain')) { skipped.push(u); continue; }
      tags.push(n.tagName === 'LINK'
        ? `<link rel="stylesheet" href="${esc(u)}">`
        : `<script${n.defer ? ' defer' : ''} src="${esc(u)}"></script>`);
    }
    const theme = doc.documentElement.getAttribute('data-theme') || '';
    const body = stripFramework(el.cloneNode(true));
    const sel = selectorFor(el).sel;
    const url = doc.location?.href || '';
    const htmlText = `<!doctype html>
<html lang="${esc(doc.documentElement.getAttribute('lang') || 'en')}"${theme ? ` data-theme="${esc(theme)}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(atom(el))}</title>
<!-- A picked region of ${esc(url)} (${esc(sel)}), as rendered on ${new Date().toISOString().slice(0, 10)}.
     Framework attributes are stripped: this is the rendered state, not the live component. -->
${tags.join('\n')}
</head>
<body class="${esc(doc.body.className || '')}">
${body.outerHTML}
</body>
</html>
`;
    return { html: htmlText, tags: tags.length, skipped, theme, selector: sel,
             nodes: 1 + body.querySelectorAll('*').length, bytes: htmlText.length };
  };
  const wrap = (el) => wrapInfo(el).html;

  // WHAT A RECTANGLE MEANS, in the two readings a drawn box can have. `rect` is
  // in DOCUMENT coordinates, the same shape annotate's region target stores, so
  // a live drag and a filed region note ask the same question.
  //
  //   contain   elements wholly inside, reduced to ROOTS: a covered element
  //             whose parent is not covered. Without the reduction a box over a
  //             list answers with every span inside every item; with it, the
  //             answer is the items. The rule is console/mods/lasso.js's, which
  //             had it first and had it right.
  //   touch     the TEXT BLOCKS the box overlaps, innermost kept where they
  //             nest. Blocks rather than whatever element is deepest: a box
  //             drawn over prose overlaps the links inside it, and answering
  //             \"three <a> elements\" for a box over three paragraphs is true
  //             and answers a question nobody asked (measured 2026-08-29). The
  //             block set is the one kits/annotate.js's region excerpt already
  //             reads, so the excerpt and this reading agree about what a
  //             region covers.
  //
  // BOTH EXIST BECAUSE NEITHER IS ENOUGH. Contain is the precise reading and is
  // usually EMPTY on a phone, where a box drawn with a thumb is narrower than
  // any block in a text column: measured 2026-08-29, a 260x120 drag over a
  // prose page contained nothing at all, which is true and answers nothing.
  // Touch always answers and is coarser. Ask for contain, fall back to touch,
  // and say which one is being shown.
  //
  // Zero-size boxes are skipped (hidden elements, and everything under jsdom's
  // inert layout); {zero:true} keeps them, which the node test needs.
  const BLOCKS = 'p,li,pre,blockquote,h1,h2,h3,h4,h5,h6,td,th,dt,dd,figcaption';

  const covers = (rect, o = {}) => {
    const doc = o.doc || document;
    const w = doc.defaultView || window;
    const mode = o.mode || 'contain';
    const max = o.max || 40;
    const L = rect.x, T = rect.y, R = rect.x + rect.w, B = rect.y + rect.h;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height && !o.zero) return null;
      return { l: r.left + w.scrollX, t: r.top + w.scrollY,
               r: r.right + w.scrollX, b: r.bottom + w.scrollY };
    };
    const inside = (el) => { const b = box(el); return !!b && b.l >= L && b.r <= R && b.t >= T && b.b <= B; };
    const meets = (el) => { const b = box(el); return !!b && b.l < R && b.r > L && b.t < B && b.b > T; };
    const ours = (el) => el.closest && el.closest('[data-peek-ui],[data-annotate-ui]');
    const out = [];

    if (mode === 'contain') {
      const walk = (el) => {
        for (const c of el.children) {
          if (out.length >= max) return;
          if (ours(c)) continue;
          if (inside(c)) out.push(c);   // its parent did not cover: a root
          else walk(c);
        }
      };
      if (doc.body) walk(doc.body);
      return out;
    }

    // touch: the overlapping blocks, in document order, with an ancestor
    // dropped wherever a descendant of it also matched.
    const hits = [...doc.querySelectorAll(BLOCKS)].filter(el => !ours(el) && meets(el));
    for (const el of hits) {
      if (hits.some(other => other !== el && el.contains(other))) continue;
      out.push(el);
      if (out.length >= max) break;
    }
    return out;
  };

  // Kept as the name the first consumer used.
  const roots = (rect, o = {}) => covers(rect, { ...o, mode: o.mode || 'contain' });

  const json = () => {
    const el = current();
    if (!el) return null;
    return { format: 'peek/1', at: new Date().toISOString(), url: docOf(el).location?.href || '',
             ...facts(el), chain: S.chain.map(atom), index: S.at };
  };

  // ── The chain ─────────────────────────────────────────────────────────────

  const current = () => S.chain[S.at] || null;
  const chain = () => S.chain.slice();

  const build = (el) => {
    const c = [];
    const root = docOf(el).documentElement;
    for (let n = el; n && n.tagName && n !== root; n = n.parentElement) c.push(n);
    return c;
  };

  const select = (el) => {
    if (!el) return;
    S.chain = build(el);
    S.at = 0;
    dockAwayFrom(S.lastPt);
    render();
  };

  // The panel covers one band of the viewport, and a repeat tap that lands on
  // it hits the panel instead of the page, which kills the gesture the whole
  // kit is built on. Measured 2026-08-29: the second tap landed on the
  // breadcrumb strip and jumped to <main> instead of stepping up one.
  //
  // So the panel docks to the far edge from the TAP POINT, not from the
  // selection: the point is fixed for the length of a walk, where the selection
  // grows to fill the screen and would flip the dock under the reader. Manual
  // toggling still wins until the next fresh selection. The band is now a
  // constant height, so where it lands is decided once and never moves under a
  // reader mid-walk; before that it also GREW as a selection landed, which is
  // how a tap point that was clear when it was tapped stopped being clear.
  const dockAwayFrom = (pt) => {
    if (!pt) return;
    setDock(pt.y > (win().innerHeight || 800) / 2 ? 'top' : 'bottom');
  };

  const setDock = (side) => {
    S.dock = side;
    if (!S.panel) return;
    Object.assign(S.panel.style, side === 'bottom'
      ? { top: 'auto', bottom: '0', borderTop: `1px solid ${EDGE}`, borderBottom: 'none' }
      : { top: '0', bottom: 'auto', borderBottom: `1px solid ${EDGE}`, borderTop: 'none' });
  };

  // Wraps, because on a touch screen there is no other way back from an
  // overshoot and the chain is short enough that a lap is cheap.
  const to = (i) => {
    if (!S.chain.length) return;
    S.at = (i + S.chain.length) % S.chain.length;
    render();
  };
  const up = () => to(S.at + 1);
  const down = () => to(S.at - 1);

  // ── Painting ──────────────────────────────────────────────────────────────

  // THE OUTLINE BELONGS TO THE PAGE, NOT THE SCREEN. These were fixed and
  // repainted from a scroll listener, which works and lags: the box is redrawn
  // AFTER the scroll it is reacting to, so it swims against the element on a
  // phone. Document coordinates never move relative to what they are drawn
  // around and need no listener at all. kits/annotate.js's outlines were
  // changed the same day for the harder version of this, where nothing
  // repainted them and the highlight simply stayed behind.
  const mkBox = (css) => {
    const b = S.doc.createElement('div');
    b.setAttribute(UI, '');
    b.style.cssText = `position:absolute;pointer-events:none;z-index:${Z - 1};border-radius:3px;display:none;` + css;
    S.doc.body.appendChild(b);
    return b;
  };

  const place = (box, el) => {
    if (!el) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    const w = winOf(el);
    Object.assign(box.style, { display: 'block',
                               left: (r.left + w.scrollX) + 'px', top: (r.top + w.scrollY) + 'px',
                               width: r.width + 'px', height: r.height + 'px' });
  };

  const paint = () => { place(S.selBox, current()); };

  // ── The panel ─────────────────────────────────────────────────────────────

  // One palette, named once. The panel cannot use the page's theme tokens:
  // it mounts into whatever document it is pointed at, and a kit that assumed
  // Tailwind was compiled there would render unstyled on half of them.
  const LINE = '#e4e4e7';        // hairlines inside the panel
  const EDGE = '#d4d4d8';        // the one edge against the page
  const DIM = '#a1a1aa';
  const TEXT = '#3f3f46';

  const BTN = `appearance:none;border:1px solid ${LINE};background:#fff;color:${TEXT};`
    + 'border-radius:6px;padding:3px 8px;font:inherit;font-size:12px;line-height:1.4;cursor:pointer;';
  const ROW = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  // ONE HEIGHT, WHATEVER IS IN IT. It was max-height, so the panel was as tall
  // as its current reading: Facts and Tree and Render each sized it differently
  // and every tab tap resized the band the page was reading through. A tool
  // that changes shape as you use it is read as moving rather than as showing
  // something new, and on a phone it walks the page under your finger. The
  // reading changes; the frame it is read in does not.
  //
  // NO SHADOW EITHER. It said "floating above the page", which is exactly
  // wrong: this panel is docked to an edge, it is not a card. One hairline is
  // the whole separation a docked edge needs, and the outlines on the page are
  // where the reader's eye belongs.
  const PANEL_H = '38vh';

  const buildPanel = () => {
    const d = S.doc;
    const p = d.createElement('div');
    p.setAttribute(UI, '');
    p.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:${Z};`
      + `background:#fff;border-top:1px solid ${EDGE};`
      + 'font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:#18181b;'
      + `height:${PANEL_H};display:flex;flex-direction:column;`;
    d.body.appendChild(p);
    return p;
  };

  const fieldRows = (f) => {
    const rows = [
      ['selector', `<code style="word-break:break-all">${esc(f.selector)}</code>`
        + ` <span style="color:${f.matches === 1 ? '#15803d' : '#b45309'}">`
        + (f.matches === 1 ? 'unique' : `matches ${f.matches}`) + '</span>'],
      ['box', `${f.rect.w} × ${f.rect.h} at ${f.rect.x}, ${f.rect.y}`],
      ['layout', esc(Object.entries(f.layout).map(([k, v]) => `${k}: ${v}`).join('  ·  '))],
      ['tree', `depth ${f.depth} · child ${f.index + 1} of ${f.siblings} · ${f.children} children`],
      ['path', `<code style="word-break:break-all;color:#52525b">${esc(f.path)}</code>`],
    ];
    if (f.text) rows.push(['text', `<span style="color:#3f3f46">${esc(clip(f.text, 160))}</span>`]);
    if (f.attrs.length) rows.push(['attrs', f.attrs.map(a =>
      `<code style="color:#52525b">${esc(a.name)}${a.value ? '=' + esc(clip(a.value, 60)) : ''}</code>`).join('  ')]);
    return `<div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:baseline">`
      + rows.map(([k, v]) =>
          `<div style="color:#a1a1aa;font-size:11px;text-transform:uppercase;letter-spacing:.04em">${k}</div>`
          + `<div style="min-width:0">${v}</div>`).join('')
      + '</div>';
  };

  const pre = (txt) => `<pre style="margin:0;white-space:pre;overflow:auto;font:12px/1.5 ui-monospace,`
    + `SFMono-Regular,Menlo,monospace;color:#27272a;background:#fafafa;border:1px solid ${LINE};`
    + `border-radius:6px;padding:8px">${esc(txt)}</pre>`;

  const render = () => {
    if (!S.panel) return;
    paint();
    const el = current();
    if (!el) {
      // Centred rather than parked at the top edge: with the height fixed, a
      // line of text pinned to the corner of an empty band reads as a panel
      // that failed to fill rather than as one waiting for a tap.
      S.panel.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;`
        + `padding:14px 12px;color:${DIM};text-align:center">`
        + `Tap anything to select it. Tap the same spot again to step up to its parent.</div>`;
      return;
    }
    const f = facts(el);

    // The breadcrumb is the chain, innermost LAST so it reads the way a path
    // does and the current node sits nearest the controls that move it.
    //
    // The label is the SHORT atom, not the full one: a crumb carrying four
    // Tailwind classes wraps onto four lines and the strip becomes the panel.
    // One identifying class is what a crumb is for; the whole atom is a row in
    // Facts, one tap away.
    const crumbs = S.chain.slice().reverse().map((n, ri) => {
      const i = S.chain.length - 1 - ri;
      const on = i === S.at;
      return `<button data-peek-to="${i}" title="${esc(atom(n))}" style="${BTN}white-space:nowrap;${on
        ? 'background:#facc15;border-color:#eab308;color:#18181b;font-weight:600;' : 'border-color:#e4e4e7;color:#71717a;'}"`
        + `>${esc(shortAtom(n))}</button>`;
    }).join(`<span style="color:${EDGE};flex:none">›</span>`);

    const tab = (k, label) => `<button data-peek-view="${k}" style="${BTN}${S.view === k
      ? 'background:#18181b;border-color:#18181b;color:#fff;' : ''}">${label}</button>`;

    const body = S.view === 'facts' ? fieldRows(f)
      : S.view === 'tree' ? pre(tree(el))
      : S.view === 'html' ? pre(clip2(html(el), HTML_CHARS))
      : S.view === 'render' ? renderFrame(el)
      : pre(JSON.stringify(json(), null, 2));

    S.panel.innerHTML = `
      <div style="${ROW}padding:8px 10px;border-bottom:1px solid ${LINE};gap:8px">
        <strong style="font-size:12px;letter-spacing:.06em;color:${DIM}">PEEK</strong>
        <button data-peek-act="down" title="Step toward the tapped node" style="${BTN}">▼</button>
        <button data-peek-act="up" title="Step to the parent" style="${BTN}">▲</button>
        <span style="color:${DIM};font-size:11px">${S.at + 1}/${S.chain.length}</span>
        <span style="flex:1"></span>
        <button data-peek-act="dock" title="Move to the other edge" style="${BTN}">${S.dock === 'bottom' ? '↑' : '↓'}</button>
        <button data-peek-act="off" title="Close" style="${BTN}">✕</button>
      </div>
      <div style="${ROW}padding:6px 10px;overflow-x:auto;border-bottom:1px solid ${LINE};flex-wrap:nowrap">${crumbs}</div>
      <div style="flex:1;min-height:0;overflow:auto;padding:10px">${body}</div>
      <div style="${ROW}padding:7px 10px;border-top:1px solid ${LINE}">
        ${tab('facts', 'Facts')}${tab('tree', 'Tree')}${tab('html', 'HTML')}${tab('json', 'JSON')}${tab('render', 'Render')}
        <span style="flex:1"></span>
        <button data-peek-act="copy" style="${BTN}background:#18181b;border-color:#18181b;color:#fff">Copy</button>
      </div>`;
  };

  // The proof: the wrapped fragment in a srcdoc frame, over a line saying what
  // rode along. The frame renders the exact string Copy takes, so a reviewer
  // sees the artifact rather than a promise about it. It FILLS the reading
  // area rather than carrying a height of its own: the panel's height is the
  // constant now, so a frame measured in vh would either overflow it or leave
  // a band of nothing under itself, and both would be a second scrollbar
  // inside a pane that already has one.
  const renderFrame = (el) => {
    const w = wrapInfo(el);
    const line = `${w.nodes} node${w.nodes === 1 ? '' : 's'} · ${(w.bytes / 1024).toFixed(1)}K · `
      + `${w.tags} vendor tag${w.tags === 1 ? '' : 's'}${w.theme ? ' · theme ' + esc(w.theme) : ''}`
      + (w.skipped.length ? ` · left behind: ${esc(w.skipped.join(', '))}` : '');
    return `<div style="height:100%;display:flex;flex-direction:column;gap:6px">`
      + `<div style="flex:none;color:${DIM};font-size:11px">${line}</div>`
      + `<iframe data-peek-frame title="Rendered on its own" srcdoc="${esc(w.html)}" `
      + `style="flex:1;min-height:0;width:100%;border:1px solid ${LINE};border-radius:6px;background:#fff"></iframe>`
      + `</div>`;
  };

  // clip() collapses whitespace, which is wrong for a serialization: HTML and
  // JSON are read for their shape. This one only truncates.
  const clip2 = (s, n) => (s = String(s ?? ''), s.length > n
    ? s.slice(0, n) + `\n… ${s.length - n} more characters (Copy takes all of it)` : s);

  const payload = () => {
    const el = current();
    if (!el) return '';
    return S.view === 'tree' ? tree(el)
      : S.view === 'html' ? html(el)
      : S.view === 'render' ? wrap(el)
      : S.view === 'json' ? JSON.stringify(json(), null, 2)
      : JSON.stringify(facts(el), null, 2);
  };

  const copy = async (kind) => {
    if (kind) S.view = kind === 'selector' ? S.view : kind;
    const el = current();
    if (!el) return '';
    const text = kind === 'selector' ? facts(el).selector : payload();
    try { await (win().navigator.clipboard.writeText(text)); } catch { }
    return text;
  };

  // ── Arming ────────────────────────────────────────────────────────────────

  const under = (x, y) => {
    const list = S.doc.elementsFromPoint ? S.doc.elementsFromPoint(x, y) : [S.doc.elementFromPoint(x, y)];
    for (const e of list) {
      if (!e || e === S.cover) continue;
      if (e.closest && e.closest(`[${UI}]`)) return null;   // our own furniture: not a target
      return e;
    }
    return null;
  };

  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); S.cleanup.push(() => t.removeEventListener(ev, fn, opt)); };

  const enable = (o = {}) => {
    if (S.doc) disable();
    S.doc = o.doc || document;
    S.onSelect = o.onSelect || null;
    S.view = o.view || 'facts';
    S.chain = []; S.at = 0; S.lastPt = null;

    const d = S.doc;
    S.hoverBox = mkBox('border:2px dashed rgba(250,204,21,.85);');
    S.selBox = mkBox('border:2px solid #facc15;background:rgba(250,204,21,.10);');

    // touch-action stays AUTO: selecting means finding the thing first, so the
    // page has to keep scrolling under the cover. That is also what separates
    // a tap from a scroll here, rather than a swallowed gesture.
    S.cover = d.createElement('div');
    S.cover.setAttribute(UI, '');
    S.cover.style.cssText = `position:fixed;inset:0;z-index:${Z - 2};cursor:crosshair;background:rgba(24,24,27,.03);`;
    d.body.appendChild(S.cover);

    S.panel = buildPanel();

    on(S.cover, 'pointermove', (e) => place(S.hoverBox, under(e.clientX, e.clientY)));
    on(S.cover, 'pointerleave', () => place(S.hoverBox, null));
    on(S.cover, 'pointerup', (e) => {
      const pt = { x: e.clientX, y: e.clientY };
      const near = S.lastPt && Math.abs(pt.x - S.lastPt.x) < STEP_SLOP && Math.abs(pt.y - S.lastPt.y) < STEP_SLOP;
      S.lastPt = pt;
      if (near && S.chain.length) up();
      else select(under(pt.x, pt.y));
      if (S.onSelect) S.onSelect(current(), facts(current() || d.body));
    });

    on(S.panel, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.peekTo != null) return to(+b.dataset.peekTo);
      if (b.dataset.peekView) { S.view = b.dataset.peekView; return render(); }
      const a = b.dataset.peekAct;
      if (a === 'up') return up();
      if (a === 'down') return down();
      if (a === 'copy') { copy(); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); return; }
      if (a === 'off') return disable();
      if (a === 'dock') { setDock(S.dock === 'bottom' ? 'top' : 'bottom'); return render(); }
    });

    on(d, 'keydown', (e) => {
      if (e.key === 'Escape') return disable();
      if (e.key === 'ArrowUp') { e.preventDefault(); up(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); down(); }
    }, true);

    // No scroll listener: the outlines are document-positioned and travel with
    // the page on their own. Resize still repaints, since a reflow moves the
    // element rather than the viewport over it.
    on(win(), 'resize', paint);

    render();
    return window.Peek;
  };

  const disable = () => {
    S.cleanup.forEach(fn => { try { fn(); } catch { } });
    S.cleanup = [];
    [S.cover, S.panel, S.hoverBox, S.selBox].forEach(n => n && n.remove());
    S.cover = S.panel = S.hoverBox = S.selBox = S.doc = null;
    S.chain = []; S.at = 0;
    return window.Peek;
  };

  window.Peek = {
    enable, disable, select, up, down, to, current, chain,
    facts, tree, html, json, wrap, wrapInfo, copy,
    // The library half: no enable() required, any document.
    atom, shortAtom, chainOf: build, selectorFor, roots, covers,
    get enabled() { return !!S.doc; },
  };
})();
