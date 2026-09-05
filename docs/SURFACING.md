# Surfacing

Making a session's work visible, reviewable, and durable when chat is the only output channel. The canonical source is `mehrlander/web-tools` at `docs/SURFACING.md`, loaded with [CONVENTIONS.md](CONVENTIONS.md) by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Apply repo- and branch-scoped rules per workstream, and substitute the current repo into URL templates.

The installed set includes the universal **surfacing primitives** and the **surfacing course**, the guide-PR lifecycle that begins when a PR opens. See [PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md).

---

## Surfacing primitives

This prose is the authoritative statement of the primitives; [`docs/surfacing.csv`](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing.csv) is its gated index (membership held two-way by test), rendered live in the Web Tools app's Map view, Surfacing tab.

Each entry states the rule, then **Form** where there is a syntax, then **Boundary** where deleting it would change how the rule applies at an edge.

* **Reference is a link.** Anything tappable is `[caption](url)`; bare paths drop on mobile, in rendered markdown, and when copied. The first mention of a file the reader may open gets a link: unchanged source `[main]`, touched source `[new]`, a renderable page its 🥏, ⭐ or 📦. A change you are proposing links its file before the reasoning.
  **Boundary:** only a renderable page gets a render link, and source is a "view", never a preview. Reserve `file:line` for grep and debug.

* **Show pixels.** For a visual change, send an inspected headless screenshot inline.
  **Boundary:** a viewport shot cannot show horizontal overflow; measure `scrollWidth`.

* **Hand over the artifact.** Send a file the user would open, run, or iterate on with `SendUserFile`, not a description or a path. `proactive` when unprompted, `normal` when replying.
  **Boundary:** images preview inline; HTML, zip and audio download. For visual work, send the screenshot and the file.

* **Lead with the live view.** A README for something that renders opens with a prominent ⭐ link to the hosted version, above the prose.

* **Toss a live view 🥏.** Render an HTML page that has no hosted URL through the shared toss renderer rather than handing over source alone.
  **Form:** `toss-render.html#gz=<base64url>` gzips the page in; the fragment never reaches the server, absolute-URL CDN dependencies work, same-repo relative ones do not, and it travels to any reader. `toss-render.html#gh=owner/repo[@ref]:path` fetches a branch or private-repo page live with same-ref relative dependencies, through the viewer's stored token. Either takes a trailing `#frag`, handed to the page as its own hash, and `?w=<px>` on the renderer's own query to lay the page out at that width; an address may carry `?query` and `#frag` together. The drawer's Render tab drives the same widths with four presets.
  ```bash
  python3 -c "import gzip,base64,sys,pathlib; b=gzip.compress(pathlib.Path(sys.argv[1]).read_bytes()); s=base64.b64encode(b).decode().replace('+','-').replace('/','_').rstrip('='); print('https://mehrlander.github.io/web-tools/pages/toss-render.html#gz='+s)" page.html
  ```
  **Boundary:** `#gh=` is token- and allowlist-gated, and the token is browser-local, so a fresh or in-app browser may 404; fall back to `#gz=`. `?w=` moves the viewport, not `pointer` or `hover`. A `@ref` SHA comes from `git rev-parse HEAD`, never typed; confirm it is pushed with `git rev-parse origin/<branch>`.

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

* **Branch anchor.** The first file-modifying reply leads with `Working branch: [branch-name](url)`.

* **Open the branch 🌿.** For work in flight, link the branch page beside the guide PR.
  **Form:** `…/pages/branch.html#gh=owner/repo@branch[&base=ref]`, or `…#gh=owner/repo&pr=<n>` for a PR's own head and base. Add `&src=<spec>` or `&gz=<payload>` to lay an authored envelope over a branch with no PR.
  **Boundary:** its facts are read from the API on every load, so the link is current whenever it is opened and makes no freshness claim. It renders the guide PR body too, so one link carries the judgment and the file list together. Token-gated like every `#gh=`. 🌿 is where you read the branch, 🧭 where you merge it. For browsing rather than linking, `…/app/?view=activity`.

