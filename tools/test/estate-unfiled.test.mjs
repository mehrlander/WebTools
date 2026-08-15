// alpineComponents/estate.js — logic-level tests for the Repos view's Unfiled
// section: the account repos that are NOT on the estate.
//
// The estate already fetches the whole account list (one /user/repos call) to
// fill card metadata and then discards every repo that did not opt in. These
// rows show the remainder, split three ways so the decision has somewhere to
// land: undecided (Unfiled), `conventions: 'optout'` in the repo's own config
// (Set aside), and `archived` on GitHub (Retired). The two settled groups fold.
//
// What this suite holds:
//   • membership subtraction (a card is never also a row)
//   • the three-state split, and that archived outranks a config read
//   • the optimistic move after a write, and that it retires itself once the
//     config cache agrees — the bug it prevents is a just-filed row bouncing
//     back to Unfiled for one pass, which reads as a failed write
//   • that both writes go to the REPO's own .web-tools.json, never a registry
//     list, since that is the invariant the whole membership model rests on
//   • that the GitHub route is a link out, never a call
//
// Driven over a fake GH; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

let CONFIGS = { repos: {} };
const asCache = (map) => ({
  repos: Object.fromEntries(Object.entries(map).map(([name, config]) => [name, { config }])),
});

// The account as /user/repos answers it: every repo, member or not, with the
// `archived` flag that arrives free in the same payload.
let ACCOUNT = [];
// Every .web-tools.json write this suite provokes: [repo, config, message].
let WRITES = [];

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago(iso) { return String(iso).slice(0, 10); }        // stable, order-preserving
  async repos() { return ACCOUNT; }
  async get(name) {
    if (name === 'state/configs.json') return { text: JSON.stringify(CONFIGS) };
    if (name === '.web-tools.json') {
      const cfg = CONFIGS.repos[this.repo]?.config;
      if (cfg) return { text: JSON.stringify(cfg) };
    }
    throw new Error('404');
  }
  async save(name, obj, message) { WRITES.push([this.repo, obj, message]); }
  async ls() { throw new Error('404'); }
  async req(path) {
    if (path.startsWith('/repos/')) return { default_branch: 'main', description: '', private: true, pushed_at: '' };
    throw new Error('unexpected ' + path);
  }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="es" x-data="estate()"></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.scrollTo = () => {};        // jsdom has none; adoptUnfiled guards, this keeps the log clean
window.__shell = {
  REGISTRY_REPO: 'me/registry',
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));
const plain_ = (v) => JSON.parse(JSON.stringify(v));

// One member, and five that are not. Push dates descend in file order so the
// newest-first sort is visible rather than incidental.
const acctRow = (full_name, extra = {}) => ({
  full_name, description: '', private: false, language: '', default_branch: 'main',
  pushed_at: '2026-01-01T00:00:00Z', ...extra,
});
const ACCOUNT_FIXTURE = [
  acctRow('me/tools',   { pushed_at: '2026-08-01T00:00:00Z', description: 'the hub' }),
  acctRow('me/recent',  { pushed_at: '2026-07-01T00:00:00Z', language: 'JavaScript' }),
  acctRow('me/older',   { pushed_at: '2026-03-01T00:00:00Z', private: true }),
  acctRow('me/oldest',  { pushed_at: '2020-01-01T00:00:00Z' }),
  acctRow('me/retired', { pushed_at: '2026-05-01T00:00:00Z', archived: true }),
  acctRow('me/aside',   { pushed_at: '2026-06-01T00:00:00Z' }),
];
const CONFIG_MAP = {
  'me/tools': { estate: true, group: 'core', order: 0 },
  'me/aside': { conventions: 'optout' },
  'me/retired': null,
};

const loadWith = async (map = CONFIG_MAP, account = ACCOUNT_FIXTURE) => {
  CONFIGS = asCache(map);
  ACCOUNT = account;
  await data.load();
  await data.loadUnfiled(Object.fromEntries(Object.entries(map).map(([n, c]) => [n, c])));
};
// [ [key, [repo, …]], … ] over the rendered groups.
const groups = () => plain_(data.unfiledSections.map(s => [s.key, s.items.map(r => r.repo)]));

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('the three groups: undecided first, both settled groups after, empty ones dropped', async () => {
  await loadWith();
  assert.deepEqual(groups(), [
    ['open',    ['me/recent', 'me/older', 'me/oldest']],   // newest push first
    ['aside',   ['me/aside']],
    ['retired', ['me/retired']],
  ]);
});

test('a member holds a card, never also a row', async () => {
  await loadWith();
  assert.ok(data.entries.some(e => e.repo === 'me/tools'), 'the member has a card');
  assert.ok(!data.unfiledRepos.some(r => r.repo === 'me/tools'), 'and is not in the rows');
});

