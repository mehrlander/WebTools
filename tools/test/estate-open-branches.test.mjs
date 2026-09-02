// alpineComponents/estate.js — the Activity view's branch list: the projection
// from the activity cache to rows (allBranchRows), the SCOPE axis over the
// scan's groups (branchScope / inScope / branchScopes, with openBranches the
// scoped list), the repo filter chips (openRepos / activeRepoFilter /
// openRows), the lifespan pair each row shows (branchStart), and the per-row
// GitHub menu (branchMenuItems / runBranchMenu).
//
// `activity` is assigned directly rather than loaded over a fake registry: all
// of the above are pure getters over that map, so the load path (covered in
// estate-rows) is not what these are testing. No network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, deckGeometry } from './bootstrap.mjs';

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; }
  // The relative-time source behind agoOf/agoShort. Fixed "now" so the
  // lifespan labels below are deterministic.
  ago(iso) {
    const h = Math.round((Date.parse('2026-07-20T00:00:00Z') - Date.parse(iso)) / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return h + ' hours ago';
    return Math.round(h / 24) + ' days ago';
  }
  async get() { throw new Error('404'); }
  async ls() { throw new Error('404'); }
  async req() { throw new Error('404'); }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
const opened = [];
window.open = (url) => { opened.push(url); return null; };
window.__shell = {
  REGISTRY_REPO: 'me/registry',
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
  // The geometry the branch menu borrows from the sidebar's repo menu.
  anchorMenu: (ev, rows, opts = {}) => ({ x: 10, y: 20, rows, ...opts }),
  menuStyle: (at) => at ? `left:${at.x}px;top:${at.y}px` : 'left:-9999px;top:-9999px',
};

deckGeometry(window);   // the takeover is a swipe-deck now; jsdom needs a track to scroll
// mountDeck pulls the branch view's kit chain through gh.load on first use.
// The kits themselves are loaded below by startAlpine, so the loader only has
// to exist and resolve; without it the whole mount is caught and abandoned.
window.gh = { load: async () => {} };

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/branch-status.js',      // the lifespan display rules live here, shared
  'lib/kits/swipe-deck.js',         // the takeover IS one
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
// A slide mounts the real branch view, which reads the network and has its own
// suites. Here the deck's bookkeeping is the subject, so a slide is a name.
Alpine.data('branchBrief', (opts) => ({ opts, init(){ this.$el.textContent = opts.branch; } }));
const data = Alpine.$data(window.document.getElementById('es'));
const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

// A cache entry: `branches` are scan rows, `prs` are open pull requests.
const entry = (branches, prs, def = 'main') => ({
  defaultBranch: def,
  openPRs: prs,
  scan: { branches },
});

// Two repos with work in flight and one with none, exercising every way a row
// reaches the list: a stranded branch with a draft PR, a stranded branch with
// none, an open PR the scan never reached, and a landed branch (never shown).
const seed = () => {
  data.activity = {
    'me/tools': entry(
      [
        { name: 'feat/a', sha: 'a1', group: 'stranded', date: '2026-07-19T22:00:00Z',
          firstDate: '2026-07-05T00:00:00Z', subject: 'work a', aheadBy: 4, behindBy: 1 },
        { name: 'feat/b', sha: 'b1', group: 'stranded', date: '2026-07-18T00:00:00Z',
          firstDate: '2026-07-17T20:00:00Z', subject: 'work b', aheadBy: 1, behindBy: 0 },
        { name: 'old/landed', sha: 'c1', group: 'landed', date: '2026-06-01T00:00:00Z' },
      ],
      [{ number: 12, head: 'feat/a', draft: true, title: 'PR a', updatedAt: '2026-07-19T22:00:00Z',
         aheadBy: 4, behindBy: 1, firstDate: '2026-07-05T00:00:00Z' }],
    ),
    'me/home': entry(
      [],
      [{ number: 7, head: 'fresh', draft: false, title: 'PR fresh', updatedAt: '2026-07-17T12:00:00Z',
         aheadBy: 2, behindBy: 0, firstDate: '2026-07-10T00:00:00Z' }],
    ),
    'me/quiet': entry([{ name: 'done', sha: 'd1', group: 'landed', date: '2026-05-01T00:00:00Z' }], []),
  };
  data.openRepoFilter = '';
};
seed();

// Values cross the jsdom realm boundary, so deepEqual would fail on prototype
// identity alone (the estate-rows suite does the same).
const plain_ = (v) => JSON.parse(JSON.stringify(v));
const names = (rows) => plain_(rows.map(r => r.repo + '/' + r.name));

// The component's own default, captured before the baseline below overrides it.
// Recorded rather than assumed: these tests share one `data`, so a test that
// inherits a default is really asserting the previous test's leftovers.
const DEFAULT_SCOPE = data.branchScope;
// Most of this file was written against Open and reads its semantics, so the
// baseline is stated once here instead of riding on whatever the default
// happens to be. Tests that need another scope set it and restore it.
data.branchScope = 'open';

test('openBranches: open PRs and stranded branches only, freshest first', () => {
  assert.deepEqual(names(data.openBranches),
    ['me/tools/feat/a', 'me/tools/feat/b', 'me/home/fresh']);
});

// ── The line that says what the branch is FOR ────────────────────────────
// It was the tip commit's subject alone, which answers a different question:
// what happened last here. Measured over the committed crawl on 2026-08-31,
// the tip and the PR title differ on 81% of the branches that have both, and
// 23% of tips are merge commits, which name no work at all. The title is
// already cached per branch and was already rendered into the PR link's title
// attribute, where a phone never reaches it.
test('the branch line prefers the PR title, and falls back to the tip subject', () => {
  const [a, b, fresh] = data.openBranches;
  assert.deepEqual(plain_(data.branchLine(a)), { text: 'PR a', pr: true },
    'a branch with a PR is named by its PR');
  assert.deepEqual(plain_(data.branchLine(b)), { text: 'work b', pr: false },
    'and one without falls back to the tip, marked as a commit line');
  assert.deepEqual(plain_(data.branchLine(fresh)), { text: 'PR fresh', pr: true },
    'including a PR the scan never reached');
  assert.equal(data.branchLine({ repo: 'me/tools', name: 'x' }), null,
    'a branch with neither says nothing rather than an empty line');
});

// A closed or merged PR still names the work. `rowPR` prefers the open PR and
// falls back to the last one of any state, which is the whole reason the line
// reaches 80% of branches rather than the 3% that are open right now.
test('the line takes a merged PR\'s title, not only an open one', () => {
  const row = { repo: 'me/tools', name: 'gone', subject: 'Merge origin/main',
                prLast: { number: 4, state: 'closed', title: 'the work it shipped' } };
  assert.deepEqual(plain_(data.branchLine(row)), { text: 'the work it shipped', pr: true });
});

test('a row takes its start from whichever compare the crawl ran', () => {
  const [a, b, fresh] = data.openBranches;
  assert.equal(a.first, '2026-07-05T00:00:00Z');      // the PR head's compare
  assert.equal(b.first, '2026-07-17T20:00:00Z');      // the scan's
  assert.equal(fresh.first, '2026-07-10T00:00:00Z');  // a PR the scan never reached
});

test('branchStart: the lifespan reads "15 days → 2 hours", collapsed when equal', () => {
  const [a, b] = data.openBranches;
  assert.equal(data.branchStart(a), '15 days');
  assert.equal(data.agoShort(a.date), '2 hours');
  // feat/b started and was last touched the same rounded distance ago, so the
  // start is dropped: "2 days" is the answer, "2 days → 2 days" is noise.
  assert.equal(data.agoShort(b.first), data.agoShort(b.date));
  assert.equal(data.branchStart(b), '');
});

test('branchStart: an unknowable start says nothing', () => {
  assert.equal(data.branchStart({ first: '', date: '2026-07-19T22:00:00Z' }), '');
  assert.equal(data.branchSpanTitle({ first: '', date: '2026-07-19T22:00:00Z' }), 'latest 2 hours ago');
  assert.equal(data.branchSpanTitle(data.openBranches[0]), 'started 15 days ago, latest 2 hours ago');
});

test('openRepos: only repos with open rows, busiest first', () => {
  assert.deepEqual(plain_(data.openRepos.map(r => [r.short, r.count])), [['tools', 2], ['home', 1]]);
  // me/quiet is in the estate and in the cache, but has nothing in flight.
  assert.ok(!data.openRepos.some(r => r.repo === 'me/quiet'));
});

test('the filter narrows the rendered rows, not the total', () => {
  data.openRepoFilter = 'me/home';
  assert.deepEqual(names(data.openRows), ['me/home/fresh']);
  assert.equal(data.openBranches.length, 3, 'the tab badge still counts everything');
  data.openRepoFilter = '';
  assert.equal(data.openRows.length, 3);
});

test('a filter whose repo goes quiet lapses back to All', () => {
  data.openRepoFilter = 'me/home';
  assert.equal(data.activeRepoFilter, 'me/home');
  // A refresh lands a cache where me/home has nothing open left.
  data.activity = { ...data.activity, 'me/home': entry([], []) };
  assert.equal(data.activeRepoFilter, '', 'no chip is lit, so show everything');
  assert.deepEqual(names(data.openRows), ['me/tools/feat/a', 'me/tools/feat/b']);
  seed();
});

test('branchMenuItems: a PR row offers its tabs, a bare branch offers New PR', () => {
  const withPr = data.openBranches[0], noPr = data.openBranches[1];
  data.menuBranch = withPr;
  let keys = plain_(data.branchMenuItems.map(i => i.key));
  assert.deepEqual(keys, ['tree', 'compare', 'commits', 'dropFile', 'prFiles', 'prChecks', 'copyName']);
  assert.equal(data.branchMenuItems.find(i => i.key === 'prFiles').label, 'Files changed (#12)');
  assert.equal(data.branchMenuItems.find(i => i.key === 'compare').label, 'Compare to main');

  data.menuBranch = noPr;
  keys = plain_(data.branchMenuItems.map(i => i.key));
  assert.deepEqual(keys, ['tree', 'compare', 'commits', 'dropFile', 'newPr', 'copyName']);
  assert.ok(!keys.includes('prFiles'));
});

// The menu is GitHub DESTINATIONS. Staging sends files to this app's own Stage,
// so it left on 2026-08-18 for a control on the row's action line; `copyName` is
// the one row that stays without opening github.com, because a branch name is
// the ADDRESS of what every other row opens and there is no address bar here to
// lift it from. A new row that is neither belongs somewhere else.
// Three cache generations answer "what did this branch do to its files", and the
// row reads whichever is newest: the per-status breakdown, the bare count that
// preceded it, and the scan's touched-path set. Nothing at all when none does,
// since 0 would be a claim and the glyph alone is an honest route.
test('fileStats reads the newest answer a cache carries', () => {
  const full = { n: 9, added: 2, changed: 6, removed: 1, renamed: 1, additions: 431, deletions: 88 };
  assert.deepEqual(data.fileStats({ stats: full, nFiles: 99, nUnique: 99 }), full, 'the breakdown wins');
  assert.equal(data.fileStats({ nFiles: 9, nUnique: 80 }).n, 9, 'then the bare count');
  assert.equal(data.fileStats({ nUnique: 80 }).n, 80, 'then the scan');
  assert.equal(data.fileStats({ nFiles: null, nUnique: 0 }), null, 'not measured is not zero');
  assert.equal(data.fileStats(null), null);
  assert.equal(data.fileCount({ stats: full }), 9);
});

// A row whose cache knows only a total shows it as ONE number rather than
// splitting a number it does not have.
test('fileParts splits where the breakdown exists and leads with the total where it does not', () => {
  // plain_: a value built inside the component comes back as Alpine's reactive
  // proxy, which deepEqual reports as same-structure-but-not-reference-equal.
  assert.deepEqual(plain_(data.fileParts({ stats: { n: 9, added: 2, changed: 6, removed: 1 } })),
    { lead: 6, added: 2 });
  assert.deepEqual(plain_(data.fileParts({ nFiles: 9 })), { lead: 9, added: 0 },
    'an older cache leads with its total and claims no split');
  assert.equal(data.fileParts({ nUnique: 0 }), null);
});

// A no-merge-base row keeps its numbers. They span more than the branch, which
// is what the row's asterisk says; blanking them left the row that most needs a
// route into its files as the one row whose glyph stood bare.
test('fileCount keeps a no-merge-base count, which the asterisk qualifies', () => {
  assert.equal(data.fileCount({ nFiles: null, nUnique: 80, noBase: true }), 80);
});

// The hover is where everything the row has no room for goes, so it is checked
// for the things that are ONLY there: renames, removals and the line totals.
test('filesTitle states the split, the removals, the renames and the lines', () => {
  const t = data.filesTitle({ def: 'main',
    stats: { n: 9, added: 2, changed: 6, removed: 1, renamed: 1, additions: 431, deletions: 88 } });
  const lines = t.split('\n');
  assert.equal(lines[0], '9 files changed against main');
  assert.equal(lines[1], '  6 changed (1 renamed), 2 new, 1 removed');
  assert.equal(lines[2], '  +431 -88 lines');
  assert.equal(lines[3], 'Open the files on this branch.');
});

test('filesTitle appends the scan verdict where there is one, and claims no split otherwise', () => {
  const scanned = data.filesTitle({ def: 'main', nUnique: 80, nLanded: 28, nMissing: 11, nDiffers: 41,
    stats: { n: 80, added: 14, changed: 62, removed: 4, renamed: 2, additions: 5310, deletions: 2044 } });
  assert.match(scanned, /28 landed on main, 41 differ, 11 missing/);
  // An older cache knows a total and nothing else, so the hover says the total
  // and stops rather than printing a split of zeroes.
  const bare = data.filesTitle({ def: 'main', nFiles: 9 });
  assert.equal(bare, '9 files changed against main\nOpen the files on this branch.');
});

test('the GitHub menu holds GitHub destinations, and one documented exception', () => {
  for (const row of [data.openBranches[0], data.openBranches[1]]) {
    data.menuBranch = row;
    for (const item of plain_(data.branchMenuItems)) {
      if (item.key === 'copyName') continue;
      assert.equal(item.external, true,
        item.key + ' is in the GitHub menu but does not leave for github.com');
    }
  }
});

test('staging is a row control, not a menu row', () => {
  data.menuBranch = data.openBranches[0];
  assert.ok(!plain_(data.branchMenuItems.map(i => i.key)).includes('stageDiff'));
  // And the key is gone from the RUNNER too, rather than left as a branch that
  // nothing dispatches: the row's button calls stageBranchDiff directly.
  const calls = [];
  const real = data.stageBranchDiff;
  data.stageBranchDiff = (...a) => { calls.push(a); };
  try {
    data.runBranchMenu('stageDiff');
    assert.deepEqual(calls, [], 'a retired key must not still stage');
  } finally { data.stageBranchDiff = real; }
});

// ── the file card ───────────────────────────────────────────────────────────
//
// A panel over one of the row's two file pairs. It opens on the crawl's digest
// with no call, then fills in file names from the compare, so the tests below
// cover both halves of that and the seam between them: a read belongs to a card
// only when it is about the same branch.

const CARD_ROW = () => ({
  repo: 'me/tools', name: 'feat/a', def: 'main',
  stats: { n: 5, added: 2, changed: 2, removed: 1, renamed: 0, additions: 60, deletions: 30,
           shape: { added: { exts: [['.md', 2]], dirs: [['docs', 2]] },
                    changed: { exts: [['.js', 2]], dirs: [['lib', 2]] },
                    removed: { exts: [], dirs: [] } } },
});
const CARD_FILES = [
  { path: 'docs/a.md', prev: '', cls: 'added', additions: 40, deletions: 0 },
  { path: 'docs/b.md', prev: '', cls: 'added', additions: 12, deletions: 0 },
  { path: 'lib/x.js', prev: '', cls: 'changed', additions: 5, deletions: 3 },
  { path: 'lib/y.js', prev: '', cls: 'changed', additions: 3, deletions: 7 },
  { path: 'lib/z.js', prev: '', cls: 'removed', additions: 0, deletions: 20 },
];
const openCard = (cls) => {
  const row = CARD_ROW();
  data.rowCard = { repo: row.repo, name: row.name, base: row.def, cls,
                    count: cls === 'added' ? 2 : 2, shape: row.stats.shape[cls], split: true };
  return row;
};

test('the card opens on the crawl digest before any file name is read', () => {
  openCard('added');
  data.rowCardRead = null;
  assert.deepEqual(plain_(data.rowCard.shape.exts), [['.md', 2]]);
  assert.deepEqual(plain_(data.rowCardSummary), { count: 2, lines: '' },
    'the count is the crawl-s, and no line total is claimed before the diff lands');
  assert.deepEqual(plain_(data.rowCardList), [], 'no names yet, and none invented');
});

test('the card lists only its own class, and then counts and lines come off that list', () => {
  openCard('changed');
  data.rowCardRead = { key: data.rowCardKey('me/tools', 'feat/a', 'main'),
                        loading: false, error: '', noBase: false, files: CARD_FILES };
  assert.deepEqual(plain_(data.rowCardList.map(f => f.path)), ['lib/x.js', 'lib/y.js']);
  assert.deepEqual(plain_(data.rowCardSummary), { count: 2, lines: '+8 -10' },
    'the head describes these files, never the whole branch');

  openCard('added');
  assert.deepEqual(plain_(data.rowCardList.map(f => f.path)), ['docs/a.md', 'docs/b.md']);
  // Only the half that happened: a card of new files does not report -0.
  assert.deepEqual(plain_(data.rowCardSummary), { count: 2, lines: '+52' });
});

test('a read for another branch is not this card-s', () => {
  openCard('added');
  data.rowCardRead = { key: data.rowCardKey('me/tools', 'feat/b', 'main'),
                        loading: false, error: '', noBase: false, files: CARD_FILES };
  assert.equal(data.rowCardMine, null, 'the wrong branch-s diff must not show under this head');
  assert.deepEqual(plain_(data.rowCardList), []);
  data.rowCard = null; data.rowCardRead = null;
});

// `missing` is the scan's class, not a status in a diff, so it arrives from
// the crawl's own path list and needs no read to be complete. The diff, when it
// lands, only adds line counts and a patch to the rows it recognises.
test('the missing card lists the scan-s own paths before any diff is read', () => {
  data.rowCard = { repo: 'me/tools', name: 'feat/a', base: 'main', cls: 'missing',
                    paths: ['docs/gone.md', 'lib/only-here.js'], count: 2,
                    shape: { exts: [], dirs: [] }, split: true };
  data.rowCardRead = null;
  assert.deepEqual(plain_(data.rowCardList.map(f => f.path)), ['docs/gone.md', 'lib/only-here.js']);
  assert.deepEqual(plain_(data.rowCardSummary), { count: 2, lines: '' });

  // The diff knows one of the two. The other keeps its row and claims no lines.
  data.rowCardRead = { key: data.rowCardKey('me/tools', 'feat/a', 'main'),
                        loading: false, error: '', noBase: false,
                        files: [{ path: 'lib/only-here.js', prev: '', cls: 'added',
                                  additions: 30, deletions: 0, patch: '@@ -0,0 +1 @@\n+x' }] };
  const list = plain_(data.rowCardList);
  assert.deepEqual(list.map(f => f.path), ['docs/gone.md', 'lib/only-here.js']);
  assert.equal(list[0].additions, 0, 'a path the diff does not name claims nothing');
  assert.equal(list[0].patch, '');
  assert.equal(list[1].additions, 30, 'and one it does gets its lines and its patch');
  assert.ok(list[1].patch);
  data.rowCard = null; data.rowCardRead = null;
});

test('shapeOfPaths digests a path list the same way the crawl digests a compare', () => {
  const sh = plain_(data.shapeOfPaths([
    'docs/a.md', 'docs/b.md', 'docs/c.md', 'lib/x.js', 'README',
  ]));
  assert.deepEqual(sh.exts, [['.md', 3], ['(none)', 1], ['.js', 1]]);
  assert.deepEqual(sh.dirs, [['docs', 3], ['(root)', 1], ['lib', 1]]);
  assert.deepEqual(plain_(data.shapeOfPaths([])), { exts: [], dirs: [] });
});

// A row opens its own diff, from the patch the compare already embedded. Capped,
// because one file in this estate carries a quarter-megabyte hunk.
test('patchLines tints the diff and stops at the cap, which patchOverflow reports', () => {
  const lines = data.patchLines('@@ -1 +1 @@\n-old\n+new\n unchanged');
  assert.deepEqual(plain_(lines.map(l => l.t)), ['@@ -1 +1 @@', '-old', '+new', ' unchanged']);
  assert.match(lines[0].cls, /bg-info/);
  assert.match(lines[1].cls, /bg-error/);
  assert.match(lines[2].cls, /bg-success/);
  assert.equal(lines[3].cls, '');
  assert.equal(data.patchOverflow('a\nb'), 0);

  const big = Array.from({ length: data.PATCH_CAP + 25 }, (_, i) => '+line ' + i).join('\n');
  assert.equal(data.patchLines(big).length, data.PATCH_CAP);
  assert.equal(data.patchOverflow(big), 25, 'the card says how much it is not showing');
  assert.equal(data.patchLines('').length, 1);
});

// A card's read is seconds old against a crawl that may be hours old, so its
// numbers are better and the list should take them. The reader saw the gap
// first: a card opening over a row that said 62 and reporting 71 itself.
test('a card-s live read is written back into the row it was opened from', () => {
  const before = data.openBranches.find(r => r.name === 'feat/a');
  assert.equal(before.ahead, 4);
  assert.equal(data.fileCount(before), null, 'the fixture crawl measured no files');

  data.absorbCompare({ repo: 'me/tools', name: 'feat/a' }, {
    ahead_by: 9, behind_by: 3,
    files: [{ filename: 'a.js', status: 'modified', additions: 5, deletions: 2 },
            { filename: 'b.md', status: 'added', additions: 40, deletions: 0 }],
  });

  const after = data.openBranches.find(r => r.name === 'feat/a');
  assert.equal(after.ahead, 9, 'the arrows take the live count');
  assert.equal(after.behind, 3);
  assert.equal(data.fileCount(after), 2);
  assert.deepEqual(plain_(data.fileParts(after)), { lead: 1, added: 1 });
  assert.equal(data.freshCount, 1, 'and the list-s age stamp knows a row outran it');

  // Both carriers, since which one a row reads from turns on whether it has an
  // open PR and this must land either way.
  assert.equal(plain_(data.activity['me/tools'].openPRs[0]).aheadBy, 9);
  assert.equal(plain_(data.activity['me/tools'].scan.branches[0]).aheadBy, 9);
  seed(); data.freshRows = {};
});

// The verdict needs two trees, which a compare cannot supply. Refreshing the
// counts around it and leaving it alone is the honest half-update.
test('absorbCompare leaves the scan verdict alone, and ignores a branch it cannot find', () => {
  data.activity['me/tools'].scan.branches[0].nUnique = 80;
  data.activity['me/tools'].scan.branches[0].nMissing = 11;
  data.absorbCompare({ repo: 'me/tools', name: 'feat/a' },
    { ahead_by: 1, behind_by: 0, files: [{ filename: 'x', status: 'modified' }] });
  const row = data.openBranches.find(r => r.name === 'feat/a');
  assert.equal(row.nUnique, 80, 'the verdict is not restamped as fresh');
  assert.equal(row.nMissing, 11);

  const n = data.freshCount;
  data.absorbCompare({ repo: 'me/tools', name: 'no/such' }, { ahead_by: 1, files: [] });
  data.absorbCompare({ repo: 'me/nope', name: 'feat/a' }, { ahead_by: 1, files: [] });
  data.absorbCompare({ repo: 'me/tools', name: 'feat/a' }, null);
  assert.equal(data.freshCount, n, 'nothing found, nothing claimed');
  seed(); data.freshRows = {};
});

// ── the commits card ────────────────────────────────────────────────────────
//
// The arrows are COMMITS, and both sides turned out to be free. The branch's own
// are the compare's, which a file card already fetches; the default branch's are
// the newest the crawl stores per repo, fetched since forever for its own
// moved-or-not gate and never read for anything else.

const MAIN_LOG = [
  { sha: 'aaa1', msg: 'newest on main', date: '2026-08-19T10:00:00Z', author: 'm' },
  { sha: 'bbb2', msg: 'second', date: '2026-08-19T09:00:00Z', author: 'm' },
  { sha: 'ccc3', msg: 'third', date: '2026-08-19T08:00:00Z', author: 'm' },
  { sha: 'ddd4', msg: 'the fork point', date: '2026-08-18T08:00:00Z', author: 'm' },
  { sha: 'eee5', msg: 'older still', date: '2026-08-17T08:00:00Z', author: 'm' },
];
const commitCard = (cls, count) => {
  data.activity['me/tools'].recentCommits = MAIN_LOG;
  data.rowCard = { kind: 'commits', repo: 'me/tools', name: 'feat/a', base: 'main',
                   cls, count, shape: { exts: [], dirs: [] } };
};
const commitRead = (extra) => ({
  key: data.rowCardKey('me/tools', 'feat/a', 'main'),
  loading: false, error: '', noBase: false, files: [], commits: [], mergeBase: '',
  behindBy: null, ...extra,
});

test('the behind card reads main-s cached log, exactly, once it knows the fork point', () => {
  commitCard('behind', 3);
  data.rowCardRead = null;
  // Before the compare: the newest `behind_by` of main's log, which is exact
  // while main is linear and is the answer with no call at all.
  assert.deepEqual(plain_(data.rowCardCommits.map(c => c.sha)), ['aaa1', 'bbb2', 'ccc3']);

  // After it: everything newer than the merge base, exact regardless.
  data.rowCardRead = commitRead({ mergeBase: 'ddd4', behindBy: 3 });
  assert.deepEqual(plain_(data.rowCardCommits.map(c => c.sha)), ['aaa1', 'bbb2', 'ccc3']);
  assert.equal(data.rowCardSummary.count, 3, 'the live count wins over the crawl-s');
  assert.equal(data.rowCardCommitGap, 0);
});

test('a fork point past the cached window is named, not silently shown as empty', () => {
  commitCard('behind', 60);
  data.rowCardRead = commitRead({ mergeBase: 'not-in-the-window', behindBy: 60 });
  assert.equal(data.rowCardCommits, null, 'null says the list is unreachable, and [] would say there is none');
  assert.equal(data.rowCardCommitGap, 0, 'and no gap is claimed over a list that does not exist');
});

test('the behind gap counts what the cache could not reach', () => {
  commitCard('behind', 9);
  data.rowCardRead = commitRead({ mergeBase: '', behindBy: 9 });
  assert.equal(data.rowCardCommits.length, 5, 'the whole cached log, which is all it has');
  assert.equal(data.rowCardCommitGap, 4);
});

test('the ahead card is the compare-s own commits, newest first, and no gap', () => {
  commitCard('ahead', 2);
  data.rowCardRead = commitRead({ behindBy: 0, commits: [
    { sha: 'old1', msg: 'first on the branch', date: '2026-08-18T00:00:00Z', author: 'm' },
    { sha: 'new2', msg: 'then this', date: '2026-08-19T00:00:00Z', author: 'm' },
    { sha: 'new3', msg: 'and this', date: '2026-08-19T01:00:00Z', author: 'm' },
  ] });
  assert.deepEqual(plain_(data.rowCardCommits.map(c => c.sha)), ['new3', 'new2', 'old1'],
    'the compare lists them oldest first, and a reader wants the newest at the top');
  assert.equal(data.rowCardSummary.count, 3, 'the compare is exact, so it overrides a stale 2');
  assert.equal(data.rowCardCommitGap, 0, 'ahead never has a gap: its list is the whole answer');
  data.rowCard = null; data.rowCardRead = null; seed();
});

test('openRowCard routes by class, so one control opens either kind', () => {
  const row = data.openBranches.find(r => r.name === 'feat/a');
  const at = { currentTarget: { getBoundingClientRect: () => ({ left: 10, right: 60, top: 20, bottom: 40 }) } };
  data.openRowCard(row, 'ahead', at);
  assert.equal(data.rowCard.kind, 'commits');
  assert.equal(data.rowCard.cls, 'ahead');
  data.openRowCard(row, 'changed', at);
  assert.equal(data.rowCard.kind, 'files');
  data.closeRowCard(); data.rowCardRead = null; seed();
});

test('the card splits a path so a truncation cannot eat the filename', () => {
  assert.equal(data.rowCardDir('lib/kits/branch-status.js'), 'lib/kits/');
  assert.equal(data.rowCardName('lib/kits/branch-status.js'), 'branch-status.js');
  assert.equal(data.rowCardDir('README.md'), '');
  assert.equal(data.rowCardName('README.md'), 'README.md');
});

test('fileBlobUrl encodes the branch and each path segment, not the slashes', () => {
  assert.equal(data.fileBlobUrl('me/tools', 'claude/feat a', 'lib/kits/x y.js'),
    'https://github.com/me/tools/blob/claude%2Ffeat%20a/lib/kits/x%20y.js');
});

test('openBranchMenu anchors through the shell and closes on a pick', () => {
  data.menuBranch = null;
  data.openBranchMenu(data.openBranches[0], { currentTarget: {} });
  assert.equal(data.branchMenuAt.width, data.BRANCH_MENU_W);
  assert.equal(data.branchMenuAt.rows, data.branchMenuItems.length);
  // This trigger leads its row rather than closing it, so the panel's LEFT
  // edge is the one aligned with the button.
  assert.equal(data.branchMenuAt.align, 'left');
  assert.equal(data.branchMenuStyle, 'left:10px;top:20px');
  data.runBranchMenu('tree');
  assert.equal(data.branchMenuAt, null);
  assert.equal(data.branchMenuStyle, 'left:-9999px;top:-9999px');
});

test('runBranchMenu builds the GitHub destinations', () => {
  const row = data.openBranches[0], bare = data.openBranches[1];
  const urlFor = (key, r) => { opened.length = 0; data.menuBranch = r; data.runBranchMenu(key); return opened[0]; };
  assert.equal(urlFor('tree', row), 'https://github.com/me/tools/tree/feat%2Fa');
  assert.equal(urlFor('compare', row), 'https://github.com/me/tools/compare/main...feat%2Fa');
  assert.equal(urlFor('commits', row), 'https://github.com/me/tools/commits/feat%2Fa');
  assert.equal(urlFor('prFiles', row), 'https://github.com/me/tools/pull/12/files');
  assert.equal(urlFor('prChecks', row), 'https://github.com/me/tools/pull/12/checks');
  assert.equal(urlFor('newPr', bare), 'https://github.com/me/tools/compare/main...feat%2Fb?expand=1');
});

// ── Drop a file here ─────────────────────────────────────────────────────
// The branch menu's one write-shaped destination: GitHub's new-file form
// opened ON the branch with the filename prefilled, so pasted content commits
// to the branch without riding through chat. The branch keeps its slashes raw
// (the form GitHub's own UI emits); the filename lands in the repo's declared
// inbox, else dump/, date-stamped.

// ── The branch deck ─────────────────────────────────────────────────────
// Tapping a branch name opens the list as a swipe-deck, one slide per row.
// What the shell still owns is the sequence, the position, and the header;
// the gesture is the platform's now, and 540 lines of hand-rolled drag and
// iframe plumbing went with the change.

const deckOf = () => data._deck;

test('tapping a row takes over: the frozen list is the deck, opened at the row', async () => {
  seed();
  const row = data.openBranches[1];
  data.openBranchDetail(row);
  await tick(4);
  assert.equal(data.detail.i, 1);
  assert.equal(data.detail.rows.length, 3, 'the list as tapped is the sequence');
  assert.equal(data.detailRow.name, row.name);
  assert.ok(deckOf(), 'and it is a deck, not markup');
  assert.equal(deckOf().deck.count, 3, 'one slide per row');
  data.closeDetail();
  await tick(4);
});

test('the header names the branch, its repo and an open PR', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);      // feat/a, PR #12 draft
  await tick(4);
  const el = deckOf().el;
  // The last segment, the way the file deck titles a file by its filename: a
  // header at phone width has room for one of the two, and the slug is the
  // half that distinguishes. The full name is on the slide's own line.
  assert.equal(el.querySelector('h1').textContent, 'a', 'the distinguishing segment is the title');
  assert.match(el.querySelector('h1 + p').textContent, /tools/);
  assert.match(el.querySelector('h1 + p').textContent, /#12/);
  const link = el.querySelector('a[href*="/pull/12"]');
  assert.ok(link, 'the PR is the header exit');
  data.closeDetail();
  await tick(4);
});

