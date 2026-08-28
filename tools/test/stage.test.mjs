// alpineComponents/stage.js — logic-level tests for the stager: the estate-
// level picker roots (pickerRoots), the grab flow, the inline reader, the
// folding of dropped local files into the one stage (a local item beside refs,
// both flowing through the one send/save/mint, with save naming its target
// repo), and the Diff lens's A/B auto-pairing, diff dump, and review-prompts
// copy. Driven directly against a fake browser store; no network, no real
// files, no picker pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick, deckGeometry } from './bootstrap.mjs';

const calls = [];

// A GH stand-in: srcGh builds `new base.constructor(...)`, so the methods must
// live on the class. copyTo (refs), save/saveBytes (local bytes), get (reads).
class FakeGH {
  constructor(conf = {}) { this.token = conf.token || ''; this.repo = conf.repo || ''; this.ref = 'main'; }
  async get(path) {
    // One repo that always 404s, so a failing read has a fixture: the reader
    // has to open on it rather than refuse, or its position counter lies.
    if (this.repo === 'me/missing') throw Object.assign(new Error('404'), { status: 404 });
    return { text: 'CONTENT ' + this.repo + ':' + path, sha: 'x' };
  }
  async recentFiles() {
    if (this.repo === 'me/open') return [
      { path: 'lib/new.js', date: '2026-07-18T10:00:00Z', sha: 'a' },
      { path: 'old.md', date: '2026-07-16T10:00:00Z', sha: 'b' },
    ];
    if (this.repo === 'me/fav') return [{ path: 'docs/mid.md', date: '2026-07-17T10:00:00Z', sha: 'c' }];
    return [];
  }
  async copyTo(dest, paths) { calls.push({ kind: 'copyTo', from: this.repo, dest, paths }); return paths.map(p => ({ path: p, status: 'ok' })); }
  async save(path, value, msg) { calls.push({ kind: 'save', repo: this.repo, ref: this.ref, path, value, msg }); return { content: { sha: 'x' } }; }
  async saveBytes(path, bytes, msg) { calls.push({ kind: 'saveBytes', repo: this.repo, ref: this.ref, path, bytes, msg }); return { content: { sha: 'x' } }; }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="st" x-data="stager()"></div>
  </body></html>`,
});
// The reader is a swipe-deck takeover now, and the deck pages by scrolling a
// track it measures. jsdom has neither layout nor scrollTo, so give it the
// shared shim: with clientWidth falling back to 1, a slide index and a pixel
// offset coincide and go(2) lands on slide 2, which is what a logic test needs.
deckGeometry(window);

// alpine-bundle.js defines the browser store; the stager composes dropZone and
// pathPicker, and its inline reader mounts a viewer, so all three must be
// registered before it mounts. kits/text-diff.js is the Diff lens's engine,
// shared with pages/diff-tool.html: it attaches window.textDiff, which the
// stager's diffLines requires.
const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  // The param read and the address grammar, ahead of the components: read
  // delegates source choice to one and parseItem the grammar to the other, and
  // the pre-build boots both in this position for the same reason.
  'lib/kits/url-params.js',
  'lib/kits/repo-address.js',
  // The mailbox kit: the stage reads its `ask` kind, the one the browser cannot
  // fulfil. show-repo loads every kit before any component, so this mirrors the
  // page's own order rather than adding a dependency the page lacks.
  'lib/kits/repo-mailbox.js',
  'lib/kits/surface.js',
  'lib/kits/text-diff.js',
  // The reader's shell, and the channel it tells the sidebar what it is
  // showing on. stage.js gh.loads both on demand in a browser; here they are
  // present up front, since there is no loader in this realm.
  'lib/kits/swipe-deck.js',
  'lib/kits/subject-channel.js',
  'lib/alpineComponents/drop-zone.js',
  'lib/alpineComponents/path-picker.js',
  'lib/alpineComponents/viewer.js',
  'lib/alpineComponents/stage.js',
]);

const data = Alpine.$data(window.document.getElementById('st'));
const store = Alpine.store('browser');
store.gh = new FakeGH({ token: 't', repo: 'me/open' });
const plain_ = (v) => JSON.parse(JSON.stringify(v));
// The reader is a deck mounted on document.body, so it outlives a store reset
// and would be seeked rather than reopened by the next test's view(). Close it
// first, which is also what a reader does between two readings; the transform
// takeover is the same kit and gets the same treatment.
const reset = () => {
  // The comparison covers the reader, so it comes down first: dropping a parent
  // out from under a child leaves the child stacked on nothing.
  if (data._cmpDeck) { data._cmpDeck.drop(); data._cmpDeck = null; }
  if (data._rDeck) { data._rDeck.drop(); data._rDeck = null; }
  if (data._tfDeck) { data._tfDeck.drop?.(); data._tfDeck = null; }
  data._rNotes = {};
  store.stage = []; store.stageFocus = ''; store.stageOffers = []; data.reader = null;
  data.diffA = 0; data.diffB = 0; data._diffTouched = false; data.diffRows = null;
};

// navigator.clipboard isn't polyfilled by makeWindow (see its header note).
// Component code runs in the jsdom window realm (new window.Function(src)()),
// so its bare `navigator` is window.navigator, not Node's globalThis.navigator
// — stub it there so copyDiff/copyPrompt are exercisable without a real clipboard.
const clipWrites = [];
window.navigator.clipboard = { writeText: async (t) => { clipWrites.push(t); } };

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
  assert.ok(data.description.length > 0);
});

// ---- the estate-level picker roots --------------------------------------

test('pickerRoots: open repo, then quick links, then targets, deduped', () => {
  store.repo = 'me/open';
  store.config = { stage: { targets: ['me/dest:pkg', 'me/open:vendor', 'other/lib@dev:src'] } };
  window.__shell = { estateRepos: [{ repo: 'me/fav' }, { repo: 'me/open' }] };
  assert.deepEqual(plain_(data.pickerRoots()), [
    { repo: 'me/open', ref: '' },
    { repo: 'me/fav', ref: '' },
    { repo: 'me/dest', ref: '' },
    { repo: 'other/lib', ref: 'dev' },
  ]);
  delete window.__shell;
});

test('pickerRoots without shell or targets is just the open repo', () => {
  store.repo = 'me/open';
  store.config = null;
  assert.deepEqual(plain_(data.pickerRoots()), [{ repo: 'me/open', ref: '' }]);
});

// ---- declared destinations -----------------------------------------------
// The pills are the DECLARED boxes, against a picker that lists every folder
// that exists. Only what a manifest says is for receiving appears, so a repo
// with no pill is visibly undeclared rather than quietly defaulting to its
// root.

test('destPills: the repo box, then each project box, deduped and labelled', () => {
  store.repo = 'me/open';
  store.config = { inbox: 'chron/dump', projects: [{ path: 'projects/wps', inbox: 'projects/wps/dump' }] };
  window.__shell = {
    estateRepos: [{ repo: 'me/fav' }],
    estateConfigs: {
      'me/fav': { inbox: '@drops:incoming', projects: [{ path: 'projects/x' }] },
      // The open repo's cache entry is deliberately stale: the live config
      // above must win, the same rule repoProjects follows.
      'me/open': { inbox: 'stale/box' },
    },
    repoProjects: (repo, cfg) => (cfg.projects || []).map(p => ({
      label: p.path.split('/').pop(),
      inbox: p.inbox ? window.RepoAddress.parseBox(p.inbox, repo) : null,
    })),
  };
  assert.deepEqual(plain_(data.destPills), [
    { label: 'open', kind: 'repo', spec: 'me/open:chron/dump', dir: 'chron/dump' },
    { label: 'wps', kind: 'project', spec: 'me/open:projects/wps/dump', dir: 'projects/wps/dump' },
    { label: 'fav', kind: 'repo', spec: 'me/fav@drops:incoming', dir: 'incoming' },
  ], 'a project that declares no inbox contributes no pill');
  delete window.__shell;
});

test('destPills is empty when nothing is declared, and never guesses a root', () => {
  store.repo = 'me/open';
  store.config = { projects: [{ path: 'projects/wps' }] };
  window.__shell = { estateRepos: [], estateConfigs: { 'me/open': {} }, repoProjects: () => [] };
  assert.deepEqual(plain_(data.destPills), []);
  delete window.__shell;
});

test('aim sets the destination and the picker label together', () => {
  store.repo = 'me/open';
  const picker = { label: 'stale' };
  data.$refs.destPicker = { __pathPicker: picker };
  data.aim('me/open:chron/dump');
  assert.equal(data.destSpec, 'me/open:chron/dump');
  assert.equal(picker.label, 'me/open:chron/dump',
    'the picker commits its own label, so destSpec alone would name one place while the send went to another');
  delete data.$refs.destPicker;
});

// ---- grabbing from a repo, reading inline -----------------------------

test('grab stages the picked ref once, deduped by key', () => {
  reset();
  data.grab({ repo: 'me/a', ref: '', path: 'lib/x.js' });
  data.grab({ repo: 'me/a', ref: '', path: 'lib/x.js' });
  data.grab({ repo: 'me/b', ref: 'dev', path: 'y.md' });
  assert.deepEqual(plain_(data.refItems), [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { repo: 'me/b', ref: 'dev', path: 'y.md' },
  ]);
});

// The reader is a swipe-deck takeover, one slide per staged item, each slide
// mounting its own viewer. `data-reader-slide` carries the index, so a test can
// read the viewer for the position it means rather than the only one there used
// to be. `reader.note` still says why a position rendered nothing.
const readerViewer = (i) => window.document
  .querySelector(`[data-reader-slide="${i ?? data.reader.i}"]`)?.__viewer;

// The deck builds a slide from its scroll handler, on a real animation frame,
// and the slide then resolves its content asynchronously. `tick` only turns the
// microtask queue, so it lands before the frame and sees an empty slide. Wall
// clock rather than requestAnimationFrame: awaiting a frame hangs rather than
// fails when jsdom's frame clock is not running. Same idiom as file-deck's.
const shown = async () => { await new Promise(r => setTimeout(r, 50)); await tick(3); };

test('view loads a ref into the inline reader, not the shared activeFile', async () => {
  reset();
  store.activeFile = null;
  // The reader is a position in the stage, so the row it opens from is staged.
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await data.view({ repo: 'me/a', ref: '', path: 'lib/x.js' });
  await shown();
  assert.equal(data.reader.name, 'lib/x.js');
  assert.equal(data.reader.i, 0, 'and it knows where it is');
  assert.equal(store.activeFile, null, 'stage reader never routes through Files');
  const vwr = readerViewer();
  assert.equal(vwr.file, 'lib/x.js');
  assert.match(vwr.content, /CONTENT me\/a:lib\/x.js/);
  assert.ok(vwr.fileUrls.some(u => /github\.com\/me\/a\/blob/.test(u.u)),
    'the origin gives the reader its GitHub link');
});

// The reader used to be a dead end: one file, and the only way to the next
// staged one was close, find the row, open again. It carries an index now, so
// the staged set is walkable. Every position opens, including the ones with
// nothing to render, which is what keeps the counter honest.
test('the reader walks the staged set, and every position opens', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'one.js' },
    { local: true, id: 91, name: 'bin.png', path: 'bin.png', size: 9, isText: false },
    { repo: 'me/a', ref: '', path: 'three.js' },
  ];
  await data.view({ repo: 'me/a', ref: '', path: 'one.js' });
  await shown();
  assert.equal(data.reader.i, 0);
  assert.equal(data.reader.note, '', 'a text file renders');

  // A binary local file is a position like any other: it opens with a note
  // instead of a viewer, so stepping past it never skips or dead-ends.
  await data.readerStep(1);
  await shown();
  assert.equal(data.reader.i, 1);
  assert.match(data.reader.note, /Binary/);
  assert.equal(data.reader.name, 'bin.png');

  await data.readerStep(1);
  await shown();
  assert.equal(data.reader.i, 2);
  assert.equal(data.reader.note, '');

  // The ends hold.
  await data.readerStep(1);
  assert.equal(data.reader.i, 2, 'past the last is a no-op');
  await data.readerStep(-1); await data.readerStep(-1); await data.readerStep(-1);
  await shown();
  assert.equal(data.reader.i, 0, 'before the first is a no-op');
});

test('the reader lists the staged set, each item named and placed', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: 'main', path: 'one.js' },
    { local: true, id: 92, name: 'note.md', path: 'note.md', size: 2, isText: true, text: 'hi' },
  ];
  await data.view({ repo: 'me/a', ref: 'main', path: 'one.js' });
  await shown();
  const mark = data._rDeck.el.querySelector('.sd-header').children[1];
  assert.equal(mark.tagName, 'BUTTON', 'a list behind the mark makes it a button');
  mark.click();
  await shown();
  const listed = [...data._rDeck.el.querySelector('.sd-index').children];
  assert.equal(listed.length, 2, 'one row per staged item');
  assert.match(listed[0].textContent, /one\.js/);
  assert.match(listed[0].textContent, /me\/a@main/,
    'placed as well as named, since two staged items can share a path');
  assert.match(listed[1].textContent, /local/);
  mark.click();
  await shown();
});

test('a fetch that fails still opens, as a note rather than a closed modal', async () => {
  reset();
  store.stage = [{ repo: 'me/missing', ref: '', path: 'gone.js' }];
  await data.view({ repo: 'me/missing', ref: '', path: 'gone.js' });
  await shown();
  assert.ok(data.reader, 'the modal is open');
  assert.match(data.reader.note, /Could not load it/);
});

test('view shows a local text item inline', async () => {
  const loc = { local: true, id: 90, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' };
  store.stage = [loc];
  await data.view(loc);
  await shown();
  assert.equal(data.reader.name, 'n.txt');
  const vwr = readerViewer();
  assert.equal(vwr.file, 'n.txt');
  assert.equal(vwr.content, 'hi');
  assert.equal(vwr.origin?.local, true);
  assert.equal(vwr.fileUrls.length, 0, 'a local-only item has no GitHub home, so no repo links');
});

// ---- folding dropped local files into the stage -------------------------

test('a dropped file becomes a local stage item holding its bytes', () => {
  reset();
  data.onDropped({ file: {}, name: 'logo.png', size: 3, type: 'image/png', bytes: new Uint8Array([1, 2, 3]), buf: new ArrayBuffer(3) });
  assert.equal(data.localItems.length, 1);
  assert.equal(data.refItems.length, 0);
  const it = data.localItems[0];
  assert.equal(it.local, true);
  assert.equal(it.name, 'logo.png');
  assert.equal(it.isText, false);
  assert.equal(it.bytes[0], 1);
});

// A DROPPED TEXT FILE IS TEXT. Every file intake arrives as bytes, and the
// item was stamped binary on that basis, so a dropped .md read as "Not
// text" while the same characters pasted opened rendered. The decision is a
// strict UTF-8 decode, so it holds for any text extension, not a list of them.
test('a dropped markdown file is held as text, not as bytes', () => {
  reset();
  const md = '# Notes\n\nA paragraph.\n';
  const bytes = new TextEncoder().encode(md);
  data.onDropped({ file: {}, name: 'notes.md', size: bytes.length, type: 'text/markdown', bytes, buf: bytes.buffer });
  assert.equal(data.localItems.length, 1);
  const it = data.localItems[0];
  assert.equal(it.isText, true, 'it decodes as UTF-8, so it is text');
  assert.equal(it.text, md);
});

// End to end, which is the report this fixes: drop the file, open the row,
// and get the file rather than a note about it. The pane's own mode is
// READ_MODE's (markdown renders, raw one tap away); what is asserted here is
// that the viewer is driven at all.
test('a dropped markdown file reads rather than reporting itself binary', async () => {
  reset();
  const md = '# Notes\n\nA paragraph.\n';
  const bytes = new TextEncoder().encode(md);
  data.onDropped({ file: {}, name: 'notes.md', size: bytes.length, type: 'text/markdown', bytes, buf: bytes.buffer });
  await data.view(data.localItems[0]);
  await shown();
  assert.equal(data.reader.note, '', 'no "Binary … staged for copy, not reader" note');
  assert.equal(readerViewer().content, md);
});

// The one form a file can arrive in with no `bytes` beside it. Reading the
// buffer here is what keeps the two intake shapes on one answer.
test('a dropped text file with only a buffer still decodes', () => {
  reset();
  const bytes = new TextEncoder().encode('name,qty\na,1\n');
  data.onDropped({ file: {}, name: 'rows.csv', size: bytes.length, type: 'text/csv', buf: bytes.buffer });
  assert.equal(data.localItems[0].isText, true);
  assert.equal(data.localItems[0].text, 'name,qty\na,1\n');
});

// The two ways bytes stay bytes: a type the viewer renders from a data: URI
// (the .png above), and anything that fails the decode.
test('bytes that are not UTF-8 stay bytes', () => {
  reset();
  data.onDropped({ file: {}, name: 'archive.zip', size: 4, type: '',
                   bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0xff]), buf: new ArrayBuffer(4) });
  assert.equal(data.localItems[0].isText, false);
});

test('an svg keeps its bytes, so it still reads as an image', () => {
  reset();
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  data.onDropped({ file: {}, name: 'mark.svg', size: svg.length, type: 'image/svg+xml', bytes: svg, buf: svg.buffer });
  assert.equal(data.localItems[0].isText, false, 'the viewer renders it from its own bytes');
});

test('pasted text that reads as refs stages those refs, not a text file', () => {
  reset();
  data.onDropped({ text: 'me/a:lib/x.js\nme/b@dev:docs/y.md', size: 30, type: 'text/plain' });
  assert.equal(data.localItems.length, 0);
  assert.deepEqual(plain_(data.refItems), [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { repo: 'me/b', ref: 'dev', path: 'docs/y.md' },
  ]);
});

test('pasted prose is held as a local text item', () => {
  reset();
  data.onDropped({ text: 'just some notes, not a ref', size: 26, type: 'text/plain' });
  assert.equal(data.localItems.length, 1);
  assert.equal(data.localItems[0].isText, true);
  assert.equal(data.localItems[0].text, 'just some notes, not a ref');
  assert.match(data.localItems[0].name, /^\d{4}-\d{2}-\d{2}-paste\.txt$/);
});

// ---- intake without the view --------------------------------------------
// The fold lives on window.StageIntake rather than inside the component, which
// is what lets a host stage a drop before the bench has ever mounted: the app
// shell takes a drop on any view and calls these. Nothing here touches a
// component method, which is the point of the tests.

const textFile = (name, text, type = '') => {
  const bytes = new TextEncoder().encode(text);
  return { name, type, size: bytes.length, arrayBuffer: async () => bytes.buffer };
};
const dropOf = ({ types = [], files = [], text = '' }) => ({ types, files, getData: () => text });

test('takeDrop stages a dropped file and reports what it added', async () => {
  reset();
  const added = await window.StageIntake.takeDrop(
    dropOf({ types: ['Files'], files: [textFile('notes.md', '# Hi\n', 'text/markdown')] }));
  assert.equal(added.length, 1, 'the caller learns what landed, so it can open it');
  assert.equal(added[0].name, 'notes.md');
  assert.equal(added[0].isText, true);
  assert.equal(store.stage.length, 1, 'and it landed on the one stage');
});

test('takeDrop with no files falls to the dragged text, refs and all', async () => {
  reset();
  const added = await window.StageIntake.takeDrop(
    dropOf({ types: ['text/plain'], text: 'me/a:lib/x.js' }));
  assert.equal(added.length, 1);
  assert.deepEqual(plain_(data.refItems), [{ repo: 'me/a', ref: '', path: 'lib/x.js' }]);
});

// The id counter is module-scope for this: two creators (the bench's drop-zone
// and the app-wide drop) minting from per-mount counters would collide, and
// `local:<id>` is the key dedupe and the reader address by.
test('every local item takes its own key', () => {
  reset();
  const a = window.StageIntake.take({ text: 'one' })[0];
  const b = window.StageIntake.take({ text: 'two' })[0];
  assert.notEqual(window.StageIntake.keyOf(a), window.StageIntake.keyOf(b));
});

// focus is a REQUEST, not a selection: a host stages from another view, names
// the item, and the bench opens on it whenever it gets there.
test('focus names an item and the stage opens its reader, then forgets it', async () => {
  reset();
  const it = window.StageIntake.take({ text: 'just some prose' })[0];
  window.StageIntake.focus(it);
  assert.equal(store.stageFocus, 'local:' + it.id);
  await tick(5);
  assert.equal(store.stageFocus, '', 'reading the request clears it, so a later mount does not reopen');
  assert.ok(data.reader, 'the reader opened');
  assert.equal(data.reader.name, it.name);
});

test('a drop on the view itself opens one file, and stays out of the way for a batch', async () => {
  reset();
  await data.onPageDrop({ dataTransfer: dropOf({ types: ['Files'], files: [textFile('one.md', '# One\n')] }) });
  await tick(4);
  assert.equal(data.reader?.name, 'one.md');

  reset();
  await data.onPageDrop({ dataTransfer: dropOf({ types: ['Files'],
    files: [textFile('a.md', 'a'), textFile('b.md', 'b')] }) });
  await tick(4);
  assert.equal(data.reader, null, 'two arrivals stay listed rather than opening one of them');
  assert.equal(data.localItems.length, 2);
});

// ---- every flavor a paste carried ---------------------------------------
// One copy out of a spreadsheet puts three things on the clipboard at once.
// The handler used to read one and return, so which one you got depended on
// where the caret was: the page took the image, a form field took the text,
// and neither could reach the other. The fixture is a real PI 01304 range.

const TSV = [
  '\tJUL\tAUG\tSEPT',
  'AA\tSalaries\t $186,927 \t $186,927 ',
  'BA\tSocial Security (OASI)\t $9,448 \t $9,448 ',
].join('\n');
const HTML = '<table><tr><td>Salaries</td><td>186,927</td></tr></table>';

// A DataTransfer stand-in: jsdom's ClipboardEvent carries none, and what is
// under test is the reading, not the platform's construction of it.
const fakeCd = ({ types = [], data = {}, files = [] }) => ({
  types, files,
  getData: (t) => data[t] || '',
});
const fakeFile = (name, type, size) => ({ name, type, size, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });

// The paste fold is window.StageIntake's, and the host reads its own event
// target: these drive the intake directly, the way the shell does. The
// `editable` flag is what a form-field target means to it.
const paste = async (cd, target) => {
  data.offers = [];
  const t = target || { tagName: 'DIV' };
  const editable = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || !!t.isContentEditable;
  const r = await window.StageIntake.takePaste(cd, { editable });
  await tick(2);
  return r;
};

test('a spreadsheet paste stages one flavor and lists all three', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html', 'Files'],
    data: { 'text/plain': TSV, 'text/html': HTML },
    files: [fakeFile('image.png', 'image/png', 4096)],
  }));
  assert.equal(data.localItems.length, 1, 'one flavor is staged, not three');
  assert.match(data.localItems[0].name, /\.png$/, 'the image, which is what this handler always took');
  assert.deepEqual(plain_(data.offers.map(o => data.flavorLabel(o)).sort()), ['html', 'png', 'tsv'],
    'the bar says what the copy held, which is all of it');
  const ticked = data.offers.filter(o => data.flavorStaged(o)).map(o => data.flavorLabel(o));
  assert.deepEqual(plain_(ticked), ['png'],
    'and marks the one it took, so the bar is a choice rather than an add list');
});

test('a text/plain grid is named .tsv, so it opens as a table', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': TSV } }));
  assert.match(data.localItems[0].name, /\.tsv$/);
  assert.equal(data.offers.length, 1, 'one flavor is still worth naming: it is what the copy held');
  assert.equal(data.flavorStaged(data.offers[0]), true, 'and it is on the stage');
});

// ---- what a paste is NAMED is what it routes to ----------------------------
//
// READ_MODE keys on the extension, so nameForText is the routing decision and
// these are mode tests wearing a naming test's clothes. Measured before the
// change (tools/render/scenarios/paste-kinds-probe.mjs): a CSV and a rows
// function both fell through to .txt.

const CSV = 'code,label,jul,aug\nAA,Salaries,186927,186927\nBA,Social Security,9448,9448';

test('a pasted CSV is named .csv, so it opens as a table like its TSV twin', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': CSV } }));
  assert.match(data.localItems[0].name, /\.csv$/);
});

test('a quoted comma is a value, not a field separator', () => {
  const csv = 'code,label,jul\nAA,"Social Security, OASI",9448\nBA,"Salaries, all",186927';
  assert.equal(window.StageIntake.delimiterOf(csv), ',',
    'counting quoted commas would make the field counts disagree and lose the grid');
});

test('an escaped doubled quote does not reopen the field', () => {
  const csv = 'a,b\n"he said ""hi, there""",2\n"plain",3';
  assert.equal(window.StageIntake.delimiterOf(csv), ',');
});

test('tab wins over comma, so a TSV carrying prose commas stays a TSV', () => {
  const tsv = 'code\tlabel\nAA\tSalaries, all funds\nBA\tSocial Security, OASI';
  assert.equal(window.StageIntake.delimiterOf(tsv), '\t');
});

test('prose with commas is not a grid', () => {
  assert.equal(window.StageIntake.delimiterOf('one, two, three\nand a second line'), '',
    'the counts differ, so it is prose');
});

test('a rows function is named .js, since pasting one is how work resumes', async () => {
  reset();
  const fn = 'rows => rows.filter(r => r.jul > 10000)';
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': fn } }));
  assert.match(data.localItems[0].name, /\.js$/);
});

test('isRowsFn takes the shapes the workbench accepts, and not bare JavaScript', () => {
  const yes = ['rows => rows', '(rows) => rows.map(r => r)', '(rows, meta) => rows',
               'function (rows) { return rows }', 'function tidy(rows) { return rows }',
               'async function (rows) { return rows }'];
  const no = ['x => x * 2', 'function add(a, b) { return a + b }',
              'const rows = 1', 'rowsPerPage => 10'];
  for (const src of yes) assert.equal(window.StageIntake.isRowsFn(src), true, src);
  for (const src of no) assert.equal(window.StageIntake.isRowsFn(src), false, src);
});

test('a multi-line function body is a function, not a comma grid', async () => {
  reset();
  const fn = 'rows => rows.map(r => ({\n  code: r.code,\n  jul: r.jul,\n}))';
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': fn } }));
  assert.match(data.localItems[0].name, /\.js$/,
    'the grid test runs after this one precisely so this cannot be renamed .csv');
});

// ---- .json is a parse, not a first character -------------------------------
//
// Reported 2026-08-24: a PowerShell script pasted into the stage was named
// .json on the strength of its opening `[`, and READ_MODE sent it to the tree
// view, which shows nothing for text that will not parse. The extension is the
// routing decision, so a wrong one here does not merely mislabel the paste, it
// hides it.

const PS_SCRIPT = `[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Path,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Get-ChildItem -Path $Path | Where-Object { $_.Length -gt 1kb }`;

const extOf = (text) => window.StageIntake.nameForText(text).split('.').pop();

test('a pasted PowerShell script is not JSON, whatever its first character', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': PS_SCRIPT } }));
  const name = data.localItems[0].name;
  assert.doesNotMatch(name, /\.json$/, 'the reported bug: `[CmdletBinding()]` opened with a bracket');
  assert.match(name, /\.ps1$/, 'and it is named for what it is, not left as .txt');
});

test('a bare script block is not JSON either', () => {
  assert.equal(extOf('{\n    param($x)\n    Write-Host $x\n}'), 'ps1',
    'the other half of /^[{[]/, and the same misread');
});

test('JSON that parses is still named .json', () => {
  assert.equal(extOf('{"a": 1, "b": [2, 3]}'), 'json');
  assert.equal(extOf('[{"a": 1}, {"a": 2}]'), 'json');
  assert.equal(extOf('\n\n  [1, 2, 3]  \n'), 'json', 'surrounding whitespace is not content');
});

test('a scalar parses but is not what pasting JSON means', () => {
  assert.equal(window.StageIntake.isJson('42'), false);
  assert.equal(window.StageIntake.isJson('"a string"'), false);
  assert.equal(window.StageIntake.isJson('{ not json'), false, 'nor is a truncated object');
});

test('a commented PowerShell script is not markdown', () => {
  const src = `# Build the report and drop it on disk.
function New-Report {
    param([string]$Out)
    Get-Process | Select-Object Name, CPU | Export-Csv -Path $Out -NoTypeInformation
}`;
  assert.equal(extOf(src), 'ps1',
    'a leading `# comment` reads as an H1 to the markdown pattern, so ps1 runs first');
});

test('prose that names one cmdlet is prose, and a fenced example is markdown', () => {
  const doc = `# Cleaning up the share

Run Get-ChildItem against the archive and see what is left.`;
  assert.equal(extOf(doc), 'md', 'one signal is a mention, not a script');
  const withFence = doc + '\n\n```\nGet-ChildItem -Path C:\\x | Where-Object { $_.Length -gt 0 }\n```\n';
  assert.equal(extOf(withFence), 'md',
    'a fence is exact markdown and is not PowerShell at all, so it settles the tie');
});

test('isPowerShell wants two distinct signals, and counts each one once', () => {
  assert.equal(window.StageIntake.isPowerShell('Get-ChildItem and Set-Location and New-Item'), false,
    'three cmdlets are one signal: the cmdlet signal');
  assert.equal(window.StageIntake.isPowerShell('$rows = Import-Csv .\\in.csv\n$rows | Where-Object { $_.Amount -gt 0 }'), true,
    'a cmdlet, $_, and a word operator');
});

test('a CSV is still a CSV, and prose is still prose', () => {
  assert.equal(extOf(CSV), 'csv', 'the PowerShell test sits ahead of the grid test and must not eat one');
  assert.equal(extOf('Just a couple of sentences.\nWith a second line.'), 'txt');
});

// ---- a guessed extension looks guessed --------------------------------------
//
// A sniff will always be wrong sometimes, and the pencil has always been the
// correction. What was missing is any sign that a correction was wanted: a name
// the sniff invented read exactly like one a file or a clipboard MIME type
// stated, so nobody had reason to reach for the rename. `sniffed` is that
// distinction, set at the one intake that guesses and drawn on the row as a
// dimmed, dotted extension.

test('a pasted plain-text item is marked as guessed', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': PS_SCRIPT } }));
  assert.equal(data.localItems[0].sniffed, true);
});

