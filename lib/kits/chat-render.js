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
//                                                // (o.fill: fill the parent, code scrolling
//                                                // inside it, instead of the line clamp)
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
//     dense?: bool        // log density: the role/clock head folds into the
//                         // turn's first line, the assistant turn indents
//                         // under the ask and drops a size. For a transcript
//                         // read in a panel rather than a page
//     raw?: bool }        // force plain-text (true) or markdown (false)
//                         // rendering, past the per-role default
//
// A message may also carry `dropped: <n>`, the characters a caller cut off the
// end of that turn. It renders as a chip on the turn's last line.

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
  // Escaping is window.esc from vanilla-bundle.js, first in the boot chain.
  // This was the new Option().innerHTML idiom, which escapes a text node's
  // characters but not the quotes, so it was safe only for as long as no
  // call site moved into an attribute.
  const esc = s => window.esc(s);
  // THE CLIPBOARD WRITE IS kits/io.js's, and this two-line delegate is all any
  // kit keeps of it. Four of them carried the same textarea-fallback block,
  // pasted and lightly reworded, and the block is not boilerplate: it is the
  // iOS recipe io.js documents at length (focusable, not readonly, read the
  // value rather than trusting execCommand's return). Four copies of that is
  // four places for it to be subtly wrong, and three of them already differed
  // from each other in whether they returned anything.
  //
  // It is FETCHED at load time rather than at click time. A clipboard write
  // has to run inside the user gesture that asked for it, and an await before
  // the write can spend the activation Safari is counting; loading the kit
  // when this one loads means it is simply there by the time a finger arrives.
  // The guard survives for the page that never gets it, and falls back to the
  // modern API alone, which is honest: no io.js, no legacy path.
  if (!window.io && ghRef) ghRef.load('kits/io.js').catch(() => {});
  const copyText = async (text) => {
    if (window.io && typeof window.io.copy === 'function') return window.io.copy(text);
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
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
  // Dense prose, one step under prose-sm's 14px. It is the SUBORDINATE half of
  // the dense pair: a user turn stays at rawPre's 12.5px mono and holds the
  // left margin, so the reply reads as hanging off the ask rather than
  // competing with it.
  const DENSE_PX = 13;
  // Typography's own paragraph rhythm, halved. prose-sm spends 1.14em above and
  // below every block, which is a page's spacing: right where a reply is the
  // whole column, wrong where it is one turn among eleven and the gap between
  // TURNS has to stay the larger of the two or the grouping inverts. Only the
  // closing reply is long enough for this to show, and it is the turn the card
  // is opened for.
  //
  // Written onto the blocks rather than declared as a variant, because the rule
  // it is overriding is typography's `:where()` on the container's children and
  // an arbitrary Tailwind variant reaching that is a bet on the host page's
  // build. The first and last keep their zero, the same edge case typography
  // handles with :first-child.
  // The icon's box plus its gap: the hanging indent every dense turn hangs on.
  const LEAD_INDENT = '17px';
  // ── The ask's fill, in dense mode ─────────────────────────────────────────
  // A rectangle that starts at the TEXT and leaves the icon outside it, which
  // is the whole difference from the band this replaces: that one ran the full
  // width of the turn, so the glyph sat inside its own tint and the ask read as
  // a panel rather than as something said.
  //
  // USER_FILL_X is where the fill starts and USER_FILL_PAD how tightly it hugs;
  // the text column is their sum. X IS LEAD_INDENT's number, so the fill's left
  // edge lands on the one vertical the card already has: the column every other
  // role's text starts at. That is what leaves clear air after the glyph, which
  // occupies 0 to 11px and paints its ink inside about 9 of those.
  //
  // It was 10 for one release, chosen to tuck under the glyph's trailing edge on
  // the argument that any wider read as a second indent. At 10 the fill starts
  // one pixel inside the icon's own box, so there is no gap at all: the tint
  // arrives touching the glyph and the pair reads as one object, which is the
  // complaint the gutter was introduced to answer. A gap that lands on an
  // existing column is not a second indent.
  //
  // THE ICON LEAVES THE TEXT FLOW for this one role. The hanging indent below
  // exists so a wrapped line clears the glyph; with the lead positioned in the
  // gutter there is nothing to clear, and keeping the hang would pull the FIRST
  // line out of the left edge of its own fill, which is what it did when this
  // was tried the other way round.
  const USER_FILL_X = 17;
  const USER_FILL_PAD = 5;
  // THE FILL ENDS AT THE LONGEST LINE, not at the column. A block-level tint
  // takes its container's full width, so an ask whose last line is three words
  // sat under a bar of colour running the whole card: the shape said "panel"
  // where the content said "sentence". Pinning the width to the widest rendered
  // line box ends it where the text ends and keeps it ONE RECTANGLE, which
  // tinting each line box separately would not: that gives a ragged right edge
  // per line, which is the other way to read "hug the text" and the wrong one.
  //
  // There is no CSS for this. `fit-content` resolves to max-content for a
  // paragraph, meaning the whole turn on one line, so it clamps straight back
  // to the available width and changes nothing. The line boxes only exist after
  // layout, so this is a measurement, taken on the next frame.
  //
  // IT CANNOT RE-WRAP WHAT IT MEASURED. Every line already fits inside the
  // widest one, and the new content box is exactly that width, so each line
  // still fits by construction and the break points hold. What it cannot know
  // is a row whose width is a SUM rather than a line: the long-paste footer
  // puts a size, a spacer and two buttons on one row, and no single text run in
  // it measures the whole. So the pin is checked for overflow and dropped
  // rather than squeezing that row.
  const snugFill = (host) => requestAnimationFrame(() => {
    if (!host.isConnected) return;
    const base = host.getBoundingClientRect().left;
    const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let widest = 0;
    while (walk.nextNode()) {
      if (!walk.currentNode.textContent.trim()) continue;
      range.selectNodeContents(walk.currentNode);
      for (const r of range.getClientRects()) if (r.width) widest = Math.max(widest, r.right - base);
    }
    if (!widest) return;
    host.style.width = Math.ceil(widest + USER_FILL_PAD) + 'px';
    if (host.scrollWidth > host.clientWidth + 1) host.style.width = '';
  });
  const DENSE_GAP = '0.6em';
  const tighten = (el) => {
    const kids = [...el.children];
    for (const n of kids) {
      if (!/^(?:P|UL|OL|BLOCKQUOTE|H[1-6]|DL|TABLE|DIV)$/.test(n.tagName)) continue;
      n.style.marginTop = DENSE_GAP;
      n.style.marginBottom = DENSE_GAP;
    }
    if (kids[0]) kids[0].style.marginTop = '0';
    if (kids.length) kids[kids.length - 1].style.marginBottom = '0';
  };

  // A wide table scrolls inside its own box rather than widening the column it
  // sits in. `marked` emits a bare <table>, and a table's intrinsic min-content
  // width (the longest unbreakable run in each column) is a floor no ancestor
  // can shrink below, so one wide table pushed a whole deck slide past the
  // viewport. swipe-deck's own notes say why that is worse than it looks: go()
  // and active() compute in units of `track.clientWidth`, so the moment any
  // slide is wider than the track, every index past it is wrong and the pager
  // scrolls to an offset landing mid-card.
  //
  // The wrapper does not force `max-content` on the table. Typography's default
  // `width: 100%` still wraps cells, so a table that CAN fit still fits and
  // only one that genuinely cannot starts scrolling. Forcing max-content would
  // make every prose-heavy table scroll rather than wrap, which is the wrong
  // trade for the common case.
  function scrollTables(el) {
    for (const t of el.querySelectorAll('table')) {
      const box = h('div', { class: 'overflow-x-auto max-w-full' });
      t.replaceWith(box);
      box.append(t);
    }
    return el;
  }

  // `data-flow` marks a host whose children are RUNNING TEXT, which is what
  // textEdge below walks to find the first and last line of a turn. A block
  // artifact carries no such marker, so the walk cannot descend into a code
  // fence and print a timestamp inside it.
  const proseEl = (cls, html) => scrollTables(h('div', { class: cls, html, 'data-flow': 'prose' }));
  const prose = md => proseEl(proseClass, marked.parse(md));

  // The first or last block of running text in a rendered body, which is where
  // an inline lead-in and an inline trailing marker go. Returns null where the
  // body opens or closes on something that is not prose, and every caller falls
  // back to a standalone line there.
  //
  // It walks the FIRST-child chain (or the last), rather than taking the first
  // `[data-flow]` host anywhere in the tree. The difference is the whole
  // correctness of it: a turn that opens on a fenced block has prose after the
  // fence, and a search would find that prose and print the turn's clock in
  // the MIDDLE of the turn, marking a boundary that is not there. A walk stops
  // at the fence instead, which is what `data-block` is on the card for.
  //
  // PRE is not a text block here. Inside prose a <pre> is a code sample; the
  // only <pre> that is running text is a raw turn's own, and that arrives
  // through the `raw` branch below.
  const TEXT_BLOCK = /^(?:P|H[1-6]|LI|DD|DT)$/;
  const TEXT_GROUP = /^(?:UL|OL|BLOCKQUOTE|DL)$/;
  function textEdge(body, last) {
    let host = body;
    for (let d = 0; d < 4 && !host.dataset?.flow; d++) {
      const kids = [...host.children];
      const pick = last ? kids[kids.length - 1] : kids[0];
      if (!pick || pick.hasAttribute('data-block')) return null;
      host = pick;
    }
    if (!host.dataset?.flow) return null;
    // A raw turn IS its <pre>: the text has no blocks inside it to pick from.
    if (host.dataset.flow === 'raw') return host;
    let el = host;
    for (let d = 0; d < 4; d++) {
      const kids = [...el.children].filter(n => TEXT_BLOCK.test(n.tagName) || TEXT_GROUP.test(n.tagName));
      if (!kids.length) return null;
      el = last ? kids[kids.length - 1] : kids[0];
      if (TEXT_BLOCK.test(el.tagName)) return el;
    }
    return null;
  }

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
        host.append(proseEl(proseClass + ' rounded-box border border-base-300 bg-base-100 px-4 py-3', marked.parse(getCode())));
      },
    },
  ];

  const COLLAPSE_LINES = 24;

  // `o.fill` makes the card fill its parent instead of sitting in a flow: the
  // code scrolls inside the card, under a header that stays put, and the line
  // clamp below is skipped. It exists for a host that has ALREADY given the
  // block a viewport of its own, where the clamp is a second scroll inside a
  // first and leaves the page half empty under a "Show all 983 lines" button.
  // Default off, since in a chat turn the flow is the whole point.
  function block(spec, o = {}) {
    const lang = String(spec.lang || '').toLowerCase().trim().split(/\s+/)[0];
    const b = { lang, code: spec.code };
    const views = blockViews.filter(v => v.test(b));
    const fill = !!o.fill;

    const card = h('div', { class: 'rounded-box overflow-hidden bg-base-100 border border-base-300 not-prose '
      + (fill ? 'my-0 grow min-h-0 flex flex-col' : 'my-3'),
      // Declared, so textEdge's walk stops here rather than descending into the
      // code and treating a fenced <pre> as the turn's first line.
      'data-block': '' });

    let ed = null;
    const getCode = () => ed ? ed.getValue() : b.code;
    let codeVersion = 0;          // bumped on edit; stale panes rebuild on re-activate
    const builtVersion = {};

    // static code view: instant, no editor cost; long blocks start collapsed
    const pre = h('pre', { class: 'm-0 px-3 py-2.5 overflow-auto text-[11.5px] leading-5 font-mono whitespace-pre text-base-content bg-base-100'
      + (fill ? ' grow min-h-0' : ''), html: esc(b.code) });
    const codeHost = h('div', { class: 'relative' + (fill ? ' grow min-h-0 flex flex-col' : '') }, pre);
    const lines = (b.code.match(/\n/g) || []).length + 1;
    if (!fill && lines > COLLAPSE_LINES) {
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
    const bar = h('div', { class: 'flex items-center justify-between gap-2 bg-base-200/60 pl-2.5 pr-1 py-0.5 border-b border-base-300'
      + (fill ? ' shrink-0' : '') },
      langTag, h('div', { class: 'flex items-center gap-1' }, tabs, actions));

    const body = h('div', { class: fill ? 'grow min-h-0 flex flex-col' : '' });
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
        const pane = h('div', { class: 'p-2 bg-base-200/40 space-y-1' + (fill ? ' grow min-h-0 overflow-auto' : '') });
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
      const el = proseEl(proseClass, marked.parser(seg));
      // A STYLE, not a utility, and for the reason rawPre gives above: this is
      // one property that has to beat `prose-sm`'s own font-size on the same
      // element, and which of the two wins as classes depends on the order the
      // host page happens to load typography and Tailwind in. Typography sizes
      // every child in `em`, so setting the root scales the block whole.
      if (o.dense) { el.style.fontSize = DENSE_PX + 'px'; tighten(el); }
      wrap.append(el);
      run = [];
    };
    for (const tok of tokens) {
      if (tok.type === 'code') {
        flush();
        const card = block({ lang: tok.lang, code: tok.text }, o);
        // The card sits in the same column as the prose around it, so it
        // answers to the same rhythm. Left at its own my-3 it was the one
        // block still spaced for a page, and a reply carrying a fence read as
        // two turns with a gap between them.
        if (o.dense) { card.style.marginTop = DENSE_GAP; card.style.marginBottom = DENSE_GAP; }
        wrap.append(card);
      }
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
      'data-flow': 'raw',
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
  // `tint` is the dense lead's colour, and only the two CONVERSATION roles carry
  // one. It is what the rail used to say and now says in one glyph: the ask
  // takes the theme's primary, which is the hue its rail carried, and the reply
  // takes clay, this house's Claude colour (kits/claude-mark.js CLAY, a literal
  // rather than a theme token because the mark is Claude's and not the theme's).
  //
  // The other three stay neutral rather than taking their rail's hue, and that
  // is a measurement, not an omission: this theme's `warning` and `info` sit at
  // 88 to 89% lightness, which is fine as a 2px rail and unreadable as an 11px
  // glyph on white. A colour that cannot be seen is worse than none, since it
  // reads as the neutral it looks like while claiming to be a signal.
  const CLAY = '#d97757';
  const ROLES = {
    user:      { label: 'You',       icon: 'ph-user',       edge: 'border-primary/50',
                 tint: 'var(--color-primary, currentColor)', band: 'bg-primary/10' },
    assistant: { label: 'Assistant', icon: 'ph-sparkle',    edge: 'border-base-content/20',
                 tint: CLAY },
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

  // ── dense mode ──────────────────────────────────────────────────────────
  // The same turn, read as a LOG rather than as a page of cards. Three things
  // change and each one buys vertical space back:
  //
  //   the head goes INLINE, prepended into the turn's first line instead of
  //   standing on a line of its own, which is one line saved per turn and
  //   eleven on a card that holds eleven turns;
  //
  //   the role WORD goes, for `user` and `assistant` only, because in an
  //   alternating transcript four other carriers already say which is which
  //   (the icon, the rail, the indent, and mono against prose). Every other
  //   role keeps its word, and so does a caller-set label: the reply card's
  //   "closing reply" is a fidelity claim about that turn and not decoration;
  //
  //   the assistant turn INDENTS under the ask and drops to DENSE_PX with a
  //   hairline rail, so the exchange reads as question-then-answer instead of
  //   two equal blocks.
  //
  // Where a body opens or closes on something that is not running text (a
  // fenced artifact, an expander row) textEdge returns null and that half
  // falls back to the standalone form. Nothing is ever hidden by the fallback.
  // NO CLOCK. It went from the reply first, on the argument that a reply lands
  // a minute after the ask and so restates rather than locates; the ask's own
  // then had nothing left to be read against, and a lone number opening every
  // exchange is a column of digits the eye has to skip to reach the sentence.
  // What a reader of a card wants from the left edge is WHO, and the icon says
  // that in one glyph. Every turn keeps its time on that icon's title, so the
  // fact is recoverable and costs no pixels; the session page is where a
  // transcript is read against the clock.
  //
  // The lead is therefore the icon alone for the two chat roles. A word joins
  // it for every other role, and for a caller-set label, which is a claim
  // rather than decoration.
  const denseHead = (m, meta, role) => {
    const showWord = m.label || (role !== 'user' && role !== 'assistant');
    const icon = h('i', { class: `ph ${meta.icon} text-[11px] not-prose `
      + (meta.tint ? 'opacity-80' : 'opacity-50') });
    if (meta.tint) icon.style.color = meta.tint;
    if (m.ts) icon.setAttribute('title', String(m.ts));
    // `text-indent: 0` because text-indent INHERITS, and the hanging indent
    // below sets a negative one on the block this lead is prepended into. The
    // lead is the hung item rather than part of the indented flow, and left to
    // inherit it, the glyph and a label beside it were each pulled a further
    // 17px left: with a label that put the word on top of the icon, which is
    // how this was found.
    const lead = h('span', { class: 'inline-flex items-baseline gap-1 mr-1.5 align-baseline',
                             style: 'text-indent:0' }, icon);
    if (showWord) lead.append(h('span',
      { class: 'font-mono text-[9.5px] tracking-widest uppercase opacity-50' }, m.label || meta.label));
    return lead;
  };

  // What was cut off this turn, said where the text stops rather than under it.
  // A count and not an ellipsis: "there is more" is what an ellipsis says, and
  // the reader deciding whether to open the session is asking how much more.
  // The unit is in the chip because a card on a phone has no hover to carry it.
  // `inline`, NOT `inline-block`, and it is the one thing that makes the chip
  // stay put. An inline-block is an atomic inline, and a browser takes a break
  // opportunity at its leading edge even across a non-breaking space in front
  // of it: measured 2026-08-28 against this app, where a chip preceded by
  // U+00A0 still dropped onto a line of its own. As inline text the space is
  // simply glue between two characters, which is what a non-breaking space is
  // defined to be; `whitespace-nowrap` then keeps the chip's own space from
  // being the break instead. Horizontal padding and a background render on an
  // inline box, so nothing is lost by it.
  const moreChip = (n) => h('span', {
    class: 'inline whitespace-nowrap rounded px-1 bg-base-content/10'
         + ' font-mono text-[9.5px] text-base-content/50 not-prose',
    title: n.toLocaleString() + ' more characters in this turn. Open the session to read it whole.',
  }, '+' + n.toLocaleString() + ' chars');
  // The gap is a non-breaking space rather than a margin: with a margin the
  // chip is its own breakable token, and an orphaned chip reads as a fact about
  // the turn rather than about the sentence it ends. Bound to the last word,
  // the two wrap together. It renders at the surrounding font size, so it is
  // also the right gap.
  const chipGap = () => document.createTextNode('\u00A0');

  function message(m, o = {}) {
    const role = normRole(m.role);
    const meta = ROLES[role];
    const dense = !!o.dense;
    const body = bodyFor(role, m.md, o);

    const lead = dense ? denseHead(m, meta, role) : null;
    const leadAt = lead && textEdge(body, false);
    if (leadAt) leadAt.prepend(lead);

    const more = m.dropped ? moreChip(m.dropped) : null;
    const moreAt = more && textEdge(body, true);
    if (moreAt) moreAt.append(chipGap(), more);

    const head = leadAt ? null : h('div', { class: `flex items-center gap-1.5 ${dense ? 'mb-0.5' : 'mb-1'}` },
      h('i', { class: `ph ${meta.icon} text-[12px] opacity-50` }),
      h('span', { class: 'font-mono text-[9.5px] tracking-widest uppercase opacity-50' }, m.label || meta.label),
      m.ts ? h('span', { class: 'font-mono text-[9.5px] opacity-30' }, String(m.ts)) : '');
    const bodyHost = h('div', { class: 'relative' }, body);
    // SANS AT 11, not rawPre's 12.5px mono. The ask and the reply were within
    // half a pixel of each other, so nothing in the type said which was which
    // and the tint was carrying the whole distinction. Smaller and unmonospaced
    // puts the ask under the reply, which is the reading order: the reply is
    // what the card is opened for and the ask is the context for it.
    if (dense && role === 'user') for (const pre of bodyHost.querySelectorAll('pre')) {
      pre.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, sans-serif';
      pre.style.fontSize = '11px';
      pre.style.lineHeight = '1.5';
      // Darkened off the THEME's primary rather than pinned to a literal, so
      // the ask tracks a theme change the way its fill does. The fill is the
      // same hue at 11%, which is what makes the pair read as one thing.
      pre.style.color = 'color-mix(in oklch, var(--color-primary, currentColor) 78%, black)';
    }
    // A HANGING INDENT, so the icon is the only thing outside the text column.
    // The turn's whole body is pushed in by the width of the lead and its first
    // line pulled back out by the same amount, which puts the glyph in the
    // margin and every other line, and every later paragraph, on one edge. Read
    // down a card, that edge is what tells the eye where the prose is; a lead
    // sitting inline with nothing behind it made line one start further right
    // than the rest of its own turn, so every turn opened with a small notch.
    //
    // LEAD_INDENT is the icon's box plus its gap, measured rather than derived:
    // the glyph reports 11px at its own 11px font size and mr-1.5 is 6px. Fixed
    // px because the two bodies it has to line up in are different sizes (a raw
    // turn's 12.5px mono, a reply's 13px prose) while the icon between them is
    // not. A turn carrying a LABEL runs its first line further still, which is
    // what a hanging indent does with a long lead-in and reads as one.
    // The ask takes the gutter treatment above instead of the hang: its lead is
    // positioned rather than inline, so the body needs neither the padding nor
    // the pull-back. bodyHost is already `relative`, which is what the lead is
    // absolute against, so the offset is the fill's own margin.
    //
    // THE FILL IS THE ROLE'S, NOT THE LEAD'S. It hung off `leadAt` once, which
    // reads as one condition and is two: whether the turn is an ask, and
    // whether its first block could take an inline lead-in. A body that opens
    // on something textEdge will not descend into falls back to a standalone
    // head, and under the old gate lost its tint with it, so the one ask on the
    // card that could not fold was also the one that stopped looking like an
    // ask. Only the GUTTER needs a lead to position, so only that half is gated.
    const userFill = dense && role === 'user';
    if (userFill) {
      bodyHost.style.marginLeft = USER_FILL_X + 'px';
      bodyHost.style.padding = '3px ' + USER_FILL_PAD + 'px';
      bodyHost.style.background = 'color-mix(in oklch, var(--color-primary, currentColor) 11%, transparent)';
      bodyHost.style.borderRadius = '3px';
      snugFill(bodyHost);
    }
    if (leadAt && userFill) {
      lead.style.position = 'absolute';
      lead.style.left = '-' + USER_FILL_X + 'px';
      lead.style.top = '3px';
      leadAt.style.textIndent = '0';
    } else if (leadAt) {
      bodyHost.style.paddingLeft = LEAD_INDENT;
      leadAt.style.textIndent = '-' + LEAD_INDENT;
    }
    // NO RAIL IN DENSE, and that is the point rather than a saving. A rail is
    // card chrome: it binds a wrapped line to its turn and colours the role,
    // and both jobs are already done here by the indent, by mono against
    // prose, and by the gap that opens before each ask. Kept, it was the one
    // vertical line on the card and it drew the eye to chrome rather than to
    // text. So the ask sits flush and everything answering it hangs off that
    // edge, which is the only geometry the reader has to learn.
    // ONE COLUMN, AND THE ASK IS TINTED IN IT. The rail went, then this band,
    // then the reply's indent, and the band came back once the indent was gone:
    // the two were saying the same thing, so with the indent in place the band
    // was a second voice for one fact and now it is the only one. Every glyph
    // sits on the same left edge, and the fill's own left edge sits on the text
    // column beside it, so the card has two verticals rather than a new one per
    // turn.
    //
    // The order that produced this is not noise: each carrier was removed alone
    // and judged alone, and the one that survived is the one still doing work
    // when nothing else was left to hide behind it.
    // The ask's band moved onto the BODY (see USER_FILL_X), so the frame keeps
    // nothing for it: a full-width tint here is what put the icon inside the
    // fill and bled it 8px past the text on both sides.
    const frame = !dense ? `border-l-2 ${meta.edge} pl-3.5 py-0.5` : '';
    const el = h('div', { class: frame }, ...(head ? [head] : []), bodyHost);
    if (more && !moreAt) el.append(h('p',
      { class: 'font-mono text-[9.5px] text-base-content/50 leading-snug mt-0.5' },
      '… ' + m.dropped.toLocaleString() + ' more characters'));
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
        + (isUser ? 'ml-8 border border-primary/10 bg-primary/10' : 'mr-3 border border-base-300 bg-base-100'),
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
