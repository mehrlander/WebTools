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

test('the markdown preview scrolls on its pane, and its column is uncapped', () => {
  // One element carrying both `overflow-auto` and the prose measure put the
  // scrollbar at the end of the TEXT, stranded mid-pane with empty space to its
  // right. It read as a layout bug and was reported as one.
  //
  // Two separate things are pinned here, and they were once conflated. The
  // SCROLLBAR is fixed by structure: the scroll container is the pane and the
  // measured column is its child. The WIDTH is fixed by the bang. `max-w-none`
  // alone never took, because Tailwind v4 emits utilities into `@layer
  // utilities` while the typography plugin's stylesheet is unlayered, and an
  // unlayered declaration beats a layered one whatever the specificity or
  // order; `!max-w-none` carries `!important` and reaches past the layer.
  // Reading that as "no utility can reach it" left the column centred at 506px
  // for as long as it stood (daisy-alpine rule 3, fixed 2026-09-03).
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
  assert.doesNotMatch(column.className, /mx-auto/, 'the column is flush left, not a centred corridor');
  assert.match(column.className, /!max-w-none/,
    'the BANG form: a plain max-w-none is layered and loses to the unlayered .prose 65ch measure');

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
  // Everything else is built by `after` once the document opens: the column,
  // the floating pager, and the two controls that go to the VIEWER's header.
  // So a failed fetch leaves the message visible rather than an empty frame
  // that reads as a blank page.
  const mod = VR.modules.find(m => m.id === 'pdf');
  const doc = new window.DOMParser().parseFromString(mod.render(), 'text/html');
  assert.ok(doc.querySelector('[data-pdf="msg"]').textContent.trim().length,
    'the pane says what it is doing meanwhile');
  assert.equal(doc.querySelectorAll('canvas').length, 0,
    'no canvas is authored: one per page is built lazily');
});

test('the pdf module authors no chrome of its own', () => {
  // The rule the viewer's header comment states, held as a check rather than
  // as a hope: a mode puts its controls in the host's header through
  // ctx.controls, and a strip of its own is a second row of chrome for one
  // file. This module had one, carrying a pager, a byte size, a flow switch
  // and an Inspect link, and inside the stage reader it was the THIRD band
  // above the page.
  const mod = VR.modules.find(m => m.id === 'pdf');
  const doc = new window.DOMParser().parseFromString(mod.render(), 'text/html');
  for (const gone of ['bar', 'open', 'flow', 'size', 'prev', 'next', 'page']) {
    assert.equal(doc.querySelector(`[data-pdf="${gone}"]`), null,
      `${gone} is not authored into the pane`);
  }
  assert.equal(doc.querySelectorAll('button, a').length, 0,
    'and the pane holds no control at all before the document opens');
});

test('the pdf stage is the positioning context its column and pager need', () => {
  // Both are `absolute inset-0`/`absolute bottom-3`, so they resolve against
  // the nearest positioned ancestor. Without `relative` here that is whatever
  // the host happens to offer, which in the stage reader is the deck's own
  // panel: the column would then cover the deck's header and footer rather
  // than the page area. It fails as a layout that looks deliberate.
  const mod = VR.modules.find(m => m.id === 'pdf');
  const doc = new window.DOMParser().parseFromString(mod.render(), 'text/html');
  const stage = doc.querySelector('[data-pdf="stage"]');
  assert.match(stage.className, /relative/);
  assert.match(stage.className, /h-full/);
});

// ── the header's path split ─────────────────────────────────────────────────
//
// Reported from a phone: the header read "docs/…" for a file whose NAME was
// the whole point, because a path truncated from the right loses its
// identifying end. The split is what lets the directory go first.

test('dirPart and namePart divide a path, slash riding with the directory', () => {
  data.file = 'projects/budget-drs/data/source/DP-ML-RH-Adding Roth Option to DCP.pdf';
  assert.equal(data.dirPart, 'projects/budget-drs/data/source/');
  assert.equal(data.namePart, 'DP-ML-RH-Adding Roth Option to DCP.pdf');
  assert.equal(data.dirPart + data.namePart, data.file, 'the two halves are the whole path');
});

test('a bare filename is all name and no directory', () => {
  data.file = 'rows.csv';
  assert.equal(data.dirPart, '');
  assert.equal(data.namePart, 'rows.csv');
});

test('the name can still be truncated once the directory is gone', () => {
  // The first fix gave the name shrink-0, which stopped it truncating at all:
  // a 38-character filename then ran straight through the buttons beside it.
  // The directory carries the weight instead, so it disappears first and the
  // name only gives way when it is the last thing left.
  data.file = 'a/b.md';
  const doc = new window.DOMParser().parseFromString(data.template, 'text/html');
  const name = [...doc.querySelectorAll('span')].find(s => s.getAttribute('x-text') === 'namePart');
  const dir = [...doc.querySelectorAll('span')].find(s => s.getAttribute('x-text') === 'dirPart');
  assert.ok(name && dir, 'both halves are rendered');
  assert.match(name.className, /truncate/, 'the name ellipsises rather than overflowing');
  assert.doesNotMatch(name.className, /shrink-0/, 'and it is allowed to give way at all');
  assert.match(dir.className, /shrink-\[9999\]/, 'the directory absorbs the shrinking first');
});

