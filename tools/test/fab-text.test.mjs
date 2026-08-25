// fab-text.test.mjs — the drawer's fifth tab: what the page SAYS, as against
// the four tabs about how it was delivered.
//
// Two subjects, and they fail in different ways.
//
//   THE STRIP. Five tabs of icon-plus-label do not fit a 22rem drawer on a
//   phone, so the label rides the selected tab alone. That rule is only safe
//   while the strip is data-driven and every key in it has a pane: a tab with
//   no pane is a dead button that says nothing, and under the active-label
//   rule it does not even carry a name to explain itself.
//
//   THE READ. The pane reports figures it must be able to stand behind, so
//   the honesty gates are the thing worth pinning, not the arithmetic. Two of
//   them have already been wrong once: the app discriminator started as chrome
//   share and inverted the pages it was meant to separate, and the app banner
//   started as x-show and threw on a null scan because x-show evaluates the
//   children it hides.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, startAlpine, tick, repoRoot } from './bootstrap.mjs';

// The template is a string in the component file, so the pane-coverage and
// x-if claims are read from the source rather than from the rendered tree:
// a pane only renders once its tab is opened, and the claim is about all five.
const SRC = readFileSync(path.join(repoRoot, 'lib/alpineComponents/fab.js'), 'utf8');

const { window } = makeWindow({
  html: `<!doctype html><html><body></body></html>`,
});
const doc = window.document;
const Alpine = await startAlpine(window, [
  // kits/csv.js first: Match's registry lane parses five CSV carriers through
  // it, the same way the pre-build's boot list supplies it on a real page.
  'lib/kits/csv.js',
  'lib/kits/guide-render.js', 'lib/alpineComponents/path-picker.js', 'lib/alpineComponents/fab.js',
]);

async function mountFab() {
  const host = doc.createElement('div');
  host.innerHTML = '<div x-data="fab()" data-repo="mehrlander/web-tools" data-path="pages/shorter.html"></div>';
  doc.body.appendChild(host);
  Alpine.initTree(host);
  await tick(3);
  return Alpine.$data(host.firstElementChild);
}

// A document to read: one paragraph of real sentences, in its own detached
// tree so the drawer's own markup never counts toward the figures.
const docWith = (html) => {
  const d = window.document.implementation.createHTMLDocument('probe');
  d.body.innerHTML = html;
  return d;
};

const PROSE = `<article><p>The estate has ten text instruments and every one of
  them runs somewhere other than the page you are reading. That is the gap this
  tab exists to close, and it is not a gap in capability.</p>
  <p>Nine of the ten take a corpus or a paste, so none of them takes this
  page.</p></article>`;

// Labels, the shape an app's text actually arrives in.
const APP = '<nav>' + Array.from({ length: 40 },
  (_, i) => `<button>tab ${i}</button><span>row ${i}</span>`).join('') + '</nav>';

test('the strip is data, and every tab in it has a pane', async () => {
  const d = await mountFab();
  // Joined rather than deep-compared: Alpine hands back a reactive Proxy, and
  // deepEqual checks the prototype before it checks the contents.
  const keys = [...d.TABS].map(t => t.key);
  assert.equal(keys.join(','), 'render,inspect,traffic,text',
    'reading order: delivery first, then what the page says (Notes was the fifth '
    + 'until it moved into the annotate card, kits/annotate.js)');

  // The pane list lives in the template, so read it from the source the
  // component was built from rather than from a second list here.
  for (const k of keys) {
    assert.ok(SRC.includes(`activeTab === '${k}'`),
      `tab ${k} has no pane: a tab with no pane is a dead button, and under the ` +
      'active-label rule it carries no name to explain itself');
  }

  // Every tab names an opening side effect that exists, since setTab calls it
  // by name and a typo would fail silently.
  for (const t of d.TABS) {
    assert.equal(typeof d[t.on], 'function', `${t.key}.on names no method: ${t.on}`);
  }
});

test('setTab switches the pane and runs the tab’s opener', async () => {
  const d = await mountFab();
  let ran = 0;
  d.textScan = function () { ran++; };
  d.setTab('text');
  assert.equal(d.activeTab, 'text');
  assert.equal(ran, 1, 'opening a tab runs its opener, once');
});

