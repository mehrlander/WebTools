// alpineComponents/session-brief.js — one captured session as a page.
//
// The view was inside pages/session.html until 2026-08-27, where its only
// possible host was that page. Lifting it into a component gave it a second
// host, show-repo's Sessions pane, which mounts one per slide so a session can
// be swiped through the way a branch already is. That is the whole reason this
// file exists, and the two things worth pinning follow from it:
//
//   The HEAD renders before the record does. A slide is handed the sessions
//   cache's row as `facts`, so its title, its strip and its closing reply are
//   right in the first frame and only the outline waits on the JSON. A view
//   that blanked until the fetch landed would flash on every swipe.
//
//   The RECORD is read once per session, not once per visit. The deck reuses
//   one mount per slide, so stepping back to a slide must not refetch, and the
//   memo lives at module scope for exactly that reason.
//
// Driven over a fake GH; no network, no pixels.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { makeWindow, tick, repoRoot, captureAlpineErrors } from './bootstrap.mjs';

const STORE = 'me/private';
const PATH = 'sessions/2026/08/2026-08-05-b8fae678.json';

const record = {
  schema: 4, short: 'b8fae678', day: '2026-08-05',
  started: '2026-08-05T13:00:00Z', ended: '2026-08-05T16:00:00Z',
  agent_session: 'https://claude.ai/code/session_01SX',
  repos: [{ name: 'web-tools', branch: 'claude/a-1' }],
  opening_ask: 'do the thing', exchanges: 2, calls_total: 40, failures: 1,
  files_total: 2, tokens: { output: 337631 },
  prompts: [{ at: '2026-08-05T13:00:00Z', text: 'do the thing' }],
  replies: [{ at: '2026-08-05T13:30:00Z', text: 'partway through' },
            { at: '2026-08-05T15:59:00Z', text: 'and here is what came of it' }],
  calls: [],
};

// What the Sessions pane lends a slide: the cache's own row, which holds every
// number on the strip.
const facts = {
  id: 'b8fae678', day: '2026-08-05', title: 'a named session',
  started: record.started, ended: record.ended, repos: record.repos,
  ask: 'do the thing', reply: 'a closing reply the cache carried', replyCut: '',
  exchanges: 2, calls: 40, failures: 1, filesTotal: 2, schema: 4,
  tokens: { output: 337631 }, agent: record.agent_session,
};

// ONE ORDERED LOG, not two counters. What has to be provable is that the lent
// slide reached its blob without a listing preceding it, and two independent
// tallies cannot say which came first.
const log = [];
const gets = () => log.filter(l => l.startsWith('get:'));
const trees = () => log.filter(l => l.startsWith('tree:'));
class FakeGH {
  constructor(conf = {}) { this.repo = conf.repo || ''; this.ref = conf.ref || 'main'; }
  async get(p) {
    log.push('get:' + this.repo + ':' + p);
    if (p === PATH) return { text: JSON.stringify(record) };
    throw Object.assign(new Error('404'), { status: 404 });
  }
  async req(p) {
    log.push('tree:' + p);
    return { tree: [{ type: 'blob', path: PATH }] };
  }
}

const { window, problems } = makeWindow({
  html: `<!doctype html><html><body>
    <div id="lent" x-data="sessionBrief(window.__lent)"></div>
    <div id="cold" x-data="sessionBrief(window.__cold)"></div>
    <div id="stem" x-data="sessionBrief(window.__stem)"></div>
    <div id="unread" x-data="sessionBrief(window.__unread)"></div>
  </body></html>`,
});
window.GH = FakeGH;
window.TOKEN = 'tkn';
// The loader, as a log. `ready()` is the component's only use of it, and the
// last test in this file is about WHEN that runs.
const loads = [];
window.gh = { load: async (k) => { loads.push(k); } };
// The kit chain the component reads. Stubbed rather than loaded: what the deck
// DOES with a record is session-render.js's own test, and the outline is
// session-export.js's.
window.claudeMark = { svg: () => '<svg></svg>' };
const opened = [];
window.sessionRender = {
  describe: (r) => ({ title: 'described ' + r.short, subtitle: '' }),
  turns: (r) => (r.replies || []),
  groups: (t) => t.map(x => [x]),
  open: async (r, o) => { opened.push({ short: r.short, ...o }); return { close(){} }; },
};
window.sessionExport = { index: () => ({ el: window.document.createElement('div') }) };
window.chatRender = { block: () => window.document.createElement('pre') };
window.swipeDeck = { top: () => null };

