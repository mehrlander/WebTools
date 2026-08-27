// surface.js — the surface envelope, in one place.
//
// A surface is a curated, annotated set of items presented for a reason at a
// moment (docs/envelopes/surface.md; the core schema is v2). This module reads
// one, writes one, and answers where each of its items lives. It knows nothing
// about who displays it: the contract carries several profiles (branch-review,
// inquiry, stage), and a reader picks up the file it was handed.
//
// TWO JOBS, and the split matters because only the first is version-aware:
//
//   read/write   the envelope, dual-reading v1 and normalizing to v2 in memory.
//                v1 files are never rewritten in place: read() normalizes for
//                display, so a v1 file stays v1 until someone deliberately
//                saves it as v2. Not a legacy path: every .surface file that
//                exists today is v1.
//   source/ref/  item reading. Every consumer asked "where does this item
//   local/key/gh live" slightly differently; now they ask here.
//
// WHAT IS NOT HERE, deliberately. Nothing about sending, bundling, or a
// destination folder's contents. The test a field has to pass to enter the
// envelope is that it is still true a year later with no tool running: a
// proposed destination passes (it is a claim about the set), a send in flight
// does not (it is the state of a process).
//
// AND NO STAGE BRIDGE, as of 2026-08-27. fromStage/toStage promoted a working
// fileset to a saved surface and pulled one back, which made this module the
// place the assumption "a surface is a saved stage" lived. It was never true
// of the format: branch-review/1 came first and is the profile pages/
// branch.html reads through kits/branch-brief.js. The Stage's Saved pane went
// with them; see docs/envelopes/surface.md.
//
// Attaches to window.Surface, loaded via gh.load('kits/surface.js').
(() => {
  const SCHEMA = { name: 'surface', version: 2 };

  // ── v1, and what it meant ────────────────────────────────────────────────
  // v1's `kind` mixed genre with transport: `github_blob` said both "a file"
  // and "lives on GitHub". v2 splits them into `type` (genre) and
  // `target.source` (location), so the migration is a semantic split rather
  // than a rename. The table below is docs/envelopes/surface.md's, executable.
  const V1_TYPE = {
    github_blob: 'file', github_dir: 'directory', repo: 'repo', url: 'link',
    note: 'note', story: 'story', embed: 'embed',
    local_html: 'file', local_md: 'file', local_text: 'file', image: 'file',
  };
  const V1_LOCAL = { local_html: 'html', local_md: 'markdown', local_text: 'text', image: '' };
  const EXT_FORMAT = {
    md: 'markdown', markdown: 'markdown', html: 'html', htm: 'html',
    json: 'json', js: 'javascript', mjs: 'javascript', css: 'css',
    py: 'python', sh: 'shell', txt: 'text', csv: 'csv', yml: 'yaml', yaml: 'yaml',
  };

  const GH_BLOB = /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/(blob|tree)\/([^/]+)\/(.+?)(?:[?#].*)?$/;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (v == null ? '' : String(v));

  // A doc is v1 by what it says, not by what it lacks: v1 stamped
  // `schema_version`, v2 stamps `schema: {name, version}`. A doc with neither
  // is read as v1, since every file written before the contract is one.
  function isV1(doc) {
    const m = (isObj(doc) && doc.manifest) || {};
    return !(isObj(m.schema) && Number(m.schema.version) >= 2);
  }

  // One v1 item to one v2 item. Unknown kinds keep their name as `type`: the
  // app-generated kinds (recent, downloads, chron_thread, script) are open by
  // design and mean the same thing on both sides.
  function upItem(it, i) {
    if (!isObj(it)) return null;
    const kind = str(it.kind);
    const type = V1_TYPE[kind] || kind || 'file';
    const out = {
      id: str(it.id) || str(it.title) || (kind || 'item') + '-' + i,
      title: str(it.title) || str(it.path) || str(it.url) || '(untitled)',
      type,
    };
    // Location. A repo-backed kind carries the triple; a url carries a uri; a
    // local kind carries a bare path, which the contract defines as local to
    // whatever environment renders the surface.
    if (it.repo && (it.path || kind === 'repo')) {
      out.target = { source: { repository: str(it.repo), path: str(it.path) || undefined } };
      if (it.ref) out.target.source.ref = str(it.ref);
    } else if (GH_BLOB.test(str(it.url))) {
      // v1 let a repo-backed item carry only a github.com URL instead of the
      // triple. Unpacking it here rather than at every read site is the whole
      // reason normalization exists: the leniency is a v1 fact, not a v2 one.
      const m = str(it.url).match(GH_BLOB);
      out.target = { source: { repository: m[1], ref: m[3], path: m[4] } };
      if (m[2] === 'tree') out.type = 'directory';
    } else if (kind === 'url' && it.url) {
      out.target = { source: { uri: str(it.url) } };
    } else if (kind in V1_LOCAL && it.path) {
      out.target = { source: { path: str(it.path) } };
    }
    if (kind in V1_LOCAL && V1_LOCAL[kind]) out.format = V1_LOCAL[kind];
    // v1 put prose bodies on `body` for note/story; v2 has one `content`.
    if (it.body != null) { out.content = str(it.body); out.format = out.format || 'markdown'; }
    // `target` is in this list although v1 never wrote one: a hand-edited file
    // can carry a v2 item under a v1 manifest, and silently discarding the one
    // field that says where the item lives is the worst way to meet that.
    for (const k of ['target', 'format', 'snippet', 'content', 'commentary', 'facet', 'added_at', 'summary', 'metadata', 'related', 'role', 'view', 'change'])
      if (it[k] != null && out[k] == null) out[k] = it[k];
    // An embed's renderer page is app state on a v1 item; it survives as the
    // app-defined field it always was, since estate dispatches on it.
    if (it.page != null) out.page = it.page;
    if (kind === 'embed' && it.repo && it.path && !out.target)
      out.target = { source: { repository: str(it.repo), path: str(it.path), ref: it.ref || undefined } };
    return out;
  }

  // Parse or accept a surface document, normalized to v2 for reading. Returns
  // null for anything that is not a surface at all, so a caller can tell an
  // unreadable file from an empty one.
  function read(doc) {
    let o = doc;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
    if (!isObj(o) || !isObj(o.manifest)) return null;
    const v1 = isV1(o);
    const m = o.manifest;
    const manifest = {
      ...m,
      name: str(m.name) || '(untitled surface)',
      created_at: str(m.created_at) || str(m.created) || '',
      schema: SCHEMA,
    };
    delete manifest.schema_version;
    delete manifest.created;
    const items = Array.isArray(o.items) ? o.items : [];
    return {
      manifest,
      context: isObj(o.context) ? o.context : {},
      items: (v1 ? items.map(upItem) : items).filter(Boolean),
      wasV1: v1,
    };
  }

  // Serialize for saving: v2, with the reader's bookkeeping and every empty
  // optional dropped, so a saved file carries only what was actually said.
  function write(s) {
    const m = { ...(s.manifest || {}) };
    delete m.schema; delete m.schema_version; delete m.created;
    for (const k of Object.keys(m)) if (m[k] === '' || m[k] == null) delete m[k];
    const out = { manifest: { ...m, schema: SCHEMA } };
    if (isObj(s.context) && Object.keys(s.context).length) out.context = s.context;
    out.items = (s.items || []).map((it) => {
      const c = { ...it };
      for (const k of Object.keys(c)) if (c[k] === '' || c[k] == null) delete c[k];
      return c;
    });
    return out;
  }

  // ── Item reading, one implementation ─────────────────────────────────────
  const source = (it) => (isObj(it) && isObj(it.target) && isObj(it.target.source)) ? it.target.source : null;

  // The repository triple, or null. `ref: ''` means unspecified, never a guess,
  // matching RepoAddress's rule: parse honestly, resolve late.
  function ref(it) {
    const s = source(it);
    if (!s || !s.repository) return null;
    return {
      repo: str(s.repository), ref: str(s.ref), path: str(s.path),
      dir: it.type === 'directory' || (!s.path && it.type === 'repo'),
    };
  }

  // A path-only source is local to whatever renders the surface. It travels
  // only when the item also carries `content`; that is the portability
  // boundary the contract draws, made checkable.
  function local(it) {
    const s = source(it);
    if (!s || s.repository || s.uri || !s.path) return null;
    return { path: str(s.path), format: str(it.format), content: it.content == null ? null : str(it.content) };
  }

  const uri = (it) => str(source(it)?.uri);

  // The stable identity of an item's subject, in the estate's one address
  // grammar. Distinct from `id`, which is the author's handle for it inside
  // this surface and need not survive being moved to another one.
  function key(it) {
    const r = ref(it);
    if (r) return r.repo + (r.ref ? '@' + r.ref : '') + ':' + r.path;
    const l = local(it);
    if (l) return 'local:' + l.path;
    return uri(it) || str(it.id);
  }

  function gh(it) {
    const r = ref(it);
    if (!r) return '';
    if (!r.path) return 'https://github.com/' + r.repo;
    return 'https://github.com/' + r.repo + '/' + (r.dir ? 'tree' : 'blob') + '/' + (r.ref || 'main') + '/' + r.path;
  }

  const fmtFor = (name) => EXT_FORMAT[str(name).split('.').pop().toLowerCase()] || '';

  window.Surface = {
    SCHEMA,
    read, write, isV1,
    source, ref, local, uri, key, gh, fmtFor,
  };
})();
