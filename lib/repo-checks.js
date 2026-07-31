// Declared staleness checks for a repo, evaluated on sight.
//
// A repo names checks in its own .web-tools.json; show-repo evaluates them when
// someone looks at the repo and reports only the ones that are failing. There
// is no script in the repo, no cache to keep fresh, no crawl to schedule, and
// no session hook. The check has no persistent state at all: it is computed on
// look and thrown away.
//
// That is the whole point. A staleness fact aimed at a session arrives at the
// moment it is least actionable, which is why home's sweep note was removed
// (PR #330): the repo's own CLAUDE.md instructed a session to relay it and move
// on, so it was addressed to a party told not to act. Aimed at a page, the same
// fact arrives when someone is deciding what to work on.
//
// THE BOUNDARY, and it is what keeps this from rotting: every check must be
// answerable from the GitHub API alone (file contents, a tree listing, a
// path's last commit date). Nothing here runs code. Checks that need execution
// stay in `npm test` and home's tools/verify-artifacts.sh; a check list that
// starts running things becomes a worse CI.
//
//   "checks": [
//     { "kind": "content-date", "path": "chron/sweeps.md",
//       "pattern": "## Run (\\d{4}-\\d{2}-\\d{2})",
//       "staleAfterDays": 30, "label": "sweep" },
//     { "kind": "file-age",   "path": "full-picture.md", "staleAfterDays": 60, "label": "picture" },
//     { "kind": "newer-than", "path": "dist/web-tools.js", "sources": ["lib/"], "label": "prebuild" },
//     { "kind": "absent",     "path": "**/BRANCH-GUIDE.md", "label": "stray guide" },
//     { "kind": "dir-count",  "path": "chron/dump", "staleOver": 5, "label": "dump" }
//   ]
//
// evaluate() is PURE with respect to the network: it takes a reader, so the
// unit tests stub one and the shell supplies the real thing. Same split as
// repo-config-cache.js and repo-activity-cache.js, for the same reason.
//
//   reader.text(path)            -> Promise<string|null>   null when absent
//   reader.tree()                -> Promise<[{path}]>      whole repo, recursive
//   reader.lastCommitDate(path)  -> Promise<string|null>   ISO, null when unknown
//   reader.now()                 -> Date                   optional; defaults to real now
//
// A result's `ok` is deliberately three-valued:
//   true   the check passes, render nothing
//   false  the check fails, render it
//   null   the check could not be evaluated
// null is not "fine". A check whose file vanished or whose pattern stopped
// matching has usually been silently invalidated by a rename, and silence there
// is the exact failure this whole mechanism exists to prevent. The caller
// renders it, distinctly from a plain failure.
//
// Attaches to window.RepoChecks, loaded via gh.load('repo-checks.js').
(() => {
  const KINDS = ['content-date', 'file-age', 'newer-than', 'absent', 'dir-count'];
  const DAY = 86400000;

  // Tiny glob → RegExp, enough for the path patterns a check declares:
  // `**` spans separators, `*` does not, everything else is literal. Not a
  // general globber; a check pattern that needs more than this is a sign the
  // check wants a different kind.
  function globToRe(glob) {
    let out = '';
    const s = String(glob || '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '*') {
        if (s[i + 1] === '*') { out += '.*'; i++; if (s[i + 1] === '/') i++; }
        else out += '[^/]*';
      } else if ('\\^$.|?+()[]{}'.includes(c)) out += '\\' + c;
      else out += c;
    }
    return new RegExp('^' + out + '$');
  }

  function matches(path, glob) { return globToRe(glob).test(String(path || '')); }

  // Entries directly or transitively under a directory prefix. `.gitkeep` is
  // excluded by default because a folder that must exist while empty is exactly
  // the shape dir-count is usually pointed at (chron/dump, code/dump), and
  // counting its placeholder would make "empty" read as one.
  function under(tree, dir, ignore) {
    const pre = String(dir || '').replace(/\/+$/, '') + '/';
    const skip = ignore || ['.gitkeep'];
    return (tree || [])
      .map(f => String(f && f.path != null ? f.path : f))
      .filter(p => p.startsWith(pre))
      .filter(p => !skip.some(g => matches(p.slice(pre.length), g) || matches(p, g)));
  }

  const days = (from, to) => Math.floor((to.getTime() - from.getTime()) / DAY);

  function parseDate(s) {
    const d = new Date(String(s || '').trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const res = (c, ok, detail) => ({
    label: c.label || c.path || c.kind, kind: c.kind, path: c.path || '', ok, detail,
  });

  async function one(c, reader, now) {
    if (!c || !KINDS.includes(c.kind)) {
      return res(c || {}, null, `unknown check kind ${JSON.stringify(c && c.kind)}`);
    }

    if (c.kind === 'content-date') {
      const text = await reader.text(c.path);
      if (text == null) return res(c, null, `${c.path} not found`);
      let m = null;
      try { m = new RegExp(c.pattern).exec(text); }
      catch { return res(c, null, `pattern does not compile: ${c.pattern}`); }
      if (!m || m[1] == null) return res(c, null, `pattern matched nothing in ${c.path}`);
      const d = parseDate(m[1]);
      if (!d) return res(c, null, `"${m[1]}" is not a date`);
      const age = days(d, now);
      const limit = c.staleAfterDays;
      return res(c, age <= limit, `${age}d since ${m[1]}${age > limit ? `, over ${limit}d` : ''}`);
    }

    if (c.kind === 'file-age') {
      const iso = await reader.lastCommitDate(c.path);
      if (iso == null) return res(c, null, `no commit found for ${c.path}`);
      const d = parseDate(iso);
      if (!d) return res(c, null, `bad commit date for ${c.path}`);
      const age = days(d, now), limit = c.staleAfterDays;
      return res(c, age <= limit, `last touched ${age}d ago${age > limit ? `, over ${limit}d` : ''}`);
    }

    if (c.kind === 'newer-than') {
      const own = parseDate(await reader.lastCommitDate(c.path));
      if (!own) return res(c, null, `no commit found for ${c.path}`);
      const srcs = Array.isArray(c.sources) ? c.sources : [];
      if (!srcs.length) return res(c, null, 'no sources declared');
      const dates = (await Promise.all(srcs.map(s => reader.lastCommitDate(s))))
        .map(parseDate).filter(Boolean);
      if (!dates.length) return res(c, null, 'no commits found for any source');
      const newest = dates.reduce((a, b) => (a > b ? a : b));
      // Equal counts as current: one commit that touches a generated file and
      // its source (which is what the build-on-commit hook produces) shares a
      // timestamp, and calling that stale would fire on every correct build.
      return res(c, own >= newest, own >= newest
        ? 'current with sources'
        : `${days(own, newest)}d behind ${srcs.join(', ')}`);
    }

    if (c.kind === 'absent') {
      const tree = await reader.tree();
      if (tree == null) return res(c, null, 'tree unavailable');
      const hits = (tree || [])
        .map(f => String(f && f.path != null ? f.path : f))
        .filter(p => matches(p, c.path));
      return res(c, hits.length === 0, hits.length
        ? `${hits.length} present: ${hits.slice(0, 3).join(', ')}${hits.length > 3 ? '…' : ''}`
        : 'none present');
    }

    // dir-count
    const tree = await reader.tree();
    if (tree == null) return res(c, null, 'tree unavailable');
    const n = under(tree, c.path, c.ignore).length;
    const limit = Number.isFinite(c.staleOver) ? c.staleOver : 0;
    return res(c, n <= limit, `${n} file${n === 1 ? '' : 's'}${n > limit ? `, over ${limit}` : ''}`);
  }

  // Evaluate every declared check. Never throws: a reader that rejects yields
  // an unevaluable result for that check rather than losing the whole panel,
  // since one broken check should not hide the others.
  async function evaluate(checks, reader) {
    const list = Array.isArray(checks) ? checks : [];
    if (!list.length) return [];
    const now = (reader && reader.now && reader.now()) || new Date();
    return Promise.all(list.map(c =>
      one(c, reader, now).catch(e => res(c || {}, null, `check errored: ${e && e.message || e}`))
    ));
  }

  const failing = results => (results || []).filter(r => r.ok === false);
  const unevaluable = results => (results || []).filter(r => r.ok === null);
  // What the caller renders: everything that is not passing, failures first, so
  // a real staleness outranks a check that could not run.
  const notable = results => [...failing(results), ...unevaluable(results)];

  window.RepoChecks = { KINDS, evaluate, failing, unevaluable, notable, globToRe, under };
})();