// A slide is handed its row; a cold page is handed an id and nothing else.
window.__lent = { id: 'b8fae678', day: '2026-08-05', repo: STORE, framed: true, facts,
                  onMeta: (m) => { window.__meta = m; } };
window.__cold = { id: 'b8fae678', repo: STORE };
// The same session addressed by the whole filename stem, which is what the
// store's directory listing shows and therefore what a hand-built link tends to
// carry. Both forms have to land on one record.
window.__stem = { id: '2026-08-05-b8fae678', repo: STORE };
// A row whose record cannot be read. It is the state every slide passes through
// on its way to loaded, and it is also a real end state: the store is private,
// so a reader whose token cannot reach it still gets everything the cache knew.
window.__unread = { id: 'nosuch', day: '2026-08-05', repo: STORE, framed: true,
                    facts: { ...facts, id: 'nosuch' } };

const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
captureAlpineErrors(Alpine);
window.Alpine = Alpine;
// pathOf lives in the sessions cache kit, and the component reads it there
// rather than deriving a second copy. The Sessions pane always has it loaded;
// a cold pages/session.html does not, which is the case the listing covers.
for (const k of ['lib/kits/closing-state.js', 'lib/kits/repo-sessions-cache.js']) {
  new window.Function('window', readFileSync(path.join(repoRoot, k), 'utf8'))(window);
}
for (const p of ['lib/alpine-bundle.js', 'lib/alpineComponents/session-brief.js']) {
  new window.Function(readFileSync(path.join(repoRoot, p), 'utf8'))();
}
Alpine.start();
await tick(6);

const lent = () => Alpine.$data(window.document.getElementById('lent'));
const cold = () => Alpine.$data(window.document.getElementById('cold'));
const stem = () => Alpine.$data(window.document.getElementById('stem'));
const strip = (d) => Object.fromEntries(d.strip.map(f => [f.k, f.v]));

test('mounting is quiet', () => {
  assert.deepEqual(problems, []);
});

// ── The head, before the record ─────────────────────────────────────────────

test('a lent row renders the strip and the title without waiting on the record', () => {
  // Every value here comes from `facts`. The assertion that matters is that
  // they are present at all: a slide that blanked until its fetch landed would
  // flash the whole head on every swipe.
  const s = strip(lent());
  assert.equal(s.asks, 2);
  assert.equal(s.calls, 40);
  assert.equal(s.failures, 1);
  assert.equal(s.ran, '3h 0m');
  assert.equal(s.repos, 'web-tools');
  assert.equal(s['out tokens'], '337,631');
});

test('the strip counts a zero rather than dropping it, and drops what is absent', () => {
  // "no failures" and "not captured" are different answers and only one of them
  // is about the session, which is the whole reason the filter tests for
  // `v === 0` rather than truthiness.
  const bare = { id: 'x', day: '2026-08-05', exchanges: 0, calls: 0, failures: 0 };
  window.__probe = { id: 'x', repo: STORE, facts: bare, record: null };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__probe)');
  window.document.body.append(el);
  Alpine.initTree(el);
  const s = Object.fromEntries(Alpine.$data(el).strip.map(f => [f.k, f.v]));
  assert.equal(s.failures, 0, 'measured zero is a fact');
  assert.ok(!('ran' in s), 'a duration nothing could compute is absent, not zero');
});

