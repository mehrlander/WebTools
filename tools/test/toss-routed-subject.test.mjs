// toss-routed-subject.test.mjs — under a routed toss, WHICH FILE is the subject.
//
// #data=mehrlander/home:CLAUDE.md resolves onto address mode by fetching
// pages/data-view.html and handing it the envelope, so showAddress stamps the
// renderer as the subject. That is true of the document it mounted and false of
// what the viewer is looking at, and the drawer around the frame duly reported
// "mehrlander/web-tools · pages/data-view.html" over a markdown file from
// another repo. showRoute now re-stamps with the envelope's own address.
//
// The functions are LIFTED from the page and run, not re-implemented: the
// critical render path loads no lib on purpose, so there is nothing to import,
// and a rewrite here would agree with itself while the page kept its own
// behavior. Only showAddress is stubbed, since the real one is a network fetch;
// the stub stamps the renderer exactly as the real one does, which is what
// makes the ordering assertion real rather than decorative.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const PAGE = 'pages/toss-render.html';
const src = readFileSync(path.join(repoRoot, PAGE), 'utf8');

// Lift a top-level function by its declaration, up to the closing brace at its
// own indentation. A reformat past this reads back nothing and fails loudly.
function lift(signature) {
  const re = new RegExp('\\n {2}(?:async )?function ' + signature.replace(/[()]/g, '\\$&') +
    ' \\{[\\s\\S]*?\\n {2}\\}\\n');
  const m = src.match(re);
  assert.ok(m, signature + ' not found in ' + PAGE);
  return m[0];
}

const splitAddrSrc = lift('splitAddr(addr)');
const showRouteSrc = lift('showRoute(key, raw)');
const setSubjectSrc = lift('setSubject(s)');

const splitAddr = new Function(splitAddrSrc + '\n  return splitAddr;')();

// The page's own showRoute and setSubject, wired to a recording harness. Every
// name they close over is a parameter, so nothing here is a stand-in for logic
// under test: the module-level `let`s (tossLinkFn, cancelIconWatch) are
// redeclared because a lifted function cannot reach the page's.
function harness({ routes, fail } = {}) {
  const log = { subjects: [], titles: [], addresses: [], empty: [], events: [], marks: [] };
  // Every setSubject fires this, so listening is how the harness sees each
  // stamp land, the page's own re-stamp included. Recording inside the
  // showAddress stub would only ever see the stub's.
  const win = { dispatchEvent: (e) => {
    log.events.push(e && e.type);
    log.subjects.push(win.__tossSubject && { ...win.__tossSubject });
  } };
  const doc = { set title(v) { log.titles.push(v); doc._t = v; }, get title() { return doc._t; } };
  const build = new Function(
    'window', 'document', 'history', 'frame', 'TOSS_ROUTES', 'CustomEvent',
    'showAddress', 'showEmpty', 'splitFrag', 'absUrl', 'setFavicon', 'adoptSubjectIcon', 'baseIcon',
    'clearMark',
    `let tossLinkFn = null, cancelIconWatch = null;
     ${splitAddrSrc}
     ${setSubjectSrc}
     ${showRouteSrc}
     return { showRoute, link: () => tossLinkFn };`);
  return {
    log,
    window: win,
    ...build(
      win, doc,
      { replaceState() {} },
      { id: 'the-frame' },
      routes || { data: { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' } },
      class { constructor(type) { this.type = type; } },
      // The real showAddress stamps the document it fetched and mounted. Keeping
      // that here is the point: the re-stamp has to overwrite it, and a stub
      // that skipped it would let a reordering pass.
      async (addr) => {
        log.addresses.push(addr);
        // The real failure path is showEmpty, which clears the subject on its
        // way to the panel. Reproducing that is what makes the failure case
        // load-bearing rather than a stub agreeing with itself.
        if (fail) { win.__tossSubject = null; return log.empty.push('fetch failed'); }
        const a = splitAddr(addr);
        win.__tossSubject = { repo: a.repo, ref: a.ref || 'main', path: a.path };
        win.dispatchEvent({ type: 'toss-subject' });
      },
      (m) => log.empty.push(m),
      (v) => { const i = v.indexOf('#'); return i === -1 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)]; },
      (frag) => 'https://mehrlander.github.io/web-tools/pages/toss-render.html' + frag,
      () => {}, () => {}, null,
      // setSubject clears the host's mark alongside its own; recorded so the
      // reset is visible here rather than merely tolerated.
      () => log.marks.push('cleared'),
    ),
  };
}

