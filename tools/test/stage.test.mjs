// alpineComponents/stage.js — logic-level tests for the stager: the estate-
// level picker roots (pickerRoots), the grab flow, the inline preview, the
// folding of dropped local files into the one stage (a local item beside refs,
// both flowing through the one send/save/mint, with save naming its target
// repo), and the Diff lens's A/B auto-pairing, diff dump, and review-prompts
// copy. Driven directly against a fake browser store; no network, no real
// files, no picker pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const calls = [];

// A GH stand-in: srcGh builds `new base.constructor(...)`, so the methods must
// live on the class. copyTo (refs), save/saveBytes (local bytes), get (reads).
class FakeGH {
  constructor(conf = {}) { this.token = conf.token || ''; this.repo = conf.repo || ''; this.ref = 'main'; }
  async get(path) {
    // One repo that always 404s, so a failing read has a fixture: the preview
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

// alpine-bundle.js defines the browser store; the stager composes dropZone and
// pathPicker, and its inline preview mounts a viewer, so all three must be
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
  'lib/alpineComponents/drop-zone.js',
  'lib/alpineComponents/path-picker.js',
  'lib/alpineComponents/viewer.js',
  'lib/alpineComponents/stage.js',
]);

const data = Alpine.$data(window.document.getElementById('st'));
const store = Alpine.store('browser');
store.gh = new FakeGH({ token: 't', repo: 'me/open' });
const plain_ = (v) => JSON.parse(JSON.stringify(v));
const reset = () => { store.stage = []; data.diffA = 0; data.diffB = 0; data._diffTouched = false; data.diffRows = null; };

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

// ---- grabbing from a repo, previewing inline -----------------------------

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

// The preview opens the modal ({ name } is the bare path) and drives the file's
// content + origin into the embedded viewer (#stage-preview-viewer.__viewer), so
// the assertions read the viewer's state, not preview fields it no longer holds.
const previewViewer = () => window.document.getElementById('stage-preview-viewer').__viewer;

test('view loads a ref into the inline preview, not the shared activeFile', async () => {
  reset();
  store.activeFile = null;
  // The preview is a position in the stage, so the row it opens from is staged.
  store.stage = [{ repo: 'me/a', ref: '', path: 'lib/x.js' }];
  await data.view({ repo: 'me/a', ref: '', path: 'lib/x.js' });
  await tick(3);
  assert.equal(data.preview.name, 'lib/x.js');
  assert.equal(data.preview.i, 0, 'and it knows where it is');
  assert.equal(store.activeFile, null, 'stage preview never routes through Files');
  const vwr = previewViewer();
  assert.equal(vwr.file, 'lib/x.js');
  assert.match(vwr.content, /CONTENT me\/a:lib\/x.js/);
  assert.ok(vwr.fileUrls.some(u => /github\.com\/me\/a\/blob/.test(u.u)),
    'the origin gives the preview its GitHub link');
});

// The preview used to be a dead end: one file, and the only way to the next
// staged one was close, find the row, open again. It carries an index now, so
// the staged set is walkable. Every position opens, including the ones with
// nothing to render, which is what keeps the counter honest.
test('the preview walks the staged set, and every position opens', async () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'one.js' },
    { local: true, id: 91, name: 'bin.png', path: 'bin.png', size: 9, isText: false },
    { repo: 'me/a', ref: '', path: 'three.js' },
  ];
  await data.view({ repo: 'me/a', ref: '', path: 'one.js' });
  await tick(3);
  assert.equal(data.preview.i, 0);
  assert.equal(data.preview.note, '', 'a text file renders');

  // A binary local file is a position like any other: it opens with a note
  // instead of a viewer, so stepping past it never skips or dead-ends.
  await data.previewStep(1);
  await tick(3);
  assert.equal(data.preview.i, 1);
  assert.match(data.preview.note, /Binary/);
  assert.equal(data.preview.name, 'bin.png');

  await data.previewStep(1);
  await tick(3);
  assert.equal(data.preview.i, 2);
  assert.equal(data.preview.note, '');

  // The ends hold.
  await data.previewStep(1);
  assert.equal(data.preview.i, 2, 'past the last is a no-op');
  await data.previewStep(-1); await data.previewStep(-1); await data.previewStep(-1);
  await tick(3);
  assert.equal(data.preview.i, 0, 'before the first is a no-op');
});

test('a fetch that fails still opens, as a note rather than a closed modal', async () => {
  reset();
  store.stage = [{ repo: 'me/missing', ref: '', path: 'gone.js' }];
  await data.view({ repo: 'me/missing', ref: '', path: 'gone.js' });
  await tick(3);
  assert.ok(data.preview, 'the modal is open');
  assert.match(data.preview.note, /Could not load it/);
});

