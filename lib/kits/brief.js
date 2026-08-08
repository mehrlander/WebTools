// kits/brief.js — assemble a page into a review brief: one markdown document
// holding the page source plus the source of the modules the page itself
// loaded, sized for pasting into a chat model.
//
// This is the fifth verb after load → build → bake → export, and it is the one
// that optimizes for a READER rather than a runtime. The export kit (kits/
// export.js) answers "unzip and it runs", so it must carry the whole boot
// chain. A brief answers "read this and tell me what you think", so carrying
// the boot chain is pure cost: it is the same ~63-139K on every page and no
// reviewer needs it. The two kits share the same source of truth and diverge
// only on what they keep.
//
// THE RINGS. window.__loadedScripts is the page's real runtime closure, and
// gh-boot.js already stamps `auto: true` on everything it pulled in itself, so
// the split needs no heuristic:
//
//   page    the .html file. Always full source.
//   own     every module the page loaded that is not in FLOOR. Full source.
//           This is what the page IS, and it is what a review is about.
//   floor   the library's boot chain plus the FAB, listed by name and one-line
//           role, never by source. Identical on every page.
//   vendor  third-party CDN libraries, named and versioned from their URLs.
//   data    read() paths recorded on window.__reads, with values when small.
//
// FLOOR is a fixed list rather than a read of the `auto` flag alone, because a
// page may load a floor module directly (compression-helper loads fab.js
// itself) and it is still chrome for review purposes. The `auto` flag is used
// as a second signal, so a module gh-boot pulls in later is classified without
// this list having to be edited.
//
// Measured on four pages: dropping the floor takes a whole-page brief from
// 25-50K tokens to 10-15K. pages/show-repo/show-repo.html is the one page this
// cannot serve whole (it imports the 918K pre-build, ~262K tokens); brief()
// refuses it and points at per-component scope instead.
(() => {
  // The boot chain gh-boot.js installs, plus the two bundle loaders and the
  // FAB. Each carries the one-line role that stands in for its source.
  const FLOOR = {
    'gh-api.js':                    'GitHub API client + gh.load() module loader; the boot entry point.',
    'gh-boot.js':                   'Boot chain: loads the modules below, records __loadedScripts/__reads, auto-injects the FAB.',
    'gh-auth.js':                   'Token storage and the auth prompt.',
    'gh-fetch.js':                  'Repo reads: trees, branches, commits, compare, GraphQL.',
    'kits/console.js':              'Console retention and filtering behind the FAB console.',
    'alpineComponents/fab.js':      'The floating action button: render/inspect drawer, branch survey, export.',
    'alpineComponents/console.js':  'Console panel rendered inside the FAB drawer.',
    'alpine-bundle.js':             'Loads Alpine + plugins from the CDN and starts it.',
    'vanilla-bundle.js':            'Loads the framework-free helper bundle from the CDN.',
  };

  // The take-away machinery itself, pulled in on demand by the FAB when you
  // ask for a brief or an export. It is in the runtime closure but it is not
  // part of the page, so it belongs in neither ring: taking a brief must not
  // change what the brief says the page loads.
  const MACHINERY = new Set(['kits/brief.js', 'kits/io.js', 'kits/export.js', 'build.js']);

  // show-repo boots the whole pre-build, so its closure is the entire library.
  const WHOLE_LIB = /dist\/web-tools\.js|show-repo\//;

  const KB = (n) => n < 1024 ? n + 'B' : (n / 1024).toFixed(1) + 'K';
  const tokens = (n) => Math.round(n / 4);

  const langFor = (p) => /\.html?$/i.test(p) ? 'html' : /\.json$/i.test(p) ? 'json' : 'js';

  // One CDN path segment -> "name@version" (version omitted when the URL
  // pins none). Handles the scoped and unscoped npm shapes the repo's pages use.
  const pkgName = (seg) => {
    const m = seg.match(/(?:npm\/)?((?:@[^/@]+\/)?[^/@]+)(?:@([^/]+))?/);
    return m ? m[1] + (m[2] ? '@' + m[2] : '') : seg;
  };

  // A CDN URL -> the packages it carries. jsDelivr's /combine/ endpoint packs
  // several comma-separated packages into one URL, so this returns a list
  // rather than a single name.
  const vendorNames = (u) => {
    try {
      const url = new URL(u);
      const p = url.pathname.replace(/^\/combine\//, '');
      return p.split(',').map(seg => pkgName(seg.replace(/^\//, ''))).filter(Boolean);
    } catch { return [String(u)]; }
  };

  const vendors = () => {
    const out = new Set();
    for (const n of document.querySelectorAll('script[src], link[rel=stylesheet]')) {
      const u = n.src || n.href || '';
      if (!/^https?:/i.test(u)) continue;
      if (u.includes('/mehrlander/')) continue;   // own code, already classified
      for (const v of vendorNames(u)) out.add(v);
    }
    // A package often arrives both pinned and bare (a versioned stylesheet
    // alongside an unversioned font URL). Keep the pinned form only.
    const pinned = new Set([...out].filter(v => v.includes('@', 1)).map(v => v.split('@').slice(0, -1).join('@')));
    return [...out].filter(v => v.includes('@', 1) || !pinned.has(v)).sort();
  };

  // Classify the runtime closure. Returns the plan WITHOUT fetching anything,
  // so the FAB can show what a brief would contain before one is assembled.
  // opts.gh / opts.scripts / opts.reads let a caller describe a closure other
  // than this window's. The FAB passes the toss subject's, since inside a toss
  // the page on screen is in the frame and the globals belong to the shell.
  const plan = (opts = {}) => {
    const gh = opts.gh || window.gh;
    const path = opts.path || document.querySelector('[data-path]')?.dataset.path || '';
    const entries = (opts.scripts || window.__loadedScripts || [])
      .filter(e => e.status !== 'error' && !MACHINERY.has(e.path));
    const own = [], floor = [];
    for (const e of entries) {
      const auto = e.auto === true;
      (FLOOR[e.path] || auto ? floor : own).push({
        path: e.path,
        role: FLOOR[e.path] || '',
        by: [...(e.by || [])].filter(b => b && b !== '(direct)'),
      });
    }
    const reads = (opts.reads || window.__reads || []).map(r => r.path);
    return {
      path,
      repo: (gh && gh.repo) || 'mehrlander/web-tools',
      ref: (gh && gh.ref) || window.__bundleRef || 'main',
      own, floor, reads,
      vendor: vendors(),
      wholeLib: WHOLE_LIB.test(path),
    };
  };

  // Fetch a lib module's source at the booted ref. gh.get resolves repo-root
  // paths; the loader's paths are lib/-relative, so re-prefix.
  const getModule = async (gh, p) => {
    const { text } = await gh.get('lib/' + p);
    return text;
  };

  // Assemble the markdown. opts.ask prepends the question being asked, which is
  // what makes the paste a request rather than a dump.
  const assemble = async (opts = {}) => {
    const gh = opts.gh || window.gh;
    if (!gh?.get) throw new Error('window.gh required (gh.get fetches source at the booted ref)');
    const p = plan(opts);
    if (!p.path) throw new Error('No page path: pass opts.path or set a [data-path] element (the FAB carries it)');
    if (p.wholeLib && !opts.force) {
      throw new Error('This page boots the whole pre-build (~262K tokens). Brief a single component instead.');
    }

    const pageSrc = (await gh.get(p.path)).text;
    const mods = [];
    for (const m of p.own) {
      try { mods.push({ path: 'lib/' + m.path, src: await getModule(gh, m.path), by: m.by }); }
      catch (e) { mods.push({ path: 'lib/' + m.path, src: null, err: (e && e.message) || String(e) }); }
    }

    const L = [];
    if (opts.ask) L.push(opts.ask.trim(), '');
    L.push('# ' + p.path, '');
    L.push('`' + p.repo + '` at `' + p.ref + '`. Source below is the repo copy at that ref, not the mutated DOM.', '');

    L.push('## What this page loads', '');
    if (mods.length) {
      L.push("Its own modules, full source included below:", '');
      for (const m of mods) {
        L.push('- `' + m.path + '`' + (m.src ? ' (' + KB(m.src.length) + ')' : ' — unavailable: ' + m.err) +
               (m.by && m.by.length ? ' — loaded by ' + m.by.map(b => '`' + b + '`').join(', ') : ''));
      }
      L.push('');
    } else {
      L.push('No first-party modules beyond the boot chain: the page is self-contained above the library.', '');
    }

    if (p.floor.length) {
      L.push('Library boot chain, **not included** (identical on every page in this repo, and not what the review is about):', '');
      for (const f of p.floor) L.push('- `lib/' + f.path + '`' + (f.role ? ' — ' + f.role : ''));
      L.push('');
    }
    if (p.vendor.length) L.push('Third-party, from CDN: ' + p.vendor.map(v => '`' + v + '`').join(', '), '');
    if (p.reads.length) L.push('Data read at runtime: ' + p.reads.map(r => '`' + r + '`').join(', '), '');

    L.push('## `' + p.path + '`', '', '```html', pageSrc, '```', '');
    for (const m of mods) {
      if (!m.src) continue;
      L.push('## `' + m.path + '`', '', '```' + langFor(m.path), m.src, '```', '');
    }

    const text = L.join('\n');
    return { text, bytes: text.length, tokens: tokens(text.length), path: p.path, modules: mods.length, plan: p };
  };

  const ensureIo = async () => {
    if (window.io?.copy) return;
    if (window.gh?.load) { try { await window.gh.load('kits/io.js'); } catch (e) {} }
    if (!window.io?.copy) throw new Error('io.copy unavailable (kits/io.js failed to load)');
  };

  // Assemble and put it on the clipboard. io.copy carries the iOS
  // click-to-copy fallback, so this works on a phone.
  const copy = async (opts = {}) => {
    await ensureIo();
    const b = await assemble(opts);
    await window.io.copy(b.text);
    return b;
  };

  // Hand the computed closure to the stage, which is the tool that specializes
  // in choosing among a fileset. The FAB knows WHICH files (only a running page
  // can); the stage knows what to DO with them. This is the seam between them.
  //
  // Single-group mint only (one repo at one ref), which is the narrow case of
  // window.StageLink's grammar; stage.js holds the canonical bidirectional
  // implementation, and is not loaded on an ordinary page.
  const b64urlEnc = (s) => btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const stageUrl = (opts = {}) => {
    const p = plan(opts);
    if (!p.path) return '';
    const paths = [p.path, ...p.own.map(m => 'lib/' + m.path)]
      .map(x => encodeURIComponent(x).replace(/%2F/gi, '/'));
    let u = 'https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html' +
            '#stage=' + p.repo + '@' + p.ref + ':' + paths.join(',');
    const prompts = (opts.prompts || []).filter(x => x && x.label && x.ask);
    if (prompts.length) u += '&prompts=' + b64urlEnc(JSON.stringify(prompts));
    return u;
  };

  window.brief = { plan, assemble, copy, stageUrl, FLOOR };
})();
