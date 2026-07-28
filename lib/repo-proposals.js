// Proposals: the write-side counterpart to the read-only mailbox
// (lib/repo-mailbox.js). An agent session with limited repo scope drops a
// proposed edit into the registry repo; show-repo, running in the user's
// browser with their full-access token, shows it and commits it to the target
// repo only when the user confirms. The browser lends a capability the agent
// lacks, the same trade the mailbox makes, but for a write.
//
// NEVER AUTO-APPLIES. The mailbox fulfills on load because its kinds only read;
// a proposal writes to a repo the agent could not reach, so the manual confirm
// is the whole safety hinge. Nothing in this file applies anything on its own:
// the shell counts pending proposals at boot and applies one at a time, on a
// two-tap gesture, exactly like a cross-repo copy.
//
// Two kinds, both small on purpose:
//   put-file        whole-file content for `path`. Simple, and what the agent
//                   can offer when it knows the file end to end.
//   set-json-field  set one top-level key in a JSON file, read-modify-write
//                   against whatever the file says at apply time. This is the
//                   motivating case (adding `scope` to a repo's
//                   .web-tools.json), and it is the honest one when the agent
//                   cannot read the target: it proposes a field, not a guess
//                   at the rest of the file.
//
// A RECORD IS AN INSTRUCTION, NOT A PATCH. Nothing here carries a diff, in any
// format. `set-json-field` says which key gets which value; `put-file` carries
// the whole file. The before/after a reviewer sees is computed at review time
// by resolve(), against the target as it stands at that moment, and is never
// stored: a diff written when the proposal was authored describes a file as it
// was that day and quietly lies afterwards. Once applied, the resulting bytes
// are an ordinary commit in the target repo, which is where a durable diff
// belongs; the applied/ record keeps the outcome and that commit's sha.
//
// THREE DELIVERIES, and the choice is the reviewer's. `deliver` on the record
// is the proposing session's suggestion, not its decision, since the person
// holding the token is the one who knows whether this repo wants a PR today:
//   commit  straight onto the target ref. What a one-key config edit deserves.
//   branch  cut proposal/<id> off the target ref and commit there. The target
//           is untouched, so nothing lands until someone merges it.
//   pr      the same branch, plus a draft pull request whose body carries the
//           why, the signature, and the session link.
// PR delivery is the only path that works against a protected branch, and it is
// the honest one for a code change: GitHub's diff view is a better reviewer
// than a card, and the PR survives as the durable record of what was proposed.
// Opening the PR is a SEPARATE PERMISSION from writing (a fine-grained token
// can carry contents:write without pull_requests:write), so a PR failure never
// erases the branch and commit that already landed: the record reports both and
// hands over a compare link.
//
// THE STALENESS GUARD. A record may carry `expectSha`, the blob sha of the
// target when it was written. At apply time a different sha refuses, because
// put-file replaces rather than merges and would otherwise erase a change
// nobody reviewed. The refusal is not final: the view offers an explicit
// override, and a forced write is stamped `forced` in the applied record with
// both shas, so "we knew and did it anyway" stays distinguishable from "nothing
// had changed". Omitting expectSha keeps the old behavior, last write wins,
// which is the honest default for a session that never read the file.
//
// PROVENANCE. `by`, `session`, and `authored` are optional and carried through
// to the applied record. A proposal is an instruction to write to a repo, so
// who issued it and from which session is part of what a reviewer is judging.
//
// WRITE THE `why` FOR A STRANGER. It is required, and validation refuses a
// record without one, but the real bar is higher than non-empty: it is read
// cold, possibly weeks later, on a phone, by someone deciding whether to write
// to a repo. Open at the top (what this is, why it exists, what applying it
// does) rather than in the middle (a note to whoever already had the session in
// their head). Verbose beats cryptic here; the reader has no other context.
//
// Pure helpers (pending, validate, applyField, toBase64) are unit-tested;
// current/apply take an injected GH so they can be tested against a stub.
// Attaches to window.RepoProposals, loaded via gh.load('repo-proposals.js').
(() => {
  const PENDING_DIR = 'proposals/pending';
  const APPLIED_DIR = 'proposals/applied';
  const KINDS = ['put-file', 'set-json-field'];
  const DELIVERIES = ['commit', 'branch', 'pr'];
  // Predictable and greppable, so a stray one is identifiable months later.
  const branchFor = (p) => 'proposal/' + String(p?.id || 'unnamed').replace(/[^\w.-]+/g, '-');

  // Which proposals lack a same-named record in applied/. Same convention as
  // the mailbox, and for the same reason: gh-store has no delete, so a spent
  // proposal is marked by the presence of its result, not by removal.
  function pending(pendingNames, appliedNames) {
    const done = new Set(appliedNames);
    return pendingNames.filter(n => n.endsWith('.json') && !done.has(n));
  }

  function validate(p) {
    if (!p || typeof p !== 'object') return { ok: false, error: 'proposal is not an object' };
    if (!KINDS.includes(p.kind)) return { ok: false, error: 'unsupported kind: ' + p.kind };
    if (typeof p.repo !== 'string' || !p.repo.includes('/')) return { ok: false, error: 'bad or missing repo (owner/name)' };
    if (typeof p.path !== 'string' || !p.path.trim()) return { ok: false, error: 'missing path' };
    if (typeof p.why !== 'string' || !p.why.trim()) return { ok: false, error: 'missing why (a proposal a reviewer cannot read is not reviewable)' };
    if (p.kind === 'put-file' && typeof p.content !== 'string') return { ok: false, error: 'put-file needs content (a string)' };
    if (p.deliver !== undefined && !DELIVERIES.includes(p.deliver)) {
      return { ok: false, error: 'unsupported deliver: ' + p.deliver };
    }
    if (p.expectSha !== undefined && (typeof p.expectSha !== 'string' || !p.expectSha.trim())) {
      return { ok: false, error: 'expectSha must be a non-empty string when present' };
    }
    if (p.kind === 'set-json-field') {
      if (typeof p.field !== 'string' || !p.field.trim()) return { ok: false, error: 'set-json-field needs a field name' };
      if (p.value === undefined) return { ok: false, error: 'set-json-field needs a value' };
    }
    return { ok: true };
  }

  // UTF-8 safe, since a scope line can carry any character. btoa alone takes
  // Latin-1, so the bytes go through TextEncoder first.
  function toBase64(text) {
    const bytes = new TextEncoder().encode(String(text));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  }

  // The read-modify-write for set-json-field, kept pure so the interesting
  // part is testable without a network. Preserves key order (an existing key
  // is updated in place), appends a new key at the end, and re-serializes with
  // two-space indent and a trailing newline, which is what these manifests
  // already look like. Returns { ok, text?, error?, before? }.
  //
  // TOP-LEVEL KEYS ONLY, and `field` is a literal key rather than a path.
  // There is no dot or bracket notation: a field of "a.b" sets a key whose name
  // is the three characters a.b, it does not descend. The top level must be an
  // object, so a JSON file holding an array is refused. The VALUE may be any
  // JSON, so a top-level key can be set to a whole nested structure; what is
  // missing is addressing INTO one. That is a real limit rather than an
  // oversight: a path syntax needs an answer for what to do when the path does
  // not exist (create the intermediate objects, or refuse), and the manifests
  // this was built for are flat.
  function applyField(currentText, field, value) {
    let obj;
    try { obj = JSON.parse(currentText || '{}'); }
    catch (e) { return { ok: false, error: 'target is not valid JSON: ' + (e?.message || e) }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: 'target JSON is not an object' };
    }
    const before = Object.prototype.hasOwnProperty.call(obj, field) ? obj[field] : undefined;
    obj[field] = value;
    return { ok: true, before, text: JSON.stringify(obj, null, 2) + '\n' };
  }

  // The target file as it stands right now, for the review pane. A 404 is a
  // fact about the proposal (it creates the file), not an error.
  async function current(p, { GH, token }) {
    const gh = new GH({ token, repo: p.repo, ref: p.ref || '' });
    try {
      const f = await gh.get(p.path);
      return { exists: true, text: f.text, sha: f.sha || '' };
    } catch (e) {
      if (e?.status === 404) return { exists: false, text: '', sha: '' };
      return { exists: false, text: '', sha: '', error: String(e?.message || e) };
    }
  }

  // What the target file would become, resolved against its current contents.
  // Separated from apply() so the UI can show the reviewer the same bytes the
  // write will send, rather than a description of them.
  async function resolve(p, deps) {
    const v = validate(p);
    if (!v.ok) return { ok: false, error: v.error };
    const cur = await current(p, deps);
    if (cur.error) return { ok: false, error: cur.error };
    // Staleness is reported, never enforced here: resolve() describes, apply()
    // decides. A proposal carrying expectSha is claiming to have been written
    // against a specific version of the target, so a different sha means the
    // file moved underneath it. That matters most for put-file, which replaces
    // rather than merges, and would otherwise erase the change it did not see.
    const stale = !!(p.expectSha && cur.exists && cur.sha && cur.sha !== p.expectSha);
    const gone = !!(p.expectSha && !cur.exists);
    const base = { ok: true, exists: cur.exists, before: cur.text, sha: cur.sha, stale, gone };
    if (p.kind === 'put-file') return { ...base, after: p.content };
    const r = applyField(cur.exists ? cur.text : '{}', p.field, p.value);
    if (!r.ok) return { ok: false, error: r.error };
    return { ...base, after: r.text, fieldBefore: r.before };
  }

  // Commit the resolved content to the target repo. Requires gh-transfer.js
  // (saveRaw carries the stale-SHA retry), which the caller loads on demand.
  // Never throws: a failure lands in the record, which is what gets written to
  // applied/ so the next session can read what happened.
  // The PR's title and body are authored here rather than left to the reviewer,
  // because everything worth saying is already in the record: what it does, why
  // it exists, who proposed it, and from which session. A proposal arriving as
  // a PR should read like one written by hand.
  function prTitle(p) {
    return p.kind === 'set-json-field'
      ? `Set ${p.field} in ${p.path}`
      : `Update ${p.path}`;
  }

  function prBody(p, r) {
    const lines = [p.why, ''];
    if (p.kind === 'set-json-field') {
      lines.push('**Field:** `' + p.field + '`', '');
      lines.push('```json');
      lines.push('- ' + (r.fieldBefore === undefined ? '(not set)' : JSON.stringify(r.fieldBefore)));
      lines.push('+ ' + JSON.stringify(p.value));
      lines.push('```', '');
    }
    lines.push('---', '');
    lines.push('Proposed through the web-tools proposal channel and applied from show-repo.');
    if (p.by) lines.push('', 'Proposed by: ' + p.by + (p.authored ? ' on ' + p.authored : ''));
    if (p.session) lines.push('', 'Session: ' + p.session);
    lines.push('', 'Record: `proposals/pending/' + p.id + '.json`');
    return lines.join('\n');
  }

  async function apply(p, { GH, token, now, message, force, deliver }) {
    const mode = deliver || p?.deliver || 'commit';
    const base = {
      id: p?.id, kind: p?.kind, repo: p?.repo, path: p?.path, ref: p?.ref || '',
      appliedAt: now || new Date().toISOString(),
      // Provenance rides through to the outcome, so an applied record answers
      // "who proposed this, and from where" without opening the pending one.
      ...(p?.by ? { by: p.by } : {}), ...(p?.session ? { session: p.session } : {}),
    };
    if (!DELIVERIES.includes(mode)) return { ...base, ok: false, error: 'unsupported deliver: ' + mode };
    const r = await resolve(p, { GH, token });
    if (!r.ok) return { ...base, ok: false, error: r.error };
    // The guard refuses by default and yields to an explicit override, which is
    // recorded rather than silent: forcing is a decision someone made, and the
    // applied record is the only place that decision survives.
    if ((r.stale || r.gone) && !force) {
      return { ...base, ok: false, stale: true,
        error: r.gone
          ? 'the target no longer exists (this proposal was written against ' + p.expectSha.slice(0, 7) + ')'
          : 'the target changed since this was proposed (expected ' + p.expectSha.slice(0, 7) + ', found ' + (r.sha || '?').slice(0, 7) + ')' };
    }
    try {
      const gh = new GH({ token, repo: p.repo, ref: p.ref || '' });
      if (typeof gh.saveRaw !== 'function') {
        return { ...base, ok: false, error: 'gh-transfer.js is not loaded (saveRaw missing)' };
      }
      const msg = message || `${p.kind === 'put-file' ? 'Write' : 'Set ' + p.field + ' in'} ${p.path} (proposal ${p.id}) via show-repo`;
      const forcedFields = (r.stale || r.gone)
        ? { forced: true, expectedSha: p.expectSha, foundSha: r.sha || null } : {};

      // Commit delivery: straight onto the target ref, which is what the
      // channel has always done and what a one-key config edit deserves.
      if (mode === 'commit') {
        const res = await gh.saveRaw(p.path, toBase64(r.after), msg, p.ref || '');
        return { ...base, ok: true, deliver: 'commit', created: !r.exists,
          commit: res?.commit?.sha || null, ...forcedFields };
      }

      // Branch delivery: cut a branch off the target ref, commit there, and
      // leave the target untouched. `pr` is the same thing plus a pull request,
      // so the write is shared and only the last step differs.
      if (typeof gh.createRef !== 'function') {
        return { ...base, ok: false, error: 'gh-transfer.js is not loaded (createRef missing)' };
      }
      const head = branchFor(p);
      const baseBranch = p.ref || await gh.defaultBranch();
      const made = await gh.createRef(head, baseBranch);
      const res = await gh.saveRaw(p.path, toBase64(r.after), msg, head);
      const out = { ...base, ok: true, deliver: mode, created: !r.exists,
        branch: head, baseBranch, branchCreated: made.created,
        commit: res?.commit?.sha || null, ...forcedFields };
      if (mode === 'branch') return out;

      // The PR is a separate permission (a fine-grained token can carry
      // contents:write without pull_requests:write), so its failure must not
      // erase the fact that the branch and commit already landed. Report both.
      try {
        const pr = await gh.createPull({
          title: prTitle(p), head, base: baseBranch, body: prBody(p, r), draft: true,
        });
        return { ...out, pr: pr?.html_url || null, prNumber: pr?.number || null };
      } catch (e) {
        return { ...out, prError: String(e?.message || e),
          compare: 'https://github.com/' + p.repo + '/compare/' +
            encodeURIComponent(baseBranch) + '...' + encodeURIComponent(head) + '?expand=1' };
      }
    } catch (e) {
      return { ...base, ok: false, error: String(e?.message || e) };
    }
  }

  window.RepoProposals = {
    PENDING_DIR, APPLIED_DIR, KINDS, DELIVERIES,
    pending, validate, toBase64, applyField, current, resolve, apply,
    branchFor, prTitle, prBody,
  };
})();
