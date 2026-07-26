// lib/shorter-payload.js: the bare-or-envelope rule behind the #shorter= toss
// route. The narrowness is the point, so the cases that must NOT be read as an
// envelope carry as much weight here as the ones that must.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const win = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/shorter-payload.js'), 'utf8')).call(win, win);
const { read, isEnvelope, isReviewable, parseSpec, splitBlocks, materialize, KIND } = win.ShorterPayload;

test('plain prose is bare, verbatim, with the right column left empty', () => {
  const p = read('The quick brown fox jumped over the lazy dog.');
  assert.equal(p.kind, 'bare');
  assert.equal(p.original, 'The quick brown fox jumped over the lazy dog.');
  assert.equal(p.proposal, '');
});

test('bare text is not trimmed or reflowed on the way through', () => {
  const src = '\n# Title\n\n  indented line  \n\ntrailing\n\n';
  assert.equal(read(src).original, src, 'the document is the payload, byte for byte');
});

test('a declared envelope fills both columns', () => {
  const p = read(JSON.stringify({ kind: KIND, title: 'Doc', original: 'long text', proposal: 'short' }));
  assert.equal(p.kind, 'envelope');
  assert.equal(p.title, 'Doc');
  assert.equal(p.original, 'long text');
  assert.equal(p.proposal, 'short');
});

test('an undeclared object with a string original is still an envelope', () => {
  const p = read(JSON.stringify({ original: 'long text', proposal: 'short' }));
  assert.equal(p.kind, 'envelope');
  assert.equal(p.original, 'long text');
});

test('an envelope may omit the proposal, which is the draft-one-for-me path', () => {
  const p = read(JSON.stringify({ kind: KIND, original: 'long text' }));
  assert.equal(p.kind, 'envelope');
  assert.equal(p.proposal, '', 'absent reads as empty, not undefined');
  assert.deepEqual(p.proposals, []);
  assert.equal(isReviewable(p), false);
});

test('shorter/1\'s single proposal reads as a one-entry proposals list', () => {
  // The pasted-from-a-chat shape has to keep working unchanged; it is the
  // common case, and shorter/2 exists only for what it cannot express.
  const p = read(JSON.stringify({ kind: 'shorter/1', original: 'long text', proposal: 'short' }));
  assert.equal(p.proposals.length, 1);
  assert.equal(p.proposals[0].text, 'short');
  assert.equal(p.proposals[0].label, 'Shorter');
  assert.equal(p.proposal, 'short', 'the legacy field still answers');
});

test('shorter/2 carries several versions, each with a label and a note', () => {
  const p = read(JSON.stringify({
    kind: KIND, original: 'a b c',
    proposals: [
      { label: 'Tight', note: 'trims wording', text: 'a c' },
      { label: 'Skeleton', text: 'a' },
    ],
  }));
  assert.equal(p.proposals.length, 2);
  assert.equal(p.proposals[0].note, 'trims wording');
  assert.equal(p.proposals[1].label, 'Skeleton');
  assert.equal(p.proposal, 'a c', 'the legacy field points at the first version');
  assert.equal(isReviewable(p), true);
});

test('an unlabelled version still gets a name to choose by', () => {
  const p = read(JSON.stringify({ kind: KIND, original: 'x y', proposals: [{ text: 'x' }] }));
  assert.equal(p.proposals[0].label, 'Version 1');
});

test('an empty version is dropped rather than offered as a blank choice', () => {
  const p = read(JSON.stringify({
    kind: KIND, original: 'x y', proposals: [{ text: '   ' }, { text: 'x' }, 'not an object'],
  }));
  assert.equal(p.proposals.length, 1);
  assert.equal(p.proposals[0].text, 'x');
});

test('splitBlocks is lossless: text plus separators rebuilds the document', () => {
  const doc = '# Title\n\nFirst para.\nSecond line.\n\n\n  Third block.\n\nlast';
  const parts = splitBlocks(doc);
  assert.equal(parts.length, 4);
  assert.equal(parts.map(b => b.text + b.sep).join(''), doc, 'byte for byte');
  assert.equal(parts[0].text, '# Title');
  assert.equal(parts[1].text, 'First para.\nSecond line.', 'a single newline does not split');
});

test('materialize substitutes only the blocks a version names', () => {
  const doc = 'one\n\ntwo\n\nthree';
  assert.equal(materialize(doc, {}), doc, 'an empty map is the identity');
  assert.equal(materialize(doc, { '1': 'TWO' }), 'one\n\nTWO\n\nthree');
  assert.equal(materialize(doc, { '0': 'ONE', '2': 'THREE' }), 'ONE\n\ntwo\n\nTHREE');
});

