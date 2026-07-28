---
id: document-the-app-view-split-g2kekb
title: Name the app-view split in docs/show-repo.md
status: backlog
project: show-repo
opened: 2026-07-28
---
# Name the app-view split in docs/show-repo.md

`docs/show-repo.md` documents the `appView` flag as a mechanism: how a `pages` entry is promoted, where it renders, how it is token-gated. It does not say **when to reach for it**, which is the question a session actually has.

News was one instance and read as a one-off. Links is the second, built the same way, and two instances make a pattern worth stating.

## The split, as it now stands

| | Built into the shell | An app view |
|---|---|---|
| Subject | the estate itself (Activity, Repos, Surfaces, Stage, Map, Proposals) | content |
| Data | the registry | the repo that owns the content |
| Owner | web-tools | the repo, through its own `.web-tools.json` |

The rule that falls out: **a view whose subject is the estate is built in; a view whose subject is content is an app view over the repo that owns it.** The renderer stays public in web-tools; the content stays wherever it belongs, which for both News and Links is the private `home` repo.

To-do and Jots look like counterexamples and are not. They are operational to the tool: they drive sessions, an agent drains them, and they have no readership outside the shell. That is the registry's proper business. News and Links are durable curated bodies with their own history, which is home's.

## Also worth recording

- The **framing convention**: an app view renders inside the shell's iframe, which already supplies a header and the sidebar label, so a promoted page should stand its own masthead down when `window.self !== window.top`. `links.html` does this; `news.html` does not yet.
- The **width consequence**: an app view gets the main area minus the sidebar, so a page designed full-bleed needs to be responsive down to roughly two thirds of the viewport.
- What an app view **cannot** do: reach the shell's chrome. Anything wanting persistent presence has to be built into the shell (see `links-rail-in-the-shell-gg7ehg`).

## Definition of done

`docs/show-repo.md` carries a short section answering "built in or app view?" with the table above, the framing convention, and the two named instances.

## Progress log
- 2026-07-28 filed at wrap-up of the links page (PR #308), which is the second instance and the reason the pattern is now worth naming.
