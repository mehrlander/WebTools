# pages/memos/

Rendered documents that argue a case, as opposed to tools you operate. Indexed
and thumbnailed like any other page under `pages/`; this file is hand-maintained
because the generated [`pages/README.md`](../README.md) carries only each page's
`<title>`.

**The distinguishing property is the lifespan, not the look.** Every other page
under `pages/` is a durable tool: show-repo, the diff tool, and the toss renderer
are meant to be correct indefinitely, and one going stale is a bug. A memo is
tied to a moment. It states what was measured, what the options were, and what it
recommends, and once the decision lands it stops being current on purpose. That
is why these sit in their own folder rather than beside the tools: a reader who
finds a two-month-old memo should read it as a record without needing a banner to
say so, and a session should not treat one as a live description of the repo.

So a memo carries the date it was measured, in the page, where it is read.

Neighbours it is not:

- [`pages/stories/`](../stories/) is an essay for a general reader, with a voice
  and a designed look. A memo is internal and dry, and its audience is whoever
  has to decide.
- [`pages/drop/`](../drop/) holds standalone tools and one-idea demonstrations.
  Those still *do* something.
- A **brief** is a different artifact entirely and the word is taken:
  [`lib/kits/brief.js`](../../lib/kits/brief.js) assembles a page and its modules
  into one markdown document for a reviewer.

**Baking the data in is the house pattern here.** A memo describes a specific
state of the tree, so it inlines the measurement it was written against rather
than fetching it live. A live re-read would silently restate the argument against
a tree that had already moved, which is the one failure a decision document
cannot afford. Name the command that produced the data, so refreshing is one run.

| Page | What it argues |
|---|---|
| `code-layers.html` | Where a new code file belongs. Measures every file under `lib/`, finds that one folder tree is being asked two independent questions (what a file attaches to, and when it loads), and lays out four options plus the migration under the recommended one. Data from `npm run code-shape`. Supports [`lib-root-kit-migration-dind5t`](../../tracker/tasks/lib-root-kit-migration-dind5t.md). |
