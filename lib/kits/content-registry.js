// lib/kits/content-registry.js — the epistemic content registry, read in the browser.
//
// A repo may declare, in a curated data/design/content.csv, what each of its
// artifacts IS (`creation_mode`: supplied, mechanical, human-, model-, or
// hybrid-authored, mixed) and which corpora it belongs to (`analysis_use`).
// The convention and its authoring rules live in the portable
// content-registry skill; the Python consumers (termlab, semsearch) read it
// server-side. This module is the same contract for pages: parse the CSV,
// resolve a path to its most specific row, and group a changed-file list by
// creation mode, so a surface like the branch review can lead with authored
// work and collapse the mechanical.
//
// The registry's own rules, honored here:
//   - authoritative for what it covers, owes the repo no inventory: an
//     unmatched path resolves to null and grouping labels it "undeclared",
//     which is a normal state and not an error;
//   - a trailing `/` declares a subtree; the most specific declaration wins
//     (exact file, then the longest prefix);
//   - fragment locators (#heading=, #column=, #html-id=) refine FILES, not
//     paths, so path resolution ignores them.
//
// Pure: no fetch, no Alpine, no DOM. The caller fetches the CSV (it knows the
// repo and ref); this module answers questions about it. Attaches to
// window.ContentRegistry, loaded via gh.load('kits/content-registry.js').
(() => {
  const PATH = 'data/design/content.csv';

  // Group order for display: authored judgment first, source material and
  // unknowns in the middle, the machine's output last (and collapsed, by the
  // grouping's own flag): a reviewer reads what someone decided before what a
  // generator emitted.
  const MODE_ORDER = ['human-authored', 'hybrid-authored', 'model-authored',
                      'mixed', 'supplied', 'undeclared', 'mechanical'];

  // A small CSV parse, sufficient for the registry's shape: comma-separated,
  // double-quote quoting with "" escapes, one record per line (the registry's
  // descriptions are single-line by construction).
  function parseCsvLine(line) {
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

  // CSV text -> rows [{ locator, mode, use, description }], header-driven so a
  // column reorder upstream cannot silently shift meanings. Fragment locators
  // are dropped here, per the path-resolution rule above.
  function parse(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const head = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const col = (name) => head.indexOf(name);
    const iL = col('locator'), iM = col('creation_mode'), iU = col('analysis_use'), iD = col('description');
    if (iL < 0 || iM < 0) return [];
    const rows = [];
    for (const line of lines.slice(1)) {
      const f = parseCsvLine(line);
      const locator = (f[iL] || '').trim();
      if (!locator || locator.includes('#')) continue;
      rows.push({ locator, mode: (f[iM] || '').trim(),
                  use: iU >= 0 ? (f[iU] || '').trim() : '',
                  description: iD >= 0 ? (f[iD] || '').trim() : '' });
    }
    return rows;
  }

  // The most specific row covering `path`: an exact file row wins outright;
  // among subtree rows the longest matching prefix wins. Null when nothing
  // covers it.
  function resolve(rows, path) {
    let best = null, bestLen = -1;
    for (const r of rows || []) {
      if (r.locator.endsWith('/')) {
        if (path.startsWith(r.locator) && r.locator.length > bestLen) { best = r; bestLen = r.locator.length; }
      } else if (r.locator === path) {
        return r;
      }
    }
    return best;
  }

  // A changed-file list, grouped by creation mode in display order. Each group:
  //   { mode, files, collapsed, note }
  // `collapsed` marks the group a reviewer skims rather than reads (mechanical
  // output). `note` is the registry's own description when ONE locator covers
  // the whole group, the standing context a per-change caption used to restate
  // by hand; groups drawn from several locators carry no note rather than a
  // misleading one (each file still knows its row via `entry`).
  function group(files, rows) {
    const by = new Map();
    for (const f of files || []) {
      const row = resolve(rows, f.path);
      const mode = row?.mode || 'undeclared';
      if (!by.has(mode)) by.set(mode, []);
      by.get(mode).push({ ...f, entry: row });
    }
    const out = [];
    for (const mode of MODE_ORDER) {
      if (!by.has(mode)) continue;
      const files = by.get(mode);
      by.delete(mode);
      const locs = [...new Set(files.map(f => f.entry?.locator).filter(Boolean))];
      out.push({ mode, files, collapsed: mode === 'mechanical',
                 note: locs.length === 1 ? (files[0].entry?.description || '') : '' });
    }
    // A mode outside the controlled vocabulary still groups (the registry
    // validates hard elsewhere; a display surface has no business dropping
    // files over a typo).
    for (const [mode, files] of by) out.push({ mode, files, collapsed: false, note: '' });
    return out;
  }

  window.ContentRegistry = { PATH, parse, resolve, group, MODE_ORDER };
})();
