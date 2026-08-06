// kits/guide-render.js — a guide PR body rendered as something walkable.
//
// The kit was extracted from fab.js so the FAB drawer and pages/branch.html
// could not disagree about what a guide link means. These assertions pin the
// two behaviors that are easy to get subtly wrong and impossible to see wrong:
// the slashed-ref split (every session branch here is `claude/<slug>`, so a
// naive split produces a plausible address that 404s), and the chip strip's
// dedupe (a guide names each file three times by convention, and deduping on
// the wrong key produces a menu with every entry doubled).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { repoRoot } from './bootstrap.mjs';

const win = {};
new Function('window', readFileSync(path.join(repoRoot, 'lib/kits/guide-render.js'), 'utf8'))(win);
const G = win.GuideRender;

const dom = new JSDOM('<!doctype html><html><body></body></html>');
// A stand-in for marked: the kit's contract with it is parse(md) -> html, so a
// two-rule renderer is enough and keeps the suite off a CDN dependency.
const marked = {
  parse: (md) => md
    .split('\n\n')
    .map(p => '<p>' + p.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      (_, text, href) => '<a href="' + href + '">' + text + '</a>') + '</p>')
    .join('\n'),
};
const render = (md, opts) => G.render(md, { marked, DOMParser: dom.window.DOMParser, ...opts });

const BLOB = (ref, p) => 'https://github.com/mehrlander/web-tools/blob/' + ref + '/' + p;

// ── splitting a ref from a path ─────────────────────────────────────────────

test('a slashed branch splits on the known ref, not on the first slash', () => {
  const refs = ['main', 'claude/show-repo-progress-b8l63x'];
  assert.deepEqual(G.splitBlobRef('claude/show-repo-progress-b8l63x/lib/a.js', refs),
    { ref: 'claude/show-repo-progress-b8l63x', path: 'lib/a.js' });
  // Without the branch list there is no way to know, and the fallback is the
  // first segment: wrong here, right for a sha, a tag, or an unslashed branch.
  assert.deepEqual(G.splitBlobRef('claude/show-repo-progress-b8l63x/lib/a.js', []),
    { ref: 'claude', path: 'show-repo-progress-b8l63x/lib/a.js' });
  assert.deepEqual(G.splitBlobRef('main/lib/a.js', refs), { ref: 'main', path: 'lib/a.js' });
});

test('the longest matching ref wins, so a prefix branch cannot steal the split', () => {
  const refs = ['claude/x', 'claude/x-2'];
  assert.deepEqual(G.splitBlobRef('claude/x-2/lib/a.js', refs), { ref: 'claude/x-2', path: 'lib/a.js' });
});

// ── routing a file to what can show it ──────────────────────────────────────

test('a page routes to the toss, a data-ish file to the data view, source to nothing', () => {
  assert.equal(G.renderTarget('a/b', 'main', 'pages/x.html').kind, 'render');
  assert.match(G.renderTarget('a/b', 'main', 'pages/x.html').url, /#gh=a\/b@main:pages\/x\.html$/);
  assert.equal(G.renderTarget('a/b', 'main', 'docs/x.md').kind, 'read');
  assert.match(G.renderTarget('a/b', 'main', 'docs/x.md').url, /#data=a\/b@main:docs\/x\.md$/);
  assert.equal(G.renderTarget('a/b', 'main', 'lib/x.js'), null, 'source is the honest answer for source');
  // The picker is allowed to be less careful than a link: its user named the file.
  assert.equal(G.renderTarget('a/b', 'main', 'lib/x.js', true).kind, 'read');
});

test('a link that is not a blob URL passes through untouched', () => {
  assert.equal(G.openTarget('https://claude.ai/code/session_01', ['main']), null);
  assert.equal(G.openTarget('https://github.com/a/b/compare/main...x', ['main']), null);
  assert.equal(G.openTarget('', ['main']), null);
});

// ── rendering a body ────────────────────────────────────────────────────────

test('renderable links are re-aimed and stamped; the rest are sent away safely', () => {
  const md = '[new](' + BLOB('claude/x', 'pages/a.html') + ') and '
           + '[session](https://claude.ai/code/session_01)';
  const out = render(md, { knownRefs: ['main', 'claude/x'] });
  assert.match(out.html, /data-render-addr="mehrlander\/web-tools@claude\/x:pages\/a\.html"/);
  assert.match(out.html, /toss-render\.html#gh=/);
  // An external link keeps its href and gains the pair that makes a new tab safe.
  assert.match(out.html, /href="https:\/\/claude\.ai\/code\/session_01"[^>]*target="_blank"/);
  assert.match(out.html, /rel="noopener"/);
});

test('the chip strip dedupes by file, so the caption convention does not triple it', () => {
  // One file, named the way every guide names it: at the branch and at main.
  const md = '[new](' + BLOB('claude/x', 'pages/a.html') + '), '
           + '[main](' + BLOB('main', 'pages/a.html') + '), '
           + '[docs](' + BLOB('claude/x', 'docs/a.md') + ')';
  const out = render(md, { knownRefs: ['main', 'claude/x'], preferRef: 'claude/x' });
  assert.deepEqual(out.targets.map(t => t.path), ['pages/a.html', 'docs/a.md']);
  // The ref the reader is looking at wins the tie, since that is the version
  // the page is about.
  assert.equal(out.targets[0].ref, 'claude/x');
  // The prose keeps BOTH links re-aimed: there the sentence says which is which.
  assert.equal((out.html.match(/data-render-addr/g) || []).length, 3);
});

test('preferRef only breaks ties; without one the first link seen holds', () => {
  const md = '[main](' + BLOB('main', 'pages/a.html') + '), '
           + '[new](' + BLOB('claude/x', 'pages/a.html') + ')';
  const out = render(md, { knownRefs: ['main', 'claude/x'] });
  assert.equal(out.targets.length, 1);
  assert.equal(out.targets[0].ref, 'main');
});

test('an empty or unparseable body renders as nothing rather than throwing', () => {
  assert.deepEqual(render('', {}), { html: '', targets: [], byAddr: {} });
  assert.deepEqual(G.render('x', { marked, DOMParser: null }), { html: '', targets: [], byAddr: {} });
  const boom = { parse: () => { throw new Error('nope'); } };
  assert.deepEqual(G.render('x', { marked: boom, DOMParser: dom.window.DOMParser }),
    { html: '', targets: [], byAddr: {} });
});

test('byAddr indexes every re-aimed link, so a host can resolve an intercepted tap', () => {
  const md = '[a](' + BLOB('claude/x', 'pages/a.html') + ')';
  const out = render(md, { knownRefs: ['claude/x'] });
  const addr = 'mehrlander/web-tools@claude/x:pages/a.html';
  assert.equal(out.byAddr[addr].path, 'pages/a.html');
});
