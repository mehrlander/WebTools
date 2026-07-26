# Shorter: the payload contract

⭐ [pages/shorter.html](https://mehrlander.github.io/web-tools/pages/shorter.html) is an adjudication surface, not a shortener. You bring a text and one or more shorter versions of it; the page puts every version onto one surface anchored on the original, so each place the versions disagree becomes a single decision carrying one option per distinct wording. The work is subtraction: pick a version as the baseline, walk the decisions where you would have cut differently, copy the assembled result. Getting a shortening is cheap. Going through it piece by piece is what this page is for.

It is the renderer behind the `#shorter=` toss route. The in-browser model (Llama-3.2-1B via web-llm, WebGPU) stays optional, lazy, and deliberately secondary: a 1B model is a poor whole-document editor, which is what the seeded-bundle path below exists to replace. It remains for the one job it is adequate at, rewriting a single span on request, and nothing is fetched from huggingface.co until a ✨ action is pressed.

## Delivery

First match wins:

| channel | form | use when |
| --- | --- | --- |
| `#shorter=<spec>` | the toss route: `…/toss-render.html#shorter=<owner>/<repo>[@<ref>]:<path>` | the shortest link to a committed document or bundle; resolves into this page's `?src=` |
| `?src=<spec>` | fetched via the contents API; a plain path is this repo, or `owner/repo[@ref]:path` | reaching the page directly |
| `#gz=<base64url>` | gzipped text or envelope in the fragment | a draft with no committed home; private-safe, since the fragment never reaches a server |
| (none) | the empty form | pasting the sides by hand, which is what the page has always done |

Each key is read fragment first, query as fallback ([`lib/url-params.js`](../../lib/url-params.js)), so `?gz=` and `#src=` are accepted too. Prose is unbounded and belongs in the fragment, since the Pages edge caps a query string at roughly 8KB with a 414, while `?src=` is how a routed toss hands an address to the page through toss-render's params shim.

## Two shapes, no declaration

A payload is read by [`lib/shorter-payload.js`](../../lib/shorter-payload.js), which decides what it is rather than asking:

**Bare** is any text: prose, markdown, a pasted draft. It fills the original and leaves the versions to you, so the page opens in its input form exactly as an empty visit does. This is the common case and needs no wrapper.

**Envelope** is a JSON object carrying the original and, optionally, shortenings of it, so the link opens straight into the adjudication view.

```jsonc
{
  "kind": "shorter/2",
  "title": "Parsimony",
  "source": "mehrlander/home:created/2026-07-17-parsimony.md",
  "original": "The full text, at its original length…",
  "proposals": [
    { "label": "Tighten in place", "note": "Cuts within blocks; every section survives.",
      "blocks": { "1": "a shorter block 1", "7": "", "9": "a shorter block 9" } },
    { "label": "Skeleton", "note": "Load-bearing claims only.", "text": "…whole rewritten document…" }
  ]
}
```

`kind: "shorter/1"` with a single `proposal` string is the pasted-from-a-chat shape and stays valid: it reads as a one-entry `proposals`. shorter/2 exists for the one thing that shape cannot express, several independent shortenings of one document adjudicated side by side.

**The discriminator is narrow on purpose.** The thing being shortened is arbitrary text, and some of it is JSON. An object qualifies as an envelope only when it declares a known `kind` or carries a string `original`. A JSON document that merely parses is read as bare text, which is what someone shortening a config file wants. This is the same rule [`lib/data-payload.js`](../../lib/data-payload.js) applies, for the same reason.

## A version's two forms

| form | shape | use when |
| --- | --- | --- |
| whole text | `{ label, note?, text }` | a pasted rewrite, or anything not written against the original's structure |
| block map | `{ label, note?, blocks: { "7": "…" } }` | a generated bundle |

The block map is why a bundle stays small: a version that rewrites four paragraphs of a forty paragraph document stores four, not forty. Keys are indices into the original split on blank lines, an omitted index means unchanged, and `""` deletes the block. `ShorterPayload.splitBlocks` owns that split so a producer and the page cannot disagree about it, and `read()` materializes every version to full text on the way through, so everything downstream sees one shape.

[`scripts/build-shortening.py`](../../scripts/build-shortening.py) assembles a bundle from an original plus one JSON file per version, and fails rather than emitting a bundle whose indices are out of range. Producing the versions is not mechanical (a model wrote them), so a bundle is a record, not a regenerable artifact: keep it beside the document it shortens, in a repo of the same visibility.

## What opens where

| payload | page opens in |
| --- | --- |
| bare text | the input form, original filled |
| envelope with `original` only | the input form, original filled, title set |
| envelope with one or more versions | review, already aligned |

An addressed payload takes its title from the file's path when the payload carries none, so a tossed document says what it opened.

## How the versions align

[`lib/shorter-merge.js`](../../lib/shorter-merge.js) holds the alignment, and the frame is always the **original**. Each version is expressed as a list of ops in original coordinates, so "what does version C say here" is answerable for any span, including spans C never touched: it says the original. Wherever at least one version changed something, that span becomes a decision.

Three properties are worth knowing, because they are what make the surface readable:

- **Regions grow to the size of the disagreement.** A copy-edit yields a word-sized decision; two versions that rewrote the same paragraph wholesale yield a paragraph-sized one. Short equal runs between regions are absorbed, because two people rewriting a sentence from scratch still coincide on "the" and "was", and an unabsorbed diff reports one rewrite as six adjacent decisions. Absorption never crosses a blank line: a paragraph break is the coarsest unit a decision may have, never one it may straddle.
- **Identical wordings collapse into one option.** With four versions most regions are touched by one of them, so three would otherwise show as buttons that all read like the original. Options are grouped by exact text, the group holding the original records which versions agreed with it, and the rest are labelled by the versions that wrote them. Agreement between independently produced shortenings is itself evidence about the cut.
- **A version is reproducible from the surface.** Selecting one version at every decision reassembles that version exactly, and selecting the original everywhere returns the document byte for byte. That is what makes the rail's "apply throughout" honest rather than approximate, and it is asserted in [`tools/test/shorter-merge.test.mjs`](../../tools/test/shorter-merge.test.mjs).

The known coarseness: where every version deleted or rewrote a whole section, the decision is that whole section, hundreds of words accepted or rejected in one click. There is no split-this-decision affordance yet.

## Contract notes

- The page holds no state across loads. A link is the whole input, and the assembled result leaves by the copy or download button. Nothing is written back to the repo.
- A private `?src=` needs the viewer's stored token. GitHub answers 404 rather than 401 for a private file fetched without one, so the page reports the failure inline rather than showing an empty form that looks like the link carried nothing.
- `?use=<ref>` pins the lib chain to a branch, tag, or sha for previewing edits.
