// traffic.js: the pure read of what a page has pulled over the network, and the
// vocabulary the FAB's Traffic tab renders. Collection lives in gh-boot.js,
// which wraps window.fetch and GH.prototype.get to fill window.__traffic and
// window.__ghFiles. Everything here is a pure function over that ledger plus the
// browser's Resource Timing entries, so it unit-tests against plain objects and
// costs nothing until the tab is opened.
//
// Three questions get called "size" here, and they do not share a unit:
//
//   BOOT      what one page load cost. Fixed, cacheable, measured by Resource
//             Timing. Answers "why is this slow on a phone".
//   API       what browsing has spent since. Grows as you go, measured by the
//             fetch wrapper reading content-length. Answers "what is this
//             pulling", and it is the one a rate limit bounds.
//   RESIDENT  what the app is holding locally. Not traffic, same question.
//
// The honesty rules are most of why this file exists rather than a few inline
// sums in the component:
//
//   - transferSize 0 against a NONZERO body size means served from cache. It is
//     not a free resource, it is a resource you already paid for.
//   - all three sizes 0 on a cross-origin row means the origin sent no
//     Timing-Allow-Origin header, so the size is UNDISCLOSED, not zero. jsDelivr
//     sends it (verified 2026-08-05), api.github.com does not. An undisclosed
//     row must never be summed into a figure that reads as complete, which is
//     why every total here carries its own undisclosed count.
//   - transferSize counts response headers along with the body, so a boot total
//     runs a few hundred bytes per row above the payload it describes.
//   - content-length on an API response is the COMPRESSED body as sent, which is
//     the wire figure we want. It is absent on chunked responses; absent is
//     recorded as null and reported as unknown, never as zero.

