// kits/pdf.js — browser PDF extraction: text, geometry, and table structure.
//
//   window.pdf = {
//     open, geom, stream, lattice, doc, config
//   }
//
// Three layers, deliberately separated:
//
//   1. `geom`, `stream`, `lattice` are PURE. They take plain arrays of plain
//      objects and return the same. No pdf.js, no DOM, no browser. Every
//      structural decision this kit makes lives here, which is why the whole
//      table-detection surface is testable under node with synthetic fixtures.
//   2. `open()` is the only thing that needs pdf.js. It turns a PDF into the
//      plain arrays layer 1 consumes: `items` (text) and `paths` (rules).
//   3. `doc` is the only thing that needs pdf-lib. Page slicing and merging,
//      which touch bytes and never touch geometry.
//
// COORDINATES. Everything is PDF user space: origin bottom-left, y increases
// UPWARD. Boxes are `{x1, y1, x2, y2}` with y1 the bottom edge and y2 the top,
// so `y1 < y2` always. Text items also carry `base`, the baseline y, which is
// what pdf.js actually reports and what decoration detection keys on. Nothing
// here flips to screen space; do that at the render boundary.
//
// TABLES, TWO WAYS. `stream` infers structure from where the text sits.
// `lattice` infers it from the rules drawn on the page. They answer the same
// question from unrelated evidence, so running both and comparing is the point,
// not a fallback: agreement is a real control, and disagreement is a finding.
// See docs/pdf-structure.md.

