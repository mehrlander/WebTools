---
id: toss-fragment-passthrough-558xcw
title: Pass a trailing fragment through toss-render to the rendered page
status: in-progress
project: show-repo
track: independent
opened: 2026-07-25
session: claude/toss-render-data-formats-4t55x7
next: implement the blob-URL switch in showTrusted/showHtml, then re-run the render scenarios
---
# Pass a trailing fragment through toss-render to the rendered page

A page that routes on its own `#hash` loses that routing when tossed:
`#gh=owner/repo@ref:path` has no way to say which view to open, and the page's
own `location.hash` read comes back empty inside the render. Step 2 of the
2026-07-25 toss-routes plan (step 1 was the `#data=` route, PR #288).

Target grammar, extending the existing `?query` suffix:

    #gh=<owner>/<repo>[@<ref>]:<path>[?<query>][#<frag>]

## Addressing: already works, no parser change

A second `#` inside the fragment is just a character. Verified:

    new URLSearchParams("gh=mehrlander/web-tools@br:pages/show-repo.html?view=stage#tab=diff")
      .get("gh")  ->  "mehrlander/web-tools@br:pages/show-repo.html?view=stage#tab=diff"

So `showAddress` splits a trailing `#frag` the way it already splits `?query`.
(The separate `&`-truncation bug is `toss-render-multiparam-query-encoding-n9lbcp`.)

## Delivery: the srcdoc iframe cannot receive a hash

Probed in headless Chromium rather than reasoned from spec:

| | srcdoc (today) | blob: URL with `#frag` |
| --- | --- | --- |
| `document.URL` | `about:srcdoc` | `blob:https://…/uuid#viewkey` |
| `location.hash` | `""` | `"#viewkey"` |
| shim `location.hash` | **TypeError**, non-configurable | not needed |
| redefine `window.location` | **TypeError** | not needed |
| `history.replaceState` | **DOMException** | works |
| same-origin access | yes | yes, origin preserved |
| `hashchange` on later change | n/a | fires |

The params shim works by patching `URLSearchParams.prototype`, an ordinary
prototype. `location.hash` has no such escape hatch: it is a non-configurable
own property, so no prelude trick can fake it. That rules out the shim approach.

Switching the iframe from `srcdoc=` to a `blob:` URL with the fragment appended
delivers a real hash, and the payoff exceeds the feature: the history-safe shim
(`history-safe-toss-render-shim-hkih5m`) exists **only** because srcdoc breaks
`replaceState`. On a blob URL that call works, so this **retires a workaround**
rather than adding one, and a hash-routing page tossed this way updates its own
URL as you navigate it instead of silently no-opping.

Both trust postures hold. A blob URL sandboxed **without** `allow-same-origin`
still loads and the page still reads its own `location.hash`, while the parent is
correctly blocked from reading in. Sandbox flags determine the origin, not the
URL scheme, so `#gz=` keeps its opaque origin and `#gh=` keeps same-origin.

## Risks to clear before it lands

- `document.URL` changes, so anything reading it sees a blob URL.
- Blob lifetime and revocation.
- Relative resolution is unaffected only because `<base>` already governs it;
  confirm the inline-deps and fetch shims are untouched.
- The fab's `__fabHosted` / `__tossSubject` stamping must still apply.
- Existing render scenarios must stay green; this touches the render core.

## Definition of done

- `#gh=…:path#frag` opens the page at that fragment, and `#gz=…` likewise.
- The history-safe shim is removed, with a note in the head comment saying why.
- Render scenarios and `npm test` green; a headless check drives a hash-routing
  page through a view switch inside a toss and confirms the URL follows.

## Progress log
- 2026-07-25: filed and claimed on `claude/toss-render-data-formats-4t55x7`. The
  two tables above are probe output from this session, not estimates. Note the
  session carries a fixed-branch instruction, so this lands on the same branch
  and PR as step 1 rather than the separate PR originally planned.
