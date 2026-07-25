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

  // owner/repo[@ref]:path -> { repo, ref, path }; null when it isn't one, so
  // a caller can treat the string as a path in the hub repo instead. ':' can't
  // appear in a git ref name, which is what makes the split unambiguous.
  function parseSpec(spec) {
    const m = String(spec || '').match(/^([\w.-]+\/[\w.-]+)(?:@([^:]+))?:(.+)$/);
    return m ? { repo: m[1], ref: m[2] || 'main', path: m[3] } : null;
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

  window.DataPayload = { KIND, read, isEnvelope, sniffName, parseSpec, normalizeItem };
})();
