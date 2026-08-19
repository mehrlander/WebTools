# Showing: getting a thing in front of a viewer

The estate answers one question in a dozen ways: **something exists somewhere, and someone needs to look at it.** [SURFACING.md](SURFACING.md) is the etiquette that decides what to hand over; the Web Tools app ([APP.md](APP.md) the mission, [show-repo.md](show-repo.md) the shell's reference) is what you hand it from. The one-line split, since "surfacing" and "showing" are near-synonyms in ordinary English and this only holds if it is stated: **surfacing decides what to hand over; showing is what makes it openable.**

> **The reference is the app, not this file, and as of 2026-08-19 that is true rather than merely asserted.** Every mechanism, the address to write for each, what it reaches and misses, its trap, and the rule for picking one are rows in [`docs/showing-mechanisms.csv`](showing-mechanisms.csv); the three axes they are indexed by and the picker rules are the `showing` block of [`docs/routes.json`](routes.json). Both render in show-repo's **Map view, Showing tab**. This file carried a second copy of all of it for eleven days under a banner saying it did not.

What stays here is what no row can hold: why the boundaries are where they are, what it cost to find them, and one relation between two rows.

## The two mechanisms are inverses

This is the part worth understanding rather than looking up, because it explains why the table has the shape it does. A row can say what one mechanism reaches; only prose can say that two of them reach complementary halves.

|  | Top-level document | Reaches | Misses |
| --- | --- | --- | --- |
| **`?use=`** | main's page file, real | anything **lib** does, top-level chrome included | the page's own inline shell |
| **🥏 nesting** | the branch's shell, but framed | shell internals: routing, mounting, rendering, address parsing | anything the shell does to the **top-level context** |

So a change that is *both* in a page's own inline shell *and* aimed at the top-level document is reachable by neither, and the escape is not a better link but **moving the code**: in a lib module, `?use=` reaches it, since that is the only mechanism swapping code without swapping which document is on top.

The `?use=` half of that table is a consequence of the loader, not a fact about showing. [`loader.md`](loader.md) owns it: what the parameter swaps, why a branch name is cache-safe, the raw-versus-jsDelivr split, and the `window.__ghBlobBoot` carrier. Read it there rather than here.

## What nesting reaches, and what it cannot

A 🥏 link is served by **main's** `toss-render.html`, so the deployed shell parses the address. Branch work on that page previews by nesting: address the branch's own renderer as the subject and hand it the page you want as a trailing fragment. Main renders the branch's shell, which renders the page two frames deep.

Both halves of an address reach the inner shell for real: a `?query` arrives through the params shim, and a trailing `#frag` rides the frame's `blob:` URL as a genuine `location.hash`. So routing, frame mounting, rendering, and **address-bar parsing** are all previewable. This file used to say the last of those was out of reach, on the grounds that a nested shell never sees an address bar; that stopped being true when fragment delivery landed, and it was measured wrong twice before it was measured right.

**What nesting cannot reach is the top-level chrome.** A nested shell really runs, but never as the top-level document, and the tab belongs to whatever document is on top. So a shell change acting on that context executes correctly and shows nothing. The favicon is the case that found this (PR #315): the branch's shell reads its subject's icon and sets it on its own framed document, invisibly, while main's outer shell keeps the frisbee. The rest of the class is `document.title`, `history.replaceState`, and top-level navigation. `absUrl` had already met the seam without naming it, special-casing `location.protocol === 'blob:'` to reach for `top.location`, since a nested shell has no visitable address of its own.

Two things measured at depth 2 that look like bugs and are not. The icon arrives **dimmed twice**, because each shell dims its own subject and the outer shell's subject is the inner shell. And the tab's icon and its label describe **different levels**: the icon chains to the innermost page, while the label names the outer shell's own subject. Both are each shell being accurate about what it was asked to render; only the icon's transitivity is accidental, arising from reading the subject document's resolved icon. Apt enough for a toss of a toss, visible only when nesting deliberately, and left alone.

## The drawer at depth 2

The FAB around a nested preview is a separate question from the subject, and the answer is **both sides, attributed**. `detect()` collects page-contributed actions from the subject as well as the shell, so a nested preview shows the branch's `tossRender.actions` as the subject's, alongside the deployed shell's. The shell's rows carry a stacked-windows glyph and say "contributed by this renderer" in their tooltip; the unmarked rows are the branch's. That is a preview with a footnote rather than a clean one, so say which rows you mean.

Invoking across the window boundary is handled rather than avoided: the FAB focuses the subject's frame first, because an unfocused document cannot write the clipboard, and an action that navigates returns `{ nav }` for the FAB to perform top-side, since `location.href` inside the frame moves the frame. [`tools/test/subject-actions.mjs`](../tools/test/subject-actions.mjs) holds all of it at depth 2, and [`tools/test/fab-subject-actions.test.mjs`](../tools/test/fab-subject-actions.test.mjs) holds the collection shape in `npm test`.

**A toss carries main's lib, including the FAB**, and that is the gap the table's `form` column exists to close. `toss-render.html` is served from main, so the shell around a tossed page comes from main no matter which ref the `#gh=` address names. A branch change to `lib/alpineComponents/fab.js` is therefore invisible through a bare 🥏 link. Nothing reports the mismatch, because nothing is wrong: the FAB's own `?use=`-was-ignored check does not fire, since no `?use=` was asked for. It cost two rounds of "I looked and it isn't there" before the query-plus-fragment form went into the table.

## The invariant, and the shape of its absence

Every page that boots lib honors `?use=`, and every one carries the FAB. Both were once partial, and the gap was silent in a way that cost real time: five pages pinned the ref in their own boot block and ignored the parameter, while the FAB reported a preview based on the address bar rather than on what loaded, so a `?use=` link to one of those pages showed a preview banner over default-branch code. The FAB now cross-checks `window.gh.ref` and says plainly when `?use=` was ignored.

That is the general shape of every failure recorded on this page: not a link that errors, but a link that renders something plausible and wrong. A mechanism table can tell you which link to write. It cannot tell you that the one you wrote is quietly showing you last week, which is why the honesty rule ("only a page renders this way; for a kit or doc, ⭐ links the `[new]` blob") and the headless screenshot both survive the existence of the table.

## Viewer context

Both 🥏 forms assume something about where the link opens, and the table's `viewer` axis is the short version. The long version worth keeping: the Claude app's in-app browser keeps its own storage, so the `ghToken` is not guaranteed there (historically absent, though it can be entered, after which `#gh=` works). Treat the token as possibly absent in the app. When it is, bake the page self-contained (`bake-page` skill) and publish it as a 📦 artifact, which renders on Claude sign-in with no token; 🥏 `#gz=` is the no-build fallback. Matrix and pipeline: [docs/artifacts.md](artifacts.md).
