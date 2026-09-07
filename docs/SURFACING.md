# Surfacing

Making a session's work visible, reviewable, and durable when chat is the only output channel. The canonical source is `mehrlander/web-tools` at `docs/SURFACING.md`, loaded with [CONVENTIONS.md](CONVENTIONS.md) by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Apply repo- and branch-scoped rules per workstream, and substitute the current repo into URL templates.

The installed set includes the universal **surfacing primitives** and the **surfacing course**, the guide-PR lifecycle that begins when a PR opens. See [PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md).

---

## Surfacing primitives

[surfacing.csv](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing.csv) indexes these for the app's Map view, Surfacing tab. Carriers most replies never reach keep their form and boundary in [surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md), which is not injected.

### Every reply

* **Closing state.** Exactly one, last, understandable without the message it closes.
  - 🟢 **Ready to continue:** work ready now, and "go" is the whole decision. Name it; "go 1, 3" takes a subset.
  - ❇️ **Ready to assess:** a question to investigate, or work the session conceived. "Go" means report back, not implement.
  - 🟡 **Pending:** waiting on another action, an answer, or a dependency.
  - 🆚 **Choice needed:** two competing changes. Assess, recommend, then name the choice.
  - ✴️ **Needs you:** only the reader can supply it. Ship the link that performs each ask.
  - 🟠 **Attention:** a concrete problem to settle before going further.
  - ⚪ **Clean exit:** nothing further here; the reader decides whether to wrap up.
  - 🟣 **Merged:** this workstream's branch merged. One line on what shipped.
  - 🔴 **Closed:** this workstream's branch closed unmerged. One line on why.
  - ⚫ **Done:** every workstream merged or closed, nothing open. Nothing follows it.
  - 🔵 **Short answer:** answered, nothing proposed. The bold lead restates the question, the answer behind it.

  **Boundary:** colour says who acts, so 🟢 never instructs the reader, while 🟠, 🆚 and ✴️ need them. **Attention debt gates green:** work leaving the reader something to return to (a filed task, a doc or check to maintain, a deferred question) is ❇️ and names what it leaves. An ✴️ ask carrying no link is a defect. Past about three asks, use an [inquiry surface](https://github.com/mehrlander/web-tools/blob/main/docs/envelopes/schemas/profiles/inquiry-v1.schema.json). For confirmation favour 🟢 over 🆚. ⚪ is before a merge, 🟣 is one branch, ⚫ waits for the last.

* **Close in one order.** The 🌿 caption line, the render line, 🧭, then the state, last. A reply that changed no files still closes with a state; a wake that changed nothing says nothing at all.

### A reply that changed files

* **Branch anchor.** The first such reply leads with `Working branch: [branch-name](url)`.

* **Reference is a link.** Anything tappable is `[caption](url)`; bare paths drop on mobile and when copied. Source is `[new]` touched, `[main]` unchanged, `[diff]` the change; a renderable page gets its 🥏, ⭐ or 📦. Reserve `file:line` for grep and debug.

* **Surfacing caption.** Say where to look, not what moved: the branch page enumerates the files, current on every load.
  **Form:** `🌿 [<branch>](…/pages/branch.html#gh=<owner>/<repo>@<branch>) · <N> files · [this turn](…/commit/<sha>)`, `<N>` from `git diff origin/main...HEAD --name-only | wc -l`. Drop `this turn` on a single-commit branch. `&file=<path>` opens one file, `&pane=files` the file list.
  **Boundary:** name in prose only the files with something non-obvious to say. A reader with no stored token, or an MCP body needing every URL under 150 characters, takes the fallbacks in [surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md).

* **Open the branch 🌿.** `…/pages/branch.html#gh=owner/repo@branch[&base=ref]`, or `…#gh=owner/repo&pr=<n>` for a PR's own head and base. Read from the API on every load, so it is current whenever opened. 🌿 reads the branch, 🧭 merges it.

* **Guide pointer 🧭.** `🧭 [PR #N](…) (body synced)` only where this turn rewrote the guide region, `(body not synced)` otherwise, never carried forward from an earlier reply.

* **Task marker 🎫.** `🎫 [title](<task blob url>)` where the repo runs a tracker; the filename id never shows.

* **Session diff.** `Session diff: [main...branch](url)`, for substantial work.

### Showing something

* **Toss a live view 🥏.** A page with no hosted URL renders through `toss-render.html#gh=owner/repo[@ref]:path`, live at that ref through the viewer's token, taking a trailing `#frag` and `?w=<px>`.
  **Boundary:** `#gh=` is token- and allowlist-gated, so a fresh or in-app browser may 404; fall back to `#gz=` ([surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md)). A `@ref` SHA comes from `git rev-parse HEAD`, never typed, and is confirmed pushed with `git rev-parse origin/<branch>`.

* **Show pixels.** A visual change gets an inspected headless screenshot inline. A viewport shot cannot show horizontal overflow; measure `scrollWidth`.

* **Hand over the artifact.** Send a file the reader would open, run or iterate on with `SendUserFile`, never a path. `proactive` when unprompted, `normal` when replying. Images preview inline; HTML, zip and audio download.

* **External proxies: prohibited.** Never `htmlpreview.github.io`, `raw.githack.com`, `gitcdn.link` or their kin: they fetch server-side and fail on private repos. Use `[new]` for source and 🥏 for a private or undeployed render.

Only a renderable page gets a render link, and where no link reaches the change, say why and send a screenshot. Do not settle the mechanism by reading: run `npm run showing`.

**Carriers for less common work, each held in full in [surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md):**

* **Lead with the live view.** A README for something that renders opens with its ⭐ link.

* **Publish an artifact 📦.** A self-contained page as a stable private `claude.ai` snapshot.

* **Stage a fileset 🗂️.** A fileset moved across repos for viewing, download, copying or diff.

* **Carry content in an envelope.** Files, chats, diffs or search hits that travel and render together.

* **Toss data 📊.** A CSV, JSON array, log or PDF opened readable rather than raw.

* **Copy to the clipboard 📋.** A `shortcuts://` link whose payoff is content on the reader's clipboard.

* **Run a shortcut 📲.** The same link shape with any other payoff.

* **Review the diff 🔍.** Each changed file's diff against the merge base.

### On a pull request

* **Subscribe the workstream PR 📬.** Call `subscribe_pr_activity` once, at creation.

  **Boundary:** every event arrives and arrival obliges nothing, so act per event. A comment opening `go:` states intent and never authority, since anything holding a write token is indistinguishable from the account owner. A failing check is addressed when it bears on this session's work, not because an event arrived. A wake that changed nothing says nothing.

---

## The surfacing course

A PR body is the branch's live state and post-merge record. Open it as a draft on the first push.

```markdown
<One-sentence summary of what this branch does and why.> [Follow-up to #N]

[//]: # (guide)

<⭐|🥏|📦|📊> **Look:** [<Resource name>](<Rendered link, using commit SHA not branch name>)

<Why this branch exists and any non-obvious implementation details. Plain prose,
plain paths, no link triplets. Use `renders on:` for shared components.>

**Open threads:**
- [ ] <Unfinished work. Strike through when obsolete.>
- [ ] ✴️ <User action required (e.g., physical device testing).>
- <Decided but not acted on. No checkbox. A record, not a task.>

**Risk:** <Areas needing manual scrutiny and blind spots not covered by CI.>

[//]: # (/guide)

<Session footer link>
```

**Content**
* Keep the region between the markers under 250 words.
* The body does not enumerate files, or repeat CI status.
* Session context that exists nowhere else goes here or in a PR comment, never a tracker task.
* Deliver ✴️ items in the reply; the body holds the copy.

**Automation**
* Rewrite only between the markers, using `update_pull_request`. Read either marker form, emit `[//]: #`, and abort if neither is present.
* Verify URLs first: `python3 scripts/mcp-link-safe.py --check body.md`.

**Lifecycle** (each phase begins on the user's word)
* **Wrap up:** Preflight `git merge-tree` against `main`, run refreshes, finalize the guide, mark ready.
* **Merge:** Complete wrap up, then merge. Never red, and never by any route but the PR.
* **Abandon:** Close the draft with a comment.
* **Post-merge:** Merging terminates the branch ([why](https://github.com/mehrlander/web-tools/blob/main/docs/github/post-merge-branch-mutation.md)). Open a new PR for further edits; delivery history is the merged PRs themselves.
