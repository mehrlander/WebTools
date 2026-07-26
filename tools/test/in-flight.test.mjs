// in-flight.py (.claude/skills/in-flight/) — the classification is the product, so these tests build real
// git repositories with a known answer and assert the script's reading of them.
// The four branch shapes that matter (merged, live, squash-landed, unrelated
// history) cannot be faked with stub data: each is a property of the object
// graph, which is exactly what the script measures.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately not ./bootstrap.mjs: that pulls in jsdom, and this suite drives
// a stdlib-only python script through its CLI. Keeping the test's dependencies
// as narrow as the script's means it runs wherever the script does.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(repoRoot, '.claude/skills/in-flight/in-flight.py');

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e',
  GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e',
  GIT_AUTHOR_DATE: '2026-07-20T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-07-20T00:00:00Z',
};

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], { env: ENV, encoding: 'utf8' }).trim();

// The message is a real parameter, not decoration. Commits here are fully
// deterministic (fixed author, committer, and dates), so two commits with the
// same tree, parent, and message hash to the same object and git silently
// treats the two branches as one. The squash fixture below needs a distinct
// commit carrying an identical tree, which only a different message gives it.
function commit(dir, file, body, msg) {
  const full = path.join(dir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg || `touch ${file}`);
  return git(dir, 'rev-parse', 'HEAD');
}

// Publish a local branch as a remote-tracking ref. The script reads only
// refs/remotes/origin, so this stands in for a real remote without a server.
const publish = (dir, name) =>
  git(dir, 'update-ref', `refs/remotes/origin/${name}`, git(dir, 'rev-parse', name));

function run(dir, extra = []) {
  const out = execFileSync('python3', [SCRIPT, dir, '--json', ...extra],
    { encoding: 'utf8', env: ENV });
  return JSON.parse(out)[0];
}

/**
 * A fixture carrying one branch of every shape the classifier must separate.
 *   merged-b      folded into main with a merge commit  -> landed
 *   live-b        two commits main does not have         -> live
 *   squashed-b    ahead, but its content is on main      -> live, 0 unlanded
 *   orphan-b      its own root commit                    -> unrelated
 */
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'inflight-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git');
  commit(dir, 'README.md', 'base\n');

  git(dir, 'checkout', '-q', '-b', 'merged-b');
  commit(dir, 'src/merged.txt', 'merged work\n');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge merged-b', 'merged-b');

  git(dir, 'checkout', '-q', '-b', 'live-b');
  commit(dir, 'src/live.txt', 'live work\n');
  commit(dir, 'docs/live.md', 'live doc\n');

  // Squash shadow: main gets the same bytes via a different commit, so the
  // branch stays ahead while nothing it touched still differs from main.
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'checkout', '-q', '-b', 'squashed-b');
  commit(dir, 'src/squashed.txt', 'squashed work\n', 'on the branch');
  git(dir, 'checkout', '-q', 'main');
  commit(dir, 'src/squashed.txt', 'squashed work\n', 'squashed onto main');

  git(dir, 'checkout', '-q', '--orphan', 'orphan-b');
  git(dir, 'rm', '-rqf', '.');
  commit(dir, 'old/thing.txt', 'pre-rewrite\n');

  git(dir, 'checkout', '-q', 'main');
  for (const b of ['main', 'merged-b', 'live-b', 'squashed-b', 'orphan-b']) publish(dir, b);
  return dir;
}

// Replaces the tracker outright. Appending would let one test's tasks inflate
// the next test's counts, which is the failure mode a shared fixture invites.
function withTracker(dir, tasks) {
  const tdir = path.join(dir, 'tracker/tasks');
  rmSync(tdir, { recursive: true, force: true });
  mkdirSync(tdir, { recursive: true });
  for (const [name, body] of Object.entries(tasks)) {
    writeFileSync(path.join(tdir, `${name}.md`), body);
  }
}

const task = ({ title, status = 'in-progress', session, next }) =>
  ['---', `id: ${title.toLowerCase().replace(/\W+/g, '-')}-aaaaaa`, `title: ${title}`,
    `status: ${status}`, ...(session ? [`session: ${session}`] : []),
    ...(next ? [`next: ${next}`] : []), '---', `# ${title}`, ''].join('\n');