test('the strip’s one label names the selected tab, and is derived', async () => {
  const d = await mountFab();
  for (const t of [...d.TABS]) {
    d.activeTab = t.key;
    assert.equal(d.tabLabel, t.label, `the slot names ${t.key}`);
  }

  // A getter, not stored state. The label sits in its own slot away from the
  // buttons, so a copy that drifted would name one tab while another was
  // highlighted, and nothing on screen would resolve the disagreement.
  //
  // Asserted against the source, because the shape is not reachable at runtime:
  // Alpine's reactive proxy reports no descriptor for an accessor at all, own
  // or inherited, and Alpine.raw returns the same proxy through this harness.
  // So a runtime check here cannot tell a getter from a stored value, which is
  // exactly the distinction being made.
  assert.match(SRC, /get tabLabel\(\)/,
    'tabLabel must be derived from activeTab, not stored beside it');

  d.activeTab = 'nonesuch';
  assert.equal(d.tabLabel, '', 'an unknown tab empties the slot rather than throwing');
});

test('the read separates body prose from chrome, and counts runs', async () => {
  const d = await mountFab();
  const r = d._textRead(docWith(PROSE));

  assert.ok(r.words > 45 && r.words < 70, `unexpected word count: ${r.words}`);
  assert.equal(r.chrome, 0, 'prose in <p> is body, not chrome');
  assert.ok(r.sentences >= 3, `sentences: ${r.sentences}`);
  assert.equal(r.longest, 20, 'the longest sentence is reported in words');
  assert.match(r.longestText, /estate has ten text instruments/,
    'and carries its text, so the figure is checkable rather than asserted');
  assert.ok(r.minutes >= 1, 'reading time never rounds to zero');

  // The button and link text an app is made of is counted apart, so the word
  // row can carry a denominator instead of a bare number.
  const mixed = d._textRead(docWith(PROSE + '<button>Save</button><a href="#">Open</a>'));
  assert.equal(mixed.chrome, 2, 'button and link words land in chrome');
  assert.equal(mixed.words, r.words, 'and are kept out of the body count');
});

test('a block boundary ends a sentence; an inline element does not', async () => {
  const d = await mountFab();

  // The live failure this pins. A table's cells carry no terminal punctuation,
  // so joining every text run with a space ran the whole table together into
  // one pseudo-sentence, and "longest sentence" reported it. Seen on
  // docs/text-tools.md rendered through the data route.
  const table = d._textRead(docWith(
    `<table><tr><td>a path that resolves to a tracked file</td>
     <td>already cached per repo and ref</td></tr>
     <tr><td>a declared doc registry</td><td>whether it is living or measured</td></tr></table>`));
  assert.equal(table.longest, 8,
    'the longest cell, not every cell stitched together');
  assert.ok(table.sentences >= 4, `each cell counts once: ${table.sentences}`);

  // The other half, and the reason a newline between every run is not the fix:
  // an inline link or code span sits inside a sentence and must not break it.
  const inline = d._textRead(docWith(
    '<p>The loader contract lives in <code>docs/loader.md</code> and nothing else states it.</p>'));
  assert.equal(inline.sentences, 1, 'an inline element does not end a sentence');
  // 13, not 12: the word regex splits on / and . so a path counts as three
  // tokens. Left alone deliberately, since a path is about that much to read.
  assert.equal(inline.longest, 13);
  assert.match(inline.longestText, /^The loader contract lives in docs\/loader\.md and/,
    'the runs rejoin with a space, so the sentence reads as written');
});

test('the app gate reads words per run, which is the signal that separates', async () => {
  const d = await mountFab();
  const prose = d._textRead(docWith(PROSE));
  const app = d._textRead(docWith(APP));

  assert.ok(app.perRun < 6, `an app's text arrives as labels: ${app.perRun}`);
  assert.ok(prose.perRun >= 6, `prose arrives as sentences: ${prose.perRun}`);

  // The measurement that retired the first attempt. Chrome share put the most
  // document-like page in the estate at 2% and an app at 9%, inverting the
  // separation, so it must not be what the gate reads. A document with no
  // buttons at all has a chrome share of zero and is still a document.
  assert.equal(prose.chromeShare, 0);
  assert.ok(prose.perRun >= 6,
    'a zero chrome share must not be readable as evidence either way');
});

