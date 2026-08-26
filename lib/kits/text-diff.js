// kits/text-diff.js — patience diff over lines, plus word-level diff inside a
// changed line pair. Pure: no DOM, no Alpine, no network. The engine behind
// pages/diff-tool.html and the stage's Diff lens.
//
// Usage:
//   const ops = textDiff.lines(aLines, bLines);       // [{type,a?,b?}, …]
//   textDiff.lastWarning                              // '' or a reason string
//   const { lh, rh } = textDiff.words(oldLine, newLine);      // escaped HTML
//   const { lh, rh } = textDiff.wordParts(old, new);          // [{text,mark}]
//   const rows = textDiff.rows(ops, aLines, bLines);  // flat {t,line} rows
//   const text = textDiff.patch(ops, aLines, bLines, opts);   // unified diff
//   const plines = textDiff.patchRows(text);          // [{line,t}] for display
//
// ONE ALIGNMENT, SEVERAL READINGS. `ops` is the answer; everything after it is
// a way of showing that answer. So a surface offering unified, side-by-side and
// patch views diffs once and renders three times, which is both cheaper and the
// only way the three can agree with each other.
//
//   ops are in output order, monotone in both indices, and reconstruct both
//   inputs exactly: filtering to eq+del rebuilds A, eq+add rebuilds B. That is
//   the property every consumer leans on, and the one the tests pin.
//
// WHY PATIENCE. The obvious implementation is a full LCS table, and two of them
// were in this repo: one here and one inline in stage.js. Both allocated an
// n*m cell table, which is fine for a config file and fatal for a document.
// Two 6,000-line files want 36 million cells; the stage's version gave up past
// 4 million and said "files too large to diff", and the page's version tried
// anyway and died. Since a version comparison is exactly the case where the two
// sides are long and nearly identical, the table was being paid for on every
// call and earned nothing.
//
// So: trim the shared prefix and suffix, find the lines that occur exactly once
// on each side, take the longest increasing subsequence of those as anchors,
// and recurse into the gaps between them. Myers runs only on blocks with no
// unique line to anchor on, where its cost tracks the edit distance rather than
// the product of the lengths. A once-only line is also a better anchor than
// whatever an LCS walk happens to pair up, so the alignment reads better: a
// moved section shows as a move rather than smearing across the file.
//
// The one honest limit: patience is not guaranteed minimal. It can report more
// edits than an optimal LCS would, and that is the trade being made on purpose.
//
// Anchor-free blocks past CAPS.myers come back as one delete run plus one
// insert run, with `lastWarning` set. Callers should surface it; two texts with
// nothing in common have no alignment worth showing, and saying so beats both
// hanging and silently lying about the shape of the change.

