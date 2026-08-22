// record-deck.js: a table's records, read one at a time.
//
// A grid is for SCANNING. Thirty columns wide and four hundred rows deep, it
// answers "which row" superbly and "what does this row say" not at all: on a
// phone the answer is off the right edge, and on a desktop it is a horizontal
// scroll with the identifying column long gone. This is the other half, and it
// is the same split kits/file-deck.js makes between the Files pane and the file
// deck. One record per slide, every field on screen, in the house swipe deck
// (kits/swipe-deck.js).
//
//   recordDeck.open({ rows, columns, start, title, … })  -> the deck handle
//   recordDeck.fromGrid(tabulatorTable, { … })           -> the deck handle
//
// GENERIC BY CONSTRUCTION, because the collections it has to serve have nothing
// in common but their shape. The budget-drs data explorer alone holds 100
// tables whose widths run 1, median 6, to 90 columns, so a format tuned for a
// six-column table is wrong for a third of them and a format tuned for ninety
// is absurd for the rest. What survives that range is a field list that gets
// out of the way: no fixed column count, no truncation, and the one dimension
// that actually varies (how many fields are empty) handled explicitly rather
// than by hoping.
//
// open() options:
//   rows       [{}], the records. Plain objects; nothing else is assumed.
//   columns    [{ field, title?, num? }], optional. Derived from the rows when
//              absent (see deriveColumns), which is what makes a bare CSV or a
//              JSON array work with no configuration at all.
//   start      index to open on, so "read from here" lands on the right record
//   titleField which field is the card's headline. Defaults to the first
//              non-numeric column, since that is nearly always the name of the
//              thing: `vendor`, `agency`, `path`, `title`.
//   describe   (field) => string | null, an optional per-column note rendered
//              under its label. The hook exists because SOME hosts know what
//              their columns mean (budget-drs carries a column dictionary at
//              data/design/lineage/columns.csv) and most do not, and a kit that
//              REQUIRED the knowledge would be unusable everywhere else.
//   title, subtitle, icon, parent, onClose, announceEmpty
//              as swipe-deck's, with `parent` drilling one level down.
//
// WHAT IS NOT HERE, deliberately: any way of getting in. The affordance is
// swipeDeck.entry() and it belongs to the host, because only the host knows
// where its own chrome has room and whether the reader has anything to read
// yet. A surface may also add a gesture of its own (a row tap), and that stays
// the surface's call rather than a convention this kit imposes.
//
// Requires kits/swipe-deck.js. No Alpine, no gh, no Tabulator: fromGrid reads a
// Tabulator table when handed one, and the kit works identically with none.
(() => {
  const need = () => {
    if (!window.swipeDeck) throw new Error('record-deck: load kits/swipe-deck.js first');
    return window.swipeDeck;
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

  // Empty is four things and they all render as nothing, so they are one thing
  // here. Zero is NOT among them: `0` in an amount column is a fact, and a
  // format that hides it would be lying about the record on exactly the rows
  // where the reader is looking for it.
  const isEmpty = (v) => v == null || (typeof v === 'string' && v.trim() === '');

  // A value as text, and the rule is that the record shows what it holds.
  // No thousands separators, no date parsing, no unit guessing: `2023` in an
  // id column must not come back as `2,023`, and a kit with no idea what a
  // column MEANS cannot tell that column from an amount. Formatting is the
  // host's job, through the columns it passes.
  const asText = (v) => {
    if (v == null) return '';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
    return String(v);
  };

  // Columns from the rows themselves, when the caller has none to give.
  //
  // The union of keys rather than the first row's, in first-seen order: a JSON
  // array of records is routinely ragged, and reading only row 0 silently drops
  // every field that happens to be absent from it. Sampled rather than
  // exhaustive because a 200k-row payload should not cost a full scan to open a
  // deck, and a field that appears in none of the first 500 rows is not the one
  // the reader opened this for.
  const SAMPLE = 500;
  const deriveColumns = (rows) => {
    const seen = new Map();
    for (const row of rows.slice(0, SAMPLE)) {
      if (!row || typeof row !== 'object') continue;
      for (const k of Object.keys(row)) if (!seen.has(k)) seen.set(k, { field: k, title: k, num: true });
    }
    // `num` starts true and is disproved, so a column with no non-empty value
    // in the sample stays right-aligned rather than being called text on no
    // evidence. One non-numeric value settles it.
    for (const row of rows.slice(0, SAMPLE)) {
      if (!row || typeof row !== 'object') continue;
      for (const [k, col] of seen) {
        if (!col.num) continue;
        const v = row[k];
        if (isEmpty(v)) continue;
        if (typeof v === 'number') continue;
        if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) continue;
        col.num = false;
      }
    }
    return [...seen.values()];
  };

  // The headline: which field names the thing.
  //
  // The obvious rule, "the first non-numeric column", is wrong on real tables
  // and was measured wrong on the first one it met. budget-drs's master budget
  // lines opens `biennium, stage, session_year, section, item_number,
  // item_title, …`, so every one of 100 records was headlined "2015-17" and the
  // deck's header, which follows the reader, said the same thing on every
  // swipe. The identifying column was six along.
  //
  // What separates them is not position, it is CARDINALITY: a column that says
  // the same thing on every record cannot be the record's name, and the one
  // that names the thing is the one that varies. So the pick is the non-numeric
  // column with the most distinct values in the sample, ties going leftmost,
  // which keeps the obvious answer where the obvious answer is right (a vendor
  // ledger leads with `vendor`) and skips the constant prefixes where it is not.
  //
  // Numeric columns stay out of the running whatever their cardinality, since a
  // perfectly distinct id is the one thing a reader cannot recognise a record
  // by. `titleField` overrides all of it for a host that simply knows.
  const pickTitleField = (columns, rows) => {
    const text = columns.filter(c => !c.num);
    if (!text.length) return (columns[0] || {}).field;
    let best = text[0], bestN = -1;
    for (const c of text) {
      const seen = new Set();
      for (const row of rows.slice(0, SAMPLE)) {
        const v = row?.[c.field];
        if (!isEmpty(v)) seen.add(asText(v));
      }
      if (seen.size > bestN) { best = c; bestN = seen.size; }
    }
    return best.field;
  };

  const headlineOf = (row, field, i) => {
    const v = field ? asText(row?.[field]) : '';
    return v.trim() ? v : `Record ${i + 1}`;
  };

  // Copy on tap, and only where it can actually happen. `navigator.clipboard`
  // is absent over plain http and in an iframe without the permission, and a
  // value that advertises "tap to copy" and then does nothing is worse than a
  // value that never offered: the reader cannot tell a dead control from a
  // failed one. So the affordance is wired only when the API is there.
  const canCopy = () => !!(navigator.clipboard && navigator.clipboard.writeText);
  const wireCopy = (el, text) => {
    if (!canCopy() || !text) return;
    el.classList.add('cursor-pointer');
    el.setAttribute('title', 'Tap to copy this value');
    el.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); } catch { return; }
      const flag = h('span', { class: 'ml-2 align-middle text-xs text-success', text: 'copied' });
      el.append(flag);
      setTimeout(() => flag.remove(), 1200);
    });
  };

  // One field. Label above value on a phone, beside it from sm up.
  //
  // `break-words` and `min-w-0` on both halves are the load-bearing part, and
  // the reason is in swipe-deck's own note: a slide must be exactly one track
  // width or every index past it is wrong. A 400-character note or an unbroken
  // URL in one cell is all it takes, so nothing here may set its own width.
  const fieldRow = (col, value, describe) => {
    const text = asText(value);
    const note = describe ? describe(col.field) : null;
    const dt = h('dt', { class: 'min-w-0 break-words text-xs uppercase tracking-wide text-base-content/50' },
      h('span', { text: col.title || col.field }),
      note ? h('span', { class: 'mt-0.5 block normal-case tracking-normal text-base-content/40', text: note }) : null);
    const dd = h('dd', {
      class: 'min-w-0 break-words text-sm '
        + (col.num ? 'font-mono tabular-nums sm:text-right' : ''),
      text: text || '—',
    });
    if (text) wireCopy(dd, text);
    return h('div', { class: 'grid grid-cols-1 gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]' },
      dt, dd);
  };

  // A whole record.
  //
  // THE EMPTY FIELDS ARE THE WIDE CASE'S WHOLE PROBLEM. A 90-column fact table
  // is mostly blank on any given row, and printing every blank turns the one
  // format that was supposed to make a wide record readable into ninety lines
  // of nothing. Hiding them silently is the other failure: the reader cannot
  // tell a field that is empty from a field the format dropped. So they are
  // collapsed, COUNTED, and one tap away.
  const renderRecord = (slide, row, i, o) => {
    const columns = o.columns;
    const filled = [], empty = [];
    for (const c of columns) (isEmpty(row?.[c.field]) ? empty : filled).push(c);

    const list = h('dl', { class: 'divide-y divide-base-200' },
      ...filled.map(c => fieldRow(c, row?.[c.field], o.describe)));

    const head = h('div', { class: 'pb-3' },
      h('h2', { class: 'break-words text-lg font-semibold leading-snug',
                text: headlineOf(row, o.titleField, i) }),
      h('p', { class: 'mt-0.5 text-xs text-base-content/50',
               text: `${filled.length} of ${columns.length} fields` }));

    slide.replaceChildren(head, list);

    if (!empty.length) return;
    const emptyList = h('dl', { class: 'hidden divide-y divide-base-200 opacity-60' },
      ...empty.map(c => fieldRow(c, '', o.describe)));
    const toggle = h('button', {
      type: 'button',
      class: 'btn btn-ghost btn-xs mt-3 gap-1.5 text-base-content/50',
    }, h('i', { class: 'ph ph-eye-slash' }),
       h('span', { text: `${empty.length} empty ${empty.length === 1 ? 'field' : 'fields'}` }));
    toggle.addEventListener('click', () => {
      const hidden = emptyList.classList.toggle('hidden');
      toggle.querySelector('i').className = hidden ? 'ph ph-eye-slash' : 'ph ph-eye';
    });
    slide.append(toggle, emptyList);
  };

  function open(o = {}) {
    const sd = need();
    const rows = Array.isArray(o.rows) ? o.rows : [];
    if (!rows.length) return null;
    const columns = (o.columns && o.columns.length ? o.columns : deriveColumns(rows))
      .map(c => ({ field: c.field, title: c.title || c.field, num: !!c.num }));
    const opts = { columns, titleField: o.titleField || pickTitleField(columns, rows), describe: o.describe };
    const start = Math.max(0, Math.min(o.start || 0, rows.length - 1));
    const sub = (i) => headlineOf(rows[i], opts.titleField, i);

    // Copy the record the reader is ON, which is the one thing the deck's own
    // chrome knows and no caller can. swipe-deck hands an action the core
    // handle for exactly this.
    const actions = canCopy() ? [{
      icon: 'ph-copy', title: 'Copy this record as JSON',
      onClick: (deck) => {
        const row = rows[deck.active()];
        if (row) navigator.clipboard.writeText(JSON.stringify(row, null, 2)).catch(() => {});
      },
    }] : [];

    const shared = {
      count: rows.length, start,
      title: o.title || 'Records',
      subtitle: o.subtitle != null ? o.subtitle : sub(start),
      icon: o.icon || 'ph-rows',
      actions,
      render: (i, slide) => renderRecord(slide, rows[i], i, opts),
      onClose: o.onClose,
    };
    const handle = o.parent ? sd.drill(o.parent, shared) : sd.open(shared);
    // The header follows the reader, the way the file deck's does: it names the
    // record you are on, not the one you came in at.
    handle.deck.onSlide(i => handle.setSubtitle(o.subtitle != null ? o.subtitle : sub(i)));
    return handle;
  }

  // The Tabulator adapter, and the one thing it gets right that a caller
  // passing `table.getData()` would not: it reads the ACTIVE rows, which is the
  // set after the reader's header filters and in their sort order. A grid
  // filtered to three search hits should open a deck of three records, not of
  // the four hundred behind them. `getRows('active')` is that set.
  //
  // On close it scrolls the grid to the record the reader left on, so the deck
  // is a place they went and came back from rather than a detour that loses
  // their place.
  function fromGrid(table, o = {}) {
    if (!table || typeof table.getRows !== 'function') return null;
    const comps = table.getRows('active');
    const rows = comps.map(r => r.getData());
    if (!rows.length) return null;
    const columns = table.getColumns()
      .filter(c => c.getField && c.getField() && (!c.isVisible || c.isVisible()))
      .map(c => {
        const def = c.getDefinition() || {};
        return { field: c.getField(), title: def.title || c.getField(),
                 num: def.sorter === 'number' || def.hozAlign === 'right' };
      });
    let start = o.start || 0;
    if (o.startRow != null) {
      const i = rows.indexOf(o.startRow);
      if (i >= 0) start = i;
    }
    return open({
      ...o, rows, columns: columns.length ? columns : undefined, start,
      onClose: () => {
        try {
          const handle = window.recordDeck._last;
          const i = handle ? handle.deck.active() : start;
          if (comps[i]) table.scrollToRow(comps[i], 'center', false).catch(() => {});
        } catch { /* a grid destroyed while the deck was open */ }
        o.onClose?.();
      },
    });
  }

  // `_last` exists only so fromGrid's onClose can ask where the reader ended
  // up: onClose fires from inside the teardown, after the caller's own handle
  // reference would be the obvious thing to read and while it still is the
  // deck being closed. Not part of the API.
  const api = {
    open: (o) => { const hd = open(o); api._last = hd; return hd; },
    fromGrid, deriveColumns, _last: null,
  };
  window.recordDeck = api;
})();
