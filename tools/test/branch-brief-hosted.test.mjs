// alpineComponents/branch-brief.js — mounted BY A HOST rather than as a page.
//
// show-repo's branch deck mounts one of these per slide, directly in the
// shell's own Alpine. There was an iframe and a postMessage channel between
// them until 2026-08-13, which cost a second boot of the whole library and
// forced a hand-rolled swipe over a single live surface; both went when the
// takeover became a swipe-deck, and what is left is three plain options.
//
// This file holds what a host is owed, since a host cannot see inside:
//
//   - `framed` means the host supplies the identity chrome, so the view drops
//     the repo and the PR link and keeps only the branch name;
//   - `warm` names the neighbours worth reading ahead, which is what makes a
//     step to one of them cost nothing;
//   - `onMeta` reports what only a finished read knows, above all the PR
//     number for a branch whose PR has MERGED: the activity crawl asks GitHub
//     for open pull requests only, so the host's own row has none and its
//     header would otherwise stay blank on the branches whose work is done;
//   - `facts` lends what the host's row already knows, which is what makes the
//     deferral below invisible to a reader who never asks for the files.
//
// The DEFERRAL is the other half of this contract, added 2026-08-14. Mounting
// reads the pulls call only, a few KB; the compare, which carries every changed
// file's patch and on this repo is most of a megabyte, waits until the reader
// asks for the files. So a host must not assume a mounted slide has files, and
// the warm it asks for follows the same rule.
//
// The layout half is here too, because it is also a fact about the host: a
// framed view is a column that pins its head and scrolls its body, so a long
// file list never carries away the branch name or the controls.
//
// No network, no pixels; the same jsdom harness the cards and groups tests use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const tick = (n = 1) => new Promise(r => setTimeout(r, n * 10));

const compareFor = (branch) => ({
  ahead_by: 2, behind_by: 0, total_commits: 1,
  commits: [{ sha: 'c-' + branch, commit: { message: branch, committer: { date: '2026-08-01T00:00:00Z' } } }],
  files: [{ filename: branch + '.js', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@' }],
});

// A PR per branch, and one of them merged: that is the case the embedder's own
// row cannot cover, so it is the case this channel exists to carry.
const PULLS = {
  'feat/a': [{ number: 443, title: 'A', state: 'open', draft: true, body: 'a' }],
  'feat/b': [{ number: 409, title: 'B', state: 'closed', merged_at: '2026-08-02T00:00:00Z', body: 'b' }],
  'feat/c': [],
};

const calls = { compare: [], pulls: [], csv: [], trees: [] };
let hold = null;                 // when set, compares wait on it

const { window } = makeWindow({
  html: '<!doctype html><html><body><div id="m"></div></body></html>',
});

for (const f of ['lib/kits/branch-status.js', 'lib/kits/branch-brief.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, f), 'utf8'))(window);
}

class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || ''; }
  async compare(base, head) {
    calls.compare.push(this.repo + '@' + head);
    if (hold) await hold;
    return compareFor(head);
  }
  async req(p) {
    // The SCAN's two reads, base tree and tip tree, which is what turns a file
    // list into landed / differs / missing. Every branch's one changed file
    // holds a different blob on each side, so the partition is one `differs`
    // and the count is a fact rather than a zero.
    if (/^git\/trees\//.test(p)) {
      calls.trees.push(p);
      const onTip = !/trees\/main/.test(p);
      return { truncated: false, tree: [
        { path: 'feat/a.js', type: 'blob', sha: onTip ? 'tip' : 'base' },
        { path: 'feat/c.js', type: 'blob', sha: onTip ? 'tip' : 'base' },
      ] };
    }
    const m = /head=([^&]*)/.exec(p || '');
    const head = m ? decodeURIComponent(m[1]).split(':')[1] : '';
    calls.pulls.push(this.repo + '@' + head);
    if (hold) await hold;
    return PULLS[head] || [];
  }
  async get(p) {
    calls.csv.push(this.repo + '@' + this.ref + ':' + p);
    throw Object.assign(new Error('404'), { status: 404 });
  }
}
window.GH = FakeGH;
window.TOKEN = 'tkn';

// What a host is told. The component is mounted with these options, the way
// the branch deck mounts one per slide.
//
// `facts` is in the default set because the real host always sends it and
// because it is the DEFERRAL SWITCH: a mount that lends the head's numbers
// waits for a tap before reading the diff, and a mount that does not cannot,
// since then the compare is the only thing that can answer the head. The
// mount-without-facts case is its own test at the end.
const meta = [];
const FACTS = { ahead: 2, behind: 0, firstDate: '2026-08-01T00:00:00Z',
                lastDate: '2026-08-03T00:00:00Z', sessions: [] };
const OPTS = { repo: 'me/tools', base: 'main', framed: true, facts: FACTS,
               onMeta: (m) => meta.push(m) };

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
const { default: collapse } = await import('@alpinejs/collapse/dist/module.esm.js');
window.Alpine = Alpine;
Alpine.plugin(collapse);
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/file-review.js',
                 'lib/alpineComponents/branch-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(2);

// Mount one, the way a deck slide does: imperative, options by reference
// through a keyed global, because inside an x-data EXPRESSION Alpine puts
// every registered component name in scope and a bare `repo` would resolve to
// the repo data provider rather than to this string.
let data;
const mount = async (branch, extra = {}) => {
  const host = window.document.getElementById('m');
  host.innerHTML = '';
  window.__opts = { ...OPTS, branch, ...extra };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'branchBrief(window.__opts)');
  host.append(el);
  Alpine.initTree(el);
  await tick(8);
  data = Alpine.$data(el);
  return data;
};