(() => {

  const CDN = {
    pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js',
    pdfLib: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  };

  // Defaults for every tolerance the kit uses, in PDF points. Named and
  // gathered here because tolerances are a design surface, not a tuning
  // afterthought: each one fails in its own direction, and their interaction
  // decides whether the junction network is even stable enough to walk.
  const config = {
    snap: 1.5,        // merge near-identical coordinates. >5 collapses thin columns.
    join: 3.0,        // bridge gaps between collinear segments (dotted rules).
    intersect: 1.0,   // how close H and V must come to register a crossing.
    minEdge: 5.0,     // shorter segments are decoration, not table rules.
    rowTol: 2.0,      // baseline spread within one row.
    gapTol: 1.5,      // horizontal gap that still counts as one chunk (× space width).
    pad: 0.5,         // cell box growth when assigning text, for coordinate bleed.
    background: '#ffffff',
  };

  const num = v => +v.toFixed(2);
  const sum = a => a.reduce((s, v) => s + v, 0);
  const uniq = a => [...new Set(a)];

  // ==========================================================================
  // 1. geom — coordinate normalization. Pure.
  // ==========================================================================

  // Cluster nearby values and map every member to the cluster mean. PDF
  // generators emit the same visual column as 71.9994, 72.0001, 72.0; naive
  // rounding splits them across a boundary, this does not.
  //
  // Returns a lookup fn, not an array, so callers keep their original values
  // and translate on demand.
  const snapRound = (values, tol = config.snap, decimals = 0) => {
    const vals = [...values].filter(v => Number.isFinite(v));
    if (!vals.length) return v => v;
    const factor = 10 ** decimals;
    const sorted = vals.toSorted((a, b) => a - b);
    const groups = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > tol) groups.push([sorted[i]]);
      else groups.at(-1).push(sorted[i]);
    }
    const map = new Map();
    for (const g of groups) {
      const mean = Math.round((sum(g) / g.length) * factor) / factor;
      for (const v of g) map.set(v, mean);
    }
    return v => map.get(v) ?? Math.round(v * factor) / factor;
  };

  // Collapse a set of values to their distinct snapped representatives,
  // ascending. This is the anchor-list primitive.
  const anchors = (values, tol = config.snap) => {
    const snap = snapRound(values, tol, 2);
    return uniq([...values].map(snap)).toSorted((a, b) => a - b);
  };

  // Drop strokes that are duplicates of one already kept. Bold effects and
  // double-stroked borders otherwise become two rules a hair apart, and the
  // junction walker then finds a phantom zero-height cell between them.
  const dedupe = (lines, axis, tol = 0.5) => {
    const kept = [];
    const near = (a, b) => Math.abs(a - b) < tol;
    for (const l of lines.toSorted((a, b) => (a.x1 ?? a.x) - (b.x1 ?? b.x))) {
      const dup = kept.some(k => axis === 'h'
        ? near(k.y, l.y) && near(k.x1, l.x1) && near(k.x2, l.x2)
        : near(k.x, l.x) && near(k.y1, l.y1) && near(k.y2, l.y2));
      if (!dup) kept.push(l);
    }
    return kept;
  };

  // Merge collinear segments separated by less than `join`. This is the step
  // that survives dotted leaders: a budget page can render
  // "Appropriations........$1,000,000" as thousands of 1-point segments, and
  // without this the junction walk sees thousands of stubs instead of one rule.
  const joinCollinear = (lines, axis, opts = {}) => {
    const join = opts.join ?? config.join;
    const tol = opts.snap ?? config.snap;
    const along = axis === 'h' ? 'y' : 'x';
    const [s, e] = axis === 'h' ? ['x1', 'x2'] : ['y1', 'y2'];

    const snap = snapRound(lines.map(l => l[along]), tol, 2);
    const byTrack = Map.groupBy(lines, l => snap(l[along]));
    const out = [];

    for (const [track, group] of byTrack) {
      const sorted = group.toSorted((a, b) => a[s] - b[s]);
      let run = { ...sorted[0], [along]: track };
      for (const seg of sorted.slice(1)) {
        if (seg[s] - run[e] <= join) run[e] = Math.max(run[e], seg[e]);
        else { out.push(run); run = { ...seg, [along]: track }; }
      }
      out.push(run);
    }
    return out.map(l => ({ ...l, [s]: num(l[s]), [e]: num(l[e]), [along]: num(l[along]) }));
  };

  const lengthOf = (l, axis) => axis === 'h' ? l.x2 - l.x1 : l.y2 - l.y1;

  // Two filters that matter before any junction work, both learned the hard way:
  //
  //   - White strokes. A shaded header row often gets its column separators
  //     drawn in the page background colour, invisible to a reader and fully
  //     visible to a naive extractor, which then rules the header into cells
  //     that bisect the text.
  //   - Stubs. Ticks and decorative marks never reach a crossing, so they add
  //     no cells, but they do add candidate junctions to walk.
  const usable = (lines, axis, opts = {}) => {
    const bg = (opts.background ?? config.background).toLowerCase();
    const minEdge = opts.minEdge ?? config.minEdge;
    return lines.filter(l =>
      (l.color ?? '#000000').toLowerCase() !== bg &&
      (l.width ?? 1) > 0 &&
      lengthOf(l, axis) >= minEdge);
  };

  const box = (x1, y1, x2, y2) => ({
    x1: num(Math.min(x1, x2)), y1: num(Math.min(y1, y2)),
    x2: num(Math.max(x1, x2)), y2: num(Math.max(y1, y2)),
  });

  const overlapArea = (a, b) => {
    const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    return w > 0 && h > 0 ? w * h : 0;
  };

  const area = b => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const centroid = b => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });
  const contains = (b, p) => p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2;
  const grow = (b, p) => box(b.x1 - p, b.y1 - p, b.x2 + p, b.y2 + p);

  const geom = {
    snapRound, anchors, dedupe, joinCollinear, usable,
    box, overlapArea, area, centroid, contains, grow, lengthOf,
  };

  // ==========================================================================
  // 2. stream — structure inferred from where the text sits. Pure.
  // ==========================================================================

  // pdf.js emits blank items: empty strings and lone spaces, each with a real
  // position. `open()` keeps them, because a zero-width item between two runs is
  // sometimes the only mark a column break leaves behind. But they must not vote
  // on structure, and they do unless excluded here.
  //
  // Found by looking rather than by reasoning. On a three-column ruled table the
  // separator spaces sit at their own recurring x, so `columns` reported six
  // candidates where the lattice found three, and the duplicate filter could not
  // help: the blanks form a set disjoint from the text's, so they read as a
  // genuine fourth, fifth, and sixth column. `gutters` has the same exposure
  // from the other side, since a blank occupies width and closes a gap that is
  // visually empty.
  //
  // Pass `{blanks: true}` to analyse them anyway.
  const textOnly = (items, opts = {}) =>
    opts.blanks ? items : items.filter(i => i.str && i.str.trim());

  // Group items into visual lines by baseline proximity. Returned top-to-bottom
  // (descending y), because reading order is what a caller wants and PDF space
  // counts the other way.
  const rows = (items, opts = {}) => {
    items = textOnly(items, opts);
    const tol = opts.tol ?? config.rowTol;
    if (!items.length) return [];
    const snap = snapRound(items.map(i => i.base), tol, 2);
    const groups = Map.groupBy(items, i => `${i.page}:${snap(i.base)}`);
    return [...groups.values()]
      .map(g => {
        const sorted = g.toSorted((a, b) => a.x1 - b.x1);
        return {
          page: sorted[0].page,
          base: num(snap(sorted[0].base)),
          x1: Math.min(...sorted.map(i => i.x1)),
          x2: Math.max(...sorted.map(i => i.x2)),
          items: sorted,
          str: sorted.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(),
        };
      })
      .toSorted((a, b) => a.page - b.page || b.base - a.base);
  };

  // Merge items within a row that sit close enough to be one run of text.
  // The threshold scales with font size rather than being absolute, so a
  // 6pt footnote and a 24pt heading are judged on the same terms.
  //
  // A style break also splits, so a bold label and its plain value stay
  // separate even when they touch.
  const chunks = (items, opts = {}) => {
    const factor = opts.gapTol ?? config.gapTol;
    const splitStyle = opts.splitStyle ?? true;
    return rows(items, opts).flatMap(row => {
      const out = [];
      let run = null;
      for (const it of row.items) {
        const gap = run ? it.x1 - run.x2 : 0;
        const styleBreak = splitStyle && run &&
          (run.bold !== it.bold || run.italic !== it.italic || run.fontName !== it.fontName);
        const wide = run && gap > factor * (it.fontSize ?? 10) * 0.5;
        if (!run || styleBreak || wide) {
          run = { page: row.page, base: row.base, x1: it.x1, x2: it.x2,
                  y1: it.y1, y2: it.y2, str: it.str, items: [it],
                  bold: it.bold, italic: it.italic, fontName: it.fontName,
                  fontSize: it.fontSize };
          out.push(run);
        } else {
          run.str += (gap > (it.fontSize ?? 10) * 0.15 ? ' ' : '') + it.str;
          run.x2 = it.x2;
          run.y1 = Math.min(run.y1, it.y1);
          run.y2 = Math.max(run.y2, it.y2);
          run.items.push(it);
        }
      }
      return out.map(c => ({ ...c, str: c.str.replace(/\s+/g, ' ').trim() }));
    });
  };

  // Column detection, method one: alignment frequency.
  //
  // Text in a real column shares an edge, and which edge depends on the column:
  // labels align left, money aligns right. So histogram BOTH edges, keep every
  // coordinate that recurs, and let each column declare the edge it was found on.
  //
  // The recovered Oct-2025 version picked one edge for the whole page, by
  // whichever scored higher overall. That loses the ordinary case of a table
  // with left-aligned labels and right-aligned amounts, where both signals are
  // real and describe different columns. Keeping both raises the opposite
  // problem, a column detected twice (once by each of its own edges), and the
  // containment filter below is what resolves it: a candidate supported by a
  // subset of another candidate's items is the same column seen twice, so drop it.
  //
  // What this still cannot see: a column whose members happen not to align at
  // all, and the boundary between two adjacent tables. `gutters` sees the first;
  // `lattice` sees the second.
  const columns = (items, opts = {}) => {
    items = textOnly(items, opts);
    const minCount = opts.minCount ?? 2;
    const tol = opts.tol ?? config.snap;
    const dupOverlap = opts.dupOverlap ?? 0.8;
    if (!items.length) return [];

    const candidates = (opts.edge ? [opts.edge] : ['x1', 'x2']).flatMap(key => {
      const snap = snapRound(items.map(i => i[key]), tol, 2);
      return [...Map.groupBy(items, i => snap(i[key]))]
        .filter(([, g]) => g.length >= minCount)
        .map(([at, group]) => ({
          edge: key, at: num(at), count: group.length, items: group,
          set: new Set(group.map(i => i.i ?? i)),
          x1: num(Math.min(...group.map(i => i.x1))),
          x2: num(Math.max(...group.map(i => i.x2))),
        }));
    });

    const kept = [];
    for (const c of candidates.toSorted((a, b) => b.count - a.count || a.x1 - b.x1)) {
      const covered = kept.some(k => {
        const shared = [...c.set].filter(id => k.set.has(id)).length;
        return shared / c.set.size >= dupOverlap;
      });
      if (!covered) kept.push(c);
    }
    return kept
      .map(({ set, ...c }) => c)
      .toSorted((a, b) => a.x1 - b.x1);
  };

  // Column detection, method two: whitespace.
  //
  // The complementary read. Project every item's horizontal extent onto the
  // x-axis and look at what is left over: a band of unoccupied x that persists
  // across most of the rows is a gutter, and gutters are where columns divide.
  //
  // This one sees columns that do not align internally, which frequency misses.
  // It is fooled by a single wide row (a title, a footnote) that spans the
  // gutter, which frequency is not. Run both.
  const gutters = (items, opts = {}) => {
    items = textOnly(items, opts);
    const minWidth = opts.minWidth ?? 6;
    if (!items.length) return [];
    const pageX1 = Math.min(...items.map(i => i.x1));
    const pageX2 = Math.max(...items.map(i => i.x2));
    const step = opts.step ?? 0.5;
    const bins = Math.max(1, Math.ceil((pageX2 - pageX1) / step));
    const hits = new Float64Array(bins);

    for (const it of items) {
      const a = Math.max(0, Math.floor((it.x1 - pageX1) / step));
      const b = Math.min(bins - 1, Math.ceil((it.x2 - pageX1) / step));
      for (let i = a; i <= b; i++) hits[i] += 1;
    }

    const threshold = opts.threshold ?? 0;
    const out = [];
    let start = null;
    for (let i = 0; i < bins; i++) {
      const empty = hits[i] <= threshold;
      if (empty && start === null) start = i;
      if (!empty && start !== null) {
        const x1 = pageX1 + start * step, x2 = pageX1 + i * step;
        if (x2 - x1 >= minWidth) out.push({ x1: num(x1), x2: num(x2), width: num(x2 - x1) });
        start = null;
      }
    }
    if (start !== null) {
      const x1 = pageX1 + start * step;
      if (pageX2 - x1 >= minWidth) out.push({ x1: num(x1), x2: num(pageX2), width: num(pageX2 - x1) });
    }
    return out;
  };

  // Turn a set of x boundaries into a table by assigning each chunk to the
  // last boundary it starts at or after. Start position, not centre: a value
  // that overruns into the next column still belongs to the one it began in,
  // which is the rule the 2026-05 splitter session arrived at by hand.
  const split = (items, boundaries, opts = {}) => {
    const bounds = [...boundaries].toSorted((a, b) => a - b);
    const cells = chunks(items, opts);
    const byRow = Map.groupBy(cells, c => `${c.page}:${c.base}`);
    const colOf = x => {
      let idx = 0;
      for (let i = 0; i < bounds.length; i++) if (x >= bounds[i] - 0.5) idx = i;
      return idx;
    };
    return [...byRow.values()]
      .map(row => {
        const cols = Array.from({ length: Math.max(1, bounds.length) }, () => []);
        for (const c of row) cols[colOf(c.x1)].push(c.str);
        return {
          page: row[0].page,
          base: row[0].base,
          cells: cols.map(parts => parts.join(' ').trim()),
        };
      })
      .toSorted((a, b) => a.page - b.page || b.base - a.base);
  };

  // Content that lands in the same place on many pages: running heads, folios,
  // rules, watermarks, the standing furniture of a document.
  //
  // This is the mechanical half of the layered view. Stacking pages on a z-axis
  // makes the furniture obvious to a reader, because repetition reads as a
  // column through the stack, but the eye is not the detector: repetition at a
  // position across pages is countable, and counting it is what lets a trim be
  // proposed rather than guessed at. The view then shows what the count found.
  //
  // `varies` separates the two kinds. A running head repeats its text; a folio
  // repeats its position and changes its text every page. Both are furniture,
  // and a caller that wants to strip page numbers while keeping headers needs
  // to tell them apart.
  const recurring = (items, opts = {}) => {
    const tol = opts.tol ?? 3;
    const minRatio = opts.minRatio ?? 0.5;
    const list = textOnly(items, opts);
    const pageCount = opts.pages ?? uniq(list.map(i => i.page)).length;
    if (!pageCount) return [];

    const snapX = snapRound(list.map(i => i.x1), tol, 1);
    const snapY = snapRound(list.map(i => i.base), tol, 1);
    const groups = Map.groupBy(list, i => `${snapX(i.x1)}|${snapY(i.base)}`);

    return [...groups.values()]
      .map(g => {
        const pages = uniq(g.map(i => i.page)).toSorted((a, b) => a - b);
        const texts = uniq(g.map(i => i.str));
        return {
          x1: num(Math.min(...g.map(i => i.x1))), x2: num(Math.max(...g.map(i => i.x2))),
          y1: num(Math.min(...g.map(i => i.y1))), y2: num(Math.max(...g.map(i => i.y2))),
          base: num(g[0].base),
          pages, count: pages.length, ratio: +(pages.length / pageCount).toFixed(3),
          varies: texts.length > 1,
          samples: texts.slice(0, 3),
          items: g,
        };
      })
      .filter(r => r.count > 1 && r.ratio >= minRatio)
      .toSorted((a, b) => b.ratio - a.ratio || b.base - a.base);
  };

  // Keep or drop by a region that has a page axis: a 2D box plus a page range.
  //
  // This is the whole of "trimming in three dimensions", and it is deliberately
  // small. A trim that is axis-aligned needs six numbers, and six numbers are
  // better set by sliders than by a gesture: there is no honest way to drag a
  // depth in a projection, and pretending otherwise buys an interaction that
  // lies about which plane it moved.
  //
  // Returns both halves. What a trim removes is as worth seeing as what it
  // keeps, since the mistake to catch is cutting off a row of data along with
  // the footer.
  const trim = (items, region = {}) => {
    const { x1 = -Infinity, y1 = -Infinity, x2 = Infinity, y2 = Infinity,
            pageFrom = -Infinity, pageTo = Infinity, mode = 'keep' } = region;
    const within = i =>
      i.x1 >= x1 && i.x2 <= x2 && i.y1 >= y1 && i.y2 <= y2 &&
      i.page >= pageFrom && i.page <= pageTo;
    const inside = items.filter(within);
    const outside = items.filter(i => !within(i));
    return mode === 'drop'
      ? { kept: outside, removed: inside }
      : { kept: inside, removed: outside };
  };

  const stream = { rows, chunks, columns, gutters, split, recurring, trim };

  // ==========================================================================
  // 3. lattice — structure inferred from the rules drawn on the page. Pure.
  // ==========================================================================

  // Every place a horizontal rule crosses a vertical one. Junctions are keyed
  // by snapped position, and each carries the ids of every line through it,
  // because "are these two corners connected" is answered by asking whether
  // they share a line, not by re-testing geometry.
  const junctions = (h, v, opts = {}) => {
    const tol = opts.intersect ?? config.intersect;
    const snapTol = opts.snap ?? config.snap;
    const found = [];

    h.forEach((hl, hi) => v.forEach((vl, vi) => {
      const onH = vl.x >= hl.x1 - tol && vl.x <= hl.x2 + tol;
      const onV = hl.y >= vl.y1 - tol && hl.y <= vl.y2 + tol;
      if (onH && onV) found.push({ x: vl.x, y: hl.y, hi, vi });
    }));

    const snapX = snapRound(found.map(p => p.x), snapTol, 2);
    const snapY = snapRound(found.map(p => p.y), snapTol, 2);
    const byKey = new Map();
    for (const p of found) {
      const x = snapX(p.x), y = snapY(p.y), key = `${x}|${y}`;
      let j = byKey.get(key);
      if (!j) byKey.set(key, j = { x, y, h: new Set(), v: new Set() });
      j.h.add(p.hi); j.v.add(p.vi);
    }
    return [...byKey.values()].toSorted((a, b) => b.y - a.y || a.x - b.x);
  };

  const shares = (a, b) => [...a].some(id => b.has(id));

  // Atomic cells: the smallest closed rectangles in the junction network.
  //
  // From each junction taken as a top-left corner, step right to the nearest
  // junction sharing a horizontal rule, step down to the nearest sharing a
  // vertical rule, then require that the implied fourth corner exists AND is
  // itself connected both ways. Taking the NEAREST neighbour in each direction
  // is what makes the result atomic: a larger rectangle enclosing a subdivided
  // one is never reached, because the walk stops at the first interior corner.
  //
  // The fourth-corner check is the whole load-bearing step. Three corners
  // existing proves nothing; an L of rules produces three corners and no cell.
  const cells = (juncs, opts = {}) => {
    const tol = opts.snap ?? config.snap;
    const at = new Map(juncs.map(j => [`${j.x}|${j.y}`, j]));
    const byY = Map.groupBy(juncs, j => j.y);
    const byX = Map.groupBy(juncs, j => j.x);
    for (const g of byY.values()) g.sort((a, b) => a.x - b.x);
    for (const g of byX.values()) g.sort((a, b) => b.y - a.y);

    const out = [];
    for (const tl of juncs) {
      const right = (byY.get(tl.y) ?? []).filter(j => j.x > tl.x + tol);
      const down = (byX.get(tl.x) ?? []).filter(j => j.y < tl.y - tol);

      const tr = right.find(j => shares(tl.h, j.h));
      const bl = down.find(j => shares(tl.v, j.v));
      if (!tr || !bl) continue;

      const br = at.get(`${tr.x}|${bl.y}`);
      if (!br) continue;
      if (!shares(tr.v, br.v) || !shares(bl.h, br.h)) continue;

      out.push({ ...box(tl.x, bl.y, tr.x, tl.y) });
    }
    return out;
  };

  // Group cells into tables. Adjacency is a shared corner, not a shared edge:
  // corner-touching keeps a table whole across a row whose interior rules are
  // fragmented, where edge-matching would split it in two.
  const cluster = (cellList, opts = {}) => {
    const tol = opts.snap ?? config.snap;
    const corners = c => [[c.x1, c.y1], [c.x1, c.y2], [c.x2, c.y1], [c.x2, c.y2]];
    const parent = cellList.map((_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

    const keyOf = ([x, y]) => `${Math.round(x / tol)}|${Math.round(y / tol)}`;
    const seen = new Map();
    cellList.forEach((c, i) => {
      for (const pt of corners(c)) {
        const k = keyOf(pt);
        if (seen.has(k)) union(i, seen.get(k)); else seen.set(k, i);
      }
    });

    const groups = Map.groupBy(cellList.map((c, i) => ({ c, root: find(i) })), o => o.root);
    return [...groups.values()]
      .map(g => g.map(o => o.c))
      .map(cs => ({
        cells: cs,
        x1: Math.min(...cs.map(c => c.x1)), y1: Math.min(...cs.map(c => c.y1)),
        x2: Math.max(...cs.map(c => c.x2)), y2: Math.max(...cs.map(c => c.y2)),
      }))
      .toSorted((a, b) => b.y2 - a.y2 || a.x1 - b.x1);
  };

  // The anchor system: derive the logical grid from the data instead of
  // assuming one. Collect every distinct cell boundary, sort, and the gaps
  // between consecutive anchors ARE the logical columns and rows. A table with
  // ragged row heights simply yields more anchors, and a cell covering several
  // gaps is a span. Nothing has to know the table's shape in advance.
  //
  // The cost of that elegance: one stray coordinate does not merely shift an
  // index, it inserts a phantom row or column that every later cell then
  // straddles. Snap tolerance is what stands between you and that, which is why
  // it is the first tolerance to reach for when a grid comes out wrong.
  const anchorGrid = (table, opts = {}) => {
    const tol = opts.snap ?? config.snap;
    const cs = table.cells ?? table;
    const cols = geom.anchors(cs.flatMap(c => [c.x1, c.x2]), tol);
    const rowsAsc = geom.anchors(cs.flatMap(c => [c.y1, c.y2]), tol);
    const rowAnchors = [...rowsAsc].reverse(); // top-to-bottom reading order

    const near = (v, list) => {
      let best = 0, bestD = Infinity;
      list.forEach((a, i) => { const d = Math.abs(a - v); if (d < bestD) { bestD = d; best = i; } });
      return bestD <= tol * 2 ? best : -1;
    };

    const placed = cs.map(c => {
      const c1 = near(c.x1, cols), c2 = near(c.x2, cols);
      const r1 = near(c.y2, rowAnchors), r2 = near(c.y1, rowAnchors);
      return { ...c, row: r1, col: c1, rowspan: Math.max(1, r2 - r1), colspan: Math.max(1, c2 - c1) };
    }).filter(c => c.row >= 0 && c.col >= 0);

    return {
      cols: cols.length - 1,
      rows: rowAnchors.length - 1,
      colAnchors: cols,
      rowAnchors,
      cells: placed.toSorted((a, b) => a.row - b.row || a.col - b.col),
    };
  };

  // Put the text in the cells. Majority overlap rather than centroid: a line
  // whose baseline sits exactly on a rule has its box straddling two cells, and
  // its centroid can land in the wrong one, while the overlap areas are not
  // close. Cells grow by `pad` first, because text routinely overruns its cell
  // by a fraction of a point through nothing but coordinate rounding.
  const assign = (grid, textItems, opts = {}) => {
    const pad = opts.pad ?? config.pad;
    const rule = opts.rule ?? 'overlap';
    const padded = grid.cells.map(c => ({ cell: c, bbox: grow(c, pad) }));
    const unplaced = [];

    for (const t of textItems) {
      const tb = box(t.x1, t.y1, t.x2, t.y2);
      let best = null, bestScore = 0;
      for (const p of padded) {
        const score = rule === 'centroid'
          ? (contains(p.bbox, centroid(tb)) ? 1 : 0)
          : overlapArea(p.bbox, tb) / (area(tb) || 1);
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best && bestScore > (rule === 'centroid' ? 0 : 0.001)) {
        (best.cell.text ??= []).push(t);
      } else unplaced.push(t);
    }

    for (const c of grid.cells) {
      c.text ??= [];
      c.str = c.text
        .toSorted((a, b) => b.base - a.base || a.x1 - b.x1)
        .map(t => t.str).join(' ').replace(/\s+/g, ' ').trim();
    }
    return { ...grid, unplaced };
  };

  // Flatten a placed grid into a dense array-of-arrays, spans expanded by
  // repeating the owning cell's text. What a spreadsheet wants.
  const toMatrix = (grid, opts = {}) => {
    const fill = opts.spans === 'blank' ? () => '' : null;
    const m = Array.from({ length: grid.rows }, () => Array(grid.cols).fill(''));
    for (const c of grid.cells) {
      for (let r = c.row; r < c.row + c.rowspan && r < grid.rows; r++)
        for (let k = c.col; k < c.col + c.colspan && k < grid.cols; k++)
          m[r][k] = (r === c.row && k === c.col) ? (c.str ?? '') : (fill ? fill() : (c.str ?? ''));
    }
    return m;
  };

  // The whole lattice pipeline, in the order the stages depend on each other.
  // Geometric reduction first: everything downstream is only as good as the
  // line set it walks, and reduction is the stage that is skipped and then
  // blamed on tolerances.
  const grids = (paths, textItems = [], opts = {}) => {
    const o = { ...config, ...opts };
    let h = geom.usable(paths.h ?? [], 'h', o);
    let v = geom.usable(paths.v ?? [], 'v', o);
    h = geom.joinCollinear(geom.dedupe(h, 'h'), 'h', o);
    v = geom.joinCollinear(geom.dedupe(v, 'v'), 'v', o);

    const js = junctions(h, v, o);
    const cs = cells(js, o);
    return cluster(cs, o).map(table => {
      const grid = anchorGrid(table, o);
      const placed = textItems.length ? assign(grid, textItems, o) : grid;
      return { ...placed, x1: table.x1, y1: table.y1, x2: table.x2, y2: table.y2,
               matrix: toMatrix(placed, o) };
    });
  };

  const lattice = { junctions, cells, cluster, anchorGrid, assign, toMatrix, grids };

  // ==========================================================================
  // 3b. view — PDF space to screen space, and back. Pure.
  // ==========================================================================

  // The bridge every overlay needs and every previous attempt rewrote inline.
  //
  // A page's viewport carries an affine transform that folds together scale,
  // rotation, and the y-flip from PDF's bottom-left origin to the screen's
  // top-left. Two mistakes follow from not having this in one place, and the
  // 2026-05 splitter hit both: mouse pixels converted back to PDF units by
  // dividing by the scale, which ignores the translation and drifts; and
  // splitters stored in one space while text was compared in the other.
  //
  // `view` takes a pdf.js viewport, or any `{width, height, transform}`, so it
  // is testable with a hand-written matrix and no pdf.js in the room. Decide
  // once which space you are working in. Screen is usually right, because that
  // is the space the pointer speaks.
  const view = (viewport) => {
    const m = viewport.transform ?? [1, 0, 0, -1, 0, viewport.height ?? 0];
    const [a, b, c, d, e, f] = m;

    const det = a * d - b * c;
    if (!det) throw new Error('view(): degenerate viewport transform');
    const inv = [d / det, -b / det, -c / det, a / det,
                 (c * f - d * e) / det, (b * e - a * f) / det];

    const to = (x, y) => [a * x + c * y + e, b * x + d * y + f];
    const from = (px, py) => [inv[0] * px + inv[2] * py + inv[4],
                              inv[1] * px + inv[3] * py + inv[5]];

    // A box's corners can swap under the flip, so normalize after projecting
    // rather than assuming which corner stays top-left.
    const projectBox = bx => {
      const [x1, ya] = to(bx.x1, bx.y1);
      const [x2, yb] = to(bx.x2, bx.y2);
      return {
        x: num(Math.min(x1, x2)), y: num(Math.min(ya, yb)),
        w: num(Math.abs(x2 - x1)), h: num(Math.abs(yb - ya)),
        left: num(Math.min(x1, x2)), top: num(Math.min(ya, yb)),
        right: num(Math.max(x1, x2)), bottom: num(Math.max(ya, yb)),
      };
    };

    const projectItem = it => ({
      ...projectBox(it),
      str: it.str, source: it,
      glyphs: (it.glyphs ?? []).map(g => ({
        char: g.char, underline: g.underline, strikethrough: g.strikethrough,
        ...projectBox({ x1: g.x1, y1: it.y1, x2: g.x2, y2: it.y2 }),
      })),
    });

    const projectLine = (l, axis) => axis === 'h'
      ? { ...projectBox({ x1: l.x1, y1: l.y, x2: l.x2, y2: l.y }), source: l }
      : { ...projectBox({ x1: l.x, y1: l.y1, x2: l.x, y2: l.y2 }), source: l };

    const hit = (rect, b) => !(rect.right < b.left || rect.left > b.right ||
                               rect.bottom < b.top || rect.top > b.bottom);
    const inside = (rect, b) => b.left >= rect.left && b.right <= rect.right &&
                                b.top >= rect.top && b.bottom <= rect.bottom;

    return {
      viewport, transform: m,
      point: (x, y) => { const [px, py] = to(x, y); return { x: num(px), y: num(py) }; },
      unpoint: (px, py) => { const [x, y] = from(px, py); return { x: num(x), y: num(y) }; },
      box: projectBox,

      // The reverse of `box`, for a rectangle the user dragged on screen.
      unbox: r => {
        const [x1, ya] = from(r.left ?? r.x, r.top ?? r.y);
        const [x2, yb] = from((r.right ?? r.x + r.w), (r.bottom ?? r.y + r.h));
        return box(x1, ya, x2, yb);
      },

      items: list => list.map(projectItem),
      lines: paths => ({
        h: (paths.h ?? []).map(l => projectLine(l, 'h')),
        v: (paths.v ?? []).map(l => projectLine(l, 'v')),
      }),
      cells: grid => (grid.cells ?? grid).map(c => ({ ...projectBox(c), source: c })),

      // Point hit test. Screen coordinates in, the topmost matching item out.
      // Boxes are typographical containers, so a hit near a glyph's edge can
      // land in a neighbouring item; `pad` shrinks rather than grows for that
      // reason, which is the opposite of what cell assignment wants.
      at(px, py, projected, { pad = 0 } = {}) {
        return projected.find(b =>
          px >= b.left + pad && px <= b.right - pad &&
          py >= b.top + pad && py <= b.bottom - pad) ?? null;
      },

      // Drag selection. `mode: 'intersect'` (default) keeps anything the
      // rectangle touches, which is what a reader expects from dragging across
      // text; `mode: 'contain'` keeps only what is fully enclosed, which is what
      // you want when isolating a region to extract.
      select(rect, projected, { mode = 'intersect' } = {}) {
        const r = {
          left: Math.min(rect.left ?? rect.x, rect.right ?? rect.x + rect.w),
          right: Math.max(rect.left ?? rect.x, rect.right ?? rect.x + rect.w),
          top: Math.min(rect.top ?? rect.y, rect.bottom ?? rect.y + rect.h),
          bottom: Math.max(rect.top ?? rect.y, rect.bottom ?? rect.y + rect.h),
        };
        const test = mode === 'contain' ? inside : hit;
        return projected.filter(b => test(r, b));
      },
    };
  };

  // ==========================================================================
  // 3c. find — text search over extracted items. Pure.
  // ==========================================================================
  //
  // "Ctrl+F for a PDF drawn to a canvas." The reading column rasterises each
  // page, so there is no DOM text for the browser's own find to reach; the
  // text is in the `items` this kit already extracts. This layer is the search
  // half: given items and a query it returns hits, each a page and the
  // rectangles (in PDF user space) the match occupies, so a host can lay a
  // highlight over the canvas exactly where `flow` draws the mark below.
  //
  // It is the general form of the appendix locator that budget-drs carries:
  // that one searches a fixed set of checklist lines and this one searches
  // whatever a reader types, but both fold typographic marks to ASCII, join
  // pdf.js's split text items with a single space, and merge the covered boxes
  // into one rectangle per printed line. The normalizations are layout, not
  // language: they change how a line is SET, never a word in it.

  // The marks pdf.js and a transcriber spell differently but a reader reads the
  // same. Case is folded too, since find is case-insensitive by default.
  const FIND_FOLD = { '’': "'", '‘': "'", '“': '"', '”': '"',
                      '–': '-', '—': '-', '−': '-', ' ': ' ' };
  const foldChar = (c) => FIND_FOLD[c] || c;

  // Normalize a query: fold marks, collapse whitespace, drop the ends, and
  // lower-case unless the caller asked to keep it. No position tracking, since
  // a needle has no page to point back to.
  const normalizeQuery = (text, caseSensitive) => {
    let out = '', prevSpace = true;
    for (const raw of String(text)) {
      const c = foldChar(raw);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        if (!prevSpace) { out += ' '; prevSpace = true; }
      } else { out += caseSensitive ? c : c.toLowerCase(); prevSpace = false; }
    }
    return out.replace(/ $/, '');
  };

  // Flatten one page's items into a single searchable string, carrying a map
  // from every output character back to the item and glyph it came from. The
  // map is what turns a string offset into a place on the page: without it a
  // match is an index into text that has no coordinates. A space is inserted
  // between two items so words pdf.js split across items still read as words;
  // the narrow cost is a word pdf.js split mid-token, which then carries a
  // space the reader does not see and a search for the joined form misses.
  const flattenItems = (items, caseSensitive) => {
    let s = '', prevSpace = true;
    const map = [];
    const push = (c, item, glyph) => {
      if (c === ' ') { if (prevSpace) return; prevSpace = true; }
      else prevSpace = false;
      s += c; map.push({ item, glyph });
    };
    items.forEach((it, ii) => {
      const str = it.str || '';
      const glyphs = it.glyphs && it.glyphs.length === str.length ? it.glyphs : null;
      let gi = 0;
      for (const raw of str) {
        const f = foldChar(raw);
        const c = (f === '\t' || f === '\n' || f === '\r') ? ' '
                : caseSensitive ? f : f.toLowerCase();
        push(c, ii, glyphs ? gi : -1);
        gi++;
      }
      // A space between items, except where the run ends on a hyphen: that is a
      // word carrying onto the next line, and a space there would break it.
      if (ii < items.length - 1 && s.slice(-1) !== '-') push(' ', ii, -1);
    });
    return { text: s, map };
  };

  // The x-extent of one matched character, from its glyph box when the item
  // carries per-glyph positions, and otherwise from a proportional split of the
  // item's width. The split is approximate for a proportional font but only
  // ever narrows a highlight within a line the merge is about to widen anyway.
  const glyphSpan = (it, glyphIndex) => {
    if (glyphIndex >= 0 && it.glyphs && it.glyphs[glyphIndex]) {
      const g = it.glyphs[glyphIndex];
      return { x1: g.x1, x2: g.x2 };
    }
    return { x1: it.x1, x2: it.x2 };
  };

  // Merge the boxes a match covers into one rectangle per printed line. Items
  // sharing a baseline (within tol) are one line; a wrapped continuation is
  // another. Boxes are PDF user space: x/y is the lower-left, y up.
  const mergeBoxesByLine = (boxes, tol = 2) => {
    const lines = [];
    boxes.forEach((b) => {
      const hit = lines.find((l) => Math.abs(l.y - b.y) <= tol);
      if (!hit) { lines.push({ x: b.x, y: b.y, w: b.w, h: b.h }); return; }
      const right = Math.max(hit.x + hit.w, b.x + b.w);
      hit.x = Math.min(hit.x, b.x);
      hit.w = right - hit.x;
      hit.h = Math.max(hit.h, b.h);
    });
    return lines.sort((a, b) => b.y - a.y);
  };

  // The rectangles one match [from, to) occupies, keyed by the covering items.
  // A character contributes its glyph span in x and its item's band in y; the
  // per-item spans are unioned, then merged per line.
  const rectsForRange = (items, map, from, to) => {
    const perItem = new Map();
    for (let i = from; i < to; i++) {
      const m = map[i];
      if (!m || m.item == null) continue;
      const it = items[m.item];
      if (!it) continue;
      const span = glyphSpan(it, m.glyph);
      const cur = perItem.get(m.item);
      if (!cur) perItem.set(m.item, { x1: span.x1, x2: span.x2, y1: it.y1, y2: it.y2 });
      else { cur.x1 = Math.min(cur.x1, span.x1); cur.x2 = Math.max(cur.x2, span.x2); }
    }
    const boxes = [...perItem.values()].map((b) => ({ x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 }));
    return mergeBoxesByLine(boxes);
  };

  // Search a run of items (any number of pages) for a query. Returns every
  // occurrence in reading order: page first, then top-to-bottom, left-to-right.
  // Each hit carries the page, its ordinal among all hits, the merged
  // rectangles, and a short snippet for a results list. `limit` caps a runaway
  // query (a single letter across a long document) rather than hanging.
  const search = (items, query, opts = {}) => {
    const caseSensitive = !!opts.caseSensitive;
    const limit = opts.limit ?? 2000;
    const needle = normalizeQuery(query, caseSensitive);
    if (!needle) return { query: '', count: 0, hits: [] };
    const byPage = new Map();
    for (const it of items) {
      const p = it.page ?? 1;
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(it);
    }
    const hits = [];
    for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
      const pageItems = byPage.get(page);
      const flat = flattenItems(pageItems, caseSensitive);
      let at = flat.text.indexOf(needle);
      while (at >= 0) {
        const rects = rectsForRange(pageItems, flat.map, at, at + needle.length);
        if (rects.length) {
          const s = Math.max(0, at - 12), e = Math.min(flat.text.length, at + needle.length + 12);
          hits.push({ page, rects, snippet: flat.text.slice(s, e).trim() });
        }
        if (hits.length >= limit) return finish(hits, needle);
        at = flat.text.indexOf(needle, at + needle.length);
      }
    }
    return finish(hits, needle);
  };
  const finish = (hits, needle) => {
    // Ordinals run low page to high (the grouping above sorted them), then in
    // the order the matches were found, which is the items' document order and
    // so the reading order for ordinary text.
    hits.forEach((h, i) => { h.ordinal = i; });
    return { query: needle, count: hits.length, hits };
  };

  const find = { search, normalizeQuery, flattenItems, rectsForRange, foldChar };

  // ==========================================================================
  // 4. open — the pdf.js boundary. Everything above is pure; this is not.
  // ==========================================================================

  const script = (src) => new Promise((res, rej) => {
    Object.assign(document.head.appendChild(document.createElement('script')),
      { src, onload: res, onerror: rej });
  });

  // TWO LOADERS, because the two libraries answer to different callers and one
  // of them is much the larger. pdf.js READS a document (parse, text, operator
  // lists, render); pdf-lib WRITES one (slice, merge), and nothing under `doc`
  // is reachable without asking for it by name. A viewer showing page 1 of a
  // report was paying for the editor anyway, roughly a megabyte it would never
  // call, on a phone, before the first pixel. So `loadPdfjs` is the reading
  // half and `loadPdfLib` the writing half; `loadLibs` still means both and is
  // still what a caller reaches for when unsure.
  let pdfjsReady = null;
  const loadPdfjs = async () => pdfjsReady ??= (async () => {
    if (!window.pdfjsLib) await script(CDN.pdfjs);
    // Only claim the worker if nobody else has. A page that brought its own
    // pdf.js has already pointed this at a matching worker, and overwriting it
    // with this kit's pinned URL mixes two builds: the failure surfaces as
    // "Setting up fake worker failed", which names neither cause.
    const opts = window.pdfjsLib.GlobalWorkerOptions;
    if (!opts.workerSrc) opts.workerSrc = CDN.worker;
  })();

  let pdfLibReady = null;
  const loadPdfLib = async () => pdfLibReady ??= (async () => {
    if (!window.PDFLib) await script(CDN.pdfLib);
  })();

  const loadLibs = async () => { await Promise.all([loadPdfjs(), loadPdfLib()]); };

  // Distribute an item's known total width across its characters.
  //
  // 'uniform' divides evenly. It is wrong for any proportional font (an "i"
  // gets the width of a "W") and it is what the 2026-05 class shipped.
  //
  // 'canvas' measures each character with the browser's own text engine using
  // the item's resolved fontFamily, then scales the whole run so the advances
  // still sum to the width pdf.js reported. Font substitution therefore shifts
  // the proportions a little but cannot shift the total, which is the error
  // that actually moved glyph boxes off their ink.
  const advances = (str, width, fontFamily, mode) => {
    const chars = [...str];
    if (!chars.length) return [];
    if (mode !== 'canvas' || typeof document === 'undefined') {
      return chars.map(() => width / chars.length);
    }
    const ctx = (advances._ctx ??= document.createElement('canvas').getContext('2d'));
    ctx.font = `10px ${fontFamily || 'sans-serif'}`;
    const raw = chars.map(c => ctx.measureText(c).width);
    const total = sum(raw);
    return total > 0 ? raw.map(w => (w / total) * width) : chars.map(() => width / chars.length);
  };

  // `Array.from` first, and not for tidiness: pdf.js hands colour operands over
  // as a Uint8ClampedArray, whose `.map` returns another Uint8ClampedArray and
  // coerces each hex string back to a number. Mapping in place therefore turns
  // every colour into #000 silently, white included, which defeats the
  // white-stroke filter without producing an error anywhere.
  const toHex = rgb => '#' + Array.from(rgb)
    .map(c => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0')).join('');

  const mul = ([a, b, c, d, e, f], [A, B, C, D, E, F]) =>
    [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];

  const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f];

  // Walk one page's operator list and return every horizontal and vertical
  // stroke in page space.
  //
  // The matrix stack is the part that earns its keep. PDF draws each path in
  // whatever space the enclosing transform established, so a rule's raw
  // coordinates say nothing about where it lands relative to the text. Track
  // save/restore/transform and project every endpoint through the current
  // matrix, and only then can you ask whether a line sits under a word.
  const extractPaths = (opList, pageNum, opsReverse) => {
    const h = [], v = [];
    const stack = [[1, 0, 0, 1, 0, 0]];
    const cur = () => stack.at(-1);
    let gs = { stroke: '#000000', fill: '#000000', lineWidth: 1 };
    let id = 0;

    const addLine = (x1, y1, x2, y2, origin) => {
      const [px1, py1] = apply(cur(), x1, y1);
      const [px2, py2] = apply(cur(), x2, y2);
      const dx = Math.abs(px1 - px2), dy = Math.abs(py1 - py2);
      const isH = dy < 0.5 && dx > 0.5, isV = dx < 0.5 && dy > 0.5;
      if (!isH && !isV) return;
      const color = origin.includes('rect') ? gs.fill : gs.stroke;
      const base = { id: id++, page: pageNum, origin, color, width: gs.lineWidth };
      if (isH) h.push({ ...base, y: num(py1), x1: num(Math.min(px1, px2)), x2: num(Math.max(px1, px2)) });
      else v.push({ ...base, x: num(px1), y1: num(Math.min(py1, py2)), y2: num(Math.max(py1, py2)) });
    };

    // A "line" in a PDF is very often a filled rectangle a fraction of a point
    // thick, not a stroke. Collapse those slivers to their centreline or the
    // lattice never sees the rule at all.
    const addRect = (x, y, w, hh, origin) => {
      const thinW = Math.abs(w) <= 1, thinH = Math.abs(hh) <= 1;
      if (thinW && !thinH) addLine(x + w / 2, y, x + w / 2, y + hh, 'sliver');
      else if (thinH && !thinW) addLine(x, y + hh / 2, x + w, y + hh / 2, 'sliver');
      else if (!thinW && !thinH) {
        addLine(x, y, x + w, y, origin); addLine(x, y + hh, x + w, y + hh, origin);
        addLine(x, y, x, y + hh, origin); addLine(x + w, y, x + w, y + hh, origin);
      }
    };

    opList.fnArray.forEach((code, i) => {
      const op = opsReverse[code] ?? code, args = opList.argsArray[i];
      if (op === 'save') return void stack.push([...cur()]);
      if (op === 'restore') return void (stack.length > 1 && stack.pop());
      if (op === 'transform') return void stack.push(mul(cur(), args));
      if (op === 'setLineWidth') gs.lineWidth = args[0];
      else if (op === 'setStrokeRGBColor' || op === 'setStrokeColorRGB') gs.stroke = toHex(args);
      else if (op === 'setFillRGBColor' || op === 'setFillColorRGB') gs.fill = toHex(args);
      else if (op === 'setStrokeGray') { const g = args[0] * 255; gs.stroke = toHex([g, g, g]); }
      else if (op === 'setFillGray') { const g = args[0] * 255; gs.fill = toHex([g, g, g]); }
      else if (op === 'constructPath') {
        const [pathOps, coords] = args;
        let ci = 0, lx = 0, ly = 0;
        for (const p of pathOps) {
          const n = opsReverse[p];
          if (n === 'moveTo') { lx = coords[ci++]; ly = coords[ci++]; }
          else if (n === 'lineTo') {
            const tx = coords[ci++], ty = coords[ci++];
            addLine(lx, ly, tx, ty, 'path'); lx = tx; ly = ty;
          } else if (n === 'rectangle') {
            const [rx, ry, rw, rh] = [coords[ci++], coords[ci++], coords[ci++], coords[ci++]];
            addRect(rx, ry, rw, rh, 'path_rect'); lx = rx; ly = ry;
          } else if (n === 'curveTo') ci += 6;
          else if (n === 'curveTo2' || n === 'curveTo3') ci += 4;
        }
      } else if (op === 'rectangle') addRect(args[0], args[1], args[2], args[3], 'rect');
    });
    return { h, v };
  };

  // Mark glyphs whose x-extent is covered by a horizontal rule at the right
  // offset from the baseline. Doing this per glyph rather than per item is what
  // makes partial decoration expressible: half an underlined phrase inside one
  // text item was previously unrepresentable, so the whole item got flagged.
  const decorate = (item, pageH) => {
    const { base, fontSize } = item;
    for (const g of item.glyphs) {
      const gx1 = g.x1 - 0.5, gx2 = g.x2 + 0.5;
      const spans = l => l.x1 <= gx2 && l.x2 >= gx1;
      const under = pageH
        .filter(l => base - l.y > 0 && base - l.y < 3 && spans(l))
        .toSorted((a, b) => (base - a.y) - (base - b.y))[0];
      const strikeY = base + fontSize * 0.3;
      const strike = under ? null : pageH
        .filter(l => Math.abs(l.y - strikeY) < 2 && spans(l))
        .toSorted((a, b) => Math.abs(a.y - strikeY) - Math.abs(b.y - strikeY))[0];
      g.underline = !!under; g.strikethrough = !!strike;
      if (under) under.role ??= 'underline';
      if (strike) strike.role ??= 'strikethrough';
    }
    item.underline = item.glyphs.some(g => g.underline);
    item.strikethrough = item.glyphs.some(g => g.strikethrough);
    // A range, not a flag, so a caller can see which characters carry it.
    item.decoration = item.glyphs
      .map((g, i) => ({ i, u: g.underline, s: g.strikethrough }))
      .filter(g => g.u || g.s)
      .map(g => ({ at: g.i, kind: g.u ? 'underline' : 'strikethrough' }));
  };

  class PdfDocument {
    constructor(opts = {}) {
      // Per-instance, in the constructor, deliberately. The April 2026 sessions
      // lost a day to two documents sharing one array because the fields were
      // first assigned inside a method: the second load mutated the first's
      // data through a prototype-shared reference.
      this.opts = { measure: 'canvas', ...opts };
      this.pdfDoc = null;
      this.pages = [];
      this.items = [];
      this.paths = { h: [], v: [] };
      this.fonts = {};
      this.bytes = null;
      this.info = {};
      this.outline = [];
    }

    get numPages() { return this.pdfDoc?.numPages ?? 0; }

    async loadBytes(buf) {
      await loadPdfjs();
      // Clone before handing to the worker: pdf.js transfers the buffer, and a
      // shared source array leaves the previous document holding a detached one.
      this.bytes = new Uint8Array(buf.slice(0));
      this.pdfDoc = await window.pdfjsLib.getDocument({ data: this.bytes.slice(0) }).promise;
      this.pages = await Promise.all(Array.from({ length: this.pdfDoc.numPages },
        (_, i) => this.pdfDoc.getPage(i + 1)));

      const [texts, ops] = await Promise.all([
        Promise.all(this.pages.map(p => p.getTextContent())),
        Promise.all(this.pages.map(p => p.getOperatorList())),
      ]);

      const OPS = window.pdfjsLib.OPS;
      const opsReverse = Object.fromEntries(Object.entries(OPS).map(([k, val]) => [val, k]));

      this.paths = { h: [], v: [] };
      for (let i = 0; i < this.pages.length; i++) {
        const { h, v } = extractPaths(ops[i], i + 1, opsReverse);
        this.paths.h.push(...h);
        this.paths.v.push(...v);
      }
      this.paths.h = geom.dedupe(this.paths.h, 'h');
      this.paths.v = geom.dedupe(this.paths.v, 'v');

      this.fonts = {};
      for (let i = 0; i < this.pages.length; i++) {
        const co = this.pages[i].commonObjs;
        const keys = uniq(texts[i].items.map(t => t.fontName).filter(Boolean));
        await Promise.all(keys.filter(k => !this.fonts[k]).map(k => new Promise(res => {
          try {
            co.get(k, val => {
              const name = (val?.name ?? '').replace(/^[A-Z]+\+/, '');
              this.fonts[k] = { name, bold: /bold|black|heavy/i.test(name), italic: /italic|oblique/i.test(name) };
              res();
            });
          } catch { this.fonts[k] = { name: '', bold: false, italic: false }; res(); }
        })));
        for (const [k, s] of Object.entries(texts[i].styles ?? {}))
          if (this.fonts[k]) this.fonts[k].fontFamily = s.fontFamily ?? null;
      }

      const raw = texts.flatMap((t, i) => t.items
        .filter(it => it.str !== undefined)
        .map(it => ({ ...it, page: i + 1 })));

      const snapX = snapRound(raw.map(it => it.transform[4]), this.opts.snap ?? config.snap, 2);
      const hByPage = Map.groupBy(this.paths.h, l => l.page);

      this.items = raw.map((it, i) => {
        const [fontSize, , , , rx, ry] = it.transform;
        const font = this.fonts[it.fontName] ?? {};
        const x1 = num(snapX(rx)), w = num(it.width), h = num(it.height);
        const widths = advances(it.str, w, font.fontFamily, this.opts.measure);
        let run = x1;
        const glyphs = [...it.str].map((char, gi) => {
          const g = { char, x1: num(run), x2: num(run + widths[gi]), underline: false, strikethrough: false };
          run += widths[gi];
          return g;
        });
        const item = {
          i, page: it.page, str: it.str,
          x1, x2: num(x1 + w), y1: num(ry), y2: num(ry + h), base: num(ry),
          w, h, fontSize: num(fontSize),
          fontName: font.name ?? null, fontFamily: font.fontFamily ?? null,
          bold: !!font.bold, italic: !!font.italic,
          glyphs,
        };
        decorate(item, hByPage.get(it.page) ?? []);
        return item;
      });

      [this.outline, this.info] = await Promise.all([this.loadOutline(), this.loadInfo()]);
      return this;
    }

    async load(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
      return this.loadBytes(await res.arrayBuffer());
    }

    async loadFile(file) { return this.loadBytes(await file.arrayBuffer()); }

    // Convenience views. Each is a fresh derivation over `items`, so a caller
    // can pass its own tolerances without disturbing anything cached.
    page(n) { return this.items.filter(i => i.page === n); }
    rows(n, o) { return stream.rows(n ? this.page(n) : this.items, o); }
    chunks(n, o) { return stream.chunks(n ? this.page(n) : this.items, o); }
    columns(n, o) { return stream.columns(n ? this.page(n) : this.items, o); }
    gutters(n, o) { return stream.gutters(n ? this.page(n) : this.items, o); }

    // A projection bound to one page's viewport. `scale` matches what you pass
    // to page.render(), so the overlay and the canvas share a space by
    // construction rather than by two callers agreeing.
    viewOf(n = 1, { scale = 1, rotation } = {}) {
      const page = this.pages[n - 1];
      if (!page) throw new Error(`viewOf(): no page ${n}`);
      return view(page.getViewport(rotation == null ? { scale } : { scale, rotation }));
    }

    linesOn(n) {
      return { h: this.paths.h.filter(l => l.page === n), v: this.paths.v.filter(l => l.page === n) };
    }

    grids(n, o) {
      const paths = n ? this.linesOn(n) : this.paths;
      return lattice.grids(paths, n ? this.page(n) : this.items, { ...this.opts, ...o });
    }

    text(delim = '\n') {
      return this.rows().map(r => r.str).join(delim);
    }

    // Find a query across the whole document, over the glyph-boxed `items` this
    // instance already holds. The glyphs make each match's rectangle tight to
    // the characters rather than to the whole text run. `flow` hosts that only
    // opened `firstLook` reach the same search lazily through `lookAt().find`.
    search(query, o) {
      return find.search(this.items, query, o);
    }

    async loadOutline(items = null, depth = 0) {
      if (!this.pdfDoc) return [];
      items ??= (await this.pdfDoc.getOutline()) || [];
      return (await Promise.all(items.map(async it => {
        const p = it.dest ? (await this.pdfDoc.getPageIndex(it.dest[0]).catch(() => -2)) + 1 : null;
        return [{ title: it.title, page: p > 0 ? p : null, depth },
                ...await this.loadOutline(it.items || [], depth + 1)];
      }))).flat();
    }

    async loadInfo() {
      if (!this.pdfDoc) return {};
      const { info, metadata } = await this.pdfDoc.getMetadata();
      return { ...info, ...(metadata?.getAll?.() || {}) };
    }
  }

  // ==========================================================================
  // ==========================================================================
  // 4b. firstLook — draw a page, and nothing else. pdf.js only.
  // ==========================================================================

  // The READING half, for a surface that wants to show a document rather than
  // take one apart. `open()` is the wrong entry point for that: it parses every
  // page's text content and operator list up front, which is exactly right
  // before a table read and wasted before a first page.
  //
  // It exists as a kit function because three surfaces now want the same
  // fifteen lines: the viewer's pdf mode, the file-review card's presentation
  // pane, and anything that follows. The device-pixel oversample and the 2x
  // ceiling are part of the answer rather than each caller's business, since
  // getting either wrong is invisible until someone reads 9pt type on a phone.
  // Wrap a pdf.js document that is ALREADY OPEN. `firstLook` is the common
  // case, bytes in and a reader out, but a host that already holds a document
  // (because it also searches the text, or locates a paragraph on a page) must
  // not be made to open a second copy of it: a pdf.js document is a worker plus
  // the bytes, and a second one of a 98-page manual is a real cost paid for
  // nothing. Both entry points return the same three functions, so `flow` and
  // every other reader cannot tell which was used.
  const lookAt = (doc) => {
    // Text is pulled per page only when something asks (find, below), and kept,
    // so a 200-page document costs nothing to open and is parsed once even if
    // the reader searches it twice. This is the whole reason find rides on
    // `lookAt` rather than on `open`: the reading column never wanted the text.
    const textCache = new Map();
    return {
      pages: doc.numPages,
      async size(n) {
        const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
        return { width: vp.width, height: vp.height, ratio: vp.height / vp.width };
      },
      // The viewport at a display scale, so a caller converting a PDF-space box
      // to canvas pixels carries the page's own rotation instead of assuming
      // none. `flow` uses it to place a find highlight.
      async viewport(n, scale = 1) {
        return (await doc.getPage(n)).getViewport({ scale });
      },
      // One page's text as the search layer's item shape: a box in PDF user
      // space (lower-left origin, y up) plus per-glyph x. The glyph widths come
      // from `advances`, the same canvas measurement `open()` uses, so a match
      // in the middle of a run is boxed tight to its own characters rather than
      // to an even slice of the run. This is exact for ordinary text and the
      // reason a body-line match lands on the word; it is approximate where a
      // run's pen advance carries spacing its characters do not (a heading whose
      // separators are drawn as separate items, say), since getTextContent hands
      // over the characters and the run width but not pdf.js's own glyph
      // positions, so the interior distribution is reconstructed rather than read.
      async items(n) {
        if (textCache.has(n)) return textCache.get(n);
        const content = await (await doc.getPage(n)).getTextContent();
        const styles = content.styles || {};
        const items = content.items.filter(it => it.str !== undefined).map((it) => {
          const x1 = it.transform[4], base = it.transform[5], w = it.width, h = it.height;
          const widths = advances(it.str, w, styles[it.fontName]?.fontFamily, 'canvas');
          let run = x1;
          const glyphs = [...it.str].map((char, i) => {
            const g = { char, x1: run, x2: run + widths[i] };
            run += widths[i];
            return g;
          });
          return { page: n, str: it.str, x1, x2: x1 + w, y1: base, y2: base + h, base, w, h, glyphs };
        });
        textCache.set(n, items);
        return items;
      },
      // Search the whole document, parsing text lazily. Async because the text
      // may not be in hand yet; the result is the pure `find.search` shape.
      async find(query, o) {
        const all = [];
        for (let n = 1; n <= doc.numPages; n++) all.push(...await this.items(n));
        return find.search(all, query, o);
      },
      async draw(n, canvas, { width, max = 2 } = {}) {
        const pg = await doc.getPage(n);
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const unit = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: Math.min(max, Math.max(1, width) / unit.width) * dpr });
        canvas.width = vp.width;
        canvas.height = vp.height;
        const css = Math.round(vp.width / dpr);
        canvas.style.width = css + 'px';
        await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        return css;
      },
    };
  };

  const firstLook = async (src) => {
    await loadPdfjs();
    const bytes = asBytes(src) ?? src;
    // slice(): pdf.js transfers the buffer to its worker, and a caller that
    // holds these bytes for anything else would find them detached.
    const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    return lookAt(doc);
  };

  // ==========================================================================
  // 4c. flow — a PDF as a CONTINUOUS COLUMN, which is the reading model itself.
  // ==========================================================================
  //
  // Pages run down the screen the way any long document does, with zoom, a
  // lazy render window, and reserved page-shaped holes so the scrollbar never
  // lies. It lives here rather than inside one component because it is not
  // chrome: it is the answer to "what does a gesture mean over a PDF", and the
  // estate now has more than one surface asking. `firstLook.draw` was moved
  // here for exactly this reason once a third caller appeared, and the reading
  // model is the larger version of the same argument.
  //
  // What it deliberately does NOT own: the pager pill, the page-jump list, and
  // any link out to another tool. Those are chrome, they differ per surface,
  // and they are driven from the outside through `onPage`. A host that wants
  // none of them passes none.
  //
  //   const mount = await pdf.flow(look, hostEl, {
  //     start,                 // 0-based page to open on
  //     alive: () => …,        // false once the host has moved on; every await checks it
  //     onPage: (i) => …,      // the reader is now on page i (0-based)
  //     onScroll: () => …,     // any scroll, for chrome that fades
  //     onPaint: (n, slot, g) => …,   // page n landed in `slot`; g.scale converts points to CSS px
  //     onZoom: (z) => …,      // 1 is fit-to-width
  //   });
  //
  // The handle: { count, scroller, active(), go(n), built(), relayout(),
  // zoom(), setZoom(z, ax, ay), destroy() }.
  const flow = async (look, host, opts = {}) => {
    const pages = look.pages;
    const alive = opts.alive || (() => true);
    // Inverted rather than passed through, because every call site inside is
    // asking "has the host moved on while I was awaiting something", and a
    // negative reads better at the point of use than a negated positive.
    const dead = () => !alive();
    const announce = opts.onPage || (() => {});
    const wake = opts.onScroll || (() => {});
    const onPaint = opts.onPaint || (() => {});
    const onZoom = opts.onZoom || (() => {});
    // Every page's SHAPE, which is not its rendering. The continuous flow
    // has to reserve a page's height before drawing it, or the scrollbar
    // grows under the reader's thumb as pages resolve. Page 1 is asked
    // for up front and its ratio is assumed for the rest, then the real
    // answers arrive in the background and correct any page that differs.
    // The assumption is right far more often than not, because a PDF
    // usually inherits one MediaBox for the whole document: all eight
    // documents of the DRS 2019-21 R1 submittal that this was built
    // against are internally uniform, and none is landscape.
    // The oversample ceiling `firstLook.draw` applies, named here because
    // the reservation has to agree with it. `draw` fits a page to the
    // width it is given but never magnifies past `max` times the page's
    // own point size, so a small page on a wide bench comes back
    // NARROWER than its pane. Reserving the pane's width for it would
    // leave every slot a couple of hundred pixels too tall, which is the
    // scrollbar lying in the other direction.
    const MAX_SCALE = 2;
    const first = await look.size(1);
    if (dead()) return;
    const ratios = new Array(pages).fill(first.ratio);
    const units = new Array(pages).fill(first.width);

    // What is mounted right now, and where the reader is in it. `at`
    // outlives a flow swap: switching how you read a document must not
    // move you to a different page of it.
    let mount = null, at = 0;

    // ── the continuous flow ────────────────────────────────────────────
    const buildScroll = (start) => {
      const box = document.createElement('div');
      // `overscroll-y-contain` for the reason the deck's track carries
      // its x twin: this scroller sits inside the page's own scrolling
      // context and must not hand the gesture upward at its ends.
      // `overflow-x-hidden` is the honest half of the whole change: this
      // element does not scroll sideways, so a sideways gesture over it
      // belongs to whatever encloses it.
      // NO `scroll-smooth` on the box. `scroll-behavior: smooth` applies
      // to a plain `scrollTop =` too, not only to `scrollTo`, so the
      // class would animate the two places that must land instantly:
      // the opening seek, and the re-anchor after a relayout. `go()`
      // asks for smooth by argument, where it is wanted.
      box.className = 'viewer-pdf-flow absolute inset-0 overflow-y-auto overflow-x-hidden '
                    + 'overscroll-y-contain';
      // Both single-finger pans stay native (the y to this scroller, the
      // x to the deck behind it, since this element does not scroll
      // sideways at fit width), and the browser's OWN pinch is switched
      // off so a two-finger gesture reaches the pointer handlers below.
      // Without this the pinch zooms the whole page instead of the
      // document, which is the browser doing exactly what it is for and
      // not at all what a reader means by zooming a PDF.
      box.style.touchAction = 'pan-x pan-y';
      const slots = [], offsets = new Array(pages).fill(0);
      for (let i = 0; i < pages; i++) {
        const slot = document.createElement('div');
        // A slot is a PAGE-SHAPED HOLE whether or not anything has been
        // drawn into it. `bg-base-100` so an unrendered page reads as
        // blank paper rather than as a gap, `overflow-hidden` so a
        // canvas rounded a pixel wider than its reservation cannot push
        // the column sideways.
        // No `mx-auto`. An auto margin centers a box that FITS and clips
      // the left edge of one that does not, so the moment a zoomed page
      // is wider than the pane its first inch becomes unreachable. The
      // margins are computed below instead, where the widths already are.
      slot.className = 'viewer-pdf-slot relative overflow-hidden bg-base-100 shadow-sm';
        slot.dataset.page = String(i + 1);
        slots.push(slot);
        box.append(slot);
      }
      host.append(box);

      const gap = 8;
      let pane = 0;
      // ZOOM, where 1 is fit-to-width and the whole column is a pure
      // scale of it. The floor is below 1 because a tall page on a phone
      // runs off the bottom at fit width and seeing the whole of it is a
      // real thing to want. The ceiling is 4 because the raster is
      // `pane * z * devicePixelRatio` on a side: at a 1200px pane and a
      // 2x display that is 9,600 by roughly 12,400, which Chromium draws,
      // and doubling it again is where a canvas starts failing silently.
      let z = 1;
      const MINZ = 0.5, MAXZ = 4;
      // Whether the horizontal axis belongs to this document or to the
      // deck behind it, which is the one thing zoom changes about what a
      // gesture MEANS. At fit width it belongs to the deck, and that is
      // the whole reason the flow declares `overflow-x-hidden`. Zoomed
      // in, a sideways drag is panning the page and must not slide to the
      // next document, so the axis is taken here and contained.
      //
      // It is also taken for the duration of a pinch, whatever the zoom.
      // Two fingers landing at fit width would otherwise put a horizontal
      // component of the gesture straight through to the deck, and the
      // reader would arrive at the next document holding a pinch.
      let pinching = false;
      const ownX = () => {
        const wide = z > 1 || pinching;
        box.classList.toggle('overflow-x-hidden', !wide);
        box.classList.toggle('overflow-x-auto', wide);
        box.classList.toggle('overscroll-x-contain', wide);
      };
      // What page `i` is at fit width, which is the pane until the
      // oversample ceiling bites, and what it is actually DRAWN at, which
      // is that times the zoom. Both the slot and the `draw` call read
      // the second one, so the hole and the page that lands in it are the
      // same size by construction rather than by coincidence.
      const baseW = (i) => Math.min(pane, units[i] * MAX_SCALE);
      const drawnW = (i) => Math.round(z * baseW(i));
      // Writes first, then reads: setting every height and then asking
      // every offsetTop costs one reflow, where interleaving them costs
      // `pages` of them. The offsets are READ rather than accumulated
      // because a measured position cannot drift away from the layout
      // the way a running total can.
      const layout = () => {
        pane = Math.max(160, box.clientWidth);
        // The GAP SCALES TOO, and that is not a cosmetic choice. It is
        // what makes every offset exactly `z` times its fit-width value,
        // which is the only reason the zoom anchor below is arithmetic
        // rather than an approximation: a fixed gap would leave the
        // column a little shorter than `z` times its own height, and the
        // point under the fingers would creep further away on every page.
        const pad = Math.round(gap * z);
        for (let i = 0; i < pages; i++) {
          const w = drawnW(i);
          const side = Math.max(0, Math.round((pane - w) / 2));
          slots[i].style.width = w + 'px';
          slots[i].style.height = Math.round(w * ratios[i]) + 'px';
          slots[i].style.marginLeft = side + 'px';
          slots[i].style.marginRight = side + 'px';
          slots[i].style.marginBottom = (i === pages - 1 ? 0 : pad) + 'px';
        }
        for (let i = 0; i < pages; i++) offsets[i] = slots[i].offsetTop;
      };

      // Which page the reader is ON, in a flow where two of them can be
      // on screen at once. A third of the way down the pane, so a page
      // claims the pager once it holds most of what is being looked at
      // rather than the instant its top edge appears.
      const activeAt = () => {
        const y = box.scrollTop + box.clientHeight * 0.35;
        let n = 0;
        for (let i = 0; i < pages; i++) { if (offsets[i] <= y) n = i; else break; }
        return n;
      };

      // One token per slot. A relayout invalidates every in-flight
      // render, because a canvas that resolves at the old width would
      // paint a page the wrong size into a slot already resized for the
      // new one.
      const token = new Array(pages).fill(0);
      const paint = (i) => {
        const slot = slots[i];
        // Keyed on the DRAWN width rather than the pane, because the pane
        // no longer determines it: at 200% the pane is unchanged and every
        // canvas on screen is wrong.
        const w = drawnW(i);
        if (slot.firstChild && slot.dataset.at === String(w)) return;
        const mine = ++token[i];
        slot.dataset.at = String(w);
        const canvas = document.createElement('canvas');
        canvas.className = 'viewer-pdf-page block';
        canvas.dataset.page = String(i + 1);
        slot.replaceChildren(canvas);
        (async () => {
          try {
            if (dead() || !canvas.isConnected || token[i] !== mine) return;
            // `width` is already the final answer, so `max` only has to
            // stay out of its way: raising the ceiling with the zoom is
            // what lets a small page actually get bigger instead of
            // stopping at twice its own point size.
            const css = await look.draw(i + 1, canvas, { width: w, max: MAX_SCALE * z });
            if (dead() || !canvas.isConnected || token[i] !== mine) return;
            // THE OVERLAY HOOK, and the reason this belongs in the kit rather than
            // in one component. A host that knows something about a page (a search
            // hit, a crosswalk row, a paragraph to highlight) can only draw it once
            // the page has landed, and only if it is told the page's SCALE: every
            // coordinate a PDF carries is in points and everything on screen is in
            // CSS pixels. `scale` is that conversion. The slot is already
            // positioned, so a host appends absolutely-positioned marks to it and
            // nothing else about the column has to know they exist.
            onPaint(i + 1, slot, { css: css || w, unit: units[i], scale: (css || w) / units[i], zoom: z });
            // The find marks are the flow's own overlay, so it redraws them
            // here rather than leaning on the host's onPaint the way a
            // crosswalk highlight does.
            if (findHits.length) drawFind(i);
          } catch (e) { /* one page failing is not the document failing */ }
        })();
      };
      const drop = (i) => {
        if (!slots[i].firstChild) return;
        token[i]++;
        delete slots[i].dataset.at;
        slots[i].replaceChildren();
      };

      // ── find highlights ────────────────────────────────────────────────
      //
      // Search is not the flow's job (the pure `find` layer above, or a host
      // that already holds the document, produces the hits); placing them is,
      // because only the flow knows a page's slot, its scale, and when it lands.
      // A host hands hits in through `find()` and the marks track paint, zoom
      // and relayout without the host recomputing anything. This is the payoff
      // the `repaint` note foretold: a highlight the reader can move through
      // without the column re-rasterising to carry it.
      let findHits = [], findActive = -1;
      const scaleOf = (i) => drawnW(i) / (units[i] || 1);
      // THE PALETTE IS kits/land.js's, copied rather than called. This kit has
      // no kit dependencies, is loaded straight from jsDelivr on one path, and
      // runs on pages/pdf-inspect.html which loads nothing else; a require here
      // would break all three. tools/test/land-parity.test.mjs holds the copy to
      // the original in both directions.
      //
      // It used to be four hardcoded rgba values, two of them orange, which is a
      // hue the theme does not carry: a reader who learned the yellow on the
      // app's own surfaces met a different colour on a page. color-mix against
      // --color-warning is the same declaration land.js compiles to, so the
      // marks now follow the theme, dark mode included.
      const HL = 'position:absolute;pointer-events:none;border-radius:2px;mix-blend-mode:multiply;';
      const tint = (pct) => `color-mix(in oklab, var(--color-warning) ${pct}%, transparent)`;
      const drawFind = async (i) => {
        const slot = slots[i];
        if (!slot) return;
        slot.querySelectorAll('.viewer-pdf-find').forEach(el => el.remove());
        // Only over a page that has actually drawn: an unpainted hole gets its
        // marks when `paint` lands it and calls back here. So no hits, or a
        // blank slot, is nothing to do.
        if (!findHits.length || !slot.firstChild) return;
        const onPage = findHits.filter(h => h.page === i + 1);
        if (!onPage.length) return;
        const scale = scaleOf(i);
        let vp;
        try { vp = await look.viewport(i + 1, scale); } catch { return; }
        // The slot may have been dropped or re-scaled while the viewport was in
        // flight; a mark drawn now would sit at the wrong size on the wrong page.
        if (dead() || !slot.isConnected || Math.abs(scaleOf(i) - scale) > 0.001) return;
        slot.querySelectorAll('.viewer-pdf-find').forEach(el => el.remove());
        for (const hit of onPage) {
          const active = hit.ordinal === findActive;
          for (const r of hit.rects) {
            const a = vp.convertToViewportPoint(r.x, r.y);
            const b = vp.convertToViewportPoint(r.x + r.w, r.y + r.h);
            const mark = document.createElement('div');
            mark.className = 'viewer-pdf-find';
            // The ring stays on the current hit and does the work the hue used
            // to: at the size of a word on a page, an outline separates "this
            // one" from "one of these" more reliably than a stronger fill.
            mark.style.cssText = HL + (active
              ? `background:${tint(45)};box-shadow:0 0 0 1px ${tint(80)};`
              : `background:${tint(25)};`);
            // The box runs from the baseline up, so a descender falls below it;
            // the vertical pad covers it the way the appendix mark does, and the
            // horizontal pad stays tight so the highlight reads as the word.
            mark.style.left = (Math.min(a[0], b[0]) - 1) + 'px';
            mark.style.top = (Math.min(a[1], b[1]) - 1) + 'px';
            mark.style.width = (Math.abs(b[0] - a[0]) + 2) + 'px';
            mark.style.height = (Math.abs(b[1] - a[1]) + 5) + 'px';
            if (active) mark.dataset.findActive = '1';
            slot.appendChild(mark);
          }
        }
      };
      const redrawFind = () => { for (let i = 0; i < pages; i++) if (slots[i].firstChild) drawFind(i); };

      // The lazy window, in PIXELS rather than in a count of pages, and
      // that is deliberate. `keep: 2` is the right shape for a deck whose
      // slides are each exactly one pane tall; here a page can be half
      // the pane on a phone or twice it on a wide bench, so how many
      // pages are worth holding is a question about geometry. Rasterizing
      // a 200-page submittal is what this exists to avoid.
      const ensure = () => {
        const h = box.clientHeight || 1, top = box.scrollTop;
        const near = [top - h * 0.5, top + h * 1.5];
        const far = [top - h * 2, top + h * 3];
        for (let i = 0; i < pages; i++) {
          const a = offsets[i], b = a + slots[i].offsetHeight;
          if (b >= near[0] && a <= near[1]) paint(i);
          else if (b < far[0] || a > far[1]) drop(i);
        }
      };

      // A SEEK IN FLIGHT OWNS THE PAGE NUMBER. `go()` scrolls smoothly,
      // which takes frames, and every one of those frames is a scroll
      // event passing over the pages in between. Letting the listener
      // read position on them walks the pager backwards from the page
      // the reader just asked for, all the way down to wherever they
      // were, before arriving. So the target is pinned until the scroll
      // lands on it, and the frames along the way only paint.
      //
      // Three ways out, because a smooth scroll has no completion event:
      // it arrives (within a few pixels of rounding), the reader takes
      // over with a thumb or a wheel, or it is simply taking too long and
      // reading the real position is better than pinning a stale one.
      let seek = null, seekAt = 0;
      const arrive = () => { seek = null; };
      // THE REQUESTED OPENING PAGE, held until the column can be trusted about
      // where it is. The mount-time scroll is taken against page 1's shape
      // assumed for every page, and against whatever width the host had at
      // that instant; the background size pass and the ResizeObserver both
      // correct the column afterwards, and each re-anchors on `at`. But `at`
      // was READ off the provisional layout, so re-anchoring on it preserves
      // the drift rather than the request: measured in mehrlander/home on a
      // 98-page manual whose chapter 9 sets its tables on wider pages, `start:
      // 52` landed on page 35 and stayed there through every correction, the
      // column's height having grown from about 69,000 to 105,538 pixels after
      // the scroll had been taken. So the request is kept as a page NUMBER,
      // which no relayout can move, and every re-anchor reads it first. It is
      // released by the one thing that makes `at` the better answer: the
      // reader taking the column (a wheel, a touch, a pointer, a `go`, a
      // scroll the host issued). NOT by the size pass finishing: a host that
      // mounts the column before its pane has any geometry (a tab not yet
      // shown) gets every offset as 0 and `at` as the LAST page, and a pass
      // that ran to its end inside that window would have released the
      // request to a number the layout never produced. Measured: `start: 52`
      // in a hidden host arrived on page 97. Until the reader moves, the
      // request and the reader's page are the same number, so holding it
      // costs nothing.
      let pending = start;
      const takeOver = () => { arrive(); pending = null; };
      // The last position this kit wrote, so a scroll it did not write can
      // be told from its own. A host that lands on a mark by setting
      // `scrollTop` has chosen a place the way a wheel does, and the request
      // gives way to it the same way.
      let wrote = 0;
      const place = (y) => { wrote = y; box.scrollTop = y; };
      let queued = false;
      const onScroll = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          if (dead() || !box.isConnected) return;
          // Clear first, then read, in the SAME pass. Clearing and
          // returning would throw away the position of the very event
          // that ended the seek, so a scroll that arrives (or gives up)
          // leaves the pager on the old page until something else moves.
          if (seek !== null && (Math.abs(box.scrollTop - offsets[seek]) <= 4
                                || performance.now() - seekAt > 1200)) arrive();
          if (seek === null && pending !== null && Math.abs(box.scrollTop - wrote) > 4) pending = null;
          if (seek === null) {
            const a = activeAt();
            if (a !== at) { at = a; announce(at); }
          }
          // Every frame, not only the ones that change the page: the pill
          // is a "you are scrolling" indicator as much as a position, and
          // a long page would otherwise let it fade mid-scroll.
          wake();
          ensure();
        });
      };
      box.addEventListener('scroll', onScroll, { passive: true });
      for (const ev of ['wheel', 'touchstart', 'pointerdown']) {
        box.addEventListener(ev, takeOver, { passive: true });
      }

      // ── zoom ─────────────────────────────────────────────────────────
      const showZoom = () => onZoom(z);

      // Zoom about a point, so whatever is under the fingers stays under
      // them. The vertical half is exact, because the column is a pure
      // scale of its fit-width layout (see `layout`). The horizontal half
      // is exact only while already zoomed in: at fit width and below,
      // the column is centered by margins rather than by scroll position,
      // so crossing 100% shifts sideways by however far off-center the
      // anchor was. That is the crossing nobody is aiming through, and
      // buying it back would mean a second coordinate system for a case
      // that lasts one frame.
      const applyZoom = (nz, ax, ay) => {
        const want = Math.max(MINZ, Math.min(MAXZ, nz));
        if (!(want > 0) || Math.abs(want - z) < 0.001) return;
        const r = box.getBoundingClientRect();
        const px = ax == null ? r.width / 2 : ax - r.left;
        const py = ay == null ? r.height / 2 : ay - r.top;
        const cx = (box.scrollLeft + px) / z, cy = (box.scrollTop + py) / z;
        arrive();
        z = want;
        ownX();
        // Every canvas on screen is now the wrong size. Dropping them all
        // and letting `ensure` repaint the window is cheaper than it
        // looks and, more to the point, is the same path a relayout
        // already takes; a half-updated column would be the novel state.
        for (let i = 0; i < pages; i++) drop(i);
        layout();
        box.scrollLeft = Math.max(0, cx * z - px);
        place(Math.max(0, cy * z - py));
        at = activeAt();
        announce(at);
        showZoom();
        ensure();
      };

      // Desktop: ctrl or cmd plus the wheel, which is the in-app zoom
      // convention and NOT shift, which every scroller means as sideways.
      // It is also how macOS delivers a trackpad pinch, so the one
      // handler answers a gesture and a chord at once. `deltaMode` is
      // normalized because a mouse wheel reports lines where a trackpad
      // reports pixels, and treating three lines as three pixels makes a
      // real mouse feel broken.
      const onWheel = (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const dy = e.deltaMode === 1 ? e.deltaY * 16
                 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        applyZoom(z * Math.exp(-dy * 0.01), e.clientX, e.clientY);
      };
      box.addEventListener('wheel', onWheel, { passive: false });

      // Touch: two pointers, and the zoom follows the ratio of the
      // distance between them to what it was when the second one landed.
      // Anchored on their midpoint, so a pinch and a spread both leave
      // the reader looking at what they were pinching around.
      //
      // The browser keeps panning during this, because `touch-action`
      // permits it and there is no way to withdraw that mid-gesture. It
      // reads as pinch-and-pan rather than as a fight, and the anchor
      // arithmetic reads the live scroll position on every frame, so a
      // pan underneath it corrects itself rather than accumulating.
      const pts = new Map();
      let pinch = null;
      const spread = () => {
        const [a, b] = [...pts.values()];
        return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
                 x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      };
      const onDown = (e) => {
        if (e.pointerType !== 'touch') return;
        pts.set(e.pointerId, e);
        if (pts.size !== 2) return;
        pinching = true;
        ownX();
        pinch = { d: spread().d, z };
      };
      const onMove = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, e);
        if (pts.size !== 2 || !pinch) return;
        const s = spread();
        applyZoom(pinch.z * (s.d / pinch.d), s.x, s.y);
      };
      const onUp = (e) => {
        if (!pts.delete(e.pointerId)) return;
        if (pts.size >= 2) return;
        pinch = null;
        pinching = false;
        ownX();
      };
      box.addEventListener('pointerdown', onDown);
      box.addEventListener('pointermove', onMove);
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        box.addEventListener(ev, onUp);
      }

      // The pane's width moves under this flow (docking, the splitter, a
      // rotation), and every reserved height is a function of it. The
      // deck never needed this because its slides are sized in
      // percentages; here a stale width means every page below the
      // reader sits at the wrong offset. Re-anchoring on the page the
      // reader is on is the point: a relayout that silently moves them
      // somewhere else is worse than the wrong height.
      let last = 0;
      const ro = new ResizeObserver(() => {
        if (dead() || !box.isConnected) return;
        const w = Math.max(160, box.clientWidth);
        if (w === last) return;
        last = w;
        const keep = pending ?? at;
        arrive();
        for (let i = 0; i < pages; i++) drop(i);
        layout();
        place(offsets[keep]);
        ensure();
      });

      layout();
      showZoom();
      last = pane;
      // `scrollTop` before the observer is connected, so the initial
      // observation does not read this as a resize and re-anchor.
      place(offsets[Math.max(0, Math.min(start, pages - 1))]);
      at = activeAt();
      ensure();
      ro.observe(box);

      return {
        count: pages,
        scroller: box,
        active: () => at,
        go: (n) => {
          const i = Math.max(0, Math.min(n, pages - 1));
          // The pager moves NOW, not when the scroll arrives: an arrow
          // that looks dead for a third of a second gets tapped twice.
          at = i; announce(at); ensure();
          pending = null;
          seek = i; seekAt = performance.now();
          box.scrollTo({ top: offsets[i], behavior: 'smooth' });
        },
        built: () => slots.filter(s => s.firstChild).length,
        // Force page `i` to be drawn again. A host whose OVERLAY changed (a
        // different paragraph highlighted, a search that moved on) has no
        // other way to make `onPaint` fire for a page already on screen, and
        // relayouting the whole column to move one mark would blank what the
        // reader is looking at.
        repaint: (i) => { if (i >= 0 && i < pages) { drop(i); ensure(); } },
        // ── find, driven from outside ──────────────────────────────────────
        // Hand in hits (from `pdf.find.search` or `lookAt().find`), and the
        // column highlights them and moves between them. `hits` is the array
        // inside a search result; `active` is which one to mark current.
        find: (hits, active = 0) => {
          findHits = Array.isArray(hits) ? hits : [];
          findActive = findHits.length ? Math.max(0, Math.min(active, findHits.length - 1)) : -1;
          redrawFind();
          return findActive;
        },
        // Make hit `k` current and land it, wrapping past either end.
        //
        // A LITTLE OVER A QUARTER DOWN, not the middle. Centring was the answer
        // here until 2026-09-04 and it was only ever an argument against the
        // PAGE TOP, which is genuinely wrong: a hit low on a page is off-screen
        // when its page top is at the top. It is not an argument for the middle.
        // mehrlander/home measured the third option on a chapter heading and
        // found centring lands early: half a screen of what came BEFORE the hit
        // sits above it, and the reader reads the wrong thing first. 0.28 is
        // kits/land.js's constant, copied under the parity gate for the reason
        // stated at HL above, so a find hit and a markdown bullet arrive at the
        // same height.
        findGo: (k) => {
          if (!findHits.length) return null;
          const n = findHits.length;
          findActive = ((k % n) + n) % n;
          const hit = findHits[findActive];
          const pi = hit.page - 1;
          at = pi; announce(at);
          seek = pi; seekAt = performance.now();
          (async () => {
            let topWithin = 0;
            try {
              const vp = await look.viewport(pi + 1, scaleOf(pi));
              const r = hit.rects[0];
              topWithin = vp.convertToViewportPoint(r.x, r.y + r.h)[1];
            } catch { /* fall back to the page top */ }
            if (dead() || !box.isConnected) return;
            const target = Math.max(0, offsets[pi] + topWithin - box.clientHeight * 0.28);
            box.scrollTo({ top: target, behavior: 'smooth' });
            ensure(); wake(); redrawFind();
          })();
          return hit;
        },
        findClear: () => {
          findHits = []; findActive = -1;
          for (let i = 0; i < pages; i++) slots[i].querySelectorAll('.viewer-pdf-find').forEach(el => el.remove());
        },
        findCount: () => findHits.length,
        activeFind: () => findActive,
        zoom: () => z,
        setZoom: (n, ax, ay) => applyZoom(n, ax, ay),
        // A relayout is how a corrected page shape reaches the screen. It
        // re-anchors on the requested page while one is still pending, and
        // on the page the reader is on once there is not.
        relayout: () => {
          const keep = pending ?? at;
          arrive();
          layout();
          place(offsets[keep]);
          ensure();
        },
        destroy: () => {
          ro.disconnect();
          box.removeEventListener('scroll', onScroll);
          for (const ev of ['wheel', 'touchstart', 'pointerdown']) box.removeEventListener(ev, arrive);
          box.removeEventListener('wheel', onWheel);
          box.removeEventListener('pointerdown', onDown);
          box.removeEventListener('pointermove', onMove);
          for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
            box.removeEventListener(ev, onUp);
          }
          box.remove();
        },
      };
    };
    mount = buildScroll(Math.max(0, Math.min(opts.start | 0, pages - 1)));
    announce(at);

    // The shapes of the remaining pages, after the reader already has one on
    // screen. Only a page that disagrees with the assumption costs anything, so
    // a uniform document relayouts zero times. Deliberately not awaited: the
    // column is usable before this finishes and correcting it later is the
    // whole design, where blocking the first page on 200 `getPage` calls would
    // not be.
    if (pages > 1) {
      (async () => {
        let moved = false;
        for (let i = 2; i <= pages; i++) {
          let s;
          try { s = await look.size(i); } catch { continue; }
          if (dead()) return;
          if (Math.abs(s.ratio - ratios[i - 1]) < 0.001
              && Math.abs(s.width - units[i - 1]) < 0.5) continue;
          ratios[i - 1] = s.ratio;
          units[i - 1] = s.width;
          moved = true;
        }
        if (moved && !dead() && mount) mount.relayout();
      })();
    }

    return mount;
  };

  // ==========================================================================
  // 5. doc — pdf-lib. Bytes in, bytes out; no geometry.
  // ==========================================================================

  const asBytes = src =>
    src instanceof Uint8Array ? src :
    src instanceof ArrayBuffer ? new Uint8Array(src) :
    src?.bytes instanceof Uint8Array ? src.bytes : null;

  const docOps = {
    // Pull a page range into a new document. 1-based and inclusive, matching
    // how a reader counts pages rather than how an array indexes.
    async slice(src, start = 1, end = start) {
      await loadPdfLib();
      const bytes = asBytes(src);
      const from = await window.PDFLib.PDFDocument.load(bytes);
      const out = await window.PDFLib.PDFDocument.create();
      const idx = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i)
        .filter(i => i >= 0 && i < from.getPageCount());
      for (const p of await out.copyPages(from, idx)) out.addPage(p);
      return out.save();
    },

    async pages(src, list) {
      await loadPdfLib();
      const from = await window.PDFLib.PDFDocument.load(asBytes(src));
      const out = await window.PDFLib.PDFDocument.create();
      const idx = list.map(n => n - 1).filter(i => i >= 0 && i < from.getPageCount());
      for (const p of await out.copyPages(from, idx)) out.addPage(p);
      return out.save();
    },

    async merge(sources) {
      await loadPdfLib();
      const out = await window.PDFLib.PDFDocument.create();
      for (const s of sources) {
        const from = await window.PDFLib.PDFDocument.load(asBytes(s));
        const idx = from.getPageIndices();
        for (const p of await out.copyPages(from, idx)) out.addPage(p);
      }
      return out.save();
    },

    download(bytes, name = 'output.pdf') {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      Object.assign(document.createElement('a'), { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return url;
    },
  };

  // ==========================================================================

  const open = async (src, opts = {}) => {
    const d = new PdfDocument(opts);
    if (typeof src === 'string') await d.load(src);
    else if (src instanceof ArrayBuffer || src instanceof Uint8Array) await d.loadBytes(src);
    else if (src instanceof Blob) await d.loadFile(src);
    else if (src) throw new Error('open(): pass a url, a Blob/File, or bytes');
    return d;
  };

  // Pick a local PDF without building a UI for it. Console ergonomics.
  const pick = async (opts = {}) => {
    const input = Object.assign(document.createElement('input'),
      { type: 'file', accept: '.pdf' });
    const file = await new Promise(res => { input.onchange = () => res(input.files[0]); input.click(); });
    return file ? open(file, opts) : null;
  };

  window.pdf = { open, pick, firstLook, lookAt, flow, geom, stream, lattice, view, find, doc: docOps, config, PdfDocument, CDN,
                 loadLibs, loadPdfjs, loadPdfLib };

})();
