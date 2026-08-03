// alpineComponents/estate.js — scope and adoption, on the Repos card.
//
// These were a third tab on the Map view until 2026-08-03. They are facts about
// a REPO, and a Repos card is where a repo is described, so the Map was showing
// a second grid of the same repos with different columns.
//
// The move also settles a real bug the Map's own tests were written around: the
// Map kept its own roster, which drifted from estate membership (a repo joined
// the estate and was never graded). Those tests asserted that the roster was
// rebuilt from the config cache in the right order. That property is now
// structural rather than asserted: the cards ARE the roster, so there is no
// second list to disagree. What is worth holding instead is the part that could
// still rot, which is what a card claims about a repo it has not finished
// probing, and that a failing check stays visible rather than collapsing into a
// score.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const FILES = {
  'me/aligned': {
    '.claude/settings.json': JSON.stringify({
      extraKnownMarketplaces: { 'web-tools': {} }, enabledPlugins: { 'portable@web-tools': true },
    }),
    'CLAUDE.md': 'see mehrlander/web-tools docs/CONVENTIONS.md',
    '.web-tools.json': JSON.stringify({ estate: true, scope: 'A private base. Holds content, not conventions.' }),
  },
  'me/bare': {
    '.web-tools.json': JSON.stringify({ estate: true, scope: 'docs/SCOPE.md' }),
  },
};

const probed = [];
class FakeGH {
  constructor(o = {}) { this.repo = o.repo || ''; this.ref = o.ref || ''; }
  ago() { return 'recently'; }
  async get(p) {
    if (p in (FILES[this.repo] || {})) { probed.push(this.repo + ':' + p); return { text: FILES[this.repo][p] }; }
    if (FILES[this.repo]) probed.push(this.repo + ':' + p);
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async ls() { return []; }
  async req() { throw new Error('no'); }
  async repos() { return []; }
}

const { window } = makeWindow({
  html: `<!doctype html><html><body><div id="es" x-data="estate()"></div></body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = {
  REGISTRY_REPO: 'me/registry', DEFAULT_REPO: 'me/tools', quickLinks: [],
  hasToken: () => true, _authState: 'auth', refreshConfigCache() {}, refreshActivity() {},
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  'lib/surface.js',
  'lib/portable-align.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));

test('a scope is either the repo telling its own story, or pointing at where it told it', () => {
  assert.equal(data.scopeIsFile('docs/SCOPE.md'), true);
  assert.equal(data.scopeIsFile('projects/x/SCOPE.md'), true);
  assert.equal(data.scopeIsFile('A private orchestration base. Holds content, not conventions.'), false);
  assert.equal(data.scopeText({ scope: 'A private base.' }), 'A private base.');
  assert.equal(data.scopeText({ scope: 'docs/SCOPE.md' }), '', 'a file pointer is not inline text');
  assert.equal(data.scopeFile({ scope: 'docs/SCOPE.md' }), 'docs/SCOPE.md');
  assert.equal(data.scopeFile({ scope: 'A private base.' }), '', 'prose is not a path');
  assert.equal(data.scopeFileGh({ repo: 'me/x', scope: 'docs/SCOPE.md' }),
    'https://github.com/me/x/blob/HEAD/docs/SCOPE.md');
});

test('probing reads exactly the three files the grading needs', async () => {
  probed.length = 0;
  await data.loadAdoption(['me/aligned']);
  const asked = probed.filter(p => p.startsWith('me/aligned')).map(p => p.split(':')[1]).sort();
  assert.deepEqual(asked, ['.claude/settings.json', '.web-tools.json', 'CLAUDE.md']);
});

test('a graded repo carries its verdict and its own scope story', async () => {
  await data.loadAdoption(['me/aligned', 'me/bare']);
  const a = data.adoptRows['me/aligned'];
  assert.ok(a, 'no row for a probed repo');
  assert.equal(a.scope, 'A private base. Holds content, not conventions.');
  assert.equal(typeof a.verdict, 'string');
  assert.match(data.verdictCls(a), /^badge-/);
  // A repo declaring nothing but a config still gets a row rather than being
  // skipped: "adopting nothing" is an answer, and a blank card is not.
  assert.ok(data.adoptRows['me/bare']);
  assert.equal(data.scopeFile(data.adoptRows['me/bare']), 'docs/SCOPE.md');
});

test('a probe runs once per repo, however many times the estate reloads', async () => {
  await data.loadAdoption(['me/aligned']);
  probed.length = 0;
  await data.loadAdoption(['me/aligned']);
  assert.deepEqual(probed, [], 'a cached row is not re-fetched');
});

test('the chips show every check, including the failing ones', async () => {
  await data.loadAdoption(['me/bare']);
  const e = { repo: 'me/bare' };
  const chips = data.adoptChips(e);
  assert.deepEqual([...chips].map(c => c.label), ['marketplace', 'plugins', 'conventions', 'config']);
  // A failing check is the next step, which is why it stays visible rather than
  // collapsing into a score. me/bare has only a config.
  assert.equal(chips.find(c => c.label === 'config').on, true);
  assert.equal(chips.find(c => c.label === 'marketplace').on, false);
  assert.equal(chips.find(c => c.label === 'conventions').on, false);
});

test('a card with no probe yet claims nothing', () => {
  assert.equal(data.adopt({ repo: 'me/never-probed' }), null);
  assert.deepEqual([...data.adoptChips({ repo: 'me/never-probed' })], [],
    'no row, no chips: an ungraded repo must not read as a failing one');
  assert.equal(data.scopeOf({ repo: 'me/never-probed' }), '');
});

test('the hub and the registry are roles, not repos to grade', async () => {
  await data.loadAdoption(['mehrlander/web-tools']);
  const hub = data.adoptRows['mehrlander/web-tools'];
  assert.ok(hub.role, 'the hub carries a role');
  assert.deepEqual([...data.adoptChips({ repo: 'mehrlander/web-tools' })], [],
    'grading the hub against its own set says nothing');
});

await tick(1);
