// show-repo's Board pane, reading the TYPED projection.
//
// The pane used to fetch board.md and hand it to marked, so the app's
// understanding of a tracker was a string: it could display the list and answer
// nothing about it. It now reads board.csv (docs/TRACKER.md, the typed
// projection) and derives the review signals from it.
//
// Two things are worth pinning and neither is cosmetic. The FALLBACK, because
// it is what lets this ship before every tracker in the estate has regenerated:
// a ref with no projection must still get its board. And the DERIVATIONS, whose
// edge cases ("no log" is not "old") are the whole reason a review surface is
// more than a renderer.
//
// The shell's app() lives inline in app/index.html, so this drives it through
// the shared show-repo-shell.mjs harness.

import test from 'node:test';
import assert from 'node:assert/strict';
import { page, makeShell } from './show-repo-shell.mjs';

// A fixed clock, so age assertions are not a function of when the suite runs.
const NOW = Date.parse('2026-08-04T00:00:00Z');

const T = (over = {}) => ({
  title: 'A task', status: 'backlog', file: 'a-000001.md',
  href: 'tasks/a-000001.md', lastActivity: '2026-08-01', logEntries: 2, ...over,
});

// The projection as the generator writes it: a fixed header, every row filled.
const COLS = ['title', 'status', 'size', 'session', 'awaiting', 'blockedBy',
              'file', 'href', 'lastActivity', 'logEntries'];
