---
id: one-repo-address-parser-5gtv92
title: One parser for the owner/repo[@ref]:path address
status: backlog
opened: 2026-07-25
next: decide what an unspecified ref means at the link-building boundary; that is the whole question, and the parser follows from it
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
