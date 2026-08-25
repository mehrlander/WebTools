---
id: private-repo-landing-federation-u50nns
title: Private-repo landing federation via the home registry
status: done
opened: 2026-07-08
closed: 2026-07-28
resolution: superseded
next: closed as superseded; the goal shipped per-repo, not federated
---
# Private-repo landing federation via the home registry

> **2026-07-18 update:** the news-dashboard design conversation reframed this.
> Rather than fold each private repo's single featured page into web-tools' own
> landing grid, the plan is now two general primitives: a per-repo **gallery**
> (task 20260718-3lu) any repo gets by declaring a `pages` catalog, and
> **app views** (task 20260718-87z) that promote any single page to a peer
> entry in the estate switcher beside Repos / Surfaces / Stage. Those cover the
> "rich private-repo landing presence, no leak" goal below without an
> aggregation grid. This task stays open only to check whether anything
> federation-specific (the `HOME_REPO` hinge, cross-repo curation) is still
> wanted once those two land; if not, close it as superseded.

## Concept

Give private mehrlander repos a landing presence as rich as GitHub Pages
gives a public repo, integrated into the web-tools landing page, without
the public web-tools repo disclosing which private repos exist.

Enabling fact: auth is the viewer's `ghToken` in localStorage, so a page
served from the public web-tools origin already reads any private repo the
token scopes. `pages/toss-render.html` `#gh=owner/repo[@ref]:path` already
renders a private repo's HTML same-origin (token-authed, relative deps
inlined, fetch shimmed), gated by `OWNERS = ['mehrlander']`. The capability
exists; this task is the wiring and the conventions around it.

## Shape

Three layers, each owning one concern:

- web-tools (public): the render chassis and the landing grid. Knows one
  private name, `home`, which is generic and already committed. Holds no
  list of projects.
- mehrlander/home (private): the registry. A manifest (e.g. `landing.json`)
  listing featured repos in display order. Pointers, not content.
- each featured repo (private): a per-repo convention. Preferred form: the
  repo ships its own `pages/landing.html`, rendered live via `#gh=`, so the
  repo controls its presentation fully ("the repo builds its own page"). A
  structured-data card is a possible alternative the manifest could select
  per repo.

Boot: token present -> read `home/landing.json` -> for each entry render its
page (thumbnail first, live render on click/scroll) -> lay into the grid.
No token or unauthorized token: private section is absent, silently, no leak.

## The two things to keep clean

- The home coupling is a seam, not a magic string. Define one `HOME_REPO`
  constant in `lib/`, imported by every consumer, documented as the single
  public-private hinge: the one private repo web-tools may know by name.
  Both the existing GH Browse state store (show-repo.html:67) and the new
  registry read through it.
- The registry is a trust list. Any repo it names renders same-origin with
  token access, the same trust decision `OWNERS` makes at owner granularity.
  OWNERS stays the broad gate for ad-hoc tosses; the registry is the curated
  subset the landing page mounts. A change to either is a security change.

## What leaks

Only the string `home` is public, and it is generic: it reveals that a
private index repo exists, not its contents and not which projects exist.
Same posture already shipped for the state file; this generalizes it.

## Open question

Featured tile = a page the repo authors (max fidelity, repo code runs
same-origin) vs structured data web-tools renders into a uniform card
(consistent, safer, no featured-repo code same-origin). Could support both,
manifest picks per repo. Resolve during co-design.

## Portable vs personal

The aggregation pattern (public render shell + one generic private index
repo + per-repo opt-in by convention) may become a named portable primitive
extending CONVENTIONS.md "Toss a live view." The concrete parts (home, the
manifest schema, the repo list) are personal and belong in web-tools CLAUDE.md
or a design doc. Defer writing conventions until the integrated landing page
lands.

## Progress log
- 2026-07-08: concept captured; deferred pending the integrated landing-page work
- 2026-07-28: closed as superseded. Both successors landed on 2026-07-19 in PR
  #242 (the per-repo `pages` gallery and estate-level app views), and the
  reassessment this task was held open for comes out negative: nothing
  federation-specific remains. The registry hinge exists, but it is
  REGISTRY_REPO = mehrlander/web-tools-private rather than a HOME_REPO
  pointing at mehrlander/home, and it carries a derived config cache rather
  than a curated landing.json. Membership is a property of each repo's own
  .web-tools.json (`estate`, `quickLink`, `pages`, `appView`), so the curated
  cross-repo list this task proposed has no place to live and nothing to do.
  The open question (repo-authored page vs structured card) was answered in
  favor of the repo's own page, rendered live through toss-render `#gh=`. The
  "what leaks" posture is unchanged: one generic private repo name in public
  source, contents and membership behind the token. The two stale
  forward-references to the federated plan (the docs/show-repo.md roadmap
  bullet and the show-repo.html comment) are corrected on branch
  claude/tracker-status-cjogjn.
