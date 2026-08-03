// .claude/skills/tasks/build-board.py — the canonical board generator, bundled
// in the portable plugin and run by every tracker in the estate. A regression
// here is silent and repo-wide, so the behavior worth pinning is the part with
// branches: how `track: depends-on:<id>` renders.
//
// The generator is python3/stdlib, so this drives it the way a tracker does,
// through the file system, and reads the board it writes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const GENERATOR = '.claude/skills/tasks/build-board.py';

// Render a board from an object of {id: frontmatter} and return its lines.
function board(tasks) {
  const dir = mkdtempSync(join(tmpdir(), 'board-'));
  try {
    const tasksDir = join(dir, 'tasks');
    mkdirSync(tasksDir);
    for (const [id, fm] of Object.entries(tasks)) {
      const body = Object.entries({ id, ...fm }).map(([k, v]) => `${k}: ${v}`).join('\n');
      writeFileSync(join(tasksDir, `${id}.md`), `---\n${body}\n---\n# ${fm.title}\n`);
    }
    const out = join(dir, 'board.md');
    execFileSync('python3', [GENERATOR, tasksDir, out]);
    return readFileSync(out, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// What a reader actually sees: link targets dropped, link text kept. The board
// is markdown, so "does this leak an id" is a question about the rendered text,
// not about the source.
function visibleText(md) {
  return md.replace(/\]\([^)]*\)/g, ']').replace(/[[\]]/g, '');
}

test('an unmet dependency names the blocker by title, not by id', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog', track: 'depends-on:blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /\[The waiting task\]\(tasks\/waiter-000001\.md\) \(needs: The blocking task\)/);
  // The id is a filing handle and means nothing to a reader (TRACKER.md), so it
  // must not appear as VISIBLE text. It does appear in a row's href, which is
  // machinery the reader never sees; that is the line the rule draws, and
  // stripping the link targets is what tests it rather than the raw source.
  assert.doesNotMatch(visibleText(md), /blocker-000002|waiter-000001/);
});

test('a satisfied dependency renders nothing', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog', track: 'depends-on:blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'done' },
  });
  assert.match(md, /- 🎫 \[The waiting task\]\(tasks\/waiter-000001\.md\)$/m);
});

test("a done task's dependency renders nothing, even when unmet", () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'done', track: 'depends-on:blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /- 🎫 \[The waiting task\]\(tasks\/waiter-000001\.md\)$/m);
});

test('a dependency on an id no task defines is surfaced, not swallowed', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog', track: 'depends-on:ghost-000009' },
  });
  assert.match(md, /\[The waiting task\]\(tasks\/waiter-000001\.md\) \(needs `ghost-000009`, which no task file defines\)/);
});

test('track: independent and other track values render nothing', () => {
  const md = board({
    'a-000001': { title: 'Independent task', status: 'backlog', track: 'independent' },
    'b-000002': { title: 'Anchor task', status: 'backlog', track: 'anchor' },
  });
  assert.match(md, /- 🎫 \[Independent task\]\(tasks\/a-000001\.md\)$/m);
  assert.match(md, /- 🎫 \[Anchor task\]\(tasks\/b-000002\.md\)$/m);
});

test('the owning branch and the dependency render in a stable order, and nothing else does', () => {
  const md = board({
    'waiter-000001': {
      title: 'The waiting task', status: 'in-progress', session: 'claude/some-branch',
      track: 'depends-on:blocker-000002', next: 'the next step',
    },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /- 🎫 \[The waiting task\]\(tasks\/waiter-000001\.md\) \(`claude\/some-branch`\) \(needs: The blocking task\)$/m);
});

// The 🎫 marker's form is `🎫 [title](url)` (SURFACING.md): the title is the
// link, so the board reads as a table of contents and one tap reaches the task
// that holds the why and the progress log. This was the one place in the estate
// emitting a bare 🎫, which also left show-repo's board pane resolving relative
// hrefs that no board contained.
test('every row links its title to the task file', () => {
  const md = board({ 'a-000001': { title: 'Only task', status: 'backlog' } });
  assert.match(md, /- 🎫 \[Only task\]\(tasks\/a-000001\.md\)$/m);
});

// The link targets the file on disk, not the `id` field, so a task whose
// frontmatter id drifted from its filename still links to something that
// resolves. Nothing else in the schema guarantees the two agree.
test('the link follows the filename when the id field disagrees', () => {
  const dir = mkdtempSync(join(tmpdir(), 'board-'));
  try {
    const tasksDir = join(dir, 'tasks');
    mkdirSync(tasksDir);
    writeFileSync(join(tasksDir, 'real-name-000001.md'),
      '---\nid: stale-id-999999\ntitle: Renamed task\nstatus: backlog\n---\n# Renamed task\n');
    const out = join(dir, 'board.md');
    execFileSync('python3', [GENERATOR, tasksDir, out]);
    const md = readFileSync(out, 'utf8');
    assert.match(md, /\(tasks\/real-name-000001\.md\)/);
    assert.doesNotMatch(md, /stale-id-999999/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A `]` in a title would truncate the link text and spill the rest as prose.
// Not hypothetical: web-tools carries "One parser for the owner/repo[@ref]:path
// address".
test('brackets in a title are escaped rather than breaking the link', () => {
  const md = board({
    'a-000001': { title: 'One parser for the owner/repo[@ref]:path address', status: 'backlog' },
  });
  assert.match(md, /- 🎫 \[One parser for the owner\/repo\\\[@ref\\\]:path address\]\(tasks\/a-000001\.md\)$/m);
});

// The href is relative to the BOARD's folder, not the cwd, because that is the
// one base both consumers resolve against: GitHub renders board.md in place,
// and show-repo's onBoardClick resolves against the board file's folder.
test('the href is relative to the board, not the tasks directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'board-'));
  try {
    const tasksDir = join(dir, 'tracker', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'a-000001.md'), '---\nid: a-000001\ntitle: T\nstatus: backlog\n---\n# T\n');
    const out = join(dir, 'tracker', 'board.md');
    execFileSync('python3', [GENERATOR, tasksDir, out]);
    assert.match(readFileSync(out, 'utf8'), /\(tasks\/a-000001\.md\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// An open tag is preserved in the file and never reaches the board (TRACKER.md,
// the two-layer rule). `next` is the one that got away: rendered for months
// while the schema did not define it, so it read as recognized without being
// specified anywhere, and on a closed task it printed "next: done" under Done.
// Held here by name, since it is the key that already breached the rule once.
test('an open tag never renders, next included', () => {
  const md = board({
    'a-000001': { title: 'Tagged task', status: 'backlog', next: 'the next step', priority: 'high' },
    'b-000002': { title: 'Closed task', status: 'done', next: 'done; landed on the branch' },
  });
  assert.match(md, /- 🎫 \[Tagged task\]\(tasks\/a-000001\.md\)$/m);
  assert.match(md, /- 🎫 \[Closed task\]\(tasks\/b-000002\.md\)$/m);
  assert.doesNotMatch(md, /next:/);
  assert.doesNotMatch(md, /priority/);
});

test('the four sections appear in order, and an empty one says so', () => {
  const md = board({ 'a-000001': { title: 'Only task', status: 'backlog' } });
  const heads = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['On deck', 'In progress', 'Blocked', 'Done']);
  assert.match(md, /## Blocked\n- \(none\)/);
});
