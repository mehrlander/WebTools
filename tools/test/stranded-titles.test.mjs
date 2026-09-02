// scripts/stranded-titles.py — the advisory detector for meaning that lives only
// in a `title` attribute (the house style: "a tooltip worth having is worth building").
//
// What is worth pinning is the CLASSIFIER, not the report. The audit behind
// PR #447 ran three times by hand before this script existed and was wrong all
// three times, at 88, then 37, then 32 against a true 33. Each is the kind of
// mistake that reads as a finding rather than a bug: an over-reporting audit
// sends someone to "fix" markup that was already fine, and an under-reporting
// one closes the question. The third pass is the cautionary one, since it had
// the tag stack right and still shipped the echo bug caught below.
//
// The script is python3/stdlib, so this drives it the way a person does,
// through the file system, and reads what it prints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = 'scripts/stranded-titles.py';

// Run the scan over one snippet and return { counts, stranded: [values] }.
// `ext` picks how the script reads the file: an .html is JavaScript only inside
// its <script> blocks, a .js is JavaScript from the first byte.
function scan(html, ext = 'html') {
  const dir = mkdtempSync(join(tmpdir(), 'stranded-titles-'));
  try {
    const file = join(dir, `probe.${ext}`);
    writeFileSync(file, html);
    const out = execFileSync('python3', [SCRIPT, file], { encoding: 'utf8' });
    if (/no title attributes found/.test(out))
      return { total: 0, reachable: 0, echo: 0, stranded: 0, values: [] };
    const tally = out.match(/(\d+) titles; (\d+) reachable by tap, (\d+) echo visible text, (\d+) stranded/);
    assert.ok(tally, `no tally line in:\n${out}`);
    const stranded = [...out.matchAll(/^\s+\d+\s+<[\w:-]+>\s+(.*)$/gm)].map(m => m[1].trim());
    return { total: +tally[1], reachable: +tally[2], echo: +tally[3],
             stranded: +tally[4], values: stranded };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a title on a bare span, with nothing to tap, is stranded', () => {
  const r = scan('<div><span title="the only place this fact lives">*</span></div>');
  assert.equal(r.total, 1);
  assert.equal(r.stranded, 1);
  assert.deepEqual(r.values, ['the only place this fact lives']);
});

// TRAP 1. The element's own tag is not the answer. This is what put the second
// hand pass at 37: a label inside a button reads as unreachable when you only
// look at the element carrying the attribute.
test('a title inside a button is reachable, since tapping the button reaches it', () => {
  const r = scan('<button @click="open()"><span title="what this opens">6</span></button>');
  assert.equal(r.reachable, 1);
  assert.equal(r.stranded, 0);
});

test('an ancestor several levels up still counts as reachable', () => {
  const r = scan('<a href="#x"><span><i></i><span title="deep label">go</span></span></a>');
  assert.equal(r.reachable, 1);
});

// A void element must not be pushed onto the stack. An unclosed <i> would
// otherwise make every later title in the file look like its child, and in a
// UI file full of icon glyphs that silently marks the whole file reachable.
test('a void element does not swallow the titles that follow it', () => {
  const r = scan('<button><i class="ph"></i></button><div><span title="after the icon">x</span></div>');
  assert.equal(r.stranded, 1, 'the span after the button is not inside it');
  assert.deepEqual(r.values, ['after the icon']);
});

// TRAP 2. `<` occurs inside attribute values. This is what put the first hand
// pass at 88: walking back to the nearest `<` lands inside `guideIdx <= 0`
// rather than at the tag that opens the element, so the ancestor is never seen.
test('a "<" inside an attribute value does not break the tag walk', () => {
  const r = scan('<button :disabled="i <= 0" @click="step()" title="newer PR"><i></i></button>');
  assert.equal(r.reachable, 1, 'the button is still recognised as a button');
  assert.equal(r.stranded, 0);
});

test('a title that only repeats the element\'s own x-text is an echo, not a finding', () => {
  const r = scan('<div><span :title="row.subject" x-text="row.subject"></span></div>');
  assert.equal(r.echo, 1);
  assert.equal(r.stranded, 0);
});

// The fourth bug, and the one this file caught on its first run: an echo rule
// of `xtext in value` absorbs any short expression, so `x-text="n"` made every
// title containing an `n` look like a repetition of itself. Three real findings
// were hiding behind it, which is how a true 33 got reported as 32.
test('a title that says MORE than the visible text is stranded, not an echo', () => {
  const r = scan('<div><span :title="n + \' files: \' + list" x-text="n"></span></div>');
  assert.equal(r.stranded, 1);
});

