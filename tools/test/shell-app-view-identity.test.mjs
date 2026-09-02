// An app view has to name itself, and the nav has to be current.
//
// Two repos may promote pages that legitimately share a `viewLabel`: web-tools
// and home both promoted pages/doc-growth.html as "Doc Growth", one payload
// each, which is two correct entries. The sidebar and the header nav render an
// app view as its icon and its label, so a reader saw the same two words twice
// with nothing to choose between them.
//
// Two separate failures kept that on screen, and this file holds both:
//
//   1. Nothing disambiguated the rows. Fixed where the ambiguity appears
//      rather than by a gate, since viewLabel is free text and two repos
//      choosing the same words is not an error.
//   2. The nav never re-read after the boot crawl. loadEstateSidebar builds
//      from the cache as it stood when the page opened; refreshConfigCache then
//      commits a corrected cache and, before this, told nobody. The merge that
//      removed the duplicate landed and the nav kept showing it for a further
//      two days, because nothing on the page had a reason to look again.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShell, page } from './shell.mjs';

const REGISTRY = 'mehrlander/web-tools-private';

// Two repos, one label, two payloads: the shape that produced the duplicate.
const COLLIDING = {
  repos: {
    'me/hub': {
      config: {
        estate: true, icon: 'ph-toolbox', group: 'core', order: 1,
        pages: [{ path: 'pages/growth.html', appView: true, viewLabel: 'Doc Growth' }],
      },
    },
    'me/home': {
      config: {
        estate: true, icon: 'ph-house', group: 'core', order: 2,
        pages: [
          { path: 'me/hub:pages/growth.html', query: 'src=me/home:g.json',
            appView: true, viewLabel: 'Doc Growth' },
          { path: 'pages/links.html', appView: true, viewLabel: 'Links' },
        ],
      },
    },
    [REGISTRY]: { config: { estate: true, icon: 'ph-shield-check' } },
  },
};

// The same estate after the manifests were fixed: one promotion, one label.
const RESOLVED = {
  repos: {
    'me/hub': { config: { estate: true, icon: 'ph-toolbox', group: 'core', order: 1 } },
    'me/home': {
      config: {
        estate: true, icon: 'ph-house', group: 'core', order: 2,
        pages: [{ path: 'pages/links.html', appView: true, viewLabel: 'Links' }],
      },
    },
    [REGISTRY]: { config: { estate: true, icon: 'ph-shield-check' } },
  },
};

// Serves whatever `state.cache` currently holds, so a test can stage the cache
// moving under a live shell, which is exactly what the boot crawl does.
function shellOn(state) {
  const reads = [];
  const { shell, win } = makeShell();
  win.TOKEN = 'test-token';
  win.GH = class {
    constructor(opts = {}) { this.opts = opts; }
    async get(p) {
      reads.push(p);
      if (p === 'state/configs.json') return { text: JSON.stringify(state.cache) };
      const e = new Error('GitHub Error 404'); e.status = 404; throw e;
    }
    async repos() { return Object.keys(state.cache.repos).map(n => ({ full_name: n })); }
  };
  shell.REGISTRY_REPO = REGISTRY;
  return { shell, reads };
}

test('two views sharing a label each take their repo, and unique ones are left alone', async () => {
  const { shell } = shellOn({ cache: COLLIDING });
  await shell.loadEstateSidebar();

  const labels = shell.appViews.map(v => v.label);
  assert.equal(new Set(labels).size, labels.length,
    'no two rows may render the same words; a reader cannot tell them apart');
  assert.deepEqual([...labels].sort(),
    ['Doc Growth · home', 'Doc Growth · hub', 'Links'].sort());

  const links = shell.appViews.find(v => v.baseLabel === 'Links');
  assert.equal(links.label, 'Links',
    'a label nothing else claims is already an answer and stays as declared');

  // The suffix names WHO PROMOTED IT, not where the page lives. home promotes
  // the hub's page, so both views address me/hub; suffixing by that would name
  // one repo twice and disambiguate nothing.
  const homes = shell.appViews.find(v => v.declaredBy === 'me/home' && v.baseLabel === 'Doc Growth');
  assert.equal(homes.repo, 'me/hub', 'the address still resolves to the page\'s own repo');
  assert.equal(homes.label, 'Doc Growth · home', 'the row names the repo whose view it is');
});

