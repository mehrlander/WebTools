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

test('an unmet dependency names the blocker by title, not by id', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog', track: 'depends-on:blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /The waiting task \(needs: The blocking task\)/);
  // The id is a filing handle and means nothing to a reader (TRACKER.md).
  assert.doesNotMatch(md, /blocker-000002/);
});

test('a satisfied dependency renders nothing', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog', track: 'depends-on:blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'done' },
  });
  assert.match(md, /- 🎫 The waiting task$/m);
});

test("a done task's dependency renders nothing, even when unmet", () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'done', track: 'depends-on:blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /- 🎫 The waiting task$/m);
});

test('a dependency on an id no task defines is surfaced, not swallowed', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog', track: 'depends-on:ghost-000009' },
  });
  assert.match(md, /The waiting task \(needs `ghost-000009`, which no task file defines\)/);
});

test('track: independent and other track values render nothing', () => {
  const md = board({
    'a-000001': { title: 'Independent task', status: 'backlog', track: 'independent' },
    'b-000002': { title: 'Anchor task', status: 'backlog', track: 'anchor' },
  });
  assert.match(md, /- 🎫 Independent task$/m);
  assert.match(md, /- 🎫 Anchor task$/m);
});

test('the owning branch and the dependency render in a stable order, and nothing else does', () => {
  const md = board({
    'waiter-000001': {
      title: 'The waiting task', status: 'in-progress', session: 'claude/some-branch',
      track: 'depends-on:blocker-000002', next: 'the next step',
    },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /- 🎫 The waiting task \(`claude\/some-branch`\) \(needs: The blocking task\)$/m);
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
  assert.match(md, /- 🎫 Tagged task$/m);
  assert.match(md, /- 🎫 Closed task$/m);
  assert.doesNotMatch(md, /next:/);
  assert.doesNotMatch(md, /priority/);
});

test('the four sections appear in order, and an empty one says so', () => {
  const md = board({ 'a-000001': { title: 'Only task', status: 'backlog' } });
  const heads = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(heads, ['On deck', 'In progress', 'Blocked', 'Done']);
  assert.match(md, /## Blocked\n- \(none\)/);
});
