// console/suite.js — GENERATED, do not edit. `npm run build:console` reassembles
// it from console/base.js + console/mods/{core,verbs,query,grow,pick,infer,watch,tap,veins,columns,harvest,scan,lasso,census,templates,sets,join,semantics,deck,recipe}.js.

(() => {
  /** ── Core ───────────────────────────────────────────────────────────────── **/

  const _r = (n, k) => Math.round(n.getBoundingClientRect()[k]);

  const _f = (v, els) =>
    typeof v === 'string'   ? els.filter(text.own.clean.lower.includes(v)) :
    typeof v === 'number'   ? els.filter((_, i) => i === v) :
    v instanceof RegExp     ? els.filter(text.own.clean.test(v)) :
    typeof v === 'function' ? els.filter(v) : els;

  const getPath = (n, root, indexed = false, p = []) => {
    if (!n || n === root || n.nodeType !== 1) return p.join('/') || 'self';
    let t = n.tagName.toLowerCase();
    if (indexed) {
      const s = [...(n.parentElement?.children || [])].filter(x => x.tagName === n.tagName);
      if (s.length > 1) t += `[${s.indexOf(n) + 1}]`;
    }
    return getPath(n.parentElement, root, indexed, [t, ...p]);
  };

  /** ── Namespaces ─────────────────────────────────────────────────────────── **/

  const text = (() => {
    const sources = {
      full: n => n.textContent,
      own:  n => [...n.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join(''),
    };
    const transforms = {
      trim:  s => s.trim(),
      clean: s => s.trim().replace(/\s+/g, ' '),
      lower: s => s.toLowerCase(),
      upper: s => s.toUpperCase(),
    };
    const make = (state = { source: 'full', xforms: [] }) => {
      const apply   = s => state.xforms.reduce((a, k) => transforms[k](a), s);
      const extract = n => apply(sources[state.source](n));
      const next = {
        own:   { ...state, source: 'own' },
        trim:  { ...state, xforms: [...state.xforms, 'trim'] },
        clean: { ...state, xforms: [...state.xforms, 'clean'] },
        lower: { ...state, xforms: [...state.xforms, 'lower'] },
        upper: { ...state, xforms: [...state.xforms, 'upper'] },
      };
      const term = {
        includes:   q  => { const qq = apply(q); return n => extract(n).includes(qq); },
        startsWith: q  => { const qq = apply(q); return n => extract(n).startsWith(qq); },
        endsWith:   q  => { const qq = apply(q); return n => extract(n).endsWith(qq); },
        eq:         q  => { const qq = apply(q); return n => extract(n) === qq; },
        test:       re => n => re.test(extract(n)),
      };
      return new Proxy(extract, {
        get: (_, p) => p in next ? make(next[p]) : term[p],
      });
    };
    return make();
  })();

  const rect = new Proxy({
    x:   n => _r(n, 'left'),
    y:   n => _r(n, 'top'),
    w:   n => _r(n, 'width'),
    h:   n => _r(n, 'height'),
    dim: n => `${_r(n, 'width')}x${_r(n, 'height')}`,
  }, { get: (t, p) => p in t ? t[p] : n => _r(n, p) });

  const sig = {
    tag:     n => n.tagName.toLowerCase(),
    classes: n => [...n.classList],
    css:     n => (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].join('.') : ''),
    path:    n => getPath(n, null, true),
    visible: n => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length),
    info:    n => ({ tag: sig.tag(n), css: sig.css(n), dim: rect.dim(n), path: sig.path(n), text: text.clean(n), own: text.own.clean(n), visible: sig.visible(n) }),
  };

  const dom = {
    parent:          n => n.parentElement,
    children:        n => [...n.children],
    siblings:        n => [...(n.parentElement?.children || [])].filter(x => x !== n),
    textSiblings:    n => [...(n.parentElement?.childNodes || [])].filter(x => x.nodeType === 3).length,
    elementSiblings: n => [...(n.parentElement?.children || [])].length,
    commentSiblings: n => [...(n.parentElement?.childNodes || [])].filter(x => x.nodeType === 8).length,
    depth:           n => { let d = 0, c = n; while (c.parentElement) { d++; c = c.parentElement; } return d; },
    index:           n => [...(n.parentElement?.children || [])].indexOf(n),
  };

  const el = new Proxy({}, {
    get: (_, p) => n => { const v = n[p]; return typeof v === 'function' ? v.bind(n) : v; }
  });

  Object.assign(window, { text, rect, sig, dom, el });

  /** ── Standalone Utilities ───────────────────────────────────────────────── **/

  const mark = (els, spec = "red", attr = 'data-mark') => {
    els.forEach((n, i) => n.setAttribute(attr, i));

    // spec is one of two things, never a dialect: a bare color recolors mark's
    // layout-safe default (an outline), or a full CSS style string (any token
    // carrying a ':' passes through verbatim — your call, including its layout
    // cost). The rich prefix shorthand (bg-, p-, …) lives only in the console
    // formatter (f), for styling console *text*; mark deliberately does not
    // reuse it, so the two grammars can't drift into looking alike but differing.
    const w = 2, css = spec.split(";").map(x =>
      x.includes(':') ? x : `outline:${w}px solid ${x}`
    ).join(" !important;") + " !important;";

    const id = `mark-s-${attr.replace(/\W/g, '-')}`;
    const s = document.getElementById(id) || Object.assign(document.createElement('style'), { id });
    if (!s.parentNode) document.head.appendChild(s);

  s.textContent = `
      [${attr}]{${css} cursor:crosshair; transition:all 0.1s; position:relative} 
      [${attr}]:hover{outline-width:${w+1}px !important; z-index:1e5}
      [${attr}]::after {
        content: attr(${attr});
        position: absolute;
        top: -20px; right: -10px;
        background: #ffe;
        color: #0f172a;
        font: bold 12px/1.1 monospace;
        padding: 1px 2px;
        border-radius: 3px;
        border: 1px solid #94a3b8;
        white-space: nowrap;
        pointer-events: none;
        z-index: 1e4;
      }
      [${attr}]:hover::after {
        background: #fef08a;
        color: #854d0e;
        border-color: #eab308;
        z-index: 1e6;
      }
    `;
  };

  const unionArea = rs => {
    if (!rs.length) return 0;
    const ev = [];
    rs.forEach(r => { ev.push({x:r.left, t:1, y1:r.top, y2:r.bottom}, {x:r.right, t:-1, y1:r.top, y2:r.bottom}); });
    ev.sort((a,b) => a.x - b.x);
    let px = ev[0]?.x || 0, area = 0, act = [];
    for (const e of ev) {
      const dx = e.x - px;
      if (dx > 0) {
        let len = 0, c = -1e9;
        act.sort((a,b) => a.y1 - b.y1).forEach(iv => {
          if (iv.y1>c){len+=iv.y2-iv.y1;c=iv.y2} else if(iv.y2>c){len+=iv.y2-c;c=iv.y2}
        });
        area += len * dx; px = e.x;
      }
      e.t > 0 ? act.push(e) : (act = act.filter(iv => iv.y1 !== e.y1 || iv.y2 !== e.y2));
    }
    return area;
  };

  const summary = (els, groupBy = sig.path) => {
    const groups = new Map(), r = n => +n.toFixed(3);
    els.forEach(n => {
      const key = groupBy(n);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ n, r: n.getBoundingClientRect(), len: text.clean(n).length });
    });
    const res = [...groups].map(([id, items]) => {
      const rects = items.map(i => i.r);
      const u = unionArea(rects);
      const bb = (Math.max(...rects.map(z=>z.right)) - Math.min(...rects.map(z=>z.left))) *
                 (Math.max(...rects.map(z=>z.bottom)) - Math.min(...rects.map(z=>z.top)));
      return { group: id, count: items.length, tags: items.reduce((m,i) => { const k=sig.tag(i.n); m[k]=(m[k]||0)+1; return m; }, {}), geoReg: r(u/(bb||1)), avgLen: r(items.reduce((a,b) => a+b.len, 0) / items.length) };
    }).sort((a,b) => b.count - a.count);
    console.table(res);
    return res;
  };

  Object.assign(window, { mark, unionArea, summary });

  /** ── ea ─────────────────────────────────────────────────────────────────── **/

  window.ea = (sel, root = document) => {
    const arr = [...root.querySelectorAll(sel)];
    arr.tally   = (fn = sig.tag) => arr.reduce((m, n) => { const k = fn(n); m[k] = (m[k] || 0) + 1; return m; }, {});
    arr.groupBy = (fn = sig.tag) => arr.reduce((m, n) => { const k = fn(n); (m[k] ??= []).push(n); return m; }, {});
    arr.mark    = (spec, attr) => { mark(arr, spec, attr); return arr; };
    arr.summary = (fn) => summary(arr, fn);
    arr.climb   = (arg) => {
      const r = [];
      arr.forEach(n => {
        let cur = n, i = 0;
        while ((cur = cur.parentElement)) {
          if (typeof arg === 'number' ? ++i > arg : (arg && !arg(cur))) continue;
          r.push(cur); if (typeof arg !== 'number') break;
        }
      });
      return glom.set([...new Set(r)]);
    };
    return arr;
  };

  /** ── glom ───────────────────────────────────────────────────────────────── **/

  const SCOPE = 'body *:not(script):not(style)';

  const glom = (...args) => {
    const [payload, mod] = args;
    const isContent = v => typeof v === 'string' || typeof v === 'number' ||
                           typeof v === 'function' || v instanceof RegExp;
    if (isContent(payload)) return glom.set(_f(payload, ea(SCOPE)));
    const els =
      payload instanceof Element ? [payload] :
      payload === document       ? [document.documentElement] :
      payload != null            ? Array.from(payload).filter(n => n instanceof Element) :
      args.length                ? [] :
      ea(SCOPE);
    return glom.set(_f(mod, els));
  };

  glom.history = [];

  glom.set = els => {
    glom.history.push(ea('[data-glom]'));
    ea('[data-glom]').forEach(n => n.removeAttribute('data-glom'));
    document.getElementById('mark-s-data-glom')?.remove();
    const res = [...new Set(els)];
    res.forEach((n, i) => n.setAttribute('data-glom', i));
    return ea('[data-glom]');
  };

  glom.get = (pred) => _f(pred, ea('[data-glom]'));
  glom.keep = v => { const p = glom.get(), r = _f(v, p); console.log(`keep: ${p.length} → ${r.length}`); return glom.set(r); };
  glom.drop = v => { const p = glom.get(), m = new Set(_f(v, p)), r = p.filter(n => !m.has(n)); console.log(`drop: ${p.length} → ${r.length}`); return glom.set(r); };
  glom.undo    = () => { const prev = glom.history.pop(); if (prev) { console.log(`undo: → ${prev.length}`); return glom.set(prev); } return []; };
  glom.clear   = () => { document.getElementById('mark-s-data-glom')?.remove(); glom.history = []; return glom.set([]); };
  glom.mark    = (spec) => { mark(glom.get(), spec, 'data-glom'); return glom.get(); };
  glom.summary = (fn) => summary(glom.get(), fn);

  window.glom = glom;

  /** ── Pop ────────────────────────────────────────────────────────────────── **/

  class Pop {
    constructor({ width = 800, height = 600 } = {}) {
      this.width = width;
      this.height = height;
    }
    show(html) {
      const content = html || prompt("Paste full HTML string:");
      if (!content) return;
      const w = window.open("", "_blank", `width=${this.width},height=${this.height}`);
      w.document.write(content);
      w.document.close();
      if (console.style) {
        console.style(console.formatter("green;bold", "📖 Raw HTML Rendered"), console.formatter("gray", `Length: ${content.length} chars`));
      }
      return w;
    }
    toUrl(s, base64 = true) {
      return base64 ? 'data:text/html;base64,' + btoa(unescape(encodeURIComponent(s))) : 'data:text/html,' + encodeURIComponent(s);
    }
    // gzip a string to a base64 payload, and back. pack/unpack are the pure
    // codec (the suite's one gzip implementation — scan and packTable use it);
    // inflate is unpack + render-in-a-popup.
    async pack(s) {
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      w.write(new TextEncoder().encode(s));
      w.close();
      const bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      let out = '';
      for (const b of bytes) out += String.fromCharCode(b);
      return btoa(out);
    }
    async unpack(s) {
      const bytes = Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0));
      return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    async inflate(s) {
      const d = await this.unpack(s);
      const w = window.open('', '_blank', `width=${this.width},height=${this.height}`);
      w.document.write(d);
      w.document.close();
      return new Promise(resolve => { w.onload = () => resolve(w); });
    }
  }
  const _pop = new Pop();
  window.pop = _pop;

  window.packTable = async (input = prompt("Paste TSV")) => {
    let headers, data;
    if (typeof input === 'string') {
      const rows = input.trim().split("\n").map(r => r.split("\t"));
      [headers, ...data] = rows;
      data = data.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    } else {
      headers = Object.keys(input[0]);
      data = input;
    }
    const col = Object.fromEntries(headers.map(h => [h, data.map(r => r[h])]));
    const b64 = await _pop.pack(JSON.stringify(col));
    copy(b64);
    if (console.style) console.style(console.formatter("green;bold", "✅ packTable"), console.formatter("gray", `${headers.length} cols × ${data.length} rows → ${b64.length} chars`));
    return b64;
  };

  /** ── copy override ──────────────────────────────────────────────────────── **/

  let abort;
  const _c = window.copy;
  window.copy = (v) => {
    if (abort) abort.abort();
    abort = new AbortController();
    const trigger = () => {
      _c(v);
      if (console.style) console.style(console.formatter("green;bold", "✅ Copied:"), console.formatter("gray", v));
      abort = null;
    };
    if (console.style) console.style(console.formatter("orange;bold", "🖱️ Click page to copy..."));
    document.addEventListener('click', trigger, { once: true, signal: abort.signal });
  };

  /** ── Console formatter ──────────────────────────────────────────────────── **/

  const f = (spec, txt, border) => {
    const css = spec.split(";").map(x =>
      f.css[x] ||
      (x.match(/^\d+$/) ? `font-size:${x}px` : "") ||
      (x.startsWith("bg-") ? `background:${x.slice(3)}` : "") ||
      (x.startsWith("p-") ? `padding:${x.slice(2)}px` : "") ||
      (x ? `color:${x}` : "")
    ).join(";") + (border ? `;border:${border}` : "");
    return { t: `%c${txt}`, c: css };
  };

  f.css = { bold: "font-weight:bold", italic: "font-style:italic", underline: "text-decoration:underline", strike: "text-decoration:line-through" };
  f.agg = a => {
    const fmt = [], args = [];
    for (const x of a)
      x?.t ? (fmt.push(x.t), args.push(x.c)) : (fmt.push(typeof x == "string" ? x : "%o"), typeof x !== "string" && args.push(x));
    return [fmt.join(" "), ...args];
  };

  console.formatter  = f;
  console.style      = (...a) => console.log(...f.agg(a));
  console.styleGroup = (c, ...a) => (c ? console.groupCollapsed : console.group)(...f.agg(a));
  console.nest       = (lbl, fn, c = true) => { console.styleGroup(c, f("bold", lbl)); try { fn(); } finally { console.groupEnd(); } };

  /** ── Console methods ────────────────────────────────────────────────────── **/

  console.box = (hdr, msg) => {
    const w = Math.max(hdr.length, msg.length) + 6;
    const line = (t, c) => f(c, `║ ${t.padEnd(w - 4)} ║\n`);
    const rule = (s, e) => f("bold;green", s + "═".repeat(w - 2) + e);
    console.style(rule(" ╔", "╗\n"), line(hdr.padStart(hdr.length + (w - 4 - hdr.length) / 2), "bold;green"), line(msg.padStart(msg.length + (w - 4 - msg.length) / 2), "gray"), rule("╚", "╝"));
  };

  console.detail = (n, i = 0) => {
    if (!(n instanceof Element)) return;
    const segs = sig.path(n).split('/'), last = segs.pop();
    const r = n.getClientRects?.()?.[0];
    console.styleGroup(!r, f("orange;bold", `[${i}]`), f("gray", ` ${segs.join('/')}/`), f("black;bold", last));
    return r;
  };

  console.see = (inp = '*', filt, fn = x => x) => {
    let els;
    try {
      if (typeof inp === "string") els = ea(inp);
      else if (inp instanceof Element) els = [inp];
      else if (inp === document) els = [document.documentElement];
      else els = [...inp];
    } catch (e) {
      return console.warn("console.see: Input is not a string, Element, or Iterable.", inp);
    }

    els = _f(filt, els);

    els.forEach((n, i) => {
      if (!(n instanceof Element) || !console.detail(n, i)) return console.groupEnd();
      const r = n.getClientRects()[0];
      const info = r ? ` x:${rect.x(n)} y:${rect.y(n)} w:${rect.w(n)} h:${rect.h(n)}` : "";
      console.style(f("#123;bold", sig.tag(n)), f("#E62;bold", n.id ? "#" + n.id : ""), f("#26E;bold", n.classList.length ? "." + [...n.classList].join(".") : ""), f("p-1;#345;italic;border:1px solid #ccc", info), n);

      const t = text.own.clean(n);
      if (t) {
        const style = n.tagName === "SCRIPT" ? "#569cd6;italic" : (n.tagName === "STYLE" ? "#c586c0;italic" : "green;14");
        console.style("\n", f(style + ";p-1;border:2px dashed #FCE790", t.length > 100 ? t.slice(0, 100) + "…" : t));
      }

      const res = typeof fn === "string" ? fn.split(",").map(k => n[k.trim()]) : fn(n, i);
      if (res !== n) console.style(f("gray", `Result:`), f("blue;bold", typeof res === "object" ? JSON.stringify(res) : res));
      console.groupEnd();
    });
    console.see.last = els;
  };

  console.help = (obj) => {
    if (!obj) return console.box("Help", "No object");
    console.box("Help", obj.constructor?.name || typeof obj);

    const getSig = fn => {
      const s = fn.toString();
      let d = 0, i = 0;
      for (; i < s.length; i++) {
        if (s[i] == '(' || s[i] == '{') d++;
        if (s[i] == ')' || s[i] == '}') d--;
        if (s[i] == '{' && d == 1) break;
      }
      return s.slice(0, i).replace(/\s+/g, " ").trim();
    };

    const readVal = (o, k) => {
      try { return { ok: true, val: o[k] }; }
      catch { return { ok: false, val: '[Getter Exception]' }; }
    };

    const dumpProto = (p) => {
      for (const k of Object.getOwnPropertyNames(p)) {
        if (k === "constructor") continue;
        const { ok, val } = readVal(p, k);
        if (!ok || typeof val !== "function") continue;
        console.style(f("#999", k), f("gray", `args:${val.length}`), f("#555;italic", getSig(val)));
      }
    };

    const dumpOwn = (o) => {
      for (const k of Object.getOwnPropertyNames(o)) {
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (d.get || d.set) {
          console.style(f("orange;bold", k), f("gray", "(accessor)"));
          continue;
        }
        const v = d.value;
        if (typeof v === "function") {
          const protoHas = (() => {
            let p = Object.getPrototypeOf(o);
            while (p) { if (Object.prototype.hasOwnProperty.call(p, k)) return p; p = Object.getPrototypeOf(p); }
            return null;
          })();
          const tag = protoHas ? (v === protoHas[k] ? "[shadows proto]" : "[OVERRIDES proto]") : "[own fn]";
          console.style(f("orange;bold", k), f("red;bold", tag), f("gray", `args:${v.length}`), f("#555;italic", getSig(v)));
        } else {
          console.style(f("orange;bold", k), v);
        }
      }
    };

    console.group("Prototype Chain");
    let p = Object.getPrototypeOf(obj);
    while (p && p !== Object.prototype) {
      console.styleGroup(true, f("bold;#09f", p.constructor?.name || "(proto)"));
      dumpProto(p);
      console.groupEnd();
      p = Object.getPrototypeOf(p);
    }
    console.groupEnd();

    console.nest("Own Properties", () => {
      console.nest("Interactive", () => dumpOwn(obj), true);
      console.nest("Serialized", () => {
        try {
          const seen = new WeakMap();
          console.log(JSON.stringify(obj, (k, v) => {
            if (typeof v === 'object' && v) {
              if (seen.has(v)) return '[Circular]';
              seen.set(v, true);
            }
            return v;
          }, 2));
        } catch (e) {
          console.log("[Error]", e);
        }
      }, true);
    }, false);
  };

  console.env = () => {
    const fEl = document.createElement("iframe"); fEl.style.display="none"; document.body.append(fEl);
    const clean = new Set(Object.keys(fEl.contentWindow)); fEl.remove();
    const vars = Object.entries(Object.getOwnPropertyDescriptors(window)).filter(([k]) => !clean.has(k)).reduce((a, [k]) => {
      const v = window[k], t = typeof v;
      if (['$','debug','dir','table'].includes(k)) a.chrome.push(k);
      else if (t === 'function') a.func.push(k);
      else if (t === 'object' && v) a.obj.push({k, v, type: v.constructor?.name});
      else a.prim.push({k, v});
      return a;
    }, { chrome:[], func:[], obj:[], prim:[] });
    console.box("Env", `${Object.values(vars).flat().length} variables`);
    console.nest("Variables", () => {
      if (vars.func.length) console.style(f("#4da;bold", "functions:"), vars.func);
      vars.obj.sort((a,b)=>a.k.localeCompare(b.k)).forEach(x => console.style(f("#4b8bd8;bold", `${x.k} ${x.type||''}`), x.v));
      vars.prim.sort((a,b)=>a.k.localeCompare(b.k)).forEach(x => console.style(f("#aa77cc;bold", x.k+":"), x.v));
    }, false);
  };

  // help() with no argument opens the visual guide (tabbed reference + live
  // fixtures) in a popup; help(obj) still inspects an object via console.help.
  // The guide is the console-playground page — canonical hosted copy, so it
  // opens from any page the suite is pasted into.
  const GUIDE_URL = 'https://mehrlander.github.io/web-tools/pages/console-playground.html';
  window.help = (obj) => {
    if (obj !== undefined) return console.help(obj);
    const w = window.open(GUIDE_URL, 'web-tools-guide', 'width=1040,height=840');
    if (!w) console.log('help: popup blocked — open the guide at', GUIDE_URL);
    return GUIDE_URL;
  };

  console.nest("Suite Loaded", () => {
    const g = (k, v) => console.style(f("bold;#4b8bd8", k.padEnd(11)), f("gray", v));
    g("Selectors", "ea(sel), glom(filt|els)");
    g("Accessors", "text, rect, sig, dom, el");
    g("Ops",       "mark, summary, unionArea");
    g("Browser",   "pop, packTable, copy");
    g("Console",   "see, help(obj), env, style, box, nest");
    g("Guide",     "help() — open the visual guide + fixtures");
   console.style(f("gray;italic", "try"), f("#345", "help()"), f("gray;italic", "or"), f("#345", "glom('foo').mark()"));  });

  window.look = {
    v: "initial",
    prompt(m) { this.v = window.prompt(m, this.v) ?? this.v; return this },
    toUrl(b) { return _pop.toUrl(this.v, b) },
    show() { return _pop.show(this.v) },
    pack() { return _pop.pack(this.v) },
    toString() { return this.v },
    [Symbol.toPrimitive]() { return this.v }
  };
})();

