// Activity aggregate for the web-tools ecosystem. show-repo crawls each estate
// repo on a throttle and folds a per-repo activity snapshot into one cache file
// (state/activity.json) in the private registry repo. This is a DERIVED cache,
// the sibling of state/configs.json (lib/kits/repo-config-cache.js): it trades the
// branches view's per-visit API fanout (~2 + 2N calls to survey N branches) for
// one occasional crawl, and it is what makes the all-repo Activity view and the
// estate freshness signals affordable, since neither could fan out live across
// every repo on load.
//
// Two tiers per repo (see web-tools-private/DESIGN.md "Activity cache"):
//   summary  cheap, every crawl: pushedAt, default branch, counts, the newest
//            recent commits (ACCUMULATING and capped across crawls), open PRs.
//            This tier feeds the cross-repo reads.
//   survey   the capped landed/stranded rollup from lib/kits/branch-survey.js,
//            computed once on the crawl and stored whole, so the per-repo
//            branches view renders from the cache instead of re-surveying.
//
// Pure builders live here so they can be unit-tested; the network crawl and the
// throttle that drive them live in the show-repo shell (refreshActivityCache),
// exactly as repo-config-cache.js splits pure fold from shell crawl. Attaches to
// window.RepoActivityCache, loaded via gh.load('kits/repo-activity-cache.js').
(() => {
  const CACHE_PATH = 'state/activity.json';
  const COMMIT_CAP = 30;   // recent commits accumulated per repo (newest kept)

  // Deterministic short hash (djb2 over an order-preserving stringify), matching
  // repo-config-cache.hashConfig, so the change detector below reads the same.
  function hash(value) {
    const s = value == null ? ' null' : JSON.stringify(value);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // The material projection a repo's entry hashes to: everything a consumer
  // renders, nothing volatile. CRAWL timestamps (generatedAt/fetchedAt/
  // surveyedAt) are excluded so a crawl that found nothing new hashes
  // identically and skips the commit; a COMMIT timestamp like firstDate is
  // content, and belongs here, or a crawl that newly learns one hashes the same
  // as the crawl before it and never commits the field it just found. Recent
  // commits and survey rows reduce to their identifying shas / groups, so a
  // re-fetch of the same content is a no-op.
  function material(entry) {
    if (!entry) return null;
    return {
      pushedAt: entry.pushedAt || '',
      defaultBranch: entry.defaultBranch || '',
      counts: entry.counts || {},
      recentCommits: (entry.recentCommits || []).map(c => c.sha),
      openPRs: (entry.openPRs || []).map(p => [p.number, p.updatedAt || '', p.session || '', p.aheadBy ?? '', p.firstDate || '']),
      // Every compare-derived field rides the hash, not just the stored row.
      // Without it, the first crawl after a new field ships hashes identically
      // to the field-less cache it replaces (same names, shas, and groups),
      // skips the commit, and leaves the field dark until a branch happens to
      // move. firstDate learned this; sessions is the same case.
      survey: (entry.survey?.branches || []).map(b => [b.name, b.sha, b.group, b.aheadBy ?? '',
                                                       b.firstDate || '', (b.sessions || []).join(',') || b.session || '']),
      // Declared-check FACTS, never verdicts. lib/kits/repo-checks.js splits the two
      // precisely so this line is safe: a fact ("2026-07-18", a count, a hit
      // list) changes only when the repo does, while the verdict it implies
      // ("13d since") changes daily on its own. Hashing verdicts would restamp
      // and recommit this cache on every crawl forever, which is the same trap
      // the crawl-timestamp exclusion above avoids. The declaration rides along
      // because a threshold edit changes what the card should say.
      checks: (entry.checks || []).map(c => [
        c.check?.label || '', c.check?.kind || '', c.check?.path || '',
        c.check?.staleAfterDays ?? '', c.check?.staleOver ?? '',
        (c.check?.sources || []).join(','),
        c.error || '', JSON.stringify(c.fact || null),
      ]),
    };
  }
  function hashEntry(entry) { return hash(material(entry)); }

  // Merge freshly-crawled activity for one repo into its prior entry. Recent
  // commits ACCUMULATE (union by sha, newest-first, capped) so the strip keeps
  // history a single crawl's window would drop; every other field is a snapshot
  // that the fresh crawl replaces. A crawl that skipped the survey (summary-only
  // pass) keeps the prior survey rather than dropping it.
  function mergeRepo(prev, fetched, nowISO, commitCap = COMMIT_CAP) {
    const f = fetched || {};
    const recentCommits = mergeCommits(prev?.recentCommits, f.recentCommits, commitCap);
    const survey = f.survey !== undefined ? f.survey : (prev?.survey || null);
    // Counts that DESCRIBE the survey travel with it. A QUICK pass measures
    // branches/active/older/openPRs correctly from the branch list it read, but
    // reports landed/stranded/surveyed as zero because it ran no survey. Taking
    // those wholesale would blank the stranded chip on every repo card while
    // the survey rows behind it are still there: a cache reporting less than it
    // holds.
    //
    // Keyed on an explicit `partial` flag, not on the absence of `survey`.
    // Inferring it from the absent field looked equivalent and was not: plenty
    // of callers hand over an entry with no survey and mean it, and treating
    // those as partial rewrote counts they had deliberately set.
    const SURVEY_COUNTS = ['landed', 'stranded', 'surveyed'];
    const counts = !f.counts ? (prev?.counts || {})
      : f.partial && prev?.counts
        ? { ...f.counts, ...Object.fromEntries(SURVEY_COUNTS.map(k => [k, prev.counts[k] ?? 0])) }
        : f.counts;
    const entry = {
      generatedAt: nowISO,
      pushedAt: f.pushedAt || prev?.pushedAt || '',
      defaultBranch: f.defaultBranch || prev?.defaultBranch || 'main',
      counts,
      recentCommits,
      openPRs: Array.isArray(f.openPRs) ? f.openPRs : (prev?.openPRs || []),
      survey,
      // Snapshot, like survey: a crawl that skipped checks keeps the prior ones
      // rather than dropping them, but a crawl that ran them and found none
      // (the repo removed its declarations) must clear, or a retired check
      // haunts the card forever.
      checks: f.checks !== undefined ? f.checks : (prev?.checks || []),
    };
    entry.hash = hashEntry(entry);
    return entry;
  }

  // Union two commit lists by sha, newest-first (ISO date string sort), capped.
  // Prior first so a re-seen sha keeps its earliest-recorded fields.
  function mergeCommits(prev, fresh, cap = COMMIT_CAP) {
    const seen = new Set();
    const out = [];
    for (const c of [...(fresh || []), ...(prev || [])]) {
      if (!c || !c.sha || seen.has(c.sha)) continue;
      seen.add(c.sha);
      out.push(c);
    }
    out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return out.slice(0, cap);
  }

  // Build the whole cache from the prior cache and a map of freshly-crawled
  // { "owner/repo": <fetched> }. Membership follows the crawl: a repo absent
  // from `fetched` is dropped, so the cache tracks the current estate.
  // `carry` is the crawl's intended SCOPE: the estate members it set out to
  // cover. A member that is in scope but absent from `fetched` is one the crawl
  // failed to reach, and it keeps the entry it already had rather than being
  // deleted by a pass that never looked at it. A repo outside the scope has
  // genuinely left the estate and is pruned, which is what keeps this
  // self-cleaning; that only works because the scope now comes from a config
  // cache that no longer truncates (see repo-config-cache.buildCache).
  //
  // Without this, one repo failing its crawl removed it from the shared cache
  // outright, and `changedRepos` counted the removal as a change, so the commit
  // went through and the closing toast reported a successful refresh. The
  // failure was already collected in `failed` and warned to the console; what
  // it must not do is take the row with it.
  function buildCache(prev, fetched, nowISO, commitCap = COMMIT_CAP, carry = null) {
    const repos = {};
    for (const [repo, f] of Object.entries(fetched || {})) {
      repos[repo] = mergeRepo(prev?.repos?.[repo], f, nowISO, commitCap);
    }
    for (const repo of (carry || [])) {
      if (repo in repos) continue;
      const was = prev?.repos?.[repo];
      if (was) repos[repo] = was;   // untouched: same hash and crawl stamps, no restamp
    }
    return { generatedAt: nowISO, repos };
  }

  // Which repos differ in substance between two caches, ignoring timestamps:
  // membership changes either way, plus any repo whose material hash moved.
  // Sorted, so a caller can name them. This is the crawl's answer to "did that
  // long refresh find anything", which cacheChanged's boolean cannot give.
  function changedRepos(prev, next) {
    const pr = prev?.repos || {}, nr = next?.repos || {};
    const keys = [...new Set([...Object.keys(pr), ...Object.keys(nr)])].sort();
    return keys.filter(k => !(k in pr) || !(k in nr) || pr[k]?.hash !== nr[k]?.hash);
  }

  // Whether two caches differ in substance. buildCache always restamps
  // generatedAt, so this is what lets a no-op crawl skip the commit. One
  // definition, shared with changedRepos: the count and the gate cannot drift.
  function cacheChanged(prev, next) {
    return changedRepos(prev, next).length > 0;
  }

  // A flat, newest-first cross-repo commit stream for the activity strip: each
  // repo's recentCommits tagged with its repo, merged and capped. Pure, so the
  // Activity view and the landing strip share one projection.
  function recentStream(cache, cap = 40) {
    const out = [];
    for (const [repo, e] of Object.entries(cache?.repos || {})) {
      for (const c of e.recentCommits || []) out.push({ ...c, repo });
    }
    out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return out.slice(0, cap);
  }

  window.RepoActivityCache = {
    CACHE_PATH, COMMIT_CAP,
    hash, material, hashEntry, mergeRepo, mergeCommits, buildCache, changedRepos, cacheChanged, recentStream,
  };
})();
