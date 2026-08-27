// .claude/skills/tasks/build-board.py — the canonical board generator, bundled
// in the portable plugin and run by every tracker in the estate. A regression
// here is silent and repo-wide, so the behavior worth pinning is the part with
// branches: how `depends-on: <id>[, <id>...]` renders, and that a dormant task
// is rendered on no section at all.
//
// The generator is python3/stdlib, so this drives it the way a tracker does,
// through the file system, and reads the board it writes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseCsv } from '../build/registries-load.mjs';

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
    'waiter-000001': { title: 'The waiting task', status: 'backlog', 'depends-on': 'blocker-000002' },
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
    'waiter-000001': { title: 'The waiting task', status: 'backlog', 'depends-on': 'blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'done' },
  });
  assert.match(md, /- 🎫 \[The waiting task\]\(tasks\/waiter-000001\.md\)$/m);
});

test("a done task's dependency renders nothing, even when unmet", () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'done', 'depends-on': 'blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /- 🎫 \[The waiting task\]\(tasks\/waiter-000001\.md\)$/m);
});

test('a dependency on an id no task defines is surfaced, not swallowed', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog', 'depends-on': 'ghost-000009' },
  });
  // One phrasing for every unmet dependency, resolved or not, since a list can
  // mix them: `(needs: A; ` + '`ghost`' + `, which no task file defines)`.
  assert.match(md, /\[The waiting task\]\(tasks\/waiter-000001\.md\) \(needs: `ghost-000009`, which no task file defines\)/);
});

test('an absent depends-on renders nothing, which is how a task says it is independent', () => {
  // The retired `track` field carried `independent` and `anchor` as values the
  // generator never read. Absence replaces both: there is no value meaning "no
  // dependency", because not having the key already says it.
  const md = board({
    'a-000001': { title: 'Independent task', status: 'backlog' },
    'b-000002': { title: 'Another task', status: 'backlog' },
  });
  assert.match(md, /- 🎫 \[Independent task\]\(tasks\/a-000001\.md\)$/m);
  assert.match(md, /- 🎫 \[Another task\]\(tasks\/b-000002\.md\)$/m);
});

test('depends-on takes several ids, and only the unmet ones render', () => {
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog',
                       'depends-on': 'met-000002, unmet-000003, alsounmet-000004' },
    'met-000002': { title: 'Already finished', status: 'done' },
    'unmet-000003': { title: 'First blocker', status: 'backlog' },
    'alsounmet-000004': { title: 'Second blocker', status: 'blocked' },
  });
  assert.match(md, /\[The waiting task\]\(tasks\/waiter-000001\.md\) \(needs: First blocker; Second blocker\)/);
});

test('a dormant task is rendered on no section at all, and still reaches board.csv', () => {
  // The point of the status: preserved, not surfaced. A reader of the board
  // must not meet it; a consumer of the typed projection must still find it.
  const { md, csv } = both({
    'live-000001': { title: 'A live task', status: 'backlog' },
    'parked-000002': { title: 'A parked idea', status: 'dormant' },
  });
  assert.doesNotMatch(md, /A parked idea/);
  assert.doesNotMatch(md, /parked-000002/);
  assert.match(md, /- 🎫 \[A live task\]\(tasks\/live-000001\.md\)$/m);
  assert.match(csv, /^parked-000002,A parked idea,dormant,/m);
});