(function () {
  const KB = 1024;

  // ── Formatting ────────────────────────────────────────────────────────────
  // Binary units, one decimal from KB up, because the readings that matter here
  // (417 KB, 1.4 MB) lose their shape when rounded to whole units.
  function fmtBytes(n) {
    if (n == null || !isFinite(n)) return '?';
    if (n < 0) return '?';
    if (n < KB) return n + ' B';
    if (n < KB * KB) return (n / KB).toFixed(n < 10 * KB ? 1 : 0) + ' KB';
    return (n / KB / KB).toFixed(2) + ' MB';
  }

  // Compact, for a header chip where a digit of precision is worth less than
  // the space it takes: 417 KB stays 417 KB, 1,433,600 becomes 1.4 MB.
  function fmtBytesShort(n) {
    if (n == null || !isFinite(n) || n < 0) return '?';
    if (n < KB) return n + ' B';
    if (n < KB * KB) return Math.round(n / KB) + ' KB';
    return (n / KB / KB).toFixed(1) + ' MB';
  }

  function fmtMs(ms) {
    if (ms == null || !isFinite(ms)) return '';
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + 's';
  }

  function fmtCount(n) {
    if (n == null || !isFinite(n)) return '?';
    if (n < 1000) return String(n);
    if (n < 100000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.round(n / 1000) + 'k';
  }

  // ── Classification ────────────────────────────────────────────────────────
  // Grouping by endpoint SHAPE, and it is worth being exact about what that
  // does and does not tell you, because the obvious reading is wrong.
  //
  // What it gives: a mechanical, unfalsifiable statement of WHAT KIND of call
  // was made. A URL cannot lie about which endpoint it hit.
  //
  // What it does NOT give: who made it. The endpoints are shared, heavily.
  // `contents/` is hit by gh.get (so every load() and read()), gh-fetch,
  // gh-store's WRITES, gh-transfer, and the config crawl. `commits` is hit by
  // branch-survey's crawl, recentFiles, gh-fetch's history reads, and
  // show-repo's per-file sidebar lookup. So "forty calls to commits" does not
  // identify the crawl, and an earlier version of this comment claimed it did.
  //
  // Caller attribution is possible but not free: it needs the callers to tag
  // themselves, the way gh.load stamps `by` through a Proxy on `this` (a method
  // calling this.req would resolve through the same proxy, so gh.tagged('x')
  // would carry downstream). Not done here. What is NOT possible is inferring
  // it: there is no reliable async caller context in a browser, and the scripts
  // registry already refused stack sniffing because gh-api.js runs loaded files
  // as anonymous Function bodies, where a stack names nobody.
  //
  // The method column is the axis that does separate something real, and it
  // separates the thing that matters most: a write from a read.
  const API_SHAPES = [
    [/\/graphql\b/, 'graphql', 'GraphQL'],
    [/\/repos\/[^/]+\/[^/]+\/(contents|readme)\b/, 'contents', 'file contents'],
    [/\/repos\/[^/]+\/[^/]+\/git\/blobs\b/, 'contents', 'file contents'],
    [/\/repos\/[^/]+\/[^/]+\/git\/trees\b/, 'trees', 'file trees'],
    [/\/repos\/[^/]+\/[^/]+\/commits\b/, 'commits', 'commits'],
    [/\/repos\/[^/]+\/[^/]+\/(branches|git\/refs|git\/matching-refs)\b/, 'branches', 'branches'],
    [/\/repos\/[^/]+\/[^/]+\/(pulls|issues)\b/, 'pulls', 'pulls & issues'],
    [/\/repos\/[^/]+\/[^/]+\/(compare|contributors|languages|topics)\b/, 'repometa', 'repo metadata'],
    [/\/search\//, 'search', 'search'],
    [/\/rate_limit\b/, 'meta', 'rate limit'],
    [/\/(user|users)\b/, 'meta', 'user'],
  ];

  const HOSTS = [
    ['api.github.com', 'api', 'GitHub API'],
    ['raw.githubusercontent.com', 'raw', 'raw.githubusercontent'],
    ['cdn.jsdelivr.net', 'cdn', 'jsDelivr'],
    ['data.jsdelivr.com', 'cdn', 'jsDelivr data'],
    ['unpkg.com', 'cdn', 'unpkg'],
    ['esm.sh', 'cdn', 'esm.sh'],
  ];

  function hostOf(url) {
    const s = String(url || '');
    const m = s.match(/^[a-z]+:\/\/([^/?#]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  // { host, group, label } for one URL. `group` is the roll-up key, `label` its
  // human name. Anything unrecognized groups under its own hostname rather than
  // a catch-all, so a page pulling from somewhere unexpected says where.
  // The repo a call was aimed at, pulled straight out of the URL. Free, and it
  // is the axis that separates a crawl from browsing: an estate crawl touches
  // many repos, browsing touches one. Null where the URL carries no repo, which
  // is honest rather than awkward: a GraphQL POST names its repo in the body,
  // and the ledger does not read bodies.
  function repoOf(url) {
    const s = String(url || '');
    let m = s.match(/api\.github\.com\/repos\/([^/?#]+)\/([^/?#]+)/);
    if (m) return m[1] + '/' + m[2];
    m = s.match(/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)/);
    if (m) return m[1] + '/' + m[2];
    m = s.match(/cdn\.jsdelivr\.net\/gh\/([^/@?#]+)\/([^/@?#]+)/);
    if (m) return m[1] + '/' + m[2];
    m = s.match(/data\.jsdelivr\.com\/v1\/packages\/gh\/([^/@?#]+)\/([^/@?#]+)/);
    if (m) return m[1] + '/' + m[2];
    return null;
  }

  function classify(url, entry) {
    // A call carrying `via` was the loader fetching own code or data through
    // gh.load()/read(). It hits the same contents/ endpoint as everything else,
    // so nothing in the URL could tell you, and the difference is the one a
    // reader actually wants: the library pulling itself in, versus the page
    // reading something.
    if (entry && entry.via) return { host: 'api.github.com', group: 'load', label: 'code & data loads' };
    const s = String(url || '');
    const host = hostOf(s);
    if (host === 'api.github.com') {
      for (const [re, group, label] of API_SHAPES) if (re.test(s)) return { host, group, label };
      return { host, group: 'api', label: 'GitHub API' };
    }
    for (const [h, group, label] of HOSTS) if (host === h) return { host, group, label };
    if (!host) return { host: '', group: 'page', label: 'this page' };
    return { host, group: host, label: host };
  }

  // A readable name for a URL row. jsDelivr's /combine/ URLs carry every
  // package in the path and are the widest rows on the boot table, so they
  // collapse to "first +N" rather than wrapping over four lines.
  function label(url) {
    const s = String(url || '');
    try {
      const u = new URL(s, 'https://x.invalid');
      if (/\/combine\//.test(u.pathname)) {
        const parts = u.pathname.replace(/^\/combine\//, '').split(',');
        const first = (parts[0] || '').replace(/^npm\//, '').replace(/^gh\//, '');
        return parts.length > 1 ? first + ' +' + (parts.length - 1) : first;
      }
      const segs = u.pathname.split('/').filter(Boolean);
      if (!segs.length) return u.hostname || s;
      const last = segs[segs.length - 1];
      // A generic filename names nothing on its own, and a list of eight rows
      // all reading "style.css" is worse than no list: borrow the folder. Seen
      // for real on the first render of the Boot band, where daisyUI's
      // per-component stylesheets collapsed into one repeated word.
      if (segs.length > 1 && /^(index|main|style|styles|bundle)\.[a-z]+$/i.test(last)) return segs.slice(-2).join('/');
      return last;
    } catch (e) { return s; }
  }

  // ── Boot: the Resource Timing read ────────────────────────────────────────
  // One row per resource the browser fetched declaratively or otherwise, with
  // its state resolved to one of three words. `state` is the whole point: a
  // number without it is a claim the data does not support.
  //
  //   network      real bytes crossed the wire
  //   cached       served locally; the body size is known, the transfer was 0
  //   undisclosed  cross-origin with no Timing-Allow-Origin; size unknowable
  function bootRow(e) {
    const wire = num(e.transferSize);
    const enc = num(e.encodedBodySize);
    const dec = num(e.decodedBodySize);
    const undisclosed = wire === 0 && enc === 0 && dec === 0;
    const cached = !undisclosed && wire === 0 && dec > 0;
    const c = classify(e.name);
    return {
      name: String(e.name || ''),
      short: label(e.name),
      group: e.entryType === 'navigation' ? 'document' : bootGroup(e, c),
      host: c.host,
      kind: e.initiatorType || e.entryType || '',
      wire: undisclosed ? null : wire,
      decoded: undisclosed ? null : dec,
      ms: num(e.duration),
      start: num(e.startTime),
      state: undisclosed ? 'undisclosed' : (cached ? 'cached' : 'network'),
    };
  }

  // Boot rows group by ROLE, not by host, because the question the band answers
  // is "what did this page spend its weight on": the app's own code, the
  // third-party CSS and JS it stands on, the fonts, the document itself.
  function bootGroup(e, c) {
    const n = String(e.name || '');
    if (/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(n)) return 'font';
    if (c.group === 'cdn') return 'cdn';
    if (c.group === 'api' || c.group === 'raw') return 'api';
    if (/\.(png|jpe?g|gif|svg|webp|avif)(\?|$)/i.test(n)) return 'image';
    if (/\.css(\?|$)/i.test(n)) return 'css';
    if (/\.(m?js)(\?|$)/i.test(n) || e.initiatorType === 'script') return 'code';
    return 'other';
  }

  const GROUP_LABEL = {
    document: 'document', code: 'own code', css: 'stylesheet', cdn: 'CDN library',
    font: 'font', image: 'image', api: 'API', other: 'other',
  };

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  // The whole boot read: rows heaviest first, plus the totals and the two
  // counts that qualify them. `ms` is the wall clock to the last resource's
  // end, not the sum of durations, since the loads overlap.
  function boot(entries, navEntry) {
    const src = [];
    if (navEntry) src.push({ ...navEntry, entryType: 'navigation', name: navEntry.name || 'document' });
    for (const e of entries || []) src.push(e);
    const rows = src.map(bootRow);
    const known = rows.filter(r => r.state !== 'undisclosed');
    return {
      rows: rows.sort((a, b) => (b.wire ?? -1) - (a.wire ?? -1)),
      wire: known.reduce((s, r) => s + (r.wire || 0), 0),
      decoded: known.reduce((s, r) => s + (r.decoded || 0), 0),
      ms: rows.reduce((m, r) => Math.max(m, r.start + r.ms), 0),
      count: rows.length,
      cached: rows.filter(r => r.state === 'cached').length,
      undisclosed: rows.filter(r => r.state === 'undisclosed').length,
    };
  }

  // Roll boot rows up by group for the summary line above the table.
  function bootGroups(rows) {
    const by = new Map();
    for (const r of rows || []) {
      const g = by.get(r.group) || { group: r.group, label: GROUP_LABEL[r.group] || r.group, count: 0, wire: 0, decoded: 0, undisclosed: 0 };
      g.count++;
      if (r.state === 'undisclosed') g.undisclosed++;
      else { g.wire += r.wire || 0; g.decoded += r.decoded || 0; }
      by.set(r.group, g);
    }
    return [...by.values()].sort((a, b) => b.wire - a.wire);
  }

  // ── API: the ledger read ──────────────────────────────────────────────────
  // Entries are what gh-boot's fetch wrapper recorded: { url, t, ms, status,
  // wire, error }. `wire` is null when the response carried no content-length,
  // and that stays null all the way to the display rather than becoming a zero
  // that quietly deflates a total.
  // A call that changes something on the other end, which is a different kind
  // of event from a read and has to be countable as one. Anything that is not
  // plainly GET or HEAD counts, including an absent method: the ledger records
  // what it saw, and "unknown" is nearer to a write than to a read for the
  // purpose of deciding whether to look.
  function isWrite(e) {
    const m = String((e && e.method) || 'GET').toUpperCase();
    return m !== 'GET' && m !== 'HEAD';
  }

  function apiGroups(entries) {
    const by = new Map();
    for (const e of entries || []) {
      const c = classify(e.url, e);
      const g = by.get(c.group) || { group: c.group, label: c.label, host: c.host, calls: 0, wire: 0, unknown: 0, ms: 0, errors: 0, cached: 0, writes: 0 };
      g.calls++;
      if (isWrite(e)) g.writes++;
      g.ms += num(e.ms);
      if (e.error || (e.status && e.status >= 400)) g.errors++;
      if (e.status === 304) g.cached++;
      if (typeof e.wire === 'number') g.wire += e.wire; else g.unknown++;
      by.set(c.group, g);
    }
    return [...by.values()].sort((a, b) => b.calls - a.calls);
  }

  // The same ledger cut the other way. Endpoint shape says WHAT was called;
  // this says WHERE it landed, and the two answer different halves of "what is
  // this pulling". Rows with no repo in the URL are collected under one bucket
  // rather than dropped, so the counts still add up to the total.
  function repoGroups(entries) {
    const by = new Map();
    for (const e of entries || []) {
      const repo = repoOf(e.url);
      const key = repo || '(no repo in the URL)';
      const g = by.get(key) || { repo: key, named: !!repo, calls: 0, wire: 0, unknown: 0, writes: 0, errors: 0 };
      g.calls++;
      if (isWrite(e)) g.writes++;
      if (e.error || (e.status && e.status >= 400)) g.errors++;
      if (typeof e.wire === 'number') g.wire += e.wire; else g.unknown++;
      by.set(key, g);
    }
    // Named repos first, heaviest first; the unattributable bucket last, since
    // it is a caveat rather than a finding.
    return [...by.values()].sort((a, b) =>
      (a.named === b.named) ? b.calls - a.calls : (a.named ? -1 : 1));
  }

  function apiTotals(entries) {
    const list = entries || [];
    const known = list.filter(e => typeof e.wire === 'number');
    return {
      calls: list.length,
      wire: known.reduce((s, e) => s + e.wire, 0),
      unknown: list.length - known.length,
      ms: list.reduce((s, e) => s + num(e.ms), 0),
      errors: list.filter(e => e.error || (e.status && e.status >= 400)).length,
      writes: list.filter(isWrite).length,
      slowest: list.reduce((m, e) => Math.max(m, num(e.ms)), 0),
    };
  }

  // ── The header readout ────────────────────────────────────────────────────
  // One line, three facts, in the order they go wrong: what the load cost, what
  // browsing has added, and how much quota is left. The rate figure is omitted
  // rather than guessed when no response has carried the header.
  function summary({ boot: b, api: a, rate }) {
    const bits = [];
    // A load whose every row withheld its size has no weight to report. Saying
    // "0 B" there would be the strip's most confident wrong number, so it says
    // nothing and leaves the explanation to the band.
    if (b && b.count && b.undisclosed === b.count) bits.push('size undisclosed');
    else if (b && b.count) bits.push(fmtBytesShort(b.wire));
    if (a && a.calls) bits.push(a.calls + (a.calls === 1 ? ' call' : ' calls'));
    if (rate != null) bits.push(fmtCount(rate) + ' left');
    return bits.join(' · ');
  }

  // ── Resident: what is held locally ────────────────────────────────────────
  // Not traffic. Included because it is the same question ("how big is this
  // thing") and has no other home. Web Storage counts UTF-16 code units, so the
  // byte cost is twice the character count; keys count too.
  function storageRows(storage, name) {
    if (!storage) return null;
    let bytes = 0, keys = 0;
    const top = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        const v = storage.getItem(k) || '';
        const b = (k.length + v.length) * 2;
        bytes += b; keys++;
        top.push({ key: k, bytes: b });
      }
    } catch (e) { return null; }
    top.sort((x, y) => y.bytes - x.bytes);
    return { name, keys, bytes, top: top.slice(0, 6) };
  }

  window.Traffic = {
    fmtBytes, fmtBytesShort, fmtMs, fmtCount,
    classify, label, hostOf, isWrite, repoOf, repoGroups,
    boot, bootGroups, bootRow, GROUP_LABEL,
    apiGroups, apiTotals,
    summary, storageRows,

    // The live read, for a browser. Kept apart from the pure functions above so
    // the analysis tests without a performance object.
    readBoot() {
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        const res = performance.getEntriesByType('resource');
        return boot(res, nav ? {
          name: nav.name, transferSize: nav.transferSize, encodedBodySize: nav.encodedBodySize,
          decodedBodySize: nav.decodedBodySize, duration: nav.duration, startTime: 0,
          initiatorType: 'navigation',
        } : null);
      } catch (e) { return boot([], null); }
    },
  };
})();