test('a name the platform stated is not a guess', async () => {
  reset();
  await paste(fakeCd({ types: ['text/html'], data: { 'text/html': HTML } }));
  assert.equal(data.localItems[0].sniffed, false,
    'text/html is named from the clipboard MIME type, which is a declaration');
  reset();
  window.StageIntake.take({ text: 'anything at all', name: 'given.md', size: 15 });
  assert.equal(data.localItems[0].sniffed, false,
    'and so is a #gz= payload, which carries the name it was minted with');
});

test('a dropped file keeps its own name and is never marked', async () => {
  reset();
  await window.StageIntake.takeFile(fakeFile('script.ps1', 'text/plain', 3));
  assert.ok(!data.localItems[0].sniffed, 'the person who saved it named it');
});

test('nameParts splits at the last dot, never at the slash', () => {
  // plain_ because the component builds its array in the jsdom realm, so the
  // prototype differs and a strict deep-equal reads that as a mismatch.
  const parts = (it) => plain_(data.nameParts(it));
  assert.deepEqual(parts({ name: '2026-08-24-paste.ps1' }), ['2026-08-24-paste', '.ps1']);
  assert.deepEqual(parts({ name: 'docs/note.md' }), ['docs/note', '.md']);
  assert.deepEqual(parts({ name: 'README' }), ['README', ''],
    'no dot means no marker to draw');
  assert.deepEqual(parts({ path: 'a.b', name: 'c.d' }), ['a', '.b'],
    'path wins, which is the field the row reads');
});

test('the row draws a guessed extension differently from a stated one', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': PS_SCRIPT } }));
  window.StageIntake.take({ text: '<h1>hi</h1>', size: 11, name: '2026-08-24-paste.html' });
  await tick(3);
  // The tail span is the extension; the marker is its class, so this is the
  // gate on the pixels rather than on the flag the pixels are drawn from.
  const tails = [...window.document.getElementById('st').querySelectorAll('span')]
    .filter(s => /^\.(ps1|html)$/.test(s.textContent || ''));
  const cls = Object.fromEntries(tails.map(s => [s.textContent, s.className]));
  assert.match(cls['.ps1'], /decoration-dotted/, 'the sniffed one is drawn as a guess');
  assert.doesNotMatch(cls['.html'] || '', /decoration-dotted/, 'the stated one is drawn plain');
});

test('a rename clears the guess, since the name is then authored', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': PS_SCRIPT } }));
  assert.equal(data.localItems[0].sniffed, true);
  data.startRename(data.localItems[0]);
  data.renameDraft = 'deploy.ps1';
  data.commitRename();
  assert.equal(data.localItems[0].sniffed, false,
    'leaving it on would tell a reader their own correction was still a sniff');
});

