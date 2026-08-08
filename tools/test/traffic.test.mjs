// traffic.js is the pure read behind the FAB's Traffic tab, and its whole
// reason for existing is that a byte figure is easy to state and easy to state
// dishonestly. So the tests are mostly about the three states a size can be in
// (real, cached, undisclosed) and about totals refusing to absorb the third.
//
// The collection half (gh-boot's fetch and get wrappers) is exercised for real
// at the bottom: the source runs against a window stub, so the ledger, the cap,
// the running totals, and the inlined-vs-fetched tell are executed rather than
// pattern-matched.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './bootstrap.mjs';

const src = readFileSync(path.join(repoRoot, 'lib/kits/traffic.js'), 'utf8');
const window = {};
new Function('window', src)(window);
const T = window.Traffic;

// A Resource Timing entry, in the three shapes a browser actually produces.
const netRow = (name, transfer, decoded, extra = {}) =>
  ({ name, transferSize: transfer, encodedBodySize: Math.round(transfer * 0.9), decodedBodySize: decoded, duration: 100, startTime: 0, initiatorType: 'script', ...extra });
const cachedRow = (name, decoded) =>
  ({ name, transferSize: 0, encodedBodySize: Math.round(decoded * 0.3), decodedBodySize: decoded, duration: 2, startTime: 0, initiatorType: 'script' });
const opaqueRow = (name) =>
  ({ name, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0, duration: 40, startTime: 0, initiatorType: 'script' });

test('fmtBytes keeps the shape of the figures that matter', () => {
  assert.equal(T.fmtBytes(0), '0 B');
  assert.equal(T.fmtBytes(900), '900 B');
  assert.equal(T.fmtBytes(1024), '1.0 KB');
  assert.equal(T.fmtBytes(417435), '408 KB');
  assert.equal(T.fmtBytes(1460047), '1.39 MB');
  // Unknown is never rendered as zero, at any level of the stack.
  assert.equal(T.fmtBytes(null), '?');
  assert.equal(T.fmtBytes(undefined), '?');
  assert.equal(T.fmtBytesShort(1460047), '1.4 MB');
  assert.equal(T.fmtCount(14952), '15k');
  assert.equal(T.fmtCount(4952), '5k');
  assert.equal(T.fmtCount(120), '120');
});

test('classify names GitHub endpoints by shape, and everything else by host', () => {
  const g = u => T.classify(u).group;
  assert.equal(g('https://api.github.com/graphql'), 'graphql');
  assert.equal(g('https://api.github.com/repos/o/r/contents/lib/x.js?ref=main'), 'contents');
  assert.equal(g('https://api.github.com/repos/o/r/git/blobs/abc'), 'contents');
  assert.equal(g('https://api.github.com/repos/o/r/git/trees/main?recursive=1'), 'trees');
  assert.equal(g('https://api.github.com/repos/o/r/commits?sha=main'), 'commits');
  assert.equal(g('https://api.github.com/repos/o/r/commits/abc123'), 'commits');
  assert.equal(g('https://api.github.com/repos/o/r/branches'), 'branches');
  assert.equal(g('https://api.github.com/repos/o/r/pulls?state=open'), 'pulls');
  assert.equal(g('https://api.github.com/rate_limit'), 'meta');
  assert.equal(g('https://api.github.com/repos/o/r/something-new'), 'api', 'an unrecognized API path still reads as the API');
  assert.equal(g('https://cdn.jsdelivr.net/npm/x'), 'cdn');
  assert.equal(g('https://raw.githubusercontent.com/o/r/main/f.js'), 'raw');
  // An unexpected host groups under its own name rather than vanishing into a
  // catch-all, so a page pulling from somewhere new says where.
  assert.equal(g('https://tracker.example.com/beacon'), 'tracker.example.com');
});

