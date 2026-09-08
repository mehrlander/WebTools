// ── page-report: the page files its own bug report ─────────────────────────
//
// A page on a phone can see far more about its own failure than the person
// holding the phone can relay. It knows every fault it caught, what it loaded
// and what that cost, which build it is, and what the browser is. The reader
// knows what fits in a screenshot: one line, cropped and retyped, composed by
// hand under the impression that the interesting part is the part on screen.
//
// Six rounds of "the page is broken" were spent on that gap. So the page writes
// the report itself, as a JSON file committed to a private repo through the
// viewer's own stored token, which is the same token the toss already uses to
// fetch the page. There is no server here: the repo is the server, which is the
// arrangement shortcut-tools has used for device probes since Log-Repo.
//
// IT REPORTS BY DEFAULT, and the first version of this file did not. It made
// the reader tap a button to arm it, which is the wrong shape twice over: it
// puts a step between a failure and its report exactly when nobody is thinking
// about reporting, and it asks the person with the least information in the
// system to decide whether this load is worth recording. Reported 2026-09-08 as
// "that just seems kind of nonsensical", which it was. A page opts in ONCE, in
// its own source, by calling `watch()`. After that it reports on its own.
//
// WHAT KEEPS THE VOLUME HONEST is not friction, it is having nothing to say:
//
// 1. **A clean load writes nothing.** `auto()` sends only when the page hands
//    over a fault, a crash breadcrumb or a named reason. Reporting being on is
//    not an instruction to record every load.
// 2. **The same failure is not filed twice.** A report carries a signature of
//    what it is reporting; an identical one inside the quiet window is dropped.
//    Without this, one persistent fault becomes one commit per reload, which is
//    how a log stops being read.
// 3. **A page load files at most a few.** A fault arriving in a loop must not
//    turn into a loop of commits.
// 4. **It never throws.** No token, no GH, no network: a result object saying
//    why, and nothing else. An instrument that can break the page it watches is
//    a second defect, which this estate has already shipped once.
//
// The off switch survives all of that, because a page that reports must always
// be answerable to the person holding it: `disable()` stops it durably, and
// `?report=off` in the address stops it for one load. Neither is the normal
// path, and neither needs a tap in the ordinary case.
//
// WHAT IT DOES NOT DO. It does not decide what a fault is; the page does, and
// hands it in. It does not read the report back or render it: that is a
// checkout, or pages/data-view.html against the log directory.
(function () {
  const OFF_KEY = 'pageReport:off';   // set only by an explicit disable()
  const SEEN_KEY = 'pageReport:seen';  // signatures already filed, with their times
  const DEFAULTS = { repo: 'mehrlander/web-tools-private', dir: 'logs/page',
                     quietMinutes: 30, perLoad: 3 };

  const now = () => Date.now();
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const drop = (k) => { try { localStorage.removeItem(k); } catch {} };

  // A one-load override in the address, for handing the page to someone whose
  // repo this is not, or for reading a failure without adding to it.
  const offByUrl = () => { try { return /[?&]report=off\b/.test(location.search); } catch { return false; } };

  // What a report is ABOUT, reduced to one string. Two loads that hit the same
  // fault produce the same signature, which is what stops a persistent failure
  // becoming one commit per reload. The clock is deliberately not in it.
  const signature = (extra) => {
    try {
      const faults = (extra.faults || []).map(f => f.line).join('|');
      const crumb = extra.crumb ? `crumb:${extra.crumb.stage || extra.crumb}` : '';
      return [extra.reason || '', crumb, faults].join('~').slice(0, 400);
    } catch { return 'unreadable'; }
  };
  const seen = () => { try { return JSON.parse(get(SEEN_KEY) || '{}'); } catch { return {}; } };
  const remember = (sig, quietMinutes) => {
    const all = seen();
    all[sig] = now();
    // Forget anything past the quiet window on the way through, so this never
    // grows without bound and a fault that returns much later is filed again.
    const cut = now() - quietMinutes * 60000;
    for (const k of Object.keys(all)) if (!(all[k] > cut)) delete all[k];
    set(SEEN_KEY, JSON.stringify(all));
  };

  // Everything a screenshot cannot carry. Read defensively throughout: this
  // runs on a page that has already gone wrong at least once, so nothing here
  // may assume the object it is reading exists or is well formed.
  const environment = () => {
    const g = (fn, fallback = null) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
    return {
      ua: g(() => navigator.userAgent),
      platform: g(() => navigator.platform),
      // Device memory is the number most likely to explain a web-process kill,
      // and it is the one nobody thinks to report. Absent outside Chromium.
      deviceMemory: g(() => navigator.deviceMemory),
      hardwareConcurrency: g(() => navigator.hardwareConcurrency),
      viewport: g(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })),
      // A touch-capable pointer is the difference between the two hit-testing
      // paths a page has, and no width setting fakes it.
      coarse: g(() => matchMedia('(pointer: coarse)').matches),
      online: g(() => navigator.onLine),
      lang: g(() => navigator.language),
      tz: g(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    };
  };

  // What the load cost, in the shape the Traffic tab reads it: total weight and
  // the slowest few entries. Reported because a page that dies on a phone and
  // not on a desktop is often a page that pulled far more than it meant to.
  const resources = (limit = 8) => {
    try {
      const rows = performance.getEntriesByType('resource');
      const bytes = rows.reduce((n, r) => n + (r.transferSize || 0), 0);
      const slow = [...rows].sort((a, b) => b.duration - a.duration).slice(0, limit)
        .map(r => ({ name: String(r.name).slice(-90), ms: Math.round(r.duration),
                     bytes: r.transferSize || 0, kind: r.initiatorType }));
      const nav = performance.getEntriesByType('navigation')[0];
      return { count: rows.length, bytes, slow,
               loadMs: nav ? Math.round(nav.duration) : null,
               memory: (() => { try { const m = performance.memory;
                 return m ? { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit } : null; } catch { return null; } })() };
    } catch { return null; }
  };

  const PageReport = {
    description: 'A page commits its own diagnostic report as JSON to a private repo, through the viewer\'s stored GitHub token. A page opts in once in its own source with watch(); after that it reports on its own, with no tap and no arming. It stays quiet by having nothing to say rather than by friction: a clean load writes nothing, a repeat of the same failure inside the quiet window is dropped, a single load files at most a few, and nothing here throws. disable() stops it durably and ?report=off stops it for one load.',

    get config() { return { ...DEFAULTS, ...(this._config || {}) }; },
    configure(o) { this._config = { ...(this._config || {}), ...o }; return this; },

    // ── on, unless someone has said otherwise ──────────────────────────────
    // watch() is the whole opt-in, and a page calls it in its own source. There
    // is nothing for the reader to arm: a failure that needs a tap before it is
    // recorded is a failure nobody records.
    watch(o = {}) { this.configure(o); this._watching = true; return this; },

    // Durable off, for a page whose reports are no longer wanted, and the
    // one-load override for handing the page to someone else.
    disable() { set(OFF_KEY, '1'); return this; },
    enable() { drop(OFF_KEY); return this; },
    get enabled() { return !!this._watching && get(OFF_KEY) !== '1' && !offByUrl(); },

    // For a page that wants to say so on screen. Short by design: reporting is
    // the normal state here, so the line is a fact about the page rather than
    // a warning, and there is nothing in it to act on.
    get status() {
      if (!this._watching) return '';
      if (get(OFF_KEY) === '1') return 'reporting off';
      if (offByUrl()) return 'reporting off for this load';
      return `reporting to ${this.config.repo}`;
    },

    // ── the report ─────────────────────────────────────────────────────────
    // `extra` is whatever the page knows and this kit cannot: its faults, its
    // build token, a crash breadcrumb. Merged at the top level so a reader sees
    // one flat document rather than a wrapper to unpick.
    collect(extra = {}) {
      return {
        at: new Date().toISOString(),
        url: (() => { try { return location.href.slice(0, 2000); } catch { return null; } })(),
        page: (() => { try { return location.pathname.split('/').pop() || 'index'; } catch { return 'unknown'; } })(),
        environment: environment(),
        resources: resources(),
        ...extra,
      };
    },

    // Never throws, and says why it did nothing. A caller wiring this into a
    // boot path must be able to ignore the return value entirely.
    //
    // gh.save lives in gh-store.js, not in the base GH class, and the first
    // version of this file assumed otherwise: every write failed with
    // `gh.save is not a function`, caught and reported as a one-line refusal,
    // so the very first real report never landed. Loading it here rather than
    // asking each adopting page to remember is the fix; it is lazy, so a page
    // that never files never fetches it.
    async send(extra = {}, o = {}) {
      const c = { ...this.config, ...o };
      if (typeof GH !== 'function') return { ok: false, why: 'no GH' };
      const doc = this.collect(extra);
      const d = doc.at.slice(0, 10);
      const t = doc.at.slice(11, 19).replace(/:/g, '');
      const tag = Math.random().toString(36).slice(2, 6);
      const path = `${c.dir}/${d}/${doc.page}-${t}-${tag}.json`;
      try {
        const gh = new GH({ repo: c.repo, ref: '' });
        // The token is NOT on the instance after construction. gh-auth.js
        // patches the `headers` getter, so a saved token is only pulled in when
        // a request is about to be made; reading `gh.token` before that is
        // reading a field nothing has filled yet. This kit did exactly that and
        // refused every write with `no token` on a device that had one, which
        // is a diagnostic misreporting the thing it was installed to observe.
        // Ask storage the same question gh-auth asks.
        const token = gh.token || (() => { try { return localStorage.getItem('ghToken') || ''; } catch { return ''; } })();
        if (!token) return { ok: false, why: 'no token' };
        if (typeof gh.save !== 'function') {
          if (typeof window.gh?.load === 'function') await window.gh.load('gh-store.js');
          if (typeof gh.save !== 'function') return { ok: false, why: 'gh-store.js not loaded' };
        }
        await gh.save(path, doc, `page report: ${doc.page}`);
        this._filed = (this._filed || 0) + 1;
        remember(signature(extra), c.quietMinutes);
        return { ok: true, path, repo: c.repo };
      } catch (e) {
        return { ok: false, why: String(e && e.message || e).slice(0, 200) };
      }
    },

    // The automatic call, wired into a page's boot and anywhere else it learns
    // something went wrong. Four gates, in the order that costs least.
    async auto(extra = {}, o = {}) {
      const c = { ...this.config, ...o };
      if (!this.enabled) return { ok: false, why: 'not watching' };
      const worth = o.worth !== undefined ? o.worth
        : !!(extra.faults?.length || extra.crumb || extra.reason);
      if (!worth) return { ok: false, why: 'nothing to report' };
      if ((this._filed || 0) >= c.perLoad) return { ok: false, why: 'enough for one load' };
      const sig = signature(extra);
      const last = seen()[sig];
      if (last && now() - last < c.quietMinutes * 60000) return { ok: false, why: 'already filed' };
      return this.send(extra, o);
    },

    // For a reader who has just fixed something and wants the next occurrence
    // filed rather than swallowed as a repeat.
    forget() { drop(SEEN_KEY); this._filed = 0; return this; },
  };

  window.PageReport = PageReport;
})();