/* ══ mods/core.js ═══════════════════════════════════════════════════ */

// console/mods/core.js — shared kernels and the set event bus. Loads first;
// every other glom mod requires base.js + this one (tap stays standalone).
//
//   glom.core   { SCOPE, HUES, clean, own, upath, docOrder, upStep, overStep }
//               the helpers the mods used to each carry a private copy of
//   glom.onSet  subscriber list: every fn(els) runs after glom.set — and
//               everything funnels through set (verbs, pick, grow, lasso,
//               undo), so this is the suite's event bus. Subscribe instead
//               of monkey-patching set; deck and recipe do.
(() => {
  const g = window.glom;
  if (!g) return console.warn('mods/core: console/base.js must load first');

  const clean = s => s.trim().replace(/\s+/g, ' ');
  const HUES = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#dc2626', '#4f46e5'];
  g.core = {
    SCOPE: 'body *:not(script):not(style)',
    HUES,
    clean,
    own: n => clean([...n.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join('')),
    upath: n => {
      const p = [];
      for (let c = n; c && c.nodeType === 1; c = c.parentElement) p.unshift(c.tagName.toLowerCase());
      return p.join('/');
    },
    docOrder: els => [...new Set(els)].sort((a, b) =>
      a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1),
    upStep: (n, arg) => {
      if (typeof arg === 'string') return n.parentElement?.closest(arg) ?? null;
      if (typeof arg === 'function') { let c = n.parentElement; while (c && !arg(c)) c = c.parentElement; return c; }
      let c = n; for (let k = arg ?? 1; k > 0 && c; k--) c = c.parentElement;
      return c;
    },
    overStep: (n, k) => {
      let c = n;
      while (c && k > 0) { c = c.nextElementSibling; k--; }
      while (c && k < 0) { c = c.previousElementSibling; k++; }
      return c;
    },
    // Scroll-until-dry: run round() (which returns how many new items it saw),
    // then scroll + settle + round() until `dry` consecutive rounds surface
    // nothing or `max` rounds pass. harvest sweeps into memory, scan.sweep into
    // a store; both drive this one loop. Returns { total, rounds, hitMax }.
    sweep: async (round, { scroll, settle = 350, dry = 3, max = 200 } = {}) => {
      const step = scroll ?? (() => window.scrollBy(0, window.innerHeight));
      const wait = ms => new Promise(r => setTimeout(r, ms));
      let total = await round(), drought = 0, rounds = 0;
      while (drought < dry && rounds < max) {
        rounds++;
        step();
        await wait(settle);
        const n = await round();
        total += n;
        drought = n ? 0 : drought + 1;
      }
      return { total, rounds, hitMax: rounds >= max };
    },
    // Debounced DOM-churn subscription: fire cb() `settle` ms after mutations
    // quiesce, and return a stop fn. The suite's SPA-fragility primitive —
    // watch heals the set on churn, scan captures on it.
    onChurn: (cb, settle = 250) => {
      let timer;
      const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(cb, settle); });
      mo.observe(document.body, { childList: true, subtree: true });
      return () => { mo.disconnect(); clearTimeout(timer); };
    },
    // A hued group layer for the rank-and-mark mods (census, templates): mark N
    // groups each in its own hue under data-<prefix>-<i>, grab group i into the
    // working set, and clear the marks. Owns the group list, so the two mods
    // stop each carrying their own verbatim grab/clear/mark copy.
    groupLayer: prefix => {
      let groups = [];
      const attr = i => `data-${prefix}-${i}`;
      return {
        mark(gs, on = true) {
          groups = gs;
          if (on) groups.forEach((grp, i) => window.mark(grp.els, HUES[i % HUES.length], attr(i)));
          return groups;
        },
        grab: i => groups[i] ? window.glom(groups[i].els) : (console.warn(`${prefix}: no group ${i} — run it first`), []),
        clear() {
          for (let i = 0; ; i++) {
            const style = document.getElementById(`mark-s-${attr(i)}`);
            const els = document.querySelectorAll(`[${attr(i)}]`);
            if (!style && !els.length) break;
            style?.remove();
            els.forEach(n => n.removeAttribute(attr(i)));
          }
          groups = [];
        },
      };
    },
  };

  g.onSet = [];
  const origSet = g.set;
  g.set = els => {
    const r = origSet(els);
    for (const fn of g.onSet) { try { fn(r); } catch (e) { console.warn('glom.onSet subscriber failed:', e); } }
    return r;
  };
})();

