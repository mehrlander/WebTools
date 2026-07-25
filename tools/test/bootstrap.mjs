// tools/test/bootstrap.mjs — shared bootstrap for `npm test` (node --test).
//
// Two halves, matching the two kinds of code under lib/:
//
//  • loadKit(name, …) — run a lib/kits/*.js file in the Node realm against a
//    plain `window` object. Kits lazy-load third-party libraries via
//    `await import('<CDN url>')`; the loader rewrites those calls to pull the
//    npm-vendored copy through window.__testImport instead. One exception is
//    masked off first: compression.js's text.templates embeds the same URL
//    inside a template string that emits user-facing snippets, which must
//    reach the output byte-intact. Mappings live in KIT_IMPORTS. Same tactic
//    as tools/render/preview.mjs's __pvImport shim, pared down for unit tests.
//
//  • makeWindow() + startAlpine() — the reusable jsdom + Alpine bootstrap that
//    docs/environment/testing.md ("Logic-testing Alpine components with jsdom")
//    previously derived by hand in each test: the cross-realm Event/CustomEvent
//    fix, the DOM globals Alpine reaches for, matchMedia (flippable) and
//    requestAnimationFrame polyfills, and startup warning/error capture.
//
// Each *.test.mjs runs in its own process under `node --test`, so the global
// patches makeWindow applies can't leak between test files.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import jsdomPkg from 'jsdom';

const { JSDOM } = jsdomPkg;
const require = createRequire(import.meta.url);
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// CDN url → vendored loader. Each must return what the kit's `await import()`
// would have resolved to (a module-namespace-like object).
export const KIT_IMPORTS = {
  'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm': () => import('idb-keyval'),
  // require(), not import — brotli-wasm's `exports.import` points at the
  // wasm-bundler web entry, which Node can't resolve. The CJS entry mirrors
  // the web shape: `.default` is a promise of { compress, decompress }, so
  // the kit's `.then(m => m.default)` chain lands on the same module.
  'https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module': async () => require('brotli-wasm'),
  'https://unpkg.com/acorn@8.11.3/dist/acorn.mjs': () => import('acorn'),
  'https://cdn.jsdelivr.net/npm/fast-xml-parser@4.5.1/+esm': () => import('fast-xml-parser'),
  'https://cdn.jsdelivr.net/npm/flat@6.0.0/+esm': () => import('flat'),
};

// Run lib/kits/<name>.js against `window` (a plain object is fine for kits —
// they only assign their global onto it). Bare identifiers in the kit source
// (btoa, Blob, CompressionStream, indexedDB, DOMParser, …) resolve in the Node
// global scope: Node 22 provides all but DOMParser natively; tests that need
// DOMParser or indexedDB set globalThis.DOMParser (from jsdom) or import
// 'fake-indexeddb/auto' themselves. `console` is shadowed by a parameter so a
// kit that wraps console methods (kits/console.js) can't touch the real one.
// An async kit body (gh.load shape: `return (async () => …)()`) finishes
// registering after its awaits; callers await `w.__kitReturn` for that.
export function loadKit(name, { window: w = {}, imports = KIT_IMPORTS, console: cons = console } = {}) {
  const file = path.join(repoRoot, 'lib', 'kits', name.endsWith('.js') ? name : `${name}.js`);
  let src = readFileSync(file, 'utf8');
  // Mask the template-literal import (it must survive byte-intact), rewrite
  // every real call site for a mapped URL, then unmask.
  const MASK = '@@KEEP_IMPORT@@';
  src = src.split("await(await import(").join(`await(await ${MASK}(`);
  for (const url of Object.keys(imports)) {
    src = src.split(`import('${url}')`).join(`window.__testImport('${url}')`);
  }
  src = src.split(MASK).join('import');
  w.__testImport ??= (url) => {
    const loader = imports[url];
    if (!loader) return Promise.reject(new Error(`bootstrap: no KIT_IMPORTS mapping for ${url}`));
    return Promise.resolve(loader());
  };
  w.__kitReturn = new Function('window', 'console', src)(w, cons);
  return w;
}

