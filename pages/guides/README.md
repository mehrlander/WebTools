# pages/guides/

Rendered documents that walk a reader through something, as opposed to tools you
operate. Indexed and thumbnailed like any other page under `pages/`; this file is
hand-maintained because the generated [`pages/README.md`](../README.md) carries
only each page's `<title>`.

A guide here explains a system, argues a case, or lays out a decision. What it
does not do is *work*: nothing under this folder fetches, transforms, or edits
anything on the reader's behalf. That is the line against the rest of `pages/`.

Neighbours, so none of the three drifts into the others:

- [`pages/stories/`](../stories/) is an essay for a general reader, with a voice
  and a designed look. A guide is internal and dry, and its reader is someone who
  has to understand or decide something specific.
- [`pages/drop/`](../drop/) holds standalone tools and one-idea demonstrations.
  Those still do something.
- Everything else under `pages/` is an application.

**A guide that rests on measurement carries its date and its command, in the
page.** Some guides here describe a system and stay true; others describe a
specific state of the repo and stop being current the moment that state moves.
Nothing distinguishes the two from the outside, so a guide of the second kind
says when it was measured and what produced the numbers, and a reader can tell at
a glance whether they are reading a description or a record.

For the same reason such a guide **inlines its data rather than fetching it
live**. A live re-read would silently restate the argument against a tree that
had already changed, which is the one failure a decision document cannot afford,
and it also keeps the page rendering identically through either toss form.

**On the name.** The other live sense of "guide" here is the **guide PR** and its
body: a pull request, not a page. Say "guide PR" when that is what is meant and
the two stay apart. `MERGE-GUIDE.md` and `BRANCH-GUIDE.md` were two further
senses and both are retired, so the word is less crowded than it looks.

| Page | What it covers |
|---|---|
| `code-layers.html` | Where a new code file belongs. Measures every file under `lib/`, finds that one folder tree is being asked two independent questions (what a file attaches to, and when it loads), and lays out four options plus the migration under the recommended one. Data from `npm run code-shape`, measured 2026-08-06. Supports [`lib-root-kit-migration-dind5t`](../../tracker/tasks/lib-root-kit-migration-dind5t.md). |
