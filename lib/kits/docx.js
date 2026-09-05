// lib/kits/docx.js — WordprocessingML (.docx) preparation: what a Word file
// has to have done to it before a browser renderer draws it faithfully, and
// what it knows about itself that a render cannot show.
//
// The viewer's `page` mode paints a .docx with docx-preview (Apache-2.0, one
// dependency, JSZip), which reads page geometry, headers and footers, table
// and paragraph shading, fonts, tab stops and list numbering off the file and
// gets them right on OFM's forms. Measured on the corpus this estate opens
// (30 committed .docx in mehrlander/home, 2026-09-04), it has three gaps, and
// all are closed here BEFORE the bytes reach it rather than patched inside
// it, so the estate depends on a pinned upstream build and nothing else:
//
//   1. A content control (`w:sdt`) inside a table row or cell is dropped: the
//      renderer's row and cell parsers have no case for it. That is 45
//      controls across the corpus, including every section label in the
//      Decision Package Template's fiscal table ("Staffing", "Operating
//      Expenditures", "Revenue"), which rendered as empty grey bands.
//      unwrapControls() replaces each control with its content, at every
//      level, deepest first.
//   2. A bullet set in Symbol or Wingdings is a private-use character in that
//      font (U+F0B7 for a Symbol dot), and where the font is absent it draws
//      as nothing. mapBullets() rewrites the level's glyph to its Unicode
//      equivalent and drops the font hint, so any font draws it. The table is
//      the one mammoth ships (dingbat-to-unicode), cut to the codes Word's
//      bullet library uses; an unmapped code is left as written.
//   3. A section break that starts a new page, and a paragraph's own "page
//      break before", are ignored once the painter is asked to honour Word's
//      saved page breaks (`ignoreLastRenderedPageBreak: false`, which is how
//      the page mode gets "Page 1 of 2" under the content Word put it under):
//      in that mode it joins consecutive sections onto one page unless the
//      paper changes, and never reads the break's type. The IT Addendum's
//      title ends such a section, so its form ran on under the title.
//      markPageBreaks() writes the explicit page break the painter does read,
//      and leaves alone a paragraph that already carries one.
//   4. Headers and footers: a section that names none inherits the previous
//      section's (ECMA-376 17.10.1), which the painter does not do, so the
//      IT Addendum's form pages lost the logo and the page-number footer its
//      title page had; and an even-page reference is applied to every second
//      page whether or not the document turned even and odd headers on
//      (settings.xml `w:evenAndOddHeaders`; none of the corpus does), which
//      swapped in the empty even header. fixHeaderRefs() copies the missing
//      references forward and drops the even ones the document never enabled.
//   5. A PAGE or NUMPAGES field is drawn as the result Word cached when it
//      last saved, so every footer read "2 |". markPageFields() replaces the
//      cached result with a sentinel (PAGE_FIELD, NUMPAGES_FIELD) the page
//      mode swaps for the page's number and the page count once the painter
//      has made pages, since only the painter knows how many it made.
//
// What a control WAS is recorded before it is unwrapped: survey() lists every
// control with its kind, its checkbox state, whether it still shows its
// placeholder, and the text inside it, plus the headings with their
// `w14:paraId`. That id is on 2,713 of the corpus's 3,713 paragraphs and is the
// Word analogue of a cell address: a place a cite can name that survives the
// document being edited around it.
//
// No DOM rendering here. normalize() takes already-extracted XML strings and
// returns the rewritten ones, so it is testable in node with fixture strings
// (tools/test/docx.test.mjs); prepare() is the JSZip-backed wrapper a page
// calls with the file's bytes.
(() => {
  // THE ROW THIS KIT ANSWERS TO in docs/routes-kinds.csv, carried here the way
  // md-doc.js and code-doc.js carry theirs: the registry declares, the code
  // holds a copy, and tools/test/routes-manifest.test.mjs fails when they part.
  // No aim yet: a phrase is what a cite names in a document today, and the
  // paragraph id the survey records is the unit an aim would be built on.
  const KIND = Object.freeze({
    kind: 'document',
    label: 'Word document',
    unit: 'page',
    aim: '',
    aimLabel: '',
    aimHint: '',
  });

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';

  let jszipMod;
  const loadZip = async () => {
    if (typeof JSZip !== 'undefined') return JSZip;
    jszipMod ??= await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm').then(m => m.default);
    return jszipMod;
  };

  const parseXml = (s) => new DOMParser().parseFromString(String(s), 'application/xml');
  // XMLSerializer drops the declaration Word wrote; it is put back so the
  // part reads as it did, since a consumer may check for it.
  const serialize = (doc, original) => {
    const out = new XMLSerializer().serializeToString(doc);
    if (out.startsWith('<?xml')) return out;
    const decl = /^\s*(<\?xml[^>]*\?>)/.exec(String(original || ''))?.[1];
    return decl ? decl + out : out;
  };

  // A node's tag without its prefix. Every part is written prefixed (`w:p`),
  // and localName is what survives a parser choosing its own prefixes.
  const tag = (node) => node?.localName || String(node?.nodeName || '').replace(/^.*:/, '');
  const kidsNamed = (node, name) => [...(node?.children || [])].filter(c => tag(c) === name);
  const kidNamed = (node, name) => kidsNamed(node, name)[0];
  const attrW = (node, name) => node?.getAttributeNS?.(W, name) ?? node?.getAttribute?.('w:' + name) ?? null;
  const attrW14 = (node, name) => node?.getAttributeNS?.(W14, name) ?? node?.getAttribute?.('w14:' + name) ?? null;
  const byNs = (root, name) => [...root.getElementsByTagNameNS(W, name)];

  // The parts that can hold body content, and so a content control.
  const CONTENT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/;
  const NUMBERING_PART = 'word/numbering.xml';

  // Text of a paragraph, run, or control: every <w:t> beneath it, in order,
  // with a tab as a tab so two labels on one line do not fuse.
  const textOf = (node) => {
    let s = '';
    const walk = (n) => {
      for (const c of n.children || []) {
        const t = tag(c);
        if (t === 't') s += c.textContent;
        else if (t === 'tab') s += '\t';
        else if (t === 'br' || t === 'cr') s += '\n';
        else walk(c);
      }
    };
    walk(node);
    return s;
  };

  // ---- content controls ---------------------------------------------------

  // What kind of control the properties describe. Word writes the typed ones
  // as an element in sdtPr; a plain rich-text control carries none of them.
  const CONTROL_KINDS = ['checkbox', 'dropDownList', 'comboBox', 'date', 'picture',
                         'docPartList', 'docPartObj', 'group', 'repeatingSection',
                         'repeatingSectionItem', 'citation', 'bibliography', 'equation', 'text'];
  function controlKind(sdtPr) {
    if (!sdtPr) return 'richText';
    const present = [...sdtPr.children].map(tag);
    return CONTROL_KINDS.find(k => present.includes(k)) || 'richText';
  }

  // Every control in a part, as the renderer will never see it: kind, the
  // author's alias and tag, whether it is still showing its placeholder, a
  // checkbox's state, and the text inside. `level` says where the control
  // sits, which is the fact that decided whether docx-preview drew it: a
  // block in the body or a run in a paragraph yes, a table row or anything
  // directly inside a cell no.
  function listControls(doc) {
    return byNs(doc, 'sdt').map(sdt => {
      const pr = kidNamed(sdt, 'sdtPr');
      const content = kidNamed(sdt, 'sdtContent');
      const kind = controlKind(pr);
      const parent = tag(sdt.parentNode);
      const wraps = content ? [...content.children].map(tag) : [];
      const level = wraps.includes('tr') ? 'row'
                  : (wraps.includes('tc') || parent === 'tc') ? 'cell'
                  : (wraps.includes('p') || wraps.includes('tbl')) ? 'block' : 'run';
      const box = kind === 'checkbox' ? kidNamed(pr, 'checkbox') : null;
      const checked = box ? attrW14(kidNamed(box, 'checked'), 'val') : null;
      return {
        kind, level, parent,
        alias: attrW(kidNamed(pr, 'alias'), 'val') || null,
        tag: attrW(kidNamed(pr, 'tag'), 'val') || null,
        placeholder: !!kidNamed(pr, 'showingPlcHdr'),
        checked: box ? (checked === '1' || checked === 'true') : null,
        text: content ? textOf(content) : '',
      };
    });
  }

  // Replace each control with its content, deepest first so a control nested
  // inside another's content is settled before the outer one moves it. A
  // control with no content element (Word never writes one, but the schema
  // allows it) is removed outright. Returns how many were unwrapped.
  function unwrapControls(doc) {
    const all = byNs(doc, 'sdt');
    let n = 0;
    for (const sdt of all.reverse()) {
      const parent = sdt.parentNode;
      if (!parent) continue;
      const content = kidNamed(sdt, 'sdtContent');
      if (content) while (content.firstChild) parent.insertBefore(content.firstChild, sdt);
      parent.removeChild(sdt);
      n++;
    }
    return n;
  }

  // ---- bullets ------------------------------------------------------------

  // Word's bullet library, by the font it names and the byte it writes into
  // that font's private-use block. From mammoth's dingbat-to-unicode table,
  // cut to the codes seen or plausible in list levels. Symbol's 0xA7 really
  // is the club, so a Symbol square is not in Word's library and not here;
  // the square bullet every template carries is Wingdings 0xA7.
  const BULLET_GLYPHS = {
    'Symbol':      { B7: '•', A8: '♦', D8: '¬', FC: '⎫', B2: '″', '2D': '−', B0: '°', A7: '♣', '76': 'ϖ' },
    'Wingdings':   { '6C': '⚫', '6E': '◼', '71': '❑', '75': '◆', '76': '❖', '77': '⬩', '9F': '•',
                     A1: '⭘', A7: '▪', A8: '🞎', B2: '⯎', D8: '⮚', D9: '⮙', E0: '🡪', E8: '🡺',
                     F0: '⇨', FC: '✓', FD: '🗷', FE: '🗹' },
    'Wingdings 2': { '97': '⦁', '98': '●', '99': '○', '9A': '🞅', '9B': '🞇', '9C': '🞉' },
    'Wingdings 3': { '5F': '🢥', '7D': '🞂', '7E': '🞁' },
  };

  // The byte a one-character level text names in its font: U+F0B7 and U+00B7
  // both mean 0xB7 (Word writes the private-use form, some other writers the
  // bare byte). Anything longer, or outside the byte range, is not a
  // symbol-font bullet and is left alone.
  const symbolByte = (val) => {
    if (typeof val !== 'string' || [...val].length !== 1) return null;
    const cp = val.codePointAt(0);
    if (cp >= 0xF000 && cp <= 0xF0FF) return (cp - 0xF000).toString(16).toUpperCase().padStart(2, '0');
    if (cp >= 0x80 && cp <= 0xFF) return cp.toString(16).toUpperCase().padStart(2, '0');
    return null;
  };

  // Rewrite each list level whose glyph is a symbol-font byte with a Unicode
  // mapping, and drop the level's font so the paragraph's own draws it.
  // Returns how many levels changed. A level whose font is unmapped, or
  // whose byte the table lacks, is left as written.
  function mapBullets(numberingDoc) {
    let n = 0;
    for (const lvl of byNs(numberingDoc, 'lvl')) {
      const fmt = attrW(kidNamed(lvl, 'numFmt'), 'val');
      if (fmt && fmt !== 'bullet') continue;
      const lvlText = kidNamed(lvl, 'lvlText');
      const rPr = kidNamed(lvl, 'rPr');
      const rFonts = kidNamed(rPr, 'rFonts');
      if (!lvlText || !rFonts) continue;
      const font = attrW(rFonts, 'ascii') || attrW(rFonts, 'hAnsi') || '';
      const table = BULLET_GLYPHS[font];
      if (!table) continue;
      const byte = symbolByte(attrW(lvlText, 'val'));
      const glyph = byte && table[byte];
      if (!glyph) continue;
      lvlText.setAttributeNS(W, 'w:val', glyph);
      rPr.removeChild(rFonts);
      n++;
    }
    return n;
  }

  // ---- page breaks --------------------------------------------------------

  // A section break's type; absent means nextPage (ECMA-376 17.6.22).
  const NEW_PAGE_TYPES = new Set(['nextPage', 'evenPage', 'oddPage']);
  const startsNewPage = (sectPr) => {
    const type = attrW(kidNamed(sectPr, 'type'), 'val');
    return type == null || NEW_PAGE_TYPES.has(type);
  };

  // Whether a paragraph already begins with a break the painter reads: a
  // page break run or Word's own saved break, before any text.
  const opensWithBreak = (p) => {
    for (const r of kidsNamed(p, 'r')) {
      for (const c of r.children) {
        const t = tag(c);
        if (t === 'rPr') continue;
        if (t === 'lastRenderedPageBreak') return true;
        if (t === 'br') return attrW(c, 'type') === 'page';
        return false;
      }
    }
    return false;
  };

  // Whether a paragraph already ends with a page break run, the shape the
  // table case below writes, so a second pass writes nothing.
  const endsWithBreak = (p) => {
    const runs = kidsNamed(p, 'r');
    const last = runs[runs.length - 1]?.lastElementChild;
    return !!last && tag(last) === 'br' && attrW(last, 'type') === 'page';
  };

  const pageBreakRun = (doc) => {
    const r = doc.createElementNS(W, 'w:r');
    const br = doc.createElementNS(W, 'w:br');
    br.setAttributeNS(W, 'w:type', 'page');
    r.appendChild(br);
    return r;
  };

  // The first block after `node` in the same body, skipping bookmarks and
  // the like; null past the body's last block.
  const nextBlock = (node) => {
    let n = node.nextElementSibling;
    while (n && !['p', 'tbl'].includes(tag(n))) n = n.nextElementSibling;
    return n;
  };

  // Write the page break each next-page section break and each paragraph's
  // own pageBreakBefore imply, as a `w:br w:type="page"` run. The run goes at
  // the START of the paragraph that opens the new page, so what is left
  // behind is an empty line at the foot of the page before rather than at the
  // head of the new one; where the new page opens with a table the run has no
  // paragraph to go in and is appended to the paragraph carrying the break.
  // The body's final sectPr is not a break and is not touched. Returns how
  // many breaks were written.
  function markPageBreaks(doc) {
    let n = 0;
    for (const p of byNs(doc, 'p')) {
      const pPr = kidNamed(p, 'pPr');
      if (!pPr) continue;
      const sectPr = kidNamed(pPr, 'sectPr');
      if (sectPr && startsNewPage(sectPr)) {
        const next = nextBlock(p);
        if (!next) continue;
        if (tag(next) === 'p') {
          if (opensWithBreak(next)) continue;
          const nextPr = kidNamed(next, 'pPr');
          next.insertBefore(pageBreakRun(doc), nextPr ? nextPr.nextSibling : next.firstChild);
        } else {
          if (endsWithBreak(p)) continue;
          p.appendChild(pageBreakRun(doc));
        }
        n++;
      }
      const before = kidNamed(pPr, 'pageBreakBefore');
      if (before && attrW(before, 'val') !== '0' && attrW(before, 'val') !== 'false' && !opensWithBreak(p)) {
        p.insertBefore(pageBreakRun(doc), pPr.nextSibling);
        n++;
      }
    }
    return n;
  }

  // ---- headers and footers ------------------------------------------------

  const SETTINGS_PART = 'word/settings.xml';

  // Every sectPr in body order: the paragraph-level ones as they come, the
  // body's own last, which is the order sections run in.
  const sectPrs = (doc) => byNs(doc, 'sectPr').filter(s => ['pPr', 'body'].includes(tag(s.parentNode)));

  // Copy header and footer references forward into sections that name none of
  // that kind, then remove even-page references unless the document enabled
  // even and odd headers. `settingsXml` is word/settings.xml's text, or null
  // when the package has none, which reads as not enabled. Returns how many
  // references were written or removed.
  function fixHeaderRefs(doc, settingsXml) {
    let n = 0;
    let prev = { headerReference: [], footerReference: [] };
    for (const sect of sectPrs(doc)) {
      for (const kind of ['headerReference', 'footerReference']) {
        const own = kidsNamed(sect, kind);
        if (own.length) { prev[kind] = own; continue; }
        if (!prev[kind].length) continue;
        // References lead a sectPr in the schema, headers before footers, so
        // the inherited ones go in front of whatever is there.
        const before = kind === 'footerReference' ? (kidsNamed(sect, 'headerReference').pop()?.nextSibling ?? sect.firstChild) : sect.firstChild;
        for (const ref of prev[kind]) { sect.insertBefore(ref.cloneNode(true), before); n++; }
      }
    }
    const evenOdd = /<w:evenAndOddHeaders\b(?![^>]*w:val="(?:0|false)")/.test(String(settingsXml || ''));
    if (!evenOdd) {
      for (const sect of sectPrs(doc)) {
        for (const ref of [...kidsNamed(sect, 'headerReference'), ...kidsNamed(sect, 'footerReference')]) {
          if (attrW(ref, 'type') === 'even') { sect.removeChild(ref); n++; }
        }
      }
    }
    return n;
  }

  // ---- page-number fields -------------------------------------------------

  // Private-use characters bracket the field name, so the viewer can find
  // the result in rendered text without a wrapper the painter would not keep.
  const PAGE_FIELD = 'PAGE';
  const NUMPAGES_FIELD = 'NUMPAGES';
  const fieldSentinel = (instr) => {
    const m = /^\s*(PAGE|NUMPAGES)\b/i.exec(String(instr || ''));
    return m ? (m[1].toUpperCase() === 'PAGE' ? PAGE_FIELD : NUMPAGES_FIELD) : null;
  };

  // Set the runs' text to one sentinel: the first <w:t> carries it, the rest
  // are emptied, so the field's formatting (its first run's) is kept.
  const writeResult = (runs, sentinel, doc) => {
    const ts = runs.flatMap(r => kidsNamed(r, 't'));
    if (!ts.length) {
      if (!runs.length) return false;
      const t = doc.createElementNS(W, 'w:t');
      t.textContent = sentinel;
      runs[0].appendChild(t);
      return true;
    }
    ts.forEach((t, i) => { t.textContent = i ? '' : sentinel; });
    return true;
  };

  // Replace the cached result of every PAGE and NUMPAGES field with its
  // sentinel. A simple field holds its result as children; a complex field
  // runs begin, instruction, separate, result runs, end, across sibling runs
  // of one paragraph. Returns how many fields were marked.
  function markPageFields(doc) {
    let n = 0;
    for (const fld of byNs(doc, 'fldSimple')) {
      const sentinel = fieldSentinel(attrW(fld, 'instr'));
      if (sentinel && writeResult(kidsNamed(fld, 'r'), sentinel, doc)) n++;
    }
    for (const p of byNs(doc, 'p')) {
      let state = null, instr = '', result = [];
      for (const r of kidsNamed(p, 'r')) {
        const fc = kidNamed(r, 'fldChar');
        const type = fc && attrW(fc, 'fldCharType');
        if (type === 'begin') { state = 'instr'; instr = ''; result = []; continue; }
        if (type === 'separate') { if (state === 'instr') state = 'result'; continue; }
        if (type === 'end') {
          const sentinel = state ? fieldSentinel(instr) : null;
          if (sentinel && state === 'result' && writeResult(result, sentinel, doc)) n++;
          state = null; continue;
        }
        if (state === 'instr') instr += kidsNamed(r, 'instrText').map(t => t.textContent).join('');
        else if (state === 'result') result.push(r);
      }
    }
    return n;
  }

  // ---- survey -------------------------------------------------------------

  // What the body knows about itself: counts, the headings with their ids,
  // and the controls. Read from the document part before it is rewritten.
  function survey(doc) {
    const paras = byNs(doc, 'p');
    const headings = [];
    for (const p of paras) {
      const style = attrW(kidNamed(kidNamed(p, 'pPr'), 'pStyle'), 'val') || '';
      if (!/^(Heading\d|Title|Subtitle)$/i.test(style)) continue;
      const text = textOf(p).trim();
      if (!text) continue;
      headings.push({ id: attrW14(p, 'paraId') || null, style, text });
    }
    return {
      paragraphs: paras.length,
      tables: byNs(doc, 'tbl').length,
      headings,
      controls: listControls(doc),
    };
  }

  // ---- the pure entry point -----------------------------------------------

  // `parts` is [[path, xmlString], ...] or { path: xmlString } for the parts
  // worth reading (prepare() selects them). Returns the parts that changed,
  // keyed by path, and a report: how many controls were unwrapped in each
  // part and overall, how many bullet levels were mapped, and the survey of
  // the main document. A part that does not parse is left untouched and
  // named in `skipped`, so one malformed header cannot stop the document.
  function normalize(parts) {
    const entries = Array.isArray(parts) ? parts : Object.entries(parts || {});
    const settingsXml = entries.find(([path]) => path === SETTINGS_PART)?.[1] ?? null;
    const changed = {};
    const report = { controls: 0, bullets: 0, breaks: 0, headerRefs: 0, fields: 0, byPart: {}, skipped: [], survey: null };
    for (const [path, xml] of entries) {
      const isContent = CONTENT_PART.test(path);
      if (!isContent && path !== NUMBERING_PART) continue;
      let doc;
      try {
        doc = parseXml(xml);
        if (doc.getElementsByTagName('parsererror').length) throw new Error('parsererror');
      } catch (e) {
        report.skipped.push(path);
        continue;
      }
      if (path === 'word/document.xml') report.survey = survey(doc);
      let n = isContent ? unwrapControls(doc) : mapBullets(doc);
      if (isContent) report.controls += n; else report.bullets += n;
      if (isContent) { const f = markPageFields(doc); report.fields += f; n += f; }
      if (path === 'word/document.xml') {
        const breaks = markPageBreaks(doc);
        const refs = fixHeaderRefs(doc, settingsXml);
        report.breaks = breaks;
        report.headerRefs = refs;
        n += breaks + refs;
      }
      if (!n) continue;
      report.byPart[path] = n;
      changed[path] = serialize(doc, xml);
    }
    return { parts: changed, report };
  }

  // The file, prepared: unzip, rewrite the parts normalize() changed, zip
  // again. Returns the new bytes and the report. Throws on a file that is not
  // a ZIP or has no main document, which is what a renamed or truncated file
  // looks like from here.
  async function prepare(bytes) {
    const Zip = await loadZip();
    const zip = await Zip.loadAsync(bytes);
    if (!zip.file('word/document.xml')) throw new Error('no word/document.xml in the package');
    const names = Object.keys(zip.files).filter(p => CONTENT_PART.test(p) || p === NUMBERING_PART || p === SETTINGS_PART);
    const parts = [];
    for (const p of names) parts.push([p, await zip.file(p).async('string')]);
    const { parts: changed, report } = normalize(parts);
    for (const [p, xml] of Object.entries(changed)) zip.file(p, xml);
    // Deflated as Word writes it; a stored zip would be larger for no reason
    // and the renderer inflates either.
    const out = Object.keys(changed).length
      ? await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
      : (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return { bytes: out, report };
  }

  window.docxKit = {
    normalize, prepare, survey, listControls, unwrapControls, mapBullets, markPageBreaks, fixHeaderRefs,
    markPageFields, BULLET_GLYPHS, CONTENT_PART, PAGE_FIELD, NUMPAGES_FIELD,
  };
})();
