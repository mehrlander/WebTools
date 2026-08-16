# Surfacing

Making a session's work visible, reviewable, and durable when chat is the only output channel. The canonical source is `mehrlander/web-tools` at `docs/SURFACING.md`, loaded with [CONVENTIONS.md](CONVENTIONS.md) by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Apply repo- and branch-scoped rules per workstream, and substitute the current repo into URL templates.

The installed set includes the universal **surfacing primitives** and the **surfacing course**, the guide-PR lifecycle that begins when a PR opens. See [PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md).

## One render path

Use ⭐ for the canonical URL of an already-deployed page. Otherwise use the 🥏 toss below; there is no per-repo preview mechanism.

## The one per-repo setting: per-session refreshes

Normally none. In local `CLAUDE.md`, name only a slow or non-deterministic generated artifact that cannot ride a commit hook and must be regenerated once at wrap-up.

---

## Surfacing primitives

This prose is the authoritative statement of the primitives; [`docs/surfacing.json`](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing.json) is its gated index (membership held two-way by test), rendered live in show-repo's Map view, Surfacing tab.

* **Reference is a link (explicit markdown).** Use `[caption](url)` for anything tappable; bare paths drop on mobile, in rendered markdown, and when copied. When first naming a repo file, doc, or page the reader may want to open, link it inline: unchanged source to `[main]`, touched source to `[new]`, and a renderable page to its 🥏, ⭐, or 📦 live view. **A proposal links its subject:** an edit, deletion, or rewrite you are recommending names its file as a link before the reasoning, since nobody can weigh a change to a file they have to go find first. This is the case most often skipped, because the file is still unchanged and so reads as context rather than as the thing being decided. Keep the **honesty gate**: only a renderable page gets a render link, and call source a "view," not a preview. The surfacing caption remains the end-of-turn roll-up. Reserve `file:line` for grep and debug references.
* **Show pixels:** for visual changes, send an inspected headless-browser screenshot inline.
* **Hand over the artifact:** proactively send a file the user would open, run, or iterate on with `SendUserFile`, rather than only describing it or pasting a path. The resulting **file card** or **file chip** downloads HTML, zip, audio, and similar files; images preview inline. For visual work, show the screenshot and hand over the file. Use `proactive` when unprompted and `normal` when replying.
* **Lead with the live view:** a README for something that renders opens, directly under the title and before prose, with a prominent ⭐ link to the hosted version.
* **Toss a live view (private-safe) 🥏:** render an HTML page that has no hosted URL of its own through the shared toss renderer rather than handing over source alone.

  | Form | Use | Boundary |
  | --- | --- | --- |
  | **`#gz=` portable snapshot** | Gzip the page into `https://mehrlander.github.io/web-tools/pages/toss-render.html#gz=<base64url>`. The fragment never reaches the server; the page runs in a sandbox. Absolute-URL CDN dependencies work, same-repo relative dependencies do not. | Portable to any reader. |
  | **`#gh=owner/repo[@ref]:path` owner-only address mode** | Fetches a branch or private-repo page live, with same-ref relative dependencies, through the viewer's stored token. | Token- and allowlist-gated. The token is browser-local, so a fresh or in-app browser may 404. Use `#gz=` or an artifact as fallback. |

  Either form takes an optional trailing `#frag`, handed to the rendered page as its own `location.hash`, so a page that routes on its hash opens where the link says: `#gh=owner/repo@ref:pages/app.html#view=spend`, `#gz=<payload>#view=spend`. An address may carry `?query` and `#frag` together.

  Either form also takes `?w=<px>` on the **renderer's** own query (`toss-render.html?w=390#gh=…`), which renders the subject in a frame that wide instead of the device's. A frame is a viewport, so the page really is laid out at that width: media queries match and a boot-time `innerWidth` read agrees, and a width wider than the screen is scaled down to fit rather than scrolled. Use it to hand over a phone view from a desktop, or the reverse. It cannot move `pointer` or `hover`, so it shows another device's layout, not its interaction model. The drawer's Render tab drives the same thing with four presets.

  Encode `#gz=` with:

  ```bash
  python3 -c "import gzip,base64,sys,pathlib; b=gzip.compress(pathlib.Path(sys.argv[1]).read_bytes()); s=base64.b64encode(b).decode().replace('+','-').replace('/','_').rstrip('='); print('https://mehrlander.github.io/web-tools/pages/toss-render.html#gz='+s)" page.html
  ```

