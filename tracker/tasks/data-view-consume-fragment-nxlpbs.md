---
id: data-view-consume-fragment-nxlpbs
title: Have data-view open at an addressed item via the fragment
status: done
depends-on: toss-fragment-passthrough-558xcw
opened: 2026-07-25
closed: 2026-08-06
session: claude/web-tools-tracker-review-ij4pjj
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
- 2026-08-06: done on `claude/web-tools-tracker-review-ij4pjj`.

  **The vocabulary decision, since it is the one-way door.** Both forms, on the
  usual rule: all digits is an index, anything else is a name. A name matches
  the item's full `name` first and then its basename, because the basename is
  what the item strip shows and therefore what a link author will have copied.
  Duplicates take the first match; a miss opens item 0 and raises no error.

  **Write-back was built, and it is the more valuable half as predicted.** The
  address written is the *shortest form that reads back as that item*, checked
  by round-tripping through the same resolver rather than by testing uniqueness
  by hand, so the page never mints an address it has not verified. Three
  restraints, each of which was a real choice:

  - It edits one key and leaves the rest of the fragment byte for byte
    (`UrlParams.withKey`, the new write half of `lib/url-params.js`). A
    URLSearchParams round-trip would have been correct in principle and a
    rewrite of a whole `#gz=` payload in practice.
  - It uses an absolute-URL `replaceState`, with the plain `location.hash =`
    assignment as the fallback rather than the route. The parent task measured
    that the relative form throws under the stamped `<base>`; measured again
    here inside a real toss, the absolute form works and adds **zero** history
    entries, so item clicks cannot capture the shell's back button. The
    assignment stays for the opaque-origin case, where `replaceState` throws.
  - It does not write on load unless the URL already named an item. Arriving at
    a plain `#gz=` toss therefore never rewrites the payload; arriving at a
    *miss* does, correcting the address to what is actually on screen.

  `bleed` stays out of the fragment, now for a settled reason rather than a
  reserved one: `item` addresses what is being read, and a viewport preference
  would ride along on every copied link. Noted in the page where the earlier
  comment deferred to this task.

  Covered by the harness, not by hand: `tools/render/scenarios/data-view-item.mjs`
  (8 assertions, direct) and `data-view-item-tossed.mjs` (4, end to end through
  `#gh=`), both green with zero page errors, plus 5 new unit tests on `withKey`
  in `npm test`. The tossed scenario exists because the read is of
  `location.hash`, and inside a toss that hash is manufactured by the shell's
  blob mount rather than typed by a reader, which is the only place the two
  halves could have failed to meet.

  One harness trap worth naming: a `page.goto` that changes only the fragment
  is a same-document navigation, so the page keeps the state it had and every
  assertion reads the previous case. Three of eight assertions passed falsely
  before the scenario added an explicit reload.
- 2026-07-25: filed at wrap-up of the toss-routes session (PR #288), converting
  the last open next-step out of that PR body. Deliberately not built there: the
  PR already carried two planned steps, and the vocabulary question deserves a
  decision rather than a default.
