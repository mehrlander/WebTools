// gh-boot.js — auto-loaded by gh-api.js's bootstrap. The list of scripts
// pulled at startup lives here, not in gh-api.js, so adding new entries
// doesn't require purging gh-api.js from the jsDelivr cache. It is declared
// as the BOOT manifest below, as data, so what a page pays to start can be
// read without reading the boot function.
//
// gh.load() awaits its loaded script's return value, so we return the
// async IIFE's promise to make the boot chain awaitable.
//
// Also wraps GH.prototype.load so each load pushes an entry onto
// window.__loadedScripts ({path, t, endT, status, error}). The FAB's
// Scripts tab reads that registry to answer "is X actually loaded?"
// without dev tools. Seeded with gh-api.js (loaded via <script
// type=module>) and gh-boot.js itself, since both arrived before the
// wrapper was installed.

// ── The boot manifest ─────────────────────────────────────────────────────
// What every page pays to start, declared as data so the cost can be read
// without reading the boot function below. BOOT is the unconditional
// sequence, in load order; an entry's `init` runs right after its load
// resolves. FAB_BOOT is the conditional standing equipment the FAB block
// loads: fab and path-picker unless the page opts out with data-no-fab,
// alpine-bundle only when the page brought no Alpine of its own.
const BOOT = [
  // Token handling and the request layer, on the prototype.
  { path: 'gh-auth.js' },
  { path: 'gh-fetch.js' },
  // The owner/repo[@ref]:path address grammar. Standing equipment because it
  // is the module the estate's parsers converge on: the peek parses with it,
  // and a component that read a stage link during init would otherwise find
  // it undefined.
  { path: 'kits/repo-address.js' },
  // The surface envelope: the shared item vocabulary two components read
  // through (the Surfaces shelf and the Stage, one view in two modes), so a
  // page's own boot list is the wrong owner of it.
  { path: 'kits/surface.js' },
  // The hover card behind an exact-file GitHub jump-over. Standing equipment
  // for the same reason the FAB is: it belongs wherever such a link renders,
  // and a page shell is served from main even under ?use=, so a page-owned
  // load left branch previews with no SourcePeek behind their :data-peek.
  // The kit used to install its own document listeners on load, which is a
  // kit deciding where it lives; the manifest owns that call now.
  { path: 'kits/source-peek.js', init: () => window.SourcePeek?.install?.() },
  // The read over the traffic ledger this file collects: the fab's readout
  // strip is on every tab, so this cannot be a lazy load that arrives after
  // the number was wanted. Pure functions, no side effects on load.
  { path: 'kits/traffic.js' },
  // Console retention layer — extends console.* with history/subscribe/filter
  // on top of gh-api.js's wrapper, so any page can render captured logs.
  { path: 'kits/console.js' },
  // Ambient DOM utilities for every page: ea, el, ids, ui, grab, html, fill,
  // attr, cls, listen, data, tpl, on, route, plus window.copy() helper.
  { path: 'vanilla-bundle.js' },
];
const FAB_BOOT = {
  fab: 'alpineComponents/fab.js',
  picker: 'alpineComponents/path-picker.js',
  alpine: 'alpine-bundle.js',
};

