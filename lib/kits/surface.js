// surface.js — the surface envelope, in one place.
//
// A surface is a curated, annotated set of items presented for a reason at a
// moment (docs/envelopes/surface.md; the core schema is v2). Two things in
// show-repo hold such a set: the Surfaces shelf, which reads .surface files out
// of the registry, and the Stage, which holds a working one that has not been
// saved. They had separate item shapes, and the separation was accidental: the
// v2 contract records that a repository source "round-trips losslessly (it is
// the stage's item shape)". This module is the one implementation both read
// through, which is what lets the two collapse into one view.
//
// THREE JOBS, and the split matters because only the first is version-aware:
//
//   read/write   the envelope, dual-reading v1 and normalizing to v2 in memory.
//                v1 files are never rewritten in place: read() normalizes for
//                display, and the Surfaces editor edits the raw text, so a v1
//                file stays v1 until someone deliberately saves it as v2.
//   source/ref/  item reading. Every consumer asked "where does this item
//   local/key/gh live" slightly differently; now they ask here.
//   fromStage/   the two bridges the convergence needs: promote a working set
//   toStage      to a saved surface, and pull a saved one back onto the bench.
//
// WHAT IS NOT HERE, deliberately. Nothing about sending, bundling, or a
// destination folder's contents. The test a field has to pass to enter the
// envelope is that it is still true a year later with no tool running: a
// proposed destination passes (it is a claim about the set), a send in flight
// does not (it is the state of a process). The Diff lens's per-side ref
// override used to be the other worked example here; it was retired
// 2026-08-04, and the case it served now rides the items themselves, since one
// path at two refs is two addresses and both stage.
//
// Attaches to window.Surface, loaded via gh.load('kits/surface.js').
(() => {
  const SCHEMA = { name: 'surface', version: 2 };
  const STAGE_PROFILE = { name: 'stage', version: 1 };

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

  // ── The two bridges ──────────────────────────────────────────────────────
  //
  // fromStage: promote a working set to a surface. Commentary enters here,
  // at the moment of promotion, which is when it is worth writing.
  //
  // `compare` records the Diff lens's pair as what it durably is: two items in
  // a comparison relation, each asking to be represented as a diff. This is
  // strictly more than the stage link's &mode=diff could say, since it names
  // WHICH two. Each side is the staged address as staged; there is no override
  // to record, since a version diff is two staged addresses.
  function fromStage(stageItems, meta = {}) {
    const skipped = [];
    const items = [];
    for (const it of (stageItems || [])) {
      if (it && it.local) {
        // Bytes that are not text cannot ride a JSON string field, and inventing
        // a private base64 convention inside `metadata` would be a format only
        // this writer could read. A dropped item is reported instead.
        if (typeof it.text !== 'string') { skipped.push(it.name); continue; }
        const f = fmtFor(it.name);
        items.push({
          id: 'local:' + it.name, title: str(it.name), type: 'file',
          ...(f ? { format: f } : {}),
          target: { source: { path: str(it.name) } },
          content: it.text,
        });
        continue;
      }
      if (!it || !it.repo || !it.path) continue;
      items.push({
        id: it.repo + (it.ref ? '@' + it.ref : '') + ':' + it.path,
        title: str(it.path),
        type: 'file',
        target: { source: { repository: str(it.repo), path: str(it.path), ...(it.ref ? { ref: str(it.ref) } : {}) } },
      });
    }
    const c = meta.compare;
    if (c && items[c.a] && items[c.b] && c.a !== c.b) {
      items[c.a].view = { mode: 'diff' };
      items[c.b].view = { mode: 'diff' };
      items[c.a].related = [...(items[c.a].related || []), { item: items[c.b].id, relation: 'compares-to' }];
    }
    const context = {};
    if (meta.destination) context.destination = str(meta.destination);
    if (Array.isArray(meta.prompts) && meta.prompts.length) context.prompts = meta.prompts;
    return {
      surface: {
        manifest: {
          name: str(meta.name) || autoName(items),
          description: str(meta.description),
          created_at: meta.created_at || new Date().toISOString(),
          category: str(meta.category) || 'stage',
          schema: SCHEMA,
          profile: STAGE_PROFILE,
        },
        context,
        items,
      },
      skipped,
    };
  }

  // Unnamed by intent: a saved stage is a clipboard entry, not a document, so
  // it earns a name from its contents rather than asking for one. Renaming is
  // one field in the editor for the surfaces that grow into documents.
  function autoName(items) {
    if (!items.length) return 'Empty stage';
    const first = str(items[0].title).split('/').pop() || items[0].title;
    return items.length === 1 ? first : first + ' +' + (items.length - 1);
  }

  // toStage: pull a surface's addressable items onto the bench. Prose items
  // (a note, a story, a bare link) have no file behind them and are reported
  // rather than silently dropped, since a surface may legitimately hold both.
  function toStage(s) {
    const items = [], skipped = [];
    for (const it of ((s && s.items) || [])) {
      const r = ref(it);
      if (r && r.path && !r.dir) { items.push({ repo: r.repo, ref: r.ref, path: r.path }); continue; }
      const l = local(it);
      if (l && l.content != null) {
        items.push({ local: true, name: l.path, text: l.content, size: l.content.length });
        continue;
      }
      skipped.push(str(it.title) || key(it));
    }
    return { items, skipped };
  }

  // A filename for a newly minted surface. Dated first so the directory sorts
  // as the history it is, and suffixed so two saves in one minute never
  // collide: appending is the whole point, overwriting was the old behavior.
  function fileName(surface, stamp) {
    const d = String(stamp || surface?.manifest?.created_at || '').replace(/[-:]/g, '').replace(/\..*$/, '');
    const day = d.slice(0, 8) || 'undated';
    const time = d.slice(9, 15) || '';
    const slug = str(surface?.manifest?.name).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'stage';
    return [day, time, slug].filter(Boolean).join('-') + '.surface';
  }

  window.Surface = {
    SCHEMA, STAGE_PROFILE,
    read, write, isV1,
    source, ref, local, uri, key, gh, fmtFor,
    fromStage, toStage, autoName, fileName,
  };
})();
