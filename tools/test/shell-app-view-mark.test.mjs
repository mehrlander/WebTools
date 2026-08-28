// The app view's mark: what a tab, a bookmark and a home-screen tile carry.
//
// The shell stamped one title and one favicon for every route, so budget-drs,
// News and the estate dashboard all read as "Web Tools" under the hex nut. An
// app view is a page some repo PROMOTED and `?app=<slug>` is a whole address;
// both should name the app. This is the second half of the tracker task
// app-view-address-and-icon-tc1a91, whose first half (the address) landed in
// PR #505.
//
// The mark itself is the framed page's OWN icon and title, resolved by
// toss-render (a private repo's icon file is reachable no other way than
// through the token) and announced up undimmed on `toss-subject-mark`. So the
// wiring under test here is: who listens, which name wins, whose key the icon
// belongs to, and when it all drops. The canvas step that rasterizes the icon
// is stubbed at the method: a test of that arithmetic against a fake canvas
// would prove nothing a browser cares about.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';
import { makeShell, page, BASE_ICON } from './shell.mjs';

const toss = readFileSync(path.join(repoRoot, 'pages/toss-render.html'), 'utf8');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";

// A shell sitting on an app view, with the canvas stubbed to whatever this
// test wants it to have produced.
function onAppView({ png = PNG, key = 'me/home:app.html', label = 'Budget DRS',
                     labelFrom } = {}) {
  const h = makeShell();
  h.shell.view = 'app';
  h.shell.appView = { key, label, labelFrom, repo: 'me/home', path: 'app.html' };
  h.shell.iconPng = async () => png;
  return h;
}

const icons = (doc) => doc.querySelectorAll('link[rel~="icon"]').map((l) => l.href);
const tiles = (doc) => doc.querySelectorAll('link[rel~="apple-touch-icon"]').map((l) => l.href);

test('the tab leads with the app view, and every other route keeps product-first', () => {
  const { shell, doc, browserStore } = makeShell();
  shell.view = 'app';
  shell.appView = { key: 'k', label: 'Budget DRS' };
  shell.syncUrl();
  assert.equal(doc.title, 'Budget DRS · Web Tools',
    'a bookmark and a tile truncate from the right, so the app has to lead');

  // The repo case is unchanged: the product leads, owner dropped.
  shell.view = 'landing';
  shell.appView = null;
  browserStore.repo = 'me/home';
  shell.syncUrl();
  assert.equal(doc.title, 'Web Tools · home');

  browserStore.repo = shell.DEFAULT_REPO;
  shell.syncUrl();
  assert.equal(doc.title, 'Web Tools', 'the default repo is not worth naming');
});

test('the mark replaces the hex nut, and adds the tile iOS reads', async () => {
  const { shell, doc } = onAppView();
  assert.deepEqual(icons(doc), [BASE_ICON], 'the page opens on its own mark');

  await shell.applyAppIcon('me/home:app.html', SVG);
  assert.deepEqual(icons(doc), [PNG], 'exactly one icon link, and it is the app\'s');
  assert.deepEqual(tiles(doc), [PNG],
    'iOS reads apple-touch-icon and will not take the SVG most of these pages declare');
});

test('leaving an app view puts the hex nut back and takes the tile away', async () => {
  const { shell, doc } = onAppView();
  await shell.applyAppIcon('me/home:app.html', SVG);

  shell.view = 'estate';
  shell.appView = null;
  shell.syncUrl();                       // every route change passes through stamp()
  assert.deepEqual(icons(doc), [BASE_ICON], 'the shell gets its own mark back');
  assert.deepEqual(tiles(doc), [],
    'there is no base apple-touch-icon to restore, so the link goes rather than reverts');
});

test('a cleared mark is a message: the tab drops on it', async () => {
  const { shell, doc, win } = onAppView();
  await shell.applyAppIcon('me/home:app.html', SVG);

  // toss-render clears on every setSubject, which is what makes the drop
  // happen when the frame starts on something else rather than whenever the
  // next mark finishes resolving.
  win.__tossSubjectMark = null;
  shell.onSubjectMark();
  assert.deepEqual(icons(doc), [BASE_ICON]);
  assert.deepEqual(tiles(doc), []);
});

test('a declared label outranks the page\'s own title', () => {
  const { shell, doc, win } = onAppView();      // labelFrom undefined: declared
  win.__tossSubjectMark = { icon: null, title: 'DRS budget lens' };
  shell.onSubjectMark();
  assert.equal(doc.title, 'Budget DRS · Web Tools',
    'the sidebar and the header nav show the declared label; the tab may not disagree');
});

