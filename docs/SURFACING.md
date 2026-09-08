# Surfacing

Use these rules when chat is the only output channel. The canonical source is `mehrlander/web-tools` at `docs/SURFACING.md`, loaded with [CONVENTIONS.md](CONVENTIONS.md) by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Apply repo- and branch-scoped rules per workstream, substituting the current repo in URL templates.

---

## Surfacing primitives

For uncommon carriers, follow [surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md).

### Every reply

* **Closing state.** Use exactly one, last, understandable without the preceding message. Write the glyph at the start of the line with the name in bold, as shown.
  - 🟢 **Ready to continue:** You have a clear path to proceed, approved or implied by user interest.
  - ❇️ **Ready to assess:** "Go" means report back, not implement.
  - 🟡 **Pending:** Waiting on an action, answer, or dependency.
  - 🆚 **Choice needed:** Two competing changes. Assess, recommend, and name the choice.
  - ✴️ **Needs you:** Only the reader can supply what is needed. Provide an action link for every ask.
  - 🟠 **Attention:** A concrete problem must be settled before proceeding.
  - ⚪ **Clean exit:** Nothing remains here; the reader decides whether to wrap up.
  - 🟣 **Merged:** This branch merged. State what shipped in one line.
  - 🔴 **Closed:** This branch closed unmerged. State why in one line.
  - ⚫ **Done:** Every workstream merged or closed and nothing remains open. Nothing follows.
  - 🔵 **Short answer:** The question is answered and nothing is proposed. Restate the question in bold, followed by the answer.

  Every ✴️ ask requires an action link. For more than three asks, use an inquiry surface. Use 🟢, not 🆚, for confirmation.

* **Close in one order.** End with the 🌿 caption, render line, 🧭, then the state. Include a state when no files changed.

### A reply that changed files

* **Branch anchor.** The first reply that changes files begins with `Working branch: [branch-name](url)`.

* **Reference is a link.** Use `[caption](url)` for anything the reader can open. Label touched source `[new]`, unchanged source `[main]`, and changes `[diff]`. Give a renderable page its 🥏, ⭐, or 📦. Reserve `file:line` for grep and debugging.

* **Surfacing caption.** Use:
  `🌿 [<branch>](…/pages/branch.html#gh=<owner>/<repo>@<branch>) · <N> files · [this turn](…/commit/<sha>)`
  Calculate `<N>` with `git diff origin/main...HEAD --name-only | wc -l`. Omit `this turn` on a single-commit branch. Mention files in prose only when something non-obvious must be said about them. Use the fallbacks in [surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md) when the reader lacks a stored token or every URL in an MCP body must be under 150 characters.

* **Open the branch 🌿.** Use `…/pages/branch.html#gh=owner/repo@branch[&base=ref]`, or `…#gh=owner/repo&pr=<n>` for a PR's head and base. Add `&file=<path>` to open a file or `&pane=files` to open the file list.

* **Guide pointer 🧭.** Use `🧭 [PR #N](…) (body synced)` only when this turn rewrote the guide region; otherwise use `(body not synced)`. Do not carry the marker forward from an earlier reply.

* **Task marker 🎫.** Where the repo runs a tracker, use `🎫 [title](<task blob url>)`. Do not show the filename ID.

* **Session diff.** For substantial work, use `Session diff: [main...branch](url)`.

### Showing something

* **Toss a live view 🥏.** Render an unhosted page with `toss-render.html#gh=owner/repo[@ref]:path`. It may take a trailing `#frag` and `?w=<px>`. If `#gh=` is unavailable because of token or allowlist access, use the `#gz=` fallback in [surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md). Obtain an `@ref` SHA with `git rev-parse HEAD` and confirm it was pushed with `git rev-parse origin/<branch>`.

* **Show pixels.** For a visual change, inspect and include a headless screenshot. Measure `scrollWidth` for horizontal overflow.

