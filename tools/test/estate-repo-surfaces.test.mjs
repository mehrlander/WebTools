// alpineComponents/estate.js — logic tests for repo-declared surfaces: a repo
// naming `surface` in its own .web-tools.json contributes a .surface file that
// the estate fetches (bounded to declaring repos, resolved on their default
// branch) and groups under the repo, below the registry's general surfaces.
// Covers loadRepoSurfaces (fetch + shape), the surfaceSections split (general
// first, then per-repo, with anchors), the entry hasSurface flag, and the card
// jump. Driven over a fake GH and a stubbed shell; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

const REGISTRY = 'me/registry';

// Test fixtures, swapped between loads.
let CONFIGS = { repos: {} };   // state/configs.json (the config cache)
let FILES = {};                // "reg::<name>" for registry surfaces, "<repo>::<path>" for repo files
let ACCOUNT = [];              // gh.repos() account list (carries default_branch)

const GENERAL = { manifest: { name: 'Curated', category: 'showcase' }, items: [{ id: 'a', title: 'A', kind: 'note', body: 'x' }] };
const APP_SURF = { manifest: { name: 'App tour', category: 'showcase' }, items: [{ id: 'i', title: 'Entry', kind: 'note', body: 'y' }] };

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async repos() { return ACCOUNT; }
  async ls(path) {
    if (this.repo === REGISTRY && path === 'surfaces')
      return Object.keys(FILES).filter(k => k.startsWith('reg::')).map(k => ({ type: 'file', name: k.slice(5) }));
    return [];
  }
  async get(name) {
    if (this.repo === REGISTRY) {
      if (name === 'state/configs.json') return { text: JSON.stringify(CONFIGS) };
      if (name.startsWith('surfaces/')) {
        const key = 'reg::' + name.slice('surfaces/'.length);
        if (FILES[key]) return { text: JSON.stringify(FILES[key]) };
      }
      throw Object.assign(new Error('404'), { status: 404 });   // no activity/todo cache
    }
    const key = this.repo + '::' + name;
    if (FILES[key]) return { text: JSON.stringify(FILES[key]) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req(path) {
    if (path.startsWith('/repos/')) {
      const full = path.slice('/repos/'.length);
      const r = ACCOUNT.find(x => x.full_name === full) || {};
      return { default_branch: r.default_branch || 'main', description: '', private: !!r.private, pushed_at: '' };
    }
    throw new Error('unexpected ' + path);
  }
}

let wentSurfaces = false;
const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="es" x-data="estate()"></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = {
  REGISTRY_REPO: REGISTRY,
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
  refreshConfigCache() {},
  refreshActivity() {},
  goSurfaces() { wentSurfaces = true; },
};

const Alpine = await startAlpine(window, [
  'lib/alpine-bundle.js',
  // The shelf reads every surface through the shared envelope model, which
  // gh-boot loads ahead of the components for exactly this reason.
  'lib/kits/surface.js',
  'lib/alpineComponents/estate.js',
]);

const data = Alpine.$data(window.document.getElementById('es'));

test('mounts with no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});

test('loadRepoSurfaces fetches only declaring repos and shapes each entry', async () => {
  ACCOUNT = [{ full_name: 'owner/app', default_branch: 'main' }];
  FILES = { 'owner/app::docs/app.surface': APP_SURF };
  data._acct = null;
  // owner/plain declares nothing; owner/app declares a path. Only owner/app is fetched.
  await data.loadRepoSurfaces({
    'owner/app': { estate: true, surface: 'docs/app.surface' },
    'owner/plain': { estate: true },
  });
  assert.equal(data.repoSurfaces.length, 1);
  const rs = data.repoSurfaces[0];
  assert.equal(rs.repo, 'owner/app');
  assert.equal(rs.path, 'docs/app.surface');
  assert.equal(rs.uid, 'owner/app:docs/app.surface');
  assert.equal(rs.file, 'app.surface');
  assert.equal(rs.blob, 'https://github.com/owner/app/blob/main/docs/app.surface');
  assert.equal(rs.manifest.name, 'App tour');
  assert.equal(rs.items.length, 1);
});

test('a list-valued surface loads every declared file; a missing file is skipped', async () => {
  ACCOUNT = [{ full_name: 'owner/app', default_branch: 'main' }];
  FILES = { 'owner/app::a.surface': APP_SURF, 'owner/app::b.surface': GENERAL };   // c.surface absent
  data._acct = null;
  await data.loadRepoSurfaces({ 'owner/app': { surface: ['a.surface', 'b.surface', 'c.surface'] } });
  const files = data.repoSurfaces.map(s => s.file);
  assert.equal(files.length, 2);                       // c.surface absent -> skipped
  assert.ok(files.includes('a.surface') && files.includes('b.surface'));
});

test('surfaceSections puts General first, then a per-repo section with a DOM anchor', async () => {
  await data.loadSurfaces(new FakeGH({ repo: REGISTRY }));   // no reg surfaces yet -> general empty
  FILES = { 'reg::general.surface': GENERAL, 'owner/app::docs/app.surface': APP_SURF };
  await data.loadSurfaces(new FakeGH({ repo: REGISTRY }));
  ACCOUNT = [{ full_name: 'owner/app', default_branch: 'main' }];
  data._acct = null;
  await data.loadRepoSurfaces({ 'owner/app': { surface: 'docs/app.surface' } });

  const secs = data.surfaceSections;
  assert.equal(secs[0].repo, null);                       // General leads
  assert.equal(secs[0].anchor, 'surface-sec-general');
  const appSec = secs.find(s => s.repo === 'owner/app');
  assert.ok(appSec, 'a section per declaring repo');
  assert.equal(appSec.anchor, 'surface-sec-owner-app');   // owner/repo -> owner-repo
  assert.equal(appSec.surfaces.length, 1);
  // The General header shows only once a repo section coexists.
  assert.equal(data.showGeneralHeader, true);
});

test('load() marks a declaring entry hasSurface and leaves a plain one false', async () => {
  ACCOUNT = [{ full_name: 'owner/app', default_branch: 'main' }, { full_name: 'owner/plain', default_branch: 'main' }];
  CONFIGS = { repos: {
    'owner/app': { config: { estate: true, surface: 'docs/app.surface' } },
    'owner/plain': { config: { estate: true } },
  } };
  FILES = { 'reg::general.surface': GENERAL, 'owner/app::docs/app.surface': APP_SURF };
  await data.load();
  const app = data.entries.find(e => e.repo === 'owner/app');
  const plain = data.entries.find(e => e.repo === 'owner/plain');
  assert.equal(app.hasSurface, true);
  assert.equal(plain.hasSurface, false);
});

test('openRepoSurfaces switches the shell to the Surfaces view', () => {
  wentSurfaces = false;
  data.openRepoSurfaces('owner/app');
  assert.equal(wentSurfaces, true);
});
