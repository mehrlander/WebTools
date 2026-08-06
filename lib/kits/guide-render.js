// kits/guide-render.js — a guide PR body, rendered as something you can walk.
//
// A guide body is markdown written for GitHub: every file it names is a blob
// link, which is the right answer for a reader standing on github.com and the
// wrong one for a reader standing in the thing the guide describes. There the
// link should reach the RENDERER that can show the file, not its source.
//
// So this kit does two jobs over one parse:
//
//   RE-AIM     every recognised blob link is pointed at the renderer for its
//              kind (a page at the toss, a data-ish file at the data view) and
//              stamped with its address, so a host can intercept the tap and
//              render in place instead of navigating.
//   COLLECT    the same links, deduped BY FILE, become a chip strip: the
//              guide's file list as a menu rather than as prose to re-read.
//
// Parsing the rendered HTML rather than string-replacing the markdown keeps one
// definition of what a link is (the parser's), so a link written inline, as a
// reference, or as an autolink all get the same treatment.
//
// Extracted from alpineComponents/fab.js on 2026-08-06, where it had been the
// drawer's alone. It moved because the FAB is not the only surface that shows a
// guide: pages/branch.html renders the same body under the same rules, and the
// estate's branch takeover renders that page full-viewport. One renderer, three
// places it appears.
//
// Pure but for `render`, which needs a DOM parser (the browser's, or jsdom's in
// a test). No fetch, no Alpine, no `this`. Attaches to window.GuideRender.
(() => {
  const BASE = 'https://mehrlander.github.io/web-tools/pages/toss-render.html';
  const DATA_EXT = ['md', 'markdown', 'csv', 'tsv', 'json', 'txt', 'log', 'yml', 'yaml'];

  // How a rendered body is styled, in one place, because two surfaces show it
  // and a guide that reads differently in each defeats the point of sharing a
  // renderer.
  //
  // Explicit descendant utilities rather than the typography plugin's `prose`,
  // and this is settled rather than a preference. The plugin is a separate CDN
  // entry that not every page carries: the FAB reached that conclusion first,
  // because it mounts on every page that boots lib, and pages/branch.html
  // confirmed it the expensive way on 2026-08-06, where adding the stylesheet
  // loaded it and its rules still did not match, leaving a list with no bullets
  // and links with no color. A guide that quietly loses its formatting is the
  // kind of failure nobody reports. These generate from the live DOM, like
  // every other utility in this estate.
  //
  // Two sizes, because the surfaces are two sizes: `drawer` is the FAB's
  // right-side panel, `page` is a full-width page. Only the type scale and the
  // spacing differ; every rule that decides whether the body is LEGIBLE (list
  // markers, link color, code, pre, blockquote) is shared, which is the half
  // that must not drift.
  const SIZES = {
    page:   { text: 'text-sm', gap: 'my-2', pad: 'pl-5', code: 'text-xs', head: 'text-sm', h1: 'text-base' },
    drawer: { text: 'text-[13px]', gap: 'my-1.5', pad: 'pl-4', code: 'text-[11px]', head: 'text-[13px]', h1: 'text-[13px]' },
  };
  function bodyClass(size) {
    const s = SIZES[size] || SIZES.page;
    return [
      s.text, 'leading-relaxed break-words',
      `[&_p]:${s.gap} [&_ul]:${s.gap} [&_ol]:${s.gap}`,
      `[&_ul]:${s.pad} [&_ul]:list-disc [&_ol]:${s.pad} [&_ol]:list-decimal`,
      '[&_li]:my-0.5 [&_li]:marker:opacity-40',
      '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/40',
      '[&_strong]:font-semibold [&_em]:italic',
      `[&_h1]:${s.h1} [&_h2]:${s.head} [&_h3]:${s.head}`,
      '[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold',
      '[&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2 [&_h1]:mb-1 [&_h2]:mb-1 [&_h3]:mb-1',
      `[&_code]:font-mono [&_code]:${s.code} [&_code]:bg-base-300/50 [&_code]:px-1 [&_code]:rounded`,
      `[&_pre]:bg-base-300/40 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:${s.code}`,
      '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
      '[&_blockquote]:border-l-2 [&_blockquote]:border-base-300 [&_blockquote]:pl-2 [&_blockquote]:opacity-80',
      `[&_table]:${s.code} [&_table]:block [&_table]:overflow-x-auto [&_th]:text-left [&_th]:pr-3 [&_td]:pr-3`,
      '[&_hr]:my-2 [&_hr]:border-base-300 [&_img]:max-w-full',
    ].join(' ');
  }

  // A blob URL's `<ref>/<path>` tail cannot be split by counting slashes,
  // because a ref may contain them and in this estate always does: every
  // session branch is `claude/<slug>`, so the naive first-segment split yields
  // ref `claude` and a path starting with the rest of the branch name. Both
  // halves are then wrong and the resulting address 404s.
  //
  // The known refs are the disambiguator: match the LONGEST one that prefixes
  // the tail. Falls back to the first segment, which is right for a sha, a tag,
  // and any unslashed branch, and is the best available guess before a caller
  // has a branch list to offer.
  function splitBlobRef(rest, knownRefs) {
    if (!rest || !rest.includes('/')) return null;
    const known = (knownRefs || []).filter(Boolean).slice()
      .sort((a, b) => b.length - a.length);
    for (const ref of known) {
      if (rest.startsWith(ref + '/')) return { ref, path: rest.slice(ref.length + 1) };
    }
    const i = rest.indexOf('/');
    return { ref: rest.slice(0, i), path: rest.slice(i + 1) };
  }

  // Where a repo file opens. The one routing table, read by a guide's links and
  // by the FAB's path picker, differing only in `any`:
  //
  //   .html            the toss, the renderer for a page
  //   data-ish files   the data view (markdown renders as preview there)
  //   anything else    null, unless `any` — a picker may be less careful than a
  //                    link, because a picker's user asked for that exact file
  function renderTarget(repo, ref, path, any) {
    if (!repo || !path) return null;
    // No ref is not a missing ref: the grammar reads a bare repo:path as the
    // repo's default branch, which is exactly what a cross-repo pick means.
    // Only the title has to say so, since "at " with nothing after it would
    // read as a bug.
    const addr = repo + (ref ? '@' + ref : '') + ':' + path;
    const at = ref ? ' at ' + ref : ' at its default branch';
    const ext = (path.split('.').pop() || '').toLowerCase();
    const label = path.split('/').pop();
    // `addr` rides alongside the url because an in-place re-address needs the
    // address, not the link: a renderer already open would otherwise reload its
    // shell to reach a state it can reach where it stands.
    if (ext === 'html' || ext === 'htm') {
      return { kind: 'render', repo, ref, path, addr, url: BASE + '#gh=' + addr,
               label, icon: 'ph-disc', title: 'Render ' + path + at };
    }
    if (any || DATA_EXT.includes(ext)) {
      return { kind: 'read', route: 'data', repo, ref, path, addr, url: BASE + '#data=' + addr,
               label, icon: 'ph-file-text', title: 'Read ' + path + at };
    }
    return null;
  }

  // Returns null for a link that should pass through untouched, so callers can
  // treat "no opinion" and "re-aim here" as the same branch.
  function openTarget(href, knownRefs) {
    const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+?)(?:[?#].*)?$/i.exec(href || '');
    if (!m) return null;
    const [, owner, name, rest] = m;
    let tail = rest;
    try { tail = decodeURIComponent(rest); } catch {}
    const split = splitBlobRef(tail, knownRefs);
    if (!split) return null;
    return renderTarget(owner + '/' + name, split.ref, split.path);
  }

  // markdown -> { html, targets, byAddr }.
  //
  // `resolve(href)` decides where a link goes; the default reads blob URLs
  // against `knownRefs`. `preferRef` breaks a dedupe tie, which is not a detail:
  // a guide names each changed file three times by convention, [new] and [main]
  // and [diff], and the first two are the same file at two refs. Deduping on
  // the ADDRESS gave a strip listing show-repo.html twice, which reads as a bug
  // and is useless as a menu. Keyed by kind and path, the ref the reader is
  // looking at wins. The PROSE keeps every link re-aimed individually, since
  // there both refs are meaningful: the sentence around them says which is
  // which.
  function render(markdown, opts) {
    const o = opts || {};
    const marked = o.marked || (typeof window !== 'undefined' && window.marked);
    const parser = o.DOMParser || (typeof DOMParser !== 'undefined' && DOMParser);
    const empty = { html: '', targets: [], byAddr: {} };
    if (!markdown || !marked || !parser) return empty;
    let html = '';
    try { html = marked.parse(markdown); } catch { return empty; }
    const resolve = o.resolve || (href => openTarget(href, o.knownRefs));
    const doc = new parser().parseFromString(html, 'text/html');
    const byFile = new Map(), targets = [], byAddr = {};
    for (const a of doc.querySelectorAll('a[href]')) {
      const t = resolve(a.getAttribute('href'));
      if (!t) {
        // Not something a host can render: a session link, a compare view, an
        // issue. Those still belong to GitHub and still open away.
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
        continue;
      }
      // A renderable link keeps its href so a long-press can still copy a
      // durable address; a host that wants in-place rendering intercepts the
      // ordinary tap on data-render-addr.
      a.setAttribute('href', t.url);
      a.setAttribute('title', t.title);
      a.setAttribute('data-render-addr', t.addr);
      byAddr[t.addr] = t;
      const key = t.kind + '|' + t.path;
      const held = byFile.get(key);
      if (!held) { byFile.set(key, t); targets.push(t); continue; }
      if (o.preferRef && held.ref !== o.preferRef && t.ref === o.preferRef) {
        targets[targets.indexOf(held)] = t;
        byFile.set(key, t);
      }
    }
    return { html: doc.body.innerHTML, targets, byAddr };
  }

  // marked, lazily and once per page. Same URL and same shape source-peek.js
  // and chat-render.js use, so the three share one cached asset.
  let markedP = null;
  function needMarked() {
    return markedP ||= window.marked ? Promise.resolve() : new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js';
      s.onload = res; s.onerror = () => rej(new Error('marked failed to load'));
      document.head.appendChild(s);
    });
  }

  window.GuideRender = { BASE, SIZES, bodyClass, splitBlobRef, renderTarget, openTarget, render, needMarked };
})();
