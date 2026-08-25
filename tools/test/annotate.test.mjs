// annotate.test.mjs — the annotation kit's pure core: quote anchors survive
// the round trip (range → {exact, prefix, suffix} → range), duplicates
// disambiguate on context, structural context (css path, heading trail)
// resolves back, and the serializations carry what a reader needs. The jot
// save is exercised against a stubbed GH to pin the fresh-read → mutate →
// save shape without a network. The pointer UI (selection bubble, element
// pick, region drag) is real-browser behavior and is not simulated here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow } from './bootstrap.mjs';
import { loadKit } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><head><title>Sample doc</title></head><body>
    <article id="art">
      <h1>Doc title</h1>
      <p id="p1">The quick brown fox jumps over the lazy dog.</p>
      <h2>Section two</h2>
      <p id="p2">A repeated phrase sits here. Some middle text. A repeated phrase sits here too.</p>
      <ul><li id="li1">First item with detail</li></ul>
    </article>
  </body></html>`,
});
const doc = window.document;

loadKit('annotate.js', { window });
const A = window.Annotate;

// The way into the keyboard, and the only one since the pencil was retired
// (2026-08-14): a double tap on the composer's read surface. jsdom has no
// layout, so hitsText answers false for every point and the pair lands on the
// CANVAS, which opens the keyboard with the caret at the end. A test that
// needs it opened somewhere else taps on the text with hitsText stubbed, the
// way the double-tap test does.
const openKeyboard = (S) => {
  for (let i = 0; i < 2; i++) {
    const e = new window.Event('pointerup', { bubbles: true });
    e.clientX = 20; e.clientY = 500;
    S.compView.dispatchEvent(e);
  }
};

test('quote anchor round-trips through the text index', () => {
  const p1 = doc.getElementById('p1').firstChild;
  const r = doc.createRange();
  r.setStart(p1, 4);            // "quick brown fox"
  r.setEnd(p1, 19);
  const q = A._quoteFor(doc.body, r);
  assert.equal(q.exact, 'quick brown fox');
  assert.ok(q.prefix.endsWith('The '));
  assert.ok(q.suffix.startsWith(' jumps'));

  const back = A._resolveQuote(doc.body, q);
  assert.ok(back, 'quote re-resolves');
  assert.equal(back.toString(), 'quick brown fox');
});

test('a duplicated exact disambiguates on prefix/suffix context', () => {
  const p2 = doc.getElementById('p2').firstChild;
  const text = p2.data;
  const second = text.indexOf('A repeated phrase', 10);
  const r = doc.createRange();
  r.setStart(p2, second);
  r.setEnd(p2, second + 'A repeated phrase'.length);
  const q = A._quoteFor(doc.body, r);
  assert.equal(q.exact, 'A repeated phrase');
  assert.ok(q.prefix.includes('middle text'), 'context captured the second occurrence');

  const back = A._resolveQuote(doc.body, q);
  const idx = A._textIndex(doc.body);
  const at = idx.text.indexOf(back.toString(), idx.text.indexOf('middle'));
  assert.ok(at > -1, 'resolved to the occurrence after the middle text');
});

test('css path resolves back to the element; heading trail reads like a citation', () => {
  const li = doc.getElementById('li1');
  const sel = A._cssPath(li, doc.body);
  assert.equal(doc.querySelector(sel), li, sel);
  assert.equal(A._headingTrail(li), 'Doc title › Section two');
  assert.equal(A._headingTrail(doc.getElementById('p1')), 'Doc title');
});

test('enable + add + serialize: markdown and JSON carry the set', () => {
  A.enable({ doc, subject: { title: 'docs/sample.md', url: 'https://example.test/sample' } });
  assert.ok(A.enabled);

  const p1 = doc.getElementById('p1').firstChild;
  const r = doc.createRange();
  r.setStart(p1, 4);
  r.setEnd(p1, 19);
  const q = A._quoteFor(doc.body, r);
  A.add({ type: 'text', quote: q, selector: 'p#p1', label: 'Doc title' }, 'tighten this');
  A.add({ type: 'element', selector: '#li1', label: 'Doc title › Section two', excerpt: 'First item with detail' }, 'promote to heading');

  const md = A.toMarkdown();
  assert.ok(md.startsWith('# Notes — docs/sample.md'));
  assert.ok(md.includes('https://example.test/sample'));
  assert.ok(md.includes('2 notes'));
  assert.ok(md.includes('> quick brown fox'));
  assert.ok(md.includes('**Note:** tighten this'), 'the reader’s own words are labeled as such');
  assert.ok(md.includes('Context: Doc title › Section two'));
  assert.ok(md.includes('promote to heading'));

  const j = A.toJSON();
  assert.equal(j.format, 'annotate/1');
  assert.equal(j.notes.length, 2);
  assert.equal(j.notes[0].type, 'text');
  assert.equal(j.notes[0].quote.exact, 'quick brown fox');
  assert.equal(j.notes[1].selector, '#li1');
});

test('saveJot appends one jot through fresh-read → mutate → save', async () => {
  const calls = [];
  window.TOKEN = 't0ken';
  window.GH = class {
    constructor(opts) { this.opts = opts; }
    async get() { const e = new Error('missing'); e.status = 404; throw e; }
    async save(path, data, message) { calls.push({ path, data, message, repo: this.opts.repo }); }
  };
  const jot = await A.saveJot();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].repo, 'mehrlander/web-tools-private');
  assert.equal(calls[0].path, 'lists/jots.json');
  assert.equal(calls[0].data.items.length, 1);
  assert.ok(calls[0].data.items[0].text.startsWith('# Notes — docs/sample.md'));
  assert.ok(calls[0].message.includes('via annotate'));
  assert.ok(jot.id.startsWith('j'));
});

test('a two-bullet selection serializes clean: edges trimmed, markers restored', () => {
  // Reproduces the first field test (2026-08-08): selecting across two <li>s
  // from the whitespace before the first one produced a quote opening with
  // blank "> " lines and no bullet markers.
  doc.body.insertAdjacentHTML('beforeend', `
    <ul id="pair">
      <li><b>First.md</b> — the first thing, described.</li>
      <li><b>Second.md</b> — the second thing, described.</li>
    </ul>`);
  const ul = doc.getElementById('pair');
  const r = doc.createRange();
  r.setStart(ul, 0);                                  // before the first li: pure whitespace
  r.setEnd(ul.lastElementChild.lastChild, ul.lastElementChild.lastChild.data.length);

  const q = A._quoteFor(doc.body, r);
  assert.ok(q.exact.startsWith('First.md'), 'leading inter-element whitespace trimmed from the anchor');
  assert.ok(q.exact.endsWith('described.'));

  const display = A._displayFor(r);
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'text', quote: q, display, label: '' }, 'double bullets');
  const md = A.toMarkdown();
  assert.ok(md.includes('> - First.md — the first thing, described.'), md);
  assert.ok(md.includes('> - Second.md — the second thing, described.'));
  assert.ok(!/^>\s*$/m.test(md.split('## 1.')[1].split('double bullets')[0].trim().split('\n')[0]),
    'the quote does not open with a blank quoted line');
  A.clear();
});

test('a text target addresses a DOM path plus a character span inside it', () => {
  const p2 = doc.getElementById('p2').firstChild;
  const second = p2.data.indexOf('A repeated phrase', 10);
  const r = doc.createRange();
  r.setStart(p2, second);
  r.setEnd(p2, second + 'A repeated phrase'.length);

  const addr = A._addressFor(doc.getElementById('p2'), r);
  assert.equal(addr.selector, '#p2', 'the block, addressed by css path');
  assert.deepEqual(addr.span, { start: second, end: second + 'A repeated phrase'.length },
    'offsets into the block, not the document');
  assert.equal(A._addressText({ selector: addr.selector, span: addr.span }),
    `#p2 [${second}-${second + 17}]`);

  // The span is what the quote alone cannot supply: both occurrences of this
  // phrase produce the same `exact`, and only the address separates them.
  const first = doc.createRange();
  first.setStart(p2, 0);
  first.setEnd(p2, 'A repeated phrase'.length);
  const a1 = A._addressFor(doc.getElementById('p2'), first);
  assert.equal(a1.span.start, 0);
  assert.notEqual(a1.span.start, addr.span.start, 'two identical phrases, two addresses');

  // A selection leaving the block gets the path and no span: an offset
  // measured against a block the selection exits would be a wrong number.
  const across = doc.createRange();
  across.setStart(p2, 0);
  across.setEnd(doc.getElementById('li1').firstChild, 3);
  assert.equal(A._addressFor(doc.getElementById('p2'), across).span, null);
});

test('the address rides the markdown so a model can act on the path', () => {
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const p1 = doc.getElementById('p1').firstChild;
  const r = doc.createRange();
  r.setStart(p1, 4);
  r.setEnd(p1, 19);
  const q = A._quoteFor(doc.body, r);
  const addr = A._addressFor(doc.getElementById('p1'), r);
  A.add({ type: 'text', quote: q, selector: addr.selector, span: addr.span }, 'tighten');
  assert.ok(A.toMarkdown().includes('Path: `#p1 [4-19]`'), A.toMarkdown());
  assert.deepEqual(A.toJSON().notes[0].span, { start: 4, end: 19 }, 'and the JSON carries it structurally');
  A.clear();
});

test('selection is state: one note is current, and update edits it in place', () => {
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const a = A.add({ type: 'text', quote: { exact: 'one', prefix: '', suffix: '' } }, 'first');
  const b = A.add({ type: 'text', quote: { exact: 'two', prefix: '', suffix: '' } }, 'second');
  assert.equal(A.selected, null, 'nothing is selected until something is');

  A.select(b.id);
  assert.equal(A.selected.id, b.id);
  A.select(b.id);                       // re-selecting is not a toggle at the API level
  assert.equal(A.selected.id, b.id, 'select(id) is idempotent; the row handler owns the toggle');
  A.select(null);
  assert.equal(A.selected, null);

  // An unknown id selects nothing rather than pointing at a ghost.
  A.select('nope');
  assert.equal(A.selected, null);

  // Editing changes the note and leaves the anchor alone: a note is edited,
  // a passage is re-selected, and conflating them moves a pinned anchor.
  const before = a.target;
  A.update(a.id, 'first, revised');
  assert.equal(A.items[0].note, 'first, revised');
  assert.equal(A.items[0].target, before, 'the target is untouched');
  assert.ok(A.items[0].editedAt, 'an edit is dated');
  assert.equal(A.update('nope', 'x'), null, 'updating a missing id is a no-op, not a throw');

  // Removing the selected note clears the selection rather than leaving it
  // pointed at something that is gone.
  A.select(b.id);
  A.remove(b.id);
  assert.equal(A.selected, null);
  A.clear();
});