/* ══ mods/verbs.js ══════════════════════════════════════════════════ */

// console/mods/verbs.js — set-wise navigation for the glom working set.
// Requires console/base.js (glom). The set moves in lockstep: every member
// takes the same step, members whose step lands nowhere drop out, and
// glom.set dedupes and renumbers. The set stops being a bag and becomes a
// cursor over N parallel subtrees.
//
//   glom.up()            parent of each member
//   glom.up(2)           grandparent
//   glom.up('tr')        closest 'tr' ancestor (excludes self)
//   glom.up(pred)        nearest ancestor passing pred
//   glom.down('a')       first 'a' descendant per member (keeps cardinality)
//   glom.downAll('a')    every 'a' descendant, unioned
//   glom.over()          next element sibling
//   glom.over(-2)        two siblings back
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/verbs: base.js + mods/core.js must load first');
  const { upStep, overStep } = g.core;

  const move = (name, p, stepped) => {
    const r = g.set(stepped.filter(Boolean));
    console.log(`${name}: ${p.length} → ${r.length}`);
    return r;
  };

  g.up      = (arg)   => { const p = g.get(); return move('up',      p, p.map(n => upStep(n, arg))); };
  g.over    = (k = 1) => { const p = g.get(); return move('over',    p, p.map(n => overStep(n, k))); };
  g.down    = (sel)   => { const p = g.get(); return move('down',    p, p.map(n => n.querySelector(sel))); };
  g.downAll = (sel)   => { const p = g.get(); return move('downAll', p, p.flatMap(n => [...n.querySelectorAll(sel)])); };
})();

/* ══ mods/query.js ══════════════════════════════════════════════════ */

// console/mods/query.js — q(expr): a Playwright-flavored chain grammar,
// implemented browser-native (Playwright itself is Node-side; its selector
// grammar is just syntax). Requires console/base.js (ea, sig, mark, glom).
//
//   q('#bills >> tbody tr >> has-text=hearing >> down=a >> nth=0-4')
//
// Stages, separated by `>>`, each transforming the element set:
//   <css>             querySelectorAll — document-wide as the first stage,
//                     then within each member
//   text=foo          own text contains "foo" (case-insensitive)
//   text="Foo"        own text equals "Foo" (whitespace-cleaned)
//   text=/re/i        own text matches the regex
//   has-text=…        same three forms, against full textContent
//   has=<css>         keep members containing a descendant match
//   visible           keep visible members; visible=false for the inverse
//   nth=2             pick by index (0-based; negatives count from the end)
//   nth=1-4           inclusive range (ends may be negative: nth=1--1)
//   up · up=2 · up=<css>   parent / nth ancestor / closest ancestor
//   down=<css>        first descendant match per member
//   down*=<css>       all descendant matches, unioned
//   over=1 · over=-2  sibling hops
//
// Returns a plain array decorated with .mark(spec), .glom() (adopt as the
// working set), and .texts(). Results are deduped in document order.
//
// Grammar notes: `>>` inside quotes or /regex/ literals is safe; a bare stage
// named like an engine (e.g. an svg <text> selector) is read as the engine,
// so write it as `svg text` or `*|text`.
(() => {
  if (!window.ea || !window.glom?.core) return console.warn('mods/query: base.js + mods/core.js must load first');
  const { SCOPE, clean, own, docOrder, upStep, overStep } = window.glom.core;
  const full = n => clean(n.textContent);

  // Split on `>>` outside of "…", '…', and /…/ spans.
  const split = expr => {
    const stages = []; let buf = '', quote = null;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (quote) { buf += c; if (c === quote && expr[i - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'" || c === '/') { quote = c; buf += c; continue; }
      if (c === '>' && expr[i + 1] === '>') { stages.push(buf.trim()); buf = ''; i++; continue; }
      buf += c;
    }
    stages.push(buf.trim());
    return stages.filter(Boolean);
  };

  const ENGINES = new Set(['text', 'has-text', 'has', 'nth', 'up', 'down', 'down*', 'over', 'visible']);
  const BARE    = new Set(['up', 'visible']);
  const parse = stage => {
    const m = stage.match(/^([a-z-]+\*?)\s*=\s*([\s\S]+)$/i);
    if (m && ENGINES.has(m[1].toLowerCase())) return { name: m[1].toLowerCase(), val: m[2].trim() };
    if (BARE.has(stage.toLowerCase())) return { name: stage.toLowerCase(), val: '' };
    return { name: 'css', val: stage };
  };

  const textPred = (val, extract) => {
    const rm = val.match(/^\/(.*)\/([a-z]*)$/s);
    if (rm) { const re = new RegExp(rm[1], rm[2]); return n => re.test(extract(n)); }
    const qm = val.match(/^"(.*)"$/s) || val.match(/^'(.*)'$/s);
    if (qm) { const s = clean(qm[1]); return n => extract(n) === s; }
    const s = val.toLowerCase();
    return n => extract(n).toLowerCase().includes(s);
  };

  const nth = (val, els) => {
    const m = val.match(/^(-?\d+)(?:\s*-\s*(-?\d+))?$/);
    if (!m) { console.warn(`q: bad nth=${val}`); return els; }
    const idx = i => i < 0 ? els.length + i : i;
    if (m[2] == null) { const el = els[idx(+m[1])]; return el ? [el] : []; }
    return els.slice(idx(+m[1]), idx(+m[2]) + 1);
  };

  const apply = (els, { name, val }) => {
    switch (name) {
      case 'css':      return docOrder(els.flatMap(n => [...n.querySelectorAll(val)]));
      case 'text':     return els.filter(textPred(val, own));
      case 'has-text': return els.filter(textPred(val, full));
      case 'has':      return els.filter(n => n.querySelector(val));
      case 'visible':  { const want = val !== 'false'; return els.filter(n => sig.visible(n) === want); }
      case 'nth':      return nth(val, els);
      case 'up':       return docOrder(els.map(n => upStep(n, val === '' ? 1 : (/^\d+$/.test(val) ? +val : val))).filter(Boolean));
      case 'down':     return docOrder(els.map(n => n.querySelector(val)).filter(Boolean));
      case 'down*':    return docOrder(els.flatMap(n => [...n.querySelectorAll(val)]));
      case 'over':     { const k = val === '' ? 1 : +val; if (!Number.isFinite(k)) { console.warn(`q: bad over=${val}`); return els; } return docOrder(els.map(n => overStep(n, k)).filter(Boolean)); }
      default:         return els;
    }
  };

  const decorate = arr => Object.assign(arr, {
    mark:  spec => (window.mark(arr, spec), arr),
    glom:  ()   => window.glom(arr),
    texts: ()   => arr.map(own),
  });

  window.q = expr => {
    const stages = split(String(expr));
    let els = null;
    for (const stage of stages) {
      const s = parse(stage);
      if (els === null) { els = s.name === 'css' ? [...document.querySelectorAll(s.val)] : apply(ea(SCOPE), s); continue; }
      els = apply(els, s);
    }
    return decorate(els ?? []);
  };
})();

/* ══ mods/grow.js ═══════════════════════════════════════════════════ */

// console/mods/grow.js — by-example expansion of the working set.
// Requires console/base.js (glom, ea).
//
//   glom.grow()                expand current members to everything alike
//   glom.grow({classes: false})  match on tag-path alone
//   glom.grow({by: 'style'})   match on computed style (looks-alike; real
//                              layout only — jsdom styles are uniform)
//   glom.alike(el)             fresh set from one example element
//
// Fingerprint: the unindexed tag path from the root (html/body/table/tbody/tr)
// plus, when a path has two or more examples, the classes those examples
// share. Two examples define what "alike" means far better than one (the
// SelectorGadget insight): shared classes survive the intersection, hashy
// per-instance classes (css-1a2b3c) wash out. A single example can't say
// which of its classes matter, so it matches on structure alone.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/grow: base.js + mods/core.js must load first');
  const { SCOPE, upath } = g.core;

  // Style fingerprint: "these LOOK like list items" — finds families in
  // class-less div soup where tag paths and classes both fail. Real layout
  // only (computed styles are uniform under jsdom).
  const styleKey = n => {
    const cs = getComputedStyle(n);
    return [n.tagName, cs.display, cs.fontSize, cs.fontWeight, cs.color, cs.backgroundColor, cs.textAlign].join('|');
  };

  const expand = (members, { classes = true, by = 'structure' } = {}) => {
    if (!members.length) { console.warn('grow: empty set — glom or pick something first'); return []; }
    if (by === 'style') {
      const keys = new Set(members.map(styleKey));
      return ea(SCOPE).filter(n => keys.has(styleKey(n)));
    }
    const req = new Map();   // upath → { classes: Set (intersection), count }
    for (const n of members) {
      const key = upath(n), r = req.get(key);
      if (!r) req.set(key, { classes: new Set(n.classList), count: 1 });
      else { r.count++; for (const c of r.classes) if (!n.classList.contains(c)) r.classes.delete(c); }
    }
    if (classes && [...req.values()].every(r => r.count < 2))
      console.log('grow: single example — matching structure alone; pick two for class-aware growth');
    return ea(SCOPE).filter(n => {
      const r = req.get(upath(n));
      if (!r) return false;
      if (!classes || r.count < 2) return true;
      return [...r.classes].every(c => n.classList.contains(c));
    });
  };

  g.grow = opts => {
    const p = g.get();
    const r = g.set([...new Set([...p, ...expand(p, opts)])]);
    console.log(`grow: ${p.length} → ${r.length}`);
    return r;
  };
  g.alike = (el, opts) => g.set(expand([el].filter(n => n instanceof Element), opts));
})();