test('an envelope address comes apart into repo, ref, and path', () => {
  assert.deepEqual(splitAddr('mehrlander/home:CLAUDE.md'),
    { repo: 'mehrlander/home', ref: '', path: 'CLAUDE.md' });
  assert.deepEqual(splitAddr('mehrlander/web-tools@main:docs/show-repo.md'),
    { repo: 'mehrlander/web-tools', ref: 'main', path: 'docs/show-repo.md' });
});

test('a slashed ref survives, since every session branch has one', () => {
  assert.deepEqual(splitAddr('mehrlander/web-tools@claude/a-b-c:tracker/board.md'),
    { repo: 'mehrlander/web-tools', ref: 'claude/a-b-c', path: 'tracker/board.md' });
});

test('a query or frag on the address belongs to the renderer, not the path', () => {
  assert.equal(splitAddr('o/r@br:data/rows.csv?view=table').path, 'data/rows.csv');
  assert.equal(splitAddr('o/r@br:data/rows.csv#item=2').path, 'data/rows.csv');
});

test('anything that is not an address reads as null rather than half-parsing', () => {
  assert.equal(splitAddr('not-an-address'), null);
  assert.equal(splitAddr('owner/repo'), null, 'no path is no address');
  assert.equal(splitAddr(''), null);
  assert.equal(splitAddr(null), null);
});

test('a routed toss leaves the FILE as the subject, with the app as via', async () => {
  const h = harness();
  await h.showRoute('data', 'mehrlander/home:CLAUDE.md');

  // The address that was fetched is still the renderer, carrying the envelope.
  assert.equal(h.log.addresses[0],
    'mehrlander/web-tools@main:pages/data-view.html?src=mehrlander%2Fhome%3ACLAUDE.md');

  // Two stamps land, in this order, and the second is the one that stands.
  // Order is the whole contract: showAddress stamps on its way out, so a
  // re-stamp above it would be silently overwritten.
  assert.deepEqual(h.log.subjects.map(s => s.path),
    ['pages/data-view.html', 'CLAUDE.md']);
  assert.deepEqual(h.log.events, ['toss-subject', 'toss-subject'],
    'the drawer is told both times, so it re-adopts rather than keeping the first');
  assert.deepEqual(h.window.__tossSubject, {
    repo: 'mehrlander/home',
    ref: '',
    path: 'CLAUDE.md',
    route: 'data',
    via: { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' },
  });
  assert.equal(h.window.__tossFrame.id, 'the-frame', 'the frame still comes along');
});

test('a bare address keeps its empty ref, which the grammar reads as the default branch', async () => {
  const h = harness();
  await h.showRoute('data', 'mehrlander/home:CLAUDE.md');
  assert.equal(h.window.__tossSubject.ref, '',
    'stamping main here would name a branch that may not exist in that repo');

  const at = harness();
  await at.showRoute('data', 'mehrlander/web-tools@claude/a-b-c:tracker/board.md');
  assert.equal(at.window.__tossSubject.ref, 'claude/a-b-c');
  assert.equal(at.window.__tossSubject.via.ref, 'main', 'the app is read at its own ref');
});

test('the title names the file being read, not the app reading it', async () => {
  const h = harness();
  await h.showRoute('data', 'mehrlander/web-tools@claude/a-b-c:tracker/board.md');
  assert.equal(h.log.titles.pop(), 'Toss · board.md @ claude/a-b-c');
});

test('a trailing frag is the renderer\'s, and never reaches the subject path', async () => {
  const h = harness();
  await h.showRoute('data', 'mehrlander/home:data/rows.csv#item=2');
  assert.match(h.log.addresses[0], /#item=2$/, 'the frag rides the address');
  assert.equal(h.window.__tossSubject.path, 'data/rows.csv', 'and not the subject');
  assert.equal(await h.link()(), 'https://mehrlander.github.io/web-tools/pages/toss-render.html' +
    '#data=mehrlander/home:data/rows.csv#item=2',
    'copy-toss-link re-emits the pretty route form, not the resolved #gh=');
});

test('an unknown route says so and stamps nothing', async () => {
  const h = harness();
  await h.showRoute('nope', 'mehrlander/home:CLAUDE.md');
  assert.match(h.log.empty[0], /Unknown toss route: nope/);
  assert.equal(h.window.__tossSubject, undefined);
  assert.deepEqual(h.log.events, [], 'nothing was mounted, so nothing is announced');
});

test('a failed fetch leaves no subject rather than a file that never rendered', async () => {
  const h = harness({ fail: true });
  await h.showRoute('data', 'mehrlander/home:CLAUDE.md');
  assert.equal(h.window.__tossSubject, null,
    'the re-stamp must not invent a subject showAddress declined to mount');
  assert.deepEqual(h.log.titles, [], 'and the tab is not retitled for it either');
});
