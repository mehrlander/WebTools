#!/usr/bin/env node
// Regenerate the catalogs of everything under pages/:
//   pages/README.md   — a dense markdown table (renders in the GitHub folder view)
//   pages/index.html  — the visual index: a card per page, screenshot preview with
//                        a live-iframe / source toggle, on a light daisyUI theme.
//   pages/pages.json  — the same grouped card model index.html embeds, standalone,
//                        so show-repo can render the identical gallery from one source.
//
//   node tools/build/pages-index.mjs        -> writes both files
//   node tools/build/pages-index.mjs --check -> exit 1 if either is stale (CI-friendly)
//
// This is a *catalog* generator, not part of the load -> build -> bake -> export
// code pipeline (tools/README.md). It resolves no dependency graph; it walks the
// pages/ tree and reads each page's <title>. The card previews come from
// pages/thumbs/*.png, generated separately by tools/build/pages-shots.mjs.
//
// Run it whenever pages are added, removed, or retitled (and pages-shots when a
// page's look changes). Page blurbs live in NOTES below — edit them here.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'mehrlander/web-tools';
const PAGES_URL = `https://mehrlander.github.io/${REPO.split('/')[1]}/pages`;
const SRC_URL = `https://github.com/${REPO}/blob/main/pages`;

// One-line blurb per page, keyed by path relative to pages/. Falls back to the
// page's <title> when a key is missing, so a new page still lists (just terser).
const NOTES = {
  'demos/alpine-bundle-demo.html':   'Live tour of alpine-bundle.js — magics, directives, x-define.',
  'demos/vanilla-bundle-demo.html':  'Live tour of vanilla-bundle.js — the framework-free DOM shorthand.',
  'demos/cross-repo-read-demo.html': 'Reading files across repos with gh.read() — a data-transfer demo.',
  'demos/console-kit-demo.html':     'The console kit + debugConsole component, shown live.',
  'demos/sheet-modal-demo.html':     'Bottom-sheet / modal component demo.',
  'demos/prebuild-demo.html':        'One import boots the whole library from the dist/ pre-build.',
  'table-compress.html':       'Single-function row transform + brotli/gz bundle round-trip.',
  'table-compress-multi.html': 'Multi-function variant of table-compress.',
  'compression-helper.html':   'Compression bookmarklet packer.',
  'diff-tool.html':            'Side-by-side text diff tool.',
  'review.html':               'A branch changeset or file, reviewed: CM6 diffs vs a base, links, patch dumps — the 🔍 target.',
  'shorter.html':              'Adjudicate a shorter draft against your text: word-diff, accept-by-default edits, per-span rewrite with an optional in-browser LLM.',
  'repo-atlas.html':           'Zoomable treemap map of any GitHub repo — files as tiles, sized by bytes or count.',
  'news/news.html':            "Read-only view of home's news ledger, grouped and filterable by topic and date; backfilled items held distinct.",
  'toss-render.html':          'Render tossed HTML payloads or allowlisted repo paths — the 🥏 target.',
  'word-select.html':          'Touch-first word-level selection: tap, hold-drag, discontinuous runs, adjustable pins, no native selection anywhere.',
  'gist-editor.html':          'Browse and edit GitHub gists in the browser.',
  'launcher.html':             'Popup launcher setup — paste a token, copy out the bookmarklet.',
  'demos/wring-text.html':     'Template induction on logs/records — kits/wring.js live.',
  'demos/wring-dom.html':      'Repeated DOM components from signatures or pasted HTML.',
  'stories/bookmarklets-story.html': 'Field notes on bookmarklet packing.',
  // Kit demos live under lib/kits/demos/ — surfaced here under the kit-demos group.
  'kit-demos/compression.html':  'Compression kit — brotli/gz round-trip, live.',
  'kit-demos/export.html':       'Export kit — file download from a user gesture.',
  'kit-demos/io.html':           'IO kit — read/write helpers, shown live.',
  'kit-demos/messaging.html':    'Messaging kit — cross-context postMessage helpers.',
  'kit-demos/persistence.html':  'Persistence kit — local storage / state retention.',
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pagesDir = path.join(repoRoot, 'pages');
const mdPath = path.join(pagesDir, 'README.md');
const htmlPath = path.join(pagesDir, 'index.html');
const jsonPath = path.join(pagesDir, 'pages.json');

const SITE = `https://mehrlander.github.io/${REPO.split('/')[1]}`;
const BLOB = `https://github.com/${REPO}/blob/main`;

// Source roots feeding the catalog. `virt` is the virtual path prefix used for
// grouping, sorting, and thumbnail lookup; href/view/code map a file (path
// relative to its source dir) back to its real location. The first source is
// pages/ itself (no prefix); the second pulls in the kit demos that live
// outside pages/, under lib/kits/demos/, surfaced under the kit-demos group.
const SOURCES = [
  { dir: 'pages', virt: '',
    href: f => f,
    view: f => `${SITE}/pages/${f}`,
    code: f => `${BLOB}/pages/${f}` },
  { dir: 'lib/kits/demos', virt: 'kit-demos',
    href: f => `../lib/kits/demos/${f}`,
    view: f => `${SITE}/lib/kits/demos/${f}`,
    code: f => `${BLOB}/lib/kits/demos/${f}` },
];

// Display label for a group key (the virtual dir of a meta entry's rel).
const dirLabel = key =>
  key === 'kit-demos' ? 'lib/kits/demos/' : `pages/${key ? `${key}/` : ''}`;

// Recursively collect every .html under baseDir, as paths relative to baseDir.
async function walk(baseDir, dir = baseDir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name === 'thumbs') continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(baseDir, abs));
    else if (ent.name.endsWith('.html')) out.push(path.relative(baseDir, abs));
  }
  return out;
}

