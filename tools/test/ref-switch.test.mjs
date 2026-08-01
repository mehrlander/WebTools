// ref-switch.test.mjs — the header ref switch: what it reports, and where it goes.
//
// Two things are worth holding here, and both are the kind that read as
// obviously right and are easy to get wrong.
//
// THE ADDRESS carries the ref TWICE, in the query and in the fragment, because
// they pin different halves: ?use= pins the renderer's own lib chain (its fab,
// its peek) and #gh= addresses the page. A switch that pinned only the fragment
// would render the branch's page inside the deployed shell, which is the exact
// confusion CLAUDE.md records costing two rounds of "I looked and it isn't
// there". So the shape is asserted, not assumed.
//
// THE RIDING READ comes from ?use= rather than window.gh.ref, and it has to work
// identically in a toss, where there is no location.search and the value arrives
// through toss-render's params shim. The shim patches URLSearchParams.prototype,
// so the test patches it the same way and checks the chip still names the ref.
//
// One window, one Alpine, as everywhere else in this suite; the address is moved
// with history.replaceState rather than by minting a second realm.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const PATH = 'pages/show-repo/show-repo.html';
const REPO = 'mehrlander/web-tools';
const LIVE = 'https://mehrlander.github.io/web-tools/' + PATH;

// A branch list in the shape branchesForPath returns, newest first.
const BRANCHES = [
  { name: 'claude/newest-thing', date: '2026-07-31T10:00:00Z', ago: '2h', sha: 'aaa', subject: 'newest', fileOid: 'x1' },
  { name: 'main', date: '2026-07-30T10:00:00Z', ago: '1d', sha: 'bbb', subject: 'merge', fileOid: 'd0' },
  { name: 'claude/older-thing', date: '2026-07-20T10:00:00Z', ago: '11d', sha: 'ccc', subject: 'older', fileOid: 'd0' },
];

const { window } = makeWindow({ url: LIVE });
const Alpine = await startAlpine(window, ['lib/alpineComponents/ref-switch.js']);
const { rideUrl, liveUrl, newestBranch, RENDERER } = window.RefSwitch;

// The address bar, moved the way a real navigation would leave it.
const setSearch = (qs) => window.history.replaceState(null, '', LIVE + qs);

function stubGH(branches = BRANCHES, defaultBranch = 'main') {
  window.GH = class {
    constructor(opts) { this.repo = opts.repo; }
    async branchesForPath() { return { defaultBranch, defaultOid: 'd0', branches }; }
  };
}

async function mount(extra = '') {
  const el = window.document.createElement('div');
  el.setAttribute('x-data', `refSwitch({ repo: '${REPO}', path: '${PATH}'${extra} })`);
  window.document.body.appendChild(el);
  Alpine.initTree(el);
  await tick(3);
  return { data: Alpine.$data(el), el };
}

test('the switch address pins the ref on both halves and carries the page query', () => {
  const url = rideUrl({ repo: REPO, path: PATH, ref: 'claude/thing', query: 'repo=mehrlander/home&view=files' });
  assert.equal(url,
    RENDERER + '?use=claude%2Fthing#gh=' + REPO + '@claude/thing:' + PATH +
    '?repo=mehrlander/home&view=files');

  // Fragment-only would render the branch's page inside the deployed shell.
  assert.ok(url.indexOf('?use=') < url.indexOf('#gh='), 'the pin is a real query, not part of the fragment');

  // No query, no trailing '?': a bare address must stay bare.
  assert.equal(rideUrl({ repo: REPO, path: PATH, ref: 'x' }),
    RENDERER + '?use=x#gh=' + REPO + '@x:' + PATH);
  // A leading '?' from a caller that kept it is absorbed, not doubled.
  assert.ok(rideUrl({ repo: REPO, path: PATH, ref: 'x', query: '?a=1' }).endsWith(PATH + '?a=1'));
  // Nothing to address without a ref.
  assert.equal(rideUrl({ repo: REPO, path: PATH, ref: '' }), '');

  assert.equal(liveUrl({ repo: REPO, path: PATH, query: 'view=stage' }), LIVE + '?view=stage');
  assert.equal(liveUrl({ repo: 'nope', path: PATH }), '');
});

test('newest picks the most recent non-default branch, and declines when there is none', () => {
  assert.equal(newestBranch(BRANCHES, 'main').name, 'claude/newest-thing');
  // Order in the array is not trusted: the pick is by date.
  assert.equal(newestBranch([...BRANCHES].reverse(), 'main').name, 'claude/newest-thing');
  // The default branch IS the newest: nothing to jump to.
  assert.equal(newestBranch([{ name: 'main', date: '2026-08-01T00:00:00Z' }], 'main'), null);
  assert.equal(newestBranch([], 'main'), null);
  // Undated rows (the token-free REST list) are not evidence about newest.
  assert.equal(newestBranch([{ name: 'a', date: '' }, { name: 'b' }], 'main'), null);
});

