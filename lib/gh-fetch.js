(() => {
  if (!window.GH) {
    throw new Error('gh-fetch.js requires window.GH (load gh-api.js first)');
  }

  const proto = window.GH.prototype;

  // The Claude Code session that authored a commit or PR, from the
  // `Claude-Session:` trailer the harness writes. That trailer is the only
  // session identity git carries: commits are SSH-signed, but the key is
  // Anthropic's and constant (measured across 41 distinct sessions in one repo,
  // one signing key), so the signature identifies the author, not the session.
  // Author and committer are a fixed `Claude <noreply@anthropic.com>`.
  const SESSION_RE = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/;
  const sessionIn = text => (String(text || '').match(SESSION_RE) || [''])[0];
  window.GH.sessionIn = sessionIn;

  // The GraphQL query documents, named and lifted out of the methods that send
  // them. The sandbox cannot POST GraphQL (its proxy serves a pinned set of
  // operations), so these ship unverified against live data and each degrades
  // rather than throws. But the question they raise first is a typecheck, not a
  // data question, and a typecheck needs no network: GitHub publishes its schema
  // as a static document, so `npm test` validates every document below against a
  // pruned copy of it (tools/test/graphql-schema.test.mjs). Naming them here is
  // what lets a checker read them without executing a request. Live behavior
  // stays the live-confirm task's business.
  const QUERIES = {
    branchesDated: `query($owner:String!, $name:String!, $per:Int!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            refs(refPrefix:"refs/heads/", first:$per, after:$cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { name target { ... on Commit { oid committedDate messageHeadline } } }
            }
          }
        }`,
    branchesForPath: `query($owner:String!, $name:String!, $path:String!, $per:Int!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            defaultBranchRef { name target { ... on Commit { file(path:$path) { oid } } } }
            refs(refPrefix:"refs/heads/", first:$per, after:$cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { name target { ... on Commit {
                oid committedDate messageHeadline file(path:$path) { oid } } } }
            }
          }
        }`,
    branchSessions: `query($owner:String!, $name:String!, $per:Int!, $depth:Int!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            refs(refPrefix:"refs/heads/", first:$per, after:$cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { name target { ... on Commit {
                history(first:$depth) { nodes { messageBody } } } } }
            }
          }
        }`,
  };
  window.GH.queries = QUERIES;

  proto.repos = async function(user = 'anthropics', opts = {}) {
    const endpoint = this.headers.Authorization ? '/user/repos' : `/users/${user}/repos`;
    return this.req(`${endpoint}?sort=updated&per_page=100`, opts);
  };

  proto.ls = async function(path = '') {
    const data = await this.req(`contents/${path}?ref=${this.ref}`);
    if (!Array.isArray(data)) throw new Error('Path is not a directory');
    return data.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'dir' ? -1 : 1;
    });
  };

  proto.branches = async function(per = 100) {
    return this.req(`branches?per_page=${per}`);
  };

  // GraphQL primitive: POST to the v4 endpoint reusing the REST token in
  // `this.headers`. The first GraphQL path in the codebase; REST `req()` can't
  // reach it (different host + verb), so this stands alongside rather than under it.
  proto.graphql = async function(query, variables = {}) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
      const err = new Error(`GitHub GraphQL Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
  };

  // Branches with tip-commit dates, sorted newest-first. REST's branches
  // endpoint carries no commit date, so this goes through GraphQL. Sorting is
  // client-side: RefOrderField has only ALPHABETICAL and TAG_COMMIT_DATE, and
  // the latter only orders refs/tags/ — there's no server-side commit-date sort
  // for refs/heads/. committedDate is ISO-8601, so a string sort is chronological.
  // Each row also carries the tip sha and subject line (additive; the same one
  // call already fetches the commit), which the branches view keys on.
  // Server pages are alphabetical, so ONE page of a many-branch repo is the
  // alphabetical first `per`, not the newest — hence pagination up to `max`
  // refs (per page-size steps), so "sorted newest-first" stays honest.
  proto.branchesDated = async function(per = 100, max = 500) {
    const [owner, name] = (this.repo || '').split('/');
    const out = [];
    let cursor = null;
    while (out.length < max) {
      const data = await this.graphql(
        QUERIES.branchesDated,
        { owner, name, per: Math.min(per, max - out.length), cursor }
      );
      const refs = (data && data.repository && data.repository.refs) || {};
      out.push(...(refs.nodes || []));
      if (!refs.pageInfo || !refs.pageInfo.hasNextPage) break;
      cursor = refs.pageInfo.endCursor;
    }
    return out
      .map(n => {
        const t = n.target || {};
        return { name: n.name, date: t.committedDate || '', ago: t.committedDate ? this.ago(t.committedDate) : '',
                 sha: t.oid || '', subject: t.messageHeadline || '' };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  };

  // branchesDated plus, per branch tip, the blob id of ONE path — and the
  // default branch's copy to compare against — so a caller can mark where a
  // file differs from the default branch without a per-branch compare call.
  // Commit.file(path:) resolves the tree entry at that commit; a null there
  // means the path doesn't exist on that branch. Same pagination honesty as
  // branchesDated. Returns { defaultBranch, defaultOid, branches }, branches
  // sorted newest-first, each { name, date, ago, sha, subject, fileOid }.
  proto.branchesForPath = async function(path, per = 100, max = 500) {
    const [owner, name] = (this.repo || '').split('/');
    const out = [];
    let defaultBranch = '', defaultOid = null, cursor = null;
    while (out.length < max) {
      const data = await this.graphql(
        QUERIES.branchesForPath,
        { owner, name, path, per: Math.min(per, max - out.length), cursor }
      );
      const repo = (data && data.repository) || {};
      const dbr = repo.defaultBranchRef;
      if (dbr) {
        defaultBranch = dbr.name || '';
        defaultOid = (dbr.target && dbr.target.file && dbr.target.file.oid) || null;
      }
      const refs = repo.refs || {};
      out.push(...(refs.nodes || []));
      if (!refs.pageInfo || !refs.pageInfo.hasNextPage) break;
      cursor = refs.pageInfo.endCursor;
    }
    const branches = out
      .map(n => {
        const t = n.target || {};
        return { name: n.name, date: t.committedDate || '', ago: t.committedDate ? this.ago(t.committedDate) : '',
                 sha: t.oid || '', subject: t.messageHeadline || '',
                 fileOid: (t.file && t.file.oid) || null };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { defaultBranch, defaultOid, branches };
  };

  proto.tags = async function(per = 100) {
    return this.req(`tags?per_page=${per}`);
  };

  proto.commit = async function(sha) {
    return this.req(`commits/${sha}`);
  };

  proto.compare = async function(base, head) {
    return this.req(`compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  };

  // Recent commits on a ref (the repo's default branch when `sha` is omitted),
  // normalized to the shape the activity cache stores. history() is the
  // path-scoped sibling; this is the whole-branch stream the activity crawl and
  // the cross-repo recent strip read.
  proto.commits = async function(limit = 20, sha) {
    const q = sha
      ? `commits?sha=${encodeURIComponent(sha)}&per_page=${limit}`
      : `commits?per_page=${limit}`;
    const data = await this.req(q);
    return (data || []).map(c => ({
      sha: c.sha,
      msg: (c.commit?.message || '').split('\n')[0].slice(0, 100),
      date: c.commit?.committer?.date || c.commit?.author?.date || '',
      author: c.commit?.author?.name || c.author?.login || '',
    }));
  };

  // Open (or other-state) pull requests, trimmed to what the activity cache and
  // the cross-repo view render. A repo with PRs disabled 404s at the caller.
  proto.pulls = async function(state = 'open', per = 30) {
    const data = await this.req(`pulls?state=${state}&per_page=${per}`);
    return (data || []).map(p => ({
      number: p.number,
      title: p.title || '',
      head: p.head?.ref || '',
      draft: !!p.draft,
      updatedAt: p.updated_at || '',
      // The Claude Code session that authored the branch, lifted from the guide
      // PR body's session-link footer (the list endpoint already carries body,
      // so this costs no extra call). Empty for a PR opened by hand or without
      // the footer. Powers the Open view's per-branch session link.
      session: sessionIn(p.body),
    }));
  };

  // The authoring session per branch, as { [branchName]: sessionUrl }.
  //
  // This exists because the PR body is the wrong source. A PR body only carries
  // the footer while the PR is OPEN, and open PRs are a rounding error against a
  // branch estate: 2 of 404 branches in mehrlander/home, 3 of 291 in web-tools.
  // The commit trailer is attached to the work instead, so it survives merge and
  // close. Measured over branches active in the last 30 days it resolves 121 of
  // 126 (home) and 107 of 110 (web-tools); the misses are honest, since a
  // human-authored commit has no session at all.
  //
  // Why a history walk rather than the tip alone: a quarter of branch tips are
  // merge commits ("Merge main into...", "Merge pull request #N"), which GitHub
  // generates and which carry no trailer. Tip-only resolves 88 of 124 branches;
  // walking a few commits back resolves 119.
  //
  // The honest limit: `history` follows all parents, so on a branch that merged
  // the default branch in, the walk can surface a session belonging to the
  // default branch rather than to this branch. Measured against the exact
  // answer (the branch's own commits, which needs a merge-base this view does
  // not have), the walk agreed 71 times, disagreed once, and came up empty 8
  // times. Good enough to link an icon; `.claude/skills/in-flight/in-flight.py`
  // is the precise instrument when the attribution has to be right.
  //
  // Deliberately a separate call rather than extra fields on branchesDated:
  // callers treat this as optional and swallow its failure, so a GraphQL shape
  // that some server rejects costs the session links and nothing else. Folding
  // it into branchesDated would take the whole branch list down with it.
  proto.branchSessions = async function(per = 100, max = 500, depth = 8) {
    const [owner, name] = (this.repo || '').split('/');
    const out = {};
    let cursor = null, seen = 0;
    while (seen < max) {
      const data = await this.graphql(
        QUERIES.branchSessions,
        { owner, name, per: Math.min(per, max - seen), depth, cursor }
      );
      const refs = (data && data.repository && data.repository.refs) || {};
      for (const n of (refs.nodes || [])) {
        seen++;
        const nodes = (n.target && n.target.history && n.target.history.nodes) || [];
        for (const c of nodes) {
          const s = sessionIn(c && c.messageBody);
          if (s) { out[n.name] = s; break; }
        }
      }
      if (!refs.pageInfo || !refs.pageInfo.hasNextPage) break;
      cursor = refs.pageInfo.endCursor;
    }
    return out;
  };

  proto.history = async function(path, limit = 20) {
    const data = await this.req(`commits?path=${encodeURIComponent(path)}&sha=${this.ref}&per_page=${limit}`);
    return data.map(c => ({
      sha: c.sha,
      msg: c.commit.message.split('\n')[0].slice(0, 80),
      date: c.commit.committer.date,
      ago: this.ago(c.commit.committer.date),
      author: c.commit.author.name
    }));
  };

  proto.ago = function(dateStr) {
    const s = (Date.now() - new Date(dateStr)) / 1000;
    const intervals = { y: 31536000, mo: 2592000, d: 86400, h: 3600, m: 60 };
    for (const [unit, v] of Object.entries(intervals)) {
      if (s >= v) return `${Math.floor(s/v)}${unit} ago`;
    }
    return 'just now';
  };

  proto.parseUrl = function(url) {
    const m = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/(?:tree|blob)\/([^\/]+))?(?:\/(.+))?/);
    if (!m) return null;
    return {
      repo: `${m[1]}/${m[2]}`,
      ref: m[3] || 'main',
      path: (m[4] || '').replace(/\/$/, '')
    };
  };
})();
