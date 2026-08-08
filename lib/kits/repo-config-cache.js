// Config aggregate + history + alignment grade for the web-tools ecosystem. show-repo crawls
// each participating repo's .web-tools.json and folds it into one cache file
// (state/configs.json) in the private registry repo, keeping a bounded,
// on-change version history per repo. This is a DERIVED cache: each repo's own
// .web-tools.json stays the source of truth, and show-repo reads a repo's live
// config (not this cache) whenever it operates on that repo. The cache is for
// breadth (looking across repos at once) and for accumulating config history a
// single API read can't show.
//
// Pure builders live here so they can be unit-tested; the network crawl and the
// throttle that drive them live in the show-repo shell. Attaches to
// window.RepoConfigCache, loaded via gh.load('kits/repo-config-cache.js').
(() => {
  const CACHE_PATH = 'state/configs.json';
  const HISTORY_CAP = 20;

  // Deterministic short hash of a config (order-preserving stringify). Used to
  // decide whether a fetched config differs from the newest stored version, and
  // to detect whether the whole cache changed materially (skip no-op commits).
  function hashConfig(config) {
    const s = config == null ? '\0null' : JSON.stringify(config);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // Fold one repo's freshly-fetched config into its prior cache entry: refresh
  // the latest snapshot, and append a history version only when the content
  // changed (hash differs from the newest history entry). History is
  // newest-last and capped at `cap`.
  // `align` is the portable-alignment grade for the repo, computed by the same
  // crawl because it is already standing in front of the repo: the grade needs
  // .claude/settings.json and CLAUDE.md, two reads beside the manifest read
  // that is happening anyway. It rides the cache rather than a third cache file
  // of its own (state/alignment.json was the shape first sketched) because a
  // second crawl over the same repos on its own throttle is a second thing to
  // keep in step with membership, and membership drift is exactly what put the
  // grading here in the first place.
  //
  // It stays OUT of `history`: config history records what a repo declared, and
  // a grade is a reading of the environment around the declaration. A CLAUDE.md
  // edit would otherwise push a config-history entry that shows no config
  // change, which is the sort of thing that makes a history stop being read.
  function mergeRepo(prev, fetched, nowISO, cap = HISTORY_CAP) {
    const config = fetched?.config ?? null;
    const configName = fetched?.configName ?? null;
    const hash = hashConfig(config);
    const history = Array.isArray(prev?.history) ? prev.history.slice() : [];
    const last = history[history.length - 1];
    if (!last || last.hash !== hash) {
      history.push({ at: nowISO, hash, config, configName });
      while (history.length > cap) history.shift();
    }
    // A crawl that could not grade (no assessor loaded) keeps the last grade
    // rather than erasing it: absent means "not read", never "not aligned".
    const align = fetched?.align ?? prev?.align ?? null;
    return { config, configName, hash, fetchedAt: nowISO, history,
             ...(align ? { align, alignHash: hashConfig(align) } : {}) };
  }

  // Build the whole cache from the prior cache and a map of freshly-fetched
  // { "owner/repo": { config, configName } }.
  //
  // A REPO THE CRAWL DID NOT VISIT KEEPS THE ENTRY IT HAD. Membership used to
  // follow the crawl exactly, dropping anything absent from `fetched`, which
  // reads as "the cache tracks the current participating set" and behaves as
  // "whoever crawls last overwrites the shared file with their own view of the
  // world". Those coincide only while every client can see every repo, and one
  // that cannot (a fine-grained token scoped to fewer repos, an account past
  // the un-paginated 100 the enumeration asks for, a listing that fell back to
  // a short list) silently deleted everyone else's rows. Measured 2026-08-01:
  // state/configs.json went 18 repos to 1 and took the activity cache, which is
  // keyed off this one's estate members, down with it.
  //
  // So absence is no longer evidence. A repo leaves this cache by being VISITED
  // and found to have no manifest, which is recorded as an entry with
  // `config: null` and already de-lists it everywhere downstream (every
  // consumer filters on a config field, none on mere presence). The cost is a
  // dead row for a repo that vanishes entirely, which is cheap and visible;
  // the cost of the old rule was the whole file.
  function buildCache(prev, fetched, nowISO, cap = HISTORY_CAP, carry = null) {
    const repos = {};
    for (const [repo, f] of Object.entries(fetched || {})) {
      repos[repo] = mergeRepo(prev?.repos?.[repo], f, nowISO, cap);
    }
    for (const repo of (carry || [])) {
      if (repo in repos) continue;
      const was = prev?.repos?.[repo];
      if (was) repos[repo] = was;   // untouched: same hash, same fetchedAt, no restamp
    }
    return { generatedAt: nowISO, repos };
  }

  // Whether two caches differ in substance, ignoring timestamps: compare
  // membership and each repo's current hash. buildCache always restamps
  // fetchedAt, so a plain deep-equal would always report a change; this lets a
  // refresh that found nothing new skip the commit entirely.
  function cacheChanged(prev, next) {
    const pr = prev?.repos || {}, nr = next?.repos || {};
    const pk = Object.keys(pr).sort(), nk = Object.keys(nr).sort();
    if (pk.length !== nk.length || pk.some((k, i) => k !== nk[i])) return true;
    // A changed grade is a changed cache: a repo that wired the conventions in
    // without touching its manifest is precisely the transition worth writing.
    return nk.some(k => pr[k]?.hash !== nr[k]?.hash || pr[k]?.alignHash !== nr[k]?.alignHash);
  }

  window.RepoConfigCache = { CACHE_PATH, HISTORY_CAP, hashConfig, mergeRepo, buildCache, cacheChanged };
})();