test('a JSON array of records opens as a table; any other JSON stays a tree', () => {
  const rowsJson = JSON.stringify([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  const bundle = JSON.stringify({ fn: 'H4sI', data: 'H4sI' });
  const m = (content) => window.ViewRegistry.READ_MODE({ ext: 'json', content });
  assert.equal(m(rowsJson), 'table');
  assert.equal(m(bundle), 'tree', 'a workbench bundle is an object, not rows');
  assert.equal(m('[1,2,3]'), 'tree', 'scalars have no columns to lay out');
  assert.equal(m('[]'), 'tree', 'an empty array has nothing to show as a table');
  assert.equal(m('{ not json'), 'tree', 'invalid JSON is not where a parse error is reported');
});

// ---- the transform door: what the workbench could take ---------------------
//
// Recognition rides the NAME the intake already chose, so these lean on the
// naming tests above rather than re-sniffing. The pixels and the mount live in
// tools/render/scenarios/stage-transform-chip.mjs, which is where a missing
// Tabulator shows up (the tool's table hook returns silently without it).

const BUNDLE = JSON.stringify({ fn: 'H4sIAAAA', data: 'H4sIAAAB', meta: { combine: true } });

const kindOfPaste = (text) => {
  reset();
  window.StageIntake.take({ text, size: text.length });
  return window.StageIntake.transformKindOf(data.localItems[0]);
};

test('a workbench bundle is recognized exactly, by the key that defines one', () => {
  assert.equal(kindOfPaste(BUNDLE), 'bundle');
  assert.equal(kindOfPaste(JSON.stringify({ fn_tidy: 'H4sI', data_tidy: 'H4sI' })), 'bundle',
    'a multi-tab bundle names its functions fn_<tab>');
  assert.equal(kindOfPaste(JSON.stringify({ fn: 42 })), '',
    'the key has to hold a source string, not merely exist');
  assert.equal(kindOfPaste(JSON.stringify({ name: 'x', size: 2 })), '',
    'an ordinary JSON object is not a bundle');
});

test('rows are recognized in all three shapes the workbench eats', () => {
  assert.equal(kindOfPaste('a,b\n1,2\n3,4'), 'rows', 'CSV');
  assert.equal(kindOfPaste('a\tb\n1\t2\n3\t4'), 'rows', 'TSV');
  assert.equal(kindOfPaste(JSON.stringify([{ a: 1 }, { a: 2 }])), 'rows', 'a JSON row array');
});

test('a rows function is a transform, and other JavaScript is not', () => {
  assert.equal(kindOfPaste('rows => rows.filter(r => r.a)'), 'fn');
  assert.equal(kindOfPaste('function tidy(rows) { return rows }'), 'fn');
});

test('a pasted bundle opens in the tool, since reading it shows gzip strings', async () => {
  reset();
  let opened = null;
  const real = data.openTransform.bind(data);
  data.openTransform = async (it) => { opened = it; };
  window.StageIntake.take({ text: BUNDLE, size: BUNDLE.length });
  window.StageIntake.focus(data.localItems[0]);
  await tick(3);
  assert.ok(opened, 'focus routed it to the workbench');
  assert.match(opened.name, /\.json$/);
  assert.equal(data.reader, null, 'and did not also open the reader on it');
  data.openTransform = real;
});

test('every other arrival still opens on its own content', async () => {
  reset();
  let opened = null;
  const real = data.openTransform.bind(data);
  data.openTransform = async (it) => { opened = it; };
  const csv = 'a,b\n1,2\n3,4';
  window.StageIntake.take({ text: csv, size: csv.length });
  window.StageIntake.focus(data.localItems[0]);
  await tick(3);
  assert.equal(opened, null, 'rows are worth looking at, so the reader is the right first look');
  assert.ok(data.reader, 'the reader opened instead');
  data.openTransform = real;
});

test('prose, markdown and an empty stage offer nothing', () => {
  assert.equal(kindOfPaste('# A note\n\nJust some prose.'), '');
  assert.equal(kindOfPaste('one, two, three\nand a second line'), '');
  reset();
  assert.deepEqual(plain_(data.transformables), []);
});

test('a ref is never transform-shaped, since it has no text to hand over', () => {
  reset();
  window.StageIntake.take({ text: 'me/a:data/rows.csv', size: 18 });
  assert.equal(data.refItems.length, 1, 'it staged as a ref, not a local file');
  assert.deepEqual(plain_(data.transformables), [],
    'the chip hands over held text, and a ref holds none until it is fetched');
});

test('the chip row names one item per qualifying local, and skips the rest', () => {
  reset();
  for (const t of ['a,b\n1,2\n3,4', 'rows => rows', '# just a note']) {
    window.StageIntake.take({ text: t, size: t.length });
  }
  const chips = data.transformables;
  assert.equal(chips.length, 2, 'the note is not offered');
  assert.deepEqual(plain_(chips.map(c => c.label).sort()), ['a transform', 'rows']);
  assert.ok(chips.every(c => c.key && c.title.includes(c.item.name)),
    'each chip carries a stable key and says what it would open');
});

// ── What is inside: the links ──────────────────────────────────────────────
//
// The third kind of offer, and the reason it exists: a copy off a web page
// splits across two clipboard flavors, with every link's LABEL in text/plain
// and every link's ADDRESS in text/html, so both were stageable and neither
// answered "just give me the links". These cover the reading (what counts as a
// link, and what the same address twice counts as), the source set (the offers
// as well as the stage, which is what makes the case one tap), and the artifact
// it stages.

const IN = () => window.StageIntake;

const PAGE = `<p>Read <a href="https://example.com/a">the first</a> and
  <a href="/docs/b">a relative one</a>, skip <a href="#top">this anchor</a>
  and <a href="javascript:void(0)">this handler</a>, mail
  <a href="mailto:x@y.z">someone</a>.</p>`;

test('an html paste gives up its hrefs, and the noise stays behind', () => {
  const links = IN().linksOf(PAGE, 'p.html');
  assert.deepEqual(plain_(links), [
    { text: 'the first', url: 'https://example.com/a' },
    { text: 'a relative one', url: '/docs/b' },
    { text: 'someone', url: 'mailto:x@y.z' },
  ], 'an in-page anchor and a javascript: handler are not addresses worth carrying out');
});

test('a relative href stays relative, since a paste carries no page to resolve against', () => {
  const links = IN().linksOf('<a href="/docs/b">b</a>', 'p.html');
  assert.equal(links[0].url, '/docs/b', 'inventing an origin here would be a guess presented as a fact');
});

test('one row per address, and the first label wins', () => {
  const html = '<a href="/x">Home</a><a href="/x"><img></a><a href="/y">Y</a>';
  const links = IN().linksOf(html, 'p.html');
  assert.equal(links.length, 2, 'a masthead repeated on every copy is not two findings');
  assert.equal(links[0].text, 'Home', 'the repeat is often an icon with no text at all');
});

test('an address seen first without a label takes one from a later repeat', () => {
  const links = IN().linksOf('<a href="/x"><img></a><a href="/x">Home</a>', 'p.html');
  assert.deepEqual(plain_(links), [{ text: 'Home', url: '/x' }]);
});

test('text that is not markup is read as markdown and prose', () => {
  const md = 'See [the docs](https://example.com/d) and https://example.com/bare, then\n<https://example.com/angle>.';
  assert.deepEqual(plain_(IN().linksOf(md, 'notes.md')), [
    { text: 'the docs', url: 'https://example.com/d' },
    { text: '', url: 'https://example.com/bare' },
    { text: '', url: 'https://example.com/angle' },
  ], 'a markdown link is one row, not a labelled one plus a bare one for the same address');
});

test('only the four text kinds are read for links, so a script is left alone', () => {
  const s = 'const u = "https://example.com/x"';
  assert.deepEqual(plain_(IN().linksOf(s, 'a.js')), [], 'a URL in a comment is not a link somebody asked for');
  assert.deepEqual(plain_(IN().linksOf('a,b\nhttps://example.com/x,2', 'a.csv')), [],
    'a CSV is the transform chip\'s, and reading it twice would be two answers to one item');
});

test('the artifact is named for its source and quotes what CSV must quote', () => {
  assert.equal(IN().linksName('2026-08-28-paste.html'), '2026-08-28-paste-links.csv');
  assert.equal(IN().linksName('noext'), 'noext-links.csv');
  const csv = IN().linksCsv([{ text: 'Budget, revised', url: 'https://x/y' },
                             { text: 'He said "no"', url: 'https://x/z' }]);
  assert.equal(csv, 'text,url\n"Budget, revised",https://x/y\n"He said ""no""",https://x/z',
    'link text is prose, and an unquoted comma turns two columns into a ragged three');
});

test('the links menu reads the html the paste did not stage', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': 'the first a relative one someone', 'text/html': PAGE },
  }));
  assert.match(data.localItems[0].name, /\.txt$/, 'text/plain is still what a paste stages');
  assert.deepEqual(plain_(IN().linksIn(data.localItems[0])), [],
    'and it carries every label and not one address, which is the whole complaint');
  const rows = data.pasteLinks;
  assert.equal(rows.length, 1, 'the flavor is the source, so no tap is spent staging markup nobody wanted');
  assert.equal(rows[0].n, 3);
  assert.equal(rows[0].from, 'html', 'the row says which flavor it read');
  assert.match(rows[0].dest, /-links\.csv$/);
});

test('the extraction stages a table and opens the reader on it', async () => {
  reset();
  await paste(fakeCd({ types: ['text/html'], data: { 'text/html': PAGE } }));
  const row = data.pasteLinks[0];
  data.extractLinks(row);
  await tick(3);
  const made = data.localItems.find(it => it.name === row.dest);
  assert.ok(made, 'the table is staged under the name the row named');
  assert.equal(made.text.split('\n').length, 4, 'a header and three links');
  assert.equal(made.sniffed, false, 'the name is authored, not the sniff\'s opinion');
  assert.ok(data.reader, 'the table is what was asked for, not a row to go and find');
});

test('a derived option appears only where there is something to read out', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': 'Just some prose, no addresses.' } }));
  assert.deepEqual(plain_(data.pasteLinks), [],
    'an empty option is furniture, so the pill does not draw at all');
});

// ---- looking inside a flavor before you take it ----------------------------
//
// The pills said which formats a copy held and could not say which one you
// want: `html 4.1 KB` against `txt 192 B` is a size, and the only thing
// separating them was a title attribute, which is nothing at all on a phone.

test('the eye shows the bytes, and a second tap closes it', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': 'the first a relative one someone', 'text/html': PAGE },
  }));
  const html = data.offers.find(o => data.flavorLabel(o) === 'html');
  assert.equal(data.peeked, null, 'nothing is open until asked');
  data.peek('flavor', html);
  assert.equal(data.peeked.name, html.name);
  assert.match(data.peeked.text, /<a href="https:\/\/example\.com\/a">/,
    'the markup itself, which is what tells this flavor from its plain-text twin');
  assert.equal(data.peeking('flavor', html), true);
  data.peek('flavor', html);
  assert.equal(data.peeked, null, 'the same eye is the way out');
});

test('one panel at a time, since two open previews is a comparison nobody asked for', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': 'plain words', 'text/html': PAGE },
  }));
  data.peek('flavor', data.offers.find(o => data.flavorLabel(o) === 'html'));
  data.peek('flavor', data.offers.find(o => data.flavorLabel(o) === 'txt'));
  assert.match(data.peeked.name, /\.txt$/, 'the second open replaces the first');
  assert.equal(data.offers.filter(o => data.peeking('flavor', o)).length, 1);
});

test('a long flavor is cut, and says so rather than running past the staged list', async () => {
  reset();
  const long = 'x'.repeat(5000);
  await paste(fakeCd({ types: ['text/html'], data: { 'text/html': long } }));
  data.peek('flavor', data.offers[0]);
  assert.equal(data.peeked.text.length, data.PEEK_CHARS + 2, 'the cut plus a newline and an ellipsis');
  assert.ok(data.peeked.text.endsWith('…'));
});

test('an image previews as an image, since describing a screenshot is not a preview', async () => {
  reset();
  const made = [];
  window.URL.createObjectURL = (f) => { made.push(f); return 'blob:test/' + made.length; };
  window.URL.revokeObjectURL = () => {};
  await paste(fakeCd({ types: ['Files'], files: [fakeFile('image.png', 'image/png', 4096)] }));
  data.peek('flavor', data.offers[0]);
  assert.equal(data.peeked.img, 'blob:test/1');
  assert.equal(data.peeked.text, undefined, 'the bytes are drawn, not printed');
  data.peeked; data.peeked;
  assert.equal(made.length, 1, 'the URL is cached, so re-reading the panel does not mint another');
});

test('the links option previews the table it would make', async () => {
  reset();
  await paste(fakeCd({ types: ['text/html'], data: { 'text/html': PAGE } }));
  const t = data.pasteLinks[0];
  data.peek('links', t);
  assert.equal(data.peeked.name, t.dest);
  assert.match(data.peeked.text, /^text,url\n/, 'the csv itself, so the rows can be read before staging them');
  data.extractLinks(t);
  await tick(3);
  assert.equal(data.peeked, null, 'making it closes the panel: the answer is on the stage now');
});

test('a new paste closes the panel it opened over the old one', async () => {
  reset();
  await paste(fakeCd({ types: ['text/html'], data: { 'text/html': PAGE } }));
  data.peek('flavor', data.offers[0]);
  assert.ok(data.peeked);
  data.offers = [];
  assert.equal(data.peekKey, '', 'a key left standing would point at a paste that is gone');
});

test('the reader\'s header reads links out of a staged file, however it arrived', () => {
  reset();
  IN().take({ text: PAGE, name: 'page.html' });
  assert.equal(IN().linksIn(data.localItems[0]).length, 3,
    'the bar is about the paste; a dropped or fetched file keeps its route through the reader');
  assert.equal(IN().linksName('page.html'), 'page-links.csv');
});

test('a ref is never a source, since it has no text until it is fetched', () => {
  reset();
  IN().take({ text: 'me/a:docs/page.html', size: 18 });
  assert.equal(data.refItems.length, 1);
  assert.deepEqual(plain_(IN().linksIn(data.refItems[0])), []);
});

test('prose with a stray tab is not a grid', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': 'a note\twith a tab\nand a second line' } }));
  assert.match(data.localItems[0].name, /\.txt$/, 'the tab counts differ, so it is text');
});

test('tapping an unticked flavor stages it, and the chip ticks', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': TSV, 'text/html': HTML },
  }));
  assert.equal(data.localItems.length, 1);
  const html = data.offers.find(o => data.flavorLabel(o) === 'html');
  await data.toggleFlavor(html);
  assert.equal(data.localItems.length, 2);
  assert.equal(data.flavorStaged(html), true, 'the chip is read off the stage, so it follows on its own');
  assert.equal(data.localItems.find(it => /\.html$/.test(it.name)).text, HTML,
    'the html flavor is staged as html, not sniffed from its first characters');
});

test('tapping a ticked flavor takes it off, which is how you choose the other one', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': TSV, 'text/html': HTML },
  }));
  const tsv = data.offers.find(o => data.flavorLabel(o) === 'tsv');
  await data.toggleFlavor(data.offers.find(o => data.flavorLabel(o) === 'html'));
  await data.toggleFlavor(tsv);
  assert.deepEqual(plain_(data.localItems.map(it => it.name.split('.').pop())), ['html'],
    'the html instead of the text, which used to mean staging both and hunting one down');
  assert.equal(data.offers.length, 2, 'both stay on the bar: the paste still carried them');
  assert.equal(data.flavorStaged(tsv), false);
});

test('a paste into a form field keeps its native paste, and offers the rest', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html', 'Files'],
    data: { 'text/plain': TSV, 'text/html': HTML },
    files: [fakeFile('image.png', 'image/png', 4096)],
  }), { tagName: 'INPUT' });
  assert.equal(data.localItems.length, 0, 'the field pastes its own text; nothing is stolen');
  assert.deepEqual(plain_(data.offers.map(o => data.flavorLabel(o)).sort()), ['html', 'png', 'tsv'],
    'what a text field cannot hold is offered, and what it took is still named');
  assert.equal(data.offers.every(o => !data.flavorStaged(o)), true,
    'nothing is ticked, because the field took the text and the stage took nothing');
});

test('ref lines still stage as refs, through the flavor path', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': 'me/a:lib/x.js\nme/b@dev:docs/y.md' } }));
  assert.equal(data.refItems.length, 2);
  assert.equal(data.localItems.length, 0);
});

test('the same paste twice is quiet, because the chips just show as ticked', async () => {
  reset();
  const cd = fakeCd({ types: ['text/plain', 'text/html'], data: { 'text/plain': TSV, 'text/html': HTML } });
  await paste(cd);
  await data.toggleFlavor(data.offers.find(o => data.flavorLabel(o) === 'html'));
  await paste(cd);
  assert.equal(data.offers.every(o => data.flavorStaged(o)), true,
    'the bar says both are on the stage rather than going blank, which read as "nothing here"');
  assert.equal(data.localItems.length, 3,
    'the primary is re-staged, which every repeated paste has always done: the old bar filter '
    + 'kept only the BAR quiet, never the stage');
});

// ---- the paste fold is the intake's, so it works with no bench mounted ----
//
// The point of the move (2026-08-18): a paste on any view has to reach the
// stage, and the bench mounts on the first visit to the Stage. These drive
// window.StageIntake directly rather than the component, which is what a host
// on another view can actually call.

test('takePaste reports what landed and what the paste also carried', async () => {
  reset();
  const r = await window.StageIntake.takePaste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': TSV, 'text/html': HTML },
  }));
  assert.equal(r.added.length, 1, 'the primary flavor lands');
  assert.match(r.added[0].name, /\.tsv$/);
  assert.equal(r.offers.length, 2, 'and the caller learns everything the copy held');
  assert.deepEqual(plain_(r.offers.map(o => o.name.split('.').pop()).sort()), ['html', 'tsv'],
    'a flavor is named on the way out, not by the bench');
});

test('the offers a paste leaves ride the store, so a bench that mounts later finds them', async () => {
  reset();
  await window.StageIntake.takePaste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': TSV, 'text/html': HTML },
  }));
  assert.equal(store.stageOffers.length, 2, 'the store holds the bar, not the component');
  assert.equal(data.offers.length, 2, 'and the component reads it through');
  data.dismissOffers();
  assert.equal(store.stageOffers.length, 0, 'clearing the bar clears the store');
});

test('a paste into a field stages nothing, and says so rather than silently taking', async () => {
  reset();
  const r = await window.StageIntake.takePaste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': TSV, 'text/html': HTML },
  }), { editable: true });
  assert.equal(r.added.length, 0, 'the field keeps its own paste');
  assert.equal(r.native, true, 'and the caller is told to leave the event alone');
  assert.equal(r.offers.length, 2, 'the bar still says what the copy held');
  assert.equal(r.offers.some(o => /\.html$/.test(o.name)), true, 'including what the field could not hold');
});

