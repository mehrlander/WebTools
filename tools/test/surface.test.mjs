// lib/kits/surface.js — the surface envelope, and the two bridges the stage and the
// shelf collapse across.
//
// What is under test is the set of decisions, not the field copying:
//
//   1. DUAL-READ IS ONE-WAY. v1 normalizes to v2 for display and is never
//      rewritten by having been read. The whole migration rests on that: the
//      Surfaces editor round-trips raw text, so a v1 file survives a reader
//      that only speaks v2.
//   2. v1's `kind` SPLITS into `type` and `target.source`. It fused genre with
//      transport, which is why the migration is not a rename.
//   3. THE STAGE ROUND-TRIPS. A working set promoted to a surface and pulled
//      back is the same set. This is the claim the convergence is built on, and
//      the reason the contract calls a repository source "the stage's item
//      shape" in the first place.
//   4. WHAT IS LEFT OUT IS REPORTED. Bytes that cannot ride a JSON string, and
//      prose items with no file behind them, are named rather than dropped in
//      silence. The old save dropped local files with no warning at all.
//   5. SAVING APPENDS. Two saves of the same set produce two filenames, because
//      a history that overwrites is not one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
new window.Function(readFileSync(path.join(repoRoot, 'lib/kits/surface.js'), 'utf8'))();
const S = window.Surface;

const V1 = {
  manifest: { name: 'Old shelf', schema_version: 1, created: '2026-01-02T03:04:05Z' },
  items: [
    { kind: 'github_blob', title: 'a.md', repo: 'me/proj', ref: 'main', path: 'docs/a.md' },
    { kind: 'github_dir', title: 'docs', repo: 'me/proj', path: 'docs' },
    { kind: 'url', title: 'A page', url: 'https://example.com/x' },
    { kind: 'note', title: 'Why', body: 'because', commentary: 'still true' },
    { kind: 'github_blob', title: 'by url', url: 'https://github.com/me/proj/blob/v2/lib/b.js' },
  ],
};

test('a v1 document reads as v2, and says it was v1', () => {
  const s = S.read(V1);
  assert.equal(s.wasV1, true);
  assert.deepEqual({ ...s.manifest.schema }, { name: 'surface', version: 2 });
  assert.equal(s.manifest.created_at, '2026-01-02T03:04:05Z', 'created becomes created_at');
  assert.equal(s.manifest.schema_version, undefined, 'the v1 stamp does not survive alongside the v2 one');
});

test('kind splits into type and target.source', () => {
  const [blob, dir, url, note, byUrl] = S.read(V1).items;
  assert.equal(blob.type, 'file');
  assert.deepEqual({ ...blob.target.source }, { repository: 'me/proj', path: 'docs/a.md', ref: 'main' });
  assert.equal(dir.type, 'directory');
  assert.equal(S.ref(dir).dir, true);
  assert.equal(url.type, 'link');
  assert.equal(S.uri(url), 'https://example.com/x');
  assert.equal(note.type, 'note');
  assert.equal(note.content, 'because', 'v1 body becomes v2 content');
  assert.equal(note.commentary, 'still true', 'annotations ride through unchanged');
  // v1 let a repo-backed item carry only a github.com URL. Unpacking it at the
  // one normalizing site is why no read site needs the regex any more.
  assert.deepEqual({ ...S.ref(byUrl) }, { repo: 'me/proj', ref: 'v2', path: 'lib/b.js', dir: false });
});

test('reading a v1 file does not rewrite it', () => {
  const before = JSON.stringify(V1);
  S.read(V1);
  assert.equal(JSON.stringify(V1), before, 'normalization is for display, in memory only');
});

test('a v2 document passes through', () => {
  const v2 = {
    manifest: { name: 'New', created_at: '2026-08-03T00:00:00Z', schema: { name: 'surface', version: 2 } },
    items: [{ id: 'x', title: 'x.md', type: 'file', target: { source: { repository: 'me/proj', path: 'x.md' } } }],
  };
  const s = S.read(v2);
  assert.equal(s.wasV1, false);
  assert.equal(s.items[0].id, 'x');
});

test('a non-surface is null, distinguishing unreadable from empty', () => {
  assert.equal(S.read('not json'), null);
  assert.equal(S.read({ items: [] }), null, 'no manifest, not a surface');
  assert.equal(S.read(JSON.stringify(V1)).items.length, 5, 'a JSON string parses');
});

test('an item key is its subject, not its id', () => {
  const it = { id: 'anything', title: 't', type: 'file',
               target: { source: { repository: 'me/proj', ref: 'dev', path: 'a.md' } } };
  assert.equal(S.key(it), 'me/proj@dev:a.md');
  assert.equal(S.gh(it), 'https://github.com/me/proj/blob/dev/a.md');
  // A ref-less source stays ref-less: parse honestly, resolve late. The link
  // builder is the one boundary allowed to supply 'main'.
  const bare = { id: 'b', title: 't', type: 'file', target: { source: { repository: 'me/proj', path: 'a.md' } } };
  assert.equal(S.key(bare), 'me/proj:a.md');
  assert.equal(S.gh(bare), 'https://github.com/me/proj/blob/main/a.md');
});

