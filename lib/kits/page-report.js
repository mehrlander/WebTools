// ── page-report: the page files its own bug report ─────────────────────────
//
// A page on a phone can see far more about its own failure than the person
// holding the phone can relay. It knows every fault it caught, what it loaded
// and what that cost, which build it is, and what the browser is. The reader
// knows what fits in a screenshot: one line, retyped or cropped, composed by
// hand under the impression that the interesting part is the part on screen.
//
// Six rounds of "the page is broken" were spent on that gap. So the page writes
// the report itself, as a JSON file committed to a private repo through the
// viewer's own stored token, which is the same token the toss already uses to
// fetch the page. There is no server here: the repo is the server, which is the
// arrangement shortcut-tools has used for device probes since Log-Repo.
//
// THREE PROPERTIES IT MUST HAVE, and they are what most of this file is:
//
// 1. **It is armed, never ambient.** A page that writes to a private repo on
//    every load is a page nobody can hand to anyone. Arming is explicit, and
//    the arm carries its own expiry (a wall-clock window AND a report budget,
//    whichever runs out first), so forgetting to disarm costs a bounded number
//    of commits rather than an unbounded one.
// 2. **It nags while it is armed.** The state is readable (`status`) so the
//    page can say so on screen for as long as it is on. A recorder that is
//    quiet about recording is the failure mode worth designing against; this
//    kit will not render that line for you, but it will always have one to give.
// 3. **It costs nothing when it has nothing to say.** `auto()` sends only when
//    the caller hands it something to report. No token, no arm, no faults: no
//    request, and no throw either. An instrument that can break the page it
//    watches is a second defect, which this estate has already shipped once.
//
// WHAT IT DOES NOT DO. It does not decide what a fault is; the page does, and
// hands it in. It does not read the report back or render it: that is a
// checkout, or pages/data-view.html against the log directory.
(function () {
  const KEY = 'pageReport:arm';
  const DEFAULTS = { repo: 'mehrlander/web-tools-private', dir: 'logs/page',
                     minutes: 120, budget: 20 };

  const now = () => Date.now();
  const readArm = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const a = JSON.parse(raw);
      // An arm that has run out of either budget is not an arm. Clearing it on
      // read means the nag line goes away on its own rather than lying.
      if (!a || !(a.until > now()) || !(a.left > 0)) { localStorage.removeItem(KEY); return null; }
      return a;
    } catch { return null; }
  };
  const writeArm = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {} };

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
    description: 'A page commits its own diagnostic report as JSON to a private repo, through the viewer\'s stored GitHub token. Armed explicitly with an expiry and a report budget so it is never ambient, readable as a status line so a page can nag while it is on, and silent when there is nothing to report or no token to write with.',

    get config() { return { ...DEFAULTS, ...(this._config || {}) }; },
    configure(o) { this._config = { ...(this._config || {}), ...o }; return this; },

    // ── the arm ────────────────────────────────────────────────────────────
    arm(o = {}) {
      const c = { ...this.config, ...o };
      const a = { until: now() + c.minutes * 60000, left: c.budget,
                  repo: c.repo, dir: c.dir, armedAt: new Date().toISOString() };
      writeArm(a);
      return a;
    },
    disarm() { try { localStorage.removeItem(KEY); } catch {} return null; },
    get arm_() { return readArm(); },
    get armed() { return !!readArm(); },

    // The nag, as text. Deliberately not markup: the page owns its own pixels,
    // and a kit that injected a banner would fight every layout it landed in.
    get status() {
      const a = readArm();
      if (!a) return '';
      const mins = Math.max(1, Math.round((a.until - now()) / 60000));
      return `reporting to ${a.repo} · ${a.left} left · ${mins}m`;
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
    async send(extra = {}, o = {}) {
      const a = readArm();
      if (!a && !o.force) return { ok: false, why: 'not armed' };
      const c = { ...this.config, ...(a || {}), ...o };
      if (typeof GH !== 'function') return { ok: false, why: 'no GH' };
      const doc = this.collect(extra);
      // Path carries the day, the page and a clock reading, so the directory
      // sorts by hand and two reports a second apart cannot collide.
      const d = doc.at.slice(0, 10);
      const t = doc.at.slice(11, 19).replace(/:/g, '');
      const tag = Math.random().toString(36).slice(2, 6);
      const path = `${c.dir}/${d}/${doc.page}-${t}-${tag}.json`;
      try {
        const gh = new GH({ repo: c.repo, ref: '' });
        if (!gh.token) return { ok: false, why: 'no token' };
        await gh.save(path, doc, `page report: ${doc.page}`);
        if (a) { a.left -= 1; a.left > 0 ? writeArm(a) : this.disarm(); }
        return { ok: true, path, repo: c.repo };
      } catch (e) {
        return { ok: false, why: String(e && e.message || e).slice(0, 200) };
      }
    },

    // The boot-time call. Sends only when armed AND the page hands over
    // something worth a commit, so an armed page that loads cleanly writes
    // nothing: the arm is a window in which failures report themselves, not an
    // instruction to record everything that happens inside it.
    async auto(extra = {}, o = {}) {
      if (!readArm()) return { ok: false, why: 'not armed' };
      const worth = o.worth !== undefined ? o.worth
        : !!(extra.faults?.length || extra.crumb || extra.reason);
      if (!worth) return { ok: false, why: 'nothing to report' };
      return this.send(extra, o);
    },
  };

  window.PageReport = PageReport;
})();
