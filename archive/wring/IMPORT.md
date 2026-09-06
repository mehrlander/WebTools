# Import provenance

Imported from [`mehrlander/wring`](https://github.com/mehrlander/wring)
at commit `23114dc` (main; the repo was never tagged) on 2026-06-10.

This directory is a complete snapshot of the wring repository: the source
modules, the six-harness test suite, the CLI drivers, the original browser
demos, and the research record (`docs/research/`, `docs/history/`,
`docs/concepts/`). Files are byte-for-byte copies of the upstream sources.

To recreate the snapshot:

```bash
curl -sSL https://codeload.github.com/mehrlander/wring/tar.gz/23114dca52677fdff9c58dd4ad17377c9b34eb9f | tar xz
mv Wring-*/ archive/wring/   # then drop this IMPORT.md in
```

## What was ported out of the snapshot (the live copies)

| Live file in web-tools | Built from |
|---|---|
| `lib/kits/wring.js` | originally the six engine modules + `general/bridge.js`, concatenated by `export/build-kit.mjs`. **No longer regenerated:** on 2026-09-06 the kit was normalised into stage sections and the generation claim in its header dropped, so `build-kit.mjs` describes the import and not the current file |
| `pages/demos/wring-text.html` | `general/demo.html`, re-plumbed to load the kit via `gh.load` |
| `pages/demos/wring-dom.html` | `dom/demo.html`, same re-plumbing |
| `tools/test/wring.test.mjs` | `export/tools/test-wring.mjs`, recast onto `node:test` so it runs under `npm test` |

The snapshot's `export/` directory contains the exact artifacts that were
copied out, as they were at import time. (`export/archive/wring/IMPORT.md`
there is the unfilled template this file was made from.)

## Division of labor

- **Live code** (`lib/kits/wring.js`, the two pages): maintained here in
  web-tools. Bug fixes and features happen against the kit going forward.
- **This snapshot**: the v1 record. Source modules, full test suite
  (`npm test` works inside the snapshot), design history, and the research
  reports that produced the architecture. Read `ARCHITECTURE.md` first;
  `docs/README.md` maps the rest.
- The upstream repo is archived (read-only) on GitHub; this snapshot is the
  working reference copy.
