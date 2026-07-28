// alpineComponents/map.js — the Adoption roster. The Map grades estate members
// (`estate: true` in each repo's own .web-tools.json, read from the registry's
// config cache), not a list authored in the registry manifest. It is worth a
// test because the authored list it replaced drifted silently: a repo joined
// the estate and never reached the list, so the Map graded a roster one member
// short of what it was mapping, and nothing said so.
//
// The probe itself stays out of scope here (it needs window.PortableAlign and
// private reads); this holds the roster's composition and its ordering.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="map" x-data="map()"></div>
  </body></html>`,
});

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
window.Alpine = Alpine;

// Members out of order, one non-member, and one member whose config carries no
// `order`: it reads as 0 and therefore leads, the same `?? 0` the estate grid
// and the retired quick-link resolver both used.
const cache = {
  repos: {
    'mehrlander/wa-bills':          { config: { estate: true, order: 30 } },
    'mehrlander/home':              { config: { estate: true, order: 10 } },
    'mehrlander/hello-world':       { config: {} },
    'mehrlander/spend-wa':          { config: { estate: true, order: 20 } },
    'mehrlander/shortcut-tools':    { config: { estate: true } },
    'mehrlander/web-tools':         { config: { estate: true, order: 11 } },
    'mehrlander/web-tools-private': { config: { estate: true, order: 12 } },
    'mehrlander/fun':               null,
  },
};

const asked = [];
window.TOKEN = 'ignored-in-test';
window.GH = class {
  constructor(opts) { this.opts = opts; }
  async get(p) {
    asked.push({ repo: this.opts.repo, path: p });
    if (p === 'state/configs.json') return { text: JSON.stringify(cache) };
    throw new Error('unexpected read: ' + p);
  }
};
// hasToken() is falsy without __shell, so the mount does not fire the probe;
// roster() is called directly below.
new window.Function(readFileSync(path.join(repoRoot, 'lib/alpineComponents/map.js'), 'utf8'))();
Alpine.start();
await tick(3);

const data = Alpine.$data(window.document.getElementById('map'));

test('the roster is the hub, the registry, then the estate members in order', async () => {
  assert.deepEqual(problems, []);
  const roster = await data.roster();
  assert.deepEqual([...roster], [
    'mehrlander/web-tools',          // hub, always first
    'mehrlander/web-tools-private',  // registry, always second
    'mehrlander/shortcut-tools',     // no order, so 0, so first of the members
    'mehrlander/home',               // order 10
    'mehrlander/spend-wa',           // order 20
    'mehrlander/wa-bills',           // order 30
  ]);
});

test('a repo in the cache without estate: true is not graded', async () => {
  const roster = await data.roster();
  assert.ok(!roster.includes('mehrlander/hello-world'), 'no config flag, no row');
  assert.ok(!roster.includes('mehrlander/fun'), 'a null cache entry does not throw or land');
});

test('the roster reads the cache, not the registry manifest', async () => {
  asked.length = 0;   // drop the mount's own hub reads (the portable manifest)
  await data.roster();
  assert.ok(asked.length > 0);
  for (const a of asked) {
    assert.equal(a.repo, 'mehrlander/web-tools-private', 'the cache lives in the registry');
    assert.equal(a.path, 'state/configs.json', 'no .web-tools.json read: the authored list is gone');
  }
});

test('an unreadable cache still maps the hub and the registry', async () => {
  const realGH = window.GH;
  window.GH = class { async get() { throw new Error('cold cache'); } };
  try {
    assert.deepEqual([...await data.roster()],
      ['mehrlander/web-tools', 'mehrlander/web-tools-private']);
  } finally { window.GH = realGH; }
});
