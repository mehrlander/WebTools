// kits/build.js — the single source of truth for "the build": a page's gh.load
// chain frozen into one self-resolving, offline artifact.
//
// Two consumers share this one emitter so the format can't drift:
//   - tools/build/build.mjs (Node) feeds it a statically-walked cache (tools/build/graph.mjs)
//     and writes dist/<page>.js.
//   - kits/export.js (browser) feeds it the runtime __loadedScripts cache and
//     bakes the result into a downloadable, fully-offline page.
//
// The build is the real gh-api.js loader with GH.prototype.get overridden by an
// inlined path -> source cache. The actual loader runs (same strip+wrap+execute,
// gh-boot registry, read() tracking); only the bytes come from memory. Third-party
// libs are untouched — they stay on the page's CDN tags.
//
// window.buildKit:
//   emit({ ghApiSrc, cache, data?, repo, defaultRef, header? }) -> string
//       Assemble the build JS. `cache` is { 'lib/<path>': source }, keyed by what
//       GH.prototype.get receives. `ghApiSrc` is raw lib/gh-api.js (emit strips its
//       jsDelivr bootstrap tail + `export default`). Optional `data` is
//       { '<read path>': value }, which overrides read() the way `cache` overrides
//       get(): the zip export can lay data beside the HTML as sibling files, but a
//       single-file copy has nowhere to put them, so the values ride inside.
//   bake(pageHtml, buildJs) -> string
//       Rewrite a page's jsDelivr gh-api.js import to a data: URL carrying the
//       build, so the page boots from the inlined cache with no network. Works for
//       both boot styles (the import's return is `export default GH`, and the build
//       also sets window.gh/GH + runs gh-boot via top-level await).
//   bakeable(pageHtml) -> boolean
//       Whether bake() has an import to rewrite. A page with no lib chain at all is
//       already self-contained, so a caller should pass its source through untouched
//       rather than treat the missing import as a failure.
//   collectCache(gh, opts?) -> { ghApiSrc, cache } (browser; async)
//       Gather the cache at runtime: fetch lib/gh-api.js, then lib/<path> for every
//       own-code entry in window.__loadedScripts (gh-api.js excluded — it's the
//       loader, not a cached file).
(() => {
  const LOADER_CUT = '// Auto-bootstrap when loaded';

  // gh-api.js minus its jsDelivr auto-bootstrap tail and `export default`,
  // leaving the console-capture IIFE + the GH class as a plain declaration.
  const stripLoader = (ghApiSrc) => {
    let src = ghApiSrc;
    const cut = src.indexOf(LOADER_CUT);
    if (cut > 0) src = src.slice(0, cut).replace(/\s+$/, '') + '\n';
    return src.replace(/export\s+default\s+class\s+GH/, 'class GH');
  };

  const emit = ({ ghApiSrc, cache, data = null, repo, defaultRef, header = '', extraBoot = [] }) => {
    const loader = stripLoader(ghApiSrc);
    const entries = Object.keys(cache)
      .map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(cache[k])},`)
      .join('\n');
    // Extra boot steps run after gh-boot.js, inside the same window block. The
    // pre-build (tools/build/build-lib.mjs) uses this to register every Alpine
    // component and boot alpine-bundle.js. Per-page builds pass none, so their
    // emitted output is unchanged.
    const extra = extraBoot.length
      ? '\n' + extraBoot.map(p => `  await window.gh.load(${JSON.stringify(p)});`).join('\n')
      : '';
    // read() is the data twin of get(), so it gets the same treatment: values
    // inlined, checked before the local <script src> probe (which would 404 in a
    // paste-and-render context) and before any network call. Installed ahead of
    // gh-boot, so gh-boot's __reads recorder still wraps the outermost read.
    const dataBlock = data && Object.keys(data).length ? `
// path -> resolved value for every read() the page performed. Consulted before
// read()'s local probe and before the network, so the data travels in the file.
const __DATA = {
${Object.keys(data).map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(data[k])},`).join('\n')}
};

const __read = GH.prototype.read;
GH.prototype.read = async function (p) {
  if (Object.prototype.hasOwnProperty.call(__DATA, p)) return __DATA[p];
  return __read.call(this, p);
};
` : '';
    return `${header}${loader}
const __REPO = ${JSON.stringify(repo)};
const __DEFAULT_REF = ${JSON.stringify(defaultRef)};

// path -> source for every own-repo file the page can reach. Keyed by what
// GH.prototype.get receives (loadBase 'lib/' + the gh.load path).
const __CACHE = {
${entries}
};

// Serve cached own-code from memory; anything else (cross-repo, dynamic, or a
// path not captured) falls through to the real network get().
const __get = GH.prototype.get;
GH.prototype.get = async function (p) {
  if (Object.prototype.hasOwnProperty.call(__CACHE, p)) {
    const text = __CACHE[p];
    return { text, sha: 'build:' + __DEFAULT_REF, size: text.length, url: '' };
  }
  return __get.call(this, p);
};
${dataBlock}
// Reproduce gh-api.js's bootstrap, offline: honor ?use=<ref> (so a built page can
// still be re-pinned), expose window.gh, and run the gh-boot chain from cache.
// __bundleRef is the gh-api.js/fab.js contract name, kept verbatim.
if (typeof window !== 'undefined') {
  const ref = new URLSearchParams(location.search).get('use') || __DEFAULT_REF;
  window.GH = GH;
  window.gh = new GH({ repo: __REPO, ref, loadBase: 'lib/' });
  window.__bundleRef = ref;
  window.__builtOffline = true;
  await window.gh.load('gh-boot.js');${extra}
}

export default GH;
`;
  };

  // Rewrite the page's gh-api.js import to a self-contained data: module. The
  // import's `await` then drives the build's top-level await (gh-boot runs), and
  // `export default GH` satisfies pages that read mod.default.
  //
  // Match the import CALL, not a literal URL. Two boot idioms are in use and only
  // one spells the URL out: the canonical block imports the jsDelivr URL directly,
  // while every kit demo builds it from a `base` const and imports `${base}/gh-api.js`.
  // A literal-URL pattern reaches 25 pages and misses 33, and the ones it misses are
  // not chainless — they have a chain it cannot see, which is the worse failure,
  // since the output looks fine and then asks the network for its modules. Anchoring
  // on `import(` keeps the rewrite scoped to a call while staying blind to how the
  // specifier was spelled. `[^()]*` holds it to one call with no nesting.
  const GH_IMPORT_RE = /import\(\s*[^()]*gh-api\.js[^()]*\)/g;
  const bakeable = (pageHtml) => { GH_IMPORT_RE.lastIndex = 0; return GH_IMPORT_RE.test(pageHtml); };
  const bake = (pageHtml, buildJs) => {
    GH_IMPORT_RE.lastIndex = 0;
    if (!GH_IMPORT_RE.test(pageHtml)) {
      throw new Error('bake: no gh-api.js import call found in page to rewrite');
    }
    GH_IMPORT_RE.lastIndex = 0;
    const dataUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(buildJs);
    return pageHtml.replace(GH_IMPORT_RE, 'import(' + JSON.stringify(dataUrl) + ')');
  };

  const collectCache = async (gh, opts = {}) => {
    if (!gh?.get) throw new Error('collectCache: window.gh with get() required');
    const scripts = opts.scripts || (typeof window !== 'undefined' ? window.__loadedScripts : null);
    if (!scripts) throw new Error('collectCache: no __loadedScripts to read');

    const ghApiSrc = (await gh.get('lib/gh-api.js')).text;
    const cache = {};
    for (const s of scripts) {
      const p = s.path;
      if (!p || p === 'gh-api.js' || /^https?:/i.test(p)) continue; // loader / cross-repo
      if (s.status && s.status !== 'ok') continue;
      const key = 'lib/' + p;
      if (cache[key]) continue;
      try { cache[key] = (await gh.get(key)).text; } catch (e) { /* skip unreadable */ }
    }
    return { ghApiSrc, cache };
  };

  window.buildKit = { emit, bake, bakeable, collectCache, stripLoader };
})();