test('the closing reply is on the page from the row, record or no record', () => {
  const d = Alpine.$data(window.document.getElementById('unread'));
  assert.equal(d.record, null, 'this record could not be read');
  assert.equal(d.closingRaw, 'a closing reply the cache carried');
  assert.match(d.err, /Could not open nosuch/, 'and it says so rather than reading as empty');
  // The strip is the row's the whole time, so an unreadable record costs the
  // outline and nothing else.
  assert.equal(Object.fromEntries(d.strip.map(f => [f.k, f.v])).calls, 40);
});

// ── The read ────────────────────────────────────────────────────────────────

test('a lent day derives the store path, so a slide never reads the tree', () => {
  // The guess is right for every row the sessions cache built, and the listing
  // behind it is a recursive tree read of a private store. A deck of twenty
  // sessions must not pay for it twenty times, or once. The ORDER is the proof:
  // the first call this fixture made at all was the lent slide's own blob.
  assert.equal(log[0], 'get:' + STORE + ':' + PATH,
    'the lent slide went straight to its blob, with no listing ahead of it');
  assert.equal(lent().path, PATH);
});

test('a cold mount with no day resolves the id against the store listing', () => {
  assert.equal(cold().path, PATH);
  // Once for the whole store, however many mounts need it: this fixture has
  // two (the cold one, and the one whose derived path 404s and falls through).
  assert.equal(trees().length, 1, 'exactly one listing read');
});

test('the dated stem resolves to the same record as the bare id', () => {
  // The two names are in front of a reader in different places: every surface
  // PRINTS b8fae678, and the store's own directory listing SHOWS
  // 2026-08-05-b8fae678.json. A link built from the listing used to reach the
  // "No record" error on a record that was sitting in the tree, and the error
  // called the id a filename stem while refusing one (2026-09-05).
  assert.equal(stem().path, PATH);
  assert.equal(stem().err, '', 'the stem form is not an error state');
});

test('the record is read once, however many mounts ask for it', () => {
  // Three components mounted, two of them landing on this path within a tick.
  // The memo holds the PROMISE, not the settled record, which is the only
  // version of it that survives concurrent slides: caching after the await lets
  // every caller miss and fetch.
  assert.equal(gets().filter(g => g === 'get:' + STORE + ':' + PATH).length, 1);
});

test('the record overwrites what the row lent', () => {
  const d = lent();
  assert.equal(d.record.short, 'b8fae678');
  assert.equal(d.head.title, 'described b8fae678', 'describe owns the name once the record is here');
  assert.equal(d.closingRaw, 'and here is what came of it',
    'the CLOSING reply, by timestamp, not the first or the longest');
  assert.equal(d.closingLabel, 'closing reply');
});

test('a record with no replies says its text is a tail, not a turn', () => {
  window.__old = { id: 'z', repo: STORE, record: { short: 'z', schema: 2, last_message: 'the tail' } };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__old)');
  window.document.body.append(el);
  Alpine.initTree(el);
  const d = Alpine.$data(el);
  assert.equal(d.closingRaw, 'the tail');
  assert.equal(d.closingLabel, 'final turn, tail only');
});

test('the host is told what only a finished read knows', () => {
  // The deck header names a session before its record is here, off the row. The
  // title a record carries can differ, and the Claude session link exists only
  // on a record written after 2026-08-07, so both come back this way.
  assert.equal(window.__meta.title, 'described b8fae678');
  assert.equal(window.__meta.agent, 'https://claude.ai/code/session_01SX');
  assert.equal(window.__meta.path, PATH);
});

// ── The deck door ───────────────────────────────────────────────────────────

test('the cards button opens the record at the card it was asked for', async () => {
  opened.length = 0;
  await lent().openDeck(7);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].short, 'b8fae678');
  assert.equal(opened[0].start, 7, 'an outline row hands over which card it was');
});