// jsdom window prepared for the real Alpine runtime. Returns:
//   window   — the jsdom window (runScripts: 'dangerously')
//   setMedia(matches) — flip every matchMedia query the page has made and fire
//              their 'change' listeners (single-breakpoint semantics: every
//              query flips together, which fits components watching one query)
//   problems — [level, message] pairs captured from window+global console
//              warn/error and window 'error' events; assert it stays empty to
//              catch eager-binding startup throws (see testing.md)
// `url` sets the document's location, which matters for any component that
// reads its own query string (?use= being the one that pins a preview ref).
export function makeWindow({ html = '<!doctype html><html><body></body></html>',
                             url = 'https://localhost/test/' } = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true, // provides requestAnimationFrame + performance
    url,
  });
  const { window } = dom;

  // Node ships its own global Event/CustomEvent; Alpine (imported in the Node
  // realm) mints events with them and dispatches on jsdom nodes, which throws
  // cross-realm. Point the globals at the jsdom realm's constructors.
  global.Event = window.Event;
  global.CustomEvent = window.CustomEvent;

  // DOM globals Alpine dereferences bare.
  for (const k of ['ShadowRoot', 'Node', 'HTMLElement', 'DocumentFragment',
                   'MutationObserver', 'Element', 'customElements']) {
    global[k] = window[k];
  }
  global.window = window;
  global.document = window.document;

  // matchMedia polyfill with settable matches + change events.
  const mqls = [];
  window.matchMedia = (query) => {
    const listeners = new Set();
    const mql = {
      media: query,
      matches: false,
      onchange: null,
      addEventListener: (t, fn) => { if (t === 'change') listeners.add(fn); },
      removeEventListener: (t, fn) => { listeners.delete(fn); },
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      dispatch: () => { for (const fn of [...listeners]) fn({ matches: mql.matches, media: query }); },
    };
    mqls.push(mql);
    return mql;
  };
  const setMedia = (matches) => { for (const m of mqls) { m.matches = matches; m.dispatch(); } };

  window.requestAnimationFrame ??= (cb) => setTimeout(() => cb(Date.now()), 0);
  // Alpine's x-show transitions call these bare in the Node realm.
  global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  global.cancelAnimationFrame = window.cancelAnimationFrame?.bind(window) ?? clearTimeout;
  // x-transition reads getComputedStyle (bare) to time transitions; jsdom's
  // returns empty durations, so Alpine treats them as instantaneous.
  global.getComputedStyle = window.getComputedStyle.bind(window);

  // Startup warning/error capture: window console (component code) AND the
  // Node-global console (Alpine itself runs in the Node realm).
  const problems = [];
  window.addEventListener('error', (e) => problems.push(['error', e.error?.message ?? e.message]));
  for (const cons of [window.console, console]) {
    for (const level of ['warn', 'error']) {
      const orig = cons[level].bind(cons);
      cons[level] = (...args) => { problems.push([level, args.map(String).join(' ')]); orig(...args); };
    }
  }

  return { dom, window, setMedia, problems };
}

// Import the real Alpine, register it on the window, run each component file
// in the window realm (they hook 'alpine:init'), start Alpine, and let the
// first effects flush. Component paths are repo-relative.
export async function startAlpine(window, componentPaths = []) {
  // The ESM file, not the package root: the package has no `exports` map, so
  // bare 'alpinejs' resolves to the CJS build, whose default export arrives
  // double-wrapped under Node's interop (and it news a MutationObserver at
  // import time, so makeWindow must already have run either way).
  const { default: Alpine } = await import('alpinejs/dist/module.esm.js');
  window.Alpine = Alpine;
  for (const p of componentPaths) {
    const src = readFileSync(path.join(repoRoot, p), 'utf8');
    new window.Function(src)();
  }
  Alpine.start();
  await tick(3);
  return Alpine;
}

// Let queued microtasks / $nextTick callbacks flush before asserting.
export const tick = async (n = 2) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
