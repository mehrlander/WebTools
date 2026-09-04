---
id: toss-fragment-passthrough-558xcw
title: Pass a trailing fragment through toss-render to the rendered page
status: done
project: show-repo
opened: 2026-07-25
closed: 2026-07-25
session: claude/toss-render-data-formats-4t55x7
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
| `history.replaceState` (relative) | **DOMException** | **DOMException** (see correction) |
| same-origin access | yes | yes, origin preserved |
| `hashchange` on later change | n/a | fires |

The params shim works by patching `URLSearchParams.prototype`, an ordinary
prototype. `location.hash` has no such escape hatch: it is a non-configurable
own property, so no prelude trick can fake it. That rules out the shim approach.

Switching the iframe from `srcdoc=` to a `blob:` URL with the fragment appended
delivers a real hash. **Correction, measured after the table above:** the first
probe omitted the stamped `<base>` and so read as retiring the history-safe
shim (`history-safe-toss-render-shim-hkih5m`). With `<base href=github.io>`
present, which is the real configuration, a relative `replaceState('#x')`
resolves to a URL matching neither `about:srcdoc` nor the blob URL, and throws
in both. The shim stays. The blob switch buys the **initial** hash and nothing
else; an absolute-URL `replaceState` and a plain `location.hash =` assignment
already worked under srcdoc.

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
- 2026-07-25: done on `claude/toss-render-data-formats-4t55x7`, lands via PR #288.
  Implemented as a shared `mountFrame(html, sandbox, frag)` used by both
  `showTrusted` and `showHtml`, with the fragment split off in `showAddress`
  (before the `?query` split, since it is last in the string), in the payload
  branches, and in the route branch, where it belongs to the renderer rather
  than the `?src=` value. Verified headless with a new `toss-fragment` scenario:
  address mode, payload mode, and a srcdoc control that proves the old path
  could not deliver a hash; plus a real `#gz=` toss of a hash-routing page and a
  `#data=` route form, both landing on the addressed view with zero page errors.
  The `fab-toss` scenario was baselined against pre-change `toss-render.html`:
  identical output, so its two sandbox errors are pre-existing (the harness does
  not impersonate the commits endpoint). Also added `--hash` to
  `tools/render/screenshot.mjs`, which previously could not set a fragment.
  Not done, deliberately: `data-view.html` does not yet read the fragment, so
  nothing claims item addressing works; that is the follow-on.
