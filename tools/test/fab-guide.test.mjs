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

const { window } = makeWindow({
  html: '<!doctype html><html><body></body></html>',
});
const Alpine = await startAlpine(window, ['lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js']);
const doc = window.document;

async function mountFab(attrs = 'data-repo="mehrlander/web-tools" data-path="pages/show-repo/show-repo.html"') {
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

  const page = d.openTarget(blob('claude/thing', 'pages/show-repo/show-repo.html'));
  assert.equal(page.kind, 'render');
  assert.equal(page.url, RENDERER + '#gh=mehrlander/web-tools@claude/thing:pages/show-repo/show-repo.html');
  assert.equal(page.label, 'show-repo.html');

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
        '- [new](' + blob('claude/thing', 'pages/show-repo/show-repo.html') + ')',
        '- [doc](' + blob('claude/thing', 'docs/show-repo.md') + ')',
        // A guide names each file at BOTH refs by convention ([new] and [main]),
        // which is what made the strip list every file twice.
        '- [main](' + blob('main', 'pages/show-repo/show-repo.html') + ')',
        '- [source](' + blob('claude/thing', 'lib/fab.js') + ')',
      ].join('\n'),
    },
  }];

  assert.equal(d.currentPr.number, 333, 'the guide follows the ref on display');

  await d.renderPrBody();
  await tick(2);

  // Every link opens away from the drawer, whether or not it was re-aimed.
  const doc2 = new window.DOMParser().parseFromString(d.prBodyHtml, 'text/html');
  const hrefs = [...doc2.querySelectorAll('a')].map(a => a.getAttribute('href'));
  assert.equal(hrefs[0], RENDERER + '#gh=mehrlander/web-tools@claude/thing:pages/show-repo/show-repo.html');
  assert.equal(hrefs[1], RENDERER + '#data=mehrlander/web-tools@claude/thing:docs/show-repo.md');
  assert.equal(hrefs[2], RENDERER + '#gh=mehrlander/web-tools@main:pages/show-repo/show-repo.html',
    'the prose re-aims both refs, since the sentence around each says which is which');
  assert.equal(hrefs[3], blob('claude/thing', 'lib/fab.js'), 'a source link is left as source');
  assert.ok([...doc2.querySelectorAll('a')].every(a => a.getAttribute('target') === '_blank'));

  // The strip is deduped BY FILE, not by URL: one row per file, at the ref on
  // display. Spread first, since the component builds its arrays in the jsdom
  // realm and a bare deepEqual would compare two Array prototypes.
  assert.deepEqual([...d.prTargets].map(t => t.label), ['show-repo.html', 'show-repo.md']);
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
  // The survey only ever finds the OPEN one, which is why the fuller list is a
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
    'https://github.com/mehrlander/web-tools/blob/claude/thing/pages/show-repo/show-repo.html');
  assert.equal(rows.find(r => r.key === 'fileCommits').url,
    'https://github.com/mehrlander/web-tools/commits/claude/thing/pages/show-repo/show-repo.html');

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

test('the path row is a picker, and a picked file is a request to render it', async () => {
  const d = await mountFab();
  d.viaToss = true;
  d.defaultBranch = 'main';
  d.ref = 'claude/thing';

  // The picker really mounts and gets its GH from the fab rather than from
  // Alpine's browser store.
  const picker = d._picker();
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

  // No token, no listing: the current repo alone, not an error.
  window.GH = class { constructor(o) { this.repo = o.repo; } async repos() { throw new Error('401'); } };
  assert.equal((await d.pickerRoots()).length, 1);

  assert.equal(d.pickerOpen, false);
  d.togglePicker();
  assert.equal(d.pickerOpen, true, 'the trigger owns the opener');
  assert.equal(d.ghMenu, false, 'and closes the other menu, since both drop from the same block');

  // Routing. A page at this repo goes through the toss the ref bar uses, so
  // the fab rides along; everything else opens beside the drawer.
  const opened = [];
  window.open = (u) => opened.push(u);
  d._handOffDrawer = () => {};

  assert.equal(d.renderTarget('mehrlander/web-tools', 'claude/thing', 'pages/a.html', true).kind, 'render');

  // The picker is allowed to be less careful than a link: a file it cannot
  // classify still opens, in the data view, because the viewer chose it.
  const js = d.renderTarget('mehrlander/web-tools', 'claude/thing', 'lib/fab.js', true);
  assert.equal(js.kind, 'read');
  assert.match(js.url, /#data=mehrlander\/web-tools@claude\/thing:lib\/fab\.js$/);
  // Without `any` it is the guide's conservative rule, unchanged.
  assert.equal(d.renderTarget('mehrlander/web-tools', 'claude/thing', 'lib/fab.js'), null);

  d.renderPicked({ repo: 'mehrlander/web-tools', ref: 'claude/thing', path: 'docs/x.md' });
  assert.match(opened.pop(), /#data=mehrlander\/web-tools@claude\/thing:docs\/x\.md$/);
  assert.equal(d.pickerOpen, false, 'picking closes the tree');
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

  const calls = [];
  d.renderAtRef = (r) => calls.push(['render', r]);
  d.returnToLive = () => calls.push(['live']);

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
