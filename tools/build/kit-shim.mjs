// Run a browser-shaped gh.load kit (IIFE that sets window.<name>) inside Node, so
// tools can reuse the exact same code the pages load. The kit references a global
// `window`; we hand it a minimal object and return whatever it attached.
//
// Only safe for kits whose used surface is Node-available (JSON, TextEncoder,
// encodeURIComponent, btoa…). build.js's emit/bake qualify; its collectCache
// (which touches gh + __loadedScripts) is browser-only and simply isn't called here.

import { readFileSync } from 'node:fs';
import path from 'node:path';

export function loadKit(repoRoot, relPath) {
  const src = readFileSync(path.join(repoRoot, relPath), 'utf8');
  const window = {};
  // The kit is an IIFE; `window` resolves to this parameter inside it.
  new Function('window', src)(window);
  return window;
}
