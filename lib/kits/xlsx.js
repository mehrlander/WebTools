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

  // 'B7' -> 7. The row half of an A1 reference.
  const rowFromRef = (ref) => Number(/(\d+)\s*$/.exec(ref || '')?.[1]) || 0;

  // 'A1:C3' -> { r1, c1, r2, c2 }, rows 1-based and columns 0-based to match
  // colIndexFromRef. Normalised, since a range may be written either way round.
  const parseRange = (ref) => {
    const [a, b] = String(ref || '').split(':');
    if (!a || !b) return null;
    const r1 = rowFromRef(a), r2 = rowFromRef(b);
    const c1 = colIndexFromRef(a), c2 = colIndexFromRef(b);
    if (!r1 || !r2 || c1 < 0 || c2 < 0) return null;
    return { r1: Math.min(r1, r2), c1: Math.min(c1, c2),
             r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
  };

  // 'FF4472C4' or '4472C4' -> '#4472c4'. An ARGB alpha byte is dropped rather
  // than honoured: Excel writes FF for everything a cell fill or font uses.
  const hexOf = (v) => {
    const s = String(v || '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) return '#' + s.slice(2).toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s.toLowerCase();
    return null;
  };

  const directChildren = (node, name) => [...node.children].filter(c => c.nodeName === name);
  const directChild = (node, name) => directChildren(node, name)[0];

  // A node's tag without its namespace prefix. Every part of a workbook except
  // the theme is written unprefixed, so directChild's nodeName comparison works
  // there; theme1.xml writes `a:clrScheme`, and matching it by the tag as
  // written silently returned nothing. That failure is invisible rather than
  // loud: the theme resolves to an empty palette, every theme-coloured fill
  // becomes null, and a form's gray areas disappear while the text on them
  // still draws. Cost me one round of screenshots to find.
  const tag = (node) => node.localName || String(node.nodeName).replace(/^.*:/, '');
  const kidsNamed = (node, name) => [...(node?.children || [])].filter(c => tag(c) === name);
  const kidNamed = (node, name) => kidsNamed(node, name)[0];

  // 'A1' or 'A1:C3', space-separated, which is how every range list in the
  // format is written: a conditional format's `sqref`, a validation's, a merge.
  const parseSqref = (ref) => String(ref || '').trim().split(/\s+/).filter(Boolean)
    .map(part => part.includes(':') ? parseRange(part) : (() => {
      const r = rowFromRef(part), c = colIndexFromRef(part);
      return r && c >= 0 ? { r1: r, c1: c, r2: r, c2: c } : null;
    })())
    .filter(Boolean);

  const inRange = (ranges, row, col) =>
    ranges.some(r => row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2);

  // Excel escapes a character it cannot write literally as `_xHHHH_`, and a
  // validation prompt written on several lines arrives as `_x000a_`. Left as
  // written it reads as a typo in the middle of OFM's own field instructions.
  const unescapeXlsx = (s) => String(s ?? '')
    .replace(/_x([0-9A-Fa-f]{4})_/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

  // English Metric Units, the measure every drawing offset is written in.
  // 914400 to the inch, so 9525 to a CSS pixel at 96dpi.
  const EMU_PER_PX = 9525;
  const emuToPx = (v) => Math.round((Number(v) || 0) / EMU_PER_PX);

  // A colour as written, resolved in finalize(). `theme` needs the palette and
  // `indexed` needs the legacy table; `rgb` is already an answer but is kept in
  // the same shape so one resolver serves all three.
  const colorSpec = (node) => {
    if (!node) return null;
    const rgb = node.getAttribute('rgb');
    const indexed = node.getAttribute('indexed');
    const theme = node.getAttribute('theme');
    if (rgb == null && indexed == null && theme == null) return null;
    return { rgb, indexed: indexed == null ? null : Number(indexed),
             theme: theme == null ? null : Number(theme), tint: Number(node.getAttribute('tint') || 0) };
  };

  // Text of an <is> (inline string) or an <si> (shared string). A plain one is
  // a single <t>; a rich one splits into <r> runs each carrying its own <t>,
  // and the value is the runs concatenated. Every <t> descendant, in document
  // order, covers both without a special case.
  //
  // Except <rPh>, which is a phonetic hint (furigana over a Japanese reading)
  // and carries its own <t>. It is not part of the value, and concatenating it
  // would interleave a pronunciation guide into the cell.
  const richText = (node) =>
    node ? [...node.getElementsByTagName('t')]
      .filter(t => t.parentNode?.nodeName !== 'rPh')
      .map(t => t.textContent ?? '').join('')
    : '';
  const inlineText = richText;

  // ---- style records, read the same way from <cellXfs>'s tables and from a
  // conditional rule's <dxf> ------------------------------------------------

  function readFont(node) {
    const sz = Number(kidNamed(node, 'sz')?.getAttribute('val'));
    // A dxf writes `<i val="0"/>` to turn italic OFF, so the presence of the
    // element is not the answer; its val is, wherever it has one.
    const on = (name) => {
      const el = kidNamed(node, name);
      if (!el) return false;
      const v = el.getAttribute('val');
      return v == null || v === '1' || v === 'true';
    };
    return {
      bold: on('b'), italic: on('i'), underline: on('u'), strike: on('strike'),
      size: isFinite(sz) && sz > 0 ? sz : 11,
      color: colorSpec(kidNamed(node, 'color')),
      name: kidNamed(node, 'name')?.getAttribute('val') || null,
    };
  }

  // A fill is a pattern, and only `solid` is a flat colour a renderer can
  // reproduce honestly. Excel's default fills are `none` and `gray125`, and
  // both mean "nothing to draw"; the second is the diagonal hatch Excel
  // reserves as fill index 1 and it is never what an author chose. For a solid
  // fill the colour is fgColor, which reads backwards; bgColor on a solid
  // pattern is almost always the meaningless `indexed="64"` sentinel. A
  // DIFFERENTIAL fill, the kind a conditional rule carries, inverts that and
  // takes bgColor: reading fgColor there returns nothing, and the rule then
  // paints no colour while still looking implemented.
  function readFill(node, opts) {
    const p = kidNamed(node, 'patternFill');
    if (!p) return null;
    const pattern = p.getAttribute('patternType') || (opts?.differential ? 'solid' : 'none');
    if (pattern === 'none' || pattern === 'gray125') return null;
    const first = opts?.differential ? 'bgColor' : (pattern === 'solid' ? 'fgColor' : 'bgColor');
    const second = first === 'fgColor' ? 'bgColor' : 'fgColor';
    return colorSpec(kidNamed(p, first)) ?? colorSpec(kidNamed(p, second));
  }

  function readBorder(node) {
    const edge = (side) => {
      const e = kidNamed(node, side);
      const style = e?.getAttribute('style');
      if (!style || style === 'none') return null;
      return { style, color: colorSpec(kidNamed(e, 'color')) };
    };
    return { top: edge('top'), right: edge('right'),
             bottom: edge('bottom'), left: edge('left') };
  }

  const ALL_SHEETS = Symbol('all-sheets'); // placeholder resolved in finalize()

  // parts: [[path, xmlString], ...] or {path: xmlString}. Walk order doesn't
  // matter for correctness — see the module comment above.
  function analyze(parts) {
    const entries = Array.isArray(parts) ? parts : Object.entries(parts);

    const el = {};              // "file::path" -> { count, attr:{name:Set}, text:Set }
    const connectedFiles = new Set();
    const conns = {};            // file -> { sheets:Set|ALL_SHEETS, types:Set }
    const xl = {
      sheets: {},                // sheetN -> { usedStrings:Set, usedStyles:Set, cellCount, formulas, mergedCells, cols, merges, freeze, rawRows:Map<row,{cols,ht,hidden}> }
      strings: [],
      styles: new Set(),
      comments: {},
      relationships: {},
      workbookSheets: [],        // workbook order: [{ name, sheetId, rid }]
      numFmts: {},               // custom format id -> format code
      cellXfs: [],               // cellXfs index -> numFmtId (a cell's `s`)
      date1904: false,           // the workbook's epoch; see serialToDate
      definedNames: [],
      calcChain: [],

      // ---- APPEARANCE, which is everything below and is the half this kit
      // ignored until 2026-09-04. A cell's `s` indexes cellXfs; that entry
      // names a font, a fill, a border and an alignment as well as the number
      // format the kit already read. Without the other four a form drawn by
      // OFM (a title band, a gray input area, a ruled box) reaches a reader as
      // a bare grid of strings, which is what it did.
      //
      // Colours are stored as SPECS here and resolved in finalize(), because a
      // theme colour is defined in theme1.xml and analyze() is deliberately
      // part-order-independent: styles.xml may be walked first. This is the
      // same reason shared-string values resolve there.
      theme: [],                 // theme colour index -> '#rrggbb'
      fonts: [],                 // fontId -> { bold, italic, underline, strike, size, color, name }
      fills: [],                 // fillId -> '#rrggbb' | null (null is "no fill", not white)
      borders: [],               // borderId -> { top, right, bottom, left } of { style, color }
      xfs: [],                   // cellXfs index -> { numFmtId, fontId, fillId, borderId, align… }
      dxfs: [],                  // dxfId -> the differential format a conditional rule applies
      drawings: {},              // drawing part -> [{ from, to, ext, embed, name }]
      media: {},                 // 'xl/media/image1.png' -> data: URI, attached by readZip
      commentAuthors: {},        // comments part -> [author name], authorId is the index
      commentParts: {},          // comments part -> [{ ref, authorId, text }]
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
          // Geometry, which is what makes a sheet a page rather than a list.
          cols: [], merges: [], freeze: null,
          defaultRowHeight: 15, defaultColWidth: null,
          // Three kinds of content the sheet carries beside its cells, each
          // invisible in a value grid: the rules that repaint a cell, the
          // field-level instructions and choice lists OFM attaches to its
          // form inputs, and the drawings anchored over the grid.
          conditionalFormats: [], validations: [], drawingRid: null, images: [],
          commentRid: null, comments: [],
          // The links the sheet carries, resolved in finalize().
          hyperlinks: [],
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
            cols.set(idx, { shared: t === 's', raw, type: t || null, style: c.getAttribute('s') || null });
          }
          // `ht` is the row's own height in points and only counts when the
          // author set one; a row with customHeight off follows the sheet
          // default and must not be pinned to whatever Excel last measured.
          const custom = node.getAttribute('customHeight');
          const ht = Number(node.getAttribute('ht'));
          sheet.rawRows.set(rowNum, {
            cols,
            ht: (custom === '1' || custom === 'true') && isFinite(ht) && ht > 0 ? ht : null,
            hidden: node.getAttribute('hidden') === '1' || node.getAttribute('hidden') === 'true',
          });
        }

        // A <col> covers a RANGE of columns (min..max, both 1-based), so widths
        // are stored as the ranges the file wrote rather than expanded: a sheet
        // may declare one width for columns 5 through 16384 and expanding that
        // is 16k entries for one fact.
        if (node.nodeName === 'col' && path.endsWith('cols.col')) {
          const w = Number(node.getAttribute('width'));
          sheet.cols.push({
            min: Number(node.getAttribute('min')) || 1,
            max: Number(node.getAttribute('max')) || Number(node.getAttribute('min')) || 1,
            width: isFinite(w) && w > 0 ? w : null,
            hidden: node.getAttribute('hidden') === '1' || node.getAttribute('hidden') === 'true',
          });
        }

        if (node.nodeName === 'sheetFormatPr') {
          const rh = Number(node.getAttribute('defaultRowHeight'));
          const cw = Number(node.getAttribute('defaultColWidth'));
          if (isFinite(rh) && rh > 0) sheet.defaultRowHeight = rh;
          if (isFinite(cw) && cw > 0) sheet.defaultColWidth = cw;
        }

        // A RULE THAT REPAINTS A CELL. The ranges live on the parent element
        // and the rule on the child, so both are read here rather than in two
        // passes. `priority` is ascending: 1 outranks 2.
        if (node.nodeName === 'cfRule' && path.endsWith('conditionalFormatting.cfRule')) {
          const owner = node.parentNode;
          sheet.conditionalFormats.push({
            ranges: parseSqref(owner?.getAttribute?.('sqref') || ''),
            type: node.getAttribute('type') || '',
            operator: node.getAttribute('operator') || '',
            dxfId: node.getAttribute('dxfId') == null ? null : Number(node.getAttribute('dxfId')),
            priority: Number(node.getAttribute('priority') || 1e9),
            stopIfTrue: node.getAttribute('stopIfTrue') === '1',
            text: node.getAttribute('text') || '',
            formulas: kidsNamed(node, 'formula').map(f => f.textContent || ''),
          });
        }

        // WHAT A FORM SAYS ABOUT ITS OWN INPUTS, and there are two kinds. A
        // `list` names the choices a cell accepts; a validation with no type
        // at all carries only Excel's input message, the note that appears when
        // you select the cell. OFM's fee form has thirteen of the second kind
        // and every one is a field instruction the reader could not otherwise
        // see ("Enter the four digit fee code from the 2008 Fee Inventory").
        if (node.nodeName === 'dataValidation') {
          sheet.validations.push({
            ranges: parseSqref(node.getAttribute('sqref') || ''),
            type: node.getAttribute('type') || '',
            operator: node.getAttribute('operator') || '',
            promptTitle: unescapeXlsx(node.getAttribute('promptTitle') || ''),
            prompt: unescapeXlsx(node.getAttribute('prompt') || ''),
            formula1: (kidNamed(node, 'formula1')?.textContent || '').trim(),
            formula2: (kidNamed(node, 'formula2')?.textContent || '').trim(),
          });
        }

        // Which drawing part holds this sheet's pictures. Resolved through the
        // sheet's own rels in finalize(), for the same reason the workbook's
        // sheet list is: the rels part may not have been walked yet.
        if (node.nodeName === 'drawing' && path.endsWith('worksheet.drawing')) {
          sheet.drawingRid = node.getAttribute('r:id') ||
            node.getAttributeNS?.('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || null;
        }

        // A sheet points at its comments through <legacyDrawing>, which names
        // the VML shape that draws the little red corner, NOT the comments part
        // itself. The comments part is a plain relationship of the sheet with
        // no element referring to it, so it is found by TYPE in finalize rather
        // than by an r:id anything here carries.
        if (node.nodeName === 'legacyDrawing') sheet.commentRid = 'by-type';

        // A LINK ON A CELL. Excel writes one element per link with the cells it
        // covers and one of two destinations: `r:id`, a relationship of the
        // sheet whose target is the URL (resolved in finalize, since the rels
        // part may not have been walked yet), or `location`, a place in this
        // workbook written as 'Sheet'!A1. A HYPERLINK() formula is neither and
        // is not read here.
        if (node.nodeName === 'hyperlink' && path.endsWith('hyperlinks.hyperlink')) {
          sheet.hyperlinks.push({
            ranges: parseSqref(node.getAttribute('ref') || ''),
            rid: node.getAttribute('r:id') || node.getAttribute('id') || null,
            location: unescapeXlsx(node.getAttribute('location') || '') || null,
            tooltip: unescapeXlsx(node.getAttribute('tooltip') || '') || null,
            href: null,
          });
        }

        // Frozen panes. `state` distinguishes a frozen split from a dragged
        // one, and only the frozen kind is a fact about the document rather
        // than about where somebody left their scrollbar.
        if (node.nodeName === 'pane' && path.endsWith('sheetView.pane')) {
          const state = node.getAttribute('state') || '';
          if (state.startsWith('frozen')) {
            sheet.freeze = { x: Number(node.getAttribute('xSplit') || 0) || 0,
                             y: Number(node.getAttribute('ySplit') || 0) || 0 };
          }
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

        // WHERE the merge is, not only how many there are. The count answers a
        // structural question ("does this sheet merge at all"); a renderer
        // needs the range, and the DP Addendum's 218 of them are most of what
        // makes it read as a form.
        if (node.nodeName === 'mergeCell' && path.endsWith('mergeCells.mergeCell')) {
          sheet.mergedCells++;
          const range = parseRange(node.getAttribute('ref'));
          if (range) sheet.merges.push(range);
        }
      }

      if (fn.includes('sharedStrings.xml')) {
        touch(fn, 'shared-strings'); // sheets resolved in finalize(), once every sheet is known
        // THE INDEX IS THE POSITION, so every <si> pushes exactly once even
        // when it has no text. Two kinds used to be dropped instead, and a
        // dropped entry does not blank one cell: it shifts every string after
        // it by one, so the sheet fills with real text belonging to other
        // cells and nothing looks broken.
        //
        // A RICH <si> is the common one. It holds <r> runs rather than a bare
        // <t>, so the old directChild(node,'t') found nothing. The OFM decision
        // package addendum has 6 rich entries among 163, and read through this
        // kit its form drew "Total Square Feet" where the workbook says
        // "Section One: Current Facility Information and Utilization". Found
        // 2026-09-04 by rendering the sheet and comparing it to Excel, which is
        // the first thing in this estate that could have caught it: a grid of
        // plausible strings in plausible places reads as correct.
        if (path.endsWith('.si')) xl.strings.push(richText(node));
      }

      // A cell's `s` attribute indexes cellXfs, and that entry's numFmtId names
      // a format code: either a custom one declared in <numFmts> or a built-in
      // id with no code written anywhere in the file. Without this join every
      // date is a bare serial and every currency a bare float, which is the one
      // gap in this kit with consequences a reader can see.
      if (fn.includes('styles.xml')) {
        touch(fn, 'styles', ALL_SHEETS);
        if (path.endsWith('numFmts.numFmt')) {
          const id = node.getAttribute('numFmtId');
          if (id) xl.numFmts[id] = node.getAttribute('formatCode') || '';
        }
        // Document order IS the index, so these are pushed as walked.
        if (path.endsWith('cellXfs.xf')) {
          xl.cellXfs.push(node.getAttribute('numFmtId') || '0');
          const al = directChild(node, 'alignment');
          // `applyFill`/`applyBorder`/`applyFont` are Excel's own switches for
          // "use the named record or inherit". Absent means apply, which is
          // why the test is against an explicit '0' rather than for a '1'.
          const off = (name) => { const v = node.getAttribute(name); return v === '0' || v === 'false'; };
          xl.xfs.push({
            numFmtId: node.getAttribute('numFmtId') || '0',
            fontId: Number(node.getAttribute('fontId') || 0) || 0,
            fillId: off('applyFill') ? 0 : Number(node.getAttribute('fillId') || 0) || 0,
            borderId: off('applyBorder') ? 0 : Number(node.getAttribute('borderId') || 0) || 0,
            align: al?.getAttribute('horizontal') || null,
            valign: al?.getAttribute('vertical') || null,
            wrap: al?.getAttribute('wrapText') === '1' || al?.getAttribute('wrapText') === 'true',
            indent: Number(al?.getAttribute('indent') || 0) || 0,
          });
        }

        if (path.endsWith('fonts.font')) xl.fonts.push(readFont(node));
        if (path.endsWith('fills.fill')) xl.fills.push(readFill(node));
        if (path.endsWith('borders.border')) xl.borders.push(readBorder(node));

        // A DIFFERENTIAL format: the font, fill and border a conditional rule
        // applies ON TOP of whatever the cell already has, so every part is
        // optional and an absent one means "leave it alone". Its fill reads
        // the OTHER way round from a normal one, bgColor rather than fgColor,
        // which is the trap: reading fgColor here returns nothing and the rule
        // paints no colour at all while still looking implemented.
        if (path.endsWith('dxfs.dxf')) {
          const font = kidNamed(node, 'font');
          const fill = kidNamed(node, 'fill');
          const border = kidNamed(node, 'border');
          xl.dxfs.push({
            font: font ? readFont(font) : null,
            fill: fill ? readFill(fill, { differential: true }) : null,
            border: border ? readBorder(border) : null,
          });
        }
      }

      // A PICTURE ANCHORED OVER THE GRID. A twoCellAnchor pins both corners to
      // cells and resizes with them; a oneCellAnchor pins the top-left and
      // carries its own extent. Both are read; absoluteAnchor is not, since it
      // positions against the sheet rather than against any cell and there is
      // nothing to attach it to in a table.
      //
      // THE DUPLICATION TRAP: Excel wraps an anchor in <mc:AlternateContent>
      // with the same picture in <mc:Choice> and again in <mc:Fallback>, so a
      // walker that takes every anchor draws the OFM addendum's logo twice,
      // slightly offset. Only the Choice is read.
      if (/^xl\/drawings\/drawing\d+\.xml$/.test(fn)) {
        touch(fn, 'drawing', ALL_SHEETS);
        const kind = tag(node);
        if (kind === 'twoCellAnchor' || kind === 'oneCellAnchor') {
          let inFallback = false;
          for (let p = node.parentNode; p && p.nodeType === 1; p = p.parentNode) {
            if (tag(p) === 'Fallback') { inFallback = true; break; }
          }
          if (!inFallback) {
            const corner = (which) => {
              const c = kidNamed(node, which);
              if (!c) return null;
              return { col: Number(kidNamed(c, 'col')?.textContent || 0) || 0,
                       colOff: Number(kidNamed(c, 'colOff')?.textContent || 0) || 0,
                       row: Number(kidNamed(c, 'row')?.textContent || 0) || 0,
                       rowOff: Number(kidNamed(c, 'rowOff')?.textContent || 0) || 0 };
            };
            const ext = kidNamed(node, 'ext');
            // The blip's r:embed points at the media part through the DRAWING's
            // own rels, not the sheet's.
            const blip = [...node.getElementsByTagName('*')].find(e => tag(e) === 'blip');
            const embed = blip && (blip.getAttribute('r:embed') ||
              blip.getAttributeNS?.('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
            const nv = [...node.getElementsByTagName('*')].find(e => tag(e) === 'cNvPr');
            if (embed) {
              (xl.drawings[fn] ??= []).push({
                from: corner('from'), to: corner('to'),
                ext: ext ? { cx: Number(ext.getAttribute('cx') || 0), cy: Number(ext.getAttribute('cy') || 0) } : null,
                embed, name: nv?.getAttribute('name') || nv?.getAttribute('descr') || '',
              });
            }
          }
        }
      }

      if (fn.includes('theme')) {
        touch(fn, 'theme', ALL_SHEETS);
        // The palette a `theme="N"` colour indexes, in <clrScheme> order, with
        // one correction: the scheme writes dk1, lt1, dk2, lt2 and Excel's
        // indices are lt1, dk1, lt2, dk2, so the first two pairs swap. Getting
        // that backwards turns a white title on a dark band into black on
        // white, which reads as plausible and is wrong.
        if (tag(node) === 'clrScheme') {
          xl.theme = [...node.children].map(entry => {
            const c = entry.firstElementChild;
            if (!c) return null;
            return tag(c) === 'sysClr'
              ? hexOf(c.getAttribute('lastClr'))
              : hexOf(c.getAttribute('val'));
          });
          const t = xl.theme;
          if (t.length >= 4) xl.theme = [t[1], t[0], t[3], t[2], ...t.slice(4)];
        }
      }

      // A COMMENT IS A NOTE SOMEBODY LEFT ON A CELL, and in these workbooks it
      // is where OFM's own staff wrote the hint that does not fit on the form.
      // The kit counted them and read no text until 2026-09-04.
      //
      // Two things make the part hard to place. Its number is its own, not the
      // sheet's: comments1.xml can belong to sheet5. And the text is a run
      // sequence, whose first run is conventionally the author's name with a
      // colon, which Excel adds and a reader does not want repeated beside the
      // author field. The join is done in finalize; here the parts are read.
      if (/comments\d*\.xml$/.test(fn) && !/threaded/i.test(fn)) {
        const n = fn.match(/comments(\d+)/)?.[1];
        touch(fn, 'comments', n ? [`sheet${n}`] : ALL_SHEETS);
        if (node.nodeName === 'author') {
          (xl.commentAuthors[fn] ??= []).push(node.textContent || '');
        }
        if (node.nodeName === 'comment') {
          const ref = node.getAttribute('ref');
          if (ref) {
            (xl.comments[`sheet${n || '1'}`] ??= []).push(ref);
            (xl.commentParts[fn] ??= []).push({
              ref,
              authorId: Number(node.getAttribute('authorId') || 0) || 0,
              text: richText(kidNamed(node, 'text')),
            });
          }
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
      // The 1904 epoch is a workbook-wide switch, off by default, and getting it
      // wrong shifts every date by four years and a day rather than failing.
      if (fn.endsWith('workbook.xml') && path.endsWith('workbookPr')) {
        const d = node.getAttribute('date1904');
        if (d === '1' || d === 'true') xl.date1904 = true;
      }

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
        .map(([row, { cols, ht, hidden }]) => ({
          row,
          height: ht,
          hidden,
          cells: Object.fromEntries([...cols.entries()].map(([idx, { shared, raw }]) =>
            [idx, shared ? (xl.strings[Number(raw)] ?? '') : raw])),
          // Parallel to `cells` rather than folded into it, so the existing
          // shape is untouched and a consumer that does not care about formats
          // pays nothing. Only cells carrying an `s` appear.
          styles: Object.fromEntries([...cols.entries()]
            .filter(([, c]) => c.style != null).map(([idx, c]) => [idx, c.style])),
          // Likewise for the `t` attribute, which is what separates a number
          // from a string of digits and therefore decides how a cell aligns.
          types: Object.fromEntries([...cols.entries()]
            .filter(([, c]) => c.type != null).map(([idx, c]) => [idx, c.type])),
        }));
      delete sheet.rawRows;
    }

    // Colours last, because a theme colour needs theme1.xml and analyze() does
    // not promise it was walked first. Every spec collected during the walk
    // resolves here, once, against the finished palette.
    const paint = (spec) => resolveColor(spec, xl.theme);
    const paintBorder = (b) => b && Object.fromEntries(
      Object.entries(b).map(([side, e]) => [side, e && { style: e.style, color: paint(e.color) || '#000000' }]));
    xl.fonts = xl.fonts.map(f => ({ ...f, color: paint(f.color) }));
    xl.fills = xl.fills.map(paint);
    xl.borders = xl.borders.map(paintBorder);
    xl.dxfs = xl.dxfs.map(d => ({
      font: d.font ? { ...d.font, color: paint(d.font.color) } : null,
      fill: paint(d.fill),
      border: paintBorder(d.border),
    }));

    // Each sheet's pictures, joined through the sheet's own rels to the drawing
    // part and through THAT part's rels to the media. Two hops, and the second
    // is the one worth naming: a blip's r:embed is scoped to the drawing, so
    // resolving it against the sheet's rels finds the wrong part or none.
    for (const [key, sheet] of Object.entries(xl.sheets)) {
      if (!sheet.drawingRid) continue;
      const sheetPart = `xl/worksheets/${key}.xml`;
      const target = (xl.relationships[sheetPart] || []).find(r => r.id === sheet.drawingRid)?.target;
      if (!target) continue;
      const drawingPart = normalizePath('xl/worksheets/', target);
      const media = Object.fromEntries(
        (xl.relationships[drawingPart] || []).map(r => [r.id, normalizePath(drawingPart, r.target)]));
      sheet.images = (xl.drawings[drawingPart] || [])
        .map(a => ({ ...a, part: media[a.embed] || null }))
        .filter(a => a.part && a.from);
    }

    // A sheet's comments, found BY TYPE among its relationships. Nothing in the
    // sheet XML names the comments part: <legacyDrawing> points at the VML that
    // draws the red corner, and the comments themselves ride a relationship
    // with no referring element. Matching on the part name rather than on the
    // relationship type, which arrives with a full schema URL, keeps this from
    // depending on how the writer spelled it.
    for (const [key, sheet] of Object.entries(xl.sheets)) {
      const rels = xl.relationships[`xl/worksheets/${key}.xml`] || [];
      const rel = rels.find(r => /comments\d*\.xml$/i.test(r.target || '') && !/threaded/i.test(r.target));
      if (!rel) continue;
      const part = normalizePath(`xl/worksheets/`, rel.target);
      const authors = xl.commentAuthors[part] || [];
      sheet.comments = (xl.commentParts[part] || []).map(c => ({
        ref: c.ref,
        author: authors[c.authorId] || '',
        // Excel writes the author's name as the first run followed by a colon
        // and a newline. It is the same string the author field already
        // carries, so a reader shown both sees it twice; dropped here rather
        // than at the render, since every consumer would otherwise repeat it.
        text: stripAuthorPrefix(c.text, authors[c.authorId] || ''),
      }));
    }

    // A link's URL lives in the sheet's rels, keyed by the r:id the element
    // carries; a `location` link needs no join.
    for (const [key, sheet] of Object.entries(xl.sheets)) {
      if (!sheet.hyperlinks?.length) continue;
      const rels = xl.relationships[`xl/worksheets/${key}.xml`] || [];
      for (const h of sheet.hyperlinks) {
        if (h.rid) h.href = rels.find(r => r.id === h.rid && r.type === 'hyperlink')?.target || null;
      }
    }

    return { el, connectedPaths, conns, xl };
  }

  // The author's name, off the front of a comment's own text. Excel writes
  // "Name:\n" as the first run; a comment somebody typed without that prefix is
  // left exactly as written, which is why this matches rather than slices.
  function stripAuthorPrefix(text, author) {
    const t = String(text || '');
    if (!author) return t.trim();
    const head = author + ':';
    if (!t.startsWith(head)) return t.trim();
    return t.slice(head.length).replace(/^[\s\r\n]+/, '').trim();
  }

  // A rels target is relative to its owner's directory and may be written with
  // a leading slash or with `../` hops, neither of which a zip entry name has.
  function normalizePath(from, target) {
    const t = String(target || '');
    if (t.startsWith('/')) return t.slice(1);
    const base = from.endsWith('/') ? from : from.slice(0, from.lastIndexOf('/') + 1);
    const out = [];
    for (const seg of (base + t).split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') out.pop();
      else out.push(seg);
    }
    return out.join('/');
  }

  // ---- colour -------------------------------------------------------------

  // Excel's legacy indexed palette. Only the first 24 entries and the two
  // sentinels matter in practice: 64 is "automatic" (the window's own text or
  // background colour, so no answer of ours) and 65 is the window background.
  const INDEXED_COLORS = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
    '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#c0c0c0', '#808080',
  ];

  // A tint lightens (positive) or darkens (negative) a theme colour. Excel
  // applies it in HSL luminance; the linear approximation below is within a
  // couple of levels for the shades a workbook actually uses, which are the
  // -0.15 and -0.35 grays every OFM form is banded with.
  function applyTint(hex, tint) {
    if (!hex || !tint) return hex;
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const shift = (c) => tint < 0 ? Math.round(c * (1 + tint)) : Math.round(c + (255 - c) * tint);
    return '#' + ch.map(c => shift(c).toString(16).padStart(2, '0')).join('');
  }

  // A colour spec to '#rrggbb', or null where the file declines to say. Null is
  // not white: a cell with no fill shows whatever is behind it, and painting
  // that white would erase a banded row underneath a merge.
  function resolveColor(spec, theme) {
    if (!spec) return null;
    if (spec.rgb) return hexOf(spec.rgb);
    if (spec.indexed != null) return INDEXED_COLORS[spec.indexed] || null;
    if (spec.theme != null) return applyTint((theme || [])[spec.theme] || null, spec.tint);
    return null;
  }

  // ---- number formats ----------------------------------------------------
  //
  // Excel writes no format code for its built-in ids, so a reader has to carry
  // them. Only the ids that change how a value READS are listed: the rest are
  // decimal-place and thousands-separator variants that leave a number a
  // number, and guessing at their exact codes would add nothing.
  // Every built-in id now, not only the ones that change a value's KIND. The
  // list grew on 2026-09-04 with formatValue: a code like `#,##0` used to be
  // classified `number` and printed raw, so the id behind it was not worth
  // carrying. Now that the code is applied, `1234.5` under id 3 is `1,235` and
  // the code has to be there to say so. Ids 5 to 8 and 41 to 44 are the
  // currency and accounting pairs, written out because their negative and
  // zero sections are what make an accounting column line up.
  const BUILTIN_NUMFMT = {
    0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
    5: '"$"#,##0_);("$"#,##0)', 6: '"$"#,##0_);[Red]("$"#,##0)',
    7: '"$"#,##0.00_);("$"#,##0.00)', 8: '"$"#,##0.00_);[Red]("$"#,##0.00)',
    9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
    14: 'mm-dd-yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
    18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
    22: 'm/d/yy h:mm',
    37: '#,##0_);(#,##0)', 38: '#,##0_);[Red](#,##0)',
    39: '#,##0.00_);(#,##0.00)', 40: '#,##0.00_);[Red](#,##0.00)',
    41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)',
    42: '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
    43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)',
    44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
    45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0',
    49: '@',
  };
  // The built-in currency and accounting ids, which carry a symbol we do not
  // reproduce; naming them as currency is the useful part.
  const BUILTIN_CURRENCY = new Set([5, 6, 7, 8, 37, 38, 39, 40, 41, 42, 43, 44]);

  // What a format code MEANS, which is all a reader needs to decide how to
  // print a value. Literal text in quotes and the bracketed sections (colours,
  // conditions, [h] elapsed hours) are skipped first, since a code like
  // `"day "0` would otherwise read as a date on its `d`.
  function formatKind(code, numFmtId) {
    if (code == null) return 'general';
    if (code === 'General' || code === '') return 'general';
    if (code === '@') return 'text';
    const id = Number(numFmtId);
    // An elapsed-time code is a duration, not a clock reading, and printing it
    // as a time of day would be wrong rather than merely ugly.
    if (/\[[hms]+\]/i.test(code)) return 'duration';
    const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    const section = bare.split(';')[0];
    const hasDate = /[yd]/i.test(section);
    // `m` is month or minute depending on neighbours, so it is never the sole
    // evidence for a date; `s` and `h` are unambiguous.
    const hasTime = /[hs]/i.test(section);
    if (hasDate && hasTime) return 'datetime';
    if (hasDate) return 'date';
    if (hasTime) return 'time';
    if (section.includes('%')) return 'percent';
    if (BUILTIN_CURRENCY.has(id) || /[$€£¥]/.test(section)) return 'currency';
    return 'number';
  }

  // The format a cell's `s` resolves to. Returns null for a cell with no style,
  // which is the common case and is not the same as a General style.
  function cellFormat(xl, styleIndex) {
    if (styleIndex == null) return null;
    const numFmtId = xl.cellXfs[Number(styleIndex)];
    if (numFmtId == null) return null;
    const code = xl.numFmts[numFmtId] ?? BUILTIN_NUMFMT[Number(numFmtId)] ?? null;
    return { numFmtId, code, kind: formatKind(code, numFmtId) };
  }

  // An Excel serial to a Date, in UTC.
  //
  // 25569 is the serial for 1970-01-01, so the subtraction lands on the JS
  // epoch directly. The correction below it is the famous one: Excel counts a
  // 1900-02-29 that never existed, deliberately, to stay compatible with Lotus
  // 1-2-3. Serials at or below 59 sit before that phantom day and are one short
  // of the linear count; from 61 the two agree again. Serial 60 IS the phantom
  // day and has no correct answer, so it lands on 1900-02-28.
  function serialToDate(serial, date1904) {
    const n = Number(serial);
    if (!isFinite(n)) return null;
    const shifted = date1904 ? n + 1462 : n;
    const ms = (shifted - 25569) * 86400000;
    return new Date(ms + (!date1904 && n < 60 ? 86400000 : 0));
  }

  const pad = (n, w = 2) => String(n).padStart(w, '0');

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // A private-use sentinel standing in for literal text while the numeric part
  // of a code is substituted. It has to be a character no format code and no
  // value can contain, which rules out the obvious ASCII choices.
  const LIT = '';

  // WHICH SECTION OF A CODE APPLIES. A format is up to four sections separated
  // by semicolons: positive, negative, zero, text. Two sections mean the second
  // is for negatives; one means it covers everything. A negative under a code
  // with its own negative section is printed WITHOUT a minus sign, because the
  // section supplies the notation, which is how `(1,234)` accounting columns
  // work and why prefixing a minus there would print `-(1,234)`.
  function pickSection(code, n) {
    const parts = String(code).split(';');
    if (n < 0 && parts.length > 1) return { code: parts[1], signed: false };
    if (n === 0 && parts.length > 2) return { code: parts[2], signed: false };
    return { code: parts[0], signed: n < 0 };
  }

  // One section applied to one number. The grammar handled: `0` and `#` digit
  // places, `.` decimals, `,` grouping, `%` (which scales by 100), `"…"` and
  // `\x` literals, `[…]` conditions and colours (skipped), `_x` width padding
  // (dropped, since a browser has no fixed-width space to pad with) and `*x`
  // repeat-fill (dropped for the same reason). Scientific and fraction codes
  // are NOT interpreted; they fall through to the plain number, which is
  // honest rather than wrong.
  function applyNumberCode(section, value) {
    let code = section
      .replace(/\[[^\]]*\]/g, '')      // [Red], [$-409], conditions
      .replace(/_./g, '')              // width padding
      .replace(/\*./g, '');            // repeat fill
    const literals = [];
    code = code.replace(/"([^"]*)"/g, (_, text) => { literals.push(text); return LIT; })
               .replace(/\\(.)/g, (_, ch) => { literals.push(ch); return LIT; });

    let n = value;
    if (code.includes('%')) n = n * 100;
    // Each trailing comma before the decimal point scales down by a thousand.
    const scale = /([,]+)(?=(\.|$|[^0#?,]))/.exec(code.replace(/[^0#?,.]/g, ''));
    const numeric = code.match(/[0#?][0#?,]*(\.[0#?]*)?|\.[0#?]+/);
    if (!numeric) return { text: code.split(LIT).map((p, i) => (i ? literals[i - 1] : '') + p).join(''), plain: false };
    const mask = numeric[0];
    const [intMask, decMask = ''] = mask.split('.');
    const grouped = intMask.includes(',');
    const decimals = decMask.replace(/[^0#?]/g, '').length;
    const minInt = (intMask.replace(/,/g, '').match(/0/g) || []).length;
    if (scale && scale[1] && !grouped) n = n / Math.pow(1000, scale[1].length);

    let body = Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      minimumIntegerDigits: Math.max(minInt, 1), useGrouping: grouped,
    });
    // `#` before the point means "no digit here if there is nothing to show",
    // which is what makes `#.##` print `.5` rather than `0.5`.
    if (minInt === 0 && Math.abs(n) < 1 && body.startsWith('0')) body = body.slice(1);
    const out = code.replace(mask, body);
    return { text: out.split(LIT).map((p, i) => (i ? literals[i - 1] : '') + p).join('').trim(), plain: false };
  }

  // One section applied to one date. Tokenised first and substituted second,
  // so a replacement's own letters cannot be re-read: replacing `mmm` with
  // `September` and then scanning for `d` would find the `e`, and then the `p`.
  //
  // `m` IS THE ONLY REAL AMBIGUITY IN THE GRAMMAR: month, or minute. Excel
  // reads it as minutes when it sits next to an hour or a seconds token, and
  // as a month otherwise. The neighbour that decides it is the previous or
  // next DATE-LETTER token, not the previous character. Reading the character
  // instead is a bug that hides well: in `m/d/yy h:mm` the token before the
  // final `mm` is a colon, so the rule missed the `h` behind it and printed
  // the month, which under a March date drew 12:03 for noon exactly.
  function applyDateCode(section, date) {
    const code = section.replace(/\[[^\]]*\]/g, '');
    const ampm = /AM\/PM|A\/P/i.test(code);
    let h = date.getUTCHours();
    const meridiem = h < 12 ? 'AM' : 'PM';
    if (ampm) h = (h % 12) || 12;

    const token = /AM\/PM|A\/P|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|"[^"]*"|\\.|./gi;
    const parts = [...code.matchAll(token)].map(([t]) => ({ t, low: t.toLowerCase() }));
    const isLetter = (p) => /^(yy|yyyy|m{1,5}|d{1,4}|hh?|ss?)$/.test(p.low);
    const neighbour = (i, step) => {
      for (let j = i + step; j >= 0 && j < parts.length; j += step) {
        if (isLetter(parts[j])) return parts[j].low;
      }
      return '';
    };

    let out = '';
    parts.forEach((p, i) => {
      const { t, low } = p;
      if (t.startsWith('"')) { out += t.slice(1, -1); return; }
      if (t.startsWith('\\')) { out += t.slice(1); return; }
      if (low === 'am/pm') { out += meridiem; return; }
      if (low === 'a/p') { out += meridiem[0]; return; }
      if (low === 'yyyy') { out += date.getUTCFullYear(); return; }
      if (low === 'yy') { out += pad(date.getUTCFullYear() % 100); return; }
      if (low === 'dddd') { out += DAYS[date.getUTCDay()]; return; }
      if (low === 'ddd') { out += DAYS[date.getUTCDay()].slice(0, 3); return; }
      if (low === 'dd') { out += pad(date.getUTCDate()); return; }
      if (low === 'd') { out += date.getUTCDate(); return; }
      if (low === 'hh') { out += pad(h); return; }
      if (low === 'h') { out += h; return; }
      if (low === 'ss') { out += pad(date.getUTCSeconds()); return; }
      if (low === 's') { out += date.getUTCSeconds(); return; }
      if (low === 'mmmmm') { out += MONTHS[date.getUTCMonth()][0]; return; }
      if (low === 'mmmm') { out += MONTHS[date.getUTCMonth()]; return; }
      if (low === 'mmm') { out += MONTHS[date.getUTCMonth()].slice(0, 3); return; }
      if (low === 'mm' || low === 'm') {
        const before = neighbour(i, -1), after = neighbour(i, 1);
        const minutes = before === 'h' || before === 'hh' || after === 's' || after === 'ss';
        const v = minutes ? date.getUTCMinutes() : date.getUTCMonth() + 1;
        out += low === 'mm' ? pad(v) : v;
        return;
      }
      out += t;
    });
    return out.trim();
  }

  // A cell's value printed the way its format says to read it.
  //
  // Until 2026-09-04 this decided the KIND of a value and printed that plainly,
  // on the argument that reproducing Excel's glyphs meant implementing the
  // whole format grammar. The consequence was that every number and every
  // currency fell through to `String(raw)`: an accounting cell read `1234.5`
  // where the workbook showed `$1,234.50`, which is the single loudest way a
  // rendered sheet says "this is not your spreadsheet". The subset above is
  // the answer, and it is a subset on purpose. What it does not interpret
  // (scientific notation, fractions, conditional sections) falls through to a
  // plain number rather than to an approximation.
  //
  // A ROUNDED VALUE IS WHAT EXCEL DRAWS AND IS NOT THE WHOLE TRUTH. `0%` on
  // 0.125 is `13%` here, as it is in the workbook. Callers that need the stored
  // value have it: it is the `raw` passed in, and the sheet renderer carries it
  // as each cell's tooltip for exactly this reason.
  function formatValue(raw, format, date1904) {
    const kind = format?.kind;
    if (raw === '' || raw == null) return '';
    if (!kind || kind === 'general' || kind === 'text') return String(raw);
    const n = Number(raw);
    if (!isFinite(n)) return String(raw);

    if (kind === 'duration') {
      const total = Math.round(Math.abs(n) * 86400);
      const sign = n < 0 ? '-' : '';
      return `${sign}${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
    }

    const code = format?.code;
    if (kind === 'date' || kind === 'time' || kind === 'datetime') {
      const d = serialToDate(n, date1904);
      if (!d || isNaN(d)) return String(raw);
      if (code) {
        const drawn = applyDateCode(pickSection(code, n).code, d, date1904);
        if (drawn) return drawn;
      }
      // No code to follow, so ISO, which is unambiguous where a guess is not.
      const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      return kind === 'date' ? date : kind === 'time' ? time : `${date} ${time}`;
    }

    if (!code) return String(raw);
    const section = pickSection(code, n);
    const drawn = applyNumberCode(section.code, n);
    if (!drawn.text) return String(raw);
    return (section.signed && !drawn.text.startsWith('-') ? '-' : '') + drawn.text;
  }

  // Reconstruct one sheet's rows (xl.sheets[name] from an analyze() result)
  // into row objects keyed by column letter: { Row, A, B, C, ... }. Sparse
  // rows/columns are honored (gaps left absent), not compacted.
  //
  // Pass the analyze() result's `xl` as the second argument to get values read
  // through their number format: dates as ISO rather than as five-digit
  // serials. Omitting it keeps the raw behaviour, which is what every existing
  // caller wants and what a structural inspection should show.
  function sheetRows(sheet, xl) {
    return (sheet.rows || []).map(({ row, cells, styles }) => {
      const obj = { Row: row };
      for (const [idx, v] of Object.entries(cells)) {
        obj[colLetter(Number(idx))] = xl
          ? formatValue(v, cellFormat(xl, styles?.[idx]), xl.date1904)
          : v;
      }
      return obj;
    });
  }

  // ---- layout: a sheet as a page ------------------------------------------
  //
  // sheetRows() answers "what values are in this sheet", which is the right
  // question for a data grid and the wrong one for a form. sheetLayout()
  // answers "what does this sheet LOOK like": every cell in its own place,
  // merges resolved to spans, columns at the widths the author set, rows at
  // their heights, and a style index per cell for the caller to paint with.
  //
  // Still no DOM and no CSS. The caller turns a style record into whatever it
  // draws with, which is what keeps this kit testable in node and reusable by
  // anything that is not the viewer.

  // Excel's column width is measured in characters of the default font. The
  // conversion below is the documented one for an 11pt Calibri "0" glyph of 7
  // pixels: width * 7 rounded, plus the 5px of cell padding Excel adds. It is
  // approximate by construction, since the browser is not laying out Calibri
  // at Excel's metrics, and it is much closer than fitting to content.
  const widthToPx = (chars) => Math.round(chars * 7) + 5;
  const heightToPx = (points) => Math.round(points * 4 / 3);

  const DEFAULT_COL_WIDTH = 8.43;

  // A cell's resolved appearance: the four style records its `s` names, joined
  // and flattened. Returns null for a cell with no style at all, which is the
  // common case and is cheaper than a record of nulls.
  function cellStyle(xl, styleIndex) {
    if (styleIndex == null || styleIndex === '') return null;
    const xf = xl.xfs?.[Number(styleIndex)];
    if (!xf) return null;
    const font = xl.fonts?.[xf.fontId] || null;
    const border = xl.borders?.[xf.borderId] || null;
    return {
      bold: !!font?.bold, italic: !!font?.italic, underline: !!font?.underline,
      strike: !!font?.strike,
      size: font?.size ?? 11, color: font?.color || null, fontName: font?.name || null,
      fill: xl.fills?.[xf.fillId] || null,
      border: border && (border.top || border.right || border.bottom || border.left) ? border : null,
      align: xf.align || null, valign: xf.valign || null,
      wrap: !!xf.wrap, indent: xf.indent || 0,
      format: cellFormat(xl, styleIndex),
    };
  }

  // ---- conditional formats ------------------------------------------------
  //
  // WHAT IS EVALUATED AND WHAT IS NOT, because the split is the honest part.
  // A `cellIs` rule compares the cell to constants and a text rule matches a
  // literal, so both are decidable from the cell alone. An `expression` rule is
  // a formula, and evaluating one means a formula engine: cell references,
  // relative-address rewriting per cell of the range, and Excel's function
  // library. Those are SKIPPED and counted, never guessed, since a rule applied
  // wrongly is worse than a rule not applied. Across the OFM workbooks the
  // split is 6 decidable rules to 29 expressions, so a caller that cares can
  // read `cfSkipped` off the layout and say so.

  const asNumber = (formula) => {
    const t = String(formula ?? '').trim().replace(/^=/, '');
    // A quoted string, a reference or a call is not a constant this can use.
    if (!/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return null;
    return Number(t);
  };
  const asText = (formula) => {
    const t = String(formula ?? '').trim().replace(/^=/, '');
    const m = /^"(.*)"$/s.exec(t);
    return m ? m[1] : null;
  };

  const CF_COMPARE = {
    equal: (a, b) => a === b, notEqual: (a, b) => a !== b,
    greaterThan: (a, b) => a > b, greaterThanOrEqual: (a, b) => a >= b,
    lessThan: (a, b) => a < b, lessThanOrEqual: (a, b) => a <= b,
  };

  // Does this rule fire on this cell? `null` means the rule is one this kit
  // does not decide, which the caller counts rather than treats as false.
  function cfApplies(rule, cell) {
    const text = String(cell?.text ?? '');
    // `raw` carries the stored value only where the DRAWN one differs from it,
    // so a plain number has none and its own text is the stored value. Reading
    // `raw` alone made every unformatted cell look non-numeric, and a numeric
    // rule then declined to decide on exactly the cells it was written for.
    const raw = cell?.raw ?? text;
    switch (rule.type) {
      case 'containsBlanks': return text === '';
      case 'notContainsBlanks': return text !== '';
      case 'containsText': return !!rule.text && text.includes(rule.text);
      case 'notContainsText': return !rule.text || !text.includes(rule.text);
      case 'beginsWith': return !!rule.text && text.startsWith(rule.text);
      case 'endsWith': return !!rule.text && text.endsWith(rule.text);
      case 'cellIs': {
        const value = Number(raw);
        const numeric = raw !== '' && isFinite(value);
        if (rule.operator === 'between' || rule.operator === 'notBetween') {
          const lo = asNumber(rule.formulas[0]), hi = asNumber(rule.formulas[1]);
          if (lo == null || hi == null || !numeric) return null;
          const within = value >= Math.min(lo, hi) && value <= Math.max(lo, hi);
          return rule.operator === 'between' ? within : !within;
        }
        const compare = CF_COMPARE[rule.operator];
        if (!compare) return null;
        const n = asNumber(rule.formulas[0]);
        if (n != null) return numeric ? compare(value, n) : null;
        const s = asText(rule.formulas[0]);
        return s != null ? compare(text, s) : null;
      }
      default: return null;   // expression, colorScale, dataBar, iconSet, top10…
    }
  }

  // A dxf as the same record shape cellStyle returns, so one renderer path
  // paints both. Every field is optional here: a conditional format that only
  // sets a fill must leave the cell's own font alone, so an absent part comes
  // back undefined rather than as a default that would overwrite it.
  function dxfStyle(xl, dxfId) {
    const d = xl?.dxfs?.[Number(dxfId)];
    if (!d) return null;
    const out = {};
    if (d.font) {
      if (d.font.bold) out.bold = true;
      if (d.font.italic) out.italic = true;
      if (d.font.underline) out.underline = true;
      if (d.font.strike) out.strike = true;
      if (d.font.color) out.color = d.font.color;
    }
    if (d.fill) out.fill = d.fill;
    if (d.border && (d.border.top || d.border.right || d.border.bottom || d.border.left)) {
      out.border = d.border;
    }
    return Object.keys(out).length ? out : null;
  }

  // Rows and columns as drawn, capped. The caps are not a nicety: the fee-code
  // reference in home's submittal set is 94,000 value cells, and one element
  // per cell is a page that takes seconds to lay out and megabytes to hold.
  // Past the cap the layout stops and SAYS SO in `truncated`, so the caller can
  // offer the grid rather than quietly showing a third of a sheet.
  // Each drawn cell a hyperlink covers gets `link: { href, location, tooltip }`.
  // A link with neither destination (an unresolved r:id) marks nothing, since
  // a cell drawn as a link that goes nowhere is worse than plain text. Where
  // two links cover one cell the LATER one wins: OFM's DP addendum carries a
  // stale single-cell link under a newer range link on A50, and the newer
  // one's `display` is the text the cell shows.
  function markLinks(out, sheet) {
    const links = (sheet?.hyperlinks || []).filter(h => h.href || h.location).reverse();
    if (!links.length) return;
    for (const row of out) for (const c of row.cells) {
      const h = links.find(h => h.ranges.some(r =>
        row.row >= r.r1 && row.row <= r.r2 && c.col >= r.c1 && c.col <= r.c2));
      if (h) c.link = { href: h.href, location: h.location, tooltip: h.tooltip };
    }
  }

  function sheetLayout(sheet, xl, opts) {
    const maxCells = opts?.maxCells ?? 30000;
    const maxRows = opts?.maxRows ?? 2000;
    const rows = sheet?.rows || [];
    const merges = sheet?.merges || [];

    // The drawn range covers the ANCHORS too, not only the cells. A picture on
    // an otherwise empty sheet is the whole content of that sheet, and stopping
    // at the last row that holds a value drops it: the capital Major Project
    // report keeps its photographs on a "Photo Gallery" tab with one text cell
    // and fifteen pictures below it.
    const anchored = sheet?.images || [];
    const lastRow = Math.max(0, ...rows.map(r => r.row),
      ...anchored.map(a => (a.to?.row ?? a.from.row) + 1));
    const lastCol = Math.max(-1,
      ...rows.flatMap(r => Object.keys(r.cells).map(Number)),
      ...merges.map(m => m.c2),
      ...anchored.map(a => a.to?.col ?? a.from.col));
    if (lastRow < 1 || lastCol < 0) {
      return { cols: [], rows: [], maxCol: -1, freeze: null, truncated: null,
               images: [], cfSkipped: 0, empty: true };
    }

    // Merge anchors carry the span; every other cell the merge covers is
    // skipped, since a covered cell in an .xlsx still exists and still carries
    // a style, and emitting it would push the row one column right per merge.
    const anchors = new Map();
    const covered = new Set();
    for (const m of merges) {
      anchors.set(`${m.r1}:${m.c1}`, { cols: m.c2 - m.c1 + 1, rows: m.r2 - m.r1 + 1 });
      for (let r = m.r1; r <= m.r2; r++) {
        for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(`${r}:${c}`);
      }
    }

    const colWidth = (i) => {
      const spec = (sheet.cols || []).find(c => i + 1 >= c.min && i + 1 <= c.max);
      if (spec?.hidden) return 0;
      return widthToPx(spec?.width ?? sheet.defaultColWidth ?? DEFAULT_COL_WIDTH);
    };
    const cols = Array.from({ length: lastCol + 1 }, (_, i) => ({ index: i, width: colWidth(i) }));

    const byRow = new Map(rows.map(r => [r.row, r]));
    const out = [];
    let cells = 0, truncated = null;
    for (let n = 1; n <= lastRow; n++) {
      if (out.length >= maxRows || cells >= maxCells) {
        truncated = { fromRow: n, lastRow, reason: out.length >= maxRows ? 'rows' : 'cells' };
        break;
      }
      const row = byRow.get(n);
      // A row the file never wrote is still a row on screen, and skipping it
      // would slide every row number below it out of line with the gutter.
      if (row?.hidden) continue;
      const emitted = [];
      for (let c = 0; c <= lastCol; c++) {
        if (covered.has(`${n}:${c}`)) continue;
        const raw = row?.cells?.[c];
        const styleIndex = row?.styles?.[c] ?? null;
        const type = row?.types?.[c] ?? null;
        const format = cellFormat(xl, styleIndex);
        const text = raw == null ? '' : formatValue(raw, format, xl?.date1904);
        // Excel's General alignment: numbers right, everything else left. A
        // cell explicitly formatted as text is a string however it is stored,
        // which is what the `t="@"` codes on account numbers and fund codes
        // are for.
        const stringy = type === 's' || type === 'str' || type === 'inlineStr' ||
                        type === 'b' || type === 'e';
        const numeric = !stringy && format?.kind !== 'text' &&
                        raw !== '' && raw != null && isFinite(Number(raw));
        const span = anchors.get(`${n}:${c}`);
        emitted.push({
          col: c, text, numeric, style: styleIndex,
          // The stored value, where the drawn one is a rounded or reformatted
          // version of it. Handed to the reader as a tooltip rather than
          // dropped, because a format can hide a decimal a budget turns on.
          raw: text !== String(raw ?? '') ? String(raw ?? '') : null,
          colSpan: span?.cols ?? 1, rowSpan: span?.rows ?? 1,
        });
        cells++;
      }
      markSpill(emitted, xl);
      out.push({
        row: n,
        height: heightToPx(row?.height ?? sheet.defaultRowHeight ?? 15),
        cells: emitted,
      });
    }

    const cfSkipped = markConditional(out, sheet);
    markNotes(out, sheet, xl);
    markLinks(out, sheet);
    const images = placeImages(sheet, xl, out, cols);

    return { cols, rows: out, maxCol: lastCol, freeze: sheet.freeze || null,
             truncated, images, cfSkipped, empty: false };
  }

  // Each cell's winning conditional rule, as a dxf index on `cell.cf`. Returns
  // how many RULES could not be decided, which is the number a caller needs to
  // say honestly that this is not the whole of what Excel would paint. Rules,
  // not checks: one expression rule over a 500-cell range is one thing this
  // kit does not do, and counting it 500 times would report a gap five hundred
  // times its size.
  //
  // Priority is ASCENDING in OOXML, so rule 1 outranks rule 2, and the first
  // rule that fires and names a format wins. `stopIfTrue` is honoured for the
  // same reason it exists, though with one format per cell it only matters for
  // a rule that fires and carries no dxf.
  function markConditional(rows, sheet) {
    const formats = (sheet.conditionalFormats || []).slice()
      .sort((a, b) => a.priority - b.priority);
    if (!formats.length) return 0;
    const undecided = new Set();
    for (const row of rows) {
      for (const cell of row.cells) {
        cell.cf = null;
        for (const rule of formats) {
          if (!inRange(rule.ranges, row.row, cell.col)) continue;
          const fires = cfApplies(rule, cell);
          if (fires === null) { undecided.add(rule); continue; }
          if (!fires) continue;
          if (rule.dxfId != null) { cell.cf = rule.dxfId; break; }
          if (rule.stopIfTrue) break;
        }
      }
    }
    return undecided.size;
  }

  // EVERYTHING SAID ABOUT A CELL THAT IS NOT ITS VALUE, in one place. Three
  // sources, and a reader has no reason to care which is which: Excel's input
  // message, the choices a list validation allows, and a comment somebody left.
  // Attached as `cell.note`, which a renderer shows however it likes; nothing
  // here decides that.
  //
  // `kind` is the strongest thing the cell carries, for a renderer choosing one
  // marker: a comment outranks a choice list, which outranks an instruction.
  // The text of all three is kept either way.
  function markNotes(rows, sheet, xl) {
    const rules = sheet.validations || [];
    const comments = new Map((sheet.comments || []).map(c => [c.ref, c]));
    if (!rules.length && !comments.size) return;
    const lists = new Map();   // formula -> resolved options, resolved once
    for (const row of rows) {
      for (const cell of row.cells) {
        const hit = rules.find(v => inRange(v.ranges, row.row, cell.col));
        const comment = comments.get(colLetter(cell.col) + row.row) || null;
        let options = null;
        if (hit?.type === 'list' && hit.formula1) {
          if (!lists.has(hit.formula1)) lists.set(hit.formula1, listOptions(hit.formula1, sheet, xl));
          options = lists.get(hit.formula1);
        }
        const title = hit?.promptTitle || '';
        const prompt = hit?.prompt || '';
        if (!comment && !title && !prompt && !options?.length) continue;
        cell.note = {
          kind: comment ? 'comment' : options?.length ? 'list' : 'instruction',
          title, prompt, options: options || null,
          comment: comment ? { author: comment.author, text: comment.text } : null,
        };
      }
    }
  }

  // What a list validation allows: an inline `"a,b,c"`, or the cells a range
  // names. A range may point at another sheet, which is why this takes the
  // workbook; anything it cannot resolve (a defined name, a formula) returns
  // null rather than a guess, and the cell then carries only its prompt.
  function listOptions(formula, sheet, xl) {
    const f = String(formula).trim().replace(/^=/, '');
    const inline = /^"(.*)"$/s.exec(f);
    if (inline) return inline[1].split(',').map(s => s.trim()).filter(Boolean);

    const m = /^(?:'([^']+)'|([A-Za-z0-9_À-￿.]+))?!?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(f);
    if (!m) return null;
    const sheetName = m[1] || m[2] || null;
    let target = sheet;
    if (sheetName) {
      target = Object.values(xl?.sheets || {}).find(s => s.name === sheetName);
      if (!target) return null;
    }
    const c1 = colIndexFromRef(m[3]), r1 = Number(m[4]);
    const c2 = m[5] ? colIndexFromRef(m[5]) : c1, r2 = m[6] ? Number(m[6]) : r1;
    const out = [];
    for (const row of target.rows || []) {
      if (row.row < Math.min(r1, r2) || row.row > Math.max(r1, r2)) continue;
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        const v = row.cells?.[c];
        if (v !== undefined && v !== '') out.push(String(v));
      }
    }
    return out.length ? out : null;
  }

  // EVERY ANNOTATION IN A WORKBOOK, in one list. Excel shows a comment only on
  // the cell it sits on, one at a time, which is why a sheet full of guidance
  // is read by hovering around it hoping to find them all. This is the other
  // reading: sheet, cell, what kind of note it is, who wrote it, what it says.
  //
  // Built from the sheets rather than from a layout, so it costs nothing to
  // ask before anything is drawn and it does not stop at a draw cap.
  function workbookNotes(xl) {
    const out = [];
    const sheets = Object.entries(xl?.sheets || {})
      .map(([key, s]) => ({ key, s }))
      .sort((a, b) => (a.s.index ?? 1e9) - (b.s.index ?? 1e9) || a.key.localeCompare(b.key));
    for (const { key, s } of sheets) {
      const name = s.name || key;
      for (const c of s.comments || []) {
        out.push({ sheet: name, cell: c.ref, kind: 'comment',
                   author: c.author || '', title: '', text: c.text || '', options: null });
      }
      // A validation covers a RANGE, and one row per cell of it would bury the
      // list: the fee form's thirteen instructions cover ninety-seven cells.
      // One row per rule, addressed at the range's first cell.
      for (const v of s.validations || []) {
        const options = v.type === 'list' && v.formula1 ? listOptions(v.formula1, s, xl) : null;
        if (!v.prompt && !v.promptTitle && !options?.length) continue;
        const first = v.ranges?.[0];
        out.push({
          sheet: name,
          cell: first ? colLetter(first.c1) + first.r1 : '',
          span: v.ranges?.length
            ? v.ranges.map(r => r.r1 === r.r2 && r.c1 === r.c2
                ? colLetter(r.c1) + r.r1
                : `${colLetter(r.c1)}${r.r1}:${colLetter(r.c2)}${r.r2}`).join(' ')
            : '',
          kind: options?.length ? 'list' : 'instruction',
          author: '', title: v.promptTitle || '', text: v.prompt || '', options: options || null,
        });
      }
    }
    return out;
  }

  // A picture's place, expressed as an OFFSET FROM A CELL rather than from the
  // top-left of the sheet. The renderer then positions it inside that cell and
  // never has to know the height of its own header row or the width of its
  // gutter, and an image stays put when a row above it is hidden.
  //
  // A cell covered by a merge is not drawn, so an image anchored inside one is
  // moved to the merge's anchor cell with the difference added to its offset.
  function placeImages(sheet, xl, rows, cols) {
    const images = sheet.images || [];
    if (!images.length) return [];
    const drawn = new Set(rows.map(r => r.row));
    const width = (c) => cols[c]?.width || 0;
    const span = (from, to) => { let n = 0; for (let c = from; c < to; c++) n += width(c); return n; };
    const heightBetween = (r1, r2) => rows
      .filter(r => r.row >= r1 && r.row < r2)
      .reduce((a, r) => a + r.height, 0);

    const out = [];
    for (const img of images) {
      const src = xl?.media?.[img.part];
      if (!src || !drawn.has(img.from.row + 1)) continue;   // from.row is 0-based
      let row = img.from.row + 1, col = img.from.col;
      let dx = emuToPx(img.from.colOff), dy = emuToPx(img.from.rowOff);

      const cover = (sheet.merges || []).find(m =>
        row >= m.r1 && row <= m.r2 && col >= m.c1 && col <= m.c2);
      if (cover) {
        dx += span(cover.c1, col);
        dy += heightBetween(cover.r1, row);
        row = cover.r1; col = cover.c1;
      }

      let w, h;
      if (img.to) {
        w = span(img.from.col, img.to.col) - emuToPx(img.from.colOff) + emuToPx(img.to.colOff);
        h = heightBetween(img.from.row + 1, img.to.row + 1) - emuToPx(img.from.rowOff) + emuToPx(img.to.rowOff);
      } else if (img.ext) {
        w = emuToPx(img.ext.cx); h = emuToPx(img.ext.cy);
      }
      if (!(w > 0) || !(h > 0)) continue;
      out.push({ row, col, dx, dy, width: w, height: h, src, name: img.name || '' });
    }
    return out;
  }

  // HOW FAR A CELL'S TEXT MAY RUN PAST ITS OWN COLUMN. Excel does not clip a
  // label to its column: text spills across the neighbouring cells for as long
  // as they are empty, which is why a sheet can carry a heading in a nine-
  // character column and still read. Clipping instead is not a small
  // difference. On the OFM prioritization worksheet every section heading sits
  // in an unmerged cell in column B, and clipped they read "The Ag", "Policy
  // R", "Policy A", "Combin".
  //
  // Three conditions, each one a case where Excel does not spill either: a
  // WRAPPED cell grows downward instead, a MERGED cell already has its span,
  // and a NUMBER is never spilled (Excel draws ##### rather than overflow a
  // figure into a column it does not belong to). Nothing else stops a run but
  // a neighbour holding a value, which is Excel's whole rule. A FILLED
  // neighbour does not: the banded headings on the OFM prioritization
  // worksheet sit in a nine-character column B with the band running to L, and
  // treating the band as a stop clipped every one of them to "Policy R".
  // Table cell backgrounds all paint before any cell's content, so a later
  // cell's fill cannot cover an earlier cell's spilled text.
  function markSpill(cells, xl) {
    const at = new Map(cells.map((c, i) => [c.col, i]));
    const blank = (col) => {
      const i = at.get(col);
      if (i == null) return false;             // covered by a merge
      const c = cells[i];
      return c.text === '' && c.colSpan === 1 && c.rowSpan === 1;
    };
    for (const c of cells) {
      c.spillLeft = 0;
      c.spillRight = 0;
      if (!c.text || c.numeric || c.colSpan > 1 || c.rowSpan > 1) continue;
      const st = cellStyle(xl, c.style);
      if (st?.wrap) continue;
      const align = st?.align || 'left';
      const right = align === 'left' || align === 'general' || align === 'fill' ||
                    align === 'center' || align === 'centerContinuous' || align === 'justify';
      const left = align === 'right' || align === 'center' || align === 'centerContinuous';
      if (right) while (blank(c.col + c.spillRight + 1)) c.spillRight++;
      if (left) while (c.col - c.spillLeft - 1 >= 0 && blank(c.col - c.spillLeft - 1)) c.spillLeft++;
    }
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

  // ---- Power Query -------------------------------------------------------
  //
  // A workbook's queries are the one thing in it that is not stored as XML.
  // The M source sits base64-encoded inside a <DataMashup> element in a
  // customXml part, and those bytes are themselves a ZIP behind an 8-byte
  // header, so the M is two containers deep inside a file that is already a
  // container. Nothing about the workbook's own structure points at it: a
  // reader that walks parts, as analyze() does, sees only an opaque blob.
  //
  // Ported 2026-08-15 from Get-PowerQuery in mehrlander/home's
  // projects/wps/app/Modules/ExcelService/ExcelXml.ps1, which is where this
  // was worked out and where it stayed. The PowerShell walks ZIP local file
  // headers by hand because it had no zip library in reach; here JSZip is
  // already loaded for the workbook itself, so the inner container is read the
  // same way as the outer one and the byte-walking drops out. The 8-byte
  // header is the one piece that does not: it is version (uint32 LE) then the
  // length of the parts ZIP (uint32 LE), and skipping it blindly is what the
  // original did.
  const MASHUP_RE = /<DataMashup[^>]*>([\s\S]*?)<\/DataMashup>/;

  // The <DataMashup> payload as bytes, plus the header it carries. Pure and
  // synchronous, so the parsing is testable without a zip library.
  function mashupPayload(xmlString) {
    const m = MASHUP_RE.exec(String(xmlString || ''));
    if (!m) return null;
    const b64 = m[1].replace(/\s+/g, '');
    if (!b64) return null;
    let bin;
    try { bin = atob(b64); } catch { return null; }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length < 8) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(0, true);
    const declared = view.getUint32(4, true);
    // Trust the declared length only when it fits; a truncated or padded blob
    // falls back to "everything after the header", which is what the original
    // assumed unconditionally.
    const end = declared > 0 && 8 + declared <= bytes.length ? 8 + declared : bytes.length;
    return { version, declaredLength: declared, zip: bytes.subarray(8, end) };
  }

  // Every M section in a workbook's mashup, in path order. `Formulas/Section1.m`
  // is the usual and often only one.
  async function readMashup(xmlString) {
    const payload = mashupPayload(xmlString);
    if (!payload) return null;
    const ZipLib = await loadZip();
    let zip;
    try { zip = await ZipLib.loadAsync(payload.zip); } catch { return null; }
    const sections = await Promise.all(
      Object.entries(zip.files)
        .filter(([path, f]) => !f.dir && /\.m$/i.test(path))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(async ([path, f]) => ({ path, m: await f.async('string') }))
    );
    return { version: payload.version, sections };
  }

  async function readZip(input) {
    const ZipLib = await loadZip();
    const zip = await ZipLib.loadAsync(input);
    const parts = await Promise.all(
      Object.entries(zip.files)
        .filter(([path, f]) => !f.dir && /\.(xml|rels)$/.test(path))
        .map(async ([path, f]) => [path, await f.async('string')])
    );
    const result = analyze(parts);

    // MEDIA, attached here for the same reason the mashup is: analyze() takes
    // XML strings by contract, and a PNG is neither XML nor a string. Each
    // image becomes a data: URI, since the page drawing it has no zip to fetch
    // from. Only the raster formats a browser draws; an EMF or WMF logo is
    // skipped rather than handed over as a broken <img>.
    const MEDIA_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                         gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
    await Promise.all(Object.entries(zip.files)
      .filter(([path, f]) => !f.dir && path.startsWith('xl/media/'))
      .map(async ([path, f]) => {
        const ext = (path.split('.').pop() || '').toLowerCase();
        const mime = MEDIA_MIME[ext];
        if (!mime) return;
        result.xl.media[path] = `data:${mime};base64,${await f.async('base64')}`;
      }));

    // analyze() is synchronous by contract, and inflating the mashup is not,
    // so the queries are attached here rather than inside it. Any customXml
    // part can carry it; item1.xml is convention, not rule.
    for (const [path, xml] of parts) {
      if (!/customXml\//i.test(path) || !MASHUP_RE.test(xml)) continue;
      const mashup = await readMashup(xml);
      if (mashup) { result.xl.powerQuery = { part: path, ...mashup }; break; }
    }
    return result;
  }

  window.xlsxKit = {
    readZip,
    analyze,
    views: { paths: pathsView, connections: connectionsView, unconnected: unconnectedView, files: filesView },
    sheetRows,
    sheetLayout,
    workbookNotes,
    cellStyle,
    dxfStyle,
    cfApplies,
    summary,
    colLetter,
    mashupPayload,
    readMashup,
    cellFormat,
    formatValue,
    formatKind,
    serialToDate,
    resolveColor,
  };
})();
