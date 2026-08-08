# Shorter: the payload contract

⭐ [pages/shorter.html](https://mehrlander.github.io/web-tools/pages/shorter.html) is an adjudication surface, not a shortener. You bring a text and a shorter version of it; the page word-diffs them and lays the shorter version out as a stream of discrete edits, each defaulting to accepted. The work is subtraction: skim, reject the cuts that went too far, rewrite or regenerate a span, copy the assembled result. Getting a shortening is cheap. Going through it piece by piece is what this page is for.

It is the renderer behind the `#shorter=` toss route. The in-browser model (Llama-3.2-1B via web-llm, WebGPU) stays optional and lazy: nothing is fetched from huggingface.co until a ✨ action is pressed, so the review flow works with no model at all.

## Delivery

First match wins:

| channel | form | use when |
| --- | --- | --- |
| `#shorter=<spec>` | the toss route: `…/toss-render.html#shorter=<owner>/<repo>[@<ref>]:<path>` | the shortest link to a committed document; resolves into this page's `?src=` |
| `?src=<spec>` | fetched via the contents API; a plain path is this repo, or `owner/repo[@ref]:path` | reaching the page directly |
| `#gz=<base64url>` | gzipped text or envelope in the fragment | a draft with no committed home, or a completed pair; private-safe, since the fragment never reaches a server |
| (none) | the empty form | pasting both sides by hand, which is what the page has always done |

Each key is read fragment first, query as fallback ([`lib/kits/url-params.js`](../../lib/kits/url-params.js)), so `?gz=` and `#src=` are accepted too. Prefer the forms above: prose is unbounded and belongs in the fragment, since the Pages edge caps a query string at roughly 8KB with a 414, while `?src=` is how a routed toss hands an address to the page through toss-render's params shim.

## Two shapes, no declaration

A payload is read by [`lib/kits/shorter-payload.js`](../../lib/kits/shorter-payload.js), which decides what it is rather than asking:

**Bare** is any text: prose, markdown, a pasted draft. It fills the left column and leaves the right one to you, so the page opens in its input form exactly as an empty visit does. This is the common case and needs no wrapper.

**Envelope** is a JSON object carrying both sides. Use it for the one thing bare text cannot express: a shortening someone already produced, so the link opens straight into the adjudication view.

```jsonc
{
  "kind": "shorter/1",      // optional; settles an ambiguous payload outright
  "title": "Constellation architecture",
  "original": "The full text, at its original length…",
  "proposal": "The shorter version to adjudicate against it…"
}
```

`proposal` is optional. An envelope without one is a bare payload that also carries a title. Neither side is validated past being a string: the page word-diffs whatever it is given, and an empty proposal is the page's own "draft one for me" path rather than an error.

**The discriminator is narrow on purpose.** The thing being shortened is arbitrary text, and some of it is JSON. An object qualifies as an envelope only when it declares `kind: "shorter/1"` or carries a string `original`. A JSON document that merely parses is read as bare text, which is what someone shortening a config file wants. This is the same rule [`lib/kits/data-payload.js`](../../lib/kits/data-payload.js) applies, for the same reason.

## What opens where

| payload | page opens in |
| --- | --- |
| bare text | the input form, left column filled |
| envelope with `original` only | the input form, left column filled, title set |
| envelope with both sides | review, already diffed |

An addressed payload takes its title from the file's path when the payload carries none, so a tossed document says what it opened.

## Contract notes

- The page holds no state across loads. A link is the whole input, and the assembled result leaves by the copy button. Nothing is written back to the repo.
- A private `?src=` needs the viewer's stored token. GitHub answers 404 rather than 401 for a private file fetched without one, so the page reports the failure inline rather than showing an empty form that looks like the link carried nothing.
- `?use=<ref>` pins the lib chain to a branch, tag, or sha for previewing edits.