test('the set announces its changes, for anyone outside the card who wants to know', () => {
  A.enable({ doc, subject: { title: 'sample', url: 'https://example.test/s' } });
  A.clear();

  // The kit owns the data and announces that it moved. The card is the reading
  // surface now; the announcement survives it as a public signal, and is what
  // the drawer's Notes tab used to live on before that tab was retired.
  const seen = [];
  const onChange = () => seen.push(A.items.length);
  window.addEventListener('annotate:change', onChange);

  const it = A.add({ type: 'text', quote: { exact: 'one', prefix: '', suffix: '' }, selector: '#p1' }, 'first');
  A.update(it.id, 'first, revised');
  A.select(it.id, { scroll: false });
  A.remove(it.id);
  assert.deepEqual(seen, [1, 1, 1, 0], 'add, update, select and remove each announce');
  window.removeEventListener('annotate:change', onChange);
  assert.equal(typeof A.review, 'undefined', 'and Review is gone with the tab it asked for');
  A.clear();
});

test('announcements climb to the top window, since a listener is usually up there', () => {
  // A toss runs the annotated page in an iframe, so a listener is in the TOP
  // window while the kit is in the frame. An announcement that only reached its
  // own window was shouted into the frame nobody watches: measured 2026-08-09,
  // when Review reported "no drawer" with the launcher visible in the same
  // screenshot. Review is retired; the climb is what outlived it.
  //
  // jsdom's window.top is non-configurable, so the framed kit gets its own
  // stub window. That is honest to the case anyway: a second kit instance in a
  // second window is exactly what a toss produces.
  const seen = { self: [], top: [] };
  const topWin = { claim: false,
    dispatchEvent(e) { seen.top.push(e.type); return !topWin.claim; } };
  const frameWin = { dispatchEvent(e) { seen.self.push(e.type); return true; } };
  frameWin.top = topWin;
  loadKit('annotate.js', { window: frameWin });
  const F = frameWin.Annotate;

  assert.equal(F._announce('annotate:change'), false, 'nobody claimed it');
  assert.deepEqual(seen.self, ['annotate:change']);
  assert.deepEqual(seen.top, ['annotate:change'], 'and it reached the shell one frame up');

  topWin.claim = true;
  assert.equal(F._announce('annotate:change', true), true,
    'and a listener one frame up can claim it');

  // Unframed, top IS the window, and one dispatch must not become two: a
  // doubled change event is a doubled re-read of the whole set.
  seen.self.length = seen.top.length = 0;
  const plain = { dispatchEvent(e) { seen.self.push(e.type); return true; } };
  plain.top = plain;
  loadKit('annotate.js', { window: plain });
  plain.Annotate._announce('annotate:change');
  assert.deepEqual(seen.self, ['annotate:change'], 'announced once, not twice');

  // A cross-origin top throws on access; the local dispatch still stands.
  seen.self.length = 0;
  const walled = { dispatchEvent(e) { seen.self.push(e.type); return true; },
                   get top() { throw new Error('cross-origin'); } };
  loadKit('annotate.js', { window: walled });
  assert.doesNotThrow(() => walled.Annotate._announce('annotate:change'));
  assert.deepEqual(seen.self, ['annotate:change']);
});

test('a capture mode leaves its own way out, and dismissing keeps the notes', () => {
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'text', quote: { exact: 'one', prefix: '', suffix: '' } }, 'kept');

  // The card stays up through a capture mode. Hiding it also hid the chip that
  // exits, which left Region with a single exit: finish a note. There is no Esc
  // key on a phone, so a reader who opened it by mistake was stuck.
  A.startRegion();
  assert.equal(A._state.mode, 'region');
  assert.equal(A._state.panel.style.display, 'flex', 'the card is still on screen');
  const cover = [...doc.querySelectorAll('div')].find(d => d.style.cursor === 'crosshair');
  assert.ok(cover, 'the drag cover exists');
  assert.ok(+cover.style.zIndex < +A._state.ui.style.zIndex,
    'and sits UNDER the card, so the chip stays tappable');

  // Tapping the active chip is the way out, and it is reachable now.
  A._state.modeChips.region.dispatchEvent(new window.Event('click'));
  assert.equal(A._state.mode, null, 'the chip toggles the mode off');

  A.startPick();
  assert.equal(A._state.panel.style.display, 'flex', 'element mode keeps it too');
  A._state.modeChips.pick.dispatchEvent(new window.Event('click'));
  assert.equal(A._state.mode, null);

  // Dismissing is "put it away", not "throw it out": there is no launcher pill
  // to bring it back, so the notes have to survive for the drawer to show them.
  A.disable();
  assert.equal(A.enabled, false);
  assert.equal(A.items.length, 1, 'the set outlives the card');
  A.enable({ doc, subject: { title: 'x', url: '' } });
  assert.equal(A.items.length, 1, 'and comes back with it');
  A.clear();
});

test('remove and clear keep the list and paint state consistent', () => {
  A.add({ type: 'text', quote: { exact: 'one', prefix: '', suffix: '' } }, 'n1');
  A.add({ type: 'text', quote: { exact: 'two', prefix: '', suffix: '' } }, 'n2');
  assert.equal(A.items.length, 2);
  A.remove(A.items[0].id);
  assert.equal(A.items.length, 1);
  A.clear();
  assert.equal(A.items.length, 0);
  A.disable();
  assert.ok(!A.enabled);
});

// ── Dictation: the seam, not the engine ───────────────────────────────────
// The composition rules moved to tools/test/dictate.test.mjs with the engine
// on 2026-08-09. What stays here is what the annotator owes the pair: it
// builds an engine from the kit when one is loaded, and it degrades to a
// composer with no microphone when one is not, rather than throwing on a
// window that never chained kits/dictate.js.
class FakeSR {
  constructor() { FakeSR.last = this; this.started = 0; }
  start() { this.started++; }
  stop() { this.onend && this.onend(); }
  say(parts) {
    const results = parts.map(p => Object.assign([{ transcript: p.t }], { isFinal: !!p.final }));
    results.resultIndex = 0;
    this.onresult({ resultIndex: 0, results });
  }
}

test('the annotator builds its engine from kits/dictate.js and paints what it hears', () => {
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const d = A._state.dict;
  assert.ok(d, 'the annotator built a dictation engine');

  // The wiring is the claim: text spoken into the engine reaches the buffer
  // the composer reads, through the callbacks enable() passed in.
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'a note by voice', final: true }]);
  assert.equal(d.text, 'a note by voice.',
    'including the period the pause earned, which is the kit\'s rule and not the annotator\'s');
  d.stop();
  A.disable();
});

test('without the dictate kit the annotator still works, minus the microphone', () => {
  // A page may chain annotate.js alone. The composer must open, take a typed
  // note, and serialize; only the voice affordance is missing. Anything else
  // makes the kit pair a hard dependency, which it is deliberately not.
  const { window: bare } = makeWindow({
    html: `<!doctype html><html><body><p id="t">Some text to annotate here.</p></body></html>`,
  });
  bare.SpeechRecognition = FakeSR;      // a recognizer exists; the KIT does not
  loadKit('annotate.js', { window: bare });
  const B = bare.Annotate;
  B.enable({ doc: bare.document, subject: { title: 'bare', url: '' } });
  assert.equal(B.enabled, true, 'enable() survives a missing Dictate');
  assert.equal(bare.Annotate._state.dict, null, 'and leaves no engine behind');

  B.add({ type: 'text', quote: { exact: 'Some text', prefix: '', suffix: '' } }, 'typed');
  assert.equal(B.items.length, 1);
  assert.match(B.toMarkdown(), /typed/, 'the set still serializes');
  B.disable();
});

test('the keyboard opens on the phrase that was on screen, not the one before it', () => {
  // stop() runs the engine's end handler, which clears the interim, so the
  // flush has to come first. The other order lost the sentence the reader was
  // looking at when they reached for the keyboard. Found in the stage's copy of
  // the same toggle (tools/test/stage.test.mjs) and fixed in both.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const d = A._state.dict;
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'the settled part', final: true }]);
  FakeSR.last.say([{ t: 'and the part still being heard', final: false }]);

  openKeyboard(A._state);
  assert.equal(A._state.editing, true);
  assert.equal(A._state.compTa.value, 'the settled part. and the part still being heard.',
    'the interim rode into the textarea rather than being dropped by the stop');
  A.disable();
});

test('the composer paints through the kit and swaps its pad for a selection', () => {
  // The seam again: the offsets are the kit's, the pixels are this file's, and
  // the pad's face is a reading of the kit's state rather than a second copy
  // of it. The GESTURES are not here (a long press maps a point to a node,
  // which needs a layout engine); what is asserted is everything downstream.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state, d = S.dict;
  d.text = 'the quick brown fox';

  const body = S.compBody;
  // Text plus a caret at the end: the composer asks for `endCaret`, because a
  // caret at the very end is a null range and the surface would otherwise show
  // no cursor at exactly the place the cursor pad can always reach.
  assert.deepEqual([...body.childNodes].map(n => n.getAttribute('data-d')), ['text', 'caret'],
    'no selection, and the insertion point still says where it is');

  d.selectWordAt(6);                       // "quick"
  A._paintDraft();
  assert.deepEqual([...body.childNodes].map(n => n.getAttribute('data-d')),
    ['text', 'sel', 'text'], 'the text box holds only text');
  // The handles live in the LAYER, outside the scrolling box, so a ball above
  // the first line sits in the white space rather than being clipped by it.
  const layer = S.compStack;
  assert.deepEqual([...layer.querySelectorAll('[data-edge]')].map(n => n.getAttribute('data-edge')),
    ['start', 'end']);
  assert.ok(!body.querySelector('[data-edge]'), 'and none of them is inside the text');
  assert.equal(body.querySelector('[data-d="sel"]').textContent, 'quick');

  // The pad is now casing, and its fourth key is the way out of the mode.
  const keys = [...S.compPunct.children].map(b => b.textContent);
  assert.deepEqual(keys.slice(0, 3), ['AB', 'ab', 'Ab']);
  assert.equal(keys[3], '✕', 'and one key drops the selection, so the mode has an exit');

  S.compPunct.children[0].dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(d.text, 'the QUICK brown fox', 'the key cased the selection');

  S.compPunct.children[3].dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(d.hasSelection, false);
  assert.deepEqual([...S.compPunct.children].map(b => b.textContent).slice(0, 3), ['.', ',', '?'],
    'and the marks came back');
  A.disable();
});