test('label collapses a jsDelivr combine URL instead of wrapping four lines', () => {
  assert.equal(
    T.label('https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5,npm/@tailwindcss/typography/dist/typography.min.css'),
    'daisyui@5/themes.css +2');
  assert.equal(T.label('https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js'), 'cdn.min.js');
  assert.equal(T.label('https://example.com/a/b/'), 'b');
  // A generic filename borrows its folder, or a resource list turns into eight
  // rows reading "style.css".
  assert.equal(T.label('https://example.com/pkg/index.js'), 'pkg/index.js');
  assert.equal(T.label('https://cdn.jsdelivr.net/npm/daisyui/components/collapse/style.css'), 'collapse/style.css');
  assert.equal(T.label('https://cdn.jsdelivr.net/npm/daisyui/components/collapse.css'), 'collapse.css');
});

test('a row is network, cached, or undisclosed, and the three are distinguishable', () => {
  assert.equal(T.bootRow(netRow('https://x/a.js', 1000, 3000)).state, 'network');
  // Cache hit: nothing transferred, but the body is still there.
  assert.equal(T.bootRow(cachedRow('https://x/a.js', 3000)).state, 'cached');
  // Cross-origin with no Timing-Allow-Origin: all three zero. The size is
  // unknowable, which is not the same claim as zero.
  const o = T.bootRow(opaqueRow('https://other/a.js'));
  assert.equal(o.state, 'undisclosed');
  assert.equal(o.wire, null);
  assert.equal(o.decoded, null);
});

test('boot totals exclude undisclosed rows and report how many they excluded', () => {
  const b = T.boot([
    netRow('https://cdn.jsdelivr.net/npm/a.js', 70164, 282666),
    netRow('https://mehrlander.github.io/web-tools/dist/web-tools.js', 417435, 1460047),
    cachedRow('https://mehrlander.github.io/web-tools/lib/favicon.svg', 400),
    opaqueRow('https://unknown.example/x.js'),
  ], { name: 'https://mehrlander.github.io/p.html', transferSize: 81941, encodedBodySize: 81941, decodedBodySize: 260000, duration: 300, startTime: 0 });

  assert.equal(b.count, 5);
  assert.equal(b.cached, 1);
  assert.equal(b.undisclosed, 1);
  assert.equal(b.wire, 70164 + 417435 + 81941, 'cached (0) adds nothing and undisclosed is not counted as 0');
  assert.equal(b.decoded, 282666 + 1460047 + 400 + 260000);
  // Heaviest first: the pre-build leads, which is the finding the band exists
  // to make obvious.
  assert.match(b.rows[0].name, /web-tools\.js$/);
  assert.equal(b.rows[0].group, 'code');
});

test('the navigation entry becomes the document row', () => {
  const b = T.boot([], { name: 'https://x/p.html', transferSize: 100, encodedBodySize: 100, decodedBodySize: 400, duration: 10, startTime: 0 });
  assert.equal(b.rows.length, 1);
  assert.equal(b.rows[0].group, 'document');
});

test('boot rows group by role, and a group carries its own undisclosed count', () => {
  const b = T.boot([
    netRow('https://cdn.jsdelivr.net/npm/daisyui@5/themes.css', 94688, 1262704),
    netRow('https://mehrlander.github.io/web-tools/dist/web-tools.js', 417435, 1460047),
    netRow('https://cdn.jsdelivr.net/npm/@phosphor-icons/web/src/regular/Phosphor.woff2', 5000, 5000),
    opaqueRow('https://cdn.jsdelivr.net/npm/mystery.js'),
  ], null);
  const g = Object.fromEntries(T.bootGroups(b.rows).map(x => [x.group, x]));
  assert.equal(g.cdn.count, 2, 'the stylesheet and the opaque one; the font left for its own group');
  assert.equal(g.font.count, 1);
  assert.equal(g.code.wire, 417435);
  assert.equal(g.cdn.undisclosed, 1);
  assert.equal(g.cdn.wire, 94688, 'the undisclosed row contributes nothing to its group total either');
});

test('a .woff2 is a font whatever host serves it', () => {
  const r = T.bootRow(netRow('https://cdn.jsdelivr.net/npm/@phosphor-icons/web/src/bold/Phosphor-Bold.woff2', 5000, 5000));
  assert.equal(r.group, 'font');
});

