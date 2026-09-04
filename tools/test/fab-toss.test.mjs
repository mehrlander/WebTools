// fab-toss.test.mjs — the fab's singleton guard, toss-subject adoption, and
// the render tab's branch classification (task 0003). The toss-render side
// (stamping __fabHosted / __tossSubject into rendered HTML) is exercised by
// its own page; these tests cover the fab's half of the contract.
//
// One shared window + Alpine start (the bootstrap pattern); per-scenario fabs
// mount via Alpine.initTree, which runs the same init() a page load would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, startAlpine, tick, repoRoot } from './bootstrap.mjs';

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="f" x-data="fab()" data-repo="mehrlander/web-tools" data-path="pages/toss-render.html"></div>
  </body></html>`,
});
const Alpine = await startAlpine(window, ['lib/kits/guide-render.js', 'lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js']);
const doc = window.document;

// Mount a fresh fab under the current window globals and hand back its $data.
async function mountFab(attrs = '') {
  const host = doc.createElement('div');
  host.innerHTML = `<div x-data="fab()" ${attrs}></div>`;
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  return { el: host.firstElementChild, host };
}

test('normal mount renders and keeps shell identity', () => {
  const el = doc.getElementById('f');
  assert.ok(el.children.length > 0, 'template renders');
  const d = Alpine.$data(el);
  assert.equal(d.hosted, false);
  assert.equal(d.viaToss, false);
  assert.equal(d.repo, 'mehrlander/web-tools');
  assert.equal(d.shellRepo, 'mehrlander/web-tools');
});

test('singleton guard: __fabHosted suppresses the mount', async () => {
  window.__fabHosted = true;
  try {
    const { el } = await mountFab();
    assert.equal(el.children.length, 0, 'template must not render under a host');
    assert.equal(Alpine.$data(el).hosted, true);
  } finally {
    delete window.__fabHosted;
  }
});

test('adopts a pre-stamped toss subject at init, restores on clear, re-adopts on event', async () => {
  window.__tossSubject = { repo: 'mehrlander/other', ref: 'feature-x', path: 'pages/thing.html' };
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/toss-render.html"');
  const d = Alpine.$data(el);

  assert.equal(d.viaToss, true);
  assert.equal(d.repo, 'mehrlander/other');
  assert.equal(d.path, 'pages/thing.html');
  assert.equal(d.ref, 'feature-x');
  assert.equal(d.frameRef, 'feature-x');
  // Shell identity survives for the Components/Scripts link targets.
  assert.equal(d.shellRepo, 'mehrlander/web-tools');
  assert.match(d.scriptUrl('kits/console.js'), /mehrlander\/web-tools\/blob\/main\/kits\/console\.js$/);
  // Inside a toss the fab IS the toss tab, so no open-in-toss link.
  assert.equal(d.tossUrl, '');

  // Clear (an inline #gz= render, or back to the panel): shell identity returns.
  window.__tossSubject = null;
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();
  assert.equal(d.viaToss, false);
  assert.equal(d.repo, 'mehrlander/web-tools');
  assert.equal(d.path, 'pages/toss-render.html');
  assert.equal(d.frameRef, 'main');

  // A later address render re-stamps and re-fires.
  window.__tossSubject = { repo: 'mehrlander/other', ref: 'feature-y', path: 'pages/thing.html' };
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();
  assert.equal(d.viaToss, true);
  assert.equal(d.frameRef, 'feature-y');
  window.__tossSubject = null;
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();
});

test('a local subject is a toss with no repo: the frame is kept, the repo claims are dropped', async () => {
  // What toss-render stamps for a pasted clipboard payload. The drawer used to
  // take the RENDERER's address as the subject and report that you were
  // looking at web-tools@main:pages/data-view.html while you were looking at
  // your clipboard. A paste has no address to re-stamp with, so it stamps
  // `local` and the drawer answers with what it actually knows.
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/toss-render.html"');
  const d = Alpine.$data(el);

  window.__tossSubject = { local: true, label: 'Clipboard', path: '', route: 'data',
                           via: { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' } };
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();

  // It IS a toss: the take actions and Inspect reach into the frame, and that
  // is exactly what viaToss gates.
  assert.equal(d.viaToss, true);
  assert.equal(d.subjectLocal, true);
  // And it claims nothing about a repo file.
  assert.equal(d.repo, '');
  assert.equal(d.path, '');
  assert.equal(d.subjectLabel, 'Clipboard');
  assert.equal(d.subjectVia.path, 'pages/data-view.html');
  // Shell identity is still there for the script links, as in any toss.
  assert.equal(d.shellRepo, 'mehrlander/web-tools');

  // Clearing restores the shell, and leaves no local flag behind to make the
  // next real subject read as one.
  window.__tossSubject = null;
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();
  assert.equal(d.viaToss, false);
  assert.equal(d.subjectLocal, false);
  assert.equal(d.subjectLabel, '');
  assert.equal(d.repo, 'mehrlander/web-tools');
});

test('classifyRows: statuses and ordering (baseline, differs desc, unknown, same, missing)', () => {
  const d = Alpine.$data(doc.getElementById('f'));

  const rows = d.classifyRows([
    { name: 'b-missing',  date: '2026-07-05', fileOid: null },
    { name: 'b-diff-old', date: '2026-07-03', fileOid: 'B' },
    { name: 'main',       date: '2026-07-01', fileOid: 'A' },
    { name: 'b-same',     date: '2026-07-02', fileOid: 'A' },
    { name: 'b-diff-new', date: '2026-07-04', fileOid: 'C' },
  ], 'main', 'A');
  assert.deepEqual(rows.map(r => r.name),
    ['main', 'b-diff-new', 'b-diff-old', 'b-same', 'b-missing']);
  assert.deepEqual(rows.map(r => r.status),
    ['baseline', 'differs', 'differs', 'same', 'missing']);

  // Rows with no fileOid key at all (the degraded no-token path) are 'unknown'.
  const unknowns = d.classifyRows([
    { name: 'main', date: '2026-07-01' },
    { name: 'b',    date: '2026-07-02' },
  ], 'main', null);
  assert.deepEqual(unknowns.map(r => r.status), ['baseline', 'unknown']);
});

test('renderAtRef in a toss re-addresses the shell instead of opening the overlay', async () => {
  window.__tossSubject = { repo: 'mehrlander/other', ref: 'feature-x', path: 'pages/thing.html' };
  const calls = [];
  window.__tossNavigate = addr => calls.push(addr);
  const { el } = await mountFab();
  const d = Alpine.$data(el);

  d.pickFrameRef('feature-z');
  d.renderAtRef();
  assert.deepEqual(calls, ['mehrlander/other@feature-z:pages/thing.html'],
    're-addresses in place via __tossNavigate (no bespoke overlay)');
  window.__tossSubject = null;
  delete window.__tossNavigate;
});

test('mode getters: a toss reads as off-canonical, marks the subject ref', async () => {
  window.__tossSubject = { repo: 'mehrlander/other', ref: 'feature-x', path: 'pages/thing.html' };
  const { el } = await mountFab();
  const d = Alpine.$data(el);
  assert.equal(d.offRef, true, 'a toss is off-canonical');
  assert.equal(d.previewRef, 'feature-x', 'previewRef is the adopted subject ref');
  assert.equal(d.viewingRef, 'feature-x', 'viewingRef marks the ref being rendered');
  assert.equal(d.canonicalUrl(),
    'https://mehrlander.github.io/other/pages/thing.html', 'canonical deployed URL for the subject');

  // Clearing the subject drops back to the live shell: not off-canonical.
  window.__tossSubject = null;
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();
  assert.equal(d.offRef, false, 'the live shell is not a preview');
  assert.equal(d.previewRef, null);
});

test('a toss at the default branch is not a preview', async () => {
  // The ref is the question, not the mechanism: a toss rendering main shows
  // main's code, so the launcher stays neutral and the "return to main" escape
  // banner stays hidden. viewingRef still names main, so the branch list can
  // mark that row "current".
  window.__tossSubject = { repo: 'mehrlander/other', ref: 'main', path: 'pages/thing.html' };
  const { el } = await mountFab();
  const d = Alpine.$data(el);
  assert.equal(d.previewRef, null, 'main is not a preview ref');
  assert.equal(d.offRef, false, 'a toss at main reads as canonical');
  assert.equal(d.viewingRef, 'main', 'the branch list still marks main current');

  // A repo whose default branch is not main: that branch is the canonical one,
  // and main (if it exists at all) is the off-canonical ref.
  d.defaultBranch = 'master';
  assert.equal(d.offRef, true, 'main is off-canonical where master is the default');
  assert.equal(d.previewRef, 'main');

  window.__tossSubject = { repo: 'mehrlander/other', ref: 'master', path: 'pages/thing.html' };
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();
  // Adoption resets defaultBranch to the 'main' guess (the previous repo's
  // 'master' must not carry over), so an unscanned master reads as a preview
  // until loadPageBranches corrects it.
  assert.equal(d.defaultBranch, 'main', 'adoption drops the previous repo default');
  d.defaultBranch = 'master';
  assert.equal(d.offRef, false, 'once scanned, the real default reads as canonical');

  window.__tossSubject = null;
  window.dispatchEvent(new window.CustomEvent('toss-subject'));
  await tick();
});

test('the width bar is reachable through a frame, or an address that can make one', async () => {
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/index.html"');
  const d = Alpine.$data(el);
  assert.equal(d.frameWidth, 0, 'a page starts at the width it actually has');
  assert.ok(d.tossUrl, 'an owner page has an address the renderer will serve');
  assert.equal(d.widthReachable, true);

  // A repo the renderer does not serve has no way into a frame, so the bar is
  // absent rather than present and dead.
  d.repo = 'someone-else/repo';
  assert.equal(d.tossUrl, '');
  assert.equal(d.widthReachable, false);

  // And a shell holding the lever is reachable even before it has a subject:
  // the frame is there, and a width set now is the width the next render
  // arrives at.
  window.__tossWidth = () => 0;
  try { assert.equal(d.widthReachable, true, 'the lever, not viaToss, is the test'); }
  finally { delete window.__tossWidth; }
});

test('off the renderer, a preset addresses it with ?w= on the query', async () => {
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/index.html"');
  const d = Alpine.$data(el);
  const base = 'https://mehrlander.github.io/web-tools/pages/toss-render.html';
  const addr = '#gh=mehrlander/web-tools@main:pages/index.html';
  assert.equal(d.tossUrl, base + addr);
  // ?w= belongs to the RENDERER, so it sits before the fragment: inside the
  // #gh= address it would be read as part of the page's own query and handed
  // to the page, which is not what asked for it.
  assert.equal(d.widthUrl(390), base + '?w=390' + addr);
  assert.equal(d.widthUrl(0), base + addr, 'actual carries no ?w= at all, rather than w=0');

  d.repo = 'someone-else/repo';
  assert.equal(d.widthUrl(390), '', 'no address the renderer serves, no width link');
});

test('on the renderer, a preset moves the frame in place', async () => {
  const calls = [];
  // The shell's lever, standing in for toss-render's: it floors and clamps, and
  // the fab takes what it returns rather than what it asked for.
  window.__tossWidth = w => { calls.push(w); return w ? Math.max(240, w) : 0; };
  window.__tossWidthNow = 820;
  try {
    const { el } = await mountFab();
    const d = Alpine.$data(el);
    assert.equal(d.frameWidth, 820, 'a width the shell booted with is read, not re-asserted');
    d.setWidth(100);
    assert.deepEqual(calls, [100]);
    assert.equal(d.frameWidth, 240, 'the bar reports what was applied');
    d.setWidth(240);
    assert.deepEqual(calls, [100], 'asking for the width already applied is not a call');
  } finally {
    delete window.__tossWidth;
    delete window.__tossWidthNow;
  }
});

test('no startup warnings or errors', () => {
  assert.deepEqual(problems, []);
});


// ── an IN-DOCUMENT subject ──────────────────────────────────────────────────
//
// The subject channel was built for toss-render, where the thing being
// described lives in a frame. From 2026-08-14 the file deck announces on the
// same channel, and its subject is in THIS document: a slide, not a frame. The
// distinction matters wherever the fab reaches INTO the subject, and until now
// `viaToss` stood in for it, because a frame was the only way a subject ever
// arrived.

test('a deck subject retargets the drawer without pretending to be a frame', async () => {
  window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'claude/some-branch',
                           path: 'docs/SNAGS.md', route: 'deck' };
  window.__tossFrame = null;
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="app/index.html"');
  const d = Alpine.$data(el);
  try {
    assert.equal(d.repo, 'mehrlander/web-tools');
    assert.equal(d.path, 'docs/SNAGS.md', 'the drawer names the file the reader is on');
    assert.equal(d.ref, 'claude/some-branch', 'at the ref the deck is reading it');
    assert.equal(d.subjectRoute, 'deck');
    assert.equal(d.subjectFramed, false, 'there is no frame, and nothing should look for one');
    // The annotator is NOT blind: the slide is in this document, so a note
    // lands on the thing being described. `viaToss && !subjectReached` used to
    // say otherwise, which is the bug this flag exists to fix.
    assert.equal(d.annBlind, false);
    // And the fab fills in the app, since it recorded its own page before any
    // subject arrived and the announcer should not have to know what it is
    // inside of.
    assert.equal(d.subjectVia.path, 'app/index.html');
  } finally {
    window.__tossSubject = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
  }
});

test('a framed subject still reads as framed', async () => {
  window.__tossSubject = { repo: 'mehrlander/other', ref: 'main', path: 'pages/thing.html' };
  window.__tossFrame = { contentWindow: null };
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/toss-render.html"');
  const d = Alpine.$data(el);
  try {
    assert.equal(d.subjectFramed, true);
    assert.equal(d.annBlind, true, 'a frame not yet reached is exactly what the warning is for');
  } finally {
    window.__tossSubject = null; window.__tossFrame = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
  }
});


// ── what a swipe costs the drawer ───────────────────────────────────────────
//
// A toss re-addresses rarely and changes everything when it does, so adoption
// used to drop the lot. A file deck announces on EVERY SWIPE and changes only
// the path. Dropping the lot there re-ran the whole branch scan per swipe and
// re-parsed the guide body, which is what made the drawer visibly reload while
// the reader was moving between files (reported 2026-08-14). The invalidation
// now splits by what each thing is keyed on.

const announce = (win, s) => {
  win.__tossSubject = s;
  win.dispatchEvent(new win.CustomEvent('toss-subject'));
};

test('a swipe keeps the guide and drops only the per-file scan', async () => {
  window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'claude/b',
                           path: 'docs/one.md', route: 'deck' };
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="app/index.html"');
  const d = Alpine.$data(el);
  try {
    // Stand in for a scan and a guide that have already landed.
    d.prBodyHtml = '<p>the guide</p>'; d.prBodyFor = '411';
    d.pageBranches = [{ name: 'claude/b' }]; d.pageBranchesLoaded = true;
    d.ver = { sha: 'abc' }; d.verLoaded = true; d.defaultBranch = 'main';

    announce(window, { repo: 'mehrlander/web-tools', ref: 'claude/b',
                       path: 'docs/two.md', route: 'deck' });
    await tick(2);
    assert.equal(d.path, 'docs/two.md', 'the drawer followed the swipe');
    assert.equal(d.prBodyFor, '411', 'and did not throw away a guide belonging to the same ref');
    assert.equal(d.prBodyHtml, '<p>the guide</p>');
    assert.equal(d.verLoaded, true, 'nor the version chip, which is the ref\'s too');
    assert.equal(d.defaultBranch, 'main', 'nor the repo\'s default branch');
    assert.equal(d.pageBranchesLoaded, false,
      'but the scan is the one genuinely per-file answer, so it reloads');

    // A ref change is the other case and still drops everything.
    d.prBodyFor = '411'; d.verLoaded = true;
    announce(window, { repo: 'mehrlander/web-tools', ref: 'claude/other',
                       path: 'docs/two.md', route: 'deck' });
    await tick(2);
    assert.equal(d.prBodyFor, null, 'a different ref is a different guide');
    assert.equal(d.verLoaded, false);
  } finally {
    window.__tossSubject = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
  }
});

test('ahead/behind is remembered per branch pair, not re-asked per file', async () => {
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/p.html"');
  const d = Alpine.$data(el);
  let compares = 0;
  const gh = { compare: async () => { compares++; return { ahead_by: 3, behind_by: 1 }; } };
  d.defaultBranch = 'main';

  d.pageBranches = [{ name: 'claude/b', status: 'preview' }];
  await d.loadDivergence(gh);
  assert.equal(compares, 1);
  assert.equal(d.pageBranches[0].div.ahead, 3);

  // The scan reloads on the next swipe and hands back FRESH row objects, so
  // without the memo every one of them is a fresh compare for an answer that
  // cannot have changed: ahead/behind belongs to the branch pair, not the file.
  d.pageBranches = [{ name: 'claude/b', status: 'preview' }];
  await d.loadDivergence(gh);
  assert.equal(compares, 1, 'no second call');
  assert.equal(d.pageBranches[0].div.ahead, 3, 'and the row still gets its answer');
});


test('the scan is remembered per path, so swiping back is free', async () => {
  // The browser harness cannot reach this: without a token every branch read
  // fails and nothing is ever cached, which is why it is asserted here instead.
  const seen = [];
  const realGH = window.GH;
  window.GH = class {
    constructor(c = {}) { this.repo = c.repo || ''; }
    async branchesForPath(path) {
      seen.push(path);
      return { defaultBranch: 'main', defaultOid: 'oid0',
               branches: [{ name: 'claude/b', oid: 'oid1', date: '', ago: '' }] };
    }
    async compare() { return { ahead_by: 1, behind_by: 0 }; }
    async branches() { return []; }
    async req() { return []; }
  };
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="docs/one.md"');
  const d = Alpine.$data(el);
  try {
    await d.loadPageBranches();
    assert.deepEqual(seen, ['docs/one.md']);

    // A swipe: new path, scan invalidated, one more read.
    d.path = 'docs/two.md'; d.pageBranchesLoaded = false;
    await d.loadPageBranches();
    assert.deepEqual(seen, ['docs/one.md', 'docs/two.md']);

    // And a swipe BACK, which a deck gets constantly. Four files along and
    // four back was eight scans for four answers.
    d.path = 'docs/one.md'; d.pageBranchesLoaded = false;
    await d.loadPageBranches();
    assert.deepEqual(seen, ['docs/one.md', 'docs/two.md'], 'no third read');
    assert.equal(d.pageBranches.length, 1, 'and the rows still arrive');

    // Recheck is the reader saying they do not believe it, so it clears.
    await d.loadPageBranches(true);
    assert.equal(seen.length, 3, 'force re-asks');
  } finally { window.GH = realGH; }
});


// ── the scope collision, for the third time ─────────────────────────────────
//
// Alpine evaluates an x-data EXPRESSION under with(scope), where scope is a
// proxy carrying every registered component name. This repo registers one
// called `repo` (alpineComponents/repo.js), so any callback built in such an
// expression and invoked bare runs with `this` bound to that proxy, and a
// method reading `this.repo` gets the data-provider FUNCTION rather than the
// string. The path picker's roots callback did exactly that and died on
// "repo.split is not a function" behind an empty Repos list, on every page with
// a fab, reported 2026-08-14 from a phone.
//
// cardOpts in alpineComponents/branch-brief.js and the mount note in
// kits/file-deck.js document the same collision on a bare identifier. This
// case pins the `this` form, which no amount of care at the call site catches.

test('the picker is handed a real component, not Alpine\'s scope proxy', async () => {
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/p.html"');
  const d = Alpine.$data(el);
  assert.ok(d.self, 'the component keeps a handle on itself for its own template');
  assert.equal(d.self.repo, d.repo);

  // What the collision looked like: the method invoked with `this` bound to
  // something whose `repo` is the registered component rather than a string.
  const proxy = { repo: Alpine.data ? function repoProvider() {} : null,
                  viewingRef: 'main', pickerGh: d.pickerGh, pickerRoots: d.pickerRoots };
  await assert.rejects(async () => { await proxy.pickerRoots(); }, /split is not a function/,
    'which is the failure the mount must not be able to reproduce');

  // And through the real handle it does not.
  const roots = await d.self.pickerRoots();
  assert.ok(Array.isArray(roots), 'the picker gets its roots');
  assert.equal(roots[0].repo, 'mehrlander/web-tools');
});

test('the drawer template carries no backtick, being a template literal', () => {
  // The first attempt at the fix above put backticks in a comment inside the
  // template, which ends the JS string and took the whole component out with a
  // SyntaxError at load. Cheap to assert, and it fails loudly rather than as a
  // blank page.
  const d = Alpine.$data(doc.getElementById('f'));
  assert.ok(typeof d.template === 'string' && d.template.length > 1000);
  assert.ok(!d.template.includes('\u0060'), 'no backtick survived into the template');
});


// ── the compare bar ─────────────────────────────────────────────────────────
//
// The sidebar already owned WHICH version. From 2026-08-14 it owns the second
// one too: a surface showing a file (the deck) announces what it is already
// comparing against, and the drawer turns that fact into a control. The whole
// coupling is two globals and two events, one per direction, which is why the
// cases here are about the payload and the invalidation rather than the UI.

test('the compare bar exists only for a subject that announced a base', async () => {
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/p.html"');
  const d = Alpine.$data(el);
  assert.equal(d.subjectBase, '', 'an ordinary page has no second version in play');
  assert.equal(d.comparePair, null);

  announce(window, { repo: 'mehrlander/web-tools', ref: 'claude/b', path: 'docs/one.md',
                     route: 'deck', base: 'abc123', baseName: 'main' });
  await tick(2);
  try {
    assert.equal(d.subjectBase, 'abc123', 'the sha is what a client fetches');
    assert.equal(d.compareName, 'main', 'and the name is what a reader is told');
    assert.equal(d.comparePair.base, 'abc123');
  } finally {
    window.__tossSubject = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
  }
});

test('picking, and turning it off, publish a pair the file surface can act on', async () => {
  window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'claude/b', path: 'docs/one.md',
                           route: 'deck', base: 'abc123', baseName: 'main' };
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="app/index.html"');
  const d = Alpine.$data(el);
  const heard = [];
  const on = (e) => heard.push(e.detail);
  window.addEventListener('web-tools:compare-ref', on);
  try {
    d.compareWith('claude/other');
    assert.equal(heard.length, 1);
    assert.equal(heard[0].base, 'claude/other');
    assert.equal(heard[0].ref, 'claude/b', 'addressed, so a card on another branch can decline it');
    assert.equal(heard[0].off, false);
    assert.equal(window.__compareRef.base, 'claude/other',
      'and left on the global for the next slide to mount');

    d.compareStop();
    assert.equal(heard[1].off, true, 'off is a field, not a null payload');
    assert.equal(d.comparePair, null);

    // '' is how the reader comes back to the announced base without having to
    // remember what it was.
    d.compareWith('');
    assert.equal(heard[2].base, 'abc123');
    assert.equal(heard[2].baseName, 'main');
  } finally {
    window.removeEventListener('web-tools:compare-ref', on);
    window.__tossSubject = null; window.__compareRef = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
  }
});

test('the comparison survives a swipe and not a change of branch', async () => {
  window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'claude/b', path: 'docs/one.md',
                           route: 'deck', base: 'abc123', baseName: 'main' };
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="app/index.html"');
  const d = Alpine.$data(el);
  try {
    d.compareWith('claude/other');
    announce(window, { repo: 'mehrlander/web-tools', ref: 'claude/b', path: 'docs/two.md',
                       route: 'deck', base: 'abc123', baseName: 'main' });
    await tick(2);
    assert.equal(d.compareRef, 'claude/other',
      'the pair is a property of the branch, not of the file being read');

    announce(window, { repo: 'mehrlander/web-tools', ref: 'claude/z', path: 'docs/two.md',
                       route: 'deck', base: 'def456', baseName: 'main' });
    await tick(2);
    assert.equal(d.compareRef, '', 'a different branch is a different comparison');
    assert.equal(d.subjectBase, 'def456');

    // And leaving the deck takes the choice with it rather than leaving a pair
    // on the global naming a branch nothing on screen is showing.
    window.__tossSubject = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
    await tick(2);
    assert.equal(d.subjectBase, '');
    assert.equal(window.__compareRef, null);
  } finally {
    window.__tossSubject = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
  }
});

test('a file is not offered as its own comparison', async () => {
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/p.html"');
  const d = Alpine.$data(el);
  d.pageBranches = [{ name: 'main', status: 'baseline' }, { name: 'claude/b', status: 'differs' }];
  d.showAllBranches = true;
  assert.equal(d.compareTargets.map(b => b.name).join(','), 'claude/b',
    'main is what this page is rendered at, and against itself there is nothing to show');
});


// ── the deck is re-addressed, not navigated away from ───────────────────────
//
// The ref bar's whole trip is "go to the renderer at this ref", which over a
// deck slide would leave the changeset the reader is in. kits/file-deck.js
// publishes __deckNavigate; this is the fab's half of that contract.

test('a ref pick over a deck slide is handed to the deck, not to the address bar', async () => {
  window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'claude/b', path: 'docs/one.md',
                           route: 'deck', base: 'abc123', baseName: 'main' };
  const { el } = await mountFab('data-repo="mehrlander/web-tools" data-path="app/index.html"');
  const d = Alpine.$data(el);
  const asked = [], went = [];
  d._go = (u) => went.push(u);
  window.__deckNavigate = (spec) => { asked.push(spec); return spec.path === 'docs/one.md'; };
  try {
    d.goTarget({ url: 'https://example.test/x', addr: 'mehrlander/web-tools@main:docs/one.md' });
    assert.equal(asked.length, 1);
    assert.equal(asked[0].ref, 'main', 'the address is split into the three pieces the deck needs');
    assert.equal(asked[0].path, 'docs/one.md');
    assert.equal(went.length, 0, 'and nothing navigated');

    // A file the deck does not hold is a real navigation after all, which is
    // what the handle's false answer is for.
    d.goTarget({ url: 'https://example.test/y', addr: 'mehrlander/web-tools@main:docs/other.md' });
    assert.equal(went.length, 1, 'the deck declined, so the trip happens');
  } finally {
    delete window.__deckNavigate;
    window.__tossSubject = null;
    window.dispatchEvent(new window.CustomEvent('toss-subject'));
  }
});

test('the address grammar splits three ways, and refuses what is not one', async () => {
  const d = Alpine.$data(doc.getElementById('f'));
  const a = d._addrParts('mehrlander/web-tools@claude/b:app/index.html');
  assert.equal(a.repo, 'mehrlander/web-tools');
  assert.equal(a.ref, 'claude/b', 'a slashed ref is the normal case here');
  assert.equal(a.path, 'app/index.html');
  assert.equal(d._addrParts('mehrlander/web-tools:README.md').ref, '',
    'no @ref means the default branch, which is a real answer');
  assert.equal(d._addrParts('nonsense'), null);
  assert.equal(d._addrParts(''), null);
});

// ── The fab loads what the fab mounts ───────────────────────────────────────
//
// THIS SUITE IS WHY THE BUG SURVIVED. startAlpine above hands path-picker.js
// into the window by hand, so the mount never threw here while the product
// never loaded it: gh-boot pairs fab and picker in FAB_BOOT, and every page
// that hand-loads the fab restates that pair from memory. Ten of the eleven
// that do dropped the picker, so opening the drawer threw "pathPicker is not
// defined" as an Alpine expression error and an uncaught page error, and on a
// phone the drawer read as a control that does nothing (reported 2026-09-04).
//
// So the assertion is on the SOURCE, not on this window: whatever a harness
// supplies, fab.js has to load every component it mounts, and the mount has to
// be deferred until that lands. Read from the file rather than the built
// bundle, since the bundle is a projection of it.
test('every component the fab mounts, the fab loads, and the mount waits for it', () => {
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/fab.js'), 'utf8');
  const tpl = src.slice(src.indexOf('template: `'), src.indexOf('\n      `,'));

  const mounted = [...new Set([...tpl.matchAll(/x-data="([a-zA-Z][a-zA-Z0-9]*)\(/g)].map(m => m[1]))];
  assert.ok(mounted.length, 'the template mounts at least one component');

  for (const name of mounted) {
    const file = 'alpineComponents/' + name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + '.js';
    assert.ok(src.includes("'" + file + "'"),
      `the fab mounts ${name} but never loads ${file}; a host that did not happen to `
      + 'load it gets "is not defined" the moment the drawer opens');
  }

  // x-show would not do: it hides a rendered element, and x-data is evaluated
  // the moment the element initialises. Only x-if defers the expression.
  const guard = tpl.indexOf('<template x-if="pickerReady">');
  assert.ok(guard > 0, 'the picker mount is gated on pickerReady');
  const inside = tpl.slice(guard, tpl.indexOf('</template>', guard));
  assert.match(inside, /x-data="pathPicker\(/,
    'the gate wraps the mount rather than sitting beside it');

  // And the flag is earned: set after the load resolves, never up front.
  assert.match(src, /ensurePicker\(\)\s*\{[\s\S]*?\.then\(\(\)\s*=>\s*\{\s*this\.pickerReady\s*=\s*true/,
    'pickerReady is set by the load, not declared ready');
  // Keyed to `open`, not to toggle(): the drawer body is built off the flag,
  // so anything that opens the drawer another way must get the picker too.
  assert.match(src, /\$watch\('open',[\s\S]{0,80}?ensurePicker\(\)/,
    'and the flag going true is what asks for it');
});