test('a workbook opens in the sheet mode, whatever the host asked for', () => {
  // The registry mounted above sets defaultMode { md, json, '*': 'raw' }, so a
  // workbook would fall to 'raw' by that map. It must not: raw for a ZIP is a
  // screen of replacement characters, which is what every surface here showed
  // before this mode existed.
  const R = window.ViewRegistry;
  const f = { name: 'book.xlsx', ext: 'xlsx', content: '', repo: 'o/r' };
  const modes = R.getModes(f);
  // Spread into a node-realm literal: getModes builds its array inside jsdom,
  // and assert/strict compares prototypes, so a cross-realm Array never matches.
  assert.deepEqual([...modes.map(m => m.id)], ['raw', 'sheet', 'xlsx'],
    'the sheet render, the grid, and raw one tap away');

  const v = window.Alpine.$data(window.document.getElementById('v'));
  assert.equal(v.resolveDefaultMode(f, modes).id, 'sheet');
});

test('isWorkbook and mimeFor agree on which extensions are workbooks', () => {
  const R = window.ViewRegistry;
  assert.ok(R.isWorkbook('xlsx'));
  assert.ok(R.isWorkbook('xlsm'), 'a macro workbook is the same ZIP');
  assert.ok(!R.isWorkbook('xls'), 'the pre-2007 binary format is not a ZIP and is not read here');
  assert.ok(!R.isWorkbook('csv'), 'a csv is text and belongs to the table mode');
  for (const ext of ['xlsx', 'xlsm']) {
    assert.match(R.mimeFor(ext), /spreadsheet|ms-excel/, ext);
  }
  assert.equal(R.mimeFor('txt'), '', 'a type the viewer cannot render carries no mime');
  assert.equal(R.mimeFor('png'), 'image/png', 'and the image map still answers');
});

test('the sheet mode is exclusive, and the image mode still is too', () => {
  // Both make the same argument about a host's blanket defaultMode, so if one
  // ever loses the flag the other's reasoning has quietly changed as well.
  const byId = Object.fromEntries(window.ViewRegistry.modules.map(m => [m.id, m]));
  assert.equal(byId.sheet.exclusive, true);
  assert.equal(byId.image.exclusive, true);
  // The grid reads the same extension and must NOT be exclusive: two exclusive
  // modules over one extension make resolveDefaultMode's "take the first"
  // arbitrary, which is a coin toss decided by array order.
  assert.ok(!byId.xlsx.exclusive, 'the grid defers to the sheet render');
});

test('one exclusive mode per file, which is what resolveDefaultMode assumes', () => {
  const R = window.ViewRegistry;
  for (const ext of ['xlsx', 'xlsm', 'png', 'pdf', 'docx', 'md', 'csv', 'json', 'js']) {
    const exclusive = R.getModes({ name: 'f.' + ext, ext, content: '' }).filter(m => m.exclusive);
    assert.ok(exclusive.length <= 1, `${ext} has ${exclusive.length} exclusive modes`);
  }
});

test('a Word document opens on the page render, and the reading view is still offered', () => {
  const R = window.ViewRegistry;
  const modes = R.getModes({ name: 'form.docx', ext: 'docx', content: '' });
  const ids = modes.map(m => m.id);
  assert.ok(ids.includes('page'), `page missing from ${ids}`);
  assert.ok(ids.includes('docx'), `docx missing from ${ids}`);
  assert.equal(modes.find(m => m.exclusive)?.id, 'page');
  assert.equal(resolve('form.docx', '', 'raw'), 'page', 'a host\'s blanket raw cannot mean "the ZIP as text"');
  // And a workbook is untouched by the document pair.
  assert.ok(!R.getModes({ name: 'f.xlsx', ext: 'xlsx', content: '' }).some(m => m.id === 'page'));
});

test('the page render scrubs a link it cannot vouch for and opens the rest in a new tab', () => {
  const R = window.ViewRegistry;
  const box = window.document.createElement('div');
  box.innerHTML = '<a href="https://ofm.wa.gov/x">web</a><a href="mailto:a@b.gov">mail</a>' +
    '<a href="#_Toc123">anchor</a><a href="javascript:alert(1)">bad</a><a href="file:///etc/passwd">worse</a>';
  R.scrubLinks(box);
  const links = [...box.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href'), a.target]);
  assert.deepEqual(links, [
    ['web', 'https://ofm.wa.gov/x', '_blank'],
    ['mail', 'mailto:a@b.gov', '_blank'],
    ['anchor', '#_Toc123', ''],
    ['bad', null, ''],
    ['worse', null, ''],
  ]);
});

test('a narrowed workbook reference is claimed by the grid', () => {
  const R = window.ViewRegistry;
  const grid = R.modules.find(m => m.id === 'xlsx');
  const f = { name: 'book.xlsx', ext: 'xlsx', content: '' };
  assert.ok(grid.claims(f, { filter: { col: 'Fund', find: '600-6' } }),
    'rows are what a col/find reference names, and only the grid narrows to rows');
  assert.ok(!grid.claims(f, {}), 'an unnarrowed workbook opens on the sheet render');
  assert.ok(!grid.claims(f, { filter: { col: 'Fund' } }), 'half a narrowing is not one');
  assert.ok(!grid.claims({ name: 'a.csv', ext: 'csv', content: '' }, { filter: { col: 'a', find: 'b' } }),
    'a csv is the table mode, not this one');
});