test('offer: false reads the clipboard without touching the bar', async () => {
  reset();
  store.stageOffers = [];
  const r = await window.StageIntake.takePaste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': TSV, 'text/html': HTML },
  }), { offer: false });
  assert.equal(r.offers.length, 2, 'the caller still learns what was carried');
  assert.equal(store.stageOffers.length, 0, 'but nothing was written where a bar would draw it');
});

test('an empty clipboard folds to nothing rather than staging a blank', async () => {
  reset();
  const r = await window.StageIntake.takePaste(fakeCd({ types: [], data: {} }));
  assert.equal(r.added.length, 0);
  assert.equal(r.offers.length, 0);
  assert.equal(store.stage.length, 0);
});

test('takeFlavor stages one flavor under its own name, refs included', async () => {
  reset();
  await window.StageIntake.takeFlavor({ kind: 'text', type: 'text/html', text: HTML, size: HTML.length, name: 'x.html' });
  assert.match(data.localItems[0].name, /\.html$/, 'a named flavor keeps its name');
  reset();
  await window.StageIntake.takeFlavor({ kind: 'text', type: 'text/plain', text: 'me/a:lib/x.js', size: 13 });
  assert.equal(data.refItems.length, 1, 'plain text still parses as refs');
});

// ---- a pasted image is a file, not an unviewable binary -----------------

test('a local image reads from its own bytes, with no repo behind it', async () => {
  reset();
  // The 1x1 PNG, as the bytes a paste or a drop hands over.
  const png = Uint8Array.from(atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  ), c => c.charCodeAt(0));
  store.stage = [{ local: true, id: 210, name: 'image.png', path: 'image.png', size: png.length, type: 'image/png', isText: false, bytes: png }];
  await data.view(data.localItems[0]);
  await shown();
  assert.equal(data.reader.note, '', 'an image is not refused as a binary');
  const vwr = readerViewer();
  assert.match(vwr.content, /^data:image\/png;base64,/, 'the bytes ride as a data URI, the one form a repo-less file can supply');
  data.reader = null;
});

test('the data URI keys on the extension, so a rename changes what it renders as', () => {
  const bytes = Uint8Array.from([1, 2, 3]);
  assert.match(data.dataUri({ name: 'a.png', bytes }), /^data:image\/png;/);
  assert.match(data.dataUri({ name: 'a.svg', bytes }), /^data:image\/svg\+xml;/);
  // A workbook carried a data URI from 2026-08-15, when the viewer gained a
  // mode that can draw one. This assertion read the other way until then, which
  // is the point of keying on `mimeFor`: the set that reads here is the set
  // the viewer can render, and it moves when that does.
  assert.match(data.dataUri({ name: 'a.xlsx', bytes }), /^data:application\/vnd\.openxml/);
  assert.equal(data.dataUri({ name: 'a.zip', bytes }), '', 'a binary the viewer cannot render still says so');
  assert.equal(data.dataUri({ name: 'a.png' }), '', 'no bytes, no URI');
});

test('a binary with no mode to draw it is still refused, and says which', async () => {
  reset();
  store.stage = [{ local: true, id: 211, name: 'bundle.zip', path: 'bundle.zip', size: 2048, type: '', isText: false, bytes: Uint8Array.from([1, 2]) }];
  await data.view(data.localItems[0]);
  await shown();
  assert.match(data.reader.note, /^Binary/);
  data.reader = null;
});

test('a dropped workbook reads rather than being refused', async () => {
  // The case the refusal above used to cover. A .xlsx reaching the stage as
  // local bytes now goes to the viewer, which is what makes naming a paste
  // `.xlsx` do something.
  reset();
  store.stage = [{ local: true, id: 212, name: 'book.xlsx', path: 'book.xlsx', size: 2048, type: '', isText: false, bytes: Uint8Array.from([1, 2]) }];
  await data.view(data.localItems[0]);
  await shown();
  assert.equal(data.reader.note, '', 'not refused as a binary');
  assert.match(readerViewer().content, /^data:application\/vnd\.openxml/);
  data.reader = null;
});

// ---- renaming a local item ----------------------------------------------
// The name a paste gets is sniffed, so the rename is what makes a wrong sniff
// correctable. It has to reach the deposit, since that is the field's real
// consumer, and it has to stay off ref items, whose path is their identity.

test('a rename reaches both fields a local item is read through', () => {
  reset();
  const it = { local: true, id: 200, name: '2026-08-14-paste.txt', path: '2026-08-14-paste.txt', size: 4, isText: true, text: '# hi' };
  store.stage = [it];
  data.startRename(data.localItems[0]);
  assert.equal(data.renameId, 200);
  assert.equal(data.renameDraft, '2026-08-14-paste.txt', 'the draft opens on the current name');
  data.renameDraft = 'notes.md';
  data.commitRename();
  assert.equal(data.localItems[0].name, 'notes.md');
  assert.equal(data.localItems[0].path, 'notes.md', 'the reader and diff labels read path');
  assert.equal(data.renameId, null);
});

test('a renamed local file deposits under its new name', async () => {
  reset();
  calls.length = 0;
  store.stage = [{ local: true, id: 201, name: '2026-08-14-paste.txt', path: '2026-08-14-paste.txt', size: 4, isText: true, text: '# hi' }];
  data.startRename(data.localItems[0]);
  data.renameDraft = 'docs/notes.md';
  data.commitRename();
  data.destSpec = 'me/dest:pkg';
  await data.send();               // arm
  await data.send();               // deposit
  const txt = calls.find(c => c.kind === 'save');
  assert.equal(txt.path, 'pkg/docs/notes.md', 'a slash in the name is a subpath under the destination');
});

test('a name that cleans to nothing leaves the item alone, and so does Escape', () => {
  reset();
  store.stage = [{ local: true, id: 202, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' }];
  data.startRename(data.localItems[0]);
  data.renameDraft = '  /../  ';
  data.commitRename();
  assert.equal(data.localItems[0].name, 'n.txt', 'nothing usable was typed');

  data.startRename(data.localItems[0]);
  data.renameDraft = 'other.txt';
  data.cancelRename();
  assert.equal(data.localItems[0].name, 'n.txt', 'Escape drops the draft');
  assert.equal(data.renameId, null);
});

test('commit is idempotent, since Enter commits and the blur behind it fires too', () => {
  reset();
  store.stage = [{ local: true, id: 203, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' }];
  data.startRename(data.localItems[0]);
  data.renameDraft = 'first.txt';
  data.commitRename();
  data.commitRename();             // the blur
  assert.equal(data.localItems[0].name, 'first.txt');
  assert.equal(data.localItems.length, 1);
});

test('a ref item cannot be renamed: its path is where it came from', () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  data.startRename(data.refItems[0]);
  assert.equal(data.renameId, null, 'the row offers no rename, and the call refuses one');
  assert.equal(data.refItems[0].path, 'lib/x.js');
});

test('renaming under an open reader re-labels it', async () => {
  reset();
  const it = { local: true, id: 204, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' };
  store.stage = [it];
  await data.view(data.localItems[0]);
  await shown();
  assert.equal(data.reader.name, 'n.txt');
  data.startRename(data.localItems[0]);
  data.renameDraft = 'renamed.md';
  data.commitRename();
  assert.equal(data.reader.name, 'renamed.md');
  data.reader = null;
});

test('groups covers only refs; local items render on their own', () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'x.js' },
    { local: true, id: 91, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' },
  ];
  assert.equal(data.groups.length, 1);
  assert.equal(data.groups[0].key, 'me/a');
  assert.equal(data.localItems.length, 1);
});

// ---- one deposit: refs via copyTo, local bytes via saveBytes/save --------

test('send deposits refs through copyTo and local files through save/saveBytes', async () => {
  reset();
  calls.length = 0;
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { local: true, id: 92, name: 'a.bin', path: 'a.bin', size: 2, isText: false, bytes: new Uint8Array([9, 9]) },
    { local: true, id: 93, name: 'note.txt', path: 'note.txt', size: 2, isText: true, text: 'yo' },
  ];
  data.destSpec = 'me/dest:pkg';

  await data.send();               // first tap arms
  assert.equal(calls.length, 0, 'arming writes nothing');
  await data.send();               // second tap deposits

  const copy = calls.find(c => c.kind === 'copyTo');
  assert.equal(copy.from, 'me/a');
  assert.equal(copy.dest.repo, 'me/dest');
  assert.equal(copy.dest.dir, 'pkg');
  assert.deepEqual(plain_(copy.paths), ['lib/x.js']);

  const bin = calls.find(c => c.kind === 'saveBytes');
  assert.equal(bin.repo, 'me/dest');
  assert.equal(bin.path, 'pkg/a.bin');
  assert.equal(bin.bytes[0], 9);

  const txt = calls.find(c => c.kind === 'save' && c.path === 'pkg/note.txt');
  assert.equal(txt.repo, 'me/dest');
  assert.equal(txt.value, 'yo');
});

test('an empty dir deposits local files at the repo root', async () => {
  reset();
  calls.length = 0;
  store.stage = [{ local: true, id: 94, name: 'top.txt', path: 'top.txt', size: 1, isText: true, text: 'x' }];
  data.destSpec = 'me/dest';
  await data.send();               // arm
  await data.send();               // deposit
  const txt = calls.find(c => c.kind === 'save');
  assert.equal(txt.path, 'top.txt', 'no dir prefix at root');
});

test('a local-only stage still mints: the text rides the fragment, gzipped', async () => {
  reset();
  clipWrites.length = 0;
  store.stage = [{ local: true, id: 95, name: 'draft.html', path: 'draft.html',
                   size: 20, isText: true, text: '<!doctype html><p>hi' }];
  data.linkCopied = false;
  await data.copyLink();
  assert.equal(data.linkCopied, true, 'a paste is shareable, not a dead end');
  const url = clipWrites[0];
  assert.match(url, /#gz=/, 'no empty #stage= key when there are no refs');
  const back = await window.StageLink.decodeLocals(window.StageLink.parseLink(url).gz);
  assert.deepEqual(plain_(back), [{ name: 'draft.html', text: '<!doctype html><p>hi' }]);
});

test('a local BINARY still cannot ride, and the refusal says which', async () => {
  reset();
  store.stage = [{ local: true, id: 96, name: 'a.bin', path: 'a.bin', size: 2,
                   isText: false, bytes: new Uint8Array([1, 2]) }];
  data.linkCopied = false;
  await data.copyLink();
  assert.equal(data.linkCopied, false);
});

test('refs and pasted text ride one link together', async () => {
  reset();
  clipWrites.length = 0;
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { local: true, id: 97, name: 'note.md', path: 'note.md', size: 5, isText: true, text: '# hi' },
  ];
  await data.copyLink();
  const link = window.StageLink.parseLink(clipWrites[0]);
  assert.deepEqual(plain_(link.items), [{ repo: 'me/a', ref: '', path: 'lib/x.js' }]);
  const back = await window.StageLink.decodeLocals(link.gz);
  assert.deepEqual(plain_(back), [{ name: 'note.md', text: '# hi' }]);
});

test('a paste past the link budget reports the overflow instead of minting', async () => {
  // Incompressible by construction: a seeded LCG over a wide alphabet, so the
  // test measures the BUDGET rather than gzip's appetite for repetition. (A
  // first cut used i % 97, which gzip crushed to well under the cap.)
  // Park-Miller, because the obvious LCG is a trap in JS: seed * 1103515245
  // exceeds 2^53, so the sequence degenerates and gzip found 10:1 on it. This
  // multiplier keeps every product inside safe-integer range, and the result
  // actually resists compression, which is what the budget assertion needs.
  let seed = 12345;
  const noise = Array.from({ length: 40000 }, () => {
    seed = (seed * 48271) % 2147483647;
    return String.fromCharCode(33 + (seed % 94));
  }).join('');
  const big = [{ local: true, isText: true, name: 'big.txt', text: noise }];
  await assert.rejects(() => window.StageLink.encodeLocals(big), (e) => {
    assert.equal(e.overflow, true);
    assert.match(e.message, /over the \d+K a link can carry/);
    return true;
  });
});

test('loadRecent merges root repos newest-first, tagging each file with its repo', async () => {
  reset();
  store.repo = 'me/open';
  store.config = null;
  window.__shell = { estateRepos: [{ repo: 'me/fav' }] };
  await data.loadRecent(true);
  delete window.__shell;
  assert.deepEqual(plain_(data.recent.map(r => [r.repo, r.path])), [
    ['me/open', 'lib/new.js'],
    ['me/fav', 'docs/mid.md'],
    ['me/open', 'old.md'],
  ]);
});

test('toggleFile stages a file and unstages it on the second tap', () => {
  reset();
  const it = { repo: 'me/open', path: 'lib/new.js', date: '2026-07-18T10:00:00Z' };
  assert.equal(data.pathStaged(it), false);
  data.toggleFile(it);
  assert.deepEqual(plain_(data.refItems), [{ repo: 'me/open', ref: '', path: 'lib/new.js' }]);
  assert.equal(data.pathStaged(it), true);
  data.toggleFile(it);
  assert.equal(data.refItems.length, 0);
});

// ── Add: three panes ───────────────────────────────────────────────────────
// Browse, Recent, and Search share one corpus and one outcome but are not one
// question. They were briefly folded into a single query box; that put recent
// files in the same list as the repos you navigate, which reads as neither a
// place list nor an event list. Each pane now owns its own state and reads
// none of the others', and these hold that separation, plus the one thing the
// one-box build got right: Browse and Search share a tree cache.

test('Browse lists repos, then descends; never a recent file', async () => {
  reset();
  store.repo = 'me/open';
  store.config = null;
  window.__shell = { estateRepos: [{ repo: 'me/fav' }] };
  await data.loadRecent(true);
  data.addTab = 'browse';
  data.addScope = null;

  const roots = plain_(data.addRows());
  assert.deepEqual(roots.map(r => r.repo), ['me/open', 'me/fav']);
  assert.equal(roots.every(r => r.kind === 'repo'), true,
    'no recent files mixed into the navigation list');

  data.trees = { 'me/open': { paths: ['lib/a.js', 'lib/deep/b.js', 'README.md'], truncated: false } };
  await data.enter('me/open', '', '');
  assert.deepEqual(plain_(data.addRows()).map(r => [r.kind, r.label]),
    [['dir', 'lib'], ['file', 'README.md']], 'folders before files');
  // One recursive read answers every level, so descending costs no more calls.
  await data.enter('me/open', '', 'lib');
  assert.deepEqual(plain_(data.addRows()).map(r => [r.kind, r.label]),
    [['dir', 'deep'], ['file', 'a.js']]);
  data.addUp(-1);
  assert.equal(data.addScope, null, 'the house crumb returns to the roots');

  data.trees = {}; data.addTab = 'recent';
  delete window.__shell;
});

test('Recent lists the sweep and nothing else, filtered by its own badges', async () => {
  reset();
  store.repo = 'me/open';
  store.config = null;
  window.__shell = { estateRepos: [{ repo: 'me/fav' }] };
  await data.loadRecent(true);
  data.addTab = 'recent';
  data.pillSel = '';

  const rows = plain_(data.addRows());
  assert.equal(rows.every(r => r.kind === 'file'), true, 'no repos to enter in here');
  assert.deepEqual(rows.map(r => r.path), ['lib/new.js', 'docs/mid.md', 'old.md']);

  assert.deepEqual(plain_(data.repoPills()), [{ repo: 'me/open', n: 2 }, { repo: 'me/fav', n: 1 }]);
  data.togglePill('me/fav');
  assert.deepEqual(plain_(data.addRows()).map(r => r.repo), ['me/fav'], 'single-select');
  data.togglePill('me/open');
  assert.deepEqual(plain_(data.addRows()).map(r => r.repo), ['me/open', 'me/open'], 'switches');
  data.togglePill('me/open');
  assert.equal(data.addRows().length, 3, 'tapping the selected badge returns to all');

  delete window.__shell;
});

test('Search matches filename-contains across the trees, basename first', async () => {
  reset();
  data.addTab = 'search';
  data.trees = {
    'me/open': { paths: ['lib/alpha.js', 'docs/notes.md', 'src/x-alpha-y.js'], truncated: false },
  };
  store.repo = 'me/open';
  store.config = null;

  data.addQ = 'x';
  assert.equal(data.addRows().length, 0, 'under two characters, nothing is attempted');
  assert.match(data.addEmpty, /two characters/);

  data.addQ = 'alpha';
  assert.deepEqual(plain_(data.addRows()).map(r => r.path), ['lib/alpha.js', 'src/x-alpha-y.js'],
    'the basename-prefix hit outranks the one that merely contains it');
  assert.equal(data.addRows().every(r => r.kind === 'file'), true, 'files only');

  data.addQ = 'zzzzz';
  assert.equal(data.addEmpty, 'No matching files.');

  data.addQ = ''; data.trees = {}; data.addTab = 'recent';
});

test('a leading @ is eaten, not matched', () => {
  reset();
  data.addTab = 'search';
  data.trees = { 'me/open': { paths: ['lib/alpha.js'], truncated: false } };
  store.repo = 'me/open';
  store.config = null;
  // '@' is the sigil mention.js needs mid-prose; this field is already a path
  // finder, so matching it literally only ever produced an empty list.
  data.addQ = '@alpha';
  assert.equal(data.addQuery, 'alpha');
  assert.deepEqual(plain_(data.addRows()).map(r => r.path), ['lib/alpha.js']);
  data.addQ = ''; data.trees = {}; data.addTab = 'recent';
});

test('Browse and Search share one tree cache, so neither refetches the other\'s', async () => {
  reset();
  store.repo = 'me/open';
  store.config = null;
  window.__shell = { estateRepos: [{ repo: 'me/fav' }] };
  data.trees = {};

  // Joined, not deep-equal: the array is built in the jsdom realm, so its
  // prototype is not this one's and deepStrictEqual fails on identity.
  assert.equal(data.addUnread().join(','), 'me/open,me/fav', 'nothing read yet');
  // Browsing one repo pays for it...
  await data.enter('me/open', '', '');
  assert.equal(data.addUnread().join(','), 'me/fav', 'and Search now owes only the rest');
  // ...and tapping Search reads what is left, not what is already in hand.
  await data.loadAllTrees();
  assert.equal(data.addUnread().join(','), '');

  data.addScope = null; data.trees = {}; data.addTab = 'recent';
  delete window.__shell;
});

test('diffLines marks adds and dels around a trimmed common middle', () => {
  const rows = data.diffLines('a\nb\nc\nd', 'a\nB\nc\nd');
  assert.deepEqual(plain_(rows), [
    { t: 'ctx', line: 'a' },
    { t: 'del', line: 'b' },
    { t: 'add', line: 'B' },
    { t: 'ctx', line: 'c' },
    { t: 'ctx', line: 'd' },
  ]);
});

test('diffLines on identical text is all context', () => {
  const rows = data.diffLines('x\ny', 'x\ny');
  assert.ok(rows.every(r => r.t === 'ctx'));
  assert.equal(rows.length, 2);
});

test('runDiff resolves a local text item against a ref item', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { local: true, id: 97, name: 'pasted.txt', path: 'pasted.txt', size: 4, isText: true, text: 'CONTENT me/a:lib/x.js\nextra' },
  ];
  data.diffA = 0; data.diffB = 1;
  await data.runDiff();
  assert.ok(data.diffRows, 'diff produced');
  assert.deepEqual(plain_(data.diffRows.filter(r => r.t !== 'ctx')), [{ t: 'add', line: 'extra' }]);
  assert.equal(data.diffStat, '+1 \u22120');
});