test('an open deck becomes the parent, so the cards drill rather than stack', async () => {
  // Opened from a deck of sessions, the cards are one level DOWN: Back returns
  // to the session rather than closing the reader out of everything. The same
  // seam branch-brief's file deck takes one object over.
  opened.length = 0;
  const parent = { id: 'parent-deck' };
  window.swipeDeck.top = () => parent;
  try {
    await lent().openDeck();
    assert.equal(opened[0].parent, parent);
    assert.ok(!('start' in opened[0]), 'no card named means no start, not slide 0 forced');
  } finally { window.swipeDeck.top = () => null; }
});


// ── The Files pane ──────────────────────────────────────────────────────────
// The strip counted the files a session opened and nothing routed to them. The
// record holds the whole map, so the list costs no read; what it cannot hold is
// the OWNER of each checkout, which is why the link is the host's to supply.

test('files are listed by the cache\'s own weight, and the badges carry the rest', async () => {
  window.__files = {
    repo: STORE,
    record: {
      short: 'f', schema: 3,
      files: {
        'web-tools/docs/read-a-lot.md': { read: 9 },
        'web-tools/lib/edited.js': { read: 1, edit: 6 },
        'home/untouched.md': { read: 1 },
      },
    },
  };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__files)');
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(2);
  const rows = Alpine.$data(el).fileRows;
  // The sessions cache's fileWeight is a PLAIN SUM: every access counts one, an
  // edit the same as a read. So nine reads (9) outrank one read and six edits
  // (7), which is not what "worked on" means to a reader and is exactly why the
  // per-kind badges are on the row. Pinned as the kit's rule rather than as a
  // rule of this pane's, since a pane that reordered would disagree with the
  // Sessions row's hover card over the same files.
  assert.equal(rows[0].path, 'web-tools/docs/read-a-lot.md');
  assert.equal(rows[1].path, 'web-tools/lib/edited.js');
  assert.equal(rows.at(-1).path, 'home/untouched.md');
  // The path splits so a column of long paths reads by its right-hand end.
  assert.equal(rows[1].dir, 'web-tools/lib/');
  assert.equal(rows[1].name, 'edited.js');
  // One badge per kind, heaviest first, and a zero is never drawn.
  // Joined rather than deep-compared: Alpine hands back reactive proxies, which
  // are structurally equal to a plain array and never reference-equal.
  assert.equal(rows[1].kinds.map(k => k.label + k.n).join(','), 'edit6,read1');
  assert.equal(rows[2].kinds.map(k => k.label + k.n).join(','), 'read1');
  assert.equal(rows[0].href, '', 'no host resolver means no link, not a guessed one');
});

test('an empty list says which kind of empty it is', async () => {
  const mount = (record) => {
    window.__e = { repo: STORE, record };
    const el = window.document.createElement('div');
    el.setAttribute('x-data', 'sessionBrief(window.__e)');
    window.document.body.append(el);
    Alpine.initTree(el);
    return Alpine.$data(el);
  };
  // "Opened nothing" and "never captured" are different answers and only one is
  // about the session, the same distinction the Sessions row draws with its
  // dimmed files glyph.
  assert.match(mount({ short: 'a', schema: 2 }).filesNote, /predates file-attention capture/);
  assert.match(mount({ short: 'b', schema: 4, files: {} }).filesNote, /No files were opened/);
});

test('a host resolver turns each row into a real anchor', async () => {
  window.__linked = {
    repo: STORE,
    record: { short: 'g', schema: 3, files: { 'web-tools/lib/a.js': { edit: 1 } } },
    fileHref: (path) => 'https://example.test/' + path,
  };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__linked)');
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(4);
  assert.equal(Alpine.$data(el).fileRows[0].href, 'https://example.test/web-tools/lib/a.js');
  // THE RENDER, not just the getter. The first draft picked the element with
  // <component :is="f.href ? 'a' : 'span'">, which is Vue's idiom and not
  // Alpine's: it renders an unknown <component> tag showing its children, so
  // every row looked exactly right and none of them linked. A getter assertion
  // could never have seen that.
  const a = el.querySelector('a[href="https://example.test/web-tools/lib/a.js"]');
  assert.ok(a, 'the row renders an <a> carrying the resolved href');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.match(a.textContent.replace(/\s+/g, ''), /^web-tools\/lib\/a\.js$/);
});

