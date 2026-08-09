// session-export.js — take part of a session out: pick the turns, say how much
// of each to include, copy the markdown.
//
// The deck (session-render.js) made a record readable. It did not make any of
// it portable: the one thing a reader wants after finding the moment where
// something went sideways is to put that moment in front of another session,
// and the only route was selecting text across a snap-scrolling track on a
// phone. This is that route, built rather than improvised.
//
// The unit is the TURN, listed under the card it belongs to, so the two
// selections a reader actually makes are both one tap: this exchange, or this
// whole session. Opening from the deck preselects the card on screen, which is
// the case the feature exists for.
//
// Framework-free and DOM-rendering, loaded via gh.load after session-render.js
// (which it reads) and swipe-deck.js (whose `h` and overlay idiom it borrows).
//
//   sessionExport.model(record)               -> {cards, flat, cardOf, cardStart}
//   sessionExport.markdown(record, sel, opts) -> string     pure; sel = Set|array|null
//   sessionExport.open(record, opts?)         -> {el, close}  fullscreen picker
//
// ── What the output says about itself ─────────────────────────────────────
//
// A record is a bounded capture, not a transcript: prompts are stored to 400
// characters, prose to 8 KB a turn, result bodies to 1 or 2 KB, and receipts
// and Reads are dropped by policy. An excerpt pasted into another session
// carries none of that context, and a reader there has no way to tell a quiet
// turn from an elided one. So the header block is not decoration: it names the
// record, states the bound, and (with `caveats`, the default) carries the
// record's own capture gaps. Turning it off is available and is a choice the
// reader makes, not a default that quietly ships a partial record as a whole
// one.
//
// ── Why detail is separate from selection ──────────────────────────────────
//
// Which turns to take and how much of each are different questions, and the
// second is where the size actually is: on the session that built this, tool
// result bodies were 78% of the bytes. So selection is the single source of
// truth for WHICH turns (the quick-select chips write it rather than shadowing
// it with a second filter), and the toggles govern how each selected turn
// renders. Bodies default off for that reason; arguments default on, because a
// Bash turn with no command in it says nothing at all.
(() => {
  const SR = () => {
    if (!window.sessionRender) throw new Error('session-export: load session-render.js first');
    return window.sessionRender;
  };
  const h = (...a) => {
    if (!window.swipeDeck) throw new Error('session-export: load swipe-deck.js first');
    return window.swipeDeck.h(...a);
  };

  const ROLE = {
    user: { label: 'You', cls: 'text-primary' },
    assistant: { label: 'Claude', cls: 'text-secondary' },
    tool: { label: 'Tool', cls: 'text-base-content/60' },
    meta: { label: 'Note', cls: 'text-warning' },
  };

  const DEFAULTS = { args: true, bodies: false, stamps: true, head: true, caveats: true };

  // ── The list ───────────────────────────────────────────────────────────────
  // Indices are positions in `flat`, which is the cards flattened. Deriving the
  // flat list FROM the cards rather than from turns() directly is what keeps a
  // turn index and a card index talking about the same sequence: groups() folds
  // a leading meta note into the first card, so the two orders are equal today
  // and there is no reason to depend on that.
  function model(record) {
    const sr = SR();
    const cards = sr.groups(sr.turns(record));
    const flat = [], cardOf = [], cardStart = [];
    cards.forEach((c, ci) => {
      cardStart.push(flat.length);
      c.forEach(t => { cardOf.push(ci); flat.push(t); });
    });
    return { cards, flat, cardOf, cardStart };
  }

  const asSet = sel => sel == null ? null : (sel instanceof Set ? sel : new Set(sel));

  // A turn's own heading. The tool label already carries the tool name and its
  // failure mark, so it wins over the role word; nothing else has one.
  const heading = t => t.label || ROLE[t.role]?.label || t.role;

  function emit(t, o) {
    const parts = ['**' + heading(t) + '**' + (o.stamps && t.ts ? '  ·  ' + t.ts : '')];
    if (t.role === 'tool') {
      if (o.args && t.parts?.arg) parts.push(t.parts.arg);
      if (o.bodies && t.parts?.body) parts.push(t.parts.body);
      if (!o.args && !o.bodies) parts.push('*(call only)*');
    } else if (t.md) {
      parts.push(t.md);
    }
    return parts.join('\n\n');
  }

  // The record's own capture gaps, as session-render states them. Read off the
  // rendered note rather than recomputed, so the exporter cannot drift into a
  // second, kinder account of what is missing.
  const gapsOf = m =>
    m.flat.find(t => t.role === 'meta' && /does not hold/i.test(t.label || ''))?.md || '';

  function headBlock(record, m, chosen, o) {
    const sr = SR();
    const d = sr.describe(record);
    const cards = new Set(chosen.map(i => m.cardOf[i]));
    const whole = chosen.length === m.flat.length;
    const lines = ['# ' + d.title];
    if (d.subtitle) lines.push('_' + d.subtitle + '_');

    const scope = whole
      ? `The whole record: ${m.flat.length} turns across ${m.cards.length} cards.`
      : `Excerpt: ${chosen.length} of ${m.flat.length} turns, from ${cards.size} of ${m.cards.length} cards`
        + (cards.size <= 6 ? ' (' + [...cards].sort((a, b) => a - b).map(i => i + 1).join(', ') + ').' : '.');
    // The omission line is claimed only when something was actually omitted: an
    // excerpt of nothing but prose has no bodies to leave out, and saying so
    // would describe a decision that did not apply to it.
    const hasCalls = chosen.some(i => m.flat[i].role === 'tool');
    const bound = 'This is a captured session record, not a full transcript: prompts, prose and '
      + 'result bodies are stored under caps, and some results are dropped by policy.'
      + (hasCalls && !o.bodies ? ' Tool result bodies are omitted from this excerpt.' : '');
    lines.push(scope + ' ' + bound);
    if (record.agent_session) lines.push('Session: ' + record.agent_session);

    if (o.caveats) {
      const g = gapsOf(m);
      if (g) lines.push('**What this record does not hold**\n\n' + g);
    }
    return lines.join('\n\n');
  }

  // Pure: the whole point of the picker, minus the picker. `sel` of null means
  // every turn, so a caller wanting the plain "copy the session" has one call.
  function markdown(record, sel, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const m = opts.model || model(record);
    const set = asSet(sel);
    const chosen = m.flat.map((_, i) => i).filter(i => !set || set.has(i));
    if (!chosen.length) return '';

    const out = [];
    if (o.head) out.push(headBlock(record, m, chosen, o));
    // A rule marks a GAP, not a card boundary. The reader on the other end
    // needs to know where turns were dropped, so two consecutive turns run on
    // even across a card break, and a jump gets a rule even inside one card.
    // The earlier version ruled on every card change, which put a horizontal
    // line between every pair of turns in an asks-and-prose excerpt: each of
    // those turns starts its own card, so the mark that was supposed to mean
    // "something is missing here" appeared where nothing was.
    let prev = -1;
    for (const i of chosen) {
      if (prev !== -1 && i !== prev + 1) out.push('---');
      else if (prev === -1 && o.head) out.push('---');
      out.push(emit(m.flat[i], o));
      prev = i;
    }
    return out.join('\n\n') + '\n';
  }

  // ── Clipboard ──────────────────────────────────────────────────────────────
  // The async API needs a user gesture and a secure context, and it has both
  // here (a button, on https). The textarea fallback is for the third case that
  // still bites: an iframe without clipboard-write permission, which is what a
  // toss is. Same shape chat-render.js uses.
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.append(ta);
      ta.select();
      try { return document.execCommand('copy'); }
      catch { return false; }
      finally { ta.remove(); }
    }
  }

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── The picker ─────────────────────────────────────────────────────────────
  const preview = t => {
    const s = t.role === 'tool' ? (t.src?.arg || '') : (t.md || '');
    return s.replace(/^```[^\n]*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  };

  // An order-of-magnitude token count, at four characters a token. That rule of
  // thumb is stated as one, and it is the number the footer carries rather than
  // the character count: the question a reader is asking is whether this will
  // fit in a paste, and no tokenizer is needed to answer it that far. The exact
  // characters ride the tooltip, where precision costs no width.
  const round = n => n < 1000 ? String(n) : (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
  const size = s => '~' + round(Math.round(s.length / 4)) + ' tok';
  const sizeLong = s => s.length.toLocaleString() + ' characters, about ' + round(Math.round(s.length / 4)) + ' tokens';

  function open(record, opts = {}) {
    const m = model(record);
    const d = SR().describe(record);
    const o = { ...DEFAULTS, ...opts };
    const sel = new Set();

    // Preselect: the card the reader was on, else nothing. "Nothing" is the
    // right empty state rather than "everything", because arriving with the
    // whole session ticked invites a copy of the whole session, which is the
    // thing that did not need a picker.
    const start = Number.isInteger(opts.startCard) ? opts.startCard : null;
    if (start != null && m.cards[start])
      m.cards[start].forEach((_, k) => sel.add(m.cardStart[start] + k));

    const rows = [];          // {i, box}
    const cardBoxes = [];     // per card
    let out = '';

    // ── chrome ──
    const overlay = h('div', { class: 'fixed inset-0 z-[80] overflow-hidden bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-primary)_7%,transparent),transparent_30rem),var(--color-base-200)]' });
    const panel = h('div', { class: 'mx-auto grid h-full w-full max-w-4xl grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto] bg-base-100 shadow-xl sm:h-[calc(100dvh-2rem)] sm:my-4 sm:rounded-3xl sm:border sm:border-base-300 sm:overflow-hidden' });
    const closeBtn = h('button', { class: 'btn btn-ghost btn-sm btn-circle shrink-0', 'aria-label': 'Close' },
      h('i', { class: 'ph ph-x text-lg' }));
    const header = h('div', { class: 'flex items-center gap-3 border-b border-base-300 bg-base-100/90 px-4 py-3 backdrop-blur sm:px-6' },
      closeBtn,
      h('div', { class: 'grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary' },
        h('i', { class: 'ph ph-export text-xl' })),
      h('div', { class: 'min-w-0 flex-1' },
        h('h1', { class: 'truncate text-sm font-semibold sm:text-base' }, 'Export a transcript'),
        h('p', { class: 'truncate text-xs text-base-content/50' }, d.title)));

    // ── options bar ──
    const chip = (label, fn) => {
      const b = h('button', { class: 'btn btn-xs btn-ghost border border-base-300' }, label);
      b.addEventListener('click', () => { fn(); syncBoxes(); recount(); });
      return b;
    };
    const setSel = pred => { sel.clear(); m.flat.forEach((t, i) => { if (pred(t, i)) sel.add(i); }); };
    const quick = h('div', { class: 'flex flex-wrap items-center gap-1.5' },
      h('span', { class: 'text-[11px] uppercase tracking-wide text-base-content/45 mr-0.5' }, 'Select'),
      chip('All', () => setSel(() => true)),
      chip('None', () => sel.clear()),
      chip('Asks', () => setSel(t => t.role === 'user')),
      chip('Asks + prose', () => setSel(t => t.role === 'user' || t.role === 'assistant')),
      chip('This card', () => {
        const ci = m.cardOf[[...sel][0]] ?? start ?? 0;
        setSel((_, i) => m.cardOf[i] === ci);
      }));

    const toggle = (key, label, title) => {
      const box = h('input', { type: 'checkbox', class: 'checkbox checkbox-xs' });
      box.checked = !!o[key];
      box.addEventListener('change', () => { o[key] = box.checked; recount(); });
      return h('label', { class: 'flex items-center gap-1.5 cursor-pointer', title: title || '' },
        box, h('span', { class: 'text-xs' }, label));
    };
    const opts_ = h('div', { class: 'flex flex-wrap items-center gap-x-4 gap-y-2' },
      h('span', { class: 'text-[11px] uppercase tracking-wide text-base-content/45' }, 'Include'),
      toggle('args', 'Tool calls', 'The command, path or pattern each tool ran with'),
      toggle('bodies', 'Tool results', 'What came back. Usually most of the bytes.'),
      toggle('stamps', 'Times'),
      toggle('head', 'Header'),
      toggle('caveats', 'Capture gaps', "What the record could not hold, as the deck's first card states it"));

    const bar = h('div', { class: 'flex flex-col gap-2 border-b border-base-300 bg-base-100 px-4 py-2.5 sm:px-6' }, quick, opts_);

    // ── the list ──
    const list = h('div', { class: 'px-3 py-3 sm:px-6' });
    const pre = h('pre', { class: 'hidden whitespace-pre-wrap break-words px-4 py-4 font-mono text-[11px] leading-relaxed sm:px-6' });
    // One scrolling row holding both, so the panel's four grid rows stay four.
    const scroll = h('div', { class: 'min-h-0 overflow-y-auto' }, list, pre);

    m.cards.forEach((card, ci) => {
      const cbox = h('input', { type: 'checkbox', class: 'checkbox checkbox-xs' });
      cbox.addEventListener('change', () => {
        card.forEach((_, k) => { const i = m.cardStart[ci] + k; cbox.checked ? sel.add(i) : sel.delete(i); });
        syncBoxes(); recount();
      });
      cardBoxes.push(cbox);
      list.append(h('label', { class: 'flex items-center gap-2 cursor-pointer pt-3 pb-1' },
        cbox,
        h('span', { class: 'font-mono text-[11px] text-base-content/45' }, `Card ${ci + 1} / ${m.cards.length}`),
        h('span', { class: 'h-px grow bg-base-300' })));

      card.forEach((t, k) => {
        const i = m.cardStart[ci] + k;
        const box = h('input', { type: 'checkbox', class: 'checkbox checkbox-xs mt-0.5 shrink-0' });
        box.addEventListener('change', () => {
          box.checked ? sel.add(i) : sel.delete(i);
          syncBoxes(); recount();
        });
        rows.push({ i, box });
        const r = ROLE[t.role] || ROLE.meta;
        const body = h('div', { class: 'min-w-0 flex-1' },
          h('div', { class: 'flex items-baseline gap-2' },
            h('span', { class: 'text-xs font-medium ' + r.cls }, heading(t)),
            h('span', { class: 'font-mono text-[10px] text-base-content/35' }, t.ts || '')),
          h('div', { class: 'truncate text-xs text-base-content/60' }, preview(t)));
        // Tapping the text opens the turn in full: choosing which turn to send
        // is exactly the moment a 200-character preview is not enough.
        body.addEventListener('click', () => {
          const p = body.lastChild;
          p.classList.toggle('truncate');
          p.classList.toggle('whitespace-pre-wrap');
          p.textContent = p.classList.contains('truncate') ? preview(t) : (t.md || preview(t));
        });
        list.append(h('label', { class: 'flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-base-200/60' }, box, body));
      });
    });

    // ── footer ──
    const stat = h('span', { class: 'font-mono text-[11px] tabular-nums text-base-content/60' }, '');
    const previewBtn = h('button', { class: 'btn btn-sm btn-ghost gap-1.5' },
      h('i', { class: 'ph ph-eye text-base' }), h('span', {}, 'Preview'));
    const copyBtn = h('button', { class: 'btn btn-sm btn-primary gap-1.5' },
      h('i', { class: 'ph ph-copy text-base' }), h('span', {}, 'Copy'));
    const dlBtn = h('button', { class: 'btn btn-sm btn-ghost btn-circle', 'aria-label': 'Download .md', title: 'Download .md' },
      h('i', { class: 'ph ph-download-simple text-base' }));
    const footer = h('div', { class: 'flex items-center gap-2 border-t border-base-300 bg-base-100 px-4 py-3 sm:px-6' },
      stat, h('div', { class: 'grow' }), previewBtn, dlBtn, copyBtn);

    previewBtn.addEventListener('click', () => {
      const showing = !pre.classList.contains('hidden');   // preview is up now
      pre.classList.toggle('hidden', showing);
      list.classList.toggle('hidden', !showing);
      previewBtn.lastChild.textContent = showing ? 'Preview' : 'Turns';
      previewBtn.firstChild.className = 'ph ' + (showing ? 'ph-eye' : 'ph-list-checks') + ' text-base';
      if (!showing) { pre.textContent = out; scroll.scrollTop = 0; }
    });
    copyBtn.addEventListener('click', async () => {
      if (!out) return;
      const ok = await copyText(out);
      copyBtn.lastChild.textContent = ok ? 'Copied' : 'Copy failed';
      copyBtn.firstChild.className = 'ph ' + (ok ? 'ph-check' : 'ph-warning') + ' text-base';
      setTimeout(() => {
        copyBtn.lastChild.textContent = 'Copy';
        copyBtn.firstChild.className = 'ph ph-copy text-base';
      }, 1400);
    });
    dlBtn.addEventListener('click', () => {
      if (out) download(out, (record.short || 'session') + '-excerpt.md');
    });

    // ── state sync ──
    function syncBoxes() {
      rows.forEach(({ i, box }) => { box.checked = sel.has(i); });
      cardBoxes.forEach((b, ci) => {
        const on = m.cards[ci].filter((_, k) => sel.has(m.cardStart[ci] + k)).length;
        b.checked = on === m.cards[ci].length && on > 0;
        b.indeterminate = on > 0 && on < m.cards[ci].length;
      });
    }
    function recount() {
      out = sel.size ? markdown(record, sel, { ...o, model: m }) : '';
      stat.textContent = sel.size ? `${sel.size} turn${sel.size === 1 ? '' : 's'} · ${size(out)}` : 'Nothing selected';
      stat.title = sel.size ? sizeLong(out) : '';
      copyBtn.disabled = !sel.size;
      dlBtn.disabled = !sel.size;
      if (!pre.classList.contains('hidden')) pre.textContent = out;
    }

    panel.append(header, bar, scroll, footer);
    overlay.append(panel);
    syncBoxes(); recount();

    // Same dismissal contract as the deck: a history entry, so the phone back
    // button is what closes it. Opened over the deck, back steps out of this
    // and lands on the card the reader came from.
    const prevOverflow = document.documentElement.style.overflow;
    let closed = false;
    const cleanup = () => {
      if (closed) return; closed = true;
      removeEventListener('keydown', onKey);
      removeEventListener('popstate', onPop);
      document.documentElement.style.overflow = prevOverflow;
      overlay.remove();
      if (opts.onClose) opts.onClose();
    };
    const dismiss = () => { if (!closed) history.back(); };
    const onPop = () => cleanup();
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } };
    closeBtn.addEventListener('click', dismiss);
    addEventListener('popstate', onPop);
    addEventListener('keydown', onKey);
    history.pushState({ __sxExport: 1 }, '', location.href);
    document.documentElement.style.overflow = 'hidden';
    document.body.append(overlay);

    // The list opens on the preselected card rather than at the top: arriving
    // at turn 1 of 214 when the reader came from card 12 is arriving nowhere.
    if (start != null) requestAnimationFrame(() => {
      const first = rows.find(r => m.cardOf[r.i] === start);
      first?.box.closest('label')?.scrollIntoView({ block: 'center' });
    });

    return { el: overlay, close: dismiss };
  }

  window.sessionExport = { model, markdown, open, copyText, DEFAULTS };
})();