test('a caret in a sentence gap turns the full-stop key into the key that takes one back', () => {
  // The pad already swaps its whole face for a selection. This swaps ONE cell,
  // and it is the cell whose own mark is the thing being undone: a full stop
  // cannot be wanted where one is already sitting, so nothing is lost while
  // the stitch is showing, and `,` and `?` do not move under the thumb.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.notePage({ listen: false });
  const S = A._state;
  const face = () => [...S.compPunct.children]
    .map(b => b._icon ? b._icon.className.replace('ph ph-', '') : b.textContent);

  S.dict.text = 'I went to the store. And then I came back';
  A._paintDraft();
  assert.deepEqual(face().slice(0, 3), ['.', ',', '?'], 'at rest it is the marks');

  S.dict.caretAt(20);                     // the gap
  assert.deepEqual(face().slice(0, 3), ['arrows-in-line-horizontal', ',', '?']);
  assert.match(S.compPunct.children[0].style.background, /254, 249, 195|#fef9c3/,
    'and it tints, since it appeared under a thumb aimed at something else');

  S.compPunct.children[0].dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(S.dict.text, 'I went to the store and then I came back',
    'one tap: the mark goes and the capital comes down with it');
  assert.deepEqual(face().slice(0, 3), ['.', ',', '?'], 'and the marks are back, the seam being closed');
  A.disable();
});

test('an icon key paints its glyph, which the swap alone could not', () => {
  // The pad's keys are plain buttons, so setIcon had no `_icon` to reach and
  // the one glyph face in the set, `¶`, rendered EMPTY. Found 2026-08-15 while
  // adding a second glyph key beside it.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.notePage({ listen: false });
  const S = A._state;
  S.compShiftBtn.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  const para = S.compPunct.children[2];
  assert.ok(para._icon, 'the paragraph key has a face');
  assert.equal(para._icon.className, 'ph ph-paragraph');
  S.compShiftBtn.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(S.compPunct.children[2].textContent, '?', 'and swapping back leaves no glyph behind');
  A.disable();
});

test('the card refuses the browser its own selection, from a stylesheet', () => {
  // The lock is a RULE, not an inline style, and the reason is a trap worth
  // keeping named. `-webkit-touch-callout` is absent from the CSSOM's property
  // list, so it survives only as authored attribute text, and any later
  // `.style.foo =` on that element re-serializes the attribute from its parsed
  // declarations and drops it. The frame writes `gridColumn` on the text cell
  // as it lays out, which took the lock off silently until this test caught it.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const sheet = doc.getElementById('annotate-style');
  assert.ok(sheet, 'the kit injects one stylesheet, and the lock rides it');
  assert.match(sheet.textContent, /-webkit-touch-callout:\s*none/,
    'the iOS callout landing over the text is what this is for');
  assert.match(sheet.textContent, /user-select:\s*none/);
  assert.match(sheet.textContent, /textarea[^{]*\{[^}]*user-select:\s*text/,
    'and the one child that needs a real caret opts back out');

  // The inline write that used to hold it happens anyway, and must not matter.
  A._state.compView.style.gridColumn = '1 / 6';
  assert.match(doc.getElementById('annotate-style').textContent, /-webkit-touch-callout:\s*none/,
    'an inline write on the locked element cannot clobber a rule');
  A.disable();
});

test('a tap on the blank canvas sends the caret to the end', () => {
  // The listeners are on the SCROLL BOX, not on the painted span. A span
  // shrink-wraps to its text, so the canvas below the last line belongs to the
  // box and a tap there used to reach no handler at all: every tap that landed
  // on words worked, which is what hid it. jsdom has no layout, so
  // getClientRects is empty and hitsText answers false for every point, which
  // is exactly the case under test.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state, d = S.dict;
  d.text = 'the quick brown fox';
  d.selectWordAt(6);
  A._paintDraft();
  assert.equal(d.hasSelection, true);

  const tap = new window.Event('pointerup', { bubbles: true });
  tap.clientX = 50; tap.clientY = 500;
  S.compView.dispatchEvent(tap);

  assert.equal(d.range, null, 'the caret is past the last character, so the next words append');
  assert.equal(d.hasSelection, false);
  assert.equal(d.text, 'the quick brown fox', 'and getting there wrote nothing');
  assert.ok(!S.compStack.querySelector('[data-edge]'), 'the pins went with it');
  A.disable();
});

test('a keyboard writes into the draft, without asking for a textarea first', () => {
  // The read surface is a DISPLAY, so it takes no keystrokes of its own, and a
  // desktop reader had to ask for a textarea before a keyboard did anything.
  // Nothing about a physical keyboard needs asking: a printable key arriving
  // IS the device saying it has one, which beats any media query and covers a
  // keyboard paired to a phone for free.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  const key = (init) => {
    const e = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(e, { key: 'a', ctrlKey: false, metaKey: false, altKey: false }, init);
    doc.dispatchEvent(e);
    return e;
  };

  // No draft staged: the annotator is not a text editor at rest.
  key({ key: 'x' });
  assert.equal(S.dict.text, '');

  A.notePage({ listen: false });
  assert.ok(S.draft, 'a draft is open');
  for (const c of 'hi') key({ key: c });
  assert.equal(S.dict.text, 'hi', 'a key is not a phrase: no joining space between letters');

  key({ key: ' ' });
  key({ key: 't' });
  assert.equal(S.dict.text, 'hi t');
  key({ key: 'Backspace' });
  assert.equal(S.dict.text, 'hi ', 'backspace takes a character where the row key takes a word');
  key({ key: 'Enter' });
  assert.equal(S.dict.text, 'hi \n');

  // A shortcut this card does not claim is not a letter either, and stays the
  // platform's. (The three it does claim are the test below.)
  const before = S.dict.text;
  key({ key: 's', metaKey: true });
  assert.equal(S.dict.text, before, 'cmd-S belongs to the platform, not to us');
  const field = doc.createElement('input');
  doc.body.appendChild(field);
  const e = new window.Event('keydown', { bubbles: true, cancelable: true });
  Object.assign(e, { key: 'q' });
  field.dispatchEvent(e);
  assert.equal(S.dict.text, before, 'a key typed into a page input stays there');
  field.remove();

  // A RUN IS ONE STEP, and a change of kind ends the run: the letters, then
  // the backspace, then the newline are three steps rather than seven.
  S.dict.undo();
  assert.equal(S.dict.text, 'hi ', 'the newline');
  S.dict.undo();
  assert.equal(S.dict.text, 'hi t', 'the backspace');
  S.dict.undo();
  assert.equal(S.dict.text, '', 'and the whole typing run at once');
  A.disable();
});

