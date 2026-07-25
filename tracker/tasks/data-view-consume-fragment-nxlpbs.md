---
id: data-view-consume-fragment-nxlpbs
title: Have data-view open at an addressed item via the fragment
status: backlog
track: depends-on:toss-fragment-passthrough-558xcw
opened: 2026-07-25
next: decide the fragment vocabulary (item index, item name, or both) before building; the delivery half already works
---
# Have data-view open at an addressed item via the fragment

`toss-fragment-passthrough-558xcw` made toss-render hand a trailing `#frag` to
the rendered page as a real `location.hash`, in both trust postures. Nothing
consumes it yet. `pages/data-view.html` is the obvious first consumer: a
multi-item envelope currently always opens on item 0, so a link cannot point at
the item worth looking at.

Target:

    …/toss-render.html#data=<owner>/<repo>:<bundle.json>#item=raw.csv

The delivery half is done and verified; this is purely the page reading its own
hash and selecting.

## What to decide first

The vocabulary, which is a one-way door once links exist in the wild:

- `#item=<name>` reads well and survives reordering, but needs a rule for
  duplicate or missing names.
- `#item=<index>` is unambiguous and terse, but breaks when the envelope is
  edited.
- Supporting both (numeric means index, anything else means name) is the usual
  compromise and costs little.

Also decide whether selecting an item should **write** the hash back, so a
reader can copy the address of what they are looking at. That is the more
valuable half in practice, and it interacts with a known constraint: inside a
toss a relative `history.replaceState('#x')` throws (the `<base>` mismatch, see
the parent task), so the write path has to use an absolute-URL `replaceState`
or a plain `location.hash =` assignment, both of which do work.

## Definition of done

- A `#data=…#item=…` link opens data-view on that item, with an honest
  fallback when the item is not found (open item 0, do not error).
- Selecting an item updates the hash, so the address bar tracks the view.
- Covered by the render harness (`--hash` exists now) rather than by hand.

## Progress log
- 2026-07-25: filed at wrap-up of the toss-routes session (PR #288), converting
  the last open next-step out of that PR body. Deliberately not built there: the
  PR already carried two planned steps, and the vocabulary question deserves a
  decision rather than a default.
