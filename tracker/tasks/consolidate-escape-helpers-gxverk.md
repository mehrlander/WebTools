---
id: consolidate-escape-helpers-gxverk
title: One HTML-escape helper, and decoding left to the source that knows
status: done
size: S
opened: 2026-08-18
closed: 2026-08-26
session: claude/web-tools-tracker-review-2vumr8
---
# One HTML-escape helper, and decoding left to the source that knows

`docs/HTML-STYLE.md` carries a rule, "Unescape before you escape," that
prescribes routing every data-derived string through **one helper** that
decodes entities and then escapes, "so the rule is applied once and in one
place rather than remembered per interpolation."

No such helper exists. There are five, each defined locally, and none of them
decodes first:

| Site | Name |
| --- | --- |
| `lib/alpineComponents/map.js:272` | `escHtml` |
| `lib/kits/text-diff.js:174` | `esc` |
| `lib/kits/chat-render.js:79` | `esc`, via the `new Option().innerHTML` idiom |
| `lib/kits/source-peek.js:128` | `esc` |
| `pages/repo-atlas.html:210` | `esc` |

So the rule is written in the grammar of a settled convention while describing
work not done. It is also the only block in `HTML-STYLE.md` that is not about
what a page looks like, which is why it surfaced: it was found during the pass
sorting that doc's composition rules from its implementation notes.

**The rule's scope is also wrong, and the fix should correct it rather than
implement it as written.** Whether to decode is a property of the *source*, not
of the render site. A source that genuinely contains the five literal
characters `&amp;` is indistinguishable from an entity-encoded one by looking
at the string, so a helper that decodes every data-derived string silently
corrupts the first case. The decision belongs at the ingestion boundary, once
per source, where the provider's behaviour is known.

Scope:

- One shared escape helper in `lib/`, adopted by the five sites above. Escape
  only; no decoding.
- Entity decoding handled where data is ingested, per source, with the choice
  recorded at that boundary.
- The `HTML-STYLE.md` rule is removed rather than rewritten, since neither half
  is a statement about what a page looks like. Its replacement is this task
  plus whatever note the ingestion sites carry.

Done means: one escape helper, five call sites converted, no decoding at
interpolation, and the block gone from `HTML-STYLE.md`.

## Progress log
- 2026-08-18: Filed while sorting `docs/HTML-STYLE.md` into composition rules
  and implementation notes. The block was the residue that fit neither bin;
  checking it showed the prescribed helper had never been built.

- 2026-08-26: Done. `window.esc` lands in `lib/vanilla-bundle.js`, beside
  `window.html`, escaping all five characters and null-safe. The two are the
  same decision read from either side: `html(markup)` says place this as nodes,
  `esc(text)` says make this inert, and between them the bundle's own
  "interpolations are raw, caller escapes" contract finally has both halves.

  **Five characters, not three.** Escaping the quotes is what lets one helper
  serve a text node and a quoted attribute alike, which retires the per-call
  judgment the five copies were each making. Only `repo-atlas.html` escaped the
  double quote, because only it interpolated into an `href`; the same value
  through `chat-render.js` would have come out of `new Option().innerHTML` with
  the quote intact. Nothing shipped was exploitable, since every other call site
  lands in a text node, but that was a property of where the calls happened to
  be rather than of the helper.

  **The decoding half is dropped, not deferred**, per this task's own argument.
  Searched for an ingestion boundary that needs it and found none: no source
  this repo reads carries entities (`wring.js` parses a live DOM, where the
  parser has already decoded; chat, PDF and GitHub payloads are plain). So the
  rule is recorded at the helper rather than implemented against no source.

  **The inventory of five was short.** Also found: two inline escapes in
  `lib/gh-auth.js`, one in `pages/wsl-sync/pension-map.html`, and four in
  `pages/drop/fills-concepts/`. None converts, and each now has a reason on
  record rather than being missed twice:
  - `gh-auth.js` paints the token prompt and the boot-failure screen, so it must
    not read a helper out of the chain that may be what failed. The reason is a
    comment in the file, next to both escapes.
  - `pension-map.html` is a self-contained page in `docs/loader.md`'s first
    tier: no `gh-api`, no `gh.load`, no bundle to read from.
  - `fills-concepts/` is preserved model output. Its `PROMPT.md` files record
    one prompt pasted into several fresh sessions, and the pages are the
    comparison; editing one edits the record.

  **`vanilla-bundle.js` moved from last to first in gh-boot's `BOOT`.** It
  depends on nothing, so the position was free, and leaving it last would have
  made every kit above it read an escape helper that had not arrived yet. Kits
  read `window.esc` at call time rather than capturing it at load time, so
  neither half rests on the other.

  Gated by `tools/test/one-escape-helper.test.mjs` (9 assertions): the helper's
  behavior, the scan that keeps the shelf at one, and a check that every
  exemption still describes a real one, so the carve-out list cannot outlive its
  reasons. The scan matches the entity as a QUOTED string literal, which is what
  separates an escape table from `Save &amp; retry` sitting in a page header.
  Suite green at 2446.

  The `HTML-STYLE.md` half was already done: PR #445 removed the block when it
  sorted that doc into composition rules and implementation notes, and filed
  this task as the residue.
