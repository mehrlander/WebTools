// Three behaviours ported up from mehrlander/home's submittal reader, which had
// grown its own docx/markdown/workbook stack beside this one.
//
// The point of each is that the viewer was WRONG without it, not merely
// different. Frontmatter: a `---` block is typed metadata across this estate,
// and markdown renders the fence as a rule and the next line as a setext
// heading, so a document opened on "date: …" set larger than its own title.
// Word tables: a document table cell holds a sentence and has to wrap, the
// opposite of a spreadsheet cell, and without the rule a prose table ran off
// the side of the pane. Sheets: the tab row is the right answer inside a pane
// and the wrong one on a phone at ten sheets, and a host could not build
// anything else because it could not learn what the sheets were called.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
window.Alpine = { data: () => {} };
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/viewer.js'), 'utf8'))();
const R = window.ViewRegistry;

// ── frontmatter ──────────────────────────────────────────────────────────────

test('a leading YAML block is removed before the markdown is parsed', () => {
  const md = '---\ndate: 2026-07-26\nstatus: living\n---\n# Real Title\n\nBody.\n';
  assert.equal(R.stripFrontmatter(md), '# Real Title\n\nBody.\n');
});

test('CRLF frontmatter is removed too', () => {
  const md = '---\r\ndate: 2026-07-26\r\n---\r\n# Title\r\n';
  assert.equal(R.stripFrontmatter(md), '# Title\r\n');
});

test('a rule further down the file is a rule, not a fence', () => {
  // The anchor is the whole rule: only a block that OPENS the file is metadata.
  const md = '# Title\n\nSome prose.\n\n---\n\nMore prose.\n';
  assert.equal(R.stripFrontmatter(md), md);
});

test('a document with no frontmatter is returned unchanged', () => {
  for (const md of ['# Title\n', '', 'plain text', '--- not a fence\n']) {
    assert.equal(R.stripFrontmatter(md), md);
  }
});

test('nullish content does not throw', () => {
  assert.equal(R.stripFrontmatter(undefined), '');
  assert.equal(R.stripFrontmatter(null), '');
});

test('the preview module runs the body through it, not the raw content', () => {
  const src = R.modules.find(m => m.id === 'preview').render.toString();
  assert.match(src, /stripFrontmatter/, 'the preview module parses raw content');
  assert.doesNotMatch(src, /marked\.parse\(f\.content\)/, 'raw content still reaches the parser');
});

// ── the Word table rule ──────────────────────────────────────────────────────

test('a Word table wraps and is held to the pane', () => {
  // The rules live in the module's scoped stylesheet, which render() returns
  // inline with the markup rather than injecting.
  const src = R.modules.find(m => m.id === 'docx').render();
  assert.match(src, /table-layout:\s*fixed/, 'a prose table can still run off the pane');
  assert.match(src, /overflow-wrap:\s*anywhere/, 'a long cell cannot break');
});

test('a Word table and a spreadsheet table are styled opposite, deliberately', () => {
  // The distinction is the finding, so it is held: nothing in the docx sheet
  // may pin a cell to one line, which is exactly what a SHEET cell needs.
  const src = R.modules.find(m => m.id === 'docx').render();
  assert.doesNotMatch(src, /white-space:\s*nowrap/,
    'the docx stylesheet pins cells to one line, which is the spreadsheet rule');
});

// ── the sheet list ───────────────────────────────────────────────────────────

test('the xlsx module publishes its sheets and a way to switch them', () => {
  const src = R.modules.find(m => m.id === 'xlsx').after.toString();
  assert.match(src, /host\.root\.__sheets\s*=/, 'the sheets are not published');
  assert.match(src, /list:/, 'the published shape has no list');
  assert.match(src, /show:/, 'the published shape offers no switch');
  // Names, because a deck labels its slides; a bare count would not do.
  assert.match(src, /name:/, 'the list carries no sheet names');
});

test('the switch is guarded by the mount still being alive and in range', () => {
  const src = R.modules.find(m => m.id === 'xlsx').after.toString();
  assert.match(src, /!stale\(\)\s*&&\s*i\s*>=\s*0\s*&&\s*i\s*<\s*sheets\.length/);
});

test('show() drops what the last file published', () => {
  // Read off the component factory rather than a mount: show() is async and
  // its first awaits load CDN assets that never resolve under jsdom.
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/viewer.js'), 'utf8');
  const showBody = src.slice(src.indexOf('async show(file, content, origin)'));
  assert.match(showBody.slice(0, 700), /this\.\$root\.__sheets = null/,
    'a host can read the previous workbook between show() and the next mount');
});
