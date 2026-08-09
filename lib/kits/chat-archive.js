// kits/chat-archive.js — the chat archive as a venue of activity, read one
// month at a time.
//
// mehrlander/chat-histories holds 14,844 conversations across three providers.
// Nothing here loads that, and nothing here could: the two annotation layers
// are 1.9 MB and 9.9 MB, and the raw snapshots are hundreds of megabytes. What
// makes a pane over it affordable is that the archive is ALREADY SHARDED at the
// grain a reader wants, one file per month per layer, so paging back a month
// costs two small requests and paging back a year costs nothing until asked.
//
// WHY A VENUE AND NOT A PROJECTION. Branches and Sessions are two readings of
// the repos. This is not: no key joins a chat to a branch or a session, the
// archive's ids are chat uuids while sessions carry harness `session_...` ids,
// and the two corpora do not even overlap in time (the newest snapshot ends
// 2026-07-06; the session store begins 2026-07-29). So this pane cross-links
// chat to chat (tags, arcs, searches) and never pretends to a join it does not
// have. It is here because conversation is where a share of the thinking
// happens, not because it can be tied to a commit.
//
// WHY THE FRONTIER IS READ, NOT COMPUTED. "How far behind is the archive" is
// answerable only by scanning every month of every provider, which is the one
// thing this file exists to avoid. chat-histories generates the answer instead:
// annotations/catalog/frontier.json, written by tools/catalog_coverage.py
// alongside the coverage report. One number, one owner, and the repo's own
// declared staleness check reads the same file, so the pane and the estate card
// cannot disagree about how stale the archive is.
//
// WHAT THE FRONTIER CANNOT SAY, and every consumer must repeat it: the archive
// knows when it last HEARD, never how much it is missing. The count of
// unarchived conversations is unknowable until the next export lands, and a
// windowed export filters by creation date only, so revivals and deletions are
// invisible to one.
//
// Split like the other kits: pure folds first (unit-tested against fixtures),
// then a cached reader in the shape kits/estate-search.js established, a
// module-level memo with in-flight dedup and a short failure backoff. Attaches
// to window.chatArchive, loaded via gh.load('kits/chat-archive.js').
(() => {
  const FRONTIER_PATH = 'annotations/catalog/frontier.json';
  const SUMMARIES_DIR = 'annotations/summaries/by-month';
  const CATALOG_DIR = 'annotations/catalog/by-month';
  const RETRY_MS = 30_000;
  const DAY = 86400000;

  // Provider is read off the url because the url IS the archive's join key
  // (chat-histories GUIDE.md): a uuid for Claude and ChatGPT, and the
  // `gemini-session/<id>` form for Gemini, which has no uuid and no per-chat
  // address at all. Nothing declares the provider per entry, and nothing should.
  const PROVIDERS = [
    { key: 'claude', label: 'Claude', match: /(^|\/\/)claude\.ai\// },
    { key: 'chatgpt', label: 'ChatGPT', match: /(^|\/\/)chatgpt\.com\// },
    { key: 'gemini', label: 'Gemini', match: /^gemini-session\// },
  ];

  const str = (v) => (v == null ? '' : String(v));

  function providerOf(url) {
    const u = str(url);
    for (const p of PROVIDERS) if (p.match.test(u)) return p.key;
    return '';
  }

  // The address to open, or '' when there is none. Gemini is the '' case and it
  // is not a gap to fix: Gemini Apps chats have no per-conversation URL, so the
  // archive's own key is a synthetic session id. A row with no link renders as
  // text rather than as a dead anchor.
  function openUrl(entry) {
    const u = str(entry && entry.url);
    return u.startsWith('http') ? u : '';
  }

  // ── The month fold ─────────────────────────────────────────────────────────
  // One month of both layers into one list. The HAND catalog wins every
  // collision, and that is the whole reason the merge exists rather than
  // concatenating: the hand entry was summarized through the chat UI and is the
  // repo's precious layer, while the machine entry is a bulk read-through of
  // whatever the hand pass did not reach. Showing the machine copy of a chat
  // somebody hand-summarized would quietly display the lesser of the two.
  //
  // Keyed by url, which is the archive's stated join key across catalogs, arcs,
  // and chat indexes alike, so this merge uses the same key the corpus does.
  function mergeMonth({ summaries = [], catalog = [], month = '' } = {}) {
    const rows = new Map();
    const add = (e, hand) => {
      const url = str(e && e.url);
      if (!url) return;
      if (rows.has(url) && !hand) return;        // never let machine overwrite hand
      rows.set(url, {
        url,
        month: str(month),
        date: str(e.date),
        title: str(e.title),
        summary: str(e.summary),
        tags: Array.isArray(e.tags) ? e.tags.map(str) : [],
        provider: providerOf(url),
        hand: !!hand,
        open: openUrl(e),
      });
    };
    for (const e of summaries) add(e, false);
    for (const e of catalog) add(e, true);       // second, so hand overwrites
    // Newest first, then title, so a month with many same-day chats has a
    // stable order across reloads rather than the shard's file order.
    return [...rows.values()].sort((a, b) =>
      b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }

  // ── Staleness ──────────────────────────────────────────────────────────────
  // Whole days between a date and now. Floor, not round: an archive 29.6 days
  // behind is 29 days behind, and a banner that rounds up crosses a declared
  // threshold a day before the check that reads the same file does.
  function daysSince(dateStr, now) {
    const t = Date.parse(str(dateStr));
    if (!Number.isFinite(t)) return null;
    return Math.floor(((now instanceof Date ? now : new Date(now)).getTime() - t) / DAY);
  }

  // Intervals between consecutive exports, and the longest one observed. The
  // gap only means something against the cadence: 34 days is due when exports
  // have run every 18 to 35 days and overdue when they have run weekly. A
  // provider with one export has no cadence, which is reported as null rather
  // than as zero.
  function cadenceOf(snapshots) {
    const ds = (snapshots || []).map(str).filter(Boolean).sort();
    if (ds.length < 2) return { gaps: [], longest: null, count: ds.length };
    const gaps = [];
    for (let i = 1; i < ds.length; i++) gaps.push(daysSince(ds[i - 1], new Date(ds[i])));
    return { gaps, longest: Math.max(...gaps), count: ds.length };
  }

  /**
   * The pane's header, folded from frontier.json and a clock.
   *
   * `behind` per provider is days since its newest chat, NOT days since its
   * newest export: a windowed export can be requested days after the last
   * conversation it contains, and the question is how much conversation the
   * archive is missing, not how recently a file arrived.
   *
   * `due` compares that against the provider's own longest observed gap, so it
   * says "this has gone longer than it ever has" rather than applying one
   * threshold to providers that are exported on different rhythms.
   */
  function banner(frontier, now = new Date()) {
    const provs = (frontier && frontier.providers) || {};
    const rows = Object.entries(provs).map(([label, p]) => {
      const cadence = cadenceOf(p.snapshots);
      const behind = daysSince(p.frontier, now);
      return {
        label,
        key: label.toLowerCase(),
        frontier: str(p.frontier),
        chats: p.chats || 0,
        months: (p.months || []).slice(),
        snapshots: (p.snapshots || []).slice(),
        behind,
        cadence,
        due: cadence.longest != null && behind != null && behind > cadence.longest,
      };
    }).sort((a, b) => (b.chats || 0) - (a.chats || 0));
    const through = str(frontier && frontier.archived_through);
    return {
      rows,
      archivedThrough: through,
      behind: daysSince(through, now),
      chats: rows.reduce((n, r) => n + r.chats, 0),
      // Any provider past its own longest gap makes the archive due, for the
      // same reason archived_through is a minimum: one lagging provider is a
      // lagging archive, and the busiest one must not be able to mask it.
      due: rows.some(r => r.due),
    };
  }

  // Every month any provider holds, newest first. This is the paging spine: the
  // pane opens on months[0] and walks down on demand, so the corpus is reachable
  // without ever being loaded. Derived from frontier.json rather than from a
  // directory listing, which would be two more requests for the same answer.
  function monthsDesc(frontier) {
    const provs = (frontier && frontier.providers) || {};
    const all = new Set();
    for (const p of Object.values(provs)) for (const m of p.months || []) all.add(str(m));
    return [...all].sort().reverse();
  }

  // ── The cached reader ──────────────────────────────────────────────────────
  // kits/estate-search.js's shape: a module-level memo, in-flight dedup so a
  // double-render fetches once, and a short backoff so a dead endpoint is not
  // hammered by a scroll. A FAILED read is never memoized as empty, which is the
  // bug this shape exists to prevent: an empty month and an unreachable month
  // look identical on screen and mean opposite things.
  const frontiers = {};        // repo -> frontier.json
  const months = {};           // "repo:YYYY-MM" -> rows[]
  const inFlight = {};
  const failedAt = {};

  async function readJson(gh, path) {
    try { return JSON.parse((await gh.get(path)).text); }
    catch { return null; }     // absent shard: a month one layer never covered
  }

  function dedupe(key, run) {
    if (inFlight[key]) return inFlight[key];
    if (failedAt[key] && Date.now() - failedAt[key] < RETRY_MS) {
      return Promise.reject(new Error(key + ' recently failed; retrying shortly'));
    }
    inFlight[key] = (async () => {
      try { return await run(); }
      catch (e) { failedAt[key] = Date.now(); throw e; }
      finally { delete inFlight[key]; }
    })();
    return inFlight[key];
  }

  // frontier.json, once per repo per session. It is a few kilobytes and it is
  // what the pane needs before it can say anything, so it is the one read that
  // is not deferred.
  async function loadFrontier({ repo, token, ref = 'main' }) {
    if (frontiers[repo]) return frontiers[repo];
    return dedupe('frontier:' + repo, async () => {
      const gh = new window.GH({ token, repo, ref });
      const data = await readJson(gh, FRONTIER_PATH);
      if (!data) throw new Error('no ' + FRONTIER_PATH + ' in ' + repo);
      frontiers[repo] = data;
      return data;
    });
  }

  // One month, both layers, merged. Two requests, and a 404 on either is normal
  // rather than an error: the hand catalog covers a fraction of the months and
  // the machine layer covers the rest, so most months have exactly one shard.
  async function loadMonth({ repo, token, ref = 'main', month }) {
    const key = repo + ':' + month;
    if (months[key]) return months[key];
    return dedupe('month:' + key, async () => {
      const gh = new window.GH({ token, repo, ref });
      const [summaries, catalog] = await Promise.all([
        readJson(gh, SUMMARIES_DIR + '/' + month + '.json'),
        readJson(gh, CATALOG_DIR + '/' + month + '.json'),
      ]);
      if (!summaries && !catalog) throw new Error('no shard for ' + month + ' in ' + repo);
      months[key] = mergeMonth({
        summaries: summaries || [], catalog: catalog || [], month });
      return months[key];
    });
  }

  window.chatArchive = {
    FRONTIER_PATH, SUMMARIES_DIR, CATALOG_DIR, PROVIDERS,
    providerOf, openUrl, mergeMonth, daysSince, cadenceOf, banner, monthsDesc,
    loadFrontier, loadMonth,
  };
})();
