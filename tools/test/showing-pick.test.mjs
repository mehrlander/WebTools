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

// ── the read itself, not the classifier ─────────────────────────────────────
//
// Every test above hands the script a file list with --files, which is exactly
// the blind spot that shipped: the classifier was right the whole time and the
// INPUT was empty, because `sh()` returned `.stdout.strip()` without reading
// the exit code. A failed `git diff` and a branch that changed nothing were the
// same value, so a nine-file branch printed "No render link: nothing that
// renders changed" and a session passed that on (2026-09-03, PR #574).
//
// Driven through git rather than a fixture, since the defect lives in the git
// read. `git commit-tree` on the empty tree makes a dangling orphan commit: it
// shares no ancestor with HEAD, so `orphan...HEAD` fails with "no merge base",
// which is the same failure the sandbox's shallow clone produces every run.
// Nothing is written: no ref moves and the working tree is untouched.
//
// The identity is passed in rather than inherited. `commit-tree` writes a
// commit object and so demands an author, and a CI runner has no git identity
// configured: this test passed on every developer machine and failed the first
// time it ran on Actions with "fatal: empty ident name" (run 33777865076). The
// value is irrelevant, since the object is never referenced or pushed; what
// matters is that the test carries its own and depends on no ambient config.
const IDENT = {
  GIT_AUTHOR_NAME: 'showing-test', GIT_AUTHOR_EMAIL: 'showing-test@invalid',
  GIT_COMMITTER_NAME: 'showing-test', GIT_COMMITTER_EMAIL: 'showing-test@invalid',
};

// THE LINK THAT RESOLVES, RENDERS, AND SHOWS NOTHING, one level down from the
// one this script exists to prevent. A page routing on its own hash opens on
// its default without an address, and for branch.html and session.html that
// default is the empty form. Emitted twice on 2026-09-05 and opened twice
// before anyone worked out why.
test('a page that routes on its own hash is warned about, and --at answers it', () => {
  const bare = run('pages/branch.html');
  assert.equal(bare.mechanism, 'toss-gh');
  assert.ok(bare.warnings.some(w => /location\.hash/.test(w) && /--at/.test(w)),
    'the warning names the risk and the flag: ' + JSON.stringify(bare.warnings));
  assert.ok(!bare.links[0].url.includes('#gh=mehrlander/web-tools&pr='),
    'and the bare link carries no address');

  const at = run('pages/branch.html', ['--at', 'gh=owner/repo&pr=12']);
  assert.ok(at.links[0].url.endsWith(':pages/branch.html#gh=owner/repo&pr=12'),
    'the address rides as a trailing fragment, which the toss hands the page as its own hash');
  assert.equal(at.warnings.filter(w => /location\.hash/.test(w)).length, 0,
    'and the warning stands down once an address is given');
});

// The warning is scoped, not blanket: a file that reaches no hash-routing page
// must not carry it, or it becomes noise every session learns to skip.
test('a subject that reads no hash is not warned about', () => {
  const d = run('docs/showing.md');
  assert.equal(d.warnings.filter(w => /location\.hash/.test(w)).length, 0);
});

test('a diff that FAILS is never reported as a diff that found nothing', () => {
  const emptyTree = execFileSync('git', ['hash-object', '-t', 'tree', '/dev/null'],
    { cwd: repoRoot, encoding: 'utf8' }).trim();
  const orphan = execFileSync('git', ['commit-tree', emptyTree, '-m', 'orphan probe'],
    { cwd: repoRoot, encoding: 'utf8', input: '', env: { ...process.env, ...IDENT } }).trim();

  const raw = execFileSync('python3', [SCRIPT, '--base', orphan, '--json'],
    { cwd: repoRoot, encoding: 'utf8' });
  const d = JSON.parse(raw);

  assert.equal(d.mechanism, 'unknown', 'a failed read is its own answer');
  assert.notEqual(d.mechanism, 'none-needed',
    'the whole defect: "could not read" wearing the words of "nothing to show"');
  assert.match(d.warnings.join(' '), /could not read the diff|SHALLOW/);
  assert.equal(d.links.length, 0);

  // And the printed line, which is what a session actually copies. It must not
  // contain the phrase that travelled into a reply.
  const text = execFileSync('python3', [SCRIPT, '--base', orphan],
    { cwd: repoRoot, encoding: 'utf8' });
  assert.match(text, /CANNOT TELL/);
  assert.ok(!/nothing that renders changed/.test(text),
    'the false-negative wording must not appear on a failed read');
});
