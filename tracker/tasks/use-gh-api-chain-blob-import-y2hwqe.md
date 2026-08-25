---
id: use-gh-api-chain-blob-import-y2hwqe
title: Extend fetch + blob-import to the gh-api.js-chain ?use= boot
status: done
closed: 2026-08-02
opened: 2026-07-20
---
# Extend fetch + blob-import to the gh-api.js-chain ?use= boot

Follow-up to `use-blob-import-bundle-dtuqjo`, which converted only the pre-build (`dist/web-tools.js`) `?use=` boot to fetch + blob-import from `raw.githubusercontent.com`. The other `?use=` form, the **`lib/gh-api.js` chain boot**, still imports from jsDelivr's `/gh/` CDN and so still hits the ~12h branch-tip cache: a freshly-pushed branch previewed through one of those pages loads stale until the cache expires or is purged. About 18 pages use this form (`pages/index.html`, `pages/repo-atlas.html`, `pages/nav-repo.html`, `pages/news/news.html`, `pages/chat-results.html`, `pages/gist-editor.html`, `pages/drop/live-docs.html`, several `pages/demos/*`, `pages/wsl-sync/*`, `popups/drop-file.html`, and the toss shell's own FAB chain in `pages/toss-render.html`), plus the canonical boot block in `README.md` and `docs/loader.md`.

**The wrinkle that kept it out of the first pass.** The pre-build carries its own bootstrap keyed on baked `__REPO`/`__DEFAULT_REF` constants plus a runtime `?use=` read, so a `blob:` import URL changes nothing. `gh-api.js` is different: its auto-bootstrap (bottom of `lib/gh-api.js`) parses `owner/repo/ref` out of `import.meta.url` by matching the jsDelivr `/gh/<repo>@<ref>/lib/gh-api.js` shape. Blob-import it and `import.meta.url` is a `blob:` URL, the regex misses, and `window.gh` is never created, so the page dead-boots.

**The fix.** Give `gh-api.js`'s bootstrap a blob-safe fallback: when `import.meta.url` does not match the jsDelivr shape, read `repo`/`ref` from a global the boot sets before importing (e.g. `window.__ghBlobBoot = { repo, ref }`), and bootstrap from that. Then the chain boot becomes, for the `?use=` branch only:

```js
const ref = new URLSearchParams(location.search).get('use');
if (ref) {
  window.__ghBlobBoot = { repo: 'mehrlander/web-tools', ref };
  const src = await fetch(`https://raw.githubusercontent.com/mehrlander/web-tools/${ref}/lib/gh-api.js`);
  const url = URL.createObjectURL(new Blob([await src.text()], { type: 'text/javascript' }));
  try { await import(url); } finally { URL.revokeObjectURL(url); }
} else {
  await import('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/gh-api.js');
}
```

**Scope notes.**
- Keep the no-`?use` default on jsDelivr `@main`: these pages have no same-origin `gh-api.js` to import, and the main CDN load is cache-stable and shared. Change only the reffed branch, same as the pre-build pass.
- The shared helper the parent task named (`the boot and the toss can both call`) can now become real: with the blob-safe fallback in place, factor the fetch + blob-import into `GH.blobImport(url)` (a static on the loader) and have the toss's FAB chain and any runtime dynamic-import caller use it. In the pre-build pass it was left inline because the boot runs before `GH` exists and there was no post-boot caller; the chain pass adds one.
- Editing `lib/gh-api.js` triggers the jsDelivr purge-link rule, and the ~18 page edits are shell changes (preview each with the 🥏 toss, not `?use=`), so this is a larger, spread-out change than the pre-build pass: worth its own PR.

**Origin.** Split out of `use-blob-import-bundle-dtuqjo` during its pre-build implementation, once the `import.meta.url` ref-detection wrinkle made clear the chain boot is a distinct, larger change.

## Progress log
- 2026-07-20: Filed as the chain-boot half of `use-blob-import-bundle-dtuqjo` (pre-build half done). Captured the `import.meta.url` blob-safe-fallback prerequisite and the page/doc surface to convert.
- 2026-08-02: Closed during a tracker groom: delivered but never closed. lib/gh-api.js carries the window.__ghBlobBoot blob-safe bootstrap this task specified, the canonical boot block in README.md fetches the reffed gh-api.js from raw.githubusercontent.com and blob-imports it, and CLAUDE.md states both ?use= boots are now fetch + blob-import, so a branch name is cache-safe on every ?use= page.