/* ══ mods/pick.js ═══════════════════════════════════════════════════ */

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

/* ══ mods/infer.js ══════════════════════════════════════════════════ */

// console/mods/infer.js — glom.infer(): synthesize a CSS selector that
// matches the working set, and say honestly how well it does. Converts a
// hand-danced set (picked, grown, lassoed, keep/dropped) into something
// durable: replayable after a rerender, pasteable into Playwright or a
// scraper. Requires console/base.js (glom).
//
//   glom.infer()   → { selector, extra, missing }   (logs a verdict)
//
// extra = elements the selector matches beyond the set; missing = members it
// fails to match. (0, 0) is exact. Candidates: the members' shared atom
// (tag + classes every member carries), then the same atom scoped under each
// common ancestor with an id or classes. Mixed-tag sets infer per tag and
// join with commas.
(() => {
  const g = window.glom;
  if (!g) return console.warn('mods/infer: console/base.js must load first');
  const esc = s => window.CSS?.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1');

  const trySel = (selector, wantSet, wantLen) => {
    let got; try { got = document.querySelectorAll(selector); } catch { return null; }
    let extra = 0, hit = 0;
    for (const n of got) wantSet.has(n) ? hit++ : extra++;
    return { selector, extra, missing: wantLen - hit };
  };

  const atomFor = els => {
    const tags = new Set(els.map(n => n.tagName.toLowerCase()));
    const tag = tags.size === 1 ? [...tags][0] : '';
    const shared = [...els[0].classList].filter(c => els.every(n => n.classList.contains(c)));
    return (tag + shared.map(c => '.' + esc(c)).join('')) || tag;
  };

  const commonAncestors = els => {
    const chain = [];
    for (let c = els[0].parentElement; c && c !== document.documentElement; c = c.parentElement) chain.push(c);
    return chain.filter(a => els.every(n => a.contains(n)));
  };

  const inferOne = els => {
    const wantSet = new Set(els), wantLen = els.length;
    const atom = atomFor(els) || els[0].tagName.toLowerCase();
    const cands = [atom];
    for (const a of commonAncestors(els).slice(0, 6)) {
      const aa = a.id ? '#' + esc(a.id)
               : a.classList.length ? a.tagName.toLowerCase() + [...a.classList].map(c => '.' + esc(c)).join('')
               : null;
      if (aa) cands.push(`${aa} > ${atom}`, `${aa} ${atom}`);
    }
    const scored = cands.map(s => trySel(s, wantSet, wantLen)).filter(Boolean);
    const exact = scored.filter(r => !r.extra && !r.missing)
                        .sort((a, b) => a.selector.length - b.selector.length);
    if (exact.length) return exact[0];
    return scored.filter(r => !r.missing).sort((a, b) => a.extra - b.extra || a.selector.length - b.selector.length)[0]
        ?? scored.sort((a, b) => (a.extra + a.missing) - (b.extra + b.missing))[0];
  };

  g.infer = () => {
    const want = g.get();
    if (!want.length) { console.warn('infer: empty set'); return null; }
    const tags = [...new Set(want.map(n => n.tagName))];
    let res;
    if (tags.length === 1) res = inferOne(want);
    else {
      const joined = tags.map(t => inferOne(want.filter(n => n.tagName === t)).selector).join(', ');
      res = trySel(joined, new Set(want), want.length);
    }
    console.log(`infer: ${res.selector}${res.extra || res.missing ? ` (+${res.extra} extra, ${res.missing} missing)` : ' (exact)'}`);
    return res;
  };
})();

/* ══ mods/watch.js ══════════════════════════════════════════════════ */

// console/mods/watch.js — the self-healing working set. React-style pages
// destroy data-glom attributes on every rerender, killing the selection
// mid-dance; watch re-acquires it. Requires console/base.js (glom); uses
// mods/infer.js for the automatic selector when no explicit one is given.
//
//   glom.watch()                    infer a selector from the current set and
//                                   re-apply it whenever the DOM churns
//   glom.watch({selector: '.row'})  explicit selector (infer not needed)
//   glom.watch.stop()               disarm
//
// Mutations are debounced (`settle` ms, default 250) so a rerender storm
// heals once, at the end. Healing logs only when membership actually changed.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/watch: base.js + mods/core.js must load first');
  let stopChurn = null;

  g.watch = ({ selector, settle = 250 } = {}) => {
    g.watch.stop();
    const sel = selector ?? (g.infer ? g.infer()?.selector : null);
    if (!sel) return console.warn('watch: pass {selector}, or glom something and load mods/infer.js');

    const heal = () => {
      const fresh = [...document.querySelectorAll(sel)];
      const cur = g.get();
      if (fresh.length === cur.length && fresh.every((n, i) => n === cur[i])) return;
      g.set(fresh);
      console.log(`watch: healed → ${fresh.length} (${sel})`);
    };
    stopChurn = g.core.onChurn(heal, settle);
    g.watch.selector = sel;
    console.log(`watch: armed on "${sel}" — glom.watch.stop() to disarm`);
    return sel;
  };
  g.watch.stop = () => { stopChurn?.(); stopChurn = null; };
})();

/* ══ mods/tap.js ════════════════════════════════════════════════════ */

