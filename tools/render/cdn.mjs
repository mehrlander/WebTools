// Shared CDN -> local resolution for the headless render tools.
//
// The repo's pages pull three things off the network:
//   1. Own code  — gh-api.js's loader fetches lib/* via the GitHub contents
//      API (base64), after the page's first jsDelivr `/gh/` import of gh-api.js
//      itself. Both must resolve to the on-disk working tree so a render shows
//      branch edits, not whatever main serves.
//   2. Own data: the GitHub API surface for REPO (contents listings/reads,
//      /repos/<REPO> metadata, git/trees) is answered from the working tree
//      too: no token, no network, and uncommitted edits render. Other repos'
//      API calls pass through (and fail in the sandbox). Identity endpoints
//      (/user, /user/repos) are NOT impersonated, since "who am I" has no
//      local answer; pages must keep first paint off them (see testing.md).
//   3. Third-party libs — Tailwind/daisyUI/Phosphor/Alpine/etc. from jsDelivr +
//      unpkg, both blocked in this sandbox. Each maps to an npm-installed copy
//      under node_modules.
//
// resolveCdn(url, repoRoot, ref?) classifies a request URL and returns one of:
// (ref is the render's --ref value, used to strip a slashed branch name from a
// raw.githubusercontent own-code URL; optional, only the raw case reads it.)
//   { kind:'fulfill', body, contentType }  serve these local bytes
//   { kind:'empty',   contentType }        a known-but-unvendored dep: serve
//                                          nothing (don't break on it), and the
//                                          `tag` says what was skipped
//   { kind:'continue' }                    an allowed host (fonts, APIs): let it
//                                          go to the network unchanged
//
// Used by tools/render/screenshot.mjs (Playwright route) and reusable by any future
// pixel/preview tool. The logic-level twin lives inline in tools/render/preview.mjs.
//
// This is the web-tools-specific implementation (it also impersonates the GitHub
// API for this repo). The portable, repo-agnostic write-up of the
// vendor-and-intercept concept is docs/headless-vendoring.md.

import { readFileSync, existsSync, statSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const REPO = 'mehrlander/web-tools';

// Serialized git/trees body, built once per process (see the trees branch).
let treeBodyCache = null;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};
export const typeFor = p => TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';

// Packages whose CDN default file differs from what package.json main/browser
// would pick. jsDelivr/unpkg serve the browser-global build for these; npm main
// is a CommonJS/ESM entry that won't run from a plain <script>.
const CDN_DEFAULT = {
  'alpinejs': 'dist/cdn.min.js',
  '@alpinejs/collapse': 'dist/cdn.min.js',
  '@alpinejs/sort': 'dist/cdn.min.js',
  'daisyui': 'daisyui.css',
  'tabulator-tables': 'dist/js/tabulator.min.js',
};

// Resolve a package + optional subpath to a file under node_modules. `esm`
// marks a jsDelivr `/+esm` import: prefer the package's ESM entry
// (exports["."].import / module), since the UMD/browser default those CDN
// fields point at has no named exports for an `import { x }` to bind to.
// (jsDelivr also bundles a CJS graph into ESM server-side; that we can't do,
// so a CJS-only package still misses — e.g. fast-xml-parser.)
function nodeFile(repoRoot, pkg, sub, esm, combine) {
  const dir = path.join(repoRoot, 'node_modules', pkg);
  if (sub) return path.join(dir, sub);
  // CDN_DEFAULT models the /npm/ route, which honors the `unpkg` field. The
  // /combine/ route does NOT: it resolves through package.json main, so a bare
  // `npm/alpinejs` spec there yields dist/module.cjs.js and the page gets a
  // CommonJS file that defines no global. Applying the map to a combine request
  // served a working Alpine no browser would ever receive, and pages/doc-growth
  // shipped dead while passing every local render (SNAGS: combine-serves-cjs).
  if (!combine && CDN_DEFAULT[pkg]) return path.join(dir, CDN_DEFAULT[pkg]);
  const pj = path.join(dir, 'package.json');
  if (existsSync(pj)) {
    try {
      const j = JSON.parse(readFileSync(pj, 'utf8'));
      const dot = j.exports && j.exports['.'];
      const def = esm
        ? (dot && (dot.import || dot.module || dot.default)) || j.module || j.main || 'index.js'
        : j.jsdelivr || j.unpkg || j.browser || j.module || j.main || 'index.js';
      if (typeof def === 'string') return path.join(dir, def);
    } catch {}
  }
  return path.join(dir, 'index.js');
}