(() => {
  const CAPS = {
    // Bounds the Myers trace, which costs about d^2 int32s in the worst case.
    myers: 1200,
    // A changed line pair is word-diffed only when both sides are short enough
    // that the O(n*m) token walk stays cheap. Minified JS and long statutory
    // paragraphs are what this guard is for.
    word: 600,
    // Recursion depth before anchoring gives up and hands the block to Myers.
    depth: 32,
  };

  let lastWarning = '';

  // ── the line differ ──────────────────────────────────────────────────────

  function lines(a, b) {
    lastWarning = '';
    const out = [];
    walk(a, b, 0, a.length, 0, b.length, out, 0);
    return out;
  }

  function walk(a, b, lo1, hi1, lo2, hi2, out, depth) {
    while (lo1 < hi1 && lo2 < hi2 && a[lo1] === b[lo2]) out.push({ type: 'eq', a: lo1++, b: lo2++ });
    const tail = [];
    while (lo1 < hi1 && lo2 < hi2 && a[hi1 - 1] === b[hi2 - 1]) {
      hi1--; hi2--;
      tail.push({ type: 'eq', a: hi1, b: hi2 });
    }

    if (lo1 === hi1 || lo2 === hi2) {
      for (let i = lo1; i < hi1; i++) out.push({ type: 'del', a: i });
      for (let j = lo2; j < hi2; j++) out.push({ type: 'add', b: j });
    } else {
      const anchors = depth < CAPS.depth ? anchorsIn(a, b, lo1, hi1, lo2, hi2) : [];
      if (anchors.length) {
        let x = lo1, y = lo2;
        for (const pair of anchors) {
          walk(a, b, x, pair[0], y, pair[1], out, depth + 1);
          out.push({ type: 'eq', a: pair[0], b: pair[1] });
          x = pair[0] + 1; y = pair[1] + 1;
        }
        walk(a, b, x, hi1, y, hi2, out, depth + 1);
      } else {
        const mid = myers(a, b, lo1, hi1, lo2, hi2);
        if (mid) {
          for (const op of mid) out.push(op);
        } else {
          lastWarning = 'One block was too different to align; shown as a replacement.';
          for (let i = lo1; i < hi1; i++) out.push({ type: 'del', a: i });
          for (let j = lo2; j < hi2; j++) out.push({ type: 'add', b: j });
        }
      }
    }
    for (let i = tail.length - 1; i >= 0; i--) out.push(tail[i]);
  }

  // Lines appearing exactly once in each range, paired, then the longest
  // increasing subsequence by b-index.
  function anchorsIn(a, b, lo1, hi1, lo2, hi2) {
    const ca = new Map(), cb = new Map();
    for (let i = lo1; i < hi1; i++) ca.set(a[i], (ca.get(a[i]) || 0) + 1);
    for (let j = lo2; j < hi2; j++) cb.set(b[j], (cb.get(b[j]) || 0) + 1);
    const posB = new Map();
    for (let j = lo2; j < hi2; j++) if (cb.get(b[j]) === 1 && ca.get(b[j]) === 1) posB.set(b[j], j);
    const pairs = [];
    for (let i = lo1; i < hi1; i++) {
      if (ca.get(a[i]) !== 1) continue;
      const j = posB.get(a[i]);
      if (j !== undefined) pairs.push([i, j]);
    }
    if (pairs.length < 2) return pairs;

    // Patience sorting: one pile per strictly increasing b-index, each new card
    // pointing back at the top of the pile to its left.
    const tops = [], piles = [], back = new Array(pairs.length).fill(-1);
    for (let k = 0; k < pairs.length; k++) {
      const j = pairs[k][1];
      let lo = 0, hi = tops.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (tops[m] < j) lo = m + 1; else hi = m; }
      tops[lo] = j;
      piles[lo] = k;
      back[k] = lo > 0 ? piles[lo - 1] : -1;
    }
    const seq = [];
    for (let k = piles[piles.length - 1]; k >= 0; k = back[k]) seq.push(pairs[k]);
    return seq.reverse();
  }

  // Myers O(ND) over a[lo1,hi1) against b[lo2,hi2). Ops, or null past the cap.
  function myers(a, b, lo1, hi1, lo2, hi2) {
    const n = hi1 - lo1, m = hi2 - lo2;
    const max = Math.min(CAPS.myers, n + m);
    const off = max + 1;
    const v = new Int32Array(2 * max + 3).fill(-1);
    v[off + 1] = 0;
    const trace = [];
    let found = -1;
    for (let d = 0; d <= max && found < 0; d++) {
      // Only |k| <= d is live at depth d, so a snapshot is 2d+3 wide rather
      // than full width: the trace costs about d^2, not d*(n+m).
      trace.push(v.slice(off - d - 1, off + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]))
          ? v[off + k + 1]
          : v[off + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[lo1 + x] === b[lo2 + y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) { found = d; break; }
      }
    }
    if (found < 0) return null;

    const ops = [];
    let x = n, y = m;
    for (let d = found; d > 0; d--) {
      const vp = trace[d], vo = d + 1;   // trace[d] is indexed by k + (d + 1)
      const k = x - y;
      const prevK = (k === -d || (k !== d && vp[vo + k - 1] < vp[vo + k + 1])) ? k + 1 : k - 1;
      const prevX = vp[vo + prevK], prevY = prevX - prevK;
      while (x > prevX && y > prevY) { x--; y--; ops.push({ type: 'eq', a: lo1 + x, b: lo2 + y }); }
      if (x > prevX) { x--; ops.push({ type: 'del', a: lo1 + x }); }
      else { y--; ops.push({ type: 'add', b: lo2 + y }); }
    }
    while (x > 0 && y > 0) { x--; y--; ops.push({ type: 'eq', a: lo1 + x, b: lo2 + y }); }
    return ops.reverse();
  }

  // ── word-level diff inside one changed line pair ─────────────────────────
  // Small by construction, so the plain DP is the right tool here. Returns
  // HTML with the source escaped and only the moved runs wrapped.

  // Escaping is window.esc from vanilla-bundle.js, first in the boot chain.
  // Read at CALL time, not captured at load time, so a kit never depends on
  // where in the boot order it happens to sit.
  const esc = s => window.esc(s);

  // Splitting on /(\s+)/ yields an empty leading token for any line that starts
  // with whitespace, which is nearly every indented line. Wrapping that token
  // put an empty highlight span in the output: invisible in text but a colored
  // sliver once the span has a background. So a zero-length token is never
  // wrapped.
  const mark = (cls, t) => t === '' ? '' : '<span class="' + cls + '">' + esc(t) + '</span>';

  // TOKENS, NOT MARKUP, because the two consumers cannot style the same way.
  // The page owns a stylesheet and wants `<span class="w-del">`; the stage
  // composes with Tailwind and has no stylesheet to put those classes in (the
  // house rule is no vanilla CSS). Emitting parts lets each build its own
  // spans, and keeps ONE dynamic-programming walk rather than two that would
  // drift. `words` below is this, rendered the page's way.
  //
  //   { lh: [{ text, mark: '' | 'del' }], rh: [{ text, mark: '' | 'add' }] }
  //
  // Past the cap the parts come back unmarked, which is the same bail-out the
  // HTML form has always had, said in the shape the caller is already handling.
  function wordParts(o, m) {
    const os = String(o == null ? '' : o), ms = String(m == null ? '' : m);
    const oa = os.split(/(\s+)/), ma = ms.split(/(\s+)/);
    if (oa.length > CAPS.word || ma.length > CAPS.word)
      return { lh: [{ text: os, mark: '' }], rh: [{ text: ms, mark: '' }] };
    const n = oa.length, w = ma.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(w + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = w - 1; j >= 0; j--)
        dp[i][j] = oa[i] === ma[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const lh = [], rh = [];
    let i = 0, j = 0;
    while (i < n && j < w) {
      if (oa[i] === ma[j]) { lh.push({ text: oa[i++], mark: '' }); rh.push({ text: ma[j++], mark: '' }); }
      else if (dp[i + 1][j] >= dp[i][j + 1]) lh.push({ text: oa[i++], mark: 'del' });
      else rh.push({ text: ma[j++], mark: 'add' });
    }
    while (i < n) lh.push({ text: oa[i++], mark: 'del' });
    while (j < w) rh.push({ text: ma[j++], mark: 'add' });
    return { lh, rh };
  }

  function words(o, m) {
    const { lh, rh } = wordParts(o, m);
    const render = (parts, cls) =>
      parts.map(p => p.mark ? mark(cls, p.text) : esc(p.text)).join('');
    return { lh: render(lh, 'w-del'), rh: render(rh, 'w-add') };
  }

  // ── convenience: ops as flat tagged rows ─────────────────────────────────
  // Full context, no folding: what a consumer wants when the whole compare IS
  // the output (the stage's Diff lens, a copyable dump). A folding, two-column
  // renderer works from `ops` directly instead.

  function rows(ops, a, b) {
    return ops.map(op => op.type === 'eq'
      ? { t: 'ctx', line: a[op.a] }
      : op.type === 'del' ? { t: 'del', line: a[op.a] } : { t: 'add', line: b[op.b] });
  }

  // ── a real unified diff ──────────────────────────────────────────────────
  //
  // `rows` above is the whole compare with every line of context, which is what
  // a reading surface wants. This is the other output: hunks with a chosen
  // context, the `@@` headers, and the two file names, so the result is a patch
  // a tool will accept rather than a block that merely looks like one.
  //
  // It lives here because two surfaces emit it (pages/diff-tool.html and the
  // stage's comparison) and a patch is exactly the kind of pure derivation that
  // goes wrong quietly in a second copy: an off-by-one in a hunk header still
  // renders as a tidy patch and fails only when something tries to apply it.
  //
  //   patch(ops, aLines, bLines, { context = 3, nameA = 'a', nameB = 'b' })
  //
  // Returns '' when the two sides are identical, which is the honest answer and
  // what callers key their empty state on.
  function patch(ops, a, b, o = {}) {
    const ctx = Number.isFinite(o.context) ? o.context : 3;
    const t = [];
    let oi = 0, ni = 0;
    for (const op of ops) {
      if (op.type === 'eq') t.push({ tag: ' ', old: oi++, new: ni++, text: a[op.a] });
      else if (op.type === 'del') t.push({ tag: '-', old: oi++, new: null, text: a[op.a] });
      else t.push({ tag: '+', old: null, new: ni++, text: b[op.b] });
    }
    const n = t.length;
    if (!t.some(x => x.tag !== ' ')) return '';
    const keep = new Array(n).fill(false);
    for (let i = 0; i < n; i++)
      if (t[i].tag !== ' ')
        for (let d = -ctx; d <= ctx; d++) {
          const q = i + d;
          if (q >= 0 && q < n) keep[q] = true;
        }
    const out = ['--- a/' + (o.nameA || 'a'), '+++ b/' + (o.nameB || 'b')];
    let i = 0;
    while (i < n) {
      if (!keep[i]) { i++; continue; }
      const s0 = i;
      while (i < n && keep[i]) i++;
      let oldStart = null, newStart = null, oc = 0, nc = 0;
      const body = [];
      for (let q = s0; q < i; q++) {
        const x = t[q];
        if (x.tag === ' ' || x.tag === '-') { if (oldStart === null) oldStart = x.old; oc++; }
        if (x.tag === ' ' || x.tag === '+') { if (newStart === null) newStart = x.new; nc++; }
        body.push(x.tag + x.text);
      }
      if (oldStart === null) oldStart = s0 > 0 ? t[s0 - 1].old + 1 : 0;
      if (newStart === null) newStart = s0 > 0 ? t[s0 - 1].new + 1 : 0;
      out.push('@@ -' + (oldStart + 1) + ',' + oc + ' +' + (newStart + 1) + ',' + nc + ' @@');
      for (const l of body) out.push(l);
    }
    return out.join('\n') + '\n';
  }

  // A patch's lines, tagged for display. Same idea as `rows`: the kit says what
  // each line IS and the caller decides what that looks like.
  function patchRows(text) {
    return String(text || '').split('\n').map(line => ({
      line,
      t: /^(---|\+\+\+) /.test(line) ? 'meta'
        : line.startsWith('@@') ? 'hunk'
        : line.startsWith('+') ? 'add'
        : line.startsWith('-') ? 'del' : 'ctx',
    }));
  }

  window.textDiff = {
    lines, words, wordParts, rows, patch, patchRows, esc, CAPS,
    get lastWarning() { return lastWarning; },
  };
})();