// console/mods/tap.js — capture fetch/XHR responses as they fly by. The DOM
// is a lossy rendering of data that arrives as JSON; tap watches the wire
// instead. Works when the API speaks JSON or text (nearly always); it sees
// what's on the wire, so a payload the page decrypts client-side arrives
// as-is. Standalone (no base.js dependency).
//
//   tap()             arm, capture everything
//   tap(/api/)        arm with a url filter (regex, or string includes)
//   tap.hits          [{n, via, url, method, status, data}]  (data: parsed JSON or text)
//   tap.last          most recent hit
//   tap.find(v)       hits whose url matches v
//   tap.clear()       drop hits;  tap.stop()  unwrap fetch/XHR, keep hits
//
//   await tap.replay(0, {page: 7})               refetch hit 0 with mutated
//                                                query params; returns parsed data
//   await tap.walk(0, {param: 'page', to: 40})   walk a param across a range:
//                                                paginate the API without
//                                                scrolling; stops early when
//                                                `until(data)` (default: empty
//                                                array) says the well is dry
//
// Each capture also dispatches window CustomEvent 'tap' ({detail: hit}) for
// live consumers (e.g. the deck). Replays go through window.fetch, so an
// armed tap records them as new hits.
(() => {
  let armed = null;
  const hits = [];
  // Duck-typed regex check: instanceof fails cross-realm (console vs page
  // frame), and String.includes throws on a regex rather than coercing it.
  const isRe = f => !!f && typeof f === 'object' && typeof f.test === 'function';
  const matches = (url, f) => !f || (isRe(f) ? f.test(url) : String(url).includes(f));
  const parse = (body, ct) => {
    if (typeof body !== 'string') return body;
    if (/json/.test(ct || '') || /^\s*[\[{]/.test(body)) { try { return JSON.parse(body); } catch {} }
    return body;
  };
  const push = hit => {
    hit.n = hits.length;
    hits.push(hit);
    window.dispatchEvent(new CustomEvent('tap', { detail: hit }));
    console.log(`tap[${hit.n}] ${hit.method} ${hit.status} ${hit.url}`);
  };

  const tap = filter => {
    tap.filter = filter;
    if (armed) { console.log('tap: filter updated'); return tap; }

    const origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (origFetch) {
      const isReq = v => typeof Request !== 'undefined' && v instanceof Request;
      window.fetch = async (...args) => {
        const res = await origFetch(...args);
        try {
          const url = isReq(args[0]) ? args[0].url : String(args[0]);
          if (matches(url, tap.filter)) {
            const method = ((isReq(args[0]) ? args[0].method : args[1]?.method) || 'GET').toUpperCase();
            res.clone().text()
              .then(t => push({ via: 'fetch', url, method, status: res.status, data: parse(t, res.headers?.get?.('content-type')) }))
              .catch(() => {});
          }
        } catch {}
        return res;
      };
    }

    const XP = window.XMLHttpRequest?.prototype;
    const origOpen = XP?.open, origSend = XP?.send;
    if (XP) {
      XP.open = function (method, url, ...rest) {
        this.__tap = { method: String(method).toUpperCase(), url: String(url) };
        return origOpen.call(this, method, url, ...rest);
      };
      XP.send = function (...a) {
        this.addEventListener('load', () => {
          const t = this.__tap;
          if (!t || !matches(t.url, tap.filter)) return;
          const body = (this.responseType === '' || this.responseType === 'text') ? this.responseText : this.response;
          push({ via: 'xhr', url: t.url, method: t.method, status: this.status, data: parse(body, this.getResponseHeader?.('content-type')) });
        });
        return origSend.apply(this, a);
      };
    }

    armed = { origFetch, XP, origOpen, origSend };
    console.log(`tap: armed${tap.filter ? ` (filter: ${tap.filter})` : ''} — tap.hits, tap.stop()`);
    return tap;
  };

  tap.hits = hits;
  Object.defineProperty(tap, 'last', { get: () => hits[hits.length - 1] });
  tap.find = v => hits.filter(h => matches(h.url, v));
  tap.clear = () => { hits.length = 0; return tap; };
  tap.stop = () => {
    if (!armed) { console.warn('tap: not armed'); return tap; }
    if (armed.origFetch) window.fetch = armed.origFetch;
    if (armed.XP) { armed.XP.open = armed.origOpen; armed.XP.send = armed.origSend; }
    armed = null;
    console.log(`tap: stopped — ${hits.length} hits kept`);
    return tap;
  };
  // A captured hit is a request template. GETs only — tap doesn't record
  // request bodies.
  tap.replay = async (h, params = {}) => {
    const hit = typeof h === 'number' ? hits[h] : h;
    if (!hit) { console.warn('tap.replay: no such hit'); return null; }
    const u = new URL(hit.url, (typeof location !== 'undefined' && location.href) || 'http://replay.local/');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    const res = await window.fetch(u.toString(), hit.method && hit.method !== 'GET' ? { method: hit.method } : undefined);
    const body = await res.text();
    return parse(body, res.headers?.get?.('content-type'));
  };

  tap.walk = async (h, { param, from = 1, to = from + 19, step = 1, delay = 250, until } = {}) => {
    if (!param) { console.warn('tap.walk: {param} is required'); return []; }
    const dry = until ?? (d => d == null || (Array.isArray(d) && d.length === 0));
    const out = [];
    for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
      const data = await tap.replay(h, { [param]: v });
      if (dry(data)) { console.log(`tap.walk: dry at ${param}=${v}`); break; }
      out.push({ [param]: v, data });
      if (delay) await new Promise(r => setTimeout(r, delay));
    }
    console.log(`tap.walk: ${out.length} pages collected`);
    return out;
  };

  window.tap = tap;
})();

/* ══ mods/veins.js ══════════════════════════════════════════════════ */

// console/mods/veins.js — vein-to-skin matching: join captured API payloads
// (the vein) to the rendered page (the skin). Flattens JSON to leaf fields,
// matches leaf values against elements' own text, and reports which fields
// actually feed the screen — so you learn "the column I'm scraping is
// bills[].status" and can stop scraping the DOM for that site. Requires
// console/base.js (glom, ea); pairs with mods/tap.js (uses tap.hits when no
// data is passed).
//
//   glom.veins()          join every tap.hits payload against the working set
//                         (or the whole page if the set is empty)
//   glom.veins(data)      join an explicit object/array instead
//   glom.veins.grab(i)    adopt field i's matched elements as the working set
//
// Fields rank by coverage (distinct values matched / distinct values seen):
// a field whose every value lands somewhere on screen is a confirmed vein.
// Matching is exact on whitespace-cleaned own text, with a containment
// fallback for values of 4+ characters.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/veins: base.js + mods/core.js must load first');
  const { SCOPE, clean, own } = g.core;

  const flatten = (data, base = '', out = []) => {
    if (data == null) return out;
    if (Array.isArray(data)) { for (const v of data) flatten(v, base + '[]', out); return out; }
    if (typeof data === 'object') { for (const [k, v] of Object.entries(data)) flatten(v, base ? `${base}.${k}` : k, out); return out; }
    out.push({ field: base || '.', value: clean(String(data)) });
    return out;
  };

  let fields = [];
  g.veins = data => {
    const sources = data !== undefined ? [data] : (window.tap?.hits ?? []).map(h => h.data);
    if (!sources.length) { console.warn('veins: nothing to join — arm tap() first, or pass data'); return []; }
    const leaves = sources.flatMap(d => flatten(d));

    const els = g.get().length ? g.get() : ea(SCOPE);
    const byText = new Map();
    for (const n of els) {
      const t = own(n);
      if (!t) continue;
      if (!byText.has(t)) byText.set(t, []);
      byText.get(t).push(n);
    }

    const agg = new Map();
    for (const { field, value } of leaves) {
      if (!agg.has(field)) agg.set(field, { field, seen: new Set(), hit: new Set(), els: new Set() });
      const a = agg.get(field);
      a.seen.add(value);
      if (value.length < 2) continue;
      const exact = byText.get(value);
      if (exact) { a.hit.add(value); exact.forEach(n => a.els.add(n)); continue; }
      if (value.length >= 4) {
        for (const [t, ns] of byText) if (t.includes(value)) { a.hit.add(value); ns.forEach(n => a.els.add(n)); }
      }
    }

    fields = [...agg.values()]
      .filter(a => a.hit.size)
      .map(a => ({ field: a.field, coverage: `${a.hit.size}/${a.seen.size}`, ratio: a.hit.size / a.seen.size, count: a.els.size, sample: [...a.hit][0], els: [...a.els] }))
      .sort((a, b) => b.ratio - a.ratio || b.count - a.count);
    console.table(fields.map(({ els, ratio, ...row }, i) => ({ i, ...row })));
    console.log('veins: glom.veins.grab(i) adopts a field’s elements');
    return fields;
  };
  g.veins.grab = i => fields[i] ? g(fields[i].els) : (console.warn(`veins: no field ${i} — run glom.veins() first`), []);
})();

/* ══ mods/columns.js ════════════════════════════════════════════════ */

// console/mods/columns.js — derive a table from a repeating working set:
// pandas.read_html generalized to things that aren't <table>. Requires
// console/base.js (glom).
//
//   glom.columns()              one row object per member; console.table + return
//   glom.columns({all: true})   keep constant (boilerplate) columns too
//   packTable(glom.columns())   → columnar gzip+base64 on the clipboard
//
// For each member, leaf texts are collected keyed by the member-relative
// indexed tag path (td[2], div/span); links add an <path>@href column.
// Columns whose value never varies across members are boilerplate and drop
// (unless {all}); if nothing varies, everything is kept.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/columns: base.js + mods/core.js must load first');
  const { own } = g.core;

  const relPath = (n, root) => {
    const segs = [];
    for (let c = n; c && c !== root; c = c.parentElement) {
      let t = c.tagName.toLowerCase();
      const same = [...(c.parentElement?.children || [])].filter(x => x.tagName === c.tagName);
      if (same.length > 1) t += `[${same.indexOf(c) + 1}]`;
      segs.unshift(t);
    }
    return segs.join('/') || '.';
  };

  g.columns = ({ all = false } = {}) => {
    const members = g.get();
    if (!members.length) { console.warn('columns: empty set'); return []; }
    const rows = members.map(m => {
      const rec = {};
      const walk = n => {
        const t = own(n);
        if (t) { const k = relPath(n, m); rec[k] = rec[k] ? `${rec[k]} ${t}` : t; }
        if (n.tagName === 'A' && n.getAttribute('href')) rec[`${relPath(n, m)}@href`] = n.getAttribute('href');
        for (const c of n.children) walk(c);
      };
      walk(m);
      return rec;
    });
    const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const varying = keys.filter(k => new Set(rows.map(r => r[k] ?? '')).size > 1);
    const keep = all || !varying.length ? keys : varying;
    const out = rows.map(r => Object.fromEntries(keep.map(k => [k, r[k] ?? ''])));
    console.table(out);
    return out;
  };
})();

/* ══ mods/harvest.js ════════════════════════════════════════════════ */

// console/mods/harvest.js — sweep a virtualized or lazy list. Virtualized
// grids keep only the visible rows in the DOM, so any one-shot grab is
// partial; harvest scrolls, waits, re-collects, and accumulates *records*
// (text/html snapshots that survive element destruction) until the page runs
// dry. Requires console/base.js (glom, ea).
//
//   await glom.harvest()                      match via the set's tag-path fingerprint
//   await glom.harvest({selector: '.row'})    explicit matcher (glom.infer() output fits)
//   await glom.harvest({scroll, settle, dry}) custom scroller / wait ms / dry rounds
//
// Returns [{key, text, html, el}] — el is the last-seen node and may be dead
// by the time you look. Records dedupe by fingerprint + text, so identical
// repeated rows collapse to one.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/harvest: base.js + mods/core.js must load first');
  const { SCOPE, clean, upath, sweep } = g.core;

  g.harvest = async ({ selector, scroll, settle = 350, dry = 3, max = 200 } = {}) => {
    let match;
    if (selector) match = () => [...document.querySelectorAll(selector)];
    else {
      const seed = g.get();
      if (!seed.length) { console.warn('harvest: empty set and no selector'); return []; }
      const keys = new Set(seed.map(upath));
      match = () => ea(SCOPE).filter(n => keys.has(upath(n)));
    }

    const seen = new Map();
    const collect = () => {
      let fresh = 0;
      for (const el of match()) {
        const text = clean(el.textContent), key = `${upath(el)}|${text}`;
        if (!seen.has(key)) { seen.set(key, { key, text, html: el.outerHTML, el }); fresh++; }
      }
      return fresh;
    };

    const { rounds, hitMax } = await sweep(collect, { scroll, settle, dry, max });
    const out = [...seen.values()];
    console.log(`harvest: ${out.length} records in ${rounds} scrolls${hitMax ? ' (hit max — raise {max})' : ''}`);
    return out;
  };
})();

/* ══ mods/scan.js ═══════════════════════════════════════════════════ */