test('diffHandoff builds the Diff page address from the staged pair', () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { repo: 'me/b', ref: 'feat/y', path: 'docs/z.md' },
  ];
  data.diffA = 0; data.diffB = 1;
  const u = new URL(data.diffHandoff);
  assert.match(u.pathname, /\/diff-tool\.html$/, 'points at the Diff page');
  assert.equal(u.searchParams.get('a'), 'me/a:lib/x.js');
  assert.equal(u.searchParams.get('b'), 'me/b@feat/y:docs/z.md');

  // Each side is the staged address, nothing more. The per-side ref override
  // is gone: the version diff (one path, two refs) belongs on the Diff page,
  // which takes an owner/repo[@ref]:path per side and browses for it, and this
  // handoff is how a staged pair gets there.
});

test('diffHandoff hides when either side is a local file', () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { local: true, id: 98, name: 'pasted.txt', path: 'pasted.txt', size: 4, isText: true, text: 'hi' },
  ];
  data.diffA = 0; data.diffB = 1;
  assert.equal(data.diffHandoff, '', 'a dropped file has no address to hand over');
  data.diffB = 0;
  assert.ok(data.diffHandoff, 'two repo items are handoffable');
});

test('whereFrom reads as repo short name, then the folder', () => {
  assert.equal(data.whereFrom({ repo: 'me/open', path: 'lib/alpineComponents/x.js' }), 'open · lib/alpineComponents');
  assert.equal(data.whereFrom({ repo: 'me/open', path: 'README.md' }), 'open');
});

// ---- Diff lens: A/B auto-pairing, dump, and the review-prompts copy -----

// The pair is where you are and what is next to it. min(i, n-2) is what keeps
// it valid at the end, so a diff is always available with two or more staged
// and the last position compares the last two rather than offering nothing.
test('the reader toggles into a diff over that pair, and back to the file', async () => {
  reset();
  store.stage = [
    { local: true, id: 401, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\ntwo\n' },
    { local: true, id: 402, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'one\nTWO\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  assert.ok(data._rDeck, 'the reader is open');
  assert.equal(data._cmpDeck, null, 'and no comparison over it');

  await data.openCompare();
  await shown();
  assert.ok(data._cmpDeck, 'the comparison is a second deck, one level down');
  assert.ok(data._rDeck, 'and the reader is still open underneath it');
  assert.equal(data.diffA, 0);
  assert.equal(data.diffB, 1, 'the pair came from the position, not a select');
  assert.ok(data.diffRows, 'and it ran on the way in');
  assert.match(data.readerPairLabel(), /a\.md .* b\.md/);

  // THE WHOLE REASON THIS IS A LEVEL. Dismissing used to take the reader out of
  // the file as well, because the comparison shared the file's overlay and the
  // header's ✕ was the only obvious way out of it.
  data._cmpDeck.close();
  await shown();
  assert.equal(data._cmpDeck, null, 'backing out leaves the comparison');
  assert.ok(data._rDeck, 'and lands on the file, not outside it');
  assert.equal(data.reader.name, 'a.md');
  data.reader = null;
});

test('two taps open one comparison, not two stacked on each other', async () => {
  reset();
  store.stage = [
    { local: true, id: 441, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 442, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  // THE LAZY-LOAD PATH IS THE WHOLE TEST. With the kit already present
  // openCompare never awaits and runs to completion synchronously, so a second
  // call sees the handle and returns: the race cannot happen and a test written
  // against that realm passes whether the guard is there or not. So put the
  // page that fetches the kit back: swipeDeck missing, gh.load supplying it.
  const deck = window.swipeDeck;
  const stack = deck.stack;
  const before = stack.length;
  delete window.swipeDeck;
  const gh = window.gh;
  window.gh = { load: async () => { await new Promise(r => setTimeout(r, 10)); window.swipeDeck = deck; } };
  try {
    // Both fired before either resolves, which is what a double tap is.
    await Promise.all([data.openCompare(), data.openCompare()]);
    await shown();
    assert.equal(stack.length, before + 1, 'one level down, not two');
    data._cmpDeck.close();
    await shown();
    assert.equal(stack.length, before, 'and one back out returns to the file');
  } finally {
    window.swipeDeck = deck;
    if (gh === undefined) delete window.gh; else window.gh = gh;
  }
  data.reader = null;
});

test('backing out of the comparison lands where the walk got to', async () => {
  reset();
  store.stage = [
    { local: true, id: 411, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 412, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
    { local: true, id: 413, name: 'c.md', path: 'c.md', size: 6, isText: true, text: 'three\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  await data.openCompare();
  await shown();

  // Walk the comparisons, then leave. The kit's default would return the reader
  // to where they ENTERED; here parent and child index the same set, so the
  // walk has to carry.
  data._cmpDeck.deck.go(2);
  await shown();
  data._cmpDeck.close();
  await shown();
  assert.ok(data._rDeck, 'still reading');
  assert.equal(data.reader.name, 'c.md', 'on the file the comparison walked to');
  data.reader = null;
});

// ── The three views ─────────────────────────────────────────────────────────
//
// One alignment read three ways. The ops are diffed once and each view renders
// from them, which is what makes switching free and what makes the three agree.

const threeUp = async (view) => {
  reset();
  store.stage = [
    { local: true, id: 701, name: 'a.md', path: 'a.md', size: 0, isText: true,
      text: 'keep one\nthe quick brown fox\nkeep two\ndropped\n' },
    { local: true, id: 702, name: 'b.md', path: 'b.md', size: 0, isText: true,
      text: 'keep one\nthe quick red fox\nkeep two\n' },
  ];
  await shown();
  data.cmpView = view;
  await data.view(data.items[0]);
  await shown();
  await data.openCompare();
  await shown();
  const el = data._cmpDeck.deck.track.children[0];
  return { el, text: el.textContent.replace(/\s+/g, ' ').trim() };
};

test('the picker offers three views and switching rebuilds without re-diffing', async () => {
  const { el } = await threeUp('unified');
  const tabs = [...el.querySelectorAll('[role="tab"]')].map(b => b.textContent.trim());
  assert.deepEqual(tabs, ['Unified', 'Split', 'Patch']);
  data.setCmpView('patch');
  await shown();
  assert.equal(data.cmpView, 'patch');
  data.reader = null;
});

test('unified is one column of tagged lines', async () => {
  const { text } = await threeUp('unified');
  assert.match(text, /- the quick brown fox/);
  assert.match(text, /\+ the quick red fox/);
  assert.match(text, /- dropped/);
  data.reader = null;
});

test('split pairs a changed line into one row, and marks the words inside it', async () => {
  const { el } = await threeUp('split');
  const grid = [...el.querySelectorAll('div')].find(d => d.className.includes('grid-cols-['));
  assert.ok(grid, 'a two-column grid is drawn');
  // Two cells per row, so the sides cannot slide out of step.
  assert.equal(grid.children.length % 2, 0);
  // The changed line is ONE row: its delete and its insert sit side by side.
  const cells = [...grid.children].map(c => c.textContent);
  const left = cells.findIndex(t => t.includes('brown'));
  assert.ok(left >= 0 && left % 2 === 0, 'the old line is on the left');
  assert.match(cells[left + 1], /red/, 'and its replacement is beside it, not below');
  // Word marks: only the word that moved is wrapped, not the whole line.
  const marks = [...grid.querySelectorAll('span')].filter(sp => sp.className.includes('bg-'));
  const marked = marks.map(m => m.textContent);
  assert.ok(marked.includes('brown'), 'the removed word is marked');
  assert.ok(marked.includes('red'), 'and the added one');
  assert.ok(!marked.includes('quick'), 'what did not move is left alone');
  data.reader = null;
});

test('a line with no counterpart leaves the other side blank rather than pairing', async () => {
  const { el } = await threeUp('split');
  const grid = [...el.querySelectorAll('div')].find(d => d.className.includes('grid-cols-['));
  const cells = [...grid.children];
  const at = cells.findIndex(c => c.textContent.includes('dropped'));
  assert.ok(at >= 0 && at % 2 === 0);
  assert.equal(cells[at + 1].textContent.trim(), '', 'nothing invented on the right');
  data.reader = null;
});

test('patch is a real unified diff, with hunk headers and file lines', async () => {
  const { text } = await threeUp('patch');
  assert.match(text, /--- a\/a\.md/);
  assert.match(text, /\+\+\+ b\/b\.md/);
  assert.match(text, /@@ -\d+,\d+ \+\d+,\d+ @@/);
  data.reader = null;
});

test('patch context is a control, and only Patch shows it', async () => {
  const { el } = await threeUp('patch');
  const labels = [...el.querySelectorAll('button')].map(b => b.textContent.trim());
  assert.ok(labels.includes('0') && labels.includes('3') && labels.includes('8') && labels.includes('all'),
    'the four steps are offered');

  // Tighter context drops the unchanged lines further from a change.
  data.setCmpContext(0);
  await shown();
  const at0 = data._cmpDeck.deck.track.children[0].textContent;
  data.setCmpContext(999);
  await shown();
  const atAll = data._cmpDeck.deck.track.children[0].textContent;
  assert.ok(atAll.length > at0.length, 'all-context carries more than none');
  assert.match(at0, /@@ /, 'and both are still real patches');
  assert.match(atAll, /@@ /);

  // The copy follows the control, so what you hand over is what you read.
  clipWrites.length = 0;
  data.setCmpContext(0);
  await shown();
  await data.copyDiff();
  assert.ok(clipWrites.at(-1).length < atAll.length);

  data.setCmpView('unified');
  await shown();
  const unified = data._cmpDeck.deck.track.children[0].textContent;
  assert.doesNotMatch(unified, /Context/, 'no context control where it would change nothing');
  data.setCmpContext(3);
  data.reader = null;
});

test('copy hands over the patch in Patch view, and the tagged block otherwise', async () => {
  await threeUp('patch');
  clipWrites.length = 0;
  await data.copyDiff();
  assert.match(clipWrites.at(-1), /^--- a\/a\.md\n\+\+\+ b\/b\.md\n@@ /,
    'the real patch, which is the reason that view exists');

  data.setCmpView('unified');
  await shown();
  clipWrites.length = 0;
  await data.copyDiff();
  assert.match(clipWrites.at(-1), /^--- A: /, 'and the labeled block elsewhere');
  assert.doesNotMatch(clipWrites.at(-1), /@@ /);
  data.reader = null;
});

test('identical sides say so in Patch rather than drawing an empty box', async () => {
  reset();
  const same = 'one\ntwo\n';
  store.stage = [
    { local: true, id: 711, name: 'x.md', path: 'x.md', size: 0, isText: true, text: same },
    { local: true, id: 712, name: 'y.md', path: 'y.md', size: 0, isText: true, text: same },
  ];
  await shown();
  data.cmpView = 'patch';
  await data.view(data.items[0]);
  await shown();
  await data.openCompare();
  await shown();
  assert.equal(data.diffPatch, '', 'no hunks to emit');
  assert.match(data._cmpDeck.deck.track.children[0].textContent, /identical/);
  data.reader = null;
});

test('closing the reader takes the comparison with it', async () => {
  reset();
  store.stage = [
    { local: true, id: 421, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 422, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  await data.openCompare();
  await shown();
  assert.ok(data._cmpDeck);

  data._rDeck.close();
  await shown();
  assert.equal(data._cmpDeck, null, 'no comparison left stranded over a closed reader');
  assert.equal(data._rDeck, null);
  assert.equal(data.reader, null);
});

test('the reader offers one way in, and no partner button for coming back', async () => {
  reset();
  store.stage = [
    { local: true, id: 431, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 432, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  const titles = data._rActions(0).map(a => a.title);
  assert.equal(titles.filter(t => /^Compare /.test(t)).length, 1);
  assert.equal(titles.filter(t => /^Back to/.test(t)).length, 0,
    'the way out of a level is the header chevron the kit draws');
  data.reader = null;
});

// THE THREE-SLIDE CASE, which two staged items cannot reach: readerPair
// clamps at the end, so with two everything pairs 0,1 and three concurrent
// builders agree by accident. With three they disagree, and the shared
// diffA/diffB/diffRows fields used to let the last builder win.
test('each diff slide holds its own pair, and the copy follows the reader', async () => {
  reset();
  store.stage = [
    { local: true, id: 541, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 542, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
    { local: true, id: 543, name: 'c.md', path: 'c.md', size: 6, isText: true, text: 'three\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  data.cmpView = 'unified';   // this test is about the PAIR, not the rendering
  await data.openCompare();
  await shown();

  const slides = () => [...data._cmpDeck.deck.track.children]
    .map(el => el.textContent.replace(/\s+/g, ' ').trim());

  // What the reader is on, and what every control outside the slide reads.
  assert.equal(data.diffA, 0);
  assert.equal(data.diffB, 1, 'the neighbour builders no longer win the pair');
  assert.match(data.diffDump, /--- A: \(local\) a\.md\n\+\+\+ B: \(local\) b\.md/,
    'so a copy names the pair the reader is looking at');

  // And the neighbour drew ITS pair, with its own rows rather than none or
  // someone else's under its heading.
  assert.match(slides()[1], /b\.md.*c\.md/, 'the bar names this slide\'s own pair');
  assert.match(slides()[1], /- two/, 'the neighbour ran its own compare');
  assert.match(slides()[1], /\+ three/);
  assert.doesNotMatch(slides()[1], /\+ two/, "and not the first pair's rows under its own name");

  // Stepping re-aims the controls, not only the rows. The slide is already
  // built, so nothing re-renders and only the publish can do this.
  data._cmpDeck.deck.go(1);
  await shown();
  assert.equal(data.diffA, 1);
  assert.equal(data.diffB, 2);
  assert.match(data.diffDump, /--- A: \(local\) b\.md\n\+\+\+ B: \(local\) c\.md/);
  data.reader = null;
});

// ── The compare picker ──────────────────────────────────────────────────────
//
// A is where you are; B is what you picked, and the neighbour when you have not.
// The positional rule this replaces could only express ADJACENT pairs, so on a
// stage of five "the first against the last" had no way to be said.

test('A is the file you are on, at every position including the last', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'x.js' },
    { repo: 'me/b', ref: '', path: 'y.js' },
    { repo: 'me/c', ref: '', path: 'z.js' },
  ];
  await tick();
  data.reader = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '0,1');
  data.reader = { i: 1, name: 'y.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '1,2');
  // The old rule slid the pair back to 1,2 here, so side A was the file BEFORE
  // the one on screen. A stays put now and B falls back to the previous file.
  data.reader = { i: 2, name: 'z.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '2,1');
  data.reader = null;
});

test('one staged item still pairs with nothing', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.js' }];
  await tick();
  data.reader = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.readerPair(), null);
  data.reader = null;
});

test('a pick reaches a file the adjacent rule never could', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'first.js' },
    { repo: 'me/b', ref: '', path: 'mid1.js' },
    { repo: 'me/c', ref: '', path: 'mid2.js' },
    { repo: 'me/d', ref: '', path: 'last.js' },
  ];
  await tick();
  data.reader = { i: 0, name: 'first.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '0,1', 'the default is still the neighbour');

  data.compareKey = data.itemKey(data.items[3]);
  assert.equal(data.readerPair().join(','), '0,3', 'the first against the last');
  assert.match(data.readerPairLabel(), /first\.js .+ last\.js/);
  data.compareKey = '';
  data.reader = null;
});

test('the pick follows the reader: A moves, B stays where it was pinned', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'x.js' },
    { repo: 'me/b', ref: '', path: 'y.js' },
    { repo: 'me/c', ref: '', path: 'z.js' },
  ];
  await tick();
  data.compareKey = data.itemKey(data.items[2]);
  data.reader = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '0,2');
  data.reader = { i: 1, name: 'y.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '1,2');
  // Standing on the pinned file is not a comparison, so the neighbour returns.
  data.reader = { i: 2, name: 'z.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '2,1');
  data.compareKey = '';
  data.reader = null;
});

test('the pick is held by key, so a reorder does not re-aim it', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'x.js' },
    { repo: 'me/b', ref: '', path: 'y.js' },
    { repo: 'me/c', ref: '', path: 'z.js' },
  ];
  await tick();
  data.compareKey = data.itemKey(data.items[2]);   // z.js
  data.reader = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '0,2');

  // z.js is now at index 1. An index-held pick would silently point at y.js.
  store.stage = [store.stage[0], store.stage[2], store.stage[1]];
  await tick();
  assert.equal(data.readerPair().join(','), '0,1');
  assert.equal(data.itemName(data.readerPair()[1]), 'z.js', 'still the file that was chosen');
  data.compareKey = '';
  data.reader = null;
});

test('a pick whose file leaves the stage is forgotten, not left dangling', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'x.js' },
    { repo: 'me/b', ref: '', path: 'y.js' },
    { repo: 'me/c', ref: '', path: 'z.js' },
  ];
  await tick();
  data.compareKey = data.itemKey(data.items[2]);
  data.reader = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.readerPair().join(','), '0,2');

  store.stage = store.stage.slice(0, 2);
  await tick();
  assert.equal(data.compareKey, '', 'the key goes, so the picker shows no choice');
  assert.equal(data.readerPair().join(','), '0,1', 'and the default takes over');
  data.reader = null;
});