let dir;
test.before(() => { dir = fixture(); });
test.after(() => rmSync(dir, { recursive: true, force: true }));

// ── branch classification ───────────────────────────────────────────────────

test('a branch merged into main is not live', () => {
  const r = run(dir);
  assert.equal(r.live.find((b) => b.branch === 'merged-b'), undefined);
  assert.equal(r.counts.landed >= 1, true);
});

test('a branch with commits main lacks is live, with an exact ahead-count', () => {
  const live = run(dir).live.find((b) => b.branch === 'live-b');
  assert.ok(live, 'live-b should be live');
  assert.equal(live.ahead, 2);
  assert.equal(live.touched, 2);
  assert.equal(live.unlanded, 2);
});

test('a branch on its own root is unrelated, never live', () => {
  const r = run(dir);
  assert.equal(r.counts.unrelated, 1);
  assert.equal(r.live.find((b) => b.branch === 'orphan-b'), undefined);
});

test('squash shadow: ahead of main, but nothing it touched still differs', () => {
  const sq = run(dir).live.find((b) => b.branch === 'squashed-b');
  assert.ok(sq, 'squashed-b is ahead, so it lands in the live set');
  assert.equal(sq.ahead > 0, true);
  assert.equal(sq.unlanded, 0, 'the content signal is what corrects the ahead-count');
});

test('every branch is classified exactly once', () => {
  const r = run(dir);
  const { live, landed, unrelated } = r.counts;
  assert.equal(live + landed + unrelated, r.total_branches);
  assert.equal(r.total_branches, 4, 'main is excluded from the estate it is the base of');
});

// ── claim reconciliation ────────────────────────────────────────────────────

test('a claim on a live branch is confirmed live and keeps its next tag', () => {
  withTracker(dir, { t: task({ title: 'Real work', session: 'live-b', next: 'finish the parser' }) });
  const c = run(dir).claims;
  assert.equal(c.length, 1);
  assert.equal(c[0].verdict, 'live');
  assert.equal(c[0].next, 'finish the parser');
});

test('a claim on a merged branch is stale', () => {
  withTracker(dir, { t: task({ title: 'Already landed', session: 'merged-b' }) });
  const [c] = run(dir).claims;
  assert.equal(c.verdict, 'stale');
  assert.match(c.why, /merged/);
});

test('a claim on a branch that no longer exists is stale', () => {
  withTracker(dir, { t: task({ title: 'Gone', session: 'deleted-branch' }) });
  const [c] = run(dir).claims;
  assert.equal(c.verdict, 'stale');
  assert.match(c.why, /no longer exists/);
});

test('a claim on a squash-landed branch is stale despite the ahead-count', () => {
  withTracker(dir, { t: task({ title: 'Squashed', session: 'squashed-b' }) });
  const [c] = run(dir).claims;
  assert.equal(c.verdict, 'stale', 'ahead>0 alone must not read as in flight');
});

test('a claim on a pre-rewrite branch is stale', () => {
  withTracker(dir, { t: task({ title: 'Ancient', session: 'orphan-b' }) });
  const [c] = run(dir).claims;
  assert.equal(c.verdict, 'stale');
  assert.match(c.why, /no history/);
});

test('a claim naming no branch is unverifiable, not silently live', () => {
  withTracker(dir, { t: task({ title: 'Unowned' }) });
  const [c] = run(dir).claims;
  assert.equal(c.verdict, 'unverifiable');
});

test('an origin/ prefix on the session tag still resolves', () => {
  withTracker(dir, { t: task({ title: 'Prefixed', session: 'origin/live-b' }) });
  assert.equal(run(dir).claims[0].verdict, 'live');
});

test('a live branch idle past --quiet-days reads quiet, not live', () => {
  withTracker(dir, { t: task({ title: 'Old', session: 'live-b' }) });
  assert.equal(run(dir, ['--quiet-days', '0']).claims[0].verdict, 'quiet');
});

test('only in-progress tasks are claims; the rest are counted, not listed', () => {
  withTracker(dir, {
    a: task({ title: 'Doing', session: 'live-b' }),
    b: task({ title: 'Waiting', status: 'backlog' }),
    c: task({ title: 'Finished', status: 'done' }),
  });
  const r = run(dir);
  assert.equal(r.claims.length, 1);
  assert.equal(r.total_tasks, 3);
});

