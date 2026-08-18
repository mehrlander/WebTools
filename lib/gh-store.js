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
  // Six rather than four, with the backoff reaching seconds rather than one, and
  // the reason is a layer below the HTTP cache: GitHub's contents API is
  // read-after-write EVENTUAL, so the recovery read can be answered by a replica
  // that has not seen the commit yet and hands back the sha that was just
  // rejected. No cache header reaches that. Patience is the only lever this file
  // has, and it is the weaker of the two: a caller that knows the sha it wrote
  // should pass it (see `opts.sha` below and lib/kits/last-write.js), which
  // needs no read at all.
  // The recovery needs ONE FACT, the blob sha, and used to buy it with the whole
  // file. Measured 2026-08-17 off the crawl's own call log: a single activity
  // refresh read `state/activity.json` eleven times for 7.2 MB, and five of
  // those reads were this recovery fetching 370 KB to look at 40 characters. The
  // parent directory's listing carries every entry's sha and none of their
  // bytes, so the same recovery costs about a kilobyte. Falls back to the file
  // read when there is no directory to list or the listing does not name it.
  async function currentSha(gh, path) {
    const cut = path.lastIndexOf('/');
    if (cut > 0) {
      try {
        const rows = await gh.ls(path.slice(0, cut), FRESH());
        const hit = (rows || []).find(r => r.name === path.slice(cut + 1));
        if (hit && hit.sha) return hit.sha;
      } catch (e) { if (e?.status === 404) return null; }
    }
    const cur = await gh.get(path, FRESH()).catch(ge => { if (ge?.status === 404) return null; throw ge; });
    return cur ? cur.sha : null;
  }

  const PUT_TRIES = 6;
  const FRESH = () => (window.GH && window.GH.FRESH) || { cache: 'no-store' };
  async function putContent(gh, path, content, message, opts = {}) {
    const msg = message || `update ${path}`;
    gh._shas ||= {};
    // An explicit sha wins over anything cached: the caller passing one is
    // telling this function the answer a read would only guess at.
    if (opts.sha) gh._shas[path] = opts.sha;
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
        if (attempt > 1) await new Promise(r => setTimeout(r, 400 * attempt * attempt + Math.random() * 250));
        // A 404 here means the file vanished under us (deleted concurrently);
        // clearing the cached SHA lets the next put recreate it.
        const cur = await currentSha(gh, path);
        if (cur) gh._shas[path] = cur; else delete gh._shas[path];
      }
    }
  }

  // Text (or JSON.stringify'd) content. Unchanged interface.
  // `opts.sha` is for a caller that already knows the file's current blob sha,
  // typically because it wrote it (lib/kits/last-write.js). It skips the guess a
  // read would make and is the only thing that helps when the API's own read is
  // lagging behind its own write.
  window.GH.prototype.save = function(path, value, message, opts = {}) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return putContent(this, path, utf8ToBase64(text), message, opts);
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
