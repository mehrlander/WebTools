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
//     { "kind": "dir-count",  "path": "chron/dump", "staleOver": 5, "label": "dump" },
//     { "kind": "tracker",    "path": "projects/budget-drs/tracker/board.json",
//       "staleAfterDays": 30, "label": "budget-drs" }
//   ]
//
// TWO PHASES, and the split is not tidiness. probe() gathers each check's raw
// FACT (a captured date, a file count, the paths that matched); verdict() turns
// facts into pass/fail against a clock. They separate because a verdict is
// volatile and a fact is not: "13d since 2026-07-18" becomes 14d tomorrow with
// nothing in the repo having changed, while "2026-07-18" changes only when the
// repo does.
//
// That matters the moment results are cached. repo-activity-cache.js hashes a
// material projection of each entry to decide whether a crawl found anything
// worth committing, and its own header spells out the rule: crawl-derived
// timestamps stay out, content stays in. Storing verdicts would rehash every
// entry every day and commit the cache on every crawl forever. Storing facts
// keeps the hash stable, and lets a card render a correct, staler verdict long
// after the crawl that produced the fact.
//
// So: the repo view calls evaluate() (probe then verdict, live). The crawl
// calls probe() and stores the facts. The estate card calls verdict() against
// those stored facts and its own now. One definition of each check, three call
// sites, no second implementation to drift.
//
// probe() is PURE with respect to the network: it takes a reader, so the unit
// tests stub one and the shell supplies the real thing. Same split as
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
// Attaches to window.RepoChecks, loaded via gh.load('kits/repo-checks.js').
(() => {
  const KINDS = ['content-date', 'file-age', 'newer-than', 'absent', 'dir-count', 'tracker'];
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

  // Cap on the paths an `absent` fact carries. The count is the finding; the
  // examples are courtesy, and an unbounded list would put a whole directory
  // into a cache that several repos share.
  const HIT_CAP = 10;

  // ── Phase 1: probe. Gather each check's raw, time-independent fact. ────────
  async function probeOne(c, reader) {
    const out = { check: c || {}, fact: null, error: null };
    if (!c || !KINDS.includes(c.kind)) {
      out.error = `unknown check kind ${JSON.stringify(c && c.kind)}`;
      return out;
    }

    if (c.kind === 'content-date') {
      const text = await reader.text(c.path);
      if (text == null) { out.error = `${c.path} not found`; return out; }
      let m = null;
      try { m = new RegExp(c.pattern).exec(text); }
      catch { out.error = `pattern does not compile: ${c.pattern}`; return out; }
      if (!m || m[1] == null) { out.error = `pattern matched nothing in ${c.path}`; return out; }
      if (!parseDate(m[1])) { out.error = `"${m[1]}" is not a date`; return out; }
      out.fact = { date: m[1] };
      return out;
    }

    if (c.kind === 'file-age') {
      const iso = await reader.lastCommitDate(c.path);
      if (iso == null) { out.error = `no commit found for ${c.path}`; return out; }
      if (!parseDate(iso)) { out.error = `bad commit date for ${c.path}`; return out; }
      out.fact = { date: iso };
      return out;
    }

    if (c.kind === 'newer-than') {
      const ownISO = await reader.lastCommitDate(c.path);
      if (!parseDate(ownISO)) { out.error = `no commit found for ${c.path}`; return out; }
      const srcs = Array.isArray(c.sources) ? c.sources : [];
      if (!srcs.length) { out.error = 'no sources declared'; return out; }
      const isos = (await Promise.all(srcs.map(s => reader.lastCommitDate(s)))).filter(s => parseDate(s));
      if (!isos.length) { out.error = 'no commits found for any source'; return out; }
      const newest = isos.reduce((a, b) => (parseDate(a) > parseDate(b) ? a : b));
      out.fact = { own: ownISO, newest };
      return out;
    }

    if (c.kind === 'absent') {
      const tree = await reader.tree();
      if (tree == null) { out.error = 'tree unavailable'; return out; }
      const hits = (tree || [])
        .map(f => String(f && f.path != null ? f.path : f))
        .filter(p => matches(p, c.path));
      out.fact = { n: hits.length, hits: hits.slice(0, HIT_CAP) };
      return out;
    }

    // The one CONTENT-typed kind: it reads a tracker's board.json (the typed
    // projection, docs/TRACKER.md) rather than a path's shape or age. It fits
    // the boundary above because a projection is a committed file, so the whole
    // check is still one API read and nothing runs.
    //
    // What it makes visible is the thing a board cannot say from a card: how
    // many of a workspace's open tasks are waiting on somebody. That is the
    // authorization half of the detection split this file's header describes,
    // aimed at the moment someone is choosing what to work on.
    if (c.kind === 'tracker') {
      const text = await reader.text(c.path);
      if (text == null) { out.error = `${c.path} not found`; return out; }
      let tasks = null;
      try {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.tasks)) tasks = parsed.tasks;
      } catch { out.error = `${c.path} is not valid JSON`; return out; }
      // A well-formed document of the wrong shape is not a projection, and
      // reading it as an empty tracker would report a healthy board for one
      // that has tasks.
      if (!tasks) { out.error = `${c.path} carries no tasks array`; return out; }
      const open = tasks.filter(t => t && t.status !== 'done');
      const dated = open.map(t => t && t.lastActivity).filter(d => parseDate(d));
      // The fact stays time-independent, per the two-phase rule: counts and the
      // OLDEST last-activity date, never an age. The date changes when the
      // tracker does; an age would change every night and rehash the cache.
      out.fact = {
        open: open.length,
        awaiting: open.filter(t => t && t.awaiting).length,
        untouched: open.filter(t => t && !t.lastActivity).length,
        oldest: dated.length ? dated.reduce((a, b) => (a < b ? a : b)) : null,
      };
      return out;
    }

    // dir-count
    const tree = await reader.tree();
    if (tree == null) { out.error = 'tree unavailable'; return out; }
    out.fact = { count: under(tree, c.path, c.ignore).length };
    return out;
  }

  // Probe every declared check. Never throws: a reader that rejects yields an
  // unevaluable result for that check rather than losing the whole panel, since
  // one broken check should not hide the others.
  async function probe(checks, reader) {
    const list = Array.isArray(checks) ? checks : [];
    if (!list.length) return [];
    return Promise.all(list.map(c =>
      probeOne(c, reader).catch(e => ({
        check: c || {}, fact: null, error: `check errored: ${e && e.message || e}`,
      }))
    ));
  }

  // ── Phase 2: verdict. Facts plus a clock become pass/fail. Pure. ──────────
  const res = (c, ok, detail) => ({
    label: c.label || c.path || c.kind, kind: c.kind, path: c.path || '', ok, detail,
  });

  function verdictOne(p, now) {
    const c = (p && p.check) || {};
    if (!p || p.error) return res(c, null, (p && p.error) || 'not probed');
    const f = p.fact || {};

    if (c.kind === 'content-date' || c.kind === 'file-age') {
      const d = parseDate(f.date);
      if (!d) return res(c, null, `"${f.date}" is not a date`);
      const age = days(d, now), limit = c.staleAfterDays;
      const over = age > limit;
      return res(c, !over, c.kind === 'content-date'
        ? `${age}d since ${f.date}${over ? `, over ${limit}d` : ''}`
        : `last touched ${age}d ago${over ? `, over ${limit}d` : ''}`);
    }

    if (c.kind === 'newer-than') {
      const own = parseDate(f.own), newest = parseDate(f.newest);
      if (!own || !newest) return res(c, null, 'incomplete commit dates');
      // Equal counts as current: one commit that touches a generated file and
      // its source (which is what the build-on-commit hook produces) shares a
      // timestamp, and calling that stale would fire on every correct build.
      const ok = own >= newest;
      return res(c, ok, ok ? 'current with sources'
        : `${days(own, newest)}d behind ${(c.sources || []).join(', ')}`);
    }

    if (c.kind === 'absent') {
      const n = f.n || 0, hits = f.hits || [];
      return res(c, n === 0, n
        ? `${n} present: ${hits.slice(0, 3).join(', ')}${n > 3 ? '…' : ''}`
        : 'none present');
    }

    if (c.kind === 'dir-count') {
      const n = f.count || 0;
      const limit = Number.isFinite(c.staleOver) ? c.staleOver : 0;
      return res(c, n <= limit, `${n} file${n === 1 ? '' : 's'}${n > limit ? `, over ${limit}` : ''}`);
    }

    if (c.kind === 'tracker') {
      const open = f.open || 0, awaiting = f.awaiting || 0, untouched = f.untouched || 0;
      // Two independent triggers, both opt-out. `awaitingOver` defaults to 0,
      // so any task waiting on somebody speaks: that is the signal this kind
      // exists for, and a repo that would rather see it only past a threshold
      // raises the number. `staleAfterDays` is off unless declared, since how
      // long a backlog may sit quiet is a per-workspace judgment.
      const limit = Number.isFinite(c.awaitingOver) ? c.awaitingOver : 0;
      const oldest = parseDate(f.oldest);
      const quiet = oldest ? days(oldest, now) : null;
      const stale = Number.isFinite(c.staleAfterDays) && quiet !== null && quiet > c.staleAfterDays;
      const parts = [`${open} open`];
      if (awaiting) parts.push(`${awaiting} awaiting`);
      if (untouched) parts.push(`${untouched} never logged`);
      if (quiet !== null) parts.push(`oldest quiet ${quiet}d`);
      return res(c, !(awaiting > limit || stale), parts.join(', '));
    }

    return res(c, null, `unknown check kind ${JSON.stringify(c.kind)}`);
  }

  // `now` is a parameter, not a default, at the one call site that matters: the
  // card renders cached facts against the reader's clock, and a test needs to
  // fix it.
  function verdict(probed, now) {
    const at = now || new Date();
    return (probed || []).map(p => verdictOne(p, at));
  }

  // Live path: probe and judge in one go. What the repo view calls.
  async function evaluate(checks, reader) {
    const probed = await probe(checks, reader);
    return verdict(probed, (reader && reader.now && reader.now()) || new Date());
  }

  const failing = results => (results || []).filter(r => r.ok === false);
  const unevaluable = results => (results || []).filter(r => r.ok === null);
  // What the caller renders: everything that is not passing, failures first, so
  // a real staleness outranks a check that could not run.
  const notable = results => [...failing(results), ...unevaluable(results)];

  window.RepoChecks = {
    KINDS, HIT_CAP, probe, verdict, evaluate,
    failing, unevaluable, notable, globToRe, under,
  };
})();
