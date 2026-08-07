// tracker/assessments/ holds dated tracker-assessment records: authored
// judgment about the tracker as a whole, anchored to a commit of main
// (TRACKER.md, "The assessment record"). The tracker-assessment/1 contract is
// four required keys; every other section is authored and deliberately
// unchecked, the record-level analogue of an open tag. So this gate holds only
// the identity convention and the required keys. Nothing here checks that the
// task ids a record cites still exist: an assessment is a historical record,
// and a cited task closing or renaming later is aging, not error.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const dir = path.join(repoRoot, 'tracker', 'assessments');
const files = existsSync(dir) ? readdirSync(dir).sort() : [];
const record = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));

test('every assessment file is a dated .json, slug-suffixed only if needed', () => {
  for (const f of files)
    assert.match(f, /^\d{4}-\d{2}-\d{2}(-[a-z0-9][a-z0-9-]*)?\.json$/,
      `${f}: assessments are named YYYY-MM-DD[-slug].json`);
});

test('every assessment carries the tracker-assessment/1 required keys', () => {
  for (const f of files) {
    const a = record(f);
    assert.equal(a.schema, 'tracker-assessment/1', `${f}: schema`);
    assert.ok(typeof a.assessedAt === 'string' && a.assessedAt, `${f}: assessedAt`);
    assert.match(a.basis?.repository ?? '', /^[^\s/]+\/[^\s/]+$/, `${f}: basis.repository`);
    // The commit is the record's real anchor: a full sha, so a reader can
    // resolve the cited task ids against the exact tree that was assessed.
    assert.match(a.basis?.commit ?? '', /^[0-9a-f]{40}$/, `${f}: basis.commit`);
    assert.ok(typeof a.summary === 'string' && a.summary, `${f}: summary`);
  }
});

// The filename is the handle and assessedAt is the timestamp; the two carrying
// different dates would make the directory listing lie about when a judgment
// was rendered.
test('the filename date matches assessedAt', () => {
  for (const f of files)
    assert.equal(f.slice(0, 10), record(f).assessedAt.slice(0, 10), f);
});