* **Guide pointer 🧭.** Mark the branch's guide PR with 🧭. A reply may close with `🧭 [PR #N](…) (body synced)`, and where the branch has a PR, 🌿 rides beside it.
  **Boundary:** the parenthetical is a claim about this reply, not about the PR. Write `(body synced)` only when this turn rewrote the guide region, `(body not synced)` otherwise, and never carry it forward from an earlier reply.

* **Task marker 🎫.** Where the repo uses [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), surface a task as `🎫 [title](<task blob url>)`. The filename id never shows.

* **Surfacing caption.** End a file-modifying turn by saying **where to look**, not by listing what moved: the branch page enumerates them, grouped through the content registry, current on every load, each diff a tap away. Name in the prose only the files with something non-obvious to say, linked per Reference is a link, and enumerate nothing.
  **Form:**
  ```
  🌿 [<branch>](…/pages/branch.html#gh=<owner>/<repo>@<branch>) · <N> files · [this turn](…/commit/<sha>)
  ```
  `<N>` is `git diff origin/main...HEAD --name-only | wc -l`. `this turn` is that turn's own commit; drop it where the branch has a single commit. The render line follows unchanged.

  **Addressing one file, or one section.** `&file=<path>` opens the file deck on that file, which for a changed file beats a `[new]` blob: the slide carries the diff, the file itself, and the compare bar. `&pane=files` opens on the file list, which the page stacks above the guide. Address grammar: [show-repo.md](https://github.com/mehrlander/web-tools/blob/main/docs/show-repo.md).

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

  **Boundary:** apply the ⭐ honesty gate at every size; where there is no render link, say why rather than omitting it. The 🌿 line replaces the list, never the prose: a turn that changed something non-obvious still says so in words. Slash-joined `[main](…)/[diff](…)` pairs count as one run, so separate them with `, `. Measurement: [environment/capabilities.md](https://github.com/mehrlander/web-tools/blob/main/docs/environment/capabilities.md).
* **Review the diff 🔍.** Where the changed files are worth reading, add `…/pages/review.html#gh=owner/repo@branch&base=main` (`:path` for one file): each file's diff against the merge base, its patch and its raw content.
  **Boundary:** it supplements the caption, never replaces it, and is token-gated like every `#gh=`. 🌿 reads the branch, 🔍 the diff.

* **Close in one order.** Parts that do not apply are skipped; the order never varies: the 🌿 caption line, the render line, 🧭, then exactly one closing state, last.
  **Boundary:** a reply that changed no files still closes with a state, and nothing follows it. A wake that changed nothing is the exception and says nothing at all: no state, no restated list.

* **Session diff.** Summarize substantial work with `Session diff: [main...branch](url)`.

* **Closing state.** End a reply that finishes work, proposes work, or leaves something open with exactly one state.

  - 🟢 **Ready to continue:** work is ready to do now. Name the work available on "go"; "go 1, 3" takes a subset. Work the session conceives is proposed here, never done unprompted (Keep focus).
  - ❇️ **Ready to assess:** a question is ready to investigate. "Go" means assess it and report back, not implement whatever the assessment suggests.
  - 🟡 **Pending:** keep this visible, but not ready yet: work waiting on another action, an answer, or a dependency.
  - 🆚 **Choice needed:** a genuine choice remains. Give the assessment and the recommendation, then state what the user needs to choose.
  - ✴️ **Needs you:** something only the reader can supply blocks the next step: a tap, an observation, a value from outside the repo. Ship the link that performs each ask, say in one clause what it buys, and say how the answer comes back.
  - 🟠 **Attention:** a concrete problem or risk to address before going further, not routine uncertainty.
  - ⚪ **Clean exit:** work here is done. Recommend wrapping up or merging.
  - 🟣 **Merged:** this workstream's branch merged. Say what shipped in one line.
  - 🔴 **Closed:** this workstream's branch closed unmerged. Say why in one line.
  - 🔵 **Short answer:** answered, with no work proposed. The marker carries "Short answer," so the bold lead is a short, recognizable version of the question with the answer right behind it: 🔵 **Did we get to the double back tap?** No. Shorten toward the sharper question, never the safer one.

  **Boundary:** Write each state to be understood without the message it closes: do not lean on terms established above, and link referenced files. **The colour says who acts:** green is work the session performs, so 🟢 never instructs the reader, while orange needs the reader, 🆚 to decide and ✴️ to do. An ✴️ ask carrying no link is a defect: mint the link, or say in the same line why none can exist. Past about three asks, or wherever the answers need to come back structured, they become an inquiry surface ([`inquiry-v1`](https://github.com/mehrlander/web-tools/blob/main/docs/envelopes/schemas/profiles/inquiry-v1.schema.json)), which names its own return address. 🟣 and 🔴 mark the branch, not a task; a task dropped or deferred inside a live branch does not make the branch 🔴. Where the session could reasonably investigate the question itself, that is ❇️ rather than 🆚 or ✴️. **For confirmation, favor 🟢, not 🆚: 🆚 is for presenting two competing changes.** An assessment that lands on one option is ⚪ when the move is to stop, 🟢 when it is a ready next step the ask points to.
* **External proxies: prohibited.** Never `htmlpreview.github.io`, `raw.githack.com`, `gitcdn.link` or their kin: they fetch server-side, fail on private repos, and route content through another host. Use `[new]` for canonical source and 🥏 for a private or un-deployed render.

* **Subscribe the workstream PR 📬.** On creating a workstream's pull request, call `subscribe_pr_activity` for it.
  **Boundary:** subscribe once, at creation. Every event arrives, and arrival obliges nothing; acting is decided per event, never automatically. A comment opening `go:` is an instruction that states intent and never authority, since anything holding a write token is indistinguishable from the account owner. A wake that changed nothing says nothing: verify silently and reply with the change or one line, never a table or a restated state. Everything else, a review, a passing check, a failing one, is incoming context; a failing check is addressed when it bears on work this session is responsible for, not because an event arrived. Do not arm a scheduled check-in. Mechanism, the measurements, and the hook that prompts the call: [inbound.md](https://github.com/mehrlander/web-tools/blob/main/docs/inbound.md).

---

## The surfacing course

Once a PR opens, its body is the branch's current state: live while the branch is open, the shipped account after merge. Open it as a draft at first push.

```markdown
<One sentence: what this branch is doing and why.> [Follow-up to #N.]

[//]: # (guide)

⭐ **Look:** [<the thing to open>](<branch preview w/ commit SHA, else [new] blob>)

<The change set in prose: only the files with something non-obvious to say,
paths plain and no link triplets, `renders on:` for a shared component.
Omit where the opener already says it.>

**Next steps / open threads:**
- <current and honest; revise on every sync>

**Notes / Risk:** <what to scrutinize, test status, non-obvious why>

[//]: # (/guide)

<session-link footer>
```

- **The body does not enumerate files.** The Files tab and the branch page already do, current by construction.
- **It is state, not a changelog.** Narrative goes in dated PR comments; **Next steps** must stay honest.
- **The markers are link labels, not HTML comments,** which the GitHub MCP strips on readback. Rewrite only between them, via `update_pull_request`. Read either form, emit this one, and stop rather than guess if neither is present. Check URLs first: `python3 scripts/mcp-link-safe.py --check body.md`.
- **Ready is the user's decision,** on explicit instruction or an accepted wrap-up offer.
- **"Wrap up" means green, not merged:** preflight `git merge-tree` against main, run per-session refreshes, finalize the guide, mark ready. **"Merge" means merge,** so run that sequence and merge without asking twice. Never merge red, and never by any route but the PR.
- **Abandon by closing the draft,** with a comment saying why.
- **Before the container goes,** route anything costly that exists only in session context into the guide or a PR comment, never a tracker task.
- **Post-merge edits need a new PR.** Merge terminates the branch ([why](https://github.com/mehrlander/web-tools/blob/main/docs/github/post-merge-branch-mutation.md)); `git log main..HEAD` shows what is waiting.

Delivery history is the merged PRs themselves: do not commit a projection of them, and do not run a second history beside [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md)'s task axis.