test('the card claims three shortcuts, and only three', () => {
  // Undo, redo and word-delete were reachable by a key on the row and by no
  // keystroke at all, which left a keyboard reader tapping a button for the
  // one operation every editor binds. Claiming them costs the platform nothing
  // here: with a draft staged there is no native editable focused, so the
  // browser's own undo has nothing to undo.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state, d = S.dict;
  A.notePage({ listen: false });
  const key = (init) => {
    const e = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(e, { key: 'a', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, init);
    doc.dispatchEvent(e);
    return e;
  };

  d.insert('one two three');
  assert.equal(d.canUndo, true);
  key({ key: 'z', metaKey: true });
  assert.equal(d.text, '', 'cmd-Z undoes');
  key({ key: 'z', metaKey: true, shiftKey: true });
  assert.equal(d.text, 'one two three', 'cmd-shift-Z redoes');
  key({ key: 'z', ctrlKey: true });
  assert.equal(d.text, '', 'and ctrl-Z is the same key on another platform');
  key({ key: 'y', ctrlKey: true });
  assert.equal(d.text, 'one two three', 'as ctrl-Y is for redo');

  // The word delete, in both spellings.
  key({ key: 'Backspace', altKey: true });
  assert.equal(d.text, 'one two', 'alt-Backspace takes a word');
  key({ key: 'Backspace', ctrlKey: true });
  assert.equal(d.text, 'one', 'and so does ctrl-Backspace');

  // Everything else with a modifier stays the platform's, and is not
  // preventDefault'd on the way past.
  const before = d.text;
  const e = key({ key: 'p', metaKey: true });
  assert.equal(d.text, before);
  assert.equal(e.defaultPrevented, false, 'cmd-P is the browser\'s, untouched');
  A.disable();
});

test('the card follows the input in use, not the device it thinks it is on', () => {
  // A media query is the wrong instrument here: `(pointer: fine)` is true of an
  // iPad with a keyboard case while the reader is still touching the screen,
  // and that reader would lose the affordances they are actively using. The
  // event is the evidence, which is the rule that let typing work with no
  // detection at all, and it follows a reader who switches hands mid-note.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  const realPaint = window.Dictate.paint;
  const seen = [];
  window.Dictate.paint = (host, o) => { seen.push(o); return realPaint(host, o); };
  try {
    A.enable({ doc, subject: { title: 'x', url: '' } });
    const S = A._state;
    A.notePage({ listen: false });
    S.dict.text = 'the quick brown fox';
    S.precise = false;
    A._paintDraft();
    assert.notEqual(S.compPad.style.display, 'none', 'a thumb keeps the pad');
    assert.equal(S.compPunct.style.display, 'grid', 'and the marks');
    assert.equal(seen[seen.length - 1].handles, true, 'and the pins it taps to arm');

    // A physical keyboard: the soft one lives inside the textarea, which this
    // handler returns on, so a key reaching it is a real one.
    const e = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(e, { key: 'x' });
    doc.dispatchEvent(e);
    assert.equal(S.precise, true);
    assert.equal(S.compPad.style.display, 'none', 'a click places a caret, so the pad goes');
    assert.equal(S.compPunct.style.display, 'none', 'and every mark is a keystroke away');
    assert.equal(seen[seen.length - 1].handles, false, 'and the pins go with them');
    assert.equal(S.compSave.style.gridColumn, '5 / 7',
      'save takes the corner, or the empty cell shows as a grey stripe');

    // THE CASING KEYS ARE THE EXCEPTION, and the column already swaps to them
    // when a selection is live: there is no key for "capitalise this".
    S.dict.select(4, 9);
    A._paintDraft();
    assert.equal(S.compPunct.style.display, 'grid',
      'the column comes back as the casing pad, which a keyboard cannot replace');
    assert.equal(seen[seen.length - 1].handles, false, 'the pins do not come back with it');

    // A finger takes it all back.
    const t = new window.MouseEvent('pointerdown', { clientX: 20, clientY: 20, bubbles: true });
    t.pointerType = 'touch';
    S.compView.dispatchEvent(t);
    A._paintDraft();
    assert.equal(S.precise, false);
    assert.notEqual(S.compPad.style.display, 'none');
    assert.equal(S.compSave.style.gridColumn, '5');
    A.disable();
  } finally { window.Dictate.paint = realPaint; }
});

test('shift extends from a fixed anchor, and anything else drops it', () => {
  // Which END of a selection is moving is a fact about the gesture, not about
  // the text, so the buffer holds {start, end} and the anchor lives in the
  // card. Defaults read the buffer, so a selection made by drag or long press
  // extends from its far end the first time shift is used on it.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state, d = S.dict;
  A.notePage({ listen: false });
  d.text = 'the quick brown fox';
  d.caretAt(9);
  const key = (k, shift) => {
    const e = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(e, { key: k, shiftKey: !!shift });
    doc.dispatchEvent(e);
  };

  key('ArrowRight', true);
  key('ArrowRight', true);
  assert.deepEqual(d.range, { start: 9, end: 11 }, 'the anchor holds while the focus moves');
  key('ArrowLeft', true);
  assert.deepEqual(d.range, { start: 9, end: 10 }, 'and comes back without swapping ends');
  key('End', true);
  assert.deepEqual(d.range, { start: 9, end: 19 });
  key('Home', true);
  assert.deepEqual(d.range, { start: 0, end: 9 },
    'crossing the anchor is a selection on the other side of it, not an empty one');

  // A plain movement ends the extension: the next shift starts a new anchor.
  key('ArrowLeft');
  assert.equal(d.hasSelection, false);
  assert.equal(S.selAnchor, null, 'the anchor is dropped, not carried');
  key('ArrowRight', true);
  assert.deepEqual(d.range, { start: 0, end: 1 }, 'a fresh anchor where the caret was');

  // So does typing. A browser sends the capital itself, so shift plus a letter
  // arrives here as an ordinary character and must not read as a gesture.
  key('Z', true);
  assert.equal(d.text.includes('Z'), true, 'the capital was typed, not swallowed');
  assert.equal(S.selAnchor, null, 'and it ended the extension');
  A.disable();
});

test('the editor grows to the same ceiling the read surface has', () => {
  // The floor is the card as it stands, so the switch moves nothing; the
  // ceiling is the card the SAME text would make in dictation. Without it a
  // typed note scrolled at whatever height the card happened to be when the
  // keyboard opened while a dictated one ran on to the read surface's cap:
  // one buffer, two behaviours. jsdom has no layout, so the two measurements
  // are stubbed and what is asserted is the arithmetic over them.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  S.compFrame.getBoundingClientRect = () => ({ height: 188 });
  S.compView.getBoundingClientRect = () => ({ height: 155 });

  A._openEditor();
  assert.equal(S.compTaBase, 186, 'the frame it found, less its own border');
  assert.equal(S.compTaMax, 203, 'plus what the read surface had left before its cap');
  assert.equal(S.compTa.style.height, '186px', 'and it opens at the floor');

  // Content taller than the floor grows the box, to the ceiling and no further.
  Object.defineProperty(S.compTa, 'scrollHeight', { value: 195, configurable: true });
  S.compTa.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(S.compTa.style.height, '195px');
  Object.defineProperty(S.compTa, 'scrollHeight', { value: 400, configurable: true });
  S.compTa.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(S.compTa.style.height, '203px', 'capped where dictation would be');

  // And back down: the box is measured from the floor each time rather than
  // from its current height, or deleting text would leave it stretched.
  Object.defineProperty(S.compTa, 'scrollHeight', { value: 80, configurable: true });
  S.compTa.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(S.compTa.style.height, '186px', 'no ratchet');
  A.disable();
});

test('a mouse drag selects, and a touch drag still scrolls', () => {
  // The tap-to-arm pins exist because a FINGER dragging a handle covers the
  // words it is aiming at. A pointer does not, so asking a desktop reader to
  // tap twice for what one drag has always done is the gesture model leaking
  // out of the case it was designed for.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  S.dict.text = 'the quick brown fox';
  A._paintDraft();

  let at = 0;
  doc.caretRangeFromPoint = () => ({ startContainer: S.compBody.firstChild, startOffset: at });
  const send = (type, x, init) => {
    const e = new window.MouseEvent(type, { clientX: x, clientY: 20, bubbles: true, ...init });
    e.pointerType = init && init.pointerType || 'mouse';
    S.compView.dispatchEvent(e);
    return e;
  };
  try {
    at = 4;
    send('pointerdown', 20);
    at = 15;
    send('pointermove', 90, { buttons: 1 });
    assert.deepEqual(S.dict.range, { start: 4, end: 15 }, 'the drag selected between the two points');
    send('pointerup', 90);
    assert.deepEqual(S.dict.range, { start: 4, end: 15 },
      'and the release does not read as a click that places a caret');

    // A touch drag is a SCROLL, and must stay one.
    S.dict.clearRange();
    at = 4;
    send('pointerdown', 20, { pointerType: 'touch' });
    at = 15;
    send('pointermove', 90, { buttons: 1, pointerType: 'touch' });
    assert.equal(S.dict.range, null, 'nothing selected: the box scrolled instead');
    A.disable();
  } finally { delete doc.caretRangeFromPoint; }
});

test('a long press off the words opens the keyboard, and on them still takes a word', async () => {
  // The press had two regions and one reading, so over the canvas it did
  // nothing: a dead gesture on the largest target on the card, at the moment
  // the double tap had just become the keyboard's only door. jsdom has no
  // layout, so hitsText answers false for every point, which IS the off-text
  // case; the on-text half stubs it true, the way the double-tap test does.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  const realHits = window.Dictate.hitsText;
  try {
    A.enable({ doc, subject: { title: 'x', url: '' } });
    const S = A._state, d = S.dict;
    d.text = 'the quick brown fox';
    d.caretAt(4);
    A._paintDraft();

    const press = () => {
      const e = new window.Event('pointerdown', { bubbles: true });
      e.clientX = 20; e.clientY = 500;
      S.compView.dispatchEvent(e);
      return new Promise((done) => setTimeout(done, 520));   // past LONG_MS
    };

    await press();
    assert.equal(S.editing, true, 'a press on the canvas asks for the keyboard');
    assert.equal(S.compTa.selectionStart, 4,
      'and it opens on the caret the buffer was holding, collapsing nothing');
    S.compTa.dispatchEvent(new window.Event('blur', { bubbles: true }));
    assert.equal(S.editing, false);

    // On a word it is still a word selection: that reading is what a press
    // means everywhere, and it is the only one that region can support.
    window.Dictate.hitsText = () => true;
    doc.caretRangeFromPoint = () => ({ startContainer: S.compBody.firstChild, startOffset: 6 });
    await press();
    assert.equal(S.editing, false, 'no keyboard where there is a word to take');
    assert.deepEqual(d.range, { start: 4, end: 9 }, 'the word under the finger');
    A.disable();
  } finally { window.Dictate.hitsText = realHits; delete doc.caretRangeFromPoint; }
});

test('two taps in a run open the keyboard, with the caret where they landed', () => {
  // The double took the WORD until 2026-08-13, which the long press already
  // does and does better. The quick gesture is better spent on the mode
  // switch, since reaching the pencil to fix one letter is the trip this
  // surface asks for most, and the caret has to arrive where the reader
  // pointed or they point again through a textarea their thumb half covers.
  //
  // Two stubs, both for things jsdom does not have and both measured for real
  // elsewhere: hitsText needs client rects (its own geometry is in
  // dictate.test.mjs) and caret-from-point does not exist at all (the offset
  // arithmetic it feeds is Dictate.offsetAt, which is pure and tested).
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  const realHits = window.Dictate.hitsText;
  window.Dictate.hitsText = () => true;
  try {
    A.enable({ doc, subject: { title: 'x', url: '' } });
    const S = A._state, d = S.dict;
    d.text = 'the quick brown fox';
    A._paintDraft();
    doc.caretRangeFromPoint = () => ({ startContainer: S.compBody.firstChild, startOffset: 6 });

    const tap = () => {
      const e = new window.Event('pointerup', { bubbles: true });
      e.clientX = 20; e.clientY = 20;
      S.compView.dispatchEvent(e);
    };
    tap();
    assert.equal(S.editing, false, 'one tap is a placement, not a mode switch');
    assert.deepEqual(d.range, { start: 6, end: 6 }, 'and it puts the caret where it landed');
    tap();
    assert.equal(S.editing, true, 'the second opens the keyboard');
    assert.equal(S.compTa.value, 'the quick brown fox');
    assert.equal(S.compTa.selectionStart, 6, 'at the offset that was tapped, not at the end');

    // The run is reset by the open, so a third tap is a fresh first tap rather
    // than a select-all that no longer exists: once the read surface is gone
    // the platform's own gesture is where a reader looks for it.
    A.disable();

    // AND FROM THE CANVAS. Tapping the empty space under the words is the
    // gesture that most obviously means "let me type here", and it was the one
    // place the double did nothing: the canvas used to win before the count,
    // so a tap past the text could never be part of a run. The caret lands at
    // the end, which is what a tap there has always meant.
    window.Dictate.hitsText = () => false;
    A.enable({ doc, subject: { title: 'x', url: '' } });
    const S2 = A._state;
    S2.dict.text = 'the quick brown fox';
    A._paintDraft();
    tap2(S2); tap2(S2);
    assert.equal(S2.editing, true, 'a double on the canvas opens it too');
    assert.equal(S2.compTa.selectionStart, 19, 'at the end');
    A.disable();
  } finally { window.Dictate.hitsText = realHits; delete doc.caretRangeFromPoint; }
});

function tap2(S) {
  const e = new S.compView.ownerDocument.defaultView.Event('pointerup', { bubbles: true });
  e.clientX = 20; e.clientY = 20;
  S.compView.dispatchEvent(e);
}

test('a single tap places the caret, on a draft with nothing live yet', () => {
  // It used to place one only if something was already live: a selection, or a
  // caret placed earlier. A fresh draft has neither, so the first tap on the
  // words was dead, which is how it was reported (2026-08-14). There was never
  // a competing reading to protect, and the caret is not decoration: it is
  // where the next spoken words land.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  const realHits = window.Dictate.hitsText;
  window.Dictate.hitsText = () => true;
  try {
    A.enable({ doc, subject: { title: 'x', url: '' } });
    const S = A._state, d = S.dict;
    d.text = 'the quick brown fox';
    A._paintDraft();
    assert.equal(d.range, null, 'nothing live: the caret reads as the end');
    doc.caretRangeFromPoint = () => ({ startContainer: S.compBody.firstChild, startOffset: 4 });

    const e = new window.Event('pointerup', { bubbles: true });
    e.clientX = 20; e.clientY = 20;
    S.compView.dispatchEvent(e);
    assert.deepEqual(d.range, { start: 4, end: 4 }, 'the tap placed it');

    // And what that buys, which is the point of placing one at all.
    d.punct('.');
    assert.equal(d.text.slice(0, 5), 'the .', 'so the next thing written lands there');
    A.disable();
  } finally { window.Dictate.hitsText = realHits; delete doc.caretRangeFromPoint; }
});

test('the caret is one caret: it survives the switch into the keyboard and back', () => {
  // Two surfaces, one insertion point. The textarea used to open at the end
  // however carefully the red caret had been placed, and leaving it sent the
  // caret back to the end however carefully it had been moved with the
  // keyboard, so a reader crossing the boundary placed it twice.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  const realHits = window.Dictate.hitsText;
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state, d = S.dict;
  d.text = 'the quick brown fox';
  A._paintDraft();

  // In: the double tap that opens the keyboard lands the caret under itself,
  // and the keyboard opens there rather than at the end.
  window.Dictate.hitsText = () => true;
  doc.caretRangeFromPoint = () => ({ startContainer: S.compBody.firstChild, startOffset: 4 });
  openKeyboard(S);
  assert.equal(S.compTa.selectionStart, 4, 'the keyboard opens where the taps landed');
  assert.equal(S.compTa.selectionEnd, 4);

  // Out: where the keyboard left it is where the red one is.
  S.compTa.setSelectionRange(10, 15);
  S.compTa.dispatchEvent(new window.Event('blur', { bubbles: true }));
  assert.deepEqual(d.range, { start: 10, end: 15 },
    'and a selection comes back whole rather than collapsing to the end');

  // In again with no offset supplied, which is the canvas path: the caret the
  // buffer is holding is what the keyboard opens on, selection and all, so the
  // first character typed replaces exactly what the red one covered.
  window.Dictate.hitsText = realHits;
  delete doc.caretRangeFromPoint;
  A._openEditor();
  assert.equal(S.compTa.selectionStart, 10);
  assert.equal(S.compTa.selectionEnd, 15);

  // An edit that shortens the text cannot leave the caret past its end.
  S.compTa.value = 'short';
  S.compTa.setSelectionRange(5, 5);
  S.compTa.dispatchEvent(new window.Event('blur', { bubbles: true }));
  assert.equal(d.text, 'short');
  assert.equal(d.range, null, 'a caret at the very end is the buffer\'s null range');
  A.disable();
});

test('arming a pin ends a tap run', () => {
  // pointerdown already armed or disarmed the pin, and counting the pointerup
  // as well made "tap a pin, then tap the text" a double, which now opens the
  // keyboard on the gesture that is meant to move the edge. Measured in a real
  // browser first, where a scenario's pin tap and the canvas tap 120ms later
  // came back as one double.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  const realHits = window.Dictate.hitsText;
  window.Dictate.hitsText = () => true;
  try {
    A.enable({ doc, subject: { title: 'x', url: '' } });
    const S = A._state;
    S.dict.text = 'the quick brown fox';
    S.dict.select(4, 9);
    S.compArmed = 'end';
    A._paintDraft();
    doc.caretRangeFromPoint = () => ({ startContainer: S.compBody.firstChild, startOffset: 2 });

    const p = S.compStack.querySelector('[data-edge="end"]');
    assert.ok(p, 'the pin is painted');
    const up = new window.Event('pointerup', { bubbles: true });
    up.clientX = 20; up.clientY = 20;
    p.dispatchEvent(up);
    tap2(S);
    assert.equal(S.editing, false, 'the tap after a pin is a first tap, not a second');
    A.disable();
  } finally { window.Dictate.hitsText = realHits; delete doc.caretRangeFromPoint; }
});

test('undo and redo stand where the pencil stood, and say whether they can', () => {
  // The pencil was a button for a gesture that is both shorter and better
  // aimed: the double tap opens the keyboard AND places the caret, where the
  // button could only guess at one. Retiring it paid for the pair, and the
  // pair is the one thing a voice buffer could not do, since the delete key
  // takes words where a recognizer mishears phrases.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  assert.ok(!S.compEdit, 'no pencil left on the row');
  assert.match(S.compUndo._icon.className, /ph-arrow-counter-clockwise/);
  assert.match(S.compRedo._icon.className, /ph-arrow-clockwise/);

  A._paintDraft();
  assert.equal(S.compUndo.disabled, true, 'a fresh buffer has nothing to take back');
  assert.equal(S.compRedo.disabled, true);

  S.dict.insert('a phrase');
  A._paintDraft();
  assert.equal(S.compUndo.disabled, false, 'and a written one does');

  S.compUndo.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.dict.text, '', 'the key undoes the mutation');
  assert.equal(S.compRedo.disabled, false, 'and redo lights up behind it');
  S.compRedo.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.dict.text, 'a phrase');

  // The row grew a column, and the read surface has to span all five or the
  // marks fall into a flexible cell and the fixed one shows as a grey stripe.
  assert.match(S.compFrame.getAttribute('style'), /repeat\(5,minmax\(0,1fr\)\)\s*46px/);
  assert.equal(S.compView.style.gridColumn, '1 / 6');
  assert.equal(S.compPad.style.gridColumn, '6');
  A.disable();
});

