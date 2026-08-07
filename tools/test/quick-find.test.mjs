// alpineComponents/quick-find.js — logic tests for the sidebar finder's lane
// dispatcher: the #digits PR lane (open-repo hits first), the address lanes
// (full owner/repo[@ref]:path via RepoAddress, short-repo expansion, repo@frag
// branch matching with the open-anyway floor, estate-wide @frag), the plain
// lane (repos, views, branches, PR titles), the token-gated Jot floor, the
// branch hit's open-branch-detail event, and the jot write's fresh-read
// append. Driven over a fake GH and a stubbed shell; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

let FILES = {};    // "<path>" -> parsed JSON served from the registry
let SAVES = [];    // every save call: { repo, path, value, message }

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  async get(name) {
    if (this.repo === REGISTRY && FILES[name]) return { text: JSON.stringify(FILES[name]) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async save(path, value, message) { SAVES.push({ repo: this.repo, path, value, message }); return {}; }
}

const ACTIVITY = {
  repos: {
    'me/tools': {
      defaultBranch: 'main',
      openPRs: [{ number: 12, title: 'Fix the header', draft: true, head: 'claude/header-fix' }],
      survey: { branches: [{ name: 'claude/header-fix' }, { name: 'main' }] },
    },
    'me/home': {
      defaultBranch: 'main',
      openPRs: [{ number: 120, title: 'Drain the pile', draft: false, head: 'claude/drain' }],
      // A PR head absent from the survey (a fresh push) still becomes a row.
      survey: { branches: [{ name: 'spike/idea' }] },
    },
  },
};

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="qf" x-data="quickFind()"></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
const shell = {
  REGISTRY_REPO: REGISTRY,
  hasToken: () => true,
  estateRepos: [{ repo: 'me/tools', icon: 'ph-wrench' }, { repo: 'me/home', icon: 'ph-house' }],
  estateNav: [{ view: 'map', label: 'Map', icon: 'ph-compass', go: () => shell._went.push('map') }],
  appNav: [],
  _went: [],
};
window.__shell = shell;

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/repo-address.js',
  'lib/alpineComponents/quick-find.js',
]);

const data = Alpine.$data(window.document.getElementById('qf'));

// Alpine data lives in the jsdom realm, so its arrays fail deepEqual's
// prototype check against node-realm literals; round-trip before comparing.
const j = (x) => JSON.parse(JSON.stringify(x));

// Every lane below reads the activity projections, so seed the cache once the
// way ensureActivity would.
FILES = { 'state/activity.json': ACTIVITY };
await data.ensureActivity();

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('activity projections: PR rows carry their head; a survey-less PR head still rows', () => {
  assert.deepEqual(j(data.prRows.map(p => p.number).sort((a, b) => a - b)), [12, 120]);
  const names = data.branchRows.map(b => b.repo + '@' + b.name).sort();
  assert.deepEqual(j(names), ['me/home@claude/drain', 'me/home@spike/idea', 'me/tools@claude/header-fix']);
  // The default branch never rows.
  assert.ok(!names.some(n => n.endsWith('@main')));
});

test('#digits finds PRs by number prefix; bare digits work; # alone lists all', () => {
  data.q = '#12';
  let hits = data.rows.filter(r => r.kind === 'branch');
  assert.deepEqual(j(hits.map(h => h.label.split(' ')[0])), ['#12', '#120']);
  // A PR hit opens as its head branch.
  assert.equal(hits[0].name, 'claude/header-fix');
  data.q = '120';
  hits = data.rows.filter(r => r.kind === 'branch');
  assert.deepEqual(j(hits.map(h => h.repo)), ['me/home']);
  data.q = '#';
  assert.equal(data.rows.filter(r => r.kind === 'branch').length, 2);
});

test('a full address parses to an open-file row; a short repo head expands', () => {
  data.q = 'me/tools@dev:lib/gh-api.js';
  let addr = data.rows.find(r => r.kind === 'addr');
  assert.equal(addr.label, 'me/tools@dev:lib/gh-api.js');
  assert.deepEqual(j(addr.addr), { repo: 'me/tools', ref: 'dev', path: 'lib/gh-api.js' });
  // "tools:…" names exactly one estate repo, so it expands; the missing ref
  // stays unspecified (RepoAddress's rule: parse honestly, resolve late).
  data.q = 'tools:lib/gh-api.js';
  addr = data.rows.find(r => r.kind === 'addr');
  assert.deepEqual(j(addr.addr), { repo: 'me/tools', ref: '', path: 'lib/gh-api.js' });
});

test('repo@frag matches that repo\'s branches; an unmatched name still opens', () => {
  data.q = 'home@drain';
  let hits = data.rows.filter(r => r.kind === 'branch');
  assert.deepEqual(j(hits.map(h => h.name)), ['claude/drain']);
  data.q = 'home@not-crawled-yet';
  hits = data.rows.filter(r => r.kind === 'branch');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sub, 'open anyway');
  assert.equal(hits[0].name, 'not-crawled-yet');
});

test('@frag searches branch names estate-wide', () => {
  data.q = '@claude';
  const hits = data.rows.filter(r => r.kind === 'branch');
  assert.deepEqual(j(hits.map(h => h.name).sort()), ['claude/drain', 'claude/header-fix']);
});

test('plain text matches repos, views, branches, and PR titles; the Jot floor rides every query', () => {
  data.q = 'home';
  const kinds = data.rows.map(r => r.kind);
  assert.ok(kinds.includes('repo'));
  assert.ok(kinds.includes('jot'));
  data.q = 'map';
  assert.equal(data.rows.find(r => r.kind === 'view').label, 'Map');
  data.q = 'drain the';
  assert.equal(data.rows.find(r => r.kind === 'branch').repo, 'me/home');
  // The floor is token-gated: signed out, nothing offers to write.
  shell.hasToken = () => false;
  data.q = 'anything';
  assert.ok(!data.rows.some(r => r.kind === 'jot'));
  shell.hasToken = () => true;
});

test('acting on a branch hit dispatches web-tools:open-branch-detail and clears the box', () => {
  const seen = [];
  window.document.addEventListener('web-tools:open-branch-detail', e => seen.push(e.detail));
  data.q = '#12';
  data.act(data.rows[0]);
  assert.deepEqual(j(seen), [{ repo: 'me/tools', name: 'claude/header-fix' }]);
  assert.equal(data.q, '');
  assert.equal(data.open, false);
});

test('acting on a view hit runs its go()', () => {
  data.q = 'map';
  data.act(data.rows.find(r => r.kind === 'view'));
  assert.deepEqual(j(shell._went), ['map']);
});

test('jotThis appends to a fresh read of lists/jots.json with the estate\'s commit-message shape', async () => {
  SAVES = [];
  FILES['lists/jots.json'] = { items: [{ id: 'j1', text: 'earlier', created_at: '2026-01-01T00:00:00Z' }] };
  await data.jotThis('quick idea');
  assert.equal(SAVES.length, 1);
  assert.equal(SAVES[0].path, 'lists/jots.json');
  assert.equal(SAVES[0].value.items.length, 2);
  assert.equal(SAVES[0].value.items[0].text, 'earlier');
  assert.equal(SAVES[0].value.items[1].text, 'quick idea');
  assert.match(SAVES[0].message, /^Jot "quick idea" via show-repo$/);
});