// Parse a jsDelivr `npm/<pkg>[@ver]/<sub>` or unpkg `<pkg>[@ver]/<sub>` spec
// into { pkg, sub, esm }. Handles scoped packages and a trailing `+esm`.
function parseNpm(spec) {
  spec = spec.replace(/^npm\//, '');
  const esm = /\/\+esm$/.test(spec);
  spec = spec.replace(/\/?\+esm$/, '').replace(/\/$/, '');
  let scope = '', rest = spec;
  if (spec.startsWith('@')) {
    const i = spec.indexOf('/');
    scope = spec.slice(0, i) + '/';
    rest = spec.slice(i + 1);
  }
  const j = rest.indexOf('/');
  const nameVer = j < 0 ? rest : rest.slice(0, j);
  const sub = j < 0 ? '' : rest.slice(j + 1);
  const name = nameVer.replace(/@.*/, '');
  return { pkg: scope + name, sub, esm };
}

// A package whose CDN path and whose npm path are different packages.
//
// Pages load `@tailwindcss/typography/dist/typography.min.css`. That file has
// not been published since 0.5.0: every version after it ships the Tailwind
// PLUGIN and no built CSS. jsDelivr answers the versionless URL by falling back
// to the last version that has the file, which its own header confirms
// (`x-jsd-version: 0.5.0`), so a real browser has been loading 0.5.0 all along
// while `node_modules/@tailwindcss/typography` holds the current plugin. The
// resolver saw a package with no such file and served an honest MISS, which is
// why every headless screenshot of a prose surface was taken with no prose
// styles at all: no 65ch measure, no paragraph rhythm, no list markers.
//
// So 0.5.0 is installed a second time under an alias (package.json,
// `typography-dist`) and this table points the CDN path at it. Real bytes,
// byte-identical to what the CDN serves, which is the vendoring rule in
// docs/headless-vendoring.md rather than an exception to it. Found on
// 2026-09-02 by a prose block that wrapped at 470px on a phone and at the full
// 1171px in every screenshot taken of it.
const PKG_ALIAS = { '@tailwindcss/typography': 'typography-dist' };

function readSpec(spec, repoRoot, combine) {
  const { pkg: cdnPkg, sub, esm } = parseNpm(spec);
  const pkg = (PKG_ALIAS[cdnPkg] && existsSync(path.join(repoRoot, 'node_modules', PKG_ALIAS[cdnPkg], sub)))
    ? PKG_ALIAS[cdnPkg] : cdnPkg;
  let fp = nodeFile(repoRoot, pkg, sub, esm, combine);
  // jsDelivr auto-minifies: a `.min.js`/`.min.css` URL works on the CDN even
  // when the npm tarball ships only the unminified file (e.g. codemirror@5).
  if (!existsSync(fp) && /\.min\.(js|css)$/.test(fp)) {
    const plain = fp.replace(/\.min\.(js|css)$/, '.$1');
    if (existsSync(plain)) fp = plain;
  }
  // A URL naming the package's own bundle (npm/marked/marked.min.js) is served
  // by jsDelivr from whatever the published tarball happens to lay out, which
  // moves between majors: marked@18 ships lib/marked.umd.js and nothing at the
  // root. When the explicit sub-path misses and its basename is the package's
  // own name, fall back to the package's declared browser entry, which is the
  // file the URL was after. Scripted as a rule rather than a per-package alias
  // so the next relocation resolves itself.
  if (!existsSync(fp) && sub && path.basename(sub).replace(/\.min\.(js|css)$/, '.$1').split('.')[0] === pkg.split('/').pop()) {
    const manifest = path.join(repoRoot, 'node_modules', pkg, 'package.json');
    if (existsSync(manifest)) {
      try {
        const m = JSON.parse(readFileSync(manifest, 'utf8'));
        const entry = typeof m.browser === 'string' ? m.browser : m.main;
        // Only when the entry is the same KIND of file that was asked for. A
        // package's declared entry is its Node entry, and for a plugin that is
        // JavaScript no matter what the URL wanted: @tailwindcss/typography
        // ships no dist CSS, its basename matches its package name, so a
        // request for dist/typography.min.css resolved to src/index.js and the
        // page was served a Node module as its stylesheet. It reported a hit
        // (combine 3/3) and rendered with no prose styles at all, which made a
        // headless screenshot silently disagree with every real browser. A
        // miss is the honest answer and shows up as MISS in the log.
        if (entry && path.extname(entry) === path.extname(fp).replace(/^\.min/, '')) {
          const cand = path.join(repoRoot, 'node_modules', pkg, entry);
          if (existsSync(cand)) fp = cand;
        }
      } catch (e) { /* unreadable manifest: fall through to the miss */ }
    }
  }
  if (existsSync(fp)) return { body: readFileSync(fp), contentType: typeFor(fp) };
  return null;
}

export function resolveCdn(rawUrl, repoRoot, ref) {
  let u;
  try { u = new URL(rawUrl); } catch { return { kind: 'continue' }; }
  const host = u.host;

  // --- Own code: jsDelivr /gh/<repo>[@ref]/<path> (the first gh-api.js import) ---
  if (host === 'cdn.jsdelivr.net' && u.pathname.startsWith(`/gh/${REPO}`)) {
    const tail = u.pathname.slice(`/gh/${REPO}`.length).replace(/^@[^/]+/, '');
    const rel = decodeURIComponent(tail).replace(/^\//, '');
    const fp = path.join(repoRoot, rel);
    if (existsSync(fp)) return { kind: 'fulfill', body: readFileSync(fp), contentType: typeFor(fp), tag: `gh ${rel}` };
    return { kind: 'empty', contentType: 'application/javascript; charset=utf-8', tag: `MISS gh ${rel}` };
  }
  // Other /gh/ refs are third-party data (word lists, etc.) — not vendored.
  if (host === 'cdn.jsdelivr.net' && u.pathname.startsWith('/gh/')) {
    return { kind: 'empty', contentType: 'application/octet-stream', tag: `skip ${u.pathname}` };
  }

  // --- Own code: raw.githubusercontent.com/<repo>/<ref>/<path>. The pre-build
  // ?use= boot loads dist/web-tools.js this way (fetch + blob-import), so a
  // --ref render must serve the working tree here too, or it would hit the
  // real remote bundle and lose branch edits. Mirrors the jsDelivr /gh/ case.
  // The ref is stripped by the exact --ref value (branch names carry slashes,
  // so segment-counting can't find where the path starts); with no ref known,
  // fall back to dropping one segment. ---
  if (host === 'raw.githubusercontent.com' && u.pathname.startsWith(`/${REPO}/`)) {
    const after = u.pathname.slice(`/${REPO}/`.length);
    const tail = (ref && after.startsWith(ref + '/'))
      ? after.slice(ref.length + 1)
      : after.replace(/^[^/]+\//, '');
    const rel = decodeURIComponent(tail);
    const fp = path.join(repoRoot, rel);
    if (existsSync(fp)) return { kind: 'fulfill', body: readFileSync(fp), contentType: typeFor(fp), tag: `raw ${rel}` };
    return { kind: 'empty', contentType: 'application/javascript; charset=utf-8', tag: `MISS raw ${rel}` };
  }

  // --- Own code via GitHub Pages: <owner>.github.io/<repo>/<path>. The <base>
  // a toss-render address render stamps resolves the tossed page's relative
  // URLs here, so toss scenarios need it mapped to the working tree too. ---
  {
    const [owner, name] = REPO.split('/');
    if (host === `${owner}.github.io` && u.pathname.startsWith(`/${name}/`)) {
      const rel = decodeURIComponent(u.pathname.slice(name.length + 2));
      const fp = path.join(repoRoot, rel);
      if (existsSync(fp)) return { kind: 'fulfill', body: readFileSync(fp), contentType: typeFor(fp), tag: `pages ${rel}` };
      return { kind: 'empty', contentType: 'application/octet-stream', tag: `MISS pages ${rel}` };
    }
  }

  // --- Own repo metadata: /repos/<REPO> (identity-free page boots) ---
  if (host === 'api.github.com' && u.pathname === `/repos/${REPO}`) {
    const [login, name] = REPO.split('/');
    return {
      kind: 'fulfill', contentType: 'application/json; charset=utf-8', tag: 'api repo meta',
      body: JSON.stringify({
        full_name: REPO, name, owner: { login }, default_branch: 'main',
        private: false, has_pages: true, description: '(local render)',
        stargazers_count: 0, forks_count: 0, pushed_at: new Date().toISOString(),
      }),
    };
  }

  // --- Own repo tree: git/trees/<ref> (the Pages lens scan) ---
  // Always answered recursively from the working tree; the ref is ignored
  // because the working tree IS the ref being rendered.
  if (host === 'api.github.com' && u.pathname.startsWith(`/repos/${REPO}/git/trees/`)) {
    if (!treeBodyCache) {
      const skip = new Set(['.git', 'node_modules']);
      const tree = [];
      const walk = (rel) => {
        const dir = path.join(repoRoot, rel);
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (!rel && skip.has(e.name)) continue;
          const p = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) { tree.push({ path: p, type: 'tree' }); walk(p); }
          else {
            // Real blobs carry size; keep the impersonation faithful (repo-atlas
            // maps by it). lstat, not stat: for a symlink the live API reports the
            // target-path string length, which is exactly the link inode's size —
            // and a dangling link (or a file deleted since readdir) must degrade
            // to one sizeless entry, not kill the whole tree response.
            let size = 0;
            try { size = lstatSync(path.join(dir, e.name)).size; } catch {}
            tree.push({ path: p, type: 'blob', size });
          }
        }
      };
      walk('');
      // The working tree is fixed for the lifetime of one render process; don't
      // re-stat thousands of files when a page asks for the tree again.
      treeBodyCache = JSON.stringify({ sha: 'local', truncated: false, tree });
    }
    return {
      kind: 'fulfill', contentType: 'application/json; charset=utf-8',
      tag: `api tree (cached)`,
      body: treeBodyCache,
    };
  }

  // --- Own code: GitHub contents API (every load after gh-api.js) ---
  if (host === 'api.github.com' && u.pathname.startsWith(`/repos/${REPO}/contents/`)) {
    const tail = u.pathname.slice(`/repos/${REPO}/contents/`.length);
    const rel = decodeURIComponent(tail).replace(/\/$/, '');
    const fp = path.join(repoRoot, rel);
    if (existsSync(fp)) {
      // A directory path returns the contents-API array, not file bytes — and
      // readFileSync on a dir throws EISDIR, so this guard is also a crash fix.
      if (statSync(fp).isDirectory()) {
        const entries = readdirSync(fp, { withFileTypes: true }).map(e => ({
          name: e.name,
          path: rel ? `${rel}/${e.name}` : e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          sha: 'local', size: 0, html_url: '', download_url: '',
        }));
        return { kind: 'fulfill', contentType: 'application/json; charset=utf-8', tag: `api dir ${rel}`, body: JSON.stringify(entries) };
      }
      // Bytes, not text. Reading as utf8 and re-encoding round-trips a text
      // file exactly and CORRUPTS every binary one, since the invalid
      // sequences in a PNG are replaced on decode and the base64 that goes out
      // is of the replacements. The real contents API base64s the bytes, so
      // this does too, which is what lets a page fetching an image through the
      // API (the viewer's image module) be rendered headlessly at all.
      const bytes = readFileSync(fp);
      return {
        kind: 'fulfill', contentType: 'application/json; charset=utf-8', tag: `api ${tail}`,
        body: JSON.stringify({
          content: bytes.toString('base64'),
          encoding: 'base64', sha: 'local', size: bytes.length, html_url: '',
        }),
      };
    }
    return { kind: 'empty', contentType: 'application/json; charset=utf-8', tag: `MISS api ${tail}` };
  }

  // --- A SIBLING repo's contents, served from its checkout next to this one ---
  //
  // The estate's newer panes are cross-repo: the Chats pane reads
  // mehrlander/chat-histories, the guides fold reads whichever repos hold a
  // shelf. Without this they render the signed-out state headlessly, which is
  // the one view nobody needs a screenshot of, so a cross-repo pane could be
  // shot only by hand with a real token.
  //
  // Scoped deliberately: the repo NAME must match a directory beside this
  // checkout, and that directory must be a git repo. A multi-repo session
  // already has the siblings on disk (this one holds four), and a request for
  // a repo that is not checked out falls through to the miss below rather than
  // reaching the network, so the render stays offline either way.
  const sibling = /^\/repos\/[^/]+\/([^/]+)\/contents\/(.*)$/.exec(u.pathname);
  if (host === 'api.github.com' && sibling) {
    const [, name, tail] = sibling;
    const root = path.join(repoRoot, '..', name);
    const rel = decodeURIComponent(tail).replace(/\/$/, '').replace(/\?.*$/, '');
    const fp = path.join(root, rel);
    if (existsSync(path.join(root, '.git')) && existsSync(fp)) {
      if (statSync(fp).isDirectory()) {
        const entries = readdirSync(fp, { withFileTypes: true }).map(e => ({
          name: e.name, path: rel ? `${rel}/${e.name}` : e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          sha: 'local', size: 0, html_url: '', download_url: '',
        }));
        return { kind: 'fulfill', contentType: 'application/json; charset=utf-8',
                 tag: `api ${name} dir ${rel}`, body: JSON.stringify(entries) };
      }
      const text = readFileSync(fp, 'utf8');
      return {
        kind: 'fulfill', contentType: 'application/json; charset=utf-8', tag: `api ${name}/${rel}`,
        body: JSON.stringify({
          content: Buffer.from(text).toString('base64'),
          encoding: 'base64', sha: 'local', size: text.length, html_url: '',
        }),
      };
    }
    return { kind: 'empty', contentType: 'application/json; charset=utf-8', tag: `MISS api ${name}/${rel}` };
  }

  // --- Third-party libs: jsDelivr /combine/ (comma-joined specs) ---
  if (host === 'cdn.jsdelivr.net' && u.pathname.startsWith('/combine/')) {
    const specs = u.pathname.slice('/combine/'.length).split(',');
    const parts = [];
    let ct = null, miss = [];
    for (const s of specs) {
      const r = readSpec(s, repoRoot, true);
      if (r) { parts.push(Buffer.from(r.body)); ct = ct || r.contentType; }
      else miss.push(s);
    }
    return {
      kind: 'fulfill', body: Buffer.concat(parts),
      contentType: ct || 'application/javascript; charset=utf-8',
      tag: `combine ${specs.length - miss.length}/${specs.length}` + (miss.length ? ` MISS:${miss.join(',')}` : ''),
    };
  }

  // --- Third-party libs: jsDelivr /npm/ and unpkg ---
  if (host === 'cdn.jsdelivr.net' && u.pathname.startsWith('/npm/')) {
    const r = readSpec(u.pathname.slice(1), repoRoot);
    if (r) return { kind: 'fulfill', body: Buffer.from(r.body), contentType: r.contentType, tag: `npm ${u.pathname}` };
    return { kind: 'empty', contentType: typeFor(u.pathname), tag: `MISS ${u.pathname}` };
  }
  if (host === 'unpkg.com') {
    const r = readSpec(u.pathname.slice(1), repoRoot);
    if (r) return { kind: 'fulfill', body: Buffer.from(r.body), contentType: r.contentType, tag: `unpkg ${u.pathname}` };
    return { kind: 'empty', contentType: typeFor(u.pathname), tag: `MISS unpkg ${u.pathname}` };
  }

  // --- Known-but-unvendored module CDNs (e.g. cm6's esm.sh imports) ---
  if (host === 'esm.sh' || host === 'cdnjs.cloudflare.com') {
    return { kind: 'empty', contentType: 'application/javascript; charset=utf-8', tag: `skip ${host}${u.pathname}` };
  }

  // --- Allowed hosts (Google Fonts, GitHub raw, data APIs): pass through ---
  return { kind: 'continue' };
}
