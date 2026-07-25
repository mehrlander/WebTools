# Surfacing

Making a session's work visible, reviewable, and durable when chat is the only output channel. The canonical source is `mehrlander/web-tools` at `docs/SURFACING.md`, loaded with [CONVENTIONS.md](CONVENTIONS.md) by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Apply repo- and branch-scoped rules per workstream, and substitute the current repo into URL templates.

The installed set includes the universal **surfacing primitives** and the **surfacing course**, the guide-PR and merge-guide lifecycle that begins when a PR opens. See [PORTABLE.md](PORTABLE.md).

## One render path

Use ⭐ for the canonical URL of an already-deployed page. Otherwise use the 🥏 toss below; there is no per-repo preview mechanism.

## The one per-repo setting: per-session refreshes

Normally none. In local `CLAUDE.md`, name only a slow or non-deterministic generated artifact that cannot ride a commit hook and must be regenerated once at wrap-up.

---

## Surfacing primitives

* **Reference is a link (explicit markdown).** Use `[caption](url)` for anything tappable; bare paths drop on mobile, in rendered markdown, and when copied. When first naming a repo file, doc, or page the reader may want to open, link it inline: unchanged source to `[main]`, touched source to `[new]`, and a renderable page to its 🥏, ⭐, or 📦 live view. Keep the **honesty gate**: only a renderable page gets a render link, and call source a "view," not a preview. The surfacing caption remains the end-of-turn roll-up. Reserve `file:line` for grep and debug references.
* **Show pixels:** for visual changes, send an inspected headless-browser screenshot inline.
* **Hand over the artifact:** proactively send a file the user would open, run, or iterate on with `SendUserFile`, rather than only describing it or pasting a path. The resulting **file card** or **file chip** downloads HTML, zip, audio, and similar files; images preview inline. For visual work, show the screenshot and hand over the file. Use `proactive` when unprompted and `normal` when replying.
* **Lead with the live view:** a README for something that renders opens, directly under the title and before prose, with a prominent ⭐ link to the hosted version.
* **Toss a live view (private-safe) 🥏:** render an HTML page that has no hosted URL of its own through the shared toss renderer rather than handing over source alone.

  | Form | Use | Boundary |
  | --- | --- | --- |
  | **`#gz=` portable snapshot** | Gzip the page into `https://mehrlander.github.io/web-tools/pages/toss-render.html#gz=<base64url>`. The fragment never reaches the server; the page runs in a sandbox. Absolute-URL CDN dependencies work, same-repo relative dependencies do not. | Portable to any reader. |
  | **`#gh=owner/repo[@ref]:path` owner-only address mode** | Fetches a branch or private-repo page live, with same-ref relative dependencies, through the viewer's stored token. | Token- and allowlist-gated. The token is browser-local, so a fresh or in-app browser may 404. Use `#gz=` or an artifact as fallback. |

  Either form takes an optional trailing `#frag`, handed to the rendered page as its own `location.hash`, so a page that routes on its hash opens where the link says: `#gh=owner/repo@ref:pages/app.html#view=spend`, `#gz=<payload>#view=spend`. An address may carry `?query` and `#frag` together.

  Encode `#gz=` with:

  ```bash
  python3 -c "import gzip,base64,sys,pathlib; b=gzip.compress(pathlib.Path(sys.argv[1]).read_bytes()); s=base64.b64encode(b).decode().replace('+','-').replace('/','_').rstrip('='); print('https://mehrlander.github.io/web-tools/pages/toss-render.html#gz='+s)" page.html
  ```

* **Publish an artifact (signed-in-safe) 📦:** publish a self-contained page as a stable private `claude.ai` snapshot. Authentication follows the viewer's Claude sign-in, avoiding the `#gh=` browser-token caveat. Artifact CSP blocks external requests, so bake CDN dependencies into the page first. Artifacts are frozen but republishable in place with version history; on Pro and Max they remain private to the author, so give other readers a 🥏 `#gz=` toss. Record the URL in a README, PR body, or task file. See `docs/artifacts.md`.
* **Stage a fileset (transport) 🗂️:** a live view moves a page; a **stage link** moves a fileset across repos for viewing, bundle download, copying, or review diff. Use:

  `…/show-repo/show-repo.html#stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3`

  Groups are `;`-separated, paths `,`-separated, and `@ref` is optional. Add `&prompts=<base64url>` for `{label, ask}` review prompts or `&mode=diff` to open and run the Diff tab. `StageLink.read` also accepts these keys in the query when a context strips fragments. Stage links are token-gated with the same in-app-browser caveat as `#gh=`; for a tokenless reader, download the bundle and **Hand over the artifact**. A stage is an inline handoff, not a surfacing-caption row. See `docs/show-repo.md` and `.web-tools.json`.
