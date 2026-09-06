// kits/note.js — the note of the house popup rule (daisy-alpine mechanics.md,
// "Notes and cards"), held at the edges that decide whether a fact reaches
// the reader at all.
//
// What is checked here is the pair of properties that make it a note rather
// than a restyled `title`: the text is in the DOM (so a screenshot captures
// it), and the panel holds nothing tappable and never scrolls (so it stays a
// note and does not quietly become a card). Plus the two touch consequences
// the rule draws from that: the note closes on its own tap, and it fits.

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
      <td id="c" data-note-look="excel" data-note-title="slm4303:"
          data-note="input the hours anticipated">5,000</td>
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

test('the panel holds nothing tappable and never scrolls, which is the line between a note and a card', () => {
  // The moment its content needs a tap, a link or a copy button, or a
  // scrollbar, it is a card and the card half of the rule applies instead.
  assert.match(Note.CSS, /#wt-note\{[^}]*pointer-events:none/s);
  assert.match(Note.CSS, /#wt-note\{[^}]*overflow:hidden/s);
  assert.match(Note.CSS, new RegExp(`max-height:calc\\(${Note.LINES} \\* 1\\.45em`));
});

test('on a screen with no hover the open note takes its own tap and closes on it', () => {
  // The route out never depends on finding a tap-safe spot around the note:
  // the panel is the neutral ground. Under hover:none only, so where the
  // pointer can hover the box never sits between the pointer and the control.
  assert.match(Note.CSS, /@media \(hover:none\)\{#wt-note\[data-open\]\{pointer-events:auto\}\}/);
  Note.open('#a');
  const panel = window.document.getElementById('wt-note');
  let reached = false;
  window.document.body.addEventListener('pointerdown', () => { reached = true; });
  const ev = new window.Event('pointerdown', { bubbles: true, cancelable: true });
  panel.dispatchEvent(ev);
  assert.equal(panel.hasAttribute('data-open'), false, 'the tap on the note closed it');
  assert.equal(ev.defaultPrevented, true, 'and was swallowed');
  assert.equal(reached, false, 'nothing under the note saw it');
});

test('a note that fits says so; the overflow report is a browser measurement', () => {
  // jsdom lays nothing out, so every note fits here; what is held is the
  // contract, that fits() reads the open panel and answers for the element
  // asked about.
  Note.open('#a');
  assert.equal(Note.fits($('#a')), true);
  assert.equal(Note.fits($('#b')), true, 'a note that is not open cannot be overflowing');
  Note.close();
});

test('an empty note advertises nothing: no underline, no tab stop', () => {
  // A bound note whose expression resolves to '' still carries the attribute.
  // Drawing the affordance over it promises a note that does not exist, and a
  // tab stop on it is a stop that announces nothing. 54 of these were live on
  // the Map's Docs tab when this was measured.
  assert.match(Note.CSS, /\[data-note\]:not\(\[data-note=""\]\)\{[^}]*text-decoration:underline dotted/s);
  const el = window.document.createElement('span');
  el.setAttribute('data-note', '');
  window.document.body.append(el);
  Note.refresh();
  assert.equal(el.hasAttribute('tabindex'), false, 'no tab stop for a note with nothing to say');
  el.remove();
});

test('an element with nothing to underline opts out of the affordance', () => {
  // A table cell is the case: a spreadsheet render draws no underline anywhere
  // and the dotted rule would land on most of its numeric cells.
  assert.match(Note.CSS, /\[data-note\]:not\(\[data-note=""\]\)\{[^}]*text-decoration:underline dotted/s);
  assert.match(Note.CSS, /\[data-note\]\[data-note-bare\]\{text-decoration:none\}/);
});

test('a lead line is its own bold row above the note, and never markup', () => {
  // What the note is ABOUT, where data-note is what it says: a comment's
  // author, a form field's name. Excel formats both this way, which is why the
  // sheet render stopped joining them into "Fee Code: Enter …" itself.
  Note.open('#c');
  const panel = window.document.getElementById('wt-note');
  const lead = panel.querySelector('.wt-note-title');
  assert.equal(lead.textContent, 'slm4303:');
  assert.equal(lead.tagName, 'B');
  assert.equal(panel.textContent, 'slm4303:input the hours anticipated',
    'both parts are present; the row break is CSS, not a character');
  assert.match(Note.CSS, /\.wt-note-title\{display:block;font-weight:600\}/);
  Note.close();
});

test('a lead line written as text stays text', () => {
  const el = $('#c');
  el.setAttribute('data-note-title', '<img src=x onerror=alert(1)>');
  Note.open(el);
  const panel = window.document.getElementById('wt-note');
  assert.equal(panel.querySelectorAll('img').length, 0, 'the lead line was parsed as markup');
  assert.equal(panel.querySelector('.wt-note-title').textContent, '<img src=x onerror=alert(1)>');
  el.setAttribute('data-note-title', 'slm4303:');
  Note.close();
});

test('a look token is stamped on the panel and cleared by the next note', () => {
  // One panel serves every note on the page, so a look that stuck would leak
  // onto whatever the reader hovered next.
  const panel = window.document.getElementById('wt-note') || (Note.open('#a'), window.document.getElementById('wt-note'));
  Note.open('#c');
  assert.equal(panel.getAttribute('data-look'), 'excel');
  Note.open('#a');
  assert.equal(panel.hasAttribute('data-look'), false, 'the token outlived the note that asked for it');
  Note.close();
});

test('the kit ships exactly one look beyond the default, plain, and no imitation of anything', () => {
  // `plain` is the browser's own tooltip redrawn, a house need rather than a
  // page's. A page reproducing something else (Excel's box, in the sheet
  // render) owns that look, next to the code asking; the kit owns the hook.
  const looks = [...Note.CSS.matchAll(/data-look="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(looks, ['plain']);
});

test('a look set on an ancestor is the default for the notes under it', () => {
  // `<body data-note-look="plain">` makes every note on a table page plain in
  // one word; a note that names its own look still wins, since closest()
  // finds the element itself first.
  const panel = window.document.getElementById('wt-note');
  window.document.body.setAttribute('data-note-look', 'plain');
  Note.open('#a');
  assert.equal(panel.getAttribute('data-look'), 'plain');
  Note.open('#c');
  assert.equal(panel.getAttribute('data-look'), 'excel', 'the note\'s own token outranks the page default');
  window.document.body.removeAttribute('data-note-look');
  Note.open('#a');
  assert.equal(panel.hasAttribute('data-look'), false);
  Note.close();
});
