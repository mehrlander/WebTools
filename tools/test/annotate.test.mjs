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

test('the set announces its changes, and Review is a request rather than a surface', () => {
  A.enable({ doc, subject: { title: 'sample', url: 'https://example.test/s' } });
  A.clear();

  // The kit owns the data and announces that it moved; the reading surface is
  // the FAB drawer's Notes tab. There is deliberately no sheet here to find.
  const seen = [];
  const onChange = () => seen.push(A.items.length);
  window.addEventListener('annotate:change', onChange);

  const it = A.add({ type: 'text', quote: { exact: 'one', prefix: '', suffix: '' }, selector: '#p1' }, 'first');
  A.update(it.id, 'first, revised');
  A.select(it.id, { scroll: false });
  A.remove(it.id);
  assert.deepEqual(seen, [1, 1, 1, 0], 'add, update, select and remove each announce');
  window.removeEventListener('annotate:change', onChange);

  // Review asks; a listener claims it by preventing the default. Unclaimed, it
  // says so on the status line rather than appearing to do nothing.
  let asked = 0;
  const claim = (e) => { asked++; e.preventDefault(); };
  window.addEventListener('annotate:review', claim);
  A.review();
  assert.equal(asked, 1);
  assert.equal(A._state.status.textContent, '', 'a claimed request is silent');
  window.removeEventListener('annotate:review', claim);

  A.review();
  assert.match(A._state.status.textContent, /No drawer/,
    'unclaimed, it names the gap instead of failing quietly');
  A.clear();
});

test('announcements climb to the top window, since the drawer is usually up there', () => {
  // A toss runs the annotated page in an iframe whose own drawer declines to
  // mount, so the listener is in the TOP window while the kit is in the frame.
  // An announcement that only reached its own window was shouted into the frame
  // nobody watches: measured 2026-08-09, Review reporting "no drawer" with the
  // launcher visible in the same screenshot.
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
  assert.equal(F._announce('annotate:review', true), true,
    'a drawer one frame up counts as a drawer');

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

test('the pencil opens on the phrase that was on screen, not the one before it', () => {
  // stop() runs the engine's end handler, which clears the interim, so the
  // flush has to come first. The other order lost the sentence the reader was
  // looking at when they reached for the pencil. Found in the stage's copy of
  // the same toggle (tools/test/stage.test.mjs) and fixed in both.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const d = A._state.dict;
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'the settled part', final: true }]);
  FakeSR.last.say([{ t: 'and the part still being heard', final: false }]);

  A._state.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
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
    assert.equal(S.editing, false, 'one tap with nothing live waits');
    assert.equal(d.range, null);
    tap();
    assert.equal(S.editing, true, 'the second opens the keyboard');
    assert.equal(S.compTa.value, 'the quick brown fox');
    assert.equal(S.compTa.selectionStart, 6, 'at the offset that was tapped, not at the end');

    // The run is reset by the open, so a third tap is a fresh first tap rather
    // than a select-all that no longer exists: once the read surface is gone
    // the platform's own gesture is where a reader looks for it.
    A.disable();
  } finally { window.Dictate.hitsText = realHits; delete doc.caretRangeFromPoint; }
});

test('the keyboard mode does not wear a microphone', () => {
  // Wrong twice before this test existed. The exit button carried a microphone
  // on the theory that the icon names where the tap lands; readers read it as
  // "recording", and the mic button hiding in edit mode slid this one into the
  // mic's slot, which made the reading almost unavoidable. What is pinned here
  // is the absence of the microphone and the presence of the dimmed real one.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  assert.match(S.compEdit._icon.className, /ph-pencil-simple/, 'dictation mode: a pencil');
  assert.equal(S.compMic.disabled, false);

  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.editing, true, 'the keyboard is open');
  assert.ok(!/ph-microphone/.test(S.compEdit._icon.className),
    'the way OUT of the keyboard is not a microphone');
  assert.match(S.compEdit._icon.className, /ph-check/);
  assert.equal(S.compEditTxt.style.display, 'inline', 'and it says Done');
  // The mic holds its slot instead of vanishing, so nothing slides into it.
  assert.notEqual(S.compMic.style.display, 'none');
  assert.equal(S.compMic.disabled, true, 'visibly off rather than absent');

  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.editing, false);
  assert.match(S.compEdit._icon.className, /ph-pencil-simple/, 'and the face goes back');
  assert.equal(S.compMic.disabled, false);
  A.disable();
});

