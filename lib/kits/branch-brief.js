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
// Reading splits two ways, and both axes are about the surface rather than
// about the data.
//
//   fetch* vs read*   `fetchBrief` always asks GitHub; `readBrief` puts a
//                     sixty-second read-through cache in front of it, for a
//                     surface that opens the same branch repeatedly inside one
//                     pass. The swiper steps back and forth over a list and
//                     warms its neighbours, and re-reading a branch the reader
//                     crossed ten seconds ago is the cost that makes stepping
//                     feel like waiting. See the note above the cache for why a
//                     TTL is the only form of it that keeps this page's
//                     freshness claim honest.
//
//   guide vs compare  the PR list is a few KB and the compare is most of a
//                     megabyte on a repo that commits a bundle. `readGuide` and
//                     `readCompare` are separate so a surface can render the
//                     judgment layer and fetch the diff only if the reader asks
//                     for it; `readBrief` is both, for a caller that wants the
//                     whole branch in one await. `assemble` tolerates the
//                     compare being absent and says so with `pending`.
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
  //
  // The compare is OPTIONAL, and that is the deferral: `compare: null` with
  // `noBase: false` means "not read yet" and yields a brief marked `pending`,
  // complete in everything the pulls call can answer and empty in everything
  // only the compare can. `noBase: true` is the other absent compare, a 404,
  // which is an answer rather than a gap.
  //
  // `facts` is what a HOST already knows about the branch, used only while the
  // read is pending and never in preference to it. show-repo's activity crawl
  // has ahead, behind, the branch's first date and its sessions on the row it
  // was tapped from, so a deferred compare costs the facts strip nothing there;
  // a cold page has no such row and shows the gaps honestly. Nothing here is
  // inferred: a fact the host does not supply stays absent.
  function assemble({ repo, branch, base, compare, noBase, pull, pulls, authored, facts } = {}) {
    const cmp = compare || null;
    const pending = !cmp && !noBase;
    const f = (pending && facts) ? facts : {};
    const commits = cmp?.commits || [];
    const derived = (window.BranchStatus && cmp) ? window.BranchStatus.compareFields(cmp)
                  : { firstDate: '', sessions: [], sessionsExact: false };
    const files = (cmp?.files || []).map(f2 => ({
      path: f2.filename, status: f2.status, additions: f2.additions, deletions: f2.deletions,
      previousPath: f2.previous_filename || '', patch: f2.patch || '',
    }));
    return {
      repo, branch, base,
      // Whether the compare is still owed. The panes that need it read this
      // rather than inferring from an empty file list, which a branch with no
      // changed files would also produce.
      pending,
      // A host's ahead count answers the same question the compare does, so it
      // runs through the same three-way call rather than a second rule.
      state: cmp ? state(cmp)
           : (noBase ? 'unrelated'
           : (f.ahead == null ? '' : state({ ahead_by: f.ahead }))),
      ahead: cmp?.ahead_by ?? f.ahead ?? null,
      behind: cmp?.behind_by ?? f.behind ?? null,
      // The branch's own span: its oldest unique commit to its newest. Both
      // ends come off the compare, so neither costs a call.
      firstDate: derived.firstDate || f.firstDate || '',
      lastDate: commits.length ? (commits[commits.length - 1].commit?.committer?.date || '')
                               : (f.lastDate || ''),
      // Whether the commit list is the whole branch. GitHub caps it at 250, and
      // past that every count here is a floor rather than a total.
      complete: (cmp?.total_commits ?? commits.length) <= commits.length,
      commitCount: cmp ? (cmp.total_commits ?? commits.length) : null,
      sessions: derived.sessions.length ? derived.sessions : (f.sessions || []),
      // A host's session list is read from the branch tip, never from the
      // compare's own commits, so it cannot claim to be exact.
      sessionsExact: cmp ? derived.sessionsExact : false,
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

  // Two calls, and they are kept apart because they cost two different things.
  //
  // The GUIDE call is the PR list: the body, the title, the state, a few KB.
  // Every PR the branch has had, not the newest one: a merge ends a PR but not
  // the branch, so post-merge work opens a second, and a page that reads only
  // `pulls[0]` shows one of them with no way to reach the other. The FAB's
  // guide pane learned this first and stepped through them; this returns the
  // list so a reader here can too.
  //
  // The COMPARE call carries ahead/behind, the commits and the changed files in
  // one response, and the files come with every patch embedded. There is no way
  // to ask for a subset: on a repo whose commits regenerate a bundle it is most
  // of a megabyte, 88% of it one generated file nobody opens. Measured on
  // web-tools 2026-08-14: 1.82 MB of patch over 23 files, 1.60 MB of it
  // `dist/web-tools.js`, whose own diff is 52 lines, three of them a quarter of
  // a megabyte each. A 404 means no merge base, which is a finding rather than
  // a failure, so it is reported as `noBase` and not thrown.
  //
  // Splitting them is what lets a reader open the guide without paying for the
  // diff. `fetchBrief` still runs both together, for a caller that wants the
  // whole thing in one await; the swiper takes them one at a time.
  async function fetchGuide(gh, { repo, branch } = {}) {
    const owner = String(repo || '').split('/')[0];
    const list = await gh.req(
      `pulls?state=all&head=${encodeURIComponent(owner + ':' + branch)}&per_page=10`).catch(() => []);
    const pulls = (list || []).slice().sort((a, b) => (b.number || 0) - (a.number || 0));
    return { pull: pulls[0] || null, pulls };
  }

  async function fetchCompare(gh, { branch, base } = {}) {
    try {
      return { compare: await gh.compare(base, branch), noBase: false };
    } catch (err) {
      if (err && err.status === 404) return { compare: null, noBase: true };
      throw err;
    }
  }

  // Both at once. They share no input, and the pulls call used to wait on the
  // compare purely because it was written second. One page load hardly noticed;
  // the swiper pays it once per step, where a whole round trip on the critical
  // path is the difference between a step and a wait.
  async function fetchBrief(gh, o = {}) {
    const [cmp, guide] = await Promise.all([fetchCompare(gh, o), fetchGuide(gh, o)]);
    return { ...cmp, ...guide };
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
  //
  // The two reads are cached SEPARATELY, under their own keys, because they are
  // now asked for separately: a reader who opens four guides and one Files pane
  // should pay for four guides and one compare. `readBrief` composes the two
  // rather than caching a third thing, so a compare fetched later joins the
  // guide already held and neither is read twice.
  //
  // The guide's key omits the base, since the pulls call does not take one.
  const TTL_MS = 60000;
  const _reads = new Map();   // key -> { at, p }
  const briefKey = (repo, branch, base) => repo + '@' + branch + '...' + (base || '');

  function readThrough(key, make) {
    const hit = _reads.get(key);
    const now = Date.now();
    if (hit && now - hit.at < TTL_MS) return hit.p;
    const p = make();
    _reads.set(key, { at: now, p });
    p.catch(() => { if (_reads.get(key)?.p === p) _reads.delete(key); });
    return p;
  }

  const readGuide = (gh, o = {}) =>
    readThrough('guide:' + o.repo + '@' + o.branch, () => fetchGuide(gh, o));

  const readCompare = (gh, o = {}) =>
    readThrough('cmp:' + briefKey(o.repo, o.branch, o.base), () => fetchCompare(gh, o));

  function readBrief(gh, opts = {}) {
    return Promise.all([readCompare(gh, opts), readGuide(gh, opts)])
      .then(([cmp, guide]) => ({ ...cmp, ...guide }));
  }

  // Drop one branch, or everything. The caller that knows a read is stale
  // (a push landed, the reader asked for a refresh) says so here rather than
  // waiting out the TTL. Both halves go: a caller asking to forget a branch
  // means the branch, not one read of it.
  function forget(repo, branch, base) {
    if (repo === undefined) { _reads.clear(); return; }
    _reads.delete('guide:' + repo + '@' + branch);
    _reads.delete('cmp:' + briefKey(repo, branch, base));
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

  window.BranchBrief = { KIND, readAuthored, state, assemble,
                         fetchBrief, fetchGuide, fetchCompare,
                         readBrief, readGuide, readCompare, forget,
                         fetchPullTarget, TTL_MS };
})();
