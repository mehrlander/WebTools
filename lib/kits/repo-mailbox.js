// Private mailbox: an async, git-backed request/response channel between an
// agent session (limited repo scope) and show-repo in the browser (the user's
// full-access token). The agent drops a request file in the registry repo;
// show-repo, when it runs, fulfills it with the user's token and writes the
// result back; the agent reads the result next turn. The browser lends a
// capability the agent lacks (the live token), asynchronously.
//
// READ-ONLY by design. Supported kinds only read from the user's repos and only
// write results into the mailbox itself, so auto-fulfilling on load never spends
// write access on agent-authored instructions:
//   tree     — recursive Git-trees listing of a repo (paths/types/sizes)
//   branches — branch names + tip shas
//   fetch    — contents of specific text files (params.paths[])
//
// Pure helpers (pending, validate) are unit-tested; fulfill takes an injected
// GH so it can be tested against a stub. Attaches to window.RepoMailbox, loaded
// via gh.load('kits/repo-mailbox.js').
(() => {
  const REQ_DIR = 'mailbox/requests';
  const RES_DIR = 'mailbox/results';
  const KINDS = ['tree', 'branches', 'fetch'];

  // Which request files lack a same-named result file (so nothing re-runs).
  function pending(requestNames, resultNames) {
    const done = new Set(resultNames);
    return requestNames.filter(n => n.endsWith('.json') && !done.has(n));
  }

  // Shape/kind validation before touching the network.
  function validate(req) {
    if (!req || typeof req !== 'object') return { ok: false, error: 'request is not an object' };
    if (!KINDS.includes(req.kind)) return { ok: false, error: 'unsupported kind: ' + req.kind };
    if (typeof req.repo !== 'string' || !req.repo.includes('/')) return { ok: false, error: 'bad or missing repo (owner/name)' };
    if (req.kind === 'fetch' && (!Array.isArray(req.paths) || !req.paths.length)) return { ok: false, error: 'fetch needs a non-empty paths[]' };
    return { ok: true };
  }

  // Execute one request with an injected GH class + token. Returns a result
  // object; never throws (errors land in the result). Read-only.
  async function fulfill(req, { GH, token, now }) {
    const ref = req.ref || 'main';
    const base = { id: req.id, kind: req.kind, repo: req.repo, ref, fulfilledAt: now || new Date().toISOString() };
    const v = validate(req);
    if (!v.ok) return { ...base, ok: false, error: v.error };
    try {
      const gh = new GH({ token, repo: req.repo, ref });
      if (req.kind === 'tree') {
        const t = await gh.req(`git/trees/${encodeURIComponent(ref)}?recursive=1`);
        return { ...base, ok: true, data: {
          truncated: !!t.truncated,
          entries: (t.tree || []).map(e => ({ path: e.path, type: e.type, size: e.size, sha: e.sha })),
        } };
      }
      if (req.kind === 'branches') {
        const b = await gh.branches();
        return { ...base, ok: true, data: { branches: b.map(x => ({ name: x.name, sha: x.commit?.sha })) } };
      }
      if (req.kind === 'fetch') {
        const files = [];
        for (const p of req.paths) {
          try { const f = await gh.get(p); files.push({ path: p, ok: true, size: f.size, text: f.text }); }
          catch (e) { files.push({ path: p, ok: false, error: String(e?.message || e) }); }
        }
        return { ...base, ok: true, data: { files } };
      }
      return { ...base, ok: false, error: 'unhandled kind' };
    } catch (e) {
      return { ...base, ok: false, error: String(e?.message || e) };
    }
  }

  window.RepoMailbox = { REQ_DIR, RES_DIR, KINDS, pending, validate, fulfill };
})();