test('a malformed task file degrades to fewer keys, never to a crash', () => {
  withTracker(dir, {
    good: task({ title: 'Fine', session: 'live-b' }),
    bad: '---\nnot: [valid, yaml\nstatus: in-progress\ntitle: Ragged\n---\nbody',
    noFrontmatter: '# Just a heading\n',
  });
  const r = run(dir);
  assert.equal(r.total_tasks, 3);
  const ragged = r.claims.find((c) => c.title === 'Ragged');
  assert.ok(ragged, 'the parser contract keeps a file with one bad line readable');
  assert.equal(ragged.verdict, 'unverifiable');
});

test('a status carrying a trailing comment still parses', () => {
  withTracker(dir, { t: '---\ntitle: Commented\nstatus: in-progress  # mid-flight\nsession: live-b\n---\n' });
  assert.equal(run(dir).claims[0].verdict, 'live');
});

// ── paths and PRs ───────────────────────────────────────────────────────────

test('--paths reports only live branches touching the target, folders included', () => {
  withTracker(dir, {});
  const r = run(dir, ['--paths', 'docs/']);
  const live = r.live.find((b) => b.branch === 'live-b');
  assert.deepEqual(live.hits, ['docs']);
  assert.deepEqual(r.live.find((b) => b.branch === 'squashed-b').hits, []);
});

test('--paths matches an exact file without matching its prefix-siblings', () => {
  const r = run(dir, ['--paths', 'src/live.txt']);
  assert.deepEqual(r.live.find((b) => b.branch === 'live-b').hits, ['src/live.txt']);
  assert.deepEqual(r.live.find((b) => b.branch === 'squashed-b').hits, []);
});

test('an open PR attaches to its live branch', () => {
  const prs = path.join(dir, 'prs.json');
  writeFileSync(prs, JSON.stringify([
    { number: 7, title: 'Live work', head: 'live-b', draft: true, html_url: 'u/7' },
  ]));
  const r = run(dir, ['--prs', prs]);
  assert.equal(r.live.find((b) => b.branch === 'live-b').pr.number, 7);
  assert.equal(r.orphan_prs.length, 0);
});

test('an open PR on a merged branch is reported as having nothing live', () => {
  const prs = path.join(dir, 'prs.json');
  writeFileSync(prs, JSON.stringify([{ number: 9, title: 'Done', head: 'merged-b' }]));
  const r = run(dir, ['--prs', prs]);
  assert.equal(r.orphan_prs.length, 1);
  assert.match(r.orphan_prs[0].why, /landed/);
});

test('a PR naming another repo does not attach to this one', () => {
  const prs = path.join(dir, 'prs.json');
  writeFileSync(prs, JSON.stringify([
    { number: 11, title: 'Elsewhere', head: 'live-b', repo: 'other/repo' },
  ]));
  const r = run(dir, ['--prs', prs]);
  assert.equal(r.live.find((b) => b.branch === 'live-b').pr, null);
  assert.equal(r.orphan_prs.length, 0);
});

test('the REST head shape (an object, not a string) is accepted', () => {
  const prs = path.join(dir, 'prs.json');
  writeFileSync(prs, JSON.stringify([
    { number: 13, title: 'Rest shape', head: { ref: 'live-b' }, html_url: 'u/13' },
  ]));
  assert.equal(run(dir, ['--prs', prs]).live.find((b) => b.branch === 'live-b').pr.number, 13);
});

test('the repo slug survives a proxied origin URL', () => {
  const proxied = mkdtempSync(path.join(tmpdir(), 'inflight-proxy-'));
  git(proxied, 'init', '-q', '-b', 'main');
  // The shape a Claude Code web sandbox rewrites origin to.
  git(proxied, 'remote', 'add', 'origin', 'http://local_proxy@127.0.0.1:41729/git/acme/widget');
  commit(proxied, 'a.txt', 'x\n');
  publish(proxied, 'main');
  assert.equal(run(proxied).slug, 'acme/widget');
  rmSync(proxied, { recursive: true, force: true });
});