test('a merged PR reaches the header from the slide, since the cache never saw it', async () => {
  seed();
  const row = data.openBranches.find(r => r.name === 'feat/b');   // no PR in openPRs
  data.openBranchDetail(row);
  await tick(4);
  assert.equal(data.detailPrNumber, 0, 'the crawl asks for open pull requests only');
  assert.ok(!deckOf().el.querySelector('a[href*="/pull/"]'), 'so the header has no exit yet');

  data.onSlideMeta(data.detail.i,
    { repo: row.repo, branch: row.name, pr: 409, prState: 'merged' });
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /#409/);
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /merged/);
  assert.ok(deckOf().el.querySelector('a[href*="/pull/409"]'));
  data.closeDetail();
  await tick(4);
});

test('a slide that settles while the reader is elsewhere is ignored', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  const before = deckOf().el.querySelector('h1 + p').textContent;
  data.onSlideMeta(2, { repo: 'me/tools', branch: 'feat/b', pr: 999, prState: 'merged' });
  assert.equal(deckOf().el.querySelector('h1 + p').textContent, before,
    'a neighbour finishing its read does not rewrite the header of the slide in view');
  data.closeDetail();
  await tick(4);
});

test('the header follows the reader from slide to slide', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  data.onDeckSlide(2);                              // me/home/fresh, PR #7
  assert.equal(deckOf().el.querySelector('h1').textContent, 'fresh',
    'a branch with no slash is its own last segment');
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /home/);
  assert.match(deckOf().el.querySelector('h1 + p').textContent, /#7/);
  data.closeDetail();
  await tick(4);
});

