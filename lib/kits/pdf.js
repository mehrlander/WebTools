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

  // Group items into visual lines by baseline proximity. Returned top-to-bottom
  // (descending y), because reading order is what a caller wants and PDF space
  // counts the other way.
  const rows = (items, opts = {}) => {
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

  const stream = { rows, chunks, columns, gutters, split };

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
  // 4. open — the pdf.js boundary. Everything above is pure; this is not.
  // ==========================================================================

  let libsReady = null;
  const loadLibs = async () => {
    if (libsReady) return libsReady;
    libsReady = (async () => {
      if (!window.pdfjsLib) await new Promise((res, rej) => {
        Object.assign(document.head.appendChild(document.createElement('script')),
          { src: CDN.pdfjs, onload: res, onerror: rej });
      });
      if (!window.PDFLib) await new Promise((res, rej) => {
        Object.assign(document.head.appendChild(document.createElement('script')),
          { src: CDN.pdfLib, onload: res, onerror: rej });
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.worker;
    })();
    return libsReady;
  };

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
      await loadLibs();
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
      await loadLibs();
      const bytes = asBytes(src);
      const from = await window.PDFLib.PDFDocument.load(bytes);
      const out = await window.PDFLib.PDFDocument.create();
      const idx = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i)
        .filter(i => i >= 0 && i < from.getPageCount());
      for (const p of await out.copyPages(from, idx)) out.addPage(p);
      return out.save();
    },

    async pages(src, list) {
      await loadLibs();
      const from = await window.PDFLib.PDFDocument.load(asBytes(src));
      const out = await window.PDFLib.PDFDocument.create();
      const idx = list.map(n => n - 1).filter(i => i >= 0 && i < from.getPageCount());
      for (const p of await out.copyPages(from, idx)) out.addPage(p);
      return out.save();
    },

    async merge(sources) {
      await loadLibs();
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

  window.pdf = { open, pick, geom, stream, lattice, view, doc: docOps, config, PdfDocument, CDN, loadLibs };

})();
