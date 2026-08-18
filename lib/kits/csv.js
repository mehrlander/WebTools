// CSV, small and shared.
//
// Third copy of this parse was the trigger: tools/build/registries-load.mjs has
// the Node one, lib/kits/content-registry.js had a private one, and the Map
// view's Registries tab needed a browser one when docs/properties.json became
// docs/registries.csv and docs/properties.csv on 2026-08-16. The estate's rule
// is that the third recurrence earns a fix, so this is the fix.
//
// Deliberately narrow: comma-separated, double-quote quoting with "" escapes,
// one record per line. Every registry that uses it keeps its prose single-line
// by construction, which is what lets the parse stay this size. A carrier that
// needs embedded newlines wants a different format, not a bigger parser.
(function () {
  function parseLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  // Header-driven, so a column reorder upstream cannot silently shift meanings.
  function rows(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const head = parseLine(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
      const f = parseLine(line);
      return Object.fromEntries(head.map((h, i) => [h, (f[i] ?? '').trim()]));
    });
  }

  // A blank cell means NOT ASSERTED. Where a column has to tell that from
  // "checked, and the answer is none", its value domain carries an explicit
  // token; splitting a blank here yields [], never [''].
  // Values can contain the delimiter (an assertion name did), so it is escaped
  // on the way out and honoured on the way back. Backslash escapes itself.
  const split = (s) => String(s).split(/(?<!\\);/)
    .map(x => x.replace(/\\;/g, ';').replace(/\\\\/g, '\\'));
  const join = (xs) => xs.map(x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;')).join(';');
  const list = (s) => (s ? split(s).map(x => x.trim()).filter(Boolean) : []);

  window.Csv = { parseLine, rows, list, split, join };
})();
