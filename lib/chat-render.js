// chat-render.js — chat transcript renderer: markdown in, readable
// conversation out, with fenced code blocks promoted to live artifacts.
//
// Assistant output is markdown, because it is. A user turn is not: it is
// whatever someone typed or pasted into a chat box, so it renders as plain
// text, truncated with an expander (see "raw turns" below). Pass
// `raw: true|false` to override the split for a turn.
//
// Sibling to vanilla-demo.js: a framework-free, DOM-rendering module loaded
// via gh.load. Depends on swipe-deck.js for the deck and the fullscreen
// takeover (the house swipe format, shared with any other page that pages
// through cards) and on kits/proof.js for sandboxed Render/Run frames
// (load both first), on Tailwind + daisyUI + Phosphor on the host page for
// styling, and on the typography CSS for prose (see pages/chat-results.html
// for the combine link). marked loads lazily via ready(); CM6 and Tabulator
// load only when a block's Edit or Table affordance is used.
//
//   await chatRender.ready();                    // loads marked, once
//   chatRender.parse(md)          -> [{role, md}]    // house-format splitter
//   chatRender.exchanges(msgs)    -> [[msg]]     // the deck's slide grouping
//   chatRender.markdown(md, o?)   -> element     // prose + block artifacts
//   chatRender.block({lang,code}, o?) -> element // one fenced-block artifact
//   chatRender.message(msg, o?)   -> element     // one chat turn
//   chatRender.transcript(msgs, o?) -> element   // the full conversation, with a
//                                                // Cards | Scroll toggle (cards default
//                                                // on a phone). msgs: array or house-format
//                                                // string; o.mode forces the view;
//                                                // o.chunk: scroll reveal batch (default 12)
//   chatRender.deck(msgs, o?)     -> element     // just the swipe deck view
//                                                // (one exchange per card; o.height/o.fill)
//   chatRender.openTranscript(msgs, o?) -> {el, close}  // fullscreen takeover: one chat
//                                                // fills the screen as the deck, back/Esc/✕ close
//                                                // (o: {title, provider, date, mode})
//
// The block artifact is the point: every fenced block renders instantly as a
// static <pre> (no editor cost), with a view row that builds on demand —
// viewer.js's registry idea keyed on fence language instead of file
// extension, backed by proof.js's sandboxes instead of Prism:
//
//   lang        views
//   html/svg    Code | Render   (sandboxed iframe; full documents srcdoc'd)
//   json array  Code | Table    (Tabulator, lazy)
//   md          Code | Preview  (marked)
//   other       Code
//
// The chats arrive as regular provider output — they don't know this
// renderer exists — so a view is offered only where an arbitrary block
// stands on its own. Markup fragments do; a js block is usually a piece
// of some larger thing, so js gets no Run view (executing it out of
// context just produces reference errors). Nothing executes on load:
// Render and Table build on first click. Chat code is arbitrary, so
// there is no unsandboxed 'parent' kind here. The Edit pencil always
// lands on the Code view and swaps the static <pre> for a CM6 editor
// (kits/cm6.js, lazy-loaded) — editing is editing the source text, never
// the rendered view (Tabulator stays read-only). Views built from older
// text rebuild from the edited text when re-activated.
//
// opts (markdown/message/transcript pass it through to block):
//   { tw?: bool           // Tailwind in Render frames (default true)
//     daisy?: bool        // daisyUI + Phosphor in Render frames
//     collapse?: number   // px height beyond which a message collapses
//                         // (default 460; 0 disables; ignored on a raw turn)
//     raw?: bool }        // force plain-text (true) or markdown (false)
//                         // rendering, past the per-role default