// console/mods/scan.js — durable capture over time. Every other mod takes one
// snapshot of the DOM as it is now; scan adds the axis they lack, which is
// time: define one or more streams (a selector + a format), then trigger a
// pass on an interval, on DOM churn, or across a scroll, and each pass keeps
// only the records whose key it hasn't seen (the fresh diff) and persists them
// to IndexedDB. Poll-scroll capture is scan.sweep(): scroll to reveal what a
// virtualizer hides, capture the fresh rows, repeat until the page runs dry.
//
// The store is raw IndexedDB (no import, so the mod stays a single paste), and
// because idb-nav / data-shelf read every database on the origin, whatever
// scan writes is browsable there for free.
//
//   glom('msg'); glom.grow(); glom.scan.define('rows')   seed a stream from the set
//   glom.scan.define('rows', {selector, format})         or define it explicitly
//   glom.scan.tick()                                 one capture pass now
//   glom.scan.watch()                                capture on DOM churn
//   await glom.scan.sweep()                          scroll-until-dry capture
//   glom.scan.start(ms) / glom.scan.stop()           crude interval fallback
//   glom.scan.grab('rows')                           adopt a stream back into the set
//   glom.scan.data('rows')                           the in-memory records
//   glom.scan.join('a', 'b')                         merge two streams
//   glom.scan.highlight()                            outline captured elements
//   await glom.scan.chat()                           preset: sidebar ↔ articles
//
// This is a glom citizen, not a bystander parked in the namespace: a bare
// define() reads the working set (infers the selector, snapshots each member),
// and grab() writes captured elements back to it, so scan is the persistence
// verb on the find → dance → grab loop. A stream's format(el) returns
// { key, ... }; key is what dedups a record across passes, so its stability (a
// href, a content hash, an id, not a shifting ordinal) is where capture
// quality lives. Requires base.js + core.js (mods/infer.js for set-seeding).
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/scan: base.js + mods/core.js must load first');
  const { clean, HUES, docOrder, sweep, onChurn } = g.core;
  const now = () => new Date().toISOString();
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  // Default keyer/format when a stream is seeded from the working set instead
  // of a hand-written format: a stable key (id, own or descendant href, else a
  // text hash) plus a text/html snapshot. The same "prefer a durable handle
  // over an ordinal" rule the docs preach, applied automatically.
  const keyOf = el => el.id || el.getAttribute?.('href') || el.querySelector?.('a[href]')?.getAttribute('href') || hash(clean(el.textContent));
  const snapshot = el => ({ key: keyOf(el), text: clean(el.textContent), html: el.outerHTML });

  // raw IndexedDB — one db, one keyPath:'key' store per stream.
  const idb = {
    open: (name, version, upgrade) => new Promise((res, rej) => {
      const r = indexedDB.open(name, version);
      if (upgrade) r.onupgradeneeded = e => upgrade(e.target.result);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }),
    op: (db, store, mode, fn) => new Promise((res, rej) => {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }),
  };

  // gzip through base's single codec (pop.pack/unpack), not a private copy.
  const gzip = { compress: s => window.pop.pack(s), decompress: s => window.pop.unpack(s) };

  const S = { db: null, name: 'glom-scan', stores: {}, timer: null, stopChurn: null };

  // Ensure the db is open and holds `store`; adding a store means a version bump.
  const ensure = async store => {
    if (!S.db) S.db = await idb.open(S.name);
    if ([...S.db.objectStoreNames].includes(store)) return;
    const version = S.db.version + 1;
    S.db.close();
    S.db = await idb.open(S.name, version, db => {
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'key' });
    });
  };

  // Pull a stream's persisted records into memory, decompressing as needed.
  const hydrate = async (name, st) => {
    const raw = (await idb.op(S.db, name, 'readonly', s => s.getAll())) || [];
    st.records = await Promise.all(raw.map(async r =>
      r.compressed ? { ...r, [st.field]: await gzip.decompress(r[st.field]), compressed: false } : r));
  };

  // The fresh diff for one stream: live elements → formatted → minus what we hold.
  const capture = st => {
    const els = [...document.querySelectorAll(st.selector)].filter(st.filter);
    const live = els.map(st.format).filter(Boolean);
    const have = new Set(st.records.map(r => r.key));
    return { els, live, fresh: live.filter(r => r && !have.has(r.key)) };
  };

  const scan = {
    gzip,
    db(name) { if (name) { S.name = name; S.db?.close(); S.db = null; S.stores = {}; return scan; } return S.name; },

    async define(name, { selector, format, filter = () => true, compress = false, field = 'content', hue } = {}) {
      // Seed from the working set: glom/dance/grow to a set, and a bare
      // define() infers the selector (via mods/infer.js) and snapshots each
      // member, the same set-native shortcut watch and harvest take. Pass
      // {selector, format} to override either half.
      selector ??= g.infer ? g.infer()?.selector : null;
      if (!selector) return console.warn('scan.define: pass {selector}, or glom a set (+ load mods/infer.js) to seed one');
      format ??= snapshot;
      await ensure(name);
      const st = S.stores[name] ??= { records: [] };
      Object.assign(st, { selector, format, filter, compress, field, hue });
      await hydrate(name, st);
      console.log(`scan: stream "${name}" armed (${st.records.length} on record)`);
      return scan;
    },

    // One capture pass across every defined stream. Returns the fresh count.
    async tick() {
      let total = 0;
      for (const [name, st] of Object.entries(S.stores)) {
        if (!st.selector) continue;
        for (const r of capture(st).fresh) {
          const stored = st.compress && typeof r[st.field] === 'string'
            ? { ...r, [st.field]: await gzip.compress(r[st.field]), compressed: true }
            : { ...r, compressed: false };
          await idb.op(S.db, name, 'readwrite', s => s.put(stored));
          st.records.push({ ...r, compressed: false });
          total++;
        }
      }
      if (total) { console.log(`scan: +${total} (${scan.counts()})`); scan.highlight(); }
      return total;
    },

    counts: () => Object.entries(S.stores).map(([n, s]) => `${n}: ${s.records.length}`).join(', '),

    // Crude interval trigger — wasteful and it races scroll. Prefer watch/sweep.
    start(ms = 2000) {
      if (S.timer) return console.warn('scan: already running — stop() first');
      scan.tick();
      S.timer = setInterval(() => scan.tick(), ms);
      console.log(`scan: polling every ${ms}ms — scan.stop() to disarm`);
      return scan;
    },
    stop() {
      clearInterval(S.timer); S.timer = null;
      S.stopChurn?.(); S.stopChurn = null;
      return scan;
    },

    // Churn trigger: capture whenever the DOM mutates (debounced). The right
    // default for a live, streaming page — no idle polling, no missed rows.
    watch({ settle = 300 } = {}) {
      scan.stop();
      scan.tick();
      S.stopChurn = onChurn(() => scan.tick(), settle);
      console.log(`scan: watching DOM churn (settle ${settle}ms) — scan.stop() to disarm`);
      return scan;
    },

    // Poll-scroll capture: scroll, settle, capture the fresh rows, repeat until
    // `dry` consecutive rounds surface nothing new. The harvest scroll engine
    // (core.sweep) with a durable sink. Returns total captured this sweep.
    async sweep(opts = {}) {
      const { total, rounds, hitMax } = await sweep(() => scan.tick(), opts);
      console.log(`scan: sweep captured ${total} over ${rounds} scrolls${hitMax ? ' (hit max — raise {max})' : ''}`);
      return total;
    },

    data(name) {
      return name ? [...(S.stores[name]?.records || [])]
        : Object.fromEntries(Object.entries(S.stores).map(([n, s]) => [n, [...s.records]]));
    },

    // Adopt a stream's still-present elements as the working set, so a capture
    // flows back into the dance (census.grab / harvest, but keyed on record).
    grab(name) {
      const names = name ? [name] : Object.keys(S.stores);
      const els = [];
      for (const n of names) {
        const st = S.stores[n];
        if (!st?.selector) continue;
        const have = new Set(st.records.map(r => r.key));
        for (const el of [...document.querySelectorAll(st.selector)].filter(st.filter)) {
          const r = st.format(el);
          if (r && have.has(r.key)) els.push(el);
        }
      }
      return g.set(docOrder(els));
    },

    search(term, name) {
      const t = term.toLowerCase();
      const hit = d => Object.values(d).some(v => typeof v === 'string' && v.toLowerCase().includes(t));
      const targets = name ? { [name]: S.stores[name] } : S.stores;
      return Object.fromEntries(Object.entries(targets).map(([n, s]) => [n, (s?.records || []).filter(hit)]));
    },

    // Left-join two streams into rows; unmatched members of b tail on. Default
    // relation: b's key contains a's key (the sidebar-link ↔ page pattern).
    join(aName, bName, rel = (a, b) => typeof b.key === 'string' && typeof a.key === 'string' && b.key.includes(a.key)) {
      const as = S.stores[aName]?.records || [], bs = S.stores[bName]?.records || [];
      const used = new Set(), rows = [];
      for (const a of as) {
        const b = bs.find(x => rel(a, x));
        if (b) used.add(b.key);
        rows.push({ a, b: b || null, joined: !!b });
      }
      for (const b of bs) if (!used.has(b.key)) rows.push({ a: null, b, joined: false });
      return rows;
    },

    async clear(name, term) {
      scan.stop();
      const targets = name ? { [name]: S.stores[name] } : S.stores;
      for (const [n, st] of Object.entries(targets)) {
        if (!st) continue;
        if (term) {
          const t = term.toLowerCase();
          const doomed = st.records.filter(d => Object.values(d).some(v => typeof v === 'string' && v.toLowerCase().includes(t)));
          st.records = st.records.filter(d => !doomed.includes(d));
          await Promise.all(doomed.map(d => idb.op(S.db, n, 'readwrite', s => s.delete(d.key))));
        } else {
          st.records = [];
          await idb.op(S.db, n, 'readwrite', s => s.clear());
        }
      }
      scan.highlight();
      return scan;
    },

    // Outline the elements each stream has on record, one hue per stream.
    highlight() {
      document.querySelectorAll('[data-scan]').forEach(el => { el.style.outline = ''; el.removeAttribute('data-scan'); });
      Object.entries(S.stores).forEach(([name, st], i) => {
        if (!st.selector) return;
        const have = new Set(st.records.map(r => r.key));
        [...document.querySelectorAll(st.selector)].filter(st.filter).forEach(el => {
          const r = st.format(el);
          if (r && have.has(r.key)) { el.style.outline = `2px solid ${st.hue || HUES[i % HUES.length]}`; el.setAttribute('data-scan', name); }
        });
      });
      return scan;
    },

    // Preset for chat UIs: a sidebar of conversation links (captions) joined to
    // the message bodies on the page (contents, content-hashed so distinct
    // messages persist rather than one blob per URL). A starting template —
    // retarget the selectors to the site in front of you.
    async chat() {
      await scan.define('captions', {
        selector: 'aside a[href]',
        format: a => ({ key: a.getAttribute('href'), caption: clean(a.textContent), firstSeen: now() }),
      });
      await scan.define('contents', {
        selector: 'article', compress: true, field: 'content',
        format: el => { const text = clean(el.textContent); return text ? { key: hash(text), content: el.innerHTML, chars: text.length, capturedAt: now() } : null; },
      });
      console.log('scan: chat preset armed (captions ← aside a[href], contents ← article). scan.watch() to run.');
      return scan;
    },
  };

  g.scan = scan;
})();

/* ══ mods/lasso.js ══════════════════════════════════════════════════ */

// console/mods/lasso.js — drag a rectangle, select what's inside. The
// feature scraping libraries can't have: they don't have a screen. Requires
// console/base.js (glom, ea).
//
//   await glom.lasso()                  non-empty set → spatial refine (keep
//                                       members inside); empty set → discover
//   glom.lasso({mode: 'intersect'})     touching counts (default 'contain')
//
// Esc cancels (set unchanged). Discovery keeps selection roots: contained
// elements whose parent isn't contained, so a tight rectangle around a list
// gets the items, not every span inside them. Zero-size boxes (hidden
// elements, and everything under jsdom's inert layout) are skipped;
// {zero: true} keeps them, which headless tests need.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/lasso: base.js + mods/core.js must load first');
  const { SCOPE } = g.core;

  g.lasso = ({ mode = 'contain', zero = false } = {}) => new Promise(resolve => {
    const doc = document;
    const box = Object.assign(doc.createElement('div'), { id: 'glom-lasso-box' });
    box.style.cssText = 'position:fixed;z-index:2147483647;border:1.5px dashed #f59e0b;background:#f59e0b22;pointer-events:none;display:none';
    const veil = Object.assign(doc.createElement('div'), { id: 'glom-lasso-veil' });
    veil.style.cssText = 'position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:transparent';
    doc.body.append(veil, box);

    let x0 = 0, y0 = 0, dragging = false;
    const frame = e => {
      const x = Math.min(x0, e.clientX), y = Math.min(y0, e.clientY);
      const w = Math.abs(e.clientX - x0), h = Math.abs(e.clientY - y0);
      Object.assign(box.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      return { x1: x, y1: y, x2: x + w, y2: y + h };
    };
    const cleanup = () => { veil.remove(); box.remove(); doc.removeEventListener('keydown', onKey, true); };
    const onKey = e => {
      if (e.key !== 'Escape') return;
      cleanup();
      console.log('lasso: cancelled');
      resolve(g.get());
    };

    veil.addEventListener('pointerdown', e => { dragging = true; x0 = e.clientX; y0 = e.clientY; frame(e); });
    veil.addEventListener('pointermove', e => { if (dragging) frame(e); });
    veil.addEventListener('pointerup', e => {
      const r = frame(e);
      cleanup();
      const inside = n => {
        const b = n.getBoundingClientRect();
        if (!zero && (b.width <= 0 || b.height <= 0)) return false;
        return mode === 'intersect'
          ? b.left < r.x2 && b.right > r.x1 && b.top < r.y2 && b.bottom > r.y1
          : b.left >= r.x1 && b.right <= r.x2 && b.top >= r.y1 && b.bottom <= r.y2;
      };
      const cur = g.get();
      let picked;
      if (cur.length) picked = cur.filter(inside);
      else {
        const all = ea(SCOPE).filter(inside), s = new Set(all);
        picked = all.filter(n => !s.has(n.parentElement));
      }
      const res = g.set(picked);
      console.log(`lasso: ${res.length} selected`);
      resolve(res);
    });
    doc.addEventListener('keydown', onKey, true);
    console.log('lasso: drag a rectangle — Esc cancels');
  });
})();