test('the prose checks ignore what is not prose', async () => {
  const d = await mountFab();

  const dashes = d._textRead(docWith('<p>One thing—then another—then a third.</p>'));
  assert.equal(dashes.dashes, 2, 'the house rule is zero em dashes, so they are counted');

  // A path already inside a link is not a bare path; that is the whole rule.
  // A path in a code span is a citation, not a reference, and is left alone.
  const paths = d._textRead(docWith(
    `<p>See docs/text-tools.md for the design.</p>
     <p>See <a href="#">docs/loader.md</a> and <code>lib/kits/annotate.js</code>.</p>`));
  assert.equal(paths.barePaths, 1,
    'only the path outside a link and outside code counts');

  // Narrow on purpose: the check reports candidates, and a false positive here
  // is a finding nobody can act on.
  const noise = d._textRead(docWith('<p>Pick one and/or the other, in docs, at 3.5 percent.</p>'));
  assert.equal(noise.barePaths, 0, '"and/or", a bare folder, and a decimal are not paths');
});

test('the read scopes to a live selection, and falls back to the page', async () => {
  const d = await mountFab();
  const host = doc.createElement('article');
  host.innerHTML = '<p id="a">First sentence here about nothing at all.</p>' +
                   '<p id="b">Second paragraph, which the selection will not cover.</p>';
  doc.body.appendChild(host);

  assert.equal(d.textRoot().scope, 'page', 'no selection means the whole page');

  const sel = window.getSelection();
  const range = doc.createRange();
  range.selectNodeContents(doc.getElementById('a'));
  sel.removeAllRanges(); sel.addRange(range);

  const scoped = d.textRoot();
  assert.equal(scoped.scope, 'selection');
  assert.match(scoped.root.textContent, /First sentence/);
  assert.doesNotMatch(scoped.root.textContent, /Second paragraph/,
    'the selection is the subject, not a highlighted part of the page');

  // THE TAP THAT OPENS THE DRAWER DESTROYS THE SELECTION. Pressing anywhere
  // outside a selection collapses it, and the launcher is outside every
  // selection by construction, so without a snapshot taken at pointerdown the
  // scope could never fire once: the only route to the tab clears its subject.
  // Found by shooting it, not by reading it.
  d._grabSelection();
  sel.collapseToStart();
  assert.equal(d.textRoot().scope, 'selection',
    'the snapshot survives the tap that opened the drawer');
  assert.match(d.textRoot().root.textContent, /First sentence/);

  // A caret is not a selection, so a snapshot taken with nothing selected must
  // clear the old one rather than resurrecting a passage the reader left.
  d._grabSelection();
  assert.equal(d.textRoot().scope, 'page', 'a collapsed selection is a caret, not a subject');

  sel.removeAllRanges();
  host.remove();
});

test('named paths include code spans; bare paths do not', async () => {
  const d = await mountFab();
  const r = d._textRead(docWith(
    `<p>See docs/text-tools.md for the design.</p>
     <p>It loads <code>lib/kits/annotate.js</code> and <a href="#">docs/loader.md</a>.</p>`));

  // The two answers disagree about the same tokens on purpose: a path in a
  // code span is a citation, so it breaks no rule, but it is still a file this
  // page is about and Match should resolve it.
  assert.equal(r.barePaths, 1, 'only the unlinked, uncoded path breaks the rule');
  // Joined, not deep-compared: fab.js runs inside the jsdom realm, so the
  // arrays it returns have jsdom's Array prototype and assert/strict's
  // deepEqual compares prototypes before contents.
  assert.equal([...r.named].join('|'),
    'docs/loader.md|docs/text-tools.md|lib/kits/annotate.js',
    'every path named anywhere is a candidate, sorted and deduplicated');
});

// The registry stubs, as the CSV text each carrier really holds, so the reader
// is exercised through its parser rather than around it. All five are CSV since
// 2026-08-18; the page catalog is keyed by `href` under a `pages/` prefix
// rather than by a full path, which is the one shape difference left.
const REG = {
  'docs/docs.csv':
    'path,subject,status\n' +
    'docs/loader.md,the loader contract,living\n' +
    'CLAUDE.md,the repo instructions,living\n',
  'docs/tests.csv':
    'path,protects,kind\n' +
    'tools/test/fab-text.test.mjs,the fifth tab,behavior\n',
  'docs/harness.csv': 'path,role,layer\n',
  'docs/portable.csv':
    'path,role,kind\n' +
    '.claude/skills/web-tools/SKILL.md,loads the conventions,skill\n',
  'pages/pages.csv':
    'href,title,note\n' +
    'shorter.html,Shorter,line up a shorter draft\n',
};

