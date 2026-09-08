// fab-guide.test.mjs — the render tab as a guide rather than a list: the ref
// bar's dropdown navigates in one tap, and the body shows the branch's open PR
// with its links re-aimed at what can render them.
//
// The two things worth pinning:
//
// ONE TAP. The list this replaced selected a ref and then waited for a ✓, which
// is the shape of a destructive operation; this one changes a preview. So
// goToRef() must navigate, and picking the default branch must be the way out
// (returnToLive), not a toss at main.
//
// RE-AIMING. A guide body names its files as GitHub blob links, which is right
// on GitHub and wrong inside a preview drawer. openTarget() is the whole rule,
// and it has to be conservative: re-aiming a link that cannot be rendered would
// promise a view and deliver a 404, so anything it has no opinion about passes
// through untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, startAlpine, tick } from './bootstrap.mjs';

// Replace a method and record its calls. The assertion is the point: stubbing
// by plain assignment CREATES a missing method, so a test can pass against code
// that never had it. That is exactly how `_go` shipped broken, with these tests
// green: goTarget called this._go, only ref-switch defined it, and every tap on
// a picked file threw. Nothing may be stubbed here that does not already exist.
function spy(obj, name) {
  assert.equal(typeof obj[name], 'function', 'cannot stub ' + name + ': it does not exist');
  const calls = [];
  obj[name] = (...args) => { calls.push(args.length > 1 ? args : args[0]); };
  return calls;
}

const { window } = makeWindow({
  html: '<!doctype html><html><body></body></html>',
});
// kits/guide-render.js carries the link routing and the body render; the FAB
// binds to it and supplies what only it knows (its branch list, its viewing
// ref). It loads first here the way the page's gh.load chain arranges it.
const Alpine = await startAlpine(window, [
  'lib/kits/guide-render.js', 'lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js',
]);
const doc = window.document;

async function mountFab(attrs = 'data-repo="mehrlander/web-tools" data-path="app/index.html"') {
  const host = doc.createElement('div');
  host.innerHTML = `<div x-data="fab()" ${attrs}></div>`;
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  return Alpine.$data(host.firstElementChild);
}

const RENDERER = 'https://mehrlander.github.io/web-tools/pages/toss-render.html';
const blob = (ref, path) => 'https://github.com/mehrlander/web-tools/blob/' + ref + '/' + path;

test('openTarget re-aims what can be rendered and leaves everything else alone', async () => {
  const d = await mountFab();

  // The branch list is what disambiguates a slashed ref from a path.
  d.defaultBranch = 'main';
  d.pageBranches = [{ name: 'claude/thing' }, { name: 'claude/a-b-c' }];

  const page = d.openTarget(blob('claude/thing', 'app/index.html'));
  assert.equal(page.kind, 'render');
  assert.equal(page.url, RENDERER + '#gh=mehrlander/web-tools@claude/thing:app/index.html');
  assert.equal(page.label, 'index.html');

  const md = d.openTarget(blob('claude/thing', 'docs/show-repo.md'));
  assert.equal(md.kind, 'read');
  assert.equal(md.url, RENDERER + '#data=mehrlander/web-tools@claude/thing:docs/show-repo.md');
  assert.equal(md.label, 'show-repo.md');

  // Data files the viewer can actually open get the same treatment.
  assert.equal(d.openTarget(blob('main', 'a/b.csv')).kind, 'read');
  assert.equal(d.openTarget(blob('main', 'a/b.json')).kind, 'read');

  // A ref with a slash survives, since every session branch has one.
  assert.match(d.openTarget(blob('claude/a-b-c', 'p.html')).url, /@claude\/a-b-c:p\.html$/);

  // No opinion: source stays source, and a link that is not a blob link is not
  // a repo file at all.
  assert.equal(d.openTarget(blob('main', 'lib/fab.js')), null);
  assert.equal(d.openTarget('https://github.com/mehrlander/web-tools/pull/333/files'), null);
  assert.equal(d.openTarget('https://example.test/thing'), null);
  assert.equal(d.openTarget(''), null);
});

