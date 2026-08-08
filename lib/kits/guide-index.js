// kits/guide-index.js — fold guide pages into one cross-repo list, each row
// carrying the branch and session that produced it where that is knowable.
//
// A guide (pages/guides/*.html) is a page written to be read while a decision
// is open: it argues a case rather than doing work, and it is the account that
// a branch and a session cannot give. This builds the index the estate's
// Guides pane renders.
//
// WHY THE LINK IS DERIVED AND NOT DECLARED. Nothing in a guide names its
// branch or its session, and nothing should: the estate's rule is not to commit
// what a live read already answers, and both facts are already recorded twice
// over. A commit carries its session in a `Claude-Session:` trailer, which
// BranchSurvey.sessionsIn already parses, and the activity cache's open-PR rows
// carry `head` (the branch) and `sessions` (the URLs) on every entry. So the
// link costs no new field, no registry, and no authoring step.
//
// WHY OPEN PRs AND NOT BRANCHES. The obvious source for "which branch holds
// this guide" is the branch list, and it does not survive measurement: branches
// are not deleted here, so the estate carries 228 branches grouped `active`
// against 12 open PRs (measured 2026-08-06). Reading a directory per branch is
// 228 requests for an answer 12 can give, and a guide in flight lives on a PR
// branch by construction, since that is what opens for a working branch. The
// bound is the PR count, and the caller does the reads.
//
// Pure. No fetch, no DOM, no Alpine: the caller hands in what it read and gets
// rows back, in the split lib/kits/repo-activity-cache.js uses (pure fold here,
// crawl in the shell), which is what makes the fold unit-testable.
//
//   guideIndex.isGuidePath(p)              -> bool
//   guideIndex.titleOf(path)               -> display title from the filename
//   guideIndex.thumbPath(path)             -> the committed screenshot's path
//   guideIndex.build({ main, onPrs })      -> rows[]
//   guideIndex.renderUrl(row, opts?)       -> the 🥏 toss address for the row
//
// A row:
//   { repo, path, name, title, onMain, refs[], sessions[], prs[] }
//     refs      every ref the guide was found on, default branch first
//     prs       [{ number, head, title, draft, sessions[] }]
//     sessions  deduped session URLs across those PRs, newest-PR first
(() => {
  const GUIDE_DIR = 'pages/guides/';
  const TOSS = 'https://mehrlander.github.io/web-tools/pages/toss-render.html';

  const str = (v) => (v == null ? '' : String(v));

  // A guide is an .html file directly under pages/guides/. The folder's own
  // README is prose about the shelf, not a guide, and a nested directory is not
  // reached: one flat shelf keeps "what is a guide" answerable by path alone.
  function isGuidePath(p) {
    const s = str(p);
    if (!s.startsWith(GUIDE_DIR)) return false;
    const rest = s.slice(GUIDE_DIR.length);
    return !!rest && !rest.includes('/') && rest.toLowerCase().endsWith('.html');
  }

  // "pages/guides/code-layers.html" -> "Code layers". The real <title> lives in
  // the file and costs a fetch per guide to read; the filename is chosen by the
  // author and is nearly always the same words, so the index shows it and the
  // page itself corrects the record when opened.
  function titleOf(path) {
    const base = str(path).split('/').pop().replace(/\.html$/i, '');
    if (!base) return '';
    const words = base.replace(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  // The committed screenshot for a page, by the convention tools/build/
  // pages-shots.mjs writes: pages/thumbs/ mirrors the tree under pages/, with
  // the extension swapped. Derived rather than looked up, so a guide on a
  // branch resolves its own branch's thumb: pages.json is generated from the
  // default branch and does not know a page that has not landed, which is
  // exactly the guide most worth showing.
  function thumbPath(path) {
    const s = str(path);
    if (!s.startsWith('pages/')) return '';
    return 'pages/thumbs/' + s.slice('pages/'.length).replace(/\.html?$/i, '.png');
  }

  const key = (repo, path) => `${str(repo)}:${str(path)}`;

  function prEntry(pr) {
    return {
      number: pr?.number ?? null,
      head: str(pr?.head),
      title: str(pr?.title),
      draft: !!pr?.draft,
      // A PR row carries `sessions` (all of them) and, on older records, a bare
      // `session`. Read both so a pre-2026-08 row is not silently sessionless.
      sessions: [...new Set([...(pr?.sessions || []), pr?.session].map(str).filter(Boolean))],
    };
  }

  /**
   * main   [{ repo, path, ref? }]        guides on each repo's default branch
   * onPrs  [{ repo, path, pr }]          guides found on an open PR's head
   *
   * A guide on both is one row: it exists on main AND a PR is touching it.
   * That is the normal state of a guide being revised, and splitting it into
   * two rows would report one document as two.
   */
  function build({ main = [], onPrs = [] } = {}) {
    const rows = new Map();

    const touch = (repo, path) => {
      const k = key(repo, path);
      if (!rows.has(k)) {
        rows.set(k, {
          repo: str(repo), path: str(path),
          name: str(path).split('/').pop(),
          title: titleOf(path),
          onMain: false, refs: [], sessions: [], prs: [],
        });
      }
      return rows.get(k);
    };

    for (const e of main) {
      if (!isGuidePath(e?.path)) continue;
      const r = touch(e.repo, e.path);
      r.onMain = true;
      const ref = str(e.ref);
      if (ref && !r.refs.includes(ref)) r.refs.unshift(ref);
    }

    for (const e of onPrs) {
      if (!isGuidePath(e?.path)) continue;
      const r = touch(e.repo, e.path);
      const pr = prEntry(e.pr);
      if (pr.number != null && !r.prs.some(p => p.number === pr.number)) r.prs.push(pr);
      if (pr.head && !r.refs.includes(pr.head)) r.refs.push(pr.head);
    }

    for (const r of rows.values()) {
      // Newest PR first, so the session list leads with the work in flight.
      r.prs.sort((a, b) => (b.number || 0) - (a.number || 0));
      r.sessions = [...new Set(r.prs.flatMap(p => p.sessions))];
    }

    // In flight first (a guide with an open PR is the one awaiting a decision),
    // then by repo and path so the order is stable across refreshes.
    return [...rows.values()].sort((a, b) =>
      (b.prs.length ? 1 : 0) - (a.prs.length ? 1 : 0) ||
      a.repo.localeCompare(b.repo) ||
      a.path.localeCompare(b.path));
  }

  // The address that RENDERS the guide, which is the point of the row: a guide
  // on a branch has no hosted URL, so it goes through the toss renderer at the
  // ref it was found on. Prefers the PR head over the default branch, since a
  // guide with an open PR is being read for what the PR proposes.
  function renderUrl(row, { ref } = {}) {
    if (!row?.repo || !row?.path) return '';
    const at = str(ref) || str(row.refs?.[row.prs?.length ? row.refs.length - 1 : 0]);
    const addr = at ? `${row.repo}@${at}:${row.path}` : `${row.repo}:${row.path}`;
    return `${TOSS}#gh=${addr}`;
  }

  window.guideIndex = { isGuidePath, titleOf, thumbPath, build, renderUrl, GUIDE_DIR };
})();
