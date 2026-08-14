// The snags index's parser and its repeat detector.
//
// The generated table is already held to its source by artifacts-lockstep, but
// that only proves the bytes match what the code produces. It says nothing
// about whether the code produces the right thing, and the part most able to
// go quietly wrong is the DETECTOR: a wrong table is visible on the page, while
// a detector that has stopped detecting looks exactly like a log with no
// repeats in it.
//
// Three tunable numbers decide what it catches: two or more shared tokens, the
// stop-word list, and the three-character floor on a token. Tighten the stop
// list and a real repeat stops firing; loosen the threshold and the commit hook
// prints noise until nobody reads it. Both failures are silent, so both are
// pinned here.
//
// The parser gets the same treatment for one specific reason: its boundary rule
// changed twice in one sitting, and the wrong version reported a snag as seen
// fourteen times when it was seen once. The cases below are the two readings
// that were actually gotten wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { parse, render, suspects, tokens } from '../build/snags-index.mjs';

// A fixture in the file's real shape: the closing index marker, then entries.
const doc = (body) => `[//]: # (/snags-index)\n\n${body}`;

const entry = (slug, title, seen, extra = '') =>
  `### ${slug}: ${title}\nSome prose about it.${extra}\n*(seen: ${seen})*\n→ [somewhere.md](somewhere.md)\n`;

test('a sighting belongs to the entry it sits in', () => {
  const { entries, orphanSightings } = parse(doc(
    entry('first-snag', 'the first', '2026-08-01') + '\n' +
    entry('second-snag', 'the second', '2026-08-02')));
  assert.deepEqual(entries.map(e => e.slug), ['first-snag', 'second-snag']);
  assert.deepEqual(entries.map(e => e.seen), [['2026-08-01'], ['2026-08-02']]);
  assert.equal(orphanSightings, 0);
});

test('a `---` between entries does not lose one', () => {
  const { entries } = parse(doc(
    entry('first-snag', 'the first', '2026-08-01') + '\n---\n\n' +
    entry('second-snag', 'the second', '2026-08-02')));
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].seen, ['2026-08-01']);
});

test('two dates on one line are two sightings of one snag', () => {
  const { entries } = parse(doc(entry('twice-bitten', 'it came back', '2026-08-01, 2026-08-09')));
  assert.deepEqual(entries[0].seen, ['2026-08-01', '2026-08-09']);
});

// The regression that recovered two real dates. Several entries carry a dated
// correction or a "corrected move" as a second bold paragraph, and each of
// those dates is another sighting of the SAME snag. An earlier boundary rule
// treated a bold paragraph as the start of something else and dropped them.
test('a dated bold sub-paragraph counts toward its own entry', () => {
  const { entries, orphanSightings } = parse(doc(
    '### one-snag: it happened\nProse.\n*(seen: 2026-08-01)*\n' +
    '\n**Corrected later: it happens on write too.** More prose.\n*(seen: 2026-08-07)*\n' +
    '→ [somewhere.md](somewhere.md)\n'));
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].seen, ['2026-08-01', '2026-08-07']);
  assert.equal(orphanSightings, 0);
});

// The other half of that trade. Nothing bounds an unslugged block appended
// BELOW an entry, so the guard covers the way entries are actually added,
// newest on top, where a block with no heading lands above the first one.
test('a sighting above the first entry is reported as orphaned', () => {
  const { entries, orphanSightings } = parse(doc(
    '**An old-shape block with no slug.** Prose.\n*(seen: 2026-07-01)*\n\n' +
    entry('a-real-entry', 'the only slugged one', '2026-08-01')));
  assert.equal(entries.length, 1);
  assert.equal(orphanSightings, 1);
});

test('an entry with no seen line is undated, not uncounted', () => {
  const { entries } = parse(doc('### no-date: it has no sighting line\nProse.\n→ [x.md](x.md)\n'));
  assert.deepEqual(entries[0].seen, []);
  assert.match(render(entries), /\| undated \|/);
});

test('the table leads with repeats and marks the count', () => {
  const { entries } = parse(doc(
    entry('seen-once', 'a one-off', '2026-08-01') + '\n' +
    entry('seen-thrice', 'a regular', '2026-08-02, 2026-08-03, 2026-08-04')));
  const rows = render(entries).split('\n').filter(l => l.startsWith('| `'));
  assert.match(rows[0], /seen-thrice.*\*\*×3\*\*/);
  assert.match(rows[1], /seen-once/);
  assert.doesNotMatch(rows[1], /×/);
});

// The case the detector exists for, kept as the literal pair that got past a
// session: two slugs for one snag, sharing no whole name and two words.
test('the detector catches the pair that prompted it', () => {
  const { entries } = parse(doc(
    entry('headless-shot-prose-flat', 'typography CSS misses in screenshots', '2026-08-07') + '\n' +
    entry('headless-prose-unstyled', 'a shot of markdown looks broken', '2026-08-14')));
  const pairs = suspects(entries);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].shared.sort(), ['headless', 'prose']);
});

test('one shared word is not enough, or every loader snag would pair', () => {
  const { entries } = parse(doc(
    entry('loader-boots-early', 'a boot order problem', '2026-08-01') + '\n' +
    entry('loader-swallows-errors', 'an unrelated loader problem', '2026-08-02')));
  assert.deepEqual(suspects(entries), []);
});

test('tokens drop stop words and fragments, so a slug is matched on its nouns', () => {
  assert.deepEqual(tokens('a-shot-of-the-prose-is-flat'), ['shot', 'prose', 'flat']);
});

// The whole point of the 2026-08-14 migration, held so it cannot quietly
// regress: every sighting in the real log sits inside a slugged entry.
test('the committed log is fully slugged, with no uncounted sighting', () => {
  const md = readFileSync(join(repoRoot, 'docs/SNAGS.md'), 'utf8');
  const { entries, orphanSightings } = parse(md);
  assert.equal(orphanSightings, 0,
    'an entry was added in the old bold-lead shape; give it a `### slug: title` heading');
  assert.ok(entries.length > 25, `only ${entries.length} entries parsed; the format may have drifted`);
  assert.ok(entries.every(e => e.title), 'an entry heading has no title after its slug');
});
