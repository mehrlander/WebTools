---
id: generalize-gallery-pages-catalog-m3b8pa
title: Generalize the gallery to a per-repo pages catalog
status: done
opened: 2026-07-18
closed: 2026-07-19
session: claude/web-tools-app-views-m3pkyo
next: landed; live gallery for home needs home#314 on main (config cache reads main)
---
# Generalize the gallery to a per-repo pages catalog

## Concept

Today show-repo's gallery (the standard preview-panel view of a repo's HTML
pages: card, thumbnail, rendered/source/inspect toggle, chip grouping, search)
is welded to web-tools. `landingKind()` (show-repo.html) returns `'gallery'`
only for `DEFAULT_REPO`; every other repo gets a single `landing` page or a
synthesized overview. That singular `landing` slot is why a repo's pages
compete: home can name only one of budget-drs and news.

Generalize the gallery so any repo that declares a page catalog gets it, in the
same standard format. This is the keystone the news dashboard work depends on
(home PR #310 data contract; the news renderer is web-tools branch
`claude/news-panel-dashboard-94lsrh`).

## Shape

- `.web-tools.json` gains a `pages` field: a hand-declared list of
  `{ path, title, note }` (optional `icon`, `thumb`), a sibling to `pins` and
  `stage.files`, maintained the same way. web-tools keeps its generated
  `pages.json`; the gallery component reads whichever catalog a repo offers.
- `landingKind()` returns `'gallery'` for any repo whose config carries
  `pages`, not just web-tools. web-tools keeps gallery-by-default alongside
  Atlas / Files / Branches, and stays free to build a different landing later.
- Each gallery card renders its page live through toss-render `#gh=` (already
  the `custom` landing path, private-safe and token-authed).

## The one real gap: thumbnails

web-tools' gallery uses pre-shot `pages/thumbs/*.png`, refreshed by a session
hook. A private repo has no committed thumbs and no public CI to generate them.
First cut: live-render tiles (lazy toss-render on scroll/click), with committed
thumbnails a later per-repo opt-in.

## Definition of done

- A non-web-tools repo declaring `pages` in `.web-tools.json` shows the gallery
  as a view, cards rendering live.
- home declares budget-drs + the news page and both appear as cards.
- web-tools' existing gallery is unchanged.

## Progress log
- 2026-07-18: filed out of the news-dashboard design conversation. Supersedes the
  federation framing in task 0002 (which becomes a consumer). Sibling task
  20260718-87z (app views) depends on this.
- 2026-07-18: claimed on claude/clone-home-repo-7486wk; building the `pages` catalog and gallery generalization.
- 2026-07-18: claim released back to backlog; the clone-home-repo session designed and documented but did not build it. Ready for a fresh session.
- 2026-07-18: claimed on claude/web-tools-app-views-m3pkyo; building the gallery generalization first, app views on top.
- 2026-07-19: done. Lands via web-tools PR #242. landingKind() branches on config.pages; gallery() reads either pages.json (web-tools, unchanged) or a synthesized group from config.pages (tiles live via toss-render #gh=). A pages path may be a cross-repo ref (owner/repo[@ref]:path). home declares budget-drs + news in home PR #314. Verified headlessly: web-tools gallery byte-unchanged, generic gallery renders with live tiles.