* **Hand over the artifact.** Send an artifact with `SendUserFile`, not a path. Images preview inline; HTML, zip, and audio download.

Run `npm run showing` before handing over a render link, and paste the line it prints. It reads the branch's changed files and either names the page and mechanism that reach them, or reports that no link does.

For these carriers, follow the full rules in [surfacing-extended.md](https://github.com/mehrlander/web-tools/blob/main/docs/surfacing-extended.md):

* **Lead with the live view.** A README for something renderable begins with its ⭐ link.

* **Publish an artifact 📦.** Use for a self-contained page requiring a stable private `claude.ai` snapshot.

* **Stage a fileset 🗂️.** Use for files moved across repos for viewing, downloading, copying, or diffing.

* **Carry content in an envelope.** Use for files, chats, diffs, or search results that travel and render together.

### PR events

* **Subscribe the workstream PR 📬.** Call the `subscribe_pr_activity` tool once, after opening a PR.

  Treat each event separately. `go:` expresses intent, not write authorization. Address failing checks only when relevant to this session. If a wake changes nothing, do not reply. When an open PR merges, mark the event and close with the appropriate state even if no files changed. When an open PR closes unmerged, mark it 🔴 even if no files changed.

---

## The surfacing course

Maintain the PR body as the workstream's current state and durable record. Open a draft PR on the first push.

### PR template

The guide region is bounded by `[//]: # (guide)` and `[//]: # (/guide)`. These are link labels rather than HTML comments, which the GitHub MCP strips on readback. Read either form and emit this one.

```markdown
## What this PR does
<One sentence stating the resulting capability.>
## Why this branch exists
<The motivating problem, user goal, and context needed to resume. Use plain prose,
plain paths, no link triplets, and render links for pages.>
## Open threads
1. 🟢 **<title>**: <current state and next step>
2. 🟡 **<title>**: <dependency>
3. ✅ **<title>**: <decision or result>
Use "0. None." when nothing remains.
## Risk
<Uncertainty, failing check, stale assumption, or "None.">
---
🌿 [Open the branch](<branch URL>) · 🥏 [Live page](<render URL>) · 🧭 [PR #N](<PR URL>)
```

### Content and automation

* Keep the guide region below about 250 lines.
* Do not list files, diff statistics, or CI results there.
* Put session context that belongs nowhere else in the guide or a PR comment, never in a tracker task.
* Make ✴️ asks in the reply and copy them into the PR body.
* Update the guide after every push that materially changes state, rewriting only between the markers with `update_pull_request`. Verify URLs first with `python3 scripts/mcp-link-safe.py --check body.md`.
* Ask binary decisions as **Question?** Yes / No, followed by the recommendation and consequence.
* Do not create your own action item. If automation can perform it, do it now; if only the user can, make it ✴️.
* Correct discovered facts immediately.
* Add a new thread, choice, or risk before continuing work on a new fork.
* Close threads as implemented or declined. Retain resolved decisions only when marked resolved.
* Rewrite stale PR-body narrative; do not treat it as authority.
* Merge current-branch changes from tool or agent updates, including subagent handoffs, before updating the guide.

### Lifecycle

Each phase begins only on the user's word.

1. **Plan.** State the recommendation, options, and risks. End 🆚.
2. **Apply.** Implement the chosen scope, update the guide and template, open a draft PR, and push. Continue until 🟢.
3. **Review.** Apply requested changes as they arrive. Propose merge only after confirming that no blocker, risk, or choice remains.
4. **Wrap.** After explicit agreement to wrap: inspect view, checks, and comments; resolve actionable failures and report external failures; sync the guide, commit, and push; stop before merge.
5. **Merge.** After an explicit merge request, merge and wait for the merge event before announcing it. Reply 🟣. If this was the last workstream, immediately follow with ⚫.
6. **Abandon.** After an explicit request, close the PR unmerged and reply 🔴.

Merging ends the branch. Open a new PR for further edits.