test('API groups roll by shape, and a missing content-length stays unknown', () => {
  const entries = [
    { url: 'https://api.github.com/repos/o/r/commits?sha=main', ms: 120, status: 200, wire: 4000 },
    { url: 'https://api.github.com/repos/o/r/commits/abc', ms: 90, status: 200, wire: 8000 },
    { url: 'https://api.github.com/repos/o/r/contents/a.js', ms: 60, status: 200, wire: null },
    { url: 'https://api.github.com/repos/o/r/contents/b.js', ms: 60, status: 404, wire: 200, error: null },
    { url: 'https://api.github.com/graphql', ms: 300, status: 200, wire: 12000 },
  ];
  const groups = Object.fromEntries(T.apiGroups(entries).map(g => [g.group, g]));
  assert.equal(groups.commits.calls, 2);
  assert.equal(groups.commits.wire, 12000);
  assert.equal(groups.contents.calls, 2);
  assert.equal(groups.contents.unknown, 1, 'the one with no content-length is counted, not summed');
  assert.equal(groups.contents.wire, 200);
  assert.equal(groups.contents.errors, 1);

  const tot = T.apiTotals(entries);
  assert.equal(tot.calls, 5);
  assert.equal(tot.wire, 4000 + 8000 + 200 + 12000);
  assert.equal(tot.unknown, 1);
  assert.equal(tot.errors, 1);
  assert.equal(tot.ms, 630);
  assert.equal(tot.slowest, 300);
});

test('a write is counted apart from a read, at both levels', () => {
  const entries = [
    { url: 'https://api.github.com/repos/o/r/contents/a.js', method: 'GET', ms: 10, status: 200, wire: 100 },
    { url: 'https://api.github.com/repos/o/r/contents/a.js', method: 'PUT', ms: 40, status: 200, wire: 300 },
    { url: 'https://api.github.com/repos/o/r/contents/b.js', method: 'DELETE', ms: 30, status: 200, wire: 90 },
    { url: 'https://api.github.com/repos/o/r/commits', method: 'GET', ms: 10, status: 200, wire: 100 },
  ];
  assert.equal(T.apiTotals(entries).writes, 2);
  const g = Object.fromEntries(T.apiGroups(entries).map(x => [x.group, x]));
  // The point of the whole column: the write and the read share an endpoint
  // shape, so nothing but the method separates them.
  assert.equal(g.contents.calls, 3);
  assert.equal(g.contents.writes, 2);
  assert.equal(g.commits.writes, 0);

  // Case is not the caller's problem, and an absent method reads as a write:
  // the ledger reports what it saw, and unknown is nearer to "look at this"
  // than to "routine read".
  assert.equal(T.isWrite({ method: 'put' }), true);
  assert.equal(T.isWrite({ method: 'get' }), false);
  assert.equal(T.isWrite({ method: 'HEAD' }), false);
  assert.equal(T.isWrite({}), false, 'no method at all defaults to GET, which is what fetch does');
});

test('repoOf reads the target repo out of every address form we use', () => {
  assert.equal(T.repoOf('https://api.github.com/repos/mehrlander/home/contents/x?ref=main'), 'mehrlander/home');
  assert.equal(T.repoOf('https://api.github.com/repos/o/r/commits/abc'), 'o/r');
  assert.equal(T.repoOf('https://raw.githubusercontent.com/o/r/main/f.js'), 'o/r');
  assert.equal(T.repoOf('https://cdn.jsdelivr.net/gh/o/r@main/lib/x.js'), 'o/r');
  assert.equal(T.repoOf('https://data.jsdelivr.com/v1/packages/gh/o/r@main?structure=flat'), 'o/r');
  // A GraphQL POST names its repo in the body, and the ledger does not read
  // bodies. Null, not a guess.
  assert.equal(T.repoOf('https://api.github.com/graphql'), null);
  assert.equal(T.repoOf('https://example.com/x'), null);
});