test('the guide renders the PR body, re-aims its links, and lifts the renderable ones out', async () => {
  const d = await mountFab();
  // marked, stubbed: the real one is a CDN asset and this is a browser-free
  // suite. Only the parse contract matters here (markdown in, html out).
  window.marked = { parse: (md) => md.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => '<a href="' + u + '">' + t + '</a>') };

  // viaToss is how a real preview reaches the drawer: the subject's ref is
  // adopted, and viewingRef follows it.
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.ref = 'claude/thing';
  d.pageBranches = [{
    name: 'claude/thing', status: 'differs',
    pr: {
      number: 333, draft: true, title: 'A thing',
      body: [
        'Lead sentence.',
        '- [new](' + blob('claude/thing', 'app/index.html') + ')',
        '- [doc](' + blob('claude/thing', 'docs/show-repo.md') + ')',
        // A guide names each file at BOTH refs by convention ([new] and [main]),
        // which is what made the strip list every file twice.
        '- [main](' + blob('main', 'app/index.html') + ')',
        '- [source](' + blob('claude/thing', 'lib/fab.js') + ')',
      ].join('\n'),
    },
  }];

  assert.equal(d.currentPr.number, 333, 'the guide follows the ref on display');

  await d.renderPrBody();
  await tick(2);

  // A re-aimed link renders in place; only what the drawer cannot render is
  // handed to a new tab.
  const doc2 = new window.DOMParser().parseFromString(d.prBodyHtml, 'text/html');
  const hrefs = [...doc2.querySelectorAll('a')].map(a => a.getAttribute('href'));
  assert.equal(hrefs[0], RENDERER + '#gh=mehrlander/web-tools@claude/thing:app/index.html');
  assert.equal(hrefs[1], RENDERER + '#data=mehrlander/web-tools@claude/thing:docs/show-repo.md');
  assert.equal(hrefs[2], RENDERER + '#gh=mehrlander/web-tools@main:app/index.html',
    'the prose re-aims both refs, since the sentence around each says which is which');
  assert.equal(hrefs[3], blob('claude/thing', 'lib/fab.js'), 'a source link is left as source');
  const links = [...doc2.querySelectorAll('a')];
  assert.deepEqual(links.map(a => a.getAttribute('target')), [null, null, null, '_blank'],
    'renderable links stay in place; the one that resolves nowhere opens away');
  assert.deepEqual(links.slice(0, 3).map(a => a.getAttribute('data-render-addr')), [
    'mehrlander/web-tools@claude/thing:app/index.html',
    'mehrlander/web-tools@claude/thing:docs/show-repo.md',
    'mehrlander/web-tools@main:app/index.html',
  ], 'each stamped with the address the delegated handler looks up');

  // A tap on one of them renders in place rather than following the href. The
  // whole point of the stamp: prose is x-html, so the links carry no bindings.
  const went = [];
  d.goTarget = t => went.push(t.addr);
  const ev = (hit) => ({ preventDefault() {}, target: { closest: () => hit } });
  d.onGuideClick(ev(links[1]));
  assert.deepEqual(went, ['mehrlander/web-tools@claude/thing:docs/show-repo.md']);
  d.onGuideClick(ev(null));
  assert.equal(went.length, 1, 'a tap on prose that is not a link does nothing');

  // The strip is deduped BY FILE, not by URL: one row per file, at the ref on
  // display. Spread first, since the component builds its arrays in the jsdom
  // realm and a bare deepEqual would compare two Array prototypes.
  assert.deepEqual([...d.prTargets].map(t => t.label), ['index.html', 'show-repo.md']);
  assert.equal(d.prTargets[0].ref, 'claude/thing', 'the ref on display wins the slot');

  // Rendering is keyed to the PR, so a second call is not a second parse.
  const before = d.prBodyHtml;
  await d.renderPrBody();
  assert.equal(d.prBodyHtml, before);
});

