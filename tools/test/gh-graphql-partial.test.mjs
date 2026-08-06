// gh-graphql-partial.test.mjs — graphql()'s outcomes, pinned by the first FAB
// capture (2026-08-02): GitHub answers Commit.file(path:) with one "Could not
// resolve file for path" error per branch lacking the file, BESIDE a data tree
// whose nulls carry the same misses. Partial data must come back, errors
// without data must throw, and every rejection must be logged with the
// operation name so a capture can carry it.
//
// The console note is the part with a rule behind it. A caller declares which
// field errors are normal for its query, and only what it did not declare is
// worth printing. Measured 2026-08-06 against mehrlander/home: 472 branches,
// the file on 38, so the undeclared version printed 434 lines describing an
// answer that was entirely correct.

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

const PARTIAL = {
  data: { repository: { refs: { nodes: [{ name: 'a', target: { file: null } }] } } },
  errors: [{ message: "Could not resolve file for path 'pages/x.html'." }],
};

test('partial data comes back, and undeclared field errors are noted', async () => {
  warns.length = 0;
  respond(PARTIAL);
  const data = await gh.graphql(QUERY);
  assert.ok(data.repository, 'the data survived its sibling errors');
  assert.ok(warns.some(w => w.includes('BranchesForPath returned partial data')));
});

test('a field error the caller declared normal says nothing', async () => {
  warns.length = 0;
  respond(PARTIAL);
  const expected = window.GH.expectedErrors.missingFile;
  const data = await gh.graphql(QUERY, {}, { expected });
  assert.ok(data.repository, 'the data still comes back');
  assert.equal(warns.length, 0, 'a per-branch file miss is the answer, not a warning');
});

test('missingFile matches on the error path too, not only the message', async () => {
  warns.length = 0;
  respond({
    data: { repository: { refs: { nodes: [] } } },
    errors: [{ path: ['repository', 'refs', 'nodes', 0, 'target', 'file'] }],
  });
  await gh.graphql(QUERY, {}, { expected: window.GH.expectedErrors.missingFile });
  assert.equal(warns.length, 0, 'GraphQL only SHOULD carry a message; path is the structural tell');
});

test('an unexpected error alongside expected ones is still reported, and counted alone', async () => {
  warns.length = 0;
  respond({
    data: { repository: { refs: { nodes: [] } } },
    errors: [
      { message: "Could not resolve file for path 'pages/x.html'." },
      { message: "Could not resolve file for path 'pages/y.html'." },
      { message: 'Something genuinely wrong' },
    ],
  });
  await gh.graphql(QUERY, {}, { expected: window.GH.expectedErrors.missingFile });
  assert.equal(warns.length, 1);
  assert.ok(warns[0].includes('1 unexpected field error'), 'the count excludes the declared ones');
  assert.ok(warns[0].includes('Something genuinely wrong'));
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