/* ══ mods/census.js ═════════════════════════════════════════════════ */

// console/mods/census.js — ping the page's shape: find and rank the
// repeating structures, mark each in its own hue, and offer handles to grab
// them. Orientation without reading any HTML. Requires console/base.js
// (ea, glom, mark, unionArea).
//
//   census()            top 10 groups (count ≥ 3), marked + console.table
//   census(25, {min:2, mark:false})
//   census.grab(i)      adopt group i as the glom working set
//   census.clear()      remove census marks
//
// Groups by unindexed tag path (html/body/table/tbody/tr). geoReg is
// summary()'s kernel: union area over bounding box — near 1 means the group
// tiles its region like a grid or list; near 0 means scattered or overlapped.
(() => {
  if (!window.ea || !window.glom?.core) return console.warn('mods/census: base.js + mods/core.js must load first');
  const { SCOPE, clean, upath, groupLayer } = window.glom.core;
  const layer = groupLayer('census');

  const census = (top = 10, { min = 3, mark: doMark = true } = {}) => {
    layer.clear();
    const byKey = new Map();
    for (const n of ea(SCOPE)) {
      const k = upath(n);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(n);
    }
    const groups = [...byKey.entries()]
      .filter(([, els]) => els.length >= min)
      .map(([path, els]) => {
        const rects = els.map(n => n.getBoundingClientRect());
        const u = window.unionArea(rects);
        const bb = (Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left))) *
                   (Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)));
        const avgLen = Math.round(els.reduce((a, n) => a + clean(n.textContent).length, 0) / els.length);
        return { path, count: els.length, geoReg: +(u / (bb || 1)).toFixed(3), avgLen, els };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, top);
    layer.mark(groups, doMark);
    console.table(groups.map(({ els, ...row }, i) => ({ i, ...row })));
    console.log('census: census.grab(i) adopts a group; census.clear() unmarks');
    return groups;
  };

  census.grab = layer.grab;
  census.clear = layer.clear;
  window.census = census;
})();

/* ══ mods/templates.js ══════════════════════════════════════════════ */

// console/mods/templates.js — Wring-style template induction over the page:
// group elements whose signatures differ only in slots, so hashy per-instance
// classes (css-1a2b3c, hash-x9) become ${0} slots instead of noise that
// class-intersection (grow) has to discard. Signatures are path-qualified
// (ancestor tags + tag#id + classes), which keeps lookalike components from
// different page regions apart — Wring's surface signatures alone can't.
//
// The bookend-merge engine is adapted from lib/kits/wring.js (generated from
// mehrlander/wring; see archive/wring/ARCHITECTURE.md), trimmed to the
// single-slot + character-refinement path and vendored here so the suite
// stays one self-contained paste. Requires console/base.js (ea, glom, mark).
//
//   glom.templates()            group the working set (whole page if empty),
//                               mark groups in hues, console.table the ranking
//   glom.templates.grab(i)      adopt group i as the working set
//   glom.templates.clear()      unmark
//   glom.templates.group(strings, opts)      the raw engine — any delimited
//                               strings (signatures, urls, log lines)
//   glom.templates.reconstruct(template, slots)   lossless inverse
//
// Ranking is MDL-ish: (members − 1) × literal chars — "which repetition
// matters", not just "which is most numerous".
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/templates: base.js + mods/core.js must load first');
  const { SCOPE, groupLayer } = g.core;

  /* ── engine (adapted from kits/wring.js: bookend merge, single slot) ── */

  const computeBookend = (a, b) => {
    let p = 0;
    const maxP = Math.min(a.length, b.length);
    while (p < maxP && a[p] === b[p]) p++;
    let s = 0;
    const maxS = Math.min(a.length - p, b.length - p);
    while (s < maxS && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return { prefix: a.slice(0, p), suffix: s ? a.slice(a.length - s) : [] };
  };
  const matchesBookend = (segs, prefix, suffix) => {
    if (segs.length < prefix.length + suffix.length) return false;
    for (let i = 0; i < prefix.length; i++) if (segs[i] !== prefix[i]) return false;
    for (let i = 0; i < suffix.length; i++) if (segs[segs.length - 1 - i] !== suffix[suffix.length - 1 - i]) return false;
    return true;
  };
  const lcp = strings => {
    let p = strings[0] ?? '';
    for (const s of strings.slice(1)) {
      let j = 0;
      while (j < p.length && j < s.length && p[j] === s[j]) j++;
      p = p.slice(0, j);
      if (!p) return '';
    }
    return p;
  };
  const lcs = strings => {
    const rev = s => [...s].reverse().join('');
    return rev(lcp(strings.map(rev)));
  };

  // Absorb the slot values' common character prefix/suffix into the template.
  const refineChars = (group, minCharLen = 2) => {
    const vals = group.members.map(m => m.slots[0]);
    if (vals.some(v => v === '')) return;
    let cpre = lcp(vals), csuf = lcs(vals);
    if (cpre.length < minCharLen) cpre = '';
    if (csuf.length < minCharLen) csuf = '';
    const minLen = Math.min(...vals.map(v => v.length));
    if (cpre.length + csuf.length > minLen) {
      csuf = csuf.slice(0, Math.max(0, minLen - cpre.length));
      if (csuf.length < minCharLen) csuf = '';
    }
    if (!cpre && !csuf) return;
    group.template = group.template.replace('${0}', () => `${cpre}\${0}${csuf}`);
    for (const m of group.members) m.slots[0] = m.slots[0].slice(cpre.length, csuf.length ? -csuf.length : undefined);
  };

  const groupStrings = (strings, options = {}) => {
    const { minLiteralChars = 3, minGroupSize = 2, delimiter = '.', strategy = 'specific' } = options;
    const entries = strings.map((s, index) => ({ original: s, index, segs: s.split(delimiter) }));
    const lit = (p, s) => [p.length && p.join(delimiter), s.length && s.join(delimiter)].filter(Boolean).join(delimiter).length;

    const candidates = new Map();
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) {
        const { prefix, suffix } = computeBookend(entries[i].segs, entries[j].segs);
        if (!prefix.length && !suffix.length) continue;
        const key = prefix.join('\x00') + '\x01' + suffix.join('\x00');
        if (!candidates.has(key)) candidates.set(key, { prefix, suffix });
      }
    for (const t of candidates.values())
      t.members = entries.filter(e => matchesBookend(e.segs, t.prefix, t.suffix))
        .map(e => ({ index: e.index, original: e.original, slotSegs: e.segs.slice(t.prefix.length, e.segs.length - t.suffix.length) }));

    const ranked = [...candidates.values()]
      .filter(t => t.members.length >= minGroupSize && lit(t.prefix, t.suffix) >= minLiteralChars);
    ranked.sort(strategy === 'specific'
      ? (a, b) => lit(b.prefix, b.suffix) - lit(a.prefix, a.suffix) || b.members.length - a.members.length
      : (a, b) => (b.members.length - 1) * lit(b.prefix, b.suffix) - (a.members.length - 1) * lit(a.prefix, a.suffix));

    const assigned = new Set(), groups = [];
    for (const t of ranked) {
      const avail = t.members.filter(m => !assigned.has(m.index));
      if (avail.length < minGroupSize) continue;
      avail.forEach(m => assigned.add(m.index));
      const parts = [];
      if (t.prefix.length) parts.push(t.prefix.join(delimiter));
      parts.push('${0}');
      if (t.suffix.length) parts.push(t.suffix.join(delimiter));
      const group = {
        template: parts.join(delimiter),
        members: avail.map(m => ({ original: m.original, slots: [m.slotSegs.join(delimiter)] })),
        score: (avail.length - 1) * lit(t.prefix, t.suffix),
      };
      refineChars(group);
      groups.push(group);
    }
    return { groups, ungrouped: entries.filter(e => !assigned.has(e.index)).map(e => e.original) };
  };

  const reconstruct = (template, slots, delimiter = '.') => {
    let out = template;
    for (let i = slots.length - 1; i >= 0; i--) {
      const marker = '${' + i + '}', val = slots[i];
      if (val === '') {
        if (out.includes(delimiter + marker + delimiter)) out = out.replace(delimiter + marker + delimiter, () => delimiter);
        else if (out.includes(delimiter + marker)) out = out.replace(delimiter + marker, '');
        else if (out.includes(marker + delimiter)) out = out.replace(marker + delimiter, '');
        else out = out.replace(marker, '');
      } else out = out.replace(marker, () => val);
    }
    return out;
  };

  /* ── the glom face: elements → signatures → template groups ── */

  const sigOf = (n, qualify) => {
    const segs = [];
    if (qualify) for (let c = n.parentElement; c && c.nodeType === 1; c = c.parentElement) segs.unshift(c.tagName.toLowerCase());
    segs.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''));
    segs.push(...n.classList);
    return segs.join('.');
  };

  const layer = groupLayer('tmpl');
  const templates = (opts = {}) => {
    const { qualify = true, minGroupSize = 2, top = 12, mark: doMark = true, ...engineOpts } = opts;
    templates.clear();
    const els = g.get().length ? g.get() : ea(SCOPE);
    const bySig = new Map();
    for (const n of els) {
      const s = sigOf(n, qualify);
      if (!bySig.has(s)) bySig.set(s, []);
      bySig.get(s).push(n);
    }
    const res = groupStrings([...bySig.keys()], { minGroupSize: 2, ...engineOpts });

    const out = [];
    for (const grp of res.groups) {
      const members = grp.members.flatMap(m => bySig.get(m.original));
      if (members.length < minGroupSize) continue;
      out.push({
        template: grp.template,
        count: members.length,
        slots: [...new Set(grp.members.map(m => m.slots[0]))].slice(0, 6),
        els: members,
        lit: grp.template.replace(/\$\{\d+\}/g, '').length,
      });
    }
    for (const s of res.ungrouped) {                        // identical-signature families
      const members = bySig.get(s);
      if (members.length >= Math.max(minGroupSize, 2))
        out.push({ template: s, count: members.length, slots: [], els: members, lit: s.length });
    }
    out.sort((a, b) => (b.count - 1) * b.lit - (a.count - 1) * a.lit);
    const groups = layer.mark(out.slice(0, top), doMark);
    console.table(groups.map(({ els, lit, slots, ...row }, i) =>
      ({ i, ...row, slots: slots.join(', '), template: row.template.length > 90 ? '…' + row.template.slice(-89) : row.template })));
    console.log('templates: glom.templates.grab(i) adopts a group; .clear() unmarks');
    return groups;
  };

  templates.grab = layer.grab;
  templates.clear = layer.clear;
  templates.group = groupStrings;
  templates.reconstruct = reconstruct;
  g.templates = templates;
})();

/* ══ mods/sets.js ═══════════════════════════════════════════════════ */

// console/mods/sets.js — named working sets: park one dance, start another,
// zip them later. Requires console/base.js (glom).
//
//   glom.save('rows')     snapshot the current set under a name
//   glom.use('rows')      restore it as the working set (badges return)
//   glom.names()          {name: count}
//   glom.forget('rows')   drop a name;  glom.forget()  drop all
//
// Snapshots hold element references in memory: they survive the console
// session, not a rerender (re-acquire via glom.infer()'s selector when the
// page redraws).
(() => {
  const g = window.glom;
  if (!g) return console.warn('mods/sets: console/base.js must load first');
  const store = new Map();

  g.save = name => {
    const cur = g.get();
    if (!name) { console.warn('save: give it a name'); return cur; }
    store.set(String(name), cur);
    console.log(`save: ${cur.length} → "${name}"`);
    return cur;
  };
  g.use = name => store.has(String(name))
    ? g.set(store.get(String(name)))
    : (console.warn(`use: no set "${name}" — glom.names()`), g.get());
  g.names = () => Object.fromEntries([...store].map(([k, v]) => [k, v.length]));
  g.peek = name => [...(store.get(String(name)) ?? [])];   // read without switching the working set
  g.forget = name => {
    name == null ? store.clear() : store.delete(String(name));
    return g.names();
  };
})();

