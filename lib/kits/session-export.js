// session-export.js — a session as a list of exchanges, plus the pure function
// that turns any part of one into markdown.
//
// ── The picker that was here, and the button that briefly replaced it ──────
//
// Until 2026-09-06 this file ran a selection MODE over the list: a "Pick all /
// Clear" bar pinned above the rows, a pick control on every row, and an export
// bar carrying seven render toggles, an Options panel, a Preview panel, a size
// readout, Download and Copy. It went through three designs in a week and the
// reported objection never moved: it was hard to make sense of and it cost the
// top of the screen for something nobody reached for.
//
// It was replaced by one copy button per row, and that lasted a single commit.
// The same objection arrived one size smaller: a control on every line of a
// 36-line list, offering an action whose payload is invisible until after the
// tap, for a thing a reader would not do from a list they came to read. Both
// removals are the same finding. The mode was too much machinery for the job;
// the button was too much presence for the job.
//
// So the list has no copy control at all. The two things a reader does from a
// row are open its panel and enter the deck, and those are its two controls.
//
// ── What is left, and what has no caller ──────────────────────────────────
//
// `markdown()` is the pure half and it survives both removals: give it a record
// and a set of turn indices and it returns the excerpt, header block and all.
// Nothing in the estate calls it. `index()` is the kit's only entry point that
// anything reaches, from alpineComponents/session-brief.js.
//
// That is stated rather than left to be discovered. Whether the estate should
// be able to carry a session excerpt anywhere is a live question and a separate
// one from whether this list is the place to offer it; the answer to the second
// is no, and the first has not been asked. Deleting the pure half would also
// make this file's NAME wrong, since what would remain is the outline.
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
// caller makes, not a default that quietly ships a partial record as a whole
// one.
//
// ── Why detail is separate from selection ──────────────────────────────────
//
// Which turns to take and how much of each are different questions, and the
// second is where the size actually is: on the session that built this, tool
// result bodies were 78% of the bytes. The first three flags say which roles a
// caller wants and the rest govern how much of each renders, which is why
// bodies default off and arguments default on: a Bash turn with no command in
// it says nothing at all. The split is not cosmetic, and it is the caller's to
// operate: emit() gives a tool turn a heading whatever the render flags say,
// falling back to "(call only)", so a card holding 34 Bash calls cannot be
// reduced to its ask by rendering alone. Something has to drop the turn, and
// that something is the SELECTION the caller passes.
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

  // ── The overview ───────────────────────────────────────────────────────────
  // One row per card, titled by sessionRender.outline, and the same rows are
  // where an exchange is carried out. That is one surface doing two jobs on
  // purpose: both are "read the shape of this session as a list," and running
  // them apart meant the reader chose turns from a list of previews with no
  // titles while the titles lived nowhere at all.
  //
  // Nothing is selected and nothing is copied, so there is no state to draw, no
  // bar to appear and nothing to clear. The list reads as an outline, which is
  // all it now is.

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

  // ── What the left edge marks, and what it stopped marking ────────────────
  //
  // A guideline down each card keyed on `kind` until 2026-09-02: blue down the
  // asks, clay down the replies, nothing beside the work. Three things made
  // that wrong, and the row is two of them. Every row now shows a blue ask and
  // a clay reply, so the rule marked a SUBSET of them in the same two colours
  // for a different distinction; and the fact it encoded was `calls === 0`,
  // which the row prints in words as the tool tally. The third is that its blue
  // was a lie, since `ask` does not mean "you asked", it means the record kept
  // a prompt with no reply beside it, which is a capture gap.
  //
  // Nothing runs down the edge now. The conventions' CLOSING STATE took its
  // place and then left it, since a state is the reply's claim and belongs on
  // the reply's line; it is a third row of the exchange, drawn in the card loop
  // below, and that block carries the argument and the two readings tried
  // before it.
  const ROLE_CLS = {
    user: 'text-primary', assistant: '',
    tool: 'text-base-content/40', meta: 'text-warning',
  };

  // The row's gutter glyph, and it is chat-render's ROLES table read down one
  // column: the same icon per role and the same two tints, primary for the ask
  // and clay for the reply. The other roles stay neutral, which that kit
  // measured rather than assumed: this theme's `warning` and `info` sit near
  // 88% lightness, fine as a 2px rail and unreadable as an 11px glyph on white.
  const ROLE_ICON = {
    user: 'ph-user', assistant: 'ph-sparkle', system: 'ph-gear',
    tool: 'ph-wrench', meta: 'ph-note',
  };
  const ROLE_TINT = { user: 'var(--color-primary, currentColor)', assistant: CLAY };

  // `mt` is optical, not structural: the glyph hangs beside a line of text and
  // has to sit on its baseline, and the ask runs a size larger than the reply.
  function leadIcon(role, mt) {
    const el = h('i', { class: 'ph ' + (ROLE_ICON[role] || ROLE_ICON.meta) + ' text-[11px] leading-none '
      + mt + (ROLE_TINT[role] ? ' opacity-80' : ' opacity-40') });
    if (ROLE_TINT[role]) el.style.color = ROLE_TINT[role];
    return el;
  }

  // ── One line of markdown, reduced for a row and still emphasised ──────────
  //
  // readAloud.speechText is the estate's one markdown-to-prose pass, and it
  // takes `**` off along with the fences, the link targets and the emoji. That
  // is right for a voice and wrong for a row: what an author set bold is the
  // half a reader scans for, and both of this row's reduced lines open on one
  // ("Ready to continue.", "A term that names an intention instead of a
  // form."). Reported from the phone on 2026-09-02, on the state line.
  //
  // So the runs are split on emphasis FIRST and reduced one at a time, which
  // keeps every bold span rather than only a leading one. speechText trims, so
  // the whitespace at each boundary is carried across by hand: without it
  // "Merged." and "It shipped." arrive as one word. A run that reduces to
  // nothing is dropped, so a line of pure emphasis cannot leave an empty span.
  function richLine(md, cls) {
    const el = h('span', { class: cls });
    const reduce = (t) => (window.readAloud?.speechText?.(t) || t || '').replace(/\s+/g, ' ').trim();
    const src = String(md || '');
    const runs = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0, m;
    while ((m = re.exec(src))) {
      if (m.index > last) runs.push({ raw: src.slice(last, m.index), bold: false });
      runs.push({ raw: m[1], bold: true });
      last = m.index + m[0].length;
    }
    if (last < src.length) runs.push({ raw: src.slice(last), bold: false });
    let prev = '';
    for (const r of runs) {
      const t = reduce(r.raw);
      if (!t) continue;
      // EITHER SIDE OF THE BOUNDARY, because emphasis puts the space on the
      // outside: `Yes. **A term…**` splits into a run ending in a space and a
      // bold run whose raw text is the inner slice and starts with a letter.
      // Testing only the incoming run gave "Yes.A term that names".
      if (el.childNodes.length && (/^\s/.test(r.raw) || /\s$/.test(prev))) el.append(' ');
      el.append(r.bold ? h('span', { class: 'font-semibold text-base-content/80' }, t) : t);
      prev = r.raw;
    }
    return el;
  }

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
   *                    neither is a link
   *   plus the DEFAULTS flags, which govern what a copied card renders
   * Returns { el }.
   *
   * `opts.startCard` was here and is gone with the selection it opened: there
   * is nothing left for a card to be opened INTO. A host that wants to land a
   * reader on one card sends them to the deck, which is what `onOpen` is.
   */
  function index(record, opts = {}) {
    const m = model(record);
    const line = SR().outline(record);
    const o = { ...DEFAULTS, ...opts };

    const el = h('div', { class: 'flex h-full flex-col min-h-0' });

    // ── The peek panel, which replaced the expansion ──────────────────────
    //
    // The row expanded in place until 2026-09-02, and the expansion rendered
    // every assistant turn whole. That is not what was asked for ("expand the
    // truncated part but not expand the whole thing") and the overshoot is what
    // the last two rounds were patching: a card opened to nine screens, so it
    // grew a height cap, and the cap needed a ring to say which card it was.
    //
    // A panel under the line instead, and one per HALF: the ask has its own and
    // the reply has its own, because they are separate things to want and the
    // row now says so. Asked for as a tooltip; it cannot be one. kits/note.js
    // draws its panel `pointer-events:none` on purpose and its own contract
    // draws the line here: the moment a note's content needs a tap, which a
    // reply's links and code spans do, it is a panel. So this is a panel, with
    // the reach a panel owes: focusable triggers, `aria-expanded`, Escape, and
    // a close button.
    //
    // ONE PANEL, MOVED. It is appended into whichever card owns the open half,
    // which is what lets `offsetTop` position it: the box is the positioned
    // ancestor, so the panel hangs under the line that was tapped and scrolls
    // with the list rather than needing a scroll listener to chase it.
    const peekBody = h('div', {});
    const peekTitle = h('span', { class: 'text-[11px] uppercase tracking-wide text-base-content/50' });
    const peekShut = h('button', {
      class: 'btn btn-ghost btn-xs btn-circle -mr-1 text-base-content/40',
      'aria-label': 'Close', title: 'Close',
    }, h('i', { class: 'ph ph-x text-sm' }));
    const peek = h('div', {
      // A MEASURE, not the card's width. It spanned the whole card, so at 1280
      // the panel ran 1,230px and its 13px prose crossed 150 characters a line,
      // which is not what a popover is. 34rem is about 68 characters at that
      // size. `left` and `right` are both still set, so a narrow screen keeps
      // the full span and the cap simply does not bite; with both set and no
      // auto margins the box is over-constrained and hugs the left, which is
      // the card's own edge.
      class: 'hidden absolute left-2 right-2 z-30 max-w-[34rem] max-h-[min(60vh,26rem)] overflow-y-auto '
        + 'overscroll-contain scrollbar-thin rounded-xl border border-base-300 bg-base-100 '
        + 'px-3 pb-3 pt-2 shadow-xl',
      role: 'group',
    },
      h('div', { class: 'mb-1 flex items-center justify-between gap-2' }, peekTitle, peekShut),
      peekBody);
    // ── Hover on a fine pointer, tap on a coarse one ──────────────────────
    // Asked for on 2026-09-02: a reader running a mouse down the list wants the
    // half under it, not a click per row. The timings and the shape are
    // kits/note.js's, deliberately: a dwell before opening so a pointer
    // crossing the row does not flash a panel at it, and a grace after leaving
    // so a wobble does not.
    //
    // THE GRACE IS ALSO WHAT LETS THE PANEL BE ENTERED, which is the one place
    // this parts from that kit. Its panel is `pointer-events:none`, so leaving
    // the trigger is the whole rule; this one scrolls and carries a close
    // button, so the rule is the full one from mechanics.md: close after
    // leaving BOTH. The panel clears the timer on the way in and re-arms it on
    // the way out, and the 220ms covers the gap between the two.
    //
    // Gated on `(hover: hover)` rather than on the pointer type of the event,
    // because a touch screen synthesises a hover on tap: without the gate the
    // dwell and the tap would both fire and the panel would open and toggle
    // itself shut.
    const HOVER_MS = 140, LEAVE_MS = 220;
    let hoverT = null, leaveT = null;
    const canHover = () => !window.matchMedia || window.matchMedia('(hover: hover)').matches;
    let peekAt = null;                      // { key, trigger }
    const shutPeek = () => {
      peek.classList.add('hidden');
      if (peekAt) {
        peekAt.trigger.setAttribute('aria-expanded', 'false');
        const rule = peek.parentElement?.querySelector(':scope > .pointer-events-none');
        if (rule) rule.style.opacity = '';       // hand it back to :hover
      }
      peek.remove();
      peekAt = null;
    };
    // A second tap on the same half closes it, which is what makes the trigger
    // a toggle rather than a one-way door.
    const showPeek = (key, trigger, host, label, fill) => {
      clearTimeout(leaveT);
      if (peekAt && peekAt.key === key) return shutPeek();
      shutPeek();
      peekTitle.textContent = label;
      peekBody.replaceChildren();
      fill(peekBody);
      host.append(peek);
      peek.style.top = (trigger.offsetTop + trigger.offsetHeight + 6) + 'px';
      peek.classList.remove('hidden');
      peek.scrollTop = 0;
      trigger.setAttribute('aria-expanded', 'true');
      const rule = host.querySelector(':scope > .pointer-events-none');
      if (rule) rule.style.opacity = '1';        // and it stays lit while open
      peekAt = { key, trigger };
    };
    peekShut.addEventListener('click', (e) => { e.stopPropagation(); shutPeek(); });
    const armLeave = () => { clearTimeout(leaveT); leaveT = setTimeout(shutPeek, LEAVE_MS); };
    // ── GATED ON A POINTER THAT CAN HOVER, like the trigger's pair below ─────
    // These two were not, and that is the whole of a reported defect: on a
    // touch screen, tapping INSIDE the panel closed it. Lifting a finger fires
    // pointerout with a null relatedTarget, `peek.contains(null)` is false, and
    // the leave timer ran, so the panel vanished 220ms after being touched.
    // Measured 2026-09-07 at 430x932 with hasTouch: open, still open at 50ms,
    // gone by 500.
    //
    // The trigger's own hover handlers already carry this gate, for the
    // adjacent reason stated there: a touch screen synthesises a hover on tap,
    // so ungated they would open and toggle shut in one gesture. Same cause,
    // two symptoms, and this half was missed.
    //
    // Dismissal on a coarse pointer is unaffected and is the whole set it ever
    // had: the close button, Escape, an outside pointerdown, or a second tap on
    // the row. None of those is a hover.
    peek.addEventListener('pointerover', () => { if (canHover()) clearTimeout(leaveT); });
    peek.addEventListener('pointerout', (e) => {
      if (!canHover()) return;
      if (!peek.contains(e.relatedTarget)) armLeave();
    });
    // Dismissal, hung on the component root rather than on `document`: this
    // index is mounted per swiper slide, so a document listener would outlive
    // every copy of it. Capture phase, since a trigger stops propagation.
    //
    // ── AND IT MUST NOT REACH THE OPEN PANEL'S OWN TRIGGER ───────────────────
    // This ran BEFORE the click that toggles, so a second tap on the row that
    // opened the panel shut it here, cleared `peekAt`, and then `showPeek` saw
    // no open panel and opened it again. Shut and reopened inside one gesture
    // reads as nothing happening, which is not what the toggle above promises.
    // Measured 2026-09-07 with hasTouch: tapping row 7 correctly MOVED the
    // panel there, and tapping row 2 twice left it on row 2 both times.
    //
    // It bites a mouse identically and is invisible there, because the hover
    // that opened the panel is still holding it open.
    //
    // Excluding the owning trigger leaves every other route exactly as it was:
    // another row shuts this panel and opens its own, and anywhere else in the
    // list just shuts.
    el.addEventListener('pointerdown', (e) => {
      if (peekAt && !peek.contains(e.target) && !peekAt.trigger.contains(e.target)) shutPeek();
    }, true);
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && peekAt) shutPeek(); });

    // A trigger is a clamped line, so it cannot be a `button`: Safari sizes one
    // from its UNCLIPPED content and the row would stand at its full height
    // with the text clipped inside it, which this branch already shipped once
    // (snags: safari-button-sizes-from-unclipped-content). `role` and a
    // tabindex buy the same reach without the box.
    const asTrigger = (el, key, host, label, fill) => {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-expanded', 'false');
      el.classList.add('cursor-pointer');
      const go = (e) => { e.stopPropagation(); showPeek(key, el, host, label, fill); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); }
      });
      el.addEventListener('pointerover', () => {
        if (!canHover()) return;
        clearTimeout(leaveT);
        if (peekAt && peekAt.key === key) return;
        clearTimeout(hoverT);
        hoverT = setTimeout(() => showPeek(key, el, host, label, fill), HOVER_MS);
      });
      el.addEventListener('pointerout', (e) => {
        if (!canHover()) return;
        clearTimeout(hoverT);
        if (!el.contains(e.relatedTarget)) armLeave();
      });
      // NO OPEN-ON-FOCUS, which the note kit does have. Focus lands before
      // click, so a mouse tap would open on focus and then toggle itself shut
      // on the click a moment later. Enter and Space above are what a keyboard
      // uses, and they run the same toggle a finger does.
      return el;
    };

    // ── the card list ──
    const list = h('div', { class: 'flex flex-col' });
    // NO REPAINT PASS. There was one, an array of per-row closures run by
    // sync(), because "Pick all" changed twenty rows at once and a row could
    // not read the shared selection on its own schedule. With the selection
    // gone every row owns everything it draws, and nothing on a row changes
    // after its first paint.

    line.forEach((card, ci) => {
      const turns = m.cards[ci];

      // THE ROW IS THE ASK, clamped. It was `card.title`, one truncated line of
      // a sentence the titler picked, and expanding replaced it with a whole
      // rendered card: nothing on the surface, then everything. Asked for on
      // 2026-09-01, "expand the truncated part but not expand the whole thing,
      // so you see a little bit more on the surface."
      //
      // So the row carries the ask's own words at two lines closed and all of
      // them open, and the replies arrive under it. A card with no ask (the
      // capture note, the closing summary) keeps the titler's line, which is
      // the only text it has.
      const ask = turns.find(t => t.role === 'user');
      const lead = (ask?.md || '').trim() || card.title;

      const title = h('div', {
        // ONE TREATMENT FOR EVERY ASK, and it branches on whether the card HAS
        // one rather than on `kind`. It read `kind === 'work'` until
        // 2026-09-02, quiet for an exchange that ran tools and `font-medium` a
        // notch larger for one that did not, which put two of the reader's own
        // prompts on one screen in two different weights for a reason that has
        // nothing to do with either of them. Reported from the phone as the ask
        // being bold "for some reason", which is exactly right: the reason was
        // `calls === 0`, and the row prints that in words as the tool tally.
        //
        // It was the last carrier of a distinction this file already retired
        // once. The guideline down the edge encoded the same fact and went for
        // the same reason; this survived because type is quieter than a rule
        // and nobody looked at two rows side by side.
        //
        // A card with NO ask keeps the heavier line, and that is not the same
        // rule wearing a disguise: the capture note and the closing summary
        // have no prompt, so the titler's sentence IS the card's heading and
        // has no blue fill to mark it.
        // NO `block` HERE. It and `line-clamp-2` both set `display`, and `block`
        // won, so the clamp emitted its -webkit-line-clamp against a display it
        // does not apply to and every row rendered whole: measured 2026-09-01 at
        // 269px on the first row, with `display: block` and
        // `-webkit-line-clamp: 2` sitting side by side in the computed style.
        // The clamp utility supplies the display it needs.
        //
        // `w-fit max-w-full` is the fill's shape, and it is CSS doing what
        // chat-render measures for. That kit pins the tint to the longest
        // rendered line on the next frame, because a block-level fill under a
        // three-word ask is a bar of colour running the whole card: the shape
        // says panel where the content says sentence. Here the intrinsic width
        // answers it: max-content is the unwrapped ask, so a short one hugs and
        // a long one caps at the column and wraps. No measurement, no frame.
        class: (ask ? 'w-fit max-w-full ' : 'w-full ') + 'text-left leading-snug line-clamp-2 '
          + (ask ? 'text-[13px] font-normal '
                 : 'text-[15px] font-medium sm:text-sm ')
          + (ask ? '' : (TITLE_CLS[card.source] || '')),
      }, lead);
      // BLUE IS FOR WHAT I SAID, and this row is the last surface that did not
      // say so (asked for 2026-09-01). The deck's slide body and the Activity
      // popover both render a turn through chatRender.message in dense mode,
      // where the ask sits in a primary fill and the reply hangs under it in
      // clay. The row is a preview and cannot call that renderer, since
      // markdown and a two-line clamp do not compose, so it carries the two
      // marks itself: the same color-mix off the theme's primary, the same 3px
      // radius, the same tight padding.
      //
      // Inline rather than a `bg-primary/*` class, so it tracks a theme change
      // the way chat-render's does and so the tests' open-row count does not
      // find every ask. THE ROW'S OWN TINT IS NEUTRAL FOR THIS: it was
      // bg-primary/10 and the two blues stacked, which put a blue block inside
      // a blue row and made one colour carry two claims. Primary means one
      // thing on this list now, and it is what I said.
      if (ask) {
        title.style.background = 'color-mix(in oklch, var(--color-primary, currentColor) 11%, transparent)';
        title.style.padding = '3px 5px';
        title.style.borderRadius = '3px';
        // ── ONE COLOUR FOR THE ASK, AND IT IS BLUE ─────────────────────────
        // The row set it in `base-content/70`, a grey, while the panel showed
        // the same words in chat-render's ask colour, a primary darkened to
        // 78%: two readings of one prompt, one above the other. Asked for on
        // 2026-09-02 as consistency, and blue is the one that already means
        // "what I said" everywhere in this estate. Off the THEME's primary
        // rather than a literal, so the text tracks a theme change the way its
        // own fill does; kits/chat-render.js sets it the same way.
        //
        // AND DENSER WITH IT, 13px against the 14 it had. The ask was the
        // largest thing on the row while being its context, and the reply
        // preview under it runs 13; one size for both is what makes the pair
        // read as one exchange rather than a heading and a note.
        title.style.color = 'color-mix(in oklch, var(--color-primary, currentColor) 78%, black)';
      }
      // An ask is a user turn whatever the card's own kind says, and a card
      // with none takes its role's glyph: the capture note is a note and the
      // closing summary is Claude speaking, which is what the reader needs the
      // gutter to say where there is no blue block to say it.
      const leadMark = leadIcon(ask ? 'user' : card.role, ask ? 'mt-[7px]' : 'mt-[5px]');

      // WHAT OPENS IS THE REST OF THE CONVERSATION, not the card. The ask is
      // already above, unclamped; a run of tool calls is already summarised on
      // the row as "34× Bash"; and the record's capture note is a meta turn the
      // deck's first card carries and this list has no use for, said a third
      // time under every open row. What is left is the prose that answers, and
      // that is the thing a reader opened the row to see.
      const replies = turns.filter(t => t.role === 'assistant');

      // THE OTHER HALF, ON THE SURFACE. Every closed row said "You" and showed
      // one side of a conversation, so the list read as half a story and what
      // came back was a tap away (reported 2026-09-01). One clamped line of the
      // reply answers it without doubling the row.
      //
      // The LAST reply, not the first. A work exchange usually opens with the
      // sentence that introduces the work ("Let me check where it stands rather
      // than guess"), which says nothing about how it turned out; the last turn
      // is the answer. Same reading the brief's own closing-reply block takes
      // for a whole session.
      //
      // Reduced through readAloud.speechText, which is this estate's one
      // markdown-to-plain-prose pass: a preview line wants exactly what a spoken
      // line wants, the link's label and not its URL, no fences, no emoji. Where
      // the kit is not loaded the raw text still previews, markers and all,
      // which is worse to look at and never wrong.
      const last = replies[replies.length - 1];
      const answer = last && (window.readAloud?.speechText?.(last.md) || last.md || '')
        .replace(/\s+/g, ' ').trim();
      const turnsWord = card.turns + (card.turns === 1 ? ' turn' : ' turns');

      // A READOUT, not a control, AND IT HAS TO LOOK LIKE ONE. It was a bordered
      // pill with a caret, which is a dropdown everywhere else on this page, so
      // a reader tapped it for a list of turns and got the row's own expand
      // (reported 2026-09-01). The row IS the control and a second one inside
      // it would be the duplication this list has already been through twice.
      // So the box goes and the caret stays: a count and a state, set like the
      // clock beside it, with nothing left to read as tappable.
      // A COUNT, and nothing else now. It carried a caret while the row
      // expanded; with the expansion gone the caret pointed at nothing, and a
      // caret that opens nothing is the pill-that-looked-like-a-dropdown defect
      // this row already fixed once.
      const expand = h('span', {
        class: 'inline-flex shrink-0 items-center font-mono text-xs text-base-content/50',
      }, turnsWord);

      // AIR, BUT NO SECOND LINE. The mark was glued under the ask, which read as
      // a continuation of it, so `mt-2` opens the exchange and the ask now
      // closes on its own fill. It got a `Claude` header for one commit and
      // that was a line too many: on a list, a word repeated down every row is
      // a column of the same fact, and the clay glyph already says it in the
      // space the text was going to use. The deck's dense mode drops the word
      // for the same reason and this file follows it.
      //
      // TWO CELLS, NOT A NESTED ROW. The mark rides the row's own gutter beside
      // the ask's, so both texts start on one edge; see the grid below.
      const replyMark = answer ? h('i', { class: 'ph ph-sparkle mt-[9px] text-[11px] leading-none',
                                          style: 'color:' + CLAY }) : null;
      const replyText = answer
        ? richLine(last.md, 'mt-1.5 line-clamp-1 text-[13px] leading-snug text-base-content/70')
        : null;
      // SHOWN AND HIDDEN BY STYLE, not by `hidden`. That utility sets `display`
      // and so does `line-clamp-1`, which is the collision this file has now
      // shipped twice; an inline display beats both classes and restoring it to
      // '' hands the clamp back its own.

      // ── Where the exchange arrived, on the reply's own side ───────────────
      // One line per closing state, under the reply it closes: the mark in the
      // row's gutter and the closing block's own words beside it, clamped to
      // one line like the reply above.
      //
      // IT WAS A DOT BESIDE THE ASK until 2026-09-02, hung in the box's left
      // pad at the height of the first line, which put the ASSISTANT's claim
      // about where the work arrived on the row that carries what the READER
      // said. Reported the same day. Moving it under the reply also buys the
      // thing a bare mark could never carry: the 🟢 lead reads "Ready to
      // continue" on every row it appears, and the sentence after it names the
      // work that was on offer, which is the whole content of the state.
      //
      // Deduped by key, last claim winning, and that is not the tidiness the
      // old dot's dedupe was. Two assistant turns in one exchange each closing
      // 🟢 are two versions of one offer, and the later one is the live one; a
      // 🆚 followed by a 🟢 is two different claims and keeps both lines, in
      // the order they were made.
      const closings = [];
      for (const c of (card.states || [])) {
        const at = closings.findIndex(x => x.key === c.key);
        if (at === -1) closings.push(c); else closings[at] = c;
      }
      const CS = window.ClosingState;
      const stateEls = [];
      for (const c of closings) {
        // A DISC, NOT THE EMOJI, in the same gutter the role glyphs use. The
        // marker drawn at 11px is a filled circle with the weight of an icon,
        // so it competed with the sparkle directly above it; at 6px it reads
        // as a mark on that line rather than a second role.
        //
        // AND NO `data-note`, which it carried while it was a bare dot beside
        // the ask. It is inside the row's button now, and the note kit listens
        // on pointerdown in the capture phase without stopping propagation, so
        // one tap would open a panel AND expand the card: the two-doors defect
        // this file has already fixed twice. The gloss is not lost, because the
        // words are on the line beside it; the disc is the scan colour and
        // `aria-hidden` because the text says the same thing.
        //
        // `mt-[10px]` is the third reading of this one pixel, and the two it
        // sits between are both defensible. At 6px the disc was 3.5px high and
        // simply wrong. At 9px it was centred on the LINE BOX to within half a
        // pixel and still read high, because the ink of a lowercase line sits
        // in the x-band, which for 13px system text runs from 6.8px above the
        // baseline and centres 1.6px lower than the box. At 11px it sat on that
        // band and read low, since the line opens on a capital and the disc
        // then hangs under it. So it splits them: 0.5px under the box centre,
        // 0.6px over the band. Every number here was probed on the rendered
        // page with spans at `vertical-align: baseline` and `text-top`, not
        // taken from font tables.
        const mark = h('span', {
          class: 'mt-[10px] block size-[6px] shrink-0 justify-self-center rounded-full',
          'aria-hidden': 'true' });
        mark.style.background = CS?.HUE?.[c.key] || 'transparent';
        //
        // INDENTED UNDER THE REPLY, not sitting beside it. It rode the row's
        // own gutter until 2026-09-02, which put it in the column the user and
        // sparkle glyphs occupy and made it read as a third turn. It is not
        // one: a closing state is a passage INSIDE the reply above it, and
        // drawing it as that reply's sibling says the exchange had three
        // speakers. Reported as exactly that, a peer where the content is
        // nested.
        //
        // One step in, and the step is the row's own: a nested 11px track plus
        // the same gap makes 17px, which is chat-render's LEAD_INDENT and the
        // measure the open body already hangs on. So the state text starts
        // where a wrapped line of the reply would.
        // THE BOLD LEAD STAYS, and it is not decoration. Dropped, the line runs
        // "A alone, A plus the two proposed tasks, or hold everything", and the
        // only thing saying that was a decision put to the reader is a pink
        // dot; the row has to survive without its colour. It costs about a
        // third of the line for `ready`, which is the price of that.
        // And it is set bold, because it was bold where it was written; see
        // richLine, which the reply preview above goes through for the same
        // reason.
        const line = richLine(c.text, 'mt-1 line-clamp-1 text-[13px] leading-snug text-base-content/70');
        stateEls.push(h('div', {
          class: 'col-start-2 grid min-w-0 gap-x-1.5',
          style: 'grid-template-columns:11px minmax(0,1fr)',
        }, mark, line));
      }

      // ONE CONTROL PER DESTINATION. Tapping the item opens it, which is the
      // cheap move and the common one; the glyph goes to the deck. It was the
      // other way round, with the title AND the glyph both entering the deck
      // and a pill doing the expanding, so the row offered two doors to one
      // place and hid the third behind a chip.
      //
      // A GRID, BECAUSE THE ALIGNMENT IS THE POINT. The row was a numbered
      // gutter and one text column, with the reply's mark INSIDE that column:
      // so the ask started at the column edge and the answer started a glyph
      // and a gap further in, and the two halves of one exchange did not line
      // up. Asked for on 2026-09-01, against the Activity popover, which is
      // chatRender's dense mode: every glyph in one gutter, every text on one
      // edge. A fixed first track is what makes that exact rather than close,
      // and it is why this is a grid and not two nested flex rows.
      //
      // AND THE NUMBER IS GONE, which the same ask proposed. It was a mono
      // column of digits the eye skipped to reach the sentence, and the gutter
      // it occupied is worth more as the role. The index survives where it was
      // doing work: `aria-label` here and the deck button's title, which is
      // what both name a card by.
      // NOT A BUTTON ANY MORE. It was one control for one destination while
      // the whole row expanded; the row now holds two triggers and a pick, and
      // a button cannot contain them. Its parts keep their own reach.
      const row = h('div', {
        // A stable hook, since the row stopped being the control that named
        // itself: `aria-label="Open card N"` went with the button.
        'data-card': String(ci + 1),
        class: 'grid min-w-0 grow gap-x-1.5 text-left',
        // 11px + gap-x-1.5 is 17, which is chat-render's LEAD_INDENT exactly,
        // and not by coincidence: 11px is that kit's icon box, ink inside about
        // 9 of it. Matching it is what lets the OPEN body line up under the
        // closed row, since those turns are rendered by that kit and hang on
        // that number. At 14px the two were 3px apart, which reads as a wobble
        // rather than as an indent.
        style: 'grid-template-columns:11px minmax(0,1fr)',
      },
        leadMark,
        title,
        replyMark || '',
        replyText || '',
        ...stateEls,
        // No "You" beside the clock any more. With both halves on the row the
        // ask is the lead and the clay mark names the answer, so a role word
        // labelled the obvious half and then sat between them. It survives
        // only where the card HAS no ask, a capture note or the closing
        // summary, which is the one case the lead does not name itself.
        h('div', { class: 'col-start-2 mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5' },
          ask ? '' : roleTag(card.role),
          card.ts ? h('span', { class: 'font-mono text-xs text-base-content/50' }, card.ts) : '',
          expand,
          card.ran ? h('span', { class: 'font-mono text-xs text-base-content/50 truncate' }, card.ran) : ''));


      const go = opts.onOpen ? h('button', {
        class: 'btn btn-ghost btn-sm btn-circle shrink-0 -mr-1 text-base-content/30 hover:text-primary',
        title: 'Read card ' + (ci + 1) + ' in the deck',
        'aria-label': 'Read card ' + (ci + 1) + ' in the deck',
      }, h('i', { class: 'ph ph-cards-three text-lg' })) : '';
      if (opts.onOpen) go.addEventListener('click', () => opts.onOpen(ci));

      // ── NOTHING COPIES FROM THIS ROW ─────────────────────────────────────
      // A copy button sat in this rail for one commit, in the slot the pick
      // circle held, and it copied that one exchange as markdown. Removed on
      // the same day it landed, on the report that it read as a control per
      // item for something a reader would not do here: "I don't know what it
      // copies, and I don't think we would want to copy from this view."
      //
      // That is the picker's own objection arriving one size smaller. The mode
      // was too much machinery for the job; one button per row was still a
      // control on every line of a 36-line list, offering an action whose
      // payload is invisible until after the tap. A list of exchanges is for
      // reading, and the two things a reader does from it are open the panel
      // and enter the deck.
      const rail = h('div', { class: 'flex shrink-0 items-start' }, go);

      // No horizontal divider. The left rule already segments the conversation,
      // and an underline on every row drew a second grid that agreed with
      // nothing. `mb-1` is the gap between adjacent rules: without it a clay
      // row followed by a blue one draws a single unbroken line that changes
      // colour partway down, which reads as one rule rather than two.
      //
      // NO BAND. What is in used to be a tint behind the head, and it went
      // through primary, then a neutral, and neither was right: at primary it
      // put a blue wash behind a blue ask, and at neutral it still washed one
      // (this theme's greys are cool, so ANY step off the page reads faintly
      // blue under the fill). Reported twice, 2026-09-01.
      //
      // The band was answering a question the list stopped asking. Selection
      // used to be a checkbox and could differ from what was expanded; open IS
      // selected now, so the expansion is the mark, and an open row is already
      // taller with clay-marked replies under it. The band was a second copy of
      // that, and the copy is what collided with the accent.
      //
      // What is left carries the state where the tint cannot: `aria-expanded`
      // for a screen reader, the caret's flip, and the count's own weight,
      // which is the one signal a card with NO replies has (it opens to
      // nothing, and that is the case the band was genuinely covering).
      const head = h('div', {
        class: 'grid items-start gap-2.5',
        style: 'grid-template-columns:minmax(0,1fr) auto',
      }, row, rail);
      // ── The card as an ITEM ──────────────────────────────────────────────
      // The rows ran together, which is what "articulate each item" names: with
      // the guideline gone from the left edge there was nothing between one
      // exchange and the next but 2px of margin. A hairline under each is the
      // cheapest thing that reads as a list, and the objection this file used to
      // carry against one ("the left rule already segments the conversation")
      // went with the rule it named.
      //
      // AND A SCOPE RULE, which does the job a band cannot. A tint behind the
      // head washes the blue ask sitting on it, since this theme's greys are
      // cool, and it was reported twice and removed for it. A 2px strip at the
      // card's own edge is outside every text, so it can light on hover and
      // stay lit while the panel is open without touching a colour.
      // The step is `/20` and not `/25` because 25 is not one Tailwind
      // generates: the class renders fully transparent and looks like a colour
      // that did not arrive. `dead-opacity` is the gate for exactly that, and it
      // named both the line and the nearest step that works.
      const scope = h('div', {
        class: 'pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full '
          + 'bg-base-content/20 opacity-0 transition-opacity group-hover:opacity-100' });
      const box = h('div', {
        class: 'group relative mb-0.5 border-b border-base-200 py-1 pl-3 pr-2.5 last:border-b-0',
      }, scope, head);
      // ── One panel per ROW, carrying the whole exchange ───────────────────
      // It was one per half for a commit, on the argument that the ask and the
      // reply are separate things to want. They are, and the row already draws
      // them as separate lines; what a panel is for is the thing the row had to
      // clamp, and that is the exchange. Two panels also asked the reader to
      // know which half they were on before they knew what was in it, and left
      // no honest answer to "what does this one belong to" beyond proximity.
      //
      // So the ROW is the trigger, hover or tap, and the whole card is the
      // scope: the rule at its left edge lights while the pointer is on it and
      // stays lit while its panel is open, which is what says what the panel
      // speaks to.
      //
      // THE ASK IS RESTYLED AFTER IT IS DRAWN, and both halves of that are
      // reported defects rather than taste. chat-render renders a prompt
      // through `rawPre`, verbatim in a `<pre>`, because a prompt is typed text
      // and not markdown; in DENSE mode it then drops it to 11px sans, so the
      // ask reads under the reply it is context for. Here they are in one panel
      // and the reply is 13px prose, so the shrink puts the ask two sizes down
      // from what the row shows. And the verbatim whitespace shows every double
      // space after a sentence, which the row directly above collapses: the
      // same words, twice, differently.
      //
      // So: the reading size, and a squeeze of runs of spaces that do not START
      // a line. Line-leading whitespace survives, which is the indentation of
      // anything pasted, and so does every newline. The deck stays verbatim.
      const exchange = turns.filter(t => t.role === 'user' || t.role === 'assistant');
      const fillPanel = async (node) => {
        // Awaited, because `card` resolves chat-render's ready() first: without
        // it the restyle runs against an empty node and finds no `<pre>`.
        await SR().card(exchange, node, { dense: true, collapse: 0 });
        for (const pre of node.querySelectorAll('pre')) {
          pre.style.fontSize = '13px';
          pre.style.lineHeight = '1.5';
          pre.textContent = pre.textContent.replace(/(\S)[ \t]{2,}/g, '$1 ');
        }
      };
      if (exchange.length) asTrigger(row, String(ci), box, card.ts || '', fillPanel);

      // ── NO PICKED STATE TO DRAW ──────────────────────────────────────────
      // A repaint closure sat here and marked the picked row: the turn count in
      // a heavier grey, the circle filled, and an INSET ring on the box, which
      // was itself the third answer to that question. A tint behind the head
      // came before it, through primary and then a neutral, and both washed the
      // blue ask sitting on them, since this theme's greys are cool and any
      // step off the page reads faintly blue under that fill. Reported twice on
      // 2026-09-01 and replaced by the ring; the ring is inset rather than a
      // border so it takes no layout and cannot move the grid the row's
      // alignment depends on.
      //
      // All three answered "which rows are in the excerpt", and nothing asks
      // now. Kept in the record because the FILL is the part that must not come
      // back: any future row state here is an edge, never a wash behind an ask.

      list.append(box);
    });

    const scroll = h('div', { class: 'min-h-0 grow overflow-y-auto' }, list);

    // ── THE EXPORT BAR, and what it took with it ──────────────────────────
    // A bar sat under the list, hidden until something was picked, carrying a
    // Preview pane, an Options pane of seven checkboxes (Asks, Replies, Tool
    // calls, Tool results, Times, Header, Capture gaps), a live size readout in
    // approximate tokens, Download and Copy. Removed 2026-09-06 with the
    // selection that fed it.
    //
    // The size readout was the one piece doing work no button could: it moved
    // as cards were picked, so a reader building an excerpt could see it
    // getting too big before pasting. It is worth naming because it is the only
    // part of the bar that answered a question the reader could not answer some
    // other way, and it only had that question to answer because the bar let
    // you build an arbitrary selection.
    //
    // The seven flags are not lost, only unexposed: they are DEFAULTS at the
    // top of this file and every one of them still governs what `markdown`
    // emits for a caller that passes a selection to it.

    el.append(scroll);
    return { el };
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
  // from. The deck keeps its own index sheet on the header mark, and that is
  // not a third copy: it is a dropdown that jumps between slides.

  window.sessionExport = { model, markdown, index, DEFAULTS };
})();
