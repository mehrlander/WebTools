// Sessions aggregate for the web-tools ecosystem. The private registry holds one
// JSON record per Claude Code session under `sessions/YYYY/MM/`, written by the
// Stop hook while the session runs (web-tools-private/sessions/README.md). This
// folds them into one small cache file (state/sessions.json) that the estate's
// Sessions view renders.
//
// It exists for the same reason state/activity.json does, only more sharply. The
// store is 4.6 MB across 40 records and grows by about six records a day, and a
// single record runs to half a megabyte because it carries every tool call. No
// view can read that on open. Measured on the first live crawl (2026-08-05, 42
// records): the whole cache is 135 KB, about 1 KB a row, so it is smaller than
// the largest single record and 34x smaller than the store. The full record is
// fetched only when a reader opens one.
//
// The crawl is incremental in a way the config and activity crawls cannot be: a
// published record is addressed by a git blob sha, so a crawl re-summarizes only
// the records whose sha moved. In steady state that is the day's handful plus the
// live session's own record, which rewrites on every Stop.
//
// Three rollups ride the cache, all folded from the rows so a reader pays for
// none: `attention` (the busiest files across sessions, the Sessions pane's
// panel), `docAttention` (the same fold over the docs/ slice, which the Map
// view's Docs tab renders as each document's readership), and
// `startupAttention` (what was in context before the conversation began,
// which is presence rather than access and is folded separately for that
// reason: the two must never be summed).
//
// The fold takes a SECOND input beside the records: a dated export of the
// claude.ai/code sidebar, which is the only place a session's real title exists
// in a form the estate can read. See "The real title, joined from a dated
// export" below, and web-tools-private sessions/README.md for why a record can
// never carry one itself.
//
// Pure builders live here so they can be unit-tested; the network crawl and the
// throttle that drive them live in the show-repo shell (refreshSessionsCache),
// exactly as repo-activity-cache.js splits pure fold from shell crawl. Attaches
// to window.RepoSessionsCache, loaded via gh.load('kits/repo-sessions-cache.js').
(() => {
  const CACHE_PATH = 'state/sessions.json';
  const ROW_CAP = 400;      // summary rows kept, newest first
  const TOOLS_KEPT = 6;     // busiest tools named per row
  const FILES_KEPT = 8;     // busiest files named per row
  const ASK_CHARS = 240;
  // The closing reply, capped. It is longer than the ask because the two are
  // read differently: the ask is a LABEL on a row and 240 characters is more
  // than a row can show, while the reply is the payoff a reader hovers for and
  // wants in prose. Measured over the 224 records on file 2026-08-27: median
  // 1,554 characters, p90 3,685, max 7,453, so this cuts most of them. The cut
  // is MARKED (see closingReply), which is the whole lesson of the store's own
  // schema-5 note: a bound is fine and a silent bound is not.
  const REPLY_CHARS = 600;
  // The summarizer's own version, carried on every row. A crawl refetches a
  // record whose row was built by an older summarizer, so adding a field here
  // heals the cache on the next pass instead of leaving the new field empty for
  // every record whose blob sha never moves again. Bump it when summarize()
  // starts reading something it did not read before.
  //
  // 5, NOT 4, and the reason is worth keeping. Two branches added fields at the
  // same time (docShell on one, reply on the other) and each bumped 3 to 4, so
  // the merge produced one summarizer reading both and a version that only says
  // ONE of them was added. A row is stale against a new field and its record's
  // sha will never move again to say so, which makes this number the only
  // signal there is; two independent additions sharing it defeats it silently.
  // The rule the collision teaches: on a merge, take a number NEITHER side
  // used, and never assume an identical bump on both sides is agreement.
  //
  // 6 adds `turns`. It landed before the store had finished healing to 5, so
  // the two fields arrive together on one pass rather than costing two: a
  // crawl reads SESSIONS_MAX_FETCH records and a row behind on either version
  // is refetched by the same check.
  const ROW_V = 6;
  // Paths under any repo's docs/ directory. The docs registry's readership
  // column reads these, and it needs the WHOLE set rather than the busiest few:
  // a doc opened once in a session that touched forty files is exactly the
  // reading the column is counting, and `files` below would have dropped it.
  const DOC_RE = /(^|\/)docs\//;
  // Guides (pages/guides/*.html), the same uncapped treatment as docs/ and for
  // a sharper version of the same reason. A guide's authorship was derivable
  // only through its branch's open PR, which says a branch CONTAINS the file
  // rather than that anyone wrote it, and which goes dark the moment the PR
  // merges: the one guide in the estate showed no session at all, though the
  // record of the session that wrote it names the path outright. This is the
  // edge that is exact and permanent, so it is the one the row carries.
  const GUIDE_RE = /(^|\/)pages\/guides\/[^/]+\.html?$/i;

  // ── The shell channel ──────────────────────────────────────────────────────
  // A doc read with `cat`, `sed -n` or `grep` leaves no trace in `files`, which
  // the recorder builds from file-tool inputs alone. That caveat was written
  // down when the readership column shipped and left open on the grounds that
  // closing it meant new instrumentation. It does not: every record already
  // carries `calls`, and a Bash call carries the command it ran. Measured
  // 2026-08-26 over 53,270 calls in 186 records: Bash is 74% of all tool calls,
  // and counting it takes the docs registry's coverage from 19 rows of 68 to
  // 61. The column was undercounting threefold, which on a readership column
  // reads as "nobody opens this" rather than as "this instrument cannot see".
  //
  // Deliberately conservative, because a false attribution is worse here than a
  // missing one: a row that overstates its readership argues for keeping a doc
  // nobody reads. A hit counts only when the command looks like a read, the
  // path is not being written, and the checkout it belongs to is unambiguous.
  const CMD_SPLIT_RE = /[;\n]|&&|\|\||\|/;
  const READS_RE = /\b(cat|sed|head|tail|less|more|wc|grep|rg|awk|jq|diff|python3?|node|git)\b/;
  const CHECKOUT_RE = /(?:\bcd\s+|-C\s+)\/home\/user\/([A-Za-z0-9_.-]+)/g;
  const ABS_DOC_RE = /\/home\/user\/([A-Za-z0-9_.-]+)\/((?:[A-Za-z0-9_.-]+\/)*docs\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;
  const REL_DOC_RE = /(?:^|[\s'"=(])((?:[A-Za-z0-9_.-]+\/)*docs\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g;

  function matchAll(re, s) {
    const out = []; let m;
    re.lastIndex = 0;
    while ((m = re.exec(s)) !== null) { out.push(m); if (m.index === re.lastIndex) re.lastIndex++; }
    return out;
  }

  // Docs a session read through a shell command, as {path: count}, keyed in the
  // same "<checkout>/<repo-relative>" space as `files` so the two fold together.
  //
  // A relative path (`docs/SURFACING.md`) names no checkout, so it is attributed
  // only when exactly one candidate exists: a checkout named in the same command
  // by `cd` or `git -C`, or failing that a session that touched exactly one repo.
  // A session spanning three checkouts and typing a bare path is dropped, which
  // is the honest answer rather than a guess spread across three registries.
  function shellDocsOf(rec) {
    const out = {};
    const repos = (rec?.repos || []).map(r => r?.name).filter(Boolean);
    for (const call of rec?.calls || []) {
      if (call?.name !== 'Bash') continue;
      const cmd = String(call.arg || '');
      if (!cmd.includes('docs/')) continue;
      // Checkouts the command itself names, read across the whole command: a
      // `cd` in the first segment governs the ones after it.
      const named = new Set([
        ...matchAll(CHECKOUT_RE, cmd).map(m => m[1]),
        ...matchAll(ABS_DOC_RE, cmd).map(m => m[1]),
      ]);
      const fallback = named.size ? named : new Set(repos);
      for (const seg of cmd.split(CMD_SPLIT_RE)) {
        if (!READS_RE.test(seg)) continue;
        const hits = new Set();
        for (const m of matchAll(ABS_DOC_RE, seg)) hits.add(m[1] + '/' + m[2]);
        if (fallback.size === 1) {
          const only = [...fallback][0];
          for (const m of matchAll(REL_DOC_RE, seg)) hits.add(only + '/' + m[1]);
        }
        for (const path of hits) {
          // A redirect onto the path, an in-place edit, or a delete is not a
          // read, and counting it would make writing a doc look like reading it.
          const rel = path.slice(path.indexOf('/') + 1);
          if (seg.includes('sed -i') || new RegExp('>\\s*\\S*' + rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(seg)) continue;
          out[path] = (out[path] || 0) + 1;
        }
      }
    }
    return out;
  }

  // Same deterministic short hash as the other two caches, so all three read
  // alike and a reviewer comparing them is comparing like with like.
  function hash(value) {
    const s = value == null ? ' null' : JSON.stringify(value);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // The busiest N entries of a {key: count} map, as [key, count] pairs, ties by
  // key so the output is stable across runs. Set iteration order is not a sort:
  // this store's own board generator shipped a nondeterministic artifact by
  // assuming it was, and the fix was to sort explicitly rather than to hope.
  function topN(counts, n) {
    return Object.entries(counts || {})
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, n);
  }

  // Total accesses of a file across its kinds ({read: 2, edit: 1} -> 3).
  function fileWeight(kinds) {
    if (typeof kinds === 'number') return kinds;       // tolerate a flat count
    return Object.values(kinds || {}).reduce((a, b) => a + (b || 0), 0);
  }

  // Every docs/ path a session touched, weighted and sorted, uncapped.
  //
  // Uncapped is the whole point, and it is why this is a second slice rather
  // than a larger FILES_KEPT. `files` answers "what was this session working
  // on," which a top-N answers well and a full list would answer worse. The
  // registry column asks the opposite question, one file at a time and across
  // every session, so a top-N answers it wrong in a way nothing on screen would
  // reveal: a doc simply reads zero. The set is small enough to carry whole
  // (this repo's docs/ is 43 files, and a session opens a handful).
  function docFilesOf(files) {
    return filesMatching(files, DOC_RE);
  }

  // Every guide path a session touched. Uncapped for the same reason docFiles
  // is: `files` keeps the busiest eight, and a session that opened a guide once
  // among forty files would drop it, which reads on screen as "this session
  // wrote no guide" rather than as a truncation. The set is tiny (one flat
  // list per repo), so carrying it whole costs nothing.
  function guideFilesOf(files) {
    return filesMatching(files, GUIDE_RE);
  }

  // [path, weight] pairs from a {path: count} map, sorted like filesMatching.
  function pairs(counts) {
    return Object.entries(counts || {})
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  }

  // A [path, weight] list plus a {path: count} map, as one sorted list. The
  // same document reached both ways counts once per access on each channel,
  // which is what `count` has always meant; `sessions`, the number the column
  // actually renders, is unaffected either way.
  function mergeCounts(list, counts) {
    const by = {};
    for (const [path, n] of list || []) by[path] = (by[path] || 0) + n;
    for (const [path, n] of Object.entries(counts || {})) by[path] = (by[path] || 0) + n;
    return pairs(by);
  }

  function filesMatching(files, re) {
    return Object.entries(files || {})
      .filter(([path]) => re.test(path))
      .map(([path, kinds]) => [path, fileWeight(kinds)])
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  }

  // ── How the session ENDED ──────────────────────────────────────────────────
  // The ask on a row says how a session opened. This says how it closed, and
  // the pair is the session in two lines: what was wanted, what came of it.
  //
  // `replies` (schema 4) is the assistant's own prose, one entry per turn, so
  // the closing one is the last by timestamp. A schema-1 through -3 record has
  // no `replies` at all and `last_message` is the only assistant text it kept,
  // which is the tail of the final turn at 500 characters; 52 of the 224
  // records on file are in that state and would otherwise have nothing to say.
  // Both are the same claim at different fidelity, so they share one field and
  // the consumer is told which it got by `replyPartial`.
  //
  // Sorted by `at` rather than taken off the end: the recorder appends in
  // order and nothing has ever reordered the list, but the deck's own turn
  // merge sorts for the same reason and a row that disagreed with the reader
  // it feeds would be worse than the sort costs.
  function closingReply(r) {
    const kept = (r?.replies || []).filter(x => x && x.text);
    const text = kept.length
      ? String(kept.reduce((a, b) => ((b.at || '') > (a.at || '') ? b : a)).text)
      : String(r?.last_message || '');
    return text.trim().slice(0, REPLY_CHARS);
  }
  // When the closing reply was said. Same reduce as closingReply, so the two
  // cannot pick different turns; a schema-3 record has no per-turn time at all
  // and gets none rather than the session's end stamp standing in for one.
  function closingAt(r) {
    const kept = (r?.replies || []).filter(x => x && x.text);
    return kept.length ? kept.reduce((a, b) => ((b.at || '') > (a.at || '') ? b : a)).at || '' : '';
  }
  // Whether the string above is the whole of what the record holds. Two ways to
  // be partial and they are not the same: this cut it, or the recorder did.
  function replyPartial(r) {
    const kept = (r?.replies || []).filter(x => x && x.text);
    if (kept.length) {
      const last = String(kept.reduce((a, b) => ((b.at || '') > (a.at || '') ? b : a)).text).trim();
      return last.length > REPLY_CHARS ? 'cut' : '';
    }
    // No `replies`, so whatever came back is already the recorder's own 500
    // character tail of the final turn and never the turn itself.
    return r?.last_message ? 'tail' : '';
  }

  // ── The scroll back: what was said on the way here ────────────────────────
  // `reply` is how the session closed. This is everything before it that a
  // reader would have read, so the card scrolls back through the conversation
  // instead of showing one paragraph and stopping.
  //
  // WHICH TURNS, and this is where the card parts company with the deck on
  // purpose. An assistant turn immediately followed by tool calls is work in
  // progress: the sentence that announces a step, or the running report between
  // two of them. The deck keeps the longer ones of those, because a deck is a
  // READING surface and a 400-character progress note is worth reading in a
  // slide with room for it. This is a SCAN surface, two or three lines a turn,
  // and there a progress note is noise: measured on one real record, seven of
  // the fourteen turns the deck expanded were narration clustered just over the
  // deck's own threshold (309, 317, 330, 359, 387, 412, 677 characters), and
  // cut to a card's width they read as seven fragments.
  //
  // So the rule here is the simpler one: followed by calls means in progress,
  // whatever its length. Across the store that drops 765 turns the deck keeps,
  // and what survives has a 10th percentile of 518 characters, meaning even the
  // shortest tenth of it is a real answer. The card's set is a strict SUBSET of
  // the deck's, never a turn the deck folds, which is what
  // tools/test/session-main-turns.test.mjs holds.

  // The three caps, and each answers a different question.
  //
  // TURN_HEAD is the opening of a turn, not the turn. Whole sentences while
  // they fit, so an entry ends where a thought does rather than mid-word; a
  // first sentence longer than the cap is cut at a word boundary and marked
  // with an ellipsis. 240 is two or three lines at the card's width.
  //
  // PROMPT_HEAD is shorter because an ask here is STRUCTURE, not content. It
  // separates one exchange from the next so a column of replies reads as a
  // conversation. The full opening ask is already on the row at ASK_CHARS.
  //
  // TURNS_KEPT bounds the field, and it is the NEWEST that survive: a reader
  // scrolling back goes backwards from the end. Truncation is REPORTED
  // (`turnsCut`), because the store's own schema-5 lesson is that a bound is
  // fine and a silent one is the damage.
  //
  // 60, and the number came off the curve rather than a guess. Measured
  // 2026-08-27 over 229 records: the MEDIAN row costs 2,079 bytes at every cap
  // from 40 upward, and is unchanged by removing the cap entirely, because the
  // median session has 17 entries. All the cost is in the tail. So the cap buys
  // nothing from the typical row and everything from the worst: at 20 it cut
  // 97 rows to fund a store of 410 KB; at 60 it cuts 20 rows for 651 KB; with
  // no cap at all one 144-entry session reaches 18,769 bytes on its own for a
  // store of 710 KB. 60 leaves 91% of rows whole and still bounds the outlier,
  // which is what a cap is for.
  const TURN_HEAD = 240;
  const PROMPT_HEAD = 120;
  const TURNS_KEPT = 60;

  // A turn's opening, ending where a sentence does. The same shape
  // session-render.js titles an outline row with, for the same reason: a cut at
  // a character count lands mid-word and reads as damage, where a sentence
  // boundary reads as a summary. A lead that is chrome rather than prose (a
  // branch anchor, a bare URL, a heading) is skipped, so an entry does not open
  // on an address.
  const NOISE_LEAD = /^\s*(?:working branch\b|[`*#>\[]|@"|https?:\/\/|\/[a-z])/i;
  function sentences(text) {
    const out = [];
    for (const para of String(text || '').split(/\n\s*\n/)) {
      const t = para.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      for (const x of t.split(/(?<=[.!?])\s+/)) { const y = x.trim(); if (y) out.push(y); }
    }
    return out;
  }
  function head(text, cap) {
    const ss = sentences(text);
    let i = 0;
    while (i < ss.length - 1 && NOISE_LEAD.test(ss[i])) i++;
    let out = '';
    for (; i < ss.length; i++) {
      const next = out ? out + ' ' + ss[i] : ss[i];
      if (next.length > cap) {
        // Whole sentences already gathered win over a cut one. Only a FIRST
        // sentence longer than the cap is cut, and then at a word boundary.
        return out || ss[i].slice(0, cap).replace(/\s+\S*$/, '') + '…';
      }
      out = next;
    }
    return out;
  }

  // The record's three lists interleaved on `at`, which is the same merge
  // session-render.js does and for the same reason: an assistant turn and the
  // calls it issued carry the SAME timestamp, since both are read from one
  // transcript message, so a rank has to break the tie or the calls sort above
  // the sentence that introduced them. Only the roles are needed here, so a
  // call contributes its timestamp and nothing else.
  const RANK = { user: 0, assistant: 1, tool: 2 };
  function mergedTurns(r) {
    const out = [];
    for (const p of r?.prompts || []) out.push({ role: 'user', md: p.text || '', at: p.at || '' });
    for (const x of r?.replies || []) out.push({ role: 'assistant', md: x.text || '', at: x.at || '' });
    for (const c of r?.calls || []) out.push({ role: 'tool', md: '', at: c.at || '' });
    out.forEach((t, i) => { t._i = i; });
    return out.sort((a, b) =>
      (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
      || (RANK[a.role] - RANK[b.role])
      || (a._i - b._i));
  }

  // [role, text] pairs, chronological, role as one character because this list
  // runs to twenty entries a row and the key is half the JSON otherwise.
  //
  // BOTH ENDS ARE DROPPED, and for the same reason: the row already has them.
  // The closing reply is on the row in full at REPLY_CHARS, so carrying its
  // first 120 characters here would print the same sentence twice, once
  // truncated. The opening ask is on the row at ASK_CHARS, and it IS the first
  // prompt: checked against all 225 records on file 2026-08-27, `opening_ask`
  // and `prompts[0]` agree every time. Keeping it made the card open on the
  // same question twice over, once quiet and once as its own separator.
  //
  // A truncated session is unaffected, since its first surviving entry is
  // somewhere in the middle and was never the opener.
  // A prompt that is ONE ATTACHMENT and no words. The harness records an
  // attached image as a prompt whose whole text is its own placeholder, which
  // is not prose and must not be read as any: 653 of the 3,895 prompts on file
  // (17%) are these, every one of them placeholder-only, never a placeholder
  // beside a sentence. Left to the sentence splitter the opening half is
  // discarded as a noise lead (it starts with a bracket) and the SECOND half
  // survives, so a turn rendered as "Multiply coordinates by 1.50 to map to
  // original image.]" and read as gibberish. Reported 2026-08-27.
  const IMAGE_ONLY = /^\s*\[image\b[^\]]*\]\s*$/i;

  function priorTurns(r) {
    const seq = mergedTurns(r);
    const out = [];
    let firstPrompt = true;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i];
      if (t.role === 'user') {
        if (firstPrompt) { firstPrompt = false; continue; }
        if (IMAGE_ONLY.test(t.md || '')) { out.push({ k: 'u', img: 1, ts: clock(t.at) }); continue; }
        out.push({ k: 'u', md: t.md, ts: clock(t.at) });
        continue;
      }
      if (t.role !== 'assistant') continue;
      if (seq[i + 1]?.role === 'tool') continue;      // work in progress
      out.push({ k: 'a', md: t.md, ts: clock(t.at) });
    }
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].k === 'a') { out.splice(i, 1); break; }
    }
    // A RUN of attachments is one turn. They arrive in runs because a person
    // drops several screenshots into one message: 653 attachments across the
    // store fall into 299 runs, 142 of which hold two or more and the longest
    // 13. Rendered one apiece that is thirteen identical lines saying nothing.
    // The count is what the reader actually wants, and the FIRST timestamp,
    // because that is when the run began.
    const merged = [];
    for (const e of out) {
      const last = merged[merged.length - 1];
      if (e.img && last?.img) { last.img += 1; continue; }
      merged.push({ ...e });
    }
    return merged
      .slice(-TURNS_KEPT)
      .map(e => e.img
        ? ['u', e.img === 1 ? '[image]' : '[' + e.img + ' images]', e.ts]
        : [e.k, head(e.md, e.k === 'u' ? PROMPT_HEAD : TURN_HEAD), e.ts])
      .filter(([, t]) => t);
  }

  // The wall-clock time the card's turn chrome prints, which is the same
  // HH:MM:SS session-render slices for the deck. Carried per entry rather than
  // inferred from the row's own `started` and `ended`: those agree with the
  // first prompt on 194 of 225 records and with the last reply on 168 of 172,
  // so inferring would print a wrong time on one row in seven and there would
  // be nothing on screen to say which.
  const clock = (at) => String(at || '').slice(11, 19);
  // Whether anything was dropped off the FRONT. A reader who has scrolled to
  // the top of the card is entitled to know whether that is the beginning of
  // the session or just the beginning of what fits.
  // Counted off priorTurns itself, before the cap, so the note cannot disagree
  // with the list at the boundary. Deriving it a second time by hand is how the
  // two ends above would have been dropped from one and not the other.
  function turnsPartial(r) {
    const seq = mergedTurns(r);
    let n = 0, firstPrompt = true, runOpen = false;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i];
      if (t.role === 'user') {
        if (firstPrompt) { firstPrompt = false; continue; }
        // A run of attachments collapses to one entry above, so it counts as
        // one here. Counting them singly would report a cut the list does not
        // make on any record with a run near the cap.
        if (IMAGE_ONLY.test(t.md || '')) { if (!runOpen) { n++; runOpen = true; } continue; }
        runOpen = false; n++; continue;
      }
      if (t.role !== 'assistant') continue;
      if (seq[i + 1]?.role === 'tool') continue;
      runOpen = false; n++;
    }
    return n - 1 > TURNS_KEPT ? 'cut' : '';
  }

  // ── Startup context (record schema 6) ────────────────────────────────────
  // What was in context BEFORE the conversation began, against `files`, which
  // is what a tool deliberately opened. The two must not be added together: a
  // document present in forty sessions and opened in three has not been read
  // forty-three times, and until this landed the docs registry rendered that
  // difference as the hard-coded word "injected" on two rows, because a count
  // would have ranked the estate's two most-read files last.
  //
  // `basis` rides along per path. `receipt` means the injecting hook named what
  // it supplied; `reconstructed` means a static walk stood in for a loader with
  // no hook to observe it. A consumer that shows a number should be able to say
  // which kind it is, so the distinction survives the fold instead of being
  // resolved here.
  function startupOf(rec) {
    return (rec.startup_context || [])
      .filter(e => e && e.path)
      .map(e => [e.path, e.basis === 'receipt' ? 'receipt' : 'reconstructed'])
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  }

  // Presence, not frequency. `fileAttention` sums a per-row count, which is the
  // right shape for tool calls and the wrong one here: a file is in a session's
  // startup context or it is not, so the only honest number is how many
  // sessions. Hence its own fold rather than a fourth call to that one.
  function startupAttention(rows) {
    const by = new Map();
    for (const row of rows || []) {
      // One session counts once per path, and where it holds BOTH bases for one
      // file the receipt wins. That happens for real: docs/CONVENTIONS.md is
      // fetched from main by the conventions hook and @-imported from a local
      // checkout by web-tools/CLAUDE.md, so a session legitimately knows it two
      // ways. Resolving here rather than letting sort order decide, because
      // "receipt" sorting before "reconstructed" is an accident of the alphabet
      // and this is a judgment: a receipt is the stronger claim, so a session
      // that has one is counted as having one.
      const best = new Map();
      for (const [path, basis] of row.startup || []) {
        if (basis === 'receipt' || !best.has(path)) best.set(path, basis);
      }
      for (const [path, basis] of best) {
        let e = by.get(path);
        if (!e) by.set(path, (e = { path, sessions: 0, receipt: 0, reconstructed: 0, last: '' }));
        e.sessions += 1;
        e[basis] += 1;
        if ((row.started || '') > e.last) e.last = row.started || '';
      }
    }
    return [...by.values()]
      .sort((a, b) => (b.sessions - a.sessions) || a.path.localeCompare(b.path));
  }

  // ── The row ────────────────────────────────────────────────────────────────
  // One session's record reduced to what a scan needs. Everything here is either
  // a filter axis, a sort key, or the one line that says what the session was
  // about; anything a reader wants beyond this is a reason to open the record.
  //
  // `agent` is the harness session URL (schema 3's `agent_session`), and it is
  // the field that makes this view join to the Open view: a branch names its
  // sessions by that URL from its commit trailers, and until schema 3 a record
  // carried only the transcript uuid, so the two could not be matched.
  //
  // It is empty for every schema-1 and schema-2 record, which is why `branches`
  // below stays the fallback join. Among schema-3 records it is empty only for
  // those written before 2026-08-07, when the recorder could reach the id only
  // through a session's own commit trailers and so had nothing to say about a
  // read-only session. It now reads the id from the environment first, so a
  // record written after that names its session whether or not it committed.
  // Records are never revisited, so the older empties are permanent.
  function summarize(rec, sha) {
    const r = rec || {};
    const repos = (r.repos || []).map(x => ({
      name: x.name, branch: x.branch || '', lines: x.lines || 0,
    }));
    const files = r.files || {};
    return {
      id: r.short || (r.session_id || '').slice(0, 8),
      agent: r.agent_session || '',
      day: r.day || (r.started || '').slice(0, 10),
      started: r.started || '',
      ended: r.ended || '',
      mins: durationMins(r.started, r.ended),
      ask: (r.opening_ask || '').slice(0, ASK_CHARS),
      // How it ended, beside how it began. See closingReply above for why
      // one field carries two fidelities and `replyCut` says which.
      reply: closingReply(r),
      replyCut: replyPartial(r),
      // The two ends' own clock times. The card draws the ask, the scroll back
      // and the reply as one transcript, and a turn without a time is the only
      // one in that column missing its chrome.
      askAt: clock((r?.prompts || [])[0]?.at),
      replyAt: clock(closingAt(r)),
      // And what was said before it. See priorTurns: the deck's own main
      // turns, newest TURNS_KEPT, each cut to its opening sentence.
      turns: priorTurns(r),
      turnsCut: turnsPartial(r),
      repos,
      // Branch names alone, deduped: the join key to the Open view for any
      // record too old to carry `agent`, and the cheapest thing to filter on.
      branches: [...new Set(repos.map(x => x.branch).filter(b => b && b !== 'main'))],
      exchanges: r.exchanges || 0,
      messages: r.assistant_messages || 0,
      calls: r.calls_total || 0,
      failures: r.failures || 0,
      tools: topN(r.tools, TOOLS_KEPT),
      tokens: r.tokens || null,
      // File attention, the reason schema 3 exists. `filesTotal` is the honest
      // count and `files` the busiest few, which is what a scan of the session
      // wants. `docFiles` is the complete docs/ slice, for the one consumer
      // that reads by file rather than by session; see docFilesOf above.
      //
      // `files` stays tool-only on purpose. It answers "what was this session
      // working on", and a shell channel over every path a command mentions
      // would flood that with greps and listings. The docs slice is the one
      // place the shell channel belongs, because there the question is whether
      // a file was ever opened at all.
      filesTotal: r.files_total || Object.keys(files).length || 0,
      files: Object.entries(files)
        .sort((a, b) => (fileWeight(b[1]) - fileWeight(a[1])) || a[0].localeCompare(b[0]))
        .slice(0, FILES_KEPT)
        .map(([path, kinds]) => [path, fileWeight(kinds)]),
      // Two channels, folded into one list because the consumer asks one
      // question: did anybody open this document. `docShell` keeps the shell
      // half on its own so the column can say how much of a number it owes to
      // a channel that reads commands rather than tool inputs.
      docFiles: mergeCounts(docFilesOf(files), shellDocsOf(r)),
      docShell: pairs(shellDocsOf(r)),
      // The guides this session wrote or read. Paths are checkout-prefixed
      // ("web-tools/pages/guides/x.html"), as every key in `files` is, so a
      // consumer that wants to link one resolves the repo from the row's own
      // `repos` exactly as the branch links do.
      guides: guideFilesOf(files),
      // Startup context (record schema 6), uncapped: the set is a handful of
      // instruction files per session, and it is the whole point of the field
      // that a document present but unopened still shows up.
      startup: startupOf(r),
      v: ROW_V,
      schema: r.schema || 1,
      bytes: r.transcript_bytes || 0,
      sha: sha || '',
    };
  }

  function durationMins(a, b) {
    const t0 = Date.parse(a || ''), t1 = Date.parse(b || '');
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return 0;
    return Math.round((t1 - t0) / 60000);
  }

  // ── Cross-session rollup: which files the estate is actually working ────────
  // The aggregate the read-tracking task wants, computed here so both the
  // Sessions view and anything later (the Docs registry's readership column)
  // read one derivation instead of two. Per path: total accesses, how many
  // DISTINCT sessions touched it, and when it was last touched.
  //
  // Distinct sessions is the number that resists a single session's habits: one
  // session editing a file forty times says the session was busy, while ten
  // sessions opening it says the file is load-bearing.
  //
  // `field` picks which slice of the row to fold: `files` for the estate's
  // busiest-files panel, `docFiles` for the docs registry's readership column.
  // One derivation with two inputs rather than two derivations, so the two
  // numbers cannot come to mean different things.
  function fileAttention(rows, cap = 200, field = 'files') {
    const by = new Map();
    for (const row of rows || []) {
      for (const [path, n] of row[field] || []) {
        let e = by.get(path);
        if (!e) by.set(path, (e = { path, count: 0, sessions: 0, last: '' }));
        e.count += n;
        e.sessions += 1;
        if ((row.started || '') > e.last) e.last = row.started || '';
      }
    }
    return [...by.values()]
      .sort((a, b) => (b.sessions - a.sessions) || (b.count - a.count) || a.path.localeCompare(b.path))
      .slice(0, cap);
  }

  // ── Fold ───────────────────────────────────────────────────────────────────
  // `fetched` is { "<repo path>": {record, sha} } for the records this crawl
  // actually read; every other row carries forward from `prev` unchanged. The
  // scope is the full path list the crawl saw, so a record DELETED from the
  // store leaves the cache, while a record the crawl simply did not re-read
  // stays. That distinction is the same one buildCache draws in the activity
  // cache, and for the same reason: a pass that never looked at something must
  // not be able to delete it.
  // `titles` is the second input: { at, path, byId } from the dated export, or
  // null when the crawl could not read one. Null carries the previous fold's
  // titles and its `titlesAt` forward untouched, so a missing export never
  // blanks a title that was already known.
  function buildCache(prev, fetched, paths, nowISO, titles) {
    const priorByPath = new Map(
      Object.entries(prev?.byPath || {}).map(([p, row]) => [p, row]));
    const scope = paths ? new Set(paths) : null;
    const byPath = {};
    for (const [path, row] of priorByPath) {
      if (scope && !scope.has(path)) continue;   // gone from the store
      byPath[path] = row;
    }
    for (const [path, hit] of Object.entries(fetched || {})) {
      if (!hit) continue;
      // A refetched record is summarized fresh and so arrives with no title.
      // withTitles below re-joins it; where the export is unread, the previous
      // row's title is carried across explicitly, since the record cannot
      // supply one and losing it on a refetch would blank exactly the rows a
      // reader is most likely to be looking at.
      const row = summarize(hit.record, hit.sha);
      const priorTitle = priorByPath.get(path)?.title;
      if (priorTitle) row.title = priorTitle;
      byPath[path] = row;
    }
    const rows = withTitles(
      Object.values(byPath)
        .sort((a, b) => (b.started || '').localeCompare(a.started || ''))
        .slice(0, ROW_CAP),
      titles);
    return {
      generatedAt: nowISO,
      count: rows.length,
      // The export's own date, top level because it is a fact about the whole
      // title column rather than about any one row. A surface that shows a
      // title has to be able to say how old it is: a dated snapshot behind a
      // live view is exactly the case that reads as current.
      titlesAt: titles ? (titles.at || '') : (prev?.titlesAt || ''),
      titlesFrom: titles ? (titles.path || '') : (prev?.titlesFrom || ''),
      rows,
      // Keyed by store path so the next crawl can diff shas without walking the
      // row list, and so a row's provenance is legible in the file itself.
      byPath: Object.fromEntries(rows.map(r => [pathOf(r), r])),
      attention: fileAttention(rows),
      // The docs/ rollup, uncapped for the same reason docFiles is: a registry
      // row that renders nothing must mean nobody opened the file, never that
      // the file fell off the end of a list.
      docAttention: fileAttention(rows, Infinity, 'docFiles'),
      // Presence rather than access, so it is folded by its own function and
      // must never be summed with either rollup above.
      startupAttention: startupAttention(rows),
    };
  }

  // The store path a row came from, rebuilt from its own fields. Records are
  // named sessions/YYYY/MM/YYYY-MM-DD-<short>.json by record.py; deriving it
  // rather than storing it keeps the row from carrying the same string twice.
  function pathOf(row) {
    const day = row.day || (row.started || '').slice(0, 10);
    return `sessions/${day.slice(0, 4)}/${day.slice(5, 7)}/${day}-${row.id}.json`;
  }

  // The session's name, derived from the branch the harness opened for it.
  //
  // A record has no title and cannot get one: measured 2026-08-10, the string
  // shown in Claude is generated server-side and reaches the container through
  // no channel at all (web-tools-private sessions/README.md, "The third name,
  // and why the record cannot have it"). What the harness does put in the
  // container is a branch whose slug it built from that same title, so this is
  // the title after slugification and truncation. `FAB naming convention` is on
  // file as `claude/fab-naming-todqvq`, which is why callers present it as a
  // derived name and never as the title.
  //
  // Derived here rather than stored on the row on purpose. The row already
  // carries `branches`, so computing it costs nothing, and a new stored field
  // would bump ROW_V and force a full re-crawl of the store to populate a string
  // that was already sitting in the row.
  const CLAUDE_BRANCH_RE = /^claude\/(.+?)-[a-z0-9]{6}$/;

  function nameOf(row) {
    const branches = (row && row.branches) || [];
    for (const b of branches) {
      const m = CLAUDE_BRANCH_RE.exec(String(b || ''));
      if (m) return m[1];
    }
    // A hand-named branch has no uniquifier to strip, and mangling one would be
    // worse than showing it whole. `branches` already excludes main.
    return String(branches[0] || '');
  }

  // ── The real title, joined from a dated export ─────────────────────────────
  // The name above is the title after slugification; this is the title itself.
  // It cannot be captured, but it CAN be fetched somewhere else: a Dispatch
  // session running on the desktop where the browser login lives scrapes the
  // claude.ai/code sidebar and commits one dated CSV per capture to
  // mehrlander/chat-histories under claude-code-web/ (title, url, session_id,
  // status). This is the join back.
  //
  // Three properties are load-bearing and are the reason the join sits here
  // rather than in summarize():
  //
  // - **It is a SECOND input, not a record field.** A record is captured and
  //   never revisited; a title is fetched later and can change again. Putting
  //   it on the derived row keeps the captured layer untouched, which is what
  //   web-tools task session-titles-from-export-4vgu4x asked for.
  // - **It is applied to every row on every fold**, not only to the records a
  //   pass re-read. A row's blob sha never moves again once its session ends,
  //   so a title joined inside summarize() would reach only the handful of
  //   records the crawl happened to refetch and would need a ROW_V bump and a
  //   full re-crawl to reach the rest. Applied here it costs nothing and no
  //   version bump.
  // - **A missing export costs accuracy, not function.** `titles` of null
  //   leaves every row's `title` exactly as the previous cache had it, so a day
  //   the desktop slept shows yesterday's titles rather than a page of blanks.
  //   Every consumer falls back per ROW to nameOf(), never per surface.
  const TITLES_REPO = 'mehrlander/chat-histories';
  const TITLES_DIR = 'claude-code-web';
  const TITLES_FILE_RE = /(?:^|\/)(\d{4}-\d{2}-\d{2})-sessions\.csv$/;

  // The bare id inside a harness session URL. The record stores `agent_session`
  // whole ("https://claude.ai/code/session_01…") and the export's `session_id`
  // column is the bare "session_01…", so one side has to be reduced to the
  // other; reducing the URL is the safe direction, since the export carries
  // both forms and the record carries only one.
  function sessionIdOf(agent) {
    const m = /(session_[A-Za-z0-9]+)/.exec(String(agent || ''));
    return m ? m[1] : '';
  }

  // The newest export in a directory listing, by the date in its own filename.
  // Entries are GitHub contents rows ({name, path}); anything not matching the
  // dated-CSV shape is ignored, so the folder's README costs nothing.
  //
  // The filename's date is what the surface shows as "titles as of". It is the
  // export's own declared convention (claude-code-web/README.md) and it is what
  // a person reads off the file. It is NOT cross-checked against the contents,
  // which is worth knowing: the first snapshot on file, 2026-08-04-sessions.csv,
  // contains sessions through 2026-08-09 and was committed 2026-08-10, so its
  // name understates it by five days. A misnamed export makes this claim older
  // than the truth, which is the safe direction to be wrong in; the fix belongs
  // in the export, and renaming the file there corrects the display here with no
  // change to this code.
  function newestExport(entries) {
    let best = null;
    for (const e of entries || []) {
      const m = TITLES_FILE_RE.exec(String(e?.path || e?.name || ''));
      if (!m) continue;
      if (!best || m[1] > best.at) best = { at: m[1], path: e.path || e.name };
    }
    return best;
  }

  // { "session_01…": "The title" } from one export's CSV text. Header-driven
  // through the shared CSV kit, because a title carries commas ("Session title
  // capture in history, adjusted" is on file) and a split on comma would cut it
  // in half and shift every later column.
  function parseTitles(text) {
    const out = {};
    for (const r of window.Csv?.rows?.(text) || []) {
      const id = sessionIdOf(r.session_id || r.url || '');
      const title = String(r.title || '').trim();
      if (id && title) out[id] = title;
    }
    return out;
  }

  // Rows with `title` set where the export names them. Returns new row objects
  // rather than mutating: the carried-forward rows are the SAME objects the
  // previous cache holds, and cacheChanged() compares this fold against that
  // one afterwards, so mutating in place would edit the thing being compared
  // and a new export would read as no change at all.
  function withTitles(rows, titles) {
    if (!titles) return rows;              // export unread: rows keep what they had
    const by = titles.byId || {};
    return (rows || []).map(row => {
      const t = by[sessionIdOf(row.agent)] || '';
      if (t === (row.title || '')) return row;
      const next = { ...row };
      if (t) next.title = t; else delete next.title;
      return next;
    });
  }

  // The name to SHOW for a session: the exported title where one is known, the
  // branch-derived name otherwise. The fallback is per row rather than per
  // surface, so a view never goes blank for the 44 records that predate
  // `agent_session` while showing titles for the ones beside them.
  function labelOf(row) {
    return (row && row.title) || nameOf(row);
  }

  // ── The pointer ────────────────────────────────────────────────────────────
  //
  // One session as a block of text, for pasting somewhere the session is not.
  //
  // Two readers want this and they cannot use the same line. A PERSON, later,
  // wants something tappable plus enough label to know which session it is
  // before tapping. Another SESSION cannot open a browser page at all: what it
  // can do is read the record out of the store checkout, or run search.py
  // against it.
  //
  // They do not fork, because the short id is already the join key across all
  // three surfaces: it is the record's own filename stem, the argument
  // `search.py --show` takes, and the address pages/session.html accepts as
  // `#id=`. So one block serves both readers, and everything past the id is
  // legibility.
  //
  // The ask is a LABEL, not a summary, and the block is written so it reads as
  // one. It is the OPENING ask, capped at 240 characters by the summarizer, and
  // a long session routinely ends up somewhere else entirely; the derived name
  // and the repos ride on the first line rather than behind it for exactly that
  // reason.
  //
  // Nothing here is fetched or stored: every value is already on the row, which
  // is what makes this a fold rather than a feature. The duration is the one
  // exception, passed in as a label, because how long a session reads as is a
  // display decision and the shell already owns it (estate.js durLabel).
  const STORE = 'mehrlander/web-tools-private';
  const SESSION_PAGE = 'https://mehrlander.github.io/web-tools/pages/session.html';

  function pointerOf(row, opts = {}) {
    const r = row || {};
    const store = opts.store || STORE;
    const checkout = store.split('/').pop();
    const page = opts.page || SESSION_PAGE;
    const name = nameOf(r);
    const repos = (r.repos || []).map(x => x && x.name).filter(Boolean).join(', ');
    const paren = [[r.day, opts.dur].filter(Boolean).join(', '), repos].filter(Boolean).join(' · ');
    const ask = String(r.ask || '').replace(/\s+/g, ' ').trim();
    const lines = [
      'Session ' + (r.id || '?') + (name ? ' · ' + name : '') + (paren ? ' (' + paren + ')' : ''),
    ];
    if (ask) lines.push('Ask: ' + ask);
    // The store path and the page address are the same record by two routes,
    // and the third line is the one an agent runs. `search.py` resolves the
    // store from its own location, so the command works from any directory a
    // checkout of the store is visible from.
    lines.push('Record: ' + store + ':' + pathOf(r));
    lines.push('Read: ' + page + '#id=' + (r.id || ''));
    lines.push('Query: python3 ' + checkout + '/sessions/tools/search.py --show ' + (r.id || ''));
    // The only route to the real transcript rather than the bounded record, and
    // empty on anything written before 2026-08-07, so it is stated when the
    // record has it and left out rather than faked when it does not.
    if (r.agent) lines.push('In Claude: ' + r.agent);
    return lines.join('\n');
  }

  // Which store paths this crawl must fetch: everything whose blob sha differs
  // from the cached row's, plus everything not cached at all. `listing` is
  // [{path, sha}] from the trees API.
  //
  // The live session's own record is why this matters more than it looks: it is
  // rewritten and republished on every Stop, so its sha moves constantly while
  // every other record in the store is frozen. Sha-keyed refetch tracks that for
  // free, with no special case for "the current one".
  //
  // A sha is not the only thing that goes stale, though: a row built by an older
  // summarizer is stale against a NEW FIELD, and its record's sha will never
  // move again to say so. So the row version is a second staleness axis, and one
  // pass after a summarizer change re-reads the store once and heals it.
  function stalePaths(prev, listing) {
    const have = prev?.byPath || {};
    return (listing || [])
      .filter(e => e && e.path && (have[e.path]?.sha !== e.sha || have[e.path]?.v !== ROW_V))
      .map(e => e.path);
  }

  // Substance, ignoring the crawl stamp: the row set by id and content hash,
  // plus the export's date. Same contract as the other two caches, so a no-op
  // crawl skips the commit.
  //
  // `titlesAt` is the one top-level key inside the comparison, and it is the
  // deliberate exception to the rule that made `runs` sit outside it. `runs` is
  // a fact about the crawl and must never be able to cause a commit by itself.
  // `titlesAt` is a claim shown on screen — "titles as of 2026-08-04" — so a
  // fresher export that happens to rename nothing still has to land, or the
  // surface understates its own currency indefinitely. It moves once per
  // capture, so it cannot reintroduce the per-run commits the gate prevents.
  function material(cache) {
    return {
      titlesAt: cache?.titlesAt || '',
      rows: (cache?.rows || []).map(r => [r.id, hash({ ...r, sha: '' })]),
    };
  }
  function cacheChanged(prev, next) {
    return JSON.stringify(material(prev)) !== JSON.stringify(material(next));
  }

  // Only the records under YYYY/MM count. sample-record.json sits at the store
  // root precisely so it is not one, and tools/ holds the recorder.
  const RECORD_RE = /^sessions\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-[0-9a-f]+\.json$/;
  function isRecordPath(p) { return RECORD_RE.test(String(p || '')); }

  window.RepoSessionsCache = {
    CACHE_PATH, ROW_CAP, TOOLS_KEPT, FILES_KEPT, ROW_V, ASK_CHARS, REPLY_CHARS,
    TURN_HEAD, PROMPT_HEAD, TURNS_KEPT,
    TITLES_REPO, TITLES_DIR,
    hash, topN, fileWeight, docFilesOf, shellDocsOf, guideFilesOf, pairs, mergeCounts,
    startupOf, startupAttention,
    summarize, durationMins, fileAttention, closingReply, replyPartial,
    priorTurns, turnsPartial, closingAt, head, IMAGE_ONLY,
    buildCache, pathOf, nameOf, labelOf, pointerOf, stalePaths, material,
    cacheChanged, isRecordPath,
    sessionIdOf, newestExport, parseTitles, withTitles,
  };
})();