// Stub the two reads Match makes. `calls` records what was asked for, so a
// test can assert the tree was NOT read as easily as that it was.
function stubReads(d, { tree = null, treeThrows = null, drop = [] } = {}) {
  const calls = { registries: [], tree: 0 };
  d._regCache = {};
  window.GH = function () {
    this.get = async (p) => {
      calls.registries.push(p);
      if (drop.includes(p)) throw new Error('unreadable');
      if (!REG[p]) throw new Error('no such registry');
      return { text: REG[p] };
    };
  };
  window.EstateSearch = {
    tree: async () => {
      calls.tree++;
      if (treeThrows) throw new Error(treeThrows);
      return { paths: tree || [], truncated: false };
    },
  };
  return calls;
}

test('match looks up the registered set, and root-level files are reachable', async () => {
  const d = await mountFab();
  d.repo = 'mehrlander/web-tools';
  d.textStats = d._textRead(docWith(
    '<p>The contract is in docs/loader.md, the instructions in CLAUDE.md, and the ' +
    'page is <code>pages/shorter.html</code>.</p>'));
  const calls = stubReads(d);
  await d.textMatchRun();
  assert.equal(d.textMatchState, 'done', d.textMatchError);

  assert.equal([...d.textMatch.hits].map(h => h.path).join('|'),
    'CLAUDE.md|docs/loader.md|pages/shorter.html',
    'the input is the registry, so a root-level file with no slash is found');

  // That is the whole point of the inversion. The regex lane requires a slash
  // to fire at all, so CLAUDE.md, README.md and package.json were unreachable
  // no matter how often the estate names them.
  const claude = d.textMatch.hits.find(h => h.path === 'CLAUDE.md');
  assert.equal(claude.what, 'the repo instructions');
  assert.equal(claude.tag, 'living');

  // A nested carrier is read by the same reader, and carries a live address,
  // which is a better gloss for a page than any sentence about it.
  const page = d.textMatch.hits.find(h => h.path === 'pages/shorter.html');
  assert.equal(page.what, 'line up a shorter draft');
  assert.match(page.live, /github\.io\/web-tools\/pages\/shorter\.html$/);

  assert.equal(calls.tree, 0,
    'nothing unregistered was named, so the tree was never read');
});

test('the tree is read only for what the registry does not know', async () => {
  const d = await mountFab();
  d.repo = 'mehrlander/web-tools';
  d.textStats = d._textRead(docWith(
    '<p>See docs/loader.md, lib/kits/annotate.js, and docs/gone-away.md.</p>'));
  const calls = stubReads(d, { tree: ['docs/loader.md', 'lib/kits/annotate.js'] });
  await d.textMatchRun();

  assert.equal([...d.textMatch.hits].map(h => h.path).join('|'), 'docs/loader.md');
  assert.equal(calls.tree, 1, 'one tree read, because two paths were unregistered');

  const other = [...d.textMatch.other];
  assert.equal(other.map(o => o.path).join('|'), 'docs/gone-away.md|lib/kits/annotate.js');
  assert.equal(other.find(o => o.path === 'lib/kits/annotate.js').exists, true,
    'a real file nothing has registered: a gap in the registries');
  assert.equal(other.find(o => o.path === 'docs/gone-away.md').exists, false,
    'a reference to nothing: the finding worth having');
});

test('the unregistered lane drops what it used to report as findings', async () => {
  const d = await mountFab();
  d.repo = 'mehrlander/web-tools';
  d.textStats = d._textRead(docWith(
    `<p>Fetched from https://example.com/a/b.html and
     cdn.jsdelivr.net/npm/daisyui@5/themes.css, next to data/clip.mp3.</p>`));
  stubReads(d, { tree: [] });
  await d.textMatchRun();

  const paths = [...d.textMatch.other].map(o => o.path);
  assert.ok(!paths.some(p => p.endsWith('a/b.html')),
    'a URL path is not a repo path: the "//" before it is the tell');
  assert.ok(!paths.includes('5/themes.css'),
    'a CDN version tail is not a repo path either');
  assert.ok(paths.includes('data/clip.mp3'),
    'an extension with a digit is a real path and used to be invisible');

  // ONE token extractor, or the two numbers disagree about the same text. The
  // house-rule count and this lane briefly used different rules and the count
  // overstated: on a page carrying one CDN import, Bare paths read 6 where the
  // lane listed 2, and the extra was a URL tail.
  //
  // Asserted as an absolute, not as equality between the two. They are not
  // generally equal, since the house-rule count includes registered paths and
  // the lane by definition excludes them; equality here would hold only
  // because this fixture registers nothing, which is luck rather than a law.
  assert.equal(d.textStats.barePaths, 1,
    'the house-rule count sees the one real path and neither piece of URL noise');
});

