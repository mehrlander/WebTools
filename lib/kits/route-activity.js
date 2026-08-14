// kits/route-activity.js — rank the app's own routes by when the code behind
// each last moved, and join each to the work in flight against it.
//
// The estate has three readings of its motion already (branches, sessions,
// guides) and all three are keyed to GIT: a branch, the session that ran it,
// the body that accounts for it. None of them says WHICH PART OF THE UI moved,
// and the UI is what most of the work is. This is the fourth reading, keyed to
// the ADDRESS: for each destination the app can be sent to, when did its code
// last change, and is anything open against it now.
//
// THE JOIN IS FILES, AND FILES ARE COARSER THAN ROUTES. This is the honest
// limit and the pane states it rather than hiding it. Nine routes render out of
// lib/alpineComponents/estate.js, so a commit there lights all nine; the shell
// (pages/show-repo/show-repo.html) holds the router and every pane's outer
// markup, so a commit there lights everything and is therefore excluded from
// attribution and reported on its own. What survives that is still a real
// reading, and the exclusions are themselves the finding: a route with no file
// of its own has no code of its own, which is a fact about the app the app
// could not previously state.
//
// Pure. No fetch, no DOM, no Alpine: the caller hands in the manifest, a
// path -> last-commit map, and whatever branches it knows about, and gets rows
// back. Same split as lib/kits/guide-index.js and lib/kits/repo-activity-cache.js
// (pure fold here, crawl in the shell), which is what makes it testable.
//
//   routeActivity.carriers(manifest)              -> Map path -> [route keys]
//   routeActivity.rank(manifest, { touches, branches, now }) -> ranked rows
//   routeActivity.shellRow(manifest, { touches })  -> the excluded shell's own row
//
// Attaches to window.routeActivity, loaded via gh.load('kits/route-activity.js').
(() => {
  // A file carrying more than this many routes says nothing about any one of
  // them when it changes. It is still listed on every row it belongs to, and
  // still dates the row when it is the only carrier there is; what it loses is
  // the right to be the row's REASON, so a row backed only by wide files reads
  // "shared" rather than claiming a date it did not earn.
  const WIDE = 3;

  const list = (v) => Array.isArray(v) ? v : [];

  // Which routes each declared file carries. Built from the manifest alone, so
  // "shared" is derived and never authored: a file becomes shared by being
  // named twice, which is the only way it could have become shared in fact.
  function carriers(manifest) {
    const m = new Map();
    for (const r of list(manifest?.routes)) {
      for (const p of list(r.files)) {
        if (!m.has(p)) m.set(p, []);
        m.get(p).push(r.key);
      }
    }
    return m;
  }

  // Newest of a set of touches. A touch is whatever the caller read for a path
  // ({ date, sha, subject, url, author }); only `date` is required, and a path
  // with no touch simply does not vote.
  function newest(touches) {
    let best = null;
    for (const t of touches) {
      if (!t || !t.date) continue;
      if (!best || t.date > best.date) best = t;
    }
    return best;
  }

  // One route's row. `own` files are the ones narrow enough to date the row;
  // every declared file is still reported, with its own touch and its share
  // count, so the reader can see what the row is standing on.
  function rowFor(route, { carrierMap, touches, branches, shell }) {
    const files = list(route.files)
      .filter(p => p !== shell)
      .map(p => {
        const keys = carrierMap.get(p) || [];
        return { path: p, routes: keys.length, shared: keys.length > 1,
                 wide: keys.length >= WIDE, touch: touches[p] || null };
      });
    const own = files.filter(f => !f.wide);
    // The row's date comes from its narrow files when it has any, and falls
    // back to its wide ones when it does not, flagged so the reading is never
    // silently borrowed from a file nine routes share.
    const lastTouch = newest(own.map(f => f.touch)) || newest(files.map(f => f.touch));
    const borrowed = !!lastTouch && !own.some(f => f.touch && f.touch.date === lastTouch.date);
    // The branch join takes the same rule as the date, and for the same reason.
    // A PR that edits estate.js touches nine routes' declared files, so a naive
    // join reports work open on all nine; the first render of this pane said
    // "11 with work open" off three PRs. A branch is OPEN ON a route when it
    // touches a narrow carrier, and merely NEAR it when its only hit is a file
    // several routes share. Both are shown; only the first is counted.
    const narrow = new Set(own.map(f => f.path));
    const paths = new Set(files.map(f => f.path));
    const hits = (b) => list(b.files).filter(p => paths.has(p));
    const touching = list(branches).filter(b => hits(b).length);
    const open = [], near = [];
    for (const b of touching) {
      const h = hits(b);
      (h.some(p => narrow.has(p)) ? open : near).push({ ...b, hits: h });
    }
    return {
      ...route,
      files,
      ownCount: own.length,
      hasOwnCode: files.length > 0,
      lastTouch,
      borrowed,
      branches: open,
      nearBranches: near,
      // A route nothing is open against and nothing has touched still belongs
      // in the list: the inventory is the point, and an untouched route is the
      // one reading a recency list alone would never surface.
      quiet: !lastTouch && open.length === 0,
    };
  }

  // Three tiers, then date within each. The tiers are the whole point of the
  // ordering: a flat sort by date puts a route at the top because a file nine
  // routes share happened to move, which is the reading this pane exists to
  // avoid making. So a row dated by its OWN narrow carrier outranks every
  // borrowed one however fresh, a borrowed date outranks no date at all, and
  // an undated row falls to the bottom rather than to the top on an empty
  // string. Work open breaks a tie inside a tier, and manifest order breaks
  // what is left, so the order is total and stable.
  function tier(r) { return r.lastTouch ? (r.borrowed ? 1 : 0) : 2; }

  function rank(manifest, opts = {}) {
    const touches = opts.touches || {};
    const branches = list(opts.branches);
    const carrierMap = carriers(manifest);
    const shell = manifest?.shell || '';
    const rows = list(manifest?.routes).map((r, i) =>
      ({ ...rowFor(r, { carrierMap, touches, branches, shell }), _i: i }));
    rows.sort((a, b) => {
      const at = tier(a), bt = tier(b);
      if (at !== bt) return at - bt;
      const ad = a.lastTouch?.date || '', bd = b.lastTouch?.date || '';
      if (ad !== bd) return ad < bd ? 1 : -1;
      if (a.branches.length !== b.branches.length) return b.branches.length - a.branches.length;
      return a._i - b._i;
    });
    return rows.map(({ _i, ...r }) => r);
  }

  // The shell's own row: excluded from attribution above precisely because it
  // touches everything, and reported here so the exclusion is visible rather
  // than felt as a gap.
  function shellRow(manifest, opts = {}) {
    const p = manifest?.shell || '';
    if (!p) return null;
    const touches = opts.touches || {};
    return { path: p, touch: touches[p] || null,
             routes: list(manifest?.routes).length, note: manifest?.shellNote || '' };
  }

  // Every path the caller has to read a last-commit for, deduped, shell
  // included. The shell's own reading needs it and no route's does.
  function pathsToRead(manifest) {
    const s = new Set(carriers(manifest).keys());
    if (manifest?.shell) s.add(manifest.shell);
    return [...s];
  }

  // Fold ranked rows into their nav STOPS, which is the level the router lost.
  // Six sub-tabs are addressed as their own ?view= key because each used to be
  // a nav stop and kept its key when its pane moved under another; listing
  // those at the same rank as live destinations is what made a flat list read
  // oddly. `stop` puts the level back.
  //
  // ORDER IS INHERITED, NOT RECOMPUTED. `rank` has already sorted by tier then
  // date, so grouping by first appearance gives exactly "stops by their
  // freshest member, rows by recency inside" with no second sort to disagree
  // with the first. An earlier draft grouped by a fixed manifest order and cost
  // the pane its headline, an hour-old route sitting below a six-day-old one;
  // taking the order from the ranking is what makes grouping safe here.
  //
  // A stop owning ONE route is not a grouping and says so (`solo`), so the pane
  // can render it as a plain row rather than a section of one.
  function stops(rows) {
    const out = [], byStop = new Map();
    for (const r of list(rows)) {
      const key = r.stop || r.label || r.key;
      let g = byStop.get(key);
      if (!g) { g = { stop: key, rows: [], group: r.group }; byStop.set(key, g); out.push(g); }
      g.rows.push(r);
    }
    for (const g of out) {
      g.solo = g.rows.length === 1;
      // The stop's own reading is its freshest row's, which is its first: the
      // rows arrived in rank order and grouping preserved it.
      g.lastTouch = g.rows[0].lastTouch || null;
      g.borrowed = !!g.lastTouch && g.rows[0].borrowed;
      g.open = g.rows.reduce((n, r) => n + r.branches.length, 0);
    }
    return out;
  }

  // The join run backwards: given a changed-file list, which routes does it
  // touch. `rank` answers "what is open against this route" for a pane that
  // starts from routes; this answers "what is this branch working on" for a
  // pane that starts from branches. Same rule in both directions, deliberately:
  // a hit on a narrow carrier is ON the route, a hit only on a file three or
  // more routes share is NEAR it, and the shell is never a hit at all. Two
  // panes disagreeing about the same pair of facts would be worse than either
  // pane not showing it.
  function routesTouched(manifest, files) {
    const carrierMap = carriers(manifest);
    const shell = manifest?.shell || '';
    const set = new Set(list(files));
    const on = [], near = [];
    for (const r of list(manifest?.routes)) {
      const own = [], any = [];
      for (const p of list(r.files)) {
        if (p === shell || !set.has(p)) continue;
        any.push(p);
        if ((carrierMap.get(p) || []).length < WIDE) own.push(p);
      }
      if (own.length) on.push({ ...r, hits: any });
      else if (any.length) near.push({ ...r, hits: any });
    }
    return { on, near };
  }

  window.routeActivity = { WIDE, carriers, rank, stops, routesTouched, shellRow, pathsToRead, newest };
})();
