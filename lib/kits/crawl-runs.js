// The `runs` ring: the few facts about a crawl that its output cannot show.
//
// Every derived file under the registry's state/ answers "what is true now",
// and the registry's commit history answers "when did that change". Between
// them sits a small set of facts neither can produce, because they are
// properties of the RUN rather than of the result: how long it took, how much
// it examined to find what it found, and how much of it failed. show-repo
// computes all three on every crawl, reports them to a four-second toast, and
// drops them.
//
// So each cache file carries a bounded ring of its own recent runs, and the two
// design constraints are what make it cost nothing:
//
//   IT RIDES THE COMMIT THAT ALREADY HAPPENS. A crawl commits only when it
//   found a material change, which is the property that keeps the registry from
//   filling with no-op commits. A run log written on every run would destroy
//   exactly that, and a separate file written beside each cache would double
//   the commits. Appending to the file being written costs nothing extra.
//
//   IT IS INVISIBLE TO THE CHANGE DETECTORS. All three caches decide whether to
//   commit by comparing their record collections (`repos`, `rows`), never the
//   whole document, so a `runs` key can never make a commit happen by itself.
//   That is a property of those three functions, and the reason this must stay
//   a top-level sibling of the records rather than anything nested inside them.
//
// What it therefore CANNOT say, and the State view says so where it renders: a
// run that found nothing leaves no entry, so this counts changes, not runs.
// Buffering the no-op runs locally and flushing them into the next commit was
// considered and dropped: the buffer is per-browser, so a run count assembled
// that way would silently undercount every device that never commits again,
// which is worse than a figure that is plainly absent.
//
// Attaches to window.CrawlRuns, loaded via gh.load('kits/crawl-runs.js').
(() => {
  const CAP = 20;   // matches the State view's history window: 20 commits, 20 runs

  // Append one run and hold the cap. Newest last, matching the config cache's
  // per-repo history, so the two read the same way.
  //
  // A field the caller did not measure is DROPPED rather than written as zero.
  // The config crawl swallows a per-repo read failure and cannot count them, so
  // its entries carry no `failed`; writing 0 there would be a claim that none
  // failed, which is a different statement from "not counted" and the one the
  // reader would act on.
  function push(prev, entry, cap = CAP) {
    const runs = Array.isArray(prev) ? prev.slice() : [];
    runs.push(clean(entry));
    while (runs.length > cap) runs.shift();
    return runs;
  }

  function clean(entry) {
    const out = {};
    for (const [k, v] of Object.entries(entry || {})) {
      if (v === undefined || v === null || v === '') continue;
      out[k] = k === 'ms' ? Math.round(v) : v;
    }
    return out;
  }

  // The run that produced a given commit, matched by interval rather than by
  // position. A run finished after the previous commit and at (or a moment
  // before) this one, so that window identifies it without assuming the two
  // lists line up. They will not always: commits predate this ring, and a file
  // edited by hand has a commit and no run at all. Positional matching would
  // shift every duration by one the first time that happened.
  //
  // `commits` is newest-first, as the commits API returns it. SLACK covers the
  // gap between stamping `at` and the write landing.
  const SLACK_MS = 2 * 60 * 1000;
  function matchRuns(commits, runs) {
    const list = (runs || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return (commits || []).map((c, i) => {
      const older = commits[i + 1]?.date || '';
      const ceiling = new Date(+new Date(c.date) + SLACK_MS).toISOString();
      // Newest run inside (previous commit, this commit + slack].
      for (let j = list.length - 1; j >= 0; j--) {
        const at = String(list[j].at || '');
        if (at > ceiling) continue;
        if (older && at <= older) break;
        return list[j];
      }
      return null;
    });
  }

  window.CrawlRuns = { CAP, push, matchRuns };
})();
