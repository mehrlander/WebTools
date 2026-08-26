// The deck door has one owner, and the copies are held to it.
//
// swipeDeck.entry() is the estate's affordance for "this collection has a
// reader": one glyph, one wording, one hit target. Two of its three consumers
// call it and get that for free. The third cannot: show-repo's Branch detail
// is an Alpine template with its own x-show, :disabled and busy spinner, and
// the kit loads on demand, so it is not on the page when that template first
// renders. A host that waited for it would paint no button at all.
//
// So branch-brief keeps a literal, and this is what stops the literal drifting.
// It is the same shape the surfacing manifest uses against SURFACING.md: a copy
// that cannot be eliminated is held two-way by test instead. If someone
// restyles the door in the kit, this fails and names the file that has to
// follow.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/swipe-deck.js'), 'utf8'))();
const entry = window.swipeDeck.entry;
const brief = readFileSync(path.join(repoRoot, 'lib/alpineComponents/branch-brief.js'), 'utf8');

// The deck button's own class attribute, found by the handler that makes it the
// deck button. Anchoring on the handler rather than on the class string is the
// point: a test that grepped for the string could only ever confirm itself.
const deckBtnClasses = () => {
  const at = brief.indexOf('openFileDeck(0)');
  assert.ok(at > 0, 'branch-brief no longer has a button calling openFileDeck(0)');
  const m = /class="([^"]+)"/.exec(brief.slice(at, at + 600));
  assert.ok(m, 'the deck button has no literal class attribute');
  return m[1].split(/\s+/).filter(Boolean).sort().join(' ');
};

test('Branch detail wears the classes the kit owns', () => {
  // As a SET, not a string. Class order does not reach CSS, so pinning it would
  // fail on a reordering that changes nothing and teach people to ignore this.
  const want = entry.cls().split(/\s+/).filter(Boolean).sort().join(' ');
  assert.equal(deckBtnClasses(), want,
    'branch-brief\'s deck button must carry the same classes as swipeDeck.entry.cls()');
});

test('Branch detail wears the glyph the kit owns', () => {
  assert.ok(brief.includes(`ph ${entry.icon} text-lg max-sm:text-xl`),
    `branch-brief's deck button must carry ${entry.icon}`);
});

test('Branch detail wears the wording the kit owns, in both of its states', () => {
  // Pending: the compare has not been read, so there is no count to give.
  assert.ok(brief.includes(`'${entry.title(0, 'file')}'`),
    `the no-count title must read: ${entry.title(0, 'file')}`);
  // Counted: assembled around plural(), so the two ends are checked rather
  // than the expression, which is Alpine's to spell.
  const [head, tail] = entry.title(9, 'file').split('9 files');
  assert.ok(brief.includes(`'${head}' + plural(deckFiles.length, 'file') + '${tail}'`),
    `the counted title must assemble to: ${entry.title(9, 'file')}`);
});