test('the picker lists every other staged file, with where each came from', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: 'main', path: 'lib/dup.js' },
    { repo: 'me/b', ref: '', path: 'other/dup.js' },
    { local: true, id: 601, name: 'note.md', path: 'note.md', size: 4, isText: true, text: 'hi\n' },
  ];
  await tick();
  data.reader = { i: 0, name: 'lib/dup.js', mode: 'file' };
  const opts = plain_(data.compareOptions());
  assert.equal(opts.length, 2, 'the file you are on is not offered against itself');
  // Two staged files can share a NAME, so the origin is what tells them apart.
  assert.deepEqual(opts.map(o => o.label), ['dup.js', 'note.md']);
  assert.deepEqual(opts.map(o => o.note), ['me/b', 'local']);
  data.reader = null;
});

test('compareWith sets and clears the pick, and rebuilds the open deck', async () => {
  reset();
  store.stage = [
    { local: true, id: 611, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 612, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
    { local: true, id: 613, name: 'c.md', path: 'c.md', size: 6, isText: true, text: 'three\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  await data.openCompare();
  await shown();
  assert.equal(data.diffB, 1, 'opens on the neighbour');

  data.compareOpen = true;
  data.compareWith(data.itemKey(data.items[2]));
  await shown();
  assert.equal(data.compareOpen, false, 'choosing closes the list');
  assert.equal(data.diffB, 2, 'and the published pair follows the pick');
  assert.match(data.diffDump, /--- A: \(local\) a\.md\n\+\+\+ B: \(local\) c\.md/);
  assert.match(data.diffDump, /\+ three/, 'the rows are the picked pair\'s');

  data.compareWith('');
  await shown();
  assert.equal(data.diffB, 1, 'and clearing returns to the neighbour');
  data.reader = null;
});

test('closing the reader forgets the pick, since it was a reading choice', async () => {
  reset();
  store.stage = [
    { local: true, id: 621, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 622, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
    { local: true, id: 623, name: 'c.md', path: 'c.md', size: 6, isText: true, text: 'three\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  data.compareWith(data.itemKey(data.items[2]));
  await shown();
  assert.equal(data.compareIndex(), 2);

  data._rDeck.close();
  await shown();
  assert.equal(data.compareKey, '');
});

test('staging while reading keeps the pick, since that is not the reader leaving', async () => {
  reset();
  store.stage = [
    { local: true, id: 631, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\n' },
    { local: true, id: 632, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'two\n' },
    { local: true, id: 633, name: 'c.md', path: 'c.md', size: 6, isText: true, text: 'three\n' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  data.compareWith(data.itemKey(data.items[2]));
  await shown();

  // A drop goes through _rDrop and a rebuild, which must not be read as an exit.
  window.StageIntake.take({ text: 'arrived while reading' });
  await shown();
  assert.equal(data.itemName(data.compareIndex()), 'c.md', 'still comparing against what was chosen');
  data.reader = null;
});

// ── The subject channel: what the sidebar is told ───────────────────────────
//
// The reader covers the screen, and the FAB sidebar floats on top of it still
// aimed at whatever it was aimed at before. Announcing is what closes that gap:
// the drawer's Render tab names the staged file being READ, roots its path
// picker at that repo and ref, aims its github menu at that blob, and reads
// that ref's guide. The channel itself (which windows hear it, what is put
// back on the way out) belongs to kits/subject-channel.js and is tested there;
// what these hold is the stage's half of the contract.

const said = () => window.__tossSubject;

test('the reader says which staged file is on screen, and keeps saying it', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: 'dev', path: 'lib/x.js' },
    { repo: 'me/b', ref: '', path: 'docs/z.md' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  assert.equal(said().path, 'lib/x.js', 'on open, the file it opened on');
  assert.equal(said().repo, 'me/a');
  assert.equal(said().ref, 'dev', 'at the ref the item was staged from');
  assert.equal(said().route, 'stage',
    'route is what tells the sidebar this file is in a document, not a frame');
  assert.equal(said().via, undefined,
    'and the stage does not guess what app it is inside; the fab fills that in');

  data.readerStep(1);
  await shown();
  assert.equal(said().path, 'docs/z.md', 'and it follows the reader');
  assert.equal(said().ref, 'main', 'a staged item with no ref reads at the default');
  data.reader = null;
});

// The one field a deck announces and the stage does not, and the reason is not
// tidiness: `base` is what raises the drawer's compare bar, whose pick travels
// back on __compareRef for the CARDS to read. This reader owns its comparison
// and reads no such global, so a base would hang a second compare control in
// the drawer that changes nothing on screen.
test('the stage announces no base, since it owns its own comparison', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { repo: 'me/a', ref: 'dev', path: 'lib/x.js' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  assert.equal(said().base, undefined);
  assert.equal(said().baseName, undefined);

  await data.openCompare();
  await shown();
  assert.equal(said().base, undefined, 'not even with a comparison actually open');
  assert.equal(said().path, 'lib/x.js', 'which announces side A, the position');
  data.reader = null;
});

test('a local item says so rather than staying silent', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { local: true, id: 701, name: 'pasted.txt', path: 'pasted.txt', size: 2, isText: true, text: 'hi\n' },
  ];
  await shown();
  await data.view(data.items[1]);
  await shown();
  // The drawer's own branch for this folds away the ref bar and the path
  // picker and names what is being read. Silence would instead leave it
  // describing the app shell, so stepping off a repo file onto a pasted one
  // would watch the sidebar keep naming the file just left.
  assert.equal(said().local, true);
  assert.equal(said().label, 'pasted.txt');
  assert.equal(said().repo, undefined, 'a paste has no address to offer');
  assert.equal(said().route, 'stage');
  data.reader = null;
});

test('leaving puts back the subject that was there before', async () => {
  reset();
  // show-repo can itself be running inside a toss, so the global is borrowed.
  const held = { repo: 'me/tools', ref: 'main', path: 'pages/app.html' };
  window.__tossSubject = held;
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await shown();
  await data.view(data.items[0]);
  await shown();
  assert.equal(said().path, 'lib/x.js');

  data._rDeck.close();
  await shown();
  assert.equal(window.__tossSubject, held, 'returned, not cleared');
  window.__tossSubject = null;
  data.reader = null;
});

// The claim behind ONE CHANNEL FOR THE READER'S WHOLE LIFE. A deck rebuilt
// around a changed set fires the same onClose the reader's own ✕ does, and a
// channel closed and reopened there would snapshot its own announcement as the
// thing to put back: leaving would then restore the file you were reading.
test('staging while reading does not hand the subject back to itself', async () => {
  reset();
  const held = { repo: 'me/tools', ref: 'main', path: 'pages/app.html' };
  window.__tossSubject = held;
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await shown();
  await data.view(data.items[0]);
  await shown();
  const chan = data._rChan;

  window.StageIntake.take({ text: 'arrived while reading' });
  await shown();
  assert.equal(data._rChan, chan, 'the same channel spans the rebuild');
  assert.equal(said().path, 'lib/x.js', 'still naming what is on screen');

  data._rDeck.close();
  await shown();
  assert.equal(window.__tossSubject, held, 'and the page gets its own subject back');
  window.__tossSubject = null;
  data.reader = null;
});

test('the comparison walk keeps the sidebar following side A', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'one.md' },
    { repo: 'me/a', ref: '', path: 'two.md' },
    { repo: 'me/a', ref: '', path: 'three.md' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  await data.openCompare();
  await shown();
  assert.equal(said().path, 'one.md');
  data._cmpDeck.deck.go(2);
  await shown();
  assert.equal(said().path, 'three.md', 'the comparison walks the same set one lens down');
  data.reader = null;
});

test('the reader offers a door into the sidebar', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await shown();
  await data.view(data.items[0]);
  await shown();
  const door = data._rActions(0).find(a => a.icon === 'ph-sidebar-simple');
  assert.ok(door, 'nothing else says the sidebar is now aimed at the file in front of you');
  let tab = null;
  const on = (e) => { tab = e.detail && e.detail.tab; };
  window.addEventListener('web-tools:open-drawer', on);
  door.onClick();
  window.removeEventListener('web-tools:open-drawer', on);
  assert.equal(tab, 'render', 'and it opens on the tab that names the file');
  data.reader = null;
});

// ── Re-addressing, rather than being navigated away from ────────────────────
//
// The sidebar's ref bar renders a file at another ref by LEAVING for the
// renderer, which over a hand-assembled set would drop all of it. The stage
// answers in its own verb instead: stage that version and read it.

test('the ref bar stages the version it names and lands the reader on it', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await shown();
  await data.view(data.items[0]);
  await shown();

  assert.equal(window.__deckNavigate({ repo: 'me/a', ref: 'dev', path: 'lib/x.js' }), true,
    'handled here, so the fab does not navigate');
  await shown();
  assert.equal(data.items.length, 2, 'the other version joined the set');
  assert.equal(data.items[1].ref, 'dev');
  assert.equal(data.reader.i, 1, 'and the reader is on it');
  assert.equal(said().ref, 'dev', 'which the sidebar hears');
  // Nothing was removed, so what was being read is one swipe away and a
  // comparison of the two is one tap away.
  assert.equal(data.items[0].ref, '');
  data.reader = null;
});

test('asking twice seeks rather than staging a duplicate', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { repo: 'me/a', ref: 'dev', path: 'lib/x.js' },
  ];
  await shown();
  await data.view(data.items[0]);
  await shown();
  window.__deckNavigate({ repo: 'me/a', ref: 'dev', path: 'lib/x.js' });
  await shown();
  assert.equal(data.items.length, 2, 'grab dedupes by key');
  assert.equal(data.reader.i, 1, 'and the reader still lands on it');
  data.reader = null;
});

test('a spec with no address is refused, so the fab makes the trip itself', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await shown();
  await data.view(data.items[0]);
  await shown();
  assert.equal(window.__deckNavigate(null), false);
  assert.equal(window.__deckNavigate({ path: 'lib/x.js' }), false, 'a path with no repo is not an address');
  assert.equal(data.items.length, 1, 'and nothing was staged on the way');
  data.reader = null;
});

test('the handle is put back when the reader leaves', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await shown();
  await data.view(data.items[0]);
  await shown();
  assert.equal(typeof window.__deckNavigate, 'function');
  data._rDeck.close();
  await shown();
  assert.equal(window.__deckNavigate, null, 'a closed reader cannot show anything');
  data.reader = null;
});

test('no intake takes a position any more: everything appends', async () => {
  reset();
  window.StageIntake.take({ text: 'first' });
  window.StageIntake.take({ text: 'second' });
  assert.deepEqual(plain_(data.items.map(it => it.text)), ['first', 'second']);
});

test('diffLabel names the item\'s own ref, or "default"', () => {
  assert.equal(data.diffLabel({ repo: 'me/a', ref: 'dev', path: 'x.js' }), 'me/a@dev:x.js');
  assert.equal(data.diffLabel({ repo: 'me/a', ref: '', path: 'x.js' }), 'me/a@default:x.js');
  assert.equal(data.diffLabel({ local: true, name: 'pasted.txt' }), '(local) pasted.txt');
});

// No control constructs a pair. The Diff lens's selects and "ref" boxes read
// as "type two refs to build one"; the boxes are gone, the selects are gone,
// and the two ways a pair arises are the reader's position (above) and a
// staged address. Nothing types a ref anywhere.
test('nothing in the stage asks for a ref to be typed', () => {
  assert.equal('diffARef' in data, false);
  assert.equal('diffBRef' in data, false);
  assert.equal('outTab' in data, false, 'and no lens strip picks between them');
});

test('a version diff is two staged addresses, not a typed ref', () => {
  reset();
  // What the ref boxes were for, said the way the stage already says it: the
  // same path twice at two refs are two different addresses, so both stage.
  store.stage = [
    { repo: 'me/a', ref: 'main', path: 'x.js' },
    { repo: 'me/a', ref: 'dev', path: 'x.js' },
  ];
  assert.equal(data.items.length, 2, 'the same path at two refs is two items');
  data.diffA = 0; data.diffB = 1;
  assert.equal(new URL(data.diffHandoff).searchParams.get('a'), 'me/a@main:x.js');
  assert.equal(new URL(data.diffHandoff).searchParams.get('b'), 'me/a@dev:x.js');
});

test('diffDump renders a labeled header over the tagged rows', () => {
  reset();
  data.diffRows = [{ t: 'ctx', line: 'a' }, { t: 'del', line: 'b' }, { t: 'add', line: 'B' }];
  store.stage = [{ repo: 'me/a', ref: 'main', path: 'x.js' }, { repo: 'me/a', ref: 'dev', path: 'x.js' }];
  data.diffA = 0; data.diffB = 1;
  assert.equal(data.diffDump,
    '--- A: me/a@main:x.js\n+++ B: me/a@dev:x.js\n\n  a\n- b\n+ B');
});

test('diffPrompts is the fixed general-review list, label + ask', () => {
  const prompts = data.diffPrompts;
  assert.ok(prompts.length >= 5);
  assert.ok(prompts.every(p => p.label && p.ask));
  assert.ok(prompts.some(p => p.label === 'Tighten it'));
});

test('copyDiff copies the diff dump and flips diffCopied', async () => {
  reset();
  clipWrites.length = 0;
  data.diffRows = [{ t: 'add', line: 'x' }];
  store.stage = [{ repo: 'me/a', ref: '', path: 'f.js' }, { repo: 'me/b', ref: '', path: 'f.js' }];
  data.diffA = 0; data.diffB = 1;
  await data.copyDiff();
  assert.equal(clipWrites.length, 1);
  assert.match(clipWrites[0], /^--- A: me\/a@default:f.js/);
  assert.equal(data.diffCopied, true);
});

test('invalidateDiff drops a shown diff so a stale copy can\'t mismatch the selection', () => {
  reset();
  data.diffRows = [{ t: 'add', line: 'x' }];
  data._diffTextA = 'old A'; data._diffTextB = 'old B'; data.diffStat = '+1 −0';
  data.invalidateDiff();
  assert.equal(data.diffRows, null, 'rows cleared');
  assert.equal(data._diffTextA, '', 'stored A text cleared');
  assert.equal(data._diffTextB, '', 'stored B text cleared');
  assert.equal(data.diffStat, '', 'stat cleared');
});

test('removing a staged item clamps an out-of-range pair and clears the stale diff', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.js' }, { repo: 'me/b', ref: '', path: 'y.js' }];
  await tick();
  data.diffA = 0; data.diffB = 1;
  data.diffRows = [{ t: 'ctx', line: 'z' }];
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.js' }];  // drop the B item
  await tick();
  assert.equal(data.diffB, 0, 'B clamped back into range');
  assert.equal(data.diffRows, null, 'the stale diff was dropped');
});

// ---- link commentary: prompts= carries bespoke review asks ---------------