test('an unresolved row renders an anchor with no href, so it is text', async () => {
  window.__plain = {
    repo: STORE,
    record: { short: 'i', schema: 3, files: { 'x/y.js': { read: 1 } } },
  };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__plain)');
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(4);
  const a = [...el.querySelectorAll('a')].find(n => n.textContent.includes('y.js'));
  assert.ok(a, 'the row is still drawn');
  assert.equal(a.getAttribute('href'), null, 'an href-less anchor is plain text, not a dead link');
});

test('a resolver that throws costs its link and nothing else', async () => {
  // The host reaches into estate state to resolve an owner, so it can fail on a
  // row the crawl has not placed. A pane that threw would take the whole brief
  // down with it for one unresolvable path.
  window.__bad = {
    repo: STORE,
    record: { short: 'h', schema: 3, files: { 'x/y.js': { read: 1 } } },
    fileHref: () => { throw new Error('no such repo'); },
  };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__bad)');
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(2);
  const rows = Alpine.$data(el).fileRows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].href, '');
});

// ── Landing where the address said ──────────────────────────────────────────

test('pane picks the tab, and an unknown one falls back rather than blanking', () => {
  const at = (pane) => {
    window.__p = { repo: STORE, record: { short: 'p', schema: 4 }, pane };
    const el = window.document.createElement('div');
    el.setAttribute('x-data', 'sessionBrief(window.__p)');
    window.document.body.append(el);
    Alpine.initTree(el);
    return Alpine.$data(el).pane;
  };
  assert.equal(at('files'), 'files');
  assert.equal(at('raw'), 'raw');
  assert.equal(at('outline'), 'outline');
  assert.equal(at('nonsense'), 'outline');
  assert.equal(at(undefined), 'outline');
});

test('start opens the deck on one card, which is what makes an exchange addressable', async () => {
  opened.length = 0;
  window.__card = { repo: STORE, record, start: 3 };
  const el = window.document.createElement('div');
  el.setAttribute('x-data', 'sessionBrief(window.__card)');
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(4);
  assert.equal(opened.length, 1, 'the address named a card, so the deck opened on it');
  assert.equal(opened[0].start, 3);
});

// ── The kit chain, and what skipping the fetch must not skip ────────────────

test('a mount handed its record still loads the kit chain', async () => {
  // `load()` short-circuits when the record is already in hand, and until
  // 2026-09-01 it returned BEFORE `ready()`. That path is the one a reader with
  // no token takes (#gz=), and it was giving them the worst copy of the page:
  // no speaker on the deck, no markdown anywhere, markdown markers down every
  // row of the picker. The skip is of the FETCH, never of the renderers.
  loads.length = 0;
  log.length = 0;
  const el = window.document.createElement('div');
  window.__handed = { record, repo: STORE, framed: true };
  el.setAttribute('x-data', 'sessionBrief(window.__handed)');
  window.document.body.append(el);
  Alpine.initTree(el);
  await tick(6);
  const d = Alpine.$data(el);
  assert.equal(d.record.short, 'b8fae678');
  assert.deepEqual(log, [], 'and it still reads nothing from the store');
  assert.ok(loads.includes('kits/read-aloud.js'),
    'the kit the deck speaks with and the picker rows reduce their previews through');
  assert.ok(loads.includes('kits/session-render.js'), 'and the one settle() renders with');
});

