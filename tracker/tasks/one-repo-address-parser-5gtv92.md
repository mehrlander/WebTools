---
id: one-repo-address-parser-5gtv92
title: One parser for the owner/repo[@ref]:path address
status: done
opened: 2026-07-25
closed: 2026-07-30
session: claude/web-tools-tracker-review-bw48ga
next: done on claude/web-tools-tracker-review-bw48ga; stage-link-onto-url-params-u9o7ny, which depended on this, is now unblocked
---
# One parser for the owner/repo[@ref]:path address

The address grammar is one convention with three implementations, and they do
not agree. Found while comparing the toss routes against the stage mechanism at
the end of PR #291.

| implementation | `owner/repo:path.md` |
| --- | --- |
| `StageLink.parseItem` (`lib/alpineComponents/stage.js`) | `ref: ''` |
| `ShorterPayload.parseSpec` (`lib/shorter-payload.js`) | `ref: ''` |
| `DataPayload.parseSpec` (`lib/data-payload.js`) | `ref: 'main'` |

A fourth copy lives inline in `pages/toss-render.html` and should stay there:
that page's critical render path loads no lib on purpose.

The three agree on shape. They were checked against each other on a repo with
dots and hyphens, a slashed ref (`feat/x`), a three-segment path, and a bare
path with no colon: identical results on all of those. The only divergence is
the default for a missing `@ref`.

## Why this is latent, not live

`''` is the more correct answer: the GitHub contents API falls through to the
repo's **default branch** on an empty ref, so `''` is right for a repo whose
default is not named `main`. `'main'` is a guess. Every repo in this estate
currently defaults to `main`, so nothing is broken today.

## Why it is not a drop-in

`DataPayload`'s `'main'` is load-bearing, and changing it in place would break
things. `lib/alpineComponents/viewer.js` (`fileUrls`) builds

    https://github.com/<repo>/blob/<ref>/<path>
    https://raw.githubusercontent.com/<repo>/<ref>/<path>
    https://cdn.jsdelivr.net/gh/<repo>@<ref>/<path>

An empty ref yields `blob//path` and `@/path`: three broken links per addressed
item in data-view. So the ref has two different jobs, and they want different
answers:

- **Fetching**: `''` is correct and lets the API resolve the default.
- **Link building**: a concrete ref is required, and no concrete value is known
  without asking the API what the default branch is.

## What to decide first

Whether the shared parser returns `''` (honest: unspecified) with resolution
pushed to the link-building boundary, or keeps a caller-supplied fallback. The
shape that probably works:

    RepoAddress.parse(spec)              -> { repo, ref: '', path } | null
    RepoAddress.ref(addr, fallback)      -> addr.ref || fallback

with the viewer passing a fallback and every fetch path passing none. Worth
checking whether the viewer can instead learn the real default branch: the
shell already surveys branches (`explorer.js` tracks `defaultRef`), so the
honest ref may be available without a new call.

## Definition of done

- One module owns the grammar; `StageLink.parseItem`, `DataPayload.parseSpec`,
  and `ShorterPayload.parseSpec` delegate to it and keep their exported names.
- `toss-render.html` keeps its inline copy, with a comment saying why.
- A test asserts all three entry points return the same thing for the same
  input, so the copies cannot drift again.
- data-view's GitHub/Raw/CDN links still resolve for an address with no `@ref`,
  verified by a render rather than by reading.

## Progress log
- 2026-07-25: filed at wrap-up of PR #291, which added the third copy. That PR
  fixed only its own (`ShorterPayload.parseSpec` returns `''`) and deliberately
  left the other two alone: touching `DataPayload` changes data-view's rendered
  links, which is a behavior change that wants its own change and its own
  verification, not a wrap-up drive-by.
- 2026-07-28: the deciding question is answered and the module is built, on
  `claude/tracker-status-cjogjn` (web-tools PR #302), because the inbox/outbox
  work needed the grammar and should not have added a fourth copy.
  `lib/repo-address.js` takes the shape this task proposed: `parse(spec)`
  reports what the address said, so a missing ref is `''` and never a guess,
  and `ref(addr, fallback)` is the link-building boundary where a fallback is
  legitimate. It also carries the `inbox`/`outbox` box parser built on the same
  grammar.
  What remains is the mechanical half, unchanged in shape: delegate
  `StageLink.parseItem`, `ShorterPayload.parseSpec`, and
  `DataPayload.parseSpec`, keeping their exported names, and verify data-view's
  GitHub/Raw/CDN links by a render rather than by reading. Note the load-order
  constraint found while building: the three copies are used by pages whose
  boot chains differ, so each consuming page needs `gh.load('repo-address.js')`
  before delegation, which is why this PR did not sweep them.
  `tools/test/repo-address.test.mjs` already asserts the copies agree with the
  module on shape today, so the delegation is a refactor rather than a
  behavior change; DataPayload's `'main'` remains the one real difference, and
  whether data-view keeps guessing is now the only judgment left.
- 2026-07-30 the mechanical half landed, and the load-order note in the entry
  above turned out to be the whole difficulty.

  `StageLink.parseItem`, `DataPayload.parseSpec`, and `ShorterPayload.parseSpec`
  now call `RepoAddress.parse` and keep their exported names; the local regexes
  are gone, including the second copy inside `StageLink.parseLink`, which reads
  a group whose path half is a comma list and needed no special grammar after
  all. `pages/toss-render.html` keeps its inline copy with the comment saying
  why. Each reader throws a named error if the module is absent, since the
  alternative was a null parse that reads as "not an address" and misroutes in
  silence.

  **Load order was the real work.** Reading `RepoAddress` at module scope
  captures an undefined: a component registers during the pre-build's boot,
  which happens inside the `dist/` import, before the page's own `gh.load` chain
  runs. So the readers resolve at call time, `repo-address.js` was added to the
  bundle's boot list ahead of the components (`tools/build/build-lib.mjs`), and
  the two chain pages that load a delegate now load it first. The order is
  asserted rather than remembered: `repo-address.test.mjs` checks the pages, the
  generator, and the built bundle's boot list.

  **The judgment the entry above left open, and what measuring it changed.** The
  plan was to move DataPayload's `'main'` from parse time to the link-building
  boundary. That was right, but the boundary already had a fallback: the
  viewer's `ref` getter has always ended in `|| 'main'`, so a `''` ref never
  reached `fileUrls` and the parse-time guess was never load-bearing for the
  links. Measured, not read: the render check below passes with the fallback in
  `fileUrls` removed. So the change is smaller and better than planned. The
  fallback stays in the one getter, now stated as the boundary and preferring a
  default branch the shell actually surveyed (`store.defaultRef`, and only for
  the repo it surveyed it for) with `'main'` as the last resort rather than the
  first. That answers this task's "worth checking whether the viewer can learn
  the real default branch" in the affirmative, where the shell knows.

  The render check the definition of done asked for is
  `tools/test/data-view-links.mjs` (`npm run test:data-view-links`, browser, not
  in `npm test`): it opens data-view on an address with no `@ref` and reads back
  the hrefs the file menu rendered. Both halves of the ref rule hold. No link is
  malformed, blob and CDN name a concrete branch, and the fetch omits the `ref`
  parameter entirely rather than sending an empty one, which is a separate fix
  in `pages/data-view.html`: an empty `?ref=` is not the same request as none.