const reset = () => { calls.compare.length = 0; calls.pulls.length = 0; calls.csv.length = 0;
                      calls.trees.length = 0; meta.length = 0; };

// What the reader tapping "Read the changed files" does, which is the row the
// list leaves where the diff would be while the compare is deferred. It goes
// through setPane as well as ensureCompare because an address naming the files
// is the same gesture arriving from outside, and `pane` is a reported fact the
// host stamps its address from.
const openFiles = async (d = data) => { d.setPane('files'); await d.ensureCompare(); await tick(2); };

test('a host mounts it at a branch and is told what the read found', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/a');
  assert.equal(data.branch, 'feat/a');
  const m = meta.at(-1);
  assert.equal(m.branch, 'feat/a');
  assert.equal(m.pr, 443);
  assert.equal(m.prState, 'draft');
  // The guide is what a mount buys, and it is all a mount buys.
  assert.deepEqual(calls.pulls, ['me/tools@feat/a']);
  assert.deepEqual(calls.compare, [], 'the diff is not read until it is asked for');
  assert.equal(data.brief.pending, true);
  assert.equal(data.brief.files.length, 0);
  assert.equal(data.pane, '', 'no address named a section, and none is hidden to name');
});

test('asking for the files is what fetches the compare, and it asks once', async () => {
  await openFiles();
  assert.deepEqual(calls.compare, ['me/tools@feat/a']);
  assert.equal(data.brief.pending, false);
  assert.equal(data.brief.files.length, 1);
  assert.equal(data.brief.files[0].path, 'feat/a.js');
  // Asking again, from the guide marker and then from the list: a reader
  // moving around one page is not a reader asking twice.
  data.pane = 'guide'; await data.ensureCompare();
  await openFiles();
  assert.deepEqual(calls.compare, ['me/tools@feat/a']);
});

test('a branch with no PR has nothing to read first, so it reads the compare at once', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/c');
  await tick(4);
  assert.deepEqual(calls.compare, ['me/tools@feat/c'],
    'the deferral buys a reader time on the guide, and there is no guide to spend it on');
});

test('the merged PR is reported, which is the whole point of onMeta', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/b');
  const m = meta.at(-1);
  assert.equal(m.pr, 409);
  assert.equal(m.prState, 'merged',
    'the host cache never saw this one: the crawl asks for OPEN pull requests');
  assert.deepEqual(calls.compare, [], 'and hearing it costs no diff');
});