test('a comment holding title= markup is not counted', () => {
  const r = scan('<div><!-- <span title="an example in prose">x</span> --><p>live</p></div>');
  assert.equal(r.total, 0);
});

test('both title and :title are read', () => {
  const r = scan('<div><span title="static"></span><span :title="bound"></span></div>');
  assert.equal(r.total, 2);
  assert.equal(r.stranded, 2);
});

// The report is the deliverable, so it has to name the rule it is applying:
// a list of line numbers with no statement of what is wrong is the tooltip
// problem one level up.
test('the report names the rule when it finds something', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stranded-titles-'));
  try {
    const file = join(dir, 'probe.html');
    writeFileSync(file, '<div><span title="stranded fact">*</span></div>');
    const out = execFileSync('python3', [SCRIPT, file], { encoding: 'utf8' });
    assert.match(out, /a tooltip worth having is worth building/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a clean file says so and reports nothing to fix', () => {
  const r = scan('<div><button title="Open on GitHub"><i></i></button></div>');
  assert.equal(r.stranded, 0);
  assert.equal(r.reachable, 1);
});

// TRAP 3. A tag named in a JAVASCRIPT comment is not markup, and it never
// closes, so before 2026-09-01 it stayed on the ancestor stack for the rest of
// the file and marked every later title reachable. HTML comments were already
// skipped, which is precisely why this stayed quiet: the handled case looked
// like the whole case. Found in home's budget-drs app/view/app.html, where one
// prose comment about tab semantics names `<a>`, `<span>` and `<button>`; all
// 36 titles below it reported reachable and 11 of them were stranded.
test('a tag named in a // comment does not join the ancestor stack', () => {
  const r = scan([
    '<script>',
    '// Every tab is now a <button>, which is focusable by construction.',
    'const row = `<span title="the note nobody can reach">x</span>`;',
    '</script>',
  ].join('\n'));
  assert.equal(r.stranded, 1, 'the span is not inside the commented-out button');
  assert.deepEqual(r.values, ['the note nobody can reach']);
});

test('a tag named in a /* */ comment does not join the ancestor stack either', () => {
  const r = scan('<script>\n/* wraps in an <a href="#"> on desktop */\n'
    + 'el.innerHTML = `<span title="stranded">x</span>`;\n</script>');
  assert.equal(r.stranded, 1);
});

// A .js file is JavaScript from the first byte, with no <script> to look for.
test('a bare .js file has its comments masked too', () => {
  const r = scan('// a <button> in prose\nconst h = `<span title="stranded in a kit">x</span>`;', 'js');
  assert.equal(r.stranded, 1);
});

// The masking guard that matters most: blanking a URL line would silently DROP
// findings, which is the failure mode this whole file exists to prevent.
test('a // inside a URL is not a comment, so titles after it survive', () => {
  const r = scan('<script>\nconst u = "https://example.com/x"; '
    + 'const h = `<span title="after the url">x</span>`;\n</script>');
  assert.equal(r.stranded, 1);
  assert.deepEqual(r.values, ['after the url']);
});

// 36 regex literals across this estate carry a quote. A scanner that read `/`
// as division would take the quote as a string opener and swallow the markup
// after it, so this is the case that forces mask_js to be a lexer.
test('a regex literal holding a quote does not swallow what follows', () => {
  const r = scan('<script>\nconst q = s.replace(/[\'"]/g, "");\n'
    + 'const h = `<span title="after the regex">x</span>`;\n</script>');
  assert.equal(r.stranded, 1);
  assert.deepEqual(r.values, ['after the regex']);
});

// Masking blanks in place rather than deleting, so the reported line still
// points at the real line in the real file. A report off by the length of the
// comments above it is worse than no report.
test('line numbers still point into the unmasked file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stranded-titles-'));
  try {
    const file = join(dir, 'probe.html');
    writeFileSync(file, '<script>\n/* a\n   multi\n   line <button> */\n'
      + 'const h = `<span title="on line five">x</span>`;\n</script>');
    const out = execFileSync('python3', [SCRIPT, file], { encoding: 'utf8' });
    assert.match(out, /^\s+5\s+<span>/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