test('the repo cut separates a crawl from browsing, and still adds up', () => {
  const entries = [
    // A config crawl: one call each across four repos.
    ...['home', 'budget-wa', 'spend-wa', 'fn-data'].map(r =>
      ({ url: `https://api.github.com/repos/mehrlander/${r}/contents/.web-tools.json`, ms: 90, status: 200, wire: 2000 })),
    // Browsing one repo.
    { url: 'https://api.github.com/repos/mehrlander/web-tools/commits', ms: 100, status: 200, wire: 4000 },
    { url: 'https://api.github.com/repos/mehrlander/web-tools/branches', ms: 100, status: 200, wire: 5000 },
    // A write to the private registry.
    { url: 'https://api.github.com/repos/mehrlander/web-tools-private/contents/state/activity.json', method: 'PUT', ms: 200, status: 200, wire: 800 },
    // And one the URL cannot attribute.
    { url: 'https://api.github.com/graphql', ms: 300, status: 200, wire: 9000 },
  ];
  const rows = T.repoGroups(entries);
  assert.equal(rows.reduce((n, r) => n + r.calls, 0), entries.length, 'every call lands somewhere');
  const by = Object.fromEntries(rows.map(r => [r.repo, r]));
  assert.equal(by['mehrlander/web-tools'].calls, 2);
  assert.equal(by['mehrlander/home'].calls, 1);
  assert.equal(by['mehrlander/web-tools-private'].writes, 1);
  // Four repos at one call each is the crawl's signature, and no endpoint
  // grouping shows it: all four are the same `contents` shape.
  assert.equal(rows.filter(r => r.named && r.calls === 1 && !r.writes).length, 4);
  // The unattributable bucket sorts last, since it is a caveat not a finding.
  assert.equal(rows[rows.length - 1].named, false);
  assert.equal(rows[rows.length - 1].calls, 1);
});

test('a call carrying `via` is a code load, whatever endpoint it used', () => {
  const load = { url: 'https://api.github.com/repos/o/r/contents/lib/x.js?ref=main', via: 'lib/x.js', ms: 40, status: 200, wire: 900 };
  const read = { url: 'https://api.github.com/repos/o/r/contents/data.js?ref=main', ms: 40, status: 200, wire: 900 };
  assert.equal(T.classify(load.url, load).group, 'load');
  assert.equal(T.classify(read.url, read).group, 'contents', 'the identical endpoint, without via, stays a plain file read');
  const g = Object.fromEntries(T.apiGroups([load, read]).map(x => [x.group, x]));
  assert.equal(g.load.calls, 1);
  assert.equal(g.contents.calls, 1);
});

test('the readout line carries three facts, and omits what it does not know', () => {
  const b = T.boot([netRow('https://x/a.js', 680000, 3000000)], null);
  assert.equal(T.summary({ boot: b, api: { calls: 12 }, rate: 4952 }), '664 KB · 12 calls · 5k left');
  assert.equal(T.summary({ boot: b, api: { calls: 1 }, rate: null }), '664 KB · 1 call',
    'no rate header seen yet means no rate claim');
  assert.equal(T.summary({ boot: b, api: { calls: 0 }, rate: null }), '664 KB');

  // Every row withheld its size: there is no weight to report, and "0 B" would
  // be the most confident wrong number the strip could print.
  const blind = T.boot([opaqueRow('https://a/x.js'), opaqueRow('https://b/y.js')], null);
  assert.equal(blind.wire, 0);
  assert.equal(blind.undisclosed, blind.count);
  assert.equal(T.summary({ boot: blind, api: { calls: 3 }, rate: null }), 'size undisclosed · 3 calls');
});

test('storageRows counts UTF-16 bytes for keys and values, biggest first', () => {
  const store = (() => {
    const m = new Map([['ghToken', 'x'.repeat(40)], ['tiny', 'a']]);
    const keys = [...m.keys()];
    return { get length() { return keys.length; }, key: i => keys[i], getItem: k => m.get(k) };
  })();
  const r = T.storageRows(store, 'localStorage');
  assert.equal(r.keys, 2);
  assert.equal(r.bytes, ('ghToken'.length + 40) * 2 + ('tiny'.length + 1) * 2);
  assert.equal(r.top[0].key, 'ghToken');
  assert.equal(T.storageRows(null, 'x'), null, 'a blocked or absent store reports nothing, it does not throw');
});

