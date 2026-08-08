# Data view: the payload contract

⭐ [pages/data-view.html](https://mehrlander.github.io/web-tools/pages/data-view.html) renders **data**, where toss-render's other modes render a page: a CSV, a JSON array, a markdown file, a text log. It is the renderer behind the `#data=` toss route, and it is thin on purpose. The presentation is the shared multi-mode viewer ([`lib/alpineComponents/viewer.js`](../../lib/alpineComponents/viewer.js)), so the mode strip, Tabulator table, JSON tree, markdown preview, syntax highlighting, and GitHub/Raw/CDN links all come from the component every other page uses.

## Delivery

First match wins:

| channel | form | use when |
| --- | --- | --- |
| `#data=<spec>` | the toss route: `…/toss-render.html#data=<owner>/<repo>[@<ref>]:<path>` | the shortest link to a committed file; resolves into this page's `?src=` |
| `?src=<spec>` | fetched via the contents API; a plain path is this repo, or `owner/repo[@ref]:path` | reaching the page directly, or linking a specific view of it |
| `#gz=<base64url>` | gzipped payload in the fragment | data with no committed home; private-safe, since the fragment never reaches a server |
| (none) | a built-in demo envelope | schema demo, page development |

`#data=` is shorthand, not a separate path: toss-render resolves it onto `?src=` and never opens the payload. Same token gate as `#gh=` (a private file needs the viewer's stored token); for a token-less reader, send the bytes inline with `#gz=` instead. Files over 1 MB work: the page falls back to the git blobs API the way `gh.get` does.

Resolving that way makes this page the document toss-render mounted, which is not the same as the thing addressed. The shell says so: it stamps the **envelope** as the toss subject and carries this page as `via`, so the drawer around the frame names the file being read rather than the reader. Only the take actions follow `via`, since they operate on this page's DOM. See [`docs/show-repo.md`](../show-repo.md) under the render tab.

## Addressing an item

A multi-item envelope opens on the item the link names, not always the first:

| form | means |
| --- | --- |
| `#item=raw.csv` | the item whose `name` is `raw.csv`, or whose basename is |
| `#item=2` | the third item, by position |
| absent, or a miss | the first item, with no error |

All digits is an index; anything else is a name, matched against the full `name` first and then its basename (the basename is what the item strip shows, so it is what a reader will have copied). Duplicates resolve to the first match. The key is read fragment first and query second like every other input here, so `?item=` works where a context eats the `#`.

Through the toss route it is the trailing fragment, which belongs to the renderer rather than to the envelope address:

    …/toss-render.html#data=<owner>/<repo>:<bundle.json>#item=raw.csv

Selecting an item **writes the address back**, so the URL always names what is on screen and a reader can copy the address of the item they are looking at rather than of the envelope. The write is surgical: it edits the one key and leaves the rest of the fragment byte for byte, which is what lets a `#gz=` payload sit beside it (`UrlParams.withKey`, [`lib/kits/url-params.js`](../../lib/kits/url-params.js)). Two things it deliberately does not do: it adds no history entry, so the back button still leaves the page rather than walking the item strip; and it does not write on load unless the URL already named an item, so arriving at a plain `#gz=` toss never rewrites the payload.

Only the position is written when a name would be ambiguous, and only a name when it reads back as that item, so the address is one the page has verified rather than one it assumed.

The vocabulary belongs to the **envelope**, not to the page, so both directions live in [`lib/kits/data-payload.js`](../../lib/kits/data-payload.js) (`DataPayload.resolveItem`, `.addressItem`) beside the rest of what an item means, and `npm test` holds them. The page owns only the location read and write, which needs a browser: that half is held by [`tools/render/scenarios/data-view-item.mjs`](../../tools/render/scenarios/data-view-item.mjs) directly and [`data-view-item-tossed.mjs`](../../tools/render/scenarios/data-view-item-tossed.mjs) through a toss.

The viewport toggles are not part of this vocabulary. `bleed` is a preference about the reader's screen, not about what is being read, and would ride along on every copied link.

## Two shapes, no declaration

A payload is read by [`lib/kits/data-payload.js`](../../lib/kits/data-payload.js), which decides what it is rather than asking:

**Bare** is any bytes at all: a CSV, a JSON array, a log, a markdown file. One item. The viewer's own module tests decide how to show it, so `rows.csv` opens as a table and `shape.json` opens as a tree with nothing said. An addressed payload keeps its repo path, so its extension is real and its GitHub/Raw/CDN links resolve; an inline one is named by sniffing its bytes.

**Envelope** is a JSON object carrying an `items` array. Use it for what bare bytes cannot express: several files in one toss, a default view per item, a note per item.

```jsonc
{
  "kind": "data-view/1",         // optional; settles an ambiguous payload outright
  "title": "WebI extract, before and after",
  "note": "the transform's input and its stored shape",
  "items": [
    {
      "name": "raw.csv",         // optional; derived from src or sniffed when absent
      "view": "table",           // optional; a viewer module id (see below)
      "note": "as exported",     // optional
      "content": "a,b\n1,2\n"    // inline...
    },
    { "name": "stored.json", "src": "mehrlander/home@main:projects/budget-drs/data/stored.json" }
  ]                              // ...or by reference, per item
}
```

`content` and `src` are alternatives per item, so one envelope can mix inline and addressed items. A `src` item is fetched when you first open it, not up front.

### How the two are told apart

An object is an envelope when it declares `kind: "data-view/1"`, **or** its `items` entries each carry at least one of `content`, `src`, or `name`. Everything else is bare data.

The second half of that rule is what keeps a legitimate payload safe. `{"items": [1, 2, 3], "total": 6}` is data, not an envelope, and so is a config file whose top-level key happens to be `items`: [`docs/tools.json`](../tools.json) is exactly that shape and reads as data. When a payload really is ambiguous, `kind` settles it.

## Views

`view` is a module id from the viewer's registry, currently `raw`, `code`, `preview`, `table`, `tree`, `codepen`. It is a preference, not a demand: the viewer honors it only when that mode is actually available for the file, and otherwise falls back to raw. Nothing validates the id on the way in, so the vocabulary here tracks the viewer's with nothing to keep in sync.

Omit it and the page picks by content, not just extension:

| payload | opens in |
| --- | --- |
| `.csv`, `.tsv` | table |
| `.json` starting with `[` | table |
| other `.json` | tree |
| `.md` | preview |
| anything else | raw |

Every other available mode stays one tap away in the viewer's own header, so the pick is a starting point rather than a decision made for the reader.

## What this is not

It is not a surface profile and does not validate against [`schemas/`](schemas/). The envelope here is deliberately light: no roles, no context, no versioned profile. When a set of items needs curation, commentary, and cross-repo arrangement, that is a [surface](surface.md); when it is search output over the chat archives, that is [chat-results](chat-results.md). This is the plain case, and it stays plain.
