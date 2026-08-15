// alpineComponents/viewer.js — logic tests for resolveDefaultMode, the resolver
// that picks which of a file's available modes it opens in. Covers the three
// `defaultMode` forms (string, ext map, function), the size-aware function case,
// and the availability safety net (a resolved mode that isn't valid for the file
// falls back to raw). Driven against the real ViewRegistry via a mounted
// instance; show()/switchMode are avoided because they load CDN assets that
// never resolve under jsdom, so the file is pointed at fixtures by setting
// file/content directly, which is all the resolver reads.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="v" x-data="viewer({ defaultMode: { md: 'preview', json: 'tree', '*': 'raw' } })"></div>
  </body></html>`,
});

// alpine-bundle.js defines the browser store the viewer reads for repo/ref.
const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/alpineComponents/viewer.js',
]);

const data = Alpine.$data(window.document.getElementById('v'));

// Set defaultMode + the shown file, then ask the resolver which mode wins.
// availableModes recomputes from file/content, so this exercises the real
// per-module test() gating without touching the asset-loading show() path.
const resolve = (name, content, dm) => {
  data.defaultMode = dm;
  data.file = name;
  data.content = content;
  return data.resolveDefaultMode(data.fileContext, data.availableModes).id;
};

test('mounts clean; the map opt is plumbed onto defaultMode', () => {
  assert.deepEqual(problems, []);
  assert.ok(data.description.length > 0);
  assert.equal(typeof data.defaultMode, 'object');
  assert.equal(data.defaultMode.md, 'preview');
});

test('string form: honored when available, else falls back to raw', () => {
  assert.equal(resolve('a.md', '# hi', 'code'), 'code');   // code tests true for md
  assert.equal(resolve('a.md', '# hi', 'raw'), 'raw');
  assert.equal(resolve('a.md', '# hi', 'tree'), 'raw');    // tree is json-only → fallback
});

test('ext map: keyed by extension with * catch-all', () => {
  const map = { md: 'preview', json: 'tree', '*': 'code' };
  assert.equal(resolve('notes.md', '# hi', map), 'preview');
  assert.equal(resolve('data.json', '[1,2,3]', map), 'tree');
  assert.equal(resolve('main.py', 'x=1', map), 'code');    // '*' → code, valid for py
});

test('ext map: unresolvable pick (no key/catch-all, or mode not available) → raw', () => {
  assert.equal(resolve('main.py', 'x=1', { md: 'preview' }), 'raw');       // py absent, no '*'
  assert.equal(resolve('data.json', '[1,2,3]', { '*': 'preview' }), 'raw'); // preview invalid for json
});

test('function form: receives the file, can key on size', () => {
  const bySize = (f) => f.content.length > 20 ? 'raw' : 'preview';
  assert.equal(resolve('a.md', '# hi', bySize), 'preview');         // short → preview
  assert.equal(resolve('a.md', '#'.repeat(40), bySize), 'raw');     // long → raw
});

test('function form: a falsy return or a throw falls back to raw', () => {
  assert.equal(resolve('a.md', '# hi', () => null), 'raw');
  assert.equal(resolve('a.md', '# hi', () => { throw new Error('boom'); }), 'raw');
});

test('no opt: defaultMode defaults to the raw string', async () => {
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'viewer()');
  window.document.body.appendChild(el);
  Alpine.initTree(el);
  await tick();
  assert.equal(Alpine.$data(el).defaultMode, 'raw');
});

// ── the table mode's readers (delimited files, added for the #data= route) ──

const VR = window.ViewRegistry;
// These helpers build arrays/objects inside the jsdom realm, whose prototypes
// aren't reference-equal to this realm's, so strict deepEqual rejects a
// structurally identical result. Round-trip the value into this realm first.
const plain = (v) => JSON.parse(JSON.stringify(v));

test('a CSV offers the table mode; raw stays available', () => {
  data.file = 'rows.csv';
  data.content = 'a,b\n1,2';
  const ids = data.availableModes.map(m => m.id);
  assert.ok(ids.includes('table'), 'csv should reach the table mode');
  assert.ok(ids.includes('raw'));
});

test('a JSON object (not an array) still does not offer table', () => {
  data.file = 'a.json';
  data.content = '{"a":1}';
  assert.ok(!data.availableModes.map(m => m.id).includes('table'));
});

test('parseDelimited handles quotes, escaped quotes, and CRLF', () => {
  const rows = plain(VR.parseDelimited('a,b\r\n"x,1","he said ""hi"""\r\nplain,2\r\n', ','));
  assert.deepEqual(rows, [['a', 'b'], ['x,1', 'he said "hi"'], ['plain', '2']]);
});

test('tableRows maps a CSV onto header-keyed records', () => {
  assert.deepEqual(
    plain(VR.tableRows({ ext: 'csv', content: 'plan,members\nPERS 2,158204\nTRS 3,79330\n' })),
    [{ plan: 'PERS 2', members: '158204' }, { plan: 'TRS 3', members: '79330' }],
  );
});

test('tableRows splits a TSV on tabs', () => {
  assert.deepEqual(
    plain(VR.tableRows({ ext: 'tsv', content: 'a\tb\n1\t2' })),
    [{ a: '1', b: '2' }],
  );
});

test('blank and duplicate headers get positional names, so no column is lost', () => {
  assert.deepEqual(
    plain(VR.tableRows({ ext: 'csv', content: 'a,,a\n1,2,3' })),
    [{ a: '1', col2: '2', col3: '3' }],
  );
});

test('a short row pads rather than dropping the record', () => {
  assert.deepEqual(
    plain(VR.tableRows({ ext: 'csv', content: 'a,b,c\n1,2' })),
    [{ a: '1', b: '2', c: '' }],
  );
});

test('tableRows passes a JSON array through, and names the shape it wanted', () => {
  assert.deepEqual(plain(VR.tableRows({ ext: 'json', content: '[{"a":1}]' })), [{ a: 1 }]);
  assert.throws(() => VR.tableRows({ ext: 'json', content: '{"a":1}' }), /array of records/);
});

test('no stray warnings or errors after the resolves', async () => {
  await tick();
  assert.deepEqual(problems, []);
});

test('the markdown preview scrolls on its pane, not on its text column', () => {
  // One element carrying both `overflow-auto` and the prose measure put the
  // scrollbar at the end of the TEXT, stranded mid-pane with empty space to its
  // right. It read as a layout bug and was reported as one.
  //
  // The class list looked right the whole time: it carried `max-w-none`. That
  // never took, because Tailwind v4 emits utilities into `@layer utilities`
  // while the typography plugin's stylesheet is unlayered, and an unlayered
  // declaration beats a layered one whatever the specificity or order. So the
  // structure is the fix, not the utility: the scroll container is the pane and
  // the measured column is its child.
  //
  // Rendered as a string, so this reads it as one rather than mounting: show()
  // pulls marked from the CDN, which never resolves under jsdom.
  const mod = window.ViewRegistry.modules.find(m => m.id === 'preview');
  window.marked = { parse: () => '<h1>x</h1>' };
  const html = mod.render({ ext: 'md', content: '# x' });

  const doc = new window.DOMParser().parseFromString(html, 'text/html');
  const pane = doc.body.firstElementChild;
  const column = pane.querySelector('.prose');
  assert.ok(column, 'the prose column is a child, not the pane itself');
  assert.match(pane.className, /overflow-auto/, 'the PANE scrolls');
  assert.doesNotMatch(column.className, /overflow-/, 'and the column does not');
  assert.match(column.className, /mx-auto/, 'the column is centred in the pane it no longer fills');
  assert.doesNotMatch(column.className, /max-w-/,
    'a max-w utility here loses to the unlayered .prose rule; use an inline style if a width is wanted');

  // An html payload is a framed document and has none of this. jsdom has no
  // URL.createObjectURL, so stand one up for the length of the call.
  window.URL.createObjectURL = () => 'blob:x';
  try {
    assert.match(mod.render({ ext: 'html', content: '<p>x</p>' }), /^<iframe/);
  } finally { delete window.URL.createObjectURL; }
});

// ── the pdf mode ────────────────────────────────────────────────────────────
//
// Its `after` fetches bytes and pulls pdf.js from a CDN, neither of which
// resolves under jsdom, so what is checked here is everything up to that: the
// classifier, the mode gating, and the exclusivity that decides what a PDF
// OPENS in. The render path itself is tools/test/viewer-pdf.mjs, in a browser.

test('mimeFor answers for images and PDFs, and stays quiet otherwise', () => {
  assert.equal(VR.mimeFor('pdf'), 'application/pdf');
  assert.equal(VR.mimeFor('png'), 'image/png');
  assert.equal(VR.mimeFor('svg'), 'image/svg+xml');
  assert.equal(VR.mimeFor('md'), '', 'text is not carried as a data: URI');
  assert.equal(VR.mimeFor(''), '');
});

test('isPdf and isImage stay separate questions', () => {
  assert.ok(VR.isPdf('pdf'));
  assert.ok(!VR.isImage('pdf'), 'a PDF must not reach the <img> path');
  assert.ok(VR.isImage('png') && !VR.isPdf('png'));
});

test('a PDF offers the pdf mode, with raw still one tap away', () => {
  data.file = 'budget.pdf';
  data.content = '%PDF-1.4 ...';
  const ids = data.availableModes.map(m => m.id);
  assert.ok(ids.includes('pdf'), 'a .pdf should reach the pdf mode');
  assert.ok(ids.includes('raw'), 'the escape hatch the mode strip promises');
  assert.ok(!ids.includes('image'), 'and it is not an image');
});

test('the pdf mode is exclusive: it beats a host blanket default of raw', () => {
  // show-repo's file view sets defaultMode 'raw', which is right for the only
  // kind of file it used to have and wrong for a PDF. Before this mode existed
  // that produced a pane of replacement characters, which is what `exclusive`
  // is here to prevent, exactly as it does for images.
  assert.equal(resolve('budget.pdf', '%PDF-1.4', 'raw'), 'pdf');
  assert.equal(resolve('budget.pdf', '%PDF-1.4', { '*': 'raw' }), 'pdf');
  assert.equal(resolve('budget.pdf', '%PDF-1.4', () => 'code'), 'pdf');
});

test('the pdf pane starts as a message and nothing else', () => {
  // The bar is revealed only when it has a pager or an address to carry, and
  // the page track is appended by `after` once the document opens, so a failed
  // fetch leaves the message visible rather than an empty frame that reads as
  // a blank page.
  const mod = VR.modules.find(m => m.id === 'pdf');
  const doc = new window.DOMParser().parseFromString(mod.render(), 'text/html');
  assert.match(doc.getElementById('viewer-pdf-bar').className, /hidden/);
  assert.match(doc.getElementById('viewer-pdf-open').className, /hidden/,
    'the inspect link stays hidden until there is an address behind it');
  assert.ok(doc.getElementById('viewer-pdf-msg').textContent.trim().length,
    'and the pane says what it is doing meanwhile');
  assert.equal(doc.querySelectorAll('canvas').length, 0,
    'no canvas is authored: one per page is built lazily by the deck');
});

test('the pdf stage can host a flex track, which needs min-h-0', () => {
  // A flex child defaults to min-height auto, so a track dropped into the
  // stage would be floored at its content height and grow the pane instead of
  // scrolling inside it. Same class of trap swipe-deck documents for min-w-0
  // on the horizontal axis, and it fails the same quiet way: it looks like a
  // styling slip rather than a broken pager.
  const mod = VR.modules.find(m => m.id === 'pdf');
  const doc = new window.DOMParser().parseFromString(mod.render(), 'text/html');
  const stage = doc.getElementById('viewer-pdf-stage');
  assert.match(stage.className, /flex-1/);
  assert.match(stage.className, /min-h-0/);
});
