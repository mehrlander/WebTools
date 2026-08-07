// session-render.js — a session record as a readable conversation.
//
// The store in web-tools-private keeps one JSON record per Claude Code session
// (its sessions/README.md is the schema). Through schema 3 that record was a
// log: what was asked, what tools ran, and counts. Schema 4 added `replies`,
// the assistant's own prose, which is what makes the file a conversation and
// this file worth having.
//
// Framework-free and DOM-rendering, the same shape as chat-render.js and
// vanilla-demo.js, loaded via gh.load. It composes rather than duplicates:
// chat-render.js renders a turn and promotes fenced blocks to live artifacts,
// swipe-deck.js owns the track and the takeover. Load both first.
//
//   await sessionRender.ready()                  // chatRender.ready(), once
//   sessionRender.turns(record)   -> [{role, md, ts, label}]  one merged sequence
//   sessionRender.groups(turns)   -> [[turn]]    the deck's slide grouping
//   sessionRender.describe(record)-> {title, subtitle}
//   await sessionRender.open(record, o?)  -> {el, close}   fullscreen takeover
//   await sessionRender.deck(record, o?)  -> element       inline deck
//
// ── Why the merge works, and why it is here rather than in the record ───────
//
// `prompts`, `replies` and `calls` are three parallel lists in the record, each
// carrying `at`. The record deliberately does not interleave them: each has its
// own caps and its own accounting, and a reader wanting only the asks should
// not have to filter a mixed list. So deciding what a "turn" is belongs to
// whatever renders one, which is this file.
//
// ── Why the grouping is NOT chatRender.exchanges() ─────────────────────────
//
// That function starts a new card at each user turn, which is right for a chat,
// where an exchange is a handful of messages. A coding session is the opposite
// shape: measured on the session that built this, 3 asks against 160 tool
// calls, so one card per ask would have produced three slides of a hundred
// entries each. Unreadable, and the swipe would do nothing.
//
// A new card starts at each user ask AND at each assistant prose turn, with the
// tool calls attaching to the prose turn above them. That is how a session
// actually reads ("let me check X", then the checking), and it turned the same
// session into 27 cards of a few entries each. The prose turn is what makes
// this grouping available at all, which is the second reason schema 4 had to
// land before any of this: under schema 3 there was nothing to group on.
(() => {
  const CR = () => {
    if (!window.chatRender) throw new Error('session-render: load chat-render.js first');
    return window.chatRender;
  };

  const num = n => Number(n || 0).toLocaleString();

  // Bytes, at the precision a reader can act on. A dropped body is described by
  // its size, so this is the whole of what such an entry says.
  function bytes(n) {
    n = Number(n || 0);
    if (n < 1024) return num(n) + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  const fence = (lang, code) => '```' + (lang || '') + '\n' + String(code ?? '') + '\n```';

  // The command for Bash; everything else is a path, a pattern or a URL, which
  // reads better unhighlighted than mislabelled.
  const argLang = name => (name === 'Bash' ? 'bash' : '');

  // Only JSON is claimed, and only to unlock chat-render's Table view, whose
  // own test re-parses and simply offers no tab when the parse fails (a clipped
  // body being the common case). HTML is deliberately NOT claimed: a Render tab
  // over a body that may be missing its middle would draw a broken page and
  // present it as the thing the session saw.
  const bodyLang = body => (/^\s*[[{]/.test(body || '') ? 'json' : '');

  // ── One tool call as a turn ────────────────────────────────────────────────
  // The arg is what ran; the body is what came back. When no body was kept, the
  // entry still says how much there was, because `bytes` and `sha` ride every
  // call whether or not its body survived, and "4.2 KB not kept" is a different
  // statement from an empty result.
  function callTurn(c) {
    const parts = [];
    if (c.arg) parts.push(fence(argLang(c.name), c.arg));
    if (c.body) {
      parts.push(fence(bodyLang(c.body), c.body));
      if (c.clipped) parts.push('*Clipped to the per-result cap; the elision is marked inline.*');
    } else if (c.bytes) {
      parts.push('*' + bytes(c.bytes) + ' returned, body not kept.*');
    } else {
      parts.push('*No output.*');
    }
    return {
      role: 'tool',
      ts: (c.at || '').slice(11, 19),
      label: c.name + (c.ok === false ? ' · failed' : ''),
      md: parts.join('\n\n'),
      at: c.at || '',
    };
  }

  // ── What this record could not hold ────────────────────────────────────────
  // The same job the Sessions tab footnote does, carried into the deck, because
  // a deck is read one card at a time and a reader who lands mid-session should
  // still be able to tell a quiet session from a partial record. Only says
  // something when something IS missing: a complete schema-4 record gets no
  // note at all rather than a clean bill of health nobody asked for.
  function captureNote(r) {
    const schema = r.schema || 1;
    const gaps = [];
    if (schema < 4) {
      gaps.push('**Assistant prose was not captured** at this schema. Every turn '
        + 'overwrote one variable, so only the last survives, cut to 500 characters. '
        + 'The answering half of this conversation is gone, not absent because it was quiet.');
    }
    if (schema < 3) gaps.push('File attention and the harness session link postdate this record.');
    if (schema < 2) gaps.push('Tool calls were not captured at all; only the histogram survives.');
    if (r.prompts_stored < r.exchanges)
      gaps.push(`${num(r.prompts_stored)} of ${num(r.exchanges)} asks stored; the rest hit the prompt cap.`);
    if (r.replies_elided) gaps.push(`${num(r.replies_elided)} prose turns elided at the record's prose budget.`);
    if (r.bodies_elided) gaps.push(`${num(r.bodies_elided)} result bodies elided at the record's body budget.`);
    if (r.bodies_dropped)
      gaps.push(`${num(r.bodies_dropped)} result bodies dropped by policy: a receipt, or a Read whose path is counted in \`files\` instead.`);
    if (!gaps.length) return null;
    return {
      role: 'meta',
      label: 'What this record does not hold',
      md: gaps.map(g => '- ' + g).join('\n'),
      at: '',
    };
  }

  // ── The closing summary ───────────────────────────────────────────────────
  // What the session touched, as the deck's last card. This is the content the
  // Sessions pane used to carry in an inline expansion below the row, which
  // meant two detail surfaces for one record: the pane's, and this. Two
  // surfaces is what made the feature confusing to arrive at, so the expansion
  // is gone and its one piece of unique content lives here, at the end of the
  // reading rather than beside the list.
  //
  // `files` counts four file tools and nothing else. The caveat travels with
  // the numbers rather than sitting in a doc, because without it the ranking
  // says the opposite of the truth on exactly the documents that matter most:
  // one injected at session start reads zero while being among the most-read
  // files in the estate.
  const FILES_SHOWN = 30;
  const TOOLS_SHOWN = 10;

  function summaryTurn(r) {
    const parts = [];
    const files = Object.entries(r.files || {})
      .map(([p, k]) => [p, Object.values(k).reduce((a, b) => a + b, 0), k])
      .sort((a, b) => b[1] - a[1]);
    if (files.length) {
      parts.push('**Files opened** (' + num(r.files_total || files.length) + ')');
      parts.push(files.slice(0, FILES_SHOWN)
        .map(([p, , k]) => '- `' + p + '` — '
          + Object.entries(k).sort().map(([kind, n]) => n + ' ' + kind).join(', '))
        .join('\n'));
      if (files.length > FILES_SHOWN)
        parts.push('*' + num(files.length - FILES_SHOWN) + ' more not shown.*');
      parts.push('*Counts `Read`, `Edit`, `Write` and `NotebookEdit` only. A file read '
        + 'through a shell command, or a document injected at session start rather than '
        + 'opened, does not appear here at all.*');
    }
    const tools = Object.entries(r.tools || {}).sort((a, b) => b[1] - a[1]);
    if (tools.length) {
      parts.push('**Tools**');
      parts.push(tools.slice(0, TOOLS_SHOWN).map(([t, n]) => '- `' + t + '` — ' + num(n)).join('\n'));
    }
    const tk = r.tokens || {};
    if (tk.output || tk.input) {
      parts.push('**Tokens**');
      parts.push(['output', 'input', 'cache_read', 'cache_write']
        .filter(k => tk[k]).map(k => '- ' + k.replace('_', ' ') + ' — ' + num(tk[k])).join('\n'));
    }
    if (!parts.length) return null;
    return { role: 'meta', label: 'What this session touched', md: parts.join('\n\n'), at: '￿￿', _card: true };
  }

  // ── The merged sequence ───────────────────────────────────────────────────
  // Sorted by `at`, then by a per-kind rank so that turns sharing a timestamp
  // land in the order they happened rather than the order the lists were
  // concatenated. The rank matters at one-second granularity: an assistant turn
  // and the tool calls it issued carry the SAME `at`, since both are read from
  // one transcript message, so without a rank the calls could sort above the
  // sentence that introduced them.
  const RANK = { user: 0, assistant: 1, tool: 2 };

  function turns(record) {
    const r = record || {};
    const out = [];
    for (const p of r.prompts || [])
      out.push({ role: 'user', md: p.text || '', ts: (p.at || '').slice(11, 19), at: p.at || '' });
    for (const x of r.replies || [])
      out.push({ role: 'assistant', md: x.text || '', ts: (x.at || '').slice(11, 19), at: x.at || '' });
    for (const c of r.calls || []) out.push(callTurn(c));

    out.forEach((t, i) => { t._i = i; });
    out.sort((a, b) =>
      (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
      || (RANK[a.role] - RANK[b.role])
      || (a._i - b._i));

    // A schema-1 through -3 record has no `replies`, so `last_message` is the
    // only assistant text on file. Show it as what it is rather than dropping
    // the one sentence that survived: placed at the end, where it was said.
    if (!(r.replies || []).length && r.last_message) {
      out.push({
        role: 'assistant', md: r.last_message, ts: '',
        label: 'Assistant · final turn only', at: '￿',
      });
    }

    const note = captureNote(r);
    const summary = summaryTurn(r);
    return [...(note ? [note] : []), ...out, ...(summary ? [summary] : [])];
  }

  // A card per ask and per prose turn; tool calls attach to the turn above.
  // A leading meta note joins the first card rather than taking a slide of its
  // own, so the deck opens on the conversation and not on a disclaimer. A turn
  // marked `_card` forces its own slide: the closing summary is not part of the
  // last exchange and should not be read as its tail.
  function groups(list) {
    const out = [];
    for (const t of list) {
      if (!out.length || t._card || t.role === 'user' || t.role === 'assistant') out.push([]);
      out[out.length - 1].push(t);
    }
    if (out.length > 1 && out[0].every(t => t.role === 'meta')) {
      const [lead, ...rest] = out;
      rest[0] = [...lead, ...rest[0]];
      return rest;
    }
    return out;
  }

  // ── Header facts ──────────────────────────────────────────────────────────
  function describe(record) {
    const r = record || {};
    const repos = (r.repos || []).map(x => x.name).join(', ');
    const mins = (() => {
      const a = Date.parse(r.started), b = Date.parse(r.ended);
      if (!a || !b || b < a) return '';
      const m = Math.round((b - a) / 60000);
      return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
    })();
    return {
      title: r.opening_ask ? r.opening_ask.slice(0, 90) : (r.short || 'Session'),
      subtitle: [r.day, r.short, repos, mins,
        r.exchanges && `${num(r.exchanges)} asks`,
        r.calls_total && `${num(r.calls_total)} calls`,
      ].filter(Boolean).join('  ·  '),
    };
  }

  const ready = () => CR().ready();

  const sd = () => {
    if (!window.swipeDeck) throw new Error('session-render: load swipe-deck.js first');
    return window.swipeDeck;
  };

  // The takeover. `link` goes to the harness session when the record recovered
  // one from its own commit trailers; a session that never committed has no
  // such address, and an absent button is the honest rendering of that.
  async function open(record, o = {}) {
    await ready();
    const cr = CR();
    const g = groups(turns(record));
    const d = describe(record);
    return sd().open({
      count: g.length,
      render: (i, slide) => g[i].forEach(m => slide.append(cr.message(m, o))),
      innerClass: 'mx-auto max-w-2xl space-y-4',
      title: o.title || d.title,
      subtitle: o.subtitle || d.subtitle,
      icon: 'ph-terminal-window',
      link: record?.agent_session
        ? { href: record.agent_session, title: 'Open this session in Claude Code' }
        : null,
      onSlide: o.onSlide,
    });
  }

  // Inline: the same slides in a fixed-height box, for a page that wants the
  // conversation in place rather than over everything.
  async function deck(record, o = {}) {
    await ready();
    const cr = CR();
    const g = groups(turns(record));
    const core = sd().core(g.length,
      (i, slide) => g[i].forEach(m => slide.append(cr.message(m, o))),
      { innerClass: 'mx-auto max-w-2xl space-y-4' });
    const wrap = document.createElement('div');
    if (o.fill) wrap.className = 'flex flex-col h-full min-h-0';
    const holder = document.createElement('div');
    holder.className = o.fill ? 'grow min-h-0' : '';
    if (!o.fill) holder.style.height = o.height || 'min(72vh, 640px)';
    holder.append(core.track);
    wrap.append(holder);
    if (core.count > 1) {
      const bar = document.createElement('div');
      bar.className = 'flex items-center justify-center gap-3 pt-2.5' + (o.fill ? ' pb-1 shrink-0' : '');
      const mk = (icon, fn) => {
        const b = document.createElement('button');
        b.className = 'btn btn-sm btn-circle btn-ghost border border-base-300';
        b.innerHTML = `<i class="ph ${icon} text-[15px]"></i>`;
        b.addEventListener('click', fn);
        return b;
      };
      const prev = mk('ph-caret-left', () => core.go(core.active() - 1));
      const next = mk('ph-caret-right', () => core.go(core.active() + 1));
      const count = document.createElement('span');
      count.className = 'font-mono text-[11px] opacity-60 tabular-nums min-w-16 text-center';
      count.textContent = `1 / ${core.count}`;
      bar.append(prev, count, next);
      wrap.append(bar);
      core.onSlide(a => {
        count.textContent = `${a + 1} / ${core.count}`;
        prev.disabled = a <= 0; next.disabled = a >= core.count - 1;
      });
    }
    return wrap;
  }

  window.sessionRender = { ready, turns, groups, describe, open, deck, bytes };
})();
