// Aligning N shortenings of one document onto a single adjudication surface.
//
// The problem this solves: with one proposal, a word diff is already the right
// surface, and every changed run is a two-way toggle. With several independent
// proposals it is not. Diffing them pairwise gives no common frame, and diffing
// each against the original separately gives N overlapping change maps that
// cannot be rendered as one document.
//
// The frame is the ORIGINAL. Every proposal is expressed as a list of ops in
// original coordinates, so "what does version C say here" is answerable for any
// span of the original, including spans C never touched (it says the original).
// Wherever at least one proposal changed something, that span becomes a CHOICE
// REGION carrying one option per distinct wording. Everywhere else is untouched
// prose that renders once.
//
// The region size is not fixed, and that is the useful part: light copy-edits
// produce word-sized regions, and two versions that rewrote the same paragraph
// wholesale produce a paragraph-sized one. The choice point ends up as large as
// the disagreement actually is.
//
// Pure: no DOM, no network, and the diff function is injected rather than
// imported, so this runs under node --test against the npm `diff` package and
// in the page against the CDN global. Attaches to window.ShorterMerge.
(() => {

  // One proposal, as a contiguous list of ops covering the original:
  //   { a, b, s, change }   original[a,b) was emitted as `s`
  // Unchanged ops carry s === original.slice(a,b). A pure insertion is a
  // zero-width op (a === b) with a non-empty s.
  function opsFor(original, text, diffFn) {
    const parts = diffFn(original || '', text || '');
    const ops = [];
    let pos = 0, pend = null;
    const flush = () => { if (pend) { ops.push(pend); pend = null; } };
    for (const p of parts) {
      if (p.added) {
        pend ||= { a: pos, b: pos, s: '', change: true };
        pend.s += p.value;
      } else if (p.removed) {
        pend ||= { a: pos, b: pos, s: '', change: true };
        pos += p.value.length;
        pend.b = pos;
      } else {
        flush();
        ops.push({ a: pos, b: pos + p.value.length, s: p.value, change: false });
        pos += p.value.length;
      }
    }
    flush();
    return ops;
  }

  // The union of every proposal's change intervals, merged into disjoint
  // regions. Touching counts as overlapping (next.a <= cur.b), so two
  // proposals that edit adjacent words produce one region rather than two
  // abutting ones the reader would have to decide twice.
  function regionsFrom(opsList) {
    const iv = [];
    for (const ops of opsList) for (const op of ops) if (op.change) iv.push([op.a, op.b]);
    if (!iv.length) return [];
    iv.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const out = [iv[0].slice()];
    for (let i = 1; i < iv.length; i++) {
      const cur = out[out.length - 1];
      if (iv[i][0] <= cur[1]) cur[1] = Math.max(cur[1], iv[i][1]);
      else out.push(iv[i].slice());
    }
    return out;
  }

  // Absorb the short equal runs left wedged between two regions.
  //
  // This matters more here than it did for a single diff. Two people rewriting
  // the same sentence from scratch still coincide on "the", "a", "was", and a
  // word diff dutifully reports those as unchanged, so one rewrite arrives as
  // six adjacent word-level decisions strung together by single spaces. They
  // are not six decisions. Merging across a gap of at most GAP non-space
  // characters restores the rewrite as one choice.
  //
  // The threshold cuts the other way too: two genuinely separate edits with a
  // short word between them merge into a phrase. That trade is deliberate, and
  // it is the same one the single-proposal path has always made. Cascading is
  // intended: where every few words is contested, the contested unit really is
  // the passage.
  //
  // A blank line stops absorption outright, whatever its length. Measured by
  // non-space characters a paragraph break is a gap of ZERO, so without this a
  // decision at the end of one paragraph silently annexes the start of the
  // next, and the reader is asked to adjudicate a span that reads across a
  // structural boundary. Paragraphs are the coarsest unit a decision may have,
  // never a thing a decision may straddle.
  const GAP = 4;
  const BREAK = /\n[ \t]*\n/;

  function absorbGaps(regions, src, maxGap) {
    const limit = typeof maxGap === 'number' ? maxGap : GAP;
    if (regions.length < 2) return regions;
    const out = [regions[0].slice()];
    for (let i = 1; i < regions.length; i++) {
      const cur = out[out.length - 1];
      const gap = src.slice(cur[1], regions[i][0]);
      if (gap.trim().length <= limit && !BREAK.test(gap)) cur[1] = Math.max(cur[1], regions[i][1]);
      else out.push(regions[i].slice());
    }
    return out;
  }

  // What one proposal says for original[A,B). Unchanged ops are sliced (they
  // map 1:1, so a partial overlap is exact). A change op that overlaps the
  // region is wholly inside it: regions are unions of change intervals, so any
  // interval touching a region was absorbed into it during the merge.
  function textForRegion(ops, A, B) {
    let out = '';
    for (const op of ops) {
      if (op.a === op.b) {                       // pure insertion at a point
        if (op.change && op.a >= A && op.a <= B) out += op.s;
        continue;
      }
      if (op.change) {
        if (op.a < B && op.b > A) out += op.s;
      } else {
        const s = Math.max(op.a, A), e = Math.min(op.b, B);
        if (e > s) out += op.s.slice(s - op.a, e - op.a);
      }
    }
    return out;
  }

  // Collapse a region's per-proposal wordings into DISTINCT options.
  //
  // This is the presentation decision, not just a dedupe. With four proposals
  // most regions are touched by one of them, so three would otherwise show as
  // three separate buttons all reading exactly like the original. Grouping by
  // text answers the more useful question: how many real choices are there,
  // and which versions converged on each. Agreement between independently
  // produced shortenings is itself evidence about the cut.
  //
  // Order is original first, then longest to shortest, so the options read as
  // a severity ramp rather than in the arbitrary order the versions were given.
  function optionsFor(originalText, perProposal) {
    const byText = new Map();
    const push = (text, label, idx) => {
      if (!byText.has(text)) byText.set(text, { text, labels: [], idxs: [] });
      const g = byText.get(text);
      g.labels.push(label);
      g.idxs.push(idx);
    };
    push(originalText, 'Original', -1);
    perProposal.forEach((p, i) => push(p.text, p.label, i));

    const groups = [...byText.values()];
    const orig = groups.find(g => g.idxs.includes(-1));
    const rest = groups.filter(g => g !== orig).sort((a, b) => words(b.text) - words(a.text));

    return [orig, ...rest].map((g) => {
      const agreed = g.labels.filter(l => l !== 'Original');
      const isOriginal = g.idxs.includes(-1);
      return {
        id: isOriginal ? 'original' : 'v' + g.idxs[0],
        // The label names who says this. On the original option, any proposals
        // that agreed are the interesting part: they chose not to cut here.
        label: isOriginal ? 'Original' : agreed.join(', '),
        agreed,
        isOriginal,
        // The palette index follows the FIRST proposal in the group, so a
        // version keeps one colour down the document even where others joined.
        vi: isOriginal ? -1 : g.idxs[0],
        text: g.text,
      };
    });
  }

  const words = (s) => (s ? (s.trim().match(/\S+/g) || []).length : 0);

  // A region whose options differ only in whitespace. A version that reflowed
  // a paragraph turns every line wrap into a change, and a word diff that
  // keeps whitespace as content reports each one: on a 1,827 word essay with
  // four versions, 15 of 88 regions were a newline against a space. There is
  // nothing to decide there.
  //
  // They stay as segments rather than being flattened away, because selecting
  // a version at every region has to reproduce that version BYTE for byte, and
  // flattening would silently substitute the original's wrapping. So the
  // region keeps its options and its selection, and only stops presenting
  // itself as a question: the page filters `trivial` out of the decision list
  // and renders it as ordinary prose.
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const isTrivial = (options) => new Set(options.map(o => norm(o.text))).size === 1;

  // original + [{label, note, text}] -> flat segment list for rendering.
  //
  //   { kind: 'equal',  id, text }
  //   { kind: 'choice', id, a, b, options[], selected, trivial }
  //
  // A region every proposal left alone cannot occur (it would not be a region),
  // but a region where all proposals agree with each other collapses to two
  // options, which is the common and desirable case.
  function build(original, proposals, diffFn, opts) {
    const src = original || '';
    const list = (proposals || []).filter(p => p && typeof p.text === 'string');
    if (!src || !list.length) return [];

    const opsList = list.map(p => opsFor(src, p.text, diffFn));
    const regions = absorbGaps(regionsFrom(opsList), src, opts && opts.gap);

    const segs = [];
    let cursor = 0, id = 0;
    for (const [A, B] of regions) {
      if (A > cursor) segs.push({ id: id++, kind: 'equal', text: src.slice(cursor, A) });
      const options = optionsFor(
        src.slice(A, B),
        list.map((p, i) => ({ label: p.label, text: textForRegion(opsList[i], A, B) })),
      );
      segs.push({ id: id++, kind: 'choice', a: A, b: B, options, selected: options[0].id, trivial: isTrivial(options) });
      cursor = B;
    }
    if (cursor < src.length) segs.push({ id: id++, kind: 'equal', text: src.slice(cursor) });
    return segs;
  }

  window.ShorterMerge = { opsFor, regionsFrom, absorbGaps, textForRegion, optionsFor, isTrivial, build, words, GAP };
})();