const csvOf = (...tasks) => [COLS.join(','),
  ...tasks.map(t => COLS.map(c => {
    const s = String(t[c] ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(','))].join('\n') + '\n';

// `project` is derived from projectPath, so a test opens a workspace rather
// than assigning the object; the derived board is <path>/tracker/board.md.
const WS = 'projects/budget-drs';
const BOARD = WS + '/tracker/board.md';
const BOARD_CSV = WS + '/tracker/board.csv';

// Drive loadProjectBoard with a stubbed gh whose get() answers per path.
function boardShell(files) {
  const gh = { get: async (p) => {
    if (!(p in files)) throw new Error('404 ' + p);
    return { text: files[p] };
  } };
  const { shell } = makeShell({ browserStore: { repo: 'o/r', ref: 'main', gh } });
  shell.projectPath = WS;
  return shell;
}

test('the projection is preferred, and the markdown is never fetched for it', async () => {
  const asked = [];
  const gh = { get: async (p) => {
    asked.push(p);
    if (p === BOARD_CSV) return { text: csvOf(T()) };
    throw new Error('404');
  } };
  const { shell } = makeShell({ browserStore: { repo: 'o/r', ref: 'main', gh } });
  shell.projectPath = WS;
  await shell.loadProjectBoard();
  assert.equal(shell.projectBoardTasks.length, 1);
  assert.equal(shell.projectBoardHtml, '', 'the markdown path did not run');
  assert.deepEqual(asked, [BOARD_CSV], 'one fetch, not two');
});

// The fallback is load-bearing: it is what lets the pane ship before every
// tracker in the estate has regenerated through the new generator.
test('a ref with no projection still renders its markdown board', async () => {
  const shell = boardShell({ [BOARD]: '# Board\n\n- 🎫 [T](tasks/a.md)\n' });
  shell.projectBoardHtml = '';
  await shell.loadProjectBoard();
  assert.equal(shell.projectBoardTasks, null);
  assert.match(shell.projectBoardHtml, /Board/);
});

// A CSV parser accepts almost any bytes, so "unparseable" is not the failure
// mode here; a header with no rows under it is. Accepting it would paint an
// empty board over a tracker that has one.
test('a header with no rows is not treated as a projection', async () => {
  const shell = boardShell({
    [BOARD_CSV]: COLS.join(',') + '\n',
    [BOARD]: '# Board\n',
  });
  await shell.loadProjectBoard();
  assert.equal(shell.projectBoardTasks, null);
  assert.match(shell.projectBoardHtml, /Board/);
});

// logEntries is the one numeric column and a CSV hands back strings, so the
// read coerces it; the age line does arithmetic on the count beside it.
test('logEntries arrives as a number, not the string the CSV carried', async () => {
  const shell = boardShell({ [BOARD_CSV]: csvOf(T({ logEntries: 5 })) });
  await shell.loadProjectBoard();
  assert.strictEqual(shell.projectBoardTasks[0].logEntries, 5);
});

test('the projection path is the board file with a csv suffix', () => {
  const { shell } = makeShell();
  shell.projectPath = WS;
  assert.equal(shell.projectBoardCsvFile, BOARD_CSV);
  shell.projectPath = '';
  assert.equal(shell.projectBoardCsvFile, '', 'no workspace, no projection path');
});

test('groups follow the board sections in order, empty ones dropped', () => {
  const { shell } = makeShell();
  shell.projectBoardTasks = [
    T({ status: 'done', file: 'd.md' }), T({ status: 'backlog', file: 'b.md' }),
    T({ status: 'blocked', file: 'k.md' }),
  ];
  assert.deepEqual(shell.projectBoardGroups.map(g => g.label),
    ['On deck', 'Blocked', 'Done'], 'In progress is empty and absent');
  assert.equal(shell.projectBoardGroups[0].tasks.length, 1);
});

test('no projection yields no groups rather than throwing', () => {
  const { shell } = makeShell();
  shell.projectBoardTasks = null;
  assert.deepEqual(shell.projectBoardGroups, []);
});

// "Never logged" is a different fact from "old" and must not collapse into it:
// a task nobody has written a line about has not aged, it never started.
test('age is null without a log, and days since the newest entry with one', () => {
  const { shell } = makeShell();
  assert.equal(shell.boardTaskAge(T({ lastActivity: '2026-08-01' }), NOW), 3);
  assert.equal(shell.boardTaskAge(T({ lastActivity: '' }), NOW), null);
  assert.equal(shell.boardTaskAge(T({ lastActivity: 'not-a-date' }), NOW), null);
  assert.equal(shell.boardTaskAge(undefined, NOW), null);
});

test('the review line counts the open set only, and splits stale from unlogged', () => {
  const { shell } = makeShell();
  shell.projectBoardTasks = [
    T({ file: '1.md', lastActivity: '2026-08-03' }),                       // fresh
    T({ file: '2.md', lastActivity: '2026-06-01' }),                       // stale
    T({ file: '3.md', lastActivity: '', logEntries: 0 }),                  // never logged
    T({ file: '4.md', status: 'blocked', awaiting: 'your call' }),         // awaiting
    T({ file: '5.md', status: 'done', lastActivity: '2026-01-01' }),       // excluded
  ];
  const r = shell.projectBoardReview(NOW);
  assert.deepEqual(r, { open: 4, awaiting: 1, stale: 1, untouched: 1 });
});

// An unlogged task must not be counted stale as well: its age is null, and a
// naive `>= 21` on a null would have made it both.
test('a never-logged task is counted once, as unlogged', () => {
  const { shell } = makeShell();
  shell.projectBoardTasks = [T({ lastActivity: '', logEntries: 0 })];
  const r = shell.projectBoardReview(NOW);
  assert.equal(r.untouched, 1);
  assert.equal(r.stale, 0);
});

// Rows reach the viewer the same way a markdown row does, resolving against the
// board FILE's folder rather than the pane's own URL.
test('opening a row resolves its href against the board folder', () => {
  const { shell } = makeShell();
  shell.projectPath = WS;
  const opened = [];
  shell.openFile = (p) => opened.push(p);
  shell.openBoardTask(T({ href: 'tasks/enacted-basis-dws9ij.md' }));
  assert.deepEqual(opened, [WS + '/tracker/tasks/enacted-basis-dws9ij.md']);
});

test('a row with no href opens nothing rather than the workspace root', () => {
  const { shell } = makeShell();
  shell.projectPath = WS;
  const opened = [];
  shell.openFile = (p) => opened.push(p);
  shell.openBoardTask(T({ href: '' }));
  assert.deepEqual(opened, []);
});

// The markup half: a getter nothing renders is a getter that silently rots.
test('the pane markup binds the projection, both branches of the fallback', () => {
  for (const bind of ['projectBoardGroups', 'projectBoardReview()', 'boardTaskAge(t)',
                      'openBoardTask(t)', 'projectBoardShowDone']) {
    assert.ok(page.includes(bind), `the board pane must bind ${bind}`);
  }
  assert.match(page, /x-show="!projectBoardLoading && !projectBoardTasks && projectBoardHtml"/,
    'the markdown article renders only when there is no projection');
});
