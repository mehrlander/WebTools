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
// swipe-deck.js owns the track and the takeover, claude-mark.js owns the
// logomark on the header's session link. Load all three first; in this repo
// gh-boot already carries claude-mark, so a page's chain names only the two.
//
//   await sessionRender.ready()                  // chatRender.ready(), once
//   sessionRender.turns(record)   -> [{role, md, ts, label}]  one merged sequence
//   sessionRender.groups(turns)   -> [[turn]]    the deck's slide grouping
//   sessionRender.blocks(card)    -> [{turn}|{tools,…}|{steps,label}]  card layout
//   sessionRender.outline(record) -> [{i,title,source,kind,role,ts,ran,calls,turns,
//                                     exchange}]
//   sessionRender.describe(record)-> {title, subtitle}
//   await sessionRender.open(record, o?)  -> {el, close}   fullscreen takeover
//                                  o.parent drills from an open deck instead
//   await sessionRender.deck(record, o?)  -> element       inline deck
//
// kits/session-export.js is the optional fifth: load it after this one and the
// takeover grows an Export button, which opens the turn picker on the card the
// reader is looking at. Pass `export: false` to suppress it.
//
// ── Why the merge works, and why it is here rather than in the record ───────
//
// `prompts`, `replies` and `calls` are three parallel lists in the record, each
// carrying `at`. The record deliberately does not interleave them: each has its
// own caps and its own accounting, and a reader wanting only the asks should
// not have to filter a mixed list. So deciding what a "turn" is belongs to
// whatever renders one, which is this file.
//
// ── A card is one exchange, and the tool calls fold ────────────────────────
//
// A new card starts at each user ask, so a slide carries the whole of one
// exchange: the question, every sentence of the answer, and everything that
// ran in between. That is the unit a reader is looking for. Swiping lands on
// "the time I asked about X" rather than partway through answering it, and the
// contents list becomes a list of questions.
//
// It only works because the machinery folds. A run of tool calls plus the
// short assistant turn that announced it ("Now let me render it to check the
// pixels") is one STEP, and a run of adjacent steps collapses into ONE fold
// covering the whole of the preparation. So a card is the question, one line
// for everything done to answer it, and the reply. Opening that line lays the
// work out flat, sentence then calls, step after step. Measured over the 154
// schema-4 records in the store on 2026-08-26: 2,458 exchanges, median 10
// calls and 3 prose turns each, and 94% of the narrating turns fold. The tail
// is real and stays honest rather than being split: p90 is 44 calls, and the
// largest single exchange is 339, which is one line until someone opens it.
//
// This replaces the first grouping, which started a card at each ask AND at
// each assistant prose turn, with the calls attaching to the prose above them.
// That was the right call before the fold existed, since the alternative then
// was a slide carrying a hundred expanded tool entries. What it cost was the
// exchange: the same store came to 14,297 cards, so a question and its answer
// were five or six swipes apart and the pager clustered them with a margin.
// The fold buys the condensation the split was paying for, so the split is
// gone and the exchange is back.
//
// The prose turn still carries the reading: it is what a fold hangs under, and
// what titles a card when the ask says little. That remains the reason schema 4
// had to land before any of this.
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
  // `parts` splits the same string two ways rather than building it twice: the
  // deck reads `md` and never looks at the halves, while session-export.js
  // emits the argument without the result body (the usual way an excerpt stays
  // small enough to paste). Keeping the split here rather than in the exporter
  // means the fencing heuristics above have one owner; a second reader deriving
  // its own would be a second answer to "is this JSON".
  function callTurn(c) {
    const arg = c.arg ? fence(argLang(c.name), c.arg) : '';
    let body;
    if (c.body) {
      body = fence(bodyLang(c.body), c.body)
        + (c.clipped ? '\n\n*Clipped to the per-result cap; the elision is marked inline.*' : '');
    } else if (c.bytes) {
      body = '*' + bytes(c.bytes) + ' returned, body not kept.*';
    } else {
      body = '*No output.*';
    }
    return {
      role: 'tool',
      ts: (c.at || '').slice(11, 19),
      label: c.name + (c.ok === false ? ' · failed' : ''),
      md: [arg, body].filter(Boolean).join('\n\n'),
      parts: { arg, body },
      src: c,
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

  // A card per ask: the question and everything the session did before the next
  // question. A leading meta note joins the first card rather than taking a
  // slide of its own, so the deck opens on the conversation and not on a
  // disclaimer. A turn marked `_card` forces its own slide: the closing summary
  // is not part of the last exchange and should not be read as its tail.
  function groups(list) {
    const out = [];
    for (const t of list) {
      if (!out.length || t._card || t.role === 'user') out.push([]);
      out[out.length - 1].push(t);
    }
    if (out.length > 1 && out[0].every(t => t.role === 'meta')) {
      const [lead, ...rest] = out;
      rest[0] = [...lead, ...rest[0]];
      return rest;
    }
    return out;
  }

  // ── A card's layout ───────────────────────────────────────────────────────
  // Consecutive tool calls become one block, everything else stays a turn of
  // its own. The run is the unit because that is how the work arrives: a
  // sentence, then the several calls it introduced, then the next sentence. So
  // a fold per run keeps the prose sequence intact and hides only the
  // machinery, where a fold per call would leave one collapsed line per call
  // and condense nothing.
  //
  // Pure, and separate from the rendering, so the layout can be asserted
  // without a DOM.
  // A run carries its own `label`, since that line is the only thing a reader
  // sees on the way past a closed fold: the count, the tools in the order they
  // ran, and any failures. Deriving it here rather than in the renderer keeps
  // it assertable without a DOM.
  function runLabel(list) {
    const failed = list.filter(t => t.src?.ok === false).length;
    return [
      list.length + (list.length === 1 ? ' call' : ' calls'),
      ranSummary(list),
      failed ? failed + ' failed' : '',
    ].filter(Boolean).join('  ·  ');
  }

  // ── The step intro ────────────────────────────────────────────────────────
  // "Let me check the Sessions tab." "Now I'll make the change." "Now let me
  // render it." A short assistant turn immediately followed by tool calls is
  // not an answer, it is the sentence that introduces the work, and leaving it
  // expanded put three or four of them between the question and the reply that
  // actually answered it. So it folds WITH its calls and becomes the fold's
  // lead line, which is a better label than the tool names alone: "Now I'll
  // make the merged-is-purple change" places a run that "3 calls · Read, 2×
  // Edit" only describes.
  //
  // The cut is length, and the two populations barely overlap. Measured over
  // the store on 2026-08-26: 9,739 assistant turns are followed by calls and
  // run a median of 97 characters (p90 213); the 2,100 that are not run a
  // median of 3,499 (p10 660). At 300 characters, 94% of the narrating turns
  // fold. The rest are long enough to be saying something, so they stay
  // expanded with their calls folded beneath them, which is the shape a turn
  // that both reports and continues actually has.
  const STEP_INTRO = 300;

  function blocks(card) {
    const list = card || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.role === 'tool') {
        const last = out[out.length - 1];
        if (last && last.tools) last.tools.push(t);
        else out.push({ tools: [t] });
        continue;
      }
      if (t.role === 'assistant' && (t.md || '').length <= STEP_INTRO
          && list[i + 1]?.role === 'tool') {
        out.push({ tools: [], intro: t });
        continue;
      }
      out.push({ turn: t });
    }
    for (const b of out) if (b.tools) {
      b.label = runLabel(b.tools);
      // The sentence, put through the same titler the outline uses, so a lead
      // that opens with chrome is skipped here too rather than labelling a
      // fold with a URL.
      if (b.intro) b.lead = leadTitle(b.intro.md).title;
    }
    return sequence(out);
  }

  // ── The sequence ──────────────────────────────────────────────────────────
  // Steps run in a row: check, then edit, then render, then check again. One
  // fold each still left seven or eight lines of preparation standing between
  // the question and the reply, which is the same complaint one level up. So a
  // RUN of adjacent steps collapses into one fold, and the per-step folds
  // become its contents.
  //
  // The steps stay in the DATA, since the label counts them and the render
  // needs their order, but they are not a second layer of folds: opening the
  // sequence lays every sentence and every call out in place. Nesting was
  // tried and it was a fold too many, a menu standing where the work should
  // be. One fold to open, and what is behind it is the thing itself.
  //
  // A lone step is not wrapped, so it keeps its own sentence as its label
  // rather than being counted as "1 step".
  function sequence(list) {
    const out = [];
    for (const b of list) {
      const last = out[out.length - 1];
      if (b.tools && last?.steps) { last.steps.push(b); continue; }
      if (b.tools && last?.tools) { out[out.length - 1] = { steps: [last, b] }; continue; }
      out.push(b);
    }
    for (const b of out) if (b.steps) b.label = seqLabel(b.steps);
    return out;
  }

  // The tool list is capped here and nowhere else: a step's own label names two
  // or three tools, while a sequence of eight can name a dozen and push the
  // counts off the line that exists to carry them.
  const SEQ_TOOLS = 4;

  function seqLabel(steps) {
    const calls = steps.flatMap(s => s.tools);
    const failed = calls.filter(t => t.src?.ok === false).length;
    return [
      steps.length + ' steps',
      calls.length + (calls.length === 1 ? ' call' : ' calls'),
      ranSummary(calls, SEQ_TOOLS),
      failed ? failed + ' failed' : '',
    ].filter(Boolean).join('  ·  ');
  }

  // ── The outline ───────────────────────────────────────────────────────────
  // One line per card, so a session can be read as a list before it is read as
  // a conversation. Mechanical: a card's title is the first sentence of its
  // lead turn. No model is involved, and measured over the 1,242 card leads in
  // the store on 2026-08-09, that lands somewhere between half and 76% usable
  // (a pattern classifier says 76%, reading a sample by hand says about half;
  // the classifier can only catch failure shapes someone thought to write down).
  //
  // The residue splits four ways and only ONE of them is a model's problem:
  //
  //   markdown noise (5.2%)  a lead beginning with a branch anchor, a code
  //                          span, a heading, an upload path. An extraction
  //                          bug. Skipped, and the next sentence tried.
  //   too short (11.2%)      "Done." carries nothing. Also extraction: fall
  //                          through to the next sentence, and failing that,
  //                          say what the card DID from its tool calls.
  //   procedural ask (4.7%)  "Please proceed with the identified work." There
  //                          is nothing to summarize; a model would invent
  //                          something. Left as it is, honestly.
  //   result-only (3.3%)     "All five merged." The substance is in the body.
  //                          This one a model would genuinely improve.
  //
  // So this is the foundation and a label from a model is a later polish pass
  // on a minority. It is computed rather than committed for the same reason:
  // a deterministic derivation of data already in the record earns no second
  // copy. That changes the day something writes labels a rerun cannot
  // reproduce, which is when the index becomes a stored field with a `source`.

  // A lead that is chrome rather than content. The branch anchor is the big
  // one: every file-modifying reply opens with it, so it heads a card in most
  // working sessions.
  const NOISE_LEAD = /^\s*(?:working branch\b|[`*#>\[]|@"|https?:\/\/|\/[a-z])/i;
  const TITLE_CAP = 96;

  // Candidate titles, in the order they would be tried. A BLANK LINE splits
  // before a period does, and that ordering is the whole fix for the commonest
  // failure: a reply opens with the branch anchor on its own line, which has no
  // terminal punctuation, so collapsing whitespace first welds it to the
  // sentence after it and the noise test then rejects the pair rather than the
  // line. Splitting paragraphs first lets the anchor be skipped on its own.
  //
  // Within a paragraph, splitting on a period followed by a space over-splits
  // on "e.g." and on file names, which is what the minimum length is for: a
  // fragment that short is rejected and the next candidate tried, so an
  // over-split costs a retry rather than a wrong title.
  function sentences(text) {
    const out = [];
    for (const para of String(text || '').split(/\n\s*\n/)) {
      const t = para.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      for (const s of t.split(/(?<=[.!?])\s+/)) { const x = s.trim(); if (x) out.push(x); }
    }
    return out;
  }

  const cap = s => s.length > TITLE_CAP ? s.slice(0, TITLE_CAP).replace(/\s+\S*$/, '') + '…' : s;

  // `ok` says whether a candidate actually qualified. The caller needs that as
  // a separate fact from the text: "Done." is the truest string available and
  // is still not a title, so a card with tool calls should be titled by what it
  // ran instead. Returning only a string collapsed those two cases and the
  // fallback could never fire.
  function leadTitle(text) {
    for (const s of sentences(text)) {
      if (NOISE_LEAD.test(s)) continue;
      if (s.length < 25) continue;
      return { title: cap(s), ok: true };
    }
    return { title: cap(sentences(text)[0] || ''), ok: false };
  }

  // What a card did, from its tool calls: the fallback title when the prose
  // gave nothing, and the subtitle otherwise. Counts by tool name in the order
  // they first ran, which reads as a sequence rather than a histogram.
  function ranSummary(card, limit) {
    const order = [], seen = new Map();
    for (const t of card) {
      if (t.role !== 'tool') continue;
      const n = (t.src?.name) || (t.label || '').split(' · ')[0];
      if (!n) continue;
      if (!seen.has(n)) { seen.set(n, 0); order.push(n); }
      seen.set(n, seen.get(n) + 1);
    }
    const named = order.map(n => (seen.get(n) > 1 ? seen.get(n) + '× ' : '') + n);
    return limit && named.length > limit
      ? named.slice(0, limit).join(', ') + ', +' + (named.length - limit) + ' more'
      : named.join(', ');
  }

  function outline(record) {
    const cards = groups(turns(record));
    // `exchange` is which ask a card belongs to. A card IS an exchange now, so
    // it runs 1, 2, 3 down the conversation cards and reads as a number rather
    // than as a grouping: it is what lets a caller say "the fourth question"
    // about a deck whose slide numbers also count the meta cards.
    //
    // It used to be the pager's clustering key, back when several cards shared
    // one exchange. Passing it to the labeler now would put a margin before
    // every dot, which is a gap that separates nothing, so the deck no longer
    // asks for a group at all.
    //
    // Cards before the first ask (a leading note) are exchange 0, so the count
    // is of asks seen rather than of asks completed.
    let ex = 0;
    return cards.map((card, i) => {
      const ask = card.find(t => t.role === 'user');
      // The first assistant turn that STAYS on the card, preferred over one
      // folded into a step: a title should name something the reader can see,
      // and "Let me check the Sessions tab" is the work rather than the
      // answer. Falls back to any assistant turn when every one of them folded.
      const say = blocks(card).find(b => b.turn?.role === 'assistant')?.turn
        || card.find(t => t.role === 'assistant');
      const lead = ask || say || card[0] || {};
      const ran = ranSummary(card);
      // The ask titles the card, and the first reply is the understudy. That
      // second try is what a card-per-exchange needs and a card-per-turn did
      // not: a great many asks are "go", "please proceed", "yes do that", which
      // carry nothing and used to head a card of their own where the answering
      // card next to it said what happened. Now they are the same card, so the
      // prose is right there to be titled from instead.
      let title, derived;
      if (lead.role === 'meta') {
        title = lead.label || 'Note'; derived = 'lead-sentence';
      } else {
        const got = leadTitle(lead.md);
        const alt = (!got.ok && say && say !== lead) ? leadTitle(say.md) : null;
        if (got.ok) { title = got.title; derived = 'lead-sentence'; }
        else if (alt && alt.ok) { title = alt.title; derived = 'reply-sentence'; }
        else if (ran) { title = 'Ran ' + ran; derived = 'tool-calls'; }
        else if (got.title) { title = got.title; derived = 'lead-short'; }
        else { title = '(no text captured)'; derived = 'none'; }
      }
      const calls = card.filter(t => t.role === 'tool').length;
      // `kind` says what the exchange WAS, which the title cannot be trusted
      // to and no other field carries: `work` ran tools, `answer` was settled
      // in prose alone, `ask` never got an answer on the record, `note` is the
      // renderer's own card. Measured over the store on 2026-08-26, the 2,458
      // conversation cards run about four in five `work`, which is the honest
      // shape of a coding session and the reason the other three are worth a
      // glyph: they are the rows a reader scanning for the discussion wants.
      //
      // The test is mechanical and exact, and it moved with the grouping. It
      // used to read an ASSISTANT card's calls, since an assistant card with
      // no calls was the formatted reply. A card now holds both halves, so it
      // reads the whole exchange's calls instead.
      const kind = lead.role === 'meta' ? 'note'
                 : calls ? 'work'
                 : say ? 'answer'
                 : 'ask';
      if (ask) ex++;
      return {
        i, title, source: derived, kind, exchange: ex,
        role: lead.role || 'meta',
        ts: lead.ts || '',
        ran, calls,
        turns: card.length,
        start: 0,   // filled by the consumer that flattens; see session-export.model
      };
    });
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
      // Cut at a word boundary and say it was cut. The raw slice landed
      // mid-sentence and mid-word, so a header read as though the ask simply
      // ended somewhere odd ("...our repository today? Registry").
      title: r.opening_ask ? cap(r.opening_ask.replace(/\s+/g, ' ').trim()) : (r.short || 'Session'),
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

  const cm = () => {
    if (!window.claudeMark) throw new Error('session-render: load claude-mark.js first');
    return window.claudeMark;
  };

  // ── What a card hands chat-render ────────────────────────────────────────
  // `collapse: 0` turns off chat-render's height clamp, which by default cuts a
  // message at 460px and offers "Show full message". That clamp is right in a
  // chat, where turns are stacked in one scroll and one long message buries
  // the rest. A deck is the opposite: a card is one message on its own slide,
  // the slide scrolls by itself, and there is nothing below to protect. So the
  // clamp bought nothing and cost a cut mid-sentence with the rest of the
  // slide left blank underneath it.
  //
  // It is also unnecessary rather than merely unwanted. Nothing reaching here
  // is unbounded: the record caps prompts at 400 characters, prose at 8 KB a
  // turn, and result bodies at 1 to 2 KB, so a card has a ceiling before it is
  // ever rendered. A caller can still pass its own `collapse` to put the clamp
  // back.
  const cardOpts = o => ({ collapse: 0, ...o });

  // ── The fold ──────────────────────────────────────────────────────────────
  // The work as a summary line that opens. This is what lets a whole exchange
  // be a card: the median exchange in the store carries 10 calls, and expanded
  // they bury the three sentences around them.
  //
  // Two things about it are load-bearing rather than decorative. The body is
  // built on FIRST OPEN, not at render time, so a card holding 300 calls costs
  // one line each until someone asks; chat-render's message() promotes fenced
  // blocks to live code cards, which is not a cost to pay for output nobody
  // looked at. And the summary line comes from blocks(), so what a closed fold
  // says is settled where the layout is, not where the markup is.
  const el = (tag, cls, ...kids) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids) if (k) n.append(k);
    return n;
  };

  function fold(b, cr, mo) {
    const { label, lead } = b;
    const steps = b.steps || [b];
    const d = el('details', 'group border-l-2 border-info/40 pl-3.5 py-0.5');
    const cap = el('span', 'font-mono text-[9.5px] tracking-widest uppercase opacity-50 truncate');
    cap.textContent = label;
    const caret = el('i', 'ph ph-caret-right text-[12px] shrink-0 opacity-50 transition-transform group-open:rotate-90');
    const wrench = () => el('i', 'ph ph-wrench text-[12px] shrink-0 opacity-50');
    // A lone step has one sentence to show, so it goes on top with the counts
    // under it. A sequence covers several and shows counts alone.
    let sum;
    if (lead) {
      const line = el('span', 'truncate text-sm opacity-80');
      line.textContent = lead;
      sum = el('summary',
        'flex cursor-pointer select-none items-start gap-1.5 list-none [&::-webkit-details-marker]:hidden',
        el('span', 'flex items-center gap-1.5 pt-0.5', caret, wrench()),
        el('span', 'min-w-0 flex flex-col', line, cap));
    } else {
      sum = el('summary',
        'flex cursor-pointer select-none items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden',
        caret, wrench(), cap);
    }
    const body = el('div', 'space-y-4 pt-2.5');
    d.append(sum, body);
    let built = false;
    d.addEventListener('toggle', () => {
      if (built || !d.open) return;
      built = true;
      // Flat: every step's sentence in full, then its calls, in order. The
      // steps were folds of their own for one round and it was a fold too
      // many. Opening the work should show the work, not a second menu; the
      // sentences are what carries the sequence, and stacked in place they
      // read as the narration they were, which is exactly what a reader who
      // opened this wanted.
      for (const st of steps) {
        if (st.intro) body.append(cr.message(st.intro, mo));
        for (const t of st.tools) body.append(cr.message(t, mo));
      }
    });
    return d;
  }

  // A card: prose turns as messages, the work as folds.
  function renderCard(card, host, cr, mo) {
    for (const b of blocks(card)) host.append(b.turn ? cr.message(b.turn, mo) : fold(b, cr, mo));
  }

  // ── One card, for anyone who is not the deck ──────────────────────────────
  //
  // The deck's own slide body, exported. session-export's picker was drawing
  // its own version of a turn, a role word and a timestamp over plain text with
  // a hand-rolled truncation, which is a SECOND representation of the thing
  // this kit already knows how to draw. Reported 2026-09-01: "I'm not sure why
  // we need these two different representations ultimately." There is no
  // reason, and this is the export that removes it.
  //
  // `collapse` is the one thing a caller reasonably differs on. A deck slide is
  // the whole screen and clamps nothing (cardOpts); a list of cards wants a
  // ceiling per turn, and chat-render's own clamp gives the fade and the "Show
  // full message" button rather than a preview invented per surface.
  async function card(turns, host, o = {}) {
    await ready();
    renderCard(turns || [], host, CR(), cardOpts(o));
    return host;
  }

  // The takeover. `link` goes to the harness session when the record recovered
  // one from its own commit trailers; a session that never committed has no
  // such address, and an absent button is the honest rendering of that.
  //
  // It carries the Claude logomark rather than the deck's default arrow, which
  // is the estate's standard way to say "this goes to a session" and the same
  // mark the Sessions rows, the branch rows and pages/session.html draw beside
  // one. The deck is generic and the mark is not, so the mark is supplied here:
  // a deck over a staged fileset gets the arrow, and this one names its exit.
  //
  // The Export action appears only when kits/session-export.js is loaded, which
  // is the dependency running the other way: that kit reads this one, so this
  // one may not require it. The check is at open() time rather than at load,
  // so the chain order is the caller's business and a page that never loads the
  // exporter simply gets a deck with no export button.
  // A mark per kind, so the list reads as a shape before it reads as text. The
  // titles are mechanical and land somewhere between half and 76% usable (see
  // the note over outline()), and the icon is the half that never misses: what
  // a card IS comes from whether its lead was an ask and whether it issued
  // calls, which is exact. So a row whose title came out badly still says "this
  // is where you asked something," and that is most of what a reader scanning
  // thirty cards is looking for.
  const KIND = {
    ask:    'ph-user',
    work:   'ph-wrench',
    answer: 'ph-chat-teardrop-text',
    note:   'ph-info',
  };

  async function open(record, o = {}) {
    await ready();
    const cr = CR();
    const g = groups(turns(record));
    const line = outline(record);
    const d = describe(record);
    const mo = cardOpts(o);
    const actions = [];

    // READING IT ALOUD, which is the third way through a record beside the
    // outline and the deck, and the only one that does not need the screen. It
    // belongs in this header rather than on the brief for the reason the kit's
    // `actions` slot exists at all: the deck is the only thing that knows which
    // card the reader is on, and "read aloud" means "from here".
    //
    // One item per slide, so the voice and the deck share one index. A card is
    // an exchange, and only its ask and its prose replies are spoken: the tool
    // turns are the bulk of every session and are unlistenable by construction,
    // a fenced diff and a path and a JSON body. The deck still shows them.
    const speaker = window.readAloud?.supported && o.speak !== false
      ? window.readAloud.deckAction({
          items: g.map((card, i) => ({
            key: i,
            label: line[i]?.title || 'Card ' + (i + 1),
            md: card.filter(t => t.role === 'user' || t.role === 'assistant')
                    .map(t => t.md).filter(Boolean).join('\n\n'),
          })),
        })
      : null;
    if (speaker) actions.push(speaker.action);

    // NO COPY ACTION HERE. It opened session-export's takeover, which was this
    // session's card list a second time, so the deck offered a way forward that
    // led back to the surface the reader had just left. Copying belongs on the
    // list, and the way to the list is the way out of the deck.

    // ONE LEVEL DOWN when a deck already holds this session, top level
    // otherwise. `parent` is the same seam kits/file-deck.js takes and for the
    // same reason: a brief opened in a deck of briefs drills into its own
    // contents, so Back returns to the brief rather than closing everything,
    // and the crumb picks up the session's name from the deck above instead of
    // repeating it. A caller with no parent passes none and nothing changes.
    const deckOpts = {
      count: g.length,
      render: (i, slide) => renderCard(g[i], slide, cr, mo),
      innerClass: 'mx-auto max-w-2xl space-y-4',
      title: o.title || d.title,
      subtitle: o.subtitle || d.subtitle,
      icon: 'ph-terminal-window',
      // Opening at a card rather than at slide 0: the outline hands over which
      // row was tapped, and landing on the first slide would discard it.
      start: Number.isInteger(o.start) ? o.start : undefined,
      // THE CONTENTS, and it is the outline read at deck scale. The rows are
      // not derived a second time: `outline` is computed from the same
      // `groups(turns(record))` this deck counts, so row `i` IS slide `i` by
      // construction rather than by a mapping that could drift.
      //
      // It costs a second walk of the record at open time, since outline()
      // re-derives the cards rather than taking them. That is the trade the
      // kit's contract asks for: a slide is lazy because it costs a render, a
      // label is eager because the caller already holds it. Thirty cards of
      // metadata is nothing beside one card of rendered markdown, and passing
      // the cards in would widen a signature two callers already agree on.
      index: (i) => {
        const row = line[i];
        if (!row) return {};
        return {
          icon: KIND[row.kind] || KIND.note,
          title: row.title,
          // What the exchange DID, under what it was about. On a work card
          // this is the tool summary the outline already built ("3× Bash,
          // Read"), which is the line that tells a reader whether the card
          // they are looking for is this one. An exchange settled in prose has
          // no calls and gets its timestamp instead, since the other thing a
          // reader navigates a session by is when.
          subtitle: row.ran || row.ts || '',
        };
      },
      actions,
      link: record?.agent_session
        ? {
            href: record.agent_session,
            title: 'Open this session in Claude Code',
            svg: cm().svg({ cls: 'w-6 h-6 shrink-0' }),
          }
        : null,
      // Composed, because two things want to know: the caller, and the voice,
      // which follows the reader when the reader moves first.
      onSlide: (i) => { speaker?.onSlide(i); o.onSlide?.(i); },
      // A dismissed overlay takes its buttons with it and leaves the synth
      // talking, which is the one failure mode a reader cannot undo without
      // finding the tab again.
      onClose: () => { speaker?.stop(); o.onClose?.(); },
    };
    const handle = o.parent ? sd().drill(o.parent, deckOpts) : sd().open(deckOpts);
    // `speak()` on the handle, so a caller that opened this deck INSIDE a user
    // gesture can start the voice in that same gesture. Safari will not speak
    // otherwise, and the brief's Listen button is exactly that caller: without
    // it the reader taps once to open and again on the deck's own speaker,
    // which is the friction the button exists to remove.
    if (speaker) handle.speak = () => {
      speaker.adopt(speaker.button(handle.el));
      speaker.action.onClick(handle.deck, null);
    };
    return handle;
  }

  // Inline: the same slides in a fixed-height box, for a page that wants the
  // conversation in place rather than over everything.
  async function deck(record, o = {}) {
    await ready();
    const cr = CR();
    const g = groups(turns(record));
    const mo = cardOpts(o);
    const core = sd().core(g.length,
      (i, slide) => renderCard(g[i], slide, cr, mo),
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

  window.sessionRender = { ready, turns, groups, blocks, outline, describe, card, open, deck, bytes };
})();
