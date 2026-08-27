// Drive show-repo's estate into the Sessions pane and the Lists pane with
// fixture data, so both can be shot without a GitHub token.
//
// The sandbox has no token and no network, so the estate's real loads all fail
// and every authed pane collapses to its "set a token" line. This stubs the one
// thing those panes read (the component's own state) after Alpine has mounted,
// which is enough to render the layout truthfully: the markup, the classes, and
// the scroll containers are the page's, only the data is ours.
//
//   npm run shot -- app/index.html --query view=sessions \
//     --script tools/render/scenarios/estate-sessions.mjs --height 900
//
// CARD=turns|tools|files|tokens opens that pair's card on the first row. Those
// four numbers said what they counted only in a title, so the card is the only
// way a phone reader learns that 206 is tool calls and which tools they were.

const SESSIONS = [
  {
    id: 'b8fae678', agent: 'https://claude.ai/code/session_01SXuNTt', day: '2026-08-05',
    started: '2026-08-05T13:51:08Z', ended: '2026-08-05T16:49:16Z', mins: 178,
    ask: 'We recently done some significant work on surfacing our documentation in the show repo app. Discuss where we are at with that.',
    repos: [{ name: 'web-tools', branch: 'claude/show-repo-docs-surfacing-3sr7ab', lines: 572 },
            { name: 'home', branch: 'claude/show-repo-docs-surfacing-3sr7ab', lines: 3 }],
    branches: ['claude/show-repo-docs-surfacing-3sr7ab'],
    exchanges: 10, messages: 340, calls: 206, failures: 1,
    tools: [['Bash', 132], ['Edit', 34], ['Read', 17]],
    tokens: { input: 624, output: 337631, cache_read: 92466018, cache_write: 3979906 },
    filesTotal: 14, files: [['web-tools/lib/alpineComponents/estate.js', 11], ['web-tools/docs/showing.md', 4]],
    reply: 'The docs surfacing now runs through the Map view rather than through prose in CLAUDE.md: showing-mechanisms.csv is the data, the Showing tab renders it, and npm run showing prints the render line so the choice is executable rather than remembered.',
    replyCut: 'cut',
    schema: 4, sha: 'a',
  },
  {
    id: 'ae761f5d', agent: 'https://claude.ai/code/session_011jJdgM', day: '2026-08-05',
    started: '2026-08-05T09:12:00Z', ended: '2026-08-05T11:40:00Z', mins: 148,
    ask: 'Take a look at the tracker board generator and figure out why board.csv keeps changing when nothing changed.',
    repos: [{ name: 'web-tools', branch: 'claude/board-determinism-k2p1x', lines: 210 }],
    branches: ['claude/board-determinism-k2p1x'],
    exchanges: 6, messages: 190, calls: 118, failures: 0,
    tools: [['Bash', 71], ['Read', 22], ['Edit', 12]],
    tokens: { input: 400, output: 121000, cache_read: 41000000, cache_write: 2100000 },
    filesTotal: 6, files: [['web-tools/tools/build/tracker-board.mjs', 9]],
    reply: 'Found it: the board sorted on a Map iteration order that follows insertion, so two tasks closed in one commit swapped places on every regeneration. Sorting by id inside the group makes it byte-deterministic and the lockstep test now catches a relapse.',
    replyCut: '',
    schema: 4, sha: 'b',
  },
  {
    id: '3f3e759b', agent: '', day: '2026-08-03',
    started: '2026-08-03T14:02:00Z', ended: '2026-08-03T14:51:00Z', mins: 49,
    ask: 'What is in the budget-wa crosswalks directory and does the verify suite still pass?',
    repos: [{ name: 'budget-wa', branch: 'main', lines: 88 }],
    branches: [],
    exchanges: 3, messages: 64, calls: 41, failures: 3,
    tools: [['Bash', 33], ['Read', 6]],
    tokens: { input: 210, output: 38000, cache_read: 12000000, cache_write: 900000 },
    filesTotal: 0, files: [],
    reply: 'Nine crosswalk CSVs, and the verify suite passes.',
    replyCut: 'tail',
    schema: 2, sha: 'c',
  },
];

const ATTENTION = [
  { path: 'web-tools/lib/alpineComponents/estate.js', count: 31, sessions: 7, last: '2026-08-05T16:49:16Z' },
  { path: 'web-tools/CLAUDE.md', count: 12, sessions: 6, last: '2026-08-05T13:51:08Z' },
  { path: 'web-tools/docs/SURFACING.md', count: 9, sessions: 4, last: '2026-08-04T18:10:00Z' },
  { path: 'home/tracker/board.md', count: 8, sessions: 3, last: '2026-08-04T09:00:00Z' },
];