test("a dormant task's dependency is history, like a done task's", () => {
  const md = board({
    'parked-000001': { title: 'A parked idea', status: 'dormant',
                       'depends-on': 'blocker-000002' },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.doesNotMatch(md, /A parked idea/);
});

test('a dependency satisfied by a dormant task renders nothing', () => {
  // Dormant means nobody is going to do it, so waiting on it is not a live
  // blocker to report; it is a fact about the waiting task's own future.
  const md = board({
    'waiter-000001': { title: 'The waiting task', status: 'backlog',
                       'depends-on': 'parked-000002' },
    'parked-000002': { title: 'A parked idea', status: 'dormant' },
  });
  assert.match(md, /- 🎫 \[The waiting task\]\(tasks\/waiter-000001\.md\)$/m);
});

test('the owning branch and the dependency render in a stable order, and nothing else does', () => {
  const md = board({
    'waiter-000001': {
      title: 'The waiting task', status: 'in-progress', session: 'claude/some-branch',
      'depends-on': 'blocker-000002', next: 'the next step',
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

// ── size and awaiting ──────────────────────────────────────────────────────
// Two independent questions. `status` says whether a session can start a task;
// `awaiting` says what is holding it, which is why it renders on backlog rows
// and not only blocked ones: a task can be startable in part and still wait on
// someone for the rest.

test('size and awaiting render on an open task, awaiting last', () => {
  const md = board({
    'a-000001': { title: 'Big task', status: 'backlog', size: 'XL', awaiting: 'your ratification' },
  });
  assert.match(md, /- 🎫 \[Big task\]\(tasks\/a-000001\.md\) · XL \(awaiting: your ratification\)$/m);
});

test('awaiting renders on a backlog row, not only a blocked one', () => {
  const md = board({
    'a-000001': { title: 'Partly gated', status: 'backlog', awaiting: 'your call on the split' },
  });
  assert.match(md, /## On deck\n- 🎫 \[Partly gated\].*\(awaiting: your call on the split\)$/m);
});

// A finished task's estimate and its old blocker are history, the same rule
// that already silences `depends-on:` under Done.
test('size and awaiting are silent on a done task', () => {
  const md = board({
    'a-000001': { title: 'Finished', status: 'done', size: 'L', awaiting: 'something old' },
  });
  assert.match(md, /- 🎫 \[Finished\]\(tasks\/a-000001\.md\)$/m);
});

test('the owning branch, dependency, size and awaiting hold a stable order', () => {
  const md = board({
    'waiter-000001': {
      title: 'Everything at once', status: 'in-progress', size: 'M',
      session: 'claude/some-branch', 'depends-on': 'blocker-000002',
      awaiting: 'the blocker to land',
    },
    'blocker-000002': { title: 'The blocking task', status: 'backlog' },
  });
  assert.match(md, /- 🎫 \[Everything at once\]\(tasks\/waiter-000001\.md\) · M \(`claude\/some-branch`\) \(needs: The blocking task\) \(awaiting: the blocker to land\)$/m);
});

// A free-text field carrying a colon is the natural case for `awaiting:` and
// the generator's parser splits on the FIRST colon, so it survives. This is
// the case a YAML reader would fail the whole file on.
test('awaiting survives a colon in its value', () => {
  const md = board({
    'a-000001': { title: 'Gated', status: 'blocked', awaiting: 'OFM ruling: candidate 1' },
  });
  assert.match(md, /\(awaiting: OFM ruling: candidate 1\)$/m);
});

// ── board.csv and board-tags.csv, the typed projection ─────────────────────
// Emitted from the same run as board.md so the three cannot drift. They exist
// so show-repo never has to parse the rendered board to recover a field it
// could have been handed. Two files because a task carries two grains: the
// recognized keys are one row per task, the open tags one row per pair, and a
// CSV holds one table.

// Render all three projections and return {md, rows, tags}.
function both(tasks, bodies = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'board-'));
  try {
    const tasksDir = join(dir, 'tasks');
    mkdirSync(tasksDir);
    for (const [id, fm] of Object.entries(tasks)) {
      const head = Object.entries({ id, ...fm }).map(([k, v]) => `${k}: ${v}`).join('\n');
      writeFileSync(join(tasksDir, `${id}.md`),
        `---\n${head}\n---\n# ${fm.title}\n${bodies[id] || ''}\n`);
    }
    const out = join(dir, 'board.md');
    execFileSync('python3', [GENERATOR, tasksDir, out]);
    const csv = readFileSync(join(dir, 'board.csv'), 'utf8');
    const tagsCsv = readFileSync(join(dir, 'board-tags.csv'), 'utf8');
    return {
      md: readFileSync(out, 'utf8'),
      csv, tagsCsv,
      rows: parseCsv(csv),
      tags: parseCsv(tagsCsv),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('board.csv lands beside board.md with one row per task', () => {
  const { rows } = both({
    'a-000001': { title: 'First', status: 'backlog' },
    'b-000002': { title: 'Second', status: 'done', closed: '2026-08-01' },
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((t) => t.title), ['First', 'Second']);
  assert.equal(rows[0].href, 'tasks/a-000001.md');
});

// Every row carries every column, in the order the generator fixes, so a
// reader can address a field by position and a diff shows a changed value
// rather than a reshuffled schema.
test('the columns are fixed and complete, whatever the tasks carry', () => {
  const { csv } = both({ 'a-000001': { title: 'T', status: 'backlog' } });
  const [head, first] = csv.trim().split('\n');
  assert.equal(head, 'id,title,status,project,depends-on,opened,closed,session,size,' +
                     'awaiting,blockedBy,file,href,lastActivity,logEntries');
  assert.equal(first.split(',').length, head.split(',').length);
});

// The two-layer split survives into the projection as two files: a consumer
// must not be able to mistake an unpromoted tag for part of the contract.
test('recognized keys are columns, open tags are rows in the second file', () => {
  const { rows, tags } = both({
    'a-000001': { title: 'T', status: 'backlog', size: 'M', awaiting: 'your call', priority: 'high' },
  });
  const t = rows[0];
  assert.equal(t.size, 'M');
  assert.equal(t.awaiting, 'your call');
  assert.equal(t.priority, undefined);
  assert.deepEqual(tags, [{ task: 'a-000001', tag: 'priority', value: 'high' }]);
});

// The tag file exists even when nothing is tagged. An absent file and an empty
// one read the same to a consumer only if the empty one is guaranteed, and the
// derived-artifacts gate compares bytes, so it has to be written either way.
test('the tag file is written with its header even when no task is tagged', () => {
  const { tagsCsv, tags } = both({ 'a-000001': { title: 'T', status: 'backlog' } });
  assert.equal(tagsCsv, 'task,tag,value\n');
  assert.deepEqual(tags, []);
});

// The signal nothing surfaced before: a task's real freshness is the newest
// date in its progress log, not `opened:`. It is what separates a live task
// from one that has only been refined.
test('lastActivity is the newest progress-log date, with an entry count', () => {
  const { rows } = both(
    { 'a-000001': { title: 'T', status: 'backlog', opened: '2026-06-01' } },
    {
      'a-000001': [
        '## Progress log',
        '- 2026-06-01: filed',
        '- 2026-07-28: tracker review, no work',
        '- 2026-07-10: scouted (out of order on purpose)',
      ].join('\n'),
    });
  assert.equal(rows[0].lastActivity, '2026-07-28');
  assert.equal(rows[0].logEntries, '3');
});

test('a task with no progress log reports empty rather than guessing', () => {
  const { rows } = both({ 'a-000001': { title: 'T', status: 'backlog', opened: '2026-06-01' } });
  assert.equal(rows[0].lastActivity, '');
  assert.equal(rows[0].logEntries, '0');
});

test('an unmet dependency reaches the projection as a resolved phrase', () => {
  const { rows } = both({
    'waiter-000001': { title: 'Waiter', status: 'backlog', 'depends-on': 'blocker-000002' },
    'blocker-000002': { title: 'Blocker', status: 'backlog' },
  });
  const w = rows.find((t) => t.title === 'Waiter');
  assert.equal(w.blockedBy, 'needs: Blocker');
  const b = rows.find((t) => t.title === 'Blocker');
  assert.equal(b.blockedBy, '');
});

// A comma in a title is the ordinary case, not an edge one, and an unquoted
// one would shift every later column by one without any parser complaining.
test('a cell holding a comma or a quote survives the round trip', () => {
  const { rows } = both({
    'a-000001': { title: 'Split the registry, keep the "gate"', status: 'backlog' },
  });
  assert.equal(rows[0].title, 'Split the registry, keep the "gate"');
});

// No timestamp anywhere in the artifact: the derived-artifacts gate re-runs the
// generator against a clean tree and compare, so a clock in the output would
// fail on every run.
test('the projection is byte-identical for the same input', () => {
  const a = both({ 'a-000001': { title: 'T', status: 'backlog' } });
  const b = both({ 'a-000001': { title: 'T', status: 'backlog' } });
  assert.equal(a.csv, b.csv);
  assert.equal(a.tagsCsv, b.tagsCsv);
  assert.doesNotMatch(a.csv, /generated|timestamp/i);
});