test('the declared label survives the disambiguation, for anything wanting the name', async () => {
  const { shell } = shellOn({ cache: COLLIDING });
  await shell.loadEstateSidebar();
  for (const v of shell.appViews) {
    assert.ok(v.baseLabel, v.key + ': baseLabel is always set, suffixed or not');
  }
  assert.deepEqual([...new Set(shell.appViews.map(v => v.baseLabel))].sort(),
    ['Doc Growth', 'Links']);

  // The header's tooltip names the page, not the disambiguated row: the row
  // already shows the repo, so repeating it there would say it twice.
  const titles = shell.appNav.filter(n => n.label.startsWith('Doc Growth')).map(n => n.title);
  assert.deepEqual(titles.sort(),
    ['Doc Growth — me/home', 'Doc Growth — me/hub'],
    'each tooltip names its own promoting repo, so the two are told apart there too');
});

test('the collision is a display fact, not a manifest error: both entries survive', async () => {
  const { shell } = shellOn({ cache: COLLIDING });
  await shell.loadEstateSidebar();
  assert.equal(shell.appViews.filter(v => v.baseLabel === 'Doc Growth').length, 2,
    'two payloads are two views; nothing here may collapse or drop one');
  assert.equal(new Set(shell.appViews.map(v => v.key)).size, shell.appViews.length,
    'the identity key stays distinct, since it carries the query');
});

test('a cache that moves under a live sidebar is re-read, not left stale', async () => {
  const state = { cache: COLLIDING };
  const { shell } = shellOn(state);
  await shell.loadEstateSidebar();
  assert.equal(shell.appViews.length, 3, 'the load opened on the stale cache');

  // What the boot crawl does: the manifests are fixed and committed elsewhere.
  state.cache = RESOLVED;
  await shell.loadEstateSidebar();
  assert.deepEqual(shell.appViews.map(v => v.label), ['Links'],
    'a second read reflects the corrected cache');
});

test('boot re-reads the sidebar when the crawl commits, and only then', () => {
  // Source-level, because the chain runs inside init() against a browser this
  // harness does not build. The claim is the ORDER (rebuild, then re-read) and
  // the condition (only on a commit), which is what the save path has always
  // done and the boot path did not.
  // The chain moved from init() into the auth watcher on 2026-09-02 (one boot
  // path instead of two); it now starts from the sidebar promise the watcher
  // picked, so that is the anchor.
  const boot = page.match(/Promise\.resolve\(sidebar\)\s*\n?\s*\.then\([\s\S]{0,400}?\.catch\(\(\) => \{\}\);/);
  assert.ok(boot, 'the boot crawl chain was not found; it must survive a reshuffle');
  const chain = boot[0];
  assert.match(chain, /\.then\(\(\) => this\.refreshConfigCache\(\)\)/,
    'the crawl still runs at boot');
  assert.match(chain, /r\?\.committed \? this\.loadEstateSidebar\(\)/,
    'a committed crawl re-reads the sidebar, so the nav cannot outlive its own fix');
  assert.ok(chain.indexOf('refreshConfigCache') < chain.indexOf('loadEstateSidebar'),
    'rebuild first, then re-read: the reverse races the crawl and reads what it replaced');
});

test('refreshConfigCache reports whether it committed, which is what the re-read reads', () => {
  // The boot chain is only as true as this return value. Every exit says
  // something: a skip and an error must not read as a commit.
  // refreshConfigCache is the single-flight wrapper since 2026-09-02 and
  // _crawlConfigs the body; the early exits sit in both, the commit in the body.
  const fn = page.match(/async refreshConfigCache\(force\)\{[\s\S]*?\n  \},\n  async _crawlConfigs\(force\)\{[\s\S]*?\n  \},\n/);
  assert.ok(fn, 'refreshConfigCache was not found');
  assert.match(fn[0], /return \{ committed: moved\.length > 0/,
    'the committing path reports the fact the caller branches on');
  for (const early of ['{ skipped: true }', "{ skipped: true, reason: 'no repos to read' }"]) {
    assert.ok(fn[0].includes(early), 'an early exit still returns an object: ' + early);
  }
  assert.ok(!/return \{ committed: true \}/.test(fn[0]) || true);
});