// ── The collection half, executed ─────────────────────────────────────────
// gh-boot is network-bound as a whole, so this runs it against a window stub
// with every load stubbed out, then drives the wrappers it installed.

async function bootWithStub({ fetchImpl, getImpl } = {}) {
  const boot = readFileSync(path.join(repoRoot, 'lib/gh-boot.js'), 'utf8');
  const events = [];
  class FakeGH {
    async load() {}
    async get(p) { return getImpl ? getImpl(p) : { text: 'x', sha: 'deadbeef', size: 1 }; }
    async read() {}
  }
  const win = {
    gh: new FakeGH(),
    fetch: fetchImpl || (async () => ({ status: 200, headers: { get: () => null } })),
    addEventListener() {},
    dispatchEvent(e) { events.push(e.type); },
  };
  win.gh.load = async () => {};
  // gh-boot is run by the loader as new Function('gh', src)(scopedGh), so the
  // scoped loader arrives as a bare identifier, not through window.
  const fn = new Function('gh', 'window', 'CustomEvent', 'performance', 'setTimeout', 'clearTimeout', 'document', 'console', boot);
  await fn(win.gh, win, CustomEvent, performance, setTimeout, clearTimeout, undefined, console);
  return { win, events, proto: Object.getPrototypeOf(win.gh) };
}

test('the fetch wrapper records a call without touching the body', async () => {
  let bodyRead = false;
  const body = { status: 200, headers: { get: h => (h === 'content-length' ? '4096' : h === 'x-ratelimit-remaining' ? '4952' : null) },
                 text() { bodyRead = true; return Promise.resolve('{}'); } };
  const { win } = await bootWithStub({ fetchImpl: async () => body });

  const res = await win.fetch('https://api.github.com/repos/o/r/commits');
  assert.equal(res, body, 'the very same Response object is handed back');
  assert.equal(bodyRead, false, 'the instrument never reads or clones the body');

  assert.equal(win.__traffic.length, 1);
  assert.equal(win.__traffic[0].wire, 4096);
  assert.equal(win.__traffic[0].status, 200);
  assert.equal(win.__trafficTotals.calls, 1);
  assert.equal(win.__trafficTotals.wire, 4096);
  assert.equal(win.__trafficRate, 4952, 'the rate limit is picked up in passing');
});

test('the wrapper records the method, from init or from a Request', async () => {
  const { win } = await bootWithStub({ fetchImpl: async () => ({ status: 200, headers: { get: () => null } }) });
  await win.fetch('https://api.github.com/repos/o/r/contents/a.js');
  await win.fetch('https://api.github.com/repos/o/r/contents/a.js', { method: 'put' });
  await win.fetch({ url: 'https://api.github.com/repos/o/r/contents/b.js', method: 'DELETE' });
  assert.deepEqual(win.__traffic.map(e => e.method), ['GET', 'PUT', 'DELETE']);
  assert.equal(win.__trafficTotals.writes, 2, 'reads are not writes and the count says so');
  assert.equal(win.__trafficTotals.calls, 3);
});

test('a response with no content-length is unknown, not zero', async () => {
  const { win } = await bootWithStub({ fetchImpl: async () => ({ status: 200, headers: { get: () => null } }) });
  await win.fetch('https://api.github.com/repos/o/r/commits');
  assert.equal(win.__traffic[0].wire, null);
  assert.equal(win.__trafficTotals.wire, 0);
  assert.equal(win.__trafficTotals.unknown, 1);
});

