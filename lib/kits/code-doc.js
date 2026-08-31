// SOURCE CODE AS A DECLARED RENDER: the second kind, and the one that says what
// the contract is actually for.
//
// It carries no aim of its own, and that is the finding rather than a gap.
// Markdown needs one because its unit is a run of siblings no text selection
// lands on cleanly: a section starts at a heading and ends at the next heading
// of equal or higher rank, which is a shape a finger cannot draw. A line range
// is the opposite. It is exactly what an ordinary selection spans, and the
// annotator has selected text since long before either kind existed. So this
// kind takes the address half of the contract and declines the gesture half,
// which is what the `aim` column being optional is for.
//
// WHAT IT BUYS: a note anywhere in a code render reads `lib/kits/peek.js:340`
// instead of `div > pre > code [1204-1260]`. Same trade md-doc makes, and the
// same reason: the first is an address a model can act on and the second is one
// it has to go looking for.
//
// LINES ARE COUNTED AGAINST THE SOURCE, never against the DOM. Prism wraps
// every token in a span, so the rendered tree bears no relation to the file's
// lines; the declared source does, and it is the only thing a line number can
// honestly agree with. Contract row: docs/routes-kinds.csv, kind `code`.
(function () {
  const KIND = Object.freeze({
    kind: 'code',
    label: 'Source code',
    unit: 'line range',
    aim: '',
    aimLabel: '',
    aimHint: '',
  });

  // `units` is the carrier's aim test and this kind has no aim, so the count
  // decides nothing here. It is still the honest number: an empty file declares
  // with nothing in it.
  function declare(box, o) {
    const source = String((o && o.source) ?? '');
    if (!window.srcDoc) return box;
    return window.srcDoc.declare(box, {
      kind: KIND, addr: (o && o.addr) || {}, source,
      units: source ? source.split('\n').length : 0,
    });
  }

  // WHERE A NODE SITS IN THE SOURCE, as a 1-based line or a line range.
  //
  // The offset comes from the rendered text, and the rendered text of a code
  // pane IS the file: a highlighter adds elements, never characters. So the
  // character count up to a node inside the box is the character count into the
  // source, and `lineAt` turns it into a line. That equivalence is the whole
  // trick, and it is what fails the moment a renderer adds line numbers as text
  // or folds a region away, which is why this measures rather than assuming:
  // an offset past the source's length answers with the last line.
  function offsetOf(box, node, nodeOffset) {
    if (!box || !node) return 0;
    const d = box.ownerDocument;
    if (!d || !d.createRange) return 0;
    try {
      const r = d.createRange();
      r.selectNodeContents(box);
      r.setEnd(node, nodeOffset == null ? 0 : nodeOffset);
      return r.toString().length;
    } catch { return 0; }
  }

  // The span a DOM Range covers, or a single line for a collapsed point.
  function lineSpan(range) {
    const st = window.srcDoc && window.srcDoc.stateOf(
      range && (range.startContainer || range));
    if (!st || !st.kind || st.kind.kind !== 'code') return null;
    const src = st.source || '';
    if (!range || !range.startContainer) return null;
    const a = window.srcDoc.lineAt(src, offsetOf(st.box, range.startContainer, range.startOffset));
    const b = range.collapsed ? a
      : window.srcDoc.lineAt(src, offsetOf(st.box, range.endContainer, range.endOffset));
    return { addr: st.addr || {}, start: Math.min(a, b), end: Math.max(a, b) };
  }

  // The one line a note carries. `path:12` for a point, `path:12-40` for a run,
  // matching the grep-and-editor form every tool in this estate already reads.
  function sourceRef(nodeOrRange) {
    const range = nodeOrRange && nodeOrRange.startContainer ? nodeOrRange : null;
    const st = window.srcDoc && window.srcDoc.stateOf(range ? range.startContainer : nodeOrRange);
    if (!st || !st.kind || st.kind.kind !== 'code' || !st.addr || !st.addr.path) return '';
    if (!range) return st.addr.path;
    const span = lineSpan(range);
    if (!span) return st.addr.path;
    return st.addr.path + ':' + span.start + (span.end > span.start ? '-' + span.end : '');
  }

  window.codeDoc = { KIND, declare, lineSpan, sourceRef, _offsetOf: offsetOf };
})();
