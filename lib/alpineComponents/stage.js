// The stage: a cross-repo fileset staged for action (view, copy out, send to
// a repo). This component is the BENCH, the working half of show-repo's Stage
// view: it mounts once, fixed at the top of that view, above the shelf of
// saved surfaces the estate component renders below it. One stage above any
// repo, beside Repos, since staged items each carry their own origin and the
// set never belonged to the open repo. The link is the
// transport: a #stage= fragment names a set of refs and opens the view
// preloaded with them. Content stays behind the viewer's token; the link
// carries only refs. (A content-carrying #gz= bundle form for token-less
// contexts is a contemplated follow-up, not built here.)
//
// Takes from: upload (drop-zone), a repo (the path-picker grab row here, or
// the + on Files rows while visiting a repo), #stage= links, and manifest
// stage.files seeds. Puts to: clipboard (the concatenated bundle), a repo
// (send), with bundle download as the clipboard's fallback. Preview is inline;
// it does not route through any repo's Files view.
//
// A staged item is one of two kinds. A REF ({repo, ref, path}) points at a
// file that already lives in a repo; the bundle fetches it and the transfer
// copies it. A LOCAL item ({local:true, name, bytes|text}) is a file dropped
// straight into the stage, its bytes held in memory. Both ride the one stage
// array and both flow through the one "Copy to repo" deposit: refs via
// gh.copyTo, local bytes via gh.saveBytes/save. A local item is transient (its
// bytes can't serialize), so it is left out of the #stage= link and the
// .web-tools.json save; the ref items carry those.
//
// Grammar, both directions (StageLink.parseLink / StageLink.mint):
//
//   #stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3[&prompts=<b64url>][&mode=diff]
//
// Groups are ';'-separated, paths ','-separated, @ref optional (absent means
// the source repo's default branch). Paths are URL-encoded per component with
// '/' left readable.
//
// A link is one object with three parts: REFS (the stage spec above),
// COMMENTARY (an optional &prompts= param, a base64url'd JSON list of
// {label, ask} review asks), and MODE (an optional &mode=diff, the intent that
// this stage opens as a diff, on the Diff tab, run without a click). Refs are
// pointers, so their content stays behind the token; the prompts and the mode
// are authored, so they ride the link itself. mint() serializes all of it from
// that object; parseLink() returns { items, prompts, mode }, and the bare
// parse() keeps returning just the items for callers (the shell seed) that only
// want refs. This is the seed of a richer "surface" schema: the same
// {refs, commentary, mode} shape a manifest's stage block or a future surface
// file would carry, with file content the file-only extra.

// The Diff lens's review-prompts panel: a fixed set of general review asks,
// shown once a diff has run. Each copies the two compared texts plus the
// diff, with that prompt's specific ask appended, for pasting into a
// separate chat as a second, independent review. Bespoke (document-specific)
// prompts ride the stage link's &prompts= commentary (see StageLink); the
// panel shows those first, then this fixed set.
const DIFF_PROMPTS = [
  ['Tighten it', 'Read the edit above without losing any information. Where can this be tightened further? Point to specific sentences or phrases that could be cut, and say what would be lost or gained by cutting them.'],
  ['Fresh-eyes clarity', 'Read this as someone new to the topic. Where does it lose you, assume too much, or need more context?'],
  ['Consistency check', 'Does the edited version stay consistent with the original in tone, terminology, and claims? Flag anything that drifted.'],
  ['Fact and logic check', 'Check the edit for factual, numerical, or logical errors relative to the original. Call out anything that does not hold up.'],
  ['Was it worth it', 'Compare the two versions plainly. Does the edit make the document better, or just different? Would you have made this edit?'],
  ['Open critique', 'Give an unprompted, honest critique of this edit. What would you push back on?'],
];

window.StageLink = (() => {
  // "owner/repo[@ref]:path" -> { repo, ref, path } | null (no match: a bare
  // path, or garbage). Used for manifest stage.files entries and link groups.
  //
  // Delegates to lib/kits/repo-address.js, which owns the grammar. Read at call time
  // rather than at load: this component registers during the bundle's boot,
  // before a page's own gh.load chain has run.
  const parseItem = (s) => {
    if (!window.RepoAddress) throw new Error('stage.js requires window.RepoAddress (load repo-address.js first)');
    return window.RepoAddress.parse(s);
  };

  const fmtItem = (it) => it.repo + (it.ref ? '@' + it.ref : '') + ':' + it.path;

  // Commentary encoding: a base64url'd JSON list of {label, ask}. UTF-8-safe
  // (the escape/encodeURIComponent sandwich), so a prompt can hold any text.
  // A soft cap on the list length keeps a runaway set from bloating the URL.
  const PROMPTS_MAX = 24;
  const b64urlEnc = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64urlDec = (s) => decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))));
  const cleanPrompts = (list) => (Array.isArray(list) ? list : [])
    .map(p => ({ label: String(p && p.label || '').trim(), ask: String(p && p.ask || '').trim() }))
    .filter(p => p.label && p.ask)
    .slice(0, PROMPTS_MAX);
  const encodePrompts = (list) => {
    const clean = cleanPrompts(list);
    return clean.length ? b64urlEnc(JSON.stringify(clean)) : '';
  };
  const decodePrompts = (s) => {
    if (!s) return [];
    try { return cleanPrompts(JSON.parse(b64urlDec(s))); } catch { return []; }
  };

  // ── Local text items in a link: the `gz` payload ─────────────────────────
  // A local file has no repo address, so it could never ride a #stage= link
  // and copyLink refused whenever the stage held only local items. It does not
  // need an address: it needs to BE in the link. gzip + base64url in the
  // fragment is the estate's existing answer to that (toss-render's #gz=), and
  // the fragment never reaches a server, so a pasted draft stays as private as
  // the stage it came from.
  //
  // Text only, and deliberately: bytes gain nothing from gzip and inflate 33%
  // through base64, so a dropped image or zip would blow the budget to carry
  // one file. Those still have to be sent to a repo, which copyLink now says
  // precisely rather than refusing the whole link.
  //
  // BUDGET. Safari caps a URL near 80k characters, and a link is also pasted
  // into chats and issue bodies that wrap or truncate. 24k of base64 keeps a
  // wide margin and still carries a large document: this page's own 7 KB HTML
  // paste encodes to roughly 2 KB. Over budget, minting reports the overflow
  // instead of handing back a link that fails somewhere else, later.
  const GZ_MAX = 24 * 1024;

  const b64urlBytes = (bytes) => {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const bytesFromB64url = (s) => {
    const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(pad), c => c.charCodeAt(0));
  };
  const gzipText = async (text) => {
    const stream = new Blob([new TextEncoder().encode(text)]).stream()
      .pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  const gunzipText = async (bytes) => {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  };

  // [{name, text}] -> base64url payload. Throws over budget, with the numbers,
  // since "too big" without a size is not actionable.
  const encodeLocals = async (locals) => {
    const list = (locals || [])
      .filter(it => it && it.isText && typeof it.text === 'string')
      .map(it => ({ name: it.name || 'pasted.txt', text: it.text }));
    if (!list.length) return '';
    const payload = b64urlBytes(await gzipText(JSON.stringify(list)));
    if (payload.length > GZ_MAX) {
      const e = new Error('the pasted files compress to ' + Math.round(payload.length / 1024)
        + 'K, over the ' + Math.round(GZ_MAX / 1024) + 'K a link can carry');
      e.overflow = true;
      throw e;
    }
    return payload;
  };
  const decodeLocals = async (payload) => {
    if (!payload) return [];
    try {
      const list = JSON.parse(await gunzipText(bytesFromB64url(payload)));
      return (Array.isArray(list) ? list : [])
        .filter(x => x && typeof x.text === 'string')
        .map(x => ({ name: String(x.name || 'pasted.txt'), text: x.text }));
    } catch { return []; }
  };

  // Split a hash/fragment into its '&'-joined key=value params. Paths in the
  // stage spec URL-encode '&' (encodeURIComponent), so a literal '&' in the
  // fragment is always a param delimiter, never path content.
  const fragParams = (hash) => {
    // Accept a full URL, a bare location.hash, or a bare spec: take everything
    // after a '#' when one is present, else the whole string.
    let s = String(hash || '');
    const h = s.indexOf('#');
    if (h >= 0) s = s.slice(h + 1);
    const out = {};
    for (const part of s.split('&')) {
      const eq = part.indexOf('=');
      if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return out;
  };

  // Accepts a full location.hash (leading '#' and all) or a bare spec, and
  // returns the whole object: { items, prompts }. parse() below is the refs-only
  // projection for callers (the shell seed) that don't want commentary.
  const parseLink = (hash) => {
    const p = fragParams(hash);
    const items = [];
    if (p.stage != null) {
      for (const group of p.stage.split(';')) {
        // A group is one address whose path half is a ','-joined list, so the
        // shared parser reads it and the list is split out of `path`.
        const g = parseItem(group);
        if (!g) continue;
        for (const seg of g.path.split(',')) {
          let path;
          try { path = decodeURIComponent(seg.trim()); } catch { continue; }
          if (path) items.push({ repo: g.repo, ref: g.ref, path });
        }
      }
    }
    // dest: a destination preset ('owner/repo[@ref][:dir]', URL-encoded), so a
    // link can open the stage already aimed somewhere: the branch page's
    // add-file plus mints '?view=stage&dest=<repo@branch:inboxDir>'. The value
    // prefills the send field; nothing sends without the user's own taps.
    let dest = '';
    if (p.dest != null) { try { dest = decodeURIComponent(p.dest); } catch { dest = p.dest; } }
    // `gz` is read asynchronously (DecompressionStream), so parseLink stays
    // synchronous and hands back the raw payload; readAsync below resolves it.
    return { items, prompts: decodePrompts(p.prompts), mode: p.mode === 'diff' ? 'diff' : '',
             dest, gz: p.gz || '' };
  };
  const parse = (hash) => parseLink(hash).items;

  // Read the whole object from a location, hash first, then the ?query as a
  // fallback (same keys: stage, prompts, mode). The query form is what lets a
  // stage ride a context that eats the fragment: a toss-render srcdoc (whose
  // params shim answers ?query lookups), an email or chat that strips the '#',
  // a deep link. The fragment stays the default and the private form.
  //
  // The source choice rides lib/kits/url-params.js, so the precedence rule has one
  // statement, and the three keys always come from the SAME source: a fragment
  // stage is never paired with a stray ?prompts= from a different link. One
  // deliberate consequence of the shared rule (decided 2026-08-02): an empty
  // '#stage=' counts as a miss, so a truncated link that kept the fragment key
  // but lost its value falls back to a populated ?stage= instead of silently
  // staging nothing. The presence-based read this replaced kept the empty
  // fragment. The fragment itself still goes to parseLink raw, not through
  // UrlParams.get: paths encode '&' as %26, which URLSearchParams would decode
  // into a live delimiter.
  const read = (loc) => {
    const l = loc || (typeof location !== 'undefined' ? location : {});
    if (!window.UrlParams) throw new Error('stage.js requires window.UrlParams (load url-params.js first)');
    if (window.UrlParams.source('stage', l) === 'search') {
      let q;
      try { q = new URLSearchParams(String(l.search || '').replace(/^\?/, '')); }
      catch { return parseLink(String(l.hash || '')); }
      let synth = 'stage=' + q.get('stage');
      const pr = q.get('prompts'); if (pr) synth += '&prompts=' + pr;
      const md = q.get('mode'); if (md) synth += '&mode=' + md;
      const de = q.get('dest'); if (de) synth += '&dest=' + de;
      const gz = q.get('gz'); if (gz) synth += '&gz=' + gz;
      return parseLink('#' + synth);
    }
    const out = parseLink(String(l.hash || ''));
    // dest may arrive in the query beside a fragment stage, or alone with
    // ?view=stage (the branch page's mint); the fragment form still wins.
    if (!out.dest) {
      try {
        const de = new URLSearchParams(String(l.search || '').replace(/^\?/, '')).get('dest');
        if (de) out.dest = decodeURIComponent(de);
      } catch { }
    }
    return out;
  };

  // mint(items, base, opts): opts is { prompts, mode } (the surface object's
  // commentary and intent), or a bare prompts array for the legacy call.
  const mint = (items, base, opts) => {
    const o = Array.isArray(opts) ? { prompts: opts } : (opts || {});
    const groups = new Map();
    for (const it of items) {
      const k = it.repo + (it.ref ? '@' + it.ref : '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(encodeURIComponent(it.path).replace(/%2F/gi, '/'));
    }
    const spec = [...groups.entries()].map(([k, ps]) => k + ':' + ps.join(',')).join(';');
    const enc = encodePrompts(o.prompts);
    const mode = o.mode === 'diff' ? '&mode=diff' : '';
    const gz = o.gz ? '&gz=' + o.gz : '';
    // A stage of only local files still mints: the key leads instead of the
    // spec, so '#stage=' is never emitted empty (an empty stage key counts as
    // a miss in read(), which would send a valid link to the query fallback).
    const head = spec ? '#stage=' + spec : '#gz=' + o.gz;
    if (!spec && !o.gz) return (base || '') + '#stage=';
    return (base || '') + head + (spec ? gz : '') + (enc ? '&prompts=' + enc : '') + mode;
  };

  // mint with the local text items folded in. Async because gzip is; the
  // synchronous mint stays for callers with refs only (the saved-surface
  // path, the tests that predate this).
  const mintWithLocals = async (items, base, opts) => {
    const o = Array.isArray(opts) ? { prompts: opts } : (opts || {});
    const refs = items.filter(it => !it.local);
    const gz = await encodeLocals(items.filter(it => it.local));
    return mint(refs, base, { ...o, gz });
  };

  return { parse, parseLink, read, mint, mintWithLocals, parseItem, fmtItem,
           encodePrompts, decodePrompts, encodeLocals, decodeLocals, GZ_MAX };
})();

// ── INTAKE: what an arriving thing becomes, with no view attached ─────────
// The stage's own view has always taken a drop, and until 2026-08-17 that was
// the only way a file could get in: the intake lived inside the component, so
// nothing could stage anything before the bench had mounted, and the bench
// mounts on your first visit to the Stage. That is the whole reason a drop
// anywhere else in a host app did nothing.
//
// This is that intake with the view taken out. It owns the DECISIONS (is this
// text, what is it called, is that line an address rather than prose) and the
// one store array they land in. A host owns the gesture and what to do after:
// show-repo's shell takes a drop on any view, stages it here, and routes to
// the Stage. Splitting it that way is what lets an app-wide drop work with the
// bench still unmounted, and keeps one answer to "what is a dropped file".
window.StageIntake = (() => {
  // Monotonic id source for local items, and module-scope because there are
  // now two creators (the bench's own drop-zone and a host's app-wide drop).
  // Per-mount counters would mint the same id twice, and `local:<id>` is the
  // key the stage dedupes and previews by.
  let seq = 0;

  // A name for pasted text, sniffed from its first characters. Everything
  // downstream keys on the extension (the viewer's mode, the destination
  // path, the eventual blob's rendering), so 'pasted.txt' for an HTML
  // document was a small lie that cost a rename on every deposit.
  const nameForText = (text) => {
    const s = String(text || '').trimStart().slice(0, 400);
    const stamp = new Date().toISOString().slice(0, 10);
    const delim = delimiterOf(text);
    const ext = /^(<!doctype html|<html)/i.test(s) ? 'html'
      : /^<\?xml|^<[a-z][\w:-]*[\s>]/i.test(s) ? 'xml'
      : /^[{[]/.test(s) ? 'json'
      // Ahead of the grid test, because a multi-line function body can carry a
      // comma per line and would otherwise be renamed into a table.
      : isRowsFn(s) ? 'js'
      : delim === '\t' ? 'tsv'
      : delim === ',' ? 'csv'
      : /^#{1,6}\s|^---\s*$/m.test(s) ? 'md'
      : 'txt';
    return stamp + '-paste.' + ext;
  };

  // THE DELIMITER A TEXT GRID IS BUILT FROM, or '' when it is not one. Tab is
  // what a spreadsheet range puts on the clipboard as text/plain; comma is what
  // the same data is when it arrives as a file's contents, and until 2026-08-18
  // only the tab was read, so copying out of Excel opened a TABLE while pasting
  // the equivalent CSV opened a wall of text. Nobody would predict that split,
  // and CSV is the likelier paste of the two.
  //
  // The test stays as strict as the tab-only one was, since a stray delimiter in
  // prose must not rename the file into a grid: at least two lines, every
  // non-empty line carrying the delimiter, and every one carrying the SAME
  // count. Tab is tried first because a TSV row containing prose commas is
  // common and the reverse is not.
  const DELIMS = ['\t', ','];
  const delimiterOf = (text) => {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2 || lines.length > 5000) return '';
    for (const d of DELIMS) {
      const n = countOutsideQuotes(lines[0], d);
      if (n > 0 && lines.every(l => countOutsideQuotes(l, d) === n)) return d;
    }
    return '';
  };

  // Delimiters OUTSIDE double quotes, which is the whole reason this is not a
  // regex: `"Social Security, OASI",9448` carries two commas and one field
  // separator, and counting both would make every real CSV with a quoted comma
  // fail the consistency test and fall back to .txt. A doubled "" inside a
  // quoted field is an escaped quote, not a close.
  const countOutsideQuotes = (line, d) => {
    let n = 0, quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') { i++; continue; }
        quoted = !quoted;
      } else if (c === d && !quoted) n++;
    }
    return n;
  };

  // Kept as the boolean it always was, since it is exported and reads better at
  // a call site that only asks whether the thing is a grid.
  const isDelimited = (text) => delimiterOf(text) !== '';

  // A `rows => rows` TRANSFORM, which is the transform workbench's own contract:
  // the parameter is literally named `rows`, so this is specific rather than a
  // general "looks like JavaScript" guess. Worth its own extension because
  // pasting a function is how you RESUME work in that tool rather than start it,
  // and .txt loses that: a named .js opens highlighted and can be recognized as
  // transform-shaped downstream.
  const isRowsFn = (s) =>
    /^(?:\(\s*rows\s*(?:,[^)]*)?\)|rows)\s*=>/.test(s) ||
    /^(?:async\s+)?function\s*[\w$]*\s*\(\s*rows\b/.test(s);

  // Extensions for the clipboard's own MIME types, so a flavor is named for
  // what it is rather than for what the first reader assumed.
  const EXT_FOR_MIME = {
    'text/html': 'html', 'text/plain': 'txt', 'text/rtf': 'rtf',
    'text/csv': 'csv', 'text/uri-list': 'txt', 'application/json': 'json',
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf',
  };

  // EVERY FLAVOR A PASTE CARRIED, not the first one a reader recognized.
  // One copy out of a spreadsheet puts three things on the clipboard at once
  // (the cells as tab-separated text, the same cells as an HTML table, and a
  // picture of the range), and the platform hands all three to the paste
  // event. Reading one and returning was a choice made in three lines here,
  // not a limit anything imposed.
  //
  // Only `text/*` and `application/json` can be read as strings; everything
  // else arrives through `files`, which is why the two are gathered
  // separately and then deduped by type.
  const flavorsOf = (cd) => {
    if (!cd) return [];
    const out = [], seen = new Set();
    for (const f of (cd.files || [])) {
      const type = f.type || 'application/octet-stream';
      if (seen.has(type)) continue;
      seen.add(type);
      out.push({ kind: 'file', type, file: f, size: f.size });
    }
    for (const t of Array.from(cd.types || [])) {
      if (t === 'Files' || seen.has(t)) continue;
      if (!/^text\//.test(t) && t !== 'application/json') continue;
      let text = '';
      try { text = cd.getData(t) || ''; } catch { continue; }
      if (!text) continue;
      seen.add(t);
      out.push({ kind: 'text', type: t, text, size: text.length });
    }
    return out;
  };

  // What a flavor should be called once staged. A file keeps its own name
  // when it has a usable extension, since a real dropped file is named by
  // the person who saved it; a clipboard image arrives as a generic
  // "image.png" the platform invented, which is no better than a stamp.
  const nameForFlavor = (fl) => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (fl.kind === 'file') {
      const nm = String(fl.file?.name || '');
      if (nm && /\.[a-z0-9]{1,8}$/i.test(nm) && !/^image\.\w+$/i.test(nm)) return nm;
      return stamp + '-paste.' + (EXT_FOR_MIME[fl.type] || 'bin');
    }
    if (fl.type === 'text/plain') return nameForText(fl.text);
    return stamp + '-paste.' + (EXT_FOR_MIME[fl.type] || 'txt');
  };

  // A DROPPED FILE IS NOT A BINARY JUST BECAUSE IT ARRIVED AS BYTES. Every
  // file intake (drag, browse, paste, share) reaches the stage as an
  // ArrayBuffer, and the item was stamped `isText: false` on that basis
  // alone, so a dropped .md was held as opaque bytes: no preview but a "Not
  // text" note, no diff, no bundle block, and no link to carry it. Pasting
  // the same characters staged them as text. The file, the shape a person
  // actually has on a phone, was the one form that lost.
  //
  // Decided by CAPABILITY, in two questions. A type the viewer renders from
  // its own bytes (image, PDF, workbook) stays bytes, since that path is
  // what makes it open at all. Everything else is offered to a strict UTF-8
  // decode: a decode that throws, or that yields a NUL, is what "binary"
  // means here, which is the same sniff file-review.js applies to a fetched
  // blob. Returns the text, or null for "hold the bytes".
  const textFromBytes = (name, bytes) => {
    if (!bytes || !bytes.length) return bytes ? '' : null;
    const ext = String(name || '').split('.').pop().toLowerCase();
    if (window.ViewRegistry?.mimeFor?.(ext)) return null;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return text.includes('\u0000') ? null : text;
    } catch { return null; }
  };

  // An item's key: what dedupe, the preview walk, and `focus` below all
  // address it by. A local item has no repo address, so it answers by id.
  const keyOf = (it) => it.local ? 'local:' + it.id : window.StageLink.fmtItem(it);
  const staged = () => Alpine.store('browser').stage || [];
  const put = (fresh) => {
    if (fresh.length) Alpine.store('browser').stage = [...staged(), ...fresh];
    return fresh;
  };

  // A local TEXT item, built but not staged: the shape a link-carried paste
  // and a decoded bundle both need without the fold.
  const textItem = (name, text) => ({
    local: true, id: ++seq, name, path: name,
    size: text.length, type: 'text/plain', isText: true, text,
  });

  // THE ONE FOLD. Every intake ends here: the bench's drop-zone, a paste
  // flavor, a host's app-wide drop. Returns the items it added, so a caller
  // can open the preview on a single arrival and stay quiet about a batch.
  const take = (d) => {
    if (!d) return [];
    // Dispatch on BYTES, not on a name. It used to read `d.file || d.name`,
    // which was true of every caller at the time and stopped being safe the
    // moment a text flavor wanted to arrive under a name of its own
    // (text/html as .html rather than sniffed): that paste took the binary
    // branch and made an item with a name, no bytes, and nothing to show.
    if (d.file || d.bytes || d.buf) {
      const bytes = d.bytes || (d.buf ? new Uint8Array(d.buf) : null);
      const text = textFromBytes(d.name, bytes);
      // The bytes ride along on a text item too: nothing downstream reads them
      // once `isText` is true, and keeping them means a rename into a
      // renderable extension is still answerable from the original file.
      return put([text === null
        ? { local: true, id: ++seq, name: d.name, path: d.name,
            size: d.size, type: d.type, isText: false, bytes, buf: d.buf }
        : { ...textItem(d.name, text), type: d.type || 'text/plain', size: d.size, bytes, buf: d.buf }]);
    }
    if (d.text != null) {
      // Text that reads entirely as stage refs, one per line, stages those
      // refs; anything else is prose and becomes a local text item.
      const lines = String(d.text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const refs = lines.map(l => window.StageLink.parseItem(l)).filter(Boolean);
      if (lines.length && refs.length === lines.length) {
        const seen = new Set(staged().map(keyOf));
        return put(refs.filter(r => !seen.has(window.StageLink.fmtItem(r))));
      }
      return put([textItem(d.name || nameForText(d.text), String(d.text))]);
    }
    return [];
  };

  // A File, read to bytes and folded in. `as` overrides the File's own name,
  // which a clipboard image needs: the platform invents "image.png" for it,
  // carrying no more meaning than a stamp and colliding with the next one.
  const takeFile = async (file, as) => {
    try {
      const buf = await file.arrayBuffer();
      return take({ file, name: as || file.name, size: file.size, type: file.type,
                    bytes: new Uint8Array(buf), buf });
    } catch {
      Alpine.store('toast')?.('warning', 'Could not read ' + (as || file.name), 'alert-error', 4000);
      return [];
    }
  };

  // Everything a drop carried: its files, else its text. One await, so the
  // caller learns what landed and can act on it.
  const takeDrop = async (dt) => {
    if (!dt) return [];
    if (dt.files && dt.files.length) {
      const out = [];
      for (const f of dt.files) out.push(...await takeFile(f));
      return out;
    }
    let text = '';
    try { text = dt.getData('text') || ''; } catch { /* a drag carrying no text flavor */ }
    return text ? take({ text, size: text.length }) : [];
  };

  // One flavor staged. A file goes through takeFile so its bytes are read;
  // a text flavor goes through take, which is what keeps ref lines staging as
  // refs rather than as a text file. A named flavor passes its name, which is
  // how text/html arrives as .html instead of being sniffed.
  const takeFlavor = async (fl) => {
    if (!fl) return [];
    const name = fl.name || nameForFlavor(fl);
    if (fl.kind === 'file') return takeFile(fl.file, name);
    return take({ text: fl.text, size: fl.size,
                  name: fl.type === 'text/plain' ? '' : name });
  };

  // THE FLAVORS A PASTE LEFT BEHIND, named and deduped against what is already
  // staged. Naming them here rather than in the bench is what lets a host
  // record an offer with the bench still unmounted, and the dedupe is what
  // makes pasting the same thing twice quiet rather than cumulative.
  const offerable = (flavors) => {
    const have = new Set(staged().filter(it => it.local).map(it => it.path || it.name));
    return (flavors || []).map(fl => ({ ...fl, name: nameForFlavor(fl) }))
                          .filter(fl => !have.has(fl.name));
  };

  // THE PASTE FOLD, out of the component for the reason the drop's fold left
  // it: the bench mounts on the first visit to the Stage, so until this moved
  // there was nothing for a paste on any other view to land in. The stager
  // registered the window listener itself and gated it on `view === 'stage'`,
  // which made the gesture reachable only from the place it was staging into.
  //
  // Returns what landed and what the paste ALSO carried, and writes the second
  // half to the store, since the offer bar is drawn by a bench that may not
  // exist yet. `editable` is the caller's reading of its own event target: a
  // form field keeps its native paste, and the flavors it cannot hold are
  // offered rather than lost, which is why this still reads the clipboard on
  // the way past.
  const takePaste = async (cd, opts = {}) => {
    const flavors = flavorsOf(cd);
    if (!flavors.length) return { added: [], offers: [] };
    if (opts.editable) {
      const offers = offerable(flavors.filter(f => f.kind === 'file' || f.type !== 'text/plain'));
      if (opts.offer !== false) Alpine.store('browser').stageOffers = offers;
      return { added: [], offers, native: true };
    }
    // The primary is what the handler took before it could see the others (a
    // file if there was one, else the plain text), so a paste that used to
    // work is unchanged and the rest is addition.
    const primary = flavors.find(f => f.kind === 'file') ||
                    flavors.find(f => f.type === 'text/plain') || flavors[0];
    const added = await takeFlavor(primary);
    const offers = offerable(flavors.filter(f => f !== primary));
    if (opts.offer !== false) Alpine.store('browser').stageOffers = offers;
    return { added, offers };
  };

  // ── WHAT THE TRANSFORM WORKBENCH COULD DO WITH A STAGED ITEM ──────────────
  //
  // Returns 'bundle', 'rows', 'fn', or '' for nothing. The recognition rides
  // the NAME the intake already chose, because that name is the intake's whole
  // judgment about what arrived and a second, disagreeing sniff here would be a
  // way for the two to drift. So the naming fix above is what makes this
  // trustworthy: before it, a pasted CSV was called .txt and nothing here could
  // have told it from prose.
  //
  // The three kinds are the three ways the workbench can be entered, and they
  // are not equally certain. A BUNDLE is the tool's own output format and
  // nothing else produces it, so recognizing one is exact. ROWS is the data it
  // eats. An FN is a transform to run over rows you do not have yet, which is
  // the loosest of the three and the most interesting, since pasting a function
  // is how work resumes rather than starts.
  const transformKindOf = (it) => {
    if (!it || !it.local || !it.isText || typeof it.text !== 'string') return '';
    const ext = String(it.name || '').split('.').pop().toLowerCase();
    if (ext === 'js') return isRowsFn(it.text.trimStart().slice(0, 400)) ? 'fn' : '';
    if (ext === 'csv' || ext === 'tsv') return 'rows';
    if (ext !== 'json') return '';
    const s = it.text.trimStart();
    if (s[0] === '[') return window.ViewRegistry?.isRowArray?.(s) ? 'rows' : '';
    if (s[0] !== '{') return '';
    try {
      const o = JSON.parse(s);
      // The workbench's own test on itself (processText): a `fn` or `fn_<name>`
      // key holding a gzipped source string is what makes an object a bundle.
      return Object.keys(o).some(k => (k === 'fn' || k.startsWith('fn_')) && typeof o[k] === 'string')
        ? 'bundle' : '';
    } catch { return ''; }
  };

  // ASK THE STAGE TO OPEN ON AN ITEM, through the store rather than by a call.
  // The bench mounts lazily, so a host routing to the Stage from elsewhere has
  // nothing to call yet: it names the item here, and the stager reads the key
  // when it mounts, or on the spot when it is already up, and clears it.
  const focus = (it) => { Alpine.store('browser').stageFocus = it ? keyOf(it) : ''; };

  return { take, takeFile, takeDrop, takePaste, takeFlavor, offerable, focus,
           keyOf, textItem, flavorsOf, nameForFlavor, nameForText, isDelimited,
           delimiterOf, isRowsFn, transformKindOf, textFromBytes };
})();

