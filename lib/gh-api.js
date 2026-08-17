if (typeof window !== 'undefined' && !window.__consoleLogs) {
  window.__consoleLogs = [];
  ['log', 'warn', 'error', 'info'].forEach(level => {
    const orig = console[level];
    console[level] = (...args) => {
      const entry = {
        level,
        msg: args.map(a => {
          try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); }
          catch (e) { return String(a); }
        }).join(' '),
        time: Date.now()
      };
      window.__consoleLogs.push(entry);
      window.dispatchEvent(new CustomEvent('consolelog', { detail: entry }));
      orig.apply(console, args);
    };
  });
  window.addEventListener('error', e => {
    const entry = { level: 'error', msg: e.message || String(e), time: Date.now() };
    window.__consoleLogs.push(entry);
    window.dispatchEvent(new CustomEvent('consolelog', { detail: entry }));
  });
  // A rejected dynamic import() (e.g. cm6's module load) surfaces here, not via
  // 'error'. Capturing it means __consoleLogs carries the cause next time.
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    const entry = { level: 'error', msg: 'Unhandled rejection: ' + ((r && (r.message || r.stack)) || String(r)), time: Date.now() };
    window.__consoleLogs.push(entry);
    window.dispatchEvent(new CustomEvent('consolelog', { detail: entry }));
  });
}

export default class GH {
  // Read options for a read whose answer feeds a write, passed to get() or req().
  //
  // GitHub sends `Cache-Control: private, max-age=60` on an API read, so the
  // browser answers a repeat GET of the same URL from its HTTP cache for the
  // next minute with no request at all. Measured 2026-08-13 against a to-do
  // check-off in show-repo's Lists pane: the write landed
  // (web-tools-private 26fe0960), and every write to that path for the rest of
  // the minute failed with `409 does not match db348d1…`, the blob sha of the
  // version the pane had loaded. gh-store's conflict recovery is built to
  // refetch the current sha and retry, and it did, four times, each time being
  // handed the same dead sha out of the cache. A recovery path that re-reads
  // through the cache it is recovering from cannot converge.
  //
  // This is the same failure as the `?use=` loaders' (tools/test/
  // use-ref-no-store.test.mjs): a URL whose content moved under a cache keyed
  // on the URL. Named once, as a constant, because the fix is a single option
  // in a call that otherwise looks correct, which is how it went missing.
  static FRESH = { cache: 'no-store' };

  constructor(conf = {}) {
    this.token = conf.token || '';
    this.repo = conf.repo || '';
    this.ref = conf.ref || 'main';
    // Prefix prepended to non-http load() paths, so gh.load('kits/x.js')
    // resolves against the loader's own folder (e.g. 'lib/'). Set by the
    // auto-bootstrap from the ref-URL; defaults to '' for repo-root loads.
    this.loadBase = conf.loadBase || '';
  }

