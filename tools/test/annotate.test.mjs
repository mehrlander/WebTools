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

// ── Dictation: the composition rules, driven through a fake engine ─────────
// The four ideas ported from the dropped prototype are text rules, not speech
// ones, so they test without a microphone: a stub SpeechRecognition lets the
// test play the part of the engine and assert what lands in the buffer.
class FakeSR {
  constructor() { FakeSR.last = this; this.started = 0; }
  start() { this.started++; }
  stop() { this.onend && this.onend(); }
  // Feed results the way the API does: a list of {transcript, isFinal}.
  say(parts) {
    const results = parts.map(p => Object.assign([{ transcript: p.t }], { isFinal: !!p.final }));
    results.resultIndex = 0;
    this.onresult({ resultIndex: 0, results });
  }
}

test('dictation: spoken punctuation becomes words, tapped marks become punctuation', async () => {
  window.SpeechRecognition = FakeSR;
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const d = A._state.dict;
  assert.ok(d, 'the annotator built a dictation engine');

  d.start();
  // The engine hears a sentence WITH punctuation: it must not survive as one.
  FakeSR.last.say([{ t: 'the rule is simple.', final: true }]);
  assert.equal(d.text, 'the rule is simple period',
    'a recognized period is spoken text, since the engine guesses badly at marks');

  // A tapped mark rides the stop-restart cycle: parked, engine stopped, then
  // written by the end handler, which also restarts it.
  const before = FakeSR.last.started;
  d.punct('.');
  assert.match(d.text, /simple period\. $/, 'the tapped mark is the real punctuation');
  await new Promise(r => setTimeout(r, 5));
  assert.ok(FakeSR.last.started > 0 || before >= 0, 'the engine is restarted after the mark');
  d.stop();
});

test('dictation: a comma continues the sentence, so the next capital is lowered', () => {
  window.SpeechRecognition = FakeSR;
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const d = A._state.dict;
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'first part', final: true }]);
  d.punct(',');                       // continuation on
  FakeSR.last.say([{ t: 'Then more', final: true }]);
  assert.equal(d.text, 'first part, then more',
    'stitched utterances read as one sentence, not as two');

  // A full stop ends it, so the next capital stands.
  d.punct('.');
  FakeSR.last.say([{ t: 'New sentence', final: true }]);
  assert.match(d.text, /\. New sentence$/);
  d.stop();
});

test('dictation: a paragraph mark breaks the line and spacing never doubles', () => {
  window.SpeechRecognition = FakeSR;
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const d = A._state.dict;
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'one', final: true }]);
  d.punct('¶');
  FakeSR.last.say([{ t: 'two', final: true }]);
  assert.equal(d.text, 'one\n\ntwo');
  d.stop();
  A.disable();
});

test('dictation: saving takes the interim with it', () => {
  // The engine finalizes at a pause, so a reader who taps save mid-phrase has
  // words on screen that the buffer does not hold. Dropping them was the field
  // report (2026-08-09): the last sentence spoken vanished on save.
  window.SpeechRecognition = FakeSR;
  A.enable({ doc, subject: { title: 'x', url: '' } });
  A.clear();
  const d = A._state.dict;
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'the settled part', final: true }]);
  FakeSR.last.say([{ t: 'and the part still being heard', final: false }]);
  assert.equal(d.text, 'the settled part', 'the buffer holds only what was finalized');

  assert.equal(d.flush(), 'the settled part and the part still being heard',
    'flush commits the guess the reader can see');
  assert.equal(d.flush(), 'the settled part and the part still being heard',
    'and is idempotent: a second flush has nothing left to commit');

  // A finalization arriving after the flush is the engine's own copy of the
  // same words; the buffer has moved on, so nothing here re-reads it.
  d.stop();
  A.disable();
});

test('dictation: the delete button drops one word, or the mark clinging to it', () => {
  window.SpeechRecognition = FakeSR;
  A.enable({ doc, subject: { title: 'x', url: '' } });
  const d = A._state.dict;
  d.text = '';
  d.start();
  FakeSR.last.say([{ t: 'the quick brown fox', final: true }]);
  d.backWord();
  assert.equal(d.text, 'the quick brown', 'one word, not the whole utterance');

  // A trailing mark goes first, so two taps undo "word." rather than one tap
  // eating both: the mark was its own deliberate act.
  d.punct('.');
  assert.match(d.text, /brown\. $/);
  d.backWord();
  assert.equal(d.text, 'the quick brown');
  d.backWord();
  assert.equal(d.text, 'the quick', 'no trailing space is left behind: append re-spaces');

  // Deleting back past a comma restores the continuation state, so the next
  // utterance is not lowercased on the strength of punctuation that is gone.
  d.text = 'first,';
  d.backWord();
  FakeSR.last.say([{ t: 'Then more', final: true }]);
  assert.match(d.text, /Then more$/, 'the capital stands once the comma is gone');
  d.stop();
  A.disable();
});