test('mint round-trips refs and prompts; parse stays refs-only', () => {
  const StageLink = window.StageLink;
  const refs = [{ repo: 'me/a', ref: 'dev', path: 'x.md' }];
  const prompts = [{ label: 'Check the FTE count', ask: 'Did the FTE number stay consistent A to B?' }];
  const url = StageLink.mint(refs, 'https://h/p', prompts);
  assert.match(url, /#stage=me\/a@dev:x\.md&prompts=/);
  const link = StageLink.parseLink(url);
  assert.deepEqual(plain_(link.items), refs);
  assert.deepEqual(plain_(link.prompts), prompts);
  assert.deepEqual(plain_(StageLink.parse(url)), refs, 'bare parse ignores prompts');
});

test('mint omits the prompts param when there is no commentary', () => {
  const url = window.StageLink.mint([{ repo: 'me/a', ref: '', path: 'x' }], 'https://h/p');
  assert.ok(!url.includes('&prompts='), 'no empty prompts param');
});

test('mint/parseLink round-trip the diff mode, and legacy array opts still work', () => {
  const StageLink = window.StageLink;
  const refs = [{ repo: 'me/a', ref: '', path: 'x' }];
  const url = StageLink.mint(refs, 'https://h/p', { mode: 'diff' });
  assert.match(url, /&mode=diff$/);
  assert.equal(StageLink.parseLink(url).mode, 'diff');
  assert.equal(StageLink.parseLink(StageLink.mint(refs, 'https://h/p')).mode, '', 'no mode by default');
  // legacy signature: third arg is a bare prompts array
  const legacy = StageLink.mint(refs, 'https://h/p', [{ label: 'x', ask: 'y' }]);
  assert.match(legacy, /&prompts=/);
  assert.ok(!legacy.includes('&mode='), 'array opts carry no mode');
});

test('StageLink.read: hash wins, query is the fallback (tossed / deep-link form)', () => {
  const StageLink = window.StageLink;
  const spec = 'me/a@main:x.md;me/a@dev:x.md';
  const enc = StageLink.encodePrompts([{ label: 'x', ask: 'y' }]);
  // hash form
  let r = StageLink.read({ hash: '#stage=' + spec + '&mode=diff', search: '' });
  assert.equal(plain_(r.items).length, 2);
  assert.equal(r.mode, 'diff');
  // query fallback when the hash carries no stage
  r = StageLink.read({ hash: '', search: '?view=stage&stage=' + spec + '&prompts=' + enc + '&mode=diff' });
  assert.equal(plain_(r.items).length, 2);
  assert.equal(r.mode, 'diff');
  assert.deepEqual(plain_(r.prompts), [{ label: 'x', ask: 'y' }]);
  // hash wins when both are present
  r = StageLink.read({ hash: '#stage=me/z@main:only.md', search: '?stage=' + spec });
  assert.equal(plain_(r.items).length, 1);
  assert.equal(plain_(r.items)[0].repo, 'me/z');
});

test('StageLink.read: an empty #stage= falls back to a populated ?stage=', () => {
  // The 2026-08-02 decision that moved read() onto lib/kits/url-params.js: absent
  // and empty are both misses, so a truncated link that kept the fragment key
  // but lost its value takes the query instead of staging nothing. The three
  // keys still travel together: prompts and mode come from the query source
  // with the stage, never mixed across sources.
  const StageLink = window.StageLink;
  const enc = StageLink.encodePrompts([{ label: 'q', ask: 'from query' }]);
  const r = StageLink.read({ hash: '#stage=', search: '?stage=me/q@main:b.md&prompts=' + enc + '&mode=diff' });
  assert.equal(plain_(r.items).length, 1);
  assert.equal(plain_(r.items)[0].path, 'b.md');
  assert.equal(r.mode, 'diff');
  assert.deepEqual(plain_(r.prompts), [{ label: 'q', ask: 'from query' }]);
  // A fragment stage never picks up stray query prompts: same-source rule.
  const mixed = StageLink.read({ hash: '#stage=me/z@main:only.md', search: '?prompts=' + enc });
  assert.equal(plain_(mixed.items).length, 1);
  assert.deepEqual(plain_(mixed.prompts), [], 'fragment source does not borrow query prompts');
});

test('decodePrompts drops malformed entries and bad payloads', () => {
  const StageLink = window.StageLink;
  assert.deepEqual(plain_(StageLink.decodePrompts('')), []);
  assert.deepEqual(plain_(StageLink.decodePrompts('not-base64-@@@')), []);
  const enc = StageLink.encodePrompts([{ label: 'ok', ask: 'a' }, { label: '', ask: 'no label' }, { label: 'no ask' }]);
  assert.deepEqual(plain_(StageLink.decodePrompts(enc)), [{ label: 'ok', ask: 'a' }], 'only complete {label,ask} survive');
});

test('a diff-mode link opens the reader on its diff, once', async () => {
  reset();
  data.reader = null;
  data.linkMode = 'diff';
  data._autoDiffed = false;
  store.stage = [
    { local: true, id: 301, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\ntwo\n' },
    { local: true, id: 302, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'one\nTWO\nthree\n' },
  ];
  await shown();
  // The link's intent is "look at this comparison", so it puts the reader in
  // front of one rather than selecting a control on the page.
  assert.ok(data._rDeck, 'the reader opens');
  assert.ok(data._cmpDeck, 'with the comparison drilled over it');
  assert.ok(data.diffRows, 'and it ran without a click');
  assert.equal(data._autoDiffed, true, 'and only arms once');
  data.linkMode = '';
  data._cmpDrop();
  data.reader = null;
});

// ── The link carries the reading, not just the refs ────────────────────────
//
// A `mode=diff` link used to reopen the recipient on the DEFAULT pair in the
// DEFAULT view, so a link sent while looking at "first against last, as a
// patch" showed them "first against second, split". The refs were right and the
// thing being pointed at was not.

test('mint round-trips the compare pick and the view', () => {
  const refs = [{ repo: 'me/a', ref: 'main', path: 'first.md' },
                { repo: 'me/a', ref: 'main', path: 'last.md' }];
  const url = window.StageLink.mint(refs, 'https://h/app/',
    { mode: 'diff', cmp: 'me/a@main:last.md', view: 'patch' });
  // The address stays readable: a person can see what it points at.
  assert.match(url, /&cmp=me\/a@main:last\.md/);
  assert.match(url, /&view=patch/);
  const back = window.StageLink.parseLink(url.split('#')[1]);
  assert.equal(back.cmp, 'me/a@main:last.md');
  assert.equal(back.view, 'patch');
  assert.equal(back.mode, 'diff');
});

test('a local pick cannot ride, since its key is an in-page id', () => {
  const refs = [{ repo: 'me/a', ref: '', path: 'x.md' }];
  assert.doesNotMatch(window.StageLink.mint(refs, '', { cmp: 'local:7' }), /cmp=/);
});

test('a view the picker does not offer is refused rather than carried', () => {
  const refs = [{ repo: 'me/a', ref: '', path: 'x.md' }];
  assert.doesNotMatch(window.StageLink.mint(refs, '', { view: 'wat' }), /view=/);
  assert.equal(window.StageLink.parseLink('#stage=me/a:x.md&view=wat').view, '');
});

test('the grammar and the picker read one list, so neither can grow alone', () => {
  reset();
  assert.deepEqual(plain_(data.cmpViews.map(v => v.key)), plain_(window.StageLink.VIEWS));
});

test('read takes the reading from the query too, when a context ate the hash', () => {
  const r = window.StageLink.read({
    hash: '',
    search: '?stage=me/a@main:first.md,last.md&mode=diff&cmp=me/a@main:last.md&view=split',
  });
  assert.equal(r.items.length, 2);
  assert.equal(r.cmp, 'me/a@main:last.md');
  assert.equal(r.view, 'split');
});

test('an opening link applies its view at once and its pick when the item lands', async () => {
  reset();
  data.cmpView = 'unified';
  data._linkCmp = '';
  // What init() does with a link, without needing a real location.
  const lk = window.StageLink.read({
    hash: '#stage=me/a:first.md,me/a:last.md&cmp=me/a:last.md&view=patch',
    search: '',
  });
  data.cmpView = lk.view;
  data._linkCmp = lk.cmp;
  assert.equal(data.cmpView, 'patch', 'the view needs no set to resolve against');
  assert.equal(data.compareKey, '', 'and the pick waits for its item');

  store.stage = [{ repo: 'me/a', ref: '', path: 'first.md' },
                 { repo: 'me/a', ref: '', path: 'last.md' }];
  await tick(2);
  assert.equal(data.compareKey, 'me/a:last.md', 'taken once the item is staged');
  assert.equal(data._linkCmp, '', 'and forgotten, so a later removal falls back');
  data.compareKey = '';
});

test('a pick naming something the link did not carry never resolves', async () => {
  reset();
  data._linkCmp = 'me/a:absent.md';
  store.stage = [{ repo: 'me/a', ref: '', path: 'first.md' },
                 { repo: 'me/a', ref: '', path: 'last.md' }];
  await tick(2);
  assert.equal(data.compareKey, '', 'no pick');
  data.reader = { i: 0, name: 'first.md' };
  assert.equal(data.readerPair().join(','), '0,1', 'so the neighbour default stands');
  data.reader = null;
  data._linkCmp = '';
});

test('copyLink carries the reading back out', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: 'main', path: 'first.md' },
                 { repo: 'me/a', ref: 'main', path: 'mid.md' },
                 { repo: 'me/a', ref: 'main', path: 'last.md' }];
  await tick(2);
  data.compareKey = data.itemKey(data.items[2]);
  data.cmpView = 'patch';
  data.diffRows = [{ t: 'ctx', line: 'x' }];
  clipWrites.length = 0;
  await data.copyLink();
  const url = clipWrites.at(-1);
  assert.match(url, /&mode=diff/);
  assert.match(url, /&cmp=me\/a@main:last\.md/);
  assert.match(url, /&view=patch/);
  data.compareKey = ''; data.diffRows = null;
});

test('diffPrompts shows link-carried bespoke asks first, then the fixed set', () => {
  reset();
  data.linkPrompts = [{ label: 'Fund split', ask: 'Verify 70/30.' }];
  const prompts = data.diffPrompts;
  assert.equal(prompts[0].label, 'Fund split');
  assert.equal(prompts[0].bespoke, true);
  assert.ok(prompts.some(p => p.label === 'Tighten it' && p.bespoke === false), 'fixed set still present');
  assert.equal(prompts.length, 1 + 6);
  data.linkPrompts = [];
});

test('copyLink carries the bespoke prompts back into the minted link', async () => {
  reset();
  clipWrites.length = 0;
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.md' }];
  data.linkPrompts = [{ label: 'Tone', ask: 'Did the tone drift?' }];
  await data.copyLink();
  assert.equal(clipWrites.length, 1);
  assert.match(clipWrites[0], /&prompts=/);
  assert.deepEqual(plain_(window.StageLink.parseLink(clipWrites[0]).prompts), plain_(data.linkPrompts));
  data.linkPrompts = [];
});

test('copyPrompt assembles both texts, the diff, and the specific ask', async () => {
  reset();
  clipWrites.length = 0;
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { local: true, id: 201, name: 'pasted.txt', path: 'pasted.txt', size: 4, isText: true, text: 'CONTENT me/a:lib/x.js\nextra' },
  ];
  data.diffA = 0; data.diffB = 1;
  await data.runDiff();
  await data.copyPrompt('Make it more succinct.', 0);
  assert.equal(clipWrites.length, 1);
  const t = clipWrites[0];
  assert.match(t, /A \(me\/a@default:lib\/x\.js\):\nCONTENT me\/a:lib\/x\.js/);
  assert.match(t, /B \(\(local\) pasted\.txt\):\nCONTENT me\/a:lib\/x\.js\nextra/);
  assert.match(t, /DIFF:\n--- A:/);
  assert.match(t, /REVIEW REQUEST: Make it more succinct\.$/);
  assert.equal(data.promptCopiedIdx, 0);
});

test('pasted text is named by what it is, so the extension is not a lie', () => {
  reset();
  const nameOf = (text) => {
    reset();
    data.onDropped({ text, size: text.length, type: 'text/plain' });
    return data.localItems[0].name;
  };
  assert.match(nameOf('<!doctype html><html><body>hi</body></html>'), /-paste\.html$/);
  assert.match(nameOf('{"a":1}'), /-paste\.json$/);
  assert.match(nameOf('# Title\n\nbody'), /-paste\.md$/);
  assert.match(nameOf('just prose'), /-paste\.txt$/);
});

test('a dest-carrying send lands local files ON the named branch', async () => {
  reset();
  calls.length = 0;
  store.stage = [{ local: true, id: 95, name: 'drop.html', path: 'drop.html', size: 2, isText: true, text: '<p>x' }];
  // The shape the branch page's add-file plus mints: repo@branch:dir.
  data.destSpec = 'me/dest@claude/some-branch:dump';
  await data.send();               // arm
  await data.send();               // deposit
  const txt = calls.find(c => c.kind === 'save');
  assert.equal(txt.repo, 'me/dest');
  assert.equal(txt.ref, 'claude/some-branch', 'the writer is pointed at the branch, not the default');
  assert.equal(txt.path, 'dump/drop.html');
});

test('parseDest reads a slashed branch out of owner/repo@ref:dir', () => {
  const d = data.parseDest('mehrlander/web-tools@claude/show-repo-scripts-staged-files-yhwb4b:dump');
  assert.deepEqual(plain_(d), { repo: 'mehrlander/web-tools', ref: 'claude/show-repo-scripts-staged-files-yhwb4b', dir: 'dump' });
});

test('a dest= key aims the stage, from the fragment or the query', () => {
  const SL = window.StageLink;
  const dest = 'mehrlander/web-tools@claude/some-branch:dump';
  // Fragment form, beside a staged set.
  const fromHash = SL.parseLink('#stage=me/a:x.js&dest=' + encodeURIComponent(dest));
  assert.equal(fromHash.dest, dest);
  assert.equal(fromHash.items.length, 1, 'dest does not disturb the item list');
  // Query-only form: what the branch page's add-file plus mints
  // (?view=stage&dest=…), which carries no staged set at all.
  const fromQuery = SL.read({ hash: '', search: '?view=stage&dest=' + encodeURIComponent(dest) });
  assert.equal(fromQuery.dest, dest);
  assert.equal(fromQuery.items.length, 0);
  // Absent is empty, never undefined: the caller assigns it to a text field.
  assert.equal(SL.parseLink('#stage=me/a:x.js').dest, '');
});

test('the destination trigger splits repo from its scope, and the folder never truncates away', () => {
  // The picker is shared, so its label has to survive three shapes: a full
  // deposit address, a plain path (file mode), and a deep path that is not an
  // address at all. Only the first splits.
  const pk = [...window.document.querySelectorAll('[x-data^="pathPicker"]')]
    .map(e => window.Alpine.$data(e)).find(Boolean);
  pk.label = 'mehrlander/web-tools@claude/long-branch-name:dump';
  assert.deepEqual(plain_(pk.labelParts),
    { main: 'mehrlander/web-tools', ref: '@claude/long-branch-name', dir: ':dump' });
  pk.label = 'pages/foo.html';
  assert.deepEqual(plain_(pk.labelParts), { main: 'pages/foo.html', ref: '', dir: '' });
  pk.label = 'lib/alpineComponents/fab.js';
  assert.deepEqual(plain_(pk.labelParts), { main: 'lib/alpineComponents/fab.js', ref: '', dir: '' });
});

// ── Dictation: the stage's third intake ────────────────────────────────────
// The composition rules belong to kits/dictate.js and are tested there. What
// is here is what the stager owes the kit: it holds no buffer of its own, the
// keyboard and the microphone are one toggle over one text, and whichever mode
// is open when Stage is tapped is the one that reaches the file.
class FakeSR {
  constructor() { FakeSR.last = this; }
  start() {}
  stop() { this.onend && this.onend(); }
  say(t, final) {
    this.onresult({ resultIndex: 0,
      results: [Object.assign([{ transcript: t }], { isFinal: !!final })] });
  }
}

test('dictation stages a file that exists nowhere, breaks and all', async () => {
  reset();
  window.SpeechRecognition = FakeSR;
  // The kit is normally fetched on the first tap; hand it over directly, since
  // the point here is the component's use of it and not the load.
  const { loadKit } = await import('./bootstrap.mjs');
  loadKit('dictate.js', { window });
  assert.equal(data.dictAvail, true, 'the button is offered once a recognizer exists');

  await data.dictStart();
  assert.equal(data.dictOpen, true);
  FakeSR.last.say('a file that exists nowhere yet', true);
  await tick();
  assert.equal(data.dictText, 'a file that exists nowhere yet.',
    'the component mirrors the kit rather than keeping its own buffer');

  data.dictStage();
  assert.equal(data.dictOpen, false, 'staging closes the bar');
  assert.equal(store.stage.length, 1);
  assert.equal(store.stage[0].local, true);
  assert.equal(store.stage[0].text, 'a file that exists nowhere yet.');
  assert.match(store.stage[0].name, /\.(txt|md)$/, 'and it is named for what it is');
});

test('the pencil is a mode switch over one text, and the typed version wins', async () => {
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('spoken first', true);
  FakeSR.last.say('and still being heard', false);
  await tick();

  // Opening stops the engine, since dictating into a focused textarea is two
  // writers on one buffer, and takes the hypothesis with it: it is part of
  // what is being edited.
  data.dictEditOpen();
  assert.equal(data.dictEdit, true);
  assert.equal(data.dictOn, false, 'the engine is stopped, not left running behind the keyboard');
  assert.equal(data.dictBreakable, false,
    'and Breaks goes inert as the keyboard opens, not once it closes: staging from '
    + 'here writes through the setter that clears the record either way');
  assert.equal(data.dictDraft, 'spoken first. and still being heard.',
    'the draft opens on everything that was on screen, interim included');

  // The Breaks toggle goes inert once typing has replaced the pause record,
  // and says so rather than silently doing nothing.
  data.dictDraft = 'typed over the top';
  data.dictEditClose();
  await tick();
  assert.equal(data.dictEdit, false);
  assert.equal(data.dictText, 'typed over the top', 'no period is added to what was typed');
  assert.equal(data.dictBreakable, false, 'and the pause record is gone with it');

  data.dictStage();
  assert.equal(store.stage[0].text, 'typed over the top');
});

