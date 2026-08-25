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

export const page = readFileSync(path.join(repoRoot, 'app/index.html'), 'utf8');

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
  // Listeners and dispatches are RECORDED rather than dropped, because a
  // handler the shell only ever registers is exactly the class of code a stub
  // that swallows both cannot be tested at all: the test has to be able to
  // fire the event and read what the shell said back.
  const events = [];
  const listeners = { document: {}, window: {} };
  const on = (bag) => (type, fn) => { (bag[type] ||= []).push(fn); };
  const doc = { addEventListener: on(listeners.document), getElementById: () => null,
                dispatchEvent: (e) => { events.push(e); return true; }, hidden: false };
  if (!win.addEventListener) win.addEventListener = on(listeners.window);
  // The 'toast' store is the function notify() prefers; recording it lets
  // tests assert that a code path SPOKE, not just that it declined to act.
  const toasts = [];
  const alpine = { store: (name) => (name === 'browser' ? store
    : name === 'toast' ? ((icon, msg, cls) => toasts.push({ icon, msg, cls })) : {}) };
  const loc = { search, href: 'https://localhost/', pathname: '/app/index.html', hash: '' };
  const hist = { pushState: () => {}, replaceState: () => {} };
  const exports = {};
  // kits/csv.js rides in the pre-build's boot list, so the real shell always
  // has window.Csv by the time any method runs; the harness installs it for the
  // same reason, and the board pane's typed read depends on it.
  new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/csv.js'), 'utf8'))(win);
  new Function('window', 'document', 'Alpine', 'location', 'history', '__exports',
    shellScript(page) + '\n;__exports.app = app;__exports.gallery = gallery;')(
    win, doc, alpine, loc, hist, exports);
  // `fire` is the point of the recording: hand a test the same call the browser
  // would make, so a visibility change or a bfcache restore is something the
  // suite can stage rather than something only a phone can produce.
  const fire = (target, type, ev = {}) =>
    (listeners[target][type] || []).forEach(fn => fn({ type, ...ev }));
  return { shell: exports.app(), gallery: exports.gallery(), browserStore: store,
           win, toasts, history: hist, location: loc, doc, events, listeners, fire };
}