return (async () => {
  if (!window.gh) throw new Error('gh-boot.js requires window.gh');

  const now = Date.now();
  window.__loadedScripts = [
    { path: 'gh-api.js',  t: now, endT: now, status: 'ok', auto: true, by: new Set() },
    { path: 'gh-boot.js', t: now, endT: now, status: 'ok', auto: true, by: new Set() }
  ];
  const fire = () => window.dispatchEvent(new CustomEvent('loadedscripts'));
  fire();

  const loadCache = new Map(); // path -> { promise, entry }
  window.__loadedScripts.forEach(e => loadCache.set(e.path, { entry: e }));

  // ── The traffic ledger ──────────────────────────────────────────────────
  // window.__traffic records every programmatic request the page makes, so the
  // FAB's Traffic tab can answer "what is this thing pulling" without dev
  // tools, the way __loadedScripts answers "is X loaded". lib/kits/traffic.js holds
  // the analysis; this is only the collection, and it is deliberately the
  // cheapest thing that is still accurate.
  //
  // The wrap point is window.fetch rather than GH.prototype.req, and the choice
  // decides what the tab can see. req() returns parsed JSON, so a wrapper there
  // could only re-stringify and guess at a byte count (GitHub pretty-prints its
  // JSON, so the guess runs low). fetch sees the Response, where content-length
  // is the compressed body as sent, and it is CORS-safelisted, so it reads
  // cross-origin with no cooperation from the server. One wrap point also
  // catches the GraphQL path in gh-fetch.js, the raw loads in gh-api.js, the
  // jsDelivr calls, and anything a page fetches on its own, none of which a
  // req() wrapper would see.
  //
  // We never touch the body. No clone(), no text(): the response stream is
  // handed back exactly as it arrived, so nothing downstream can be starved by
  // the instrument. That is also why decoded size is absent here and comes from
  // the get() wrapper below, which is handed the text anyway.
  //
  // Resource Timing covers what happened BEFORE this wrapper (the document, the
  // CDN tags, gh-api.js itself) and is read separately by the Boot band. The
  // two do not double count: Boot describes one page load, this describes the
  // calls made since.
  if (!window.__trafficWrapped && typeof window.fetch === 'function') {
    window.__trafficWrapped = true;
    window.__traffic = window.__traffic || [];
    // Trimming keeps a long activity crawl from growing the array without
    // bound, so the running totals live apart from the rows they came from: the
    // count and the byte figure stay honest after the rows scroll off.
    window.__trafficTotals = { calls: 0, wire: 0, unknown: 0, errors: 0, ms: 0, trimmed: 0, writes: 0 };
    const CAP = 400;
    let rate = null;      // x-ratelimit-remaining, newest wins
    let rateAt = 0;

    let pending = null;
    const fireTraffic = () => {
      // Coalesced: a crawl fires hundreds of these, and every one would
      // otherwise re-render the drawer mid-scroll.
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        window.dispatchEvent(new CustomEvent('traffic'));
      }, 250);
    };

    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      let url = '', method = 'GET';
      try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch (e) {}
      // The method, because without it a WRITE is indistinguishable from a read.
      // gh-store PUTs to the same contents/ endpoint gh.load() GETs from, so the
      // single most consequential thing this library does over the network was
      // rendering as an ordinary row. Read from init first, then a Request
      // object, since either carries it.
      try { method = (init && init.method) || (input && input.method) || 'GET'; } catch (e) {}
      // `via` is the repo path a gh.load()/read() was fetching when this call
      // went out, set synchronously by the get() wrapper below. It is what
      // separates the library pulling its own code from a page reading a file,
      // two things that share the contents/ endpoint exactly.
      const entry = { url, method: String(method).toUpperCase(), via: window.__ghGetPath || null,
                      t: Date.now(), ms: 0, status: 0, wire: null, error: null };
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const T = window.__traffic;
      T.push(entry);
      if (T.length > CAP) { T.splice(0, T.length - CAP); window.__trafficTotals.trimmed++; }
      const totals = window.__trafficTotals;
      totals.calls++;
      if (entry.method !== 'GET' && entry.method !== 'HEAD') totals.writes++;

      const settle = () => {
        entry.ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
        totals.ms += entry.ms;
        fireTraffic();
      };

      let res;
      try { res = origFetch.apply(this, arguments); } catch (e) {
        entry.error = (e && e.message) || String(e);
        totals.errors++;
        settle();
        throw e;
      }
      return Promise.resolve(res).then(r => {
        try {
          entry.status = r.status;
          const cl = r.headers && r.headers.get('content-length');
          if (cl != null && cl !== '') { entry.wire = Number(cl); totals.wire += entry.wire; }
          else totals.unknown++;
          // GitHub exposes the rate-limit headers to CORS readers; other hosts
          // send nothing and leave the reading untouched, which is why this is
          // a null-check rather than a per-host branch.
          const rem = r.headers && r.headers.get('x-ratelimit-remaining');
          if (rem != null && rem !== '') { rate = Number(rem); rateAt = Date.now(); }
          const reset = r.headers && r.headers.get('x-ratelimit-reset');
          if (reset != null && reset !== '') window.__trafficRateReset = Number(reset) * 1000;
          if (r.status >= 400) totals.errors++;
        } catch (e) {}
        window.__trafficRate = rate;
        window.__trafficRateAt = rateAt;
        settle();
        return r;
      }, e => {
        entry.error = (e && e.message) || String(e);
        totals.errors++;
        settle();
        throw e;
      });
    };

    // The default Resource Timing buffer is 250 entries and drops silently once
    // full, which on an icon-heavy page would make the Boot band understate the
    // load it is there to measure.
    try { performance.setResourceTimingBufferSize(600); } catch (e) {}
  }

  // Default favicon: give every library page the web-tools project mark (the
  // slot-split hex nut) UNLESS the page already declares its own icon — so a
  // page's bespoke favicon (e.g. toss-render's 🥏) always wins, and pages that
  // set none inherit the brand instead of a blank tab. Inlined as a data URI so
  // it needs no network and works offline; lib/favicon.svg is the canonical twin.
  // Best-effort: a favicon is cosmetic and must never break the boot chain.
  try {
    if (typeof document !== 'undefined' && document.head &&
        !document.querySelector('link[rel~="icon"]')) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4.5 4.5 23 23">'
        + '<mask id="s" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">'
        + '<rect width="32" height="32" fill="#fff"/>'
        + '<rect x="14.6" y="4" width="2.8" height="24" fill="#000"/>'
        + '<circle cx="16" cy="16" r="4.5" fill="#000"/></mask>'
        + '<path fill="#2563eb" mask="url(#s)" d="M10.5 6.474 21.5 6.474 27 16 21.5 25.526 10.5 25.526 5 16Z"/></svg>';
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
      document.head.appendChild(link);
    }
  } catch (e) { /* favicon is cosmetic; ignore */ }

  // A load whose underlying fetch never returns leaves its entry on
  // 'pending' forever — a silent spinner in the Scripts tab with no signal.
  // After STALL_MS, flip a still-pending row to a visible 'error' with the
  // elapsed time so the stall surfaces. It's diagnostic, not fatal: the
  // original promise stays alive, so if the load later settles the try/catch
  // below overwrites this with the real ok/error outcome (self-healing).
  const STALL_MS = 15000;
  const proto = window.gh.constructor.prototype;
  const origLoad = proto.load;
  proto.load = async function(path, opts) {
    // Attribution rides on the scoped `gh` each loaded script is handed:
    // gh-api.js's load() proxy stamps opts.by = the loading script's path, so
    // a script that pulls children via its own `gh` records who pulled them.
    // No stack inspection — WebKit runs gh.load'd files as anonymous
    // `new Function` bodies with no sourceURL in Error().stack, so a stack
    // sniff can never name the caller there. Absent an explicit by, it's direct.
    const requester = opts?.by || '(direct)';
    let cached = loadCache.get(path);
    if (cached) {
      cached.entry.by.add(requester);
      fire();
      return cached.promise;
    }

    const entry = { path, t: Date.now(), status: 'pending', auto: requester === 'gh-boot.js', by: new Set([requester]) };
    window.__loadedScripts.push(entry);
    loadCache.set(path, { entry });
    fire();

    const promise = (async () => {
      const stallTimer = setTimeout(() => {
        if (entry.status !== 'pending') return;
        entry.status = 'error';
        entry.error = `stalled: no response in ${STALL_MS}ms`;
        entry.endT = Date.now();
        fire();
      }, STALL_MS);
      try {
        const r = await origLoad.call(this, path);
        clearTimeout(stallTimer);
        entry.status = 'ok';
        entry.error = null;
        entry.endT = Date.now();
        fire();
        return r;
      } catch (e) {
        clearTimeout(stallTimer);
        entry.status = 'error';
        entry.error = (e && e.message) || String(e);
        entry.endT = Date.now();
        fire();
        throw e;
      }
    })();

    loadCache.set(path, { entry, promise });
    return promise;
  };

  // Mirror the load registry for read(): record each resolved data read on
  // window.__reads ({ path, value, t }, newest value per path) and fire a
  // 'reads' event. The export kit (kits/export.js) reads this to assemble
  // "page + the data it read()s" zips, and the FAB surfaces the count. Lives
  // here, not in gh-api.js, so it ships without a gh-api.js cache purge.
  if (!proto.__readWrapped) {
    proto.__readWrapped = true;
    window.__reads = window.__reads || [];
    const fireReads = () => window.dispatchEvent(new CustomEvent('reads'));
    const origRead = proto.read;
    proto.read = async function(path) {
      const value = await origRead.call(this, path);
      const entry = { path, value, t: Date.now() };
      const i = window.__reads.findIndex(e => e.path === path);
      if (i >= 0) window.__reads[i] = entry; else window.__reads.push(entry);
      fireReads();
      return value;
    };
  }

  // Per-file byte counts, and the one fact the Scripts list could not tell you:
  // whether a load cost anything. get() is the single door every load() and
  // read() goes through, and the pre-build (lib/build.js) overrides it to
  // serve own code from an inlined cache, stamping sha 'build:<ref>' on what it
  // serves. So the sha is the tell: a page importing dist/web-tools.js pulls
  // thirty modules and spends network on none of them, and until now the
  // Scripts tab reported that identically to thirty real fetches.
  //
  // Recorded here rather than derived from the traffic ledger because a
  // correlation by time window would misattribute under concurrency, and
  // because get() is handed the decoded text anyway: its length is exact, where
  // content-length on the wire is compressed and per-request.
  if (!proto.__getWrapped) {
    proto.__getWrapped = true;
    window.__ghFiles = window.__ghFiles || {};
    const origGet = proto.get;
    proto.get = async function (p) {
      // Caller attribution for the one case that needed it, bought without a
      // caller registry and without touching gh-api.js.
      //
      // From entering get() to the fetch() call there is NO await: get() calls
      // this.req(...) synchronously, req() runs synchronously as far as
      // `await fetch(url, ...)`, and the fetch(...) invocation itself is
      // synchronous. A marker set here and cleared the moment the call
      // expression returns is therefore read by the fetch wrapper for exactly
      // this request, and a concurrent get() cannot steal it, because
      // interleaving happens at awaits and there is none inside that window.
      // Proved under concurrency in tools/test/traffic.test.mjs rather than
      // argued: this reasoning is exactly the kind that quietly stops holding.
      //
      // The >1 MB git/blobs fallback is a second req AFTER an await, so it
      // lands unattributed. That is honest and rare.
      let pending;
      window.__ghGetPath = p;
      try { pending = origGet.call(this, p); }
      finally { window.__ghGetPath = null; }
      const res = await pending;
      try {
        const sha = String((res && res.sha) || '');
        window.__ghFiles[p] = {
          path: p,
          bytes: (res && typeof res.size === 'number') ? res.size : ((res && res.text) || '').length,
          inlined: sha.startsWith('build:'),
          sha,
          t: Date.now(),
        };
        window.dispatchEvent(new CustomEvent('ghfiles'));
      } catch (e) {}
      return res;
    };
  }

  // The FAB is standing equipment: every page that boots this chain gets one
  // unless it mounts its own or opts out with data-no-fab on <html>/<body>.
  // It used to appear only under ?use=, which left ~19 of the repo's pages
  // with no way to reach the drawer (branch survey, Inspect, take-away) on a
  // normal visit, and made "open the FAB" advice quietly conditional.
  //
  // A page with no Alpine gets it pulled in, which is a real cost paid for a
  // real capability; data-no-fab is the way out for a page that must stay
  // framework-free. (The bundle demos are not that case: their shells are
  // Alpine, and only the proof frames they render are framework-free.) The
  // load is deduped by the registry above, so a page that pulls fab.js itself
  // is unaffected. Best-effort: nothing in here may break the boot chain.
  try {
    const optedOut = typeof document !== 'undefined' &&
      (document.documentElement.hasAttribute('data-no-fab') ||
       (document.body && document.body.hasAttribute('data-no-fab')));
    if (typeof document !== 'undefined' && !optedOut) {
      // gh-boot runs before alpine-bundle can load Alpine, so this listener
      // can't miss the start event.
      let alpineStarted = false;
      document.addEventListener('alpine:initialized', () => { alpineStarted = true; });

      // Register fab before Alpine starts, then mount once the page has had
      // a beat to mount its own. path-picker rides along because the fab's
      // render tab mounts one (its path row opens a repo tree, so any file can
      // be rendered from the drawer), and a component file loaded AFTER Alpine
      // starts never registers: its alpine:init listener has already missed the
      // event. Registration is cheap; not registering is a dead x-data.
      await gh.load(FAB_BOOT.fab);
      try { await gh.load(FAB_BOOT.picker); } catch (e) {}
      (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        if (document.readyState === 'loading')
          await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
        await sleep(1500);
        // The load-race guard, two layers. A page whose own chain is slower
        // than this timer (measured live: shorter.html on a phone through a
        // #gh= toss, four sequential API round trips) would get our Alpine
        // started against helpers that have not loaded, throwing from its
        // inline x-data. A page may publish its chain as window.__pageBoot
        // (see the canonical boot block in README.md) and we await it
        // outright; every page that publishes nothing is covered by
        // QUIESCENCE instead: gh-api.js counts in-flight load()s on the GH
        // class, so wait until nothing has loaded for a beat before
        // concluding the page brought no Alpine of its own. Bounded, so a
        // page that trickles loads indefinitely still gets its FAB; a failed
        // chain still gets it too.
        try { if (window.__pageBoot) await window.__pageBoot; } catch (e) {}
        const GHC = window.GH;
        for (let t = 0; t < 12000; t += 100) {
          if (!GHC || (!(GHC._loading > 0) && Date.now() - (GHC._loadQuietAt || 0) >= 400)) break;
          await sleep(100);
        }
        if (document.querySelector('[x-data^="fab"]')) return;
        // Pages without Alpine get it via alpine-bundle (deduped, and it
        // no-ops the load if Alpine is already present).
        if (!window.Alpine) { try { await gh.load(FAB_BOOT.alpine); } catch (e) {} }
        for (let t = 0; t < 10000 && !alpineStarted; t += 100) await sleep(100);
        if (!window.Alpine || document.querySelector('[x-data^="fab"]')) return;
        const mount = document.createElement('div');
        mount.setAttribute('x-data', 'fab()');
        document.body.appendChild(mount);
        if (alpineStarted) window.Alpine.initTree(mount);
      })();
    }
  } catch (e) { console.warn('gh-boot: use-mode extras failed:', e); }

  // The declared sequence, from the BOOT manifest at the top of this file.
  // Use the scoped `gh` handed to this script (not window.gh) so each child
  // is stamped by: 'gh-boot.js' and flagged auto in the Scripts registry.
  for (const step of BOOT) {
    await gh.load(step.path);
    if (step.init) step.init();
  }
})();