// The branch cache, in the shape allBranchRows reads: a scan per repo, an open
// PR index, and an any-state one. The Sessions pane nests these under the
// session that made them, and since 2026-08-27 the session card's own rail is
// their rollup, so a fixture without them would shoot the one thing the pane
// no longer does.
const ACTIVITY = {
  'mehrlander/web-tools': {
    defaultBranch: 'main', prReach: '',
    openPRs: [{ number: 271, head: 'claude/show-repo-docs-surfacing-3sr7ab', draft: false,
                title: 'Surface the docs registry in the Map view', aheadBy: 8, behindBy: 0,
                stats: { n: 14, added: 3, changed: 11, removed: 0, renamed: 0, split: true } }],
    branchPRs: [{ number: 271, head: 'claude/show-repo-docs-surfacing-3sr7ab', state: 'open' },
                { number: 262, head: 'claude/board-determinism-k2p1x', state: 'merged' }],
    scan: { branches: [
      { name: 'claude/show-repo-docs-surfacing-3sr7ab', sha: 'a1', group: 'active',
        date: '2026-08-05T16:49:16Z', firstDate: '2026-08-04T09:00:00Z',
        subject: 'Render showing-mechanisms.csv in the Map view',
        nUnique: 14, nLanded: 0, nMissing: 0, nDiffers: 14 },
      { name: 'claude/board-determinism-k2p1x', sha: 'b1', group: 'landed',
        date: '2026-08-05T11:40:00Z', firstDate: '2026-08-05T09:12:00Z',
        subject: 'Sort the board by id inside each group',
        stats: { n: 6, added: 0, changed: 6, removed: 0, renamed: 0, split: true },
        nUnique: 6, nLanded: 6, nMissing: 0, nDiffers: 0, aheadBy: 4, behindBy: 0 },
    ] },
  },
  'mehrlander/home': {
    defaultBranch: 'main', prReach: '',
    openPRs: [],
    branchPRs: [{ number: 118, head: 'claude/show-repo-docs-surfacing-3sr7ab', state: 'merged' }],
    scan: { branches: [
      { name: 'claude/show-repo-docs-surfacing-3sr7ab', sha: 'c1', group: 'landed',
        date: '2026-08-05T16:20:00Z', firstDate: '2026-08-05T14:00:00Z',
        subject: 'Point the conventions at the Map view',
        stats: { n: 3, added: 0, changed: 3, removed: 0, renamed: 0, split: true },
        nUnique: 3, nLanded: 3, nMissing: 0, nDiffers: 0, aheadBy: 1, behindBy: 0 },
    ] },
  },
};

const TODOS = [
  { id: 't1', text: 'Reconcile the landed branches in home and web-tools', done: false },
  { id: 't2', text: 'Decide whether the snags log gets a projector or stays hand-appended', done: false },
  { id: 't3', text: 'Refresh the entity index (30 days stale on the card)', done: false },
  { id: 't4', text: 'Read back the docs registry reach field after the skill rename', done: false },
  { id: 't5', text: 'Work out whether the sessions cache should carry attention or derive it', done: false },
  { id: 't6', text: 'Check the wsl-fetch cron is still landing its errand', done: false },
  { id: 't7', text: 'Follow up on the branch scan cap: 30 is dropping merged branches', done: false },
  { id: 't8', text: 'Pin the OFM fund crosswalk to the thirteen-bill corpus', done: true },
];

const JOTS = [
  { id: 'j1', text: 'A session is the act and a branch is the artifact. Both belong in Activity.', created_at: '2026-08-05T12:00:00Z' },
  { id: 'j2', text: 'Distinct sessions beats access count for "is this file load-bearing".', created_at: '2026-08-04T22:10:00Z' },
  { id: 'j3', text: 'The merge guide keys on delivery, the tracker on intent. Pick one axis.', created_at: '2026-08-04T08:30:00Z' },
  { id: 'j4', text: 'A record is captured, not derived: a lost derived file is an inconvenience.', created_at: '2026-08-03T19:45:00Z' },
  { id: 'j5', text: 'Presence is not use. The repos field is cwd, not what was attached.', created_at: '2026-08-03T11:20:00Z' },
];

