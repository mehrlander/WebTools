(() => {
  if (!window.GH) {
    throw new Error('gh-store.js requires window.GH (load gh-fetch.js first)');
  }

  const bytesToBase64 = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };
  const utf8ToBase64 = (str) => bytesToBase64(new TextEncoder().encode(str));

  // Commit already-base64 content to a path, riding out write conflicts.
  // The text and byte savers below differ only in how they reach this base64.
  //
  // The instance's ref names the branch the write lands on: reads always
  // honored it (gh.get sends ?ref=) while the PUT silently omitted `branch`
  // and landed on the default, so a GH pointed at a branch read one thing and
  // wrote another. Fixed 2026-08-08 for the stage's deposit-to-branch send;
  // an empty ref keeps the old default-branch behavior.
  //
  // The first conflict is the common case (no SHA in hand, or a stale one) and
  // recovers immediately; conflicts past that mean the branch is taking other
  // commits right now, and one immediate retry loses that race often enough to
  // surface (the registry repo takes a commit on every session Stop, and its
  // cache saves were failing against exactly that traffic). So later attempts
  // back off briefly before refetching, and the whole thing gives up after
  // PUT_TRIES rather than looping against a hot branch.
  //
  // The refetch MUST bypass the HTTP cache, and for a year it did not. GitHub
  // caches an API read for 60 seconds in the browser, so the recovery re-read
  // the very sha that had just been rejected, PUT_TRIES times, and threw. The
  // retry loop looked sound and was inert. Measured 2026-08-13; the full
  // account is on GH.FRESH in gh-api.js, which is what this passes.
  const PUT_TRIES = 4;
  const FRESH = () => (window.GH && window.GH.FRESH) || { cache: 'no-store' };
  async function putContent(gh, path, content, message) {
    const msg = message || `update ${path}`;
    gh._shas ||= {};
    const put = () => {
      const body = { message: msg, content };
      if (gh._shas[path]) body.sha = gh._shas[path];
      if (gh.ref) body.branch = gh.ref;
      return gh.req('contents/' + path, { method: 'PUT', body: JSON.stringify(body) });
    };
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await put();
        gh._shas[path] = res.content.sha;
        return res;
      } catch (e) {
        // 409 = write race (stale SHA, or the branch advanced mid-commit).
        // 422 = file exists but no SHA in body. Both recover the same way:
        // refetch the current SHA and put again.
        if ((e.status !== 409 && e.status !== 422) || attempt >= PUT_TRIES) throw e;
        if (attempt > 1) await new Promise(r => setTimeout(r, 250 * attempt + Math.random() * 250));
        // A 404 here means the file vanished under us (deleted concurrently);
        // clearing the cached SHA lets the next put recreate it.
        const cur = await gh.get(path, FRESH()).catch(ge => { if (ge?.status === 404) return null; throw ge; });
        if (cur) gh._shas[path] = cur.sha; else delete gh._shas[path];
      }
    }
  }

  // Text (or JSON.stringify'd) content. Unchanged interface.
  window.GH.prototype.save = function(path, value, message) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return putContent(this, path, utf8ToBase64(text), message);
  };

  // Raw bytes (Uint8Array/ArrayBuffer): the binary-safe sibling of save(), for
  // committing a dropped file whose bytes must survive untouched (an image, a
  // zip). Text through here would work too, but save() is the clearer path.
  window.GH.prototype.saveBytes = function(path, bytes, message) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return putContent(this, path, bytesToBase64(u8), message);
  };

  // Remove a file. The contents API requires the blob's current sha on a
  // delete, and unlike a put there is no create-if-absent to fall back on, so
  // this reads the sha first rather than trusting the cache the savers keep:
  // a stale one fails the whole call, where a put recovers by retrying. That
  // makes the HTTP cache costlier here than anywhere else (no retry stands
  // behind it), so the read is FRESH: deleting a file that was written in the
  // last minute would otherwise fail on a sha the browser never re-requested.
  // Deleting what is not there is not an error, since the caller's intent (the
  // path should not exist) is already satisfied.
  window.GH.prototype.del = async function(path, message) {
    let sha = null;
    try {
      const meta = await this.req('contents/' + path + (this.ref ? '?ref=' + encodeURIComponent(this.ref) : ''), FRESH());
      sha = Array.isArray(meta) ? null : meta.sha;
    } catch (e) {
      if (e?.status === 404) return { deleted: false, reason: 'absent' };
      throw e;
    }
    if (!sha) throw new Error('not a file: ' + path);
    await this.req('contents/' + path, {
      method: 'DELETE',
      body: JSON.stringify({ message: message || 'delete ' + path, sha }),
    });
    if (this._shas) delete this._shas[path];
    return { deleted: true };
  };
})();
