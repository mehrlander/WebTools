---
id: app-views-estate-level-btp6m4
title: App views - designate a page as an estate-level view
status: done
opened: 2026-07-18
closed: 2026-07-19
session: claude/web-tools-app-views-m3pkyo
next: landed; News goes live in the estate switcher when home#314 reaches main
---
# App views: designate a page as an estate-level view

## Concept

Promote a single page, from any repo, to its own top-level entry in the estate
switcher, sitting inline beside Repos, Surfaces, and Stage. "News" is such an
entry: a peer view, not a category holding items and not a nested tab.
Selecting it renders that page live (toss-render `#gh=`, token-authed) in the
estate main area. Several pages can be promoted, each its own entry.

This is the "app view" designation from the news-dashboard design
conversation. It is additive to the per-repo gallery, not a replacement: a page
listed in a repo's `pages` appears in that repo's gallery; the same page
flagged as an app view is also promoted to the estate.

## Precedent

Exactly the `quickLink: true` pattern, one level up. The estate already
promotes a repo to the header quick-link row via a flag in that repo's own
`.web-tools.json`, discovered by enumerating configs through the config cache
(`state/configs.json`). Membership is a repo property, not a registry list. An
app view is the same move, but the target is a rendered page view instead of
"open this repo."

## Shape

- Flag on a `pages` entry (depends on task 20260718-3lu):
  `{ path, title, appView: true, viewLabel: "News", icon: "ph-newspaper" }`.
- The estate collects app views across repos' configs the same way it collects
  estate cards and quick links (config cache, live fallback).
- Each app view is a sidebar entry in the estate switcher; selecting it renders
  the page via toss-render `#gh=`.
- Token gating: token absent or unauthorized, the view is simply absent, no
  leak, matching Surfaces and the private estate.
- Alternative considered: a curated list in the private registry (central
  control) instead of a repo-owned flag. The quickLink precedent argues for
  repo-owned; note but do not build the registry form unless central curation
  is wanted.

## Definition of done

- A page flagged `appView` in a repo's `.web-tools.json` appears as its own
  estate view beside Repos / Surfaces / Stage.
- The news page is the acceptance case: promoted from home, it renders live at
  the estate level.

## Progress log
- 2026-07-18: filed out of the news-dashboard design conversation. Depends on
  the gallery generalization (20260718-3lu). Replaces the "Featured surface
  kind" idea floated earlier in the same conversation.
- 2026-07-18: claimed on claude/clone-home-repo-7486wk; building after the gallery generalization it depends on.
- 2026-07-18: claim released back to backlog; unblocked once the gallery generalization lands. Ready for a fresh session.
- 2026-07-18: claimed on claude/web-tools-app-views-m3pkyo; building on the gallery generalization in the same session.
- 2026-07-19: done. Lands via web-tools PR #242. loadAppViews() collects pages entries flagged appView:true across configs (config cache, the quickLink sibling, token-gated); each becomes a sidebar peer of Repos/Surfaces/Stage, rendered live via toss-render #gh=, deep-linkable as ?view=app&appRepo=&appPath=. The news acceptance uses a cross-repo path so home owns the promotion while the renderer stays in web-tools (home PR #314). Verified headlessly: sidebar entry, estate context, iframe render, URL round-trip.