// The head is the reason `facts` exists: deferring the compare would otherwise
// blank the numbers the host measured minutes ago. It asserted the lifespan as
// its third figure until 2026-09-05, when the head dropped that fact and its
// getter with it; `behind` took its place, being the number the head now leads
// with and the only one on the line that says something has to be done.
test('a host lends its row, and the compare corrects it', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/a', { facts: { ahead: 9, behind: 1, firstDate: '2026-07-01T00:00:00Z',
                                   lastDate: '2026-07-08T00:00:00Z', sessions: ['s1'] } });
  assert.equal(data.brief.ahead, 9);
  assert.equal(data.brief.state, 'live', 'the badge is right on the first frame');
  assert.equal(data.brief.behind, 1);
  await openFiles();
  assert.equal(data.brief.ahead, 2, 'the read wins wherever the two differ');
  assert.equal(data.brief.sessions.length, 0, 'and the lent list is dropped, not merged');
});

test('a branch with no PR reports none rather than the last one', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/c');
  assert.equal(meta.at(-1).pr, 0);
  assert.equal(meta.at(-1).prState, '');
});

// The warm follows the reader. It always takes the cheap reads a neighbour
// opens on; it takes the expensive one only when this slide has already read
// its own, which is to say only when the reader is looking at diffs. Warming
// the compare unconditionally put three copies of a 1.8 MB response in flight
// to show three PR bodies.
const NEIGHBOURS = [{ repo: 'me/tools', branch: 'feat/b', base: 'main' },
                    { repo: 'me/tools', branch: 'feat/c', base: 'main' }];

test('the neighbours a host names are warmed, and arriving at one is free', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/a', { warm: NEIGHBOURS });
  await tick(6);
  assert.ok(calls.pulls.includes('me/tools@feat/b'), 'read ahead of the reader');
  assert.deepEqual(calls.compare, [], 'the cheap half only, while the reader is on a guide');
  reset();
  await mount('feat/b');
  assert.equal(data.brief.prs[0].number, 409);
  assert.deepEqual(calls.pulls, [], 'and arriving there cost no call at all');
});

test('a reader who is looking at diffs gets the diffs warmed too', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/a', { warm: NEIGHBOURS });
  await openFiles();
  await tick(6);
  // The warm runs at the end of load(), before Files was opened, so this one is
  // the reader's own compare. Re-warming is what carries the neighbours.
  data.warmNeighbours();
  await tick(6);
  assert.ok(calls.compare.includes('me/tools@feat/b'), 'the next diff is read ahead');
  reset();
  await mount('feat/b');
  await openFiles();
  assert.deepEqual(calls.compare, [], 'so stepping into it costs nothing');
  assert.equal(data.brief.files[0].path, 'feat/b.js');
});

test('the registry is read once per ref, not once per mount', async () => {
  window.BranchBrief.forget();
  await mount('feat/c');
  data.forgetRegistry();
  reset();
  await mount('feat/c');
  assert.equal(calls.csv.length, 1, 'the repo declares none, which is a 404 worth paying once');
  window.BranchBrief.forget();
  reset();
  await mount('feat/c');
  assert.equal(calls.csv.length, 0, 'and not again inside the memo\'s life');
});

// ── The layout, and where the scrollbar lives ────────────────────────────────
//
// Framed, this is a body inside a host's chrome, and a body scrolls inside
// itself. The document scrolling instead meant a long guide or a
// three-hundred-file list carried away the branch name and the control that
// would switch panes, which is the one thing a reader always wants back. The
// classes are the mechanism, so the classes are what this pins; the pixels are
// in tools/render/scenarios, since a jsdom box has no layout to measure.

test('framed: the head holds its place and the pane takes the scroll', async () => {
  window.BranchBrief.forget();
  await mount('feat/a');
  const root = window.document.querySelector('#m > div > div');
  assert.ok(root.className.includes('h-full'), 'the view fills what the host gave it');
  assert.ok(root.firstElementChild.className.includes('shrink-0'), 'the head holds its place');
  assert.ok(root.lastElementChild.className.includes('overflow-y-auto'), 'the pane takes the scroll');
  assert.ok(root.lastElementChild.className.includes('min-h-0'),
    'without which a flex child refuses to shrink and scrolls the document again');
});

