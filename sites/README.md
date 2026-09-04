# sites/

Domain-scoped tools. Each subfolder is a **microcosm of the repo for one
host** — it can hold any of the [four shapes](../README.md) (pages,
bookmarklets, popups, console), plus reference docs, all sharing one assumption:
the host they're built against.

What sets these apart from the top-level outputs is that assumption. A site's
files are *allowed* to know their host intimately — URL shapes, DOM structure,
the host's IndexedDB databases, page-specific selectors. That tight coupling is
the whole point. A tool that doesn't lean on a specific host is a general tool
and belongs at the repo root (`pages/`, `bookmarklets/`, `popups/`, `console/`),
not here.

## Convention

- Each subfolder is named for the exact `location.hostname` of the host it
  targets. No normalization — `www.example.com` and `example.com` are different
  folders.
- One host, one folder. Everything inside assumes that host.

## The shapes, scoped to a host

Mirroring the repo's four shapes, a site folder may contain:

- `*.html` at the top level — **pages** and **popups**. A page stands alone; a
  popup is launched as a window from the host and talks to it via
  `window.opener`. (A `javascript:` **bookmarklet** lives as a `.js` snippet
  meant to be installed as a bookmark.)
- `console/` — **console** snippets: JavaScript pasted into DevTools on that
  host. Different shape from pages, same domain assumption.
- `courier/` — **courier** errand scripts, fetched and run on that host by
  [`bookmarklets/courier.js`](../bookmarklets/courier.js) against an entry in
  [`courier/errands.json`](../courier/errands.json). A console snippet is code
  you choose to paste; a courier script is code a session has *queued* for that
  host, and the queue is what makes it a different shape. Contract, including
  the read-and-return rule: [`courier/README.md`](../courier/README.md).
- `docs/` — reference notes about that host's data model or page structure.

(`console/` was previously named `snippets/`; renamed to match the repo's
`console` shape.)
