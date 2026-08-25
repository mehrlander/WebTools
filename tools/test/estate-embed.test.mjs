// alpineComponents/estate.js — logic tests for the Surfaces `kind: embed`
// item: the toss-render route URL it builds (#<route>=<addr>), the title's
// full-screen link (itemExt), the envelope pill and github link, the kind icon,
// and the per-item expand toggle kept off the item objects. Driven over a fake
// GH and a stubbed shell; no network, no pixels. (Row visibility is a render
// concern, out of scope here per docs/environment/testing.md; this proves the
// helpers the template binds to.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine } from './bootstrap.mjs';

// The one surface the registry serves in this suite: a single embed item, the
// chat-results pilot (mirrors web-tools-private surfaces/trawls.surface).
const FIXTURE = {
  manifest: { name: 'Trawls', description: '', category: 'showcase' },
  items: [
    {
      id: 'webi-drs', title: 'WEBI DRS trawl', kind: 'embed', page: 'chat-results',
      repo: 'mehrlander/chat-histories', path: 'results/webi-drs-data.json',
      snippet: 's', commentary: 'c',
    },
  ],
};

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  ago() { return 'recently'; }
  async get(name) {
    if (name === 'surfaces/trawls.surface') return { text: JSON.stringify(FIXTURE) };
    throw Object.assign(new Error('404'), { status: 404 });   // no config/activity cache
  }
  async ls(path) { return path === 'surfaces' ? [{ type: 'file', name: 'trawls.surface' }] : []; }
  async req(path) {
    if (typeof path === 'string' && path.startsWith('/repos/'))
      return { default_branch: 'main', description: '', private: true, pushed_at: '' };
    throw new Error('unexpected ' + path);
  }
  async repos() { return []; }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="es" x-data="estate()"></div>
  </body></html>`,
});
window.TOKEN = 'tkn';
window.GH = FakeGH;
window.__shell = {
  REGISTRY_REPO: 'me/registry',
  DEFAULT_REPO: 'me/tools',
  quickLinks: [],
  hasToken: () => true,
  _authState: 'auth',
  refreshConfigCache() {},
  refreshActivity() {},
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

test('an embed item loads from the surface and reports kind:embed', async () => {
  await data.loadSurfaces(new FakeGH({ repo: 'me/registry' }));
  const s = data.surfaces.find(x => x.file === 'trawls.surface');
  assert.ok(s, 'trawls.surface loaded');
  // The fixture is v1 (a bare `kind`), and the shelf reads it as v2: the
  // dual-read is what lets an existing surface file keep working untouched.
  const it = s.items[0];
  assert.equal(s.wasV1, true);
  assert.equal(it.type, 'embed');
  assert.deepEqual({ ...window.Surface.ref(it) },
    { repo: 'mehrlander/chat-histories', ref: '', path: 'results/webi-drs-data.json', dir: false },
    'kind fused genre with transport; v2 splits the location into target.source');
  assert.equal(data.isEmbed(it), true);
  assert.equal(data.openable(it), false);          // not a repo file: not "openable" in show-repo
  assert.equal(data.kindIcon(it), 'ph-app-window');
});

// A v2 embed item: genre in `type`, location in `target.source`, the renderer
// page still the app-defined field it always was.
const embed = (repo, path, extra = {}) => ({
  id: 'e', title: 'e', type: 'embed', ...extra,
  ...(repo || path ? { target: { source: { ...(repo ? { repository: repo } : {}), ...(path ? { path } : {}),
                                          ...(extra.ref ? { ref: extra.ref } : {}) } } } : {}),
});

test('embedUrl builds the toss-render route address', () => {
  const it = embed('mehrlander/chat-histories', 'results/webi-drs-data.json', { page: 'chat-results' });
  assert.equal(
    data.embedUrl(it),
    '../toss-render.html#chat-results=mehrlander/chat-histories:results/webi-drs-data.json',
  );
  // page defaults to chat-results; a ref renders as @ref inside the address.
  assert.equal(data.embedPage(embed()), 'chat-results');
  assert.equal(
    data.embedUrl(embed('o/r', 'x.json', { ref: 'br' })),
    '../toss-render.html#chat-results=o/r@br:x.json',
  );
  // an alternate TOSS_ROUTES key rides through, no code change: schema-blind.
  assert.equal(
    data.embedUrl(embed('o/r', 'x.json', { page: 'other-view' })),
    '../toss-render.html#other-view=o/r:x.json',
  );
  // missing repo/path -> empty, so the iframe (x-if="embedUrl(it)") never mounts.
  assert.equal(data.embedUrl(embed('o/r', '')), '');
  assert.equal(data.embedUrl(embed('', 'x.json')), '', 'a path with no repository is local, not an envelope');
});

test('title opens the full-screen render (itemExt) and the pill/github point at the envelope', () => {
  const it = embed('mehrlander/chat-histories', 'results/webi-drs-data.json');
  assert.equal(data.itemExt(it), data.embedUrl(it));            // title -> full render
  assert.equal(data.itemPill(it), 'mehrlander/chat-histories'); // pill names the envelope repo
  assert.equal(
    data.itemGh(it),
    'https://github.com/mehrlander/chat-histories/blob/main/results/webi-drs-data.json',
  );
});

test('the expand toggle is per item and stays off the item object', () => {
  const s = { file: 'trawls.surface' };
  const it = embed('a/b', 'x.json', { id: 'webi-drs' });
  assert.equal(data.isEmbedOpen(s, it), false);
  data.toggleEmbed(s, it);
  assert.equal(data.isEmbedOpen(s, it), true);
  data.toggleEmbed(s, it);
  assert.equal(data.isEmbedOpen(s, it), false);
  // state lives in embedOpen, not on the item (so the editor round-trips clean).
  assert.equal('_embed' in it, false);
});