// THE HEAD'S CEILING. It was three bands and 188px at 390x844 until
// 2026-09-05: an identity block, a bordered card holding four figures, and the
// Look row. The reader's report was that a third of the phone went by before
// the first file row. The card went, its figures moved onto the identity block
// as a plain line, and `lifespan` went with it, being the widest fact on the
// line and the one they said they never read. The head is 102px now.
//
// A jsdom box has no layout, so two mechanical facts stand in for the pixels:
// how many bands the head has, and whether any of them is drawn as a card. A
// third band, or a border inside one, is the old shape coming back, and nothing
// else in the suite would notice. The pixels themselves are
// tools/render/scenarios/branch-guide.mjs at 390x844.
test('the head stays two bands, and none of them is a card', async () => {
  window.BranchBrief.forget();
  await mount('feat/a');
  const head = window.document.querySelector('#m > div > div').firstElementChild;
  assert.ok(head.className.includes('shrink-0'), 'this is the head');
  assert.equal(head.children.length, 2,
    'the identity block and the Look row; a third band is the figures card returning');
  for (const el of head.querySelectorAll('*')) {
    assert.ok(!/\bborder-base-300\b/.test(String(el.className)),
      'nothing in the head is drawn as a card: ' + String(el.className).slice(0, 60));
  }
  assert.doesNotMatch(head.textContent, /lifespan/i,
    'the fact that forced the wrap, and the one the reader never read');
});

test('framed: the document itself is left alone', async () => {
  assert.equal(window.document.body.style.overflow, '',
    'a host owns its own document; this view pins nothing outside its mount');
  assert.equal(window.document.body.style.height, '');
});

// ── The load, under a host that swaps branches ──────────────────────────────

test('a read that is overtaken does not land on top of the newer one', async () => {
  window.BranchBrief.forget();
  await mount('feat/a');
  let release;
  hold = new Promise(r => { release = r; });
  const slow = data.load();                 // feat/a, held
  await tick(1);
  hold = null;
  const d = await mount('feat/c');          // a different mount finishes first
  release();
  await tick(6);
  assert.equal(d.branch, 'feat/c');
  assert.equal(d.brief.files[0].path, 'feat/c.js');
  await slow;
});

// The deck is the primary route to the files, which means it cannot require
// the reader to have opened the list first: that made it a second control on a
// list, two taps deep, with the second only discoverable after the first.
// One tap from a branch, fetching what it needs.
test('the deck opens from a branch that has not read its diff', async () => {
  window.BranchBrief.forget();
  reset();
  await mount('feat/a');
  assert.equal(data.brief.pending, true, 'nothing has been read but the guide');
  assert.equal(data.deckFiles.length, 0, 'so there is no list to have opened');

  let opened = null;
  window.swipeDeck = { top: () => null };          // no parent: this is the standalone shape
  window.fileDeck = { open: (o) => (opened = o, { deck: { onSlide() {} }, close() {} }) };
  await data.openFileDeck(0);
  assert.deepEqual(calls.compare, ['me/tools@feat/a'], 'the tap fetched what it needed');
  assert.ok(opened, 'and opened the deck rather than doing nothing');
  assert.equal(opened.files.length, 1);
  assert.equal(opened.files[0].path, 'feat/a.js');
  assert.equal(data.deckOpening, false, 'the button is not left spinning');
  // The compare landing re-renders the pane and re-warms; let both settle
  // inside this test rather than under the next mount's teardown.
  await tick(6);
  delete window.fileDeck; delete window.swipeDeck;
});

// The other side of the switch, and the reason it is the switch. A cold
// pages/branch.html has no row to lend from, so the compare is the only thing
// that can say whether the branch is live, how far ahead it is, or how long it
// lived. Deferring there would trade a megabyte for a strip of question marks
// on a page whose standing claim is that its facts are read at open time.
test('with nothing lending the head, the compare is not deferred', async () => {
  window.BranchBrief.forget();
  reset();
  window.__opts = { repo: 'me/tools', base: 'main', branch: 'feat/a',
                    onMeta: (m) => meta.push(m) };      // no facts: the standalone page
  const host = window.document.getElementById('m');
  host.innerHTML = '';
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'branchBrief(window.__opts)');
  host.append(el);
  Alpine.initTree(el);
  await tick(8);
  const d = Alpine.$data(el);
  assert.equal(d.brief.pending, false, 'read up front, because nothing else can answer the head');
  assert.equal(d.brief.ahead, 2);
  assert.equal(d.brief.state, 'live');
  assert.deepEqual(calls.compare, ['me/tools@feat/a']);

  // AND IT MEASURES WHAT IT READ. A host lends `scan` so its slide draws the
  // verdict strip on the first frame; this host is lent nothing, so the only
  // way the strip exists is the page computing it. It did not until 2026-09-04:
  // the scan rides ensureCompare(), load() called that only for a branch with
  // no guide, and feat/a has a pull request, so a cold page paid for the
  // compare and rendered its file list with no strip over it.
  await tick(8);
  assert.equal(calls.trees.length, 2, 'the base tree and the tip tree, one read each');
  assert.ok(d.scan, 'the cold host is the one that cannot be lent a verdict, so it computes one');
  assert.equal(d.verdict.nUnique, 1);
  assert.equal(d.verdict.nDiffers, 1, 'the file is on both sides and the bytes differ');
  assert.equal(d.verdict.lent, false, 'measured here, not handed down');
});

