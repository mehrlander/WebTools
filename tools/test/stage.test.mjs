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
  async save(path, value, msg) { calls.push({ kind: 'save', repo: this.repo, path, value, msg }); return { content: { sha: 'x' } }; }
  async saveBytes(path, bytes, msg) { calls.push({ kind: 'saveBytes', repo: this.repo, path, bytes, msg }); return { content: { sha: 'x' } }; }
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
  assert.equal(data.localItems[0].name, 'pasted.txt');
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

test('copyLink refuses a link when only local files are staged', () => {
  reset();
  store.stage = [{ local: true, id: 95, name: 'x', path: 'x', size: 1, isText: true, text: '' }];
  data.linkCopied = false;
  data.copyLink();
  assert.equal(data.linkCopied, false, 'no link minted from local-only stage');
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

test('copyLink carries the bespoke prompts back into the minted link', () => {
  reset();
  clipWrites.length = 0;
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.md' }];
  data.linkPrompts = [{ label: 'Tone', ask: 'Did the tone drift?' }];
  data.copyLink();
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