test('view shows a local text item inline', async () => {
  const loc = { local: true, id: 90, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' };
  store.stage = [loc];
  await data.view(loc);
  await tick(3);
  assert.equal(data.preview.name, 'n.txt');
  const vwr = previewViewer();
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
// item was stamped binary on that basis, so a dropped .md previewed as "Not
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
test('a dropped markdown file previews rather than reporting itself binary', async () => {
  reset();
  const md = '# Notes\n\nA paragraph.\n';
  const bytes = new TextEncoder().encode(md);
  data.onDropped({ file: {}, name: 'notes.md', size: bytes.length, type: 'text/markdown', bytes, buf: bytes.buffer });
  await data.view(data.localItems[0]);
  await tick(3);
  assert.equal(data.preview.note, '', 'no "Binary … staged for copy, not preview" note');
  assert.equal(previewViewer().content, md);
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

test('an svg keeps its bytes, so it still previews as an image', () => {
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

const paste = async (cd, target) => {
  data.offers = [];
  data._onPaste({ clipboardData: cd, target: target || { tagName: 'DIV' }, preventDefault() {} });
  await tick(2);
};

test('a spreadsheet paste stages one flavor and offers the rest', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html', 'Files'],
    data: { 'text/plain': TSV, 'text/html': HTML },
    files: [fakeFile('image.png', 'image/png', 4096)],
  }));
  assert.equal(data.localItems.length, 1, 'one flavor is staged, not three');
  assert.match(data.localItems[0].name, /\.png$/, 'the image, which is what this handler always took');
  assert.deepEqual(plain_(data.offers.map(o => data.flavorLabel(o)).sort()), ['html', 'tsv'],
    'the two it could not take are offered, not discarded');
});

test('a text/plain grid is named .tsv, so it opens as a table', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': TSV } }));
  assert.match(data.localItems[0].name, /\.tsv$/);
  assert.equal(data.offers.length, 0, 'one flavor offers nothing');
});

test('prose with a stray tab is not a grid', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': 'a note\twith a tab\nand a second line' } }));
  assert.match(data.localItems[0].name, /\.txt$/, 'the tab counts differ, so it is text');
});

test('staging an offered flavor moves it onto the stage and off the bar', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html'],
    data: { 'text/plain': TSV, 'text/html': HTML },
  }));
  assert.equal(data.localItems.length, 1);
  assert.equal(data.offers.length, 1);
  await data.stageFlavor(data.offers[0]);
  assert.equal(data.localItems.length, 2);
  assert.equal(data.offers.length, 0);
  const html = data.localItems.find(it => /\.html$/.test(it.name));
  assert.equal(html.text, HTML, 'the html flavor is staged as html, not sniffed from its first characters');
});

test('a paste into a form field keeps its native paste, and offers the rest', async () => {
  reset();
  await paste(fakeCd({
    types: ['text/plain', 'text/html', 'Files'],
    data: { 'text/plain': TSV, 'text/html': HTML },
    files: [fakeFile('image.png', 'image/png', 4096)],
  }), { tagName: 'INPUT' });
  assert.equal(data.localItems.length, 0, 'the field pastes its own text; nothing is stolen');
  assert.deepEqual(plain_(data.offers.map(o => data.flavorLabel(o)).sort()), ['html', 'png'],
    'what a text field cannot hold is offered instead of lost');
});

test('ref lines still stage as refs, through the flavor path', async () => {
  reset();
  await paste(fakeCd({ types: ['text/plain'], data: { 'text/plain': 'me/a:lib/x.js\nme/b@dev:docs/y.md' } }));
  assert.equal(data.refItems.length, 2);
  assert.equal(data.localItems.length, 0);
});

test('an offer already on the stage under that name is not offered again', async () => {
  reset();
  const cd = fakeCd({ types: ['text/plain', 'text/html'], data: { 'text/plain': TSV, 'text/html': HTML } });
  await paste(cd);
  await data.stageFlavor(data.offers[0]);
  await paste(cd);
  assert.equal(data.offers.length, 0, 'the same paste twice is quiet, not cumulative');
});

// ---- a pasted image is a file, not an unviewable binary -----------------

test('a local image previews from its own bytes, with no repo behind it', async () => {
  reset();
  // The 1x1 PNG, as the bytes a paste or a drop hands over.
  const png = Uint8Array.from(atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  ), c => c.charCodeAt(0));
  store.stage = [{ local: true, id: 210, name: 'image.png', path: 'image.png', size: png.length, type: 'image/png', isText: false, bytes: png }];
  await data.view(data.localItems[0]);
  await tick(3);
  assert.equal(data.preview.note, '', 'an image is not refused as a binary');
  const vwr = previewViewer();
  assert.match(vwr.content, /^data:image\/png;base64,/, 'the bytes ride as a data URI, the one form a repo-less file can supply');
  data.preview = null;
});