test('materialize takes the separator with a deleted block', () => {
  // Otherwise every deletion widens the run of blank lines left behind.
  const doc = 'one\n\ntwo\n\nthree';
  assert.equal(materialize(doc, { '1': '' }), 'one\n\nthree');
  assert.equal(materialize(doc, { '0': '', '1': '' }), 'three');
});

test('a block-keyed version is materialized on the way through read()', () => {
  const doc = 'alpha\n\nbeta\n\ngamma';
  const p = read(JSON.stringify({
    kind: KIND, original: doc,
    proposals: [{ label: 'Cut beta', blocks: { '1': '' } }],
  }));
  assert.equal(p.proposals[0].text, 'alpha\n\ngamma', 'downstream never sees the block form');
});

test('a JSON document being shortened is bare, not an envelope', () => {
  // The case the narrow discriminator exists for: someone tossing a config
  // file to tighten it must not have it read as a wrapper.
  const cfg = JSON.stringify({ name: 'thing', items: [1, 2, 3], note: 'verbose' }, null, 2);
  const p = read(cfg);
  assert.equal(p.kind, 'bare');
  assert.equal(p.original, cfg);
});

test('a JSON array is bare, and so is a non-string original', () => {
  assert.equal(read('[1,2,3]').kind, 'bare');
  assert.equal(read(JSON.stringify({ original: 42 })).kind, 'bare', 'original must be a string');
  assert.equal(read(JSON.stringify([{ original: 'x' }])).kind, 'bare', 'an array is never an envelope');
});

test('malformed JSON that opens with a brace falls back to bare', () => {
  const broken = '{ this is prose that starts with a brace';
  assert.equal(read(broken).kind, 'bare');
  assert.equal(read(broken).original, broken);
});

test('an addressed payload takes its title from the path when it carries none', () => {
  assert.equal(read('some prose', { name: 'created/essay.md' }).title, 'created/essay.md');
  assert.equal(read(JSON.stringify({ kind: KIND, title: 'Real', original: 'x' }), { name: 'p.md' }).title,
    'Real', 'a declared title wins over the filename');
});

test('isReviewable requires an original and at least one version', () => {
  const v = [{ label: 'A', note: '', text: 'b' }];
  assert.equal(isReviewable({ original: 'a', proposals: v }), true);
  assert.equal(isReviewable({ original: 'a', proposals: [] }), false);
  assert.equal(isReviewable({ original: '', proposals: v }), false);
  assert.equal(isReviewable(null), false);
  // and it agrees with what read() produces for a whitespace-only proposal
  assert.equal(isReviewable(read(JSON.stringify({ original: 'a', proposal: '   ' }))), false);
});

test('isEnvelope is exported for callers that only want the question answered', () => {
  assert.equal(isEnvelope({ kind: KIND }), true);
  assert.equal(isEnvelope({ original: 'x' }), true);
  assert.equal(isEnvelope({ items: [] }), false);
  assert.equal(isEnvelope('a string'), false);
  assert.equal(isEnvelope(null), false);
});

test('parseSpec reads the shared address grammar', () => {
  assert.deepEqual(parseSpec('owner/repo@feat/x:deep/file.md'),
    { repo: 'owner/repo', ref: 'feat/x', path: 'deep/file.md' });
  assert.equal(parseSpec('a/b/c:p.md'), null, 'a three-segment repo is not an address');
  assert.equal(parseSpec('plain/path.md'), null, 'no colon means a plain path');
});

test('a missing ref is empty, not "main", so the default branch is honored', () => {
  // The contents API falls through to the repo's default branch on ''. Pinning
  // 'main' would break a repo whose default is named otherwise.
  // StageLink.parseItem agrees; DataPayload.parseSpec still says 'main'.
  assert.equal(parseSpec('owner/repo:path.md').ref, '');
});

test('the page reads its inputs through the shared helpers and registers the route', () => {
  const page = readFileSync(path.join(repoRoot, 'pages/shorter.html'), 'utf8');
  assert.match(page, /gh\.load\('url-params\.js'\)/);
  assert.match(page, /gh\.load\('shorter-payload\.js'\)/);
  assert.match(page, /gh\.load\('shorter-merge\.js'\)/);
  assert.match(page, /UrlParams\.get\('gz',\s*loc\)/);
  assert.match(page, /UrlParams\.get\('src',\s*loc\)/);
  // The baked channel: a self-contained copy has no address bar, so it sets
  // the location the page reads instead.
  assert.match(page, /window\.__shorterLoc/);
  const toss = readFileSync(path.join(repoRoot, 'pages/toss-render.html'), 'utf8');
  assert.match(toss, /'shorter':\s*\{[^}]*pages\/shorter\.html/, 'the route is registered');
});