test('staging from inside the keyboard takes the textarea, not the stale buffer', async () => {
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('the dictated version', true);
  await tick();
  data.dictEditOpen();
  data.dictDraft = 'the corrected version';
  data.dictStage();                    // straight from edit mode, no close first
  assert.equal(store.stage[0].text, 'the corrected version');
  assert.equal(data.dictEdit, false, 'and the bar resets, keyboard mode included');
  assert.equal(data.dictDraft, '');
});

test('cancel discards, since the buffer is one utterance and staging is one tap', async () => {
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('never mind', true);
  await tick();
  data.dictCancel();
  assert.equal(data.dictOpen, false);
  assert.equal(data.dictText, '');
  assert.equal(store.stage.length, 0, 'nothing reached the stage');
});

test('the pad shows three marks and a shift, and a shifted mark drops it', async () => {
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  assert.deepEqual(plain_(data.dictMarks), ['.', ',', '?'],
    'the three ordinary-prose marks, period first');
  data.dictShift = true;
  assert.deepEqual(plain_(data.dictMarks), [';', '!', '¶'], 'the deliberate three');

  FakeSR.last.say('a line', true);
  await tick();
  data.dictMark('¶');
  assert.equal(data.dictShift, false, 'a shifted mark drops the shift, like a phone keyboard');
  assert.deepEqual(plain_(data.dictMarks), ['.', ',', '?']);
  assert.equal(data.dictText, 'a line.\n\n', 'and the break followed the period rather than replacing it');
  data.dictCancel();
});

test('a caret in a sentence gap turns the period key into the stitch', async () => {
  // The same swap the annotator's card makes, off the same kit verb: a pause
  // the reader did not mean as an ending writes a full stop and the engine
  // capitalizes behind it. One key, not three, because the aim is the caret
  // rather than a word and `,` and `?` must not move under the thumb.
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('I went to the store', true);
  await tick();
  data._dict.text = 'I went to the store. And then I came back';
  assert.deepEqual(plain_(data.dictMarks), ['.', ',', '?'], 'at rest it is the marks');

  data._dict.caretAt(20);                 // the gap
  data.dictPaint();
  assert.equal(data.dictStitch, true);
  assert.deepEqual(plain_(data.dictMarks), ['stitch', ',', '?']);

  data.dictMark('stitch');
  assert.equal(data.dictText, 'I went to the store and then I came back',
    'one tap: the mark goes and the capital comes down with it');
  assert.deepEqual(plain_(data.dictMarks), ['.', ',', '?'], 'and the marks are back');
  data.dictCancel();
});

test('the pad face follows the caret, which nothing reactive otherwise tracks', async () => {
  // The range lives in the kit, so moving the caret assigns dictText the same
  // string and a reactive set to an equal value notifies nobody. dictPaint
  // bumps a counter the pad's getters read, which is why they can turn on
  // where the caret IS rather than only on what the buffer holds.
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  data._dict.text = 'one sentence. Two sentences';
  const before = data.dictBeat;
  data._dict.caretAt(13);
  data.dictPaint();
  assert.ok(data.dictBeat > before, 'a caret move beats, though the text did not change');
  assert.equal(data.dictStitch, true);
  data.dictCancel();
});

test('the stage paints through the kit and its pad turns into casing keys', async () => {
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('the quick brown fox', true);
  await tick();

  const body = data._dictHost;
  assert.ok(body, 'the painter has a host, bound at x-init');
  assert.deepEqual([...body.childNodes].map(n => n.getAttribute('data-d')), ['text']);
  assert.match(body.getAttribute('style'), /-webkit-touch-callout:\s*none/,
    'and the browser is refused its own selection over it');

  data._dict.selectWordAt(6);            // "quick"
  data.dictPaint();
  assert.deepEqual([...body.childNodes].map(n => n.getAttribute('data-d')),
    ['text', 'sel', 'text'], 'the text box holds only text');
  // The handles live in the card, outside the scrolling box, so a ball above
  // the first line sits in the card's padding rather than being clipped.
  const layer = data.$refs.dictLayer;
  assert.deepEqual([...layer.querySelectorAll('[data-edge]')].map(n => n.getAttribute('data-edge')),
    ['start', 'end']);
  assert.ok(!body.querySelector('[data-edge]'));
  assert.equal(data.dictSel, true);
  assert.deepEqual(plain_(data.dictMarks), ['AB', 'ab', 'Ab'], 'the pad is casing now');

  data.dictMark('AB');
  assert.equal(data.dictText, 'the QUICK brown fox.');
  data.dictDrop();
  assert.equal(data.dictSel, false);
  assert.deepEqual(plain_(data.dictMarks), ['.', ',', '?'], 'and the marks came back');
  data.dictCancel();
});

test('an armed pin puts arrows where Stage was, and they walk that edge', async () => {
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('the quick brown fox', true);
  await tick();
  data._dict.selectWordAt(6);            // "quick"
  data.dictPaint();
  assert.equal(data.dictArmed, null, 'a selection alone arms nothing');

  data.dictArmed = 'end';
  data.dictNudge(1);
  assert.deepEqual(plain_(data._dict.range), { start: 4, end: 10 });
  data.dictNudge(-1);
  assert.deepEqual(plain_(data._dict.range), { start: 4, end: 9 });

  // Nothing armed, nothing to move: the arrows are the armed state's controls
  // and a pair that needs a prior tap to mean anything is worse than none.
  data.dictArmed = null;
  data.dictNudge(1);
  assert.deepEqual(plain_(data._dict.range), { start: 4, end: 9 }, 'unchanged');
  data.dictCancel();
});

test('a tap on the blank canvas sends the caret to the end', async () => {
  // Same defect and same fix as the annotator's composer: the listeners are on
  // the SCROLL BOX, not on the painted span, because a span shrink-wraps to
  // its text and the canvas below the last line belongs to the box. jsdom has
  // no layout, so getClientRects is empty and hitsText answers false for every
  // point, which is the case under test.
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('the quick brown fox', true);
  await tick();
  data._dict.selectWordAt(6);            // "quick"
  data.dictArmed = 'start';
  data.dictPaint();
  assert.equal(data.dictSel, true);

  const surface = data._dictHost.parentElement;
  assert.ok(surface && surface !== data._dictHost, 'the box is not the span');
  const tap = new window.Event('pointerup', { bubbles: true });
  tap.clientX = 50; tap.clientY = 500;
  surface.dispatchEvent(tap);

  assert.equal(data._dict.range, null, 'the caret is past the last character');
  assert.equal(data.dictSel, false);
  assert.equal(data.dictArmed, null, 'and the armed pin was disarmed with it');
  assert.equal(data.dictText, 'the quick brown fox.', 'getting there wrote nothing');
  data.dictCancel();
});

test('three taps in a run take the whole buffer', async () => {
  // hitsText is stubbed: jsdom has no layout and would answer false for every
  // point, and its geometry is measured in dictate.test.mjs. Under test here
  // is the counting, and that a triple needs no point (the offset is resolved
  // after the count, so select-all does not depend on where the third landed).
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('the quick brown fox', true);
  await tick();
  const real = window.Dictate.hitsText;
  window.Dictate.hitsText = () => true;
  try {
    const surface = data._dictHost.parentElement;
    const tap = () => {
      const e = new window.Event('pointerup', { bubbles: true });
      e.clientX = 20; e.clientY = 20;
      surface.dispatchEvent(e);
    };
    tap();
    assert.equal(data.dictSel, false, 'one tap with nothing live waits');
    tap(); tap();
    assert.deepEqual(plain_(data._dict.range), { start: 0, end: 20 },
      'the third takes everything, the pause period included');
    assert.equal(data.dictSel, true);
  } finally { window.Dictate.hitsText = real; }
  data.dictCancel();
});

test('the third tap counts even when it lands on the pin the second one painted', async () => {
  // The regression a real browser found and jsdom could not: a double tap
  // paints a handle AT the point tapped, so the third tap of a triple hits the
  // pin. A pin is not inside the scroll box, so a listener bound there never
  // saw it and the run stalled at two, which made select-all unreachable in
  // exactly the place it is used. The listener is on the layer now, and that
  // is what these three taps on a pin assert.
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('the quick brown fox', true);
  await tick();
  data._dict.selectWordAt(6);            // "quick", so the handles exist
  data.dictPaint();

  const pin = data.$refs.dictLayer.querySelector('[data-edge="start"]');
  assert.ok(pin, 'a handle to tap');
  assert.ok(!data._dictHost.parentElement.contains(pin),
    'and it is outside the scroll box, which is the whole reason this needs the layer');

  for (let i = 0; i < 3; i++) {
    const e = new window.Event('pointerup', { bubbles: true });
    e.clientX = 20; e.clientY = 20;
    pin.dispatchEvent(e);
  }
  assert.deepEqual(plain_(data._dict.range), { start: 0, end: 20 },
    'three taps on the pin still take the whole buffer');
  data.dictCancel();
});

test('the keyboard mode does not wear a microphone', async () => {
  // Same defect and same pin as the annotator's composer. The class bindings
  // are read off the rendered buttons rather than the source, so a change to
  // either surface's markup has to keep this true.
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  FakeSR.last.say('a line', true);
  await tick();

  const btns = [...data.$refs.dictLayer.querySelectorAll('button')];
  const mic = btns.find(b => b.querySelector('.ph-microphone'));
  assert.ok(mic, 'the mic is there while dictating');

  data.dictEditOpen();
  await tick();
  const exit = [...data.$refs.dictLayer.querySelectorAll('button')]
    .find(b => (b.textContent || '').includes('Done'));
  assert.ok(exit, 'the way out says Done');
  assert.ok(!exit.querySelector('.ph-microphone'),
    'and the way OUT of the keyboard is not a microphone');
  assert.ok(exit.querySelector('.ph-check'));
  assert.ok(!/btn-warning/.test(exit.className), 'nor amber, which is this UI live accent');
  // The mic holds its slot instead of vanishing, so nothing slides into it.
  const stillMic = [...data.$refs.dictLayer.querySelectorAll('button')]
    .find(b => b.querySelector('.ph-microphone'));
  assert.ok(stillMic, 'the mic is still rendered');
  assert.equal(stillMic.disabled, true, 'visibly off rather than absent');

  data.dictEditClose();
  await tick();
  assert.equal(data.dictEdit, false);
  data.dictCancel();
});

test('Done resumes dictation only if the keyboard interrupted it', async () => {
  // Same rule and same reason as the annotator's composer: the resume is
  // wanted, the switching ON is not.
  reset();
  window.SpeechRecognition = FakeSR;
  await data.dictStart();
  assert.equal(data.dictOn, true, 'the card opens listening');

  data.dictEditOpen();
  await tick();
  assert.equal(data.dictOn, false, 'the keyboard stops the engine');
  data.dictEditClose();
  await tick();
  assert.equal(data.dictOn, true, 'and Done puts it back');

  // Stopped first, then the keyboard: still stopped on the way out.
  data.dictToggle();
  await tick();
  assert.equal(data.dictOn, false);
  data.dictEditOpen();
  await tick();
  data.dictEditClose();
  await tick();
  assert.equal(data.dictOn, false,
    'Done does not switch the microphone on for a reader who had it off');
  data.dictCancel();
});

// ---- asks: what a session wants FROM you ---------------------------------
// The mailbox's fourth kind. The other three are deferred reads from a repo and
// answer themselves on page load; this one waits for a person, so the stage is
// where it is read and closed.

test('askAge is coarse, and says nothing when the record carries no date', () => {
  assert.equal(data.askAge(''), '');
  assert.equal(data.askAge('not-a-date'), '', 'a guess would be worse than silence');
  assert.equal(data.askAge(new Date().toISOString()), 'today');
  assert.equal(data.askAge(new Date(Date.now() - 86400000 * 1).toISOString()), '1 day');
  assert.equal(data.askAge(new Date(Date.now() - 86400000 * 9).toISOString()), '9 days');
});

test('askTaskUrl links the citation, and stays quiet without one', () => {
  assert.equal(data.askTaskUrl({ task: 'mehrlander/home:projects/wps/tracker/tasks/x.md' }),
    'https://github.com/mehrlander/home/blob/HEAD/projects/wps/tracker/tasks/x.md');
  assert.equal(data.askTaskUrl({ task: 'mehrlander/home@main:t.md' }),
    'https://github.com/mehrlander/home/blob/main/t.md');
  assert.equal(data.askTaskUrl({}), '');
  assert.equal(data.askTaskUrl({ task: 'nonsense' }), '');
});

test('loadAsks keeps valid asks and drops everything it cannot use', async () => {
  const requests = {
    'ask-ok.json': { id: 'ask-ok', kind: 'ask', note: 'the PowerShell files', dest: 'me/dest:projects/wps/dump' },
    'ask-bad.json': { id: 'ask-bad', kind: 'ask' },              // no note or dest
    'br.json': { id: 'br', kind: 'branches', repo: 'me/open' },  // a read kind, not ours
    'junk.json': '<<<not json>>>',
  };
  window.__shell = { REGISTRY_REPO: 'me/registry' };
  data.srcGh = () => ({
    async ls(dir) {
      if (dir === 'mailbox/requests') return Object.keys(requests).map(name => ({ name, type: 'file' }));
      return [];
    },
    async get(p) {
      const name = p.split('/').pop();
      const v = requests[name];
      if (v === undefined) throw new Error('404');
      return { text: typeof v === 'string' ? v : JSON.stringify(v) };
    },
  });
  await data.loadAsks();
  assert.deepEqual(plain_(data.asks.map(a => a.id)), ['ask-ok'],
    'a malformed ask and an unparsable record drop their own row, not the section');
  assert.equal(data.asks[0].dest, 'me/dest:projects/wps/dump');
  delete data.srcGh;
  delete window.__shell;
});

test('resolveAsk writes the result that closes it, and drops the row', async () => {
  const saved = [];
  window.__shell = { REGISTRY_REPO: 'me/registry' };
  data.srcGh = () => ({ async save(path, body, msg) { saved.push({ path, body, msg }); return {}; } });
  data.asks = [{ name: 'ask-ok.json', id: 'ask-ok', kind: 'ask', dest: 'me/dest:d', message: '', busy: false }];

  await data.resolveAsk(data.asks[0], true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].path, 'mailbox/results/ask-ok.json', 'the result takes the request name; that is what closes it');
  assert.equal(saved[0].body.answered, true);
  assert.deepEqual(plain_(data.asks), []);

  delete data.srcGh;
  delete window.__shell;
});

test('resolveAsk refuses a decline with no reason, and leaves the row standing', async () => {
  const saved = [];
  window.__shell = { REGISTRY_REPO: 'me/registry' };
  data.srcGh = () => ({ async save(path, body, msg) { saved.push({ path, body, msg }); return {}; } });
  data.asks = [{ name: 'ask-ok.json', id: 'ask-ok', kind: 'ask', dest: 'me/dest:d', message: '  ', busy: false }];

  await data.resolveAsk(data.asks[0], false);
  assert.deepEqual(saved, [], 'a decline is the valuable answer, so it must say why');
  assert.equal(data.asks.length, 1, 'nothing was written, so nothing was closed');

  data.asks[0].message = 'nothing references it, stop looking';
  await data.resolveAsk(data.asks[0], false);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].body.answered, false);
  assert.equal(saved[0].body.ok, true, 'a decline is a served request, not a failure');

  delete data.srcGh;
  delete window.__shell;
});

// ── The bench's Paste button, and what it says when it takes nothing ────────
//
// One question only: an empty clipboard must not be reported in the error
// colour. Tapping Paste before copying anything is the ordinary outcome, and
// red there reads as "this button is broken" rather than "there was nothing to
// take" (reported from a phone, 2026-08-19).
//
// The read is the real one: io.pasteItems is stubbed, and everything from
// takeClipboard down runs as it ships. That matters because pasteItems returns
// an empty list for BOTH a genuinely empty clipboard and a read the platform
// refused without throwing, which is why the message says what happened rather
// than guessing why.

const toastLog = [];
window.Alpine.store('toast', (icon, msg, cls = 'alert-info', ms = 3000) =>
  toastLog.push({ icon, msg, cls, ms }));

test('paste: an empty clipboard is information, not an error', async () => {
  toastLog.length = 0;
  window.io = { pasteItems: async () => [] };
  await data.pasteIn();
  assert.equal(toastLog.length, 1);
  assert.equal(toastLog[0].cls, 'alert-info');
  assert.doesNotMatch(toastLog[0].msg, /is empty/i,
    'the read cannot tell an empty clipboard from a refused one, so it must not claim either');
});

test('paste: a read that throws keeps the error colour', async () => {
  toastLog.length = 0;
  window.io = null;   // takeClipboard throws rather than lazily fetching the kit
  await data.pasteIn();
  assert.equal(toastLog.length, 1);
  assert.equal(toastLog[0].cls, 'alert-error',
    'a failure a fix could remove is what the error colour is for');
});

test('paste: something arriving is staged and reported as a success', async () => {
  toastLog.length = 0;
  store.stage = [];
  const CSV = 'code,jul\nAA,186927\nBA,9448';
  window.io = { pasteItems: async () => [{ kind: 'text', type: 'text/plain', text: CSV, size: CSV.length }] };
  await data.pasteIn();
  assert.equal(store.stage.length, 1);
  assert.match(toastLog[0].msg, /^Staged /);
});
