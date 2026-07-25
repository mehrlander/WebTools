# Chat search results: the envelope contract

⭐ [pages/chat-results.html](https://mehrlander.github.io/web-tools/pages/chat-results.html) renders a **results envelope**: a JSON document describing what a search over the chat archives found. The division of labor is deliberate: the model (a search skill running over `mehrlander/chat-histories`) is the search engine and emits the envelope; the page is only the presentation layer. The page renders whatever fields exist and skips whatever doesn't, so the same page shows one full chat, a flat list, or a categorized constellation with narrative.

## Delivery

First match wins:

| channel | form | use when |
| --- | --- | --- |
| `#gz=<base64url>` | gzipped envelope in the URL fragment | small, self-contained results; private-safe (the fragment never reaches a server) |
| `?src=<spec>` | envelope fetched via the contents API; `<spec>` is a path in web-tools or `owner/repo@ref:path` | big constellations; write the envelope into `chat-histories` (a `results/` directory) and link it |
| (neither) | built-in demo envelope | schema demo, page development |

The `#gz=` form is produced the same way as a toss link (see `docs/SURFACING.md`, "Toss a live view"): gzip the JSON, base64url it, put it after `#gz=`.

### The `#chat-results=` toss (address the content, not the page)

For a committed envelope, the shortest link goes through a toss-render **route** instead of naming the page and its `?src=` by hand:

```
https://mehrlander.github.io/web-tools/pages/toss-render.html#chat-results=<owner>/<repo>[@<ref>]:<path>
e.g. …/toss-render.html#chat-results=mehrlander/chat-histories:results/webi-drs-data.json
```

`#chat-results=<envelope-address>` resolves to rendering this page with `?src=<envelope-address>`: the caller addresses the envelope, and toss-render (a schema-blind router) hands it to the renderer. `chat-results` is the page basename; it is one entry in toss-render's `TOSS_ROUTES` map, so a second envelope renderer is a second entry, not new routing. The renderer is always web-tools' `main` copy; the `@ref` inside the address is the envelope's ref. Same token gate as `#gh=` (a private envelope needs the viewer's token); for a token-less reader, deliver the envelope inline via `#gz=` on this page instead. Mechanism: the head comment in [`pages/toss-render.html`](../pages/toss-render.html).

## Schema

```jsonc
{
  "query": "the question as asked",              // optional; becomes the page title
  "generated": "2026-07-10 · searched 3 ways",   // optional; free-text provenance line
  "narrative": "markdown",                        // optional; the model's synthesis, rendered
                                                  // with live code blocks like everything else
  "facets": [                                     // optional; groupings, any axis the search found useful
    {
      "id": "topic-compression",                  // unique per envelope
      "label": "Compression",                     // chip text
      "note": "why this grouping exists",         // optional; chip tooltip
      "members": ["c1", "c2"]                     // result ids; a result may appear in several facets
    }
  ],
  "results": [
    {
      "id": "c1",                                 // required, unique per envelope
      "title": "Packing a bookmarklet with gzip", // required
      "provider": "claude",                       // claude | chatgpt | gemini | kimi | …
      "date": "2025-11-03",
      "relevance": "one sentence: why this chat matched",
      "tags": ["bookmarklets", "gzip"],           // clicking a tag filters by it
      "excerpts": [                               // the matched passages, shown on the card
        { "role": "assistant", "md": "markdown with fenced code" }
      ],
      "transcript": [                             // inline mode: full conversation embedded
        { "role": "user", "md": "…", "ts": "2025-11-03 14:02" }
      ],
      "source": {                                 // pointer mode: fetch on demand instead
        "repo": "mehrlander/chat-histories",
        "path": "claude/2025/….md",
        "ref": "main"                             // optional, defaults to main
      }
    }
  ]
}
```

`transcript` and `source` are alternatives; supply either, both, or neither. With both, the inline transcript wins (no fetch). With only `source`, the page fetches through the viewer's stored token, so pointer envelopes work only for the token holder; use inline transcripts (and `#gz=`) when the reader isn't. A `.json` source parses as a message array; anything else goes through `chatRender.parse`, which splits on turn markers: a heading (`## User`, `### Assistant`) or bold lead-in (`**User:**`) whose first word is a role name. Content before the first marker becomes a meta note.

Messages are `{ role, md, ts?, label? }`. Roles normalize loosely (`human`→user; `claude`/`chatgpt`/`gpt`/`gemini`/`kimi`/`model`→assistant; `system`; `tool`); `label` overrides the displayed name, so a normalized assistant turn can still read "ChatGPT".

## What the skill should do

1. Prosecute the search however the question demands; normalization of provider quirks happens here, not in the page.
2. Build the envelope: pointers plus excerpts for big result sets, inline transcripts for small ones. Facet by whatever axes the search actually surfaced (topic, era, where the match was found); facets are optional and per-search.
3. Deliver: small → `#gz=` link on `pages/chat-results.html`; large → commit the JSON to `chat-histories` (e.g. `results/<slug>.json`) and link `pages/chat-results.html?src=mehrlander/chat-histories:results/<slug>.json`.

## Rendering notes

The chats are regular provider output; they don't know this viewer exists, and nothing in a transcript can or should invoke its features. The renderer discovers fenced blocks itself and offers a view only where an arbitrary block stands on its own: Render for html/svg (sandboxed iframe; markup fragments render meaningfully out of context), Table for json arrays (Tabulator), Preview for md, plus a CM6 editor behind the Edit pencil on any block. A js block gets static code only — chat JavaScript is usually a piece of some larger thing, so executing it standalone would just produce reference errors. Nothing executes without a click. The sandbox documents come from [`lib/kits/proof.js`](../lib/kits/proof.js), the same machinery behind the vanilla-demo pages (whose curated, self-contained snippets are where a Run affordance does make sense).