test('the mark lists the whole set, each branch named the way the header names one', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  const mark = deckOf().el.querySelector('.sd-header').children[1];
  assert.equal(mark.tagName, 'BUTTON', 'a list behind the mark makes it a button');
  mark.click();
  await tick(4);
  const listed = [...deckOf().el.querySelector('.sd-index').children];
  assert.equal(listed.length, 3, 'one row per branch in the deck');
  assert.match(listed[2].textContent, /fresh/, 'the slug, as the header shows it');
  assert.match(listed[2].textContent, /home/);
  assert.match(listed[2].textContent, /#7/, 'and the repo and PR its subtitle carries');
  mark.click();
  await tick(4);
  data.closeDetail();
  await tick(6);
});

test('opening while one is open replaces it rather than stacking a second', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  const first = data._deck;
  data.openBranchDetail(data.openBranches[1]);
  await tick(6);
  assert.notEqual(data._deck, first, 'a new deck');
  assert.equal(window.swipeDeck.stack.length, 1,
    'and only one: two branch decks is the same level twice, not a level down');
  assert.equal(data.detailRow.name, 'feat/b');
  data.closeDetail();
  await tick(6);
});

test('closing clears the shell at once, whatever the deck does next', async () => {
  seed();
  data.openBranchDetail(data.openBranches[0]);
  await tick(4);
  data.closeDetail();
  assert.equal(data.detail, null, 'synchronously, so a caller can open something else');
  assert.equal(data._deck, null);
  await tick(6);
});

