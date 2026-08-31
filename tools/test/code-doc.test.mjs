// lib/kits/code-doc.js — source code as a declared render, and the half of the
// kinds contract it takes.
//
// It takes the ADDRESS half and declines the AIM half, which is the finding
// this kind exists to prove rather than a gap in it. A markdown section is a
// run of siblings no text selection lands on cleanly, so markdown needs a
// gesture of its own; a line range is exactly what a selection spans, so this
// one does not. docs/routes-kinds.csv carries both answers as data and
// routes-manifest.test.mjs holds the kits to their rows; what is checked here
// is the resolution itself, which no registry can state.
//
// LINES ARE COUNTED AGAINST THE SOURCE, never the DOM. Prism wraps every token
// in a span, so the rendered tree bears no relation to the file's lines. The
// equivalence that makes this work is narrower than it looks and is asserted
// below: a highlighter adds ELEMENTS and never CHARACTERS, so the rendered text
// of a code pane is the file.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, loadKit } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
loadKit('src-doc.js', { window });
loadKit('code-doc.js', { window });
const doc = window.document;

const SRC = [
  'const a = 1;',            // 1
  '',                        // 2
  'function go() {',         // 3
  '  return a + 1;',         // 4
  '}',                       // 5
].join('\n');

// A code pane the way the viewer builds one: <pre><code>, escaped source, and
// the declaration on the <code>.
function mount(source = SRC, addr = { repo: 'mehrlander/web-tools', ref: 'main', path: 'lib/kits/peek.js' }) {
  doc.body.textContent = '';
  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  code.textContent = source;
  pre.appendChild(code);
  doc.body.appendChild(pre);
  window.codeDoc.declare(code, { source, addr });
  return code;
}

// A range over the rendered text, by character offset into the box. This is the
// selection a reader drags, expressed the way a test can be exact about.
function rangeIn(box, start, end) {
  const walk = doc.createTreeWalker(box, 4 /* SHOW_TEXT */);
  const at = (offset) => {
    let seen = 0;
    walk.currentNode = box;
    let n;
    while ((n = walk.nextNode())) {
      const len = n.nodeValue.length;
      if (seen + len >= offset) return [n, offset - seen];
      seen += len;
    }
    return [box, 0];
  };
  const r = doc.createRange();
  const [sn, so] = at(start);
  const [en, eo] = at(end == null ? start : end);
  r.setStart(sn, so);
  r.setEnd(en, eo);
  return r;
}

test('a code render declares, and says which kind it is', () => {
  const box = mount();
  const st = window.srcDoc.stateOf(box);
  assert.equal(st.kind.kind, 'code');
  assert.equal(st.source, SRC);
  assert.equal(st.addr.path, 'lib/kits/peek.js');
  assert.equal(st.units, 5, 'five lines');
});

// The half that matters, and the reason the aim column is optional.
test('the declaration carries no aim, so no control offers one', () => {
  mount();
  assert.equal(window.codeDoc.KIND.aim, '');
  assert.equal(window.srcDoc.declaredIn(doc), null,
    'a kind with no aim must not light a gesture the annotator cannot honor');
  // And it is still declared: the address half is unconditional.
  assert.ok(window.srcDoc.declaredIn(doc, { aim: false }),
    'declining an aim is not declining to declare');
});

test('a collapsed point reads as one line', () => {
  const box = mount();
  const r = rangeIn(box, SRC.indexOf('function'));
  assert.deepEqual(window.codeDoc.lineSpan(r), {
    addr: { repo: 'mehrlander/web-tools', ref: 'main', path: 'lib/kits/peek.js' },
    start: 3, end: 3,
  });
  assert.equal(window.codeDoc.sourceRef(r), 'lib/kits/peek.js:3');
});

test('a run of lines reads as a range', () => {
  const box = mount();
  const r = rangeIn(box, SRC.indexOf('function'), SRC.indexOf('}') + 1);
  assert.equal(window.codeDoc.sourceRef(r), 'lib/kits/peek.js:3-5');
});

// A DOM Range CANNOT run backwards: setEnd before the start collapses it, and
// a backwards drag reaches script through Selection, which hands out a
// normalized range. So the ordering guard in lineSpan is unreachable from the
// browser and this says so rather than pretending to test a drag.
//
// It is kept because sourceRef accepts anything carrying a startContainer, a
// hand-built descriptor included, and that one can be any order at all.
test('a range cannot run backwards, and a hand-built one is ordered anyway', () => {
  const box = mount();
  const fwd = rangeIn(box, SRC.indexOf('function'), SRC.indexOf('}') + 1);

  const back = doc.createRange();
  back.setStart(fwd.endContainer, fwd.endOffset);
  back.setEnd(fwd.startContainer, fwd.startOffset);
  assert.equal(back.collapsed, true, 'the DOM collapsed it rather than reversing it');

  const span = window.codeDoc.lineSpan({
    startContainer: fwd.endContainer, startOffset: fwd.endOffset,
    endContainer: fwd.startContainer, endOffset: fwd.startOffset,
    collapsed: false,
  });
  assert.deepEqual([span.start, span.end], [3, 5], 'start must not follow end');
});

// The equivalence the whole kit rests on. A highlighter adds elements, so the
// tree changes and the TEXT does not: split the source across spans the way
// Prism does and every answer has to be identical.
test('highlighting changes the tree and not the answer', () => {
  doc.body.textContent = '';
  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  for (const piece of [SRC.slice(0, 6), SRC.slice(6, 20), SRC.slice(20)]) {
    const span = doc.createElement('span');
    span.className = 'token';
    span.textContent = piece;
    code.appendChild(span);
  }
  pre.appendChild(code);
  doc.body.appendChild(pre);
  window.codeDoc.declare(code, { source: SRC, addr: { path: 'lib/kits/peek.js' } });

  const r = rangeIn(code, SRC.indexOf('function'), SRC.indexOf('}') + 1);
  assert.equal(code.childNodes.length, 3, 'the tree really is split');
  assert.equal(window.codeDoc.sourceRef(r), 'lib/kits/peek.js:3-5',
    'the same answer through three spans as through one text node');
});

test('a node outside any code render answers with nothing', () => {
  mount();
  const stray = doc.createElement('p');
  doc.body.appendChild(stray);
  assert.equal(window.codeDoc.sourceRef(stray), '');
  assert.equal(window.codeDoc.lineSpan(stray), null);
});

// A declared render whose address has no path can still be pointed at; it just
// has nothing to name. Same rule md-doc's sourceRef applies.
test('no path, no reference', () => {
  const box = mount(SRC, {});
  const r = rangeIn(box, 0, 5);
  assert.equal(window.codeDoc.sourceRef(r), '');
});
