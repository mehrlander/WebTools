// ── last-write: the copy this page just committed, for the next fold ───────
//
// A crawl reads a committed JSON file, folds new facts into it, and writes it
// back. That is safe exactly as long as the read answers with the current file.
// It does not always: **GitHub's contents API is read-after-write eventual**, so
// a read seconds after a commit can still be served the version that commit
// replaced, blob sha and all. Measured 2026-08-16 in the estate's split activity
// refresh, which commits twice in a row: the scan pass read the copy the quick
// pass had just written over, and its PUT failed `409 does not match <sha>` four
// times against a sha the API kept handing back. The browser's own 60-second
// cache was ruled out first (`GH.FRESH` on every read that feeds a write); this
// is the layer under that one, and no cache header reaches it.
//
// The 409 is the guardrail, not the bug, and that is the whole reason this kit
// is small: had the stale read carried a matching sha, the second pass would
// have folded onto the first pass's base and silently reverted it. What is
// needed is not a longer retry but a better answer to "what is the current
// document", and this page already holds it: the bytes it just wrote, and the
// sha the write returned.
//
// So: note what you write, and reconcile what you read against it. Newest
// stamp wins, and the stamp is the document's own (`generatedAt` by default),
// never the clock, so two writers cannot disagree about whose copy is later
// for any reason but the documents themselves.
//
// WHAT THIS IS NOT. It is not a cache: nothing here is read to save a request,
// and a reader that never writes never sees it. It is not a merge either. It
// answers one question, for one file, from one page's own history: is the copy
// I was just handed older than the one I put there?
(function () {
  const KEY = (repo, path) => repo + ':' + path;

  window.LastWrite = {
    // repo + path -> { doc, sha, stamp }
    _by: new Map(),

    // After a successful save. `sha` is the blob sha the PUT returned, which is
    // the one fact a lagging read cannot supply and the next write needs.
    note(repo, path, doc, sha, stampField = 'generatedAt') {
      this._by.set(KEY(repo, path), { doc, sha, stamp: doc?.[stampField] || '' });
      return this;
    },

    // What the caller should fold onto, given what the read returned.
    // `read` is `{ doc, sha }` or null for a 404. Returns the same shape plus
    // `ours: true` when this page's copy is the newer one, so a caller can say
    // so rather than silently substituting.
    //
    // Strictly newer, not newer-or-equal: an equal stamp means the read caught
    // up, and preferring ours there would keep a superseded copy alive after
    // another writer legitimately replaced it with one stamped the same second.
    reconcile(repo, path, read, opts = {}) {
      const mine = this._by.get(KEY(repo, path));
      if (!mine) return read;
      const stamp = opts.stampField || 'generatedAt';
      const theirs = read?.doc?.[stamp] || '';
      if (read && theirs && mine.stamp && theirs >= mine.stamp) return read;
      // A 404 after a write is the same lag wearing a different hat: the file
      // exists, the replica has not seen it. Ours is the honest answer there too.
      if (read && !mine.stamp) return read;
      return { doc: mine.doc, sha: mine.sha, ours: true };
    },

    // Drop what is known about a path. For a caller that has learned its copy
    // is no longer relevant (a different branch, a signed-out client), since a
    // stale note would otherwise outlive its usefulness for the page's life.
    forget(repo, path) { this._by.delete(KEY(repo, path)); return this; },
  };
})();