(() => {
  const ghRef = typeof gh !== 'undefined' ? gh : (window.gh || null);

  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  };
  const esc = s => new Option(String(s ?? '')).innerHTML;
  const copyText = async t => {
    try { await navigator.clipboard.writeText(t); }
    catch { const ta = h('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } finally { ta.remove(); } }
  };

  // ── lazy assets ─────────────────────────────────────────────────────────
  const loadedAssets = new Set();
  const loadAsset = url => {
    if (loadedAssets.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const isCSS = url.endsWith('.css');
      const el = document.createElement(isCSS ? 'link' : 'script');
      if (isCSS) Object.assign(el, { rel: 'stylesheet', href: url });
      else Object.assign(el, { src: url });
      el.onload = () => { loadedAssets.add(url); resolve(); };
      el.onerror = () => reject(new Error(`Load failed: ${url}`));
      document.head.appendChild(el);
    });
  };

  let readyPromise = null;
  const ready = () => readyPromise || (readyPromise =
    window.marked ? Promise.resolve() : loadAsset('https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js'));

  const needCm6 = async () => {
    if (!window.cm6 && ghRef) await ghRef.load('kits/cm6.js');
    if (!window.cm6) throw new Error('kits/cm6.js not available');
  };
  const needTabulator = async () => {
    await loadAsset('https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator_simple.min.css');
    await loadAsset('https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js');
  };

  // ── small shared UI bits ────────────────────────────────────────────────
  const iconBtn = (icon, label, onClick) => {
    const b = h('button', { class: 'btn btn-ghost btn-xs gap-1 font-mono text-[10px] opacity-60 hover:opacity-100' });
    const ic = h('i', { class: `ph ${icon} text-[13px]` });
    const tx = h('span', {}, label);
    b.append(ic, tx);
    b.addEventListener('click', () => onClick({ ic, tx }));
    return b;
  };
  const copyBtn = getText => iconBtn('ph-copy', 'Copy', async ({ ic, tx }) => {
    await copyText(getText());
    ic.className = 'ph ph-check text-[13px]'; tx.textContent = 'Copied';
    setTimeout(() => { ic.className = 'ph ph-copy text-[13px]'; tx.textContent = 'Copy'; }, 1300);
  });

  const proseClass = 'prose prose-sm max-w-none prose-pre:bg-base-200 prose-pre:text-base-content';
  const prose = md => h('div', { class: proseClass, html: marked.parse(md) });

  // ── block views — viewer.js's registry shape, keyed on fence language ──
  const isFullDoc = code => /^\s*(<!doctype|<html)/i.test(code);
  const jsonRows = code => {
    try { const v = JSON.parse(code); return Array.isArray(v) && v.length && typeof v[0] === 'object' ? v : null; }
    catch { return null; }
  };

  const blockViews = [
    {
      id: 'render', label: 'Render', icon: 'ph-eye',
      test: b => ['html', 'svg', 'xml'].includes(b.lang),
      build(host, getCode, o) {
        const frame = h('iframe', { class: 'w-full block bg-base-100 rounded-box border border-base-300', sandbox: 'allow-scripts', style: 'height:48px' });
        addEventListener('message', e => {
          if (e.source === frame.contentWindow && e.data && typeof e.data.__h === 'number')
            frame.style.height = Math.min(720, Math.max(40, e.data.__h + 2)) + 'px';
        });
        const build = () => {
          const c = getCode();
          if (isFullDoc(c)) {
            // A complete document renders as-is; splice the reporter in for
            // height, else fall back to a fixed viewport.
            if (/<\/body>/i.test(c)) frame.srcdoc = c.replace(/<\/body>/i, proof.reporter + '</body>');
            else { frame.srcdoc = c; frame.style.height = '320px'; }
          } else {
            frame.srcdoc = proof.doc('render', c, { tw: o.tw !== false, daisy: o.daisy });
          }
        };
        const bar = h('div', { class: 'flex justify-end' }, iconBtn('ph-arrow-clockwise', 'Refresh', build));
        host.append(frame, bar);
        build();
      },
    },
    {
      id: 'table', label: 'Table', icon: 'ph-table',
      test: b => b.lang === 'json' && !!jsonRows(b.code),
      async build(host, getCode) {
        await needTabulator();
        const target = h('div', { class: 'rounded-box border border-base-300 overflow-hidden' });
        host.append(target);
        const rows = jsonRows(getCode());
        if (!rows) { target.replaceWith(h('div', { class: 'text-xs opacity-60 p-2' }, 'Not a JSON array of objects.')); return; }
        new Tabulator(target, {
          data: rows, autoColumns: true, layout: 'fitDataFill',
          height: Math.min(420, 40 + rows.length * 32) + 'px',
        });
      },
    },
    {
      id: 'preview', label: 'Preview', icon: 'ph-article',
      test: b => ['md', 'markdown'].includes(b.lang),
      build(host, getCode) {
        host.append(h('div', { class: proseClass + ' rounded-box border border-base-300 bg-base-100 px-4 py-3', html: marked.parse(getCode()) }));
      },
    },
  ];

  const COLLAPSE_LINES = 24;

  function block(spec, o = {}) {
    const lang = String(spec.lang || '').toLowerCase().trim().split(/\s+/)[0];
    const b = { lang, code: spec.code };
    const views = blockViews.filter(v => v.test(b));

    const card = h('div', { class: 'rounded-box overflow-hidden bg-base-100 border border-base-300 not-prose my-3' });

    let ed = null;
    const getCode = () => ed ? ed.getValue() : b.code;
    let codeVersion = 0;          // bumped on edit; stale panes rebuild on re-activate
    const builtVersion = {};

    // static code view: instant, no editor cost; long blocks start collapsed
    const pre = h('pre', { class: 'm-0 px-3 py-2.5 overflow-auto text-[11.5px] leading-5 font-mono whitespace-pre text-base-content bg-base-100', html: esc(b.code) });
    const codeHost = h('div', { class: 'relative' }, pre);
    const lines = (b.code.match(/\n/g) || []).length + 1;
    if (lines > COLLAPSE_LINES) {
      pre.style.maxHeight = '20rem';
      const fade = h('div', { class: 'absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-base-100 to-transparent flex items-end justify-center pb-1.5' });
      const more = h('button', { class: 'btn btn-xs btn-ghost bg-base-100/90 border border-base-300 font-mono text-[10px]' }, `Show all ${lines} lines`);
      more.addEventListener('click', () => { pre.style.maxHeight = 'none'; fade.remove(); });
      fade.append(more);
      codeHost.append(fade);
    }

    // Edit means "edit the source text", so it always lands on the Code
    // view (clicking it from Table/Render would otherwise mount the editor
    // into a hidden pane). The editor mounts detached and swaps in only on
    // success, so a failed CM6 load leaves the static <pre> intact.
    const editBtn = iconBtn('ph-pencil-simple', 'Edit', async ({ tx }) => {
      if (ed) { activate('code'); return; }
      tx.textContent = '…';
      await activate('code');
      try {
        await needCm6();
        const host = h('div', { class: 'px-1 py-1' });
        ed = await cm6.create(host, {
          value: b.code,
          language: lang === 'js' || lang === 'javascript' ? 'js' : lang === 'html' ? 'html' : 'plain',
          wrap: true, fontSize: 12,
          onChange: () => { codeVersion++; },
        });
        codeHost.replaceChildren(host);
        editBtn.remove();
      } catch (e) { tx.textContent = 'Edit'; console.warn('[chat-render] editor unavailable:', e.message); }
    });

    // header: language tag, view tabs, actions
    const langTag = h('div', { class: 'flex items-center gap-1.5 font-mono text-[9.5px] opacity-50' },
      h('span', { class: 'inline-block w-1.5 h-1.5 bg-base-content/30 rounded-sm' }),
      h('span', {}, lang || 'text'));
    const tabs = h('div', { class: 'flex items-center gap-0.5' });
    const actions = h('div', { class: 'flex items-center' }, copyBtn(getCode), editBtn);
    const bar = h('div', { class: 'flex items-center justify-between gap-2 bg-base-200/60 pl-2.5 pr-1 py-0.5 border-b border-base-300' },
      langTag, h('div', { class: 'flex items-center gap-1' }, tabs, actions));

    const body = h('div', {});
    body.append(codeHost);

    // view switching: Code is the static host; others build on demand and
    // rebuild if the source was edited since they were last built
    const panes = { code: codeHost };
    const tabBtns = {};
    const activate = async id => {
      for (const [vid, btn] of Object.entries(tabBtns))
        btn.className = 'btn btn-ghost btn-xs gap-1 font-mono text-[10px] ' + (vid === id ? 'opacity-100 bg-base-300/50' : 'opacity-50 hover:opacity-100');
      if (panes[id] && id !== 'code' && builtVersion[id] !== codeVersion) {
        panes[id].remove();
        delete panes[id];
      }
      if (!panes[id]) {
        builtVersion[id] = codeVersion;
        const v = blockViews.find(x => x.id === id);
        const pane = h('div', { class: 'p-2 bg-base-200/40 space-y-1' });
        panes[id] = pane;
        body.append(pane);
        await v.build(pane, getCode, o);
      }
      for (const [pid, el] of Object.entries(panes)) el.style.display = pid === id ? '' : 'none';
    };
    if (views.length) {
      const mkTab = (id, label, icon) => {
        const btn = h('button', { class: 'btn btn-ghost btn-xs gap-1 font-mono text-[10px] opacity-50' },
          h('i', { class: `ph ${icon} text-[12px]` }), h('span', {}, label));
        btn.addEventListener('click', () => activate(id));
        tabBtns[id] = btn;
        tabs.append(btn);
      };
      mkTab('code', 'Code', 'ph-code');
      views.forEach(v => mkTab(v.id, v.label, v.icon));
      activate('code');
    }

    card.append(bar, body);
    return card;
  }

  // ── markdown → prose runs + block artifacts ─────────────────────────────
  function markdown(md, o = {}) {
    const tokens = marked.lexer(String(md ?? ''));
    const wrap = h('div', {});
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const seg = Object.assign(run, { links: tokens.links });
      wrap.append(h('div', { class: proseClass, html: marked.parser(seg) }));
      run = [];
    };
    for (const tok of tokens) {
      if (tok.type === 'code') { flush(); wrap.append(block({ lang: tok.lang, code: tok.text }, o)); }
      else run.push(tok);
    }
    flush();
    return wrap;
  }

  // ── raw turns: what was typed, shown as typed ───────────────────────────
  // A user turn is input someone typed into a chat box, not a markdown
  // document, so it renders as text and nothing else. Interpreting it does
  // damage both ways: it invents structure that was never there and loses the
  // structure that was. Measured on the 318 KB pasted prompt in
  // chat-histories' webi-drs-data envelope, marked found 187 indented code
  // blocks inside one continuous Power Query script (the paste contains no
  // fenced block at all), which became 187 artifact cards carrying 448
  // buttons; a pasted `<Mashup …>` header became a raw html token on an
  // innerHTML path with no sanitizer in front of it. textContent is escaping
  // by construction, and a paste has no syntax worth highlighting anyway.
  //
  // Size is the other half. The reason to open a chat with a huge paste in it
  // is nearly always to read what came back, so a raw turn opens as a short
  // preview and expands into its own bounded scroller: the reply stays one
  // flick away instead of sitting past 130,000 pixels of dump.
  const RAW_INLINE = 2000;    // chars: at or below this, no chrome at all
  const RAW_PREVIEW = 1400;   // chars shown collapsed
  const RAW_SEGMENT = 400;    // lines per pane once expanded
  const isRawRole = role => role === 'user';

  // Wrapping is behavior, not decoration: a paste holds lines far wider than a
  // phone, and a `<pre>` that does not wrap scrolls sideways forever. It goes
  // in the style attribute rather than in Tailwind classes so it holds even
  // where the host page's CSS has not loaded.
  const rawPre = text => {
    const pre = h('pre', {
      class: 'not-prose m-0 font-mono text-[12.5px] leading-[1.55] text-base-content/90',
      style: 'white-space:pre-wrap;overflow-wrap:anywhere;margin:0',
    });
    pre.textContent = text;
    return pre;
  };

  // Expanded text goes in as panes rather than one node, each pane skipping
  // layout and paint while off screen. Nothing is removed from the DOM, so
  // find-in-page still reaches every pane and there is no height estimation
  // or node recycling to get wrong — the two things that make real
  // virtualization fiddly on variable-height content.
  const rawPanes = text => {
    const lines = text.split('\n');
    const frag = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i += RAW_SEGMENT) {
      const chunk = lines.slice(i, i + RAW_SEGMENT);
      const pane = rawPre(chunk.join('\n'));
      pane.style.contentVisibility = 'auto';
      pane.style.containIntrinsicSize = `auto ${chunk.length * 20}px`;
      frag.append(pane);
    }
    return frag;
  };

  // Cut on a line boundary when there is one in reach, so the preview does not
  // end mid-token, then squeeze runs of blank lines. A paste tends to be full
  // of them (this one carries 4,167 in 8,846 lines), and left alone they spend
  // the preview's whole visible height on nothing: the reader gets the first
  // two paragraphs and a field of white where the rest of the signal should
  // be. Condensing is for the preview only. The expanded text is verbatim.
  const rawCut = text => {
    const slice = text.slice(0, RAW_PREVIEW);
    const nl = slice.lastIndexOf('\n');
    return (nl > RAW_PREVIEW / 2 ? slice.slice(0, nl) : slice)
      .replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  };

  function rawBody(md, o = {}) {
    const text = String(md ?? '');
    if (text.length <= RAW_INLINE) return h('div', {}, rawPre(text));

    const host = h('div', { class: 'relative' });
    const lines = (text.match(/\n/g) || []).length + 1;
    const size = text.length >= 1024 ? `${Math.round(text.length / 1024).toLocaleString()} KB` : `${text.length} chars`;
    const stat = h('span', { class: 'font-mono text-[10px] opacity-50' },
      `${size} · ${lines.toLocaleString()} lines · pasted text`);

    let open = false;
    const draw = () => {
      if (open) {
        const box = h('div', {
          class: 'rounded-box border border-base-300 bg-base-100 px-3 py-2 overflow-y-auto overscroll-contain',
          style: 'max-height:min(60vh,32rem)',
        });
        box.append(rawPanes(text));
        host.replaceChildren(box);
      } else {
        // The ellipsis is the honest signal and it always applies, since the
        // slice is short by construction. The fade is only for the case where
        // the slice is also taller than the box, so it does not end up
        // gradient-over-nothing under a short one.
        const pre = rawPre(rawCut(text) + '\n…');
        pre.style.maxHeight = '18rem';
        pre.style.overflow = 'hidden';
        host.replaceChildren(pre);
        requestAnimationFrame(() => {
          if (pre.isConnected && pre.scrollHeight > pre.clientHeight)
            host.append(h('div', { class: 'pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-base-100 to-transparent' }));
        });
      }
    };

    const toggle = iconBtn('ph-arrows-out-simple', 'Show full text', ({ ic, tx }) => {
      open = !open;
      draw();
      ic.className = `ph ${open ? 'ph-arrows-in-simple' : 'ph-arrows-out-simple'} text-[13px]`;
      tx.textContent = open ? 'Collapse' : 'Show full text';
    });

    draw();
    return h('div', {}, host,
      h('div', { class: 'flex items-center gap-2 pt-1.5' }, stat, h('div', { class: 'grow' }), copyBtn(() => text), toggle));
  }

  // Which renderer a turn gets. o.raw forces it either way; by default the
  // role decides, and only the user's own turns are raw.
  const bodyFor = (role, md, o = {}) =>
    (o.raw === undefined ? isRawRole(role) : !!o.raw) ? rawBody(md, o) : markdown(md, o);

  // ── chat turns ──────────────────────────────────────────────────────────
  const ROLES = {
    user:      { label: 'You',       icon: 'ph-user',       edge: 'border-primary/50' },
    assistant: { label: 'Assistant', icon: 'ph-sparkle',    edge: 'border-base-content/25' },
    system:    { label: 'System',    icon: 'ph-gear',       edge: 'border-warning/40' },
    tool:      { label: 'Tool',      icon: 'ph-wrench',     edge: 'border-info/40' },
    meta:      { label: 'Note',      icon: 'ph-note',       edge: 'border-base-300' },
  };
  const normRole = r => {
    const s = String(r || '').toLowerCase();
    // An exact role name wins before the prefix tests below, which are loose by
    // design (`claude-3`, `Human:`). Without this, `meta` matched the `me` in
    // the user alternation and every meta note rendered as a user turn.
    if (s in ROLES) return s;
    if (/^(user|human|you|me)/.test(s)) return 'user';
    if (/^(assistant|ai|claude|chatgpt|gpt|gemini|kimi|model|bot)/.test(s)) return 'assistant';
    if (/^system/.test(s)) return 'system';
    if (/^tool/.test(s)) return 'tool';
    return s in ROLES ? s : 'meta';
  };

  function message(m, o = {}) {
    const role = normRole(m.role);
    const meta = ROLES[role];
    const head = h('div', { class: 'flex items-center gap-1.5 mb-1' },
      h('i', { class: `ph ${meta.icon} text-[12px] opacity-50` }),
      h('span', { class: 'font-mono text-[9.5px] tracking-widest uppercase opacity-50' }, m.label || meta.label),
      m.ts ? h('span', { class: 'font-mono text-[9.5px] opacity-30' }, String(m.ts)) : '');
    const bodyHost = h('div', { class: 'relative' }, bodyFor(role, m.md, o));
    const el = h('div', { class: `border-l-2 ${meta.edge} pl-3.5 py-0.5` }, head, bodyHost);
    if (m.anchor) el.id = m.anchor;

    // collapse pass: runs after the element is in the document. A raw turn
    // carries its own preview and expander, so the height clamp would only
    // stack a second one on top of it.
    const raw = o.raw === undefined ? isRawRole(role) : !!o.raw;
    const limit = raw ? 0 : (o.collapse === undefined ? 460 : o.collapse);
    if (limit) requestAnimationFrame(() => {
      if (!bodyHost.isConnected || bodyHost.scrollHeight <= limit * 1.25) return;
      bodyHost.style.maxHeight = limit + 'px';
      bodyHost.style.overflow = 'hidden';
      const fade = h('div', { class: 'absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-base-200/90 to-transparent flex items-end justify-center pb-1' });
      const more = h('button', { class: 'btn btn-xs bg-base-100 border border-base-300 font-mono text-[10px] shadow-sm' }, 'Show full message');
      more.addEventListener('click', () => { bodyHost.style.maxHeight = 'none'; bodyHost.style.overflow = ''; fade.remove(); });
      fade.append(more);
      bodyHost.append(fade);
    });
    return el;
  }

  // The scroll view: turns stacked vertically. Renders the first `chunk` turns
  // up front and reveals the rest on one click, appended a batch per animation
  // frame, so a long chat no longer builds every turn and every code card
  // synchronously on expand.
  function scrollList(msgs, o = {}) {
    const wrap = h('div', {});
    const list = h('div', { class: 'space-y-4' });
    wrap.append(list);

    const chunk = o.chunk === undefined ? 12 : o.chunk;
    let next = 0;
    const renderBatch = n => {
      const end = n ? Math.min(next + n, msgs.length) : msgs.length;
      for (; next < end; next++) list.append(message({ anchor: `msg-${next + 1}`, ...msgs[next] }, o));
    };
    renderBatch(chunk || msgs.length);

    if (next < msgs.length) {
      const moreBar = h('div', { class: 'pt-1' });
      const btn = h('button', { class: 'btn btn-sm btn-block btn-ghost bg-base-100 border border-base-300 font-mono text-[11px] gap-2' },
        h('i', { class: 'ph ph-arrows-down text-[14px]' }), h('span', {}, `Show ${msgs.length - next} more turns`));
      btn.addEventListener('click', () => {
        btn.replaceChildren(h('span', { class: 'loading loading-spinner loading-xs' }), h('span', {}, 'Rendering…'));
        const step = () => {
          renderBatch(chunk);
          if (next < msgs.length) requestAnimationFrame(step);
          else moreBar.remove();
        };
        requestAnimationFrame(step);
      });
      moreBar.append(btn);
      wrap.append(moreBar);
    }
    return wrap;
  }

  // The full conversation. Accepts a message array or a house-format markdown
  // string (parsed here, so an inline string transcript renders like a fetched
  // one). Owns the header and a Cards | Scroll toggle over the two views: the
  // swipe deck (deck()) and the scroll list (scrollList()). Cards is the
  // default when the device is plausibly a phone (a narrow viewport OR a coarse
  // pointer, so a touch device still defaults to Cards even when a wrapping
  // frame or in-app browser reports a desktop-width layout); Scroll otherwise.
  // Each view builds once and is kept. o.mode ('cards'|'scroll') forces the
  // initial view past detection.
  const isHandheld = () => {
    try { return matchMedia('(max-width: 640px)').matches || matchMedia('(pointer: coarse)').matches; }
    catch { return false; }
  };
  function transcript(messages, o = {}) {
    const msgs = typeof messages === 'string' ? parse(messages) : (messages || []);
    const wrap = h('div', {});
    const seg = h('div', { class: 'join' });
    const label = h('p', { class: 'font-mono text-[9.5px] tracking-widest uppercase opacity-40' },
      `Full transcript · ${msgs.length} message${msgs.length === 1 ? '' : 's'}`);
    const bar = h('div', { class: 'flex items-center justify-between gap-2 mb-2' }, label, seg);
    const body = h('div', {});

    const built = {};
    let mode = (o.mode === 'cards' || o.mode === 'scroll') ? o.mode : (isHandheld() ? 'cards' : 'scroll');
    const render = () => {
      if (!built[mode]) built[mode] = mode === 'cards' ? deck(msgs, o) : scrollList(msgs, o);
      body.replaceChildren(built[mode]);
      for (const b of seg.children)
        b.className = 'btn btn-xs join-item font-mono text-[10px]' +
          (b.dataset.mode === mode ? ' btn-neutral' : ' btn-ghost bg-base-100 border border-base-300');
    };
    for (const [k, v, icon] of [['cards', 'Cards', 'ph-cards-three'], ['scroll', 'Scroll', 'ph-list']]) {
      const b = h('button', { 'data-mode': k, html: `<i class="ph ${icon} text-[12px]"></i> ${v}` });
      b.addEventListener('click', () => { mode = k; render(); });
      seg.append(b);
    }
    wrap.append(bar, body);
    render();
    return wrap;
  }

  // ── swipe deck: one exchange per card, paged ────────────────────────────
  // Group messages into exchanges: a user turn starts a new card; the
  // response turns (assistant/tool/system) and any leading preamble attach to
  // the current card. So a card is a prompt and its answer.
  // A leading meta note is preamble, not an exchange. chat-histories'
  // extract_chat.py opens every transcript with a title/uuid/date header, which
  // parse() returns as a `meta` message; left alone it claims the whole first
  // slide, so the reader opens on ~120 characters of header and the
  // conversation starts on slide 2. Fold it into the first real exchange.
  function exchanges(msgs) {
    const groups = [];
    msgs.forEach(m => {
      if (normRole(m.role) === 'user' || !groups.length) groups.push([]);
      groups[groups.length - 1].push(m);
    });
    if (groups.length > 1 && groups[0].every(m => normRole(m.role) === 'meta'))
      groups.splice(0, 2, [...groups[0], ...groups[1]]);
    return groups;
  }

  // One turn as a chat bubble card: an avatar + role + optional timestamp
  // header over the rendered markdown body. The user turn is tinted and
  // indented from the left; the assistant and others are neutral and indented
  // from the right, so the exchange reads as a conversation.
  function turnCard(m) {
    const role = normRole(m.role);
    const meta = ROLES[role];
    const isUser = role === 'user';
    const avatarCls = isUser ? 'bg-primary text-primary-content'
      : role === 'assistant' ? 'bg-base-content text-base-100'
        : 'bg-base-300 text-base-content';
    const icon = isUser ? 'ph-user' : role === 'assistant' ? 'ph-sparkle' : meta.icon;
    const header = h('div', { class: `flex items-center gap-2 border-b px-4 py-2.5 ${isUser ? 'border-primary/10' : 'border-base-300 bg-base-200/50'}` },
      h('div', { class: `grid size-7 shrink-0 place-items-center rounded-full ${avatarCls}` }, h('i', { class: `ph ${icon} text-sm` })),
      h('div', { class: 'flex-1 text-xs font-semibold' }, m.label || meta.label),
      m.ts ? h('time', { class: 'font-mono text-[11px] text-base-content/40' }, String(m.ts)) : '');
    const body = h('div', { class: 'px-4 py-4 text-[15px] leading-6' }, bodyFor(role, m.md, { ...m._o }));
    return h('article', {
      class: 'overflow-hidden rounded-2xl shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.04)] '
        + (isUser ? 'ml-8 border border-primary/15 bg-primary/5' : 'mr-3 border border-base-300 bg-base-100'),
    }, header, body);
  }

  // The swipe core, in the house format: one exchange per slide, built lazily.
  // The track, the snapping, the keyboard and the takeover chrome all live in
  // swipe-deck.js; this only says what a slide contains.
  const sd = () => {
    if (!window.swipeDeck) throw new Error('chat-render: load swipe-deck.js first');
    return window.swipeDeck;
  };
  function deckCore(msgs, o = {}) {
    const groups = exchanges(msgs);
    return sd().core(groups.length,
      (i, slide) => groups[i].forEach(m => slide.append(turnCard({ ...m, _o: o }))),
      { innerClass: 'mx-auto max-w-2xl space-y-5' });
  }

  // Standalone swipe deck (inline use): the core track plus a compact arrow +
  // counter nav. o.height sets a fixed height; o.fill fills the parent.
  function deck(messages, o = {}) {
    const msgs = typeof messages === 'string' ? parse(messages) : (messages || []);
    const core = deckCore(msgs, o);
    const wrap = h('div', { class: o.fill ? 'flex flex-col h-full min-h-0' : '' });
    const holder = h('div', { class: o.fill ? 'grow min-h-0' : '', style: o.fill ? '' : `height:${o.height || 'min(72vh, 640px)'}` }, core.track);
    wrap.append(holder);
    if (core.count > 1) {
      const navBtn = (icon, onClick) => {
        const b = h('button', { class: 'btn btn-sm btn-circle btn-ghost border border-base-300' }, h('i', { class: `ph ${icon} text-[15px]` }));
        b.addEventListener('click', onClick);
        return b;
      };
      const prevB = navBtn('ph-caret-left', () => core.go(core.active() - 1));
      const nextB = navBtn('ph-caret-right', () => core.go(core.active() + 1));
      const counter = h('span', { class: 'font-mono text-[11px] opacity-60 tabular-nums min-w-16 text-center' }, `1 / ${core.count}`);
      wrap.append(h('div', { class: 'flex items-center justify-center gap-3 pt-2.5' + (o.fill ? ' pb-1 shrink-0' : '') }, prevB, counter, nextB));
      core.onSlide(a => {
        counter.textContent = `${a + 1} / ${core.count}`;
        prevB.disabled = a <= 0; nextB.disabled = a >= core.count - 1;
      });
    }
    return wrap;
  }

  // chat-histories' extract_chat.py opens every transcript with a header block
  // (title, uuid, created/updated, messages), which parse() returns as a meta
  // note. Anywhere that already names the chat in its own chrome, that note is
  // a second copy of the chrome one line down, in a card the size of a turn. So
  // lift its fields out and drop it. Only when it is nothing but those fields:
  // a meta note carrying real preamble is content and stays put.
  // Where a chat lives, per provider. Gemini is deliberately absent: its
  // sessions have no addressable URL, so there is nothing to link to.
  const CHAT_URL = {
    claude: id => `https://claude.ai/chat/${id}`,
    chatgpt: id => `https://chatgpt.com/c/${id}`,
  };
  const chatUrl = (provider, uuid) =>
    (uuid && CHAT_URL[String(provider || '').toLowerCase()]?.(uuid)) || '';

  const HEADER_LINE = /^(?:#\s|uuid:|created:|updated:|messages:)/;
  function liftHeaderNote(msgs) {
    const first = msgs[0];
    if (!first || normRole(first.role) !== 'meta') return { msgs, facts: null };
    const lines = first.md.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length || !lines.every(l => HEADER_LINE.test(l))) return { msgs, facts: null };
    const facts = {};
    for (const [, k, v] of first.md.matchAll(/(uuid|created|updated|messages):\s*(\S+)/g)) facts[k] = v;
    return { msgs: msgs.slice(1), facts };
  }

  // Fullscreen takeover: one chat fills the screen as a framed swipe deck, one
  // exchange per slide. A header (icon, title, provider/date/turn count, an
  // open-the-chat link, a n/total pill), the swipe area, and a footer pager
  // (prev, dot indicators or a progress bar for long chats, next). Opening
  // locks the background scroll and pushes a history entry, so the phone back
  // button, Escape, ←/→, and the ✕ all dismiss it. Returns { el, close }.
  // opts: { title, provider, date, url }.
  function openTranscript(messages, opts = {}) {
    const parsed = typeof messages === 'string' ? parse(messages) : (messages || []);
    const { msgs, facts } = liftHeaderNote(parsed);
    const groups = exchanges(msgs);
    // Subtitle carries what the lifted header note used to say, one line up.
    // The lifted note's own count when there is one, else the turns actually
    // present. A meta note is not a turn, so it does not get counted either way.
    const turns = facts?.messages || String(msgs.filter(m => normRole(m.role) !== 'meta').length) || '';
    // The chat's own URL is the useful destination: this renders a copy, the
    // link goes to the live conversation. A caller that knows it wins; failing
    // that, derive it from the uuid the header note just gave up. Absent for a
    // provider with no addressable session (Gemini) and when there is no uuid.
    const href = opts.url || chatUrl(opts.provider, facts?.uuid);
    return sd().open({
      count: groups.length,
      render: (i, slide) => groups[i].forEach(m => slide.append(turnCard({ ...m, _o: opts }))),
      innerClass: 'mx-auto max-w-2xl space-y-5',
      title: opts.title || 'Transcript',
      subtitle: [opts.provider, opts.date, turns && `${turns} messages`].filter(Boolean).join('  ·  ')
        || 'Swipe through the exchanges',
      icon: 'ph-chats-circle',
      link: href ? { href, title: 'Open the chat' } : null,
    });
  }

  // ── house-format markdown → messages ────────────────────────────────────
  // Splits on turn markers whose first word is a known role, in any of three
  // forms: a heading (`## User`, `### Assistant`), a bold lead-in (`**User:**`),
  // or a dashed fence (`--- Human ---`, `--- Assistant ---`, `--- Tool (name) ---`)
  // — the last is what chat-histories' extract_chat.py emits, so a fetched or
  // inline transcript from a result envelope splits into turns instead of
  // rendering as one blob. Anything before the first marker becomes a meta note.
  const MARKER = /^(?:#{1,6}\s+(?:\*\*)?|\*\*|-{3,}\s*)\s*(user|human|you|me|assistant|ai|claude|chatgpt|gpt|gemini|kimi|model|bot|system|tool)\b[^\n]*$/i;
  function parse(md) {
    const lines = String(md ?? '').split('\n');
    const out = [];
    let cur = null;
    const push = () => { if (cur && cur.md.trim()) out.push({ role: cur.role, md: cur.md.trim() }); };
    let fence = null;
    for (const line of lines) {
      const f = line.match(/^\s*(```+|~~~+)/);
      if (f) fence = fence && f[1][0] === fence[0] && f[1].length >= fence.length ? null : (fence || f[1]);
      const m = !fence && line.match(MARKER);
      if (m) { push(); cur = { role: normRole(m[1]), md: '' }; continue; }
      if (!cur) cur = { role: 'meta', md: '' };
      cur.md += line + '\n';
    }
    push();
    return out;
  }

  window.chatRender = { ready, parse, exchanges, markdown, block, message, transcript, deck, openTranscript, blockViews, ROLES };
})();