// The other thing only a host could answer, until it wasn't. A branch sharing
// no ancestor with the base 404s the compare, so there is no file list at all;
// the crawl reads one anyway through BranchStatus.recentHistory and lends its
// slides the missing paths. A cold page had nobody to lend it one and said
// "No file differs from main", which is not a smaller answer but a false one.
test('no merge base: the page reads the fallback the crawl would have lent it', async () => {
  window.BranchBrief.forget();
  reset();
  let first = true;
  const realCompare = FakeGH.prototype.compare;
  FakeGH.prototype.compare = async function (base, head) {
    // The default compare 404s; the fallback's (parent...tip) answers.
    if (first) { first = false; throw Object.assign(new Error('no merge base'), { status: 404 }); }
    calls.compare.push(this.repo + '@' + head);
    return { files: [{ filename: 'feat/a.js', status: 'modified', additions: 1, deletions: 0 }] };
  };
  const realReq = FakeGH.prototype.req;
  FakeGH.prototype.req = async function (p) {
    if (/^commits\?/.test(p)) {
      calls.pulls.push('commits');
      return [{ sha: 'tip', commit: { message: 'tip', committer: { date: '2026-08-02T00:00:00Z' } }, parents: [{ sha: 'p1' }] },
              { sha: 'old', commit: { message: 'old', committer: { date: '2026-08-01T00:00:00Z' } }, parents: [{ sha: 'p0' }] }];
    }
    // The path is on the tip and NOT on the base, so it classifies missing,
    // which is the class this pane lists by name. The shared tree fixture puts
    // every path on both sides, which would make it merely differ.
    if (/^git\/trees\//.test(p)) {
      calls.trees.push(p);
      const onTip = !/trees\/main/.test(p);
      return { truncated: false, tree: onTip ? [{ path: 'feat/a.js', type: 'blob', sha: 'only' }] : [] };
    }
    return realReq.call(this, p);
  };
  try {
    window.__opts = { repo: 'me/tools', base: 'main', branch: 'feat/a', onMeta: (m) => meta.push(m) };
    const host = window.document.getElementById('m');
    host.innerHTML = '';
    const el = window.document.createElement('div');
    el.setAttribute('x-data', 'branchBrief(window.__opts)');
    host.append(el);
    Alpine.initTree(el);
    await tick(14);
    const d = Alpine.$data(el);
    assert.equal(d.brief.noBase, true, 'the 404 is an answer, and the brief carries it');
    assert.equal(d.brief.files.length, 0, 'there is no diff, so the file list stays empty');
    assert.ok(calls.pulls.includes('commits'), 'the fallback walked the branch history');
    assert.equal(d.fallbackFiles.length, 1, 'and found what the recent history changed');
    // feat/a.js is on the tip tree and not on the base tree in this fixture,
    // so the one path classifies missing, which is the actionable half.
    assert.deepEqual([...d.lentMissing], ['feat/a.js'],
      'so the page lists the paths the base does not have, as the takeover does');
  } finally {
    FakeGH.prototype.compare = realCompare;
    FakeGH.prototype.req = realReq;
  }
});

test('a compare that lands after a step does not overwrite the newer branch', async () => {
  window.BranchBrief.forget();
  await mount('feat/a');
  let release;
  hold = new Promise(r => { release = r; });
  const slow = data.ensureCompare();         // feat/a's diff, held
  await tick(1);
  hold = null;
  const d = await mount('feat/c');           // the reader stepped on
  await tick(4);
  release();
  await tick(6);
  assert.equal(d.brief.files[0].path, 'feat/c.js',
    'the held read belonged to a branch nobody is looking at any more');
  await slow;
});


