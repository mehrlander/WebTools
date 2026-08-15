// lib/kits/xlsx.js — OOXML (.xlsx) structural inspector: unzip, walk every
// XML/rels part, and surface the internal cross-references (shared strings,
// styles, sheet rels, comments, calc chain, defined names) plus reconstructed
// sheet data. Pulled from three dropped prototypes (home repo's chron/dump/,
// "Excel drop dive" being the most complete of the three) into one pure kit:
// no DOM rendering, no jQuery/Tabulator. analyze() takes already-extracted
// XML strings and is synchronous and part-order-independent — cross-file
// resolution (shared-string values, "which sheets does this file touch")
// happens in a finalize pass after every part is walked, which also fixes a
// real bug in the source prototypes: they resolved shared-string cell values
// inline during a concurrent, unordered zip read, so a sheet processed before
// sharedStrings.xml got empty string values. readZip() is the thin
// JSZip-backed convenience wrapper a page actually calls.
//
// 2026-08-15: the prototypes' own lineage was recovered from the chat archive
// (mehrlander/chat-histories, excel.md), and they turned out to be the weaker
// of two contemporaneous browser builds. A separate 2025-11-17 viewer resolved
// sheet names through workbook.xml plus its rels and handled inline strings;
// neither reached the three that were dropped here, so this kit shipped
// without both. Both are now in, along with the index confusion the first of
// them was hiding: see the finalize() join and connectionsView.
(() => {
  let jszipMod;
  const loadZip = async () => {
    if (typeof JSZip !== 'undefined') return JSZip;
    jszipMod ??= await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm').then(m => m.default);
    return jszipMod;
  };

  // Zero-based column index -> A1-style letters (0 -> 'A', 26 -> 'AA').
  const colLetter = (n) => {
    let s = '';
    for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
    return s;
  };

  // 'AA5' -> 26 (zero-based column index); ignores the row digits. -1 if unparsable.
  const colIndexFromRef = (ref) => {
    const m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    return [...m[1]].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
  };

  const directChildren = (node, name) => [...node.children].filter(c => c.nodeName === name);
  const directChild = (node, name) => directChildren(node, name)[0];

  // Text of an <is> (inline string) element. A plain inline string is <is><t>,
  // but a rich one splits into <r> runs each carrying its own <t>, and the cell
  // value is the runs concatenated. Every <t> descendant, in document order,
  // covers both without a special case.
  const inlineText = (is) =>
    is ? [...is.getElementsByTagName('t')].map(t => t.textContent ?? '').join('') : '';

  const ALL_SHEETS = Symbol('all-sheets'); // placeholder resolved in finalize()

  // parts: [[path, xmlString], ...] or {path: xmlString}. Walk order doesn't
  // matter for correctness — see the module comment above.
  function analyze(parts) {
    const entries = Array.isArray(parts) ? parts : Object.entries(parts);

    const el = {};              // "file::path" -> { count, attr:{name:Set}, text:Set }
    const connectedFiles = new Set();
    const conns = {};            // file -> { sheets:Set|ALL_SHEETS, types:Set }
    const xl = {
      sheets: {},                // sheetN -> { usedStrings:Set, usedStyles:Set, cellCount, formulas, mergedCells, rawRows:Map<row,Map<col,{shared,raw}>> }
      strings: [],
      styles: new Set(),
      comments: {},
      relationships: {},
      workbookSheets: [],        // workbook order: [{ name, sheetId, rid }]
      definedNames: [],
      calcChain: [],
    };

    const touch = (fn, type, sheets) => {
      connectedFiles.add(fn);
      const c = (conns[fn] ??= { sheets: new Set(), types: new Set() });
      c.types.add(type);
      if (sheets === ALL_SHEETS) c.sheets = ALL_SHEETS;
      else if (c.sheets !== ALL_SHEETS) sheets?.forEach(s => c.sheets.add(s));
    };

    const sheetOf = (fn) => {
      const n = fn.match(/sheet(\d+)\.xml$/)?.[1];
      return n && `sheet${n}`;
    };

    function walkPart(fn, xmlString) {
      let root;
      try {
        const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
        root = doc.documentElement;
        if (!root || doc.getElementsByTagName('parsererror').length) return;
      } catch {
        return;
      }
      (function walk(node, path) {
        const key = `${fn}::${path}`;
        const rec = (el[key] ??= { count: 0, attr: {}, text: new Set() });
        rec.count++;
        for (const name of node.getAttributeNames?.() ?? [])
          (rec.attr[`@${name}`] ??= new Set()).add(node.getAttribute(name));
        if (!node.childElementCount) {
          const s = node.textContent?.trim();
          if (s) rec.text.add(s);
        }
        recordConnections(node, fn, path);
        for (const c of node.children) walk(c, `${path}.${c.nodeName}`);
      })(root, root.nodeName);
    }

    function recordConnections(node, fn, path) {
      if (fn === '[Content_Types].xml') touch(fn, 'content-types', ALL_SHEETS);

      if (fn.includes('.rels')) {
        if (fn.includes('workbook.xml.rels')) touch(fn, 'workbook-rels', ALL_SHEETS);
        else {
          const sn = fn.match(/sheet(\d+)\.xml\.rels/)?.[1];
          if (sn) touch(fn, 'sheet-rels', [`sheet${sn}`]);
          else touch(fn, 'relationships', ALL_SHEETS);
        }
      }

      if (fn.endsWith('workbook.xml')) touch(fn, 'workbook', ALL_SHEETS);

      const sheetName = sheetOf(fn);
      if (sheetName) {
        const sheet = (xl.sheets[sheetName] ??= {
          usedStrings: new Set(), usedStyles: new Set(),
          cellCount: 0, mergedCells: 0, formulas: 0, rawRows: new Map(),
        });
        touch(fn, 'sheet-data', [sheetName]);

        if (node.nodeName === 'row') {
          const rowNum = Number(node.getAttribute('r')) || (sheet.rawRows.size + 1);
          const cols = new Map();
          let nextIdx = 0;
          for (const c of directChildren(node, 'c')) {
            let idx = colIndexFromRef(c.getAttribute('r'));
            if (idx < 0) idx = nextIdx;
            nextIdx = idx + 1;
            // Three value carriers, not one. t="s" indexes sharedStrings and is
            // resolved in finalize(); t="inlineStr" puts the text in <is> and
            // has NO <v> at all, so reading <v> alone silently produced an
            // empty cell (fixed 2026-08-15); everything else is <v>, whether
            // that is a number, a date serial, a boolean, or a formula result.
            const t = c.getAttribute('t');
            const raw = t === 'inlineStr'
              ? inlineText(directChild(c, 'is'))
              : directChild(c, 'v')?.textContent ?? '';
            cols.set(idx, { shared: t === 's', raw });
          }
          sheet.rawRows.set(rowNum, cols);
        }

        if (node.nodeName === 'c' && path.endsWith('sheetData.row.c')) {
          sheet.cellCount++;
          const s = node.getAttribute('s');
          if (s) { sheet.usedStyles.add(s); xl.styles.add(s); }
          if (node.getAttribute('t') === 's') {
            const i = directChild(node, 'v')?.textContent;
            if (i) sheet.usedStrings.add(Number(i));
          }
          if (directChild(node, 'f')) sheet.formulas++;
        }

        if (node.nodeName === 'mergeCell' && path.endsWith('mergeCells.mergeCell')) sheet.mergedCells++;
      }

      if (fn.includes('sharedStrings.xml')) {
        touch(fn, 'shared-strings'); // sheets resolved in finalize(), once every sheet is known
        if (path.endsWith('.si')) {
          const txt = directChild(node, 't')?.textContent;
          if (txt) xl.strings.push(txt);
        }
      }

      if (fn.includes('styles.xml')) touch(fn, 'styles', ALL_SHEETS);
      if (fn.includes('theme')) touch(fn, 'theme', ALL_SHEETS);

      if (fn.includes('comments')) {
        const n = fn.match(/comments(\d+)/)?.[1];
        touch(fn, 'comments', n ? [`sheet${n}`] : ALL_SHEETS);
        if (node.nodeName === 'comment') {
          const ref = node.getAttribute('ref');
          if (ref) (xl.comments[`sheet${n || '1'}`] ??= []).push(ref);
        }
      }

      if (fn.includes('calcChain.xml')) {
        touch(fn, 'calc-chain', ALL_SHEETS);
        if (node.nodeName === 'c') {
          const r = node.getAttribute('r');
          if (r) xl.calcChain.push({ cell: r, sheetIndex: node.getAttribute('i') || '0' });
        }
      }

      if (fn.includes('app.xml') || fn.includes('core.xml'))
        touch(fn, fn.includes('app.xml') ? 'app-properties' : 'core-properties', ALL_SHEETS);

      // The <sheets> element is the ONLY place a sheet's display name and its
      // workbook order live. Everything else in an .xlsx addresses a sheet by
      // part file (sheetN.xml) or by workbook index, and the two are unrelated
      // once a workbook has been reordered or a sheet deleted. Collected here
      // and joined to the part files in finalize(), once the rels are known.
      if (fn.endsWith('workbook.xml') && path.endsWith('sheets.sheet')) {
        xl.workbookSheets.push({
          name: node.getAttribute('name') || '',
          sheetId: node.getAttribute('sheetId') || '',
          // r:id is namespaced; getAttribute wants the qualified name as
          // written, and DOMParser keeps the prefix on a non-namespace-aware
          // read. Fall back to the local name for a document that omits it.
          rid: node.getAttribute('r:id') || node.getAttribute('id') || '',
        });
      }

      if (fn.endsWith('workbook.xml') && path.includes('definedNames.definedName')) {
        const name = node.getAttribute('name');
        if (name) xl.definedNames.push({
          name, sheetId: node.getAttribute('localSheetId') || 'global', reference: node.textContent,
        });
      }

      if (fn.includes('.rels') && node.nodeName === 'Relationship') {
        const target = node.getAttribute('Target'), type = node.getAttribute('Type');
        if (target && type) {
          const owner = fn.replace('/_rels/', '/').replace('.rels', '');
          // `id` rides along because the workbook's <sheet r:id> points at a
          // part through this map and nothing else resolves it.
          (xl.relationships[owner] ??= []).push({ id: node.getAttribute('Id') || '', target, type: type.split('/').pop() });
        }
      }
    }

    for (const [fn, xmlString] of entries) walkPart(fn, xmlString);

    // ---- finalize: cross-file info that needs every part already walked ----
    const connectedPaths = new Set();
    for (const key of Object.keys(el)) {
      if (connectedFiles.has(key.split('::')[0])) connectedPaths.add(key);
    }

    const allSheetNames = Object.keys(xl.sheets).sort();
    for (const c of Object.values(conns)) {
      if (c.sheets === ALL_SHEETS) c.sheets = new Set(allSheetNames);
    }
    const sharedStringsFile = Object.keys(conns).find(fn => fn.includes('sharedStrings.xml'));
    if (sharedStringsFile) {
      const used = allSheetNames.filter(s => xl.sheets[s].usedStrings.size > 0);
      conns[sharedStringsFile].sheets = new Set(used.length ? used : allSheetNames);
    }

    // Give every sheet its display name and its workbook position, which is
    // the join no other part of the file makes. Until 2026-08-15 the kit knew
    // a sheet only as `sheetN` from its part filename and treated N as the
    // workbook index, which is wrong the moment a workbook is reordered or a
    // sheet deleted, and wrong for `localSheetId` and calcChain's `i` always,
    // since both are ZERO-based. Anything the workbook does not claim keeps a
    // null name rather than a guessed one.
    const relsById = Object.fromEntries(
      (xl.relationships['xl/workbook.xml'] || []).filter(r => r.id).map(r => [r.id, r.target]));
    xl.workbookSheets.forEach((ws, index) => {
      // The rels target is relative to xl/, and may be written absolute.
      const target = relsById[ws.rid] || `worksheets/sheet${ws.sheetId}.xml`;
      const key = sheetOf(target.replace(/^\//, ''));
      const sheet = key && xl.sheets[key];
      if (sheet) Object.assign(sheet, { name: ws.name, sheetId: ws.sheetId, index });
    });
    // A workbook with no <sheets> at all (a fragment, a hand-built fixture)
    // falls back to part order, matching what the browser prototypes did.
    if (!xl.workbookSheets.length) {
      allSheetNames.forEach((key, index) =>
        Object.assign(xl.sheets[key], { name: null, sheetId: null, index }));
    } else {
      for (const key of allSheetNames) {
        const s = xl.sheets[key];
        if (s.index === undefined) Object.assign(s, { name: null, sheetId: null, index: null });
      }
    }

    // Resolve shared-string cell values now that xl.strings is complete, and
    // freeze each sheet's rows in row order.
    for (const sheet of Object.values(xl.sheets)) {
      sheet.rows = [...sheet.rawRows.entries()]
        .sort(([a], [b]) => a - b)
        .map(([row, cols]) => ({
          row,
          cells: Object.fromEntries([...cols.entries()].map(([idx, { shared, raw }]) =>
            [idx, shared ? (xl.strings[Number(raw)] ?? '') : raw])),
        }));
      delete sheet.rawRows;
    }

    return { el, connectedPaths, conns, xl };
  }

  // Reconstruct one sheet's rows (xl.sheets[name] from an analyze() result)
  // into row objects keyed by column letter: { Row, A, B, C, ... }. Sparse
  // rows/columns are honored (gaps left absent), not compacted.
  function sheetRows(sheet) {
    return (sheet.rows || []).map(({ row, cells }) => {
      const obj = { Row: row };
      for (const [idx, v] of Object.entries(cells)) obj[colLetter(Number(idx))] = v;
      return obj;
    });
  }

  // ---- views: pure table builders over an analyze() result -----------------

  function pathsView({ el, connectedPaths }) {
    return Object.entries(el).map(([path, data]) => {
      const [file, xmlPath] = path.split('::');
      const features = [
        ...Object.entries(data.attr).map(([a, vs]) => `${a} (${vs.size})`),
        ...(data.text.size ? [`#text (${data.text.size})`] : []),
      ];
      const connected = connectedPaths.has(path);
      return {
        File: file,
        Path: xmlPath,
        Features: features.join(', '),
        Count: data.count,
        Connected: connected ? 'Yes' : 'No',
        'Connection Type': connected ? file.split('/').pop().replace('.xml', '').replace('.rels', '') : '',
      };
    });
  }

  function connectionsView({ xl }) {
    return Object.keys(xl.sheets).sort().map(name => {
      const s = xl.sheets[name];
      // Both `localSheetId` and calc-chain's `i` are ZERO-based workbook-order
      // indices, so they answer to s.index and to nothing derived from the part
      // filename. This used to compare localSheetId against the one-based file
      // number, which could not match, and to match a global name's reference
      // against the string "sheet1!" rather than the sheet's display name, so
      // Named Ranges read 0 for every workbook. Fixed 2026-08-15 with the
      // workbook <sheets> join.
      const idx = s.index == null ? null : String(s.index);
      const namedRanges = idx == null ? 0 : xl.definedNames.filter(d =>
        d.sheetId === idx ||
        (d.sheetId === 'global' && s.name && d.reference?.includes(`${s.name}!`))).length;
      const calcChainCells = idx == null ? 0 : xl.calcChain.filter(c => c.sheetIndex === idx).length;
      return {
        Sheet: name,
        // The name a reader would recognize, kept beside the part key rather
        // than replacing it: the part key is what every other view addresses.
        Name: s.name ?? '',
        Order: s.index == null ? '' : s.index + 1,
        Cells: s.cellCount,
        Strings: s.usedStrings.size,
        'String Ids': [...s.usedStrings].join(', '),
        Styles: s.usedStyles.size,
        Formulas: s.formulas,
        'Merged Cells': s.mergedCells,
        Comments: xl.comments[name]?.length || 0,
        'Named Ranges': namedRanges,
        'Calc Chain': calcChainCells,
      };
    });
  }

  function unconnectedView({ el, connectedPaths }) {
    const category = (file, path) =>
      path?.match(/(?:^|\.)(extLst|ext)(?:\.|$)/)?.[1] ||
      (file.match(/(?:^|\/)xl\/([^/]+)/)?.[1] || file.split('/')[0] || file).replace(/\.\w+$/, '');
    return Object.entries(el)
      .filter(([p]) => !connectedPaths.has(p))
      .map(([p, v]) => {
        const [file, path] = p.split('::');
        return {
          Category: category(file, path),
          File: file,
          Path: path,
          Count: v.count,
          Attributes: Object.keys(v.attr).length,
          'Has Text': v.text.size ? 'Yes' : 'No',
        };
      })
      .sort((a, b) => a.Category.localeCompare(b.Category) || b.Count - a.Count);
  }

  function filesView({ el, connectedPaths, conns }) {
    const byFile = {};
    for (const [key, data] of Object.entries(el)) {
      const fn = key.split('::')[0];
      const f = (byFile[fn] ??= { pathCount: 0, connected: 0, attrs: new Set(), hasText: false });
      f.pathCount++;
      if (connectedPaths.has(key)) f.connected++;
      for (const a of Object.keys(data.attr)) f.attrs.add(a);
      if (data.text.size) f.hasText = true;
    }
    return Object.entries(byFile).map(([fn, stats]) => {
      const info = conns[fn] || { sheets: new Set(), types: new Set() };
      const sheets = [...info.sheets].sort();
      const lower = fn.toLowerCase(); // case-insensitive: real part names are
                                      // mixed-case (sharedStrings.xml, calcChain.xml)
      const category =
        /sheet\d+\.xml$/.test(fn) ? 'Sheet Data' :
        fn === '[Content_Types].xml' ? 'Content Types' :
        /(app\.xml|core\.xml)/.test(fn) ? 'Properties' :
        ['Theme', 'Styles', 'Shared Strings', 'Workbook', 'Comments', 'Calc Chain']
          .find(k => lower.includes(k.replace(' ', '').toLowerCase())) ||
        (fn.includes('.rels') ? 'Relationships' : 'Other');
      return {
        File: fn,
        Category: category,
        Paths: stats.pathCount,
        Connected: stats.connected,
        'Sheets Touched': sheets.join(', '),
        Sheets: sheets.length,
        'Conn Types': [...info.types].join(', ') || 'None',
        'Attr Count': stats.attrs.size,
        Attrs: [...stats.attrs].filter(a => !a.startsWith('@xmlns')).map(a => a.replace(/^@/, '')).join(', '),
        'Has Text': stats.hasText ? 'Yes' : 'No',
      };
    }).sort((a, b) => a.Category.localeCompare(b.Category) || a.File.localeCompare(b.File));
  }

  function summary({ el, connectedPaths }) {
    const total = Object.keys(el).length, connected = connectedPaths.size;
    return { total, connected, unconnected: total - connected, connectedPct: total ? (connected / total) * 100 : 0 };
  }

  async function readZip(input) {
    const ZipLib = await loadZip();
    const zip = await ZipLib.loadAsync(input);
    const parts = await Promise.all(
      Object.entries(zip.files)
        .filter(([path, f]) => !f.dir && /\.(xml|rels)$/.test(path))
        .map(async ([path, f]) => [path, await f.async('string')])
    );
    return analyze(parts);
  }

  window.xlsxKit = {
    readZip,
    analyze,
    views: { paths: pathsView, connections: connectionsView, unconnected: unconnectedView, files: filesView },
    sheetRows,
    summary,
    colLetter,
  };
})();
