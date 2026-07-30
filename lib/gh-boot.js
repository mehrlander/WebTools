// gh-boot.js — auto-loaded by gh-api.js's bootstrap. The list of scripts
// pulled at startup lives here, not in gh-api.js, so adding new entries
// doesn't require purging gh-api.js from the jsDelivr cache.
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
      // a beat to mount its own.
      await gh.load('alpineComponents/fab.js');
      (async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        if (document.readyState === 'loading')
          await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
        await sleep(1500);
        if (document.querySelector('[x-data^="fab"]')) return;
        // Pages without Alpine get it via alpine-bundle (deduped, and it
        // no-ops the load if Alpine is already present).
        if (!window.Alpine) { try { await gh.load('alpine-bundle.js'); } catch (e) {} }
        for (let t = 0; t < 10000 && !alpineStarted; t += 100) await sleep(100);
        if (!window.Alpine || document.querySelector('[x-data^="fab"]')) return;
        const mount = document.createElement('div');
        mount.setAttribute('x-data', 'fab()');
        document.body.appendChild(mount);
        if (alpineStarted) window.Alpine.initTree(mount);
      })();
    }
  } catch (e) { console.warn('gh-boot: use-mode extras failed:', e); }

  // Use the scoped `gh` handed to this script (not window.gh) so each child
  // is stamped by: 'gh-boot.js' and flagged auto in the Scripts registry.
  await gh.load('gh-auth.js');
  await gh.load('gh-fetch.js');
  // The source peek is standing equipment for the same reason the FAB is: it
  // belongs wherever an exact-file GitHub jump-over is rendered, and a page's
  // own boot list is the wrong owner of that. It first hung off show-repo's
  // boot block, which failed the one test that matters here — a page shell is
  // served from main even under ?use=, so a preview of the branch loaded the
  // new components with no SourcePeek behind them, every :data-peek bound to
  // null, and no card could appear. In lib it rides the ref like everything
  // else. repo-address.js comes with it, being the address grammar the peek
  // parses with (and the module the estate's parsers are converging on, so
  // this loads it rather than restating the regex).
  await gh.load('repo-address.js');
  await gh.load('source-peek.js');
  // Console retention layer — extends console.* with history/subscribe/filter
  // on top of gh-api.js's wrapper, so any page can render captured logs.
  await gh.load('kits/console.js');
  // Ambient DOM utilities for every page: ea, el, ids, ui, grab, html, fill,
  // attr, cls, listen, data, tpl, on, route, plus window.copy() helper.
  // No dependencies, idempotent on re-load.
  await gh.load('vanilla-bundle.js');
})();
