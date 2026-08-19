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

  // ── The three answers, and why the third one has to be named ─────────────
  //
  // Every path the branch touched gets exactly one of these:
  //
  //   landed   the bytes at the branch tip are on the default branch now,
  //            either at this path or moved anywhere else in the tree; or the
  //            branch DELETED the path, which strands no content.
  //   differs  the default branch has this path, holding different bytes.
  //            Either the branch's edits never landed, or the default moved on
  //            after they did, and separating those costs a history walk this
  //            scan does not make. So it reports the fact and not a cause.
  //   missing  the default branch has neither this path nor these bytes. The
  //            strong stranded evidence, and the only class that says deleting
  //            the branch would lose something.
  //
  // `differs` went unnamed and uncounted until 2026-08-18, and that is what made
  // the estate row's verdict unreadable: the chip showed `28/80` beside
  // `11 missing`, the two did not add up, and the class holding the other
  // forty-one paths was mentioned nowhere a reader could see. Three counts that
  // sum to the total is the whole fix, and the per-path map underneath is what
  // lets the Files pane show WHICH files rather than only how many.
  //
  // The labels are here rather than in a view because two surfaces render them
  // (the estate row's chip and the branch view's Files pane) and a third could.
  const PATH_STATES = [
    { key: 'landed',  label: 'landed',
      hint: 'these bytes are on the default branch, at this path or moved elsewhere' },
    { key: 'differs', label: 'differs',
      hint: 'the default branch has this path, with different bytes: either unlanded edits or its own drift since' },
    { key: 'missing', label: 'missing',
      hint: 'the default branch has neither this path nor these bytes, so deleting the branch would lose it' },
  ];

  // The per-path verdict, in the CLI's own order of tests. Every count below is
  // read off this map rather than recomputed, so a number in a chip and a mark
  // on a file cannot disagree.
  //   uniquePaths  paths the branch's unique commits touched (from compare
  //                files, or `git log --not <base>` at the CLI)
  //   tip          treeSets() of the branch tip
  //   main         treeSets() of the default branch
  function pathStates(uniquePaths, tip, main) {
    const out = new Map();
    for (const p of new Set(uniquePaths || [])) {
      const tipSha = tip.paths.get(p);
      out.set(p,
        tipSha === undefined ? 'landed'
        : (main.paths.get(p) === tipSha || main.blobs.has(tipSha)) ? 'landed'
        : main.paths.has(p) ? 'differs'
        : 'missing');
    }
    return out;
  }

  // Counts and path lists off a pathStates map. Split out so a caller holding
  // the map (the branch view, which marks files with it) counts through the
  // same code as one that only wants the summary.
  function countStates(states) {
    const missingPaths = [], differsPaths = [];
    let nLanded = 0;
    for (const [p, s] of states) {
      if (s === 'landed') nLanded++;
      else if (s === 'missing') missingPaths.push(p);
      else differsPaths.push(p);
    }
    return { nUnique: states.size, nLanded, nMissing: missingPaths.length,
             nDiffers: differsPaths.length, missingPaths, differsPaths };
  }

  // ── What a compare's file list says about itself ─────────────────────────
  //
  // Every field here is already in the response the caller holds: the crawl
  // compares each open PR head against its default for the ahead/behind pair,
  // and the scan compares for its unique-path set, and both responses carry
  // a status and a line count per file. Reading them is free; not reading them
  // is why a branch row could say 184 files and nothing about what kind.
  //
  // `added` and `changed` are the split a reader actually scans for, so they
  // partition the surviving files: a copy is a new path, and a rename is a file
  // that changed AND moved, counted in `changed` with `renamed` naming how many
  // of them moved. `removed` is neither, since a deleted file is not there to
  // read. All three sum to `n`.
  //
  // GitHub caps a compare's file list at 300 entries and reports no total, so on
  // a sweeping branch every number here is a floor. Say so wherever they render.
  // Which of the three a compare entry belongs to. One function, so a count, a
  // digest and a rendered list cannot disagree about what "new" means.
  function fileClass(f) {
    const st = f?.status || 'modified';
    return (st === 'added' || st === 'copied') ? 'added'
         : st === 'removed' ? 'removed' : 'changed';
  }

  // A file's extension and its top-level folder, the two cheap answers to "what
  // KIND of files". An extensionless file reports '(none)' and a repo-root file
  // reports '(root)', named rather than dropped: a branch that only touches root
  // config is a real shape and an empty bar would hide it. A DOTFILE reports
  // '(none)' rather than its own name, which is why the test is `dot > slash + 1`
  // and not `dot > slash`: `.gitignore` belongs with `README` and `Makefile` as
  // extensionless config, and treating it as an extension of one puts a
  // histogram bar of size one beside the ones that mean something.
  function fileKind(path) {
    const slash = path.lastIndexOf('/');
    const dot = path.lastIndexOf('.');
    return {
      ext: dot > slash + 1 ? path.slice(dot) : '(none)',
      dir: slash < 0 ? '(root)' : path.slice(0, path.indexOf('/')),
    };
  }

  // The shape digest: the extension and folder histograms per class, biggest
  // first, capped. Complete as a count even where the list is capped, since the
  // cap drops the tail of the histogram and not the files it was built from.
  // Small enough to store per branch, which is the whole point: a card can open
  // on it with no call at all, and fill in file NAMES from a fetch afterwards.
  const SHAPE_CAP = 6;
  function topPairs(map) {
    // Count descending, then code point ascending. NOT localeCompare: this
    // digest is stored in the crawl cache, and a tiebreak that moves with the
    // reader's locale makes a cached artifact non-deterministic.
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, SHAPE_CAP);
  }

  function fileStats(files) {
    const s = { n: 0, added: 0, changed: 0, removed: 0, renamed: 0, additions: 0, deletions: 0 };
    const acc = { added: { ext: new Map(), dir: new Map() },
                  changed: { ext: new Map(), dir: new Map() },
                  removed: { ext: new Map(), dir: new Map() } };
    const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    const seen = new Set();
    for (const f of files || []) {
      // Both spellings: a compare entry says `filename`, an assembled brief
      // file says `path`, and this is worth reading from either.
      const path = f?.filename || f?.path;
      if (!path || seen.has(path)) continue;
      seen.add(path);
      s.n++;
      s.additions += f.additions || 0;
      s.deletions += f.deletions || 0;
      const cls = fileClass(f);
      if (cls === 'added') s.added++;
      else if (cls === 'removed') s.removed++;
      else { s.changed++; if (f.status === 'renamed') s.renamed++; }
      const k = fileKind(path);
      bump(acc[cls].ext, k.ext);
      bump(acc[cls].dir, k.dir);
    }
    s.shape = {};
    for (const cls of ['added', 'changed', 'removed'])
      s.shape[cls] = { exts: topPairs(acc[cls].ext), dirs: topPairs(acc[cls].dir) };
    return s;
  }

  // The content signal for one branch: the summary of the map above.
  function landedSignal(uniquePaths, tip, main) {
    return countStates(pathStates(uniquePaths, tip, main));
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
    let unique = [], noBase = false, stats = null;
    let date = branch.date || '', subject = branch.subject || '';
    let aheadBy = null, behindBy = null;   // commits ahead of / behind the default
    let firstDate = '';                    // the branch's OLDEST unique commit
    let sessions = [], sessionsExact = false;
    try {
      const d = await gh.compare(def, branch.name);
      unique = (d.files || []).map(f => f.filename);
      stats = fileStats(d.files);
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
        // Off the SAME response the paths came from, so the breakdown describes
        // exactly the range the row's other counts do, fallback included.
        stats = fileStats(d.files);
      }
    }
    const tipTree = await gh.req('git/trees/' + encodeURIComponent(branch.sha || branch.name) + '?recursive=1');
    const tip = treeSets(tipTree.tree);
    const s = landedSignal(unique, tip, main);
    const group = classify({ daysAgo: date ? daysAgo(date, now) : 999, ...s }, opts);
    return {
      noBase, date, firstDate, subject, aheadBy, behindBy, sessions, sessionsExact,
      ago: (date && gh.ago) ? gh.ago(date) : (branch.ago || ''),
      nUnique: s.nUnique, nLanded: s.nLanded, nMissing: s.nMissing, nDiffers: s.nDiffers,
      missingPaths: s.missingPaths, stats, group,
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
    treeSets, PATH_STATES, pathStates, countStates, landedSignal,
    fileStats, fileClass, fileKind,
    classify, daysAgo, firstCommitDate, compareFields, needsScan,
    defaultTree, scanBranchLive, scanOlder,
    lifespanStart, lifespanTitle, dropDir, dropFileName, dropFileUrl,
  };
})();