test('only the undecided group is open; the settled two fold away', async () => {
  await loadWith();
  const [open, aside, retired] = data.unfiledSections;
  assert.equal(data.unfiledShown(open), true);
  assert.equal(data.unfiledShown(aside), false);
  assert.equal(data.unfiledShown(retired), false);
  data.toggleUnfiled(retired);
  assert.equal(data.unfiledShown(retired), true);
  // The always-open group has no toggle to press.
  data.toggleUnfiled(open);
  assert.equal(data.unfiledShown(open), true);
});

test('archived outranks the config read: a repo can be both, and reads as Retired', async () => {
  await loadWith({ ...CONFIG_MAP, 'me/retired': { conventions: 'optout' } });
  const row = data.unfiledRepos.find(r => r.repo === 'me/retired');
  assert.equal(data.unfiledState(row), 'retired');
});

test('set aside writes conventions:optout to the REPO, and moves the row at once', async () => {
  await loadWith();
  WRITES = [];
  const row = data.unfiledRepos.find(r => r.repo === 'me/older');
  await data.setAside(row);

  assert.equal(WRITES.length, 1, 'one write');
  const [repo, cfg, message] = WRITES[0];
  assert.equal(repo, 'me/older', 'to the repo itself, not the registry');
  assert.equal(cfg.conventions, 'optout');
  assert.match(message, /optout/);

  // Optimism: the row moves before the config cache has heard about it, and the
  // group it moved into opens so the row is not merely gone.
  assert.equal(data.unfiledState(row), 'aside');
  assert.equal(data.unfiledOpen.aside, true);
  assert.ok(groups().find(([k]) => k === 'aside')[1].includes('me/older'));
});

test('set aside merges into an existing config rather than replacing it', async () => {
  await loadWith({ ...CONFIG_MAP, 'me/older': { note: 'keep me', icon: 'ph-star' } });
  WRITES = [];
  await data.setAside(data.unfiledRepos.find(r => r.repo === 'me/older'));
  const [, cfg] = WRITES[0];
  // plain_ first: the component realm is jsdom's, so a JSON.parse there yields an
  // object whose prototype is not the Node realm's and deepEqual reports "same
  // structure but not reference-equal" on a correct merge.
  assert.deepEqual(plain_(cfg), { note: 'keep me', icon: 'ph-star', conventions: 'optout' });
});

test('the optimistic move survives the reload it triggers, then retires itself', async () => {
  await loadWith();
  await data.setAside(data.unfiledRepos.find(r => r.repo === 'me/older'));

  // Reload while the config cache is still behind: the row must NOT bounce back
  // to Unfiled, which would read as a failed write.
  await loadWith();
  assert.equal(data.unfiledState(data.unfiledRepos.find(r => r.repo === 'me/older')), 'aside');
  assert.equal(data.unfiledMoved['me/older'], 'aside', 'the override is still carrying it');

  // Once the cache agrees, the override drops itself rather than lingering.
  await loadWith({ ...CONFIG_MAP, 'me/older': { conventions: 'optout' } });
  assert.equal(data.unfiledState(data.unfiledRepos.find(r => r.repo === 'me/older')), 'aside');
  assert.equal(data.unfiledMoved['me/older'], undefined, 'and has handed off to the config');
});

test('adopt prefills the one add form rather than writing a second way', async () => {
  await loadWith();
  WRITES = [];
  data.adoptUnfiled(data.unfiledRepos.find(r => r.repo === 'me/recent'));
  assert.equal(data.addOpen, true);
  assert.equal(data.addName, 'me/recent');
  assert.deepEqual(WRITES, [], 'adopt itself writes nothing; the form does');
});

test('adopting from a row clears it, and the clear retires itself too', async () => {
  await loadWith();
  data.adoptUnfiled(data.unfiledRepos.find(r => r.repo === 'me/recent'));
  await data.addRepo();
  assert.equal(WRITES.at(-1)[0], 'me/recent');
  assert.equal(WRITES.at(-1)[1].estate, true);
  await loadWith();                              // cache still behind
  assert.ok(!groups().some(([, repos]) => repos.includes('me/recent')), 'the row is gone');
  await loadWith({ ...CONFIG_MAP, 'me/recent': { estate: true } });
  assert.equal(data.unfiledMoved['me/recent'], undefined);
});

test('the GitHub route is a link out, not a call', async () => {
  await loadWith();
  assert.equal(data.repoSettingsUrl('me/oldest'), 'https://github.com/me/oldest/settings');
  assert.equal(data.newRepoUrl(), 'https://github.com/new');
});

test('signed out there is no account to ask about', async () => {
  window.__shell.hasToken = () => false;
  await data.load();
  assert.deepEqual(plain_(data.unfiledRepos), []);
  assert.deepEqual(groups(), []);
  window.__shell.hasToken = () => true;
});
