# Surfacing, extended

The surfacing carriers and details that most replies never reach. [SURFACING.md](SURFACING.md)
holds the primitives themselves and is injected into every session; this file is not, and is
fetched when one of the entries below applies. Each keeps its **Form** where there is a syntax
and its **Boundary** where an edge changes the rule.

## Carriers

* **Lead with the live view.** A README for something that renders opens with a prominent ⭐ link to the hosted version, above the prose.

* **Publish an artifact 📦.** Publish a self-contained page as a stable private `claude.ai` snapshot; authentication follows the viewer's Claude sign-in, so no browser token. Record the URL in a README, PR body, or task file.
  **Boundary:** artifact CSP blocks external requests, so bake CDN dependencies in first. Frozen but republishable in place with version history. Private to the author on Pro and Max, so other readers get a 🥏 `#gz=` toss. See `docs/artifacts.md`.

* **Stage a fileset 🗂️.** Move a fileset across repos for viewing, bundle download, copying, or review diff.
  **Form:** `…/app/#stage=owner/repo[@ref]:p1,p2;owner2/repo2:p3`, groups `;`-separated and paths `,`-separated. Add `&prompts=<base64url>` for `{label, ask}` review prompts or `&mode=diff` to open on that comparison; `StageLink.read` also accepts these in the query.
  **Boundary:** token-gated with the same in-app-browser caveat as `#gh=`; for a tokenless reader, download the bundle and hand it over. A stage is an inline handoff, not a caption row. See `docs/stage.md`, `docs/show-repo.md`, and `.web-tools.json`.

* **Carry content in an envelope.** A curated, annotated set of files, chats, diffs, or search hits that should travel and render together goes in an envelope rather than an ad-hoc format. The carriers are stage, surface (`pages/app.html` estate view), chat-results (`pages/chat-results.html`) and data view (`pages/data-view.html`).
  **Boundary:** they share the `owner/repo[@ref]:path` grammar, the `#gz=`/`?src=` delivery split, and live-code rendering. One contract per carrier in [`docs/envelopes/`](https://github.com/mehrlander/web-tools/tree/main/docs/envelopes).

* **Toss data 📊.** Address a CSV, JSON array, or log through the data route so it opens readable rather than raw: `toss-render.html#data=owner/repo[@ref]:path`. It picks a mode by content (table, tree, preview, code, raw) and leaves every other one a tap away. Bare bytes need no wrapper; an `items` envelope adds several files with a default view and notes for each, and a trailing `#item=<name|index>` opens on one.
  **A PDF has two routes.** `#data=` is the first look: the page drawn, a pager, the real page and byte counts. `#pdf=` is the workbench (`pages/pdf-inspect.html`), down to characters, vector rules and detected table cells. Pick by what the reader is meant to do.
  **Boundary:** same token gate as `#gh=`; `#gz=` on the page itself for a tokenless reader. Contract: [`docs/envelopes/data-view.md`](https://github.com/mehrlander/web-tools/blob/main/docs/envelopes/data-view.md). What the kit recovers from a PDF and what it does not: [`pdf-structure.md`](https://github.com/mehrlander/web-tools/blob/main/docs/pdf-structure.md).

* **Copy to the clipboard 📋.** A `shortcuts://run-shortcut?name=<shortcut>&input=text&text=<payload>` link whose payoff is content on the reader's clipboard.
  **Boundary:** only for content that must be made on the device, meaning a pasteboard type you cannot produce or a value computed from device state at tap time; otherwise hand over a file. The payload is opaque, so the caption states what it holds, how many actions, and whether the link replaces or adds. Paste it exactly as its generator emitted it: an edited payload keeps its actions and loses its label, so it works and misreports at once. Hand it over as `[label](shortcuts://…)`, never bare and never in a code span, which the chat client will not autolink. Measured in [markdown-in-chat.md](https://github.com/mehrlander/web-tools/blob/main/docs/markdown-in-chat.md).

* **Run a shortcut 📲.** The same link shape with the payoff anything but the clipboard. The payload is legible, so the caption stays short; the `[label](url)` rule is unconditional for both routes. Generator: [`mehrlander/shortcut-tools`](https://github.com/mehrlander/shortcut-tools), `tools/pack.py` for 📋 and `tools/show.py` for 📲; its `CLAUDE.md` carries the cost discipline that governs when either link is worth sending.

* **Task marker 🎫.** Where the repo uses [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), surface a task as `🎫 [title](<task blob url>)`. The filename id never shows.

* **Review the diff 🔍.** Where the changed files are worth reading, add `…/pages/review.html#gh=owner/repo@branch&base=main` (`:path` for one file): each file's diff against the merge base, its patch and its raw content.
  **Boundary:** it supplements the caption, never replaces it, and is token-gated like every `#gh=`. 🌿 reads the branch, 🔍 the diff.

* **Session diff.** Summarize substantial work with `Session diff: [main...branch](url)`.

## The caption, when the branch page cannot be used

  **Where the enumerated list still applies.** The branch page is token-gated, so a reader with no stored token, or a repo with no deployed page, needs the list. Rows stay uniform, filenames plain, link words tappable, a file's links not repeated within a turn:

  | File state | Links |
  | --- | --- |
  | Changed | `[new], [main]/[diff]` |
  | New | `[new]`, or `[new]/[diff]` after several branch commits |
  | Deleted | `[main]/[diff]` |

  `[new]` is the branch tip, `[main]` the baseline; `[main]/[diff]` is the net change against main and `[new]/[diff]` is on-branch history. Add `#L120` or `#L120-L145` for line anchors.

  In an MCP-written body or comment, **a URL of 150 characters or more is wrapped in backticks and renders as literal text; 149 or fewer survives.** Length only, anywhere in the text, the label never counting; chat is untouched. Check with `scripts/mcp-link-safe.py --check`, and shorten in this order:

  | Too long | Shorten it to |
  | --- | --- |
  | a toss carrying `?use=` and `#gh=` together | `#gh=` only |
  | a `#gh=` address on a `claude/…` branch | the commit SHA |
  | a compare URL with a `#diff-<hex>` anchor | the plain compare URL |
  | a deep `:path` in a toss | the branch page, or a `#gz=` in chat |
  | anything still over | drop the render link from the body; put it in the chat caption |

## Tossing a page the reader cannot fetch

`#gz=` carries the page in the fragment, so it reaches a reader with no stored GitHub token.

```bash
  python3 -c "import gzip,base64,sys,pathlib; b=gzip.compress(pathlib.Path(sys.argv[1]).read_bytes()); s=base64.b64encode(b).decode().replace('+','-').replace('/','_').rstrip('='); print('https://mehrlander.github.io/web-tools/pages/toss-render.html#gz='+s)" page.html
```

