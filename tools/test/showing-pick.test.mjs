// scripts/showing.py — which render link shows a branch's changes.
//
// The script is python3/stdlib, so this drives it the way a person does,
// through the file system, and reads what it prints. Same shape as
// dead-opacity.test.mjs.
//
// What is pinned is the CLASSIFIER, and the case that matters most is the one
// the repo got wrong by hand on 2026-08-22: a change under
// lib/alpineComponents/ was reported as unshowable "because it is in the app
// shell". It is in lib, and `?use=` reaches it. That reading is now a fixture
// rather than a thing a session has to recall correctly under pressure.
//
// The four rules come from docs/routes.json's `showing.picker`, so a rule
// changing there and not here should fail: the fixtures below ARE the picker's
// behaviour, and a mechanism table nothing executes is what this replaced.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const SCRIPT = path.join(repoRoot, 'scripts/showing.py');
const ZERO = '0'.repeat(40);

function run(files, extra = []) {
  const out = execFileSync('python3', [SCRIPT, '--files', files, '--json', ...extra],
    { cwd: repoRoot, encoding: 'utf8' });
  return JSON.parse(out);
}

// A diff fixture, since the top-level-document test reads hunks rather than
// paths: the same file is showable or not depending on what the change DOES.
function withDiff(files, text) {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'showing-')), 'd.diff');
  writeFileSync(f, text);
  return run(files, ['--diff', f]);
}

test('a lib change resolves to ?use=, which is the call the repo got wrong by hand', () => {
  const d = run('lib/alpineComponents/estate.js,dist/web-tools.js');
  assert.equal(d.mechanism, 'use');
  const app = d.links.find(l => l.page === 'app/index.html');
  assert.ok(app, 'the app is the subject, since app-routes.csv declares the file as its code');
  assert.match(app.url, new RegExp(`^https://mehrlander\\.github\\.io/web-tools/app/\\?use=${ZERO}`));
  // Not seven links. A page importing the pre-build LOADS every component and
  // renders few, so those are reported as carried rather than offered.
  assert.equal(d.links.length, 1);
  assert.ok(d.carried.length >= 3);
});

test('a lib file several pages gh.load is offered to each, and the app lands on its view', () => {
  const d = run('lib/kits/session-render.js,dist/web-tools.js');
  const pages = d.links.map(l => l.page);
  assert.ok(pages.includes('pages/session.html'), 'the page that names it in a gh.load chain');
  const app = d.links.find(l => l.page === 'app/index.html');
  assert.equal(app.view, 'sessions', 'one declaring route means the link can land on it');
  assert.match(app.url, /&view=sessions$/);
});

test('a page file resolves to the toss, since ?use= never swaps a page shell', () => {
  const d = run('pages/session.html');
  assert.equal(d.mechanism, 'toss-gh');
  const [l] = d.links;
  // ?use= in the QUERY as well, so the renderer around the page matches the ref
  // the page is fetched at; #gh= alone leaves main's shell holding it.
  assert.match(l.url, /toss-render\.html\?use=/);
  assert.match(l.url, /#gh=mehrlander\/web-tools@0{40}:pages\/session\.html$/);
});

test('the renderer previews by nesting rather than by rendering itself', () => {
  const d = run('pages/toss-render.html');
  assert.equal(d.mechanism, 'toss-nested');
  assert.equal((d.links[0].url.match(/#gh=/g) || []).length, 2);
});

test('a shell change acting on the top-level document reaches no link at all', () => {
  // The favicon case (PR #315): a framed shell sets it on its own document,
  // correctly and invisibly, because the tab belongs to whatever is on top.
  const d = withDiff('pages/branch.html', '+++ b/pages/branch.html\n+ document.title = subject;\n');
  assert.equal(d.mechanism, 'none');
  assert.match(d.why.join(' '), /document\.title/);
  // The control: the same file, a change that touches nothing top-level.
  const ok = withDiff('pages/branch.html', '+++ b/pages/branch.html\n+ const x = 1;\n');
  assert.equal(ok.mechanism, 'toss-gh');
});

test('docs and tools get an honest no-link rather than a link that shows nothing', () => {
  const d = run('docs/showing.md,tools/test/x.test.mjs');
  assert.equal(d.mechanism, 'none-needed');
  assert.equal(d.links.length, 0);
});

test('lib without a rebuilt pre-build warns, since ?use= fetches dist', () => {
  const d = run('lib/kits/session-render.js');
  assert.match(d.warnings.join(' '), /build:lib/);
  // And says nothing about it once the artifact rides along.
  const built = run('lib/kits/session-render.js,dist/web-tools.js');
  assert.ok(!/build:lib/.test(built.warnings.join(' ')));
});
