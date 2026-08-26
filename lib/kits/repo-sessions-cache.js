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
// Two rollups ride the cache, both folded from the rows so a reader pays for
// neither: `attention` (the busiest files across sessions, the Sessions pane's
// panel) and `docAttention` (the same fold over the docs/ slice, which the Map
// view's Docs tab renders as each document's readership).
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
  // The summarizer's own version, carried on every row. A crawl refetches a
  // record whose row was built by an older summarizer, so adding a field here
  // heals the cache on the next pass instead of leaving the new field empty for
  // every record whose blob sha never moves again. Bump it when summarize()
  // starts reading something it did not read before.
  const ROW_V = 4;
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
  // shelf per repo), so carrying it whole costs nothing.
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
  function buildCache(prev, fetched, paths, nowISO) {
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
      byPath[path] = summarize(hit.record, hit.sha);
    }
    const rows = Object.values(byPath)
      .sort((a, b) => (b.started || '').localeCompare(a.started || ''))
      .slice(0, ROW_CAP);
    return {
      generatedAt: nowISO,
      count: rows.length,
      rows,
      // Keyed by store path so the next crawl can diff shas without walking the
      // row list, and so a row's provenance is legible in the file itself.
      byPath: Object.fromEntries(rows.map(r => [pathOf(r), r])),
      attention: fileAttention(rows),
      // The docs/ rollup, uncapped for the same reason docFiles is: a registry
      // row that renders nothing must mean nobody opened the file, never that
      // the file fell off the end of a list.
      docAttention: fileAttention(rows, Infinity, 'docFiles'),
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

  // Substance, ignoring the crawl stamp: the row set by id and content hash.
  // Same contract as the other two caches, so a no-op crawl skips the commit.
  function material(cache) {
    return (cache?.rows || []).map(r => [r.id, hash({ ...r, sha: '' })]);
  }
  function cacheChanged(prev, next) {
    return JSON.stringify(material(prev)) !== JSON.stringify(material(next));
  }

  // Only the records under YYYY/MM count. sample-record.json sits at the store
  // root precisely so it is not one, and tools/ holds the recorder.
  const RECORD_RE = /^sessions\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-[0-9a-f]+\.json$/;
  function isRecordPath(p) { return RECORD_RE.test(String(p || '')); }

  window.RepoSessionsCache = {
    CACHE_PATH, ROW_CAP, TOOLS_KEPT, FILES_KEPT, ROW_V,
    hash, topN, fileWeight, docFilesOf, shellDocsOf, guideFilesOf, pairs, mergeCounts,
    summarize, durationMins, fileAttention,
    buildCache, pathOf, nameOf, pointerOf, stalePaths, material, cacheChanged, isRecordPath,
  };
})();