* **Carry content in an envelope:** use a **content envelope** when a curated, annotated set of files, chats, diffs, or search hits should travel and render together. The carriers are **stage**, **surface** (the cross-repo shelf rendered by show-repo's estate view and the Surfacer app), **chat-results envelope** (`pages/chat-results.html`), and **data view** (`pages/data-view.html`). They share the `owner/repo[@ref]:path` item grammar, the `#gz=`/`?src=` delivery split, and live-code rendering. Prefer an envelope to an ad-hoc format. Contracts and schemas: [`docs/envelopes/`](envelopes/).
* **Toss data, not just a page 📊:** to hand over a CSV, a JSON array, or a log as something readable rather than a raw blob, address it through the data route: `…/toss-render.html#data=owner/repo[@ref]:path`. It opens in the shared multi-mode viewer (table, tree, preview, code, raw), picking by content and leaving every other mode one tap away. Bare bytes need no wrapper; an `items` envelope adds several files, a default view each, and notes. Same token gate as `#gh=`; use `#gz=` on the page itself for a token-less reader. Contract: [`docs/envelopes/data-view.md`](envelopes/data-view.md).
* **Branch anchor:** the first file-modifying reply leads with `Working branch: [branch-name](url)`.
* **Guide pointer 🧭:** mark the branch's guide PR, or a legacy branch-guide file, with 🧭. A reply may close with `🧭 [PR #N](…)`.
* **Task marker 🎫:** where the repo uses [TRACKER.md](TRACKER.md), surface a task as `🎫 [title](<task blob url>)`. Do not show the filename id; 🎫 plus title is the reader's handle.
* **Surfacing caption:** end a file-modifying turn with a uniform bulleted file list. Filenames stay plain and link words are tappable:

  | File state | Links |
  | --- | --- |
  | Changed | `[new], [main]/[diff]` |
  | New | `[new]`, or `[new]/[diff]` after several branch commits |
  | Deleted | `[main]/[diff]` |

  `[new]` is the branch tip; `[main]` is the baseline. `[main]/[diff]` is the net change against main; `[new]/[diff]` is on-branch history. Add `#L120` or `#L120-L145` for line anchors. Keep rows uniform and do not repeat a file's links within a turn.

  When a renderable HTML page changed, put its 🥏 or 📦 render after the list, not in a row. The list carries source; the render line carries the running page. Apply the same honesty gate as ⭐.

  ```
  - pages/index.html ([new](…), [main](…)/[diff](…))
  - lib/app.js ([new](…), [main](…)/[diff](…))

  🥏 [pages/index.html](…)
  ```

  Saying **"caption"** requests one of three sizes: **full** (everything since main; `/caption` default and guide-PR sync source), **turn** (this turn's files; default file-modifying closer), or **bare** (only the 🧭 guide link when nothing changed).

  Because the full caption is what syncs the guide body, **the reply and the body carry the same links**: a preview link worth a place in one is worth a place in the other. The common failure is a generous body and a bare reply, which reads as though nothing is viewable yet. When a change genuinely has no render link, say why in the reply rather than leaving the line out.
* **Session diff:** summarize substantial work with `Session diff: [main...branch](url)`.
* **External proxies:** prohibited. Third-party GitHub renderers such as `htmlpreview.github.io`, `raw.githack.com`, and `gitcdn.link` fetch server-side, fail on private repos, and route content through another host. Use `[new]` for canonical source and 🥏 for a private or un-deployed render.
* **Skip the watch offer:** never offer to watch CI or monitor a PR.

---

## The surfacing course

Once a PR opens, each branch gets a **guide PR** and, after delivery, a generated `docs/MERGE-GUIDE.md` entry. These are two **surfacing moments**, one statement in two places: the guide body is the live authored source; the merge-guide entry is generated from it.

Both lead with:

1. **Outcome + why:** one sentence, no preamble.
2. **The thing to open:** ⭐ hosted URL, else 🥏 branch toss, else an honest `[new]` source view.

Both then carry the `[new]/[main]/[diff]` file list, `renders on:` lines for shared components, only non-obvious notes, and a diff or compare link.

|  | Guide PR body | Merge guide |
| --- | --- | --- |
| **Moment** | Live session through review | At/after merge |
| **Audience** | Resuming reader, then reviewer | Reader |
| **Primary target** | Branch | Main |
| **Unique fields** | Next steps / open threads; Notes / Risk | PR#, date, durable notes |
| **Location** | GitHub PR | `docs/MERGE-GUIDE.md` |

### The guide PR

Open the branch's PR as a draft at first push, automatically where configured or through the API otherwise. Its body is the live answer to "where did I leave things" and matures into the reviewer's summary. Keep `Follow-up to #N` when continuing an earlier PR and end with the harness's session-link footer.

* **Ready is the user's decision.** Mark the PR ready only on explicit instruction, including an accepted wrap-up offer.
* **Keep the body synchronized.** It is current state, not a per-file or per-push changelog; update it after a meaningful change in state. `/caption` refreshes the fenced guide region without touching hand-written text. The Files tab holds the cumulative diff; the Changed list adds the curated layer: preview links, `renders on:` lines, and one-line whys.
* **Put narrative in dated PR comments.** Comments are the append-only progress log; the body is current state.
* **Abandon by closing the draft** with a final comment saying why.
* **Keep branch guidance out of main.** Delete any obsolete `BRANCH-GUIDE.md` found there.

Keep the body under one screen. **Next steps / open threads** is its heart and must remain current.

```markdown
<One sentence: what this branch is doing and why.> [Follow-up to #N.]

<!-- guide -->
⭐ **Look:** [<the thing to open>](<branch preview w/ commit SHA, else [new] blob>)

**Changed:**
- <path> ([new](…), [main](…)/[diff](…))
  renders on: [<consumer>](…)     (shared component only)

**Next steps / open threads:**
- <current and honest; revise on every sync>

**Notes / Risk:** <what to scrutinize, test status, non-obvious why>
<!-- /guide -->

<session-link footer>
```

### Merge guide

`docs/MERGE-GUIDE.md` is a durable newest-first log generated from merged PR guide regions by a repo-owned script; web-tools supplies [`scripts/build-merge-guide.py`](../scripts/build-merge-guide.py). There is no hand-written merge-guide step. Generation is non-destructive and keyed by PR number: add uncovered PRs, preserve existing entries, and use `--refresh` to regenerate covered ones. Run where API access exists and commit the output.

The merge guide keys on the **PR**, a unit of delivery; [TRACKER.md](TRACKER.md) keys on the **task**, a unit of intent. Choose one primary historical axis to avoid competing logs.

An entry mirrors the guide region, puts the result and primary file first, preserves `renders on:`, rewrites branch URLs to main, and drops branch-only next steps. Main can show that a represented PR is included, but absence is not proof of non-merge; git and GitHub remain authoritative.

```markdown
## <date> <one-line title> (PR #<n>)

<One sentence: the primary outcome.>

⭐ **Result:** [<primary artifact>](<canonical main URL; branch preview while unmerged>)

**Changed:**
- <path> ([new](…), [main](…)/[diff](…))
  renders on: [<consumer>](…)   (shared component only)

**Notes:** <only the non-obvious: why, what's unfinished, follow-ups>

[Session diff](<compare link>)
```

### Wrap-up & marking ready

Offer: *"want me to wrap up (per-session refreshes, then mark the PR ready)?"* Accepting authorizes the sequence below, including marking ready. The guide body should already be current; when all preparation is complete, ask only whether to mark ready. **"Wrap up"** means finish and go green, not merge.

1. **Preflight:** run `git fetch origin main && git merge-tree --write-tree origin/main HEAD` to test-merge without touching the tree. Resolve any conflicts and report the result.
2. Execute per-session refreshes.
3. Finalize the guide: convert next steps to follow-ups or tracker tasks and make Notes / Risk reviewer-current. Do not hand-write a merge-guide entry.
4. Mark the PR ready.

**Last look before the container goes.** Preserve any **precious work product** that would cost real tokens to reproduce and exists only in session context, such as a fan-out's findings, a spike's conclusion, or an uncommitted diagnosis. Route it to the guide, a tracker task, or a PR comment; let cheaply reconstructable context go. Then check that new files landed where they belong and name any placement that sits uneasily.

**UI trigger:** if the user marks ready or merges in the UI before wrap-up, run steps 1 through 3 silently and surface any conflict.

### The next PR

Post-merge edits require a new PR, even on the same branch. The next push opens, or the session opens, a fresh draft; `git log main..HEAD` shows the commits waiting for it.

---

## Post-merge handoff

Merge terminates the session branch.

Where the repo uses [TRACKER.md](TRACKER.md), make follow-ups tasks; the handoff prompt can collapse to "check the tracker and assess how to proceed." Otherwise:

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
