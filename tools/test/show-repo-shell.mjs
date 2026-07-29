// Shared harness for show-repo's INLINE shell (the plain <script> block that
// defines app()). The shell is not a lib module, so tests get at it the way
// routes-manifest.test.mjs gets at TOSS_ROUTES: read the page source. This
// helper upgrades that from regex to execution, evaluating the block against
// stubbed globals; the block's top level only defines (nothing mounts until
// Alpine starts), so a factory call is clean. Used by
// show-repo-projects.test.mjs and show-repo-overlay.test.mjs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

export const page = readFileSync(path.join(repoRoot, 'pages/show-repo/show-repo.html'), 'utf8');

// The one plain <script> block (the module boot loads lib and is not wanted
// here). Anchored on the token seed so a reshuffle fails loudly.
export function shellScript(src = page) {
  const m = src.match(/<script>\n(window\.TOKEN[\s\S]*?)<\/script>/);
  assert.ok(m, 'the inline shell script block was not found');
  return m[1];
}

// Evaluate the block with stubbed globals and hand back a fresh app() object
// plus the stubs its methods read. Alpine is only dereferenced inside methods,
// so a plain per-call stub suffices. `search` feeds the location the block
// sees; `win` is the window object, returned so tests can set TOKEN or GH on
// it AFTER construction (the block's first line overwrites win.TOKEN with the
// placeholder, so pre-seeding a token would be lost).
export function makeShell({ browserStore, search = '', win = {} } = {}) {
  const store = browserStore ?? { repo: '' };
  const doc = { addEventListener: () => {}, getElementById: () => null, dispatchEvent: () => {} };
  const alpine = { store: (name) => (name === 'browser' ? store : {}) };
  const loc = { search, href: 'https://localhost/', pathname: '/pages/show-repo/show-repo.html', hash: '' };
  const hist = { pushState: () => {}, replaceState: () => {} };
  const exports = {};
  new Function('window', 'document', 'Alpine', 'location', 'history', '__exports',
    shellScript(page) + '\n;__exports.app = app;')(
    win, doc, alpine, loc, hist, exports);
  return { shell: exports.app(), browserStore: store, win };
}
