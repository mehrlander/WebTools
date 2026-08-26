# Surfacing

Making a session's work visible, reviewable, and durable when chat is the only output channel. The canonical source is `mehrlander/web-tools` at `docs/SURFACING.md`, loaded with [CONVENTIONS.md](CONVENTIONS.md) by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Apply repo- and branch-scoped rules per workstream, and substitute the current repo into URL templates.

The installed set includes the universal **surfacing primitives** and the **surfacing course**, the guide-PR lifecycle that begins when a PR opens. See [PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md).

## One render path

Use ⭐ for the canonical URL of an already-deployed page. Otherwise use the 🥏 toss below; there is no per-repo preview mechanism.

## The one per-repo setting: per-session refreshes

Normally none. In local `CLAUDE.md`, name only a slow or non-deterministic generated artifact that cannot ride a commit hook and must be regenerated once at wrap-up.

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
  **Boundary:** they share the `owner/repo[@ref]:path` grammar, the `#gz=`/`?src=` delivery split, and live-code rendering. Contracts in [`docs/envelopes/`](https://github.com/mehrlander/web-tools/tree/main/docs/envelopes): `docs/envelopes/surface.md`, `docs/envelopes/chat-results.md`, `docs/envelopes/data-view.md`.

* **Toss data 📊.** Address a CSV, JSON array, or log through the data route so it opens readable rather than raw: `toss-render.html#data=owner/repo[@ref]:path`. It picks a mode by content (table, tree, preview, code, raw) and leaves every other one a tap away. Bare bytes need no wrapper; an `items` envelope adds several files with a default view and notes for each, and a trailing `#item=<name|index>` opens on one.
  **A PDF has two routes.** `#data=` is the first look: the page drawn, a pager, the real page count and byte size. `#pdf=` is the workbench (`pages/pdf-inspect.html`): text containers, characters, vector rules, detected columns and lattice cells, and the table read two independent ways. Pick by what the reader is meant to do.
  **Boundary:** same token gate as `#gh=`; `#gz=` on the page itself for a tokenless reader. Contract: [`docs/envelopes/data-view.md`](https://github.com/mehrlander/web-tools/blob/main/docs/envelopes/data-view.md). What the kit recovers from a PDF and what it does not: [`pdf-structure.md`](https://github.com/mehrlander/web-tools/blob/main/docs/pdf-structure.md).

* **Copy to the clipboard 📋.** A `shortcuts://run-shortcut?name=<shortcut>&input=text&text=<payload>` link whose payoff is content on the reader's clipboard.
  **Boundary:** only for content that must be made on the device, meaning a pasteboard type you cannot produce or a value computed from device state at tap time; otherwise hand over a file. The payload is opaque, so the caption states what it holds, how many actions, and whether the link replaces or adds. Paste the link exactly as its generator emitted it: an edited payload keeps its actions and loses its label, so it works and misreports at once. Hand it over as `[label](shortcuts://…)`, never bare and never in a code span, since the chat client will not autolink a custom scheme. Measured in [markdown-in-chat.md](https://github.com/mehrlander/web-tools/blob/main/docs/markdown-in-chat.md).

* **Run a shortcut 📲.** The same link shape with the payoff anything but the clipboard. The payload is legible, so the caption stays short; the `[label](url)` rule is unconditional for both routes. Generator: [`mehrlander/shortcut-tools`](https://github.com/mehrlander/shortcut-tools), `tools/pack.py` for 📋 and `tools/show.py` for 📲; its `CLAUDE.md` carries the cost discipline that governs when either link is worth sending.

* **Branch anchor.** The first file-modifying reply leads with `Working branch: [branch-name](url)`.

* **Open the branch 🌿.** For work in flight, link the branch page beside the guide PR.
  **Form:** `…/pages/branch.html#gh=owner/repo@branch[&base=ref]`, or `…#gh=owner/repo&pr=<n>` for a PR's own head and base. Add `&src=<spec>` or `&gz=<payload>` to lay an authored envelope over a branch with no PR.
  **Boundary:** its facts are read from the API on every load, so the link is current whenever it is opened and makes no freshness claim. It renders the guide PR body too, so one link carries the judgment and the file list together, with arrows through every PR the branch has had. Token-gated like every `#gh=`. 🌿 is where you read the branch, 🧭 where you merge it. For browsing rather than linking, `…/app/?view=activity`.

* **Guide pointer 🧭.** Mark the branch's guide PR with 🧭. A reply may close with `🧭 [PR #N](…) (body synced)`, and where the branch has a PR, 🌿 rides beside it.
  **Boundary:** the parenthetical is a claim about this reply, not about the PR. Write `(body synced)` only when this turn rewrote the guide region, `(body not synced)` otherwise, and never carry it forward from an earlier reply.

* **Task marker 🎫.** Where the repo uses [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), surface a task as `🎫 [title](<task blob url>)`. The filename id never shows.

* **Surfacing caption.** End a file-modifying turn with a uniform bulleted file list; filenames stay plain and link words are tappable.

  | File state | Links |
  | --- | --- |
  | Changed | `[new], [main]/[diff]` |
  | New | `[new]`, or `[new]/[diff]` after several branch commits |
  | Deleted | `[main]/[diff]` |

  `[new]` is the branch tip, `[main]` the baseline; `[main]/[diff]` is the net change against main and `[new]/[diff]` is on-branch history. Add `#L120` or `#L120-L145` for line anchors. Keep rows uniform and do not repeat a file's links within a turn. When a renderable page changed, put its 🥏 or 📦 render after the list, not in a row: the list carries source, the render line carries the running page. Keep the reply and the guide body in sync.
  **Form:**
  ```
  - pages/index.html ([new](…), [main](…)/[diff](…))

  🥏 [pages/index.html](…)
  ```
  In an MCP-written body, **150 characters or more inside a markdown link is wrapped in backticks and renders as literal text; 149 or fewer survives.** Length only: the label does not contribute, however long it runs. The count applies to a URL **anywhere in the text**, not only inside a link, since a plain code span at 150 or more is stored double-backticked with quotes added around the address. Both write paths, a PR body and an issue comment alike. Chat replies are untouched and keep the full forms.

  Count the URL and get under 150, in this order:

  | Too long | Shorten it to |
  | --- | --- |
  | a toss carrying `?use=` and `#gh=` together | `#gh=` only |
  | a `#gh=` address on a `claude/…` branch | the commit SHA |
  | a compare URL with a `#diff-<hex>` anchor | the plain compare URL |
  | a deep `:path` in a toss | the branch page, or a `#gz=` in chat |
  | anything still over | drop the render link from the body; put it in the chat caption |

  **Boundary:** apply the ⭐ honesty gate. The render line belongs to every size, turn-size closers included; where there is no render link, say why rather than omitting it. A bare reply implies nothing is viewable yet. `[main](…)/[diff](…)` slash-joined pairs are the same arithmetic over a longer span, not an exception: `)/[` does not end the URL, so the count runs from the first URL's first character through the second URL's last, joining punctuation and the second label included. Separate them with `, `, which ends the run and puts each URL back on its own count. The 150-character measurement, with every probe and control: [environment/capabilities.md](https://github.com/mehrlander/web-tools/blob/main/docs/environment/capabilities.md).
* **Session diff.** Summarize substantial work with `Session diff: [main...branch](url)`.

* **Closing state.** End a reply that finishes work, proposes work, or leaves something open with exactly one state. It says what posture the session is in, so the next move is cheap to recognize.

  - 🟢 **Ready to continue:** work is ready to do now. Name the work available on "go"; "go 1, 3" takes a subset. Work the session conceives is proposed here, never done unprompted (Keep focus).
  - ❇️ **Ready to assess:** a question is ready to investigate. "Go" means assess it and report back, not implement whatever the assessment suggests.
  - 🟡 **Pending:** keep this visible, but not ready yet. Use it for work waiting on another action, an answer, or a dependency.
  - 🆚 **Choice needed:** a genuine choice remains. Give the assessment and the recommendation, then state what the user needs to choose.
  - 🟠 **Attention:** a concrete problem or risk to address before going further, not routine uncertainty. Amber is the alarm here, and red is not a louder version of it.
  - ⚪ **Clean exit:** work here is done. Recommend wrapping up or merging.
  - 🟣 **Merged:** this workstream's branch merged. Say what shipped in one line.
  - 🔴 **Closed:** this workstream's branch closed unmerged. Say why in one line.
  - 🔵 **Short answer:** answered, with no work proposed. The marker carries "Short answer," so the bold lead is a short, recognizable version of the question with the answer right behind it: 🔵 **Did we get to the double back tap?** No. Shorten toward the sharper question, never the safer one.

  **Boundary:** Write each state to be understood without the message it closes: do not lean on terms established above, and link referenced files. A wake from CI or other subscribed event should not re-summarize the closing state. 🟣 and 🔴 mark the branch, not a task; a task dropped or deferred inside a live branch does not make the branch 🔴. Older replies keep the markers they were written with, ⚫ among them. Where the session could reasonably investigate the question itself, that is ❇️.
* **External proxies: prohibited.** Never `htmlpreview.github.io`, `raw.githack.com`, `gitcdn.link` or their kin: they fetch server-side, fail on private repos, and route content through another host. Use `[new]` for canonical source and 🥏 for a private or un-deployed render.

* **Subscribe the workstream PR 📬.** On creating a workstream's pull request, call `subscribe_pr_activity` for it.
  **Boundary:** subscribe once, at creation. Every event arrives, and arrival obliges nothing; acting is decided per event, never automatically. A comment opening `go:` is an instruction that states intent and never authority, since anything holding a write token is indistinguishable from the account owner. Everything else, a review, a passing check, a failing one, is incoming context; a failing check is addressed when it bears on work this session is responsible for, not because an event arrived. Do not arm a scheduled check-in. Mechanism, the measurements, and the hook that prompts the call: [inbound.md](https://github.com/mehrlander/web-tools/blob/main/docs/inbound.md).

---

## The surfacing course

Once a PR opens, the branch gets a **guide PR**. Its body is the one **surfacing moment**: the live answer to "where did I leave things" while the branch is open, the reviewer's summary at review, and the permanent account of what shipped after merge. One statement, in one place, for the whole life of the work.

It leads with:

1. **Outcome + why:** one sentence, no preamble.
2. **The thing to open:** ⭐ hosted URL, else 🥏 branch toss, else an honest `[new]` source view.

**The body does not enumerate files.** Two derived surfaces already do, current by construction: GitHub's Files tab and the branch page's Files pane, which groups the changed files through the repo's content registry where one is declared (authored work leading, mechanical collapsed; the `content-registry` skill owns that convention). A body row can only restate what those list, go stale against them, and feed the MCP sanitizer link shapes it mangles. What the body carries instead is what no derived list can produce: a change-set paragraph in prose, naming only the files with something non-obvious to say (paths plain; the branch page styles them), `renders on:` consumers for a shared component, and only non-obvious notes. The full `[new]/[main]/[diff]` caption stays the CHAT format, where no Files tab exists. Decided 2026-08-08, retiring the Changed list the template carried since the format's start; bodies written before then keep theirs.

### The guide PR

Open the branch's PR as a draft at first push, automatically where configured or through the API otherwise. Its body is the live answer to "where did I leave things" and matures into the reviewer's summary. Keep `Follow-up to #N` when continuing an earlier PR and end with the harness's session-link footer.

* **Ready is the user's decision.** Mark the PR ready only on explicit instruction, including an accepted wrap-up offer.
* **Keep the body synchronized.** It is current state, not a per-file or per-push changelog; update it after a meaningful change in state. `/caption` refreshes the fenced guide region without touching hand-written text. The Files tab and the branch page hold the file list; the body holds the judgment layer: the change-set paragraph, `renders on:` lines, and the whys.
* **Put narrative in dated PR comments.** Comments are the append-only progress log; the body is current state.
* **Abandon by closing the draft** with a final comment saying why.
* **Keep branch guidance out of main.** Delete any obsolete `BRANCH-GUIDE.md` found there.

Keep the body under one screen. **Next steps / open threads** is its heart and must remain current.

**One screen is a shape, not a word budget, and the shape is an outline.** A body
that overruns is rarely carrying too many facts; it is carrying each fact fused
to its own justification. Four habits do the damage, and cutting them leaves the
facts intact:

| habit | cut it to |
| --- | --- |
| a fact and its reason in one sentence | the fact; keep the reason only where it changes what someone would do |
| defending a decision nobody questioned | nothing |
| self-commentary (*worth knowing*, *the point is*, *deliberately*) | nothing |
| a section opening by restating its own heading | the next sentence |

Prefer a table or a line per fact to a paragraph, and let the number carry the
weight: "27 of 54 sheets" says what two sentences of explanation were going to.
Measurements belong in **Notes / Risk** as a list, never narrated. Added
2026-08-18 after a body reached 1,650 words and lost nothing on the way back down
to 480.

```markdown
<One sentence: what this branch is doing and why.> [Follow-up to #N.]

[//]: # (guide)

⭐ **Look:** [<the thing to open>](<branch preview w/ commit SHA, else [new] blob>)

<The change set as a short prose paragraph: only the files with something
non-obvious to say, paths plain, no link triplets. `renders on:` lines for
shared components. Omit entirely when the one-sentence opener already covers
it; the Files tab and the branch page enumerate.>

**Next steps / open threads:**
- <current and honest; revise on every sync>

**Notes / Risk:** <what to scrutinize, test status, non-obvious why>

[//]: # (/guide)

<session-link footer>
```

**The region markers are markdown link labels, not HTML comments.** Both render as nothing on GitHub, but reading a PR body back through the GitHub MCP strips HTML comments and tags, so a sync could not find the region it was meant to rewrite, and a sync that cannot find its region appends a second one or overwrites hand-written prose. Write the link-label form. Recognition still accepts the older `<!-- guide -->` pair, since bodies written before 2026-07-28 carry it and would otherwise orphan. The one constraint the new form brings: a link label is a reference definition, so it must start a line and sit between blank lines, and inside a list item or a blockquote it can render literally. Measured, with the probe and the controls, in [environment/capabilities.md](https://github.com/mehrlander/web-tools/blob/main/docs/environment/capabilities.md).

### Shipped history

**Delivery history is the repository's merged pull requests, read where they live. Do not commit a projection of them.**

The guide PR body is already the durable account: it survives the branch, it is addressable, and GitHub renders it beside the diff it describes. A repo therefore owes shipped history no artifact of its own. Where a live reader helps, build one that reads the pulls endpoint; a browser or an agent session can, and the answer is current by construction.

web-tools kept a `docs/MERGE-GUIDE.md` from 2026-05-29 to 2026-08-05, generated by a script that copied each merged PR's guide region into the repo so the account would survive offline. Both the file and the generator are retired. The reasoning generalizes, which is why it is recorded here rather than in one repo's notes:

* **The premise expired.** A local copy earned its cost when the repo was on disk and GitHub was far away. Once a repo can read the API live, through a browser or the MCP, the copy caches something already at hand. The premise was removed by the estate's own later work, and nobody went back to re-ask the question.
* **A copy of curated prose could not be complete.** Extraction yields nothing for a terse body, so that PR is dropped without a trace. Completeness would have meant rewriting old PR bodies.
* **An index of the API is not worth committing either.** Date, number, title, and link are exactly what the pulls endpoint returns, so a committed index adds nothing but a refresh obligation and a way to be out of date.
* **It competed with the tracker.** A merge guide keys on the **PR**, a unit of delivery; [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md) keys on the **task**, a unit of intent. Running both is two histories to keep. Pick one primary axis, and the tracker is the one that holds something the API does not: why the work was undertaken.

The general rule this is a case of: **do not commit what a live read already answers.** It applies past shipped history, to branch state, CI status, and review state alike.

### Wrap-up & marking ready

Offer: *"want me to wrap up (per-session refreshes, then mark the PR ready)?"* Accepting authorizes the sequence below, including marking ready. The guide body should already be current; when all preparation is complete, ask only whether to mark ready. **"Wrap up"** means finish and go green, not merge.

**"Merge" means merge.** It authorizes the wrap-up sequence *and* the merge that follows, so run the sequence, mark ready, and merge, without asking a second time. Two things it does not authorize, and neither is a question to ask: merging **red**, since a PR with a reporting CI check waits for it and a failure is a fact to report and fix; and merging by any route other than the pull request, since a fast-forward or a push to `main` from a checkout lands a change on `main` with no body describing it. Added 2026-08-06, after a session read an explicit "merge" as a request to begin the wrap-up and asked again at the end, which is one decision charged twice.

1. **Preflight:** run `git fetch origin main && git merge-tree --write-tree origin/main HEAD` to test-merge without touching the tree. Resolve any conflicts and report the result.
2. Execute per-session refreshes.
3. Finalize the guide: make Notes / Risk reviewer-current, and settle the next steps. A next step the branch will not reach either rides forward in the guide body or becomes a task, which goes through `/tasks` and its filing rules rather than being written straight to `tracker/`. The body is the shipped account, so leave it fit to read after merge.
4. Mark the PR ready.

**Last look before the container goes.** Preserve any **precious work product** that would cost real tokens to reproduce and exists only in session context, such as a fan-out's findings, a spike's conclusion, or an uncommitted diagnosis. Route it to the guide or a PR comment, both of which are durable and neither of which adds a backlog item; a tracker task is for work that remains, not for a place to park findings (see `/tasks`). Let cheaply reconstructable context go. Then check that new files landed where they belong and name any placement that sits uneasily.

**UI trigger:** if the user marks ready or merges in the UI before wrap-up, run steps 1 through 3 silently and surface any conflict.

### The next PR

Post-merge edits require a new PR, even on the same branch. The next push opens, or the session opens, a fresh draft; `git log main..HEAD` shows the commits waiting for it.

---

## Post-merge handoff

Merge terminates the session branch; the argument for why a merged branch stops being a live workspace is [github/post-merge-branch-mutation.md](https://github.com/mehrlander/web-tools/blob/main/docs/github/post-merge-branch-mutation.md).

Where the repo uses [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), a follow-up worth keeping goes through `/tasks`, which carries the bar and the gate, and the handoff prompt can then collapse to "check the tracker and assess how to proceed." A one-off issue not worth a task keeps the full diagnostic handoff below. Otherwise:

* **Option 1 (default):** issue a diagnostic handoff prompt (HP) and wind down.
* **Option 2:** continue edits only on explicit instruction; a new PR is required.

Under Option 1, end every subsequent reply with:

`*Branch <branch> merged in PR #<n>; no further edits will be made here.*`

Drop it only when the user chooses Option 2.

**Handoff prompt (HP):**

* Wrap it in a fenced Markdown block, using four backticks if it contains three.
* Reference the merged PR or commit SHA; point to files and functions without dumping code.
* Shape each issue as symptom, cause (*suspected*/*confirmed*), and fixes (*possible*/*likely*).
* Keep it factual and short: one context paragraph, one section per issue.
* Where useful, propose diagnostic tests that emit serialized output and move a cause from suspected to confirmed.
* Close with: "Look through the relevant files, assess, and propose how to proceed."
