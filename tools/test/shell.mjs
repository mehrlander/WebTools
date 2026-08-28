// Shared harness for show-repo's INLINE shell (the plain <script> block that
// defines app()). The shell is not a lib module, so tests get at it the way
// routes-manifest.test.mjs gets at TOSS_ROUTES: read the page source. This
// helper upgrades that from regex to execution, evaluating the block against
// stubbed globals; the block's top level only defines (nothing mounts until
// Alpine starts), so a factory call is clean. Used by
// shell-projects.test.mjs and shell-overlay.test.mjs.

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
                dispatchEvent: (e) => { events.push(e); return true; }, hidden: false,
                title: '', ...linkDom() };
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

// The <link> half of a document, and deliberately nothing else. The shell
// manages exactly two links (the favicon and the apple-touch icon), selects
// them by `rel~=`, and replaces rather than appends; that is the whole surface
// a test of the app view's mark needs. Anything broader would be a browser,
// which this harness is not, and the canvas step it feeds is stubbed at the
// method instead (see shell-app-view-mark.test.mjs).
//
// The base icon is read out of the page rather than written here, so the
// harness cannot drift from what app/index.html actually ships and a test
// asserting "the reset restores the hex nut" is asserting about the real one.
export const BASE_ICON = (page.match(/<link rel="icon"[^>]*href="([^"]+)"/) || [])[1] || '';

function linkDom() {
  const links = [];
  const matches = (el, sel) => {
    const m = /^link\[rel~="([^"]+)"\]$/.exec(sel);
    return !!m && String(el.rel || '').split(/\s+/).includes(m[1]);
  };
  // ANY OTHER TAG STILL THROWS, which is not an oversight: before this stub
  // existed `document.createElement` was undefined, and the shell has a code
  // path that depends on it failing. loadMarked() appends a <script> to the
  // head and waits on its onload; under a harness that hands back an inert
  // object and never fires either handler, that promise hangs forever and
  // takes the board render's `finally` with it. Throwing keeps the old
  // semantics ("this harness has no DOM") everywhere the new one is not
  // deliberately wanted.
  const make = (tag) => {
    assert.equal(tag, 'link', 'the harness DOM holds <link> elements and nothing else');
    return {
      tag, rel: '', href: '',
      getAttribute(n) { return this[n] === undefined ? null : this[n]; },
      remove() { const i = links.indexOf(this); if (i >= 0) links.splice(i, 1); },
    };
  };
  const dom = {
    links,
    head: { appendChild: (el) => { links.push(el); return el; } },
    createElement: make,
    querySelector: (sel) => links.find((el) => matches(el, sel)) || null,
    querySelectorAll: (sel) => links.filter((el) => matches(el, sel)),
  };
  assert.ok(BASE_ICON, 'app/index.html must declare a <link rel="icon"> to capture');
  const base = make('link');
  base.rel = 'icon';
  base.href = BASE_ICON;
  links.push(base);
  return dom;
}