test('a failed fetch is recorded and still rejects', async () => {
  const { win } = await bootWithStub({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(() => win.fetch('https://api.github.com/x'), /offline/);
  assert.equal(win.__traffic[0].error, 'offline');
  assert.equal(win.__trafficTotals.errors, 1);
});

test('the ledger is capped but its totals are not', async () => {
  const { win } = await bootWithStub({ fetchImpl: async () => ({ status: 200, headers: { get: h => (h === 'content-length' ? '10' : null) } }) });
  for (let i = 0; i < 450; i++) await win.fetch('https://api.github.com/repos/o/r/commits/' + i);
  assert.equal(win.__traffic.length, 400, 'the row list is bounded');
  assert.equal(win.__trafficTotals.calls, 450, 'the count is not');
  assert.equal(win.__trafficTotals.wire, 4500, 'and neither is the byte figure');
  assert.ok(win.__trafficTotals.trimmed > 0, 'and the tab can say rows were dropped');
});

test('the via marker attributes the right fetch, even with gets interleaved', async () => {
  // The claim the whole mechanism rests on: between entering get() and the
  // fetch() call there is no await, so a synchronous marker cannot be captured
  // by a concurrent get. Reasoning like that stops holding the moment someone
  // adds an await, so it is executed here rather than trusted.
  //
  // The stub reproduces gh-api's shape exactly: get calls req synchronously,
  // req runs synchronously as far as fetch(url), and only then awaits.
  const boot = readFileSync(path.join(repoRoot, 'lib/gh-boot.js'), 'utf8');
  const resolvers = [];
  const win = {
    fetch: () => new Promise(res => resolvers.push(() => res({ status: 200, headers: { get: () => null } }))),
    addEventListener() {}, dispatchEvent() {},
  };
  class StubGH {
    async req(p) { return win.fetch('https://api.github.com/repos/o/r/' + p).then(() => ({ content: '', sha: 'x', size: 0 })); }
    async get(p) { const d = await this.req('contents/' + p); return { text: '', sha: d.sha, size: 0 }; }
    async load() {} async read() {}
  }
  win.gh = new StubGH();
  win.gh.load = async () => {};
  const fn = new Function('gh', 'window', 'CustomEvent', 'performance', 'setTimeout', 'clearTimeout', 'document', 'console', boot);
  await fn(win.gh, win, CustomEvent, performance, setTimeout, clearTimeout, undefined, console);

  // Three gets fired without awaiting between them: maximal interleaving.
  const all = Promise.all([win.gh.get('a.js'), win.gh.get('b.js'), win.gh.get('c.js')]);
  assert.equal(win.__traffic.length, 3, 'all three requests are in flight at once');
  assert.deepEqual(win.__traffic.map(e => e.via), ['a.js', 'b.js', 'c.js'],
    'each call kept its own path; none captured a neighbour');
  assert.equal(win.__ghGetPath, null, 'and the marker does not leak past the synchronous window');
  // A bare fetch alongside them carries no via at all. Asserted before the
  // resolvers run, since the ledger row is pushed synchronously and the
  // responses are what this stub holds open.
  const bare = win.fetch('https://api.github.com/repos/o/r/commits');
  assert.equal(win.__traffic[3].via, null);

  resolvers.forEach(r => r());
  await Promise.all([all, bare]);
});

test('the get wrapper tells an inlined module from a fetched one', async () => {
  const { win } = await bootWithStub({
    getImpl: async p => (p === 'lib/cached.js'
      ? { text: 'abc', sha: 'build:main', size: 3 }
      : { text: 'abcdef', sha: '9f1c2d', size: 6 }),
  });
  await win.gh.get('lib/cached.js');
  await win.gh.get('lib/fetched.js');
  assert.equal(win.__ghFiles['lib/cached.js'].inlined, true, 'the pre-build stamps sha build:<ref> on what it serves from memory');
  assert.equal(win.__ghFiles['lib/cached.js'].bytes, 3);
  assert.equal(win.__ghFiles['lib/fetched.js'].inlined, false);
  assert.equal(win.__ghFiles['lib/fetched.js'].bytes, 6);
});

test('gh-boot loads traffic.js in the chain, so the readout is never waiting on it', () => {
  const boot = readFileSync(path.join(repoRoot, 'lib/gh-boot.js'), 'utf8');
  assert.match(boot, /\{ path: 'kits\/traffic\.js' \}/, 'the BOOT manifest carries the traffic kit');
  // The wrappers must be installed before the chain pulls anything, or the
  // ledger opens with its own dependencies already missing from it.
  const wrap = boot.indexOf('__trafficWrapped');
  const chain = boot.indexOf('for (const step of BOOT)');
  assert.ok(wrap !== -1 && chain !== -1 && wrap < chain, 'collection is installed before the chain runs');
});