test('the keyboard mode has no controls of its own, and the keyboard is the way out', () => {
  // Three attempts went into making ONE of these buttons legible in edit mode:
  // the exit wore a microphone (read as recording), then an amber fill (read as
  // live), then a green check. The question was always which controls to keep,
  // and the answer is none. The keyboard brings its own delete, caret and
  // punctuation, so every cell here is a duplicate or a control for the mode
  // you are not in, and the way out is the keyboard's own dismiss, which is a
  // blur and nothing else.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  const row = () => [S.compMic, S.compUndo, S.compRedo, S.compBack, S.compSave, S.compPad];

  A._paintDraft();
  assert.ok(row().every(b => b.style.display !== 'none'), 'dictation mode: a full control row');

  openKeyboard(S);
  assert.equal(S.editing, true, 'the keyboard is open');
  assert.ok(row().every(b => b.style.display === 'none'),
    'and every control is gone, including anything that could have been the exit');
  assert.equal(S.compPunct.style.display, 'none', 'marks included');

  // The keyboard's own dismiss. It leaves the typed text behind, which is what
  // makes taking the blur safe: a slip costs the keyboard, never the words.
  S.compTa.value = 'typed, then dismissed';
  S.compTa.dispatchEvent(new window.Event('blur', { bubbles: true }));
  assert.equal(S.editing, false, 'putting the keyboard away leaves edit mode');
  assert.equal(S.dict.text, 'typed, then dismissed', 'with the words kept');
  assert.ok(row().every(b => b.style.display !== 'none'), 'and the row back');
  A.disable();
});

test('the keyboard does not grow the card: the editor takes the frame it found', () => {
  // The editor opened at 30vh, so switching from speaking to typing grew the
  // whole card. Nothing about typing asks for more of the page than dictating
  // does; what it earns is the control row's height, inside the height the
  // frame already had. jsdom has no layout, so the frame's measurement is
  // stubbed and what is asserted is the arithmetic over it.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  assert.ok(!/30vh/.test(S.compTa.getAttribute('style') || ''),
    'no viewport-sized editor left in the static style');

  S.compFrame.getBoundingClientRect = () => ({ height: 188 });
  openKeyboard(S);
  assert.equal(S.compTa.style.height, '186px', 'the frame it found, less its own border');
  assert.match(S.compTa.getAttribute('style'), /box-sizing:\s*border-box/,
    'or a content-box host would add the padding on top of it');

  S.compTa.dispatchEvent(new window.Event('blur', { bubbles: true }));
  assert.equal(S.compTa.style.height, '', 'and the pin is let go on the way out');

  // A frame with no layout to report leaves the static floor standing rather
  // than pinning the box to nothing.
  S.compFrame.getBoundingClientRect = () => ({ height: 0 });
  openKeyboard(S);
  assert.equal(S.compTa.style.height, '');
  A.disable();
});

test('leaving the keyboard resumes dictation only if it interrupted it', () => {
  // Closing used to call start() unconditionally, on the reading that
  // dictation is the default mode. A reader who had already stopped listening,
  // opened the keyboard and put it away came back to a live microphone they
  // never asked for. Both directions are pinned, since the resume itself is
  // wanted: it is the switching ON that was not.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  const dismiss = () => S.compTa.dispatchEvent(new window.Event('blur', { bubbles: true }));

  // Live when the keyboard opens: resumed on the way out.
  S.dict.start();
  assert.equal(S.dict.listening, true);
  openKeyboard(S);
  assert.equal(S.dict.listening, false, 'the keyboard stops the engine');
  dismiss();
  assert.equal(S.dict.listening, true, 'and putting it away puts the engine back');

  // Stopped when the keyboard opens: still stopped on the way out.
  S.dict.stop();
  assert.equal(S.dict.listening, false);
  openKeyboard(S);
  dismiss();
  assert.equal(S.dict.listening, false,
    'and it does not switch the microphone on for a reader who had it off');
  A.disable();
});

