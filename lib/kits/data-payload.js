// Reading a data toss. One rule decides what a payload is, so a caller can
// send whichever shape is natural without saying which it picked:
//
//   ENVELOPE  a JSON object carrying an `items` array — several files in one
//             toss, each with an optional default view and note.
//   BARE      anything else (a JSON array, a CSV, a markdown file, plain
//             text). One item, named by sniff, typed by the viewer itself.
//
// The discriminator is deliberately narrow so a legitimate data payload is
// never mistaken for an envelope: an object qualifies only when it declares
// `kind: "data-view/1"`, or its `items` entries look like item records. A
// bare `{"items": [1,2,3]}` is therefore data, not an envelope.
//
// `view` is passed through verbatim rather than validated against a list of
// modes: alpineComponents/viewer.js already falls back when a requested mode
// isn't available for a file (resolveDefaultMode), so the envelope's
// vocabulary tracks the viewer's with nothing to keep in sync here.
//
// Pure: no DOM, no network. Fetching an item's `src` is the page's job
// (pages/data-view.html); this module only says what to fetch. Contract and
// worked examples: docs/envelopes/data-view.md. Attaches to window.DataPayload.
(() => {
  const KIND = 'data-view/1';

  // The grammar lives in one module now (lib/kits/repo-address.js). Read at call
  // time rather than at load: this module is registered before the page's
  // gh.load chain finishes, so binding it here would capture an undefined.
  // The throw names the missing load, since the alternative is a null parse
  // that reads as "not an address" and misroutes silently.
  const grammar = () => {
    if (!window.RepoAddress) throw new Error('kits/data-payload.js requires window.RepoAddress (load repo-address.js first)');
    return window.RepoAddress;
  };

  // owner/repo[@ref]:path -> { repo, ref, path }; null when it isn't one, so
  // a caller can treat the string as a path in the hub repo instead.
  //
  // Delegates to lib/kits/repo-address.js, which owns the grammar. This copy used to
  // fill a missing @ref with 'main', the one place the three copies disagreed;
  // it now reports '' like the others, because '' is what the contents API
  // wants and 'main' was a guess about a repo's default branch. A concrete ref
  // is only needed when BUILDING a link, so the fallback moved there
  // (RepoAddress.ref, used by the viewer's fileUrls).
  function parseSpec(spec) {
    return grammar().parse(spec);
  }

  const basename = (p) => String(p || '').split('/').pop() || '';

  // Same-count-of-delimiters across the first few rows, which is what
  // separates a delimited table from prose that happens to contain a comma.
  function delimited(lines, ch) {
    const counts = lines.map(l => l.split(ch).length - 1);
    return counts[0] > 0 && counts.every(c => c === counts[0]);
  }

  // A filename for a payload that arrived without one (an inline #gz= toss).
  // The extension is the only thing the viewer's module tests read, so this
  // exists to give them something honest to key on.
  function sniffName(text, stem = 'data') {
    const s = String(text ?? '');
    const t = s.trim();
    if (!t) return stem + '.txt';
    if (/^[[{]/.test(t)) { try { JSON.parse(t); return stem + '.json'; } catch (e) { /* not json */ } }
    if (/^</.test(t)) return stem + (/^<(!doctype|html)\b/i.test(t) ? '.html' : '.xml');
    const lines = t.split(/\r?\n/).filter(l => l.trim()).slice(0, 5);
    if (lines.length > 1) {
      if (delimited(lines, '\t')) return stem + '.tsv';
      if (delimited(lines, ',')) return stem + '.csv';
    }
    if (/^#{1,6}\s|\n#{1,6}\s/.test(t)) return stem + '.md';
    return stem + '.txt';
  }

  function isEnvelope(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    if (v.kind === KIND) return true;
    if (!Array.isArray(v.items) || !v.items.length) return false;
    // Every entry has to look like an item record, or this is ordinary data
    // that happens to use the key `items`.
    return v.items.every(it => it && typeof it === 'object' && !Array.isArray(it) &&
      ('content' in it || 'src' in it || 'name' in it));
  }

  // One envelope entry -> the record the page drives the viewer with. A name
  // is derived when absent so the viewer can type the file: from the src path
  // when it points somewhere, else by sniffing inline content.
  function normalizeItem(it, i) {
    const spec = it.src ? parseSpec(it.src) : null;
    const name = it.name ||
      (it.src ? basename(spec ? spec.path : it.src) : '') ||
      (it.content != null ? sniffName(it.content, 'item-' + (i + 1)) : 'item-' + (i + 1));
    return {
      name,
      view: it.view || null,
      note: it.note || '',
      content: it.content != null ? String(it.content) : null,
      src: it.src || null,
      spec,
    };
  }

  // text -> { kind, title, note, items }. `name` names the bare case (the
  // path a ?src= payload came from), so an addressed rows.csv keeps its
  // extension instead of being sniffed.
  function read(text, opts) {
    const name = (opts || {}).name || '';
    const s = String(text ?? '');
    let parsed, parseOk = true;
    try { parsed = JSON.parse(s); } catch (e) { parseOk = false; }

    if (parseOk && isEnvelope(parsed)) {
      const items = (parsed.items || []).map(normalizeItem);
      return {
        kind: 'envelope',
        title: parsed.title || '',
        note: parsed.note || '',
        items: items.length ? items : [{ name: 'empty.txt', view: null, note: '', content: '', src: null, spec: null }],
      };
    }

    return {
      kind: 'bare',
      title: '',
      note: '',
      items: [{
        name: basename(name) || sniffName(s),
        view: null,
        note: '',
        content: s,
        src: null,
        spec: null,
      }],
    };
  }

  // ── addressing one item of an envelope ──
  //
  // The `#item=` vocabulary, both directions. It lives here rather than in the
  // page because it is a statement about the ENVELOPE, not about a URL: which
  // strings name an item, and which of them a reader may safely put in a link.
  // The page owns the location read and write; this owns what those strings
  // mean. Keeping it here is also what lets `npm test` hold it, since the page
  // half needs a browser.

  const labelOf = (it) => basename(it && it.name);

  // spec -> index, or null when nothing matches. An all-digits value is an
  // INDEX, anything else is a NAME: unambiguous where the envelope is stable,
  // survivable where it is edited. A name matches the item's full `name` first
  // and then its basename, which is what a reader sees in the item strip and so
  // what a link author will have copied. Duplicates resolve to the first match.
  //
  // A miss is null rather than a throw: an address that no longer resolves
  // should open the payload at its first item, not fail to open it.
  function resolveItem(items, spec) {
    const list = items || [];
    if (spec == null || spec === '') return null;
    const s = String(spec);
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return n < list.length ? n : null;
    }
    const byName = list.findIndex(it => it && it.name === s);
    if (byName >= 0) return byName;
    const byLabel = list.findIndex(it => labelOf(it) === s);
    return byLabel >= 0 ? byLabel : null;
  }

  // index -> the shortest form that reads back as that index: basename, then
  // full name, then the position. Each candidate is round-tripped through
  // resolveItem rather than tested for uniqueness by hand, so the address
  // returned is one this module has verified rather than one it assumed. The
  // digit test keeps a file honestly named `2` from being minted as an index.
  function addressItem(items, i) {
    const list = items || [];
    const it = list[i];
    if (!it) return String(i);
    for (const form of [labelOf(it), it.name]) {
      if (form && !/^\d+$/.test(form) && resolveItem(list, form) === i) return form;
    }
    return String(i);
  }

  window.DataPayload = {
    KIND, read, isEnvelope, sniffName, parseSpec, normalizeItem,
    resolveItem, addressItem,
  };
})();
