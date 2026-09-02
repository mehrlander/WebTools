// kits/read-aloud.js — the markdown-to-speech reduction, and the chunker under it.
//
// The player is not tested here and deliberately: it is a thin shell over
// speechSynthesis, which does not exist in node, and every interesting thing
// about it (a cancelled utterance's callback arriving late) is an engine
// behaviour a stub would only re-enact from the same assumption that wrote the
// code. What IS testable is the half that decides what a listener hears, and
// that half is where a regression is silent: nothing about a spoken page turns
// red when a rule starts eating sentences.
//
// The chunker's own case is the reason this file exists. Its first version
// matched sentences rather than splitting them and dropped every line whose
// full stops were internal, so "the fix is in read-aloud.js." reached the queue
// as "js." and the loss was invisible to anyone not listening closely. The last
// two tests hold the property that catches that class outright: nothing goes in
// that does not come out.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, makeWindow } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/read-aloud.js'), 'utf8');
const load = () => {
  const { window } = makeWindow();
  new window.Function(src)();
  return window.readAloud;
};
const R = load();

test('a link is its label, and the URL is not spoken', () => {
  const out = R.speechText('See [the branch page](https://mehrlander.github.io/web-tools/pages/branch.html) first.');
  assert.equal(out, 'See the branch page first.');
});

test('a bare URL goes, wherever it sits', () => {
  assert.equal(R.speechText('Open https://example.com/a/b?c=d now.'), 'Open now.');
});

test('a fenced block is dropped whole, and an unclosed one takes the tail', () => {
  assert.equal(R.speechText('Before.\n\n```bash\necho hi\n```\n\nAfter.'), 'Before.\n\nAfter.');
  assert.equal(R.speechText('Before.\n\n```\nnever closed'), 'Before.');
});

test('a code span holding a path reads as its basename', () => {
  assert.equal(R.speechText('It is in `lib/alpineComponents/session-brief.js`.'), 'It is in session-brief.js.');
});

test('a basename that names a role keeps the folder that names the subject', () => {
  // "index.html" identifies nothing in a repo with eleven of them.
  assert.equal(R.speechText('The tab is in `app/index.html`.'), 'The tab is in app index.html.');
  assert.equal(R.speechText('See `skills/tasks/SKILL.md`.'), 'See tasks SKILL.md.');
});

test('a command in a code span is not a path and is dropped for being long', () => {
  const out = R.speechText('Run `git diff origin/main...HEAD --name-only --diff-filter=ACMR` first.');
  assert.equal(out, 'Run first.');
  // Short enough to hear, so it stays.
  assert.equal(R.speechText('Run `npm test` first.'), 'Run npm test first.');
});

test('a table becomes its cells and loses its rule', () => {
  const md = '| File | Why |\n| --- | --- |\n| a.js | it broke |';
  assert.equal(R.speechText(md), 'File, Why\na.js, it broke');
});

test('markers go: headings, list bullets, emphasis, rules, emoji', () => {
  const md = '## Heading\n\n- **one** thing\n- _two_\n\n---\n\n\u{1F7E2} **Ready to continue:** go.';
  assert.equal(R.speechText(md), 'Heading\n\none thing\ntwo\n\nReady to continue: go.');
});

test('a paragraph break survives and every other run of space collapses', () => {
  assert.equal(R.speechText('a\n\n\n\nb   c\nd'), 'a\n\nb c\nd');
});

// The kit is evaluated in a jsdom realm, so its arrays are that realm's; a
// strict deep-equal compares prototypes and would fail on every one of them.
// Spreading brings the values home.
const chunks = (t, max) => [...R.chunks(t, max)];

test('chunks split at a sentence end followed by space, never inside a filename', () => {
  const one = 'The fix is in read-aloud.js and version 4.5.2 shipped.';
  assert.deepEqual(chunks(one, 180), [one]);
  assert.deepEqual(chunks('One. Two. Three.', 180), ['One. Two. Three.']);
  assert.deepEqual(chunks('One. Two. Three.', 8), ['One.', 'Two.', 'Three.']);
});

test('chunking loses no word, which is the property the first version broke', () => {
  const rec = [
    'Merged as c7a5e4f. Unsubscribed from the PR.',
    'The change is in session-brief.js, and the count is 4.2 KB.',
    'No stop at all here',
    'Ends without one too',
  ].join('\n\n');
  for (const max of [40, 80, 180]) {
    const joined = R.chunks(rec, max).join(' ').replace(/\s+/g, ' ');
    assert.equal(joined, rec.replace(/\s+/g, ' '), `max=${max} must not drop or duplicate a word`);
  }
});

test('a long line breaks at a space, and only a long WORD breaks inside itself', () => {
  const line = 'alpha beta gamma delta epsilon zeta eta theta';
  assert.equal(chunks(line, 16).join(' '), line, 'every cut lands on a space that was there');
  const long = 'x'.repeat(60);
  assert.equal(chunks(long, 20).join(''), long, 'the one word with no space in it is cut, not dropped');
});

test('speechText leaves nothing to say only when there was nothing to hear', () => {
  assert.equal(R.speechText('```\ncode\n```'), '');
  assert.equal(R.speechText('![shot](a.png)'), '');
  assert.equal(R.speechText(''), '');
  assert.equal(R.speechText(null), '');
});
