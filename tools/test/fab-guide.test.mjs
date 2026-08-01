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
const Alpine = await startAlpine(window, ['lib/alpineComponents/fab.js']);
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
        '- [again](' + blob('claude/thing', 'pages/show-repo/show-repo.html') + ')',
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
  assert.equal(hrefs[3], blob('claude/thing', 'lib/fab.js'), 'a source link is left as source');
  assert.ok([...doc2.querySelectorAll('a')].every(a => a.getAttribute('target') === '_blank'));

  // The chip strip is the same set, deduped, renderable only. Spread first:
  // the component builds its arrays in the jsdom realm, so a bare deepEqual
  // against a literal here compares two different Array prototypes.
  assert.deepEqual([...d.prTargets].map(t => t.label), ['show-repo.html', 'show-repo.md']);

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