test('no PR is two different nothings, and neither is an error', async () => {
  const d = await mountFab();
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.pageBranches = [{ name: 'claude/orphan', status: 'differs' }];

  // On the default branch there is nothing missing: guides are written against it.
  d.ref = 'main';
  assert.equal(d.currentPr, null);
  assert.equal(d.viewingRef, 'main');

  // On a branch without an open PR, the branch page is the standing answer.
  d.ref = 'claude/orphan';
  assert.equal(d.currentPr, null);
  assert.equal(d.branchPageUrl,
    'https://mehrlander.github.io/web-tools/pages/branch.html#gh=mehrlander/web-tools@claude/orphan');

  await d.renderPrBody();
  assert.equal(d.prBodyHtml, '');
  assert.equal(d.prTargets.length, 0);
});

test('the arrows walk every PR the branch has had, newest first', async () => {
  const d = await mountFab();
  window.marked = { parse: (md) => '<p>' + md + '</p>' };
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.ref = 'claude/thing';
  // The scan only ever finds the OPEN one, which is why the fuller list is a
  // separate read: a merged PR is gone from that list and its body is often the
  // better account of what the branch did.
  d.pageBranches = [{ name: 'claude/thing', pr: { number: 333, title: 'open one', body: 'newer' } }];
  assert.equal(d.guideCount, 1, 'before the read, the open PR stands alone');

  window.GH = class {
    constructor(o) { this.repo = o.repo; }
    async req(p) {
      assert.match(p, /pulls\?state=all&head=mehrlander%3Aclaude%2Fthing/, 'asks for every state');
      return [
        { number: 332, title: 'the merged one', body: 'older', merged_at: '2026-07-31T00:00:00Z', state: 'closed' },
        { number: 333, title: 'open one', body: 'newer', draft: true, state: 'open' },
      ];
    }
  };
  await d.loadBranchPrs();
  await tick(2);

  assert.equal(d.guideCount, 2);
  assert.equal(d.guideIdx, 0);
  assert.equal(d.guidePr.number, 333, 'newest first');

  d.stepGuide(1);
  await tick(2);
  assert.equal(d.guidePr.number, 332);
  assert.equal(d.guidePr.state, 'merged', 'merged is not the same as closed');
  assert.match(d.prBodyHtml, /older/, 'the body follows the arrows');

  // The ends are ends: stepping past them is a no-op, not a wrap.
  d.stepGuide(1);
  assert.equal(d.guidePr.number, 332);
  d.stepGuide(-1); d.stepGuide(-1);
  assert.equal(d.guidePr.number, 333);
});

test('the github mark is a menu over the ref on display, with the file rows first', async () => {
  const d = await mountFab();
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.ref = 'claude/thing';
  delete window.GithubLinks;

  // Without github-links.js loaded the menu still stands up, because the rows
  // it cannot borrow are the ones it can build.
  let rows = d.ghRows;
  assert.deepEqual([...rows].map(r => r.key).slice(0, 2), ['file', 'fileCommits']);
  const file = rows.find(r => r.key === 'file');
  // Segment-wise encoding: a slashed branch has to survive as path segments.
  assert.equal(file.url,
    'https://github.com/mehrlander/web-tools/blob/claude/thing/app/index.html');
  assert.equal(rows.find(r => r.key === 'fileCommits').url,
    'https://github.com/mehrlander/web-tools/commits/claude/thing/app/index.html');

  // With it, the repo rows come from the one list show-repo's sidebar uses.
  window.GithubLinks = {
    rows: (repo, opts) => [{ key: 'home', label: 'Repository', icon: 'ph-house', url: 'X' + opts.ref }],
  };
  d.ghRowsTick++;
  rows = d.ghRows;
  assert.deepEqual([...rows].map(r => r.key), ['file', 'fileCommits', 'home']);
  assert.equal(rows[2].url, 'Xclaude/thing', 'the menu speaks about the ref on display');
  delete window.GithubLinks;
});

// The picker ARRIVES rather than being there: its mount is gated on
// pickerReady, which the fab sets after asking its loader for
// path-picker.js, so it lands a tick after `open` rather than with it.
// Waiting for it is the honest assertion; a fixed tick count would be a
// guess that goes stale the next time the gate moves.
async function awaitPicker(d, host) {
  for (let i = 0; i < 40; i++) {
    if (d._picker && d._picker()) return d._picker();
    if (host && host.querySelector('[x-data^="pathPicker"]')) return true;
    await tick(1);
  }
  return null;
}