// ── The SESSION row's cards ──────────────────────────────────────────────
// The same panel as the branch row's, a third kind of body, and no read at
// all: every number the strip shows is already in the session record. What is
// pinned here is that the card says what the title used to and that the count
// over the list agrees with the list under it.

const SESSION_ROW = () => ({
  id: 's1', exchanges: 12, messages: 48, calls: 431, failures: 3,
  filesTotal: 62, tools: [['Bash', 210], ['Edit', 96], ['Read', 71]],
  files: [['lib/alpineComponents/estate.js', 24], ['docs/show-repo.md', 9]],
  tokens: { output: 84200, input: 1900, cache_read: 7400000, cache_write: 120000 },
});

test('the turns card is the transcript, and its head answers the tap', () => {
  // It opened a two-row list once (user turns, assistant messages), which held
  // one fact the row did not: the assistant half. The transcript moved here
  // from the ask line, since what opens is every turn of the conversation and
  // the ask is only the first of them, and the assistant half rides the head.
  //
  // THE HEAD STATES WHAT THE READER TAPPED. A prose card otherwise counts the
  // turns it was handed, which here is both roles and only the last
  // TURNS_KEPT, so deriving would answer a glyph reading 12 with some other
  // number entirely.
  const row = SESSION_ROW();
  data.openSessionCard(row, 'turns', null);
  assert.equal(data.rowCard.kind, 'prose');
  assert.equal(data.rowCardSummary.count, 12, 'the glyph\'s own number');
  assert.deepEqual(plain_(data.rowCard.unit), ['user turn', 'user turns'],
    'and its own unit, so the head does not call them plain turns');
  assert.equal(data.rowCard.aside, '48 assistant',
    'the half the row never showed, which the list card was carrying');
});

