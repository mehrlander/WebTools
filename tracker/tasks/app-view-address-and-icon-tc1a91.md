---
id: app-view-address-and-icon-tc1a91
title: Give an app view one address key and an identity of its own
status: done
opened: 2026-08-20
closed: 2026-08-28
session: claude/budget-drs-web-tools-tcpcq6
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
- 2026-08-25: the address half done on `claude/toss-url-shorthand-dz0xpt`;
  landed in PR #505. `?app=<slug>` and `?app=owner/repo[@ref]:path` both
  resolve, the five-key form still does, `stamp()` writes the short form, and
  `docs/app-routes.csv` carries the row. Two of the three done-when bullets, and
  two of the four decisions (the key's name, and whether stamp emits it). The
  identity half was left.
- 2026-08-28: the identity half done on `claude/budget-drs-web-tools-tcpcq6`;
  lands via PR #541. Raised by Marcus from the other end: a home-screen shortcut
  to `?app=budget-drs` showed the web-tools hex nut. The remaining decision
  ("how does a Phosphor class become a favicon?") took the second option it
  named, mirroring the framed page's own icon, and for the reason the task
  guessed: a glyph from `.web-tools.json` shows a mark the page never chose.
  `toss-render` announces the resolved icon up UNDIMMED on `toss-subject-mark`,
  since a toss is a rendering and a promoted view is a destination; the shell
  rasterizes it to 180px so it can also fill the `apple-touch-icon` iOS requires
  and will not take an SVG for.
  Two of the task's unknowns are now answered. The Chrome bookmark question
  ("whether Chrome keeps a separate favicon mapping per fragment") never had to
  be settled: `?app=` is a query, so this route keys on a distinct URL either
  way, which is what the task predicted when it chose a query-keyed address. And
  "where do `appLabel` and `appIcon` go" had a third answer beyond keeping or
  dropping them: a cold address link falls back to the filename and read
  `app.html`, so `labelFrom` marks that case and the framed page's own `<title>`
  fills it, leaving a declared label untouched.
  One thing genuinely open, carried in the PR rather than here: whether iOS
  honours a JS-injected `apple-touch-icon` at "Add to Home Screen" time. Only a
  phone can answer it, and the fallback if not is a static link in the head.
- 2026-09-04: the field this task added was live on ONE page for ten days.
  `slug` was written into home's budget-drs entry while the address half was
  being built and never applied to the other five promoted views, so they kept
  stamping the five-key form at 151 to 166 characters while budget-drs sat at
  58. Marcus noticed it in the header nav and asked why. Swept in PR #593 here
  plus home #582, chat-histories #86 and shortcut-tools #31: every promoted page
  now declares one. Two things the sweep turned up. `manifest-fields.csv` still
  claimed slug uniqueness was not enforced, which stopped being true when the
  collision gate landed after the 2026-08-26 doc-growth clash. And that gate's
  `SIBLINGS` list named three repos while five declare promoted pages, so
  `shortcut-tools` and `fun` were outside every check; both are named now.
  The general lesson, which is why this is worth a line on a closed task: a
  task that adds an optional field to a shared schema is not done when the
  mechanism works, only when the set it applies to has been swept.