// ── one surface, and where the tabs went ────────────────────────────────────
//
// There were three tabs, then two, then none. Commits went first: its count
// restated the strip's own ahead figure (a compare's total_commits IS its
// ahead_by) and its twelve subjects sat beside a PR body describing the same
// work in prose, so only the no-PR case it carried alone survived, into the
// guide's own section. Guide and Files went on 2026-08-31, because a switch
// between them was answering a question nobody had: they are not alternatives,
// and a tab made each one the cost of hiding the other. Both render now, and
// `pane` names what an ADDRESS asked for rather than what is visible.
//
// THE ORDER HAS MOVED TWICE, and each move was the reader's. Files led while
// the guide was the only prose on the page, on the reading that the list is
// what cannot be read anywhere else in one place. The guide led on 2026-09-06,
// because presenting the readable files meant the page opened on a document
// with no statement of what the branch was for. Files lead again from
// 2026-09-07: the list is SHUT, so it costs a heading row rather than a screen,
// and the guide keeps the clip that made leading with it affordable.

test('both sections render at once, the files above the guide', async () => {
  window.BranchBrief.forget();
  reset();
  const d = await mount('feat/a');
  await openFiles(d);
  await tick(8);
  const files = d.$el.querySelector('[x-ref="files"]');
  const guide = d.$el.querySelector('[x-ref="guide"]');
  assert.ok(files && guide, 'both sections are in the tree');
  // DOCUMENT_POSITION_FOLLOWING: the guide comes after the files.
  assert.ok(files.compareDocumentPosition(guide) & 4,
    'the shut list leads, so the page opens on what the branch touched');
  // And the presented documents come last of the three.
  const strip = d.$el.querySelector('[x-ref="revStrip"]');
  if (strip) assert.ok(guide.compareDocumentPosition(strip) & 4,
    'the documents themselves are last');
  // SHOWN, not merely present. Everything here renders into the tree and hides
  // with a style, so a textContent check would pass on a panel nobody can see:
  // it is exactly the state a deferred compare left behind before the x-show
  // values were coerced to booleans (see the note in the template).
  const list = d.$el.querySelector('[x-ref="fileList"]');
  assert.ok(list && list.style.display !== 'none', 'the file list is on screen');
  assert.ok(list.textContent.includes('a.js'), 'carrying the branch\'s one changed file');
  assert.ok(guide.textContent.includes('#443'), 'and the guide is under it, without a tap');
  // Asking for one hides nothing. That is the whole difference from a tab, and
  // the assertion the switch could never have passed.
  d.setPane('guide');
  await tick(2);
  assert.ok(d.$el.querySelector('[x-ref="fileList"]').style.display !== 'none',
    'going to the guide leaves the list where it was');
});

test('with no PR, the commits are the account, and they are read without asking', async () => {
  window.BranchBrief.forget();
  reset();
  const d = await mount('feat/c');
  await tick(4);
  assert.equal(d.hasGuide, false);
  assert.equal(d.pane, '', 'no address asked for a section, so none is singled out');
  assert.deepEqual(calls.compare, ['me/tools@feat/c'],
    'with no guide to read first there is nothing to defer for');
  const shown = d.$el.textContent.replace(/\s+/g, ' ');
  assert.ok(shown.includes('What this branch did'),
    'the section says what it is standing in for rather than printing bare shas');
  assert.ok(shown.includes('no pull request describes it'));
  assert.ok(shown.includes('feat/c'), 'and the commit subjects are the account');
});

// The heading row keeps a marker for the guide, because a section below the
// fold needs something at the top saying it is there. Tapping it is the one
// caller of setPane in the markup, and it reports up like the tab it replaced.
test('the guide marker asks for the guide, and the ask is reported', async () => {
  window.BranchBrief.forget();
  reset();
  const d = await mount('feat/a');
  await tick(2);
  assert.equal(d.hasGuide, true, 'so the marker shows');
  d.setPane('guide');
  assert.equal(meta.at(-1).pane, 'guide');
  assert.deepEqual(calls.compare, [], 'jumping to the guide is a scroll, not a read');
});
