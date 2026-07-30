// github-links.js — the GitHub destinations for one repo, as menu rows.
//
// show-repo is a wrapper over GitHub, not a wall: every view keeps a one-tap
// route to the GitHub presentation of what it is showing. For a REPO that route
// used to be a single "Open on GitHub" row pointing at the repo root, which is
// the one destination the reader could have guessed. The rest of a repo's
// GitHub surface (its pull requests, its issues, its branch list, its Actions
// runs) had no route at all, so this file names them once and both callers read
// the same list: the sidebar Repos row's github button and the Activity view's
// repo chip.
//
// Pure and dependency-free — string building over owner/repo, no fetches, no
// Alpine. window.GithubLinks, to match the other lib globals.
//
// The row list is deliberately short and fixed. Insights, Settings, Wiki, and
// Releases are all one more tap from the repo root and none of them is a place
// this shell's reader goes daily; a menu that lists everything is a menu nobody
// reads. `tracker` is the one repo-declared row (.web-tools.json), since where
// a repo keeps its task board is a repo property, not a GitHub convention.

(function () {
  const BASE = 'https://github.com/';
  // Segment-wise, so the slashes in a branch name survive: GitHub reads
  // /tree/claude/foo, not the /tree/claude%2Ffoo a whole-string encode gives.
  const enc = s => String(s || '').split('/').map(encodeURIComponent).join('/');

  window.GithubLinks = {
    BASE,

    // The repo root, with a ref only when one is worth naming (browsing a
    // branch that is not the default). Same rule the old githubUrlFor used.
    repoUrl(repo, ref, defaultRef) {
      if (!repo) return '';
      const onRef = ref && defaultRef && ref !== defaultRef;
      return BASE + repo + (onRef ? '/tree/' + enc(ref) : '');
    },

    // A path INSIDE the repo: a folder as a tree, a file as a blob (the last
    // segment carrying an extension is the test, the same one the sidebar uses
    // to decide whether a pin opens as a file). An empty ref means HEAD, which
    // is GitHub's own name for "the default branch, whatever it is called", and
    // saves the caller a lookup it may not have.
    //
    // The REF here is a literal one to stamp, not a candidate: unlike `rows`,
    // this takes no defaultRef and makes no judgment about whether the ref is
    // worth naming. That decision belongs to the caller, which is the only side
    // that knows (the sidebar stamps an overlay branch for a repo it is not
    // browsing, where a defaultRef comparison has nothing to compare).
    //
    // The sidebar's project rows are the reason this exists: they name a
    // workspace folder rather than a repo, and the task-board row below builds
    // the same shape, so both read from here rather than each concatenating.
    pathUrl(repo, path, ref = '') {
      if (!repo || !path) return '';
      const clean = String(path).replace(/^\/+|\/+$/g, '');
      if (!clean) return '';
      const kind = /\.[^./]+$/.test(clean.split('/').pop()) ? '/blob/' : '/tree/';
      return BASE + repo + kind + (ref ? enc(ref) : 'HEAD') + '/' + enc(clean);
    },

    // One destination by key, for a caller that wants a link rather than a
    // menu. `opts` is the same shape `rows` takes.
    url(repo, key, opts = {}) {
      const row = this.rows(repo, opts).find(r => r.key === key);
      return row ? row.url : '';
    },

    // The menu. `opts`:
    //   ref, defaultRef  the browsed ref, so the open repo's rows can point at
    //                    the branch rather than the default (a ref is
    //                    meaningless for a repo you are not browsing, so a
    //                    caller with none simply omits it).
    //   tracker          the repo's declared task board (.web-tools.json
    //                    `tracker`: a board file or a tasks folder), which adds
    //                    the one row GitHub itself cannot name.
    rows(repo, opts = {}) {
      if (!repo) return [];
      const { ref = '', defaultRef = '', tracker = '' } = opts;
      const onRef = ref && defaultRef && ref !== defaultRef;
      const at = onRef ? enc(ref) : '';
      const u = p => BASE + repo + p;
      return [
        { key: 'home', label: 'Repository', icon: 'ph-house',
          url: this.repoUrl(repo, ref, defaultRef) },
        { key: 'prs', label: 'Pull requests', icon: 'ph-git-pull-request', url: u('/pulls') },
        { key: 'issues', label: 'Issues', icon: 'ph-record', url: u('/issues') },
        // A declared board reads at the browsed ref like any other file.
        tracker && { key: 'tracker', label: 'Task board', icon: 'ph-list-checks',
                     url: this.pathUrl(repo, tracker, onRef ? ref : '') },
        { key: 'branches', label: 'Branches', icon: 'ph-git-branch', url: u('/branches') },
        { key: 'commits', label: 'Commits', icon: 'ph-git-commit',
          url: u('/commits' + (at ? '/' + at : '')) },
        { key: 'actions', label: 'Actions', icon: 'ph-play-circle', url: u('/actions') },
      ].filter(Boolean).map(r => ({ ...r, external: true }));
    },
  };
})();