test('the data URI keys on the extension, so a rename changes what it renders as', () => {
  const bytes = Uint8Array.from([1, 2, 3]);
  assert.match(data.dataUri({ name: 'a.png', bytes }), /^data:image\/png;/);
  assert.match(data.dataUri({ name: 'a.svg', bytes }), /^data:image\/svg\+xml;/);
  // A workbook carried a data URI from 2026-08-15, when the viewer gained a
  // mode that can draw one. This assertion read the other way until then, which
  // is the point of keying on `mimeFor`: the set that previews here is the set
  // the viewer can render, and it moves when that does.
  assert.match(data.dataUri({ name: 'a.xlsx', bytes }), /^data:application\/vnd\.openxml/);
  assert.equal(data.dataUri({ name: 'a.zip', bytes }), '', 'a binary the viewer cannot render still says so');
  assert.equal(data.dataUri({ name: 'a.png' }), '', 'no bytes, no URI');
});

test('a binary with no mode to draw it is still refused, and says which', async () => {
  reset();
  store.stage = [{ local: true, id: 211, name: 'bundle.zip', path: 'bundle.zip', size: 2048, type: '', isText: false, bytes: Uint8Array.from([1, 2]) }];
  await data.view(data.localItems[0]);
  await tick(3);
  assert.match(data.preview.note, /^Binary/);
  data.preview = null;
});