/* ══ mods/join.js ═══════════════════════════════════════════════════ */

// console/mods/join.js — relational joins over element sets: the spreadsheet
// move that turns label/value scraping into one line. Requires base.js +
// mods/core.js; composes with mods/sets.js (named sets via glom.peek).
//
//   glom.join('labels', 'inputs', 'left-of')   each label paired with the
//                                              input it sits left of
//   glom.join(elsA, 'rows', 'inside')          arrays and names mix freely
//   glom.join(a, b, (x, y) => …)               custom predicate
//
// Relations (a REL b): inside, contains (structural); left-of, right-of,
// above, below, same-row, same-col, near (geometric — real layout only,
// jsdom boxes are all 0×0). When several b's qualify, the nearest by center
// distance wins. Returns [{a, b, aText, bText}]; unmatched a's are dropped
// and counted in the log.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/join: base.js + mods/core.js must load first');
  const { clean } = g.core;

  const R = n => n.getBoundingClientRect();
  const overlapV = (a, b) => a.top < b.bottom && b.top < a.bottom;
  const overlapH = (a, b) => a.left < b.right && b.left < a.right;
  const dist = (a, b) => Math.hypot((a.left + a.right) / 2 - (b.left + b.right) / 2,
                                    (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
  const RELS = {
    inside:     (a, b) => b.contains(a) && a !== b,
    contains:   (a, b) => a.contains(b) && a !== b,
    'left-of':  (a, b) => { const ra = R(a), rb = R(b); return ra.right <= rb.left + 1 && overlapV(ra, rb); },
    'right-of': (a, b) => { const ra = R(a), rb = R(b); return rb.right <= ra.left + 1 && overlapV(ra, rb); },
    above:      (a, b) => { const ra = R(a), rb = R(b); return ra.bottom <= rb.top + 1 && overlapH(ra, rb); },
    below:      (a, b) => { const ra = R(a), rb = R(b); return rb.bottom <= ra.top + 1 && overlapH(ra, rb); },
    'same-row': (a, b) => a !== b && overlapV(R(a), R(b)),
    'same-col': (a, b) => a !== b && overlapH(R(a), R(b)),
    near:       (a, b, px = 100) => a !== b && dist(R(a), R(b)) <= px,
  };

  const resolve = v => typeof v === 'string'
    ? (g.peek ? g.peek(v) : (console.warn('join: named sets need mods/sets.js'), []))
    : [...v].filter(n => n instanceof Element);

  g.join = (a, b, rel = 'inside') => {
    const A = resolve(a), B = resolve(b);
    if (!A.length || !B.length) { console.warn(`join: empty side (a: ${A.length}, b: ${B.length})`); return []; }
    const pred = typeof rel === 'function' ? rel : RELS[rel];
    if (!pred) { console.warn(`join: unknown relation "${rel}" — ${Object.keys(RELS).join(', ')}, or a function`); return []; }

    const pairs = [];
    let unmatched = 0;
    for (const x of A) {
      const hits = B.filter(y => pred(x, y));
      if (!hits.length) { unmatched++; continue; }
      const y = hits.length === 1 ? hits[0]
        : hits.reduce((best, cur) => dist(R(cur), R(x)) < dist(R(best), R(x)) ? cur : best);
      pairs.push({ a: x, b: y, aText: clean(x.textContent).slice(0, 60), bText: clean(y.textContent).slice(0, 60) });
    }
    console.table(pairs.map(({ aText, bText }, i) => ({ i, aText, bText })));
    console.log(`join: ${pairs.length} pairs${unmatched ? `, ${unmatched} unmatched` : ''}`);
    return pairs;
  };
})();

/* ══ mods/semantics.js ══════════════════════════════════════════════ */

// console/mods/semantics.js — grab the structured data pages already carry:
// JSON-LD blocks, microdata items, and og:/twitter: meta tags. Often the
// whole scrape is sitting here, typed and labeled, before any DOM dancing.
// Requires base.js + mods/core.js.
//
//   glom.semantics()      → { jsonld: [...], microdata: [...], meta: {...} }
//
// Microdata items come back as {type, props, el}: props read content/href/src
// attributes before falling back to text, and nested itemscopes keep their
// own props.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/semantics: base.js + mods/core.js must load first');
  const { clean } = g.core;

  g.semantics = () => {
    const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(s => { try { return JSON.parse(s.textContent); } catch { return null; } })
      .filter(Boolean);

    const meta = {};
    for (const m of document.querySelectorAll('meta[property], meta[name]')) {
      const k = m.getAttribute('property') || m.getAttribute('name');
      const v = m.getAttribute('content');
      if (k && v != null && /^(og|twitter|article|fb):/.test(k)) meta[k] = v;
    }

    const microdata = [...document.querySelectorAll('[itemscope]')].map(scope => {
      const props = {};
      for (const el of scope.querySelectorAll('[itemprop]')) {
        const owner = el.hasAttribute('itemscope') ? el.parentElement?.closest('[itemscope]') : el.closest('[itemscope]');
        if (owner !== scope) continue;
        const k = el.getAttribute('itemprop');
        const v = el.getAttribute('content') ?? el.getAttribute('href') ?? el.getAttribute('src') ?? clean(el.textContent);
        if (!(k in props)) props[k] = v;
      }
      return { type: scope.getAttribute('itemtype') || '', props, el: scope };
    });

    console.log(`semantics: ${jsonld.length} JSON-LD, ${microdata.length} microdata items, ${Object.keys(meta).length} social metas`);
    return { jsonld, microdata, meta };
  };
})();

/* ══ mods/deck.js ═══════════════════════════════════════════════════ */

// console/mods/deck.js — a live side-window view of the working set: dense,
// dark, monospace. Immediate visual validation without injecting any UI into
// the host page: the deck is its own window (same-origin about:blank, driven
// directly), so the page's CSS can't touch it and a rerender can't kill it.
// Requires console/base.js (glom, sig, text).
//
//   glom.deck()          open (or refresh) the deck; subscribes to glom.onSet
//                        so verbs, pick, grow, lasso all show live
//   glom.deck.close()    close and unsubscribe
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/deck: base.js + mods/core.js must load first');
  let win = null, subscribed = false;
  const onSet = () => render();

  const escape = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const render = () => {
    if (!win || win.closed) return;
    const els = g.get();
    const rows = els.map((n, i) => {
      const href = (n.closest?.('a[href]') || n.querySelector?.('a[href]'))?.getAttribute('href') ?? '';
      return `<tr><td>${i}</td><td>${escape(sig.tag(n))}</td><td>${escape(sig.css(n))}</td>` +
             `<td>${escape(text.own.clean(n).slice(0, 120))}</td><td>${escape(href)}</td></tr>`;
    }).join('');
    win.document.body.innerHTML =
      `<h1>glom deck — ${els.length} in set</h1>` +
      `<table><thead><tr><th>#</th><th>tag</th><th>css</th><th>own text</th><th>href</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>`;
  };

  g.deck = () => {
    if (win && !win.closed) { render(); return win; }
    win = window.open('', 'glom-deck', 'width=720,height=520');
    if (!win) { console.warn('deck: popup blocked'); return null; }
    win.document.title = 'glom deck';
    const style = win.document.createElement('style');
    style.textContent =
      'body{background:#0b1220;color:#cbd5e1;font:12px/1.5 ui-monospace,SFMono-Regular,monospace;margin:0;padding:10px}' +
      'h1{font-size:12px;color:#f59e0b;margin:0 0 8px;font-weight:normal}' +
      'table{border-collapse:collapse;width:100%}' +
      'td,th{border-bottom:1px solid #1e293b;padding:2px 8px;text-align:left;vertical-align:top}' +
      'th{color:#64748b;font-weight:normal}td:first-child{color:#f59e0b}';
    win.document.head.append(style);
    if (!subscribed) { g.onSet.push(onSet); subscribed = true; }
    render();
    return win;
  };
  g.deck.close = () => {
    const i = g.onSet.indexOf(onSet);
    if (i >= 0) g.onSet.splice(i, 1);
    subscribed = false;
    win?.close?.();
    win = null;
  };
})();

/* ══ mods/recipe.js ═════════════════════════════════════════════════ */

// console/mods/recipe.js — the session journal: record every console-level
// glom/q call and print the dance back as a replayable script. The export's
// missing half: columns() gives the data, recipe() gives the provenance —
// how the set was produced. Loads LAST in the suite so it can wrap the verbs
// every other mod has installed. Requires base.js + mods/core.js.
//
//   glom.recipe()         print (and return) the trail as one paste-able script
//   glom.recipe.trail     the raw entries
//   glom.recipe.clear()
//
// Serialization is honest: strings/numbers/regexes/functions replay verbatim;
// element arguments (from pick, lasso, census.grab…) can't travel through
// text and appear as /* elements */ placeholders — replace them with a
// selector (glom.infer()) when hardening a recipe.
(() => {
  const g = window.glom;
  if (!g?.core) return console.warn('mods/recipe: base.js + mods/core.js must load first');

  const trail = [];
  const show = v =>
    v === undefined ? '' :
    typeof v === 'string' ? JSON.stringify(v) :
    typeof v === 'number' || typeof v === 'boolean' ? String(v) :
    (typeof v === 'object' && v && typeof v.test === 'function' && typeof v.source === 'string') ? String(v) :  // regex, cross-realm safe
    typeof v === 'function' ? v.toString() :
    v instanceof Element || (Array.isArray(v) && v.some(x => x instanceof Element)) ? '/* elements */' :
    (() => { try { return JSON.stringify(v) ?? '/* value */'; } catch { return '/* elements */'; } })();
  const record = (name, args) => trail.push(`${name}(${[...args].map(show).join(', ')})`);

  // Wrap the replayable ops in place: mods hold the same glom object, so a
  // wrapped method is seen everywhere; sub-properties (watch.stop, pick.done,
  // veins.grab…) ride along via Object.assign.
  const OPS = ['up', 'down', 'downAll', 'over', 'keep', 'drop', 'undo', 'clear',
               'grow', 'alike', 'save', 'use', 'forget', 'lasso', 'harvest',
               'columns', 'infer', 'watch', 'veins', 'templates', 'semantics', 'join'];
  for (const k of OPS) {
    const fn = g[k];
    if (typeof fn !== 'function') continue;
    const wrapped = function (...args) { record(`glom.${k}`, args); return fn.apply(this, args); };
    Object.assign(wrapped, fn);
    g[k] = wrapped;
  }

  // The glom(...) call itself: swap in a recording facade that shares every
  // property (same references) with the original.
  const G = g;
  const facade = function (...args) { record('glom', args); return G(...args); };
  Object.assign(facade, G);
  window.glom = facade;

  if (window.q) {
    const Q = window.q;
    window.q = (...args) => { record('q', args); return Q(...args); };
  }

  const recipe = () => {
    const script = trail.join(';\n') + (trail.length ? ';' : '');
    console.log(script || 'recipe: empty — do something first');
    return script;
  };
  recipe.trail = trail;
  recipe.clear = () => { trail.length = 0; };
  G.recipe = recipe;
  facade.recipe = recipe;
})();

console.style?.(console.formatter?.('gray;italic', 'mods'), console.formatter?.('#345', 'core, verbs, query, grow, pick, infer, watch, tap, veins, columns, harvest, scan, lasso, census, templates, sets, join, semantics, deck, recipe'));
