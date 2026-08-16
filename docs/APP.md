# The Web Tools app

⭐ **Open it:** [Web Tools](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html)

One hosted page is the front door to the whole development estate. GitHub stays
the system of record; the app is the operating surface over it, bringing the
work scattered across repositories, branches, sessions, pages, and tools into
view and making it continuable and operable from one place. This doc is the
mission; [show-repo.md](show-repo.md) is the reference for the shell that
delivers it, and [showing.md](showing.md) carries the one-line form of the
problem it serves: something exists somewhere, and someone needs to look at it.

## The name split

**Web Tools** is the product name, used wherever a reader is addressed: the
page title, the README's front door, prose introducing the app. **show-repo**
is the shell's internal name and stays on everything that keys by it: the page
file (`pages/show-repo/show-repo.html`), the route registry
([app-routes.json](app-routes.json)), the reference doc, and the tracker
project tag. The old name records the app's origin as a repo viewer; the scope
outgrew it, the addresses did not. Renaming the internals would break every
saved deep link and buy nothing the prose split does not, the same finding the
`shell` rename task recorded: a name is expensive to change in registries and
gates, cheap to change where people read.

## Durable goals

Five, and a feature belongs in the app when it serves one of them:

- **One front door.** The estate is legible from a single address; nothing
  requires knowing which repo to open first.
- **Surface, don't store.** The app brings work into view where it can be
  encountered and used; the content stays in the repo that owns it.
- **Wrap GitHub, never wall it.** Every view keeps a one-tap route to the
  GitHub presentation of what it shows; the app layers over the record, it
  does not replace it.
- **Continuity.** Work stays understandable as it moves between sessions,
  branches, repos, and venues; Activity's branch, session, guide, and chat
  readings are this goal made literal.
- **Action.** The app operates as well as shows: stage and move files, write
  a repo's config, save a surface, keep the lists.

## The boundary

A view whose subject is the estate is built into the shell; a view whose
subject is content is an **app view** over the repo that owns it, promoted by
that repo's `.web-tools.json`. The mechanics live in
[show-repo.md](show-repo.md); the line is restated here because it is the
product boundary, not only a UI convention.

## Provenance

Reframed 2026-08-16. The repo had been describing the app as one page among
the workshop's outputs while its own data (the route registry, the showing
doctrine, the estate views) already described an application; this doc updated
the prose to match. The mission absorbed the Surfacer desktop project (home,
`projects/surfacer/`), which stated the same North Star months earlier, a
single place to see and act on the work agents leave behind, and went dormant
while the browser shell grew the same views; its surface format survives as
[envelopes/surface.md](envelopes/surface.md).