// ── Unrecorded: the one scope that is about the OTHER pane ───────────────
// A branch whose commit trailer names a session the recorder's store no longer
// holds is not sessionless. The Sessions pane draws it as a stub, an
// eight-character id with no ask and no reply, so the branch row is the only
// account of what it was. Measured over the committed crawl: 139 of 441
// branches (31%), of which 126 are stubs and 13 reach nothing at all.
//
// Held against sessionTree's own placement rather than re-derived, since the
// two reading the same rows differently is the failure this shape invites.
test('Unrecorded selects the branches no session record stands behind', () => {
  const prev = data.branchScope;
  data.sessionRows_ = [
    { id: 's1', agent: 'https://claude.ai/code/session_aaa', repos: [] },
    { id: 's2', agent: '', repos: [{ name: 'tools', branch: 'feat/b' }] },
  ];
  data.activity['me/tools'].scan.branches[0].sessions = ['https://claude.ai/code/session_aaa'];
  // feat/b reaches a record by NAME; old/landed names a session the store never kept.
  data.activity['me/tools'].scan.branches[2].sessions = ['https://claude.ai/code/session_zzz'];
  // allBranchRows is memoised on the document's identity plus this revision;
  // an in-place edit like the two above says so the way absorbCompare does.
  data._activityRev++;
  data.branchScope = 'unrecorded';
  const got = names(data.openBranches);
  assert.ok(!got.includes('me/tools/feat/a'), 'a branch whose session URL is in the store is recorded');
  assert.ok(!got.includes('me/tools/feat/b'), 'and so is one a record names by branch');
  assert.ok(got.includes('me/tools/old/landed'),
    'a trailer naming a session with no record behind it is UNrecorded, not sessionless');
  assert.ok(got.includes('me/home/fresh'), 'and a branch naming no session at all');

  // The tree is the other reader of the same derivation. Anything it places
  // under a record must be absent here, or the two panes disagree about which
  // branches the archive can speak for.
  const placed = new Set();
  for (const n of data.sessionTree.nodes) {
    if (n.kind !== 'record') continue;
    for (const c of n.children) placed.add(c.repo + '/' + c.name);
  }
  // The cross-check is only a check if it saw something: an empty `placed`
  // would pass the loop below without comparing anything, which is how a
  // vacuous assertion ships.
  assert.ok(placed.size >= 2, 'the tree placed at least the two recorded branches, so there is something to compare');
  for (const k of placed) assert.ok(!got.includes(k), k + ' is placed under a record and must not be Unrecorded');

  data.branchScope = prev;
  data.sessionRows_ = [];
  delete data.activity['me/tools'].scan.branches[0].sessions;
  delete data.activity['me/tools'].scan.branches[2].sessions;
});