// One record, for the DECK shot below. The list rows are the cache's summaries;
// this is the captured file behind the first of them, in the store's schema-4
// shape (sessions/README.md).
const RECORD = {
  schema: 4, short: 'b8fae678', day: '2026-08-05',
  session_id: 'b8fae678-1111-2222-3333-444455556666',
  agent_session: 'https://claude.ai/code/session_01SXuNTt',
  started: '2026-08-05T13:51:08Z', ended: '2026-08-05T16:49:16Z',
  repos: [{ name: 'web-tools', branch: 'claude/show-repo-docs-surfacing-3sr7ab', lines: 572 },
          { name: 'home', branch: 'claude/show-repo-docs-surfacing-3sr7ab', lines: 3 }],
  opening_ask: 'We recently done some significant work on surfacing our documentation in the show repo app. Discuss where we are at with that.',
  exchanges: 10, assistant_messages: 340, calls_total: 206, failures: 1,
  files_total: 14, tokens: { input: 624, output: 337631, cache_read: 92466018, cache_write: 3979906 },
  tools: { Bash: 132, Edit: 34, Read: 17 },
  prompts: [
    { at: '2026-08-05T13:51:08Z', text: 'We recently done some significant work on surfacing our documentation in the show repo app. Discuss where we are at with that.' },
    { at: '2026-08-05T14:40:00Z', text: 'Good. Can we get the mechanisms table rendering from the CSV rather than from prose?' },
    { at: '2026-08-05T16:10:00Z', text: 'Wrap up.' },
  ],
  replies: [
    { at: '2026-08-05T13:58:00Z', text: 'The docs registry is in place: docs.csv carries a row per document, the reach and words fields are derived by the commit hook, and the Map view renders both.' },
    { at: '2026-08-05T15:02:00Z', text: 'Done. showing-mechanisms.csv is the data now and the Showing tab renders it; CLAUDE.md keeps a pointer and the executable rule.' },
    { at: '2026-08-05T16:48:00Z', text: 'The docs surfacing now runs through the Map view rather than through prose in CLAUDE.md: showing-mechanisms.csv is the data, the Showing tab renders it, and npm run showing prints the render line so the choice is executable rather than remembered.' },
  ],
  calls: [],
};

export default async function (page) {
  await page.evaluate(({ SESSIONS, ATTENTION, ACTIVITY, TODOS, JOTS }) => {
    // The estate component's own root carries its Alpine scope.
    const host = document.querySelector('[x-data^="estate"]');
    const st = window.Alpine.$data(host);
    st.authed = true;
    st.loading = false;
    st.sessionsLoading = false;
    st.sessionRows_ = SESSIONS;
    st.sessionAttention = ATTENTION;
    st.activity = ACTIVITY;
    st.activityGeneratedAt = new Date(Date.now() - 42 * 60000).toISOString();
    st.sessionsGeneratedAt = new Date(Date.now() - 42 * 60000).toISOString();
    st.sessionScope = 'all';
    st.showAttention = true;
    st.todoLoading = false;
    st.todoItems = TODOS;
    st.jotLoading = false;
    st.jotItems = JOTS;
    // The shell gates the header nav and the pane chrome on a token too.
    window.__shell.hasToken = () => true;
  }, { SESSIONS, ATTENTION, ACTIVITY, TODOS, JOTS });
  await page.waitForTimeout(600);

  // DECK=1 opens the session swiper on the first row: the brief mounted as a
  // slide, which is the whole reason the view left pages/session.html. The
  // record lives in a private store this sandbox has no token for, so GH is
  // swapped for one that answers with a fixture; everything else, the deck
  // chrome, the lent head, the outline, is the page's own.
  if (process.env.DECK) {
    await page.evaluate((RECORD) => {
      const Real = window.GH;
      window.GH = class extends Real {
        async get(p) {
          if (p.startsWith('sessions/')) return { text: JSON.stringify(RECORD) };
          return super.get(p);
        }
      };
      const st = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      st.openSessionDetail(st.sessionRows[0]);
    }, RECORD);
    await page.waitForTimeout(2500);
    return;
  }

  const card = process.env.CARD;
  if (card) {
    // Anchored off the real trigger, so the panel lands where a reader's tap
    // would put it rather than at an invented coordinate.
    const sel = { turns: 'ph-chats-circle', tools: 'ph-wrench',
                  files: 'ph-files', tokens: null }[card];
    await page.evaluate(({ card, sel }) => {
      const host = document.querySelector('[x-data^="estate"]');
      const st = window.Alpine.$data(host);
      const row = st.sessionRows[0];
      const btn = sel
        ? document.querySelector(`.ph.${sel}`)?.closest('button')
        : [...document.querySelectorAll('button')].find(b => /^\s*\d+k?\s*$/.test(b.textContent));
      st.openSessionCard(row, card, btn || null);
    }, { card, sel });
    await page.waitForTimeout(400);
  }
}