test('a lookup respects name boundaries and claims the longest span', async () => {
  const d = await mountFab();
  d.repo = 'mehrlander/web-tools';

  // docs/loader.md must not fire inside docs/loader.mdx.
  d.textStats = d._textRead(docWith('<p>Not docs/loader.mdx but something else.</p>'));
  stubReads(d, { tree: ['docs/loader.mdx'] });
  await d.textMatchRun();
  assert.equal([...d.textMatch.hits].length, 0,
    'an extension that continues the name is a different file');

  // A path at the end of a sentence is the common case and must still match.
  d.textStats = d._textRead(docWith('<p>It is stated in docs/loader.md.</p>'));
  stubReads(d, { tree: [] });
  await d.textMatchRun();
  assert.equal([...d.textMatch.hits].map(h => h.path).join('|'), 'docs/loader.md',
    'a trailing full stop does not hide a path');
});

test('a registry that will not read costs descriptions, not rows', async () => {
  const d = await mountFab();
  d.repo = 'mehrlander/web-tools';
  d.textStats = d._textRead(docWith('<p>See docs/loader.md and CLAUDE.md.</p>'));
  stubReads(d, { drop: ['docs/docs.csv'] });
  await d.textMatchRun();

  assert.equal(d.textMatchState, 'done');
  assert.equal([...d.textMatch.hits].length, 0,
    'those two rows lived in the registry that failed, so they are simply not known');
  assert.equal([...d.textMatch.failed].join('|'), 'docs/docs.csv',
    'and the failure is reported, because an absent gloss and a broken registry ' +
    'used to render identically');
});

test('a tree failure degrades the answer rather than ending it', async () => {
  const d = await mountFab();
  d.repo = 'mehrlander/web-tools';
  d.textStats = d._textRead(docWith('<p>See docs/loader.md and lib/kits/annotate.js.</p>'));
  stubReads(d, { treeThrows: 'tree fetch failed' });
  await d.textMatchRun();

  assert.equal(d.textMatchState, 'done', 'the registered half still answered');
  assert.equal([...d.textMatch.hits].map(h => h.path).join('|'), 'docs/loader.md');
  assert.equal([...d.textMatch.other][0].exists, null,
    'unknown, not false: a failed check must not read as a missing file');
  assert.match(d.textMatchError, /not checked against the tree/);
});

test('match runs with the read, without a tap', async () => {
  const d = await mountFab();
  let ran = 0;
  d.textMatchRun = async function () { ran++; };
  d.textScan();
  assert.equal(ran, 1, 'opening the tab looks things up; a button gate hid the answer ' +
    'behind a decision nobody had the information to make');
});
test('an unreadable document is a null, not a throw', async () => {
  const d = await mountFab();
  assert.equal(d._textRead(null), null);
  assert.equal(d._textRead({}), null);

  // The recurring shape, generalized after it was made twice. x-show only
  // toggles display: an x-text on the same element, and every expression in
  // the subtree beneath it, still evaluates. So a guard written as x-show does
  // not protect what it appears to guard, and a nullable dereferenced beside
  // it throws on every mount that never opens this tab. Both instances were
  // found by the suite rather than by reading, one as a thrown test and one as
  // stderr noise that failed the file while every subtest passed.
  const guarded = [...SRC.matchAll(/<[a-z]+\b[^>]*?x-show="([^"]*)"[^>]*?x-text="([^"]*)"[^>]*>/gs)]
    .filter(([, , text]) => /\btext(Match|Stats)\./.test(text) && !/\btext(Match|Stats)\?\./.test(text));
  assert.equal(guarded.length, 0,
    'x-show does not stop the x-text beside it from evaluating; use template x-if ' +
    `(offender: ${guarded[0]?.[2] || ''})`);
});
