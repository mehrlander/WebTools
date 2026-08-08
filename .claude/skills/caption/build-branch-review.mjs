#!/usr/bin/env node
// build-branch-review.mjs — serialize the full caption's judgment as a
// branch-review/1 surface, the authored layer pages/branch.html renders.
//
// The decision this script embodies (tracker: branch-authored-layer-surface):
// branch-review/1 is THE format /caption emits for the 🌿 authored layer. The
// plain branch-brief form stays accepted by the page's reader as a documented
// hand-authoring convenience; nothing generates it anymore.
//
//   node build-branch-review.mjs --notes notes.json [--link] [--out surface.json]
//     [--repo owner/repo] [--branch B] [--base main] [--now ISO]
//     [--changes changes.json]     # pure mode: skip git, for tests
//
// notes.json is the authored judgment, the part no API can derive:
//   { "name": "...", "intent": "...", "notes": "...", "open": ["..."],
//     "omitted": ["..."], "files": { "<path>": "one-line why" } }
//
// Everything else derives from git (or --changes in pure mode): the compare
// endpoints with resolved revisions, and the changed file list with statuses.
// The output validates against BOTH schemas (core surface v2 and the
// branch-review profile) before it is emitted; an invalid surface is an error,
// not an artifact. --link additionally prints the 🌿 URL with the surface
// gzipped into the fragment, the same delivery the toss uses.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv) {
  const o = { base: 'main' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--notes') o.notes = argv[++i];
    else if (a === '--changes') o.changes = argv[++i];
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--branch') o.branch = argv[++i];
    else if (a === '--base') o.base = argv[++i];
    else if (a === '--now') o.now = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--link') o.link = true;
  }
  return o;
}

const sh = (cmd) => execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim();

// A/M/D/Rnnn/Cnnn from --name-status to the schema's change.status vocabulary.
function gitChanges(base) {
  return sh(`git diff --name-status origin/${base}...HEAD`).split('\n').filter(Boolean).map(line => {
    const [code, ...paths] = line.split('\t');
    const status = { A: 'added', M: 'modified', D: 'deleted' }[code[0]] ||
                   (code[0] === 'R' ? 'renamed' : code[0] === 'C' ? 'copied' : 'modified');
    return status === 'renamed' || status === 'copied'
      ? { path: paths[1], status, previous_path: paths[0] }
      : { path: paths[0], status };
  });
}

function build(o) {
  const notes = o.notes ? JSON.parse(readFileSync(o.notes, 'utf8')) : {};
  const pure = !!o.changes;
  const repo = o.repo || (pure ? null : sh('git remote get-url origin').replace(/\.git$/, '').split(/github\.com[:/]/)[1]);
  const branch = o.branch || (pure ? null : sh('git rev-parse --abbrev-ref HEAD'));
  if (!repo || !branch) throw new Error('need --repo and --branch (or a git checkout to derive them)');
  const changes = pure ? JSON.parse(readFileSync(o.changes, 'utf8')) : gitChanges(o.base);
  const rev = (ref) => { try { return sh(`git rev-parse ${ref}`); } catch { return undefined; } };
  const baseRev = pure ? notes.base_revision : rev(`origin/${o.base}`);
  const headRev = pure ? notes.head_revision : rev('HEAD');
  const files = notes.files || {};

  const items = [];
  if (notes.intent) items.push({
    id: 'intent', title: 'Intent', type: 'note', role: 'intent',
    commentary: notes.intent, view: { mode: 'summary' },
  });
  for (const c of changes) {
    const change = { status: c.status };
    if (c.previous_path) change.previous_path = c.previous_path;
    const item = {
      id: c.path, title: c.path, type: 'file', role: 'changed',
      target: { source: { repository: repo, ref: branch, path: c.path } },
      change, view: { mode: 'diff' },
    };
    if (files[c.path]) item.commentary = files[c.path];
    items.push(item);
  }
  (notes.omitted || []).forEach((t, i) => items.push({
    id: 'omitted-' + (i + 1), title: t, type: 'note', role: 'omitted',
    view: { mode: 'omit' },
  }));

  const surface = {
    manifest: {
      name: notes.name || `${repo}@${branch}`,
      description: notes.intent || '',
      author: 'caption skill',
      created_at: o.now || new Date().toISOString(),
      schema: { name: 'surface', version: 2 },
      profile: { name: 'branch-review', version: 1 },
    },
    context: {
      repository: repo,
      base: baseRev ? { ref: o.base, revision: baseRev } : { ref: o.base },
      head: headRev ? { ref: branch, revision: headRev } : { ref: branch },
      ...(notes.intent ? { intent: notes.intent } : {}),
      ...(notes.notes ? { notes: notes.notes } : {}),
      ...(notes.open?.length ? { open: notes.open } : {}),
    },
    items,
  };
  return surface;
}

// Both schemas, or it is not a branch-review surface. ajv rides the repo's
// devDependencies; validation is part of emitting, not an optional extra.
function validate(surface) {
  const require = createRequire(import.meta.url);
  const Ajv = require('ajv/dist/2020').default;
  const ajv = new Ajv({ strict: false, allErrors: true, logger: false });
  const dir = path.join(repoRoot, 'docs/envelopes/schemas');
  for (const rel of ['surface-v2.schema.json', 'profiles/branch-review-v1.schema.json']) {
    const schema = JSON.parse(readFileSync(path.join(dir, rel), 'utf8'));
    const ok = ajv.validate(schema, surface);
    if (!ok) throw new Error(rel + ': ' + ajv.errorsText(ajv.errors));
  }
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const o = parseArgs(process.argv.slice(2));
const surface = build(o);
validate(surface);
const json = JSON.stringify(surface, null, 1);
if (o.out) writeFileSync(o.out, json);
else if (!o.link) process.stdout.write(json + '\n');
if (o.link) {
  const gz = b64url(gzipSync(JSON.stringify(surface)));
  const repo = surface.context.repository, branch = surface.context.head.ref;
  process.stdout.write(
    `https://mehrlander.github.io/web-tools/pages/branch.html#gh=${repo}@${branch}&base=${surface.context.base.ref}&gz=${gz}\n`);
}
