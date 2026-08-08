// The estate's search calls, in one place, with one cache.
//
// Two consumers ask the same questions: the sidebar finder (a dispatcher whose
// deeper lanes are tap-gated) and the Search view (the parameterized surface).
// Each search existed first inside the finder component; extracting them here
// is what lets the view exist without a second implementation, and what makes
// the caches shared, so a tree the finder fetched is a tree the view never
// re-fetches. Pure fetch-and-match: no Alpine, no DOM, no rendering opinions.
// Consumers own reactivity by copying results into their own state.
//
// The three searches, and what each honestly covers:
//
//   tree(repo, ref)    one recursive git/trees call per (repo, ref), cached
//                      for the session (the stage's Browse/Search economy).
//                      A FAILED fetch is not cached as an empty tree; it backs
//                      off briefly and retries, so a blip does not kill the
//                      file lanes until reload.
//   names(...)         substring match over tree paths, any ref, any repos.
//   code(...)          the GitHub code-search API: DEFAULT BRANCHES only,
//                      indexing can lag a push, files over ~384 KB are not
//                      indexed, 10 authenticated calls per minute. text-match
//                      returns the fragments consumers show as snippets. The
//                      names lane covers branches from the other side; that
//                      split is why both exist.
//   sessions(...)      a client-side grep of the captured session records
//                      (web-tools-private sessions/, via state/sessions.json):
//                      what a record quotes, meaning the opening ask, every
//                      stored prompt, every stored reply, and the closing
//                      message (search.py's --grep, in the browser). One
//                      contents read per record, cached for the session.
//
// Attaches to window.EstateSearch, loaded via gh.load('kits/estate-search.js').
(() => {
  const TREE_RETRY_MS = 30_000;   // a failed tree fetch may retry after this
  const trees = {};               // "repo@ref" -> { paths, truncated }
  const treeFailedAt = {};        // "repo@ref" -> epoch ms of the last failure
  const treeInFlight = {};        // "repo@ref" -> Promise
  let sessRows = null;            // state/sessions.json rows, read once
  const sessRecords = {};         // session id -> { day, ask, segs }

  // ~one line of context around the first case-insensitive hit.
  function clip(text, q) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    const i = s.toLowerCase().indexOf(String(q || '').toLowerCase());
    if (i < 0) return s.slice(0, 110);
    const from = Math.max(0, i - 35);
    return (from > 0 ? '…' : '') + s.slice(from, from + 120) + (from + 120 < s.length ? '…' : '');
  }

  // The blob paths of a repo at a ref ('' or 'HEAD' both mean the default
  // branch, resolved server-side). Throws on failure so a caller can say so;
  // the failure is remembered only long enough to stop a keystroke loop from
  // hammering a dead endpoint.
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
        trees[key] = {
          paths: (t.tree || []).filter(e => e.type === 'blob').map(e => e.path),
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
  async function names({ q, repos, token, cap = 50 }) {
    const ql = String(q || '').toLowerCase();
    const hits = [], errors = [];
    let truncated = false;
    await Promise.all((repos || []).map(async ({ repo, ref }) => {
      try {
        const t = await tree(repo, ref, token);
        truncated = truncated || t.truncated;
        for (const p of t.paths) {
          if (p.toLowerCase().includes(ql)) hits.push({ repo, ref: ref || '', path: p });
        }
      } catch (e) { errors.push(repo + (ref ? '@' + ref : '') + ': ' + (e?.message || e)); }
    }));
    hits.sort((a, b) => a.repo.localeCompare(b.repo) || a.path.localeCompare(b.path));
    return { hits: hits.slice(0, cap), total: hits.length, truncated, errors };
  }

  // Content search through the code-search API. `scope` is a ready qualifier
  // ("user:me" or "repo:me/tools").
  async function code({ q, scope, token, perPage = 20 }) {
    const gh = new window.GH({ token });
    const res = await gh.req('/search/code?q=' + encodeURIComponent(q + ' ' + scope) + '&per_page=' + perPage,
      { headers: { ...gh.headers, Accept: 'application/vnd.github.text-match+json' } });
    return {
      total: res.total_count ?? (res.items || []).length,
      hits: (res.items || []).map(it => ({
        repo: it.repository?.full_name || '', path: it.path,
        frag: clip(it.text_matches?.[0]?.fragment || '', q),
      })),
    };
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
        sessRecords[row.id] = { day: rec.day || row.day || '', ask: rec.opening_ask || '', segs };
      } catch { sessRecords[row.id] = { day: row.day || '', ask: row.ask || '', segs: [] }; }
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
  }

  window.EstateSearch = { clip, tree, names, code, sessions, reset, TREE_RETRY_MS };
})();