const titleOf = src => (src.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();

// Read title once per page; carry the metadata both outputs need. Each entry's
// `rel` is its virtual path (grouping/thumb key); href/viewUrl/codeUrl resolve
// to the real file regardless of which source root it came from.
const meta = [];
for (const src of SOURCES) {
  const base = path.join(repoRoot, src.dir);
  const files = (await walk(base)).sort((a, b) => a.localeCompare(b));
  for (const f of files) {
    if (src.virt && path.basename(f) === 'index.html') continue; // skip a source's own catalog
    const html = await readFile(path.join(base, f), 'utf8');
    const rel = src.virt ? `${src.virt}/${f}` : f;
    meta.push({
      rel,
      name: path.basename(f, '.html'),
      title: titleOf(html),
      note: NOTES[rel] ?? '',
      href: src.href(f),
      viewUrl: src.view(f),
      codeUrl: src.code(f),
    });
  }
}
meta.sort((a, b) => a.rel.localeCompare(b.rel));

// ---- pages/README.md : dense markdown table, grouped by directory ------------
function buildMarkdown() {
  const groups = new Map();
  for (const m of meta) {
    const dir = path.dirname(m.rel) === '.' ? '' : path.dirname(m.rel);
    (groups.get(dir) ?? groups.set(dir, []).get(dir)).push(m);
  }
  const groupKeys = [...groups.keys()].sort((a, b) =>
    a === '' ? -1 : b === '' ? 1 : a.localeCompare(b));

  const lines = [
    '<!-- Generated by tools/build/pages-index.mjs — do not edit by hand. -->',
    '<!-- Regenerate: npm run pages-index -->',
    '',
    '# pages/',
    '',
    `⭐ **[Open the live index →](${PAGES_URL}/)** — a screenshot card per page, each with a live-preview and source toggle.`,
    '',
    `Catalog of the pages under \`pages/\`, plus the kit demos from \`lib/kits/demos/\`.`,
    `Each row links the **rendered** page and its **code** on github.com; this README is`,
    `the link-dense text twin of the visual index above.`,
    '',
  ];
  for (const key of groupKeys) {
    const rows = groups.get(key).sort((a, b) => a.name.localeCompare(b.name));
    lines.push(`## ${dirLabel(key)}`, '');
    lines.push('| Page | Title | Links |', '|---|---|---|');
    for (const { name, title, viewUrl, codeUrl } of rows) {
      lines.push(`| \`${name}\` | ${title || '—'} | [view](${viewUrl}) · [code](${codeUrl}) |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// The grouped card model shared by both the embedded index and the standalone
// pages.json catalog. Every page except the index itself becomes a card, grouped
// by directory so the root pages lead and the nested folders (demos/, stories/,
// drop/, …) and the external kit-demos fall into labeled sections — mirroring
// README.md. The location chips key off each group's top-level segment. Item
// hrefs/thumbs are relative to pages/; consumers a level deeper (show-repo)
// rebase with a '../' prefix.
function buildGroups() {
  const toItem = m => ({
    href: m.href,
    label: m.name,
    title: m.title,
    note: m.note,
    thumb: `thumbs/${m.rel.replace(/\.html$/, '.png')}`,
    code: m.codeUrl,
  });
  const groupsMap = new Map();
  for (const m of meta) {
    if (m.rel === 'index.html') continue;
    const dir = path.dirname(m.rel) === '.' ? '' : path.dirname(m.rel);
    (groupsMap.get(dir) ?? groupsMap.set(dir, []).get(dir)).push(toItem(m));
  }
  return [...groupsMap.keys()]
    .sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(k => ({
      label: k === '' ? '' : dirLabel(k),
      // top-level segment drives the location chips: every page under drop/ —
      // including drop/components/, drop/fills-concepts/… — scopes to one `drop` chip.
      top: k === '' ? 'main' : k.split('/')[0],
      items: groupsMap.get(k).sort((a, b) => a.label.localeCompare(b.label)),
    }));
}

const groups = buildGroups();

// ---- pages/index.html : visual card index ------------------------------------
function buildHtml() {
  return `<!DOCTYPE html>
<html lang="en" data-theme="winter">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Generated by tools/build/pages-index.mjs — do not edit by hand. Regenerate: npm run pages-index -->
<title>web-tools</title>
<link rel="icon" type="image/svg+xml" href="../lib/favicon.svg">
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web"></script>
<script type="module">
  // alpine-bundle.js loads Alpine itself, after fab.js has registered, so the
  // FAB's alpine:init listener is never missed.
  //   - No ?use: jsDelivr @main (cache-stable). ?use=<ref>: raw + blob-import
  //     (fresh branch), handing repo/ref via window.__ghBlobBoot.
  const ref = new URLSearchParams(location.search).get('use');
  if (ref) {
    window.__ghBlobBoot = { repo: '${REPO}', ref };
    const r = await fetch(\`https://raw.githubusercontent.com/${REPO}/\${ref}/lib/gh-api.js\`);
    if (!r.ok) throw new Error(\`?use=\${ref}: could not fetch gh-api.js (HTTP \${r.status})\`);
    const u = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' }));
    try { await import(u); } finally { URL.revokeObjectURL(u); }
  } else {
    await import('https://cdn.jsdelivr.net/gh/${REPO}@main/lib/gh-api.js');
  }
  await gh.load('alpineComponents/fab.js');
  await gh.load('alpine-bundle.js');
</script>
<style>[x-cloak]{display:none!important}</style>
</head>
<body class="bg-base-100 text-base-content min-h-screen">

<div class="max-w-6xl mx-auto px-4 py-10" x-data="index()" x-cloak>

  <div class="flex items-baseline justify-between mb-1">
    <h1 class="text-2xl font-bold tracking-tight flex items-center gap-2">
      <img src="../lib/favicon.svg" alt="" width="28" height="28" class="w-7 h-7">web-tools
    </h1>
    <div class="flex items-center gap-4">
      <a href="show-repo/show-repo.html"
         class="text-xs text-base-content/40 hover:text-base-content/70 flex items-center gap-1 transition-colors"
         title="Browse the raw files of any repo — the file-level companion to this page index">
        <i class="ph ph-tree-structure"></i> show-repo
      </a>
      <a href="https://github.com/${REPO}"
         class="text-xs text-base-content/40 hover:text-base-content/70 flex items-center gap-1 transition-colors">
        <i class="ph ph-github-logo"></i> ${REPO}
      </a>
    </div>
  </div>
  <p class="text-base-content/50 text-sm mb-8">
    Browser-based tools and demos. Cards show
    <a href="${BLOB}/tools/build/pages-shots.mjs" target="_blank"
       class="underline decoration-dotted underline-offset-2 hover:text-base-content/80">screenshots pre-rendered headless</a>
    (<code class="text-xs">npm run pages-shots</code>); toggle each to a
    <span class="font-medium">live</span> preview or the <span class="font-medium">source</span>.
  </p>

  <div class="flex flex-wrap items-center gap-1.5 mb-8">
    <template x-for="c in chips" :key="c.key">
      <button class="btn btn-xs font-mono"
              :class="filter===c.key ? 'btn-primary' : 'btn-ghost text-base-content/60'"
              @click="filter=c.key">
        <span><span class="opacity-50 font-normal" x-text="c.pre"></span><span x-text="c.seg"></span></span>
        <span class="opacity-50" x-text="c.count"></span>
      </button>
    </template>
    <div class="grow"></div>
    <label class="input input-xs input-bordered flex items-center gap-1.5 w-48">
      <i class="ph ph-magnifying-glass opacity-50"></i>
      <input type="search" x-model.debounce="q" placeholder="filter by name…" class="grow min-w-0">
    </label>
  </div>

  <p x-show="!filteredGroups.length" class="text-base-content/40 text-sm">
    No pages match<span x-show="q"> “<span x-text="q"></span>”</span>.
  </p>

  <template x-for="g in filteredGroups" :key="g.label">
    <section class="mb-10">
      <h2 x-show="g.label" class="text-xs font-mono uppercase tracking-widest text-base-content/40 mb-3 flex items-center gap-2">
        <i class="ph ph-folder"></i><span x-text="g.label"></span>
        <span class="badge badge-ghost badge-sm" x-text="g.items.length"></span>
      </h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <template x-for="p in g.items" :key="p.href">
          <div class="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">

        <div class="relative bg-base-200/40 border-b border-base-300 aspect-[16/10] overflow-hidden">
          <a :href="p.href" x-show="p.view==='shot'" class="block w-full h-full">
            <img :src="p.thumb" :alt="p.label" loading="lazy"
                 class="w-full h-full object-cover object-top"
                 @error="p.shotMissing = true" x-show="!p.shotMissing">
            <div x-show="p.shotMissing"
                 class="w-full h-full flex items-center justify-center text-base-content/30 text-xs gap-1">
              <i class="ph ph-image-broken"></i> no screenshot
            </div>
          </a>
          <template x-if="p.view==='live'">
            <iframe :src="p.href + '?use=main'" loading="lazy"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                    class="w-full h-full bg-base-100"></iframe>
          </template>
          <pre x-show="p.view==='html'"
               class="w-full h-full overflow-auto m-0 p-2 text-[10px] leading-snug bg-base-100"
               x-text="p.source"></pre>

          <div class="join absolute top-1.5 right-1.5 shadow">
            <button class="btn btn-xs join-item" :class="p.view==='shot' && 'btn-primary btn-active'"
                    @click="show(p,'shot')" title="Screenshot"><i class="ph ph-image"></i></button>
            <button class="btn btn-xs join-item" :class="p.view==='live' && 'btn-primary btn-active'"
                    @click="show(p,'live')" title="Live preview"><i class="ph ph-play"></i></button>
            <button class="btn btn-xs join-item" :class="p.view==='html' && 'btn-primary btn-active'"
                    @click="show(p,'html')" title="HTML source"><i class="ph ph-code"></i></button>
          </div>
        </div>

        <div class="card-body p-3 gap-1">
          <div class="flex items-baseline justify-between gap-2">
            <a :href="p.href" class="font-semibold text-sm hover:text-primary transition-colors truncate"
               x-text="p.label"></a>
            <a :href="p.code" target="_blank"
               class="text-base-content/30 hover:text-base-content/60 shrink-0" title="Source on GitHub">
              <i class="ph ph-code"></i></a>
          </div>
          <p class="text-xs text-base-content/50" x-text="p.note || p.title"></p>
        </div>

          </div>
        </template>
      </div>
    </section>
  </template>

  <div class="mt-8 pt-4 border-t border-base-200">
    <a href="https://github.com/${REPO}/blob/main/pages/README.md"
       class="text-xs text-base-content/40 hover:text-base-content/70 flex items-center gap-1.5 transition-colors"
       target="_blank">
      <i class="ph ph-list-bullets"></i>
      Full catalog — every page incl. nested, with rendered + source links
    </a>
  </div>

</div>

<div x-data="fab()" data-path="pages/index.html"></div>

<script>
function index(){
  const PAGE_GROUPS = ${JSON.stringify(groups, null, 2).replace(/</g, '\\u003c')};
  return {
    filter: 'main',
    q: '',
    groups: PAGE_GROUPS.map(g => ({
      ...g,
      items: g.items.map(p => ({ ...p, view: 'shot', source: '', shotMissing: false })),
    })),
    // Boot from the URL (?filter=<chip>&q=<text>) and mirror changes back into
    // it, so a filtered view is a shareable deep link.
    init(){
      const p = new URLSearchParams(location.search);
      const f = p.get('filter');
      if (f && (f === 'all' || this.groups.some(g => g.top === f))) this.filter = f;
      this.q = p.get('q') || '';
      this.$watch('filter', () => this.syncUrl());
      this.$watch('q', () => this.syncUrl());
    },
    syncUrl(){
      const p = new URLSearchParams(location.search);
      if (this.filter === 'main') p.delete('filter'); else p.set('filter', this.filter);
      if (this.q.trim()) p.set('q', this.q.trim()); else p.delete('q');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    },
    // Location chip bar, full paths up front: pages/ (root) and All first, then
    // pages/<top>/ per nested location, with the out-of-tree lib/kits/demos/
    // last so the one non-pages source is visibly the outlier. The search box
    // narrows by name on top of whichever location is selected.
    get chips(){
      const tops = [...new Set(this.groups.map(g => g.top))].filter(t => t !== 'main');
      tops.sort((a, b) => (a === 'kit-demos') - (b === 'kit-demos') || a.localeCompare(b));
      const countTop = t => this.groups.filter(g => g.top === t).reduce((n, g) => n + g.items.length, 0);
      const all = this.groups.reduce((n, g) => n + g.items.length, 0);
      const path = t => t === 'kit-demos' ? ['lib/', 'kits/demos/'] : ['pages/', t + '/'];
      return [
        { key: 'main', pre: '', seg: 'pages/', count: countTop('main') },
        { key: 'all',  pre: '', seg: 'All',    count: all },
        ...tops.map(t => ({ key: t, pre: path(t)[0], seg: path(t)[1], count: countTop(t) })),
      ];
    },
    // The selected location, before search.
    get visibleGroups(){
      if (this.filter === 'all') return this.groups.filter(g => g.items.length);
      return this.groups.filter(g => g.top === this.filter && g.items.length);
    },
    // The selected location narrowed by the name/title search; empty groups drop out.
    get filteredGroups(){
      const q = this.q.trim().toLowerCase();
      if (!q) return this.visibleGroups;
      return this.visibleGroups
        .map(g => ({ ...g, items: g.items.filter(p =>
          (p.label + ' ' + (p.title || '') + ' ' + (p.note || '')).toLowerCase().includes(q)) }))
        .filter(g => g.items.length);
    },
    async show(p, v){
      p.view = v;
      if (v === 'html' && !p.source){
        p.source = 'Loading…';
        try { p.source = await (await fetch(p.href)).text(); }
        catch(e){ p.source = '// failed to load source: ' + e; }
      }
    },
  };
}
</script>
</body>
</html>
`;
}

const md = buildMarkdown();
const html = buildHtml();
// pages.json is the same grouped card model index.html embeds, exposed as a
// standalone catalog so other pages (show-repo) can render the identical gallery
// without a stale hand-copy. Newline-terminated to match writeFile conventions.
const json = JSON.stringify(groups, null, 2) + '\n';
const outputs = [[mdPath, md], [htmlPath, html], [jsonPath, json]];

if (process.argv.includes('--check')) {
  let stale = false;
  for (const [p, want] of outputs) {
    const cur = await readFile(p, 'utf8').catch(() => '');
    if (cur !== want) {
      console.error(`pages-index: ${path.relative(repoRoot, p)} is stale — run \`npm run pages-index\`.`);
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log('pages-index: pages/README.md and pages/index.html are up to date.');
} else {
  for (const [p, want] of outputs) await writeFile(p, want);
  console.log(`pages-index: wrote pages/README.md + pages/index.html + pages/pages.json (${meta.length} pages).`);
}