test('a page note pins to nothing, and the set says which page it means', () => {
  // The case the other three targets leave out: the complaint is about the
  // page, not about a passage in it. Nothing is selected, so nothing anchors,
  // and the address in the serialization is what makes the note self-sufficient
  // (the workflow it replaces was opening another window and typing the page
  // out by hand).
  A.enable({ doc, subject: { title: 'pages/thing.html', url: 'https://example.test/blob/thing' } });
  A.clear();
  A.add({ type: 'page' }, 'the sidebar overlaps the footer under 400px');

  const md = A.toMarkdown();
  assert.ok(md.includes('# Notes — pages/thing.html'), md);
  assert.ok(md.includes('https://example.test/blob/thing'), 'the source address');
  assert.match(md, /Viewed at: http/, 'and the address it was read at, which the source URL does not give');
  assert.ok(md.includes('## 1. the page'), md);
  assert.ok(!md.includes('Path: `'), 'a page note claims no DOM path');
  assert.ok(md.includes('**Note:** the sidebar overlaps the footer under 400px'));

  const j = A.toJSON();
  assert.equal(j.notes[0].type, 'page');
  assert.equal(j.notes[0].quote, undefined, 'and carries no anchor it cannot honor');
  A.clear();
});

test('the Page chip opens a draft outright: no gesture to make first', () => {
  A.enable({ doc, subject: { title: 'pages/thing.html', url: 'https://example.test/blob/thing' } });
  A.clear();
  const S = A._state;

  S.pageChip.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.draft.target.type, 'page');
  assert.equal(S.compose.style.display, 'flex', 'the composer is open and listening');
  assert.match(S.compCap.textContent, /This page: pages\/thing\.html/,
    'and names what the note will be about');
  assert.ok(!S.draftBox, 'nothing is outlined, since nothing was aimed at');

  // A page note is not a MODE: there is nothing to exit, so it leaves the two
  // that are unlit.
  assert.equal(S.mode, null);
  A.disable();
});

test('the title, the count and the way in are one control', () => {
  // Three were two too many, and the first was the leftover of a fourth: a
  // title button whose only errand was opening the drawer's Notes tab, a count
  // that said how many and offered nothing, and a chevron. With the tab
  // retired the title had nothing left to do, and a card that names itself,
  // counts itself and opens itself was saying one thing three times.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const S = A._state;

  assert.equal(S.expandBtn.textContent.trim(), 'Notes', 'untouched, it is the card\u2019s name and its way in');
  assert.equal(S.countEl.textContent, '', 'and carries no number until there is one');
  A.add({ type: 'page' }, 'one');
  A.add({ type: 'page' }, 'two');
  assert.equal(S.countEl.textContent, '2');
  assert.match(S.expandBtn.textContent, /^Notes\s*2/);

  assert.match(S.expandBtn.title, /^Open the set/);
  S.expandBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A.expanded, true);
  assert.match(S.expandBtn.title, /^Put the set away/, 'and it says which way it is going');
  assert.equal(S.expandBtn.style.background, 'rgb(250, 204, 21)', 'lit while open, the way a live mode chip is');

  assert.match(S.expandBtn.getAttribute('style'), /min-height:\s*30px/, 'sized to the controls under it');
  A.clear();
  A.disable();
});

test('the launcher-staged page draft opens idle: an offer, not a recorder', () => {
  // Every other draft is opened by aiming at something, so starting the engine
  // is what the reader just asked for. The launcher's menu stages a page draft
  // nobody aimed, and a microphone that switches itself on there is a recorder
  // the reader never started. The hint has to agree, which is why it reports
  // the engine rather than the mode.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const S = A._state;

  A.notePage();
  assert.equal(S.draft.target.type, 'page');
  assert.equal(S.dict.listening, true, 'the chip path still starts listening');
  assert.match(S.compHint.textContent, /^Listening/);

  A.notePage({ listen: false });
  assert.equal(S.draft.target.type, 'page');
  assert.equal(S.dict.listening, false, 'the launcher path does not');
  assert.match(S.compHint.textContent, /Tap the microphone/,
    'and the hint says what to do rather than claiming it is listening');

  // Still a draft in every other respect: the mic is one tap away, and the
  // save key is live for a note that was typed.
  assert.equal(S.compose.style.display, 'flex');
  S.dict.start();
  assert.match(S.compHint.textContent, /^Listening/, 'starting it repaints the hint');
  A.disable();
});

test('the card spends its whitespace evenly: an empty list is not a band', () => {
  // The list's bottom padding separates the last note from the card's edge.
  // With no notes there is nothing to separate, and the 8px stacked under the
  // composer's own 8px: measured with a draft open and nothing filed, 17px
  // below the frame against 9 down either side. The header controls carry the
  // action row's height for the same reason, a control half the height of the
  // ones under it reading as a label that happens to be tappable.
  A.enable({ doc, subject: { title: 'x', url: 'https://e.test/p' } });
  A.clear();
  const S = A._state;
  A.notePage({ listen: false });
  assert.equal(S.listEl.style.paddingBottom, '0px', 'nothing filed, so no band');

  A.add({ target: { type: 'page' }, note: 'one' });
  assert.equal(S.listEl.style.paddingBottom, '8px', 'and it returns with the first note');

  assert.match(S.pageChip.getAttribute('style'), /min-height:\s*28px/, 'and a chip plus its group border makes 30');
  A.disable();
});

test('the cursor pad moves the caret and not the text', () => {
  // Placing a caret by touching the text puts a thumb over the two words
  // either side of the target, and a second tap there takes the word instead:
  // the one gesture for "put it between these two" hid its target and had a
  // homonym. The pad is a relative pointer, so the finger is elsewhere.
  //
  // The DRAG is a real-browser fact (it maps a virtual point to an offset
  // through caret-from-point, which jsdom does not implement), and is measured
  // in tools/render/scenarios/annotate-cursor-pad.mjs. What is asserted here
  // is the wiring around it, including that a drag with no layout to read
  // leaves the buffer exactly as it was rather than guessing.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  S.dict.text = 'the quick brown fox';
  S.dict.caretAt(4);
  A._paintDraft();

  assert.ok(S.compPad, 'the pad sits in the control row');
  assert.match(S.compPad.title, /drag to move the cursor/i);
  assert.match(S.compPad.getAttribute('style'), /touch-action:\s*none/,
    'or a phone scrolls the page instead of dragging');

  const at = (type, x, y) => S.compPad.dispatchEvent(
    new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  assert.doesNotThrow(() => { at('pointerdown', 50, 50); at('pointermove', 20, 50); at('pointerup', 20, 50); });
  assert.deepEqual(S.dict.range, { start: 4, end: 4 }, 'no layout to read, so nothing moved');
  assert.equal(S.dict.text, 'the quick brown fox', 'and the buffer is never what the pad touches');

  // The keyboard brings its own caret, so the pad goes in edit mode, with the
  // rest of the row. Dimming it in place was the earlier answer, on the rule
  // that a grid cell which disappears takes its column with it; hiding the
  // whole row leaves nothing beside it for a border to jog against.
  openKeyboard(S);
  assert.equal(S.compPad.style.display, 'none');
  S.compTa.dispatchEvent(new window.Event('blur', { bubbles: true }));
  assert.equal(S.compPad.style.display, 'flex', 'and comes back with the read surface');
  A.disable();
});

test('a pad drag makes the selection pins transparent to the caret lookup', () => {
  // The pad aims AT the armed pin, and a pin's hit box is 32px wide, so
  // caret-from-point answered with the pin rather than with the word under it
  // and the edge did not move until the aim point had cleared the pin's own
  // box. Measured in a real browser on 2026-08-13: a sweep across the text
  // reported a 32px dead band at each pin, and a slow drag stepped the edge
  // 13, 15, 17. The rule is CSS keyed on an attribute, because the painter
  // rebuilds every pin on every repaint and a repaint happens on every move.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  S.dict.text = 'the quick brown fox';
  S.dict.select(4, 9);
  S.compArmed = 'end';
  A._paintDraft();

  const css = doc.getElementById('annotate-style').textContent;
  assert.match(css, /\[data-annotate-pad\]\s*\[data-edge\]\s*\{\s*pointer-events:\s*none/,
    'the rule that stands the pins down');

  const at = (type, x, y) => S.compPad.dispatchEvent(
    new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  at('pointerdown', 50, 50);
  assert.equal(S.compStack.hasAttribute('data-annotate-pad'), true, 'set for the length of the drag');
  at('pointerup', 50, 50);
  assert.equal(S.compStack.hasAttribute('data-annotate-pad'), false, 'and a tap arms a pin again');
  A.disable();
});

test('the card refuses the platform’s selection, and the textarea takes it back', () => {
  // The card runs a selection mechanism of its own, so the platform's is not a
  // fallback but a competitor: a long press over any of this furniture (the
  // caption, a note row, the painted buffer) means "select this word" to the
  // browser, and that is what came back from the field on 2026-08-12. The lock
  // sits on the card rather than on the read surface, because the card is what
  // a thumb lands on. It is also no longer conditional on the dictation kit
  // having loaded first, which made it a lock that was off exactly when
  // nothing was watching.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  const style = (el) => el.getAttribute('style') || '';

  // The selection half is a stylesheet rule (see the test above); what stays
  // inline is TOUCH, which is a real CSSOM property and survives.
  assert.match(style(S.ui), /touch-action:\s*none/);
  for (const [name, node] of [['the read surface', S.compView], ['the note list', S.listEl],
                              ['the editor', S.compTa]]) {
    assert.match(style(node), /touch-action:\s*pan-y/, name + ' scrolls');
    assert.match(style(node), /overscroll-behavior:\s*contain/, name + ' keeps its overscroll');
  }
  A.disable();
});

test('a note row carries three keys over it, and Edit reopens it in the composer', async () => {
  // The row carried a bare ×, then a ⋮ menu, and now the three verbs
  // themselves: one tap each rather than one to open and one to choose. They
  // float over the row, so the note keeps its full width and only the
  // caption's first line gives ground.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const S = A._state;
  const it = A.add({ type: 'page' }, 'the ref bar wraps');

  const row = S.listEl.firstChild;
  const css = (el) => el.getAttribute('style') || '';
  const keys = [...row.querySelectorAll('button')];
  assert.equal(keys.length, 3, 'edit, copy, remove');
  assert.deepEqual(keys.map(b => b._icon.className),
    ['ph ph-pencil-simple', 'ph ph-copy', 'ph ph-trash']);
  assert.match(keys[2].style.color, /#dc2626|rgb\(220, 38, 38\)/,
    'remove is a single tap now, so it is tinted for what it does');
  assert.equal(row.textContent.includes('×'), false, 'and no bare × beside it');
  const cluster = keys[0].parentNode;
  assert.match(css(cluster), /position:\s*absolute/,
    'the keys float rather than taking a column off every row');
  assert.match(css(row), /position:\s*relative/, 'and float against the row, not the list');
  assert.match(css(row.firstChild.firstChild), /padding-right:\s*84px/,
    'the caption alone reserves room, so the note and the address run full width');

  // Edit stages the SAME note: same target, its text loaded, nothing recording,
  // and saving updates rather than adding a second one.
  keys[0].dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.draft.editId, it.id);
  assert.equal(S.draft.target, it.target, 'an edit never re-aims the anchor');
  assert.equal(S.dict.text, 'the ref bar wraps', 'the note is loaded to be revised, not retyped');
  assert.equal(S.dict.listening, false, 'and the microphone stays off over words already written');
  assert.match(S.compCap.textContent, /^Editing: /);

  S.dict.text = 'the ref bar wraps under 380px';
  S.compSave.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A.items.length, 1, 'one note, revised');
  assert.equal(A.items[0].id, it.id);
  assert.equal(A.items[0].note, 'the ref bar wraps under 380px');
  assert.ok(A.items[0].editedAt, 'and the edit is dated');

  // Copy takes the WORDS and nothing else: no heading, no quote, no address.
  // The markdown serialization is the other errand and has its own button.
  // The kit runs in the NODE realm (bootstrap's loadKit hands it `window` as a
  // parameter, not as the global), so a bare `navigator` in the source resolves
  // here rather than on the jsdom window. Stub the one it actually reads.
  let copied = null;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { clipboard: { writeText: async (t) => { copied = t; } } },
  });
  const rowNow = S.listEl.firstChild;
  [...rowNow.querySelectorAll('button')][1].dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(copied, 'the ref bar wraps under 380px');

  // And remove is one tap, on the row rather than through a menu.
  [...S.listEl.firstChild.querySelectorAll('button')][2]
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A.items.length, 0);
  A.disable();
});

