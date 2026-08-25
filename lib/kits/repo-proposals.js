// Proposals: the write-side counterpart to the read-only mailbox
// (lib/kits/repo-mailbox.js). An agent session with limited repo scope drops a
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
// Three kinds, all small on purpose:
//   put-file          whole-file content for `path`. Simple, and what the agent
//                     can offer when it knows the file end to end.
//   set-json-field    set one top-level key in a JSON file, read-modify-write
//                     against whatever the file says at apply time. This is the
//                     motivating case (adding `scope` to a repo's
//                     .web-tools.json), and it is the honest one when the agent
//                     cannot read the target: it proposes a field, not a guess
//                     at the rest of the file.
//   unset-json-field  remove one top-level key, the same read-modify-write with
//                     a delete instead of an assignment. Added 2026-07-30 after
//                     the channel's first real use found it missing: a scoped-out
//                     session that wants a key GONE could not say so, because
//                     set cannot express absence and put-file needs the rest of
//                     the file, which is exactly what such a session does not
//                     know. The waiting job was six repos still carrying an
//                     inert `quickLink: true` after the membership collapse.
//
// A REMOVAL THAT FINDS NOTHING IS DONE, NOT FAILED. Asking for a key to be gone
// when it is already gone got what it asked for, so it reports through the same
// `done` state as a set whose value already matches: the record is retired
// rather than written again. Treating it as an error would make the channel
// harder to use exactly where it is safest, and would punish the second reviewer
// for the first one's success.
//
// A RECORD IS AN INSTRUCTION, NOT A PATCH. Nothing here carries a diff, in any
// format. The JSON kinds say which key gets which value, or which key goes;
// `put-file` carries the whole file. The before/after a reviewer sees is computed at review time
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
// Pure helpers (pending, validate, applyField, unsetField, toBase64) are
// unit-tested;
// current/apply take an injected GH so they can be tested against a stub.
// Attaches to window.RepoProposals, loaded via gh.load('kits/repo-proposals.js').
(() => {
  const PENDING_DIR = 'proposals/pending';
  const APPLIED_DIR = 'proposals/applied';
  // A failed apply is an attempt, not a spent proposal. Keeping it beside the
  // channel means a failure is diagnosable later without pretending the work
  // is done.
  const ATTEMPT_DIR = 'proposals/attempts';
  const KINDS = ['put-file', 'set-json-field', 'unset-json-field'];
  // The two kinds that read-modify-write a JSON object, as opposed to
  // replacing a file whole. They share every JSON premise: the target must
  // parse, the top level must be an object, and the edit is one literal key.
  const JSON_KINDS = ['set-json-field', 'unset-json-field'];
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
    for (const k of ['summary', 'caution']) {
      if (p[k] !== undefined && typeof p[k] !== 'string') return { ok: false, error: k + ' must be a string when present' };
    }
    if (p.deliver !== undefined && !DELIVERIES.includes(p.deliver)) {
      return { ok: false, error: 'unsupported deliver: ' + p.deliver };
    }
    if (p.expectSha !== undefined && (typeof p.expectSha !== 'string' || !p.expectSha.trim())) {
      return { ok: false, error: 'expectSha must be a non-empty string when present' };
    }
    if (JSON_KINDS.includes(p.kind)) {
      if (typeof p.field !== 'string' || !p.field.trim()) return { ok: false, error: p.kind + ' needs a field name' };
    }
    if (p.kind === 'set-json-field' && p.value === undefined) {
      return { ok: false, error: 'set-json-field needs a value' };
    }
    // A `value` on a removal is refused rather than ignored: it almost always
    // means the record was meant to be a set, and silently dropping it would
    // apply the opposite of what was written.
    if (p.kind === 'unset-json-field' && p.value !== undefined) {
      return { ok: false, error: 'unset-json-field takes no value (did you mean set-json-field?)' };
    }
    return { ok: true };
  }

  // THE THREE PROSE FIELDS have three different jobs, and a card that shows
  // them all at once is a wall of text on a phone. `summary` is the one line
  // always on screen; `why` is the detail, worth reading once and then hidden;
  // `caution` is the judgment call the reader must not scroll past. Splitting
  // them is what lets the card collapse: prose cannot be collapsed halfway.
  //
  // A record with only `why` (every record written before this split) still
  // works: its first sentence stands in as the summary and the remainder
  // becomes the detail, so nothing has to be rewritten to be readable.
  function summaryOf(p) {
    if (p && typeof p.summary === 'string' && p.summary.trim()) return p.summary.trim();
    const w = String(p?.why || '').trim();
    const cut = w.search(/[.!?](\s|$)/);
    return cut === -1 ? w : w.slice(0, cut + 1);
  }

  function detailOf(p) {
    const w = String(p?.why || '').trim();
    if (p && typeof p.summary === 'string' && p.summary.trim()) return w;
    const cut = w.search(/[.!?](\s|$)/);
    return cut === -1 ? '' : w.slice(cut + 1).trim();
  }

  // UTF-8 safe, since a scope line can carry any character. btoa alone takes
  // Latin-1, so the bytes go through TextEncoder first.
  function toBase64(text) {
    const bytes = new TextEncoder().encode(String(text));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  }

  // ── Preflight checks ──────────────────────────────────────────────────────
  // The premises a proposal rests on, each answerable against the live target
  // and each shown on the card BEFORE the apply. Two came out of watching a
  // real run: an apply that failed still marked the proposal spent, and there
  // was no way to see that a change had already landed. Both are questions the
  // card should answer standing still.
  //
  //   readable        the target exists and parses (set-json-field needs JSON)
  //   needed          the change is not already in place; when it is, the
  //                   proposal is DONE rather than failed, and wants retiring
  //                   rather than applying
  //   unchanged       the target still matches expectSha, skipped without one
  //   expect[]        record-declared premises, each { field, equals|absent }
  //
  // A check is blocking when it must hold for the write to make sense. Nothing
  // here writes; this is what the reviewer reads.
  const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function checks(p, r) {
    const list = [];
    const add = (key, label, state, note) => list.push({ key, label, state, note: note || '' });

    if (!r || !r.ok) {
      add('readable', 'Target is readable', 'fail', r?.error || 'the target could not be read');
      return { list, blocking: true, done: false };
    }
    add('readable', JSON_KINDS.includes(p.kind) ? 'Target is readable JSON' : 'Target is readable',
      'pass', r.exists ? '' : (p.kind === 'unset-json-field'
        ? 'the file does not exist, so there is nothing to remove'
        : 'the file does not exist yet, so applying creates it'));

    let done = false;
    if (p.kind === 'unset-json-field') {
      // Absent already means the end state is what was asked for. See the
      // header: a removal that finds nothing is done, not failed.
      done = r.fieldBefore === undefined;
      add('needed', 'Change is still needed', done ? 'done' : 'pass',
        done ? p.field + ' is already absent' : '');
    } else if (p.kind === 'set-json-field') {
      done = r.exists && sameValue(r.fieldBefore, p.value);
      add('needed', 'Change is still needed', done ? 'done' : 'pass',
        done ? p.field + ' already holds this exact value' : '');
    } else {
      done = r.exists && r.before === p.content;
      add('needed', 'Change is still needed', done ? 'done' : 'pass',
        done ? 'the file already has these exact bytes' : '');
    }

    if (p.expectSha) {
      const ok = !r.stale && !r.gone;
      add('unchanged', 'Target unchanged since proposed', ok ? 'pass' : 'fail',
        ok ? '' : (r.gone ? 'the file has been deleted' : 'now ' + String(r.sha || '').slice(0, 7)));
    } else {
      add('unchanged', 'Target unchanged since proposed', 'skip', 'no sha was recorded when this was written');
    }

    // Record-declared premises, checked against the target's current JSON.
    // Only meaningful for a JSON target, which is the only place a field has a
    // value to compare.
    for (const e of (Array.isArray(p.expect) ? p.expect : [])) {
      let cur, parsed = null;
      try { parsed = JSON.parse(r.before || '{}'); } catch { parsed = null; }
      const has = parsed && Object.prototype.hasOwnProperty.call(parsed, e.field);
      cur = has ? parsed[e.field] : undefined;
      if ('absent' in e) {
        add('expect:' + e.field, e.field + ' is not set', has ? 'fail' : 'pass',
          has ? 'it is already ' + JSON.stringify(cur) : '');
      } else {
        add('expect:' + e.field, e.field + ' is ' + JSON.stringify(e.equals),
          sameValue(cur, e.equals) ? 'pass' : 'fail',
          sameValue(cur, e.equals) ? '' : 'found ' + JSON.stringify(cur));
      }
    }

    const blocking = list.some(c => c.state === 'fail');
    return { list, blocking, done };
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

  // The removal counterpart, and deliberately the same shape: same parse, same
  // object-at-top-level rule, same literal-key limit (no dot or bracket paths),
  // same re-serialization. `removed` says whether the key was there, which is
  // what lets the caller distinguish "took it out" from "nothing to take out"
  // without comparing texts. Removing an absent key is not an error here; it
  // yields the file unchanged, and checks() reports it as done.
  function unsetField(currentText, field) {
    let obj;
    try { obj = JSON.parse(currentText || '{}'); }
    catch (e) { return { ok: false, error: 'target is not valid JSON: ' + (e?.message || e) }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: 'target JSON is not an object' };
    }
    const had = Object.prototype.hasOwnProperty.call(obj, field);
    const before = had ? obj[field] : undefined;
    delete obj[field];
    return { ok: true, before, removed: had, text: JSON.stringify(obj, null, 2) + '\n' };
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
    const r = p.kind === 'unset-json-field'
      ? unsetField(cur.exists ? cur.text : '{}', p.field)
      : applyField(cur.exists ? cur.text : '{}', p.field, p.value);
    if (!r.ok) return { ok: false, error: r.error };
    return { ...base, after: r.text, fieldBefore: r.before, ...(p.kind === 'unset-json-field' ? { removed: r.removed } : {}) };
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
    return p.kind === 'set-json-field' ? `Set ${p.field} in ${p.path}`
      : p.kind === 'unset-json-field' ? `Remove ${p.field} from ${p.path}`
      : `Update ${p.path}`;
  }

  function prBody(p, r) {
    const lines = [summaryOf(p), ''];
    const detail = detailOf(p);
    if (detail) lines.push(detail, '');
    if (p.caution) lines.push('> **Before merging:** ' + p.caution, '');
    if (JSON_KINDS.includes(p.kind)) {
      lines.push('**Field:** `' + p.field + '`', '');
      lines.push('```json');
      lines.push('- ' + (r.fieldBefore === undefined ? '(not set)' : JSON.stringify(r.fieldBefore)));
      lines.push('+ ' + (p.kind === 'unset-json-field' ? '(removed)' : JSON.stringify(p.value)));
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
    // Preflight first, so a proposal whose premises no longer hold never
    // reaches a write. `done` is not a failure: the end state is what was
    // asked for, so the caller retires the record rather than writing again.
    const pre = checks(p, r);
    if (pre.done) {
      return { ...base, ok: false, done: true,
        error: 'already applied: the target already carries this exact change' };
    }
    const failed = pre.list.filter(c => c.state === 'fail' && c.key.startsWith('expect:'));
    if (failed.length && !force) {
      return { ...base, ok: false, precheck: failed.map(c => c.label + ' (' + c.note + ')'),
        error: 'a declared premise does not hold: ' + failed[0].label + ' — ' + failed[0].note };
    }
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
      const verb = p.kind === 'put-file' ? 'Write'
        : p.kind === 'unset-json-field' ? 'Remove ' + p.field + ' from'
        : 'Set ' + p.field + ' in';
      const msg = message || `${verb} ${p.path} (proposal ${p.id}) via show-repo`;
      const forcedFields = (r.stale || r.gone)
        ? { forced: true, expectedSha: p.expectSha, foundSha: r.sha || null } : {};

      // Commit delivery: straight onto the target ref, which is what the
      // channel has always done and what a one-key config edit deserves.
      // commitUrl rides beside the sha: the applied record is read by people
      // and sessions holding only the JSON, and a URL they can open closes the
      // loop from intent to landed bytes without hand-building it.
      if (mode === 'commit') {
        const res = await gh.saveRaw(p.path, toBase64(r.after), msg, p.ref || '');
        const sha = res?.commit?.sha || null;
        return { ...base, ok: true, deliver: 'commit', created: !r.exists,
          commit: sha, commitUrl: sha ? 'https://github.com/' + p.repo + '/commit/' + sha : null,
          ...forcedFields };
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
      const sha = res?.commit?.sha || null;
      const out = { ...base, ok: true, deliver: mode, created: !r.exists,
        branch: head, baseBranch, branchCreated: made.created,
        commit: sha, commitUrl: sha ? 'https://github.com/' + p.repo + '/commit/' + sha : null,
        ...forcedFields };
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
    PENDING_DIR, APPLIED_DIR, ATTEMPT_DIR, KINDS, JSON_KINDS, DELIVERIES,
    pending, validate, toBase64, applyField, unsetField, current, resolve, apply,
    branchFor, prTitle, prBody, summaryOf, detailOf, checks,
  };
})();
