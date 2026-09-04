// kits/note.js — the middle tooltip tier, held at the two edges that decide
// whether a fact reaches the reader at all.
//
// The kit exists because the house style has three tiers and only two of them
// used to be built: `title` for a label carrying no fact, a built panel for
// anything the reader taps inside, and nothing in between for the common case,
// a sentence a reader looks at. What is checked here is the pair of properties
// that make it the middle tier rather than a restyled `title`: the text is in
// the DOM (so a screenshot captures it), and the panel cannot be entered (so it
// stays a note and does not quietly become a panel).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({
  html: `<!doctype html><html><body>
    <span id="a" data-note="Fetched from the repo when opened.">EXTERNAL</span>
    <table><tbody><tr>
      <td id="b" data-note-bare data-note="First line.&#10;&#10;Second line.">5,000</td>
    </tr></tbody></table>
  </body></html>`,
});
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/note.js'), 'utf8'))();
const Note = window.Note;
const $ = (sel) => window.document.querySelector(sel);

test('the kit registers window.Note and reads a note off an element', () => {
  assert.equal(typeof Note, 'object');
  assert.equal(Note.text($('#a')), 'Fetched from the repo when opened.');
  assert.equal(Note.text(window.document.body), null, 'an element with no note has none');
});

test('open() puts the text in the DOM, which is the whole reason this is not a title', () => {
  // A `title` cannot be captured in a screenshot, so a fact parked in one is
  // invisible to every review that happens through pixels. Note.open exists so
  // a shot can be taken of the note itself.
  Note.open('#a');
  const panel = window.document.getElementById('wt-note');
  assert.equal(panel.textContent, 'Fetched from the repo when opened.');
  assert.ok(panel.hasAttribute('data-open'));
  Note.close();
  assert.equal(panel.hasAttribute('data-open'), false);
});

test('a blank line in a note survives to the reader', () => {
  // A caller that joined two parts with a blank line (who left a comment, then
  // what the cell stores) meant the break. white-space:normal collapsed it and
  // ran the two parts together as one sentence.
  assert.match(Note.CSS, /white-space:pre-line/);
  assert.doesNotMatch(Note.CSS, /white-space:normal/);
  Note.open('#b');
  assert.equal(window.document.getElementById('wt-note').textContent,
    'First line.\n\nSecond line.');
  Note.close();
});

test('the panel cannot be entered, which is the line between a note and a panel', () => {
  // The moment its content needs a tap, a link or a copy button, it is a panel
  // and the full rule in daisy-alpine/references/mechanics.md applies instead.
  assert.match(Note.CSS, /#wt-note\{[^}]*pointer-events:none/s);
});

test('an element with nothing to underline opts out of the affordance', () => {
  // A table cell is the case: a spreadsheet render draws no underline anywhere
  // and the dotted rule would land on most of its numeric cells.
  assert.match(Note.CSS, /\[data-note\]\{[^}]*text-decoration:underline dotted/s);
  assert.match(Note.CSS, /\[data-note\]\[data-note-bare\]\{text-decoration:none\}/);
});