document.addEventListener('alpine:init', function() {
  Alpine.data('stager', function() {
    const fmt = t => t.replace(/ {4}/g, '  ');
    const joinDir = (dir, name) => dir ? dir.replace(/\/+$/, '') + '/' + name : name;
    // The intake above owns what an arriving thing becomes; the component owns
    // what the view does with it.
    const { take, takeFile, takeDrop, keyOf, textItem, nameForFlavor } = window.StageIntake;

    return {
      description: 'The staged fileset as a main-area view: dropped local files and cross-repo refs in one stage, with view/remove per item and one send/save/mint deposit',

      template: `
        <div class="relative min-h-[55vh]"
             @dragenter.prevent="_dragDepth++"
             @dragover.prevent
             @dragleave.prevent="_dragDepth = Math.max(0, _dragDepth - 1)"
             @drop.prevent="onPageDrop($event)">

          <!-- Browse-to-add, the click path for the whole-page drop. -->
          <input type="file" multiple x-ref="fileInput" class="hidden" @change="onBrowse($event)">

          <!-- No title row and no mode pill. The bench mounts under the Stage
               view's own "Stage" heading (lib/alpineComponents/estate.js),
               which names the place and, when the set came from a saved
               surface, says which one. A title here would be the second copy.
               The stage-wide actions sit on the thing they act on.

               NO EMPTY-STATE DROP BOX. A dashed panel captioned "drop files
               here" stood where the real sections belong, and it was a
               placeholder in both senses: the whole VIEW takes the drop
               (@drop on the root above), and Add file and Paste live in the
               aside, so the box carried no capability of its own. What it did
               carry was a caption ABOUT the destination, since the
               destination field only appeared once something was staged: the
               stage claimed in prose to be aimed somewhere instead of just
               showing the field. Both sections now render from the start,
               empty, so an aimed stage IS its aim and a reader sees the two
               things a deposit needs (where it goes, what is in it) before
               supplying either. Decided 2026-08-08 from a phone. -->
          <!-- Two panes: the lens (Out / Diff) is the workspace and leads;
               staged items and the adder sit beside it on desktop, below it on
               mobile. The lens is what you came to do; the rest is supply. -->
          <!-- The aside's track GROWS WITH THE VIEWPORT past lg. It was a flat
               20rem at every width above the breakpoint, which is a phone
               measurement that never learned about desktops: the lens column
               absorbed all the extra space while holding one picker and a
               button, and the aside stayed at its narrowest just as the screen
               got widest. The aside is the column with lists in it, so it is
               the one that can spend width. -->
          <div class="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem] 2xl:grid-cols-[minmax(0,1fr)_30rem]">

            <!-- MAIN: the lens. -->
            <div class="flex flex-col gap-2 min-w-0">
              <div class="flex flex-col gap-2">
                <!-- NO LENS STRIP. Out and Diff were a segmented pill here
                     until 2026-08-04, but they were never two views of one
                     thing: Out is where the set LEAVES (bundle, send), and
                     Diff was a way to READ two of its files. Reading now
                     happens where reading happens, in the preview, which
                     already walks the staged set and can therefore pair two of
                     it without a second set of controls. So this side keeps
                     only the deposit surface, and it needs no tab to name it. -->
                <div class="flex items-center justify-between gap-2 border-b border-base-300 pb-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="flex items-center gap-1.5 text-base font-medium text-base-content/70 shrink-0">
                      <i class="ph ph-export text-lg"></i>Out</span>
                    <span class="opacity-60 font-mono text-base truncate" x-text="bundleStat"></span>
                  </div>
                  <!-- What acts on the BUNDLE. What acts on the staged SET
                       (add, link, save, clear) sits on the set, in the aside.

                       NO SHOW-THE-BLOCK TOGGLE. The bundle is something you
                       send somewhere else, so the three verbs that leave with
                       it are the whole surface; reading a wall of concatenated
                       files here answered no question the staged list and the
                       preview do not answer better. The size still reads out,
                       which is the part of "show me the block" anyone wanted. -->
                  <!-- Disabled rather than hidden on an empty stage: the row
                       is the same row whether or not anything is in it, and a
                       control that appears only after the fact reads as a new
                       feature rather than one that was waiting. -->
                  <div class="flex items-center gap-0.5 shrink-0">
                    <button @click="rebuild()" :disabled="bundleBusy || !items.length" class="btn btn-square btn-ghost" title="Refresh">
                      <i class="ph text-xl" :class="bundleBusy ? 'ph-circle-notch animate-spin' : 'ph-arrows-clockwise'"></i>
                    </button>
                    <button @click="copyBundle()" :disabled="!items.length" class="btn btn-square btn-ghost" title="Copy the concatenated block">
                      <i class="ph text-xl" :class="bundleCopied ? 'ph-check' : 'ph-copy'"></i>
                    </button>
                    <button @click="download()" :disabled="!items.length" class="btn btn-square btn-ghost" title="Download the concatenated block">
                      <i class="ph ph-download-simple text-xl"></i>
                    </button>
                  </div>
                </div>

                <!-- Send: destination via the dir-mode picker; two-tap arm. -->
                <div class="flex items-center gap-1.5 flex-wrap">
                  <!-- The picker's value option is what makes a dest= link
                       legible on arrival: the picker owns its trigger label,
                       so a destination set from the link showed the
                       placeholder and the stage looked unaimed. Safe to read
                       here because the stager's init sets destSpec
                       synchronously and only then does $nextTick walk this
                       subtree. (No backticks in this comment: the whole
                       template is one backtick-delimited literal, so a stray
                       pair ends the string and the markup after it parses as
                       JS.) -->
                  <div class="grow min-w-48" @path-pick="destSpec = $event.detail.spec">
                    <div x-ref="destPicker" x-data="pathPicker({ mode: 'dir', roots: () => pickerRoots(), value: destSpec, placeholder: 'Send to: pick a repo folder' })"></div>
                  </div>
                  <button @click="send()" :disabled="sending || !destSpec.trim() || !items.length"
                          class="btn gap-1" :class="sendArmed ? 'btn-error' : 'btn-primary'">
                    <i class="ph" :class="sending ? 'ph-circle-notch animate-spin' : 'ph-paper-plane-tilt'"></i>
                    <span x-text="sendLabel"></span>
                  </button>
                </div>

                <!-- DECLARED destinations, one tap each. The picker above lists
                     every folder that EXISTS, which is a different claim: these
                     are the ones a repo says are for receiving. The distinction
                     is the whole point of the strip. A browser offers plausible
                     folders and cannot tell you which one is drained, so a
                     deposit lands somewhere reasonable and is never seen again;
                     that is how home ran two intake trays for six weeks with
                     its own map reporting the wrong one empty. Absent when
                     nothing is declared, so a repo with no pill is visibly
                     missing a declaration rather than quietly defaulting. -->
                <div x-show="destPills.length" class="flex items-center gap-1 flex-wrap">
                  <i class="ph ph-tray-arrow-down text-base opacity-50 shrink-0"
                     title="Declared inboxes"></i>
                  <template x-for="p in destPills" :key="p.spec">
                    <button type="button" @click="aim(p.spec)" :title="p.spec"
                            class="btn btn-xs gap-1 font-normal"
                            :class="destSpec === p.spec ? 'btn-primary' : 'btn-ghost border border-base-300'">
                      <i class="ph shrink-0 opacity-70" :class="p.kind === 'repo' ? 'ph-package' : 'ph-kanban'"></i>
                      <span x-text="p.label"></span>
                      <span class="font-mono opacity-60" x-text="p.dir"></span>
                    </button>
                  </template>
                </div>

                <div class="flex items-center justify-end gap-2 flex-wrap">
                  <span class="text-base font-mono opacity-60 truncate" x-text="sendStatus"></span>
                </div>

                <!-- ASKED OF YOU. The mailbox's fourth kind, and the only one a
                     browser cannot serve for you. Its three siblings are
                     deferred reads from a repo and answer themselves on page
                     load; this is a deferred read from the person, so it waits.
                     It sits in the lens column under the destination because
                     that is the order of the act: read what is wanted, aim, add
                     the material by upload, paste, or dictation, send, close.
                     Nothing here is a new transport. Every step but the reading
                     and the closing already existed. -->
                <div x-show="asks.length" x-cloak class="flex flex-col gap-2 pt-2">
                  <div class="flex items-center gap-1.5 text-base font-semibold uppercase tracking-wide text-base-content/40">
                    <i class="ph ph-hand-waving text-lg"></i><span>Asked of you</span>
                    <span class="opacity-70" x-text="'· ' + asks.length"></span>
                  </div>
                  <template x-for="a in asks" :key="a.name">
                    <div class="border border-base-300 rounded-lg bg-base-100 p-2.5 flex flex-col gap-2">
                      <div class="text-base" x-text="a.note"></div>
                      <div class="flex items-center gap-2 flex-wrap font-mono text-sm opacity-60">
                        <i class="ph ph-tray-arrow-down shrink-0"></i>
                        <span class="truncate" x-text="a.dest"></span>
                        <span x-show="a.age" x-text="'· ' + a.age"></span>
                      </div>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <button type="button" @click="aim(a.dest)"
                                class="btn btn-xs btn-ghost border border-base-300 gap-1 font-normal">
                          <i class="ph ph-crosshair-simple"></i>Aim here</button>
                        <a x-show="askTaskUrl(a)" :href="askTaskUrl(a)" target="_blank" rel="noopener"
                           class="btn btn-xs btn-ghost border border-base-300 gap-1 font-normal">
                          <i class="ph ph-ticket"></i>Task</a>
                      </div>
                      <!-- The message is the durable half. A decline that says
                           "nothing references this, stop looking" saves the next
                           session more than the file would have, which is why
                           the kit refuses a decline without one. -->
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <input type="text" x-model="a.message" :disabled="a.busy"
                               placeholder="a note on closing (required to decline)"
                               class="input input-xs input-bordered grow min-w-40">
                        <button type="button" @click="resolveAsk(a, true)" :disabled="a.busy"
                                class="btn btn-xs btn-primary gap-1 font-normal">
                          <i class="ph ph-check"></i>Sent</button>
                        <button type="button" @click="resolveAsk(a, false)" :disabled="a.busy"
                                class="btn btn-xs btn-ghost border border-base-300 gap-1 font-normal">
                          <i class="ph ph-prohibit"></i>Decline</button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- ASIDE: what is staged, then where to get more. -->
            <div class="flex flex-col gap-3 min-w-0">

              <!-- Staged items, grouped by source repo@ref, then local. Shown
                   from the start (empty) for the reason above: the section a
                   reader is about to fill should be visible before they fill
                   it. Its set actions disable while there is nothing to act
                   on. -->
              <div class="flex flex-col gap-1.5">
                <!-- The label row carries the set's own actions, in the order
                     they escalate: a link serializes it into a URL, a pin
                     serializes it into a file, a sweep empties it. All three
                     act on exactly the list beneath them, where the per-item x
                     already removes one. Send lives with the bundle instead,
                     since it moves file CONTENTS into a folder, where these
                     move the LIST; putting them in one row read as variations
                     on each other when they are unrelated acts. -->
                <div class="flex items-center gap-1 text-base font-semibold uppercase tracking-wide text-base-content/40">
                  Staged<span class="normal-case tracking-normal opacity-70" x-text="' · ' + items.length"></span>
                  <div class="grow"></div>
                  <!-- The GLYPHS match the row above (text-xl); the BOXES stay
                       btn-sm. Six default-size buttons plus the label overflow
                       this sidebar: the row wrapped and the last one clipped.
                       The icon is what reads as size, so growing it and leaving
                       the box compact answers the complaint without the wrap.
                       Attach and Paste put material DIRECTLY into this list;
                       everything under Add is a finder over repo files that
                       happens to end in the same place. They sat in the Add
                       header on that resemblance, which put the two controls
                       that need no search behind the heading for searching. -->
                  <button @click="$refs.fileInput.click()" class="btn btn-square btn-ghost btn-sm hover:text-primary"
                          title="Attach a local file (or drop one anywhere on this view)">
                    <i class="ph ph-paperclip text-xl"></i>
                  </button>
                  <button @click="pasteIn()" class="btn btn-square btn-ghost btn-sm hover:text-primary"
                          title="Paste the clipboard as a staged file (or as refs, one per line)">
                    <i class="ph ph-clipboard-text text-xl"></i>
                  </button>
                  <!-- Third intake, same row and the same destination: a file
                       that exists nowhere yet, spoken instead of pasted. The
                       button is hidden rather than disabled where the browser
                       has no recognizer, since a control that can never work
                       is not information. -->
                  <button x-show="dictAvail" @click="dictOpen ? dictCancel() : dictStart()"
                          class="btn btn-square btn-ghost btn-sm"
                          :class="dictOpen ? 'text-error' : 'hover:text-primary'"
                          title="Dictate a staged file">
                    <i class="ph text-xl" :class="dictOpen ? 'ph-x' : 'ph-microphone'"></i>
                  </button>
                  <div class="w-px self-stretch bg-base-300 mx-0.5"></div>
                  <button @click="copyLink()" :disabled="!items.length" class="btn btn-square btn-ghost btn-sm hover:text-primary"
                          title="Copy the persistent stage link: a #stage= URL that reopens these refs (and the current tab) anywhere (local files excluded)">
                    <i class="ph text-xl" :class="linkCopied ? 'ph-check' : 'ph-link'"></i>
                  </button>
                  <button @click="openSave()" :disabled="!items.length" class="btn btn-square btn-ghost btn-sm hover:text-primary"
                          title="Save this set as a surface, kept alongside the others">
                    <i class="ph ph-push-pin text-xl"></i>
                  </button>
                  <button @click="clearAll()" :disabled="!items.length" class="btn btn-square btn-ghost btn-sm hover:text-error" title="Clear the stage">
                    <i class="ph ph-broom text-xl"></i>
                  </button>
                </div>

                <!-- The dictation bar. Open only while dictating, and it owns
                     no state of its own: the buffer lives in kits/dictate.js
                     and this renders it, the same relation the FAB's Notes tab
                     has to the annotator. The committed text is plain and the
                     hypothesis still being heard is muted italic, so the reader
                     can tell what the engine has settled from what it may yet
                     revise; Stage commits the hypothesis either way, since they
                     have read it. -->
                <!-- data-no-swipe: extending a selection in here is a
                     horizontal drag over nothing scrollable, so the app's view
                     pager cannot infer that this region owns the axis and would
                     page the whole app out from under the gesture. -->
                <!-- Also the handles' LAYER (relative, and it does not clip),
                     so a ball may hang above the text box's first line into the
                     card's own padding rather than being cut off by the box.
                     Its taps are delegated, since the painter rebuilds those
                     elements and a per-element handler would not survive. -->
                <div x-show="dictOpen" x-cloak data-no-swipe x-ref="dictLayer"
                     @pointerdown="dictLayerTap($event)"
                     class="relative border border-base-300 rounded-lg p-2 flex flex-col gap-2">
                  <!-- whitespace-pre-wrap sits on the SPANS, not on this box.
                       A paragraph mark writes \n\n into the buffer so the text
                       needs it, but on the container it also preserves the
                       markup's own indentation as a leading text node, which
                       renders as a first-line indent under the real text.
                       Caught by the headless shot; invisible in the source. -->
                  <!-- Text and pad side by side, the pad on the right where a
                       thumb already rests. Same three-plus-shift arrangement
                       as the annotator's composer, for the same reasons: a
                       vertical key can be tall AND wide where six across a
                       narrow card could only be narrow, and three of them are
                       big enough to hit without looking. -->
                  <div x-show="!dictEdit" class="flex gap-1.5 items-stretch">
                    <!-- Painted by the kit, not by x-text: the buffer, the
                         hypothesis, the caret and the selection all render here
                         exactly as they do in the annotator's composer, because
                         the offsets are the kit's and so are the spans showing
                         them. What this component owns is the gestures. -->
                    <!-- text-lg: this is the surface being dictated INTO, read
                         at arm's length while speaking rather than leaned over,
                         so it runs a size above the card's other type. -->
                    <!-- The height is WHOLE LINES. max-h-40 against a relaxed
                         line-height came to five and a half, so the box ended
                         mid-glyph and the half was the newest line, the one
                         being spoken. 1.75rem lines, six of them. -->
                    <div class="flex-1 min-w-0 min-h-[3.5rem] max-h-[10.5rem] overflow-y-auto text-lg leading-[1.75rem] px-1"
                         @scroll="dictPaint()">
                      <div class="whitespace-pre-wrap" x-ref="dictBody"
                           x-init="dictBind($el)" @contextmenu.prevent></div>
                      <div x-show="!dictText && !dictInterim" class="opacity-40 italic">Listening…</div>
                    </div>
                    <div class="flex flex-col gap-1 w-12 shrink-0">
                      <!-- The stitch key carries a glyph where the others
                           carry their own mark, so the face is two children
                           rather than an x-text: the button that writes a full
                           stop is the button that takes one back, and it tints
                           because it appeared under a thumb aimed at something
                           else. -->
                      <template x-for="(m, i) in dictMarks" :key="i">
                        <button @pointerdown.prevent="dictMark(m)"
                                class="btn btn-sm h-10 min-h-0 px-0 text-xl font-semibold"
                                :class="m === 'stitch' ? 'btn-warning' : ''"
                                :title="m === 'stitch' ? 'Join this to the sentence before it: the full stop goes and the capital comes down'
                                        : m === '¶' ? 'New paragraph' : 'Insert ' + m">
                          <i x-show="m === 'stitch'" class="ph ph-arrows-in-line-horizontal"></i>
                          <span x-show="m !== 'stitch'" x-text="m"></span>
                        </button>
                      </template>
                      <!-- Sticky in fact, momentary in feel: a shifted mark
                           drops it the way a phone keyboard does, since the
                           held case is the one asked for by tapping again. -->
                      <!-- While a selection is live this key drops it, which
                           is the way back to the marks: the pad and the
                           selection are one state, so one key ends both rather
                           than leaving a mode with no exit. -->
                      <button @pointerdown.prevent="dictSel ? dictDrop() : (dictShift = !dictShift)"
                              class="btn btn-sm h-8 min-h-0 px-0 font-mono text-sm"
                              :class="dictSel ? 'btn-info btn-outline' : (dictShift ? 'btn-warning' : '')"
                              :title="dictSel ? 'Drop the selection' : 'The other three marks'"
                              x-text="dictSel ? '✕' : (dictShift ? 'abc' : '·!¶')"></button>
                      <!-- Backspace joins the pad rather than the bottom row.
                           It is tapped AS YOU GO, at the same rhythm as the
                           marks and by the same thumb, so a row away made the
                           one control reached for mid-sentence the only one to
                           look for. Styled apart, not alike: it is the only key
                           here that destroys rather than inserts. -->
                      <button @pointerdown.prevent="dictBack()"
                              class="btn btn-sm btn-outline btn-error h-10 min-h-0 px-0"
                              title="Delete the last word">
                        <i class="ph ph-backspace text-xl"></i>
                      </button>
                    </div>
                  </div>
                  <!-- The keyboard half. Same textarea the annotator's pencil
                       opens, and the same rule: what is typed here is the truth
                       on the way out, so dictation resumes from it. -->
                  <textarea x-show="dictEdit" x-cloak x-ref="dictTa" x-model="dictDraft"
                            rows="3" class="textarea textarea-bordered w-full text-lg leading-relaxed"
                            placeholder="Type the note"></textarea>
                  <!-- flex-wrap, because the row is one control wider in edit
                       mode now that the mic holds its slot, and the sidebar is
                       narrow. Without it Stage was clipped off the right edge
                       rather than moving to a second line. -->
                  <div class="flex flex-wrap items-center gap-2">
                    <!-- In edit mode the mic STAYS and goes dim rather than
                         vanishing. Hiding it collapsed the row and slid the
                         Done button into its place, which is half of why that
                         button read as a live microphone. A dimmed mic holds
                         the slot and says the plain thing: dictation is off. -->
                    <button @click="dictToggle()" :disabled="dictEdit"
                            class="btn btn-square h-11 min-h-0 w-11"
                            :class="dictEdit ? 'btn-ghost opacity-40' : (dictOn ? 'btn-error' : 'btn-ghost')"
                            :title="dictEdit ? 'Dictation is paused while you type'
                                             : (dictOn ? 'Recording. Tap to stop.' : 'Resume')">
                      <i class="ph ph-microphone text-2xl"></i>
                    </button>

                    <!-- The pencil is a MODE SWITCH, not a one-way door, which
                         is the annotator's rule: dictation is the default and
                         typing is the other half of one toggle. In edit mode it
                         grows the word DONE and wears a CHECK.
                         It wore a microphone first, on the theory that the icon
                         should say where the tap LANDS while the word says what
                         the tap IS, and adding the word was already the second
                         attempt after readers found no confirm at all. Both
                         readings were wrong. The field shot of 2026-08-10 shows
                         three signals stacking: a microphone glyph, an amber
                         fill, and the real mic button hiding so this one slid
                         into its slot. Together they say "recording" while the
                         keyboard is open and nothing is being heard. Green and
                         a check, matching the pin cluster's confirm key. -->
                    <button @click="dictEdit ? dictEditClose() : dictEditOpen()"
                            class="btn h-11 min-h-0 gap-1.5"
                            :class="dictEdit ? 'btn-success btn-outline px-3' : 'btn-ghost btn-square w-11'"
                            :title="dictEdit ? 'Done: back to dictation' : 'Type instead (opens the keyboard)'">
                      <i class="ph text-2xl" :class="dictEdit ? 'ph-check' : 'ph-pencil-simple'"></i>
                      <span x-show="dictEdit" class="text-base">Done</span>
                    </button>
                    <!-- The pause record made visible. The kit knows where the
                         silences were, so the breaks are read off the dictation
                         rather than guessed at; the toggle is here because it
                         is a proposal and the reader is the one accepting it. -->
                    <label class="flex items-center gap-1.5 text-base"
                           :class="!dictBreakable ? 'opacity-40' : (dictBreaks ? 'cursor-pointer' : 'opacity-60 cursor-pointer')"
                           :title="dictBreakable ? 'Break into paragraphs where you paused longest'
                                   : 'Needs the pause record, which typing replaces'">
                      <input type="checkbox" x-model="dictBreaks" :disabled="!dictBreakable"
                             class="checkbox checkbox-sm">
                      <span>Breaks</span>
                    </label>
                    <div class="grow"></div>
                    <button @click="dictStage()"
                            :disabled="!dictText && !dictInterim && !dictDraft.trim()"
                            class="btn btn-primary h-11 min-h-0 gap-1.5 px-4 text-base">
                      <i class="ph ph-check text-xl"></i>Stage
                    </button>
                  </div>
                  <div x-show="dictErr" class="text-base text-error" x-text="dictErr"></div>
                </div>

                <!-- The one line the removed drop box is replaced by: where
                     the items will appear, saying what puts them there. -->
                <div x-show="!items.length && !dictOpen && !offers.length"
                     class="border border-dashed border-base-300 rounded-lg px-3 py-4 text-center text-base text-base-content/50">
                  Nothing staged. Drop a file anywhere, or use Add below.
                </div>

                <!-- WHAT ELSE COULD TAKE THIS. A sibling of the flavors bar
                     below and deliberately not merged into it: that bar offers
                     other readings of one paste, this offers another TOOL for
                     what was already read, and collapsing the two would make
                     "carried" mean two things. Same grammar though, a chip that
                     costs nothing to ignore, because the answer to "should this
                     go to the workbench" is usually no and a dialog would ask
                     it every time.

                     One row per staged item that qualifies, since a stage holds
                     several and only some are transform-shaped. -->
                <div x-show="transformables.length" x-cloak
                     class="border border-secondary/30 bg-secondary/5 rounded-lg px-2.5 py-2 flex flex-col gap-1.5">
                  <div class="flex items-center gap-1.5 text-base text-base-content/60">
                    <i class="ph ph-function text-secondary"></i>
                    <span>Transform could take</span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <template x-for="t in transformables" :key="t.key">
                      <button @click="openTransform(t.item)"
                              :title="t.title"
                              class="badge badge-outline badge-lg gap-1.5 cursor-pointer hover:badge-secondary h-auto py-1">
                        <i class="ph text-sm" :class="tfBusy ? 'ph-circle-notch animate-spin' : 'ph-arrow-square-out'"></i>
                        <span class="font-mono" x-text="t.item.name"></span>
                        <span class="opacity-50" x-text="t.label"></span>
                      </button>
                    </template>
                  </div>
                </div>

                <!-- THE PASTE'S OTHER FORMATS. One copy out of a spreadsheet
                     puts the cells, an HTML table, and a picture of the range
                     on the clipboard at once. The stage takes the one it
                     always took and lists the rest here, one tap each. A bar
                     rather than a dialog: the common case is "take the obvious
                     one and carry on", which a modal would tax to serve the
                     rare case, and this row is also the only place that ever
                     says what a copy actually put on the clipboard. -->
                <div x-show="offers.length" x-cloak
                     class="border border-primary/30 bg-primary/5 rounded-lg px-2.5 py-2 flex flex-col gap-1.5">
                  <div class="flex items-center gap-1.5 text-base text-base-content/60">
                    <i class="ph ph-clipboard-text text-primary"></i>
                    <span>That paste also carried</span>
                    <div class="grow"></div>
                    <button @click="dismissOffers()" class="opacity-40 hover:opacity-100 hover:text-error" title="Dismiss">
                      <i class="ph ph-x"></i></button>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <template x-for="fl in offers" :key="fl.name">
                      <button @click="stageFlavor(fl)"
                              :title="'Stage ' + fl.name + ' (' + fl.type + ')'"
                              class="badge badge-outline badge-lg gap-1.5 cursor-pointer hover:badge-primary h-auto py-1">
                        <i class="ph ph-plus text-sm"></i>
                        <span class="font-mono" x-text="flavorLabel(fl)"></span>
                        <span class="opacity-50" x-text="fmtSize(fl.size)"></span>
                      </button>
                    </template>
                  </div>
                </div>
                <template x-for="g in groups" :key="g.key">
                  <div class="border border-base-300 rounded-lg bg-base-100 overflow-hidden">
                    <div class="px-2.5 py-1 bg-base-200/60 font-mono text-base flex items-center gap-1.5">
                      <i class="ph ph-git-branch opacity-60 shrink-0"></i><span class="truncate" x-text="g.key"></span>
                      <span class="opacity-40 shrink-0" x-text="'· ' + g.items.length"></span>
                    </div>
                    <div class="p-1">
                      <template x-for="it in g.items" :key="itemKey(it)">
                        <div class="group flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-base-200 text-base">
                          <button @click="view(it)" class="flex items-center gap-1.5 min-w-0 cursor-pointer hover:text-primary text-left">
                            <i class="ph ph-file text-info shrink-0"></i>
                            <span class="truncate font-mono text-base" x-text="it.path"></span>
                          </button>
                          <div class="grow"></div>
                          <!-- The row's jump-over, at the item's OWN repo@ref
                               rather than the shell's: a stage is cross-repo by
                               construction. It used to take opening the preview
                               to reach the file's GitHub home. -->
                          <a :href="itemGh(it)" :data-peek="itemPeek(it)" target="_blank" rel="noopener"
                             :title="itemKey(it) + ' on GitHub'"
                             class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0">
                            <i class="ph ph-github-logo"></i></a>
                          <button @click="rm(it)"
                                  class="btn btn-ghost w-5 h-5 min-h-0 p-0 opacity-30 hover:opacity-100 hover:text-error shrink-0">
                            <i class="ph ph-x"></i>
                          </button>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>

                <div x-show="localItems.length" class="border border-base-300 rounded-lg bg-base-100 overflow-hidden">
                  <div class="px-2.5 py-1 bg-base-200/60 font-mono text-base flex items-center gap-1.5">
                    <i class="ph ph-upload-simple opacity-60 shrink-0"></i><span>local</span>
                    <span class="opacity-40" x-text="'· ' + localItems.length"></span>
                  </div>
                  <div class="p-1">
                    <template x-for="it in localItems" :key="itemKey(it)">
                      <div class="group flex items-center gap-2 px-2 py-1 rounded hover:bg-base-200 text-base">
                        <!-- RENAMING REPLACES THE ROW'S OPENER rather than
                             sitting beside it: the input is the name, in the
                             same place and the same font, so nothing on the
                             row moves when it opens and there is never both a
                             name and a field claiming to be it. Only one row
                             renames at a time, which is what lets the input
                             carry a single x-ref inside an x-for. -->
                        <template x-if="renameId === it.id">
                          <input x-ref="renameInput" x-model="renameDraft" type="text"
                                 @keydown.enter.prevent="commitRename()"
                                 @keydown.escape.prevent.stop="cancelRename()"
                                 @blur="commitRename()"
                                 autocomplete="off" autocapitalize="off" spellcheck="false"
                                 class="input input-bordered input-sm grow min-w-0 font-mono text-lg sm:text-base">
                        </template>
                        <template x-if="renameId !== it.id">
                          <button @click="view(it)" class="flex items-center gap-1.5 min-w-0 grow cursor-pointer hover:text-primary text-left">
                            <i class="ph ph-file-dashed text-warning shrink-0"></i>
                            <span class="truncate font-mono text-base" x-text="it.name"></span>
                            <span class="opacity-50 shrink-0 text-base" x-text="fmtSize(it.size)"></span>
                          </button>
                        </template>
                        <!-- Always drawn at low opacity, never hover-revealed:
                             the ref row's GitHub jump-over can hide behind a
                             hover because the row itself is a link to the same
                             place, but a name that cannot be corrected on a
                             phone is the defect this fixes. -->
                        <button x-show="renameId !== it.id" @click="startRename(it)"
                                title="Rename (the extension picks the preview mode and rides into the deposited path)"
                                class="btn btn-ghost w-5 h-5 min-h-0 p-0 opacity-30 hover:opacity-100 hover:text-primary shrink-0">
                          <i class="ph ph-pencil-simple"></i>
                        </button>
                        <button @click="rm(it)"
                                class="btn btn-ghost w-5 h-5 min-h-0 p-0 opacity-30 hover:opacity-100 hover:text-error shrink-0">
                          <i class="ph ph-x"></i>
                        </button>
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <!-- ── Add: three pills ────────────────────────────────────────
                   Browse, Recent, and Search share one corpus (addRoots) and
                   one outcome (a staged ref), but they are not one question.
                   Folding them into a single query box put recent files in the
                   same list as the repos you navigate, and a list that is half
                   "places to go" and half "things that happened" reads as
                   neither. They are three panes behind the app's segmented
                   pill, the same control the Stage, Activity, and Map use.

                   What survives from the one-box build is the part that was
                   actually about cost rather than layout: BROWSE AND SEARCH
                   SHARE ONE TREE CACHE. Entering a repo reads its tree, and
                   Search reads only what is still missing, so browsing pays
                   for searching in advance instead of the two each fetching
                   the same thing. The pill tap is the gate on that cost, which
                   is what a tap is for and what a keystroke is not. -->
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-1 text-base font-semibold uppercase tracking-wide text-base-content/40">
                  Add
                  <div class="grow"></div>
                  <button x-show="addTab === 'recent'" @click="loadRecent(true)" class="btn btn-square btn-ghost btn-sm hover:text-primary" title="Refresh recent">
                    <i class="ph text-base" :class="recentLoading ? 'ph-circle-notch animate-spin' : 'ph-arrows-clockwise'"></i>
                  </button>
                  <button @click="recentOpen = !recentOpen" class="btn btn-square btn-ghost btn-sm" title="Collapse">
                    <i class="ph ph-caret-down text-base transition-transform" :class="!recentOpen && '-rotate-90'"></i>
                  </button>
                </div>

                <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit flex-wrap" role="tablist">
                  <button role="tab" @click="addTab = 'browse'"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="addTab === 'browse' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph ph-folder-open text-lg"></i>Browse</button>
                  <button role="tab" @click="addTab = 'recent'"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="addTab === 'recent' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph ph-clock-counter-clockwise text-lg"></i>Recent
                    <span x-show="recent.length" class="font-mono text-sm opacity-60" x-text="recent.length"></span></button>
                  <button role="tab" @click="addTab = 'search'; loadAllTrees()"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="addTab === 'search' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph ph-magnifying-glass text-lg"></i>Search</button>
                </div>

                <!-- BROWSE: repos, then folders, then files. Crumbs walk back
                     up; the house returns to the roots. No text input, which is
                     path-picker's rule and its reason: an input invites iOS's
                     focus zoom for what is entirely navigation. -->
                <div x-show="recentOpen && addTab === 'browse' && addScope" class="flex items-center gap-0.5 flex-wrap text-base">
                  <button @click="addUp(-1)" class="px-1.5 py-0.5 rounded hover:bg-base-200 text-base-content/50 hover:text-primary" title="All repos">
                    <i class="ph ph-house"></i></button>
                  <template x-for="(c, i) in addCrumbs()" :key="i">
                    <div class="flex items-center gap-0.5 min-w-0">
                      <i class="ph ph-caret-right text-base-content/25 text-sm"></i>
                      <button @click="addUp(i)" class="px-1.5 py-0.5 rounded hover:bg-base-200 truncate font-mono"
                              :class="i === addCrumbs().length - 1 ? 'text-base-content/70' : 'text-base-content/45 hover:text-primary'"
                              x-text="c.label"></button>
                    </div>
                  </template>
                  <div class="grow"></div>
                  <span x-show="addTruncated" class="text-base-content/40" title="This repo's tree is too large to list in full">partial</span>
                </div>

                <!-- RECENT: the cross-repo sweep, with its own repo filter.
                     Badges, not tabs: they narrow one list rather than swapping
                     panes, and reading as a different control is the point. -->
                <div x-show="recentOpen && addTab === 'recent' && repoPills().length > 1" class="flex flex-wrap gap-1">
                  <template x-for="pl in repoPills()" :key="pl.repo">
                    <button @click="togglePill(pl.repo)"
                            class="badge badge-sm cursor-pointer gap-1 transition-opacity"
                            :class="pillSel === pl.repo ? 'badge-primary' : pillSel ? 'badge-ghost opacity-40' : 'badge-ghost'">
                      <span x-text="shortRepo(pl.repo)"></span>
                      <span class="opacity-60" x-text="pl.n"></span>
                    </button>
                  </template>
                </div>

                <!-- SEARCH: filename-contains across every root repo. 16px
                     below sm so iOS does not zoom on focus, and never
                     autofocused. Matching is local per keystroke; the trees it
                     reads were paid for when this pill was tapped. -->
                <label x-show="recentOpen && addTab === 'search'" class="input input-bordered flex items-center gap-2">
                  <i class="ph ph-magnifying-glass opacity-50"></i>
                  <input x-model="addQ" type="text" placeholder="File name contains…"
                         autocomplete="off" autocapitalize="off" spellcheck="false"
                         class="grow font-mono text-lg sm:text-base">
                  <button x-show="addQ" @click="addQ = ''" class="opacity-40 hover:opacity-100 shrink-0" title="Clear">
                    <i class="ph ph-x-circle"></i></button>
                </label>

                <div x-show="recentOpen && addBusy" class="flex justify-center py-4">
                  <span class="loading loading-dots loading-md opacity-30"></span>
                </div>

                <!-- The cap earns its keep on a phone, where an unbounded list
                     pushes everything below it off the screen. Above lg there
                     is nothing below it to push, so 18rem was cutting the list
                     off against empty page: the same phone measurement the
                     grid track above carried, in the one pane whose whole job
                     is showing rows. It still scrolls, it just stops being the
                     binding constraint before the viewport is. -->
                <div x-show="recentOpen" class="flex flex-col max-h-72 lg:max-h-[28rem] xl:max-h-[34rem] overflow-y-auto overscroll-contain rounded-lg">
                  <template x-for="row in addRows()" :key="row.key">
                    <div class="group flex items-center rounded-lg hover:bg-base-200 transition-colors">
                      <!-- One row shape for all three panes, and the icon says
                           what the tap does: a caret descends, a plus stages, a
                           check unstages. The GitHub jump rides beside the
                           button, since an anchor inside a button is not a
                           control. -->
                      <button @click="addPick(row)"
                              class="flex items-center gap-2.5 px-2 py-1.5 min-w-0 flex-1 text-left">
                        <i class="ph text-lg shrink-0" :class="addRowIcon(row)"></i>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-baseline justify-between gap-2">
                            <span class="truncate font-mono text-base" x-text="row.label"></span>
                            <span x-show="row.date" class="shrink-0 text-base opacity-50" x-text="ago(row.date)"></span>
                          </div>
                          <div x-show="row.sub" class="truncate font-mono text-base opacity-50"
                               :title="row.title" x-text="row.sub"></div>
                        </div>
                        <i x-show="row.kind === 'repo' || row.kind === 'dir'"
                           class="ph ph-caret-right text-base-content/25 shrink-0"></i>
                      </button>
                      <a x-show="row.kind === 'file'" :href="itemGh(row)" :data-peek="itemPeek(row)" target="_blank" rel="noopener"
                         :title="row.title + ' on GitHub'"
                         class="px-2 py-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0">
                        <i class="ph ph-github-logo"></i></a>
                    </div>
                  </template>

                  <div x-show="addEmpty" class="py-4 text-center text-base text-base-content/50" x-text="addEmpty"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- THE PREVIEW IS NOT HERE. It is a swipe-deck takeover, opened from
               openPreview() below and mounted on document.body by the kit, so
               there is no markup for it in this template. It used to be a
               centred dialog over a bg-black/40 scrim with its own touch
               handling, its own arrow keys, and no room in its header for the
               file's name; kits/swipe-deck.js already had all three and a
               title, a subtitle, a jump-out link, history-backed dismissal and
               correct nesting besides. Retired 2026-08-18. -->


          <!-- Save-as-surface dialog. It exists for the preview, not the two
               text fields: the serialized form is not guessable from the list
               on screen (a path shortens or keeps its owner/repo@ref by where
               it came from, a diff pair becomes a relation, a local file rides
               its own bytes or is left behind), so the one honest way to show
               what is about to be written is to show it. Saving APPENDS: every
               save mints a new file, and a set is removed by deleting its own,
               which is why nothing here asks what to overwrite. -->
          <dialog x-ref="saveDlg" class="modal" onclick="if(event.target===this)this.close()">
            <div class="modal-box max-w-2xl">
              <h3 class="font-bold text-lg flex items-center gap-2 mb-3">
                <i class="ph ph-push-pin"></i>
                <span x-text="origin ? 'Update surface' : 'Save as surface'"></span>
              </h3>
              <p class="text-base text-base-content/50 -mt-2 mb-3"
                 x-text="origin ? 'Writes back to the file this set was read from.'
                                : 'Writes a new file. Nothing already saved is touched.'"></p>
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40">Name</label>
                  <input x-model="saveName" :placeholder="autoName"
                         class="input input-bordered w-full" :disabled="savingStage">
                  <span class="text-base text-base-content/40">Blank takes the generated name. A saved set is a
                    clipboard entry before it is a document; rename it later if it becomes one.</span>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40">Why this set exists</label>
                  <input x-model="saveDesc" placeholder="optional"
                         class="input input-bordered w-full" :disabled="savingStage">
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40">Proposed destination</label>
                  <input x-model="saveDest" placeholder="owner/repo:dir (optional)"
                         class="input input-bordered w-full font-mono" :disabled="savingStage">
                  <span class="text-base text-base-content/40">Where this set is meant to go. A claim about the set,
                    not a transfer: nothing is sent by saving.</span>
                </div>
                <div x-show="saveSkipped.length" class="text-base text-warning flex items-start gap-1.5">
                  <i class="ph ph-warning shrink-0 mt-0.5"></i>
                  <span>Left out, being bytes a JSON field cannot carry:
                    <span class="font-mono" x-text="saveSkipped.join(', ')"></span></span>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40 flex items-center gap-2">
                    Will be written
                    <span class="font-mono normal-case tracking-normal opacity-60" x-text="savePath"></span>
                  </label>
                  <div class="overflow-auto font-mono text-base leading-snug border border-base-300 rounded p-2 bg-base-200/40 max-h-64 whitespace-pre"
                       x-text="savePreview"></div>
                </div>
              </div>
              <div class="modal-action">
                <button @click="$refs.saveDlg.close()" class="btn btn-ghost">Cancel</button>
                <button @click="saveAsSurface()" :disabled="savingStage || !items.length" class="btn btn-primary gap-1">
                  <i class="ph" :class="savingStage ? 'ph-circle-notch animate-spin' : 'ph-push-pin'"></i>
                  <span x-text="savingStage ? 'Saving…' : 'Save'"></span>
                </button>
              </div>
            </div>
          </dialog>

          <!-- Whole-view drag cue: purely visual (pointer-events-none), so the
               drop lands on the root handler beneath it. -->
          <div x-show="_dragDepth > 0" x-cloak
               class="pointer-events-none absolute inset-0 z-40 rounded-xl border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center">
            <div class="flex items-center gap-2 text-primary font-medium">
              <i class="ph ph-tray-arrow-down text-2xl"></i>Drop to stage
            </div>
          </div>
        </div>`,

      destSpec: '',
      // The preview is a POSITION in the stage: { i, name, mode }. The deck
      // owns the walking, so this is what the component still needs to know:
      // which item the header is naming, and whether the slides are files or
      // diffs. `_pDeck` is the kit's handle, and its being null is also the
      // test for "closed", since the deck can be dismissed four ways (✕,
      // Escape, Back, a parent cascading) and onClose is the only one of them
      // this component sees.
      preview: null,
      _pDeck: null,
      // Why a position renders nothing, kept per index rather than only on the
      // active slide: the deck builds neighbours too, so a slide reporting its
      // own outcome straight onto `preview` would let slide i+1 overwrite what
      // slide i said. `preview.note` is this map read at the active index.
      _pNotes: {},
      // A local item's name is authored nowhere: a drop takes the file's own
      // name, a paste and a dictation get one sniffed from the first few
      // characters, and that guess is what the deposit writes. `renameId` is
      // the one row whose name is open for editing; `renameDraft` is its value
      // until Enter or a blur commits it.
      renameId: null,
      renameDraft: '',
      saveName: '', saveDesc: '', saveDest: '',   // save-as-surface dialog fields
      recent: [],          // [{repo, ref, path, date}] merged across root repos
      recentOpen: true,    // header toggles; the list scrolls inside its box
      recentLoading: false,
      _recentLoaded: false,
      // ── Add: three panes ───────────────────────────────────────────────
      // Browse (addScope), Recent (pillSel), Search (addQ). Each pane owns its
      // own state and reads none of the others'. Folding them into one query
      // box put recent files in the same list as the repos you navigate, and a
      // list that is half "places to go" and half "things that happened" reads
      // as neither; they are three questions, so they are three panes.
      addTab: 'recent',    // 'browse' | 'recent' | 'search'
      addQ: '',            // Search only
      addScope: null,      // Browse only: null | {repo, ref, dir}
      pillSel: '',         // Recent only: single-select repo filter ('' = all)
      // One recursive tree per repo, keyed by repo, filled from either
      // direction: descending into a repo loads its tree, and the deep search
      // loads whatever is still missing. Sharing the cache is what makes the
      // escalation get cheaper the more you have browsed.
      trees: {},           // {repo: {paths:[…], truncated:bool}}
      treeBusy: '',        // repo whose tree is in flight (descent)
      deepBusy: false,     // the escalation is in flight (all remaining repos)
      diffA: 0, diffB: 0,  // staged-item indexes for the compare
      diffRows: null,      // [{t:'ctx'|'add'|'del', line}] | null
      diffStat: '',
      diffBusy: false,
      diffCopied: false,
      promptCopiedIdx: -1,
      linkPrompts: [],     // bespoke review asks carried on the opening #stage= link
      linkMode: '',        // 'diff' when the opening link declared a diff intent
      _dragDepth: 0,       // whole-view drag counter (nested enter/leave safe)
      _autoDiffed: false,  // a diff-mode link auto-runs its diff once
      _diffTextA: '', _diffTextB: '',  // the two sides' text from the last runDiff
      sending: false,
      sendArmed: false,
      resolvedDest: null,   // destination after any inbox resolution, for the label
      _inboxCache: {},      // repo -> box|null, one manifest read per repo per session
      asks: [],             // open mailbox asks: what a session wants FROM YOU
      asksLoading: false,
      sendStatus: '',
      savingStage: false,
      linkCopied: false,
      // Dictation. `dictText` and `dictInterim` are mirrors the kit writes; the
      // buffer itself lives in the handle, never here.
      dictOpen: false,
      dictOn: false,
      dictText: '',
      dictInterim: '',
      dictBreaks: true,
      dictErr: '',
      dictEdit: false,     // keyboard mode; dictDraft is the textarea's value
      dictDraft: '',
      dictShift: false,    // the pad's second set
      dictArmed: null,     // 'start' | 'end' while a selection handle is armed
      // The pad's face turns on where the RANGE is, and the range lives in the
      // kit rather than in this component, so nothing reactive changes when the
      // caret moves: `dictText` is assigned the same string and a reactive set
      // to an equal value notifies nobody. This counter is what a binding
      // depends on instead. Bumped in dictPaint(), which every gesture already
      // ends with, so the beat and the paint cannot fall out of step.
      dictBeat: 0,
      _dict: null,
      _dictHost: null,
      _dictStyled: false,
      _dictResume: false,  // was the engine live when the keyboard opened?
      // The concatenated block and its content cache (keyed by itemKey, so a
      // remove/re-add never refetches). Rebuilt whenever the stage changes.
      bundleText: '',
      bundleBusy: false,
      bundleCopied: false,
      _cache: {},

      init() {
        this.$root.__stager = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        // The Recent sweep can just run: the bench mounts on the first visit to
        // the Stage (estate.js latches its x-if), not hidden at page load, so
        // reaching here already means the view is being looked at. It is the
        // Add box's landing content, and the only read the box makes without
        // being asked; the per-repo trees behind browsing and the deep search
        // are both pulled on a tap. Cached until the header's refresh.
        this.loadRecent();
        // Same reasoning as loadRecent: mounting means the Stage is being looked
        // at, and an ask nobody sees is the failure the whole channel exists to
        // prevent.
        this.loadAsks();
        // A drop taken elsewhere in the app names the item it staged; the
        // bench is usually mounting BECAUSE of that drop, so the standing key
        // is read here and the watcher covers the warm case.
        this.focusFromStore();
        this.$watch(() => Alpine.store('browser').stageFocus, () => this.focusFromStore());
        // The repo's .web-tools.json manifest (probed by the shell) can carry
        // a durable staged-files list; fold it in whenever a config lands.
        this.$watch(() => Alpine.store('browser').config, cfg => this.seedStage(cfg));
        this.seedStage(Alpine.store('browser').config);
        // Keep the concatenated block in step with the stage. Newly-added
        // items fetch once (cache); removed items just drop out of the join.
        this.$watch(() => this.items.map(it => this.itemKey(it)).join('|'), () => this.ensureBundle());
        this.ensureBundle();
        // The pair is chosen by the preview's position (previewPair), so
        // nothing here picks one. This only CLAMPS: an item removed under an
        // open diff must not leave an index pointing past the end.
        const clampPair = () => {
          const n = this.items.length;
          if (this.diffA >= n) { this.diffA = 0; this.invalidateDiff(); }
          if (this.diffB >= n) { this.diffB = Math.max(0, n - 1); this.invalidateDiff(); }
        };
        this.$watch(() => this.items.length, clampPair);
        clampPair();
        // The opening #stage= link carries commentary and, optionally, a diff
        // intent (the shell seeds the refs from the same hash and leaves it in
        // place). Read both once: the bespoke prompts show first in the panel,
        // and a mode=diff link OPENS THE PREVIEW ON ITS DIFF once the two items
        // have landed (the shell seeds them after mount). It used to select a
        // tab on the page; with the diff living in the preview, the link's
        // intent is best served by putting the reader in front of it.
        try {
          const lk = window.StageLink.read(location);
          this.linkPrompts = lk.prompts;
          this.linkMode = lk.mode;
          // A dest-carrying link opens the stage already aimed (the branch
          // page's add-file plus): the send field prefills, the user still
          // stages content and taps send themselves. A destination the user
          // already typed wins.
          if (lk.dest && !this.destSpec.trim()) this.destSpec = lk.dest;
          // Local text carried in the fragment: decoded after mount (gzip is
          // async) and appended to whatever the shell seeded, so a link that
          // is nothing but a paste reopens as that paste.
          if (lk.gz) {
            window.StageLink.decodeLocals(lk.gz).then(locals => {
              if (!locals.length) return;
              const s = Alpine.store('browser');
              const have = new Set(this.localItems.map(it => it.name));
              const fresh = locals.filter(l => !have.has(l.name)).map(l => textItem(l.name, l.text));
              if (fresh.length) s.stage = [...this.items, ...fresh];
            }).catch(() => {});
          }
        } catch {}
        const autoDiff = () => {
          if (this.linkMode !== 'diff' || this._autoDiffed || this.items.length < 2) return;
          this._autoDiffed = true;
          this.previewAt(0, 'diff');
        };
        this.$watch(() => this.items.length, autoDiff);
        autoDiff();
        // THE PASTE LISTENER IS THE HOST'S NOW, and its absence here is the
        // change. This component used to register a window paste listener of
        // its own and gate it on `view === 'stage'`, which meant the gesture
        // only worked on the view you were pasting INTO, and only after the
        // bench had mounted. The fold moved to window.StageIntake.takePaste
        // and show-repo's shell owns the gesture, the way it already owns the
        // drop. A second listener here could not coordinate with it in any
        // case: window listeners fire in registration order, the shell's
        // init() runs at boot and this component mounts on the first visit to
        // an estate view, so the shell is always first and `defaultPrevented`
        // would never be set by the time it read it.
      },

      // Whether to offer dictation at all. A getter, not an init-time field:
      // asked of the window directly so the button is decided before the kit
      // is loaded (it arrives on the first tap), and read at render so nothing
      // depends on a recognizer existing at the instant init() ran.
      get dictAvail() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      },

      // Whole-view file intake: a drop anywhere on the view, or the Browse
      // button. The fold is the shared intake's; what the VIEW adds is the
      // look: one file dropped opens on itself, since the reason to drop a
      // file here is to see it. A batch does not, because a modal over a set
      // nobody has seen listed is the wrong first look at it.
      async onPageDrop(e) {
        this._dragDepth = 0;
        const added = await takeDrop(e.dataTransfer);
        if (added.length === 1) this.view(added[0]);
      },
      async ingestFile(file, as) { return takeFile(file, as); },
      onBrowse(e) {
        const input = e.target;
        if (input.files) for (const f of input.files) this.ingestFile(f);
        input.value = '';   // let the same file re-trigger a change next time
      },

      get items() {
        return Alpine.store('browser').stage || [];
      },
      // Ref items (repo/ref/path) vs local (dropped) items, split for the two
      // renderers and the two deposit paths.
      get refItems() { return this.items.filter(it => !it.local); },
      get localItems() { return this.items.filter(it => it.local); },
      get groups() {
        const map = new Map();
        for (const it of this.refItems) {
          const key = it.repo + (it.ref ? '@' + it.ref : '');
          if (!map.has(key)) map.set(key, { key, repo: it.repo, ref: it.ref || '', items: [] });
          map.get(key).items.push(it);
        }
        return [...map.values()];
      },
      get targets() {
        return Alpine.store('browser').config?.stage?.targets || [];
      },
      get sendLabel() {
        if (this.sending) return 'Sending…';
        if (!this.sendArmed) return 'Send';
        const d = this.resolvedDest;
        // Naming the resolved directory matters most when the user did not
        // type it: an inbox redirect the reader cannot see is a surprise.
        return d && d.dir ? 'Send to ' + d.dir + '/ ?' : 'Sure?';
      },

      // The destination repo's declared inbox, read from ITS manifest (the
      // receiver owns the landing spot). Cached per repo for the session, and
      // failure-tolerant: no manifest, no inbox, no problem, the deposit lands
      // at the root as it always did.
      async receiverInbox(repo) {
        if (!window.RepoAddress) return null;
        if (this._inboxCache[repo] !== undefined) return this._inboxCache[repo];
        let box = null;
        try {
          const cfg = JSON.parse((await this.srcGh(repo, '').get('.web-tools.json')).text);
          box = window.RepoAddress.box(cfg, 'inbox', repo);
        } catch { box = null; }
        this._inboxCache[repo] = box;
        return box;
      },

      // The declared destinations across the picker's repos: each repo's own
      // inbox, then each of its projects'. Read from the shell's config cache,
      // which is one pass at load and already in memory (branch-brief reads the
      // same key), so the strip costs no fetches and needs no cache of its own.
      // receiverInbox above stays the resolver for a deposit that names no
      // folder; this is the reverse direction, showing the boxes BEFORE the
      // send rather than naming one on the armed button after it.
      //
      // The open repo's live config wins over the cache, same rule
      // repoProjects follows: inside a repo the honest answer is the manifest
      // on the ref you are standing on.
      get destPills() {
        const shell = window.__shell;
        if (!shell || !window.RepoAddress) return [];
        const s = Alpine.store('browser');
        const out = [];
        const seen = new Set();
        const push = (label, kind, box) => {
          if (!box || !box.repo) return;
          const spec = box.repo + (box.ref ? '@' + box.ref : '') + ':' + (box.dir || '');
          if (seen.has(spec)) return;
          seen.add(spec);
          out.push({ label, kind, spec, dir: box.dir || '(root)' });
        };
        for (const r of this.pickerRoots()) {
          const cfg = (r.repo === s.repo && s.config) ? s.config : shell.estateConfigs?.[r.repo];
          if (!cfg) continue;
          push(r.repo.split('/').pop(), 'repo', window.RepoAddress.box(cfg, 'inbox', r.repo));
          for (const p of (shell.repoProjects?.(r.repo, cfg) || [])) push(p.label, 'project', p.inbox);
        }
        return out;
      },

      // ── Asks: what a session wants FROM YOU ──────────────────────────────
      // The mailbox's fourth kind, and the one the browser cannot serve. Its
      // three siblings are deferred reads from a REPO and fulfil themselves on
      // page load; an ask is a deferred read from the PERSON, so it can only sit
      // here until someone acts. That is why it renders in the lens column
      // rather than as a badge: a badge is for something you might want, and
      // this is something already owed.
      //
      // Read on mount, from the registry repo the shell names. Failure-tolerant
      // throughout: no token, no mailbox directory, an unparsable record, or a
      // malformed ask each drop that one row rather than the section. A
      // half-written record must not be able to hide the rest of the list.
      async loadAsks() {
        const M = window.RepoMailbox;
        const repo = window.__shell?.REGISTRY_REPO;
        if (!M || !M.isAsk || !repo || !Alpine.store('browser').gh?.token) return;
        this.asksLoading = true;
        try {
          const reg = this.srcGh(repo, 'main');
          let reqs = [];
          try { reqs = await reg.ls(M.REQ_DIR); } catch { reqs = []; }   // 404 = no mailbox
          if (!reqs.length) { this.asks = []; return; }
          let results = [];
          try { results = await reg.ls(M.RES_DIR); } catch { results = []; }
          const names = M.pending(
            reqs.filter(f => f.type === 'file').map(f => f.name),
            results.filter(f => f.type === 'file').map(f => f.name));
          const out = [];
          for (const name of names) {
            let req;
            try { req = JSON.parse((await reg.get(M.REQ_DIR + '/' + name)).text); } catch { continue; }
            if (!M.isAsk(req) || !M.validateAsk(req).ok) continue;
            out.push({ ...req, name, message: '', busy: false, age: this.askAge(req.createdAt) });
          }
          this.asks = out;
        } catch { /* the section stays empty rather than the view breaking */ }
        finally { this.asksLoading = false; }
      },

      // Coarse on purpose. An ask's age is read to answer "has this been sitting
      // a while", not to the hour, and a request with no createdAt shows nothing
      // rather than a guess.
      askAge(iso) {
        if (!iso) return '';
        const then = Date.parse(iso);
        if (!Number.isFinite(then)) return '';
        const days = Math.floor((Date.now() - then) / 86400000);
        if (days < 1) return 'today';
        if (days === 1) return '1 day';
        return days + ' days';
      },

      // A task citation is 'owner/repo[@ref]:path'; the row links it so the ask
      // can stay short. The note says what is wanted, the task says why and
      // carries the long version.
      askTaskUrl(a) {
        const addr = window.RepoAddress?.parse?.(a?.task || '');
        if (!addr) return '';
        return 'https://github.com/' + addr.repo + '/blob/' + (addr.ref || 'HEAD') + '/' + addr.path;
      },

      // Closing IS the answer: a result file at the request's own name is what
      // marks it served, the same rule the auto-fulfilled kinds follow. Both
      // outcomes write one. A decline is not an error and is often the more
      // useful reply, so it takes the same path and only the message is
      // mandatory, which the kit enforces rather than this button.
      async resolveAsk(a, answered) {
        const M = window.RepoMailbox;
        const toast = Alpine.store('toast');
        const repo = window.__shell?.REGISTRY_REPO;
        if (!M || !repo || a.busy) return;
        const rec = M.closeAsk(a, { answered, message: a.message });
        if (!rec.ok) return toast('warning', rec.error, 'alert-error', 5000);
        a.busy = true;
        try {
          await this.srcGh(repo, 'main').save(M.RES_DIR + '/' + a.name, rec,
            (answered ? 'Answer' : 'Decline') + ' mailbox ask ' + a.name + ' via the stage');
          this.asks = this.asks.filter(x => x.name !== a.name);
          toast('success', answered ? 'Ask closed' : 'Ask declined', '', 3000);
        } catch (e) {
          toast('warning', 'Could not close the ask: ' + (e?.message || e), 'alert-error', 5000);
        } finally { a.busy = false; }
      },

      // Aim the destination from a pill. The picker owns its trigger label: it
      // commits one on a pick and reads `value` once at mount, so setting
      // destSpec alone would leave the control naming one place while the send
      // went to another, which is worse than showing no aim at all. The
      // instance publishes itself on its root as __pathPicker for exactly this
      // case, a host's own control driving it. Tolerant of a picker that has
      // not mounted, since the strip is still correct without the label.
      aim(spec) {
        this.destSpec = spec;
        const p = this.$refs.destPicker?.__pathPicker;
        if (p) p.label = spec;
      },
      // Size only. The count was here too, and it was the third copy on screen
      // (the Staged label and the group row both carry it), so at narrow widths
      // the truncation ate the one fact that appears nowhere else.
      get bundleStat() {
        if (!this.bundleText) return '';
        return (new Blob([this.bundleText]).size / 1024).toFixed(1) + ' KB';
      },

      fmtSize(n) {
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
      },

      itemKey(it) { return keyOf(it); },
      // A staged item's GitHub home. An unspecified ref becomes HEAD in the URL
      // rather than a guessed branch name, which is the same honesty
      // RepoAddress.parse keeps: '' means "the repo's default", and only the
      // link needs it spelled.
      itemGh(it) {
        if (!it || it.local || !it.repo || !it.path) return '';
        return 'https://github.com/' + it.repo + '/blob/' + (it.ref || 'HEAD') + '/' + it.path;
      },
      itemPeek(it) {
        if (!this.itemGh(it)) return null;
        return window.SourcePeek?.addr(it.repo, it.ref || '', it.path) || null;
      },
      // The label a bundle block carries; local items have no ref to name.
      bundleHeader(it) {
        return it.local ? '(local) ' + it.name : this.itemKey(it);
      },

      // A file or a block of text arrived from the drop-zone. The decision is
      // the shared intake's (window.StageIntake.take): a file whose bytes read
      // as text becomes a local TEXT item, text that reads entirely as stage
      // refs stages those refs, anything else is prose.
      onDropped(d) { return take(d); },

      // OPEN ON WHAT JUST ARRIVED. A host that takes a drop from outside the
      // Stage stages the file and names it on the store, and the bench may not
      // have existed at that moment, so the key is read at mount as well as
      // watched. Reading it clears it: it is a request, not a selection, and a
      // key left standing would reopen the modal on the next mount.
      focusFromStore() {
        const s = Alpine.store('browser');
        const key = s.stageFocus;
        if (!key) return;
        s.stageFocus = '';
        const it = this.items.find(x => this.itemKey(x) === key);
        if (it) this.$nextTick(() => this.view(it));
      },

      // An explicit paste, for the case the window listener cannot serve: iOS
      // Safari fires no paste event unless an editable is focused, so on a
      // phone the drop-and-paste view had no intake at all. kits/io.js owns
      // the read and its hidden-textarea fallback; lazy-loaded with a literal
      // path so the build walker still sees the edge.
      async pasteIn() {
        const toast = Alpine.store('toast');
        try {
          if (!window.io?.pasteItems && window.gh?.load) await window.gh.load('kits/io.js');
          if (!window.io?.pasteItems) throw new Error('io kit unavailable');
          // pasteItems, not paste: the button used to read readText() and so
          // could not see an image at all, which made a keyboard paste and a
          // button paste behave differently on one clipboard. On iOS this is
          // the ONLY intake, since Safari fires no paste event unless an
          // editable is focused, so the narrow path was the only path there.
          const flavors = (await window.io.pasteItems()).map(fl =>
            fl.kind === 'blob'
              ? { kind: 'file', type: fl.type, size: fl.size,
                  file: new File([fl.blob], 'clipboard', { type: fl.type }) }
              : fl);
          if (!flavors.length) return toast('warning', 'Clipboard is empty or unreadable', 'alert-error', 4000);
          const primary = flavors.find(f => f.kind === 'file') ||
                          flavors.find(f => f.type === 'text/plain') || flavors[0];
          const before = this.items.length;
          await this.stageFlavor({ ...primary, name: nameForFlavor(primary) });
          this.offer(flavors.filter(f => f !== primary));
          const added = this.items.length - before;
          toast('success', added > 1 ? 'Staged ' + added + ' refs' : 'Staged ' + (this.items[this.items.length - 1]?.name || 'the paste'), '', 3000);
        } catch (e) {
          toast('warning', 'Paste: ' + (e?.message || e), 'alert-error', 5000);
        }
      },

      // ── The paste's other formats ─────────────────────────────────────────
      //
      // The offer bar, not a dialog. A modal on every spreadsheet paste taxes
      // the common case (take the obvious one, carry on) to serve the rare
      // one, and it would ask the question before the reader has any reason to
      // care. A row under the staged list costs nothing to ignore, and it
      // doubles as the only honest answer to "what did that copy actually put
      // on my clipboard": the menu is the measurement.
      // ── THE TRANSFORM DOOR ────────────────────────────────────────────────
      //
      // The workbench has shipped inside this app since the pre-build began
      // globbing lib/alpineComponents, so it boots on every load and nothing
      // ever mounted it: reachable only as a card in the Tools shelf opening
      // the standalone page in another tab. This is the door.
      tfBusy: false,
      _tfDeck: null,

      // The staged items the workbench could take, with the word for what each
      // one would arrive as. Derived rather than stored, so removing an item or
      // renaming it into another extension moves the chips with it.
      get transformables() {
        const K = { bundle: 'a saved bundle', rows: 'rows', fn: 'a transform' };
        return this.localItems
          .map(it => ({ item: it, kind: window.StageIntake.transformKindOf(it) }))
          .filter(t => t.kind)
          .map(t => ({ ...t, key: this.itemKey(t.item), label: K[t.kind],
                       title: 'Open ' + t.item.name + ' in the transform workbench (' + K[t.kind] + ')' }));
      },

      // A TAKEOVER ON THE SAME KIT THE PREVIEW USES, not a second overlay. The
      // tool wants the viewport (a tab strip, an editor, a table), and
      // kits/swipe-deck.js already owns what a takeover has to get right here:
      // the header with a title, Escape and the phone Back button,
      // history-backed dismissal, and correct nesting, so opening the workbench
      // from an open preview drills rather than stacking two scrims. A deck of
      // one, since a workbench is not a set to walk.
      //
      // Mounted fresh on each open, and that is right rather than a compromise:
      // the tool persists its tab SOURCES in localStorage and deliberately
      // never persists data, and every open here arrives carrying an item to
      // load. It is also what keeps the one-instance rule true, since the tool
      // addresses its viewer and table by document id: the previous deck is
      // dropped before the next is built.
      async openTransform(it) {
        if (this.tfBusy || !it) return;
        const toast = Alpine.store('toast');
        this.tfBusy = true;
        try {
          await this.loadTransformDeps();
          if (!window.swipeDeck && window.gh?.load) await window.gh.load('kits/swipe-deck.js');
          if (!window.swipeDeck) throw new Error('the takeover kit is unavailable');
          const kind = window.StageIntake.transformKindOf(it);
          let host = null;
          const parent = window.swipeDeck.top();
          const opts = {
            count: 1,
            icon: 'ph-function',
            title: it.name,
            subtitle: { bundle: 'a saved bundle', rows: 'rows', fn: 'a transform' }[kind] || '',
            // The workbench owns its own scrolling and lays out against a
            // definite height, so the slide keeps out of the vertical axis the
            // way the preview's does.
            slideScroll: false,
            innerClass: 'h-full w-full min-w-0',
            render: (n, slide) => {
              // Single quotes only: panelHTML embeds this verbatim inside a
              // double-quoted x-data attribute. An injected subtree needs an
              // explicit initTree, since Alpine has already walked this one.
              slide.innerHTML = window.TransformWorkbench.panelHTML(
                "{ persist: true, storageKey: 'show-repo-transform' }");
              Alpine.initTree(slide);
              host = slide;
            },
            release: (n, el) => { el.replaceChildren(); },
            onClose: () => { this._tfDeck = null; },
          };
          this._tfDeck = parent ? window.swipeDeck.drill(parent, opts) : window.swipeDeck.open(opts);
          await this.$nextTick();
          const wb = host?.querySelector('.tf-root')?.__workbench;
          if (!wb) throw new Error('the workbench did not mount');
          // processText, not loadRows: it carries the tool's own sniff chain
          // (a bundle rehydrates whole, a base64 gzip decompresses first, JSON
          // and delimited text both parse), which is exactly the set the chip
          // recognizes. Handing over the raw text keeps ONE reader of those
          // shapes rather than teaching the stage a second one.
          await wb.processText(String(it.text || '').trim());
        } catch (e) {
          this._tfDeck?.close?.();
          this._tfDeck = null;
          toast('warning', 'Transform: ' + (e?.message || e), 'alert-error', 5000);
        }
        this.tfBusy = false;
      },

      // THE WORKBENCH EXPECTS ITS HOST TO HAVE BROUGHT ITS OWN LIBRARIES, and
      // both are ones this shell does not otherwise load. PapaParse is the parse
      // path's, called without a guard, so a missing Papa throws rather than
      // degrading. Tabulator is the table's, and its absence is worse than an
      // error: the render hook reads `typeof Tabulator === "undefined"` and
      // RETURNS, so the tool draws its whole chrome around an empty pane and
      // says nothing. That is what the first mount here actually did, which is
      // why the scenario asserts the DRAWN rows rather than the parsed ones.
      //
      // Same unpkg URLs the shared viewer uses for its own table mode, so
      // loadAsset's cache is one cache and a reader who has opened a CSV
      // elsewhere in the app pays nothing here.
      async loadTransformDeps() {
        if (!window.TransformWorkbench) throw new Error('the workbench is not loaded');
        const assets = [];
        if (!window.Papa) assets.push('https://cdn.jsdelivr.net/npm/papaparse@5/papaparse.min.js');
        if (typeof window.Tabulator === 'undefined') assets.push(
          'https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator_simple.min.css',
          'https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js');
        await Promise.all(assets.map(u => window.ViewRegistry.loadAsset(u)));
      },

      // ON THE STORE, not on the component, for the same reason stageFocus is:
      // the paste that produces an offer can happen on any view, and the bench
      // that draws the bar may not have mounted yet. The getter/setter pair
      // keeps every reader in the markup unchanged.
      get offers() { return Alpine.store('browser').stageOffers || []; },
      set offers(v) { Alpine.store('browser').stageOffers = v || []; },
      offer(flavors) {
        // Never offer what is already on the stage under the same name, which
        // is what makes pasting the same thing twice quiet rather than
        // cumulative. The naming and the dedupe are the intake's, so a host
        // recording an offer without the bench gets the same answer.
        this.offers = window.StageIntake.offerable(flavors);
      },
      dismissOffers() { this.offers = []; },
      // Label a flavor by its subtype, which is the word a reader recognizes:
      // "html", "png", "tsv" rather than "text/html", "image/png".
      flavorLabel(fl) {
        const ext = String(fl.name || '').split('.').pop().toLowerCase();
        return ext || fl.type.split('/').pop();
      },
      // Staging one flavor is the intake's takeFlavor; what the VIEW adds is
      // taking it off the bar afterwards.
      async stageFlavor(fl) {
        if (!fl) return;
        const name = fl.name || nameForFlavor(fl);
        await window.StageIntake.takeFlavor(fl);
        this.offers = this.offers.filter(o => o !== fl && o.name !== name);
      },

      // A local binary's bytes as a data: URI, or '' when the extension is not
      // one the viewer can render. Keyed on the EXTENSION rather than on the
      // File's reported `type`, because the item's name is renameable and the
      // extension is what every other consumer already keys on; a clipboard
      // File also arrives with a type the paste chose, not one the user did.
      // Chunked through fromCharCode because a screenshot is comfortably past
      // the argument-count limit a single spread would hit.
      dataUri(it) {
        const ext = String(it.name || '').split('.').pop().toLowerCase();
        // mimeFor rather than the image map, so the set of local files that
        // preview here is the set the viewer can actually render. It read
        // IMAGE_MIME until 2026-08-15, which meant a dropped PDF or workbook
        // fell through to the text path and showed its own bytes as mojibake.
        const mime = window.ViewRegistry?.mimeFor?.(ext);
        if (!mime || !it.bytes) return '';
        let s = '';
        for (let i = 0; i < it.bytes.length; i += 0x8000) {
          s += String.fromCharCode.apply(null, it.bytes.subarray(i, i + 0x8000));
        }
        return 'data:' + mime + ';base64,' + btoa(s);
      },

      // ── Renaming a local item ─────────────────────────────────────────────
      //
      // LOCAL ITEMS ONLY, and the asymmetry is the point. A ref item's `path`
      // is its identity at its source: the row states where the file lives,
      // the GitHub jump-over resolves it, and the deposit reads the same field
      // back through copyTo. Editing it there would either lie about where the
      // file came from or silently mean "land it somewhere else", which is a
      // destination override and a different feature. A local item has no
      // source to be honest about, so its name is only ever a proposal.
      //
      // The name is load-bearing in four places, which is why guessing it once
      // at intake was never enough: the row, the bundle header, the `name`
      // field a local item rides on a `#gz=` link, and the deposited path
      // (joinDir(dest.dir, it.name)). The EXTENSION is the whole of what the
      // preview reads to pick a mode and what the destination blob renders as,
      // so a paste sniffed as `.txt` that is really markdown was a wrong file
      // on the branch, correctable only by deleting it and pasting again.
      startRename(it) {
        if (!it || !it.local) return;
        this.renameId = it.id;
        this.renameDraft = it.path || it.name || '';
        // Select the stem, not the whole name: renaming usually keeps the
        // extension, and the one case that does not (a sniff that guessed the
        // type wrong) is one keystroke away from here anyway.
        this.$nextTick(() => {
          const el = this.$refs.renameInput;
          if (!el) return;
          el.focus();
          const dot = this.renameDraft.lastIndexOf('.');
          el.setSelectionRange(0, dot > 0 ? dot : this.renameDraft.length);
        });
      },
      cancelRename() { this.renameId = null; this.renameDraft = ''; },
      // Commit is idempotent and safe to call twice: Enter commits and blurs,
      // and the blur that follows finds nothing open.
      commitRename() {
        const id = this.renameId;
        if (id == null) return;
        this.renameId = null;
        const it = this.items.find(x => x.local && x.id === id);
        const name = this.cleanName(this.renameDraft);
        this.renameDraft = '';
        if (!it || !name || name === (it.path || it.name)) return;
        // Both fields, because both are read: `name` by the deposit, the
        // bundle header, and the link payload, `path` by the preview and the
        // diff label, which prefer it when a local item has one.
        it.name = name;
        it.path = name;
        // The preview labels itself from the item it opened on, so a rename
        // underneath it would otherwise keep the old caption until the next
        // step through the set.
        if (this.preview && this.items[this.preview.i] === it) {
          this.preview = { ...this.preview, name };
          this._pSyncChrome(this.preview.i);
        }
        // NOTHING IS SAID ON SUCCESS: the row already shows the new name, and
        // a toast for a change the reader is looking at is noise. A COLLISION
        // is the opposite case, since the deposit writes one file over the
        // other and nothing on the screen would show it. It is warned about
        // rather than refused: a stage is a working set, and passing through a
        // half-finished rename is normal.
        if (this.localItems.filter(x => (x.path || x.name) === name).length > 1) {
          Alpine.store('toast')('warning',
            'Two staged files are now named ' + name + ' — a deposit writes one over the other',
            'alert-warning', 6000);
        }
      },
      // A staged name is a path fragment, not a bare filename: `docs/note.md`
      // is a real thing to say about where the file should land under the
      // destination folder, and everything that would escape that folder is
      // not. Empty after cleaning means the rename is dropped, not that the
      // item loses its name.
      cleanName(s) {
        return String(s || '').trim()
          .split('/')
          .map(p => p.trim())
          .filter(p => p && p !== '.' && p !== '..')
          .join('/');
      },

      // ── Dictation ─────────────────────────────────────────────────────────
      // The stage's third intake, and the second caller of kits/dictate.js.
      // Attach and Paste both move material that already exists somewhere; this
      // one makes a file out of something that exists nowhere, which is the
      // case the stage's local-item and gz-carried link were built for.
      //
      // The component holds no buffer. `dictText` is a mirror the kit writes
      // through onText, so there is one answer to "what has been said" and this
      // is a view of it. Everything it can do is a call into the handle.
      async dictStart() {
        this.dictErr = '';
        try {
          if (!window.Dictate && window.gh?.load) await window.gh.load('kits/dictate.js');
          if (!window.Dictate) throw new Error('dictate kit unavailable');
          this._dict = window.Dictate.create({
            onText: (t) => { this.dictText = t; this.dictPaint(); },
            onInterim: (t) => { this.dictInterim = t; this.dictPaint(); },
            onState: () => { this.dictOn = !!(this._dict && this._dict.listening); },
            onError: (m) => { this.dictErr = m; },
          });
          this.dictText = ''; this.dictInterim = ''; this.dictArmed = null;
          this.dictOpen = true;
          this.dictPaint();
          this._dict.start();
        } catch (e) {
          Alpine.store('toast')('warning', 'Dictate: ' + (e?.message || e), 'alert-error', 5000);
        }
      },
      dictToggle() { this._dict && this._dict.toggle(); },

      // ── The painted surface and its gestures ─────────────────────────────
      // The same three the annotator's composer has, and deliberately no drag
      // among them: a LONG PRESS selects the word under the finger (or drops a
      // caret, on whitespace), tapping a HANDLE arms it, and the next tap in
      // the text places the armed edge there. Dragging a handle puts the finger
      // over the words being aimed at, which is the problem every platform then
      // patches with a floating magnifier; not dragging means nothing to
      // magnify. The card carries data-no-swipe so the app's pager keeps out.
      // The painted span is the host; the SCROLL BOX around it is where the
      // listeners go. A span shrink-wraps to its text, so the blank canvas
      // under the last line belongs to the box, and a tap there reached no
      // handler at all. Every tap that lands on words worked, which is why
      // the gap was invisible from the code.
      dictBind(host) {
        this._dictHost = host;
        const surface = host.parentElement || host;
        let timer = null, x = 0, y = 0, long = false, lastTap = 0, taps = 0;
        const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
        // A tap on the canvas means: back to the end, start appending. Drops
        // the selection, disarms, and puts the caret past the last character,
        // which in this buffer is the same state as having no range at all.
        const toEnd = () => {
          this._dict.caretAt(this._dict.text.length);
          this.dictArmed = null;
          this.dictPaint();
        };
        const at = (cx, cy) => {
          const d = host.ownerDocument;
          const r = d.caretRangeFromPoint ? d.caretRangeFromPoint(cx, cy) : null;
          const p = !r && d.caretPositionFromPoint ? d.caretPositionFromPoint(cx, cy) : null;
          const node = r ? r.startContainer : p ? p.offsetNode : null;
          const off = r ? r.startOffset : p ? p.offset : 0;
          return node && window.Dictate ? window.Dictate.offsetAt(host, node, off) : null;
        };
        surface.addEventListener('pointerdown', (e) => {
          if (this.dictEdit || !this._dict) return;
          x = e.clientX; y = e.clientY; long = false;
          clear();
          timer = setTimeout(() => {
            timer = null; long = true;
            // A long press that misses the text leaves everything alone: a tap
            // is a commit, a held press over blank canvas is an aim that
            // missed, and it should not collapse the selection being refined.
            if (!window.Dictate.hitsText(host, x, y)) return;
            const i = at(x, y);
            if (i == null) return;
            this._dict.selectWordAt(i);
            this.dictArmed = null;
            this.dictPaint();
          }, 450);
        });
        surface.addEventListener('pointermove', (e) => {
          if (timer && (Math.abs(e.clientX - x) > 10 || Math.abs(e.clientY - y) > 10)) clear();
        });
        surface.addEventListener('pointercancel', clear);
        // The pointerUP is heard on the LAYER, not on the scroll box. A double
        // tap paints a handle at the point that was tapped, so the third tap
        // of a triple lands on the pin, and a pin is not inside the box: the
        // run was broken by furniture the run itself had just put there.
        // Everything else in the layer (the pad, the bottom row) ends the run
        // and is handled by its own listener.
        (this.$refs.dictLayer || surface).addEventListener('pointerup', (e) => {
          clear();
          if (this.dictEdit || !this._dict || long) return;
          const target = e.target;
          const pin = target?.closest?.('[data-edge],[data-d="nudge"]');
          if (!pin && !surface.contains(target)) { taps = 0; return; }
          // The canvas wins before the count, so a tap past the text always
          // means the end even when it lands third in a quick run.
          if (!pin && !window.Dictate.hitsText(host, e.clientX, e.clientY)) { taps = 0; toEnd(); return; }
          // Taps in a run, counted rather than paired. A DOUBLE takes the word
          // (the same as a long press, faster when the target is in view); a
          // TRIPLE takes the whole buffer, the selection wanted most often
          // after a bad stretch and the one with no other gesture. Counted
          // before the point is resolved, since select-all does not need one,
          // and it overrides the pin the second tap just painted there.
          const t = Date.now();
          taps = (t - lastTap) < 300 ? taps + 1 : 1;
          lastTap = t;
          if (taps >= 3) {
            this._dict.select(0, this._dict.text.length);
            this.dictArmed = null; this.dictPaint(); return;
          }
          if (pin) return;                // pointerdown already armed or stepped it
          // The run survives a null offset: hitsText already said the point is
          // on text, so a caret-from-point answering nothing is an anomaly,
          // not a gesture, and resetting would swallow a triple's third tap.
          const i = at(e.clientX, e.clientY);
          if (i == null) { toEnd(); return; }
          if (taps === 2) { this._dict.selectWordAt(i); this.dictArmed = null; this.dictPaint(); return; }
          if (this.dictArmed) this._dict.moveEdge(this.dictArmed, i);
          else if (this._dict.range) { this._dict.caretAt(i); this.dictArmed = null; }
          else return;                    // a single tap on plain text with nothing live waits
          this.dictPaint();
        });
      },
      // A tap anywhere in the layer: on a handle it arms, on an arrow it
      // steps. Delegated because the painter rebuilds both on every repaint.
      dictLayerTap(e) {
        const t = e.target;
        const dir = t?.getAttribute?.('data-nudge');
        if (dir && this._dict && this.dictArmed) {
          e.preventDefault(); e.stopPropagation();
          this._dict.nudge(this.dictArmed, +dir); this.dictPaint(); return;
        }
        // Confirm: the edge is where it should be. Disarms and keeps the
        // selection, which is what tapping the pinhead again does, said with
        // a word instead of a reach back into the text.
        if (t?.getAttribute?.('data-disarm')) {
          e.preventDefault(); e.stopPropagation();
          this.dictArmed = null; this.dictPaint(); return;
        }
        const edge = t?.closest?.('[data-edge]');
        if (edge) {
          e.preventDefault(); e.stopPropagation();
          const which = edge.getAttribute('data-edge');
          this.dictArmed = this.dictArmed === which ? null : which;
          this.dictPaint();
        }
      },
      dictPaint() {
        this.dictBeat++;
        if (!this._dictHost || !window.Dictate?.paint) return;
        // Applied here rather than at bind time, because x-init runs at
        // component mount and the kit is fetched on the first tap: at bind
        // there was no Dictate to ask. Once, and to the style ATTRIBUTE, since
        // -webkit-touch-callout is not a CSSOM property and an assignment
        // through .style is dropped by anything validating.
        if (!this._dictStyled) {
          this._dictStyled = true;
          this._dictHost.setAttribute('style',
            (this._dictHost.getAttribute('style') || '') + window.Dictate.SUPPRESS);
        }
        window.Dictate.paint(this._dictHost, {
          text: this.dictText, interim: this.dictInterim,
          range: this._dict ? this._dict.range : null, armed: this.dictArmed,
          overlay: this.$refs.dictLayer,     // outside the scroll box, so nothing clips
        });
      },
      dictNudge(delta) {
        if (!this._dict || !this.dictArmed) return;
        this._dict.nudge(this.dictArmed, delta);
        this.dictPaint();
      },
      dictDrop() {
        if (!this._dict) return;
        this._dict.clearRange();
        this.dictArmed = null;
        this.dictPaint();
      },

      // The pad's three keys. `.` `,` `?` carry ordinary prose; `;` `!` `¶`
      // are reached for deliberately and can afford the shift's second tap.
      // With a SELECTION live the pad has a better job than inserting marks:
      // fixing the casing the recognizer got wrong, which is the correction a
      // selection is most often made for. Same three keys, no new control.
      // And a fourth face, one key rather than three. A pause the reader did
      // not mean as an ending writes a full stop and the engine capitalizes
      // behind it; drop a CARET in that gap and the top key becomes the key
      // that closes it, since a full stop cannot be wanted where one is
      // already sitting. `,` and `?` stay put, because the aim here is the
      // caret rather than a word and the pad must not rearrange under a thumb.
      // Same swap as the annotator's card (kits/annotate.js), same kit verb.
      get dictSel() { this.dictBeat; return !!(this._dict && this._dict.hasSelection); },
      get dictStitch() { this.dictBeat; return !!(this._dict && this._dict.canStitch); },
      get dictMarks() {
        if (this.dictSel) return ['AB', 'ab', 'Ab'];
        if (this.dictShift) return [';', '!', '¶'];
        return [this.dictStitch ? 'stitch' : '.', ',', '?'];
      },

      // Keyboard mode, the annotator's pencil in Alpine. Two rules carry it and
      // both are the kit's, not this component's. Opening STOPS the engine,
      // since dictating into a focused textarea is two writers on one buffer.
      // Closing hands the typed text back through the kit's setter, which is
      // what clears the provisional period and the pause record: the reader
      // rewrote it, so neither derived thing describes this text any more.
      dictEditOpen() {
        if (!this._dict) return;
        // Flush BEFORE stopping. The phrase still on screen is part of what is
        // being edited, and stop() runs the engine's end handler, which clears
        // the interim: the other order opens the keyboard on a draft missing
        // the sentence the reader was looking at when they reached for it.
        this._dict.flush();
        // Remember whether the engine was actually running. Closing used to
        // start it unconditionally, on the reading that "dictation is the
        // default mode", so a reader who had stopped listening, tapped the
        // pencil, and tapped Done came back to a live microphone they never
        // asked for. Resume what was interrupted, nothing more.
        this._dictResume = this.dictOn;
        this._dict.stop();
        this.dictDraft = this._dict.text;
        this.dictEdit = true;
        this.$nextTick(() => this.$refs.dictTa && this.$refs.dictTa.focus());
      },
      dictEditClose() {
        if (!this._dict) return;
        this._dict.text = this.dictDraft;
        this.dictEdit = false;
        // Resume only if the keyboard interrupted a live engine. Coming back
        // to where you were is worth not charging for; being switched on is
        // not. The annotator's closeEditor does the same.
        if (this._dictResume && this._dict.available()) this._dict.start();
        this._dictResume = false;
      },
      dictMark(m) {
        if (!this._dict) return;
        if (m === 'stitch') { this._dict.stitch(); this.dictPaint(); return; }
        const cased = { AB: 'upper', ab: 'lower', Ab: 'title' }[m];
        if (cased && this.dictSel) { this._dict.recase(cased); this.dictPaint(); return; }
        this._dict.punct(m);
        this.dictShift = false;
      },
      dictBack() { this._dict && this._dict.backWord(); },
      // Cancel discards. The buffer is one utterance old at most and staging is
      // one tap away, so a confirm here would cost more than the mistake.
      dictCancel() {
        if (this._dict) { this._dict.stop(); this._dict = null; }
        this.dictOpen = false; this.dictOn = false;
        this.dictText = ''; this.dictInterim = ''; this.dictErr = '';
        this.dictEdit = false; this.dictDraft = '';
        this.dictArmed = null; this._dictResume = false;
        this.dictPaint();
      },

      // Whether the pause record can still say anything. An edit through the
      // kit's setter clears it, so paragraphs() would return the buffer
      // untouched and the toggle would be a control that does nothing without
      // saying so. Reads dictText so Alpine re-evaluates as the buffer moves.
      get dictBreakable() {
        // No the moment the keyboard OPENS, not only once it closes. Staging
        // from edit mode writes the draft through the same setter that clears
        // the record, so a toggle still reading as live there is a control
        // that will quietly do nothing.
        if (this.dictEdit) return false;
        return !!this.dictText && !!(this._dict && this._dict.segments.length);
      },
      // Flush first, so the phrase still on screen when Stage was tapped is in
      // the file. Then the paragraph proposal, read off the pauses rather than
      // inferred from the words, and only where the reader asked for it.
      dictStage() {
        if (!this._dict) return;
        // In keyboard mode the textarea is the truth; otherwise the phrase
        // still on screen is committed. Either way the kit holds the answer
        // before it is read, so there is one buffer and not two.
        if (this.dictEdit) this._dict.text = this.dictDraft;
        else this._dict.flush();
        const text = this.dictBreaks ? this._dict.paragraphs() : this._dict.text;
        if (!text.trim()) return this.dictCancel();
        const before = this.items.length;
        this.onDropped({ text, size: text.length });
        this.dictCancel();
        const name = this.items[this.items.length - 1]?.name || 'the dictation';
        Alpine.store('toast')('success',
          this.items.length > before ? 'Staged ' + name : 'Staged the dictation', '', 3000);
      },

      // A GH instance pointed at a repo. ref '' rides through: the API treats an
      // empty ref param as the default branch. Used for both source reads and
      // destination writes; since 2026-08-08 save/saveBytes send the instance
      // ref as the PUT's branch, so a dest of owner/repo@branch:dir lands
      // local items ON that branch rather than silently on the default.
      srcGh(repo, ref) {
        const base = Alpine.store('browser').gh;
        const inst = new base.constructor({ token: base.token, repo });
        inst.ref = ref || '';
        return inst;
      },

      // Manifest seeding: entries are bare paths ("lib/foo.js", this repo at
      // its default branch) or qualified refs ("owner/repo[@ref]:path"). Only
      // an empty stage is seeded: a working set the user built wins. The
      // destination field is left empty on purpose (empty dir = root); targets
      // stay as datalist suggestions.
      seedStage(cfg) {
        const s = Alpine.store('browser');
        const files = cfg?.stage?.files;
        if (!Array.isArray(files) || !files.length || this.items.length) return;
        s.stage = files
          .map(f => window.StageLink.parseItem(f) || (typeof f === 'string' && f.trim() ? { repo: s.repo, ref: '', path: f.trim() } : null))
          .filter(Boolean);
      },

      rm(it) {
        const s = Alpine.store('browser');
        const key = this.itemKey(it);
        s.stage = s.stage.filter(x => this.itemKey(x) !== key);
      },
      // Clearing drops the origin with the items. Keeping it would leave the
      // bench pointing at a saved surface it no longer holds, so the next save
      // would silently overwrite that file with whatever was staged next.
      clearAll() {
        const s = Alpine.store('browser');
        s.stage = [];
        s.stageOrigin = null;
      },

      // ── The preview: a swipe-deck takeover ─────────────────────────────
      // Preview a staged item. The stage is estate-context, so this never
      // routes through a repo's Files view: a ref loads from its origin, a
      // local text item shows its held text, a local binary says why it
      // cannot be shown.
      //
      // The deck kit owns the shell. What that buys, and what this file used
      // to carry itself: the header's TITLE and SUBTITLE (the file's name and
      // its repo@ref, which the old dialog had nowhere to put, so a link's
      // recipient walked five files knowing only "3 / 5"), touch swipe,
      // arrow keys, Escape, the phone back button, background scroll lock,
      // lazy build with a two-slide keep window, and correct nesting when the
      // stage is itself opened from a deck. Sixty lines of hand-rolled
      // pTouch* went with it.
      //
      // Diff is a MODE over the whole deck rather than a slide of its own,
      // because the pair is read off the position (previewPair) and so every
      // slide has one. Toggling drops the built slides and rebuilds around
      // the active one, which is why stepping with the diff open re-pairs.
      view(it) {
        const k = this.itemKey(it);
        const i = this.items.findIndex(x => this.itemKey(x) === k);
        return this.previewAt(i < 0 ? 0 : i);
      },
      // The deck reports position from its scroll handler, on the next frame.
      // That is right for a swipe, where the position IS where the track came
      // to rest, and wrong for a press, where the caller already knows the
      // answer and the header would otherwise name the old file for a frame.
      // So a press moves the state itself and the scroll handler confirms it.
      previewStep(dir) {
        if (!this._pDeck) return;
        const core = this._pDeck.deck;
        const to = Math.max(0, Math.min(core.count - 1, core.active() + dir));
        core.go(to);
        if (this.preview) this.preview = { ...this.preview, i: to, name: this._pName(to), note: this._pNotes[to] || '' };
        this._pSyncChrome(to);
      },

      // ── The diff, from the position ────────────────────────────────────
      // The pair is where you are and what is next to it, so there is nothing
      // to select. min(i, n-2) keeps it valid at the end of the list, which
      // means a diff is always available with two or more staged and the last
      // position compares the last two rather than offering nothing. With
      // exactly two staged it is "the two" from either position, which is the
      // case this exists for.
      previewPair(at) {
        const n = this.items.length;
        if (n < 2) return null;
        const i = at == null ? (this.preview ? this.preview.i : 0) : at;
        const a = Math.max(0, Math.min(i, n - 2));
        return [a, a + 1];
      },
      previewPairLabel(at) {
        const pr = this.previewPair(at);
        if (!pr) return '';
        const nm = (i) => { const it = this.items[i]; return this.baseName(it.local ? (it.path || it.name) : it.path); };
        return nm(pr[0]) + ' ↔ ' + nm(pr[1]);
      },
      // One toggle, over the whole deck. Rebuilding rather than swapping a
      // pane keeps one source of truth for what a slide is: render() reads
      // the mode, so nothing else has to know both shapes.
      async togglePreviewDiff() {
        if (!this.preview || !this._pDeck) return;
        const mode = this.preview.mode === 'diff' ? 'file' : 'diff';
        if (mode === 'diff' && this.items.length < 2) return;
        this._pSetMode(mode);
      },
      // Mode is a property of the deck, not of a slide, so changing it means
      // rebuilding what is mounted. Nothing else has to know both shapes:
      // render() reads the mode and builds accordingly. The OPEN path calls
      // none of this, because its first build already happens after the mode
      // is set; calling the toggle there flipped a diff link straight back to
      // the file, which is what this replaced.
      _pSetMode(mode) {
        if (!this._pDeck) return;
        this.preview = { ...this.preview, mode };
        this._pNotes = {};
        const core = this._pDeck.deck;
        for (let i = 0; i < core.count; i++) core.drop(i);
        const a = core.active();
        core.build(a - 1); core.build(a); core.build(a + 1);
        this._pSyncChrome(a);
      },

      // Open at position i. Re-entrant: with the deck already up this is a
      // seek, which is what makes `view()` from a row work while reading.
      // THE SET A DECK IS OVER IS FIXED AT OPEN, and the stage is not: a
      // drop, a paste, a remove, or a rename while reading would leave the
      // deck paging a list that no longer exists. The old dialog never had
      // this because it re-read `items` on every step. The signature is the
      // item keys, not the count, since a swap keeps the count and changes
      // everything else, and it is checked HERE rather than pushed from a
      // watcher: a watcher fires on Alpine's flush, which is after a `view()`
      // in the same turn has already seeked the stale deck.
      _pSig() { return this.items.map(x => this.itemKey(x)).join('\n'); },

      // TWO CALLERS CAN BE IN HERE AT ONCE. `view()` from a row and the
      // watcher below both reopen when the set has changed, and the awaits
      // between the check and the open are where they cross: one drops the
      // deck the other just built. The sequence is the arbiter, checked after
      // every await, so the last caller in wins and the earlier one leaves
      // without touching anything.
      _pSeq: 0,
      async previewAt(i, mode) {
        const seq = ++this._pSeq;
        if (!this.items[i]) { this._pDrop(); return; }
        // Same set: a seek. Different set: this deck is not the one for these
        // items, so it goes without touching history and its replacement takes
        // over the entry it left.
        let replace = false;
        if (this._pDeck) {
          if (this._pSig() === this._pSigOpen) {
            const want = mode || this.preview?.mode || 'file';
            const change = want !== this.preview?.mode;
            this.preview = { ...this.preview, i, mode: want, name: this._pName(i), note: this._pNotes[i] || '' };
            this._pDeck.deck.go(i);
            if (change) this._pSetMode(want);
            return;
          }
          this._pDrop();
          replace = true;
        }
        this.preview = { i, name: this._pName(i), mode: mode || 'file', note: this._pNotes[i] || '' };
        if (!window.swipeDeck && window.gh?.load) await window.gh.load('kits/swipe-deck.js');
        if (!window.swipeDeck || seq !== this._pSeq) return;
        const parent = window.swipeDeck.top();
        const opts = {
          count: this.items.length,
          start: i,
          replace,
          icon: 'ph-eye',
          title: this._pName(i),
          subtitle: this._pWhere(i),
          render: (n, slide) => this._pRender(n, slide),
          // A slide is a file being read, and a wide code view has to scroll
          // inside its own box rather than widen the track, so the viewer
          // owns the vertical axis and the slide keeps out of it.
          slideScroll: false,
          innerClass: 'h-full w-full min-w-0',
          actions: this._pActions(i),
          release: (n, el) => { el.replaceChildren(); },
          onClose: () => { this._pDeck = null; this._pSigOpen = null; this._pNotes = {}; this.preview = null; },
        };
        this._pSigOpen = this._pSig();
        this._pDeck = parent ? window.swipeDeck.drill(parent, opts) : window.swipeDeck.open(opts);
        this._pDeck.deck.onSlide((n) => {
          if (this.preview) this.preview = { ...this.preview, i: n, name: this._pName(n), note: this._pNotes[n] || '' };
          this._pSyncChrome(n);
        });
        // The reader is not touching it, so nothing else would notice the set
        // moving under them: reopen at the nearest surviving position, or shut
        // when the stage empties.
        if (!this._pWatching) {
          this._pWatching = true;
          this.$watch(() => this._pSig(), () => {
            if (!this._pDeck) return;
            const n = this.items.length;
            if (!n) { this._pDeck.close(); return; }
            this.previewAt(Math.max(0, Math.min(this._pDeck.deck.active(), n - 1)), this.preview?.mode);
          });
        }
      },

      // Take the overlay down without touching history, which is what makes a
      // reopen able to claim the entry it left behind. `close()` is the
      // reader's exit; this is the component replacing its own deck.
      _pDrop() {
        if (!this._pDeck) return;
        this._pDeck.drop();
        this._pDeck = null; this._pSigOpen = null; this._pNotes = {};
      },

      _pName(i) {
        const it = this.items[i];
        if (!it) return '';
        return it.local ? (it.path || it.name) : it.path;
      },
      // The subtitle answers "which copy of this file", which is the question
      // a bare path cannot: two staged items can share a path across repos or
      // refs, and the old dialog showed neither.
      _pWhere(i) {
        const it = this.items[i];
        if (!it) return '';
        return it.local ? 'local' : it.repo + (it.ref ? '@' + it.ref : '');
      },
      _pSyncChrome(n) {
        const h = this._pDeck;
        if (!h) return;
        const diff = this.preview?.mode === 'diff';
        h.setIcon(diff ? 'ph-git-diff' : 'ph-eye');
        h.setTitle(diff ? this.previewPairLabel(n) : this._pName(n));
        h.setSubtitle(diff ? (this.diffStat || 'compare') : this._pWhere(n));
        h.setActions(this._pActions(n));
      },

      // WHAT THIS POSITION OFFERS, recomputed per slide rather than fixed at
      // open, which is the whole reason the kit grew setActions. The compare is
      // a property of the SET and holds across every position; the transform is
      // a property of the ITEM and does not.
      //
      // It belongs here rather than only on the bench because the preview is
      // what a paste OPENS: a single arrival routes to the Stage and opens on
      // itself, so the reader is looking at the file, not at the row. Offering
      // the workbench only on the bench behind it meant dismissing the thing
      // you just pasted to find out it could go somewhere.
      _pActions(n) {
        const out = [];
        if (this.items.length > 1) out.push({
          icon: 'ph-git-diff', title: 'Compare this position with the next',
          onClick: () => this.togglePreviewDiff(),
        });
        const it = this.items[n];
        const kind = it && window.StageIntake.transformKindOf(it);
        if (kind) out.push({
          icon: 'ph-function',
          title: 'Open in the transform workbench ('
                 + { bundle: 'a saved bundle', rows: 'rows', fn: 'a transform' }[kind] + ')',
          onClick: () => this.openTransform(it),
        });
        return out;
      },

      // ── A slide ────────────────────────────────────────────────────────
      // Built with DOM rather than an Alpine subtree, because the deck's
      // overlay is appended to document.body and so sits outside this
      // component's tree: an x-data referring to these methods would not
      // resolve. The viewer is the one exception, since it is an Alpine
      // component of its own and initTree mounts it anywhere.
      _pRender(i, slide) {
        if (this.preview?.mode === 'diff') return this._pRenderDiff(i, slide);
        const el = document.createElement('div');
        el.className = 'flex flex-col h-full w-full min-w-0 overflow-hidden p-3';
        // The index is on the element so a slide's viewer is addressable from
        // outside: the deck mounts three at once, and "the one the reader is
        // on" is otherwise only findable by measuring scroll.
        el.setAttribute('data-preview-slide', String(i));
        el.setAttribute('x-data', "viewer({ bindStore: false, fill: true, defaultMode: (f) => window.ViewRegistry.READ_MODE(f) })");
        slide.append(el);
        window.Alpine.initTree(el);
        this._pDrive(i, el, slide);
      },
      // Every outcome shows something: a binary local file and a failed fetch
      // replace the viewer with a note, so the counter stays truthful and a
      // swipe never lands on nothing.
      async _pDrive(i, el, slide) {
        const it = this.items[i];
        if (!it) return;
        const name = this._pName(i);
        const mark = (msg) => {
          this._pNotes[i] = msg;
          if (this.preview?.i === i) this.preview = { ...this.preview, note: msg };
        };
        const show = (content, origin) => { mark(''); return el.__viewer?.show(name, content, origin || null); };
        const note = (msg) => { mark(msg); el.remove(); slide.append(this._pNote(msg, name)); };
        if (it.local) {
          if (it.isText) return show(fmt(it.text || ''), { local: true });
          // A LOCAL IMAGE IS NOT AN UNVIEWABLE BINARY. The viewer's image mode
          // already accepts a data: URI as its content, which is the one form
          // a file with no repo behind it can supply: its fetch path reads
          // `f.repo`, and a dropped or pasted file has none. So the bytes are
          // handed over directly and every image extension the registry knows
          // renders. Without this the stage refused by NAME rather than by
          // capability, and a pasted screenshot was staged, deposited, and
          // never once shown.
          const src = this.dataUri(it);
          if (src) return show(src, { local: true });
          return note('Binary (' + this.fmtSize(it.size) + '). Staged for copy, not preview.');
        }
        try {
          const res = await this.srcGh(it.repo, it.ref).get(it.path);
          show(fmt(res.text), { repo: it.repo, ref: it.ref });
        } catch (e) {
          note('Could not load it: ' + (e.message || e));
        }
      },
      _pNote(msg, name) {
        const H = window.swipeDeck.h;
        return H('div', { class: 'flex flex-col items-center justify-center h-full gap-2 p-8 text-center' },
          H('i', { class: 'ph ph-file-dashed text-4xl opacity-25' }),
          H('p', { class: 'text-base text-base-content/60' }, msg),
          H('p', { class: 'font-mono text-base text-base-content/40' }, name));
      },

      // The diff slide. Everything the page's Diff lens carried comes with it:
      // the tagged rows, the copy, the hand-off to the Diff page, and the
      // review prompts (link-carried bespoke asks first, then the fixed set).
      async _pRenderDiff(i, slide) {
        const H = window.swipeDeck.h;
        const pr = this.previewPair(i);
        if (!pr) { slide.append(this._pNote('Stage two files to compare.', '')); return; }
        const [a, b] = pr;
        if (a !== this.diffA || b !== this.diffB) { this.diffA = a; this.diffB = b; this.invalidateDiff(); }
        if (!this.diffRows) await this.runDiff();
        if (this.preview?.mode !== 'diff') return;   // toggled back while loading
        this._pSyncChrome(this._pDeck?.deck.active() ?? i);
        const box = H('div', { class: 'flex flex-col h-full w-full min-w-0 overflow-auto p-3 gap-2' });
        const bar = H('div', { class: 'flex items-center gap-1.5 flex-wrap shrink-0' },
          H('span', { class: 'font-mono text-base opacity-60 truncate' }, this.previewPairLabel(i)),
          H('span', { class: 'grow' }));
        if (this.diffRows) {
          const copy = H('button', { class: 'btn btn-ghost btn-sm gap-1', title: 'Copy the diff as a patch-like block' },
            H('i', { class: 'ph ph-copy' }), H('span', { class: 'hidden sm:inline' }, 'Copy'));
          copy.addEventListener('click', () => {
            this.copyDiff();
            copy.firstChild.className = 'ph ph-check';
            setTimeout(() => { copy.firstChild.className = 'ph ph-copy'; }, 1200);
          });
          bar.append(copy);
        }
        if (this.diffHandoff) bar.append(H('a', {
          class: 'btn btn-ghost btn-sm gap-1', href: this.diffHandoff, target: '_blank', rel: 'noopener',
          title: 'Open this pair in the Diff page: split view, word-level highlighting, folding, a real patch',
        }, H('i', { class: 'ph ph-arrow-square-out' }), H('span', { class: 'hidden sm:inline' }, 'Open in Diff')));
        box.append(bar);
        if (this.diffRows) {
          const rows = H('div', { class: 'overflow-auto font-mono text-base leading-snug border border-base-300 rounded bg-base-200/40 whitespace-pre shrink-0' });
          for (const r of this.diffRows) rows.append(H('div', {
            class: 'px-2 ' + (r.t === 'add' ? 'bg-success/10 text-success' : r.t === 'del' ? 'bg-error/10 text-error' : 'text-base-content/55'),
          }, (r.t === 'add' ? '+ ' : r.t === 'del' ? '- ' : '  ') + r.line));
          box.append(rows);
          const list = H('div', { class: 'border border-base-300 rounded-lg overflow-hidden shrink-0' });
          (this.diffPrompts || []).forEach((p, idx) => {
            const mark = H('i', { class: 'ph ph-copy opacity-40 shrink-0' });
            const btn = H('button', {
              class: 'w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left text-base hover:bg-base-200 border-t border-base-300 first:border-t-0',
              title: p.ask,
            }, H('span', { class: 'flex items-center gap-1.5 min-w-0' },
                 ...(p.bespoke ? [H('i', { class: 'ph ph-sparkle text-primary/70 shrink-0', title: 'Tailored to this edit, carried on the link' })] : []),
                 H('span', { class: 'font-semibold truncate' }, p.label)),
               mark);
            btn.addEventListener('click', () => {
              this.copyPrompt(p.ask, idx);
              mark.className = 'ph ph-check text-success shrink-0';
              setTimeout(() => { mark.className = 'ph ph-copy opacity-40 shrink-0'; }, 1200);
            });
            list.append(btn);
          });
          box.append(list);
        }
        slide.append(box);
      },


      // Recent committed files across the estate's root repos, so the latest
      // thing is one tap from staged. One recentFiles() sweep per repo (a
      // commits list plus a batch of commit details, the PR #214 machinery),
      // run in parallel; a repo that fails just contributes nothing.
      async loadRecent(force) {
        if (this.recentLoading || (this._recentLoaded && !force)) return;
        this._recentLoaded = true;
        this.recentLoading = true;
        const repos = [...new Set(this.pickerRoots().map(r => r.repo))].slice(0, 4);
        const lists = await Promise.all(repos.map(async repo => {
          try {
            const files = await this.srcGh(repo, 'HEAD').recentFiles(12);
            return files.map(f => ({ repo, ref: '', path: f.path, date: f.date }));
          } catch { return []; }
        }));
        this.recent = lists.flat()
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .slice(0, 48);
        this.recentLoading = false;
      },
      pathStaged(it) {
        const key = window.StageLink.fmtItem({ repo: it.repo, ref: it.ref || '', path: it.path });
        return this.items.some(x => this.itemKey(x) === key);
      },
      // Tap to stage, tap again to unstage: the row is the whole affordance.
      toggleFile(it) {
        if (this.pathStaged(it)) this.rm({ repo: it.repo, ref: it.ref || '', path: it.path });
        else this.grab({ repo: it.repo, ref: it.ref || '', path: it.path });
      },
      baseName(p) { return (p || '').split('/').pop(); },
      // "web-tools · lib/alpineComponents": repo short name, then the folder.
      whereFrom(it) {
        const repo = (it.repo || '').split('/').pop();
        const dir = it.path.includes('/') ? it.path.slice(0, it.path.lastIndexOf('/')) : '';
        return repo + (dir ? ' · ' + dir : '');
      },
      ago(d) {
        if (!d) return '';
        const gh = Alpine.store('browser').gh;
        if (gh?.ago) return gh.ago(d);
        const s = (Date.now() - new Date(d).getTime()) / 1000;
        if (!isFinite(s)) return '';
        for (const [v, u] of [[86400 * 365, 'y'], [86400 * 30, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']]) {
          if (s >= v) return Math.floor(s / v) + u + ' ago';
        }
        return 'now';
      },

      // ── The Add box: one field, one list ────────────────────────────────
      // Ranking, mirroring path-picker.js's rule so the two finders in this app
      // order alike: exact, then prefix, then substring, then no match; and at
      // equal score a container sorts before a leaf, so descending is never
      // buried under files. Kept as a local function rather than imported
      // because the picker's is internal to its component; if a third caller
      // ever wants it, that is the moment to lift it into a shared kit.
      addRank(text, q) {
        const t = (text || '').toLowerCase();
        if (!q) return 2;
        if (t === q) return 0;
        if (t.startsWith(q)) return 1;
        return t.includes(q) ? 2 : 3;
      },
      shortRepo(r) { return (r || '').split('/').pop(); },
      // The effective query. A leading '@' is eaten, not matched: this whole
      // field is a path finder, so the sigil that mention.js needs mid-prose to
      // say "now I mean a path" is redundant here. But the muscle memory is
      // real and arrives from the other field, and a reader who types it gets
      // a character that matches no filename and an empty list. Eating it makes
      // '@' behave as the picker it was reaching for.
      get addQuery() { return this.addQ.replace(/^@+/, '').trim().toLowerCase(); },

      addRoots() { return this.pickerRoots(); },
      // The repos with no tree read yet, which is what tapping Search has left
      // to fetch. Browsing a repo fills the same cache, so the two never read
      // the same tree twice and Search after browsing costs only the rest.
      addUnread() {
        return [...new Set(this.addRoots().map(r => r.repo))].filter(r => !this.trees[r]);
      },
      get addBusy() {
        if (this.addTab === 'browse') return !!this.treeBusy;
        if (this.addTab === 'recent') return this.recentLoading && !this.recent.length;
        return this.deepBusy;
      },
      get addTruncated() {
        const sc = this.addScope;
        return !!(sc && this.trees[sc.repo] && this.trees[sc.repo].truncated);
      },
      // One recursive tree per repo, cached. Both the descent and the deep
      // search fill this, so neither pays for what the other already read.
      async loadTree(repo) {
        if (this.trees[repo]) return this.trees[repo];
        this.treeBusy = repo;
        try {
          const res = await this.srcGh(repo, 'HEAD').req('git/trees/HEAD?recursive=1');
          const t = { paths: (res.tree || []).filter(e => e.type === 'blob').map(e => e.path),
                      truncated: !!res.truncated };
          this.trees = { ...this.trees, [repo]: t };
          return t;
        } catch {
          const t = { paths: [], truncated: false };
          this.trees = { ...this.trees, [repo]: t };
          return t;
        } finally { this.treeBusy = ''; }
      },
      // Read every root repo still unread, so Search can run across all of
      // them. One recursive tree call per repo: the expensive thing here, and
      // the reason it hangs off the pill tap rather than off a keystroke.
      async loadAllTrees() {
        if (this.deepBusy) return;
        this.deepBusy = true;
        try { await Promise.all(this.addUnread().map(r => this.loadTree(r))); }
        finally { this.deepBusy = false; }
      },

      // Descend into a repo (dir '') or a folder. Browse carries no query of
      // its own, so there is nothing to clear: the search box belongs to the
      // Search pane, which is the split this restores.
      async enter(repo, ref, dir) {
        this.addScope = { repo, ref: ref || '', dir: dir || '' };
        await this.loadTree(repo);
      },
      // Crumbs: the repo, then each folder. addUp(-1) is the root.
      addCrumbs() {
        const sc = this.addScope;
        if (!sc) return [];
        const out = [{ label: this.shortRepo(sc.repo), dir: '' }];
        let acc = '';
        for (const seg of (sc.dir ? sc.dir.split('/') : [])) {
          acc = acc ? acc + '/' + seg : seg;
          out.push({ label: seg, dir: acc });
        }
        return out;
      },
      addUp(i) {
        if (i < 0) { this.addScope = null; return; }
        const c = this.addCrumbs()[i];
        if (c) this.addScope = { ...this.addScope, dir: c.dir };
      },

      // The folder listing at a scope, derived from the flat path list rather
      // than a second API shape: the immediate next segment of every path under
      // this dir, folders first. One recursive read per repo answers every
      // level, so descending never costs another call.
      dirEntries(repo, ref, dir) {
        const t = this.trees[repo];
        if (!t) return [];
        const base = dir ? dir + '/' : '';
        const dirs = new Set(), files = [];
        for (const p of t.paths) {
          if (!p.startsWith(base)) continue;
          const rest = p.slice(base.length);
          const cut = rest.indexOf('/');
          if (cut < 0) files.push({ name: rest, path: p });
          else dirs.add(rest.slice(0, cut));
        }
        const rows = [];
        for (const d of [...dirs].sort())
          rows.push({ kind: 'dir', key: 'd:' + repo + ':' + base + d, repo, ref, dir: base + d,
                      label: d, sub: '', title: repo + ':' + base + d });
        for (const f of files.sort((a, b) => a.name.localeCompare(b.name)))
          rows.push(this.fileRow(repo, ref, f.path, ''));
        return rows;
      },
      fileRow(repo, ref, path, date) {
        return { kind: 'file', key: 'f:' + repo + ':' + path, repo, ref: ref || '', path,
                 label: this.baseName(path), sub: this.whereFrom({ repo, path }),
                 title: repo + ':' + path, date: date || '' };
      },

      // THE LIST, one renderer over three panes. Each reads only its own
      // state, so nothing is mixed: Browse never shows a recent file, Recent
      // never shows a repo to enter, Search never shows either.
      addRows() {
        if (this.addTab === 'browse') {
          const sc = this.addScope;
          if (!sc) return this.addRoots().map(r => ({
            kind: 'repo', key: 'r:' + r.repo, repo: r.repo, ref: r.ref || '',
            label: this.shortRepo(r.repo), sub: r.repo, title: r.repo }));
          return this.trees[sc.repo] ? this.dirEntries(sc.repo, sc.ref, sc.dir) : [];
        }

        if (this.addTab === 'recent') {
          return this.recent
            .filter(it => !this.pillSel || it.repo === this.pillSel)
            .map(it => this.fileRow(it.repo, it.ref, it.path, it.date));
        }

        // Search: filename-contains over every root repo's tree, ranked on the
        // basename so an exact hit is not buried under a path that merely
        // contains the string. The trees were read when the pill was tapped,
        // so this is local string work per keystroke.
        const q = this.addQuery;
        if (q.length < 2) return [];
        const hits = [];
        for (const repo of [...new Set(this.addRoots().map(r => r.repo))]) {
          for (const path of (this.trees[repo]?.paths || [])) {
            if (path.toLowerCase().includes(q)) hits.push({ repo, path });
            if (hits.length >= 300) break;
          }
        }
        return hits
          .sort((x, y) => this.addRank(this.baseName(x.path), q) - this.addRank(this.baseName(y.path), q)
                       || x.path.localeCompare(y.path))
          .slice(0, 100)
          .map(h => this.fileRow(h.repo, '', h.path, ''));
      },
      get addEmpty() {
        if (this.addBusy || this.addRows().length) return '';
        if (this.addTab === 'browse')
          return this.addScope ? 'This folder is empty.' : 'No repos to browse.';
        if (this.addTab === 'recent')
          return this.recentLoading ? '' : 'Nothing recent yet.';
        return this.addQuery.length < 2 ? 'Type at least two characters.' : 'No matching files.';
      },
      addRowIcon(row) {
        if (row.kind === 'repo') return 'ph-git-branch text-primary/70';
        if (row.kind === 'dir') return 'ph-folder text-primary/70';
        return this.pathStaged(row) ? 'ph-check-circle text-success' : 'ph-plus-circle text-primary/70';
      },
      addPick(row) {
        if (row.kind === 'repo') return this.enter(row.repo, row.ref, '');
        if (row.kind === 'dir') return this.enter(row.repo, row.ref, row.dir);
        this.toggleFile(row);
      },
      // Recent's repo filter: single-select, tap again for all. A badge rather
      // than a tab, since it narrows one list instead of swapping panes.
      repoPills() {
        const counts = new Map();
        for (const it of this.recent) counts.set(it.repo, (counts.get(it.repo) || 0) + 1);
        return [...counts.entries()].map(([repo, n]) => ({ repo, n }));
      },
      togglePill(repo) { this.pillSel = this.pillSel === repo ? '' : repo; },

      // A file chosen in the grab picker joins the stage (deduped by key).
      grab(d) {
        if (!d || !d.repo || !d.path) return;
        const it = { repo: d.repo, ref: d.ref || '', path: d.path };
        const key = window.StageLink.fmtItem(it);
        if (this.items.some(x => this.itemKey(x) === key)) {
          return Alpine.store('toast')('stack', d.path + ' is already staged', 'alert-info', 2000);
        }
        Alpine.store('browser').stage = [...this.items, it];
        Alpine.store('toast')('plus-circle', 'Staged ' + d.path, 'alert-success', 2000);
      },

      // The repo set both pickers open at: the open repo (if any), the estate's
      // members, then configured transfer targets, deduped. Estate-level on
      // purpose: the stage belongs to no repo, so its reach is the estate.
      // Members come from the shell's estateRepos (each repo's own
      // `estate: true`, via the config cache). This used to read the shell's
      // quickLinks, a second list that named seven of the eight members.
      pickerRoots() {
        const s = Alpine.store('browser');
        const seen = new Set();
        const roots = [];
        const add = (repo, ref) => {
          if (!repo) return;
          const key = repo + '@' + (ref || '');
          if (seen.has(key)) return;
          seen.add(key);
          roots.push({ repo, ref: ref || '' });
        };
        add(s.repo, '');
        for (const r of (window.__shell?.estateRepos || [])) add(r.repo, '');
        for (const t of this.targets) {
          const d = this.parseDest(t);
          if (d) add(d.repo, d.ref);
        }
        return roots;
      },

      // Local TEXT rides the link now, gzipped into its fragment, so a stage
      // that is nothing but a paste is still shareable. Only local BINARIES
      // are excluded, and the note says which rather than the blanket "local
      // files excluded" that used to cover both.
      async copyLink() {
        const toast = Alpine.store('toast');
        const binaries = this.localItems.filter(it => !it.isText);
        const carried = this.items.filter(it => !it.local || it.isText);
        if (!carried.length) {
          return toast('warning', binaries.length
            ? 'Nothing to link: a local binary can\'t ride a link, send it to a repo instead'
            : 'Nothing to link: the stage is empty', 'alert-error', 5000);
        }
        let url;
        try {
          url = await window.StageLink.mintWithLocals(carried, location.origin + location.pathname,
            // A diff intent rides the link when this stage HAS been diffed. The
            // signal used to be "the Diff tab is showing"; with no tab, the fact
            // that a diff was run is the honest version of the same claim.
            { prompts: this.linkPrompts, mode: this.diffRows ? 'diff' : '' });
        } catch (e) {
          return toast('warning', 'Link too long: ' + (e?.message || e)
            + '. Send them to a repo and link the refs instead.', 'alert-error', 6000);
        }
        navigator.clipboard.writeText(url);
        this.linkCopied = true;
        setTimeout(() => { this.linkCopied = false; }, 1500);
        const note = binaries.length
          ? ' (' + binaries.length + ' local binar' + (binaries.length === 1 ? 'y' : 'ies') + ' excluded)'
          : '';
        toast('link', 'Stage link copied' + note, 'alert-success', 2500);
      },

      // The staged files spliced into one block, each under a `// === key ===`
      // header. Refs fetch (cached per item, so only new refs hit the network);
      // local text is inlined; a local binary shows a note, not bytes.
      async ensureBundle(force) {
        if (!this.items.length) { this.bundleText = ''; return; }
        this.bundleBusy = true;
        const parts = await Promise.all(this.items.map(async it => {
          const k = this.itemKey(it);
          let content;
          if (it.local) {
            content = it.isText ? (it.text || '') : '// (binary — ' + this.fmtSize(it.size) + ', staged for copy)';
          } else {
            if (force || this._cache[k] == null) {
              try { this._cache[k] = fmt((await this.srcGh(it.repo, it.ref).get(it.path)).text); }
              catch (e) { this._cache[k] = '// ERROR: ' + (e.message || e); }
            }
            content = this._cache[k];
          }
          return '// === ' + this.bundleHeader(it) + ' ===\n' + content;
        }));
        this.bundleText = parts.join('\n\n');
        this.bundleBusy = false;
      },
      async rebuild() {
        this._cache = {};
        await this.ensureBundle(true);
      },
      async copyBundle() {
        if (!this.items.length) return;
        if (this.bundleBusy || !this.bundleText) await this.ensureBundle();
        try {
          await navigator.clipboard.writeText(this.bundleText);
          this.bundleCopied = true;
          setTimeout(() => { this.bundleCopied = false; }, 1500);
          Alpine.store('toast')('copy', 'Copied ' + this.items.length + ' file' + (this.items.length === 1 ? '' : 's') + ' as text', 'alert-success', 2500);
        } catch (e) {
          Alpine.store('toast')('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 5000);
        }
      },
      async download() {
        if (!this.items.length) return;
        if (this.bundleBusy || !this.bundleText) await this.ensureBundle();
        const blob = new Blob([this.bundleText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stage-bundle.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Alpine.store('toast')('download-simple', 'Downloaded stage-bundle.txt', 'alert-success', 2500);
      },

      // "owner/repo", "owner/repo:dir", or "owner/repo@ref:dir". No dir = root.
      parseDest(spec) {
        const m = spec.trim().match(/^([\w.-]+\/[\w.-]+?)(?:@([\w./-]+))?(?::(.*))?$/);
        return m ? { repo: m[1], ref: m[2] || '', dir: (m[3] || '').trim() } : null;
      },

      // A plain line diff: common prefix/suffix trimmed, LCS over the middle.
      // Returns [{t:'ctx'|'add'|'del', line}], or null when the middle is too
      // large to DP over (the caller reports rather than freezing the page).
      // Line diff via kits/text-diff.js. This used to be an inlined LCS table
      // capped at 4 million cells, which reported "files too large to diff" on
      // any real pair of long documents; the shared kit is patience diff, so
      // that ceiling is gone. Rows stay {t,line} with full context, since the
      // row set here IS the whole compare.
      diffLines(aText, bText) {
        if (!window.textDiff) throw new Error('text-diff kit not loaded');
        const a = String(aText).split('\n'), b = String(bText).split('\n');
        return textDiff.rows(textDiff.lines(a, b), a, b);
      },

      // One side of the compare: a local text item reads its held text; a ref
      // reads from its origin, or from the override ref when one is given
      // (that override is what makes same-file-twice a version diff).
      // One side's text. Reads the bundle's content cache first: it is keyed
      // by itemKey and holds exactly this, so a diff over a stage whose bundle
      // has already built costs nothing. That is what lets the diff just run
      // when the lens opens instead of waiting behind a button.
      async diffSide(it) {
        if (!it) throw new Error('nothing selected');
        if (it.local) {
          if (!it.isText) throw new Error(it.name + ' is binary');
          return it.text || '';
        }
        const k = this.itemKey(it);
        if (this._cache[k] != null) return this._cache[k];
        return fmt((await this.srcGh(it.repo, it.ref).get(it.path)).text);
      },
      // A change to the A/B selection or a ref override makes the shown diff
      // stale: its rows and stored text are from the last runDiff, but the
      // copy actions label their header from the CURRENT selection, so a copy
      // taken without re-running would name one side and carry another's text.
      // Drop the shown diff on any such change; the copy buttons (x-show on
      // diffRows) go with it, forcing a re-run against what's actually picked.
      invalidateDiff() {
        this.diffRows = null;
        this.diffStat = '';
        this._diffTextA = '';
        this._diffTextB = '';
      },
      async runDiff() {
        if (this.diffBusy) return;
        const toast = Alpine.store('toast');
        this.diffBusy = true;
        try {
          const [a, b] = await Promise.all([
            this.diffSide(this.items[this.diffA]),
            this.diffSide(this.items[this.diffB]),
          ]);
          const rows = this.diffLines(a, b);
          if (!rows) throw new Error('files too large to diff');
          this.diffRows = rows;
          this._diffTextA = a;
          this._diffTextB = b;
          const add = rows.filter(r => r.t === 'add').length;
          const del = rows.filter(r => r.t === 'del').length;
          this.diffStat = (add || del) ? ('+' + add + ' \u2212' + del) : 'identical';
        } catch (e) {
          this.diffRows = null;
          this.diffStat = '';
          toast('warning', 'Diff failed: ' + (e.message || e), 'alert-error', 5000);
        }
        this.diffBusy = false;
      },

      // The Diff page's address for the current pair, or '' when it cannot be
      // built. Both sides have to be repo items: the Diff page takes addresses
      // (?a=&b=), and a dropped or pasted local file has no address to hand
      // over, so the link hides rather than half-working.
      get diffHandoff() {
        const a = this.items[this.diffA], b = this.items[this.diffB];
        if (!a || !b || a.local || b.local) return '';
        const spec = (it) => it.repo + (it.ref ? '@' + it.ref : '') + ':' + it.path;
        const q = new URLSearchParams({ a: spec(a), b: spec(b) });
        return new URL('../diff-tool.html?' + q, location.href).href;
      },

      // A compare side's display label: repo@ref:path for a ref item (the
      // override ref if one was used, else the item's own), or "(local) name"
      // for a dropped/pasted item. Used by the diff dump and the review
      // prompts, so both name what was actually compared, not just what's
      // staged.
      diffLabel(it) {
        if (!it) return '?';
        if (it.local) return '(local) ' + it.name;
        return it.repo + '@' + (it.ref || 'default') + ':' + it.path;
      },

      // The diff as a copyable, patch-like text block: a header naming both
      // sides, then the tagged rows as +/-/context
      // lines. Not a real unified-diff hunk format (no @@ markers, no
      // surrounding-line trimming) \u2014 the row set already IS the full compare.
      get diffDump() {
        if (!this.diffRows) return '';
        const a = this.diffLabel(this.items[this.diffA]);
        const b = this.diffLabel(this.items[this.diffB]);
        const lines = this.diffRows.map(r => (r.t === 'add' ? '+ ' : r.t === 'del' ? '- ' : '  ') + r.line);
        return '--- A: ' + a + '\n+++ B: ' + b + '\n\n' + lines.join('\n');
      },

      async copyDiff() {
        if (!this.diffRows) return;
        try {
          await navigator.clipboard.writeText(this.diffDump);
          this.diffCopied = true;
          setTimeout(() => { this.diffCopied = false; }, 1500);
        } catch (e) {
          Alpine.store('toast')('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 5000);
        }
      },

      // The review-prompts list: the bespoke asks carried on the link first
      // (tailored to this edit), then the fixed general asks (DIFF_PROMPTS). A
      // getter, not a stored field, so it never needs its own reactivity wiring.
      get diffPrompts() {
        const bespoke = (this.linkPrompts || []).map(p => ({ label: p.label, ask: p.ask, bespoke: true }));
        const fixed = DIFF_PROMPTS.map(([label, ask]) => ({ label, ask, bespoke: false }));
        return [...bespoke, ...fixed];
      },

      // Copy one review prompt: both compared texts, the diff, and that
      // prompt's specific ask, assembled for pasting into a separate chat as
      // a second, independent review. Uses the text already fetched by the
      // last runDiff \u2014 no re-fetch, so this reflects exactly what's on screen.
      async copyPrompt(ask, idx) {
        if (!this.diffRows) return;
        const a = this.diffLabel(this.items[this.diffA]);
        const b = this.diffLabel(this.items[this.diffB]);
        const text = [
          'Reviewing an edit.',
          '',
          'A (' + a + '):',
          this._diffTextA,
          '',
          'B (' + b + '):',
          this._diffTextB,
          '',
          'DIFF:',
          this.diffDump,
          '',
          'REVIEW REQUEST: ' + ask,
        ].join('\n');
        try {
          await navigator.clipboard.writeText(text);
          this.promptCopiedIdx = idx;
          setTimeout(() => { if (this.promptCopiedIdx === idx) this.promptCopiedIdx = -1; }, 1500);
        } catch (e) {
          Alpine.store('toast')('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 5000);
        }
      },

      // Two-tap confirm: first tap arms for 3s, second deposits. Cross-repo
      // write with the viewer's token, so the extra gesture stays deliberate.
      // Refs copy grouped by source repo@ref via gh.copyTo; local files write
      // their held bytes via gh.saveBytes/save. Both land in dest.dir (root when
      // empty) under their basenames, on the destination's default branch.
      async send() {
        if (this.sending || !this.items.length) return;
        const toast = Alpine.store('toast');
        let dest = this.parseDest(this.destSpec);
        if (!dest) return toast('warning', 'Destination must be owner/repo, owner/repo:dir, or owner/repo@ref:dir', 'alert-error', 5000);
        // An unaddressed deposit (a repo, no dir) lands where the RECEIVER
        // says, not at its root: the destination repo's own .web-tools.json
        // may declare an `inbox`. One extra read, keyed to the picked repo,
        // and only when no dir was given. Root stays the fallback, so a repo
        // that declares nothing behaves exactly as before. The resolved
        // destination is shown on the armed button, so the second tap is a
        // confirm of where the files actually go.
        if (!dest.dir) {
          const box = await this.receiverInbox(dest.repo);
          if (box) dest = { ...dest, dir: box.dir, ref: box.ref || dest.ref };
        }
        this.resolvedDest = dest;
        // A ref copying onto itself (same repo/ref, no dir) is a no-op guard;
        // local files have no source, so they never trip it.
        const selfCopies = this.refItems.filter(it =>
          it.repo === dest.repo && !dest.dir && (dest.ref || '') === (it.ref || ''));
        if (selfCopies.length) {
          return toast('warning', selfCopies.length + ' staged file' + (selfCopies.length === 1 ? '' : 's') + ' would copy onto themselves — add a :dir or @ref', 'alert-error', 5000);
        }
        if (!this.sendArmed) {
          this.sendArmed = true;
          setTimeout(() => { this.sendArmed = false; }, 3000);
          return;
        }
        this.sendArmed = false;
        this.sending = true;
        this.sendStatus = '';
        try {
          const gh = Alpine.store('browser').gh;
          if (this.groups.length && !gh.copyTo) await window.gh?.load('gh-transfer.js');
          if (this.groups.length && !gh.copyTo) throw new Error('gh-transfer.js unavailable');
          if (this.localItems.length && !gh.saveBytes) await window.gh?.load('gh-store.js');
          if (this.localItems.length && !gh.saveBytes) throw new Error('gh-store.js unavailable');
          const total = this.items.length;
          let done = 0;
          const failures = [];
          // Refs: one grouped copyTo per source repo@ref.
          for (const g of this.groups) {
            const src = this.srcGh(g.repo, g.ref);
            const res = await src.copyTo(dest, g.items.map(i => i.path), {
              onProgress: (d) => {
                this.sendStatus = 'copying ' + Math.min(done + d + 1, total) + '/' + total + '…';
              }
            });
            done += g.items.length;
            failures.push(...res.filter(r => r.status === 'error'));
          }
          // Local files: write held bytes/text into dest.dir.
          if (this.localItems.length) {
            const destGh = this.srcGh(dest.repo, dest.ref);
            for (const it of this.localItems) {
              const path = joinDir(dest.dir, it.name);
              const msg = 'Add ' + path + ' via show-repo';
              try {
                if (it.isText) await destGh.save(path, it.text, msg);
                else await destGh.saveBytes(path, it.bytes, msg);
                done++;
                this.sendStatus = 'copying ' + Math.min(done, total) + '/' + total + '…';
              } catch (e) {
                failures.push({ path, status: 'error', error: e });
              }
            }
          }
          const ok = total - failures.length;
          this.sendStatus = ok + '/' + total + ' copied to ' + dest.repo + (dest.dir ? ':' + dest.dir : '');
          if (failures.length) {
            console.warn('copy failures:', failures);
            toast('warning', failures.length + ' file' + (failures.length === 1 ? '' : 's') + ' failed — see console', 'alert-error', 6000);
          } else {
            toast('paper-plane-tilt', 'Copied ' + ok + ' file' + (ok === 1 ? '' : 's') + ' to ' + dest.repo, 'alert-success', 4000);
          }
        } catch (e) {
          this.sendStatus = '';
          toast('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 6000);
        }
        this.sending = false;
      },

      // ── Save as surface ──────────────────────────────────────────────────
      //
      // A saved stage is a surface (docs/envelopes/surface.md, the stage/1
      // profile), written to the registry's surfaces/ beside every other one,
      // and that is the whole reorganization: the shelf IS the history, so
      // there is no second list to browse and no per-repo drilldown to pick a
      // repo before picking a set.
      //
      // This replaced a write of stage.files into a NAMED repo's manifest,
      // which was wrong in three ways at once. It OVERWROTE, so each save
      // destroyed the last, with nothing on screen saying what was about to
      // go. It wrote a cross-repo set into one repo's config, when a stage's
      // items each carry their own origin and the set belongs to no repo. And
      // it silently dropped every local file, since a manifest has no place
      // for bytes. Appending v2 surfaces to the registry answers all three.
      //
      // stage.targets stays where it was: where a repo ACCEPTS files is a fact
      // about that repo, and the only part of the old block that ever was.
      // What the bench was read from, when it was read from a saved surface:
      // { uid, file, manifest, context }. Saving then writes THAT file, so
      // editing a saved set updates it instead of leaving a near-duplicate
      // beside it. Appending is for promoting a working set, which is the case
      // with no origin.
      get origin() { return Alpine.store('browser')?.stageOrigin || null; },

      get saveSurface() {
        const o = this.origin;
        return window.Surface.fromStage(this.items, {
          name: (this.saveName || '').trim() || (o ? o.manifest?.name : ''),
          description: (this.saveDesc || '').trim() || (o ? o.manifest?.description : ''),
          created_at: o ? o.manifest?.created_at : '',
          destination: (this.saveDest || '').trim() || (o ? o.context?.destination : ''),
          prompts: this.linkPrompts,
          // Same signal as the link's mode: a pair is recorded once it has
          // actually been compared, which is a fact about the set rather than
          // about which control happened to be open.
          compare: this.diffRows ? { a: this.diffA, b: this.diffB } : null,
        });
      },
      get autoName() { return window.Surface.autoName(this.saveSurface.surface.items); },
      get saveSkipped() { return this.saveSurface.skipped; },
      get savePreview() { return JSON.stringify(window.Surface.write(this.saveSurface.surface), null, 2); },
      get savePath() {
        const o = this.origin;
        return 'surfaces/' + (o ? o.file : window.Surface.fileName(this.saveSurface.surface));
      },

      // Prefill from the origin rather than falling back to it silently: a
      // blank-looking field over a value the preview will write is the form
      // lying about what it is going to do.
      openSave() {
        if (!this.items.length) return;
        const o = this.origin;
        if (o) {
          this.saveName = this.saveName || o.manifest?.name || '';
          this.saveDesc = this.saveDesc || o.manifest?.description || '';
          this.saveDest = this.saveDest || o.context?.destination || '';
        }
        this.$refs.saveDlg?.showModal();
      },

      async saveAsSurface() {
        if (this.savingStage || !this.items.length) return;
        const toast = Alpine.store('toast');
        const s = Alpine.store('browser');
        this.savingStage = true;
        try {
          if (!s.gh.save) await window.gh?.load('gh-store.js');
          if (!s.gh.save) throw new Error('gh-store.js unavailable');
          const { surface, skipped } = this.saveSurface;
          const path = this.savePath;
          const reg = this.srcGh(window.__shell?.REGISTRY_REPO || '', '');
          await reg.save(path, window.Surface.write(surface),
            (this.origin ? 'Update surface' : 'Save stage as surface') + ' via show-repo');
          this.$refs.saveDlg?.close();
          this.saveName = this.saveDesc = this.saveDest = '';
          // The shelf is the history, so it has to show the new entry without
          // a reload for the append to read as one.
          window.dispatchEvent(new CustomEvent('web-tools:surfaces-changed'));
          const note = skipped.length ? ' (' + skipped.length + ' left out)' : '';
          toast('push-pin', 'Saved ' + surface.manifest.name + note, 'alert-success', 3000);
        } catch (e) {
          toast('warning', 'Save failed: ' + (e.message || e), 'alert-error', 6000);
        }
        this.savingStage = false;
      }
    };
  });
});
