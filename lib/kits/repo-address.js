// The `owner/repo[@ref]:path` address, in one place.
//
// The grammar is the estate's one addressing convention: stage items, manifest
// entries, toss and data-view sources, and the inbox/outbox destinations below
// all speak it. It had grown three copies that agreed on shape and disagreed on
// one thing, what a missing `@ref` means. Those three (StageLink.parseItem,
// DataPayload.parseSpec, ShorterPayload.parseSpec) now delegate here, keeping
// their exported names, so the grammar has one implementation.
//
// The one copy that stays is the inline parser in pages/toss-render.html: that
// page's critical render path loads no lib on purpose, and its head comment
// says so. tools/test/repo-address.test.mjs holds the delegates to this
// module's answers, and holds the load order the delegation depends on: a
// component registers during the pre-build's boot, before a page's own gh.load
// chain runs, so repo-address.js boots ahead of the components.
//
// THE REF RULE, since it is the whole question: parse() reports what the
// address SAID, so a missing ref is '' (unspecified), never a guess. '' is
// correct for fetching, because the contents API falls through to the repo's
// default branch, which is right even when that branch is not named main. A
// concrete ref is only needed when BUILDING A LINK (blob/raw/CDN URLs all
// interpolate it and break on ''), and that is the caller's boundary, so
// ref(addr, fallback) is where a fallback belongs. Parse honestly; resolve
// late.
//
// Attaches to window.RepoAddress, loaded via gh.load('kits/repo-address.js').
(() => {
  // ':' cannot appear in a git ref name, which is what makes the split
  // unambiguous. The repo half is non-greedy so `a/b@feat/x:p` splits at the
  // first '@', leaving slashed ref names intact.
  const ADDR_RE = /^([\w.-]+\/[\w.-]+?)(?:@([^:]+))?:(.+)$/;

  // "owner/repo[@ref]:path" -> { repo, ref, path } | null. Null means the
  // string is not an address, so a caller may read it as a bare path in
  // whatever repo it already has.
  function parse(spec) {
    const m = String(spec == null ? '' : spec).trim().match(ADDR_RE);
    return m ? { repo: m[1], ref: m[2] || '', path: m[3] } : null;
  }

  // The link-building boundary: the only place a fallback is legitimate. Pass
  // the repo's real default branch when it is known (the shell scans it), and
  // 'main' only as a last resort.
  function ref(addr, fallback) {
    return (addr && addr.ref) || fallback || '';
  }

  function fmt(addr) {
    if (!addr || !addr.repo || !addr.path) return '';
    return addr.repo + (addr.ref ? '@' + addr.ref : '') + ':' + addr.path;
  }

  // ── What a pasted string NAMES ────────────────────────────────────────────
  //
  // parse() answers "is this string an address". This answers the question a
  // paste actually asks, which is one step wider: a reader who copies something
  // and pastes it into a surface that can open files has, in practice, copied
  // one of three things, and only the first is an address.
  //
  //   owner/repo[@ref]:path                the grammar itself
  //   …/toss-render.html#gh=<address>      a toss, whose subject is the point
  //   …/toss-render.html#<route>=<address> a typed toss, ditto
  //
  // A toss link is the shape most likely to be in a clipboard, because it is
  // what gets handed over in chat, and the renderer wrapping the file is never
  // the thing meant by pasting it. Any route key is accepted rather than a list
  // of them: toss-render is itself schema-blind about which page a key names
  // (docs/routes-modes.csv, the `<route>` row), so a list here would be a second
  // registry to keep in step with docs/routes-routes.csv for no gain.
  //
  // The `?query` tail an address may carry is SPLIT OFF rather than left on the
  // path, which is the difference from parse(): a caller opening the result has
  // a filename, and toss-render's own handling of that tail is to hand it to the
  // page as its query, so both halves stay usable. `#frag` is dropped, since it
  // belongs to the rendered page rather than to the file being named.
  //
  // Pure: no location read, so a caller decides for itself what counts as its
  // own origin. Returns { repo, ref, path, query } or null.
  function fromPaste(text) {
    const s = String(text == null ? '' : text).trim();
    // Multi-line is never an address. A block of refs is content, and a caller
    // that stages content needs that decision made here rather than guessed at.
    if (!s || /[\r\n]/.test(s)) return null;
    let addr = parse(s);
    if (!addr && /^https?:\/\//i.test(s)) {
      let u; try { u = new URL(s); } catch (e) { return null; }
      if (!/\/toss-render\.html$/.test(u.pathname)) return null;
      const seg = u.hash.replace(/^#/, '').split('&')[0];
      const at = seg.indexOf('=');
      if (at < 1) return null;
      addr = parse(decodeURIComponent(seg.slice(at + 1)));
    }
    if (!addr) return null;
    const q = addr.path.indexOf('?');
    const rest = q < 0 ? '' : addr.path.slice(q + 1);
    return {
      repo: addr.repo,
      ref: addr.ref,
      path: (q < 0 ? addr.path : addr.path.slice(0, q)).replace(/#.*$/, ''),
      query: rest.replace(/#.*$/, ''),
    };
  }

  // ── inbox / outbox ────────────────────────────────────────────────────────
  // A repo declares two optional locations in its .web-tools.json:
  //   inbox   where an unaddressed deposit lands (the receiver's choice)
  //   outbox  where it stages material for others to pull
  //
  // FOLDER OR BRANCH was the open design question, and the answer is: one
  // field shape that can express either, defaulting to a folder on the repo's
  // default branch. So the fork stops being a global decision and becomes a
  // per-repo one, with the discoverable option as the default.
  //
  //   "inbox"                     the folder inbox/ on the default branch
  //   "@drop:incoming"            the folder incoming/ on the branch `drop`
  //   "owner/repo@ref:dir"        a full address, for a box that lives elsewhere
  //
  // Folder is the default for two reasons. A folder is visible in ordinary
  // browsing, while a branch is invisible unless something points at it, and a
  // consumer that forgets the ref reads the default branch and silently finds
  // nothing. And writing into a branch presumes the branch exists: the Contents
  // API can PUT to an existing one, but creating a ref needs the Git Data API,
  // which this lib does not carry. A repo that wants transient bulk kept off
  // its main history can still say so, by naming a ref.
  //
  // Returns { repo, ref, dir } or null when nothing is declared. `dir` is
  // normalized without leading or trailing slashes; '' means the repo root.
  function parseBox(spec, selfRepo) {
    const s = String(spec == null ? '' : spec).trim();
    if (!s) return null;
    const full = parse(s);
    if (full) return { repo: full.repo, ref: full.ref, dir: trimDir(full.path) };
    const m = s.match(/^@([^:]+):(.*)$/);          // "@ref:dir", this repo
    if (m) return { repo: selfRepo || '', ref: m[1], dir: trimDir(m[2]) };
    return { repo: selfRepo || '', ref: '', dir: trimDir(s) };   // a bare folder
  }

  const trimDir = (d) => String(d || '').replace(/^\/+|\/+$/g, '');

  // The declared box, or null. Reads a config object the caller already has;
  // fetching the receiver's manifest is the caller's job, since only it knows
  // whether it holds one already.
  function box(config, which, selfRepo) {
    return parseBox(config && config[which], selfRepo);
  }

  window.RepoAddress = { parse, ref, fmt, fromPaste, parseBox, box, ADDR_RE };
})();
