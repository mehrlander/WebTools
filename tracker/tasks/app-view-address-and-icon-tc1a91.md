---
id: app-view-address-and-icon-tc1a91
title: Give an app view one address key and an identity of its own
status: backlog
opened: 2026-08-20
size: M
---
# Give an app view one address key and an identity of its own

An app view is addressed today as five query keys:
`?view=app&appRepo=<owner/repo>&appPath=<path>&appRef=&appLabel=&appIcon=`.
Two changes, and they land together because each is half of making that address
worth saving.

**One key.** Accept `?app=owner/repo[@ref]:path`, the estate's one address
grammar, alongside the long form. `RepoAddress.parse` is already loaded in the
shell, so the parse is not the work; the decisions are.

**An identity.** The shell sets one static favicon (`lib/favicon.svg`, the hex
nut) for every route and stamps the title from the open repo, so every app view
is `Web Tools · home` with the same icon. Give the view its own title and
favicon, so the address names something in a tab, a history entry, and a
bookmark.

## Why now

It came out of wanting a distinct Chrome bookmark icon for one app, the
budget-drs lens in home. The estate has two addresses for that page: a toss
(`pages/toss-render.html#gh=…`), where everything distinguishing the page sits
in the fragment, and this route, where it sits in the query. Whether Chrome
keeps a separate favicon mapping per fragment was not established, and a query
is unambiguously part of the URL everywhere. So a query-keyed address is the
robust place to hang a per-app icon, whatever Chrome turns out to do.

home PR #483 gave that page its own `<link rel="icon">`, which is the cheap
half: it makes the toss route testable. If the bookmark keeps the icon, this
task is a convenience rather than a fix. Worth knowing before claiming it.

## The decisions

- **Does `stamp()` emit the short form?** It rewrites the address as the user
  navigates, so a short link that is only read and never written silently
  becomes the long one. Precedented (`?view=branches` rewrites to
  `?view=sessions`) but a choice.
- **Where do `appLabel` and `appIcon` go?** They exist so a cold deep link is
  self-describing before the config cache resolves. Collapsing to a bare
  address drops them, and a promoted page falls back to its filename, which
  reads as `app.html`.
- **How does a Phosphor class become a favicon?** `appIcon` is a font class.
  Drawing the glyph to a canvas is one route; mirroring the framed page's own
  icon, the way `toss-render` already does with `adoptSubjectIcon`, is another
  and needs no glyph work.
- **The key's name.** `?page=` collides with `?view=pages`, the gallery.
  `?app=` echoes the route it aliases and matches the key shape
  `appViewFromUrl` already builds.

## Done when

- `?app=owner/repo[@ref]:path` opens the same view as the five-key form, and
  the five-key form still resolves.
- An open app view's tab carries its own title and favicon.
- `docs/app-routes.csv` records the alias, the way the other alias rows do.

## Progress log
- 2026-08-20: filed while adding a favicon to the budget-drs app in home
  (PR #483). Not claimed; the bookmark test above should run first, since it
  decides whether this is the fix or a convenience.
