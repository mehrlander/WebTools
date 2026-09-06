// The FAB's take grid says what a copy will be BEFORE it is taken, and the two
// claims that were wrong on 2026-09-05 are held here.
//
// The LLM row's gate was a path regex (`dist/web-tools.js|show-repo/`) that
// matched the app at its old address and nothing at its new one, so on
// app/index.html the row promised "42 modules as readable source" and copied
// 2.7MB. The gate is a token estimate now, read off gh-boot's byte ledger
// before anything is fetched, so the row can carry the size and refuse over
// the cap with the figure in the message.
//
// The HTML row on a page with no gh.load chain said "nothing to inline", and
// on the app that was a 428K file whose one import is ../dist/app.js: it
// renders nowhere else. renderCopy counts relative script references on a
// chainless page so the copy message can say so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot } from './bootstrap.mjs';

const PAGE = `<!doctype html><html><head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5">
  <script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/alpinejs@3.14.0"></script>
</head><body><div data-path="pages/x.html"></div></body></html>`;

const boot = () => {
  const { window } = makeWindow({ html: PAGE });
  window.gh = { repo: 'mehrlander/web-tools', ref: 'main' };
  window.eval(readFileSync(path.join(repoRoot, 'lib/kits/brief.js'), 'utf8'));
  window.eval(readFileSync(path.join(repoRoot, 'lib/kits/export.js'), 'utf8'));
  return window;
};

const scripts = (...paths) => paths.map(p => ({ path: p, status: 'ok' }));
const ledger = (sizes) => Object.fromEntries(Object.entries(sizes).map(([p, bytes]) => ['lib/' + p, { bytes }]));

test('brief.plan sizes the own modules off the ledger and stays under the cap on an ordinary page', () => {
  const w = boot();
  const p = w.brief.plan({
    scripts: scripts('gh-api.js', 'gh-boot.js', 'kits/url-params.js', 'kits/shorter-payload.js'),
    files: ledger({ 'gh-api.js': 18000, 'gh-boot.js': 24000, 'kits/url-params.js': 7300, 'kits/shorter-payload.js': 3600 }),
  });
  assert.equal(p.own.map(m => m.path).join(','), 'kits/url-params.js,kits/shorter-payload.js');
  assert.equal(p.bytes, 10900, 'the floor is not counted: it is excluded from the brief');
  assert.equal(p.tokens, Math.round(10900 / 4));
  assert.equal(p.wholeLib, false);
  assert.equal(p.cap, w.brief.BRIEF_CAP);
});

test('brief.plan refuses over the cap by size, not by path, and assemble names the figure', async () => {
  const w = boot();
  // 42 own modules at 60K each, the app's shape at its current address.
  const own = Array.from({ length: 42 }, (_, i) => 'alpineComponents/c' + i + '.js');
  const files = ledger(Object.fromEntries(own.map(p => [p, 60000])));
  const p = w.brief.plan({ path: 'app/index.html', scripts: scripts(...own), files });
  assert.equal(p.wholeLib, true, 'over the cap');
  assert.ok(p.tokens > w.brief.BRIEF_CAP);
  w.gh.get = async () => ({ text: '' });
  await assert.rejects(
    () => w.brief.assemble({ path: 'app/index.html', scripts: scripts(...own), files }),
    (e) => /~630K tokens, over the 120K cap/.test(e.message) && /Region/.test(e.message),
  );
  // The old gate: a page under the cap at a path the regex used to match is
  // no longer refused, since the refusal is about size.
  const small = w.brief.plan({ path: 'pages/show-repo/index.html', scripts: scripts('kits/csv.js'),
                               files: ledger({ 'kits/csv.js': 2000 }) });
  assert.equal(small.wholeLib, false);
});

test('a missing ledger estimates zero rather than throwing, so the row still renders', () => {
  const w = boot();
  delete w.__ghFiles;
  const p = w.brief.plan({ scripts: scripts('kits/csv.js') });
  assert.equal(p.tokens, 0);
  assert.equal(p.wholeLib, false);
});

test('exporter.relRefs counts what resolves only against the page\'s own location', () => {
  const w = boot();
  const app = `<script type="module">await import('../dist/app.js');</script>
    <script src="../lib/x.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/alpinejs"></script>
    <script src="data:text/javascript,1"></script>
    <script type="module">import { a } from './a.js'; await import(\`https://x/y.js\`);</script>`;
  assert.equal(w.exporter.relRefs(app), 3, 'the dist import, the lib script, the ./a.js import');
  assert.equal(w.exporter.relRefs('<script src="https://cdn.jsdelivr.net/npm/x"></script>'), 0);
});

test('renderCopy reports relative refs on a chainless page and none on a baked one', async () => {
  const w = boot();
  w.buildKit = {
    bakeable: (h) => /gh-api\.js/.test(h),
    collectCache: async () => ({ ghApiSrc: 'class GH {}', cache: {} }),
    emit: () => 'BUILD',
    bake: (h) => h.replace(/import\([^)]*\)/, 'import(window.__wtBuild)'),
  };
  w.gh.get = async (p) => ({ text: p === 'app/index.html'
    ? '<html><head><script type="module">await import("../dist/app.js");</script></head></html>'
    : '<html><head><script type="module">await import("https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/gh-api.js");</script></head></html>' });
  const chainless = await w.exporter.renderCopy({ path: 'app/index.html', scripts: [], reads: [] });
  assert.equal(chainless.chainless, true);
  assert.equal(chainless.relRefs, 1, 'the dist import is a relative reference');
  const baked = await w.exporter.renderCopy({ path: 'pages/y.html', scripts: [], reads: [] });
  assert.equal(baked.chainless, false);
  assert.equal(baked.relRefs, 0, 'a baked page has its import rewritten; nothing relative is left to count');
});
