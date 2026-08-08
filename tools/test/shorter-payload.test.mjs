// lib/kits/shorter-payload.js: the bare-or-envelope rule behind the #shorter= toss
// route. The narrowness is the point, so the cases that must NOT be read as an
// envelope carry as much weight here as the ones that must.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const win = {};
// The address grammar first: parseSpec delegates to it (lib/kits/repo-address.js),
// and this is the same load order pages/shorter.html keeps.
for (const f of ['lib/kits/repo-address.js', 'lib/kits/shorter-payload.js']) {
  new Function('window', readFileSync(path.join(repoRoot, f), 'utf8')).call(win, win);
}
const { read, isEnvelope, isReviewable, parseSpec, KIND } = win.ShorterPayload;

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
  assert.equal(isReviewable(p), false);
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

test('isReviewable requires both sides to hold something', () => {
  assert.equal(isReviewable({ original: 'a', proposal: 'b' }), true);
  assert.equal(isReviewable({ original: 'a', proposal: '   ' }), false);
  assert.equal(isReviewable({ original: '', proposal: 'b' }), false);
  assert.equal(isReviewable(null), false);
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
  assert.match(page, /gh\.load\('kits\/url-params\.js'\)/);
  assert.match(page, /gh\.load\('kits\/shorter-payload\.js'\)/);
  assert.match(page, /UrlParams\.get\('gz'\)/);
  assert.match(page, /UrlParams\.get\('src'\)/);
  const toss = readFileSync(path.join(repoRoot, 'pages/toss-render.html'), 'utf8');
  assert.match(toss, /'shorter':\s*\{[^}]*pages\/shorter\.html/, 'the route is registered');
});