test('the path row is a picker, and a picked file is a request to render it', async () => {
  const d = await mountFab();
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.ref = 'claude/thing';
  // The drawer's body is built on the first open (2026-09-02), the picker with it.
  d.open = true;
  await tick(3);

  // The picker really mounts and gets its GH from the fab rather than from
  // Alpine's browser store.
  const picker = await awaitPicker(d);
  assert.ok(picker, 'pathPicker mounted inside the render tab');

  // ROOTS: this repo at the ref on display, first and carrying its ref, then
  // every other repo the token can see, at their default branch.
  window.GH = class {
    constructor(o) { this.repo = o.repo; }
    async repos() { return [{ full_name: 'mehrlander/home' }, { full_name: 'mehrlander/web-tools' }]; }
  };
  const roots = await d.pickerRoots();
  assert.deepEqual([...roots].map(r => r.repo), ['mehrlander/web-tools', 'mehrlander/home'],
    'this repo leads, and is not repeated');
  assert.equal(roots[0].ref, 'claude/thing');
  assert.equal(roots[1].ref, '', 'another repo opens at its default branch');
  // The owner is dropped only because it matches this page's.
  assert.equal(roots[0].label, 'web-tools @ claude/thing');
  assert.equal(roots[1].label, 'home');

  // No token, no listing: the current repo alone, not an error.
  window.GH = class { constructor(o) { this.repo = o.repo; } async repos() { throw new Error('401'); } };
  assert.equal((await d.pickerRoots()).length, 1);

  assert.equal(d.pickerOpen, false);
  d.togglePicker();
  assert.equal(d.pickerOpen, true, 'the trigger owns the opener');
  assert.equal(d.ghMenu, false, 'and closes the other menu, since both drop from the same block');

  // Routing. A page at this repo goes through the toss the ref bar uses, so
  // the fab rides along; everything else opens beside the drawer.
  window.open = () => assert.fail('a pick must never spawn a tab');
  const handed = spy(d, '_handOffDrawer');
  const went = spy(d, '_go');
  d.open = true;

  assert.equal(d.renderTarget('mehrlander/web-tools', 'claude/thing', 'pages/a.html', true).kind, 'render');

  // The picker is allowed to be less careful than a link: a file it cannot
  // classify still opens, in the data view, because the viewer chose it. Every
  // module there declares its own coverage and `raw` always passes, so there is
  // no extension that resolves nowhere.
  const js = d.renderTarget('mehrlander/web-tools', 'claude/thing', 'lib/fab.js', true);
  assert.equal(js.kind, 'read');
  assert.equal(js.route, 'data');
  assert.match(js.url, /#data=mehrlander\/web-tools@claude\/thing:lib\/fab\.js$/);
  // Without `any` it is the guide's conservative rule, unchanged.
  assert.equal(d.renderTarget('mehrlander/web-tools', 'claude/thing', 'lib/fab.js'), null);

  // OUTSIDE A TOSS a pick navigates in place, the same gesture as a ref switch.
  d.renderPicked({ repo: 'mehrlander/web-tools', ref: 'claude/thing', path: 'docs/x.md' });
  assert.match(went.pop(), /#data=mehrlander\/web-tools@claude\/thing:docs\/x\.md$/);
  assert.equal(d.pickerOpen, false, 'picking closes the tree');
  // The DRAWER survives, the same as a ref switch: a pick is a step through a
  // list, and the list should still be there on the far side.
  assert.equal(handed.length, 1, 'a pick hands the drawer forward');

  // ACROSS REPOS the ref must not carry over: the picker's other roots have
  // none, and this page's branch does not exist in mehrlander/home, so
  // stamping it would address a 404 with nothing saying why. A bare repo:path
  // is the grammar's word for "the default branch".
  d.renderPicked({ repo: 'mehrlander/home', ref: '', path: 'README.md' });
  assert.match(went.pop(), /#data=mehrlander\/home:README\.md$/);
  assert.equal(d.renderTarget('mehrlander/home', '', 'p.html', true).url,
    RENDERER + '#gh=mehrlander/home:p.html');
  assert.match(d.renderTarget('mehrlander/home', '', 'p.html', true).title, /default branch/);
});

test('inside a toss a pick re-addresses in place, by page or by route', async () => {
  const d = await mountFab();
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.ref = 'claude/thing';

  const calls = [];
  const went = spy(d, '_go');
  spy(d, '_handOffDrawer');
  window.__tossNavigate = (a) => calls.push(['gh', a]);
  window.__tossRoute = (k, a) => calls.push([k, a]);
  try {
    // A page is an address the renderer already speaks.
    d.renderPicked({ repo: 'mehrlander/web-tools', ref: 'claude/thing', path: 'pages/a.html' });
    assert.deepEqual(calls.pop(), ['gh', 'mehrlander/web-tools@claude/thing:pages/a.html']);

    // Anything else goes through the route, whose map toss-render owns; the fab
    // names the key and never resolves it.
    d.renderPicked({ repo: 'mehrlander/web-tools', ref: 'claude/thing', path: 'lib/fab.js' });
    assert.deepEqual(calls.pop(), ['data', 'mehrlander/web-tools@claude/thing:lib/fab.js']);
    assert.equal(went.length, 0, 'no navigation happens inside a toss');

    // An older deployed shell has no __tossRoute. Falling through to a real
    // navigation is the difference between a slower path and a dead tap.
    delete window.__tossRoute;
    d.renderPicked({ repo: 'mehrlander/web-tools', ref: 'claude/thing', path: 'lib/fab.js' });
    assert.match(went.pop(), /#data=mehrlander\/web-tools@claude\/thing:lib\/fab\.js$/);

    // And that navigation stays on THIS renderer, keeping the ?use= pin. The
    // durable t.url is hardcoded at github.io, which would both drop the pin
    // (reverting a branch preview to the deployed shell on the first pick) and
    // hop origins, which an in-app browser does not reliably come back from.
    const t = d.renderTarget('mehrlander/web-tools', 'claude/thing', 'lib/fab.js', true);
    assert.equal(d.tossHref(t), t.url, 'off the renderer, the durable address is the answer');
    const back = window.location.pathname + window.location.search;
    try {
      window.history.replaceState(null, '', '/web-tools/pages/toss-render.html?use=claude/thing');
      const here = window.location.origin + '/web-tools/pages/toss-render.html?use=claude/thing';
      assert.equal(d.tossHref(t), here + '#data=mehrlander/web-tools@claude/thing:lib/fab.js');
      assert.equal(d.tossHref(d.renderTarget('mehrlander/home', '', 'p.html', true)),
        here + '#gh=mehrlander/home:p.html', 'a page keeps the #gh= key');
    } finally { window.history.replaceState(null, '', back); }
  } finally {
    delete window.__tossNavigate; delete window.__tossRoute;
  }
});

test('a real tap on the trigger opens the tree and leaves it open', async () => {
  // The bug this pins: path-picker closes itself on any click outside its own
  // root, and the trigger IS outside it, so the panel opened and shut inside
  // one tap and the control read as dead. Calling toggle() directly never saw
  // it, which is why this dispatches an actual click and lets it bubble.
  const host = doc.createElement('div');
  host.innerHTML = '<div x-data="fab()" data-repo="mehrlander/web-tools" data-path="pages/a.html"></div>';
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  const d = Alpine.$data(host.firstElementChild);
  d.open = true;            // the body, the trigger in it, is built on first open
  await tick(3);
  await awaitPicker(d, host);

  const trigger = host.querySelector('button[class*="group/id"]');
  assert.ok(trigger, 'the repo/path block is one trigger');

  trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(3);
  assert.equal(d.pickerOpen, true, 'the tap that opened it must not also close it');

  // The other half, that a click genuinely outside still closes it, is not
  // checkable here: Alpine's .outside handler skips elements it measures at
  // zero size, and jsdom measures everything at zero. What .stop changes is
  // only whether the click reaches document, so the passing assertion above is
  // the one that distinguishes the two behaviors.
});

test('the dropdown navigates in one tap, and the default branch is the way out', async () => {
  const d = await mountFab();
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.ref = 'claude/thing';

  const rendered = spy(d, 'renderAtRef'), lived = spy(d, 'returnToLive');
  const calls = { pop: () => rendered.length ? ['render', rendered.pop()] : (lived.pop(), ['live']),
                  get length() { return rendered.length + lived.length; } };

  d.refMenu = true;
  d.goToRef('claude/other');
  assert.deepEqual(calls.pop(), ['render', 'claude/other']);
  assert.equal(d.refMenu, false, 'picking closes the dropdown');

  // Not a toss at main: main is where the live page already is.
  d.goToRef('main');
  assert.deepEqual(calls.pop(), ['live']);

  // The row you are standing on is inert, so a stray tap is not a reload.
  d.goToRef('claude/thing');
  assert.equal(calls.length, 0);
});

// A repo that serves no Pages has no deployed page to escape TO, so the way out
// of a preview is this same view at the default branch. Before liveTwin the
// escape offered a github.io URL that 404s for every private repo in the
// estate, and once canonicalUrl came back empty it offered nothing at all: the
// button was there, warning-tinted, and did not move.

test('with no deployed twin, the way out is a re-address, not a github.io URL', async () => {
  const d = await mountFab('data-repo="mehrlander/home" data-path="projects/budget-drs/app/view/app.html"');
  d.viaToss = true;
  d.ref = 'claude/thing';
  await tick(1);
  d.defaultBranch = 'main';

  // Unasked reads as "assume yes", which is what every Pages-served page had
  // before the question existed.
  assert.equal(d.subjectPages, null);
  assert.equal(d.liveTwin, true);
  assert.equal(d.canonicalUrl(),
    'https://mehrlander.github.io/home/projects/budget-drs/app/view/app.html');

  d.subjectPages = false;
  assert.equal(d.liveTwin, false);
  assert.equal(d.canonicalUrl(), '', 'no twin, so no canonical URL to offer');

  const rendered = spy(d, 'renderAtRef');
  d.returnToLive();
  assert.deepEqual(rendered, ['main'], 'the escape re-addresses at the default branch');

  // The dropdown's default-branch row lands in the same place, which is the
  // point of routing both through one predicate instead of two copies of it.
  d.goToRef('main');
  assert.deepEqual(rendered, ['main', 'main']);
});

test('a subject with no page of its own has no twin, whatever its repo serves', async () => {
  const d = await mountFab();
  d.subjectPages = true;              // web-tools does serve Pages

  d.subjectRoute = 'data';
  assert.equal(d.liveTwin, false, 'a routed file is read through a renderer at every ref');
  assert.equal(d.canonicalUrl(), '');

  d.subjectRoute = '';
  d.subjectLocal = true;
  assert.equal(d.liveTwin, false, 'a paste has no repo behind it at all');
});

test('a routed subject is the FILE, and the app showing it stays named', async () => {
  const d = await mountFab();

  // What toss-render stamps for #data=mehrlander/home:CLAUDE.md: the envelope
  // is the subject and the renderer rides along as `via`. Before this, the
  // shell stamped the renderer, so the drawer over a markdown read reported
  // that you were looking at web-tools@main:pages/data-view.html.
  window.__tossSubject = {
    repo: 'mehrlander/home', ref: '', path: 'CLAUDE.md', route: 'data',
    via: { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' },
  };
  try {
    d.adoptSubject();
    await tick(2);
    assert.equal(d.repo, 'mehrlander/home', 'the identity is the file, not the viewer');
    assert.equal(d.path, 'CLAUDE.md');
    assert.equal(d.subjectRoute, 'data');

    // The take grid is the one place that must NOT follow the file: it reaches
    // into the frame's dom, and that dom is the renderer's.
    assert.equal(d.takePath, 'pages/data-view.html');
    assert.match(d.takeSubject, /^data-view\.html/);

    // Switching refs comes back through the same door. Straight to
    // __tossNavigate would hand the shell a .md to mount as a page.
    const calls = [];
    window.__tossNavigate = (a) => calls.push(['gh', a]);
    window.__tossRoute = (k, a) => calls.push([k, a]);
    try {
      d.defaultBranch = 'main';
      d.pageBranches = [{ name: 'wip', status: 'differs' }];
      d.goToRef('wip');
      assert.deepEqual(calls.pop(), ['data', 'mehrlander/home@wip:CLAUDE.md']);

      // And the default branch does not mean "leave for the live page": a
      // markdown file has none, and canonicalUrl would invent a 404.
      d.ref = 'wip';
      d.goToRef('main');
      assert.deepEqual(calls.pop(), ['data', 'mehrlander/home@main:CLAUDE.md']);
    } finally { delete window.__tossNavigate; delete window.__tossRoute; }
  } finally { window.__tossSubject = null; }

  // Dropping the subject clears both, or a later plain toss would keep
  // claiming to be shown through an app it no longer is.
  d.adoptSubject();
  assert.equal(d.subjectRoute, '');
  assert.equal(d.subjectVia, null);
  assert.equal(d.takePath, d.path);
});

test('under a route, every take label describes the document a take would get', async () => {
  const d = await mountFab();
  window.__tossSubject = {
    repo: 'mehrlander/home', ref: 'claude/thing', path: 'CLAUDE.md', route: 'data',
    via: { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' },
  };
  try {
    d.adoptSubject();
    await tick(2);
    // The take actions reach into the frame, and the frame holds the RENDERER.
    // The header already followed it; two rows still read from this.path and
    // this.ref, so a row could say "CLAUDE.md at claude/thing" over an action
    // that stages data-view.html at main. Mixed identity reads as considered,
    // which is worse than either answer on its own.
    assert.equal(d.takePath, 'pages/data-view.html');
    assert.equal(d.takeRef, 'main');
    const rows = d.takeGroups.flatMap(g => g.items);
    for (const r of rows) {
      assert.doesNotMatch(r.desc, /CLAUDE\.md/, r.key + ' names the file, not the document');
      assert.doesNotMatch(r.desc, /claude\/thing/, r.key + ' names the subject ref, not via');
    }
    assert.match(rows.find(r => r.key === 'stage').desc, /at main, on show-repo/);
    assert.match(rows.find(r => r.key === 'export').desc, /^data-view\.html/);
    assert.match(rows.find(r => r.key === 'render').desc, /data-view\.html/);
  } finally { window.__tossSubject = null; }

  // Unrouted, the two identities are the same one and nothing shifts.
  window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'br', path: 'pages/a.html' };
  try {
    d.adoptSubject();
    await tick(2);
    assert.equal(d.takePath, 'pages/a.html');
    assert.equal(d.takeRef, 'br');
    assert.match(d.takeGroups.flatMap(g => g.items).find(r => r.key === 'stage').desc,
      /a\.html at br/);
  } finally { window.__tossSubject = null; }
});

test('an old shell stamps only the app, so the fab reads the route off the address', async () => {
  // The deployed toss-render is main's, and the re-stamp that makes a routed
  // subject the FILE lives on this branch. So a #data= toss opened today hands
  // the fab pages/data-view.html and nothing else. The address always said
  // which file was asked for; the fab can read it, and a fab is lib, so ?use=
  // reaches this while the shell half waits to merge.
  const d = await mountFab();
  const back = window.location.hash;
  const at = (h) => window.history.replaceState(null, '', window.location.pathname + h);
  try {
    at('#data=mehrlander/home:CLAUDE.md');
    window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' };
    d.adoptSubject();
    await tick(2);
    assert.equal(d.repo, 'mehrlander/home');
    assert.equal(d.path, 'CLAUDE.md');
    assert.equal(d.subjectRoute, 'data');
    assert.deepEqual({ ...d.subjectVia },
      { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' });
    assert.equal(d.takePath, 'pages/data-view.html', 'the take still follows the frame');

    // A ?query and a trailing #frag are the renderer's, not part of the path.
    at('#data=mehrlander/home@br:data/rows.csv?view=table#item=2');
    d.adoptSubject();
    await tick(2);
    assert.equal(d.path, 'data/rows.csv');
    assert.equal(d.ref, 'br');

    // A PLAIN toss is not routed, and must not be mistaken for one. This is the
    // whole risk of reading the address: #gh= is a delivery mode, not a route.
    at('#gh=mehrlander/web-tools@br:pages/a.html');
    window.__tossSubject = { repo: 'mehrlander/web-tools', ref: 'br', path: 'pages/a.html' };
    d.adoptSubject();
    await tick(2);
    assert.equal(d.path, 'pages/a.html');
    assert.equal(d.subjectRoute, '', 'no route was involved');
    assert.equal(d.subjectVia, null);

    // Neither is a payload toss, whose fragment is base64 and parses as nothing.
    at('#gz=H4sIAAAAAAAA');
    d.adoptSubject();
    await tick(2);
    assert.equal(d.subjectRoute, '');

    // And a shell that DOES stamp the route wins: the fallback never runs, so
    // the two implementations cannot disagree once main carries the fix.
    at('#data=mehrlander/home:CLAUDE.md');
    window.__tossSubject = { repo: 'mehrlander/home', ref: 'wip', path: 'CLAUDE.md', route: 'data',
                             via: { repo: 'mehrlander/web-tools', ref: 'main', path: 'pages/data-view.html' } };
    d.adoptSubject();
    await tick(2);
    assert.equal(d.ref, 'wip', "the shell's ref stands, not the address's empty one");
  } finally {
    window.__tossSubject = null;
    at(back);
  }
});

// ── The guide reads on open without the branch scan (2026-09-02) ───────────
// Opening the drawer used to run branchesForPath (five GraphQL pages over
// 500-odd heads), then a compare per row and a session walk, and the guide
// waited for all of it behind two loading marks. It reads with cheap calls
// now, and the scan belongs to the dropdown.
test('opening the drawer reads the guide with cheap calls and leaves the scan to the dropdown', async () => {
  const realGH = window.GH;
  const asked = [];
  window.GH = class {
    constructor(o) { this.repo = o.repo; }
    async req(p) {
      asked.push(p);
      if (p.startsWith('/repos/')) return { default_branch: 'trunk', has_pages: true };
      if (p.startsWith('pulls?state=all')) return [{ number: 41, title: 'the guide', body: 'read me', state: 'open' }];
      if (p.startsWith('commits?path=')) return [{ sha: 'abcdef0123456789', html_url: 'https://x/c',
        commit: { message: 'touch the page\n\nmore', committer: { date: new Date().toISOString() } } }];
      if (p.startsWith('commits?sha=')) return [];
      return [];
    }
    async branchesForPath() { asked.push('SCAN'); return { defaultBranch: 'trunk', defaultOid: 'o', branches: [] }; }
    async branches() { asked.push('SCAN'); return []; }
  };
  try {
    const d = await mountFab('data-repo="mehrlander/web-tools" data-path="pages/a.html"');
    // Stand in a preview of another branch, the way a toss does; a name no
    // earlier test read, since branch-brief's read-through memo is per page.
    d.viaToss = true; d.ref = 'claude/fresh';
    d.activeTab = 'render';
    d.toggle();
    await tick(6);
    assert.ok(!asked.includes('SCAN'), 'no branch scan on open: ' + asked.join(' | '));
    assert.equal(d.viewingRef, 'claude/fresh');
    assert.ok(asked.some(p => p.startsWith('pulls?state=all')), 'the PR walk is read');
    assert.ok(asked.some(p => p.startsWith('commits?path=pages%2Fa.html')), 'and the file\'s last change on this ref');
    assert.equal(d.guidePr?.number, 41, 'the guide is up; asked=' + asked.join(' | ') + ' prsFor=' + d._prsFor + ' n=' + d.prHistory.length);
    assert.equal(d.guideBusy, false);
    assert.equal(d.defaultBranch, 'trunk', 'the default branch comes from the repo read, not the scan');
    assert.equal(d.pageLast?.sha, 'abcdef0', 'the page row names the commit');
    assert.equal(d.pageLast?.subject, 'touch the page', 'first line only');
    assert.equal(d.pageBranchesLoaded, false, 'the dropdown has not scanned');

    // Opening the dropdown is what scans.
    d.toggleRefMenu();
    await tick(4);
    assert.ok(asked.includes('SCAN'), 'the dropdown runs the scan');
  } finally { window.GH = realGH; }
});