test('the tools card lists the per-tool breakdown and owns the failure count', () => {
  const row = SESSION_ROW();
  data.openSessionCard(row, 'tools', null);
  assert.equal(data.rowCardSummary.count, 431);
  assert.deepEqual(plain_(data.rowCard.rows.map(r => r.label)), ['Bash', 'Edit', 'Read']);
  // The failures pair opens THIS card, being a subset of these calls, so the
  // number it stands for has to be stated here or that pair explains nothing.
  assert.match(data.rowCard.note, /3 of these calls failed/);
});

test('a record with no breakdown says so rather than showing an empty card', () => {
  data.openSessionCard({ id: 's2', calls: 7, tools: [] }, 'tools', null);
  assert.deepEqual(plain_(data.rowCard.rows), []);
  assert.match(data.rowCard.note, /kept no per-tool breakdown/);
});

test('the files card carries paths, and marks them as paths', () => {
  const row = SESSION_ROW();
  data.openSessionCard(row, 'files', null);
  assert.equal(data.rowCardSummary.count, 62);
  assert.deepEqual(plain_(data.rowCard.rows.map(r => r.label)),
    ['lib/alpineComponents/estate.js', 'docs/show-repo.md']);
  assert.ok(data.rowCard.rows.every(r => r.mono), 'a path is set in mono, like every other path');
  // 62 opened, 2 listed: the head must not shrink to the list's length, which
  // is what the branch row's cards had to be taught the hard way.
  assert.notEqual(data.rowCardSummary.count, data.rowCard.rows.length);
});

