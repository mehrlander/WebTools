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
// CARD=reply opens the ask line's card, which renders the session as a
// transcript through kits/chat-render.js and so needs the network the other
// four do not.
// CARDTOP=1 scrolls that card back to its first entry (it opens at the last).
// STALE=1 puts the first row a summarizer version behind.

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
    // MARKDOWN, because a Claude reply is markdown and the store keeps it
    // verbatim: code spans, a bold run, a list, a fence. The fixture was plain
    // prose, so the card could print its source and look right.
    reply: [
      'The docs surfacing now runs through the **Map view** rather than through prose in `CLAUDE.md`:',
      '',
      '- `docs/showing-mechanisms.csv` is the data',
      '- the Showing tab renders it',
      '- `npm run showing` prints the line to paste',
      '',
      '```bash',
      'npm run showing',
      '```',
      '',
      'So the choice is executable rather than remembered.',
    ].join('\n'),
    replyCut: '',
    // The scroll back, in the shape repo-sessions-cache's priorTurns emits:
    // [role, head, clock, dropped?] tuples, chronological, both an ask and a
    // reply cut at 240 since 2026-08-28, the closing reply excluded because
    // `reply` above carries it. A user turn long enough to be cut is in here
    // deliberately: 36% of the store's are, and the chip that says so is the
    // one piece of card chrome with no other surface to be shot on.
    // Sentence-shaped heads at TURN_HEAD, the way priorTurns emits them: an
    // entry ends where a thought does. Narration turns are absent because the
    // card drops anything followed by tool calls, which the deck keeps.
    turns: [
      ['a', 'Here is where it stands. The mechanisms live as data in `docs/showing-mechanisms.csv`, and the Map view renders that file directly rather than restating it in prose.', '14:02:11', 2264],
      ['u', 'Can we get the render line printed rather than remembered? I keep handing over the wrong link and the section that was meant to stop it is the longest one in the file, so reading it is clearly not the thing that fixes this.', '14:19:40', 168],
      ['a', '`npm run showing` now reads the branch\'s changed files and prints the line to paste, or an honest no-link with the reason. The rule the section stated in prose is executable.', '14:31:07'],
      ['u', '[3 images]', '15:12:44'],
      ['u', 'Good. Please proceed with the Map view tab.', '15:20:03'],
      ['a', 'The Showing tab is up. It reads the CSV directly, so a new mechanism is a row rather than a paragraph, and the honesty gate survives because no script can supply it.', '15:44:29', 891],
    ],
    turnsCut: 'cut',
    askAt: '13:51:08',
    replyAt: '16:49:16',
    // The closing state, and it deliberately DISAGREES with the rail above it:
    // this session's branches shipped, and it still closed naming work for the
    // next go. That pair is the whole reason the glyph is on the row, so the
    // fixture has to be able to show it.
    state: 'ready',
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
    state: 'merged',
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
    // No `state`, and that is the schema-2 case: the record kept a tail of the
    // final turn and no replies, so there is nothing to read a marker out of.
    // Its slot draws empty, which is what holds the column straight.
    schema: 2, sha: 'c',
  },
  // Three more, for the two surfaces the state axis added: the chip row needs
  // more than one state to appear at all, and the Counts histogram needs a
  // distribution rather than a pair. Deliberately thin otherwise, since what
  // they exist to draw is one field.
  {
    id: '7c4a1e02', agent: '', day: '2026-08-04',
    started: '2026-08-04T10:00:00Z', ended: '2026-08-04T11:12:00Z', mins: 72,
    ask: 'The wsl-fetch cron has not landed its errand in three days. Work out whether it is the schedule or the runner.',
    repos: [{ name: 'web-tools', branch: 'claude/wsl-fetch-cron-8dk2mq', lines: 41 }],
    branches: ['claude/wsl-fetch-cron-8dk2mq'],
    exchanges: 5, messages: 88, calls: 63, failures: 0,
    tools: [['Bash', 44], ['Read', 11]],
    tokens: { input: 300, output: 71000, cache_read: 19000000, cache_write: 1200000 },
    filesTotal: 3, files: [['web-tools/.github/workflows/wsl-fetch.yml', 5]],
    reply: 'The schedule is fine and the runner is asleep: the cron fires while the machine is off, and a hosted runner cannot reach the share. It needs the self-hosted runner, which is yours to start.',
    replyCut: '', state: 'pending',
    schema: 4, sha: 'd',
  },
  {
    id: '2f81b9dd', agent: '', day: '2026-08-04',
    started: '2026-08-04T08:00:00Z', ended: '2026-08-04T09:05:00Z', mins: 65,
    ask: 'Should the snags log get a projector or stay hand-appended? Assess both and recommend.',
    repos: [{ name: 'web-tools', branch: 'claude/snags-projector-p91xzr', lines: 18 }],
    branches: ['claude/snags-projector-p91xzr'],
    exchanges: 4, messages: 51, calls: 29, failures: 0,
    tools: [['Read', 16], ['Bash', 9]],
    tokens: { input: 220, output: 44000, cache_read: 11000000, cache_write: 800000 },
    filesTotal: 2, files: [['web-tools/docs/SNAGS.md', 6]],
    reply: 'Both work and they cost differently. A projector keeps the index honest and adds a generator to the hook chain; hand-appending stays free and drifts. The call is yours.',
    replyCut: '', state: 'choice',
    schema: 4, sha: 'e',
  },
  // The unhealed row: a record the crawl has not re-read since the field
  // landed. It is the case the backfill line exists for, and the one absence
  // a Refresh can actually close. Its `v` is set in the page, off the live
  // ROW_V, so this fixture never hardcodes a version that drifts.
  {
    id: '5b0d33af', agent: '', day: '2026-08-02', behindV: true,
    started: '2026-08-02T13:00:00Z', ended: '2026-08-02T14:30:00Z', mins: 90,
    ask: 'Walk the docs registry and tell me which rows have gone orphan since the last skill rename.',
    repos: [{ name: 'web-tools', branch: 'claude/docs-reach-orphans-4mq7wz', lines: 96 }],
    branches: ['claude/docs-reach-orphans-4mq7wz'],
    exchanges: 7, messages: 120, calls: 84, failures: 0,
    tools: [['Bash', 58], ['Read', 14]],
    tokens: { input: 410, output: 96000, cache_read: 24000000, cache_write: 1500000 },
    filesTotal: 5, files: [['web-tools/docs/docs.csv', 7]],
    reply: 'Seventeen orphans, and the count is the smaller half of the story: they are 11% of the folder by words.',
    replyCut: '',
    schema: 4, sha: 'f',
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
  // The map the Files pane lists. Checkout-prefixed, as every key in a record's
  // `files` is, so the shot also exercises the estate's owner resolution.
  files: {
    'web-tools/lib/alpineComponents/estate.js': { read: 3, edit: 11 },
    'web-tools/docs/showing-mechanisms.csv': { read: 2, write: 1 },
    'web-tools/CLAUDE.md': { read: 6 },
    'web-tools/docs/showing.md': { read: 1, edit: 4 },
    'home/CLAUDE.md': { read: 2 },
  },
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
    // Every row at the CURRENT summarizer version except the one flagged
    // behindV, so the pane's backfill line and the Counts histogram's
    // "not read yet" bar have exactly one row to speak for.
    const V = window.RepoSessionsCache.ROW_V;
    st.sessionRows_ = SESSIONS.map(r => {
      const { behindV, ...row } = r;
      return { ...row, v: behindV ? V - 1 : V };
    });
    st.sessionAttention = ATTENTION;
    st.activity = ACTIVITY;
    // The estate's own membership, which is the only place a checkout name
    // ("web-tools") resolves to an owner. The session brief's Files pane takes
    // its link from here, so a fixture without it shoots the unlinked rows.
    st.entries = [{ repo: 'mehrlander/web-tools' }, { repo: 'mehrlander/home' }];
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
    if (process.env.PANE) await page.evaluate((v) => { window.__PANE = v; }, process.env.PANE);
    await page.evaluate((RECORD) => {
      const Real = window.GH;
      window.GH = class extends Real {
        async get(p) {
          if (p.startsWith('sessions/')) return { text: JSON.stringify(RECORD) };
          return super.get(p);
        }
      };
      const st = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      if (window.__PANE) st._openCard = { pane: window.__PANE };
      st.openSessionDetail(st.sessionRows[0]);
    }, RECORD);
    await page.waitForTimeout(2500);
    return;
  }

  // PENDING=1 strips the reply from the first row, which is the state most of
  // the store is in until the crawl has run twice against row version 5. It is
  // the case the reply card was invisible on when it first shipped.
  // STALE=1 sets the first row a version behind, which is what most of a
  // half-healed store looks like: current text on some rows, older and shorter
  // text on the rest, with nothing on screen to tell them apart until now.
  if (process.env.STALE) {
    await page.evaluate(() => {
      const st = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      const behind = window.RepoSessionsCache.ROW_V - 2;
      st.sessionRows_ = st.sessionRows_.map((r, i) => (i ? r : { ...r, v: behind }));
    });
    await page.waitForTimeout(200);
  }

  if (process.env.PENDING) {
    await page.evaluate(() => {
      const st = window.Alpine.$data(document.querySelector('[x-data^="estate"]'));
      st.sessionRows_ = st.sessionRows_.map((r, i) =>
        (i ? r : { ...r, reply: '', replyCut: '', turns: [], turnsCut: '', replyAt: '' }));
    });
    await page.waitForTimeout(200);
  }

  const card = process.env.CARD;
  if (card) {
    // Anchored off the real trigger, so the panel lands where a reader's tap
    // would put it rather than at an invented coordinate.
    const sel = { turns: 'ph-chats-circle', tools: 'ph-wrench',
                  files: 'ph-files', tokens: null, reply: null }[card];
    await page.evaluate(({ card, sel }) => {
      const host = document.querySelector('[x-data^="estate"]');
      const st = window.Alpine.$data(host);
      const row = st.sessionRows[0];
      // The reply card opens off the ask LINE, which is a <p> and not a
      // button: that is the whole point of it staying prose.
      const btn = card === 'reply'
        ? document.querySelector('p.truncate.mt-0\\.5')
        : sel
        ? document.querySelector(`.ph.${sel}`)?.closest('button')
        : [...document.querySelectorAll('button')].find(b => /^\s*\d+k?\s*$/.test(b.textContent));
      st.openSessionCard(row, card, btn || null);
    }, { card, sel });
    await page.waitForTimeout(400);
    // CARDTOP=1 scrolls the reply card back to its first entry. The card opens
    // at the BOTTOM, on the closing reply, so the head of the scroll back and
    // the truncation note are otherwise unshootable.
    if (process.env.CARDTOP) {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('div.fixed.overflow-y-auto')]
          .find(d => d.scrollHeight > d.clientHeight);
        if (el) el.scrollTop = 0;
      });
      await page.waitForTimeout(150);
    }
  }
}