  async load(path) {
    // In-flight census for the boot's load-race guard (gh-boot.js): while a
    // page's chain is still loading, a fallback Alpine started over it would
    // init inline x-data against helpers that have not arrived. Counted on the
    // CLASS so every instance's loads pool into one answer, with _loadQuietAt
    // marking the last completion: the guard demands a beat of silence rather
    // than sampling the microtask gap between two awaited loads, where the
    // count dips to zero without the chain being done.
    const C = this.constructor;
    C._loading = (C._loading || 0) + 1;
    try {
      let text;
      if (path.startsWith('http')) {
        const url = path.includes('raw.github') && !path.includes('?')
          ? `${path}?t=${Date.now()}`
          : path;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load script: ${res.status} (${url})`);
        text = await res.text();
      } else {
        const full = this.loadBase + path;
        let file;
        try {
          file = await this.get(full);
        } catch (e) {
          throw new Error(`Failed to load script ${full}: ${e.message}`);
        }
        text = file.text;
      }

      // Loaded files are plain script bodies (IIFE / window.* / optional top-level
      // return) per the loader contract — run them as-is. We deliberately do NOT
      // rewrite the source: a blanket `export` strip silently corrupts any file that
      // carries the token in a string or comment (e.g. a code-gen kit that emits an
      // `export default`). gh-api.js itself keeps `export default` for its import()
      // path; it is never loaded through here.
      const scopedGh = new Proxy(this, {
        get: (target, prop) => {
          if (prop === 'load') {
            return (p, opts) => target.load.call(target, p, { ...opts, by: path });
          }
          return target[prop];
        }
      });

      await new Function('gh', text)(scopedGh);
    } finally {
      C._loading -= 1;
      C._loadQuietAt = Date.now();
    }
  }

  // read() is the data twin of load(): load() runs a file for its side effects
  // and discards the result; read() runs a file and returns what it produces.
  // The point is a develop-online / ship-local swap on one call — a page reads
  // by path, and the same path resolves to a local file if one is present,
  // otherwise to the repo. The two sources need two delivery mechanisms, and
  // each carries its payload back without touching window:
  //
  //   local — inject <script src=path>. A <script> is the only thing that runs
  //           on file://, where fetch can't reach a sibling file. The file
  //           deposits its payload on its own element:
  //               document.currentScript.value = <payload>;
  //           and read() lifts it off the node it injected (private, unique per
  //           call, garbage-collected on remove). If there's no such file the
  //           script 404s and read() falls through to the repo.
  //   repo  — fetch the file via the API (private-safe; a <script> tag can't
  //           carry the token) and run it with `gh` injected, like load(). The
  //           file just returns its payload:
  //               return <payload>;
  //
  // Note: read() does not apply loadBase (data lives at the repo root, not under
  // lib/ like loaded code), and the local <script src> resolves relative to the
  // page, so a shipped local file lays its data out beside the HTML to match.
  async read(path) {
    const local = await this._local(path);
    if (local !== undefined) return local;

    const text = (await this.get(path)).text;
    // Run the read file as-is (no export-strip; see load()).
    return await new Function('gh', text)(this);
  }

  // Inject <script src=path> and resolve the value the file left on its element,
  // or undefined if the file isn't there (or there's no DOM to inject into).
  _local(path) {
    if (typeof document === 'undefined') return Promise.resolve(undefined);
    return new Promise(resolve => {
      const s = document.createElement('script');
      s.src = path;
      s.onload = () => { const v = s.value; s.remove(); resolve(v); };
      s.onerror = () => { s.remove(); resolve(undefined); };
      document.head.appendChild(s);
    });
  }

  get headers() {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token && !this.token.includes('🎟')) {
      h.Authorization = `Bearer ${this.token.trim()}`;
    }
    return h;
  }

  async req(path, opts = {}) {
    const base = path.startsWith('/')
      ? 'https://api.github.com'
      : `https://api.github.com/repos/${this.repo}`;

    const url = path.startsWith('http')
      ? path
      : `${base}/${path.replace(/^\//, '')}`;

    // ONE RETRY, FOR THE NETWORK ONLY. A rejected fetch is not GitHub saying
    // anything: it is the connection dropping, and on a phone that is a normal
    // event rather than an error. It cost a whole crawl (2026-08-17, a refresh
    // on 5G died at "Activity refresh failed: Load failed" after 300-odd
    // successful calls), and one retry is the difference between a dropped
    // packet and a wasted run.
    //
    // READS ONLY, and the restriction is the safety: a PUT that failed to
    // answer may still have landed, so retrying it risks a second commit. A GET
    // cannot. The final throw names the call, since "Load failed" alone is a
    // toast nobody can act on.
    const method = String(opts.method || 'GET').toUpperCase();
    const idempotent = method === 'GET' || method === 'HEAD';
    let res;
    for (let attempt = 1; ; attempt++) {
      try { res = await fetch(url, { headers: this.headers, ...opts }); break; }
      catch (e) {
        if (idempotent && attempt === 1) { await new Promise(r => setTimeout(r, 600)); continue; }
        const err = new Error(`Network error on ${method} ${path}: ${e?.message || e}`);
        err.status = 0;
        err.cause = e;
        throw err;
      }
    }

    if (!res.ok) {
      const limit = res.headers.get('x-ratelimit-remaining');
      // Carry GitHub's own message: the status alone cannot separate a commit
      // race ("is at ... but expected ...") from a real permission or rate
      // problem, and the rate figure shown here has been read as the cause of
      // failures it had nothing to do with.
      let detail = '';
      try { detail = (await res.json())?.message || ''; } catch {}
      const err = new Error(`GitHub Error ${res.status}${detail ? ': ' + detail : ''} (Rate Rem: ${limit})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // `opts` rides through to fetch, and the one that matters is `cache`.
  // GitHub answers an API read with `Cache-Control: private, max-age=60`, so a
  // repeat GET of the same URL inside that minute is served by the browser's
  // HTTP cache without touching the network. That is fine for a view and wrong
  // for anything computing a write: `gh.get(path, GH.FRESH)` is how a caller
  // says it needs the sha and the bytes as they are NOW, not as they were when
  // the pane opened. See GH.FRESH below for what it cost to learn that.
  // The bytes, undecoded. `get` is this plus UTF-8, and that decode is lossy
  // by construction for anything that is not text: a PNG or a gzip comes back
  // as replacement characters, which is why a caller that means to SHOW one
  // (an image, the text inside an archive) has to start here instead.
  async bytes(path, opts = {}) {
    const data = await this.req(`contents/${path}?ref=${this.ref}`, opts);
    if (Array.isArray(data)) throw new Error('Path is a directory');
    // The contents API empties "content" for files over 1 MB. Fall back to the
    // git blobs API by sha (base64, served up to 100 MB) and keep the metadata
    // this response already carries, so the return shape is unchanged.
    const content = data.content
      ? data.content
      : (await this.req(`git/blobs/${data.sha}`, opts)).content;
    const bin = atob(String(content).replace(/\s/g, ''));
    return {
      bytes: Uint8Array.from(bin, c => c.charCodeAt(0)),
      sha: data.sha,
      size: data.size,
      url: data.html_url
    };
  }

  async get(path, opts = {}) {
    const b = await this.bytes(path, opts);
    return {
      text: new TextDecoder().decode(b.bytes),
      sha: b.sha,
      size: b.size,
      url: b.url
    };
  }

  // Distinct files touched by the most recent commits on the current ref, newest
  // first. Fetches commit details in small parallel batches (newest first) and
  // collects each commit's file list until `n` unique paths are gathered or
  // commits run out. One list call plus up to `n*2` commit-detail calls, fired
  // BATCH at a time: latency is one round trip per batch (usually one batch
  // total) instead of one per commit, while the request count stays close to
  // the old serial walk — firing all details at once would spend the
  // unauthenticated rate limit on commits whose files repeat.
  async recentFiles(n = 8) {
    const commits = await this.req(`commits?sha=${encodeURIComponent(this.ref)}&per_page=${n * 2}`);
    const seen = new Map();
    const BATCH = 6;
    for (let i = 0; i < commits.length && seen.size < n; i += BATCH) {
      const batch = commits.slice(i, i + BATCH);
      const details = await Promise.all(
        batch.map(c => this.req(`commits/${c.sha}`).catch(() => null))
      );
      for (let j = 0; j < batch.length && seen.size < n; j++) {
        for (const f of (details[j]?.files || [])) {
          if (seen.has(f.filename)) continue;
          seen.set(f.filename, { path: f.filename, date: batch[j].commit.author.date, sha: batch[j].sha });
          if (seen.size >= n) break;
        }
      }
    }
    return [...seen.values()];
  }

  // ── jsDelivr: an unauthenticated, cached, high-limit read path for PUBLIC
  // repos, complementing the token-gated GitHub API above. GitHub's anonymous
  // REST API is capped at 60 req/hr/IP, and recentFiles alone can spend that;
  // jsDelivr serves public repos through its CDN with no token and no GitHub
  // quota. Two limits: public repos only (a private repo 404s), and the listing
  // is jsDelivr's cache of a ref, so a fresh push can lag ~12h. flatTree is the
  // whole file list in one call; rawUrl is the CDN address for a file's bytes.
  static async flatTree(repo, ref = 'main') {
    const url = 'https://data.jsdelivr.com/v1/packages/gh/' + repo + '@' + encodeURIComponent(ref) + '?structure=flat';
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error('jsDelivr ' + res.status + ' for ' + repo + '@' + ref);
      err.status = res.status;
      throw err;
    }
    const j = await res.json();
    return (j.files || []).map(f => ({ path: String(f.name).replace(/^\//, ''), size: f.size || 0 }));
  }
  flatTree(ref) { return GH.flatTree(this.repo, ref || this.ref); }
  rawUrl(path, ref) {
    return 'https://cdn.jsdelivr.net/gh/' + this.repo + '@' + (ref || this.ref) + '/' + String(path).replace(/^\//, '');
  }

  decode(str) {
    const binString = atob(str.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binString, c => c.charCodeAt(0)));
  }
}

// Auto-bootstrap when loaded as a page's lib entry point: exposes a
// ready-to-use window.gh. Two carriers supply repo/ref, so the jsDelivr import
// and the raw + blob-import ?use= path bootstrap identically:
//   - the jsDelivr @<ref> URL this file was imported from (the no-?use default
//     and off-Pages consumers), parsed out of import.meta.url; or
//   - window.__ghBlobBoot = { repo, ref }, set by a ?use= boot that fetched
//     this file from raw.githubusercontent and blob-imported it, since
//     import.meta.url is then a blob: URL with no ref to parse.
// See README.md for the ?use= page convention.
const blobBoot = typeof window !== 'undefined' ? window.__ghBlobBoot : null;
const m = !blobBoot && typeof window !== 'undefined' &&
  import.meta.url.match(/\/\/cdn\.jsdelivr\.net\/gh\/([^/]+\/[^/@]+)@(.+?)\/lib\/gh-api\.js/);
const boot = m ? { repo: m[1], ref: m[2] } : blobBoot;
if (boot) {
  window.GH = GH;
  // loadBase: 'lib/' so the chained gh.load('gh-boot.js') and every relative
  // load after it resolve under lib/. A slashed ref (e.g. a branch) is carried
  // whole either way: the regex anchors on /lib/gh-api.js, and __ghBlobBoot
  // holds the ref verbatim.
  window.gh = new GH({ repo: boot.repo, ref: boot.ref, loadBase: 'lib/' });
  window.__bundleRef = boot.ref;
  await window.gh.load('gh-boot.js');
}