test('a path-only source is local, and travels only with its content', () => {
  const packed = { id: 'l', title: 'n.md', type: 'file', target: { source: { path: 'n.md' } }, content: 'hi' };
  const bare = { id: 'l2', title: 'n2.md', type: 'file', target: { source: { path: 'n2.md' } } };
  assert.equal(S.local(packed).content, 'hi');
  assert.equal(S.local(bare).content, null, 'declared local, but nothing to carry');
  assert.equal(S.ref(packed), null, 'a local source is not a repository source');
});

test('a working set round-trips through a surface', () => {
  const staged = [
    { repo: 'me/proj', ref: '', path: 'a.md' },
    { repo: 'you/other', ref: 'dev', path: 'lib/b.js' },
    { local: true, name: 'notes.md', text: '# notes', size: 7 },
  ];
  const { surface, skipped } = S.fromStage(staged);
  assert.equal(skipped.length, 0);
  assert.deepEqual({ ...surface.manifest.profile }, { name: 'stage', version: 1 });
  const back = S.toStage(surface);
  assert.equal(back.items.length, 3);
  assert.deepEqual({ ...back.items[0] }, { repo: 'me/proj', ref: '', path: 'a.md' });
  assert.deepEqual({ ...back.items[1] }, { repo: 'you/other', ref: 'dev', path: 'lib/b.js' });
  assert.equal(back.items[2].local, true);
  assert.equal(back.items[2].text, '# notes', 'a local file keeps its bytes across the round trip');
});

test('what cannot be carried is named, not dropped', () => {
  // The old save wrote a ref list into a repo manifest and lost every local
  // file without saying so. Binary bytes still cannot ride a JSON string, but
  // the caller now learns which ones.
  const { surface, skipped } = S.fromStage([
    { repo: 'me/proj', ref: '', path: 'a.md' },
    { local: true, name: 'shot.png', bytes: new Uint8Array([1, 2]), size: 2 },
  ]);
  assert.deepEqual([...skipped], ['shot.png']);
  assert.equal(surface.items.length, 1);

  // And in the other direction, a surface's prose has no file behind it.
  const mixed = { manifest: { name: 'm' }, items: [
    { id: 'n', title: 'A note', type: 'note', content: 'prose' },
    { id: 'f', title: 'a.md', type: 'file', target: { source: { repository: 'me/proj', path: 'a.md' } } },
  ] };
  const { items, skipped: left } = S.toStage(S.read(mixed));
  assert.equal(items.length, 1);
  assert.deepEqual([...left], ['A note']);
});

test('a diff pair records which two items, not just that there is a diff', () => {
  const { surface } = S.fromStage(
    [{ repo: 'me/proj', ref: '', path: 'a.md' }, { repo: 'me/proj', ref: 'dev', path: 'a.md' }],
    { compare: { a: 0, b: 1 } });
  assert.equal(surface.items[0].view.mode, 'diff');
  assert.equal(surface.items[1].view.mode, 'diff');
  assert.deepEqual([...surface.items[0].related].map(r => ({ ...r })),
    [{ item: 'me/proj@dev:a.md', relation: 'compares-to' }]);
});

test('context carries only what stays true with no tool running', () => {
  const { surface } = S.fromStage([{ repo: 'me/proj', ref: '', path: 'a.md' }], {
    destination: 'me/other:docs',
    prompts: [{ label: 'Clarity', ask: 'Where does it lose you?' }],
  });
  assert.equal(surface.context.destination, 'me/other:docs', 'a proposed destination is a claim about the set');
  assert.equal(surface.context.prompts.length, 1);
  // No send state, no bundle options, no lens overrides.
  assert.deepEqual([...Object.keys(surface.context)].sort(), ['destination', 'prompts']);
  const { surface: bare } = S.fromStage([{ repo: 'me/proj', ref: '', path: 'a.md' }]);
  assert.deepEqual({ ...bare.context }, {}, 'nothing said, nothing written');
});

test('a name is earned from the contents', () => {
  const one = S.fromStage([{ repo: 'me/proj', ref: '', path: 'lib/a.md' }]).surface;
  assert.equal(one.manifest.name, 'a.md');
  const many = S.fromStage([
    { repo: 'me/proj', ref: '', path: 'lib/a.md' },
    { repo: 'me/proj', ref: '', path: 'lib/b.md' },
  ]).surface;
  assert.equal(many.manifest.name, 'a.md +1');
});

test('saving appends: two saves of one set are two files', () => {
  const { surface } = S.fromStage([{ repo: 'me/proj', ref: '', path: 'a.md' }]);
  const first = S.fileName(surface, '2026-08-03T17:20:00Z');
  const second = S.fileName(surface, '2026-08-03T18:05:00Z');
  assert.notEqual(first, second, 'a second save never lands on the first file');
  assert.match(first, /^20260803-172000-a-md\.surface$/);
  assert.match(S.fileName(surface, '2026-08-03T17:20:00Z'), /^\d{8}-\d{6}-/, 'dated first, so the directory sorts as history');
});

test('write drops the empties and stamps v2', () => {
  const { surface } = S.fromStage([{ repo: 'me/proj', ref: '', path: 'a.md' }]);
  const out = S.write(surface);
  assert.deepEqual({ ...out.manifest.schema }, { name: 'surface', version: 2 });
  assert.equal('description' in out.manifest, false, 'nothing said, nothing written');
  assert.equal('context' in out, false, 'an empty context is absent, not {}');
  assert.equal('ref' in out.items[0].target.source, false, 'an unspecified ref is not written as empty');
});
