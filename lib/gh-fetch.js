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
    branchesDated: `query BranchesDated($owner:String!, $name:String!, $per:Int!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            refs(refPrefix:"refs/heads/", first:$per, after:$cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { name target { ... on Commit { oid committedDate messageHeadline } } }
            }
          }
        }`,
    branchesForPath: `query BranchesForPath($owner:String!, $name:String!, $path:String!, $per:Int!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            defaultBranchRef { name target { ... on Commit { file(path:$path) { oid } } } }
            refs(refPrefix:"refs/heads/", first:$per, after:$cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { name target { ... on Commit {
                oid committedDate messageHeadline file(path:$path) { oid } } } }
            }
          }
        }`,
    // branchesDated and branchSessions in ONE round trip. They walk the same
    // refs connection with the same page size, and the crawl always wants both,
    // so asking twice paid for the same pagination twice: measured 2026-08-17
    // off the activity crawl's call log, 79 GraphQL posts costing 75s of request
    // time across 22 repos, three per repo where two of them were this pair.
    // The node budget is the reason this is safe: refs(first:100) with
    // history(first:8) is 800 nodes, well inside GitHub's limit, and the extra
    // fields ride a response the query was already paying for.
    branchesDatedSessions: `query BranchesDatedSessions($owner:String!, $name:String!, $per:Int!, $depth:Int!, $cursor:String) {
          repository(owner:$owner, name:$name) {
            refs(refPrefix:"refs/heads/", first:$per, after:$cursor) {
              pageInfo { hasNextPage endCursor }
              nodes { name target { ... on Commit {
                oid committedDate messageHeadline
                history(first:$depth) { nodes { messageBody } } } } }
            }
          }
        }`,
    branchSessions: `query BranchSessions($owner:String!, $name:String!, $per:Int!, $depth:Int!, $cursor:String) {
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

  // `opts` rides through to fetch for the same reason get()'s does: a listing
  // read to recover a blob sha must not be answered from the browser's cache.
  proto.ls = async function(path = '', opts = {}) {
    const data = await this.req(`contents/${path}?ref=${this.ref}`, opts);
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
  const opOf = q => (String(q).match(/query\s+(\w+)/) || [])[1] || 'unnamed query';

  // Field errors a caller has declared normal for its query, so graphql() can
  // tell "this is how the API answers" from "something went wrong."
  //
  // missingFile is the one that matters. Commit.file(path:) reports a field
  // error for every branch where the path does not resolve, and the answer is
  // correct: the data tree's null says the same thing, which is precisely what
  // branchesForPath asked. Measured against mehrlander/home on 2026-08-06: 472
  // branches, the file on 38 of them, so one page of the scan produced 91 to 94
  // of these and five pages produced 434. Logging that is not a warning about
  // anything; it is a per-branch count printed as if it were a fault, and it
  // buries the rejections the log exists to surface.
  //
  // Matched two ways because GraphQL only SHOULD carry `path` on a field error:
  // the structural test when it is there, the message when it is not.
  const EXPECTED = {
    missingFile: e =>
      (Array.isArray(e && e.path) && e.path[e.path.length - 1] === 'file') ||
      /could not resolve file for path/i.test((e && e.message) || ''),
  };
  window.GH.expectedErrors = EXPECTED;

  // opts.expected is a predicate over one GraphQL error. Errors it accepts are
  // dropped from the console note; anything left is still reported. Omit it and
  // every field error is unexpected, which is the right default for a query
  // whose normal answer carries none.
  proto.graphql = async function(query, variables = {}, opts = {}) {
    try {
      // One retry on a DROPPED CONNECTION, the same allowance GH.req makes for
      // a REST read and for the same reason: on a phone a dropped request is
      // weather, and this POST is a read whatever the verb says, so repeating it
      // cannot write anything twice. An HTTP error is not retried here: that is
      // GitHub answering, and the answer will not change in 600ms.
      let res;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers: { ...this.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
          });
          break;
        } catch (e) {
          if (attempt === 1) { await new Promise(r => setTimeout(r, 600)); continue; }
          const err = new Error(`Network error on ${opOf(query)}: ${e?.message || e}`);
          err.status = 0;
          err.cause = e;
          throw err;
        }
      }
      if (!res.ok) {
        const err = new Error(`GitHub GraphQL Error ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const json = await res.json();
      // GraphQL's partial-response model: errors ride BESIDE data, and for
      // Commit.file(path:) they routinely do. Measured live 2026-08-02 (the
      // first FAB capture): BranchesForPath came back with one "Could not
      // resolve file for path" error PER BRANCH lacking the file, alongside
      // a data tree whose nulls said the same thing, and treating any errors
      // as fatal threw the whole answer away. Data present means the query
      // ran and the nulls already carry the misses, so hand it back.
      //
      // Only the errors the caller did NOT expect are worth a line. A console
      // that warns about normal behaviour trains its reader to skip it, and
      // the rejections below are the thing this log exists to make visible.
      if (json.errors && json.data != null) {
        const unexpected = opts.expected ? json.errors.filter(e => !opts.expected(e)) : json.errors;
        if (unexpected.length) {
          try { console.warn(`gh-fetch: GraphQL ${opOf(query)} returned partial data (${unexpected.length} unexpected field error(s); first: ${unexpected[0]?.message})`); } catch {}
        }
        return json.data;
      }
      if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
      return json.data;
    } catch (e) {
      // Every caller degrades on purpose (a rejected query costs a feature,
      // not a page), which had a side effect: the rejection vanished, and
      // whether these queries work against the real API stayed unknowable
      // from the outside. Named here once, so the console buffer, and with
      // it a FAB capture, records every rejection with the operation name
      // and the message GitHub sent. The rethrow keeps the degrade paths
      // exactly as they were.
      try { console.warn(`gh-fetch: GraphQL ${opOf(query)} rejected: ${e?.message || e}`); } catch {}
      throw e;
    }
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

  // Both halves of what the activity crawl asks of a repo's branches: the dated
  // list AND the authoring session per branch, from one walk of one connection.
  //
  // The two callers that want only one half keep their own method: the fab reads
  // branchesDated for a list it renders without sessions, and branchSessions
  // stands alone because a caller that swallows its failure must be able to lose
  // it without losing the branch list. This is for the caller that wants both,
  // which is every crawl of every estate repo.
  //
  // Returns { branches, sessions }: branches exactly as branchesDated shapes
  // them, sessions keyed by branch name, so a caller swaps two awaits for one
  // and changes nothing downstream.
  proto.branchesDatedSessions = async function(per = 100, max = 500, depth = 8) {
    const [owner, name] = (this.repo || '').split('/');
    const out = [];
    const sessions = {};
    let cursor = null;
    while (out.length < max) {
      const data = await this.graphql(
        QUERIES.branchesDatedSessions,
        { owner, name, per: Math.min(per, max - out.length), depth, cursor }
      );
      const refs = (data && data.repository && data.repository.refs) || {};
      for (const n of (refs.nodes || [])) {
        out.push(n);
        for (const c of ((n.target && n.target.history && n.target.history.nodes) || [])) {
          const s = sessionIn(c && c.messageBody);
          if (s) { sessions[n.name] = s; break; }
        }
      }
      if (!refs.pageInfo || !refs.pageInfo.hasNextPage) break;
      cursor = refs.pageInfo.endCursor;
    }
    const branches = out
      .map(n => {
        const t = n.target || {};
        return { name: n.name, date: t.committedDate || '', ago: t.committedDate ? this.ago(t.committedDate) : '',
                 sha: t.oid || '', subject: t.messageHeadline || '' };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { branches, sessions };
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
        { owner, name, path, per: Math.min(per, max - out.length), cursor },
        // A branch without the path is the answer, not a fault: see EXPECTED.
        { expected: EXPECTED.missingFile }
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
      // The body itself, for the same reason and at the same price: the list
      // endpoint already returned it. The fab's render tab shows the guide PR
      // body as the branch's story, so it needs the markdown, not just the one
      // footer line lifted out of it above.
      body: p.body || '',
    }));
  };

  // The PR each branch LAST had, in any state, as a lean row per head.
  //
  // Why this exists beside pulls('open'): a branch's PR merges and closes, and
  // the branch stays. Reading open PRs alone therefore answers "does this
  // branch have an open PR", which is not the question a branch list asks, and
  // every merged branch came back "no PR" (measured 2026-08-15 across the
  // Activity view's Recent scope, where nearly every row was a merged branch
  // whose PR the open read could not see).
  //
  // One call, not one per branch: `state=all` sorted by recent activity, capped
  // and deduped here to the newest PR per head. A branch can have several PRs
  // over its life (a merge ends a PR, not the branch), so the highest number
  // wins and `count` says how many were in reach.
  //
  // The title rides, the body does not. The open read carries bodies because
  // the guide pane renders one; carrying them for a hundred closed PRs would
  // multiply the activity cache by the size of its own history for a field
  // nothing reads. A title is a line, it costs a fraction of one body, and
  // without it a merged PR is a bare number: the finder cannot label its row
  // and the branch pill has nothing to say on hover.
  //
  // `reach` is the honesty half of the answer: the oldest updated_at the page
  // reached, and '' when the list was not capped, meaning every PR the repo has
  // is in `rows`. Without it, "no PR" past the cap is a guess wearing a fact's
  // clothes.
  proto.branchPulls = async function(per = 100) {
    const data = await this.req(`pulls?state=all&sort=updated&direction=desc&per_page=${per}`);
    const list = data || [];
    const byHead = new Map();
    for (const p of list) {
      const head = p.head?.ref || '';
      if (!head) continue;
      const prev = byHead.get(head);
      const row = {
        head,
        number: p.number,
        title: p.title || '',
        // 'open' | 'merged' | 'closed'. GitHub reports a merged PR as closed
        // with a merged_at, and the difference is the whole point here: a
        // merged branch is finished work, a closed one is abandoned.
        state: p.merged_at ? 'merged' : (p.state === 'open' ? 'open' : 'closed'),
        draft: !!p.draft,
        updatedAt: p.updated_at || '',
        count: (prev?.count || 0) + 1,
      };
      // Newest by number wins the display fields; the count keeps every PR the
      // head has had, whichever order they arrived in.
      byHead.set(head, (prev && prev.number > row.number) ? { ...prev, count: row.count } : row);
    }
    const reach = list.length >= per ? (list[list.length - 1]?.updated_at || '') : '';
    return { rows: [...byHead.values()], reach };
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