test('a drag surface cancels the touch itself, not just its touch-action', () => {
  // `touch-action: none` is the fix everyone reaches for, and inside a
  // sheet-presented in-app browser it is not sufficient: the host dismisses on
  // the web view's SCROLL, and only a cancelled touch event stops one reaching
  // it. Measured on device across five variants (docs/ios-sheet-drags.md); the
  // negative result for touch-action alone is the reason this test exists,
  // since nothing headless can reproduce the dismissal itself.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'page' }, 'a note, so the card has a row');
  const S = A._state;
  const touch = (node, type = 'touchstart') => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    node.dispatchEvent(e);
    return e.defaultPrevented;
  };

  // The pad is the drag this was worked out for. Both events, since cancelling
  // touchstart is what also takes the selection and the callout.
  assert.equal(touch(S.compPad, 'touchstart'), true);
  assert.equal(touch(S.compPad, 'touchmove'), true);

  // The card's header is a drag handle too, and it now holds the capture chips.
  // Cancelling touchstart suppresses the compatibility CLICK, so a chip inside
  // it must be skipped or it stops working on a phone entirely.
  // The header is the panel's first child, and the drag handle that moves the
  // card. (Selected by position rather than by style: the CSSOM re-serializes
  // `cursor:move` with a space, so a style-substring match is a false negative
  // waiting to happen.)
  const header = S.panel.firstChild;
  assert.ok(header.textContent.includes('Notes'), 'the header, by position');
  assert.equal(touch(header, 'touchstart'), true, 'the bare header cancels');
  assert.equal(touch(S.pageChip, 'touchstart'), false,
    'and a chip inside it does not, or a tap on it would never become a click');
  A.disable();
});

test('element mode stages from a tap, with no mouse having moved first', () => {
  // The mode ran on `mousemove` for the hover and a captured document `click`
  // for the stage, and a phone sends neither reliably: there is no mousemove
  // before a tap, so the staged element was still null when the click arrived,
  // and iOS withholds click from a document-level listener when the tapped
  // element is not itself clickable. Both are invisible from the code, since
  // every mouse path works. Field report, 2026-08-14: tapping produced nothing.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const p1 = doc.getElementById('p1');
  // jsdom has no layout, so what is under a point is the one thing stubbed.
  // Everything downstream of the hit is the kit's own.
  doc.elementsFromPoint = () => [p1];

  A.startPick();
  const cover = [...doc.querySelectorAll('div')]
    .filter(d => d.style.cursor === 'crosshair').pop();
  assert.ok(cover, 'the mode lays a cover, so a tap has something to land on');
  assert.ok(!/touch-action:\s*none/.test(cover.getAttribute('style') || ''),
    'and it keeps the page scrollable: finding the element is half the mode');
  assert.ok(+cover.style.zIndex < +A._state.ui.style.zIndex,
    'under the card, so the chip that exits stays tappable');

  const at = (type, x, y) => cover.dispatchEvent(
    new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  // Diffed against what is already on the page: an earlier test's floating
  // selection chip carries the same words.
  const chips = () => new Set([...doc.querySelectorAll('button')].filter(b => b.textContent === '+ note'));
  const before = chips();
  const offer = () => [...chips()].find(b => !before.has(b));

  // A press that travels is a scroll, not a tap: the reader is looking for the
  // element rather than choosing one.
  at('pointerdown', 40, 40);
  at('pointermove', 40, 240);
  at('pointerup', 40, 240);
  assert.ok(!offer(), 'a drag scrolls and stages nothing');

  at('pointerdown', 40, 40);
  at('pointerup', 40, 40);
  const btn = offer();
  assert.ok(btn, 'a tap stages the element under it and offers the note');

  btn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A._state.mode, null, 'taking the offer ends the mode');
  assert.equal(A._state.draft.target.type, 'element');
  assert.equal(A._state.draft.target.selector, '#p1');
  A.disable();
});

test('the card recognizes a selection and offers it, and the offer outlives the tap', async () => {
  // The only way to note selected text was a chip floating beside it, which on
  // a phone is where the platform puts its own callout: covered, or gone with
  // the selection the next tap collapsed. The card says what it has instead.
  const rect = { width: 40, height: 12, left: 10, right: 50, top: 20, bottom: 32 };
  const prev = window.Range.prototype.getBoundingClientRect;
  window.Range.prototype.getBoundingClientRect = () => rect;   // jsdom has no layout
  try {
    A.enable({ doc, subject: { title: 'x', url: '' } });
    A.clear();
    const S = A._state;
    assert.equal(S.selBar.style.display, 'none', 'nothing selected, nothing offered');

    const p1 = doc.getElementById('p1').firstChild;
    const r = doc.createRange();
    r.setStart(p1, 4);
    r.setEnd(p1, 19);                       // "quick brown fox"
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    doc.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
    await new Promise((done) => setTimeout(done, 40));   // the handler settles on a timer

    assert.equal(S.selBar.style.display, 'flex', 'the card shows what it recognized');
    assert.match(S.selQuote.textContent, /quick brown fox/, 'and quotes it back');
    assert.equal(A.staged.type, 'text');

    // The tap that reaches the card is the tap most likely to have collapsed
    // the selection, so the stage has to survive it.
    sel.removeAllRanges();
    doc.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
    await new Promise((done) => setTimeout(done, 40));
    assert.equal(S.selBar.style.display, 'flex', 'a collapsed selection leaves the offer standing');

    const go = [...S.selBar.querySelectorAll('button')].find(b => b.textContent === '+ note');
    go.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(S.draft.target.type, 'text');
    assert.equal(S.draft.target.quote.exact, 'quick brown fox');
    assert.equal(S.selBar.style.display, 'none', 'and the offer is spent, not repeated');
    assert.equal(A.staged, null);
    A.disable();
  } finally {
    window.Range.prototype.getBoundingClientRect = prev;
  }
});

test('the set has a second reading: on the page, where a screenshot can hold it', () => {
  // A list in a 360px card and the passages it describes cannot both be in one
  // frame, which is the whole reason for the second reading.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'element', selector: '#p1', excerpt: 'the quick brown fox' }, 'about the paragraph');
  A.add({ type: 'page' }, 'about the page');
  const S = A._state;
  const painted = () => S.boxes.map(b => b.textContent).join('|');

  assert.equal(A.inPlace, false);
  assert.equal(S.boxes.length, 1, 'the element outline, and nothing that carries words');
  assert.equal(painted(), '');

  A.showInPlace(true);
  assert.equal(A.inPlace, true);
  assert.equal(S.listEl.style.display, 'none', 'the list folds away for the picture');
  assert.match(painted(), /about the paragraph/, 'each note is drawn where it is pinned');
  assert.match(painted(), /about the page/, 'and one pinned to nothing gets the corner');

  // The header is the way back, which is why the card is not what folds away.
  S.placeBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A.inPlace, false);
  assert.equal(S.listEl.style.display, 'flex');
  assert.equal(painted(), '', 'and the page is clean again');
  A.clear();
  A.disable();
});

test('the expander opens the set, and the card grows upward whatever it is anchored by', () => {
  // Reading the set used to mean leaving for the drawer's Notes tab, on a page
  // that has a drawer at all. The card is anchored bottom-left, so a taller
  // panel grows up and the header stays under the thumb that just tapped it.
  // A header drag re-anchors the card to the TOP, though, and a taller panel
  // then grows down and off the screen: expanding re-pins the bottom edge so
  // the direction is the same either way.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const S = A._state;

  // OFFERED ON ARRIVAL, with nothing filed. It hid behind a non-empty set at
  // first, which is defensible and was still wrong: the first thing a reader
  // does with a fresh page is arrive at it holding no notes, so the control
  // was invisible in exactly the state where it had to teach itself.
  assert.equal(S.expandBtn.style.display, 'flex', 'the way in is visible before there is anything in it');
  assert.equal(S.countEl.textContent, '', 'carrying no number, so it is narrower empty than full');
  A.add({ type: 'page' }, 'about the page');
  assert.equal(S.countEl.textContent, '1');
  assert.equal(A.expanded, false);
  assert.equal(S.readBar.style.display, 'none');
  assert.equal(S.setActs.style.display, 'none');

  // What a drag leaves behind: bottom released, top pinned.
  S.ui.style.bottom = 'auto';
  S.ui.style.top = '40px';

  S.expandBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A.expanded, true);
  assert.equal(S.ui.style.top, 'auto', 'the top anchor is released');
  assert.match(S.ui.style.bottom, /px$/, 'and the bottom edge is pinned, so the growth goes up');
  assert.match(S.panel.style.maxHeight, /px$/, 'the ceiling is computed from the room above that edge');
  assert.equal(S.readBar.style.display, 'flex', 'the three readings arrive');
  assert.equal(S.setActs.style.display, 'flex', 'and the actions on the set');
  assert.equal(S.listEl.style.display, 'flex', 'opening on the list, which is where a reader already was');

  S.expandBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A.expanded, false);
  assert.equal(S.panel.style.maxHeight, 'min(480px,70vh)', 'and collapsing puts the card back to its own cap');
  assert.equal(S.readBar.style.display, 'none');
  A.clear();
  A.disable();
});