test('a cold address link takes the page\'s title over the filename it invented', () => {
  // ?app=owner/repo:path before the crawl resolves: nothing declared a name,
  // so the fallback is `app.html`, which names nothing.
  const { shell, doc, win } = onAppView({ label: 'app.html', labelFrom: 'path' });
  assert.equal(shell.appTabName(shell.appView), 'app.html', 'the bare fallback');

  win.__tossSubjectMark = { icon: null, title: 'DRS budget lens' };
  shell.onSubjectMark();
  assert.equal(doc.title, 'DRS budget lens · Web Tools');

  // And it goes when the view does, rather than captioning the next screen.
  shell.view = 'estate';
  shell.appView = null;
  shell.syncUrl();
  assert.equal(doc.title, 'Web Tools');
});

test('an address with no declared label says so, and the five-key form says which', () => {
  const { shell, win } = makeShell();
  // The real grammar, not a stand-in: `labelFrom` hangs off the branch
  // RepoAddress.parse picks, so a stub deciding that would be deciding the
  // thing under test.
  new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/repo-address.js'), 'utf8'))(win);
  shell.appViews = [];
  const bare = shell.appViewFromUrl({ app: 'me/home:projects/x/app.html' });
  const five = shell.appViewFromUrl({ appRepo: 'me/home', appPath: 'a.html', appLabel: 'News' });
  const cold = shell.appViewFromUrl({ appRepo: 'me/home', appPath: 'a.html' });
  return Promise.all([bare, five, cold]).then(([b, f, c]) => {
    assert.equal(b.labelFrom, 'path', 'a bare address invents its name from the path');
    assert.equal(f.labelFrom, 'url', 'the five-key form carries one, which is why it exists');
    assert.equal(c.labelFrom, 'path', 'and falls back when it does not');
  });
});

test('a mark cannot land on the view that replaced the one it belongs to', async () => {
  const { shell, doc } = onAppView();
  // The reader switched while the canvas was decoding.
  shell.iconPng = async () => { shell.appView = { key: 'me/home:other.html', label: 'News' }; return PNG; };
  await shell.applyAppIcon('me/home:app.html', SVG);
  assert.deepEqual(icons(doc), [BASE_ICON], 'the stale mark is dropped, not painted');
});

test('switching between two app views drops the outgoing mark at once', async () => {
  const { shell, doc } = onAppView();
  await shell.applyAppIcon('me/home:app.html', SVG);
  // Both are view==='app', so stamp()'s reset never fires between them.
  shell.goAppView({ key: 'me/home:other.html', label: 'News' });
  assert.deepEqual(icons(doc), [BASE_ICON],
    'the tab must not name the app the reader just left');
});

test('a canvas that fails leaves the tab alone rather than drawing a broken mark', async () => {
  const { shell, doc } = onAppView({ png: null });
  await shell.applyAppIcon('me/home:app.html', SVG);
  assert.deepEqual(icons(doc), [SVG], 'the tab still gets the real icon, unrasterized');
  assert.deepEqual(tiles(doc), [],
    'but no tile, since iOS would refuse the SVG and a broken tile is worse than none');
});

test('the listener is wired at init, not per frame load', () => {
  // Source-level: init() runs against a browser this harness does not build.
  // The claim is WHERE it is wired. Hanging it off the app-view iframe would
  // register one listener per load and leak them for the page's lifetime.
  assert.match(page, /window\.addEventListener\('toss-subject-mark', \(\) => this\.onSubjectMark\(\)\);/,
    'one window-level listener, registered before any app view can load');
  assert.ok(!/@load="adoptAppIcon/.test(page),
    'nothing hangs off the frame; the announcement comes to us');
});

test('toss-render hands the icon up undimmed, and clears the mark with the subject', () => {
  assert.match(toss, /announceMark\(\{ icon: src \}\);\n\s+const icon = await isCanonicalSubject/,
    'the announcement is taken BEFORE the dimming, which is the whole point of it');
  assert.match(toss, /w\.dispatchEvent\(new w\.CustomEvent\('toss-subject-mark'\)\)/,
    'announced with the TARGET window\'s constructor, the way subject-channel does it');
  // The title is announced on its own, ahead of the icon: gating the cheap
  // fact on the expensive one would leave the tab unnamed for the fetch.
  assert.match(toss, /if \(t && t !== seenTitle\) \{ seenTitle = t; announceMark\(\{ title: t \}\); \}/,
    'the subject\'s <title> rides the same channel, separately');
  assert.match(toss, /Object\.assign\(\n?\s*\{ icon: null, title: '' \}, w\.__tossSubjectMark, patch\)/,
    'merged per host, so a title announced on load survives the icon landing later');
  const setSubject = toss.match(/function setSubject\(s\) \{[\s\S]*?\n  \}/);
  assert.ok(setSubject, 'setSubject was not found');
  assert.match(setSubject[0], /clearMark\(\);/,
    'the host\'s mark resets with ours, or it names the previous subject');
});
