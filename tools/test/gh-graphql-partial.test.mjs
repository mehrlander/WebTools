// gh-graphql-partial.test.mjs — graphql()'s three outcomes, pinned by the
// first FAB capture (2026-08-02): GitHub answers Commit.file(path:) with one
// "Could not resolve file for path" error per branch lacking the file, BESIDE
// a data tree whose nulls carry the same misses. Partial data must come back
// (with a console note), errors without data must throw, and every rejection
// must be logged with the operation name so a capture can carry it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow } from './bootstrap.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const { window } = makeWindow({ html: '<!doctype html><html><body></body></html>' });
window.GH = class { constructor() { this.headers = {}; } };
new window.Function(readFileSync(path.join(repoRoot, 'lib/gh-fetch.js'), 'utf8'))();

const gh = new window.GH();
const warns = [];
window.console.warn = (...a) => warns.push(a.join(' '));
const respond = body => { window.fetch = async () => ({ ok: true, json: async () => body }); };

const QUERY = 'query BranchesForPath($x:Int) { whatever }';

test('partial data comes back, with the partials noted for captures', async () => {
  respond({
    data: { repository: { refs: { nodes: [{ name: 'a', target: { file: null } }] } } },
    errors: [{ message: "Could not resolve file for path 'pages/x.html'." }],
  });
  const data = await gh.graphql(QUERY);
  assert.ok(data.repository, 'the data survived its sibling errors');
  assert.ok(warns.some(w => w.includes('BranchesForPath returned partial data')));
});

test('errors with no data still throw, and the rejection names the operation', async () => {
  warns.length = 0;
  respond({ data: null, errors: [{ message: 'bad cursor' }] });
  await assert.rejects(() => gh.graphql(QUERY), /bad cursor/);
  assert.ok(warns.some(w => w.includes('GraphQL BranchesForPath rejected: bad cursor')));
});

test('an HTTP failure throws with the status and is logged the same way', async () => {
  warns.length = 0;
  window.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(() => gh.graphql(QUERY), /GraphQL Error 401/);
  assert.ok(warns.some(w => w.includes('BranchesForPath rejected')));
});
