// .claude/skills/caption/build-branch-review.mjs — the /caption emitter for
// the 🌿 authored layer. The decision under test (tracker:
// branch-authored-layer-surface): branch-review/1 is the format /caption
// emits, and an emitted surface must (a) validate against BOTH schemas and
// (b) project through the page's own reader, BranchBrief.readAuthored, onto
// the four authored fields. Pure mode (--changes) keeps this independent of
// the checkout's git state, so CI's shallow clone cannot flake it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(repoRoot, '.claude/skills/caption/build-branch-review.mjs');

const dir = mkdtempSync(path.join(tmpdir(), 'br-emit-'));
writeFileSync(path.join(dir, 'notes.json'), JSON.stringify({
  name: 'demo branch review',
  intent: 'Show the emitter round-trips.',
  open: ['one open thread'],
  omitted: ['thumbnails ride the wrap-up'],
  files: { 'lib/a.js': 'the why for a.js' },
  base_revision: 'b'.repeat(40), head_revision: 'h'.repeat(40),
}));
writeFileSync(path.join(dir, 'changes.json'), JSON.stringify([
  { path: 'lib/a.js', status: 'modified' },
  { path: 'docs/new.md', status: 'added' },
  { path: 'old.sh', status: 'deleted' },
  { path: 'lib/b.js', status: 'renamed', previous_path: 'lib/b-old.js' },
]));

const run = (...extra) => execFileSync('node', [script,
  '--notes', path.join(dir, 'notes.json'), '--changes', path.join(dir, 'changes.json'),
  '--repo', 'me/proj', '--branch', 'feature-x', '--base', 'main',
  '--now', '2026-08-07T00:00:00Z', ...extra], { encoding: 'utf8' });

const surface = JSON.parse(run());

test('the emitted surface validates against both schemas', () => {
  const require = createRequire(import.meta.url);
  const Ajv = require('ajv/dist/2020').default;
  const ajv = new Ajv({ strict: false, allErrors: true });
  for (const rel of ['surface-v2.schema.json', 'profiles/branch-review-v1.schema.json']) {
    const schema = JSON.parse(readFileSync(path.join(repoRoot, 'docs/envelopes/schemas', rel), 'utf8'));
    assert.ok(ajv.validate(schema, surface), rel + ': ' + ajv.errorsText(ajv.errors));
  }
  assert.equal(surface.manifest.profile.name, 'branch-review');
  assert.equal(surface.context.base.revision, 'b'.repeat(40));
  const changed = surface.items.filter(i => i.role === 'changed');
  assert.equal(changed.length, 4);
  assert.equal(changed.find(i => i.id === 'lib/b.js').change.previous_path, 'lib/b-old.js');
  assert.equal(changed.find(i => i.id === 'old.sh').change.status, 'deleted');
});

test('the page reader projects it onto the four authored fields', () => {
  // The same load arrangement branch-brief.test.mjs uses: the kit into a stub
  // window, survey first for compareFields.
  const win = {};
  for (const f of ['lib/kits/branch-survey.js', 'lib/kits/branch-brief.js']) {
    new Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(win);
  }
  const a = win.BranchBrief.readAuthored(surface);
  assert.ok(a, 'the reader accepts the emitted surface');
  assert.equal(a.intent, 'Show the emitter round-trips.');
  assert.deepEqual(a.open, ['one open thread']);
  assert.deepEqual(a.omitted, ['thumbnails ride the wrap-up']);
  assert.equal(a.files['lib/a.js'], 'the why for a.js');
});

test('an invalid surface is an error, not an artifact', () => {
  writeFileSync(path.join(dir, 'bad-changes.json'), JSON.stringify([
    { path: 'x.js', status: 'exploded' },
  ]));
  assert.throws(() => execFileSync('node', [script,
    '--notes', path.join(dir, 'notes.json'), '--changes', path.join(dir, 'bad-changes.json'),
    '--repo', 'me/proj', '--branch', 'f', '--now', '2026-08-07T00:00:00Z'],
    { encoding: 'utf8', stdio: 'pipe' }));
});

test('--link emits the 🌿 address with the surface gzipped into the fragment', async () => {
  const url = run('--link').trim();
  assert.match(url, /^https:\/\/mehrlander\.github\.io\/web-tools\/pages\/branch\.html#gh=me\/proj@feature-x&base=main&gz=/);
  const gz = url.split('&gz=')[1];
  const bin = Buffer.from(gz.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const { gunzipSync } = await import('node:zlib');
  const round = JSON.parse(gunzipSync(bin).toString());
  assert.deepEqual(round, surface, 'the link carries the surface byte-faithfully');
});
