// ── row-menu: a tap on a row, and what you can do with it ───────────────────
//
//   rowMenu.attach(table, opts)   -> detach()      Tabulator table + a gesture
//   rowMenu.open({ x, y, items }) -> close()       the menu alone, for any host
//   rowMenu.tsv(columns, rows)    -> string        the copy format, exported
//
// THE GESTURE THE OTHER TWO KITS DECLINED TO IMPOSE. record-deck's header says
// its way in "belongs to the host", and swipe-deck's `entry` says "a surface is
// free to add a gesture of its own on top (a row tap)". Both left the row tap
// to whoever owned the rows, and every host that wanted it wrote a button
// instead, because a button is easy and a menu is not. So the row tap never
// happened anywhere, and one host's button became the whole affordance.
//
// WHAT IT COSTS, stated where a host will read it before adopting: swipe-deck's
// same note warns that "a gesture nobody is told about is a feature only its
// author can find". This IS that gesture. A host that drops its visible entry
// for this alone is trading a discoverable affordance for a discovered one, and
// should mean it. Two things make the trade defensible rather than merely
// cheaper: tapping a row is what a reader already tries on a phone, and the
// menu is not a deck opener wearing a disguise, since the copies are useful on
// a table that has no deck at all.
//
// WHY A MENU AND NOT A ROW ACTION. A row has more than one thing to say. "Read
// from here" is the deck, "copy this row" is the row as data, "copy these rows"
// is the table as data, and a host can append its own. One tap that guesses
// between them is a tap that is wrong two thirds of the time.
//
// It follows the finger: the menu opens where the row was tapped rather than in
// a corner, clamped into the viewport, because on a phone the distance between
// what you touched and what answers is the whole of whether it feels connected.
//
// NO TABULATOR IMPORT, and no Tabulator assumption past three calls: `on`,
// `getColumns` and `getRows`. `attach` reads a table; `open` reads nothing and
// takes items. A host with a different grid can raise the same menu.
(() => {
  // io.js FETCHED AT LOAD TIME, never inside the click. A clipboard write has to
  // run in the user gesture that asked for it, and an await before the write
  // spends the activation Safari counts. Same idiom, and the same reason, as
  // md-doc.js and the other three delegates the clipboard gate names.
  const ghRef = typeof gh !== 'undefined' ? gh : (window.gh || null);
  if (!window.io && ghRef) ghRef.load('kits/io.js').catch(() => {});
  const copyText = async (text) => {
    if (window.io && typeof window.io.copy === 'function') return window.io.copy(text);
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  };

  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k) el.append(k);
    return el;
  };

  // A CELL AS ONE FIELD OF ONE LINE. Tabs and newlines inside a value would
  // otherwise become column and row breaks in the paste, so a single cell
  // holding a paragraph turns into rows of garbage in the sheet it lands in.
  // Collapsed rather than quoted, because TSV has no quoting anyone agrees on.
  const cell = (v) => v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' ');

  // TSV, HEADERS INCLUDED, for one row and for the whole list alike. It is the
  // one format that survives a paste into a spreadsheet, a chat and an editor
  // without a decision at either end. A single row keeps its header line for
  // the same reason: pasted alone, a row of bare values says nothing about
  // which column each one came from.
  const tsv = (columns, rows) => [
    columns.map(c => cell(c.title || c.field)),
    ...rows.map(r => columns.map(c => cell(r[c.field]))),
  ].map(r => r.join('\t')).join('\n');

  // The visible, field-bearing columns, in the order the grid shows them. Same
  // filter record-deck's fromGrid applies, so the copy and the card agree about
  // what the row consists of.
  const columnsOf = (table) => {
    try {
      return table.getColumns()
        .filter(c => c.getField && c.getField() && (!c.isVisible || c.isVisible()))
        .map(c => ({ field: c.getField(), title: (c.getDefinition() || {}).title || c.getField() }));
    } catch { return []; }
  };
  const activeRows = (table) => {
    try { return table.getRows('active').map(r => r.getData()); } catch { return []; }
  };

  // ── the menu ──────────────────────────────────────────────────────────────
  //
  // One at a time, held in a module-level handle rather than a stack: a second
  // menu opening while the first is up is a mis-tap, not a drill-down, and two
  // floating panels at once on a phone is the failure this is meant to avoid.
  let live = null;

  function close() {
    if (!live) return;
    const { el, onDoc, onKey, onMove, mark } = live;
    live = null;
    document.removeEventListener('pointerdown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
    if (mark) mark.classList.remove('row-menu-on');
    el.remove();
  }

  // Placed after it is in the document, because its size is not known until it
  // has been laid out and the clamp needs the size. Hidden for that one frame
  // so the reader never sees it at the origin first.
  function place(el, x, y) {
    el.style.visibility = 'hidden';
    el.style.left = '0px';
    el.style.top = '0px';
    document.body.append(el);
    const r = el.getBoundingClientRect();
    const w = window.innerWidth, hgt = window.innerHeight;
    el.style.left = Math.round(Math.min(Math.max(8, x), Math.max(8, w - r.width - 8))) + 'px';
    el.style.top = Math.round(Math.min(Math.max(8, y), Math.max(8, hgt - r.height - 8))) + 'px';
    el.style.visibility = '';
  }

  // items: [{ label, icon, run, keep }]. `run` may return a string, which
  // replaces the label for a beat before the menu closes: that is how a copy
  // reports, since a clipboard write has no other visible effect and a toast
  // would be a second floating thing to dismiss. `keep` holds the menu open.
  function open({ x = 0, y = 0, items = [], mark = null } = {}) {
    close();
    if (!items.length) return () => {};
    const el = h('div', {
      class: 'menu menu-sm fixed z-[70] w-max min-w-40 max-w-[80vw] rounded-box '
           + 'border border-base-300 bg-base-100 p-1 shadow-xl',
      role: 'menu',
    });
    for (const it of items) {
      const label = h('span', { class: 'grow truncate', text: it.label });
      const row = h('button', {
        type: 'button', role: 'menuitem',
        // max-sm:min-h-11 is the phone hit target, the same 44px swipe-deck's
        // entry buys with max-sm:h-11: a menu is the one place a mis-tap costs
        // an action rather than nothing.
        class: 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left max-sm:min-h-11 hover:bg-base-200',
      }, it.icon ? h('i', { class: 'ph ' + it.icon + ' shrink-0 text-base opacity-70' }) : null, label);
      row.addEventListener('click', () => {
        let said;
        try { said = it.run && it.run(); } catch (e) { said = 'Failed'; }
        const settle = (t) => {
          if (!t || live?.el !== el) return;
          label.textContent = t;
          if (!it.keep) setTimeout(close, 700);
        };
        if (said && typeof said.then === 'function') said.then(settle, () => settle('Failed'));
        else if (typeof said === 'string') settle(said);
        else if (!it.keep) close();
      });
      el.append(row);
    }

    // Dismissal, four ways, all outside the menu: a tap elsewhere, Escape, any
    // scroll (the menu is fixed and the row under it is not, so a scrolled menu
    // is pointing at the wrong row), and a resize.
    const onDoc = (e) => { if (!el.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const onMove = () => close();
    place(el, x, y);
    if (mark) mark.classList.add('row-menu-on');
    live = { el, onDoc, onKey, onMove, mark };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return close;
  }

  // ── attaching to a Tabulator table ────────────────────────────────────────
  //
  // opts:
  //   deck      options handed to recordDeck.fromGrid ({ title, describe, … }),
  //             or false to leave the item out. The item is omitted anyway when
  //             record-deck is not loaded, so a host that never wants the deck
  //             can simply not load the kit.
  //   copy      false to leave both copy items out. Default on.
  //   items     [{ label, icon, run(ctx) }] appended, ctx = { row, data, table }
  //   skip      (event) => boolean, extra suppression on top of the link rule
  //   noun      what one row is, for the deck item's wording. Default 'record'.
  //
  // THE LINK RULE. A row whose cell holds a link, a button or a field is a row
  // where the tap already meant something, so the menu stays out of the way.
  // Checked on the tap's own target rather than declared per column, since the
  // host that renders a link into a cell is rarely the host wiring this up.
  const INTERACTIVE = 'a,button,input,select,textarea,label,[contenteditable],[data-no-row-menu]';

  function attach(table, opts = {}) {
    if (!table || typeof table.on !== 'function') return () => {};
    const noun = opts.noun || 'record';
    const onRowClick = (e, row) => {
      if (e && e.target && e.target.closest && e.target.closest(INTERACTIVE)) return;
      if (opts.skip && opts.skip(e)) return;
      const data = (row && row.getData && row.getData()) || null;
      if (!data) return;
      const cols = columnsOf(table);
      const items = [];

      if (opts.deck !== false && window.recordDeck && typeof window.recordDeck.fromGrid === 'function') {
        items.push({
          icon: window.swipeDeck?.entry?.icon || 'ph-cards-three',
          label: 'Read from here',
          run: () => { window.recordDeck.fromGrid(table, { ...(opts.deck || {}), startRow: data }); },
        });
      }
      if (opts.copy !== false && cols.length) {
        const rows = activeRows(table);
        items.push({
          icon: 'ph-copy', label: 'Copy this ' + noun,
          run: () => copyText(tsv(cols, [data])).then(ok => ok ? 'Copied' : 'Copy failed'),
        });
        // THE COUNT IS THE LABEL, and it is the count of what is on screen. A
        // filtered grid copies what the filter left, so a label reading "Copy
        // table" over 74 of 322 rows would be describing the file rather than
        // the copy. Same promise swipe-deck's entry makes about its own count.
        if (rows.length > 1) items.push({
          icon: 'ph-table', label: 'Copy ' + rows.length.toLocaleString() + ' rows',
          run: () => copyText(tsv(cols, rows)).then(ok => ok ? 'Copied' : 'Copy failed'),
        });
      }
      for (const it of (opts.items || [])) {
        items.push({ ...it, run: () => it.run && it.run({ row, data, table }) });
      }
      if (!items.length) return;

      const el = row.getElement && row.getElement();
      open({ x: e?.clientX || 0, y: e?.clientY || 0, items, mark: el });
    };
    table.on('rowClick', onRowClick);
    return () => {
      close();
      try { table.off('rowClick', onRowClick); } catch { /* a table already destroyed */ }
    };
  }

  window.rowMenu = { attach, open, close, tsv, columnsOf };
})();