test('with no token it degrades to the undated REST list and retires the newest button', async () => {
  setSearch('');
  window.GH = class {
    constructor(opts) { this.repo = opts.repo; }
    async branchesForPath() { throw new Error('GitHub GraphQL Error 401'); }
    async branchesDated() { throw new Error('GitHub GraphQL Error 401'); }
    async branches() { return [{ name: 'main' }, { name: 'claude/thing' }]; }
  };
  const { data } = await mount();
  await data.load();

  assert.equal(data.error, '', 'a token-free viewer gets a list, not an error');
  assert.deepEqual(data.rows.map(b => b.name), ['main', 'claude/thing']);
  assert.match(data.note, /need a token/);
  assert.equal(data.newest, null);
  assert.equal(data.showNewest, false);

  // The pasted-ref path is untouched by any of that.
  const went = [];
  data._go = (u) => went.push(u);
  data.typed = 'claude/thing';
  data.goTyped();
  assert.match(went.pop(), /#gh=mehrlander\/web-tools@claude\/thing:/);
});

test('at the default branch it says nothing; off it, the chip names the ref', async () => {
  setSearch('');
  const { data: plain } = await mount();
  assert.equal(plain.riding, false);
  assert.equal(plain.ref, 'main');
  assert.equal(plain.openerTitle, 'Run this page from a branch');

  setSearch('?use=claude/thing');
  try {
    const { data: riding, el } = await mount();
    assert.equal(riding.riding, true);
    assert.equal(riding.ref, 'claude/thing');
    // The tooltip carries the whole ref; the chip carries the part that
    // distinguishes it, since the prefix is the same on every session branch.
    assert.match(riding.openerTitle, /Running from claude\/thing/);
    assert.match(el.textContent, /(^|\W)thing(\W|$)/, 'the chip renders the ref, not just the state');
    assert.doesNotMatch(el.textContent, /claude\/thing/, 'and renders its tail, not the prefix');
  } finally { setSearch(''); }
});

test('inside a toss the ref arrives through the params shim, and the chip reads it', async () => {
  setSearch('');
  // toss-render has no location.search to offer, so it patches URLSearchParams
  // to answer absent keys. Same patch here, same expectation.
  const real = window.URLSearchParams.prototype.get;
  window.URLSearchParams.prototype.get = function (k) {
    const v = real.call(this, k);
    return (v == null || v === '') && k === 'use' ? 'claude/tossed' : v;
  };
  try {
    const { data } = await mount();
    assert.equal(data.ref, 'claude/tossed');
    assert.equal(data.riding, true);
  } finally { window.URLSearchParams.prototype.get = real; }
});

test('loading classifies rows against the default branch and filters by substring', async () => {
  stubGH();
  const { data } = await mount();

  await data.load();
  assert.equal(data.loaded, true);
  assert.equal(data.error, '');
  const byName = Object.fromEntries(data.rows.map(r => [r.name, r.status]));
  assert.equal(byName['claude/newest-thing'], 'differs');   // its blob differs from main's
  assert.equal(byName['claude/older-thing'], 'same');       // same blob: no copy of its own
  assert.equal(byName['main'], 'baseline');
  assert.equal(data.newest.name, 'claude/newest-thing');
  assert.equal(data.showNewest, true);

  // The memorable part of `claude/<slug>-<suffix>` is in the middle.
  data.typed = 'older';
  assert.deepEqual(data.matches.map(b => b.name), ['claude/older-thing']);

  // A second load is not a second three-page crawl.
  const before = data.rows;
  await data.load();
  assert.equal(data.rows, before);
});

test('going somewhere leaves the top document, and the default branch means going home', async () => {
  stubGH();
  const { data } = await mount(`, query: () => 'view=stage'`);

  const went = [];
  data._go = (u) => went.push(u);

  data.go('claude/other');
  assert.equal(went.pop(), RENDERER +
    '?use=claude%2Fother#gh=' + REPO + '@claude/other:' + PATH + '?view=stage');

  // Picking the default branch is not a toss at main; it is the way out.
  data.go('main');
  assert.equal(went.pop(), LIVE + '?view=stage');

  data.returnToLive();
  assert.equal(went.pop(), LIVE + '?view=stage');

  // One tap from cold: load, then go.
  await data.goNewest();
  assert.equal(went.pop(), RENDERER +
    '?use=claude%2Fnewest-thing#gh=' + REPO + '@claude/newest-thing:' + PATH + '?view=stage');
});

test('when the newest branch is the default one, the button retires itself', async () => {
  stubGH([{ name: 'main', date: '2026-08-01T00:00:00Z', ago: '1h', fileOid: 'd0' }]);
  const { data } = await mount();

  assert.equal(data.showNewest, true, 'before the survey there is no way to know');
  await data.load();
  assert.equal(data.newest, null);
  assert.equal(data.showNewest, false);

  const went = [];
  data._go = (u) => went.push(u);
  await data.goNewest();
  assert.equal(went.length, 0);
  assert.match(data.error, /No branch newer than main/);
  assert.equal(data.open, true, 'the panel says why rather than the button doing nothing');
});
