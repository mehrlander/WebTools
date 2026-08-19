// scripts/title-survey.py — the advisory detector for meaning that lives only
// in a `title` attribute (HTML-STYLE.md: "a title is not where meaning goes").
//
// What is worth pinning is the CLASSIFIER, not the report. The audit behind
// PR #447 ran twice by hand before this script existed and was wrong both
// times, at 88 and then 37 against a true 32, for exactly two reasons. Both are
// the kind of mistake that reads as a finding rather than a bug: an
// over-reporting audit sends someone to "fix" markup that was already fine.
//
// The script is python3/stdlib, so this drives it the way a person does,
// through the file system, and reads what it prints.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = 'scripts/title-survey.py';

// Run the survey over one snippet and return { counts, stranded: [values] }.
function survey(html) {
  const dir = mkdtempSync(join(tmpdir(), 'title-survey-'));
  try {
    const file = join(dir, 'probe.html');
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
  const r = survey('<div><span title="the only place this fact lives">*</span></div>');
  assert.equal(r.total, 1);
  assert.equal(r.stranded, 1);
  assert.deepEqual(r.values, ['the only place this fact lives']);
});

// TRAP 1. The element's own tag is not the answer. This is what took the
// hand-audit from a true 32 up to 37: a label inside a button reads as
// unreachable when you only look at the element carrying the attribute.
test('a title inside a button is reachable, since tapping the button reaches it', () => {
  const r = survey('<button @click="open()"><span title="what this opens">6</span></button>');
  assert.equal(r.reachable, 1);
  assert.equal(r.stranded, 0);
});

test('an ancestor several levels up still counts as reachable', () => {
  const r = survey('<a href="#x"><span><i></i><span title="deep label">go</span></span></a>');
  assert.equal(r.reachable, 1);
});

// A void element must not be pushed onto the stack. An unclosed <i> would
// otherwise make every later title in the file look like its child, and in a
// UI file full of icon glyphs that silently marks the whole file reachable.
test('a void element does not swallow the titles that follow it', () => {
  const r = survey('<button><i class="ph"></i></button><div><span title="after the icon">x</span></div>');
  assert.equal(r.stranded, 1, 'the span after the button is not inside it');
  assert.deepEqual(r.values, ['after the icon']);
});

// TRAP 2. `<` occurs inside attribute values. This is what made the hand-audit
// report 88: walking back to the nearest `<` lands inside `guideIdx <= 0`
// rather than at the tag that opens the element, so the ancestor is never seen.
test('a "<" inside an attribute value does not break the tag walk', () => {
  const r = survey('<button :disabled="i <= 0" @click="step()" title="newer PR"><i></i></button>');
  assert.equal(r.reachable, 1, 'the button is still recognised as a button');
  assert.equal(r.stranded, 0);
});

test('a title that only repeats the element\'s own x-text is an echo, not a finding', () => {
  const r = survey('<div><span :title="row.subject" x-text="row.subject"></span></div>');
  assert.equal(r.echo, 1);
  assert.equal(r.stranded, 0);
});

test('a title that says MORE than the visible text is stranded, not an echo', () => {
  const r = survey('<div><span :title="n + \' files: \' + list" x-text="n"></span></div>');
  assert.equal(r.stranded, 1);
});

test('a comment holding title= markup is not counted', () => {
  const r = survey('<div><!-- <span title="an example in prose">x</span> --><p>live</p></div>');
  assert.equal(r.total, 0);
});

test('both title and :title are read', () => {
  const r = survey('<div><span title="static"></span><span :title="bound"></span></div>');
  assert.equal(r.total, 2);
  assert.equal(r.stranded, 2);
});

// The report is the deliverable, so it has to name the rule it is applying:
// a list of line numbers with no statement of what is wrong is the tooltip
// problem one level up.
test('the report names the rule when it finds something', () => {
  const dir = mkdtempSync(join(tmpdir(), 'title-survey-'));
  try {
    const file = join(dir, 'probe.html');
    writeFileSync(file, '<div><span title="stranded fact">*</span></div>');
    const out = execFileSync('python3', [SCRIPT, file], { encoding: 'utf8' });
    assert.match(out, /a title is not where meaning goes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a clean file says so and reports nothing to fix', () => {
  const r = survey('<div><button title="Open on GitHub"><i></i></button></div>');
  assert.equal(r.stranded, 0);
  assert.equal(r.reachable, 1);
});
