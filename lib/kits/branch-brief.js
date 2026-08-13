// kits/branch-brief.js — a branch as a subject, not a row.
//
// Every branch surface in this repo is a LIST: the estate's Open view, the
// per-repo Branches view, the FAB's render tab. Each one ends in a link out to
// github.com, because there was nowhere of ours to go. This kit is the model
// behind a page for ONE branch, so those rows finally have a destination.
//
// Two layers, and the split is the whole design:
//
//   DERIVED   assembled from the API on every load. Identity, state, lifespan,
//             ahead/behind, the authoring sessions, the PR, the changed files.
//             Nothing here is authored, so nothing here can go stale: the page
//             is current by construction and needs no sync step. That is what
//             a hand-maintained markdown PR body cannot offer, and why the
//             question "is this up to date?" simply does not arise here.
//
//   AUTHORED  an optional envelope carrying judgment the API cannot know: why
//             the branch exists, what to scrutinize, what is still open, what
//             was deliberately left out. Same delivery split as the rest of the
//             envelope family (docs/envelopes/): `?src=` a spec, or `#gz=` a
//             gzipped payload, discriminated bare-vs-envelope the way
//             data-payload.js does it rather than by asking the caller.
//
// The layers are independent on purpose. A branch with no envelope still
// renders completely; the envelope only ever adds. That is what lets the page
// ship before any authoring convention exists for it.
//
// Reading is two entry points, and which one a caller wants is a question
// about the surface rather than about the data. `fetchBrief` always asks
// GitHub. `readBrief` puts a sixty-second read-through cache in front of it,
// for a surface that opens the same branch repeatedly inside one pass: the
// swiper steps back and forth over a list and warms its neighbours, and
// re-reading a branch the reader crossed ten seconds ago is the cost that
// makes stepping feel like waiting. See the note above the cache for why a TTL
// is the only form of it that keeps this page's freshness claim honest.
//
// Pure below the one orchestrator: no DOM, no Alpine. `gh` is any object
// carrying the GH proto (compare, req), so the whole thing tests against a fake
// gh with no network. Attaches to window.BranchBrief.
(() => {
  const KIND = 'branch-brief/1';

  // ── the authored layer ────────────────────────────────────────────────────

  // What an authored payload is. Narrow on purpose, mirroring DataPayload's
  // rule: an object qualifies as an envelope only when it declares the kind or
  // carries recognisable authored fields, so an unrelated JSON file handed to
  // this page degrades to "no authored layer" rather than rendering as garbage.
  //
  // A `branch-review/1` surface (docs/envelopes/surface.md) is accepted too:
  // its manifest/context/items shape carries the same judgment under different
  // names, and reading both here is what lets that profile become the format
  // later without this page changing.
  function readAuthored(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if (payload.kind === KIND) return normalize(payload);
    if (payload.manifest?.profile?.name === 'branch-review') return fromSurface(payload);
    // Untagged, but shaped like one: accept rather than demand the tag, since
    // an authored block is hand-written as often as generated.
    if (['intent', 'notes', 'open', 'omitted'].some(k => k in payload)) return normalize(payload);
    return null;
  }

  const asList = v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim())
                    : (typeof v === 'string' && v.trim() ? [v] : []);

  function normalize(p) {
    return {
      intent: typeof p.intent === 'string' ? p.intent : '',
      notes: typeof p.notes === 'string' ? p.notes : '',
      open: asList(p.open),
      omitted: asList(p.omitted),
      // Per-path commentary, so a file row can carry a one-line why.
      files: (p.files && typeof p.files === 'object' && !Array.isArray(p.files)) ? p.files : {},
    };
  }

  // A branch-review surface projected onto the same four fields. `intent` and
  // `omitted` are roles there, not keys, so they are collected from items.
  function fromSurface(s) {
    const items = Array.isArray(s.items) ? s.items : [];
    const byRole = r => items.filter(i => i?.role === r);
    const files = {};
    for (const i of byRole('changed')) {
      const p = i?.target?.source?.path;
      if (p && i.commentary) files[p] = i.commentary;
    }
    return {
      intent: byRole('intent').map(i => i.commentary || i.summary || i.title).filter(Boolean).join('\n\n')
              || s.manifest?.description || '',
      notes: s.context?.notes || '',
      open: asList(s.context?.open),
      omitted: byRole('omitted').map(i => i.title).filter(Boolean),
      files,
    };
  }

  // ── the derived layer ─────────────────────────────────────────────────────

  // A branch's standing against its base, from the compare alone.
  //
  //   landed      no commits outside the base: cannot be in flight, whatever
  //               the branch's name or age suggests
  //   unrelated   no merge base (the compare 404s): a rewritten or foreign
  //               history line, structurally unable to be current work
  //   live        carries commits the base lacks
  //
  // The same three-way call `.claude/skills/in-flight/in-flight.py` makes at
  // the CLI, so a row and the page agree about what a branch is.
  function state(cmp) {
    if (!cmp) return 'unrelated';
    if ((cmp.ahead_by ?? 0) === 0) return 'landed';
    return 'live';
  }

  // Everything the page renders, from the pieces the orchestrator fetched.
  // Pure, so the whole projection is testable without a network.
  function assemble({ repo, branch, base, compare, pull, pulls, authored } = {}) {
    const cmp = compare || null;
    const commits = cmp?.commits || [];
    const derived = (window.BranchSurvey && cmp) ? window.BranchSurvey.compareFields(cmp)
                  : { firstDate: '', sessions: [], sessionsExact: false };
    const files = (cmp?.files || []).map(f => ({
      path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions,
      previousPath: f.previous_filename || '', patch: f.patch || '',
    }));
    return {
      repo, branch, base,
      state: state(cmp),
      ahead: cmp?.ahead_by ?? null,
      behind: cmp?.behind_by ?? null,
      // The branch's own span: its oldest unique commit to its newest. Both
      // ends come off the compare, so neither costs a call.
      firstDate: derived.firstDate,
      lastDate: commits.length ? (commits[commits.length - 1].commit?.committer?.date || '') : '',
      // Whether the commit list is the whole branch. GitHub caps it at 250, and
      // past that every count here is a floor rather than a total.
      complete: (cmp?.total_commits ?? commits.length) <= commits.length,
      commitCount: cmp?.total_commits ?? commits.length,
      sessions: derived.sessions,
      sessionsExact: derived.sessionsExact,
      commits: commits.slice().reverse().map(c => ({
        sha: c.sha, subject: (c.commit?.message || '').split('\n')[0],
        date: c.commit?.committer?.date || '',
      })),
      files,
      // `pr` is the one on display and `prs` is every one the branch has had,
      // newest first. A merged PR reports `merged` rather than `closed`, since
      // the two are the same state to the API and opposite facts to a reader.
      pr: pull ? prFields(pull) : null,
      prs: (pulls && pulls.length ? pulls : (pull ? [pull] : [])).map(prFields),
      authored: authored || null,
    };
  }

  function prFields(p) {
    return {
      number: p.number, title: p.title || '', draft: !!p.draft,
      state: p.merged_at ? 'merged' : (p.state || 'open'),
      body: p.body || '',
      updated: p.updated_at || '',
    };
  }

  // ── orchestration ─────────────────────────────────────────────────────────

  // The two calls the derived layer needs. The compare carries ahead/behind,
  // the commits, and the files in one response, which is why this page is cheap
  // despite showing more than any list does. A 404 there means no merge base,
  // which is a finding rather than a failure.
  //
  // Every PR the branch has had, not the newest one: a merge ends a PR but not
  // the branch, so post-merge work opens a second, and a page that reads only
  // `pulls[0]` shows one of them with no way to reach the other. The FAB's
  // guide pane learned this first and stepped through them; this returns the
  // list so a reader here can too.
  //
  // The two run TOGETHER. They share no input, and the pulls call used to wait
  // on the compare purely because it was written second. One page load hardly
  // noticed; the swiper pays it once per step, where a whole round trip on the
  // critical path is the difference between a step and a wait. Each side keeps
  // its own failure rule, which is why this is a settled Promise.all rather
  // than a bare one: a compare 404 is a finding to report, and a pulls failure
  // costs the guide and nothing else.
  async function fetchBrief(gh, { repo, branch, base } = {}) {
    const owner = String(repo || '').split('/')[0];
    const [cmp, list] = await Promise.all([
      gh.compare(base, branch).then(ok => ({ ok }), err => ({ err })),
      gh.req(`pulls?state=all&head=${encodeURIComponent(owner + ':' + branch)}&per_page=10`)
        .catch(() => []),
    ]);
    if (cmp.err && cmp.err.status !== 404) throw cmp.err;
    const compare = cmp.err ? null : cmp.ok;
    const pulls = (list || []).slice().sort((a, b) => (b.number || 0) - (a.number || 0));
    return { compare, pull: pulls[0] || null, pulls, noBase: !!cmp.err };
  }

  // ── the read-through cache ────────────────────────────────────────────────
  //
  // The page's standing claim is that every fact is read at open time, so
  // nothing here can be stale. A cache is in tension with that claim and earns
  // its place only where the alternative is worse: the swiper, which reloads
  // one branch every time a finger crosses it and re-reads a branch the reader
  // stepped past ten seconds ago.
  //
  // The reconciliation is a TTL, not a session-lifetime store. Inside one
  // reading pass a step is free and a step back is free; leave the takeover
  // open while work lands and the next visit reads GitHub again. Sixty seconds
  // is the span over which a branch page's facts can be treated as one
  // observation, and it is short enough that no reader can act on a stale one
  // without first watching it sit.
  //
  // The PROMISE is cached, not its value, so a warm still in flight is joined
  // rather than re-issued: that is the whole mechanism behind prefetching a
  // neighbour, since the step lands mid-fetch by design. A rejection evicts
  // itself, because a failed read must not be the answer for a minute.
  const TTL_MS = 60000;
  const _briefs = new Map();   // key -> { at, p }
  const briefKey = (repo, branch, base) => repo + '@' + branch + '...' + (base || '');

  function readBrief(gh, opts = {}) {
    const key = briefKey(opts.repo, opts.branch, opts.base);
    const hit = _briefs.get(key);
    const now = Date.now();
    if (hit && now - hit.at < TTL_MS) return hit.p;
    const p = fetchBrief(gh, opts);
    _briefs.set(key, { at: now, p });
    p.catch(() => { if (_briefs.get(key)?.p === p) _briefs.delete(key); });
    return p;
  }

  // Drop one branch, or everything. The caller that knows a read is stale
  // (a push landed, the reader asked for a refresh) says so here rather than
  // waiting out the TTL.
  function forget(repo, branch, base) {
    if (repo === undefined) { _briefs.clear(); return; }
    _briefs.delete(briefKey(repo, branch, base));
  }

  // A PR number to the branch it is for. The address `#gh=owner/repo&pr=364`
  // resolves through here: a PR names its own head and base, so nothing else
  // has to be supplied, and a link to a PR becomes a link to its branch with
  // the comparison already correct (a PR merged long ago compares against the
  // base it was actually opened against, not today's default branch).
  async function fetchPullTarget(gh, number) {
    const pr = await gh.req('pulls/' + encodeURIComponent(number));
    if (!pr || !pr.head?.ref) return null;
    return {
      branch: pr.head.ref,
      base: pr.base?.ref || '',
      repo: pr.head?.repo?.full_name || pr.base?.repo?.full_name || '',
      pull: pr,
    };
  }

  window.BranchBrief = { KIND, readAuthored, state, assemble, fetchBrief, readBrief, forget,
                         fetchPullTarget, TTL_MS };
})();