test('three readings of one set, and a serialization is shown rather than described', () => {
  // A button labelled by its format that copies without saying so is the thing
  // this replaced: what will land on the clipboard is on screen first.
  A.enable({ doc, subject: { title: 'Sample doc', url: 'https://e.test/p' } });
  A.clear();
  A.add({ type: 'element', selector: '#p1', excerpt: 'the quick brown fox' }, 'about the paragraph');
  A.add({ type: 'page' }, 'about the page');
  const S = A._state;
  A.expand(true);

  S.readChips.md.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A.reading, 'md');
  assert.equal(S.listEl.style.display, 'none', 'the list gives up the strip of card it shares');
  assert.equal(S.serial.style.display, 'flex');
  assert.equal(S.serialPre.textContent, A.toMarkdown(), 'exactly what Copy hands over, not a paraphrase');
  assert.equal(S.readChips.md.style.background, 'rgb(250, 204, 21)', 'lit, the way a live mode chip is');

  S.readChips.json.dispatchEvent(new window.Event('click', { bubbles: true }));
  // Everything but `at`, which is stamped at the moment of serializing and so
  // differs by a millisecond between the pane's copy and this one.
  const shape = (o) => { const { at, ...rest } = o; return rest; };
  assert.deepEqual(shape(JSON.parse(S.serialPre.textContent)), shape(A.toJSON()));

  // The set stays live under the reading: a note filed while the JSON is up
  // repaints the JSON rather than leaving a stale copy on screen.
  A.add({ type: 'page' }, 'a third');
  assert.match(S.serialPre.textContent, /a third/);

  S.readChips.notes.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.listEl.style.display, 'flex');
  assert.equal(S.serial.style.display, 'none');
  A.clear();
  A.disable();
});

test('a serialization narrows to one note, and says which of how many it is', () => {
  // The reading no other surface offers. A single note still carries the
  // preamble, since a note pasted somewhere has to say which page it came
  // from, and the lead line reads "Note 2 of 3" rather than "1 note", which
  // would be a claim about the set instead of an excerpt from one.
  A.enable({ doc, subject: { title: 'Sample doc', url: 'https://e.test/p' } });
  A.clear();
  A.add({ type: 'page' }, 'first');
  const two = A.add({ type: 'element', selector: '#p1', excerpt: 'the quick brown fox' }, 'second');
  A.add({ type: 'page' }, 'third');
  const S = A._state;
  A.expand(true);
  A.setReading('md');

  assert.equal(S.scopeBtn.style.display, 'none', 'nothing selected, so nothing to narrow to');
  A.select(two.id, { scroll: false });
  assert.equal(S.scopeBtn.style.display, 'flex');
  assert.equal(S.scopeBtn.textContent, 'Set', 'one chip, carrying the scope it is currently showing');

  S.scopeBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.scopeBtn.textContent, 'Note 2', 'and it swaps, labelled by the selection rather than by the word');
  assert.equal(S.serialPre.textContent, A.noteMarkdown(two.id));
  assert.match(S.serialPre.textContent, /Note 2 of 3/);
  assert.match(S.serialPre.textContent, /https:\/\/e\.test\/p/, 'the page it came from rides along');
  assert.match(S.serialPre.textContent, /second/);
  assert.doesNotMatch(S.serialPre.textContent, /third/, 'and nothing else in the set does');

  A.setReading('json');
  const one = JSON.parse(S.serialPre.textContent);
  assert.equal(one.format, 'annotate/1', 'still the declared format, with one note in it');
  assert.equal(one.notes.length, 1);
  assert.equal(one.notes[0].note, 'second');

  // The scope names the SELECTED note, so it cannot outlive the selection.
  A.select(null);
  assert.equal(S.scopeBtn.style.display, 'none');
  assert.equal(JSON.parse(S.serialPre.textContent).notes.length, 3, 'and it falls back to the set');
  A.clear();
  A.disable();
});

test('the set band goes when the notes go, and when the page takes them', () => {
  // Copy, Save and Clear over an empty set are three offers that cannot be
  // taken up. And the in-place reading exists to leave one 30px strip for a
  // screenshot, which an expanded card would be the loudest thing to break.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'page' }, 'one');
  const S = A._state;
  A.expand(true);
  assert.equal(S.setActs.style.display, 'flex');

  A.showInPlace(true);
  assert.equal(S.readBar.style.display, 'none', 'the readings fold away with the list');
  assert.equal(S.setActs.style.display, 'none');
  assert.equal(S.expandBtn.style.display, 'none', 'and so does the way back into them');

  A.showInPlace(false);
  assert.equal(S.readBar.style.display, 'flex', 'the card comes back the way it was left');
  assert.equal(S.setActs.style.display, 'flex');

  A.clear();
  assert.equal(S.setActs.style.display, 'none', 'an empty set has no actions to offer');
  assert.equal(S.expandBtn.style.display, 'flex', 'but the way in stays, which is how it is ever found');
  A.disable();
});

test('an expanded empty set says where notes come from, rather than showing an empty one', () => {
  // Opening the expander with nothing filed is the state that has to teach the
  // gesture, so it cannot be a blank pane: an empty markdown document under a
  // lit Markdown chip reads as something broken. The readings strip stays,
  // since seeing the three on offer is most of what opening an empty set is
  // for; the list, the serialization and the actions all wait for a note.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const S = A._state;
  A.expand(true);

  assert.equal(S.empty.style.display, 'flex');
  assert.match(S.empty.textContent, /Select text on the page/, 'and it names the gesture with no chip of its own');
  assert.equal(S.readBar.style.display, 'flex', 'the three readings are still on offer');
  assert.equal(S.listEl.style.display, 'none');
  assert.equal(S.serial.style.display, 'none');
  assert.equal(S.setActs.style.display, 'none');

  // Picking a reading over nothing does not conjure an empty document.
  A.setReading('md');
  assert.equal(S.empty.style.display, 'flex');
  assert.equal(S.serial.style.display, 'none');

  // The first note spends the line and the pane takes over, still on Markdown.
  A.add({ type: 'page' }, 'the first one');
  assert.equal(S.empty.style.display, 'none');
  assert.equal(S.serial.style.display, 'flex');
  assert.match(S.serialPre.textContent, /the first one/);
  A.clear();
  assert.equal(S.empty.style.display, 'flex', 'and removing the last note brings it back');
  A.disable();
});

test('the three readings are one window, and what does not fit scrolls inside it', () => {
  // Sized to content, the card jumped on every tap of the strip: three short
  // notes made a short card and their markdown a tall one, so the reader's own
  // tap moved the thing they were reading. One height, and the body takes the
  // leftover rather than the card taking the content.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'page' }, 'one');
  A.add({ type: 'page' }, 'two');
  const S = A._state;
  A.expand(true);

  const h = S.panel.style.height;
  assert.match(h, /px$/, 'an open set is a window of a fixed size');
  assert.equal(S.panel.style.maxHeight, h, 'and the composer opens inside it rather than growing it');
  assert.equal(S.listEl.style.flexGrow, '1', 'the list takes the leftover height');
  assert.equal(S.listEl.style.flexBasis, '0px', 'from zero, so a short list does not set the window');
  assert.equal(S.listEl.style.minHeight, '0px', 'and may shrink below its content, which is what lets it scroll');
  assert.match(S.listEl.getAttribute('style'), /overflow-y:\s*auto/);

  A.setReading('md');
  assert.equal(S.panel.style.height, h, 'markdown is the same window');
  A.setReading('json');
  assert.equal(S.panel.style.height, h, 'so is the JSON');
  assert.match(S.serialPre.getAttribute('style'), /overflow:\s*auto/, 'the pane scrolls rather than the card growing');

  // Collapsed, the card goes back to being sized by what is in it: a stretched
  // list under a composer holding two notes is a band of white.
  A.expand(false);
  assert.equal(S.panel.style.height, '');
  assert.equal(S.panel.style.maxHeight, 'min(480px,70vh)');
  assert.equal(S.listEl.style.flexGrow, '');

  // AN EMPTY SET TAKES THE WINDOW TOO, which is a reversal. It used to stay
  // small, on the reading that one italic line does not need a window: true of
  // the line, false of the reader, who then watched the card jump to a new size
  // the moment they filed anything. One gesture, one size.
  A.expand(true);
  const full = S.panel.style.height;
  A.clear();
  assert.equal(S.panel.style.height, full, 'nothing filed, and the card is the same window');
  assert.equal(S.empty.style.display, 'flex');
  A.disable();
});

test('copy rides the format row, so it needs no word at all', () => {
  // "Copy markdown" and "Copy JSON" sat in the footer naming a format the strip
  // a row above had already named, and the reader had to check which of the two
  // they were about to press. Beside the chips, the chips are the qualifier,
  // which left the word doing nothing the glyph was not already doing.
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  A.add({ type: 'page' }, 'one');
  const S = A._state;
  A.expand(true);
  A.setReading('md');

  assert.equal(S.serialCopy.textContent.trim(), '', 'the glyph alone: the chips beside it are the qualifier');
  assert.match(S.serialCopy.title, /markdown/, 'the title still says which, for a pointer that hovers');
  assert.ok(S.readBar.contains(S.serialCopy), 'and it rides the format row, not a footer under it');
  assert.equal(S.serialCopy.style.display, 'flex');

  A.setReading('json');
  assert.match(S.serialCopy.title, /JSON/, 'and it follows the chip it sits beside');

  // Both leave the row where they mean nothing. A Copy beside the Notes chip
  // has no bytes on screen to take.
  A.setReading('notes');
  assert.equal(S.serialCopy.style.display, 'none');
  assert.equal(S.scopeBtn.style.display, 'none');

  // The footer keeps only what is neither a reading nor a format.
  const acts = [...S.setActs.querySelectorAll('button')].map(b => b.textContent);
  assert.deepEqual(acts, ['Save jot', 'Clear']);
  assert.ok(!acts.some(t => /markdown|JSON/i.test(t)), 'no format is named twice over');
  A.clear();
  A.disable();
});
