// session-export.js — take part of a session out: pick the turns, say how much
// of each to include, copy the markdown.
//
// The deck (session-render.js) made a record readable. It did not make any of
// it portable: the one thing a reader wants after finding the moment where
// something went sideways is to put that moment in front of another session,
// and the only route was selecting text across a snap-scrolling track on a
// phone. This is that route, built rather than improvised.
//
// THE UNIT IS THE CARD, and opening one is what selects it. A card is an
// exchange, so "this exchange" is one tap and "this whole session" is one tap
// on Open all; opening from the deck opens the card that was on screen, which
// is the case the feature exists for.
//
// It was a checkbox per card and per turn until 2026-09-01, which asked the
// reader to choose from a one-line truncated title and then expand the row to
// learn what they had chosen. Expansion is the decision now: you open a card
// because you want to read it, and that is the same judgement as wanting to
// copy it. Collapsing is the deselect.
//
// AN OPEN CARD IS A DECK SLIDE, drawn by sessionRender.card, which is the same
// call the deck makes. This file used to render its own turn beside it, a role
// word and a clock over plain text, so the reader met two drawings of one thing
// within two taps of each other. A long turn clamps with chat-render's own fade
// and "Show full message" rather than a preview invented here, and that second
// level only reads: it does not select.
//
// Framework-free and DOM-rendering, loaded via gh.load after session-render.js
// (which it reads) and swipe-deck.js (whose `h` and overlay idiom it borrows).
//
//   sessionExport.model(record)               -> {cards, flat, cardOf, cardStart}
//   sessionExport.markdown(record, sel, opts) -> string     pure; sel = Set|array|null
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
// result bodies were 78% of the bytes. So the open cards are the single source
// of truth for WHICH exchanges, the first three toggles say which roles inside
// them come along, and the rest govern how much of each selected turn
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

  // `asks`, `replies` and `args` decide WHICH turns of an open card are in;
  // `bodies`, `stamps`, `head` and `caveats` decide how much of them renders.
  // The split is not cosmetic: emit() gives a tool turn a heading whatever the
  // render flags say, falling back to "(call only)", so a card holding 34 Bash
  // calls cannot be reduced to its ask by rendering alone. Something has to
  // drop the turn, and that is what the first three do.
  const DEFAULTS = { asks: true, replies: true, args: true,
                     bodies: false, stamps: true, head: true, caveats: true };

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
  const ghRef = typeof gh !== 'undefined' ? gh : (window.gh || null);
  if (!window.io && ghRef) ghRef.load('kits/io.js').catch(() => {});
  const copyText = async (text) => {
    if (window.io && typeof window.io.copy === 'function') return window.io.copy(text);
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  };

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }


  // ── The overview ───────────────────────────────────────────────────────────
  // One row per card, titled by sessionRender.outline, and the same rows are
  // where turns get picked for export. That is one surface doing two jobs on
  // purpose: both are "read the shape of this session as a list," and running
  // them apart meant the reader chose turns from a list of previews with no
  // titles while the titles lived nowhere at all.
  //
  // Selection is an affordance ON the overview rather than a mode: nothing is
  // ticked until you tick something, and the export bar does not appear until
  // then, so the page reads as an outline first and a picker second.

  // An order-of-magnitude token count, at four characters a token. That rule of
  // thumb is stated as one, and it is the number the bar carries rather than
  // the character count: the question is whether this will fit in a paste, and
  // no tokenizer is needed to answer it that far. Exact bytes ride the tooltip.
  const round = n => n < 1000 ? String(n) : (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
  const size = s => '~' + round(Math.round(s.length / 4)) + ' tok';
  const sizeLong = s => s.length.toLocaleString() + ' characters, about ' + round(Math.round(s.length / 4)) + ' tokens';

  // A title derived from tool calls rather than from prose is a weaker claim,
  // so it is styled as one. The reader can tell at a glance which rows the
  // session actually narrated and which are the renderer's best effort.
  const TITLE_CLS = {
    'lead-sentence': 'text-base-content',
    'tool-calls': 'text-base-content/50 italic',
    'lead-short': 'text-base-content/50 italic',
    none: 'text-base-content/40 italic',
  };

  // Role, said rather than colour-coded, and coloured only on the word itself.
  //
  // Three treatments were tried. A blue dot against a purple dot asked the
  // reader to learn a legend printed nowhere. An accent border plus a tint on
  // the user rows made the asks scannable and read as a stray outline down the
  // left of the list, which is worse than the problem it solved: a border is
  // chrome, and chrome has to earn its weight against a row it is not part of.
  //
  // What is left is the word, in Claude's own clay for Claude. That is the
  // same #d97757 as the estate's session logomark, so the colour already means
  // "Claude" everywhere else a reader has seen it and needs no key here. The
  // ask keeps the primary, and its title carries a little more weight, which
  // is enough to find the asks while scanning without drawing a single line.
  const CLAY = '#d97757';
  const ROLE_WORD = { user: 'You', assistant: 'Claude', tool: 'Tool', meta: 'Note' };

  // ── The guideline, which is back, on a different claim ────────────────────
  //
  // It was dropped a commit ago because it marked every user row against
  // nothing, and a rule that fires on a quarter of a list without saying why
  // reads as a stray outline. What it lacked was a distinction worth drawing.
  //
  // `kind` supplies one. A session alternates between saying something and
  // doing something, and across the store the split is 13.5% ask, 13.0%
  // answer, 72.2% work. So the conversation is a quarter of the rows and the
  // machinery is three quarters, and the guideline now marks exactly the
  // conversation: blue down the asks, clay down the replies, nothing beside
  // the work. Read the ruled rows and you have read the session; the unruled
  // ones are how it got there.
  const RULE = {
    ask: 'border-primary',
    answer: 'border-[#d97757]',
    work: 'border-transparent',
    note: 'border-warning/40',
  };
  const ROLE_CLS = {
    user: 'text-primary', assistant: '',
    tool: 'text-base-content/40', meta: 'text-warning',
  };

  // A role label. Clay is not a Tailwind token, so `assistant` takes it inline;
  // everything else rides a class.
  function roleTag(role, size = 'text-[13px]') {
    const el = h('span', { class: size + ' font-medium ' + (ROLE_CLS[role] ?? ROLE_CLS.tool) },
      ROLE_WORD[role] || ROLE_WORD.meta);
    if (role === 'assistant') el.style.color = CLAY;
    return el;
  }

  /**
   * The overview, as an element the caller mounts wherever it likes.
   *   opts.onOpen(i)   tapping a card's title or its deck glyph; omit and
   *                    neither is a link, which is the takeover's case
   *   opts.startCard   open this card, which is also to select it
   *   plus the DEFAULTS toggles
   * Returns { el, selectedCount, markdown }.
   *
   * Open is selected. See the note at the top of the function; the short of it
   * is that a checkbox asked the reader to choose from a truncated title and
   * then expand to find out what they had chosen, so the expansion is the
   * choice now and there is no second control to disagree with it.
   */
  function index(record, opts = {}) {
    const m = model(record);
    const line = SR().outline(record);
    const o = { ...DEFAULTS, ...opts };

    // WHAT IS OPEN IS WHAT IS COPIED, and there is no second control saying so.
    //
    // This list used to carry a checkbox on every card and every turn inside
    // it, so a reader ticked a row whose title was one truncated line and then
    // expanded it to find out what they had picked. Reported 2026-09-01 from
    // the phone: "the radio button is just hard to make sense of, too little
    // detail availability", and the marks read as radios besides, round and
    // promising pick-one over a pick-many behaviour.
    //
    // Expanding is the decision. You open a card because you want to read it,
    // and wanting to read it is the same judgement as wanting to copy it, so
    // one gesture serves both and the two can never disagree. Collapsing is
    // the deselect.
    const openCards = new Set();
    const start = Number.isInteger(opts.startCard) ? opts.startCard : null;
    if (start != null && m.cards[start]) openCards.add(start);

    const cardRows = [];    // {ci, box, icon, open()}
    let sel = new Set();
    let out = '';

    // The turns of every open card, filtered by what the options let in. This
    // is the whole selection; nothing else writes it.
    const wanted = (t) => (t.role === 'user' ? o.asks
                        : t.role === 'assistant' ? o.replies
                        : t.role === 'tool' ? o.args || o.bodies
                        : true);
    const select = () => {
      const s = new Set();
      for (const ci of openCards)
        (m.cards[ci] || []).forEach((t, k) => { if (wanted(t)) s.add(m.cardStart[ci] + k); });
      return s;
    };

    const el = h('div', { class: 'flex h-full flex-col min-h-0' });

    // ── quick select, quiet until it is wanted ──
    const chip = (label, fn) => {
      const b = h('button', { class: 'btn btn-xs btn-ghost border border-base-300' }, label);
      b.addEventListener('click', () => { fn(); sync(); });
      return b;
    };
    // ONE VOCABULARY. These were four chips over turn roles, which is a second
    // way of saying what the Options row now says once: Asks, Replies and Tool
    // calls decide which turns of an open card are in. What is left here is the
    // thing only this row can do, which is operate every card at once.
    //
    // Pinned above the scroll container, not inside it. Scrolling to card 12
    // and finding the controls gone is the standard failure of putting a
    // toolbar in the list it operates on.
    const setOpen = pred => {
      cardRows.forEach(r => r.setOpen(pred(r.ci)));
    };
    const quick = h('div', { class: 'shrink-0 flex flex-wrap items-center gap-1.5 border-b border-base-300 bg-base-100 px-2.5 py-2' },
      h('span', { class: 'text-[11px] uppercase tracking-wide text-base-content/40 mr-0.5' }, 'Cards'),
      chip('Open all', () => setOpen(() => true)),
      chip('Close all', () => setOpen(() => false)));

    // ── the card list ──
    const list = h('div', { class: 'flex flex-col' });
    // Per-row repaints, run by sync(). A row cannot read `openCards` on its own
    // schedule: "Open all" changes twenty rows at once.
    const paint = [];

    line.forEach((card, ci) => {
      const turns = m.cards[ci];

      const title = h(opts.onOpen ? 'button' : 'div', {
        // The conversation carries the weight; the work is set quieter and a
        // notch smaller, which is the same information the guideline gives,
        // said again in a channel that survives a colour-blind reader.
        class: 'block w-full truncate text-left leading-snug '
          + (card.kind === 'work' ? 'text-[14px] font-normal text-base-content/70 '
                                  : 'text-[15px] font-medium sm:text-sm ')
          + (TITLE_CLS[card.source] || '')
          + (opts.onOpen ? ' hover:underline decoration-primary/40 underline-offset-2' : ''),
      }, card.title);
      if (opts.onOpen) title.addEventListener('click', () => opts.onOpen(ci));

      // The disclosure holds the card's turns. Closed by default: the point of
      // an outline is that a dozen rows fit on a phone, and expanding every
      // card puts two hundred there instead.
      const turnBox = h('div', { class: 'hidden flex-col gap-0.5 pt-2 pl-4 pr-1' });
      const turnsWord = card.turns + (card.turns === 1 ? ' turn' : ' turns');
      const expandIcon = h('i', { class: 'ph ph-caret-down text-xs opacity-70' });
      // The expander is the turn count itself. It used to be a chevron at the
      // row's right edge, sitting exactly where a navigation chevron sits, so
      // the row offered two controls that looked like one and neither said
      // which it was. Now the inline count reveals in place and the right-hand
      // caret goes to the deck: read here, or read there.
      const expand = h('button', {
        class: 'inline-flex shrink-0 items-center gap-1 rounded-md border border-base-300 '
             + 'px-1.5 py-0.5 font-mono text-xs text-base-content/60 '
             + 'hover:border-primary/40 hover:text-primary',
        'aria-label': 'Show this card\'s ' + turnsWord,
      }, turnsWord, expandIcon);
      let built = false;
      // Open state lives in `openCards`, not in the DOM, so "Open all" and one
      // reader's tap go through the same door and the row can never disagree
      // with the selection it is standing for.
      const setOpen = (want) => {
        // ONE REPRESENTATION. This used to draw its own turn, a role word over
        // plain text with a truncation invented here, beside the deck's version
        // of the same turn drawn by chat-render. Two renderings of one thing,
        // and the reader met both within two taps. `sessionRender.card` is the
        // deck's slide body, so an open card here reads exactly as it reads
        // there: the ask in its fill, the reply as markdown, a run of tool
        // calls folded to one line.
        //
        // Async because markdown needs `marked`, which chat-render loads on
        // ready(). Every host reaches this after that resolves, so the row is
        // not seen empty in practice; the await is what makes `index()` safe to
        // call from one that has not.
        if (want && !built) {
          built = true;
          // `dense`, which is chat-render's panel density: the role and clock
          // fold into the turn's first line and the ask takes its fill. That is
          // the treatment the Activity popover shows and the one asked for
          // here. The deck stays undense because a slide is a page, and that is
          // one renderer at two densities rather than two renderers.
          SR().card(turns, turnBox, { dense: true, collapse: 280 });
        }
        want ? openCards.add(ci) : openCards.delete(ci);
        turnBox.classList.toggle('hidden', !want);
        expandIcon.className = 'ph ' + (want ? 'ph-caret-up' : 'ph-caret-down') + ' text-xs opacity-70';
      };
      expand.addEventListener('click', () => { setOpen(!openCards.has(ci)); sync(); });
      cardRows.push({ ci, setOpen });

      const go = opts.onOpen ? h('button', {
        class: 'btn btn-ghost btn-sm btn-circle shrink-0 -mr-1 text-base-content/30 hover:text-primary',
        title: 'Read card ' + (ci + 1) + ' in the deck',
        'aria-label': 'Read card ' + (ci + 1) + ' in the deck',
      }, h('i', { class: 'ph ph-cards-three text-lg' })) : '';
      if (opts.onOpen) go.addEventListener('click', () => opts.onOpen(ci));

      // No horizontal divider. The left rule already segments the conversation,
      // and an underline on every row drew a second grid that agreed with
      // nothing: it closed the ask rows and the answer rows at a boundary the
      // left rule had already drawn, and boxed the work rows for no reason at
      // all.
      //
      // Padding is uniform, so every checkbox sits at one x whether or not its
      // row carries a rule. Work rows used to take a deeper indent, on the
      // theory that the doing reads as the body of the ask above it. In
      // practice it just moved the control column, and a column of checkboxes
      // that wanders is a worse cost than the nesting was a gain: `kind` is
      // still said three other ways (the rule, the role word's colour, the
      // title's weight and size).
      //
      // `mb-1` is the gap between adjacent rules. Without it a clay row
      // followed by a blue one draws a single unbroken line that changes
      // colour partway down, which reads as one rule rather than two.
      // WHAT IS IN, SHOWN BY THE ROW rather than by a control on it. The
      // checkbox column is gone and a tint takes its job: scrolling a long
      // list, the reader sees which exchanges they have picked without reading
      // a column of marks. One accent, and here it means "this is in the copy".
      // The tint rides the ROW, not the whole card. Over an expanded card it
      // filled the screen and read as a selected block of text rather than as
      // a mark on a list, which is the opposite of what it is for: the reader
      // scanning for what they have picked is looking at the rows.
      const head = h('div', { class: 'flex items-center gap-2.5 rounded-md px-1.5 -mx-1.5 py-1 transition-colors' },
          h('span', { class: 'font-mono text-[11px] tabular-nums text-base-content/30 w-4 shrink-0 text-right' },
            String(ci + 1)),
          h('div', { class: 'min-w-0 flex-1' },
            title,
            h('div', { class: 'mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1' },
              roleTag(card.role),
              card.ts ? h('span', { class: 'font-mono text-xs text-base-content/50' }, card.ts) : '',
              expand,
              card.ran ? h('span', { class: 'font-mono text-xs text-base-content/50 truncate' }, card.ran) : '')),
          go);
      const box = h('div', {
        class: 'mb-1 border-l-2 py-2 pl-3 pr-2.5 ' + (RULE[card.kind] || RULE.work),
      }, head, turnBox);
      paint.push(() => {
        const on = openCards.has(ci);
        head.classList.toggle('bg-primary/10', on);
        expand.classList.toggle('border-primary/40', on);
        expand.classList.toggle('text-primary', on);
        expand.setAttribute('aria-expanded', String(on));
      });
      list.append(box);
    });

    const pre = h('pre', { class: 'hidden whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-relaxed' });
    const scroll = h('div', { class: 'min-h-0 grow overflow-y-auto' }, list, pre);

    // ── the export bar, absent until something is picked ──
    const toggle = (key, label, title) => {
      const box = h('input', { type: 'checkbox', class: 'checkbox checkbox-xs' });
      box.checked = !!o[key];
      box.addEventListener('change', () => { o[key] = box.checked; sync(); });
      return h('label', { class: 'flex items-center gap-1.5 cursor-pointer', title: title || '' },
        box, h('span', { class: 'text-[11px]' }, label));
    };
    // The first three say WHICH turns of an open card are in; the rest say how
    // much of them renders. That order is the reading, so it is the layout.
    const toggles = h('div', { class: 'hidden flex-wrap items-center gap-x-3 gap-y-1.5 pb-2' },
      toggle('asks', 'Asks', 'Your turns'),
      toggle('replies', 'Replies', "Claude's prose, tool calls excluded"),
      toggle('args', 'Tool calls', 'The command, path or pattern each tool ran with'),
      toggle('bodies', 'Tool results', 'What came back. Usually most of the bytes.'),
      toggle('stamps', 'Times'),
      toggle('head', 'Header'),
      toggle('caveats', 'Capture gaps', "What the record could not hold"));

    const stat = h('span', { class: 'pb-1.5 font-mono text-[11px] tabular-nums text-base-content/50' }, '');
    const optBtn = h('button', { class: 'btn btn-xs btn-ghost border border-base-300' }, 'Options');
    optBtn.addEventListener('click', () => toggles.classList.toggle('hidden'));
    const previewBtn = h('button', { class: 'btn btn-xs btn-ghost border border-base-300' }, 'Preview');
    previewBtn.addEventListener('click', () => {
      const showing = !pre.classList.contains('hidden');
      pre.classList.toggle('hidden', showing);
      list.classList.toggle('hidden', !showing);
      quick.classList.toggle('hidden', !showing);   // the chips operate the list, not the preview
      previewBtn.textContent = showing ? 'Preview' : 'Outline';
      if (!showing) { pre.textContent = out; scroll.scrollTop = 0; }
    });
    const dlBtn = h('button', { class: 'btn btn-xs btn-ghost btn-circle', 'aria-label': 'Download .md', title: 'Download .md' },
      h('i', { class: 'ph ph-download-simple text-sm' }));
    dlBtn.addEventListener('click', () => { if (out) download(out, (record.short || 'session') + '-excerpt.md'); });
    const copyBtn = h('button', { class: 'btn btn-xs btn-primary gap-1' },
      h('i', { class: 'ph ph-copy text-sm' }), h('span', {}, 'Copy'));
    copyBtn.addEventListener('click', async () => {
      if (!out) return;
      const ok = await copyText(out);
      copyBtn.lastChild.textContent = ok ? 'Copied' : 'Failed';
      copyBtn.firstChild.className = 'ph ' + (ok ? 'ph-check' : 'ph-warning') + ' text-sm';
      setTimeout(() => {
        copyBtn.lastChild.textContent = 'Copy';
        copyBtn.firstChild.className = 'ph ph-copy text-sm';
      }, 1400);
    });

    const bar = h('div', { class: 'hidden shrink-0 flex-col border-t border-base-300 bg-base-100 px-2 pt-2 pb-2' },
      toggles,
      // The count sits on its own line rather than beside the buttons. Four
      // controls plus the FAB clearance leave about 106px at phone width and
      // the reading needs ~125px, so inline it wrapped to two lines and read
      // as a layout accident rather than a choice.
      stat,
      // pr on narrow: gh-boot's FAB is fixed to the viewport's bottom-right and
      // lands on Copy at phone width. Above `sm` the container is centred and
      // the FAB falls outside it, so the padding is dropped.
      h('div', { class: 'flex items-center gap-1.5 pr-[4.75rem] sm:pr-0' },
        h('div', { class: 'grow' }), optBtn, previewBtn, dlBtn, copyBtn));

    function sync() {
      paint.forEach(f => f());
      sel = select();
      out = sel.size ? markdown(record, sel, { ...o, model: m }) : '';
      bar.classList.toggle('hidden', !openCards.size);
      if (!sel.size && !pre.classList.contains('hidden')) previewBtn.click();
      // THE COUNT MOVES AS YOU DECIDE, which is what makes it worth showing.
      // It used to be a fact about the record; now it is the size of the thing
      // about to land on the clipboard, changing with every card opened, so a
      // reader building an excerpt can see it getting too big before they paste.
      stat.textContent = openCards.size
        ? `${openCards.size} card${openCards.size === 1 ? '' : 's'}`
          + ` · ${sel.size} turn${sel.size === 1 ? '' : 's'} · ${size(out)}`
        : '';
      stat.title = sel.size ? sizeLong(out) : '';
      if (!pre.classList.contains('hidden')) pre.textContent = out;
    }

    el.append(quick, scroll, bar);
    // `startCard` is recorded above and drawn here: the row's turns are built
    // lazily, so the card the deck was on has to be opened through the row
    // rather than by adding an index nothing rendered.
    if (start != null) cardRows.find(r => r.ci === start)?.setOpen(true);
    sync();
    return { el, get selectedCount(){ return sel.size; }, markdown: () => out };
  }

  // ── There is no takeover, and there was never a reason for one ────────────
  //
  // `open()` mounted this same list over everything, and exactly one thing in
  // the estate called it: the deck's own header button. So the route read
  // list -> deck -> a second copy of the list, and a reader who went forward
  // twice arrived back where they started, differently drawn. Reported three
  // times across 2026-09-01, and each time this file answered by making the two
  // copies look more alike, which only made the second one harder to explain.
  //
  // Its comment claimed a second caller, show-repo's Sessions pane. That was
  // false: the pane mounts alpineComponents/session-brief.js, which mounts
  // `index()` inline like every other host.
  //
  // The list has one mount per host and the deck no longer offers a route to
  // another. Dismissing the deck is the way back to the list it was entered
  // from, which is where the copy bar lives. The deck keeps its own index
  // sheet on the header mark, and that is not a third copy: it is a dropdown
  // that jumps between slides and carries no selection.

  window.sessionExport = { model, markdown, index, copyText, DEFAULTS };
})();
