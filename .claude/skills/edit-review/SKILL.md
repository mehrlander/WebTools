---
name: edit-review
description: >-
  Hand over an edited markdown (or any text) file for review: stage its
  before and after versions into show-repo, point at the Diff lens (diff,
  copy, and a fixed panel of general review prompts — tighten it, fresh-eyes
  clarity, consistency, fact/logic, was-it-worth-it, open critique — each
  one-click-copies both texts, the diff, and its ask for pasting into a
  separate chat as a second, independent review), and encode any bespoke,
  document-specific prompts onto the link's &prompts= commentary so they
  ride it too. Use when the user asks to "review this edit", "get a second
  opinion on this
  change", wants a diff-plus-review-prompts handoff, or after making a
  substantive edit to a document they'll want reviewed.
---

# edit-review

Hands an edited file to show-repo's stage for review, rather than generating
a bespoke page. The Diff lens (`lib/alpineComponents/stage.js`) already does
the diff, the copy, and a general-purpose review-prompts panel; this skill's
job is staging the right two things and handing over the link.

## Why the stage, not a new page

`pages/review.html` also renders a diff, but only for content already
committed and pushed (it reads via the GitHub API, `repo@ref:path`). The
stage's Diff lens does the same "before vs after" compare but also accepts a
**local, pasted item** on either side, so it covers the case review.html
can't: an edit that hasn't been committed yet. That is the deciding reason
this skill targets the stage.

## Two staging modes

**Committed edit (the common case).** The file already exists at two refs
(the edit's branch tip, and the base it diverged from, or two commits).
Mint a `#stage=` link with the same path at both refs, and append `&mode=diff`
so the stage opens on the Diff tab and runs the diff itself, no click:

```
https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html#stage=owner/repo@<base-ref>:path/to/file.md;owner/repo@<head-ref>:path/to/file.md&mode=diff
```

The Diff lens auto-pairs the two staged items into A/B (first stage item to
A, the second to B) the moment they land, and `mode=diff` opens the preview on
that compare, so the reviewer sees the diff immediately. Drop `&mode=diff` to open on
the Out tab instead (a bundle handoff rather than a review).

**Uncommitted edit.** The "after" text has no ref yet (a draft still being
worked on, or content that will never be committed). Stage the committed
"before" as a ref item and hand the "after" text as the local/pasted item
instead. There is no link form for a local item (`#stage=` carries refs
only), so this mode is chat-native: describe what you staged and paste the
after-text inline for the user to drop into the stage's drop-zone (or, if
staging on the user's behalf isn't possible from this session, give the two
texts directly in chat and let the user paste them into the stage's
drop-zone themselves).

## Bespoke prompts

The Diff lens's prompts panel ships six fixed, general-purpose asks (see
`DIFF_PROMPTS` in `stage.js`). Document-specific asks ride the link's
`&prompts=` commentary: write 2-4 prompts tailored to what's actually at stake
in *this* edit (a specific number, a term, a claim that changed) and encode
them onto the link. They render first in the panel (a sparkle marks them),
above the fixed six, each one-click-copying both texts plus the diff plus that
ask.

`prompts=` is a base64url'd JSON list of `{label, ask}`. Build the whole link
(refs + commentary) with `StageLink.mint`, or in a session without the shell
loaded, mint the `prompts` value directly:

```bash
python3 -c "import json,base64,sys; s=json.dumps(json.load(sys.stdin),separators=(',',':')); print('&prompts='+base64.urlsafe_b64encode(s.encode()).decode().rstrip('='))" <<'JSON'
[{"label":"FTE count","ask":"Did the FTE figure stay consistent between the before and after?"},
 {"label":"Fund split","ask":"The after adds a 70/30 fund split; is that supported by the source?"}]
JSON
```

Append that to the `#stage=` link. Soft cap: 24 entries (a long list bloats the
URL). For an uncommitted edit whose after-text is a local paste, the prompts
still ride the link even though the after-text does not.

## Handoff

Mark the link 🗂️ per the surfacing conventions (`docs/SURFACING.md`,
"Stage a fileset"), and state the honesty caveat: it's token-gated, so it
renders only for the link owner in a browser holding their `ghToken`.

```
🗂️ [Review: path/to/file.md](<stage link>)

Also worth checking:
- <bespoke prompt 1>
- <bespoke prompt 2>
```

## What "review" means here

The user reviews inline (the Diff lens's own view), or copies a prompt to
paste into a *separate* chat for an independent second opinion — that
second path is the whole point of the prompts panel: each copy assembles
both compared texts plus the diff plus that prompt's ask into one pasteable
block (see `copyPrompt` in `stage.js`).

## Known gaps (v1)

- The Diff lens's compare is line-level (`diffLines`, a plain LCS), not the
  word-level highlighting `pages/review.html`'s CM6 diff gives changeset
  reviews. Good enough for the "here's what changed" read a copied prompt
  needs; a nicer inline read is a possible follow-up.
- No standing test proves the `#stage=` two-refs-same-path link opens with
  A/B already paired end-to-end in a real browser (the auto-pairing itself
  is unit-tested in `tools/test/stage.test.mjs`, not the link's full open
  path). Worth a manual check before leaning on it hard.