test('Done resumes dictation only if the keyboard interrupted it', () => {
  // Closing used to call start() unconditionally, on the reading that
  // dictation is the default mode. A reader who had already stopped listening,
  // tapped the pencil, and tapped Done came back to a live microphone they
  // never asked for. Both directions are pinned, since the resume itself is
  // wanted: it is the switching ON that was not.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;

  // Live when the keyboard opens: resumed on the way out.
  S.dict.start();
  assert.equal(S.dict.listening, true);
  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.dict.listening, false, 'the keyboard stops the engine');
  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.dict.listening, true, 'and Done puts it back');

  // Stopped when the keyboard opens: still stopped on the way out.
  S.dict.stop();
  assert.equal(S.dict.listening, false);
  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.dict.listening, false,
    'Done does not switch the microphone on for a reader who had it off');
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

test('the review button says what a tap will do before it is tapped', () => {
  // It was a yellow pill reading "Review" that looked the same whether it would
  // open the drawer, close it, or reach nothing at all. The drawer broadcasts
  // its state; the button reads it.
  let asked = 0;
  const query = () => asked++;
  window.addEventListener('annotate:drawer-query', query);
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const S = A._state;
  assert.equal(asked, 1, 'the card asks once on mount rather than waiting to be told');
  window.removeEventListener('annotate:drawer-query', query);

  const say = (detail) => window.dispatchEvent(new window.CustomEvent('annotate:drawer', { detail }));

  say({ open: false, tab: 'render' });
  assert.match(S.reviewBtn.title, /^Open/);
  assert.equal(S.reviewBtn.disabled, false);

  say({ open: true, tab: 'render' });
  assert.match(S.reviewBtn.title, /^Open/, 'open on another tab is still an open');

  say({ open: true, tab: 'notes' });
  assert.match(S.reviewBtn.title, /^Close/, 'and in front of you, the only honest offer is to put it away');
  assert.equal(S.reviewBtn.style.background, 'rgb(250, 204, 21)', 'lit, the way a live mode chip is');

  // No drawer at all: the click that proves it is the click that disables the
  // button, so it stops offering something it cannot do.
  A.review();
  assert.equal(S.reviewBtn.disabled, true);
  assert.match(S.reviewBtn.title, /No drawer/);
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

  assert.match(S.reviewBtn.getAttribute('style'), /min-height:\s*30px/, 'the title matches the action row');
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

  // The keyboard brings its own caret, so the pad stands down in edit mode. It
  // DIMS rather than hides: it is a cell in the frame, and a cell that
  // disappears takes its column with it, which is the one thing a continuous
  // border cannot survive.
  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.compPad.disabled, true);
  assert.equal(parseFloat(S.compPad.style.opacity), 0.3);
  assert.notEqual(S.compPad.style.display, 'none', 'the column holds');
  S.compEdit.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(S.compPad.disabled, false);
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

test('a note row opens a menu, and Edit reopens it in the composer', () => {
  // The row carried a bare × and nothing else. A destructive action alone in a
  // row is the wrong default, and the edit that was missing had to be reached
  // through the drawer, a tab away on a phone. Both now sit behind one tap.
  window.SpeechRecognition = FakeSR;
  loadKit('dictate.js', { window });
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const S = A._state;
  const it = A.add({ type: 'page' }, 'the ref bar wraps');

  const row = S.listEl.firstChild;
  const more = row.querySelector('[data-annotate-menu]');
  assert.ok(more, 'the row carries a menu button, not a delete');
  assert.equal(row.textContent.includes('×'), false, 'and no bare × beside it');

  more.dispatchEvent(new window.Event('click', { bubbles: true }));
  const menu = S.ui.querySelector('div[data-annotate-menu]');
  assert.ok(menu, 'the menu opens on the row it belongs to');
  assert.deepEqual([...menu.querySelectorAll('button')].map(b => b.textContent), ['Edit', 'Remove']);

  // Edit stages the SAME note: same target, its text loaded, nothing recording,
  // and saving updates rather than adding a second one.
  menu.querySelectorAll('button')[0].dispatchEvent(new window.Event('click', { bubbles: true }));
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

  // Remove is the other half, and closing is a click anywhere else.
  S.listEl.querySelector('[data-annotate-menu]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A._state.menuId, it.id, 'the same tap toggles it back open');
  doc.body.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(A._state.menuId, null, 'a click off the menu closes it');

  S.listEl.querySelector('[data-annotate-menu]')
    .dispatchEvent(new window.Event('click', { bubbles: true }));
  S.ui.querySelector('div[data-annotate-menu]').querySelectorAll('button')[1]
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
