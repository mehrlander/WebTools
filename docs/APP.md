# The Web Tools app

⭐ **Open it:** [Web Tools](https://mehrlander.github.io/web-tools/app/)

One hosted page is the front door to the whole development estate. GitHub stays
the system of record; the app is the operating surface over it, bringing the
work scattered across repositories, branches, sessions, pages, and tools into
view and making it continuable and operable from one place. This doc is the
mission; [show-repo.md](show-repo.md) is the reference for the shell that
delivers it, and [showing.md](showing.md) carries the one-line form of the
problem it serves: something exists somewhere, and someone needs to look at it.

## The name split

**Web Tools** is the product name, used wherever a reader is addressed: the
page title, the README's front door, the app's own address. **show-repo** is
the shell's internal name and stays on everything that keys by it: the route
registry ([app-routes.csv](app-routes.csv)), the reference doc, the redirect
stub's path, and the tracker project tag. The old name records the app's origin
as a repo viewer; the scope outgrew it.

**Cheap and visible is not an identifier.** This sentence used to claim the name
also stayed on "the component and harness filenames," and both halves had
already stopped being true. The component is `app()`, renamed with the page when
it moved to `app/index.html`; only the test files still carried the prefix, and
they named a page path that redirects and a component that had never been called
that in the file they read. They are `shell-*.test.mjs` now, after `window.__shell`,
which is what the code itself calls the thing under test. The test that decides
this is not whether a gate reads the string: it is whether renaming is expensive
and invisible to a reader. Nothing outside the repo links a test filename, the
registry that keys them is generated, and the names print on every run.

**A chat reply, a caption, and a PR body address a reader,** so they take the
product name. That is where the split fails, not in the tree: a session used
the internal name in a reply on 2026-08-27 and the reader had to ask what it
meant. Measured the same day, the tree holds 1,022 occurrences across 238
files and all but two are identifiers or records. The two were the README's
`pages/` list, which re-filed the product among the workshop's outputs the
address move had just taken it out of, and the shell component's
`description`, which the Map view renders verbatim.

**The address moved on 2026-08-16, the identifiers did not,** and the
distinction is the whole of the decision. This doc first ruled that renaming
"would break every saved deep link and buy nothing the prose split does not."
That holds for **identifiers**: a `?view=` key, a registry key, a component
name, and the project tag are read by gates, and changing one is expensive and
invisible to a reader. It does not hold for the **address**. The app served
from `pages/show-repo/show-repo.html` filed the product inside the catalog of
the workshop's outputs, which it was never a member of, and made its front door
the longest URL in the estate.

So the page file moved to `app/index.html`, served at
`https://mehrlander.github.io/web-tools/app/`, and the old path keeps a
redirect stub that preserves the query and the fragment. The stub is
load-bearing and permanent: 151 files in other repos name the old address and
cannot be reached from here, and neither can a link already saved on someone's
phone.

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