test('the tokens card leads with output, the half that measures the work', () => {
  const row = SESSION_ROW();
  data.openSessionCard(row, 'tokens', null);
  assert.equal(data.rowCardSummary.count, 84200, 'output, not the cache-read total');
  assert.equal(plain_(data.rowCard.rows)[0].label, 'output');
  assert.deepEqual(plain_(data.rowCard.rows.map(r => r.n)), [84200, 1900, 7400000, 120000]);
});

test('a list card is complete on open: no read can sharpen it', () => {
  const row = SESSION_ROW();
  data.openSessionCard(row, 'tools', null);
  const before = plain_(data.rowCardSummary);
  data.rowCardRead = { key: 'anything', loading: true, error: '', files: [] };
  assert.deepEqual(plain_(data.rowCardSummary), before,
    'the branch cards wait on a compare; this one never does');
});

test('an unknown class opens nothing rather than an empty panel', () => {
  data.rowCard = null;
  data.openSessionCard(SESSION_ROW(), 'nonsense', null);
  assert.equal(data.rowCard, null);
});

test('each pair keys its own card, so hovering along the strip re-anchors', () => {
  const row = SESSION_ROW();
  data.openSessionCard(row, 'tools', null);
  const first = data.rowCard.key;
  data.openSessionCard(row, 'files', null);
  assert.notEqual(data.rowCard.key, first);
  assert.match(data.rowCard.key, /^session:s1:/);
});
