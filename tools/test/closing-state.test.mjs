// kits/closing-state.js — the conventions' closing state, as one vocabulary.
//
// This kit exists to end a split, so most of what is worth pinning is that the
// split stays ended: every key the pattern can produce has a glyph, a gloss and
// a hue, and no consumer keeps a second table. A marker added to
// SURFACING.md lands in one file or it does not land.
//
// The parser itself is strict for one reason, and it is the reason a looser one
// would look correct for months: this repo's own sessions EDIT the conventions,
// so a reply can quote the whole vocabulary as a bulleted list. Line start plus
// a bold lead is what keeps a session from reading its own quotation as its
// state, and the two tests below are that case and its control.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const win = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/closing-state.js'), 'utf8'))(win);
const CS = win.ClosingState;

test('a marker at the start of a line with a bold lead is a state', () => {
  assert.deepEqual(CS.marks('work happened\n\n🟢 **Ready to continue.** Named on go.'), ['ready']);
  assert.deepEqual(CS.marks('🟣 **Merged.** It shipped.'), ['merged']);
  // A blockquote still closes a reply; the harness quotes them back that way.
  assert.deepEqual(CS.marks('> ⚪ **Clean exit.** Done.'), ['clean']);
});

test('the vocabulary quoted as a list is not a state', () => {
  // The exact shape a session editing SURFACING.md writes, which is why the
  // pattern demands a line start: a list marker fails it.
  const doc = [
    '  - 🟢 **Ready to continue:** work is ready to do now.',
    '  - 🟣 **Merged:** this branch merged.',
    '* ⚪ **Clean exit:** work here is done.',
  ].join('\n');
  assert.deepEqual(CS.marks(doc), []);
  // And a marker with no bold lead is prose about a state, not one.
  assert.deepEqual(CS.marks('🟢 is the marker we use for ready.'), []);
});

test('both spellings of the three variation-selector glyphs settle to one key', () => {
  // ⚪/⚪️, ✴️/✴ and ❇️/❇ are the same state written two ways, which is the whole
  // reason keys exist rather than glyphs being passed around.
  assert.deepEqual(CS.marks('⚪ **a**'), CS.marks('⚪️ **a**'));
  assert.deepEqual(CS.marks('✴️ **a**'), CS.marks('✴ **a**'));
  assert.deepEqual(CS.marks('❇️ **a**'), CS.marks('❇ **a**'));
});

test('order and duplicates survive, because an exchange that closed twice did', () => {
  const md = '🆚 **Choice needed.** Pick.\n\n…\n\n🟢 **Ready.** Go.\n\n🟢 **Ready.** Again.';
  assert.deepEqual(CS.marks(md), ['choice', 'ready', 'ready']);
});

test('every key the pattern can produce is complete in all three tables', () => {
  // The split this kit ended was exactly a key present in one table and absent
  // from another, so completeness is the invariant rather than a tidiness.
  const keys = [...new Set(Object.values(CS.MARK))];
  for (const k of keys) {
    assert.ok(CS.GLYPH[k], 'no glyph for ' + k);
    assert.ok(CS.GLOSS[k], 'no gloss for ' + k);
    assert.ok(CS.HUE[k], 'no hue for ' + k);
    assert.equal(CS.MARK[CS.GLYPH[k]], k, 'glyph and key disagree for ' + k);
  }
  assert.equal(keys.length, 11);
});

test('nobody keeps a second copy of the pattern or the table', () => {
  // repo-sessions-cache.js owned the parser and estate.js the glyph-and-gloss
  // table, each correct about its own half and neither able to see the other.
  // estate.js is in this list because it was the OTHER half: it kept its own
  // SESSION_STATE literal for one commit after this kit landed, which is the
  // split with an extra step rather than the split ended.
  for (const f of ['lib/kits/repo-sessions-cache.js', 'lib/kits/session-render.js',
                   'lib/kits/session-export.js', 'lib/alpineComponents/estate.js']) {
    const src = readFileSync(path.join(repoRoot, f), 'utf8');
    assert.doesNotMatch(src, /🟢\|❇/, f + ' rebuilt the pattern');
    assert.doesNotMatch(src, /'🟢':\s*'ready'/, f + ' rebuilt the glyph table');
    assert.doesNotMatch(src, /ready:\s*\['🟢'/, f + ' rebuilt the glyph and gloss table');
    for (const gloss of Object.values(CS.GLOSS)) {
      assert.ok(!src.includes(gloss), f + ' copied a gloss: ' + gloss);
    }
  }
});

// ── closings(): the same passages, carried whole ────────────────────────────
// `marks` says where a reply arrived; a row wants what it arrived AT, because
// every 🟢 lead reads "Ready to continue" and the sentence after it is the
// content of the state.

test('a closing carries its own block, to the end of the paragraph', () => {
  const md = 'Did it.\n\n🟢 **Ready to continue.** On "go" I will build it.\nAnd a second line.\n\nA later paragraph.';
  const [c] = CS.closings(md);
  assert.equal(c.key, 'ready');
  assert.equal(c.glyph, '🟢');
  assert.equal(c.text, '**Ready to continue.** On "go" I will build it.\nAnd a second line.');
});

test('the glyph is dropped and the emphasis kept, for the prose pass downstream', () => {
  // readAloud.speechText takes the emphasis off along with the link targets and
  // the fences, so handing it markdown is what keeps one reduction in one place.
  const [c] = CS.closings('🆚 **Choice needed.** A or B.');
  assert.match(c.text, /^\*\*Choice needed\.\*\*/);
  assert.doesNotMatch(c.text, /🆚/);
});

test('a passage that closes twice yields both, in order', () => {
  const md = '🆚 **Choice needed.** Pick.\n\n…\n\n🟢 **Ready.** Go.';
  assert.deepEqual(CS.closings(md).map(c => c.key), ['choice', 'ready']);
  assert.match(CS.closings(md)[1].text, /Go\./);
});

test('closings and marks agree on what counts as a state', () => {
  // Two readers of one pattern is exactly the split this kit ended, so the
  // quoted-vocabulary case has to fail both.
  const doc = '  - 🟢 **Ready to continue:** work is ready to do now.\n* ⚪ **Clean exit:** done.';
  assert.deepEqual(CS.closings(doc), []);
  for (const md of ['🟢 **a** b', '> ⚪ **c** d', 'no state here']) {
    assert.deepEqual(CS.closings(md).map(c => c.key), CS.marks(md));
  }
});
