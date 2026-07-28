(() => {
  if (!window.GH) {
    throw new Error('gh-transfer.js requires window.GH (load gh-api.js first)');
  }

  // Cross-repo file copy on top of the GH client. Loaded on demand (the
  // navigator lazy-loads it on first send), not by the boot chain.
  //
  // The payload stays base64 end to end — no decode/encode round trip — so
  // binaries copy as faithfully as text. Each file lands as its own commit
  // via the Contents API; batch-as-one-commit would need the Git Data API
  // (blobs → tree → commit → ref) and is deliberately out of scope here.
  //
  // Consumed by the .web-tools.json manifest convention: a repo's
  // stage.targets ("owner/repo:dir" strings) name where its staged files
  // usually go, and the show-repo UI feeds those through copyTo.

  const proto = window.GH.prototype;

  // Contents GET that keeps the payload base64. Files over the Contents
  // API's ~1 MB cap come back with empty content; surface that as an error
  // rather than writing an empty file at the destination.
  proto.getRaw = async function(path) {
    const q = this.ref ? `?ref=${this.ref}` : '';
    const data = await this.req(`contents/${path}${q}`);
    if (Array.isArray(data)) throw new Error('Path is a directory');
    const content = (data.content || '').replace(/\s/g, '');
    if (!content && data.size > 0) {
      throw new Error(`File too large for the Contents API (${(data.size / 1024).toFixed(0)} KB)`);
    }
    return { content, sha: data.sha, size: data.size };
  };

  // Contents PUT of base64 content, with the same stale-SHA recovery as
  // gh-store's save(): 409/422 means the file already exists (or a racing
  // write beat us), so refetch the current SHA and retry once. Writes to
  // `branch` when given, else the repo's default branch.
  proto.saveRaw = async function(path, content, message, branch) {
    const put = (sha) => {
      const body = { message, content };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;
      return this.req('contents/' + path, { method: 'PUT', body: JSON.stringify(body) });
    };
    try {
      return await put();
    } catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      const prevRef = this.ref;
      let sha;
      try {
        if (branch) this.ref = branch;
        sha = (await this.getRaw(path)).sha;
      } finally {
        this.ref = prevRef;
      }
      return put(sha);
    }
  };

  // Copy `paths` from this repo@ref into dest = { repo, dir, ref }.
  // Sequential on purpose: ordered commits at the destination, no rate-limit
  // bursts. Each source path keeps its full path under dest.dir (provenance
  // preserved, collisions impossible). A failed file doesn't abort the batch;
  // the per-file result carries status 'ok' | 'error'.
  //   opts.message                 override the per-file commit message
  //   opts.onProgress(done, total, path, status)
  // Returns [{ path, to, status, error? }].
  proto.copyTo = async function(dest, paths, opts = {}) {
    if (!dest || !dest.repo) throw new Error('copyTo needs a destination repo');
    const destGh = new this.constructor({ token: this.token, repo: dest.repo });
    destGh.ref = dest.ref || ''; // '' = the destination's default branch
    const dir = (dest.dir || '').replace(/^\/+|\/+$/g, '');
    const results = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const to = (dir ? dir + '/' : '') + path;
      opts.onProgress?.(i, paths.length, path, 'copying');
      let r;
      try {
        const src = await this.getRaw(path);
        const msg = opts.message || `Copy ${path} from ${this.repo}@${this.ref}`;
        await destGh.saveRaw(to, src.content, msg, dest.ref || '');
        r = { path, to, status: 'ok' };
      } catch (e) {
        r = { path, to, status: 'error', error: e.message || String(e) };
      }
      results.push(r);
      opts.onProgress?.(i + 1, paths.length, path, r.status);
    }
    return results;
  };

  // ── Branch and pull-request creation ──────────────────────────────────────
  // The Contents API can write to a ref that exists but cannot make one, and
  // cannot open a pull request at all. Both are one POST each, and both live
  // here rather than in the boot chain because only a write path needs them.

  // The repo's default branch name, which the API knows and this client does
  // not: an empty ref means "the default" everywhere else, so anything that has
  // to NAME the branch (a PR base, a new branch's starting point) resolves it
  // here rather than guessing at 'main'.
  proto.defaultBranch = async function() {
    if (this._defaultBranch) return this._defaultBranch;
    const meta = await this.req('');
    this._defaultBranch = meta.default_branch || 'main';
    return this._defaultBranch;
  };

  // Create `branch` at the tip of `from` (the default branch when empty).
  // Returns { branch, sha, created }: an existing branch is reported rather
  // than treated as an error, since re-applying onto a branch that is already
  // there is a resume, not a collision.
  proto.createRef = async function(branch, from) {
    const base = from || await this.defaultBranch();
    const tip = await this.req(`git/ref/heads/${encodeURIComponent(base)}`);
    const sha = tip?.object?.sha;
    if (!sha) throw new Error(`could not read the tip of ${base}`);
    try {
      await this.req('git/refs', {
        method: 'POST',
        body: JSON.stringify({ ref: 'refs/heads/' + branch, sha }),
      });
      return { branch, sha, created: true };
    } catch (e) {
      // 422 is "reference already exists". Anything else is real.
      if (e.status !== 422) throw e;
      return { branch, sha, created: false };
    }
  };

  // Open a pull request. Draft is the default: a proposal arriving as a PR is
  // for reading, and marking it ready is the reviewer's move, the same rule the
  // session conventions apply to their own PRs.
  proto.createPull = async function({ title, head, base, body, draft = true }) {
    const target = base || await this.defaultBranch();
    return this.req('pulls', {
      method: 'POST',
      body: JSON.stringify({ title, head, base: target, body: body || '', draft }),
    });
  };
})();
