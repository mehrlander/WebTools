// Branch-scan math: the content-level landed/stranded signal, ported from
// home's tools/unmerged-branches.sh (the CLI reference instrument). Squash merges
// and history rewrites make ref-level "unmerged" unreliable, so the signal to
// read is content: does each path a branch uniquely touched hold, at the
// branch tip, bytes that exist on the default branch right now, at the same
// path or moved anywhere in the tree.
//
// The math is pure functions, unit-tested and checked for agreement against the
// CLI (scripts/check-branch-status.mjs). Beneath it sit thin fetch orchestrators
// (defaultTree / scanBranchLive / scanOlder) that wrap the three reads the
// math needs, so the two callers that scan branches share one path instead of
// each carrying a copy: the branches view (lib/alpineComponents/branches.js) and
// the throttled activity crawl (show-repo's refreshActivityCache, which stores
// the result in state/activity.json via lib/kits/repo-activity-cache.js). Attaches to
// window.BranchStatus, loaded via gh.load('kits/branch-status.js').
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
  // scan already has this response in hand. GitHub caps the list at 250 and
  // reports the true count in total_commits, so a branch past the cap has no
  // knowable first commit here and gets '' rather than the 250th-from-tip.
  function firstCommitDate(cmp) {
    const commits = cmp?.commits || [];
    if (!commits.length) return '';
    const total = cmp.total_commits ?? commits.length;
    if (total > commits.length) return '';
    return commits[0].commit?.committer?.date || '';
  }

  // Every field derived from one compare response, read in one place.
  //
  // Two fields now come off this response, and they arrived from two sessions
  // that never met: the branch's lifespan start (PR #298) and the sessions that
  // authored it (PR #297). Each independently rediscovered the same two rules,
  // and only one of them found the second:
  //
  //   1. The response lists exactly the commits the branch has and the default
  //      does not, oldest first. So anything read here is the branch's own: no
  //      ancestor walk, no bleed from the default branch, no extra call.
  //   2. GitHub caps that list at 250 and reports the true count in
  //      total_commits. Past the cap the list is a tail, so a field has to say
  //      what it does about that rather than quietly report the 250th-from-tip.
  //
  // Rule 2 is why this exists as one function. A third field should inherit
  // both rules by construction instead of rediscovering them.
  //
  // What each field does past the cap differs, and that is the point of stating
  // it once: firstDate is unknowable and returns '', while the session list is
  // still usable (the tail is the newest end, so the newest session is right)
  // and only its completeness claim drops.
  function compareFields(cmp){
    const commits = cmp?.commits || [];
    return {
      firstDate: firstCommitDate(cmp),
      sessions: sessionsIn(commits),
      sessionsExact: (cmp?.total_commits ?? commits.length) <= commits.length,
    };
  }

  // ── Live fetch orchestration ─────────────────────────────────────────────
  // The math above needs three reads to scan a repo: the default-branch tree
  // once, then per branch a compare (for the uniquely-touched paths) and the
  // branch tip tree. These wrap those reads so the view and the crawl scan
  // identically. `gh` is any object carrying the GH proto (compare, req, ago);
  // still testable against a fake gh, no real network.

  const COMMIT_CAP = 50;   // history reach for a no-merge-base branch, like the CLI

  // The default-branch tree as treeSets, plus the API's truncation flag (a
  // truncated tree undercounts, which a caller surfaces).
  async function defaultTree(gh, ref){
    const t = await gh.req('git/trees/' + encodeURIComponent(ref) + '?recursive=1');
    return { sets: treeSets(t.tree), truncated: !!t.truncated };
  }

  // Distinct Claude Code sessions named by a list of commits, newest first.
  // The trailer is the only session identity a commit carries (the SSH
  // signature uses one constant Anthropic key, so it identifies the author and
  // not the session). GitHub returns compare commits oldest-first, so the list
  // is reversed before scanning.
  const SESSION_RE = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/;
  function sessionsIn(commits){
    const out = [], seen = new Set();
    for (const c of (commits || []).slice().reverse()){
      const m = String(c?.commit?.message || '').match(SESSION_RE);
      if (m && !seen.has(m[0])){ seen.add(m[0]); out.push(m[0]); }
    }
    return out;
  }

  // Scan ONE older branch against the default-branch treeSets `main`. Returns
  // a plain result object (no reactive mutation), so a caller maps it onto
  // whatever it renders. The CLI's algorithm in API form: compare against the
  // default branch for the uniquely-touched paths; on a no-merge-base 404 (the
  // history-rewrite case) fall back to the diff across the branch's newest
  // COMMIT_CAP commits; then the content signal and its classification. `branch`
  // is { name, sha, date?, subject?, ago? }.
  async function scanBranchLive(gh, branch, main, opts = {}){
    const def = opts.defaultRef || 'main';
    const commitCap = opts.commitCap ?? COMMIT_CAP;
    const now = opts.now ?? Date.now();
    let unique = [], noBase = false;
    let date = branch.date || '', subject = branch.subject || '';
    let aheadBy = null, behindBy = null;   // commits ahead of / behind the default
    let firstDate = '';                    // the branch's OLDEST unique commit
    let sessions = [], sessionsExact = false;
    try {
      const d = await gh.compare(def, branch.name);
      unique = (d.files || []).map(f => f.filename);
      aheadBy = d.ahead_by ?? null; behindBy = d.behind_by ?? null;
      const commits = d.commits || [];
      if (!subject && commits.length) subject = (commits[commits.length - 1].commit?.message || '').split('\n')[0];
      if (!date && commits.length) date = commits[commits.length - 1].commit?.committer?.date || '';
      ({ firstDate, sessions, sessionsExact } = compareFields(d));
    } catch (e) {
      if (e?.status !== 404) throw e;
      // No merge base, so there is no "unique commits" list to take a start
      // from: the oldest commit reachable here is the repo's history, not the
      // branch's. firstDate stays '' and the row shows its tip age alone.
      noBase = true;
      const commits = await gh.req('commits?sha=' + encodeURIComponent(branch.name) + '&per_page=' + commitCap);
      if (!date && commits.length) date = commits[0].commit?.committer?.date || '';
      if (!subject && commits.length) subject = (commits[0].commit?.message || '').split('\n')[0];
      // No merge base, so "the branch's own commits" has no meaning here and
      // this walk reaches back into whatever line the branch came from. Keep
      // the newest session only: a count drawn from this would be counting the
      // old history, not the branch.
      sessions = sessionsIn(commits.slice().reverse()).slice(0, 1);
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
      noBase, date, firstDate, subject, aheadBy, behindBy, sessions, sessionsExact,
      ago: (date && gh.ago) ? gh.ago(date) : (branch.ago || ''),
      nUnique: s.nUnique, nLanded: s.nLanded, nMissing: s.nMissing, missingPaths: s.missingPaths, group,
    };
  }

  // Scan up to `cap` of `older` (the caller supplies most-recent-first order)
  // through a small concurrency pool, reading the default tree once. onRow(row)
  // fires as each branch completes, so an incremental UI can paint without
  // waiting for the whole pass. Returns { truncated, rows }, rows being
  // { ...branch, ...scan, state }. Used whole by the crawl; the view keeps its
  // own reactive pool but shares scanBranchLive.
  // ── WHEN A BRANCH HAS TO BE SCANNED AGAIN ────────────────────────────────
  // A verdict is a function of exactly two inputs: the branch tip and the
  // default branch. Neither moved means nothing can have changed, so the stored
  // row is not stale, it is the answer, and re-deriving it is pure cost.
  //
  // `prior` (name -> stored row) and `priorMainSha` are what let a caller say
  // so. Measured 2026-08-17 on this estate: one refresh spent 98 of its 145
  // calls re-scanning branches whose tips had not moved in weeks.
  //
  // A NO-MERGE-BASE ROW IS CARRIED WHILE ITS TIP HOLDS, even when the default
  // branch moved, and that is the one place this trades exactness for cost
  // deliberately. web-tools' history was rewritten, so every branch older than
  // the rewrite 404s on compare and falls back to a 50-commit read plus a
  // second compare: three calls to re-derive a verdict about dead history,
  // times thirty branches, on every crawl. Those rows say `noBase` and the
  // reader can see it; the row is refreshed the moment the branch itself moves.
  function needsScan(b, prior, mainMoved){
    const row = prior.get(b.name);
    if (!row || !row.sha || !b.sha) return true;      // never scanned, or no tip to compare
    if (row.sha !== b.sha) return true;               // the branch moved
    if (row.noBase || row.state === 'error') return false;   // see below
    return mainMoved;                                 // main moved: the verdict can change
  }

  // AN ERRORED ROW IS CARRIED TOO, and healed in small bites rather than all at
  // once. A branch whose scan failed will fail again for the same reason: a
  // rewritten history, a ref the token cannot see, a rate limit. Retrying every
  // one on every crawl is how a single repo came to spend 93 calls of a
  // 183-call run, 56 of them failing, re-asking questions that had already been
  // answered with 404 (2026-08-17, wa-bills). `errorRetry` lets a caller heal a
  // few per run, so a transient failure does not freeze a verdict for good
  // while a permanent one stops costing the estate anything; a repo's own
  // branch review always scans live and is the way to force the issue.
  function pickRetries(queue, prior, live, cap){
    if (!cap) return [];
    const liveSet = new Set(live.map(b => b.name));
    return queue.filter(b => !liveSet.has(b.name) && prior.get(b.name)?.state === 'error').slice(0, cap);
  }

  async function scanOlder(gh, opts = {}){
    const older = opts.older || [];
    const cap = opts.cap ?? older.length;
    const pool = opts.pool ?? 4;
    const onRow = opts.onRow || (() => {});
    const prior = opts.prior instanceof Map ? opts.prior : new Map();
    // No prior main sha (a first crawl, or a caller that keeps none) reads as
    // moved, so the honest default is to scan.
    const mainMoved = !(opts.mainSha && opts.priorMainSha && opts.mainSha === opts.priorMainSha);
    const queue = older.slice(0, cap);
    const live = queue.filter(b => needsScan(b, prior, mainMoved));
    live.push(...pickRetries(queue, prior, live, opts.errorRetry ?? 0));
    // The default tree is one call, and it is the scan's shared input; skip it
    // too when every row is carried, so an untouched repo costs nothing at all.
    let main = null, truncated = false;
    if (live.length) ({ sets: main, truncated } = await defaultTree(gh, opts.defaultRef || 'main'));
    const liveSet = new Set(live.map(b => b.name));
    const rows = new Array(queue.length);
    let i = 0;
    const worker = async () => {
      while (i < queue.length){
        const idx = i++;
        const b = queue[idx];
        if (!liveSet.has(b.name)) {
          // Carried, not re-derived. `carried` is for a reader that wants to
          // know which rows this pass actually looked at.
          // The FRESH branch facts win (its name, tip, date and rendered age come
          // from this pass's list) and the stored VERDICT rides underneath, so a
          // carried row is current about the branch and only reuses the judgment
          // that cannot have changed.
          rows[idx] = { ...prior.get(b.name), ...b, state: 'done', carried: true };
          onRow(rows[idx]);
          continue;
        }
        try {
          const res = await scanBranchLive(gh, b, main, opts);
          rows[idx] = { ...b, ...res, state: 'done' };
        } catch (e) {
          rows[idx] = { ...b, state: 'error', err: e?.message || String(e) };
        }
        onRow(rows[idx]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(pool, queue.length) }, worker));
    return { truncated, rows: rows.filter(Boolean), scanned: live.length, carried: queue.length - live.length };
  }

  // The lifespan pair's display rules, shared by the estate's Open view and
  // the per-repo branch review so the two cannot drift. `first` is the
  // branch's oldest unique commit (firstCommitDate above), `tip` its latest;
  // the formatters are passed in because relative-time rendering belongs to
  // the component (GH.ago), not to this pure module.
  //
  // The start collapses to '' when it is unknowable (no merge base, or a
  // compare past GitHub's 250-commit cap leaves first empty) and when it
  // rounds to the same label as the tip, since "2h → 2h" is noise where "2h"
  // is the answer.
  function lifespanStart(first, tip, agoShort) {
    if (!first) return '';
    const s = agoShort(first);
    return s === agoShort(tip) ? '' : s;
  }
  function lifespanTitle(first, tip, agoOf) {
    const latest = 'latest ' + agoOf(tip);
    return first ? 'started ' + agoOf(first) + ', ' + latest : latest;
  }

  // GitHub's new-file form opened ON a branch with the filename prefilled:
  // the "drop a file onto the branch" convention (.claude/skills/drop-link),
  // one URL instead of a placeholder commit. Shared here because two surfaces
  // mint it (the estate Activity menu and the branch page) and a third could;
  // this file is the one module both already load. The name defaults into the
  // repo's declared `inbox` manifest dir, but ONLY when that is a plain
  // same-repo directory: an inbox may also be a cross-repo spec
  // ('owner/repo[@ref]:dir', web-tools' own is), and pasting that into a
  // filename mints a nonsense path, which is exactly what the estate menu did
  // until 2026-08-08. Anything spec-shaped falls back to dump/.
  function dropDir(inbox) {
    const dir = typeof inbox === 'string' ? inbox.replace(/\/+$/, '') : '';
    return (!dir || dir.includes(':') || dir.includes('@')) ? 'dump' : dir;
  }
  function dropFileName(inbox, now) {
    const d = now || new Date(), p = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
      + '-' + p(d.getHours()) + p(d.getMinutes());
    return dropDir(inbox) + '/' + stamp + '-drop.md';
  }
  function dropFileUrl(repo, branch, inbox, now) {
    return 'https://github.com/' + repo + '/new/' + branch
      + '?filename=' + encodeURIComponent(dropFileName(inbox, now));
  }

  window.BranchStatus = {
    sessionsIn,
    RECENT_DAYS, LANDED_PCT, COMMIT_CAP,
    treeSets, landedSignal, classify, daysAgo, firstCommitDate, compareFields, needsScan,
    defaultTree, scanBranchLive, scanOlder,
    lifespanStart, lifespanTitle, dropDir, dropFileName, dropFileUrl,
  };
})();
