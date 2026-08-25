// alpineComponents/estate.js — scope and adoption, on the Repos card.
//
// These were a third tab on the Map view until 2026-08-03. They are facts about
// a REPO, and a Repos card is where a repo is described, so the Map was showing
// a second grid of the same repos with different columns.
//
// The move also settles a real bug the Map's own tests were written around: the
// Map kept its own roster, which drifted from estate membership (a repo joined
// the estate and was never graded). That property is now structural rather than
// asserted: the cards ARE the roster, so there is no second list to disagree.
//
// The grade is READ, not probed. It rides the config cache the estate already
// loads, computed by the crawl that is standing in front of each repo anyway.
// The first cut of this fanned out three live reads per member on every estate
// load, which is what a Map tab costs when it becomes a dashboard: a tab is
// opened sometimes, a dashboard is the front door. What is worth holding instead is the part that could
// still rot, which is what a card claims about a repo it has not finished
// probing, and that a failing check stays visible rather than collapsing into a
// score.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

const CACHE = {
  generatedAt: '2026-08-03T12:00:00Z',
  repos: {
    'me/aligned': {
      config: { estate: true, scope: 'A private base. Holds content, not conventions.' },
      align: { repo: 'me/aligned', role: null, verdict: 'aligned', marketplace: true,
               plugins: ['portable'], conventionsWired: true, hasClaudeMd: true, hasConfig: true,
               hookEvents: ['SessionStart'], scope: 'A private base. Holds content, not conventions.' },
    },
    'me/bare': {
      config: { estate: true, scope: 'docs/SCOPE.md' },
      align: { repo: 'me/bare', role: null, verdict: 'unaligned', marketplace: false,
               plugins: [], conventionsWired: false, hasClaudeMd: false, hasConfig: true,
               hookEvents: [], scope: 'docs/SCOPE.md' },
    },
    'me/hub': {
      config: { estate: true },
      align: { repo: 'me/hub', role: 'hub', verdict: 'hub', plugins: [], hookEvents: [], scope: '' },
    },
    'me/ungraded': { config: { estate: true } },   // in the cache, never graded
  },
};

class FakeGH {
  constructor(o = {}) { this.repo = o.repo || ''; this.ref = o.ref || ''; }
  ago() { return 'recently'; }
  async get() { throw Object.assign(new Error('404'), { status: 404 }); }
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
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);
const data = Alpine.$data(window.document.getElementById('es'));
data.readAdoption(CACHE);

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

test('the grade comes out of the cache, with no reads of its own', () => {
  const a = data.adopt({ repo: 'me/aligned' });
  assert.ok(a, 'no row for a graded repo');
  assert.equal(a.verdict, 'aligned');
  assert.equal(a.scope, 'A private base. Holds content, not conventions.');
  assert.match(data.verdictCls(a), /^badge-/);
  assert.equal(data.scopeFile(data.adopt({ repo: 'me/bare' })), 'docs/SCOPE.md');
});

test('the chips show every check, including the failing ones', () => {
  const chips = data.adoptChips({ repo: 'me/bare' });
  assert.deepEqual([...chips].map(c => c.label), ['marketplace', 'plugins', 'conventions', 'config']);
  // A failing check is the next step, which is why it stays visible rather than
  // collapsing into a score.
  assert.equal(chips.find(c => c.label === 'config').on, true);
  assert.equal(chips.find(c => c.label === 'marketplace').on, false);
  assert.equal(chips.find(c => c.label === 'conventions').on, false);
});

test('the hub carries a role, not a grade', () => {
  assert.equal(data.adopt({ repo: 'me/hub' }).role, 'hub');
  assert.deepEqual([...data.adoptChips({ repo: 'me/hub' })], [],
    'grading the hub against its own set says nothing');
});

test('ungraded is not the same as failing', () => {
  // A repo the crawl has not reached yet, and one that is not in the cache at
  // all, must both claim nothing. Rendering them as four failing checks would
  // report a cold cache as an estate that has adopted nothing.
  for (const repo of ['me/ungraded', 'me/never-heard-of']) {
    assert.equal(data.adopt({ repo }), null, repo);
    assert.deepEqual([...data.adoptChips({ repo })], [], repo);
    assert.equal(data.scopeOf({ repo }), '', repo);
  }
});

test('a cache with no repos leaves every card silent rather than red', () => {
  data.readAdoption({ repos: {} });
  assert.deepEqual({ ...data.adoptRows }, {});
  assert.equal(data.adopt({ repo: 'me/aligned' }), null);
  data.readAdoption(CACHE);
});

await tick(1);
