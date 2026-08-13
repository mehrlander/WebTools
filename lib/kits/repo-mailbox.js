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
// AND ONE THAT THE BROWSER CANNOT SERVE. `ask` addresses the user rather than
// their repos: material that exists only on a machine no session can reach, or
// an answer only a person holds. It completes the channel's grid rather than
// extending it. The three kinds above are a deferred READ from a repo and the
// proposals channel is a deferred WRITE to one; `ask` is the deferred read from
// the person, and it was the only empty cell.
//
// The difference that matters mechanically: an ask can never be auto-fulfilled,
// so it must be filtered out BEFORE the fulfill-and-save loop rather than
// refused inside it. A refusal is still a result, and writing a result is what
// marks a request answered, so an ask that reached fulfill() would be closed by
// its own rejection on the first page load and never seen. That is why `isAsk`
// exists as a guard rather than `validate` simply rejecting it.
//
// The difference that matters in use: a repo either has a file or does not, so
// a failed read is an error. A person can answer "no, and here is why," which is
// not a failure but often the most valuable thing the channel carries. So an ask
// closes with a message either way, and `answered` is false on a decline while
// `ok` stays true: the request was served, the material was not sent.
//
// Pure helpers (pending, validate, isAsk, validateAsk, closeAsk) are unit-tested;
// fulfill takes an injected GH so it can be tested against a stub. Attaches to
// window.RepoMailbox, loaded via gh.load('kits/repo-mailbox.js').
(() => {
  const REQ_DIR = 'mailbox/requests';
  const RES_DIR = 'mailbox/results';
  // The kinds show-repo fulfills on load, unattended. `ask` is deliberately not
  // among them; KINDS keeps its meaning as "what fulfill() handles" so every
  // existing caller and test reads the same.
  const KINDS = ['tree', 'branches', 'fetch'];
  const ASK = 'ask';

  // Which request files lack a same-named result file (so nothing re-runs).
  function pending(requestNames, resultNames) {
    const done = new Set(resultNames);
    return requestNames.filter(n => n.endsWith('.json') && !done.has(n));
  }

  // The guard the fulfill loop runs first. Deliberately keyed on the record
  // rather than on a validation verdict: a malformed ask is still an ask, and
  // must not be auto-answered by its own rejection.
  function isAsk(req) {
    return !!req && typeof req === 'object' && req.kind === ASK;
  }

  // An ask names what is wanted and where it lands. `note` is prose, because
  // what is being asked for often has no filename: "whatever is in that folder"
  // and "a listing of that directory" are the normal cases, and a path schema
  // would either drop them or fake them. `dest` is structured, since it is what
  // aims the stage and what lets one list span every repo.
  function validateAsk(req) {
    if (!isAsk(req)) return { ok: false, error: 'not an ask' };
    if (typeof req.note !== 'string' || !req.note.trim()) return { ok: false, error: 'ask needs a note saying what is wanted' };
    if (typeof req.dest !== 'string' || !req.dest.includes('/')) return { ok: false, error: 'ask needs a dest (owner/repo[@ref]:dir)' };
    return { ok: true };
  }

  // The record a person's answer writes, at RES_DIR/<same name>. Writing it is
  // what closes the ask, by the same rule that closes every other kind: pending
  // means no same-named result exists. `answered` distinguishes sent from
  // declined; `ok` stays true for both, since a decline is a served request and
  // not a failure. The message is required on a decline and optional on a send,
  // because "no" without a reason wastes the next session's time as surely as
  // no answer at all.
  function closeAsk(req, { answered, message, now } = {}) {
    const base = { id: req?.id, kind: ASK, dest: req?.dest, task: req?.task,
                   fulfilledAt: now || new Date().toISOString() };
    const msg = typeof message === 'string' ? message.trim() : '';
    if (!answered && !msg) return { ok: false, error: 'a decline needs a message saying why' };
    return { ...base, ok: true, answered: !!answered, message: msg };
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

  window.RepoMailbox = { REQ_DIR, RES_DIR, KINDS, ASK, pending, validate, fulfill,
                         isAsk, validateAsk, closeAsk };
})();