* **Publish an artifact (signed-in-safe) 📦:** publish a self-contained page as a stable private `claude.ai` snapshot. Authentication follows the viewer's Claude sign-in, avoiding the `#gh=` browser-token caveat. Artifact CSP blocks external requests, so bake CDN dependencies into the page first. Artifacts are frozen but republishable in place with version history; on Pro and Max they remain private to the author, so give other readers a 🥏 `#gz=` toss. Record the URL in a README, PR body, or task file. See `docs/artifacts.md`.
* **Stage a fileset (transport) 🗂️:** a live view moves a page; a **stage link** moves a fileset across repos for viewing, bundle download, copying, or review diff. Use:

  `…/show-repo/show-repo.html#stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3`

  Groups are `;`-separated, paths `,`-separated, and `@ref` is optional. Add `&prompts=<base64url>` for `{label, ask}` review prompts or `&mode=diff` to open the preview on that comparison. `StageLink.read` also accepts these keys in the query when a context strips fragments. Stage links are token-gated with the same in-app-browser caveat as `#gh=`; for a tokenless reader, download the bundle and **Hand over the artifact**. A stage is an inline handoff, not a surfacing-caption row. See `docs/show-repo.md` and `.web-tools.json`.
* **Carry content in an envelope:** use a **content envelope** when a curated, annotated set of files, chats, diffs, or search hits should travel and render together. The carriers are **stage**, **surface** (the cross-repo shelf rendered by show-repo's estate view and the Surfacer app), **chat-results envelope** (`pages/chat-results.html`), and **data view** (`pages/data-view.html`). They share the `owner/repo[@ref]:path` item grammar, the `#gz=`/`?src=` delivery split, and live-code rendering. Prefer an envelope to an ad-hoc format. Contracts and schemas: [`docs/envelopes/`](https://github.com/mehrlander/web-tools/tree/main/docs/envelopes).
* **Toss data, not just a page 📊:** to hand over a CSV, a JSON array, or a log as something readable rather than a raw blob, address it through the data route: `…/toss-render.html#data=owner/repo[@ref]:path`. It opens in the shared multi-mode viewer (table, tree, preview, code, raw), picking by content and leaving every other mode one tap away. Bare bytes need no wrapper; an `items` envelope adds several files, a default view each, and notes, and a trailing `#item=<name|index>` opens on the one worth looking at. Same token gate as `#gh=`; use `#gz=` on the page itself for a token-less reader. Contract: [`docs/envelopes/data-view.md`](https://github.com/mehrlander/web-tools/blob/main/docs/envelopes/data-view.md).

  **A PDF is data too, and it has two routes rather than one.** `#data=<a pdf>` gives the **first look**: the page drawn, a pager, the real page count and byte size. `#pdf=<the same file>` gives the **workbench** (`pages/pdf-inspect.html`): text containers, characters, vector rules, detected columns and lattice cells as layers over the page, and the table read two independent ways so agreement is visible. Pick by what the reader is meant to do, since the link is the only place that choice is recorded. Neither needs a download first, which is what the address buys.
* **Copy to the clipboard 📋:** a `shortcuts://run-shortcut?name=<shortcut>&input=text&text=<payload>` link whose payoff is content on the reader's clipboard; Shortcuts actions are one case. Use it only for content that must be **made on the device**: a pasteboard type you cannot produce, or a value computed from device state at tap time. Otherwise hand over a file. The payload is opaque, so the caption states what it holds and how many actions, and says when a link **replaces** rather than adds. **Paste the link as its generator emitted it**, never shortened or retyped: an edited payload keeps the actions at its head and loses the label at its tail, so it works and misreports at once.
* **Run a shortcut 📲:** the same link shape, payoff anything but the clipboard. The payload is legible, so the caption stays short. The generator behind both routes is [`mehrlander/shortcut-tools`](https://github.com/mehrlander/shortcut-tools): `tools/pack.py` emits the 📋 packed link, `tools/show.py` the 📲 page-send, and its `CLAUDE.md` carries the cost discipline (the device is the expensive resource) that governs when either link is worth sending.
* **Branch anchor:** the first file-modifying reply leads with `Working branch: [branch-name](url)`.
* **Open the branch 🌿:** for work in flight, link the branch page beside the guide PR:

  `…/pages/branch.html#gh=owner/repo@branch[&base=ref]`
  `…/pages/branch.html#gh=owner/repo&pr=<n>` (a PR: its own head and base)

  Its facts are read from the API on every load (state, ahead/behind, lifespan, the authoring sessions, the PRs, commits, changed files), so **the link is current whenever it is opened** and makes no freshness claim: there is nothing authored in it to go stale. That is what the guide PR body, being hand-maintained markdown, cannot offer.

  **It renders the guide PR body too**, so one link is the whole picture: the judgment on top, the mechanical file list under it, each file as a diff card. The body's file links are re-aimed at what can show each file and lifted into a chip strip, and arrows step through every PR the branch has had, since a merge ends a PR but not the branch. Nothing about that is a second copy of anything: the body is read where it is written, and the file list is derived from the compare. Add `&src=<spec>` or `&gz=<payload>` to lay an authored envelope over a branch with no PR to carry the judgment; the page is complete without one. Token-gated like every `#gh=` address, and subject to the same in-app-browser caveat.

  The page is deployed on the hub's main, and it reads any `owner/repo@branch` through the viewer's token, so the address above is canonical for every repo's branches; the tossed fallback this entry used to carry described the window before it merged and is retired. For browsing rather than linking, show-repo's Activity view (`…/show-repo/show-repo.html?view=activity`) opens the same renderer as a full-viewport takeover, swipeable through the open list; 🌿 remains the shareable single-branch address.

  🌿 and 🧭 answer different questions and both belong on a working branch: 🌿 is where you *read* the branch, 🧭 is where you *merge* it.
* **Guide pointer 🧭:** mark the branch's guide PR, or a legacy branch-guide file, with 🧭. A reply may close with `🧭 [PR #N](…) (body synced)`, and where the branch has a PR the closer carries 🌿 beside it: the two name one PR and open different readings of it, the branch page rendering the guide and the file list together, GitHub being where the PR is operated and the tokenless fallback. The parenthetical is a claim about this reply, not about the PR: write `(body synced)` only when this turn rewrote the guide region, and `(body not synced)` otherwise. It exists so a reader can tell, without opening the PR, whether its body describes the current tip. Never carry `(body synced)` forward from an earlier reply.
* **Task marker 🎫:** where the repo uses [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md), surface a task as `🎫 [title](<task blob url>)`. Do not show the filename id; 🎫 plus title is the reader's handle.
* **Surfacing caption:** end a file-modifying turn with a uniform bulleted file list. Filenames stay plain and link words are tappable:

  | File state | Links |
  | --- | --- |
  | Changed | `[new], [main]/[diff]` |
  | New | `[new]`, or `[new]/[diff]` after several branch commits |
  | Deleted | `[main]/[diff]` |

  `[new]` is the branch tip; `[main]` is the baseline. `[main]/[diff]` is the net change against main; `[new]/[diff]` is on-branch history. Add `#L120` or `#L120-L145` for line anchors. Keep rows uniform and do not repeat a file's links within a turn.

  **In a PR body, drop the slash and the per-file diff anchor.** The GitHub MCP's write path defangs what it distrusts by wrapping it in backticks, and two of this format's habits trigger it (measured 2026-08-08, web-tools PR #372, by writing probe lines and reading them back): a `](url)/[` pair joined by a bare slash, even with clean URLs, and a compare URL carrying a `#diff-<hex>` anchor. Both arrive backtick-wrapped and render as literal text, on GitHub and in every downstream reader of the body. A third trigger, same measurement: the toss form carrying both `?use=` and `#gh=` was wrapped, while the `#gh=`-only form passed, and under `#gh` a page's relative dependencies already load from the addressed ref, so nothing is lost. So any body or comment written through the MCP separates a file's links with `, ` (`[main](…), [diff](…)`), points diffs at the plain compare URL, and writes its 🥏 toss without `?use=`. Chat replies keep the slash form, the anchors, and the full toss, which travel untouched.

**A fourth, and it hits nearly every guide PR** (measured 2026-08-09, web-tools PR #388, eight probes over two writes): a `#gh=` address whose **ref contains a slash** *and* that carries a `:path` is wrapped, because `owner/repo@claude/a-branch:pages/p.html` is the scp-style `user@host:path` remote git itself accepts. Neither half alone trips it, and the query, a second fragment, and the page addressed are all irrelevant. Since every Claude Code branch is named `claude/<something>`, a body's toss must **address the commit SHA** rather than the branch, which the guide template already asks for, or link the branch page, which carries no `:path`.

**A fifth, which the SHA fix does not clear** (measured 2026-08-10, web-tools PR #385, eight probes over two comments): on a `#gh=` address the `:path` may carry **at most one slash**. `:pages/annotate.html` passes and `:pages/show-repo/show-repo.html` is wrapped, on the same SHA ref; so is `:docs/envelopes/data-view.md`, which shares no name with anything, so it is depth and not the repeated segment. The query is not involved, and was ruled out first: the same address passed and failed identically with and without `?view=stage`, while a plain deployed URL carrying a query passed. The two triggers compound rather than substitute, which is the trap: switching a wrapped link to the SHA fixes a one-slash path and leaves a two-slash one exactly as broken, so the fix appears not to have worked. **A nested page therefore cannot be tossed from a body at all.** Link the branch page instead, which carries no `:path` and passed clean, or hand the reader a `#gz=`. Chat replies are unaffected, so the full toss still belongs there, and this is one more reason the render link lives in the chat caption rather than the body.

  When a renderable HTML page changed, put its 🥏 or 📦 render after the list, not in a row. The list carries source; the render line carries the running page. Apply the same honesty gate as ⭐.

  ```
  - pages/index.html ([new](…), [main](…)/[diff](…))
  - lib/app.js ([new](…), [main](…)/[diff](…))

  🥏 [pages/index.html](…)
  ```

  Saying **"caption"** requests one of three sizes: **full** (everything since main; `/caption` default and guide-PR sync source), **turn** (this turn's files; default file-modifying closer), or **bare** (only the 🧭 guide link when nothing changed).

  Keep the reply and the guide body in sync. A bare reply implies nothing is viewable yet. The render line is part of the caption at **every size**, turn-size refinement closers included: the smaller a diff feels, the more the reader wants to look, so if there is no render link, say why (the renderer itself is what changed, the page's data is an untracked build artifact), never omit it silently.
* **Session diff:** summarize substantial work with `Session diff: [main...branch](url)`.
* **Closing state:** every reply that finishes work or proposes more ends with exactly one of six labeled states, so the cheapest useful answer is one word. The bold label carries the meaning; the color makes it scannable:

  - 🟢 **Ready to continue:** named work available on "go", listed as bullets, one line each. "Go" authorizes only what the list names, and "go 1, 3" takes a subset. Work the session conceives belongs here as a proposal (Keep focus), never done unprompted.
  - 🟡 **Decision needed:** continuation depends on the user's call, and the state names the decision.
  - ⚪ **Natural stopping point:** no further work proposed; the wrap-up offer lives here.
  - 🟠 **Attention:** something concrete needs addressing before proceeding. Reserved for an actual problem or risk, not routine uncertainty; there is deliberately no red.
  - 🟣 **Merged:** this workstream's branch merged. One line on what shipped.
  - ⚫ **Closed:** this workstream's branch abandoned, its PR closed unmerged. Say why in one line.

  The last two mark the branch, not a task: a task dropped inside a live branch is ⚪.
* **External proxies:** prohibited. Third-party GitHub renderers such as `htmlpreview.github.io`, `raw.githack.com`, and `gitcdn.link` fetch server-side, fail on private repos, and route content through another host. Use `[new]` for canonical source and 🥏 for a private or un-deployed render.
* **Skip the watch offer:** never offer to watch CI or monitor a PR.

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

Merge terminates the session branch.

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
