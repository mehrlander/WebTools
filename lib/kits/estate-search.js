// The estate's search calls, in one place, with one cache.
//
// Two consumers ask the same questions: the sidebar finder (a dispatcher whose
// deeper lanes are tap-gated) and the Search view (the central file surface).
// Each search existed first inside the finder component; extracting them here
// is what lets the view exist without a second implementation, and what makes
// the caches shared, so a tree the finder fetched is a tree the view never
// re-fetches. Pure fetch-and-match: no Alpine, no DOM, no rendering opinions.
// Consumers own reactivity by copying results into their own state.
//
// The calls, and what each honestly covers:
//
//   tree(repo, ref)    one recursive git/trees call per (repo, ref), cached
//                      for the session (the stage's Browse/Search economy).
//                      A FAILED fetch is not cached as an empty tree; it backs
//                      off briefly and retries, so a blip does not kill the
//                      file lanes until reload.
//   names(...)         substring match over tree paths, any ref, any repos,
//                      optionally scoped to a folder (`under`). Recursive and
//                      flat: it answers "which paths match".
//   level(...)         one level of one repo's tree, folders and files, off the
//                      same cache. It answers "what is in here", which has
//                      folders in it and is the question a recursive match
//                      cannot fold back into.
//
// Every file a caller gets back carries its SIZE IN BYTES, from the same
// recursive read: the trees API reports a blob's size on the entry, so nothing
// is fetched for it. This is the one thing the retired per-repo explorer had
// that the cached walk did not, and it turned out to cost nothing to keep.
//   code(...)          the GitHub code-search API: DEFAULT BRANCHES only,
//                      indexing can lag a push, files over ~384 KB are not
//                      indexed, 10 authenticated calls per minute. text-match
//                      returns the fragments consumers show as snippets. The
//                      names lane covers branches from the other side; that
//                      split is why both exist. It is also the one lane that
//                      DIAGNOSES its own failure, because it is the one whose
//                      refusal reaches the page as "Failed to fetch" and says
//                      nothing; see the note above diagnose().
//   sessions(...)      a client-side grep of the captured session records
//                      (web-tools-private sessions/, via state/sessions.json):
//                      what a record quotes, meaning the opening ask, every
//                      stored prompt, every stored reply, and the closing
//                      message (search.py's --grep, in the browser). One
//                      contents read per record, cached for the session. Plus
//                      what the session is CALLED, which is not something a
//                      record quotes: the exported title where one is known and
//                      the derived branch name either way. See nameSegs below
//                      for why both ride the same corpus here and get their own
//                      flag at the terminal.
//
// Attaches to window.EstateSearch, loaded via gh.load('kits/estate-search.js').
(() => {
  const TREE_RETRY_MS = 30_000;   // a failed tree fetch may retry after this
  const trees = {};               // "repo@ref" -> { paths, sizes, truncated }
  const treeFailedAt = {};        // "repo@ref" -> epoch ms of the last failure
  const treeInFlight = {};        // "repo@ref" -> Promise
  let sessRows = null;            // state/sessions.json rows, read once
  const sessRecords = {};         // session id -> { day, ask, segs }
  // When this cache was last emptied, page load counting as the first empty.
  // It is the only age these caches have: nothing here is built, only fetched
  // and kept, so there is no build timestamp to report. The State view renders
  // it as "cleared 30m ago, 11 trees", which is the honest answer to the
  // question the Search view's own control kept being asked ("are these
  // results cached?").
  let clearedAt = Date.now();

  // ~one line of context around the first case-insensitive hit.
  function clip(text, q) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    const i = s.toLowerCase().indexOf(String(q || '').toLowerCase());
    if (i < 0) return s.slice(0, 110);
    const from = Math.max(0, i - 35);
    return (from > 0 ? '…' : '') + s.slice(from, from + 120) + (from + 120 < s.length ? '…' : '');
  }

  // The blob paths of a repo at a ref ('' or 'HEAD' both mean the default
  // branch, resolved server-side), plus `sizes`, the same entries' byte counts
  // keyed by path. Throws on failure so a caller can say so; the failure is
  // remembered only long enough to stop a keystroke loop from hammering a dead
  // endpoint.
  async function tree(repo, ref, token) {
    const key = repo + '@' + (ref || 'HEAD');
    if (trees[key]) return trees[key];
    if (treeInFlight[key]) return treeInFlight[key];
    if (treeFailedAt[key] && Date.now() - treeFailedAt[key] < TREE_RETRY_MS) {
      throw new Error('tree fetch for ' + key + ' recently failed; retrying shortly');
    }
    treeInFlight[key] = (async () => {
      try {
        const gh = new window.GH({ token, repo });
        const t = await gh.req('git/trees/' + encodeURIComponent(ref || 'HEAD') + '?recursive=1');
        const blobs = (t.tree || []).filter(e => e.type === 'blob');
        const sizes = Object.create(null);
        for (const e of blobs) if (typeof e.size === 'number') sizes[e.path] = e.size;
        trees[key] = {
          paths: blobs.map(e => e.path),
          sizes,
          truncated: !!t.truncated,
        };
        delete treeFailedAt[key];
        return trees[key];
      } catch (e) {
        treeFailedAt[key] = Date.now();
        throw e;
      } finally { delete treeInFlight[key]; }
    })();
    return treeInFlight[key];
  }

  // File-name search: substring over the trees of the given repos, each at its
  // own ref. Unreachable trees are reported, not thrown, so one bad ref does
  // not empty the whole answer.
  //
  // `under` is a FOLDER SCOPE, applied before the substring match so the cap
  // counts scoped hits rather than spending itself outside the scope. It is
  // what makes an EMPTY query useful: with no q every path matches, so
  // `{ q: '', under: 'lib/kits' }` is a listing of that folder and the search
  // and the browse are one call. Leading and trailing slashes are forgiving.
  async function names({ q, repos, token, cap = 50, under = '' }) {
    const ql = String(q || '').toLowerCase();
    const scope = String(under || '').replace(/^\/+|\/+$/g, '');
    const inScope = (p) => !scope || p === scope || p.startsWith(scope + '/');
    const hits = [], errors = [];
    let truncated = false;
    await Promise.all((repos || []).map(async ({ repo, ref }) => {
      try {
        const t = await tree(repo, ref, token);
        truncated = truncated || t.truncated;
        for (const p of t.paths) {
          if (!inScope(p)) continue;
          if (p.toLowerCase().includes(ql)) hits.push({ repo, ref: ref || '', path: p, size: t.sizes[p] });
        }
      } catch (e) { errors.push(repo + (ref ? '@' + ref : '') + ': ' + (e?.message || e)); }
    }));
    hits.sort((a, b) => a.repo.localeCompare(b.repo) || a.path.localeCompare(b.path));
    return { hits: hits.slice(0, cap), total: hits.length, truncated, errors };
  }

  // ONE LEVEL of one repo's tree: the folders and files sitting directly under
  // `under`, rather than everything below it. Same cached tree as names(), so
  // browsing a folder costs no fetch after the first read of the repo, and
  // descending never costs another one.
  //
  // This is the browse half, and it is a different question from names() rather
  // than a narrower one: names() answers "which paths match", which is
  // recursive and flat by nature, while this answers "what is in here", which
  // is one level and has folders in it. A consumer that folded folders out of a
  // recursive match would be answering neither.
  //
  // A folder carries the count of blobs BELOW it, not in it, since that is what
  // the one recursive read knows and what says whether a folder is worth
  // opening. A file carries its own size, off the same entries.
  async function level({ repo, ref, under, token }) {
    const t = await tree(repo, ref, token);
    const scope = String(under || '').replace(/^\/+|\/+$/g, '');
    const prefix = scope ? scope + '/' : '';
    const dirs = new Map();
    const files = [];
    for (const p of t.paths) {
      if (prefix && !p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (!rest) continue;
      const cut = rest.indexOf('/');
      if (cut < 0) files.push({ path: p, size: t.sizes[p] });
      else {
        const name = rest.slice(0, cut);
        dirs.set(name, (dirs.get(name) || 0) + 1);
      }
    }
    return {
      dirs: [...dirs.entries()]
        .map(([name, n]) => ({ name, path: prefix + name, n }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      truncated: t.truncated,
    };
  }

  // WHY A REJECTED CODE SEARCH GETS A SECOND CALL.
  //
  // `fetch` rejecting is not GitHub answering: the browser refused to hand the
  // response over and the page never saw a status, so gh-api can only report
  // the browser's own words, which are "Failed to fetch". Measured 2026-08-31:
  // a response with no `Access-Control-Allow-Origin` header produces exactly
  // that, while a sibling call to the same host in the same page returns 200.
  // So the reading a reader needs is the one the string cannot carry, whether
  // GitHub refused this endpoint or the connection went away.
  //
  // /rate_limit answers both halves. It does not itself count against any
  // limit, so asking costs nothing, and it reports `code_search` (10/min) and
  // `search` (30/min) as separate buckets. Three outcomes, and the second call
  // is what tells them apart:
  //
  //   it fails too         the host is unreachable; the original stands
  //   code_search spent    the limit, named, with the seconds until it resets
  //   budget left          reachable and not the limit, so the refusal was
  //                        GitHub's and the browser was not shown the reason
  //
  // It answers unauthenticated too, reporting the anonymous buckets, which is
  // the case worth having: a token that is missing or not valid for code search
  // is the other thing that produces a refusal here.
  async function searchBudget(token) {
    try {
      const r = await new window.GH({ token }).req('/rate_limit');
      return r?.resources?.code_search || r?.resources?.search || null;
    } catch { return null; }
  }
  async function diagnose(err, token) {
    if (err?.status !== 0) return err;              // GitHub answered; it speaks for itself
    const b = await searchBudget(token);
    if (!b) return err;                             // the host is gone: the original is the truth
    if (!b.remaining) {
      const secs = Math.max(0, Math.round((b.reset || 0) - Date.now() / 1000));
      const e = new Error('Code search is rate limited: 0 of ' + b.limit
        + ' left' + (secs ? ', resets in ' + secs + 's' : '') + '.');
      e.status = 0; e.cause = err;
      return e;
    }
    const e = new Error('GitHub refused the search and the browser was not shown why'
      + ' (no CORS headers on the response). Not the rate limit: ' + b.remaining
      + ' of ' + b.limit + ' left. Most likely the token: a code search needs one'
      + ' that carries repo scope.');
    e.status = 0; e.cause = err;
    return e;
  }

  // Content search through the code-search API. `scope` is a ready qualifier
  // ("user:me" or "repo:me/tools").
  async function code({ q, scope, token, perPage = 20 }) {
    const gh = new window.GH({ token });
    let res;
    try {
      res = await gh.req('/search/code?q=' + encodeURIComponent(q + ' ' + scope) + '&per_page=' + perPage,
        { headers: { ...gh.headers, Accept: 'application/vnd.github.text-match+json' } });
    } catch (e) { throw await diagnose(e, token); }
    return {
      total: res.total_count ?? (res.items || []).length,
      hits: (res.items || []).map(it => ({
        repo: it.repository?.full_name || '', path: it.path,
        frag: clip(it.text_matches?.[0]?.fragment || '', q),
      })),
    };
  }

  // What a session is CALLED, as searchable segments: the real title where the
  // export names it, and the branch-derived name either way.
  //
  // Folded into the same corpus as what was said, because this view has one box
  // and no second axis to put it on. search.py keeps --name apart from --grep
  // for exactly the reason that would otherwise bite here: a name is assigned,
  // not said, so a hit on it would be indistinguishable from a hit on the
  // conversation. The `session title:` and `session name:` prefixes buy that
  // back, since the matched segment becomes the hit's note line and so says
  // which of the three matched.
  //
  // **Both forms are carried, not one or the other.** The title is the string a
  // person read in the sidebar; the derived name is the slug the branch and the
  // record carry, and it is the only one 44 of the store's records have at all
  // (the export joins on `agent_session`, which no record written before
  // 2026-08-06 has). Carrying both means either spelling finds the session, and
  // the hyphenated variant is kept for the same reason it always was: "fab
  // naming" as remembered has to find "fab-naming" as stored.
  function nameSegs(row) {
    const segs = [];
    const title = (row && row.title) || '';
    if (title) segs.push('session title: ' + title);
    const name = window.RepoSessionsCache?.nameOf?.(row) || '';
    if (name) {
      segs.push('session name: ' + name);
      if (name.includes('-')) segs.push('session name: ' + name.replace(/-/g, ' '));
    }
    return segs;
  }

  // Session grep. `registry` is the private registry repo; the corpus loads
  // once and later queries match in memory.
  async function sessions({ q, registry, token }) {
    const reg = new window.GH({ token, repo: registry, ref: 'main' });
    if (!sessRows) {
      const cache = JSON.parse((await reg.get('state/sessions.json')).text);
      sessRows = cache.rows || [];
    }
    await Promise.all(sessRows.map(async row => {
      if (sessRecords[row.id]) return;
      try {
        const path = window.RepoSessionsCache?.pathOf?.(row);
        if (!path) return;
        const rec = JSON.parse((await reg.get(path)).text);
        const segs = [rec.opening_ask, rec.last_message,
                      ...(rec.prompts || []).map(p => p.text),
                      ...(rec.replies || []).map(r => r.text)].filter(Boolean);
        // Appended, not prepended: a content match is the richer answer and
        // should win, leaving the name to surface only when nothing that was
        // said matched, which is the case name lookup exists for.
        sessRecords[row.id] = {
          day: rec.day || row.day || '', ask: rec.opening_ask || '',
          segs: segs.concat(nameSegs(row)),
        };
      } catch {
        // The name survives a failed record fetch, since it is read off the
        // cache row rather than the record.
        sessRecords[row.id] = { day: row.day || '', ask: row.ask || '', segs: nameSegs(row) };
      }
    }));
    const ql = String(q || '').toLowerCase();
    const hits = [];
    for (const [id, r] of Object.entries(sessRecords)) {
      const seg = r.segs.find(s => String(s).toLowerCase().includes(ql));
      if (seg) hits.push({ id, day: r.day, ask: r.ask, frag: clip(seg, q) });
    }
    hits.sort((a, b) => (b.day || '').localeCompare(a.day || ''));
    return { hits, total: hits.length };
  }

  // Forget everything fetched, so the next search reads fresh. The Search
  // view's refresh control; a finder consumer clears its own copies too.
  function reset() {
    for (const k of Object.keys(trees)) delete trees[k];
    for (const k of Object.keys(treeFailedAt)) delete treeFailedAt[k];
    for (const k of Object.keys(sessRecords)) delete sessRecords[k];
    sessRows = null;
    clearedAt = Date.now();
  }

  function stats() {
    return {
      trees: Object.keys(trees).length,
      records: Object.keys(sessRecords).length,
      rows: sessRows ? sessRows.length : 0,
      clearedAt,
    };
  }

  window.EstateSearch = { clip, tree, names, level, code, sessions, reset, stats, TREE_RETRY_MS };
})();
