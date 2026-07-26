// Branch-survey math: the content-level landed/stranded signal, ported from
// home's tools/branch-survey.sh (the CLI reference instrument). Squash merges
// and history rewrites make ref-level "unmerged" unreliable, so the signal to
// read is content: does each path a branch uniquely touched hold, at the
// branch tip, bytes that exist on the default branch right now, at the same
// path or moved anywhere in the tree.
//
// The math is pure functions, unit-tested and checked for agreement against the
// CLI (scripts/check-branch-survey.mjs). Beneath it sit thin fetch orchestrators
// (defaultTree / surveyBranchLive / surveyOlder) that wrap the three reads the
// math needs, so the two callers that survey branches share one path instead of
// each carrying a copy: the branches view (lib/alpineComponents/branches.js) and
// the throttled activity crawl (show-repo's refreshActivityCache, which stores
// the result in state/activity.json via lib/repo-activity-cache.js). Attaches to
// window.BranchSurvey, loaded via gh.load('branch-survey.js').
(() => {
  // Calibration carried over from the CLI: the recently-active window, and the
  // landed-ratio threshold hand-verified against the five branches home's
  // June 14 reconcile memo confirmed as landed (they score 85-95%; shared
  // files keep evolving on the default branch after a squash, so 100% never
  // happens for a real branch).
  const RECENT_DAYS = 14;
  const LANDED_PCT = 80;

  // {blobs, paths} from a recursive git tree listing: `blobs` is the set of
  // every blob sha in the tree (recognizes content that landed and then
  // MOVED), `paths` maps each file path to its blob sha (separates "we both
  // have this file, bytes differ" churn from truly absent content). Accepts
  // the API's tree-entry array ({path, type, sha}) directly.
  function treeSets(entries) {
    const blobs = new Set();
    const paths = new Map();
    for (const e of entries || []) {
      if (e.type !== 'blob') continue;
      blobs.add(e.sha);
      paths.set(e.path, e.sha);
    }
    return { blobs, paths };
  }

  // The content signal for one branch. Inputs:
  //   uniquePaths  paths the branch's unique commits touched (from compare
  //                files, or `git log --not <base>` at the CLI)
  //   tip          treeSets() of the branch tip
  //   main         treeSets() of the default branch
  // Per path, in CLI order: identical bytes at the same path -> landed; blob
  // present anywhere on main -> landed (moved); absent from the branch tip
  // (the branch deleted it) -> landed, a deletion carries no stranded content;
  // otherwise unlanded, and MISSING when the path is absent from main in both
  // path and bytes — the strong stranded evidence. What is unlanded but not
  // missing is churn: either unlanded edits or main's forward drift,
  // indistinguishable cheaply.
  function landedSignal(uniquePaths, tip, main) {
    const unique = [...new Set(uniquePaths || [])];
    let nLanded = 0;
    const missingPaths = [];
    for (const p of unique) {
      const tipSha = tip.paths.get(p);
      if (tipSha === undefined) { nLanded++; continue; }
      if (main.paths.get(p) === tipSha || main.blobs.has(tipSha)) { nLanded++; continue; }
      if (!main.paths.has(p)) missingPaths.push(p);
    }
    return { nUnique: unique.length, nLanded, nMissing: missingPaths.length, missingPaths };
  }

  // 'active' | 'landed' | 'stranded', mirroring the CLI: fresh work is active
  // regardless of signal; then the content signal separates landed (nothing
  // missing, or 80%+ of touched paths match main byte-for-byte — an empty
  // unique set is the squash-merge shadow, whose whole diff already exists on
  // main) from stranded. The honest limits carry over too: a branch whose
  // files landed and kept evolving on main can still read stranded, and an
  // edit-only branch can hide in landed; the compare link is ground truth.
  function classify({ daysAgo, nUnique, nLanded, nMissing }, opts = {}) {
    const recentDays = opts.recentDays ?? RECENT_DAYS;
    const landedPct = opts.landedPct ?? LANDED_PCT;
    if (daysAgo <= recentDays) return 'active';
    if (nUnique === 0 || nMissing === 0 || nLanded * 100 >= nUnique * landedPct) return 'landed';
    return 'stranded';
  }

  // Whole days from an ISO commit date to `now` (ms since epoch). Matches the
  // CLI's integer (NOW - unix) / 86400.
  function daysAgo(isoDate, now) {
    return Math.floor((now - new Date(isoDate).getTime()) / 86400000);
  }

  // When a branch's OLDEST unique commit was authored, read off a compare
  // response, or '' when the answer would not be honest. The compare lists the
  // branch's unique commits oldest-first, so commits[0] is where the branch
  // starts and the pair (firstDate, tip date) is its lifespan, free, since the
  // survey already has this response in hand. GitHub caps the list at 250 and
  // reports the true count in total_commits, so a branch past the cap has no
  // knowable first commit here and gets '' rather than the 250th-from-tip.
  function firstCommitDate(cmp) {
    const commits = cmp?.commits || [];
    if (!commits.length) return '';
    const total = cmp.total_commits ?? commits.length;
    if (total > commits.length) return '';
    return commits[0].commit?.committer?.date || '';
  }

  // ── Live fetch orchestration ─────────────────────────────────────────────
  // The math above needs three reads to survey a repo: the default-branch tree
  // once, then per branch a compare (for the uniquely-touched paths) and the
  // branch tip tree. These wrap those reads so the view and the crawl survey
  // identically. `gh` is any object carrying the GH proto (compare, req, ago);
  // still testable against a fake gh, no real network.

  const COMMIT_CAP = 50;   // history reach for a no-merge-base branch, like the CLI

  // The default-branch tree as treeSets, plus the API's truncation flag (a
  // truncated tree undercounts, which a caller surfaces).
  async function defaultTree(gh, ref){
    const t = await gh.req('git/trees/' + encodeURIComponent(ref) + '?recursive=1');
    return { sets: treeSets(t.tree), truncated: !!t.truncated };
  }

  // Survey ONE older branch against the default-branch treeSets `main`. Returns
  // a plain result object (no reactive mutation), so a caller maps it onto
  // whatever it renders. The CLI's algorithm in API form: compare against the
  // default branch for the uniquely-touched paths; on a no-merge-base 404 (the
  // history-rewrite case) fall back to the diff across the branch's newest
  // COMMIT_CAP commits; then the content signal and its classification. `branch`
  // is { name, sha, date?, subject?, ago? }.
  async function surveyBranchLive(gh, branch, main, opts = {}){
    const def = opts.defaultRef || 'main';
    const commitCap = opts.commitCap ?? COMMIT_CAP;
    const now = opts.now ?? Date.now();
    let unique = [], noBase = false;
    let date = branch.date || '', subject = branch.subject || '';
    let aheadBy = null, behindBy = null;   // commits ahead of / behind the default
    let firstDate = '';                    // the branch's OLDEST unique commit
    try {
      const d = await gh.compare(def, branch.name);
      unique = (d.files || []).map(f => f.filename);
      aheadBy = d.ahead_by ?? null; behindBy = d.behind_by ?? null;
      const commits = d.commits || [];
      if (!subject && commits.length) subject = (commits[commits.length - 1].commit?.message || '').split('\n')[0];
      if (!date && commits.length) date = commits[commits.length - 1].commit?.committer?.date || '';
      firstDate = firstCommitDate(d);
    } catch (e) {
      if (e?.status !== 404) throw e;
      // No merge base, so there is no "unique commits" list to take a start
      // from: the oldest commit reachable here is the repo's history, not the
      // branch's. firstDate stays '' and the row shows its tip age alone.
      noBase = true;
      const commits = await gh.req('commits?sha=' + encodeURIComponent(branch.name) + '&per_page=' + commitCap);
      if (!date && commits.length) date = commits[0].commit?.committer?.date || '';
      if (!subject && commits.length) subject = (commits[0].commit?.message || '').split('\n')[0];
      const oldest = commits[commits.length - 1];
      const from = oldest?.parents?.[0]?.sha;
      if (from){
        const d = await gh.compare(from, branch.sha || branch.name);
        unique = (d.files || []).map(f => f.filename);
      }
    }
    const tipTree = await gh.req('git/trees/' + encodeURIComponent(branch.sha || branch.name) + '?recursive=1');
    const tip = treeSets(tipTree.tree);
    const s = landedSignal(unique, tip, main);
    const group = classify({ daysAgo: date ? daysAgo(date, now) : 999, ...s }, opts);
    return {
      noBase, date, firstDate, subject, aheadBy, behindBy,
      ago: (date && gh.ago) ? gh.ago(date) : (branch.ago || ''),
      nUnique: s.nUnique, nLanded: s.nLanded, nMissing: s.nMissing, missingPaths: s.missingPaths, group,
    };
  }

  // Survey up to `cap` of `older` (the caller supplies most-recent-first order)
  // through a small concurrency pool, reading the default tree once. onRow(row)
  // fires as each branch completes, so an incremental UI can paint without
  // waiting for the whole pass. Returns { truncated, rows }, rows being
  // { ...branch, ...survey, state }. Used whole by the crawl; the view keeps its
  // own reactive pool but shares surveyBranchLive.
  async function surveyOlder(gh, opts = {}){
    const older = opts.older || [];
    const cap = opts.cap ?? older.length;
    const pool = opts.pool ?? 4;
    const onRow = opts.onRow || (() => {});
    const { sets: main, truncated } = await defaultTree(gh, opts.defaultRef || 'main');
    const queue = older.slice(0, cap);
    const rows = new Array(queue.length);
    let i = 0;
    const worker = async () => {
      while (i < queue.length){
        const idx = i++;
        const b = queue[idx];
        try {
          const res = await surveyBranchLive(gh, b, main, opts);
          rows[idx] = { ...b, ...res, state: 'done' };
        } catch (e) {
          rows[idx] = { ...b, state: 'error', err: e?.message || String(e) };
        }
        onRow(rows[idx]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(pool, queue.length) }, worker));
    return { truncated, rows: rows.filter(Boolean) };
  }

  window.BranchSurvey = {
    RECENT_DAYS, LANDED_PCT, COMMIT_CAP,
    treeSets, landedSignal, classify, daysAgo, firstCommitDate,
    defaultTree, surveyBranchLive, surveyOlder,
  };
})();