test('the brief fills its host, rather than drawing a phone column on a desktop', () => {
  // It carried `mx-auto` with `max-w-2xl`, so a 1280px browser drew a 672px
  // strip down the middle with the rest empty (reported 2026-09-01). The house
  // style names that exact pattern, and the estate's branch list already made
  // the same call: full width once nothing stands beside it to claim the space.
  //
  // Read off the SOURCE, not the DOM, because jsdom compiles no Tailwind and a
  // cap that is present renders as nothing here. The template is the artifact.
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/session-brief.js'), 'utf8');
  const shell = src.match(/<div class="([^"]*)"\s*\n\s*:class="framed \?/);
  assert.ok(shell, 'the outer shell div, the one the framed/standalone class rides');
  assert.doesNotMatch(shell[1], /\bmax-w-|\bmx-auto\b/, shell[1]);
  assert.match(shell[1], /\bw-full\b/);
});

test('the closing reply is markdown, and its rest is a tap rather than a tooltip', async () => {
  // It was `x-text` of a string this component flattened itself, with the whole
  // of it parked in a `title`: a fact with no route on a phone, and the one
  // thing the house style names outright. It is a reply like every other one on
  // this page, so it goes through the kit that renders those.
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/session-brief.js'), 'utf8');
  const at = src.indexOf('x-show="closingRaw"');
  assert.ok(at > 0, 'the block is found by the thing it shows on');
  // To the end of the card, not to the first `</button>`: the control is the
  // label row now, and the body it governs sits after it.
  const block = src.slice(at, src.indexOf('<!-- The switch and the exits', at));
  assert.doesNotMatch(block, /:?title=/, 'no tooltip carries the rest of it');
  // The LABEL is still x-text, and should be: it is a fidelity claim in one
  // word, not the reply.
  assert.doesNotMatch(block, /x-text="closing(Raw)?"/, 'the reply itself is not set as flat text');
  assert.match(block, /x-ref="closingBody"/);
  assert.match(block, /aria-expanded/, 'the block is the control the tooltip used to be');

  // AND IT IS CUT BY HEIGHT, NOT BY `line-clamp`. That utility counts line
  // boxes, which needs inline content; this holds the paragraphs a markdown
  // render returns. Chrome clamps anyway and iOS Safari does not: it keeps the
  // box at the full height of every paragraph and hides only the spill, so the
  // collapsed block reached a phone as three lines over an inch of empty card.
  // The desktop cannot show this failure, which is why the rule is asserted
  // rather than the pixels.
  assert.doesNotMatch(block, /line-clamp/, 'no clamp on a container of blocks');
  assert.match(block, /:style="closingOpen \? '' : CLAMP"/, 'the collapsed state is a style');
  assert.match(src, /CLAMP: 'max-height:\d+px;/, 'and what it sets is a height');
  assert.match(src, /chatRender\.markdown\(md, \{ dense: true \}\)/,
    'through the same renderer every other reply on this page uses');

  // And the flattening it used to do is GONE rather than merely unused: a
  // second markdown-to-text pass sitting here is what would get reached for
  // next time.
  assert.doesNotMatch(src, /speechText/, 'session-brief no longer flattens anything itself');
});

test('the clipped box is not inside the button, because Safari sizes one from its unclipped content', () => {
  // The whole block was a button with the body inside it. The body clipped and
  // the fade landed, and the button stayed as tall as five paragraphs: three
  // lines of text over an inch of empty card, on the phone only. Chrome sizes
  // the button from the clipped child and shows nothing wrong, so this is
  // asserted as structure rather than measured as pixels.
  const el = window.document.getElementById('lent');
  const clip = [...el.querySelectorAll('div')].find(d => /max-height/.test(d.getAttribute('style') || ''));
  assert.ok(clip, 'the collapsed body carries its height inline');
  assert.equal(clip.closest('button'), null, 'and no button is sized by what it hides');
  const btn = [...el.querySelectorAll('button[aria-expanded]')][0];
  assert.ok(btn, 'the control is still there');
  assert.equal(btn.contains(clip), false, 'holding only the small thing you tap');
});

test('a fact carries its definition on data-note, not in a title', () => {
  const d = lent();
  const el = window.document.getElementById('lent');
  // Half the strip is exact about something the plain word is not, so the
  // definitions are load-bearing. They rode in a `title` with `cursor-help`:
  // no touch screen shows one and no screenshot captures one.
  assert.equal(el.querySelectorAll('.cursor-help').length, 0);
  // Scoped to the strip and the head, not the whole view: the icon-only
  // controls below keep a `title`, which is the case rule 11 does sanction, a
  // simple label on a control that also carries an aria-label or is a link
  // naming its own destination. What may not sit in one is a FACT.
  const strip = el.querySelector('.flex.flex-wrap.items-center.gap-x-4');
  assert.ok(strip, 'the facts strip');
  assert.equal(strip.querySelectorAll('[title]').length, 0, 'no fact is stranded in a title');

  // THROUGH THE KIT, NOT A SECOND IMPLEMENTATION OF IT. `kits/note.js` is this
  // estate's tier between a title and a built panel, and a strip definition is
  // what that kit calls its own case: a string a reader looks at. This file
  // hand-rolled a tap-to-reveal line for one commit, which was that kit again
  // with no keyboard, no screen reader and no affordance before the tap.
  const noted = [...el.querySelectorAll('[data-note]')];
  assert.ok(noted.length >= 6, 'every fact and the id');
  const byNote = new Map(noted.map(n => [n.textContent.replace(/\s+/g, ' ').trim(), n.getAttribute('data-note')]));
  for (const f of d.strip) {
    const hit = [...byNote].find(([k]) => k.startsWith(f.k));
    assert.ok(hit, 'strip row ' + f.k + ' is on the page');
    assert.equal(hit[1], f.t, 'and states the definition the strip carries, not a copy of it');
  }
  // The id's own note, pinned by what it must NOT say. It called the id the
  // record's filename stem, which it is not: the stem carries the date as well
  // (2026-08-05-b8fae678), and reading the note as written is what produced a
  // dead session link on 2026-09-05. The positive wording is free to move; the
  // conflation is what has to stay fixed.
  const idNote = noted.find(n => /^\(/.test(n.textContent))?.getAttribute('data-note') || '';
  assert.ok(idNote.length > 20, 'the id carries a definition');
  assert.doesNotMatch(idNote, /filename stem/, 'the id is part of the stem, not the whole of it');
});

test('the kit that draws the notes is in the chain that loads them', () => {
  // A `data-note` with nothing listening is a fact that renders as a dotted
  // underline and says nothing when touched, which is worse than the title it
  // replaced. Nothing else on this page loaded the kit before.
  const src = readFileSync(path.join(repoRoot, 'lib/alpineComponents/session-brief.js'), 'utf8');
  assert.match(src, /'kits\/note\.js'/);
  assert.match(src, /'kits\/closing-state\.js'/);
  // The early return must count every kit the chain loads, or a host that
  // already has the first three skips the rest and the page renders half-drawn.
  assert.match(src, /&& window\.Note && window\.ClosingState\) return;/,
    'the early return counts them, or the chain never runs');
});

test('the page tells the brief that no embedder draws its header', () => {
  // `framed` on the PAGE means it sits in an iframe; `framed` on the BRIEF
  // means a host draws the title and the id. The first is true of a toss and
  // the second is true only of show-repo's Sessions pane, which mounts the
  // COMPONENT rather than this page. Passing one for the other left a tossed
  // session with no title and no id anywhere on screen.
  const page = readFileSync(path.join(repoRoot, 'pages/session.html'), 'utf8');
  assert.match(page, /opts = \{ \.\.\.opts, framed: false,/,
    'the page hands the brief a literal, not its own iframe test');
  assert.doesNotMatch(page, /framed: this\.framed/, 'and no address form still passes it through');
  // The page keeps its own flag, which still stands its address bar down.
  assert.match(page, /x-show="!framed \|\| !target"/);
});
