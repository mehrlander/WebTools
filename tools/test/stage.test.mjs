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
  async get(path) { return { text: 'CONTENT ' + this.repo + ':' + path, sha: 'x' }; }
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
  // The address grammar, ahead of the components: parseItem delegates to it,
  // and the pre-build boots it in this position for the same reason.
  'lib/repo-address.js',
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
  await data.view({ repo: 'me/a', ref: '', path: 'lib/x.js' });
  await tick(3);
  assert.equal(data.preview.name, 'lib/x.js');
  assert.equal(store.activeFile, null, 'stage preview never routes through Files');
  const vwr = previewViewer();
  assert.equal(vwr.file, 'lib/x.js');
  assert.match(vwr.content, /CONTENT me\/a:lib\/x.js/);
  assert.ok(vwr.fileUrls.some(u => /github\.com\/me\/a\/blob/.test(u.u)),
    'the origin gives the preview its GitHub link');
});

test('view shows a local text item inline', async () => {
  await data.view({ local: true, id: 90, name: 'n.txt', path: 'n.txt', size: 2, isText: true, text: 'hi' });
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

test('save writes only the ref items, to the NAMED target repo', async () => {
  reset();
  calls.length = 0;
  store.repo = 'me/open';
  data.saveTarget = 'me/open';
  store.stage = [
    { repo: 'me/open', ref: '', path: 'lib/a.js' },
    { local: true, id: 96, name: 'd.bin', path: 'd.bin', size: 1, isText: false, bytes: new Uint8Array([1]) },
  ];
  await data.save();
  const cfgSave = calls.find(c => c.kind === 'save' && c.path === '.web-tools.json');
  assert.equal(cfgSave.repo, 'me/open');
  assert.deepEqual(plain_(cfgSave.value.stage.files), ['lib/a.js']);
});

test('save to another repo (a general staging) fully qualifies the refs', async () => {
  reset();
  calls.length = 0;
  store.repo = 'me/open';
  data.saveTarget = 'me/registry';
  store.stage = [{ repo: 'me/open', ref: '', path: 'lib/a.js' }];
  await data.save();
  const cfgSave = calls.find(c => c.kind === 'save' && c.path === '.web-tools.json');
  assert.equal(cfgSave.repo, 'me/registry');
  assert.deepEqual(plain_(cfgSave.value.stage.files), ['me/open:lib/a.js']);
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

test('toggleRecent stages a recent file and unstages it on the second tap', () => {
  reset();
  const it = { repo: 'me/open', path: 'lib/new.js', date: '2026-07-18T10:00:00Z' };
  assert.equal(data.recentStaged(it), false);
  data.toggleRecent(it);
  assert.deepEqual(plain_(data.refItems), [{ repo: 'me/open', ref: '', path: 'lib/new.js' }]);
  assert.equal(data.recentStaged(it), true);
  data.toggleRecent(it);
  assert.equal(data.refItems.length, 0);
});

test('repo pills are single-select: one repo, switch, back to all', async () => {
  reset();
  store.repo = 'me/open';
  store.config = null;
  window.__shell = { estateRepos: [{ repo: 'me/fav' }] };
  await data.loadRecent(true);
  delete window.__shell;
  assert.deepEqual(plain_(data.repoPills()), [{ repo: 'me/open', n: 2 }, { repo: 'me/fav', n: 1 }]);
  data.togglePill('me/fav');
  assert.deepEqual(plain_(data.finderRows().map(r => r.repo)), ['me/fav'], 'single-select shows only that repo');
  data.togglePill('me/open');
  assert.deepEqual(plain_(data.finderRows().map(r => r.repo)), ['me/open', 'me/open'], 'selecting another switches');
  data.togglePill('me/open');
  assert.equal(data.finderRows().length, 3, 'tapping the selected pill returns to all');
});

test('search matches filename-contains over the cached trees, capped', () => {
  data.finderTab = 'search';
  data._treePaths = { 'me/open': ['lib/alpha.js', 'docs/notes.md'], 'me/fav': ['src/alpha-beta.js'] };
  data.searchQ = 'alpha';
  assert.deepEqual(plain_(data.finderRows().map(r => [r.repo, r.path])), [
    ['me/open', 'lib/alpha.js'],
    ['me/fav', 'src/alpha-beta.js'],
  ]);
  data.searchQ = 'x';
  assert.equal(data.finderRows().length, 0, 'under 2 chars, no matches attempted');
  data.finderTab = 'recent';
  data._treePaths = null;
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
  data.diffA = 0; data.diffB = 1; data.diffARef = ''; data.diffBRef = '';
  await data.runDiff();
  assert.ok(data.diffRows, 'diff produced');
  assert.deepEqual(plain_(data.diffRows.filter(r => r.t !== 'ctx')), [{ t: 'add', line: 'extra' }]);
  assert.equal(data.diffStat, '+1 \u22120');
});

test('diffHandoff builds the Diff page address, honoring ref overrides', () => {
  reset();
  store.stage = [
    { repo: 'me/a', ref: '', path: 'lib/x.js' },
    { repo: 'me/b', ref: 'feat/y', path: 'docs/z.md' },
  ];
  data.diffA = 0; data.diffB = 1; data.diffARef = ''; data.diffBRef = '';
  const u = new URL(data.diffHandoff);
  assert.match(u.pathname, /\/diff-tool\.html$/, 'points at the Diff page');
  assert.equal(u.searchParams.get('a'), 'me/a:lib/x.js');
  assert.equal(u.searchParams.get('b'), 'me/b@feat/y:docs/z.md');

  // An override ref is what makes same-file-twice a version diff, so the
  // handoff has to carry it, not the item's own ref.
  data.diffARef = 'main';
  assert.equal(new URL(data.diffHandoff).searchParams.get('a'), 'me/a@main:lib/x.js');
  data.diffARef = '';
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

test('save refuses a malformed target without writing', async () => {
  reset();
  calls.length = 0;
  data.saveTarget = 'not a repo';
  store.stage = [{ repo: 'me/open', ref: '', path: 'lib/a.js' }];
  await data.save();
  assert.equal(calls.length, 0);
});

// ---- Diff lens: A/B auto-pairing, dump, and the review-prompts copy -----

test('a second staged item auto-pairs into B, untouched', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.js' }];
  await tick();
  assert.equal(data.diffA, 0);
  assert.equal(data.diffB, 0, 'one item: nothing to pair yet');
  store.stage = [...store.stage, { repo: 'me/b', ref: '', path: 'y.js' }];
  await tick();
  assert.equal(data.diffB, 1, 'second item auto-pairs into B');
});

test('auto-pairing stops once the user has picked A/B by hand', async () => {
  reset();
  await tick();
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.js' }, { repo: 'me/b', ref: '', path: 'y.js' }];
  await tick();
  assert.equal(data.diffB, 1);
  data._diffTouched = true;
  data.diffB = 0;
  store.stage = [...store.stage, { repo: 'me/c', ref: '', path: 'z.js' }];
  await tick();
  assert.equal(data.diffB, 0, 'a manual pick is not overridden by a later addition');
});

test('diffLabel names the override ref when given, else the item\'s own ref or "default"', () => {
  const refItem = { repo: 'me/a', ref: 'dev', path: 'x.js' };
  assert.equal(data.diffLabel(refItem, ''), 'me/a@dev:x.js');
  assert.equal(data.diffLabel(refItem, 'main'), 'me/a@main:x.js');
  assert.equal(data.diffLabel({ repo: 'me/a', ref: '', path: 'x.js' }, ''), 'me/a@default:x.js');
  assert.equal(data.diffLabel({ local: true, name: 'pasted.txt' }, ''), '(local) pasted.txt');
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

test('removing a staged item clamps a now-out-of-range B and clears the stale diff', async () => {
  reset();
  store.stage = [{ repo: 'me/a', ref: '', path: 'x.js' }, { repo: 'me/b', ref: '', path: 'y.js' }];
  await tick();
  assert.equal(data.diffB, 1, 'auto-paired to the second item');
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

test('decodePrompts drops malformed entries and bad payloads', () => {
  const StageLink = window.StageLink;
  assert.deepEqual(plain_(StageLink.decodePrompts('')), []);
  assert.deepEqual(plain_(StageLink.decodePrompts('not-base64-@@@')), []);
  const enc = StageLink.encodePrompts([{ label: 'ok', ask: 'a' }, { label: '', ask: 'no label' }, { label: 'no ask' }]);
  assert.deepEqual(plain_(StageLink.decodePrompts(enc)), [{ label: 'ok', ask: 'a' }], 'only complete {label,ask} survive');
});

test('a diff-mode stage opens on the Diff tab and auto-runs the diff once', async () => {
  reset();
  data.outTab = 'out';
  data.linkMode = 'diff';
  data._autoDiffed = false;
  store.stage = [
    { local: true, id: 301, name: 'a.md', path: 'a.md', size: 4, isText: true, text: 'one\ntwo\n' },
    { local: true, id: 302, name: 'b.md', path: 'b.md', size: 4, isText: true, text: 'one\nTWO\nthree\n' },
  ];
  await tick();
  assert.equal(data.outTab, 'diff', 'flips to the Diff tab');
  await tick();
  assert.ok(data.diffRows, 'ran the diff without a click');
  assert.equal(data._autoDiffed, true, 'and only arms once');
  data.linkMode = '';
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
  data.diffA = 0; data.diffB = 1; data.diffARef = ''; data.diffBRef = '';
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