test('a dropped workbook previews rather than being refused', async () => {
  // The case the refusal above used to cover. A .xlsx reaching the stage as
  // local bytes now goes to the viewer, which is what makes naming a paste
  // `.xlsx` do something.
  reset();
  store.stage = [{ local: true, id: 212, name: 'book.xlsx', path: 'book.xlsx', size: 2048, type: '', isText: false, bytes: Uint8Array.from([1, 2]) }];
  await data.view(data.localItems[0]);
  await tick(3);
  assert.equal(data.preview.note, '', 'not refused as a binary');
  assert.match(previewViewer().content, /^data:application\/vnd\.openxml/);
  data.preview = null;
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
  assert.equal(data.localItems[0].path, 'notes.md', 'the preview and diff labels read path');
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

test('renaming under an open preview re-labels it', async () => {
  reset();
  const it = { local: true, id: 204, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' };
  store.stage = [it];
  await data.view(data.localItems[0]);
  await tick(3);
  assert.equal(data.preview.name, 'n.txt');
  data.startRename(data.localItems[0]);
  data.renameDraft = 'renamed.md';
  data.commitRename();
  assert.equal(data.preview.name, 'renamed.md');
  data.preview = null;
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

// ---- Save as surface: the bench-to-shelf bridge ------------------------
//
// This replaced a write of stage.files into a NAMED repo's .web-tools.json.
// That save overwrote (each one destroyed the last), wrote a cross-repo set
// into one repo's config, and dropped every local file in silence. What is
// asserted here is that all three are gone: the write lands in the registry's
// surfaces/ as a new file, it is a v2 stage/1 surface, and what cannot be
// carried is named. The envelope itself is covered in surface.test.mjs; this
// is about where the component puts it.

test('save mints a surface in the registry, never a repo manifest', async () => {
  reset();
  calls.length = 0;
  store.repo = 'me/open';
  window.__shell = { REGISTRY_REPO: 'me/registry' };
  store.stage = [
    { repo: 'me/open', ref: '', path: 'lib/a.js' },
    { local: true, id: 96, name: 'd.bin', path: 'd.bin', size: 1, isText: false, bytes: new Uint8Array([1]) },
  ];
  await data.saveAsSurface();
  delete window.__shell;
  const wrote = calls.filter(c => c.kind === 'save');
  assert.equal(wrote.length, 1);
  assert.equal(wrote[0].repo, 'me/registry', 'a cross-repo set belongs to no repo, so it lands in the registry');
  assert.match(wrote[0].path, /^surfaces\/\d{8}-\d{6}-.*\.surface$/, 'dated, so the directory sorts as history');
  assert.equal(calls.some(c => c.kind === 'save' && c.path === '.web-tools.json'), false,
    'no repo manifest is touched');
  const doc = plain_(wrote[0].value);
  assert.deepEqual(doc.manifest.schema, { name: 'surface', version: 2 });
  assert.deepEqual(doc.manifest.profile, { name: 'stage', version: 1 });
  assert.equal(doc.items.length, 1, 'binary bytes cannot ride a JSON string');
  assert.deepEqual(doc.items[0].target.source, { repository: 'me/open', path: 'lib/a.js' });
});

test('a second save appends rather than replacing the first', async () => {
  reset();
  calls.length = 0;
  window.__shell = { REGISTRY_REPO: 'me/registry' };
  store.stage = [{ repo: 'me/open', ref: '', path: 'lib/a.js' }];
  data.saveName = 'first';
  await data.saveAsSurface();
  data.saveName = 'second';
  await data.saveAsSurface();
  delete window.__shell;
  const paths = calls.filter(c => c.kind === 'save').map(c => c.path);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1], 'a history that overwrites is not one');
});

test('the dialog previews exactly what will be written', async () => {
  reset();
  window.__shell = { REGISTRY_REPO: 'me/registry' };
  store.stage = [
    { repo: 'me/open', ref: '', path: 'lib/a.js' },
    { local: true, id: 97, name: 'shot.png', path: 'shot.png', size: 1, isText: false, bytes: new Uint8Array([1]) },
  ];
  data.saveDest = 'me/other:docs';
  // The serialized form is not guessable from the list on screen, which is the
  // whole reason the dialog shows it rather than describing it.
  const preview = JSON.parse(data.savePreview);
  assert.deepEqual(preview.context, { destination: 'me/other:docs' });
  assert.equal(preview.items.length, 1);
  assert.deepEqual(plain_(data.saveSkipped), ['shot.png'], 'and what it will leave behind');
  assert.match(data.savePath, /^surfaces\//);
  delete window.__shell;
});

test('save does nothing with an empty stage', async () => {
  reset();
  calls.length = 0;
  store.stage = [];
  await data.saveAsSurface();
  assert.equal(calls.length, 0);
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
test('previewPair is the position and its neighbour, valid at both ends', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.js' }];
  await tick();
  data.preview = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.previewPair(), null, 'one item pairs with nothing');

  store.stage = [...store.stage, { repo: 'me/b', ref: '', path: 'y.js' }];
  await tick();
  // Exactly two: "the two", from either position. This is the case it is for.
  data.preview = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.previewPair().join(','), '0,1');
  data.preview = { i: 1, name: 'y.js', mode: 'file' };
  assert.equal(data.previewPair().join(','), '0,1');

  store.stage = [...store.stage, { repo: 'me/c', ref: '', path: 'z.js' }];
  await tick();
  data.preview = { i: 0, name: 'x.js', mode: 'file' };
  assert.equal(data.previewPair().join(','), '0,1');
  data.preview = { i: 1, name: 'y.js', mode: 'file' };
  assert.equal(data.previewPair().join(','), '1,2');
  data.preview = { i: 2, name: 'z.js', mode: 'file' };
  assert.equal(data.previewPair().join(','), '1,2', 'the last position compares the last two');
  data.preview = null;
});

test('the preview toggles into a diff over that pair, and back to the file', async () => {
  reset();
  store.stage = [
    { local: true, id: 401, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\ntwo\n' },
    { local: true, id: 402, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'one\nTWO\n' },
  ];
  await tick(3);
  await data.view(data.items[0]);
  await tick(3);
  assert.equal(data.preview.mode, 'file');

  await data.togglePreviewDiff();
  await tick(3);
  assert.equal(data.preview.mode, 'diff', 'same modal, different mode');
  assert.equal(data.diffA, 0);
  assert.equal(data.diffB, 1, 'the pair came from the position, not a select');
  assert.ok(data.diffRows, 'and it ran on the way in');
  assert.match(data.previewPairLabel(), /a\.md .* b\.md/);

  await data.togglePreviewDiff();
  await tick(3);
  assert.equal(data.preview.mode, 'file', 'and back');
  data.preview = null;
});

test('diffLabel names the item\'s own ref, or "default"', () => {
  assert.equal(data.diffLabel({ repo: 'me/a', ref: 'dev', path: 'x.js' }), 'me/a@dev:x.js');
  assert.equal(data.diffLabel({ repo: 'me/a', ref: '', path: 'x.js' }), 'me/a@default:x.js');
  assert.equal(data.diffLabel({ local: true, name: 'pasted.txt' }), '(local) pasted.txt');
});

// No control constructs a pair. The Diff lens's selects and "ref" boxes read
// as "type two refs to build one"; the boxes are gone, the selects are gone,
// and the two ways a pair arises are the preview's position (above) and a
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

test('a diff-mode link opens the preview on its diff, once', async () => {
  reset();
  data.preview = null;
  data.linkMode = 'diff';
  data._autoDiffed = false;
  store.stage = [
    { local: true, id: 301, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\ntwo\n' },
    { local: true, id: 302, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'one\nTWO\nthree\n' },
  ];
  await tick(4);
  // The link's intent is "look at this comparison", so it puts the reader in
  // front of one rather than selecting a control on the page.
  assert.equal(data.preview?.mode, 'diff', 'the preview opens, in diff mode');
  assert.ok(data.diffRows, 'and it ran without a click');
  assert.equal(data._autoDiffed, true, 'and only arms once');
  data.linkMode = '';
  data.preview = null;
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
